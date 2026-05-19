import Link from 'next/link';
import {
  AlertTriangle,
  Banknote,
  Calendar,
  Clock,
  Filter,
} from 'lucide-react';
import { requireSession } from '@/lib/auth/guards';
import { getConnectAccountByUserId } from '@/db/queries/stripe-connect';
import { listPayouts } from '@/lib/payments/payouts';
import { PayoutStatusBadge } from '@/components/payout-status-badge';
import { StatCard } from '@/components/stat-card';
import { formatCents } from '@/lib/format';
import { logger } from '@/lib/logger';

/**
 * Story 9-7 + DESIGN-INT-5 + DESIGN-INT-11 polish: Space Owner payouts
 * view. Reads payouts directly from Stripe Connect API on every
 * page-load (BA Decision §1).
 *
 * Renders the prototype's HostPayouts shape:
 *   1. Connect status banner (top)
 *      - Missing Connect row OR onboardingCompleted=false → amber
 *        'Stripe Connect not set up' with 'Connect Stripe →' CTA
 *      - Onboarded but charges/payouts capability disabled → amber
 *        'Stripe Connect not set up' with 'Continue setup →' CTA
 *      - Fully active → no banner
 *   2. 3-card stat grid (Lifetime payouts / Pending / Next payout date)
 *   3. Payout history Card (header with title + Filter affordance,
 *      body table with Payout ID + Date + Amount + Status + Stripe ref)
 */
