import { describe, it, expect, vi, beforeEach } from 'vitest';

// Story 9-3 unit tests for the Stripe Checkout service-layer wrappers.
// Action tests live in src/actions/booking-with-payment.test.ts —
// split-by-mock-boundary pattern from 9-2 (mocking @/lib/payments/checkout
// there would clobber the real wrappers tested here).
//
// Mock surface: only @/lib/stripe — the wrappers don't touch the DB.

const {
  checkoutSessionsCreateMock,
  checkoutSessionsRetrieveMock,
} = vi.hoisted(() => ({
  checkoutSessionsCreateMock: vi.fn(),
  checkoutSessionsRetrieveMock: vi.fn(),
}));

vi.mock('@/lib/stripe', () => ({
  stripe: {
    checkout: {
      sessions: {
        create: checkoutSessionsCreateMock,
        retrieve: checkoutSessionsRetrieveMock,
      },
    },
  },
}));

// Real Stripe import for Stripe.errors.* — exercises the wrapper's
// `instanceof Stripe.errors.StripeError` branch in mapStripeError.
import Stripe from 'stripe';
import { createCheckoutSession } from './checkout';
// Note: `retrieveCheckoutSession` is exercised end-to-end via the return-
// URL Server Component (`src/app/spaces/[id]/booking/return/page.tsx`)
// in the E2E suite; we don't add a unit test for it in 9-3 (the wrapper
// is a thin pass-through around `stripe.checkout.sessions.retrieve`).

beforeEach(() => {
  checkoutSessionsCreateMock.mockReset();
  checkoutSessionsRetrieveMock.mockReset();
});

describe('createCheckoutSession (Story 9-3 — wrapper happy path + error path)', () => {
  it('happy path — calls Stripe with locked args + wraps result as { ok: true, data: { sessionId, url } }', async () => {
    checkoutSessionsCreateMock.mockResolvedValueOnce({
      id: 'cs_test_session_abc',
      url: 'https://checkout.stripe.com/c/pay/cs_test_session_abc',
    });

    const result = await createCheckoutSession({
      spaceName: 'Seeded Owner Coworks',
      amountCents: 2500,
      platformFeeCents: 375,
      ownerStripeAccountId: 'acct_test_xyz',
      bookingId: '11111111-1111-1111-1111-111111111111',
      guestEmail: 'guest@example.com',
      successUrl: 'http://localhost:3000/spaces/abc/booking/return?session_id={CHECKOUT_SESSION_ID}',
      cancelUrl: 'http://localhost:3000/spaces/abc?booking_cancelled=1',
      idempotencyKey: 'checkout-uuid-1',
    });

    expect(result).toEqual({
      ok: true,
      data: {
        sessionId: 'cs_test_session_abc',
        url: 'https://checkout.stripe.com/c/pay/cs_test_session_abc',
      },
    });

    // Verify the locked Stripe API body shape (BA Decision §4).
    expect(checkoutSessionsCreateMock).toHaveBeenCalledTimes(1);
    const [body, opts] = checkoutSessionsCreateMock.mock.calls[0] as [
      Record<string, unknown>,
      { idempotencyKey: string },
    ];
    expect(body.mode).toBe('payment');
    expect(body.customer_email).toBe('guest@example.com');
    expect(body.client_reference_id).toBe(
      '11111111-1111-1111-1111-111111111111',
    );
    // payment_intent_data shape — manual capture + destination charge +
    // application_fee_amount + metadata.bookingId.
    const pi = body.payment_intent_data as {
      capture_method: string;
      transfer_data: { destination: string };
      application_fee_amount: number;
      metadata: { bookingId: string };
    };
    expect(pi.capture_method).toBe('manual');
    expect(pi.transfer_data).toEqual({ destination: 'acct_test_xyz' });
    expect(pi.application_fee_amount).toBe(375);
    expect(pi.metadata).toEqual({
      bookingId: '11111111-1111-1111-1111-111111111111',
    });
    // line_items shape
    const lineItems = body.line_items as Array<{
      quantity: number;
      price_data: {
        currency: string;
        unit_amount: number;
        product_data: { name: string };
      };
    }>;
    expect(lineItems).toHaveLength(1);
    expect(lineItems[0]?.quantity).toBe(1);
    expect(lineItems[0]?.price_data.unit_amount).toBe(2500);
    expect(lineItems[0]?.price_data.currency).toBe('usd');
    expect(lineItems[0]?.price_data.product_data.name).toContain(
      'Seeded Owner Coworks',
    );
    // Idempotency key passed through.
    expect(opts.idempotencyKey).toBe('checkout-uuid-1');
  });

  it('error path — Stripe SDK throws StripeError → { ok: false, error: <message> }', async () => {
    // Construct a real Stripe error to exercise the instanceof branch.
    const stripeErr = new Stripe.errors.StripeInvalidRequestError({
      type: 'invalid_request_error',
      message: 'No such connected account',
    });
    checkoutSessionsCreateMock.mockRejectedValueOnce(stripeErr);

    const result = await createCheckoutSession({
      spaceName: 'Anywhere',
      amountCents: 2500,
      platformFeeCents: 375,
      ownerStripeAccountId: 'acct_nonexistent',
      bookingId: '22222222-2222-2222-2222-222222222222',
      guestEmail: 'g@x.com',
      successUrl: 'http://x/return',
      cancelUrl: 'http://x/cancel',
      idempotencyKey: 'k',
    });

    expect(result).toEqual({
      ok: false,
      error: 'No such connected account',
    });
  });
});
