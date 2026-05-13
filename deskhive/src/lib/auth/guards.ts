import { headers } from 'next/headers';
import { auth, type AuthSession } from './config';
import { apiUnauthorized, apiForbidden } from '@/lib/http';
import type { Role } from '@/db/schema';

/**
 * Wraps a Response so route handlers can throw and catch in a single try/catch.
 * Map AuthError → its `.response` in your handler's catch block.
 */
export class AuthError extends Error {
  constructor(public response: Response) {
    super('AuthError');
    this.name = 'AuthError';
  }
}

/**
 * Returns the active session, or throws AuthError(401) if missing.
 * Use in route handlers, Server Components, and Server Actions that need auth.
 */
export async function requireSession(): Promise<AuthSession> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) throw new AuthError(apiUnauthorized());
  return session;
}

/**
 * Asserts the session's user has the required role; throws AuthError(403) otherwise.
 * Pure function — testable without Next.js mocking.
 */
export function requireRole(session: AuthSession, role: Role): void {
  // Better Auth's additionalFields typing for `role` doesn't always propagate to AuthSession;
  // the runtime value is set by our config (defaultValue 'GUEST', input: false).
  const userRole = (session.user as { role?: string }).role;
  if (userRole !== role) {
    throw new AuthError(apiForbidden(`Requires role ${role}`));
  }
}

/**
 * Asserts the resource belongs to the session's user; throws AuthError(403) otherwise.
 * Pure function — testable without Next.js mocking.
 */
export function requireOwnership(
  resourceUserId: string,
  sessionUserId: string,
): void {
  if (resourceUserId !== sessionUserId) {
    throw new AuthError(apiForbidden('Resource not owned by this user'));
  }
}

/**
 * Story 7-5: pure ownership-scope check for multi-tenant resources where
 * SUPER_ADMIN has platform-wide access and SPACE_OWNER is scoped to rows
 * they own. Returns `true` when the caller is allowed to act on the
 * resource; `false` otherwise.
 *
 * Caller branches:
 *   - SUPER_ADMIN → always allowed (platform-wide access per Decision §7).
 *   - SPACE_OWNER → allowed iff resourceOwnerId === callerId.
 *   - any other role (or null/undefined ownership) → denied.
 *
 * Used inline by space / desk / booking Server Actions. The action layer
 * returns NOT_FOUND (not FORBIDDEN) on a denial — Decision §8 leak-prevention
 * principle. This helper just returns the boolean; the action decides which
 * error code to surface.
 */
export function isOwnerScopeAllowed(opts: {
  callerRole: Role | undefined;
  callerId: string;
  resourceOwnerId: string | null;
}): boolean {
  if (opts.callerRole === 'SUPER_ADMIN') return true;
  if (opts.callerRole === 'SPACE_OWNER') {
    return opts.resourceOwnerId !== null && opts.resourceOwnerId === opts.callerId;
  }
  return false;
}
