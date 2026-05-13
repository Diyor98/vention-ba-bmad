'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

// Client Component: needs usePathname() for the aria-current state. The
// parent admin/layout.tsx stays a Server Component (it runs requireSession()
// + requireRole() — must not be poisoned with 'use client'). The layout
// computes the counts server-side once per request and passes them as props.
export function AdminTabs({
  spacesCount,
  pendingCount,
  pendingApplicationsCount,
}: {
  spacesCount: number;
  pendingCount: number;
  pendingApplicationsCount: number;
}) {
  const pathname = usePathname() ?? '';
  const isSpaces = pathname.startsWith('/admin/spaces');
  const isBookings = pathname.startsWith('/admin/bookings');
  const isApplications = pathname.startsWith('/admin/applications');
  const isGuests = pathname.startsWith('/admin/guests');

  return (
    <div className="admin-subnav">
      <div className="admin-subnav-inner">
        <nav className="admin-tabs" aria-label="Admin sections">
          <Link
            href="/admin/spaces"
            className="admin-tab"
            aria-current={isSpaces ? 'page' : undefined}
          >
            Spaces <span className="count tnum">{spacesCount}</span>
          </Link>
          <Link
            href="/admin/bookings"
            className="admin-tab"
            aria-current={isBookings ? 'page' : undefined}
          >
            Bookings{' '}
            <span
              className={
                pendingCount > 0 ? 'count alert tnum' : 'count tnum'
              }
            >
              {pendingCount}
            </span>
          </Link>
          {/* Story 7-4: Applications tab. PENDING-only count badge —
              "needs attention" semantic, same as Bookings. */}
          <Link
            href="/admin/applications"
            className="admin-tab"
            aria-current={isApplications ? 'page' : undefined}
          >
            Applications{' '}
            <span
              className={
                pendingApplicationsCount > 0 ? 'count alert tnum' : 'count tnum'
              }
            >
              {pendingApplicationsCount}
            </span>
          </Link>
          <Link
            href="/admin/guests"
            className="admin-tab"
            aria-current={isGuests ? 'page' : undefined}
          >
            Guests
          </Link>
        </nav>
        <div className="admin-subnav-meta">
          <span>Phase 2</span>
        </div>
      </div>
    </div>
  );
}
