import Stripe from 'stripe';
import { stripe } from '@/lib/stripe';
import { db } from '@/db/client';
import { webhookEventsTable } from '@/db/schema';
import { eq } from 'drizzle-orm';
import {
  getConnectAccountByStripeAccountId,
  upsertConnectAccount,
} from '@/db/queries/stripe-connect';
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
  const [existing] = await db
    .select({ id: webhookEventsTable.id })
    .from(webhookEventsTable)
    .where(eq(webhookEventsTable.stripeEventId, event.id))
    .limit(1);
  if (existing) {
    return Response.json(
      { received: true, idempotent: true },
      { status: 200 },
    );
  }

  // Narrow dispatch.
  if (event.type === 'account.updated') {
    const account = event.data.object as Stripe.Account;
    const row = await getConnectAccountByStripeAccountId(account.id);
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

    await upsertConnectAccount({
      userId: row.userId,
      stripeAccountId: account.id,
      chargesEnabled: account.charges_enabled,
      payoutsEnabled: account.payouts_enabled,
      onboardingCompleted: account.details_submitted,
    });

    await db.insert(webhookEventsTable).values({
      stripeEventId: event.id,
      eventType: event.type,
      payload: event as unknown as Record<string, unknown>,
    });

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
