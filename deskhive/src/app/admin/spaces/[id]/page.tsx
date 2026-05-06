import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getSpaceById } from '@/db/queries/spaces';
import { EditSpaceForm } from './edit-space-form';

// Guarded by src/app/admin/layout.tsx — Super Admin only.
export default async function EditSpacePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const space = await getSpaceById(id);
  if (!space) notFound();

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
    </main>
  );
}
