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
import {
  createCheckoutSession,
  createEmbeddedCheckoutSession,
} from './checkout';
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

describe('createEmbeddedCheckoutSession (DESIGN-INT-CHECKOUT-EMBED — Phase 2)', () => {
  it('happy path — calls Stripe with ui_mode:embedded_page + return_url + same payment_intent_data shape; returns { sessionId, clientSecret }', async () => {
    checkoutSessionsCreateMock.mockResolvedValueOnce({
      id: 'cs_test_embed_abc',
      client_secret: 'cs_test_embed_abc_secret_xyz',
    });

    const result = await createEmbeddedCheckoutSession({
      spaceName: 'Seeded Owner Coworks',
      amountCents: 2500,
      platformFeeCents: 375,
      ownerStripeAccountId: 'acct_test_xyz',
      bookingId: '33333333-3333-3333-3333-333333333333',
      guestEmail: 'guest@example.com',
      returnUrl:
        'http://localhost:3000/spaces/abc/booking/return?session_id={CHECKOUT_SESSION_ID}',
      idempotencyKey: 'checkout-embed-uuid-1',
    });

    expect(result).toEqual({
      ok: true,
      data: {
        sessionId: 'cs_test_embed_abc',
        clientSecret: 'cs_test_embed_abc_secret_xyz',
      },
    });

    const [body, opts] = checkoutSessionsCreateMock.mock.calls[0] as [
      Record<string, unknown>,
      { idempotencyKey: string },
    ];
    // Load-bearing differences from hosted Session:
    expect(body.ui_mode).toBe('embedded_page');
    expect(body.return_url).toBe(
      'http://localhost:3000/spaces/abc/booking/return?session_id={CHECKOUT_SESSION_ID}',
    );
    // Hosted-mode keys MUST NOT be set:
    expect(body.success_url).toBeUndefined();
    expect(body.cancel_url).toBeUndefined();

    // Identical to hosted Session: marketplace + metadata shape stays:
    const pi = body.payment_intent_data as {
      capture_method: string;
      transfer_data: { destination: string };
      application_fee_amount: number;
      metadata: { bookingId: string };
    };
    expect(pi.capture_method).toBe('manual');
    expect(pi.transfer_data).toEqual({ destination: 'acct_test_xyz' });
    expect(pi.application_fee_amount).toBe(375);
    expect(pi.metadata.bookingId).toBe(
      '33333333-3333-3333-3333-333333333333',
    );
    expect(body.client_reference_id).toBe(
      '33333333-3333-3333-3333-333333333333',
    );
    expect(body.customer_email).toBe('guest@example.com');
    expect(opts.idempotencyKey).toBe('checkout-embed-uuid-1');
  });

  it('null client_secret → { ok: false } with explicit error', async () => {
    checkoutSessionsCreateMock.mockResolvedValueOnce({
      id: 'cs_test_embed_no_secret',
      client_secret: null,
    });
    const result = await createEmbeddedCheckoutSession({
      spaceName: 'X',
      amountCents: 100,
      platformFeeCents: 15,
      ownerStripeAccountId: 'acct_x',
      bookingId: '44444444-4444-4444-4444-444444444444',
      guestEmail: 'x@y.z',
      returnUrl: 'http://x/return',
      idempotencyKey: 'k',
    });
    expect(result).toEqual({
      ok: false,
      error: 'Stripe Embedded Checkout returned no client_secret',
    });
  });

  it('Stripe SDK error → mapped to { ok: false, error }', async () => {
    const stripeErr = new Stripe.errors.StripeInvalidRequestError({
      type: 'invalid_request_error',
      message: 'idempotency key conflict',
    });
    checkoutSessionsCreateMock.mockRejectedValueOnce(stripeErr);

    const result = await createEmbeddedCheckoutSession({
      spaceName: 'X',
      amountCents: 100,
      platformFeeCents: 15,
      ownerStripeAccountId: 'acct_x',
      bookingId: '55555555-5555-5555-5555-555555555555',
      guestEmail: 'x@y.z',
      returnUrl: 'http://x/return',
      idempotencyKey: 'k',
    });
    expect(result).toEqual({
      ok: false,
      error: 'idempotency key conflict',
    });
  });
});
