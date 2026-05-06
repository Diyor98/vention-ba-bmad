import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireSession, requireRole, AuthError } from '@/lib/auth/guards';
import { listAllSpaces } from '@/db/queries/spaces';
import { DataView } from '@/components/data-view';

export default async function AdminSpacesPage() {
  try {
    const session = await requireSession();
    requireRole(session, 'SUPER_ADMIN');
  } catch (err) {
    if (err instanceof AuthError) {
      // Defense-in-depth: middleware also handles the unauth case at the edge,
      // but if it ever misses (e.g. cookie present but invalid) we send 401
      // → /login and 403 → / (Guest accessing admin) per AC-5.
      if (err.response.status === 401) redirect('/login');
      redirect('/');
    }
    throw err;
  }

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
            <li key={s.id} className="border-b border-gray-200 py-3">
              <div className="font-medium">{s.name}</div>
              <div className="text-sm text-gray-600">{s.city}</div>
            </li>
          ))}
        </ul>
      </DataView>
    </main>
  );
}
