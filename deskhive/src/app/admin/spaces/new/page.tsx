import { CreateSpaceForm } from './create-space-form';

// Guarded by src/app/admin/layout.tsx — Super Admin only.
export default function NewSpacePage() {
  return (
    <main
      className="container-narrow"
      style={{ paddingTop: '2.5rem', paddingBottom: '4rem' }}
    >
      <h1 className="page-h1 mb-6">Create Space</h1>
      <CreateSpaceForm />
    </main>
  );
}
