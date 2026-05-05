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
