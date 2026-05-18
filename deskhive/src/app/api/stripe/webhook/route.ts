import Stripe from 'stripe';
import { stripe } from '@/lib/stripe';
import { db } from '@/db/client';
import { webhookEventsTable } from '@/db/schema';
import { eq } from 'drizzle-orm';
import {
  getConnectAccountByStripeAccountId,
  upsertConnectAccount,
} from '@/db/queries/stripe-connect';
import {
  getBookingById,
  markBookingAuthorized,
} from '@/db/queries/bookings';
import { logger } from '@/lib/logger';

/**
 * Story 9-2: Stripe webhook endpoint — NARROW scope.
 *
 * Handles only `account.updated` events (BA Decision §7). All other
 * event types are acknowledged with `200 OK` so Stripe stops retrying,
 * but are NOT inserted into `webhook_events` — this preserves Story
 * 9-5's ability to backfill once its broader handlers ship.
 *
 * Signature verification is non-negotiable (BA Decision §7
 * anti-pattern). The raw request body (NOT parsed JSON) is required
 * for `stripe.webhooks.constructEvent(...)` — that's why we use
 * `await req.text()` and not `await req.json()`.
 *
 * Idempotency: `webhook_events.stripe_event_id` is UNIQUE. We SELECT
 * first; if the event id is already logged we return early without
 * re-processing. Insert + side-effect both happen only on first
 * successful handle.
 *
 * Story 9-2 follow-up (after BA browser walk surfaced a 500 on the
 * first real account.updated event): each DB op is now wrapped in a
 * stage-specific try/catch that logs `error.message` + `error.cause`
 * separately. Stripe SDK's `DrizzleQueryError` collapses the underlying
 * PG error into `error.cause`; without explicit capture we lost the
 * actual failure reason. The wrappers preserve Decision §7 anti-pattern
 * (failed handling does NOT insert into webhook_events) and Decision
 * §11 retry behavior (500 surfaces, Stripe retries normally).
 *
 * Story 9-5 will:
 *   • Extract signature verification + idempotency into helpers in
 *     `src/lib/payments/webhooks.ts`.
 *   • Generalize the dispatch with handlers for `payment_intent.*`,
 *     `charge.refunded`, `payout.paid`, etc.
 *   • Keep the same `STRIPE_WEBHOOK_SECRET` env contract.
 */

