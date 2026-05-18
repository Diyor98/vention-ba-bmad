import { describe, it, expect, vi, beforeEach } from 'vitest';

// Story 9-2b: tests for `publishSpaceAction` (BA Decision §9). Covers the
// happy path + the three error branches surfaced by the locked 3-code
// discriminated union. Cross-tenant case must collapse into NOT_FOUND —
// the dropped `NOT_OWNER` code must never appear on the wire.
//
// Mock surface (matches the action's import graph):
//   - next/headers              → headers()
//   - @/lib/auth/config         → auth.api.getSession
//   - @/lib/mode                → effectiveMode
//   - @/db/queries/spaces       → getSpaceById (createSpace/updateSpace
//                                  are present but unused here)
//   - @/db/queries/stripe-connect → getConnectAccountByUserId
//   - @/db/client               → db.update(...).set(...).where(...) chain
//   - next/cache                → revalidatePath (no-op in tests)

const {
  getSessionMock,
  effectiveModeMock,
  getSpaceByIdMock,
  getConnectByUserIdMock,
  dbUpdateMock,
  dbSetMock,
  dbWhereMock,
  createSpaceMock,
  updateSpaceMock,
  revalidatePathMock,
} = vi.hoisted(() => {
  // Chain: db.update(table) → { set } → { where } → Promise
  const where = vi.fn().mockResolvedValue(undefined);
  const set = vi.fn(() => ({ where }));
  const update = vi.fn(() => ({ set }));
  return {
    getSessionMock: vi.fn(),
    effectiveModeMock: vi.fn(),
    getSpaceByIdMock: vi.fn(),
    getConnectByUserIdMock: vi.fn(),
    dbUpdateMock: update,
    dbSetMock: set,
    dbWhereMock: where,
    createSpaceMock: vi.fn(),
    updateSpaceMock: vi.fn(),
    revalidatePathMock: vi.fn(),
  };
});

vi.mock('next/headers', () => ({
  headers: vi.fn().mockResolvedValue(new Headers()),
}));
vi.mock('@/lib/auth/config', () => ({
  auth: { api: { getSession: getSessionMock } },
}));
vi.mock('@/lib/mode', () => ({
  effectiveMode: effectiveModeMock,
}));
vi.mock('@/db/queries/spaces', () => ({
  getSpaceById: getSpaceByIdMock,
  createSpace: createSpaceMock,
  updateSpace: updateSpaceMock,
}));
vi.mock('@/db/queries/stripe-connect', () => ({
  getConnectAccountByUserId: getConnectByUserIdMock,
}));
vi.mock('@/db/client', () => ({
  db: { update: dbUpdateMock },
}));
vi.mock('next/cache', () => ({
  revalidatePath: revalidatePathMock,
}));
// `requireSession` from guards is imported by sibling actions but unused
// in publishSpaceAction. Stub the module so its transitive imports don't
// load Better Auth in the test runner.
vi.mock('@/lib/auth/guards', () => ({
  requireSession: vi.fn(),
  AuthError: class AuthError extends Error {},
}));

import { publishSpaceAction } from './space';

const OWNER_ID = 'user-owner-A';
const SPACE_ID = '11111111-1111-1111-1111-111111111111';

function stubAuthorizedOwner(userId = OWNER_ID) {
  getSessionMock.mockResolvedValue({
    user: { id: userId, email: 'owner@deskhive.local', role: 'SPACE_OWNER' },
  });
  effectiveModeMock.mockResolvedValue('host');
}

beforeEach(() => {
  getSessionMock.mockReset();
  effectiveModeMock.mockReset();
  getSpaceByIdMock.mockReset();
  getConnectByUserIdMock.mockReset();
  dbUpdateMock.mockClear();
  dbSetMock.mockClear();
  dbWhereMock.mockClear();
  revalidatePathMock.mockClear();
});

