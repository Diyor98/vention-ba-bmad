import { describe, it, expect, vi, beforeEach } from 'vitest';

// Story 9-2: tests for the Connect Server Actions (Decision §14 tests
// 5-7). Wrapper tests live in src/lib/payments/connect.test.ts.
//
// Mock surface:
//   - next/headers + @/lib/auth/config + @/lib/mode — auth chain
//   - @/db/queries/stripe-connect — DB lookups + upsert
//   - @/lib/payments/connect — service-layer wrappers (black-boxed here;
//     they have their own test file)

const {
  getSessionMock,
  effectiveModeMock,
  getConnectByUserIdMock,
  upsertConnectMock,
  createConnectAccountStub,
  createConnectAccountLinkStub,
  getConnectAccountStatusStub,
} = vi.hoisted(() => ({
  getSessionMock: vi.fn(),
  effectiveModeMock: vi.fn(),
  getConnectByUserIdMock: vi.fn(),
  upsertConnectMock: vi.fn(),
  createConnectAccountStub: vi.fn(),
  createConnectAccountLinkStub: vi.fn(),
  getConnectAccountStatusStub: vi.fn(),
}));

vi.mock('next/headers', () => ({
  headers: vi.fn().mockResolvedValue(new Headers()),
}));
vi.mock('@/lib/auth/config', () => ({
  auth: { api: { getSession: getSessionMock } },
}));
vi.mock('@/lib/mode', () => ({
  effectiveMode: effectiveModeMock,
}));
vi.mock('@/db/queries/stripe-connect', () => ({
  getConnectAccountByUserId: getConnectByUserIdMock,
  upsertConnectAccount: upsertConnectMock,
}));
vi.mock('@/lib/payments/connect', () => ({
  createConnectAccount: createConnectAccountStub,
  createConnectAccountLink: createConnectAccountLinkStub,
  getConnectAccountStatus: getConnectAccountStatusStub,
}));

import {
  initiateConnectOnboardingAction,
  refreshConnectStatusAction,
} from './connect';

function stubAuthorizedOwner() {
  getSessionMock.mockResolvedValue({
    user: {
      id: 'user-owner-1',
      email: 'owner@deskhive.local',
      role: 'SPACE_OWNER',
    },
  });
  effectiveModeMock.mockResolvedValue('host');
}

beforeEach(() => {
  getSessionMock.mockReset();
  effectiveModeMock.mockReset();
  getConnectByUserIdMock.mockReset();
  upsertConnectMock.mockReset();
  createConnectAccountStub.mockReset();
  createConnectAccountLinkStub.mockReset();
  getConnectAccountStatusStub.mockReset();
});

describe('initiateConnectOnboardingAction (Decision §14 tests 5 + 6)', () => {
  it('test 5 — first call (no row) creates a new Stripe account, upserts, returns redirect URL', async () => {
    stubAuthorizedOwner();
    getConnectByUserIdMock.mockResolvedValueOnce(null);
    createConnectAccountStub.mockResolvedValueOnce({
      ok: true,
      data: { stripeAccountId: 'acct_new_abc' },
    });
    upsertConnectMock.mockResolvedValueOnce({});
    createConnectAccountLinkStub.mockResolvedValueOnce({
      ok: true,
      data: { url: 'https://connect.stripe.com/setup/e/x/y' },
    });

    const result = await initiateConnectOnboardingAction();

    expect(result).toEqual({
      ok: true,
      redirectUrl: 'https://connect.stripe.com/setup/e/x/y',
    });
    expect(createConnectAccountStub).toHaveBeenCalledTimes(1);
    expect(createConnectAccountStub.mock.calls[0]?.[0]).toEqual({
      userId: 'user-owner-1',
      email: 'owner@deskhive.local',
    });
    expect(upsertConnectMock).toHaveBeenCalledTimes(1);
    expect(upsertConnectMock.mock.calls[0]?.[0]).toEqual({
      userId: 'user-owner-1',
      stripeAccountId: 'acct_new_abc',
    });
  });

  it('test 6 — subsequent call (row exists) reuses acct_*, does NOT call createConnectAccount', async () => {
    stubAuthorizedOwner();
    getConnectByUserIdMock.mockResolvedValueOnce({
      stripeAccountId: 'acct_existing_xyz',
      chargesEnabled: false,
      payoutsEnabled: false,
      onboardingCompleted: false,
    });
    createConnectAccountLinkStub.mockResolvedValueOnce({
      ok: true,
      data: { url: 'https://connect.stripe.com/setup/e/a/b' },
    });

    const result = await initiateConnectOnboardingAction();

    expect(result).toEqual({
      ok: true,
      redirectUrl: 'https://connect.stripe.com/setup/e/a/b',
    });
    expect(createConnectAccountStub).not.toHaveBeenCalled();
    expect(upsertConnectMock).not.toHaveBeenCalled();
    expect(createConnectAccountLinkStub.mock.calls[0]?.[0]?.stripeAccountId).toBe(
      'acct_existing_xyz',
    );
  });

  it('unauthenticated caller returns { ok: false, error: UNAUTHENTICATED }', async () => {
    getSessionMock.mockResolvedValue(null);

    const result = await initiateConnectOnboardingAction();

    expect(result).toEqual({ ok: false, error: 'UNAUTHENTICATED' });
    expect(createConnectAccountStub).not.toHaveBeenCalled();
  });

  it('GUEST in host-mode-cookie-only returns { ok: false, error: NOT_SPACE_OWNER_HOST }', async () => {
    getSessionMock.mockResolvedValue({
      user: { id: 'g', email: 'g@x.com', role: 'GUEST' },
    });
    effectiveModeMock.mockResolvedValue('guest');

    const result = await initiateConnectOnboardingAction();

    expect(result).toEqual({ ok: false, error: 'NOT_SPACE_OWNER_HOST' });
  });
});

describe('refreshConnectStatusAction (Decision §14 test 7)', () => {
  it('fetches status from Stripe and upserts to DB row', async () => {
    stubAuthorizedOwner();
    getConnectByUserIdMock.mockResolvedValueOnce({
      stripeAccountId: 'acct_test_xyz',
      chargesEnabled: false,
      payoutsEnabled: false,
      onboardingCompleted: false,
    });
    getConnectAccountStatusStub.mockResolvedValueOnce({
      ok: true,
      data: {
        chargesEnabled: true,
        payoutsEnabled: true,
        onboardingCompleted: true,
      },
    });
    upsertConnectMock.mockResolvedValueOnce({});

    const result = await refreshConnectStatusAction();

    expect(result).toEqual({
      ok: true,
      chargesEnabled: true,
      payoutsEnabled: true,
    });
    expect(upsertConnectMock).toHaveBeenCalledTimes(1);
    expect(upsertConnectMock.mock.calls[0]?.[0]).toEqual({
      userId: 'user-owner-1',
      stripeAccountId: 'acct_test_xyz',
      chargesEnabled: true,
      payoutsEnabled: true,
      onboardingCompleted: true,
    });
  });

  it('NO_CONNECT_ACCOUNT — owner with no DB row gets that error code', async () => {
    stubAuthorizedOwner();
    getConnectByUserIdMock.mockResolvedValueOnce(null);

    const result = await refreshConnectStatusAction();

    expect(result).toEqual({ ok: false, error: 'NO_CONNECT_ACCOUNT' });
    expect(getConnectAccountStatusStub).not.toHaveBeenCalled();
  });
});
