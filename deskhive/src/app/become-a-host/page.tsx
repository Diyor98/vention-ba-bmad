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

  return (
    <main className="container-content" style={{ paddingBottom: '4rem' }}>
      {/* DESIGN-INT-12 — eyebrow + display H1 + sub via .host-hero */}
      <section className="host-hero mb-8">
        <span className="eyebrow">
          <span className="dot" aria-hidden="true" /> DeskHive · host
        </span>
        <h1>Earn from unused desks in your coworking space.</h1>
        <p className="sub">
          List a space, accept bookings, get paid via Stripe. No
          subscription, no minimum commitment — leave whenever.
        </p>
      </section>

      <section aria-labelledby="sec-value-props" className="mb-10">
        <h2 id="sec-value-props" className="h2 mb-4">
          Why host on DeskHive
        </h2>
        <div className="value-grid">
          <ValueTile
            n="01"
            title="No long-term contracts"
            body="List a space, accept bookings, leave whenever."
          />
          <ValueTile
            n="02"
            title="15% platform fee"
            body="You keep 85% of every booking. Transparent pricing."
          />
          <ValueTile
            n="03"
            title="Get paid via Stripe"
            body="Direct deposit. Payouts processed automatically after each completed booking."
          />
          <ValueTile
            n="04"
            title="You control bookings"
            body="Review every request before it’s confirmed. Reject what doesn’t fit."
          />
        </div>
      </section>

      <section aria-labelledby="sec-whats-next" className="mb-10">
        <h2 id="sec-whats-next" className="h2 mb-4">
          What&apos;s next
        </h2>
        <div className="process">
          <ProcessStep
            n={1}
            title="Submit your application"
            body="Tell us about your space, location, and how many desks you can host."
            when="~5 minutes"
          />
          <ProcessStep
            n={2}
            title="We review"
            body="Our team verifies your details and checks the space against our standards."
            when="1–2 business days"
          />
          <ProcessStep
            n={3}
            title="We email you the decision"
            body="If approved, you’ll be onboarded onto Stripe Connect to start receiving payouts."
            when="Same day as review"
          />
        </div>
      </section>

      <section aria-labelledby="sec-form" className="mb-10">
        <h2 id="sec-form" className="h2 mb-4">
          Your application
        </h2>
        <ApplicationForm displayName={displayName} email={email} />
      </section>
    </main>
  );
}

function ValueTile({
  n,
  title,
  body,
}: {
  n: string;
  title: string;
  body: string;
}) {
  return (
    <article className="value-tile">
      <div className="num">{n}</div>
      <h3>{title}</h3>
      <p>{body}</p>
    </article>
  );
}

function ProcessStep({
  n,
  title,
  body,
  when,
}: {
  n: number;
  title: string;
  body: string;
  when: string;
}) {
  return (
    <div className="process-step">
      <span className="step-no" aria-hidden="true">
        {n}
      </span>
      <h4>{title}</h4>
      <p>{body}</p>
      <div className="when">{when}</div>
    </div>
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
          <SummaryRow label="Business name" value={application.businessName} />
          <SummaryRow
            label="Business address"
            value={application.businessAddress}
            multiline
          />
          <SummaryRow label="Tax ID" value={application.taxId} />
          {application.motivation && (
            <SummaryRow
              label="Motivation"
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
