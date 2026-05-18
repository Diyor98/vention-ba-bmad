import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { requireSession } from '@/lib/auth/guards';
import { getSpaceByIdForOwner } from '@/db/queries/spaces';
import { getConnectAccountByUserId } from '@/db/queries/stripe-connect';
import { listDesksForSpace } from '@/db/queries/desks';
import { DataView } from '@/components/data-view';
import { EditSpaceForm } from '@/app/admin/spaces/[id]/edit-space-form';
import { EditDeskForm } from '@/app/admin/spaces/[id]/edit-desk-form';
import { AddDeskForm } from '@/app/admin/spaces/[id]/add-desk-form';
import { PublishSpaceButton } from './publish-space-button';

// Same UUID regex used across Phase 1.
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Story 7-5: SPACE_OWNER edit page. Mirrors /admin/spaces/[id] structure
// exactly — the only differences are:
//   1. Owner-scoped DB read via getSpaceByIdForOwner (returns undefined
//      when the row isn't owned by the caller — same response shape as a
//      genuinely-missing row, NOT_FOUND-not-FORBIDDEN leak prevention per
//      Decision §8).
//   2. Cross-tenant access soft-redirects to /owner/spaces (route-layer
//      first line of defense per Decision §5). The Server Action layer
//      re-verifies authoritatively (AC-8 / AC-9 in the story file).
//   3. <EditSpaceForm variant="owner"> navigates to /owner/spaces on
//      success instead of /admin/spaces.
// Desks section reuses the Phase 1 <AddDeskForm> + <EditDeskForm>
// Client Components without changes — those don't redirect; they just
// revalidate the current page.
export default async function OwnerEditSpacePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();

  const session = await requireSession();
  const ownerId = String(session.user.id);

  // Story 9-2b: parallel-fetch the owner's Connect row so we can decide
  // whether to enable the Publish button (only relevant when the space is
  // DRAFT, but parallelizing keeps the page render cheap either way).
  const [space, connectRow] = await Promise.all([
    getSpaceByIdForOwner(id, ownerId),
    getConnectAccountByUserId(ownerId),
  ]);

  if (!space) {
    // Decision §5: soft-redirect rather than 404 — same UX as Story 6-2's
    // role-mismatch pattern. Avoids leaking row existence to other owners.
    redirect('/owner/spaces');
  }

  const desks = await listDesksForSpace(id);
  const canPublish = Boolean(
    connectRow && connectRow.chargesEnabled && connectRow.payoutsEnabled,
  );

  return (
    <main className="container-content admin-page">
      <nav className="crumbs" aria-label="Breadcrumb">
        <Link href="/owner/spaces">My spaces</Link>
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
              Status{' '}
              {space.status === 'DRAFT' ? (
                <span
                  className="badge badge-pending"
                  style={{ marginLeft: '0.25rem' }}
                >
                  <span className="dot" aria-hidden="true" />
                  Draft
                </span>
              ) : (
                <strong>{space.status}</strong>
              )}
            </span>
          </div>
        </div>
      </div>

      {/* Story 9-2b: Publish CTA — only on DRAFT spaces. Gated by Connect
          state (canPublish). When PUBLISHED or SUSPENDED, render nothing. */}
      {space.status === 'DRAFT' && (
        <section className="form-card">
          <div className="form-card-head">
            <div>
              <h2>Publish space</h2>
              <p className="sub">
                {canPublish
                  ? 'Make this space visible on DeskHive so guests can book it.'
                  : 'Finish Stripe Connect onboarding in Settings before publishing.'}
              </p>
            </div>
            <div className="admin-actions">
              <PublishSpaceButton spaceId={space.id} canPublish={canPublish} />
            </div>
          </div>
        </section>
      )}

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
          <EditSpaceForm space={space} variant="owner" />
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
