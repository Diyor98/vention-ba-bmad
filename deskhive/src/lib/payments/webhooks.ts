/**
 * Story 9-5: Webhook dispatch generalization for the Stripe webhook
 * endpoint at `/api/stripe/webhook`. 4th Theme B sub-module after
 * `connect.ts` (9-2) / `checkout.ts` (9-3) / `payment-intents.ts` (9-4).
 *
 * Contains:
 *   • `WebhookHandlerResult` — discriminated union returned by every
 *     handler. The route translates this to an HTTP response + decides
 *     whether to insert into `webhook_events` (only on `handled: true`).
 *   • 5 handler functions — `handleAccountUpdated` (9-2 origin, migrated
 *     verbatim) / `handleCheckoutSessionCompleted` (9-3 origin, migrated
 *     verbatim) / `handlePaymentIntentSucceeded` (NEW capture backstop) /
 *     `handlePaymentIntentCanceled` (NEW cancel backstop) /
 *     `handleCheckoutSessionExpired` (NEW orphan-cleanup with 3-condition
 *     safety-net WHERE).
 *   • `WEBHOOK_HANDLERS` — readonly map keyed on Stripe event type.
 *     Stories 9-6 (refund `charge.refunded`) and 9-7 (`payout.paid`)
 *     extend this map by adding one handler function + one entry.
 *   • `dispatchWebhookEvent(event)` — top-level entry the route calls.
 *     Wraps the handler invocation in a should-never-happen safety net
 *     try-catch so unexpected throws surface as `{ ok: false, status:
 *     500 }` instead of crashing the route.
 *
 * Load-bearing patterns preserved from prior stories:
 *
 *   • **Defensive 3-stage try-catch wrapper** (9-2 BA-walk fix). Each
 *     DB op wraps in its own try-catch logging `errMessage(err)` +
 *     `errCause(err)` separately. Drizzle's `DrizzleQueryError` collapses
 *     PG errors into `.cause`; per-stage attribution is what the 9-2
 *     BA-walk fix specifically introduced and what 9-5 carries forward.
 *
 *   • **Only-insert-on-first-real-handle semantics** (BA Decision §6
 *     from 9-2 + carry-forward in 9-3). Handlers return `{ handled:
 *     true }` ONLY on a real first-time state mutation; the route
 *     inserts `webhook_events` ONLY on that result. `deferred: true`
 *     (retriable / dependency-not-ready) and `idempotent: true` (already
 *     in target state) skip the insert — keeps the audit log clean for
 *     genuine first-handles.
 *
 *   • **Webhook payload is the source of truth** (BA Decision §6 from
 *     9-3 carry-forward). No `stripe.paymentIntents.retrieve` (or any
 *     Stripe API call) from inside the handlers. The event payload is
 *     signature-verified upstream at the route; trust it.
 *
 *   • **Lookup-by-PI for payment_intent.* handlers** (BA Decision §5).
 *     `bookings.payment_intent_id` is the column 9-3 created for exactly
 *     this join. The expired handler is the exception — it has no PI
 *     to key on (Checkout Session ID has no booking-side column), so
 *     it uses `session.metadata.bookingId` set at 9-3 Session-create
 *     time.
 *
 *   • **Webhook completes the FULL state transition** (BA Decision §5).
 *     The PI handlers transition both `status` AND `payment_status`
 *     atomically — not just a partial sync. This is the backstop for
 *     the 9-4 action's DB write failure, so it has to produce the same
 *     final booking-row state the action would have.
 *
 *   • **3-condition safety-net WHERE for the orphan-DELETE** (BA
 *     Decision §5 + §11). Lives in the query helper
 *     `deleteAbandonedBookingByCheckoutSession`. Any one condition
 *     missing opens a path to deleting the wrong row.
 *
 * Out of scope (deferred to 9-6 / 9-7 / 8-4 / Phase 3 per BA Decision §10):
 *   • `charge.refunded` (9-6)
 *   • `payout.paid` (9-7)
 *   • `payment_intent.payment_failed` (Phase 3 or 9-6)
 *   • Email sends (8-4 wires up AFTER 9-5's dispatch lands)
 *   • Webhook retry-after-backoff custom logic (Stripe handles retries)
 *
 * Singleton-import discipline: this file does NOT import `stripe` from
 * `@/lib/stripe` — handlers operate on the `Stripe.Event` payload
 * passed in by the route (which already did the signature verification
 * via the singleton). The route is the only caller in 9-5's dispatch
 * model.
 */