export async function POST(req: Request): Promise<Response> {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret || webhookSecret.trim().length === 0) {
    logger.error('stripe_webhook_secret_missing', {});
    return new Response('Webhook secret not configured', { status: 500 });
  }

  const signature = req.headers.get('stripe-signature');
  if (!signature) {
    return new Response('Missing stripe-signature header', { status: 400 });
  }

  // Raw body for signature verification. `stripe.webhooks.constructEvent`
  // recomputes HMAC over the bytes Stripe signed — any reparse would
  // change whitespace/key-order and break verification.
  const rawBody = await req.text();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.warn('stripe_webhook_signature_invalid', { error: msg });
    // Anti-pattern §7: do NOT insert into webhook_events on signature
    // failure — Story 9-5 needs a clean log to backfill from.
    return new Response('Invalid signature', { status: 400 });
  }

  // Idempotency: short-circuit if we've already processed this event id.
  let existing: { id: string } | undefined;
  try {
    [existing] = await db
      .select({ id: webhookEventsTable.id })
      .from(webhookEventsTable)
      .where(eq(webhookEventsTable.stripeEventId, event.id))
      .limit(1);
  } catch (err) {
    logger.error('stripe_webhook_idempotency_select_failed', {
      eventId: event.id,
      eventType: event.type,
      error: errMessage(err),
      cause: errCause(err),
    });
    return new Response('Idempotency check failed', { status: 500 });
  }
  if (existing) {
    return Response.json(
      { received: true, idempotent: true },
      { status: 200 },
    );
  }

  // Narrow dispatch.
  if (event.type === 'account.updated') {
    const account = event.data.object as Stripe.Account;

    let row;
    try {
      row = await getConnectAccountByStripeAccountId(account.id);
    } catch (err) {
      logger.error('stripe_webhook_account_lookup_failed', {
        eventId: event.id,
        stripeAccountId: account.id,
        error: errMessage(err),
        cause: errCause(err),
      });
      return new Response('Account lookup failed', { status: 500 });
    }

    if (!row) {
      // We don't have this account in our DB yet — could happen if Stripe
      // delivers `account.updated` before our `initiateConnectOnboardingAction`
      // has finished its upsert. Idempotent no-op; do NOT insert into
      // webhook_events (Decision §7 anti-pattern: only insert when a real
      // handler ran). Stripe will retry, and the next delivery will find
      // the row.
      logger.warn('stripe_webhook_account_not_found', {
        stripeAccountId: account.id,
        eventId: event.id,
      });
      return Response.json({ received: true, deferred: true }, { status: 200 });
    }

    try {
      await upsertConnectAccount({
        userId: row.userId,
        stripeAccountId: account.id,
        chargesEnabled: account.charges_enabled,
        payoutsEnabled: account.payouts_enabled,
        onboardingCompleted: account.details_submitted,
      });
    } catch (err) {
      logger.error('stripe_webhook_upsert_failed', {
        eventId: event.id,
        stripeAccountId: account.id,
        error: errMessage(err),
        cause: errCause(err),
      });
      return new Response('Database update failed', { status: 500 });
    }

    try {
      await db.insert(webhookEventsTable).values({
        stripeEventId: event.id,
        eventType: event.type,
        // Defensive: round-trip through JSON to strip any Stripe SDK
        // class machinery (toJSON, non-enumerable props, custom
        // getters) before the jsonb insert. Stripe events are pure
        // JSON-serializable in practice but the cost of belt-and-
        // suspenders is one extra parse+stringify on a <20KB payload.
        payload: JSON.parse(JSON.stringify(event)),
      });
    } catch (err) {
      logger.error('stripe_webhook_event_insert_failed', {
        eventId: event.id,
        error: errMessage(err),
        cause: errCause(err),
      });
      return new Response('Idempotency log failed', { status: 500 });
    }

    return Response.json({ received: true, handled: true }, { status: 200 });
  }

  // ─────────────────────────────────────────────────────────────────────
  // Story 9-3 (BA Decision §6): narrow `checkout.session.completed`
  // branch. Backstop for the return-URL handler — if the Guest closes
  // their browser between paying and the redirect, this webhook arrives
  // asynchronously and writes payment_intent_id + payment_status='AUTHORIZED'
  // to the pre-claimed booking row.
  //
  // Idempotency layers:
  //   • Top-of-route check on webhook_events.stripe_event_id (Stripe-
  //     delivery dedup).
  //   • markBookingAuthorized's conditional WHERE filters out rows
  //     already in AUTHORIZED state — if the return-URL handler won
  //     the race, this handler returns no row from .returning() and
  //     we skip the webhook_events insert (mirrors 9-2's "only insert
  //     on first real handle" anti-pattern from its Decision §7).
  //
  // NO Stripe API calls here (Decision §6 anti-pattern). The Session
  // payload's `payment_intent` is a string ID — write it directly to
  // the booking row without fetching the PI object. The PI ID is
  // trustworthy because the entire webhook payload was signature-
  // verified upstream.
  //
  // Story 9-5 will absorb this branch alongside payment_intent.* /
  // charge.refunded / payout.paid / checkout.session.expired.
  // ─────────────────────────────────────────────────────────────────────
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session;
    const bookingId = session.metadata?.bookingId;
    if (!bookingId) {
      logger.warn('stripe_webhook_checkout_no_booking_id', {
        eventId: event.id,
        sessionId: session.id,
      });
      // Acknowledge so Stripe stops retrying. Decision §7 anti-pattern
      // from 9-2: do NOT insert into webhook_events — the handler
      // didn't actually do work.
      return Response.json({ received: true, deferred: true }, { status: 200 });
    }

    // Webhook payloads carry `payment_intent` as a string ID by default
    // (we did NOT expand on the webhook delivery; only the return-URL
    // handler expands). Coerce defensively in case Stripe sends an
    // expanded object on some future event.
    const paymentIntentId =
      typeof session.payment_intent === 'string'
        ? session.payment_intent
        : (session.payment_intent?.id ?? null);
    if (!paymentIntentId) {
      logger.warn('stripe_webhook_checkout_no_payment_intent', {
        eventId: event.id,
        sessionId: session.id,
        bookingId,
      });
      return Response.json({ received: true, deferred: true }, { status: 200 });
    }

    // Lookup first so we can distinguish "booking doesn't exist (logic
    // error)" from "already AUTHORIZED (return-URL won)". The lookup
    // is in its own try/catch — DB failure here is retriable.
    let existingBooking;
    try {
      existingBooking = await getBookingById(bookingId);
    } catch (err) {
      logger.error('stripe_webhook_checkout_booking_lookup_failed', {
        eventId: event.id,
        bookingId,
        error: errMessage(err),
        cause: errCause(err),
      });
      return new Response('Booking lookup failed', { status: 500 });
    }

    if (!existingBooking) {
      // Could happen if the webhook arrives before
      // `createBookingWithPaymentAction` completes its booking-row
      // insert (extremely unlikely — Stripe webhook delivery is async
      // and the action commits the row before calling Stripe). Treat
      // as a defer / Stripe will retry naturally; do NOT insert into
      // webhook_events.
      logger.warn('stripe_webhook_checkout_booking_not_found', {
        eventId: event.id,
        bookingId,
      });
      return Response.json({ received: true, deferred: true }, { status: 200 });
    }

    let updated;
    try {
      updated = await markBookingAuthorized({ bookingId, paymentIntentId });
    } catch (err) {
      logger.error('stripe_webhook_checkout_update_failed', {
        eventId: event.id,
        bookingId,
        error: errMessage(err),
        cause: errCause(err),
      });
      return new Response('Booking update failed', { status: 500 });
    }

    if (!updated) {
      // Return-URL handler already won the race (or a prior webhook
      // already authorized this row). markBookingAuthorized's
      // conditional WHERE filtered the row out — no state change here.
      // Do NOT insert into webhook_events (Decision §7 anti-pattern:
      // only on first real handle).
      logger.info('stripe_webhook_checkout_already_authorized', {
        eventId: event.id,
        bookingId,
      });
      return Response.json({ received: true, idempotent: true }, { status: 200 });
    }

    try {
      await db.insert(webhookEventsTable).values({
        stripeEventId: event.id,
        eventType: event.type,
        payload: JSON.parse(JSON.stringify(event)),
      });
    } catch (err) {
      logger.error('stripe_webhook_checkout_event_insert_failed', {
        eventId: event.id,
        error: errMessage(err),
        cause: errCause(err),
      });
      return new Response('Idempotency log failed', { status: 500 });
    }

    return Response.json({ received: true, handled: true }, { status: 200 });
  }

  // Unhandled event type. Acknowledge so Stripe stops retrying, but do
  // NOT insert into webhook_events (Decision §7 anti-pattern). Story
  // 9-5 will land real handlers for these types and is free to backfill.
  logger.info('stripe_webhook_unhandled_event', {
    eventType: event.type,
    eventId: event.id,
  });
  return Response.json({ received: true, handled: false }, { status: 200 });
}

// ─────────────────────────────────────────────────────────────────────
// Helpers for error introspection inside the try/catch wrappers above.
// Drizzle's DrizzleQueryError wraps PG errors with the underlying error
// in `.cause`. Logging both `.message` and `.cause.message` separately
// is what was missing from the original handler — the BA walk's 500
// surfaced an opaque "Failed query: ..." with no cause text.
// ─────────────────────────────────────────────────────────────────────
function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
function errCause(err: unknown): string | null {
  if (err instanceof Error && err.cause instanceof Error) return err.cause.message;
  if (err instanceof Error && typeof err.cause === 'string') return err.cause;
  return null;
}
