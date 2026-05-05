import { describe, it, expect } from 'vitest';
import { AuthError, requireRole, requireOwnership } from './guards';
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

describe('AuthError', () => {
  it('preserves the response for the handler to return', () => {
    const res = new Response('x', { status: 418 });
    const err = new AuthError(res);
    expect(err.response).toBe(res);
    expect(err.name).toBe('AuthError');
  });
});