import type Stripe from 'stripe';
import { logger } from '@/lib/logger';
import {
  getConnectAccountByStripeAccountId,
  upsertConnectAccount,
} from '@/db/queries/stripe-connect';
import {
  getBookingById,
  markBookingAuthorized,
  getBookingByPaymentIntentId,
  markBookingConfirmedAndCapturedByPaymentIntent,
  markBookingRejectedAndVoidedByPaymentIntent,
  deleteAbandonedBookingByCheckoutSession,
  // Story 9-6: webhook backstop for charge.refunded. Same shape as the
  // 9-5 by-PI helpers; uses payment_intent_id as the join.
  markBookingCancelledAndRefundedByPaymentIntent,
} from '@/db/queries/bookings';

/**
 * Result returned by every handler. The route translates this to an
 * HTTP response shape + decides whether to insert into webhook_events.
 *
 *   • `{ ok: true, handled: true }` — first real handle; route inserts
 *     into webhook_events + returns 200 handled.
 *   • `{ ok: true, deferred: true }` — retriable (booking row not yet
 *     created, missing metadata, etc.); route returns 200 deferred +
 *     does NOT insert. Stripe retries.
 *   • `{ ok: true, idempotent: true }` — already in target state (race
 *     with the action's DB write, OR a prior webhook delivery cleaned
 *     up); route returns 200 idempotent + does NOT insert.
 *   • `{ ok: true, handled: false }` — unknown event type (returned by
 *     the dispatcher when no handler matches event.type); route returns
 *     200 handled:false + does NOT insert.
 *   • `{ ok: false, status, message }` — unexpected DB error or handler
 *     throw; route returns the given status + message + does NOT insert.
 *     Stripe retries on 5xx.
 */
export type WebhookHandlerResult =
  | { ok: true; handled: true }
  | { ok: true; deferred: true }
  | { ok: true; idempotent: true }
  | { ok: true; handled: false }
  | { ok: false; status: number; message: string };

// ─────────────────────────────────────────────────────────────────────
// handleAccountUpdated — Story 9-2 origin, migrated verbatim from
// `src/app/api/stripe/webhook/route.ts` (lines 104–173 pre-9-5). Zero
// behavior change. The 3-stage try-catch wrappers + log keys are the
// 9-2 BA-walk-fix pattern preserved verbatim — DO NOT alter.
// ─────────────────────────────────────────────────────────────────────
export async function handleAccountUpdated(
  event: Stripe.Event,
): Promise<WebhookHandlerResult> {
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
    return { ok: false, status: 500, message: 'Account lookup failed' };
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
    return { ok: true, deferred: true };
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
    return { ok: false, status: 500, message: 'Database update failed' };
  }

  return { ok: true, handled: true };
}

