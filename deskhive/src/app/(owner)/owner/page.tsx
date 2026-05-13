import Link from 'next/link';
import { requireSession } from '@/lib/auth/guards';
import { listSpacesForOwner } from '@/db/queries/spaces';
import { listBookingsForOwner } from '@/db/queries/bookings';
import { StatusBadge } from '@/components/status-badge';
import type { BookingStatus } from '@/db/schema';

// Story 7-5: SPACE_OWNER dashboard. Three honest stat cards (no $0 payouts
// stub — Decision §1) + recent activity list + zero-spaces CTA empty state.
// Reads owner-scoped data via the two new query helpers in parallel.
//
// All counts computed in-memory from the loaded rows — Phase 2 small-volume
// assumption (matches admin/layout pattern from Stories 5-2 / 7-4).
export default async function OwnerDashboardPage() {
  const session = await requireSession();
  const ownerId = String(session.user.id);

  const [spaces, bookingRows] = await Promise.all([
    listSpacesForOwner(ownerId),
    listBookingsForOwner(ownerId),
  ]);

  // Empty state: no spaces → CTA card replaces ALL stat cards (Decision §1).
  if (spaces.length === 0) {
    return (
      <main className="container-content admin-page">
        <div className="admin-page-head">
          <div>
            <h1 className="page-h1">Dashboard</h1>
            <p className="sub muted">Your hosting overview.</p>
          </div>
        </div>
        <section className="form-card" style={{ marginTop: '2rem' }}>
          <div className="form-card-body" style={{ textAlign: 'center' }}>
            <h2 className="h2 mb-2">You haven&apos;t listed a space yet</h2>
            <p className="muted mb-4">
              Create your first space to start hosting.
            </p>
            <Link href="/owner/spaces/new" className="btn btn-primary">
              Create space
            </Link>
          </div>
        </section>
      </main>
    );
  }

  // Stat 1: total spaces owned.
  const activeSpacesCount = spaces.length;
  // Stat 2: PENDING bookings on owner's spaces.
  const pendingBookingsCount = bookingRows.filter(
    (r) => (r.booking.status as BookingStatus) === 'PENDING',
  ).length;
  // Stat 3: bookings created since the start of the current calendar month
  // (UTC — server runs in UTC; matches todayIso() invariant). All statuses.
  const now = new Date();
  const monthStart = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
  );
  const bookingsThisMonthCount = bookingRows.filter(
    (r) => new Date(r.booking.createdAt) >= monthStart,
  ).length;

  // Recent activity: 5 most recent bookings (by createdAt DESC). The query
  // orders by bookingDate primary; re-sort by createdAt for the dashboard
  // surface where "recent" means "newly arrived requests".
  const recent = [...bookingRows]
    .sort(
      (a, b) =>
        new Date(b.booking.createdAt).getTime() -
        new Date(a.booking.createdAt).getTime(),
    )
    .slice(0, 5);

  return (
    <main className="container-content admin-page">
      <div className="admin-page-head">
        <div>
          <h1 className="page-h1">Dashboard</h1>
          <p className="sub muted">Your hosting overview.</p>
        </div>
      </div>

      <section
        aria-label="Hosting stats"
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(14rem, 1fr))',
          gap: '1rem',
          marginTop: '1.5rem',
        }}
      >
        <StatCard
          href="/owner/spaces"
          label="Active spaces"
          value={activeSpacesCount}
        />
        <StatCard
          href="/owner/bookings?filter=pending"
          label="Pending bookings"
          value={pendingBookingsCount}
        />
        <StatCard
          href="/owner/bookings"
          label="Bookings this month"
          value={bookingsThisMonthCount}
        />
      </section>

      <section aria-labelledby="recent-activity" style={{ marginTop: '2.5rem' }}>
        <h2 id="recent-activity" className="h2 mb-4">
          Recent activity
        </h2>
        {recent.length === 0 ? (
          <p className="muted">
            No bookings yet. Your spaces will show bookings here once Guests
            book them.
          </p>
        ) : (
          <ul
            style={{
              listStyle: 'none',
              padding: 0,
              margin: 0,
              border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-lg)',
              overflow: 'hidden',
            }}
          >
            {recent.map(({ booking, space, guest }, idx) => (
              <li
                key={booking.id}
                style={{
                  borderTop: idx === 0 ? undefined : '1px solid var(--color-border)',
                }}
              >
                <Link
                  href="/owner/bookings"
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr auto auto',
                    alignItems: 'center',
                    gap: '1rem',
                    padding: '0.75rem 1rem',
                    textDecoration: 'none',
                    color: 'inherit',
                  }}
                >
                  <div className="cell-stack">
                    <span className="top">{guest.fullName}</span>
                    <span className="sub muted">{space.name}</span>
                  </div>
                  <StatusBadge status={booking.status as BookingStatus} />
                  <span className="muted tnum" style={{ fontSize: '12px' }}>
                    {new Date(booking.createdAt).toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      timeZone: 'UTC',
                    })}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}

function StatCard({
  href,
  label,
  value,
}: {
  href: string;
  label: string;
  value: number;
}) {
  return (
    <Link
      href={href}
      style={{
        display: 'block',
        padding: '1.25rem',
        background: 'var(--color-neutral-0)',
        border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius-lg)',
        textDecoration: 'none',
        color: 'inherit',
      }}
    >
      <p
        className="muted"
        style={{
          fontSize: '12px',
          fontWeight: 600,
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
          margin: 0,
        }}
      >
        {label}
      </p>
      <p
        className="tnum"
        style={{
          fontSize: '2rem',
          fontWeight: 600,
          margin: '0.5rem 0 0',
          lineHeight: 1,
        }}
      >
        {value}
      </p>
    </Link>
  );
}
