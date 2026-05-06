import { CreateSpaceForm } from './create-space-form';

// Guarded by src/app/admin/layout.tsx — Super Admin only.
export default function NewSpacePage() {
  return (
    <main className="mx-auto max-w-2xl p-8">
      <h1 className="mb-6 text-2xl font-semibold">Create Space</h1>
      <CreateSpaceForm />
    </main>
  );
}
