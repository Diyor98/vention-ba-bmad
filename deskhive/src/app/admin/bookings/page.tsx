import { listAllBookings } from '@/db/queries/bookings';
import { DataView, type DataViewStatus } from '@/components/data-view';
import { StatusBadge } from '@/components/status-badge';
import { formatCents } from '@/lib/format';
import { logger } from '@/lib/logger';
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
    <main className="mx-auto max-w-5xl p-8">
      <h1 className="mb-6 text-2xl font-semibold">Bookings</h1>
      <DataView status={dataStatus} emptyMessage="No bookings yet.">
        <ul>
          {rows.map(({ booking, desk, space, guest }) => (
            <li
              key={booking.id}
              className="flex items-center justify-between gap-3 border-b border-gray-200 py-3 text-sm"
            >
              <div className="flex-1">
                <div className="font-medium">{guest.fullName}</div>
                <div className="text-gray-700">
                  {space.name} · {desk.label} · {booking.bookingDate}
                </div>
              </div>
              <span className="text-gray-700">
                {formatCents(booking.totalPriceCents)}
              </span>
              {/* status is `text` in the DB; CHECK constraint guarantees the enum at runtime. */}
              <StatusBadge status={booking.status as BookingStatus} />
            </li>
          ))}
        </ul>
      </DataView>
    </main>
  );
}
