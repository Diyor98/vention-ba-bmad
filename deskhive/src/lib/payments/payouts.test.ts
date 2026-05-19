import { describe, it, expect, vi, beforeEach } from 'vitest';

// Story 9-7 unit tests for the Stripe Connect Payouts list wrapper
// (`listPayouts`). Per BA Decision §9 split-by-mock-boundary: wrapper
// tests mock at `@/lib/stripe`. Page tests + handler tests are at
// different layers.
//
// 2 locked cases (BA Decision §9 / AC-9):
//   1. Happy path — verifies the Stripe API CALL SHAPE, specifically
//      that `stripeAccount` lives in the SECOND RequestOptions arg,
//      NOT the first params arg. Load-bearing per BA Decision §3 —
//      misplacing the arg returns the platform's own payouts (wrong
//      scope) instead of the connected account's.
//   2. Error path — Stripe throws StripeError → { ok: false, error }.

const { payoutsListMock } = vi.hoisted(() => ({
  payoutsListMock: vi.fn(),
}));

vi.mock('@/lib/stripe', () => ({
  stripe: {
    payouts: {
      list: payoutsListMock,
    },
  },
}));

// Real Stripe import for Stripe.errors.* — exercises the wrapper's
// `instanceof Stripe.errors.StripeError` branch in mapStripeError.
import Stripe from 'stripe';
import { listPayouts } from './payouts';

beforeEach(() => {
  payoutsListMock.mockReset();
});

describe('listPayouts (Story 9-7 — wrapper happy + error paths)', () => {
  it('happy path — calls Stripe with limit:25 + stripeAccount in SECOND RequestOptions arg (load-bearing); wraps result', async () => {
    payoutsListMock.mockResolvedValueOnce({
      data: [
        {
          id: 'po_test_1',
          amount: 2125,
          currency: 'usd',
          status: 'paid',
          arrival_date: 1748736000,
        },
        {
          id: 'po_test_2',
          amount: 4250,
          currency: 'usd',
          status: 'in_transit',
          arrival_date: 1748822400,
        },
      ],
    });

    const result = await listPayouts({
      stripeAccountId: 'acct_test_connected',
    });

    expect(result).toEqual({
      ok: true,
      data: {
        payouts: [
          {
            id: 'po_test_1',
            amount: 2125,
            currency: 'usd',
            status: 'paid',
            arrival_date: 1748736000,
          },
          {
            id: 'po_test_2',
            amount: 4250,
            currency: 'usd',
            status: 'in_transit',
            arrival_date: 1748822400,
          },
        ],
      },
    });

    // ─────── Load-bearing arg-shape assertion (BA Decision §3) ───────
    // stripe.payouts.list(params, requestOptions) — `stripeAccount` MUST
    // be in the SECOND `RequestOptions` arg, NOT in `params`. Misplacing
    // it returns the platform's own payouts. The wrapper test asserts
    // this position to catch accidental refactors that flatten the call.
    expect(payoutsListMock).toHaveBeenCalledTimes(1);
    const [params, opts] = payoutsListMock.mock.calls[0] as [
      Record<string, unknown>,
      { stripeAccount: string },
    ];
    expect(params).toEqual({ limit: 25 });
    expect(params).not.toHaveProperty('stripeAccount');
    expect(opts.stripeAccount).toBe('acct_test_connected');
  });

  it('error path — Stripe throws StripeError → { ok: false, error: <message> }', async () => {
    const stripeErr = new Stripe.errors.StripeInvalidRequestError({
      type: 'invalid_request_error',
      message: 'The provided Stripe account does not exist',
    });
    payoutsListMock.mockRejectedValueOnce(stripeErr);

    const result = await listPayouts({
      stripeAccountId: 'acct_test_nonexistent',
    });

    expect(result).toEqual({
      ok: false,
      error: 'The provided Stripe account does not exist',
    });
  });
});
