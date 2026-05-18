/**
 * Story 9-4: Payment-Intent state-mutation wrappers — `capture` (Owner
 * Confirm) and `cancel` (Owner Reject) operations on Payment Intents
 * created by Story 9-3's Checkout Session flow.
 *
 * Two operations, both returning `StripeServiceResult<T>` per Story 9-1
 * Decision §6:
 *
 *   • `capturePaymentIntent` — captures a PI in `requires_capture`
 *     state (the post-9-3 authorized state). On success, the PI moves
 *     to `succeeded`; Stripe settles funds to the platform account
 *     AND automatically transfers the payout (minus the destination-
 *     charge's `application_fee_amount`) to the connected Stripe Connect
 *     account. Called by `confirmBookingAction` AFTER Phase 1 pre-checks
 *     pass and BEFORE the DB UPDATE (Stripe-first-then-DB ordering per
 *     BA Decision §2 — different from 9-3's pre-claim model because
 *     there's no slot-claim race on Owner-side single-tenant confirms).
 *
 *   • `cancelPaymentIntent` — cancels a PI in `requires_capture` state.
 *     On success, the PI moves to `canceled` and the auth hold on the
 *     Guest's card is released. `cancellation_reason` is hardcoded to
 *     `'requested_by_customer'` per BA Decision §3 (closest semantic
 *     match for Owner-Reject; the platform-as-merchant is canceling on
 *     behalf of its user — the Space Owner). Called by
 *     `rejectBookingAction`.
 *
 * Idempotency: callers pass per-booking-id keys (`capture-${bookingId}`
 * + `cancel-${bookingId}`) per BA Decision §7. Different namespace from
 * 9-2's `connect-create-${userId}` and 9-3's per-attempt
 * `checkout-${randomUUID()}`. Per-booking-id is correct here because
 * the operation is bounded to ONE Payment Intent — retries should
 * reuse Stripe's idempotency cache.
 *
 * Error mapping: same shape as `src/lib/payments/connect.ts` +
 * `src/lib/payments/checkout.ts`. Stripe SDK errors → `err.message`
 * (end-user-readable in test mode — e.g., "The PaymentIntent has
 * already been canceled"). Other errors → `'Unexpected error'` +
 * `console.error` for ops visibility.
 *
 * Singleton-import discipline (Story 9-1): this file is the FOURTH
 * file in the repo to import `stripe` from `@/lib/stripe` (after
 * `src/lib/stripe.ts`, `stripe-service.ts`, `payments/connect.ts`,
 * `payments/checkout.ts`). Future stories that extend
 * `payment-intents.ts` (e.g., 9-5 might add `paymentIntents.retrieve`
 * for webhook handlers) keep that single import.
 *
 * Anti-pattern (BA Decision §5):
 *   • NO `paymentIntents.create` here — that's already done inside
 *     `checkout.sessions.create({ payment_intent_data: {...} })` in
 *     `checkout.ts`. DeskHive never directly creates PIs.
 *   • NO `paymentIntents.retrieve` here in 9-4 — defer until 9-5's
 *     webhook handlers need it.
 */

import Stripe from 'stripe';
import { stripe } from '@/lib/stripe';
import type { StripeServiceResult } from '@/lib/stripe-service';

export async function capturePaymentIntent(args: {
  paymentIntentId: string;
  idempotencyKey: string;
}): Promise<
  StripeServiceResult<{ paymentIntentId: string; status: string }>
> {
  try {
    const pi = await stripe.paymentIntents.capture(
      args.paymentIntentId,
      // Stripe's TS signature wants the second positional param to be
      // PaymentIntentCaptureParams (or undefined). We don't pass any
      // capture-specific params (e.g., `amount_to_capture`) — full
      // capture of the original auth.
      undefined,
      {
        // BA Decision §7: per-booking-id key — caller passes
        // `capture-${bookingId}`. Retries reuse Stripe's idempotency
        // cache and return the same `succeeded` PI.
        idempotencyKey: args.idempotencyKey,
      },
    );
    return {
      ok: true,
      data: { paymentIntentId: pi.id, status: pi.status },
    };
  } catch (err) {
    return mapStripeError(err, 'capturePaymentIntent');
  }
}

export async function cancelPaymentIntent(args: {
  paymentIntentId: string;
  idempotencyKey: string;
}): Promise<
  StripeServiceResult<{ paymentIntentId: string; status: string }>
> {
  try {
    const pi = await stripe.paymentIntents.cancel(
      args.paymentIntentId,
      {
        // BA Decision §3: hardcoded reason. Closest semantic match for
        // Owner-Reject; other Stripe-accepted values (`'fraudulent'`,
        // `'duplicate'`, `'abandoned'`) are semantically wrong. Phase 3
        // may parametrize if multiple reject paths emerge.
        cancellation_reason: 'requested_by_customer',
      },
      {
        // BA Decision §7: per-booking-id key — caller passes
        // `cancel-${bookingId}`.
        idempotencyKey: args.idempotencyKey,
      },
    );
    return {
      ok: true,
      data: { paymentIntentId: pi.id, status: pi.status },
    };
  } catch (err) {
    return mapStripeError(err, 'cancelPaymentIntent');
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
  console.error(`[stripe-payment-intents] ${operation} unexpected error`, {
    error: msg,
  });
  return { ok: false, error: 'Unexpected error' };
}
