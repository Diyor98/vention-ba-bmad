import { describe, it, expect, vi, beforeEach } from 'vitest';

// Story 9-2: tests for the service-layer Connect wrappers (tests 1-4
// per BA Decision §14). Action tests live in src/actions/connect.test.ts
// because mocking @/lib/payments/connect there would clobber the real
// wrappers tested here (vi.mock hoists above imports).
//
// Mock surface: only @/lib/stripe — wrappers don't touch the DB.

const {
  accountsCreateMock,
  accountLinksCreateMock,
  accountsRetrieveMock,
} = vi.hoisted(() => ({
  accountsCreateMock: vi.fn(),
  accountLinksCreateMock: vi.fn(),
  accountsRetrieveMock: vi.fn(),
}));

vi.mock('@/lib/stripe', () => ({
  stripe: {
    accounts: {
      create: accountsCreateMock,
      retrieve: accountsRetrieveMock,
    },
    accountLinks: {
      create: accountLinksCreateMock,
    },
  },
}));

// Real Stripe class import for Stripe.errors.* — we use the real error
// classes to exercise the wrapper's `instanceof Stripe.errors.StripeError`
// branch.
import Stripe from 'stripe';
import {
  createConnectAccount,
  createConnectAccountLink,
  getConnectAccountStatus,
} from './connect';

beforeEach(() => {
  accountsCreateMock.mockReset();
  accountLinksCreateMock.mockReset();
  accountsRetrieveMock.mockReset();
});

describe('createConnectAccount (Story 9-2 Decision §14 test 1 + 2)', () => {
  it('test 1 happy path — returns { ok: true, data: { stripeAccountId } } and calls Stripe with locked args', async () => {
    accountsCreateMock.mockResolvedValueOnce({ id: 'acct_test_abc123' });

    const result = await createConnectAccount({
      userId: 'user-uuid-1',
      email: 'owner@example.com',
    });

    expect(result).toEqual({
      ok: true,
      data: { stripeAccountId: 'acct_test_abc123' },
    });
    expect(accountsCreateMock).toHaveBeenCalledTimes(1);
    const [args, options] = accountsCreateMock.mock.calls[0]!;
    // Verify the locked-shape args per BA Decision §6.
    expect(args.type).toBe('express');
    expect(args.country).toBe('US');
    expect(args.email).toBe('owner@example.com');
    expect(args.capabilities).toEqual({
      card_payments: { requested: true },
      transfers: { requested: true },
    });
    // Verify idempotency key per BA Decision §11.
    expect(options?.idempotencyKey).toBe('connect-create-user-uuid-1');
  });

  it('test 2 — idempotency key is deterministic per userId', async () => {
    accountsCreateMock.mockResolvedValue({ id: 'acct_x' });

    await createConnectAccount({ userId: 'aaa', email: 'a@x.com' });
    await createConnectAccount({ userId: 'bbb', email: 'b@x.com' });

    expect(accountsCreateMock.mock.calls[0]?.[1]?.idempotencyKey).toBe(
      'connect-create-aaa',
    );
    expect(accountsCreateMock.mock.calls[1]?.[1]?.idempotencyKey).toBe(
      'connect-create-bbb',
    );
  });

  it('test 1 error mapping — StripeError → { ok: false, error: message }', async () => {
    const stripeErr = new Stripe.errors.StripeAuthenticationError({
      type: 'authentication_error',
      message: 'No such country: ZZ',
    });
    accountsCreateMock.mockRejectedValueOnce(stripeErr);

    const result = await createConnectAccount({
      userId: 'u',
      email: 'e@x.com',
    });

    expect(result).toEqual({ ok: false, error: 'No such country: ZZ' });
  });
});

describe('createConnectAccountLink (Story 9-2 Decision §14 test 3)', () => {
  it('happy path — returns the Stripe URL and calls accountLinks.create with locked args', async () => {
    accountLinksCreateMock.mockResolvedValueOnce({
      url: 'https://connect.stripe.com/setup/e/acct_test_abc/secret',
    });

    const result = await createConnectAccountLink({
      stripeAccountId: 'acct_test_abc',
      returnUrl: 'http://localhost:3000/owner/settings/onboarding/return',
      refreshUrl: 'http://localhost:3000/owner/settings/onboarding/refresh',
    });

    expect(result).toEqual({
      ok: true,
      data: { url: 'https://connect.stripe.com/setup/e/acct_test_abc/secret' },
    });
    expect(accountLinksCreateMock).toHaveBeenCalledTimes(1);
    expect(accountLinksCreateMock.mock.calls[0]?.[0]).toEqual({
      account: 'acct_test_abc',
      type: 'account_onboarding',
      return_url: 'http://localhost:3000/owner/settings/onboarding/return',
      refresh_url: 'http://localhost:3000/owner/settings/onboarding/refresh',
    });
  });
});

describe('getConnectAccountStatus (Story 9-2 Decision §14 test 4)', () => {
  it('maps Stripe account fields → { chargesEnabled, payoutsEnabled, onboardingCompleted }', async () => {
    accountsRetrieveMock.mockResolvedValueOnce({
      id: 'acct_test',
      charges_enabled: true,
      payouts_enabled: false,
      details_submitted: true,
    });

    const result = await getConnectAccountStatus({
      stripeAccountId: 'acct_test',
    });

    expect(result).toEqual({
      ok: true,
      data: {
        chargesEnabled: true,
        payoutsEnabled: false,
        onboardingCompleted: true,
      },
    });
  });
});
