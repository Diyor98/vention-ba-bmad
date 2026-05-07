import { redirect } from 'next/navigation';
import { requireSession, AuthError } from '@/lib/auth/guards';
import { listBookingsForGuest } from '@/db/queries/bookings';
import { DataView, type DataViewStatus } from '@/components/data-view';
import { StatusBadge } from '@/components/status-badge';
import { formatCents, todayIso } from '@/lib/format';
import { logger } from '@/lib/logger';
import { CancelBookingButton } from './cancel-booking-button';
import type { Booking, BookingStatus, Desk, Space } from '@/db/schema';

type Row = { booking: Booking; desk: Desk; space: Space };

export default async function MyBookingsPage() {
  let session;
  try {
    session = await requireSession();
  } catch (err) {
    if (err instanceof AuthError) {
      redirect('/login?callbackUrl=/my-bookings');
    }
    throw err;
  }

  let rows: Row[] = [];
  let dataStatus: DataViewStatus = 'loaded';
  try {
    rows = await listBookingsForGuest(String(session.user.id));
    if (rows.length === 0) dataStatus = 'empty';
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error('my_bookings_page_failed', { error: msg });
    dataStatus = 'error';
  }

  // Partition rows into status sections (Story 5-1, AC-8 + Decision #3).
  // Sort order from US-3.4 is preserved by the underlying query.
  const today = todayIso();
  const awaiting = rows.filter(
    (r) => (r.booking.status as BookingStatus) === 'PENDING',
  );
  const upcoming = rows.filter(
    (r) =>
      (r.booking.status as BookingStatus) === 'CONFIRMED' &&
      r.booking.bookingDate >= today,
  );
  const past = rows.filter((r) => {
    const s = r.booking.status as BookingStatus;
    return (
      s === 'CANCELLED' ||
      s === 'REJECTED' ||
      (s === 'CONFIRMED' && r.booking.bookingDate < today)
    );
  });

  return (
    <main
      className="container-content"
      style={{ paddingTop: '3rem', paddingBottom: '4rem' }}
    >
      <header className="mb-8">
        <h1 className="page-h1">My bookings</h1>
        <p
          className="mt-1.5 muted-strong"
          style={{ fontSize: '14px' }}
        >
          Your day-pass bookings, grouped by what needs your attention.
        </p>
      </header>

      <DataView
        status={dataStatus}
        emptyMessage="You haven't booked anything yet. Browse spaces to get started."
      >
        {awaiting.length > 0 && (
          <section aria-labelledby="sec-awaiting" className="mb-12">
            <div className="section-head">
              <h2 id="sec-awaiting">Awaiting confirmation</h2>
              <span className="count tnum">{awaiting.length}</span>
            </div>
            <p className="section-help">
              Each space reviews its own bookings and confirms within a few
              hours. You won&apos;t be charged until confirmation.
            </p>
            <ul className="list-none p-0 m-0">
              {awaiting.map((row) => (
                <BookingCard key={row.booking.id} row={row} archived={false} />
              ))}
            </ul>
          </section>
        )}

        {upcoming.length > 0 && (
          <section aria-labelledby="sec-upcoming" className="mb-12">
            <div className="section-head">
              <h2 id="sec-upcoming">Upcoming</h2>
              <span className="count tnum">{upcoming.length}</span>
            </div>
            <ul className="list-none p-0 m-0">
              {upcoming.map((row) => (
                <BookingCard key={row.booking.id} row={row} archived={false} />
              ))}
            </ul>
          </section>
        )}

        {past.length > 0 && (
          <section
            aria-labelledby="sec-archived"
            className="section-archived mb-12"
          >
            <div className="section-head">
              <h2 id="sec-archived">Past &amp; archived</h2>
              <span className="count tnum">{past.length}</span>
            </div>
            <ul className="list-none p-0 m-0">
              {past.map((row) => (
                <BookingCard key={row.booking.id} row={row} archived={true} />
              ))}
            </ul>
          </section>
        )}
      </DataView>
    </main>
  );
}

function BookingCard({ row, archived }: { row: Row; archived: boolean }) {
  const { booking, desk, space } = row;
  const status = booking.status as BookingStatus;
  const isPending = status === 'PENDING';
  // CONFIRMED uses the prominent .badge-lg variant per design AC-8 / shared.css;
  // others use the standard size.
  const badgeSize: 'sm' | 'lg' = status === 'CONFIRMED' ? 'lg' : 'sm';
  // Show price formatting (existing tabular-num convention from US-3.4).
  return (
    <li className="booking">
      <div className="booking-header">
        <div className="booking-icon" aria-hidden="true">
          <DeskGlyph />
        </div>
        <div className="min-w-0">
          <p className="booking-title">
            {space.name} · {desk.label}
          </p>
          <p className="booking-sub">{space.city}</p>
        </div>
        <div className="booking-status">
          <StatusBadge status={status} size={badgeSize} />
        </div>
      </div>
      <div className="booking-meta">
        <div>
          <p className="meta-label">Date</p>
          <p className="meta-value tnum">{booking.bookingDate}</p>
        </div>
        <div>
          <p className="meta-label">Price</p>
          <p className="meta-value tnum">
            {formatCents(booking.totalPriceCents)}
          </p>
        </div>
      </div>
      {isPending ? (
        <div className="booking-footer">
          <p className="booking-context">
            Awaiting confirmation from the space.
          </p>
          <div className="booking-actions">
            <CancelBookingButton bookingId={booking.id} />
          </div>
        </div>
      ) : archived ? (
        <div className="booking-footer no-actions">
          <p className="booking-context">
            {status === 'CANCELLED'
              ? 'You cancelled this booking.'
              : status === 'REJECTED'
                ? 'The space declined this request.'
                : 'Visit complete.'}
          </p>
        </div>
      ) : (
        // CONFIRMED future-dated в†’ no footer (keep card tight)
        null
      )}
    </li>
  );
}

function DeskGlyph() {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M3 8h18" />
      <path d="M5 8v3a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8" />
      <path d="M7 13v6" />
      <path d="M17 13v6" />
    </svg>
  );
}