// ─────────────────────────────────────────────────────────────────────
// handleCheckoutSessionCompleted — Story 9-3 origin, migrated verbatim
// from `src/app/api/stripe/webhook/route.ts` (lines 200–303 pre-9-5).
// Zero behavior change.
//
// Backstop for the return-URL handler — if the Guest closes their
// browser between paying and the redirect, this webhook arrives
// asynchronously and writes payment_intent_id + payment_status='AUTHORIZED'
// to the pre-claimed booking row.
//
// Idempotency layers:
//   • Route-level top-of-handler check on webhook_events.stripe_event_id
//     (Stripe-delivery dedup; route's responsibility post-9-5).
//   • markBookingAuthorized's conditional WHERE filters out rows
//     already in AUTHORIZED state — if the return-URL handler won
//     the race, this handler returns no row from .returning() and
//     reports idempotent: true (caller skips the webhook_events
//     insert per the 9-2 anti-pattern).
//
// NO Stripe API calls here (Decision §6 anti-pattern). The Session
// payload's `payment_intent` is a string ID — write it directly to
// the booking row without fetching the PI object. The PI ID is
// trustworthy because the entire webhook payload was signature-
// verified upstream.
// ─────────────────────────────────────────────────────────────────────
export async function handleCheckoutSessionCompleted(
  event: Stripe.Event,
): Promise<WebhookHandlerResult> {
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
    return { ok: true, deferred: true };
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
    return { ok: true, deferred: true };
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
    return { ok: false, status: 500, message: 'Booking lookup failed' };
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
    return { ok: true, deferred: true };
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
    return { ok: false, status: 500, message: 'Booking update failed' };
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
    return { ok: true, idempotent: true };
  }

  return { ok: true, handled: true };
}

// ─────────────────────────────────────────────────────────────────────
// handlePaymentIntentSucceeded — Story 9-5 NEW.
// Capture-confirmation backstop deferred from Story 9-4 Decision §8.
// Closes the narrow ops window where 9-4's `confirmBookingAction`
// successfully captures the PI at Stripe but the subsequent DB UPDATE
// fails, leaving the booking stuck in (PENDING, AUTHORIZED).
//
// Lookup keyed on payment_intent.id (NOT metadata.bookingId) — the PI
// is the resource that changed state; `bookings.payment_intent_id` is
// the column 9-3 created for exactly this join (BA Decision §5).
//
// Conditional UPDATE via the new by-PI helper restricts to rows
// currently in (PENDING, AUTHORIZED). If the 9-4 action's DB write
// already won the race, the conditional WHERE filters the row out
// and the handler reports idempotent — route skips webhook_events
// insert.
// ─────────────────────────────────────────────────────────────────────
export async function handlePaymentIntentSucceeded(
  event: Stripe.Event,
): Promise<WebhookHandlerResult> {
  const paymentIntent = event.data.object as Stripe.PaymentIntent;
  const paymentIntentId = paymentIntent.id;

  let booking;
  try {
    booking = await getBookingByPaymentIntentId(paymentIntentId);
  } catch (err) {
    logger.error('stripe_webhook_payment_intent_succeeded_lookup_failed', {
      eventId: event.id,
      paymentIntentId,
      error: errMessage(err),
      cause: errCause(err),
    });
    return { ok: false, status: 500, message: 'Booking lookup failed' };
  }

  if (!booking) {
    // No DeskHive booking matches this PI. Could be a test event from
    // Stripe dashboard, an orphan PI, or a race where the booking row
    // hasn't been written yet (the 9-3 pre-claim happens BEFORE the
    // Checkout Session creation, so this is extremely unlikely under
    // the locked flow — but defer is the conservative response). Do
    // NOT insert into webhook_events; Stripe will retry naturally.
    logger.warn('stripe_webhook_payment_intent_succeeded_booking_not_found', {
      eventId: event.id,
      paymentIntentId,
    });
    return { ok: true, deferred: true };
  }

  let updated;
  try {
    updated =
      await markBookingConfirmedAndCapturedByPaymentIntent(paymentIntentId);
  } catch (err) {
    logger.error('stripe_webhook_payment_intent_succeeded_update_failed', {
      eventId: event.id,
      paymentIntentId,
      error: errMessage(err),
      cause: errCause(err),
    });
    return { ok: false, status: 500, message: 'Booking update failed' };
  }

  if (!updated) {
    // 9-4's action already wrote (CONFIRMED, CAPTURED). The conditional
    // WHERE filtered the row out — but this is the happy path of "9-4
    // worked AND the webhook fired" — NOT a failure. Do NOT insert
    // into webhook_events (preserved 9-2 / 9-3 pattern).
    logger.info('stripe_webhook_payment_intent_succeeded_already_captured', {
      eventId: event.id,
      paymentIntentId,
    });
    return { ok: true, idempotent: true };
  }

  // First real handle — the booking was stuck in (PENDING, AUTHORIZED)
  // and we just rescued it. Caller inserts webhook_events.
  return { ok: true, handled: true };
}

