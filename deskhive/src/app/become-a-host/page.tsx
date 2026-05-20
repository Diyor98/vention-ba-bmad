import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireSession, AuthError } from '@/lib/auth/guards';
import { findPendingForUser } from '@/db/queries/applications';
import { ApplicationForm } from './application-form';
import type { Application } from '@/db/schema';

/**
 * Story 7-3: Become a Space Owner landing page.
 *
 * Server Component with audience-aware state branching:
 *   E. Unauthenticated      → redirect('/login?callbackUrl=/become-a-host')
 *   D. SUPER_ADMIN          → "Admins can't apply to host"
 *   C. SPACE_OWNER          → "You're already a Space Owner" + link to /owner
 *   B. Guest with PENDING   → "Application under review" + read-only summary
 *   A. Guest, no pending    → value props + What's next + <ApplicationForm>
 *
 * The form itself lives in a Client Component (application-form.tsx) because
 * it needs useActionState + useFormStatus + the post-submit toast/router
 * effect. Phase 1's locked Server-reads-state / Client-handles-form split.
 *
 * Execution order: auth → role → pending lookup. Matches Story 6-2's locked
 * pattern from memory `reference_role_specific_nav_pattern.md`.
 */
export default async function BecomeAHostPage() {
  let session;
  try {
    session = await requireSession();
  } catch (err) {
    if (err instanceof AuthError) {
      // State E. Use callbackUrl (Phase 1 convention from US-3.3), NOT
      // redirect= per the BA doc clarification at the top of the story file.
      redirect('/login?callbackUrl=/become-a-host');
    }
    throw err;
  }

  const role = (session.user as { role?: string }).role;
  const displayName =
    typeof session.user.name === 'string' && session.user.name.trim().length > 0
      ? session.user.name
      : session.user.email;
  const email = session.user.email;

  // State D — SUPER_ADMIN.
  if (role === 'SUPER_ADMIN') {
    return (
      <main className="container-content" style={{ paddingTop: '3rem', paddingBottom: '4rem' }}>
        <header className="mb-6">
          <h1 className="page-h1">Admins can&apos;t apply to host</h1>
          <p className="mt-2 muted-strong" style={{ fontSize: '14px' }}>
            Super admins operate the DeskHive platform — they don&apos;t list
            their own spaces. The Space Owner role is for independent
            coworking operators.
          </p>
        </header>
        <p className="muted" style={{ fontSize: '14px' }}>
          Manage the platform from{' '}
          <Link href="/admin/spaces" style={{ color: 'var(--color-primary)' }}>
            Admin → Spaces
          </Link>
          .
        </p>
      </main>
    );
  }

  // State C — SPACE_OWNER.
  if (role === 'SPACE_OWNER') {
    return (
      <main className="container-content" style={{ paddingTop: '3rem', paddingBottom: '4rem' }}>
        <header className="mb-6">
          <h1 className="page-h1">You&apos;re already a Space Owner</h1>
          <p className="mt-2 muted-strong" style={{ fontSize: '14px' }}>
            Manage your spaces and bookings from your dashboard.
          </p>
        </header>
        <Link href="/owner" className="btn btn-primary">
          Go to Dashboard
        </Link>
      </main>
    );
  }

  // States A + B — Guest (or unknown role; treated as Guest).
  const pending = await findPendingForUser(String(session.user.id));

  if (pending) {
    return <PendingState application={pending} />;
  }

  // DESIGN-INT-GAPS-PASS-2 Gap 3 — two-column application form
  // matching prototype DeskHive_Prototype.html lines 1542-1591.
  // Replaces the pre-pass-2 marketing landing (value tiles + process
  // steps + form below). Pre-pass-2 ValueTile/ProcessStep helpers
  // removed (no other caller).
  return (
    <main
      className="container-content"
      style={{ paddingTop: '2.5rem', paddingBottom: '4rem', maxWidth: '64rem' }}
    >
      <header className="mb-8">
        <h1 className="page-h1" data-testid="become-host-h1">
          Earn from your unused desks
        </h1>
        <p
          className="mt-2 muted-strong"
          style={{ fontSize: '15px', maxWidth: '40rem', lineHeight: 1.55 }}
        >
          List your space on DeskHive. We take 15% per booking — you
          keep the rest. Approval typically within 2 business days.
        </p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <section
          className="card md:col-span-2"
          style={{ padding: '1.5rem' }}
          aria-labelledby="sec-application"
          data-testid="application-card"
        >
          <h2
            id="sec-application"
            style={{
              fontSize: '13px',
              fontWeight: 600,
              color: 'var(--color-neutral-900)',
              marginBottom: '1rem',
            }}
          >
            Application
          </h2>
          <ApplicationForm displayName={displayName} email={email} />
        </section>

        <aside
          className="card"
          style={{ padding: '1.5rem' }}
          aria-labelledby="sec-whats-next"
          data-testid="whats-next-card"
        >
          <h2
            id="sec-whats-next"
            style={{
              fontSize: '13px',
              fontWeight: 600,
              color: 'var(--color-neutral-900)',
              marginBottom: '1rem',
            }}
          >
            What happens next
          </h2>
          <NextStepsList />
        </aside>
      </div>
    </main>
  );
}

