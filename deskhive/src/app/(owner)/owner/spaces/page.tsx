import Link from 'next/link';
import { SquarePen } from 'lucide-react';
import { requireSession } from '@/lib/auth/guards';
import { listSpacesForOwner } from '@/db/queries/spaces';
import {
  getActiveDeskCountBySpaceIds,
  getMinActiveDailyPriceCentsBySpaceIds,
} from '@/db/queries/desks';
import { DataView } from '@/components/data-view';
import { formatCents } from '@/lib/format';

// Story 7-5 + DESIGN-INT-7: SPACE_OWNER spaces table. Mirrors the
// prototype's HostSpaces shape — Space (photo + name) / City / Desks /
// Day rate / Status / Edit. Owner-scoped via listSpacesForOwner (BA
// Decision §2 — SQL WHERE is the authoritative filter; (owner)/layout
// is first-line-of-defense role guard).
//
// Two aggregate queries (active-desk-count + min-daily-price) keep the
// table to 3 DB round-trips total regardless of space count.
export default async function OwnerSpacesPage() {
  const session = await requireSession();
  const ownerId = String(session.user.id);

  const spaces = await listSpacesForOwner(ownerId);
  const spaceIds = spaces.map((s) => s.id);
  const [deskCounts, minPrices] = await Promise.all([
    getActiveDeskCountBySpaceIds(spaceIds),
    getMinActiveDailyPriceCentsBySpaceIds(spaceIds),
  ]);

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
                <th style={{ width: '36%' }}>Space</th>
                <th style={{ width: '20%' }}>City</th>
                <th className="num" style={{ width: '8%' }}>Desks</th>
                <th className="num" style={{ width: '12%' }}>Day rate</th>
                <th style={{ width: '12%' }}>Status</th>
                <th className="action"></th>
              </tr>
            </thead>
            <tbody>
              {spaces.map((s) => {
                const desks = deskCounts.get(s.id) ?? 0;
                const minPrice = minPrices.get(s.id);
                const statusClass =
                  s.status === 'PUBLISHED'
                    ? 'badge-confirmed'
                    : s.status === 'DRAFT'
                      ? 'badge-pending'
                      : 'badge-cancelled';
                const statusLabel =
                  s.status === 'PUBLISHED'
                    ? 'Published'
                    : s.status === 'DRAFT'
                      ? 'Draft'
                      : 'Suspended';
                return (
                  <tr
                    key={s.id}
                    className="clickable"
                    onClick={undefined}
                    data-testid={`owner-space-row-${s.id}`}
                  >
                    <td>
                      <Link
                        href={`/owner/spaces/${s.id}`}
                        style={{
                          textDecoration: 'none',
                          color: 'inherit',
                          display: 'block',
                        }}
                      >
                        <div className="cell-primary">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={s.primaryImageUrl}
                            alt=""
                            className="cell-img"
                          />
                          <div className="cell-stack">
                            <span className="top">{s.name}</span>
                            <span className="sub cell-id">
                              {s.id.slice(0, 8)}
                            </span>
                          </div>
                        </div>
                      </Link>
                    </td>
                    <td className="muted">{s.city}</td>
                    <td className="num tnum">{desks}</td>
                    <td className="num tnum">
                      {minPrice != null ? formatCents(minPrice) : '—'}
                    </td>
                    <td>
                      <span className={`badge ${statusClass}`}>
                        <span className="dot" aria-hidden="true" />
                        {statusLabel}
                      </span>
                    </td>
                    <td className="action">
                      {/* DESIGN-INT-GAPS-PASS-2 R3 Gap D — Lucide
                          SquarePen matches prototype Icon.Edit's SVG
                          path verbatim (DeskHive_Prototype.html
                          line 62). Size 14 matches the existing
                          .btn-sm scale. */}
                      <Link
                        href={`/owner/spaces/${s.id}`}
                        className="btn btn-secondary btn-sm"
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '0.375rem',
                        }}
                      >
                        <SquarePen size={14} aria-hidden="true" />
                        Edit
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </DataView>
    </main>
  );
}