// ─────────────────────────────────────────────────────────────────────
// handlePaymentIntentCanceled — Story 9-5 NEW.
// Cancel-confirmation backstop deferred from Story 9-4 Decision §8.
// Mirror shape of `handlePaymentIntentSucceeded` with target state
// (REJECTED, VOIDED).
// ─────────────────────────────────────────────────────────────────────
export async function handlePaymentIntentCanceled(
  event: Stripe.Event,
): Promise<WebhookHandlerResult> {
  const paymentIntent = event.data.object as Stripe.PaymentIntent;
  const paymentIntentId = paymentIntent.id;

  let booking;
  try {
    booking = await getBookingByPaymentIntentId(paymentIntentId);
  } catch (err) {
    logger.error('stripe_webhook_payment_intent_canceled_lookup_failed', {
      eventId: event.id,
      paymentIntentId,
      error: errMessage(err),
      cause: errCause(err),
    });
    return { ok: false, status: 500, message: 'Booking lookup failed' };
  }

  if (!booking) {
    logger.warn('stripe_webhook_payment_intent_canceled_booking_not_found', {
      eventId: event.id,
      paymentIntentId,
    });
    return { ok: true, deferred: true };
  }

  let updated;
  try {
    updated =
      await markBookingRejectedAndVoidedByPaymentIntent(paymentIntentId);
  } catch (err) {
    logger.error('stripe_webhook_payment_intent_canceled_update_failed', {
      eventId: event.id,
      paymentIntentId,
      error: errMessage(err),
      cause: errCause(err),
    });
    return { ok: false, status: 500, message: 'Booking update failed' };
  }

  if (!updated) {
    logger.info('stripe_webhook_payment_intent_canceled_already_voided', {
      eventId: event.id,
      paymentIntentId,
    });
    return { ok: true, idempotent: true };
  }

  return { ok: true, handled: true };
}

// ─────────────────────────────────────────────────────────────────────
// handleCheckoutSessionExpired — Story 9-5 NEW.
// Orphan-booking cleanup deferred from Story 9-3 Decision §6.
//
// Cleans up pre-claimed-but-abandoned booking rows: Guest clicked Book
// → 9-3 pre-claimed the slot with status='PENDING' +
// payment_status='AWAITING_PAYMENT' + payment_intent_id=NULL → Guest
// closed the Checkout tab without completing payment → row sits
// indefinitely, blocking re-bookings on the same desk/date with
// DOUBLE_BOOKING from the orphan.
//
// The 3-condition safety-net WHERE on the delete helper (`status=
// 'PENDING' AND payment_status='AWAITING_PAYMENT' AND id=$bookingId`)
// ensures we ONLY delete rows in the pre-claimed-but-abandoned shape:
//   • CONFIRMED/REJECTED/CANCELLED rows mismatch on status.
//   • AUTHORIZED/CAPTURED/VOIDED rows mismatch on payment_status.
//   • Without id, a misfired event with a stale metadata.bookingId
//     could match an unrelated abandoned attempt — but the bookingId
//     equality clause narrows to the specific row this session was
//     created for.
//
// Lookup is by `session.metadata.bookingId` (NOT by payment_intent_id —
// the orphan has no PI yet; the metadata was set at 9-3 Session-create
// time per Decision §4 of 9-3).
//
// DELETE rather than UPDATE-to-CANCELLED (Decision §5): the booking
// was never visible to the Guest. CANCELLED would clutter their
// /my-bookings history with a non-event. DELETE returns the slot to
// the partial unique index so the Guest can re-book.
// ─────────────────────────────────────────────────────────────────────
export async function handleCheckoutSessionExpired(
  event: Stripe.Event,
): Promise<WebhookHandlerResult> {
  const session = event.data.object as Stripe.Checkout.Session;
  const bookingId = session.metadata?.bookingId;

  if (!bookingId) {
    logger.warn('stripe_webhook_checkout_session_expired_no_booking_id', {
      eventId: event.id,
      sessionId: session.id,
    });
    return { ok: true, deferred: true };
  }

  let deleted;
  try {
    deleted = await deleteAbandonedBookingByCheckoutSession(bookingId);
  } catch (err) {
    logger.error('stripe_webhook_checkout_session_expired_delete_failed', {
      eventId: event.id,
      bookingId,
      error: errMessage(err),
      cause: errCause(err),
    });
    return { ok: false, status: 500, message: 'Booking cleanup failed' };
  }

  if (!deleted) {
    // Either a different path won (Guest came back and completed;
    // return-URL handler authorized; 9-4 captured) OR the booking row
    // was already cleaned up by a prior delivery. Both are "everything's
    // fine" — do NOT insert into webhook_events.
    logger.info('stripe_webhook_checkout_session_expired_no_orphan', {
      eventId: event.id,
      bookingId,
    });
    return { ok: true, idempotent: true };
  }

  // Real orphan deleted — caller inserts webhook_events for the audit
  // trail.
  return { ok: true, handled: true };
}

