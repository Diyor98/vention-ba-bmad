import { describe, it, expect, vi, beforeEach } from 'vitest';

// Story 9-6 unit tests for the Stripe Refunds service-layer wrapper
// (`createRefund`). Per BA Decision §12 split-by-mock-boundary: wrapper
// tests mock at `@/lib/stripe`. Action tests mock at `@/lib/payments/refunds`
// — those live in src/actions/booking.test.ts.

const { refundsCreateMock } = vi.hoisted(() => ({
  refundsCreateMock: vi.fn(),
}));

vi.mock('@/lib/stripe', () => ({
  stripe: {
    refunds: {
      create: refundsCreateMock,
    },
  },
}));

// Real Stripe import for Stripe.errors.* — exercises the wrapper's
// `instanceof Stripe.errors.StripeError` branch in mapStripeError.
import Stripe from 'stripe';
import { createRefund } from './refunds';

beforeEach(() => {
  refundsCreateMock.mockReset();
});

describe('createRefund (Story 9-6 — wrapper happy + error paths)', () => {
  it('happy path — calls Stripe with payment_intent + idempotencyKey (NO amount; NO refund_application_fee) + wraps result', async () => {
    refundsCreateMock.mockResolvedValueOnce({
      id: 're_test_abc',
      status: 'succeeded',
      amount: 2500,
    });

    const result = await createRefund({
      paymentIntentId: 'pi_test_captured',
      idempotencyKey: 'refund-booking-uuid-1',
    });

    expect(result).toEqual({
      ok: true,
      data: {
        refundId: 're_test_abc',
        paymentIntentId: 'pi_test_captured',
        status: 'succeeded',
        amountCents: 2500,
      },
    });

    // Verify the locked Stripe API call shape (BA Decision §4):
    //   stripe.refunds.create({ payment_intent }, { idempotencyKey })
    // NO `amount` arg (Phase 2 full-refund-only).
    // NO `refund_application_fee: true` (destination-charge auto-reverses).
    expect(refundsCreateMock).toHaveBeenCalledTimes(1);
    const [params, opts] = refundsCreateMock.mock.calls[0] as [
      Record<string, unknown>,
      { idempotencyKey: string },
    ];
    expect(params).toEqual({
      payment_intent: 'pi_test_captured',
    });
    expect(params).not.toHaveProperty('amount');
    expect(params).not.toHaveProperty('refund_application_fee');
    expect(opts.idempotencyKey).toBe('refund-booking-uuid-1');
  });

  it('error path — Stripe throws StripeError → { ok: false, error: <message> }', async () => {
    const stripeErr = new Stripe.errors.StripeInvalidRequestError({
      type: 'invalid_request_error',
      message: 'The charge has already been refunded',
    });
    refundsCreateMock.mockRejectedValueOnce(stripeErr);

    const result = await createRefund({
      paymentIntentId: 'pi_test_already_refunded',
      idempotencyKey: 'refund-booking-uuid-2',
    });

    expect(result).toEqual({
      ok: false,
      error: 'The charge has already been refunded',
    });
  });
});
