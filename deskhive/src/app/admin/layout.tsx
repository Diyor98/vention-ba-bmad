import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireSession, requireRole, AuthError } from '@/lib/auth/guards';

// Centralized admin-area guard. Runs once per request before any /admin/*
// page renders. Replaces the per-page try/catch blocks introduced in US-2.1.
//
// 401 (no session) → /login (the proxy handles this earlier at the edge for
//   the no-cookie case; this catches the cookie-present-but-invalid case).
// 403 (Guest hitting admin) → / silently per US-2.1 AC-5.
//
// Pages under /admin/* MUST NOT re-call requireSession/requireRole — the
// layout has already done it. Doing so duplicates the cost and creates a
// second source of redirect logic to maintain.
//
// US-4.1 added the within-admin sub-nav so Super Admins can navigate between
// Spaces and Bookings without typing URLs. No active-state highlighting —
// that requires usePathname() (Client Component); deferred.
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  try {
    const session = await requireSession();
    requireRole(session, 'SUPER_ADMIN');
  } catch (err) {
    if (err instanceof AuthError) {
      if (err.response.status === 401) redirect('/login');
      redirect('/');
    }
    throw err;
  }

  return (
    <>
      <nav
        style={{
          borderBottom: '1px solid var(--color-border)',
          background: 'var(--color-neutral-0)',
        }}
      >
        <div
          className="container-content"
          style={{
            display: 'flex',
            gap: '0.25rem',
            paddingTop: '0.5rem',
            paddingBottom: '0.5rem',
          }}
        >
          <Link href="/admin/spaces" className="nav-link">
            Spaces
          </Link>
          <Link href="/admin/bookings" className="nav-link">
            Bookings
          </Link>
        </div>
      </nav>
      {children}
    </>
  );
}