// ─────────────────────────────────────────────────────────────────────
// handleChargeRefunded — Story 9-6 NEW.
// Refund-confirmation backstop for the action's Phase 2 CONFIRMED+CAPTURED
// branch. Closes the narrow ops window where stripe.refunds.create
// succeeds at Stripe but the subsequent DB UPDATE in cancelBookingAction
// fails — without this handler the booking would sit in (CONFIRMED,
// CAPTURED) with Stripe in a refunded state.
//
// First proof of 9-5's dispatcher extensibility design (BA Decision §7):
// one new handler function + one new entry in WEBHOOK_HANDLERS. The
// existing route shell, dispatch entry, and idempotency machinery are
// untouched.
//
// Lookup keyed on charge.payment_intent (NOT metadata.bookingId) per
// the 9-5 by-PI pattern (BA Decision §5 carry-forward).
//
// charge.refunded (NOT refund.created) per PRD §4.5 FR-REFUND-5 lock —
// charge.refunded is the canonical "the customer was refunded" signal;
// refund.created is the per-attempt "Stripe started a refund" signal
// that could still fail before charge.refunded fires.
//
// Audit-trail accept-9-5-pattern (BA Decision §11): no transactional
// write-with-rollback. The bookings row IS the financial audit trail
// (refunded_at + refund_amount_cents + payment_status='REFUNDED');
// webhook_events is operational. On retry-after-partial-failure the
// idempotent path runs cleanly (conditional WHERE filters the row out;
// handler returns idempotent:true; route skips webhook_events insert).
// ─────────────────────────────────────────────────────────────────────
export async function handleChargeRefunded(
  event: Stripe.Event,
): Promise<WebhookHandlerResult> {
  const charge = event.data.object as Stripe.Charge;
  // Webhook payloads carry payment_intent as a string ID by default. Coerce
  // defensively in case Stripe expands the field on some future event shape.
  const paymentIntentId =
    typeof charge.payment_intent === 'string'
      ? charge.payment_intent
      : (charge.payment_intent?.id ?? null);
  if (!paymentIntentId) {
    logger.warn('stripe_webhook_charge_refunded_no_payment_intent', {
      eventId: event.id,
      chargeId: charge.id,
    });
    // Acknowledge so Stripe stops retrying. Decision §7 anti-pattern from
    // 9-2 carry-forward: do NOT insert into webhook_events — no real handle.
    return { ok: true, deferred: true };
  }

  // charge.amount_refunded is the cumulative refunded amount (cents). For
  // Phase 2 full refunds, this equals charge.amount. Phase 3 partial
  // refunds would need richer logic — 9-6 ships full-refund-only.
  const refundAmountCents = charge.amount_refunded;

  let booking;
  try {
    booking = await getBookingByPaymentIntentId(paymentIntentId);
  } catch (err) {
    logger.error('stripe_webhook_charge_refunded_lookup_failed', {
      eventId: event.id,
      paymentIntentId,
      error: errMessage(err),
      cause: errCause(err),
    });
    return { ok: false, status: 500, message: 'Booking lookup failed' };
  }

  if (!booking) {
    // No DeskHive booking matches this PI. Could be a test event from the
    // Stripe dashboard, an orphan PI, or a race where the booking row
    // hasn't been written yet (extremely unlikely under the locked flow
    // since refunds only fire on captured bookings — but defer is the
    // conservative response). Do NOT insert into webhook_events; Stripe
    // retries naturally.
    logger.warn('stripe_webhook_charge_refunded_booking_not_found', {
      eventId: event.id,
      paymentIntentId,
    });
    return { ok: true, deferred: true };
  }

  let updated;
  try {
    updated = await markBookingCancelledAndRefundedByPaymentIntent(
      paymentIntentId,
      refundAmountCents,
    );
  } catch (err) {
    logger.error('stripe_webhook_charge_refunded_update_failed', {
      eventId: event.id,
      paymentIntentId,
      error: errMessage(err),
      cause: errCause(err),
    });
    return { ok: false, status: 500, message: 'Booking update failed' };
  }

  if (!updated) {
    // Action's DB write already won the race (booking is already in
    // (CANCELLED, REFUNDED)). The conditional WHERE in
    // markBookingCancelledAndRefundedByPaymentIntent (status='CONFIRMED'
    // AND payment_status='CAPTURED') filtered the row out. Happy path —
    // not a failure. Do NOT insert into webhook_events (9-2 / 9-3 / 9-5
    // pattern: only insert on first real handle).
    logger.info('stripe_webhook_charge_refunded_already_refunded', {
      eventId: event.id,
      paymentIntentId,
    });
    return { ok: true, idempotent: true };
  }

  // First real handle — the booking was stuck in (CONFIRMED, CAPTURED)
  // and we just rescued it. Caller inserts webhook_events.
  return { ok: true, handled: true };
}