export default async function OwnerPayoutsPage() {
  const session = await requireSession();
  const userId = String(session.user.id);
  const account = await getConnectAccountByUserId(userId);

  const stripeNotSetUp = !account || !account.onboardingCompleted;
  const stripeIncomplete =
    !!account &&
    account.onboardingCompleted &&
    (!account.chargesEnabled || !account.payoutsEnabled);
  const stripeOK =
    !!account &&
    account.onboardingCompleted &&
    account.chargesEnabled &&
    account.payoutsEnabled;

  // Connect-active branch — fetch payouts from Stripe. Inactive branches
  // skip the Stripe API call entirely (no need to round-trip when we
  // know payouts can't be settled yet — preserves Story 9-7 §5 §1).
  let payouts: Awaited<ReturnType<typeof listPayouts>> | null = null;
  if (stripeOK) {
    payouts = await listPayouts({
      stripeAccountId: account.stripeAccountId,
      limit: 25,
    });
    if (!payouts.ok) {
      logger.error('owner_payouts_page_stripe_failed', {
        userId,
        stripeAccountId: account.stripeAccountId,
        error: payouts.error,
      });
    }
  }

  // Aggregates — derived from the Stripe response (no second round-trip).
  // Always defined so the layout stays consistent across states; show $0
  // when the page isn't Connect-active yet.
  const allPayouts =
    payouts && payouts.ok ? payouts.data.payouts : [];
  const paidSum = allPayouts
    .filter((p) => p.status === 'paid')
    .reduce((sum, p) => sum + p.amount, 0);
  const pendingSum = allPayouts
    .filter((p) => p.status === 'pending' || p.status === 'in_transit')
    .reduce((sum, p) => sum + p.amount, 0);
  // eslint-disable-next-line react-hooks/purity
  const nowMs = Date.now();
  const nextPayout = allPayouts
    .filter(
      (p) =>
        (p.status === 'pending' || p.status === 'in_transit') &&
        p.arrival_date * 1000 >= nowMs,
    )
    .sort((a, b) => a.arrival_date - b.arrival_date)[0];
  const nextPayoutDateLabel = nextPayout
    ? new Date(nextPayout.arrival_date * 1000).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
      })
    : '—';

  const stripeApiErrored = !!payouts && !payouts.ok;

  return (
    <main className="container-content admin-page">
      <PayoutsHeader />

      {/* DESIGN-INT-11 polish — Connect banner. Two variants share the
          amber treatment per the prototype:
            • not-set-up: 'Connect Stripe →' CTA
            • capability-incomplete: 'Continue setup →' CTA
          A finer per-step counter ("step N of 4") is deferred — our
          `stripe_connect_accounts` row tracks the 3 booleans Stripe
          exposes (onboarding_completed / charges_enabled /
          payouts_enabled) but not the multi-step progress signal the
          prototype's HOST_PROFILE.stripeStep carries. Adding that would
          require either a real Stripe `/v1/accounts/{id}` round-trip
          (out of "no new API calls" scope) or a new schema column. */}
      {stripeNotSetUp && (
        <div
          className="banner"
          data-testid="payouts-connect-banner-not-set-up"
          style={{ marginBottom: '1.5rem' }}
        >
          <span className="banner-icon" aria-hidden="true">
            <AlertTriangle />
          </span>
          <div className="banner-body">
            <h3>Stripe Connect not set up</h3>
            <p>
              Earnings will stay in pending until you connect a bank
              account.
            </p>
          </div>
          <div className="banner-actions">
            <Link href="/owner/settings" className="btn btn-primary">
              Connect Stripe →
            </Link>
          </div>
        </div>
      )}
      {stripeIncomplete && (
        <div
          className="banner"
          data-testid="payouts-connect-banner-incomplete"
          style={{ marginBottom: '1.5rem' }}
        >
          <span className="banner-icon" aria-hidden="true">
            <AlertTriangle />
          </span>
          <div className="banner-body">
            <h3>Stripe Connect not set up</h3>
            <p>
              Charges or payouts aren&apos;t enabled yet. Earnings stay in
              pending until setup is complete.
            </p>
          </div>
          <div className="banner-actions">
            <Link href="/owner/settings" className="btn btn-primary">
              Continue setup →
            </Link>
          </div>
        </div>
      )}

      {/* Stat grid — always rendered for consistent layout. Inactive
          Connect states show $0 / $0 / —. */}
      <div
        className="stat-grid"
        data-testid="payouts-stat-grid"
        style={{ marginBottom: '1.5rem' }}
      >
        <StatCard
          label="Lifetime payouts"
          value={formatCents(paidSum)}
          Icon={Banknote}
          testid="stat-lifetime"
        />
        <StatCard
          label="Pending"
          value={formatCents(pendingSum)}
          Icon={Clock}
          attention={pendingSum > 0}
          testid="stat-pending"
        />
        <StatCard
          label="Next payout date"
          value={nextPayoutDateLabel}
          Icon={Calendar}
          testid="stat-next"
        />
      </div>

      {/* Payout history card. */}
      <section
        className="form-card"
        data-testid="payout-history-card"
        aria-labelledby="payout-history-heading"
      >
        <div className="form-card-head">
          <h2 id="payout-history-heading">Payout history</h2>
          <button
            type="button"
            className="btn-ghost"
            disabled
            aria-disabled="true"
            title="Phase 3 — filtering not wired yet"
            style={{
              height: '2rem',
              padding: '0 0.75rem',
              fontSize: 13,
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.375rem',
            }}
          >
            <Filter size={14} aria-hidden="true" />
            Filter
          </button>
        </div>
        <div className="table-wrap" style={{ borderRadius: 0, border: 0 }}>
          <table className="table compact">
            <thead>
              <tr>
                <th style={{ width: '18%' }}>Payout ID</th>
                <th style={{ width: '20%' }}>Date</th>
                <th className="num" style={{ width: '14%' }}>
                  Amount
                </th>
                <th style={{ width: '14%' }}>Status</th>
                <th style={{ width: '34%' }}>Stripe ref</th>
              </tr>
            </thead>
            <tbody>
              {stripeApiErrored ? (
                <tr>
                  <td
                    colSpan={5}
                    className="muted"
                    style={{ padding: '1.5rem', textAlign: 'center' }}
                    role="alert"
                  >
                    Payouts temporarily unavailable. Please refresh in a
                    moment.
                  </td>
                </tr>
              ) : allPayouts.length === 0 ? (
                <tr>
                  <td
                    colSpan={5}
                    className="muted"
                    style={{ padding: '1.5rem', textAlign: 'center' }}
                  >
                    {stripeOK
                      ? 'No payouts yet. Once a booking is confirmed and captured, your share will be paid out within a few days.'
                      : 'Connect Stripe to start receiving payouts.'}
                  </td>
                </tr>
              ) : (
                allPayouts.map((payout) => (
                  <tr key={payout.id}>
                    <td
                      className="cell-id"
                      data-testid={`payout-short-${payout.id}`}
                    >
                      {shortPayoutId(payout.id)}
                    </td>
                    <td className="tnum">
                      {new Date(payout.arrival_date * 1000).toLocaleDateString(
                        'en-US',
                        {
                          year: 'numeric',
                          month: 'short',
                          day: 'numeric',
                        },
                      )}
                    </td>
                    <td className="num tnum">{formatCents(payout.amount)}</td>
                    <td>
                      <PayoutStatusBadge status={payout.status} />
                    </td>
                    <td className="cell-id">{middleTruncate(payout.id)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}

/**
 * Short stakeholder-friendly form of the Stripe payout id. Prototype
 * used synthetic 'PO-2218' ids; we display the real id truncated to
 * the first 10 chars + ellipsis so cross-referencing with Stripe
 * dashboard URLs (which also key on the full id) stays unambiguous.
 */
function shortPayoutId(id: string): string {
  if (id.length <= 10) return id;
  return `${id.slice(0, 10)}…`;
}

/**
 * Middle-truncate a Stripe payout id for the Stripe ref column.
 * Preserves the prefix + last 6 chars so the id remains identifiable
 * without sprawling across the column.
 */
function middleTruncate(id: string): string {
  if (id.length <= 16) return id;
  return `${id.slice(0, 9)}…${id.slice(-6)}`;
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
