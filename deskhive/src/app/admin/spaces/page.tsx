import Link from 'next/link';
import { listAllSpaces } from '@/db/queries/spaces';
import { DataView } from '@/components/data-view';

// Guarded by src/app/admin/layout.tsx — Super Admin only.
// Story 5-2 reskin: table layout (06-admin-spaces.html). Each row links
// to /admin/spaces/[id] via the existing Space Edit page. Phase 1 has no
// "active/inactive" desk-aggregate column or 30d booking count column —
// the design HTML shows them as mock data; real implementation deferred.
export default async function AdminSpacesPage() {
  const spaces = await listAllSpaces();

  return (
    <main className="container-content admin-page">
      <div className="admin-page-head">
        <div>
          <h1 className="page-h1">Spaces</h1>
          <p className="sub muted">
            Coworking locations available for booking. Click a row to manage
            details and desks.
          </p>
        </div>
        <div className="admin-actions">
          <Link href="/admin/spaces/new" className="btn btn-primary btn-sm">
            New space
          </Link>
        </div>
      </div>

      <DataView
        status={spaces.length === 0 ? 'empty' : 'loaded'}
        emptyMessage="No spaces available yet."
      >
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th style={{ width: '44%' }}>Space</th>
                <th style={{ width: '20%' }}>City</th>
                <th style={{ width: '14%' }}>Status</th>
                <th style={{ width: '14%' }}>Updated</th>
                <th className="action"></th>
              </tr>
            </thead>
            <tbody>
              {spaces.map((s) => (
                <tr key={s.id}>
                  <td>
                    <Link
                      href={`/admin/spaces/${s.id}`}
                      style={{ textDecoration: 'none', color: 'inherit' }}
                    >
                      <div className="cell-primary">
                        <div className="cell-stack">
                          <span className="top">{s.name}</span>
                          <span className="sub cell-id">{s.id.slice(0, 8)}</span>
                        </div>
                      </div>
                    </Link>
                  </td>
                  <td className="muted">{s.city}</td>
                  <td>
                    {s.status === 'PUBLISHED' ? (
                      <span className="badge badge-confirmed">
                        <span className="dot"></span>Active
                      </span>
                    ) : (
                      <span className="badge badge-cancelled">
                        <span className="dot"></span>Inactive
                      </span>
                    )}
                  </td>
                  <td className="muted tnum">
                    {new Date(s.updatedAt).toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                      timeZone: 'UTC',
                    })}
                  </td>
                  <td className="action">
                    <Link
                      href={`/admin/spaces/${s.id}`}
                      className="btn btn-secondary btn-sm"
                    >
                      Edit
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </DataView>
    </main>
  );
}