// ─────────────────────────────────────────────────────────────────────
// handlePayoutPaid — Story 9-7 NEW. **Audit-only** webhook handler.
//
// Last Theme B handler. Second proof of 9-5's dispatcher extensibility
// design (after 9-6's `handleChargeRefunded`): exactly 1 new function +
// 1 new map entry. Route shell + `dispatchWebhookEvent` + types all
// unchanged.
//
// Stripe fires `payout.paid` on its test-mode-simulated daily schedule
// when funds settle to a connected account's bank. PRD §6.4 + §4.3 say
// this event fires the "Payout sent" email — but emails are Story 8-4
// territory (deferred from all webhook handlers in 9-2 / 9-3 / 9-5 /
// 9-6). And `/owner/payouts` reads payouts directly from Stripe at
// page-load time (BA Decision §1 — no local cache table), so there's
// no DB state to update from the webhook.
//
// **The handler is purely audit-only**: it logs the event for ops
// visibility and returns `{ ok: true, handled: true }` so the route
// inserts a `webhook_events` row. Story 8-4 will later hook into this
// row (either via `webhook_events` query OR by extending this handler)
// to send the receipt email.
//
// **Semantic stretch note (BA Decision §4 lock):** this handler does
// no DB writes or email sends, but returns `{ handled: true }` so
// `webhook_events` gets the row inserted for Story 8-4's downstream
// consumption. "Handled" here means "recorded for audit", not "DB
// state transitioned".
//
// Idempotency: Layer 1 (route-entry `webhook_events.stripe_event_id`
// check) handles dedup. No per-handler conditional WHERE — there's no
// booking row to UPDATE.
// ─────────────────────────────────────────────────────────────────────
export async function handlePayoutPaid(
  event: Stripe.Event,
): Promise<WebhookHandlerResult> {
  const payout = event.data.object as Stripe.Payout;
  // Defensive log for ops visibility. `payout.id` is the canonical
  // identifier (`po_*`); `payout.amount` is in cents; `payout.currency`
  // is the Stripe currency code (`usd` for Phase 2). All values come
  // from the signature-verified event payload — no Stripe API call.
  logger.info('stripe_webhook_payout_paid_acknowledged', {
    eventId: event.id,
    payoutId: payout.id,
    amountCents: payout.amount,
    currency: payout.currency,
  });
  // No DB writes — payouts are read direct from Stripe at page-load
  // time (BA Decision §1). No email send — Story 8-4 wires that up
  // later. Return handled:true so the route inserts webhook_events
  // for the audit trail.
  return { ok: true, handled: true };
}

