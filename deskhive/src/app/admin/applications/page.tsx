import { listAllApplications } from '@/db/queries/applications';
import {
  ApplicationsTable,
  type AdminApplicationRow,
} from './applications-table';

// Story 7-4: admin applications list. Auth + SUPER_ADMIN soft-redirect
// comes from src/app/admin/layout.tsx (Phase 1 pattern locked since
// Story 6-2's memory `reference_role_specific_nav_pattern.md`).
//
// Server Component reads rows; <ApplicationsTable> Client Component
// owns filter chips + sort state (mirrors /admin/bookings).
export default async function AdminApplicationsPage() {
  const rows: AdminApplicationRow[] = await listAllApplications();

  return (
    <main className="container-content admin-page">
      <div className="admin-page-head">
        <div>
          <h1 className="page-h1">Applications</h1>
          <p className="sub muted">
            Review and approve Space Owner applications.
          </p>
        </div>
      </div>

      {rows.length === 0 ? (
        <p className="muted" style={{ fontSize: '14px' }}>
          No applications yet. Once Guests apply, they&apos;ll appear here.
        </p>
      ) : (
        <ApplicationsTable rows={rows} />
      )}
    </main>
  );
}
