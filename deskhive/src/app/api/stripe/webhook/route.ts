import type Stripe from 'stripe';
import { stripe } from '@/lib/stripe';
import { db } from '@/db/client';
import { webhookEventsTable } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { logger } from '@/lib/logger';
import { dispatchWebhookEvent } from '@/lib/payments/webhooks';

/**
 * Story 9-5: thin route shell for the Stripe webhook endpoint.
 *
 * Responsibilities (in order):
 *   1. Env check — STRIPE_WEBHOOK_SECRET must be set.
 *   2. Header check — stripe-signature header required.
 *   3. Raw body read via `req.text()` (raw bytes required for HMAC).
 *   4. Signature verification via stripe.webhooks.constructEvent (NFR-3
 *      / CC-7 — non-negotiable).
 *   5. Idempotency check (Layer 1, centralized) on
 *      webhook_events.stripe_event_id.
 *   6. Dispatch via `dispatchWebhookEvent(event)` (sub-module entry).
 *   7. Translate WebhookHandlerResult → HTTP response + insert into
 *      webhook_events ONLY on `{ handled: true }` (Layer 2 per-handler).
 *
 * Per-event handler logic + the load-bearing 9-2 BA-walk-fix 3-stage
 * try-catch pattern lives in `src/lib/payments/webhooks.ts` (BA
 * Decision §1 + §2). Stories 9-6 / 9-7 extend the dispatch by adding
 * one handler function + one map entry in that file.
 *
 * Signature verification stays at the route (BA Decision §7): the raw
 * body is route-level state — once `req.text()` is consumed it can't
 * be re-read. Pushing verification into the sub-module would invert
 * the dependency.
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

  // Idempotency Layer 1 (centralized): short-circuit if we've already
  // processed this event id. The handler's conditional WHERE in
  // webhooks.ts is Layer 2 (per-handler defensive — catches the case
  // where webhook_events insert failed last time but the DB UPDATE
  // succeeded).
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
      error: err instanceof Error ? err.message : String(err),
      cause:
        err instanceof Error && err.cause instanceof Error
          ? err.cause.message
          : null,
    });
    return new Response('Idempotency check failed', { status: 500 });
  }
  if (existing) {
    return Response.json(
      { received: true, idempotent: true },
      { status: 200 },
    );
  }

  // Dispatch to the sub-module. Unknown event types short-circuit
  // inside the dispatcher; handler throws are caught by the dispatcher's
  // safety-net try-catch and surface as { ok: false, status: 500 }.
  const result = await dispatchWebhookEvent(event);

  // ───────────── Translate handler result → HTTP response ─────────────
  if (!result.ok) {
    return new Response(result.message, { status: result.status });
  }

  if ('handled' in result && result.handled === false) {
    // Unknown event type — acknowledge so Stripe stops retrying, but
    // do NOT insert into webhook_events (Decision §10: keeps the log
    // clean for 9-6 / 9-7 to backfill when they ship).
    return Response.json(
      { received: true, handled: false },
      { status: 200 },
    );
  }

  if ('deferred' in result && result.deferred === true) {
    // Retriable — booking row not yet created, missing metadata, etc.
    // Acknowledge so Stripe retries naturally; do NOT insert into
    // webhook_events (Decision §6: only-on-first-real-handle).
    return Response.json(
      { received: true, deferred: true },
      { status: 200 },
    );
  }

  if ('idempotent' in result && result.idempotent === true) {
    // Already in target state — race with the action's DB write OR a
    // prior webhook delivery cleaned up. Do NOT insert into
    // webhook_events (same anti-pattern as deferred).
    return Response.json(
      { received: true, idempotent: true },
      { status: 200 },
    );
  }

  // result.handled === true — first real handle. Insert into
  // webhook_events (Layer 2 per-handler) for the audit trail.
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
      eventType: event.type,
      error: err instanceof Error ? err.message : String(err),
      cause:
        err instanceof Error && err.cause instanceof Error
          ? err.cause.message
          : null,
    });
    return new Response('Idempotency log failed', { status: 500 });
  }

  return Response.json({ received: true, handled: true }, { status: 200 });
}
