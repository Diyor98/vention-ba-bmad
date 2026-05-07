import { listAllBookings } from '@/db/queries/bookings';
import { DataView, type DataViewStatus } from '@/components/data-view';
import { StatusBadge } from '@/components/status-badge';
import { formatCents } from '@/lib/format';
import { logger } from '@/lib/logger';
import { ConfirmBookingButton } from './confirm-booking-button';
import { RejectBookingButton } from './reject-booking-button';
import type { Booking, BookingStatus, Desk, Space } from '@/db/schema';

type Row = {
  booking: Booking;
  desk: Desk;
  space: Space;
  guest: { id: string; email: string; fullName: string };
};

// Guarded by src/app/admin/layout.tsx — Super Admin only.
export default async function AdminBookingsPage() {
  let rows: Row[] = [];
  let dataStatus: DataViewStatus = 'loaded';
  try {
    rows = await listAllBookings();
    if (rows.length === 0) dataStatus = 'empty';
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error('admin_bookings_page_failed', { error: msg });
    dataStatus = 'error';
  }

  return (
    <main
      className="container-content"
      style={{ paddingTop: '2.5rem', paddingBottom: '4rem' }}
    >
      <h1 className="page-h1 mb-6">Bookings</h1>
      <DataView status={dataStatus} emptyMessage="No bookings yet.">
        <ul>
          {rows.map(({ booking, desk, space, guest }) => (
            <li
              key={booking.id}
              className="flex items-center justify-between gap-3"
              style={{
                borderBottom: '1px solid var(--color-border)',
                padding: '0.75rem 0',
                fontSize: '14px',
              }}
            >
              <div className="flex-1">
                <div className="font-medium">{guest.fullName}</div>
                <div className="muted" style={{ fontSize: '13px' }}>
                  {space.name} · {desk.label} · {booking.bookingDate}
                </div>
              </div>
              <span className="muted-strong tnum" style={{ fontSize: '13px' }}>
                {formatCents(booking.totalPriceCents)}
              </span>
              {/* status is `text` in the DB; CHECK constraint guarantees the enum at runtime. */}
              {(booking.status as BookingStatus) === 'PENDING' && (
                <>
                  <ConfirmBookingButton bookingId={booking.id} />
                  <RejectBookingButton bookingId={booking.id} />
                </>
              )}
              <StatusBadge status={booking.status as BookingStatus} />
            </li>
          ))}
        </ul>
      </DataView>
    </main>
  );
}
