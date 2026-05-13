import { describe, it, expect } from 'vitest';
import {
  AuthError,
  requireRole,
  requireOwnership,
  isOwnerScopeAllowed,
} from './guards';
import type { AuthSession } from './config';

function makeSession(role: string, userId = 'user-1'): AuthSession {
  return {
    session: {
      id: 'session-1',
      userId,
      token: 'tok',
      expiresAt: new Date(Date.now() + 60_000),
      ipAddress: null,
      userAgent: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    user: {
      id: userId,
      email: 'u@example.com',
      emailVerified: true,
      name: 'User',
      image: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      role,
    } as AuthSession['user'],
  } as AuthSession;
}

describe('requireRole', () => {
  it('passes silently when role matches', () => {
    const s = makeSession('SUPER_ADMIN');
    expect(() => requireRole(s, 'SUPER_ADMIN')).not.toThrow();
  });

  it('throws AuthError(403) when role does not match', async () => {
    const s = makeSession('GUEST');
    let caught: unknown;
    try {
      requireRole(s, 'SUPER_ADMIN');
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(AuthError);
    const res = (caught as AuthError).response;
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.code).toBe('FORBIDDEN');
  });

  it('throws when role field is missing on user', () => {
    const s = makeSession('');
    expect(() => requireRole(s, 'GUEST')).toThrow(AuthError);
  });
});

describe('requireOwnership', () => {
  it('passes silently when ids match', () => {
    expect(() => requireOwnership('user-1', 'user-1')).not.toThrow();
  });

  it('throws AuthError(403) when ids differ', async () => {
    let caught: unknown;
    try {
      requireOwnership('user-A', 'user-B');
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(AuthError);
    const res = (caught as AuthError).response;
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.code).toBe('FORBIDDEN');
  });
});

describe('isOwnerScopeAllowed (Story 7-5)', () => {
  it('SUPER_ADMIN is always allowed regardless of owner_id', () => {
    expect(
      isOwnerScopeAllowed({
        callerRole: 'SUPER_ADMIN',
        callerId: 'admin-1',
        resourceOwnerId: 'owner-99',
      }),
    ).toBe(true);
  });

  it('SUPER_ADMIN is allowed even on NULL-owner resources (Phase 1 admin-owned)', () => {
    expect(
      isOwnerScopeAllowed({
        callerRole: 'SUPER_ADMIN',
        callerId: 'admin-1',
        resourceOwnerId: null,
      }),
    ).toBe(true);
  });

  it('SPACE_OWNER is allowed when ids match', () => {
    expect(
      isOwnerScopeAllowed({
        callerRole: 'SPACE_OWNER',
        callerId: 'owner-7',
        resourceOwnerId: 'owner-7',
      }),
    ).toBe(true);
  });

  it('SPACE_OWNER is denied on another owner\'s resource', () => {
    expect(
      isOwnerScopeAllowed({
        callerRole: 'SPACE_OWNER',
        callerId: 'owner-7',
        resourceOwnerId: 'owner-99',
      }),
    ).toBe(false);
  });

  it('SPACE_OWNER is denied on a NULL-owner resource (admin-owned, not theirs)', () => {
    expect(
      isOwnerScopeAllowed({
        callerRole: 'SPACE_OWNER',
        callerId: 'owner-7',
        resourceOwnerId: null,
      }),
    ).toBe(false);
  });

  it('GUEST is denied regardless of ownership', () => {
    expect(
      isOwnerScopeAllowed({
        callerRole: 'GUEST',
        callerId: 'guest-1',
        resourceOwnerId: 'guest-1',
      }),
    ).toBe(false);
  });

  it('undefined role is denied', () => {
    expect(
      isOwnerScopeAllowed({
        callerRole: undefined,
        callerId: 'whoever',
        resourceOwnerId: 'whoever',
      }),
    ).toBe(false);
  });
});

describe('AuthError', () => {
  it('preserves the response for the handler to return', () => {
    const res = new Response('x', { status: 418 });
    const err = new AuthError(res);
    expect(err.response).toBe(res);
    expect(err.name).toBe('AuthError');
  });
});
