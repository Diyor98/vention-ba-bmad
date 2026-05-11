import { redirect } from 'next/navigation';
import { requireSession, requireRole, AuthError } from '@/lib/auth/guards';
import { listAllSpaces } from '@/db/queries/spaces';
import { listAllBookings } from '@/db/queries/bookings';
import { AdminTabs } from './admin-tabs';
import type { BookingStatus } from '@/db/schema';

// Centralized admin-area guard. Runs once per request before any /admin/*
// page renders. Replaces the per-page try/catch blocks introduced in US-2.1.
//
// Story 5-2: also computes the tab badge counts (Spaces total + PENDING
// bookings count) so the <AdminTabs> Client Component below has data
// without each tab page having to refetch on its own. usePathname() lives
// in <AdminTabs>; this layout must remain a Server Component to keep the
// requireSession()/requireRole() guard authoritative.
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

  // Tab counts. Phase 1 data volumes are small; an extra roundtrip per
  // admin request is acceptable. Phase 2 candidate: consolidate into a
  // tiny getAdminCounts() helper or memoize via unstable_cache.
  const [spaces, bookingRows] = await Promise.all([
    listAllSpaces(),
    listAllBookings(),
  ]);
  const pendingCount = bookingRows.filter(
    (r) => (r.booking.status as BookingStatus) === 'PENDING',
  ).length;

  return (
    <>
      <AdminTabs spacesCount={spaces.length} pendingCount={pendingCount} />
      {children}
    </>
  );
}
