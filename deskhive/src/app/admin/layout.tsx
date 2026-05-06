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

  return <>{children}</>;
}
