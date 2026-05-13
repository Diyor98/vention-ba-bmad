import Link from 'next/link';
import { CreateSpaceForm } from '@/app/admin/spaces/new/create-space-form';

// Story 7-5: SPACE_OWNER create-space page. Reuses the Phase 1
// <CreateSpaceForm> with `variant="owner"` (BA Decision §3) — the action
// stamps owner_id, the success-effect fires the SPACE_CREATED toast and
// pushes to /owner/spaces/[new_id] so the owner immediately adds desks.
//
// Role guard: (owner)/layout.tsx already enforces SPACE_OWNER-only access.
export default function OwnerNewSpacePage() {
  return (
    <main
      className="container-narrow"
      style={{ paddingTop: '2.5rem', paddingBottom: '4rem' }}
    >
      <nav className="crumbs" aria-label="Breadcrumb" style={{ marginBottom: '1rem' }}>
        <Link href="/owner/spaces">My spaces</Link>
        <span className="sep">/</span>
        <span style={{ color: 'var(--color-neutral-700)' }}>Create</span>
      </nav>
      <h1 className="page-h1 mb-6">Create space</h1>
      <CreateSpaceForm variant="owner" />
    </main>
  );
}
