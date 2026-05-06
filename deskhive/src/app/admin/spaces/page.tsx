import Link from 'next/link';
import { listAllSpaces } from '@/db/queries/spaces';
import { DataView } from '@/components/data-view';

// Guarded by src/app/admin/layout.tsx — Super Admin only.
export default async function AdminSpacesPage() {
  const spaces = await listAllSpaces();

  return (
    <main className="mx-auto max-w-4xl p-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Spaces</h1>
        <Link
          href="/admin/spaces/new"
          className="rounded bg-gray-900 px-4 py-2 text-sm font-medium text-white"
        >
          New Space
        </Link>
      </div>

      <DataView
        status={spaces.length === 0 ? 'empty' : 'loaded'}
        emptyMessage="No spaces available yet."
      >
        <ul>
          {spaces.map((s) => (
            <li key={s.id} className="border-b border-gray-200">
              <Link
                href={`/admin/spaces/${s.id}`}
                className="block py-3 hover:bg-gray-50"
              >
                <div className="font-medium">{s.name}</div>
                <div className="text-sm text-gray-600">{s.city}</div>
              </Link>
            </li>
          ))}
        </ul>
      </DataView>
    </main>
  );
}
