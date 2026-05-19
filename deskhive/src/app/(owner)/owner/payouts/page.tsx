import Link from 'next/link';
import { requireSession } from '@/lib/auth/guards';
import { getConnectAccountByUserId } from '@/db/queries/stripe-connect';
import { listPayouts } from '@/lib/payments/payouts';
import { PayoutStatusBadge } from '@/components/payout-status-badge';
import { formatCents } from '@/lib/format';
import { logger } from '@/lib/logger';

/**
 * Story 9-7: Space Owner payouts view. PRD §4.6 FR-OWNER-1 +
 * §7.2 New Screens #5 — table of Stripe Connect payouts (date / amount /
 * status). Reads payouts DIRECTLY from Stripe Connect API on every
 * page-load (BA Decision §1 — no local cache table in 9-7; Phase 3
 * forward-flag for the cache).
 *
 * Auth + role + mode gate is handled by `(owner)/layout.tsx` (Story 7-1).
 * `requireSession()` here is defensive (mirrors `/owner/settings`
 * pattern from 9-2) — the layout already short-circuits unauthenticated
 * + role-mismatched callers.
 *
 * Renders 5 distinct states (BA Decision §5):
 *
 *   1. No Connect row OR onboarding_completed === false
 *      → "Set up payouts" empty-state + CTA → /owner/settings
 *      No Stripe API call fires.
 *   2. charges_enabled !== true OR payouts_enabled !== true
 *      → "Payouts are paused" empty-state + CTA → /owner/settings
 *      No Stripe API call fires.
 *   3. Connect-active + payouts.length === 0
 *      → "No payouts yet" empty-state
 *      Stripe API DID fire (returned empty array).
 *   4. Connect-active + payouts.length > 0
 *      → table of date / amount / status with <PayoutStatusBadge>
 *      Stripe API call returned data.
 *   5. Stripe API error
 *      → inline fallback message + logger.error for ops
 *
 * Pagination: single-page-only `limit: 25` per BA Decision §6. Phase 3
 * will add cursor-based "Show more". The single new route adds +1 to
 * the build's route count (41 → 42).
 */
export default async function OwnerPayoutsPage() {
  const session = await requireSession();
  const userId = String(session.user.id);
  const account = await getConnectAccountByUserId(userId);

  // State #1 — Connect row absent OR onboarding not completed.
  // Pure DB-row-based gate; no Stripe API call fires (BA Decision §5
  // anti-pattern: don't waste a Stripe round-trip on un-transacting
  // owners).
  if (!account || !account.onboardingCompleted) {
    return (
      <main className="container-content admin-page">
        <PayoutsHeader />
        <EmptyStateCard
          heading="Set up payouts"
          body="Set up payouts to see your earnings history."
          ctaLabel="Complete onboarding"
        />
      </main>
    );
  }

  // State #2 — Onboarded but Connect-inactive (charges_enabled or
  // payouts_enabled flipped false). Same shape as State #1; no Stripe
  // API call fires.
  if (!account.chargesEnabled || !account.payoutsEnabled) {
    return (
      <main className="container-content admin-page">
        <PayoutsHeader />
        <EmptyStateCard
          heading="Payouts paused"
          body="Payouts are paused. Re-onboard to receive funds."
          ctaLabel="Re-onboard"
        />
      </main>
    );
  }

  // Connect-active path — call Stripe.
  const result = await listPayouts({
    stripeAccountId: account.stripeAccountId,
    // limit defaults to 25 per BA Decision §6; explicit for readability.
    limit: 25,
  });

  // State #5 — Stripe API error. Render inline fallback; log for ops.
  if (!result.ok) {
    logger.error('owner_payouts_page_stripe_failed', {
      userId,
      stripeAccountId: account.stripeAccountId,
      error: result.error,
    });
    return (
      <main className="container-content admin-page">
        <PayoutsHeader />
        <div
          className="form-card"
          style={{ padding: '1.5rem', maxWidth: '34rem' }}
          role="alert"
        >
          <p>Payouts temporarily unavailable. Please refresh in a moment.</p>
        </div>
      </main>
    );
  }

  const payouts = result.data.payouts;

  // State #3 — Connect-active + zero payouts yet.
  if (payouts.length === 0) {
    return (
      <main className="container-content admin-page">
        <PayoutsHeader />
        <div
          className="form-card"
          style={{ padding: '1.5rem', maxWidth: '34rem' }}
        >
          <p className="muted">
            No payouts yet. Once a booking is confirmed and captured, your
            share will be paid out within a few days.
          </p>
        </div>
      </main>
    );
  }

  // State #4 — happy path: render the table.
  return (
    <main className="container-content admin-page">
      <PayoutsHeader />
      <table className="data-table">
        <thead>
          <tr>
            <th scope="col">Date</th>
            <th scope="col">Amount</th>
            <th scope="col">Status</th>
          </tr>
        </thead>
        <tbody>
          {payouts.map((payout) => (
            <tr key={payout.id}>
              {/* arrival_date is a Unix timestamp in seconds (Stripe
                  convention). Multiply by 1000 for JS Date ms. */}
              <td className="tnum">
                {new Date(payout.arrival_date * 1000).toLocaleDateString(
                  'en-US',
                  { year: 'numeric', month: 'short', day: 'numeric' },
                )}
              </td>
              <td className="tnum">{formatCents(payout.amount)}</td>
              <td>
                <PayoutStatusBadge status={payout.status} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}

function PayoutsHeader() {
  return (
    <div className="admin-page-head">
      <div>
        <h1 className="page-h1">Payouts</h1>
        <p className="sub muted">Payout history from Stripe Connect.</p>
      </div>
    </div>
  );
}

function EmptyStateCard({
  heading,
  body,
  ctaLabel,
}: {
  heading: string;
  body: string;
  ctaLabel: string;
}) {
  return (
    <div
      className="form-card"
      style={{ padding: '1.5rem', maxWidth: '34rem' }}
    >
      <h3 className="h3 mb-2">{heading}</h3>
      <p className="mb-4">{body}</p>
      <Link href="/owner/settings" className="btn btn-primary">
        {ctaLabel}
      </Link>
    </div>
  );
}
