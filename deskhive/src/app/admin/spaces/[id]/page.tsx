import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getSpaceById } from '@/db/queries/spaces';
import { listDesksForSpace } from '@/db/queries/desks';
import { DataView } from '@/components/data-view';
import { EditSpaceForm } from './edit-space-form';
import { EditDeskForm } from './edit-desk-form';
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
    <main
      className="container-narrow"
      style={{ paddingTop: '2.5rem', paddingBottom: '4rem' }}
    >
      <div className="mb-6 flex items-center justify-between">
        <h1 className="page-h1">Edit Space</h1>
        <Link href="/admin/spaces" className="nav-link">
          Back to spaces
        </Link>
      </div>
      <EditSpaceForm space={space} />

      <hr className="rule" style={{ margin: '2rem 0' }} />

      <h2 className="h2 mb-4">Desks</h2>
      <DataView
        status={desks.length === 0 ? 'empty' : 'loaded'}
        emptyMessage="No desks in this space yet."
      >
        <div className="mb-6">
          {desks.map((d) => (
            <EditDeskForm key={d.id} desk={d} />
          ))}
        </div>
      </DataView>

      <h3
        className="mb-2"
        style={{ fontSize: '14px', fontWeight: 600 }}
      >
        Add desk
      </h3>
      <AddDeskForm spaceId={space.id} />
    </main>
  );
}
