import { cookies } from 'next/headers';
import type { AuthSession } from '@/lib/auth/config';

/**
 * deskhive_mode session-cookie helpers — Story 7-1.
 *
 * The mode cookie tracks whether a logged-in user is currently in Guest
 * mode (booking) or Host mode (managing owned spaces). It is a
 * session-level UI preference, NOT a persistent DB field — a user may
 * switch between modes multiple times in one session.
 *
 * Server-only. Importing from a Client Component is a hard error
 * because `cookies()` from `next/headers` is server-only. Client
 * Components that need to read the mode should accept it as a prop from
 * a Server Component parent.
 *
 * IMPORTANT — never trust the cookie alone. Use `effectiveMode(session)`
 * for any UI branching: it validates the cookie against the session's
 * role and falls back to `'guest'` if a stale Host-mode cookie is held
 * by a non-SPACE_OWNER user.
 */

export const MODE_COOKIE_NAME = 'deskhive_mode' as const;
export const MODE_VALUES = ['guest', 'host'] as const;
export type Mode = (typeof MODE_VALUES)[number];

// Story 7-1: switchModeAction error messages live here (NOT in
// src/actions/mode.ts) because Next.js's 'use server' files can only
// export async functions — exporting a const object would trip
// `invalid-use-server-value` and break every page that transitively
// pulls in the Server Action bundle (including the login page via
// <Header> → <UserPill> → switchModeAction).
export const SWITCH_MODE_MESSAGES = {
  UNAUTHORIZED: 'Please log in.',
  FORBIDDEN: 'You don’t have permission to switch to Host mode.',
  INVALID_TARGET: 'Invalid mode.',
  INTERNAL_ERROR: 'Something went wrong. Please try again.',
} as const;

function isMode(value: string | undefined): value is Mode {
  return value === 'guest' || value === 'host';
}

/**
 * Reads the raw mode cookie. Returns `'guest'` when absent or malformed.
 * Does NOT validate against session role — use `effectiveMode` for
 * UI-branching decisions.
 */
export async function readMode(): Promise<Mode> {
  const store = await cookies();
  const raw = store.get(MODE_COOKIE_NAME)?.value;
  return isMode(raw) ? raw : 'guest';
}

/**
 * Returns the mode that the UI should actually honor for this session.
 *
 * A `host` cookie is only honored when the session's role is
 * SPACE_OWNER. Otherwise — Guest, Super Admin, or no session — the
 * effective mode is `'guest'`.
 *
 * Defense against stale cookies after a hypothetical future role
 * downgrade: the user's nav must not silently behave like a Host's nav
 * if their role no longer carries that privilege.
 */
export async function effectiveMode(
  session: AuthSession | null,
): Promise<Mode> {
  if (!session) return 'guest';
  const raw = await readMode();
  if (raw !== 'host') return 'guest';
  const role = (session.user as { role?: string }).role;
  return role === 'SPACE_OWNER' ? 'host' : 'guest';
}
