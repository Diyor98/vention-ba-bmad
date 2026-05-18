/**
 * Story 9-6: Stripe Refunds service-layer wrapper. 5th Theme B sub-module
 * after `connect.ts` (9-2) / `checkout.ts` (9-3) / `payment-intents.ts`
 * (9-4) / `webhooks.ts` (9-5).
 *
 * Single export:
 *
 *   • `createRefund` — refunds a captured Payment Intent in FULL. Phase 2
 *     ships full-refund-only (no `amount` arg; Stripe defaults to the
 *     full captured amount). Phase 3 may add a partial-refund variant.
 *
 * Marketplace fee handling (destination-charge mode from 9-3): full
 * refunds AUTOMATICALLY reverse the `application_fee_amount` to the
 * platform — no `refund_application_fee: true` flag needed. Adding the
 * flag would double-reverse and break the math (BA Decision §4
 * anti-pattern).
 *
 * Idempotency: callers pass per-booking-id keys `refund-${bookingId}`
 * per BA Decision §4. Mirrors 9-4's per-resource pattern; distinct
 * namespace from 9-2 / 9-3 / 9-4:
 *   - connect-create-${userId}    (9-2 per-user)
 *   - checkout-${randomUUID()}    (9-3 per-attempt)
 *   - capture-${bookingId}        (9-4 per-resource)
 *   - cancel-${bookingId}         (9-4 per-resource; SHARED with 9-6
 *                                  Phase 2 PENDING cancel — intentional,
 *                                  same Stripe operation)
 *   - refund-${bookingId}         (9-6 per-resource)
 *
 * Error mapping: identical shape to 9-2 / 9-3 / 9-4's wrappers. Stripe
 * SDK errors (`Stripe.errors.StripeError`) → `err.message` (end-user-
 * readable in test mode — e.g., "The charge has already been refunded").
 * Other errors → `'Unexpected error'` + `console.error` for ops visibility.
 *
 * Singleton-import discipline (Story 9-1): this file is the FIFTH file
 * in the repo to import `stripe` from `@/lib/stripe`. Future stories
 * that need `stripe.refunds.retrieve` / `.list` / `.update` would
 * extend this file (currently NOT shipped per BA Decision §4).
 */

import Stripe from 'stripe';
import { stripe } from '@/lib/stripe';
import type { StripeServiceResult } from '@/lib/stripe-service';

export async function createRefund(args: {
  paymentIntentId: string;
  idempotencyKey: string;
}): Promise<
  StripeServiceResult<{
    refundId: string;
    paymentIntentId: string;
    status: string;
    amountCents: number;
  }>
> {
  try {
    const refund = await stripe.refunds.create(
      {
        payment_intent: args.paymentIntentId,
        // NO `amount` arg — Phase 2 full-refund-only (BA Decision §4
        // anti-pattern). Phase 3 may parametrize.
        // NO `refund_application_fee: true` — destination-charge mode
        // automatically reverses the platform_fee_amount on full refunds.
      },
      {
        // BA Decision §4: per-booking-id key — caller passes
        // `refund-${bookingId}`. Retries hit Stripe's idempotency cache
        // and return the same Refund object.
        idempotencyKey: args.idempotencyKey,
      },
    );
    return {
      ok: true,
      data: {
        refundId: refund.id,
        paymentIntentId: args.paymentIntentId,
        // Stripe's Refund.status is `'pending' | 'requires_action' |
        // 'succeeded' | 'failed' | 'canceled' | null`. The wrapper
        // returns whatever Stripe returned; the action layer doesn't
        // currently branch on this (treats any non-error response as
        // success — the charge.refunded webhook handler is the
        // backstop for any post-create failure).
        status: refund.status ?? 'unknown',
        amountCents: refund.amount,
      },
    };
  } catch (err) {
    return mapStripeError(err, 'createRefund');
  }
}

function mapStripeError(
  err: unknown,
  operation: string,
): { ok: false; error: string } {
  if (err instanceof Stripe.errors.StripeError) {
    return { ok: false, error: err.message };
  }
  const msg = err instanceof Error ? err.message : String(err);
  console.error(`[stripe-refunds] ${operation} unexpected error`, {
    error: msg,
  });
  return { ok: false, error: 'Unexpected error' };
}
