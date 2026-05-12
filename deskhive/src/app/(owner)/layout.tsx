import { redirect } from 'next/navigation';
import { requireSession, AuthError } from '@/lib/auth/guards';

/**
 * Story 7-1: route-group layout for /owner/* placeholder routes.
 *
 * Runs the soft-redirect role guard once for all three placeholder pages
 * (dashboard, spaces, bookings) — mirrors the Phase 1 admin/layout.tsx
 * pattern. The inline `role !== 'SPACE_OWNER'` check is the deliberate
 * soft-redirect shape from Story 6-2 (memory:
 * reference_role_specific_nav_pattern.md). `requireRole()` throws
 * AuthError(403) which is the wrong shape for "wrong role, send them
 * somewhere useful."
 *
 * The global Header from app/layout.tsx still renders — route-group
 * layouts compose with the root layout.
 */
export default async function OwnerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  let session;
  try {
    session = await requireSession();
  } catch (err) {
    if (err instanceof AuthError) {
      redirect('/login?callbackUrl=/owner');
    }
    throw err;
  }

  const role = (session.user as { role?: string }).role;
  if (role !== 'SPACE_OWNER') {
    // Wrong-role soft redirect to that role's natural workspace.
    if (role === 'SUPER_ADMIN') redirect('/admin/spaces');
    redirect('/');
  }

  return <>{children}</>;
}
