import { redirect } from 'next/navigation';
import { requireSession, AuthError } from '@/lib/auth/guards';
import { listBookingsForGuest } from '@/db/queries/bookings';
import { DataView, type DataViewStatus } from '@/components/data-view';
import { StatusBadge } from '@/components/status-badge';
import { formatCents } from '@/lib/format';
import { logger } from '@/lib/logger';
import type { Booking, BookingStatus, Desk, Space } from '@/db/schema';

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

  let rows: Array<{ booking: Booking; desk: Desk; space: Space }> = [];
  let dataStatus: DataViewStatus = 'loaded';
  try {
    rows = await listBookingsForGuest(String(session.user.id));
    if (rows.length === 0) dataStatus = 'empty';
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error('my_bookings_page_failed', { error: msg });
    dataStatus = 'error';
  }

  return (
    <main className="mx-auto max-w-3xl p-8">
      <h1 className="mb-6 text-2xl font-semibold">My bookings</h1>
      <DataView
        status={dataStatus}
        emptyMessage="You haven't booked anything yet. Browse spaces to get started."
      >
        <ul>
          {rows.map(({ booking, desk, space }) => (
            <li
              key={booking.id}
              className="flex items-center justify-between gap-3 border-b border-gray-200 py-3 text-sm"
            >
              <div className="flex-1">
                <div className="font-medium">{space.name}</div>
                <div className="text-gray-700">
                  {desk.label} · {booking.bookingDate}
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
