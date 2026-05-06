import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getSpaceById } from '@/db/queries/spaces';
import { listDesksForSpace } from '@/db/queries/desks';
import { DataView } from '@/components/data-view';
import { formatCents } from '@/lib/format';
import { EditSpaceForm } from './edit-space-form';
import { AddDeskForm } from './add-desk-form';

// Guarded by src/app/admin/layout.tsx — Super Admin only.
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
    <main className="mx-auto max-w-2xl p-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Edit Space</h1>
        <Link
          href="/admin/spaces"
          className="text-sm text-gray-700 hover:underline"
        >
          Back to spaces
        </Link>
      </div>
      <EditSpaceForm space={space} />

      <hr className="my-8 border-gray-200" />

      <h2 className="mb-4 text-xl font-semibold">Desks</h2>
      <DataView
        status={desks.length === 0 ? 'empty' : 'loaded'}
        emptyMessage="No desks in this space yet."
      >
        <ul className="mb-6">
          {desks.map((d) => (
            <li
              key={d.id}
              className="flex items-center justify-between border-b border-gray-200 py-3 text-sm"
            >
              <span className="font-medium">{d.label}</span>
              <span className="text-gray-700">{formatCents(d.dailyPriceCents)}</span>
              <span className={d.isActive ? 'text-green-700' : 'text-gray-500'}>
                {d.isActive ? 'Active' : 'Inactive'}
              </span>
            </li>
          ))}
        </ul>
      </DataView>

      <h3 className="mb-2 text-base font-semibold">Add desk</h3>
      <AddDeskForm spaceId={space.id} />
    </main>
  );
}
