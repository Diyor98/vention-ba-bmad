import { describe, it, expect, vi, beforeEach } from 'vitest';

// Story 9-4 unit tests for the Stripe Payment-Intent state-mutation
// wrappers (`capturePaymentIntent` + `cancelPaymentIntent`). Action
// tests live in src/actions/booking.test.ts — split-by-mock-boundary
// pattern from 9-2 / 9-3 (mocking @/lib/payments/payment-intents there
// would clobber the real wrappers tested here).
//
// Mock surface: only @/lib/stripe — wrappers don't touch the DB.

const {
  paymentIntentsCaptureMock,
  paymentIntentsCancelMock,
} = vi.hoisted(() => ({
  paymentIntentsCaptureMock: vi.fn(),
  paymentIntentsCancelMock: vi.fn(),
}));

vi.mock('@/lib/stripe', () => ({
  stripe: {
    paymentIntents: {
      capture: paymentIntentsCaptureMock,
      cancel: paymentIntentsCancelMock,
    },
  },
}));

// Real Stripe import for Stripe.errors.* — exercises the wrapper's
// `instanceof Stripe.errors.StripeError` branch in mapStripeError.
import Stripe from 'stripe';
import {
  capturePaymentIntent,
  cancelPaymentIntent,
} from './payment-intents';

beforeEach(() => {
  paymentIntentsCaptureMock.mockReset();
  paymentIntentsCancelMock.mockReset();
});

describe('capturePaymentIntent (Story 9-4 — wrapper happy + error paths)', () => {
  it('happy path — calls Stripe with locked args + wraps result as { ok: true, data: { paymentIntentId, status } }', async () => {
    paymentIntentsCaptureMock.mockResolvedValueOnce({
      id: 'pi_test_abc',
      status: 'succeeded',
    });

    const result = await capturePaymentIntent({
      paymentIntentId: 'pi_test_abc',
      idempotencyKey: 'capture-booking-uuid-1',
    });

    expect(result).toEqual({
      ok: true,
      data: { paymentIntentId: 'pi_test_abc', status: 'succeeded' },
    });

    // Verify the locked Stripe API call shape (BA Decision §5):
    //   stripe.paymentIntents.capture(piId, undefined, { idempotencyKey })
    expect(paymentIntentsCaptureMock).toHaveBeenCalledTimes(1);
    const [piId, params, opts] = paymentIntentsCaptureMock.mock.calls[0] as [
      string,
      unknown,
      { idempotencyKey: string },
    ];
    expect(piId).toBe('pi_test_abc');
    expect(params).toBeUndefined();
    expect(opts.idempotencyKey).toBe('capture-booking-uuid-1');
  });

  it('error path — Stripe throws StripeError → { ok: false, error: <message> }', async () => {
    const stripeErr = new Stripe.errors.StripeInvalidRequestError({
      type: 'invalid_request_error',
      message: 'The PaymentIntent has already been canceled',
    });
    paymentIntentsCaptureMock.mockRejectedValueOnce(stripeErr);

    const result = await capturePaymentIntent({
      paymentIntentId: 'pi_test_canceled',
      idempotencyKey: 'capture-booking-uuid-2',
    });

    expect(result).toEqual({
      ok: false,
      error: 'The PaymentIntent has already been canceled',
    });
  });
});

describe('cancelPaymentIntent (Story 9-4 — wrapper happy + error paths)', () => {
  it('happy path — calls Stripe with cancellation_reason=requested_by_customer + idempotency key', async () => {
    paymentIntentsCancelMock.mockResolvedValueOnce({
      id: 'pi_test_xyz',
      status: 'canceled',
    });

    const result = await cancelPaymentIntent({
      paymentIntentId: 'pi_test_xyz',
      idempotencyKey: 'cancel-booking-uuid-3',
    });

    expect(result).toEqual({
      ok: true,
      data: { paymentIntentId: 'pi_test_xyz', status: 'canceled' },
    });

    // Verify the locked Stripe API call shape (BA Decision §3 + §5):
    //   stripe.paymentIntents.cancel(piId, { cancellation_reason }, { idempotencyKey })
    expect(paymentIntentsCancelMock).toHaveBeenCalledTimes(1);
    const [piId, params, opts] = paymentIntentsCancelMock.mock.calls[0] as [
      string,
      { cancellation_reason: string },
      { idempotencyKey: string },
    ];
    expect(piId).toBe('pi_test_xyz');
    // BA Decision §3: hardcoded to 'requested_by_customer'.
    expect(params.cancellation_reason).toBe('requested_by_customer');
    expect(opts.idempotencyKey).toBe('cancel-booking-uuid-3');
  });

  it('error path — Stripe throws StripeError → { ok: false, error: <message> }', async () => {
    const stripeErr = new Stripe.errors.StripeInvalidRequestError({
      type: 'invalid_request_error',
      message: 'You cannot cancel this PaymentIntent because it has a status of succeeded',
    });
    paymentIntentsCancelMock.mockRejectedValueOnce(stripeErr);

    const result = await cancelPaymentIntent({
      paymentIntentId: 'pi_test_captured',
      idempotencyKey: 'cancel-booking-uuid-4',
    });

    expect(result).toEqual({
      ok: false,
      error: 'You cannot cancel this PaymentIntent because it has a status of succeeded',
    });
  });
});
