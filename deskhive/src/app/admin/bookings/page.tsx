import { listAllBookings } from '@/db/queries/bookings';
import { DataView, type DataViewStatus } from '@/components/data-view';
import { logger } from '@/lib/logger';
import { BookingsTable, type AdminBookingRow } from './bookings-table';

// Guarded by src/app/admin/layout.tsx — Super Admin only.
// Story 5-2 reskin: table layout (08-admin-bookings.html), with filter
// chips + sortable Booked column moved into the <BookingsTable> Client
// Component below. listAllBookings's server-side ordering is preserved as
// the initial paint (BookingsTable defaults sortDirection to 'desc').
export default async function AdminBookingsPage() {
  let rows: AdminBookingRow[] = [];
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
    <main className="container-content admin-page">
      <div className="admin-page-head">
        <div>
          <h1 className="page-h1">Bookings</h1>
          <p className="sub muted">
            Every booking on the platform. Confirm or reject pending requests
            inline.
          </p>
        </div>
      </div>

      <DataView status={dataStatus} emptyMessage="No bookings yet.">
        <BookingsTable rows={rows} />
      </DataView>
    </main>
  );
}
