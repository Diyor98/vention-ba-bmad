import { requireSession } from '@/lib/auth/guards';
import { listBookingsForOwner } from '@/db/queries/bookings';
import { DataView, type DataViewStatus } from '@/components/data-view';
import { logger } from '@/lib/logger';
import {
  OwnerBookingsTable,
  type OwnerBookingRow,
  type OwnerFilterValue,
} from './owner-bookings-table';

// Story 7-5: SPACE_OWNER bookings queue. Owner-scoped via
// listBookingsForOwner (Decision §6). Inline Confirm/Reject reuses the
// Phase 1 button components, which submit to the Story 7-5-extended
// Server Actions (role-branched scope, Decision §8).
//
// `searchParams.filter` honors the /owner dashboard's "Pending bookings"
// stat card link (`?filter=pending`). Default: ALL.
function normalizeFilter(raw: unknown): OwnerFilterValue {
  if (typeof raw !== 'string') return 'ALL';
  switch (raw.toLowerCase()) {
    case 'pending':
      return 'PENDING';
    case 'confirmed':
      return 'CONFIRMED';
    case 'rejected':
      return 'REJECTED';
    case 'cancelled':
      return 'CANCELLED';
    default:
      return 'ALL';
  }
}

export default async function OwnerBookingsPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  const { filter } = await searchParams;
  const initialFilter = normalizeFilter(filter);

  const session = await requireSession();
  const ownerId = String(session.user.id);

  let rows: OwnerBookingRow[] = [];
  let dataStatus: DataViewStatus = 'loaded';
  try {
    rows = await listBookingsForOwner(ownerId);
    if (rows.length === 0) dataStatus = 'empty';
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error('owner_bookings_page_failed', { error: msg });
    dataStatus = 'error';
  }

  return (
    <main className="container-content admin-page">
      <div className="admin-page-head">
        <div>
          <h1 className="page-h1">Bookings</h1>
          <p className="sub muted">Bookings on your spaces.</p>
        </div>
      </div>

      <DataView
        status={dataStatus}
        emptyMessage="No bookings yet. Your spaces will show bookings here once Guests book them."
      >
        <OwnerBookingsTable rows={rows} initialFilter={initialFilter} />
      </DataView>
    </main>
  );
}