function NextStepsList() {
  // Prototype lines 1574-1588 — vertical step list with a 1px left
  // border, dots inline-left at each step; first dot indigo-600,
  // rest neutral-300. Step copy taken verbatim from the prototype.
  const steps: Array<{ title: string; sub: string }> = [
    { title: 'You apply', sub: 'Today · 2 minutes' },
    { title: 'We review', sub: 'Within 2 business days' },
    { title: 'Connect Stripe', sub: 'One-time, ~5 min' },
    { title: 'List your first space', sub: 'Photos & rates' },
    { title: 'First booking', sub: 'Money lands in your bank' },
  ];
  return (
    <ol
      style={{
        position: 'relative',
        borderLeft: '1px solid var(--color-neutral-200)',
        marginLeft: '0.5rem',
        paddingLeft: '0',
        listStyle: 'none',
      }}
    >
      {steps.map((s, i) => (
        <li
          key={s.title}
          style={{
            position: 'relative',
            marginLeft: '1rem',
            paddingBottom: i === steps.length - 1 ? 0 : '1rem',
          }}
        >
          <span
            aria-hidden="true"
            style={{
              position: 'absolute',
              left: '-1.3125rem',
              top: '0.3rem',
              width: '10px',
              height: '10px',
              borderRadius: '999px',
              background:
                i === 0
                  ? 'var(--color-primary)'
                  : 'var(--color-neutral-300)',
            }}
          />
          <div
            style={{
              fontSize: 14,
              fontWeight: 500,
              color: 'var(--color-neutral-900)',
            }}
          >
            {s.title}
          </div>
          <div
            style={{ fontSize: 12, color: 'var(--color-neutral-500)' }}
          >
            {s.sub}
          </div>
        </li>
      ))}
    </ol>
  );
}

function PendingState({ application }: { application: Application }) {
  // Story 7-3: State B. Date formatted as UTC for SSR/hydration stability
  // (Story 5-2's date-format pattern). White-space: pre-wrap preserves the
  // multi-line businessAddress on display.
  const submittedAt = new Intl.DateTimeFormat('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(application.createdAt);

  return (
    <main className="container-content" style={{ paddingTop: '3rem', paddingBottom: '4rem' }}>
      <header className="mb-6">
        <h1 className="page-h1">Application under review</h1>
        <p className="mt-2 muted-strong" style={{ fontSize: '14px' }}>
          Submitted on {submittedAt}.
        </p>
      </header>

      <section aria-labelledby="sec-summary" className="mb-8">
        <h2 id="sec-summary" className="h2 mb-4">
          What you submitted
        </h2>
        <dl style={{ display: 'grid', gap: '0.875rem' }}>
          {/* DESIGN-INT-GAPS-PASS-2 Gap 3 — labels match the new form
              copy ("Space name" / "City" / "Tell us about your space")
              so the read-back is consistent with what the user typed.
              Tax ID hidden — captured during Stripe Connect onboarding,
              not surfaced to the applicant. */}
          <SummaryRow label="Space name" value={application.businessName} />
          <SummaryRow
            label="City"
            value={application.businessAddress}
            multiline
          />
          {application.motivation && (
            <SummaryRow
              label="Tell us about your space"
              value={application.motivation}
              multiline
            />
          )}
        </dl>
      </section>

      <p className="muted" style={{ fontSize: '14px' }}>
        We&apos;ll let you know via email when the review is complete. Reviews
        typically take 1–2 business days.
      </p>
    </main>
  );
}

function SummaryRow({
  label,
  value,
  multiline,
}: {
  label: string;
  value: string;
  multiline?: boolean;
}) {
  return (
    <div>
      <dt className="field-label">{label}</dt>
      <dd
        className="muted-strong"
        style={{
          fontSize: '14px',
          whiteSpace: multiline ? 'pre-wrap' : 'normal',
          margin: 0,
        }}
      >
        {value}
      </dd>
    </div>
  );
}
