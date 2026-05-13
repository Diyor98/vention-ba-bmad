import Link from 'next/link';
import { requireSession } from '@/lib/auth/guards';
import { listSpacesForOwner } from '@/db/queries/spaces';
import { DataView } from '@/components/data-view';

// Story 7-5: SPACE_OWNER spaces-list. Owner-scoped via listSpacesForOwner
// (BA Decision §2 — SQL WHERE is the authoritative filter; (owner)/layout
// is first-line-of-defense role guard). Mirrors /admin/spaces table layout
// but filtered to spaces owned by the caller.
//
// No status filter chips (Decision §2) — Phase 2 auto-publishes all owner
// spaces (Decision §4). No sortable columns — admin parity. Default
// ordering: createdAt DESC.
export default async function OwnerSpacesPage() {
  // (owner)/layout.tsx has already enforced SPACE_OWNER; reading the
  // session here just to get the user id for the query.
  const session = await requireSession();
  const ownerId = String(session.user.id);

  const spaces = await listSpacesForOwner(ownerId);

  return (
    <main className="container-content admin-page">
      <div className="admin-page-head">
        <div>
          <h1 className="page-h1">My spaces</h1>
          <p className="sub muted">Spaces you host on DeskHive.</p>
        </div>
        <div className="admin-actions">
          <Link href="/owner/spaces/new" className="btn btn-primary btn-sm">
            New space
          </Link>
        </div>
      </div>

      <DataView
        status={spaces.length === 0 ? 'empty' : 'loaded'}
        emptyMessage="You haven't listed a space yet. Click “New space” to start hosting."
      >
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th style={{ width: '50%' }}>Space</th>
                <th style={{ width: '24%' }}>City</th>
                <th style={{ width: '14%' }}>Created</th>
                <th className="action"></th>
              </tr>
            </thead>
            <tbody>
              {spaces.map((s) => (
                <tr key={s.id}>
                  <td>
                    <Link
                      href={`/owner/spaces/${s.id}`}
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
                  <td className="muted tnum">
                    {new Date(s.createdAt).toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                      timeZone: 'UTC',
                    })}
                  </td>
                  <td className="action">
                    <Link
                      href={`/owner/spaces/${s.id}`}
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
