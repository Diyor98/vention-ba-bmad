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
}: {
  spacesCount: number;
  pendingCount: number;
}) {
  const pathname = usePathname() ?? '';
  const isSpaces = pathname.startsWith('/admin/spaces');
  const isBookings = pathname.startsWith('/admin/bookings');
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
          <Link
            href="/admin/guests"
            className="admin-tab"
            aria-current={isGuests ? 'page' : undefined}
          >
            Guests
          </Link>
        </nav>
        <div className="admin-subnav-meta">
          <span>Phase 1</span>
        </div>
      </div>
    </div>
  );
}
