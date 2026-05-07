import Link from 'next/link';
import { listAllSpaces } from '@/db/queries/spaces';
import { DataView } from '@/components/data-view';

// Guarded by src/app/admin/layout.tsx — Super Admin only.
export default async function AdminSpacesPage() {
  const spaces = await listAllSpaces();

  return (
    <main
      className="container-content"
      style={{ paddingTop: '2.5rem', paddingBottom: '4rem' }}
    >
      <div className="mb-6 flex items-center justify-between">
        <h1 className="page-h1">Spaces</h1>
        <Link href="/admin/spaces/new" className="btn btn-primary btn-sm">
          New Space
        </Link>
      </div>

      <DataView
        status={spaces.length === 0 ? 'empty' : 'loaded'}
        emptyMessage="No spaces available yet."
      >
        <ul>
          {spaces.map((s) => (
            <li
              key={s.id}
              style={{ borderBottom: '1px solid var(--color-border)' }}
            >
              <Link
                href={`/admin/spaces/${s.id}`}
                className="block"
                style={{
                  padding: '0.75rem 0.25rem',
                  textDecoration: 'none',
                  color: 'inherit',
                }}
              >
                <div className="font-medium">{s.name}</div>
                <div className="muted" style={{ fontSize: '13px' }}>
                  {s.city}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      </DataView>
    </main>
  );
}