// ─────────────────────────────────────────────────────────────────────
// Dispatcher map + entry point.
// ─────────────────────────────────────────────────────────────────────

/**
 * Map keyed by Stripe event type. Theme B is COMPLETE after 9-7 —
 * `payout.paid` is the final handler in Epic 9. Phase 3 may add
 * `payout.failed` / `payout.canceled` / `payment_intent.payment_failed`
 * / `charge.dispute.created` when product needs arise.
 */
export const WEBHOOK_HANDLERS: Readonly<
  Record<string, (event: Stripe.Event) => Promise<WebhookHandlerResult>>
> = {
  'account.updated': handleAccountUpdated,
  'checkout.session.completed': handleCheckoutSessionCompleted,
  'checkout.session.expired': handleCheckoutSessionExpired,
  'payment_intent.succeeded': handlePaymentIntentSucceeded,
  'payment_intent.canceled': handlePaymentIntentCanceled,
  // Story 9-6: FIRST proof of 9-5's dispatcher extensibility design
  // (1 new function + 1 new map entry; no route refactor; no
  // dispatchWebhookEvent change).
  'charge.refunded': handleChargeRefunded,
  // Story 9-7: SECOND proof of 9-5's dispatcher extensibility design +
  // FINAL Theme B handler. Audit-only — see handlePayoutPaid docstring.
  'payout.paid': handlePayoutPaid,
};

/**
 * Top-level dispatch entry point. The route calls this with the
 * signature-verified Stripe.Event. Unknown event types return
 * `{ ok: true, handled: false }` and the route returns 200 + does NOT
 * insert into webhook_events.
 *
 * Top-level try-catch is a should-never-happen safety net (BA Decision
 * §8). Handlers SHOULD always return a WebhookHandlerResult; if one
 * throws, the safety net logs `stripe_webhook_dispatcher_unexpected_throw`
 * and returns 500 → route returns 500 → Stripe retries.
 */
export async function dispatchWebhookEvent(
  event: Stripe.Event,
): Promise<WebhookHandlerResult> {
  const handler = WEBHOOK_HANDLERS[event.type];
  if (!handler) {
    logger.info('stripe_webhook_unhandled_event', {
      eventType: event.type,
      eventId: event.id,
    });
    return { ok: true, handled: false };
  }

  try {
    return await handler(event);
  } catch (err) {
    logger.error('stripe_webhook_dispatcher_unexpected_throw', {
      eventId: event.id,
      eventType: event.type,
      error: errMessage(err),
      cause: errCause(err),
    });
    return { ok: false, status: 500, message: 'Unexpected handler error' };
  }
}

// ─────────────────────────────────────────────────────────────────────
// Internal error-introspection helpers (moved from the route file in
// 9-5 per BA Decision §12). Drizzle's DrizzleQueryError wraps PG
// errors with the underlying error in `.cause`. Logging both
// `.message` and `.cause.message` separately is the 9-2 BA-walk-fix
// pattern that surfaces the actual failure reason.
//
// NOT exported — internal to this file.
// ─────────────────────────────────────────────────────────────────────
function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function errCause(err: unknown): string | null {
  if (err instanceof Error && err.cause instanceof Error)
    return err.cause.message;
  if (err instanceof Error && typeof err.cause === 'string') return err.cause;
  return null;
}
