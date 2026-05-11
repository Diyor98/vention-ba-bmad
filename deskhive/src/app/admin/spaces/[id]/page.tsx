import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getSpaceById } from '@/db/queries/spaces';
import { listDesksForSpace } from '@/db/queries/desks';
import { DataView } from '@/components/data-view';
import { EditSpaceForm } from './edit-space-form';
import { EditDeskForm } from './edit-desk-form';
import { AddDeskForm } from './add-desk-form';

// Guarded by src/app/admin/layout.tsx — Super Admin only.
// Story 5-2 reskin: 07-admin-space-edit.html — breadcrumbs, meta strip,
// .form-card wrappers around the existing Edit Space form and the desks
// section. The desk admin rows use .desk-admin-row grid (admin.css).
export default async function EditSpacePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const space = await getSpaceById(id);
  if (!space) notFound();

  const desks = await listDesksForSpace(id);

  return (
    <main className="container-content admin-page">
      <nav className="crumbs" aria-label="Breadcrumb">
        <Link href="/admin/spaces">Spaces</Link>
        <span className="sep">/</span>
        <span style={{ color: 'var(--color-neutral-700)' }}>{space.name}</span>
      </nav>

      <div className="admin-page-head">
        <div>
          <h1 className="page-h1">{space.name}</h1>
          <div className="meta-strip mt-2">
            <span className="meta-item">
              <span className="cell-id">{space.id.slice(0, 12)}</span>
            </span>
            <span className="sep" aria-hidden="true"></span>
            <span className="meta-item">
              <strong>{desks.length}</strong> desks
            </span>
            <span className="sep" aria-hidden="true"></span>
            <span className="meta-item">
              Status <strong>{space.status}</strong>
            </span>
          </div>
        </div>
      </div>

      <section className="form-card">
        <div className="form-card-head">
          <div>
            <h2>Details</h2>
            <p className="sub">
              Public information shown on the space detail page.
            </p>
          </div>
        </div>
        <div className="form-card-body">
          <EditSpaceForm space={space} />
        </div>
      </section>

      <section className="form-card">
        <div className="form-card-head">
          <div>
            <h2>Desks</h2>
            <p className="sub">
              Bookable desks inside this space. Deactivated desks stay in
              history but won&apos;t appear to guests.
            </p>
          </div>
        </div>

        <DataView
          status={desks.length === 0 ? 'empty' : 'loaded'}
          emptyMessage="No desks in this space yet."
        >
          <div
            className="desk-admin-row"
            style={{
              background: 'var(--color-neutral-50)',
              borderBottom: '1px solid var(--color-border)',
              paddingTop: '0.5rem',
              paddingBottom: '0.5rem',
            }}
          >
            <span
              style={{
                fontSize: '11px',
                fontWeight: 600,
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
                color: 'var(--color-neutral-500)',
              }}
            >
              #
            </span>
            <span
              style={{
                fontSize: '11px',
                fontWeight: 600,
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
                color: 'var(--color-neutral-500)',
              }}
            >
              Label
            </span>
            <span
              style={{
                fontSize: '11px',
                fontWeight: 600,
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
                color: 'var(--color-neutral-500)',
              }}
            >
              Price / day
            </span>
            <span
              style={{
                fontSize: '11px',
                fontWeight: 600,
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
                color: 'var(--color-neutral-500)',
              }}
            >
              Status
            </span>
            <span></span>
            <span></span>
          </div>

          {desks.map((d, idx) => (
            <EditDeskForm key={d.id} desk={d} index={idx} />
          ))}
        </DataView>

        <AddDeskForm spaceId={space.id} />
      </section>
    </main>
  );
}