describe('publishSpaceAction (Story 9-2b — Decision §9 tests)', () => {
  it('test 1 — happy path: active Connect + DRAFT space flips to PUBLISHED', async () => {
    stubAuthorizedOwner();
    getSpaceByIdMock.mockResolvedValueOnce({
      id: SPACE_ID,
      ownerId: OWNER_ID,
      status: 'DRAFT',
    });
    getConnectByUserIdMock.mockResolvedValueOnce({
      stripeAccountId: 'acct_test',
      chargesEnabled: true,
      payoutsEnabled: true,
      onboardingCompleted: true,
    });

    const result = await publishSpaceAction({ spaceId: SPACE_ID });

    expect(result).toEqual({ ok: true });
    // The chain was invoked once with the right SET payload.
    expect(dbUpdateMock).toHaveBeenCalledTimes(1);
    expect(dbSetMock).toHaveBeenCalledTimes(1);
    const setPayload = (
      dbSetMock.mock.calls as unknown as Array<
        [{ status: string; updatedAt: Date }]
      >
    )[0]?.[0];
    expect(setPayload?.status).toBe('PUBLISHED');
    expect(setPayload?.updatedAt).toBeInstanceOf(Date);
    expect(dbWhereMock).toHaveBeenCalledTimes(1);
    // Revalidate the four surfaces affected by a publish.
    expect(revalidatePathMock).toHaveBeenCalledWith('/owner/spaces');
    expect(revalidatePathMock).toHaveBeenCalledWith(`/owner/spaces/${SPACE_ID}`);
    expect(revalidatePathMock).toHaveBeenCalledWith('/');
    expect(revalidatePathMock).toHaveBeenCalledWith(`/spaces/${SPACE_ID}`);
  });

  it('test 2 — STRIPE_NOT_ACTIVE: owner has no Connect row, db.update is NOT called', async () => {
    stubAuthorizedOwner();
    getSpaceByIdMock.mockResolvedValueOnce({
      id: SPACE_ID,
      ownerId: OWNER_ID,
      status: 'DRAFT',
    });
    getConnectByUserIdMock.mockResolvedValueOnce(null);

    const result = await publishSpaceAction({ spaceId: SPACE_ID });

    expect(result).toEqual({ ok: false, error: 'STRIPE_NOT_ACTIVE' });
    expect(dbUpdateMock).not.toHaveBeenCalled();
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it('test 2b — STRIPE_NOT_ACTIVE: Connect row exists but chargesEnabled=false also gates', async () => {
    stubAuthorizedOwner();
    getSpaceByIdMock.mockResolvedValueOnce({
      id: SPACE_ID,
      ownerId: OWNER_ID,
      status: 'DRAFT',
    });
    getConnectByUserIdMock.mockResolvedValueOnce({
      stripeAccountId: 'acct_pending',
      chargesEnabled: false,
      payoutsEnabled: true,
      onboardingCompleted: false,
    });

    const result = await publishSpaceAction({ spaceId: SPACE_ID });

    expect(result).toEqual({ ok: false, error: 'STRIPE_NOT_ACTIVE' });
    expect(dbUpdateMock).not.toHaveBeenCalled();
  });

  it('test 3 — cross-tenant NOT_FOUND: owner-A asking about owner-B space (no NOT_OWNER on the wire)', async () => {
    stubAuthorizedOwner('user-owner-A');
    getSpaceByIdMock.mockResolvedValueOnce({
      id: SPACE_ID,
      ownerId: 'user-owner-B',
      status: 'DRAFT',
    });

    const result = await publishSpaceAction({ spaceId: SPACE_ID });

    expect(result).toEqual({ ok: false, error: 'NOT_FOUND' });
    // The dropped NOT_OWNER code MUST NOT surface (Decision §2 lock).
    expect(result).not.toEqual(
      expect.objectContaining({ error: 'NOT_OWNER' as unknown as string }),
    );
    // Connect lookup should NOT happen — short-circuit at the ownership
    // check (step 3 of the 7-step behavior).
    expect(getConnectByUserIdMock).not.toHaveBeenCalled();
    expect(dbUpdateMock).not.toHaveBeenCalled();
  });

  it('test 4 — ALREADY_PUBLISHED: owner asks to publish their own PUBLISHED space', async () => {
    stubAuthorizedOwner();
    getSpaceByIdMock.mockResolvedValueOnce({
      id: SPACE_ID,
      ownerId: OWNER_ID,
      status: 'PUBLISHED',
    });

    const result = await publishSpaceAction({ spaceId: SPACE_ID });

    expect(result).toEqual({ ok: false, error: 'ALREADY_PUBLISHED' });
    expect(getConnectByUserIdMock).not.toHaveBeenCalled();
    expect(dbUpdateMock).not.toHaveBeenCalled();
  });
});
