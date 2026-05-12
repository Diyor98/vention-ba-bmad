import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock `next/headers` before importing the module under test so the
// helpers pick up the mock at module load.
vi.mock('next/headers', () => {
  const store = new Map<string, string>();
  return {
    cookies: () =>
      Promise.resolve({
        get: (name: string) => {
          const value = store.get(name);
          return value === undefined ? undefined : { name, value };
        },
        set: (name: string, value: string) => {
          store.set(name, value);
        },
        delete: (name: string) => {
          store.delete(name);
        },
        __reset: () => {
          store.clear();
        },
      }),
  };
});

import { cookies } from 'next/headers';
import { readMode, effectiveMode, MODE_COOKIE_NAME } from './mode';
import type { AuthSession } from './auth/config';

async function resetCookies(): Promise<void> {
  const store = (await cookies()) as unknown as { __reset: () => void };
  store.__reset();
}

async function setCookie(name: string, value: string): Promise<void> {
  const store = await cookies();
  store.set(name, value);
}

function makeSession(role: string | undefined): AuthSession {
  return {
    session: {
      id: 'session-1',
      userId: 'user-1',
      token: 'tok',
      expiresAt: new Date(Date.now() + 60_000),
      ipAddress: null,
      userAgent: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    user: {
      id: 'user-1',
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

beforeEach(async () => {
  await resetCookies();
});

describe('readMode', () => {
  it('returns "guest" when no cookie is set', async () => {
    expect(await readMode()).toBe('guest');
  });

  it('returns "guest" when cookie has a malformed value', async () => {
    await setCookie(MODE_COOKIE_NAME, 'banana');
    expect(await readMode()).toBe('guest');
  });

  it('returns "guest" when cookie value is "guest"', async () => {
    await setCookie(MODE_COOKIE_NAME, 'guest');
    expect(await readMode()).toBe('guest');
  });

  it('returns "host" when cookie value is "host"', async () => {
    await setCookie(MODE_COOKIE_NAME, 'host');
    expect(await readMode()).toBe('host');
  });
});

describe('effectiveMode', () => {
  it('returns "guest" when session is null', async () => {
    await setCookie(MODE_COOKIE_NAME, 'host');
    expect(await effectiveMode(null)).toBe('guest');
  });

  it('returns "guest" when no cookie is set, regardless of role', async () => {
    expect(await effectiveMode(makeSession('SPACE_OWNER'))).toBe('guest');
    expect(await effectiveMode(makeSession('GUEST'))).toBe('guest');
    expect(await effectiveMode(makeSession('SUPER_ADMIN'))).toBe('guest');
  });

  it('returns "host" when cookie is "host" AND role is SPACE_OWNER', async () => {
    await setCookie(MODE_COOKIE_NAME, 'host');
    expect(await effectiveMode(makeSession('SPACE_OWNER'))).toBe('host');
  });

  it('falls back to "guest" when cookie is "host" but role is GUEST (stale cookie)', async () => {
    await setCookie(MODE_COOKIE_NAME, 'host');
    expect(await effectiveMode(makeSession('GUEST'))).toBe('guest');
  });

  it('falls back to "guest" when cookie is "host" but role is SUPER_ADMIN', async () => {
    // SUPER_ADMIN is intentionally NOT allowed in Host mode (BA Decision §3).
    await setCookie(MODE_COOKIE_NAME, 'host');
    expect(await effectiveMode(makeSession('SUPER_ADMIN'))).toBe('guest');
  });

  it('falls back to "guest" when cookie is "host" but role field is missing', async () => {
    await setCookie(MODE_COOKIE_NAME, 'host');
    expect(await effectiveMode(makeSession(undefined))).toBe('guest');
  });

  it('returns "guest" when cookie is "guest" AND role is SPACE_OWNER', async () => {
    await setCookie(MODE_COOKIE_NAME, 'guest');
    expect(await effectiveMode(makeSession('SPACE_OWNER'))).toBe('guest');
  });
});
