import Link from 'next/link';
import { CreateSpaceForm } from '@/app/admin/spaces/new/create-space-form';

/**
 * Story 7-5 + DESIGN-INT-10: SPACE_OWNER create-space page wrapped in
 * the prototype's wizard chrome. The current backend splits space
 * creation from desk creation across two server actions; the prototype's
 * fully-client-side 4-step wizard would require deferring submission +
 * batching desk inserts client-side, which is a significant refactor
 * out of "visual restyle only" scope.
 *
 * Pragmatic shape: render the wizard stepper at the top of the page
 * showing the user's current position (Step 1: Basics), then the
 * existing single-form CreateSpaceForm below. Steps 2-4 (Desks /
 * Photos / Publish) are advisory — clicking Continue lands the user
 * on the existing edit page where desks are added one at a time.
 *
 * Documented judgment call: visual stepper > true client-side wizard
 * for this iteration. Future story may unify create + desks into one
 * client-side state machine.
 *
 * Role guard: (owner)/layout.tsx already enforces SPACE_OWNER-only.
 */
const STEPS = [
  { n: 1, label: 'Basics', active: true },
  { n: 2, label: 'Desks', active: false },
  { n: 3, label: 'Photos', active: false },
  { n: 4, label: 'Publish', active: false },
] as const;

export default function OwnerNewSpacePage() {
  return (
    <main
      className="container-content"
      style={{ paddingTop: '2.5rem', paddingBottom: '4rem', maxWidth: '64rem' }}
    >
      <Link
        href="/owner/spaces"
        className="crumbs"
        aria-label="Back"
        style={{
          marginBottom: '1rem',
          display: 'inline-flex',
          alignItems: 'center',
          gap: '0.375rem',
          fontSize: 13,
          color: 'var(--color-neutral-500)',
          textDecoration: 'none',
        }}
      >
        ← Back to my spaces
      </Link>
      <h1 className="page-h1" style={{ marginBottom: '0.25rem' }}>
        List a new space
      </h1>
      <p className="muted-strong" style={{ fontSize: 14, marginBottom: '1.5rem' }}>
        Four steps. About 5 minutes.
      </p>

      {/* DESIGN-INT-10 — visual stepper. Step 1 active (this page);
          remaining steps are visited from the edit page after create. */}
      <ol
        aria-label="Create space progress"
        data-testid="create-space-stepper"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          listStyle: 'none',
          padding: 0,
          margin: '0 0 1.5rem',
        }}
      >
        {STEPS.map((s, i) => (
          <li
            key={s.n}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
            }}
          >
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.5rem',
                padding: '0.375rem 0.625rem',
                borderRadius: 'var(--radius-lg)',
                fontSize: 13,
                fontWeight: 500,
                color: s.active
                  ? 'var(--color-brand-700)'
                  : 'var(--color-neutral-500)',
                background: s.active ? 'var(--color-brand-50)' : 'transparent',
              }}
            >
              <span
                aria-hidden="true"
                style={{
                  width: 20,
                  height: 20,
                  borderRadius: 9999,
                  display: 'grid',
                  placeItems: 'center',
                  fontSize: 11,
                  fontWeight: 600,
                  color: s.active ? '#ffffff' : 'var(--color-neutral-600)',
                  background: s.active
                    ? 'var(--color-primary)'
                    : 'var(--color-neutral-100)',
                }}
              >
                {s.n}
              </span>
              {s.label}
            </span>
            {i < STEPS.length - 1 && (
              <span
                aria-hidden="true"
                style={{ color: 'var(--color-neutral-300)' }}
              >
                /
              </span>
            )}
          </li>
        ))}
      </ol>

      <section className="form-card">
        <div className="form-card-head">
          <h2>Basics</h2>
          <p className="sub">
            Save this step to land on Step 2 — Desks &amp; rates.
          </p>
        </div>
        <div className="form-card-body">
          <CreateSpaceForm variant="owner" />
        </div>
      </section>

      <p
        className="muted"
        style={{
          fontSize: 12,
          textAlign: 'center',
          marginTop: '1rem',
        }}
      >
        Steps 2–4 unlock after you save Basics. Your space stays in Draft
        until you click Publish on the detail page.
      </p>
    </main>
  );
}
