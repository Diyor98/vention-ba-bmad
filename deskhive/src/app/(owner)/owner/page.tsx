import Link from 'next/link';
import {
  Activity,
  AlertTriangle,
  Banknote,
  Building2,
  Calendar,
  Plus,
  Settings,
} from 'lucide-react';
import { requireSession } from '@/lib/auth/guards';
import { listSpacesForOwner } from '@/db/queries/spaces';
import { listBookingsForOwner } from '@/db/queries/bookings';
import { getConnectAccountByUserId } from '@/db/queries/stripe-connect';
import { StatCard } from '@/components/stat-card';
import { StatusBadge } from '@/components/status-badge';
import type { BookingStatus } from '@/db/schema';

// Story 7-5 + DESIGN-INT-4: SPACE_OWNER dashboard. Adds the prototype's
// HostDashboard shape:
//   • Connect-status banner at top (amber if Connect missing, indigo if
//     in-progress, hidden if complete)
//   • 3-stat-card row (Active spaces / Pending bookings / Bookings this
//     month) — uses shared <StatCard> from DESIGN-INT-19
//   • 2-column body: Recent activity card (left) + Quick actions (right)
//
// All reads owner-scoped via the helpers from Story 7-5 + 9-2 (Connect
// row).
export default async function OwnerDashboardPage() {
  const session = await requireSession();
  const ownerId = String(session.user.id);

  const [spaces, bookingRows, connect] = await Promise.all([
    listSpacesForOwner(ownerId),
    listBookingsForOwner(ownerId),
    getConnectAccountByUserId(ownerId),
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

  const activeSpacesCount = spaces.length;
  const pendingBookingsCount = bookingRows.filter(
    (r) => (r.booking.status as BookingStatus) === 'PENDING',
  ).length;
  const now = new Date();
  const monthStart = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
  );
  const bookingsThisMonthCount = bookingRows.filter(
    (r) => new Date(r.booking.createdAt) >= monthStart,
  ).length;

  const recent = [...bookingRows]
    .sort(
      (a, b) =>
        new Date(b.booking.createdAt).getTime() -
        new Date(a.booking.createdAt).getTime(),
    )
    .slice(0, 5);

  // DESIGN-INT-4 — Connect status drives the top banner.
  // Phase 2 has no "Stripe step counter" — onboarding is one round-trip
  // to Stripe's hosted Express UI. So we render two states only:
  //   • Connect row missing (or onboardingCompleted=false) → amber banner
  //   • charges_enabled or payouts_enabled = false (post-onboarding gap)
  //     → indigo info banner
  //   • Both flags true → no banner (clean state)
  const connectNotStarted = !connect || !connect.onboardingCompleted;
  const connectPartial =
    !!connect &&
    connect.onboardingCompleted &&
    (!connect.chargesEnabled || !connect.payoutsEnabled);

  return (
    <main className="container-content admin-page">
      <div className="admin-page-head">
        <div>
          <h1 className="page-h1">Dashboard</h1>
          <p className="sub muted">Your hosting overview.</p>
        </div>
      </div>

      {connectNotStarted && (
        <div
          className="banner"
          data-testid="dashboard-connect-banner"
          style={{ marginTop: '1.5rem' }}
        >
          <span className="banner-icon" aria-hidden="true">
            <AlertTriangle />
          </span>
          <div className="banner-body">
            <h3>Connect Stripe to receive payouts</h3>
            <p>
              You&apos;ll keep accepting bookings, but funds are held until
              your account is set up.
            </p>
          </div>
          <div className="banner-actions">
            <Link href="/owner/settings" className="btn btn-primary">
              Connect Stripe
            </Link>
          </div>
        </div>
      )}
      {connectPartial && (
        <div
          className="banner banner-info"
          data-testid="dashboard-connect-banner-partial"
          style={{ marginTop: '1.5rem' }}
        >
          <span className="banner-icon" aria-hidden="true">
            <AlertTriangle />
          </span>
          <div className="banner-body">
            <h3>Finish your Stripe setup</h3>
            <p>
              Charges or payouts aren&apos;t fully enabled yet. Funds are
              held until you complete onboarding.
            </p>
          </div>
          <div className="banner-actions">
            <Link href="/owner/settings" className="btn btn-primary">
              Continue setup
            </Link>
          </div>
        </div>
      )}

      <div className="stat-grid" style={{ marginTop: '1.5rem' }}>
        <Link
          href="/owner/spaces"
          style={{ textDecoration: 'none', color: 'inherit' }}
        >
          <StatCard
            label="Active spaces"
            value={activeSpacesCount}
            Icon={Building2}
            testid="stat-active-spaces"
          />
        </Link>
        <Link
          href="/owner/bookings?filter=pending"
          style={{ textDecoration: 'none', color: 'inherit' }}
        >
          <StatCard
            label="Pending bookings"
            value={pendingBookingsCount}
            Icon={Calendar}
            attention={pendingBookingsCount > 0}
            testid="stat-pending-bookings"
          />
        </Link>
        <Link
          href="/owner/bookings"
          style={{ textDecoration: 'none', color: 'inherit' }}
        >
          <StatCard
            label="Bookings this month"
            value={bookingsThisMonthCount}
            Icon={Activity}
            testid="stat-month"
          />
        </Link>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 2fr) minmax(0, 1fr)',
          gap: '1.5rem',
          marginTop: '1.5rem',
        }}
      >
        <section
          aria-labelledby="recent-activity"
          className="form-card"
          style={{ padding: '1.25rem' }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: '0.75rem',
            }}
          >
            <h2
              id="recent-activity"
              style={{
                fontSize: 14,
                fontWeight: 600,
                color: 'var(--color-neutral-900)',
              }}
            >
              Recent activity
            </h2>
            <Link
              href="/owner/bookings"
              style={{ fontSize: 13, color: 'var(--color-primary)' }}
            >
              View all →
            </Link>
          </div>
          {recent.length === 0 ? (
            <p className="muted" style={{ fontSize: 13 }}>
              No bookings yet. Your spaces will show bookings here once
              Guests book them.
            </p>
          ) : (
            <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              {recent.map(({ booking, space, guest }, idx) => (
                <li
                  key={booking.id}
                  style={{
                    borderTop:
                      idx === 0 ? undefined : '1px solid var(--color-border)',
                  }}
                >
                  <Link
                    href="/owner/bookings"
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '1fr auto auto',
                      alignItems: 'center',
                      gap: '1rem',
                      padding: '0.625rem 0',
                      textDecoration: 'none',
                      color: 'inherit',
                    }}
                  >
                    <div className="cell-stack">
                      <span className="top">{guest.fullName}</span>
                      <span className="sub muted">{space.name}</span>
                    </div>
                    <StatusBadge status={booking.status as BookingStatus} />
                    <span
                      className="muted tnum"
                      style={{ fontSize: 12 }}
                    >
                      {new Date(booking.createdAt).toLocaleDateString(
                        'en-US',
                        {
                          month: 'short',
                          day: 'numeric',
                          timeZone: 'UTC',
                        },
                      )}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section
          aria-labelledby="quick-actions"
          className="form-card"
          style={{ padding: '1.25rem', height: 'fit-content' }}
        >
          <h2
            id="quick-actions"
            style={{
              fontSize: 14,
              fontWeight: 600,
              color: 'var(--color-neutral-900)',
              marginBottom: '0.75rem',
            }}
          >
            Quick actions
          </h2>
          <div style={{ display: 'grid', gap: '0.5rem' }}>
            <ActionRow
              Icon={Plus}
              label="Add a new space"
              href="/owner/spaces/new"
            />
            <ActionRow
              Icon={Building2}
              label="Manage my spaces"
              href="/owner/spaces"
            />
            <ActionRow
              Icon={Banknote}
              label="View payouts"
              href="/owner/payouts"
            />
            <ActionRow
              Icon={Settings}
              label="Stripe Connect"
              href="/owner/settings"
            />
          </div>
        </section>
      </div>
    </main>
  );
}

function ActionRow({
  Icon,
  label,
  href,
}: {
  Icon: typeof Plus;
  label: string;
  href: string;
}) {
  return (
    <Link
      href={href}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '0.75rem',
        padding: '0.625rem 0.75rem',
        borderRadius: 'var(--radius-lg)',
        border: '1px solid var(--color-border)',
        textDecoration: 'none',
        color: 'var(--color-neutral-800)',
        fontSize: 14,
        fontWeight: 500,
      }}
    >
      <span
        style={{
          width: 32,
          height: 32,
          display: 'grid',
          placeItems: 'center',
          borderRadius: 'var(--radius-md)',
          background: 'var(--color-neutral-100)',
          color: 'var(--color-neutral-600)',
        }}
      >
        <Icon size={15} />
      </span>
      <span style={{ flex: 1 }}>{label}</span>
      <span style={{ color: 'var(--color-neutral-400)' }} aria-hidden="true">
        ›
      </span>
    </Link>
  );
}
