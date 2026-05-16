import { requireSession } from '@/lib/auth/guards';
import { getConnectAccountByUserId } from '@/db/queries/stripe-connect';
import { OnboardingCtaButton } from './onboarding-cta-button';

/**
 * Story 9-2: Space Owner settings page — currently Stripe Connect
 * onboarding status only. Three state branches per BA Decision §11:
 *
 *   • No `stripe_connect_accounts` row    → "Complete onboarding" CTA.
 *   • Row exists but one of the booleans is false
 *                                         → "Continue onboarding" CTA
 *                                           + status text.
 *   • Both `chargesEnabled` and `payoutsEnabled` true
 *                                         → "Onboarding complete" badge +
 *                                           read-only summary card.
 *
 * Auth: inherits the SPACE_OWNER + mode gate from
 * src/app/(owner)/layout.tsx (Story 7-1). `requireSession()` here is
 * defensive (the layout already redirects unauthenticated callers).
 */
export default async function OwnerSettingsPage() {
  const session = await requireSession();
  const userId = String(session.user.id);
  const account = await getConnectAccountByUserId(userId);

  const isComplete =
    !!account && account.chargesEnabled && account.payoutsEnabled;
  const isInProgress = !!account && !isComplete;

  return (
    <main className="container-content admin-page">
      <div className="admin-page-head">
        <div>
          <h1 className="page-h1">Settings</h1>
          <p className="sub muted">Payments &amp; account configuration.</p>
        </div>
      </div>

      <section
        aria-labelledby="connect-section-heading"
        style={{ marginTop: '2rem' }}
      >
        <h2 id="connect-section-heading" className="h2 mb-2">
          Stripe Connect
        </h2>
        <p className="muted mb-4">
          DeskHive uses Stripe Connect Express to send your guest bookings&apos;
          payouts to your bank account. You complete a short Stripe-hosted
          onboarding flow once — Stripe handles all identity verification and
          bank details.
        </p>

        {!account ? (
          <div
            className="form-card"
            style={{ padding: '1.5rem', maxWidth: '34rem' }}
          >
            <h3 className="h3 mb-2">Complete onboarding</h3>
            <p className="mb-4">
              You haven&apos;t started Stripe onboarding yet. Click below to
              begin — you&apos;ll be redirected to Stripe to enter your
              business and banking details, then returned here.
            </p>
            <OnboardingCtaButton label="Complete onboarding" />
          </div>
        ) : isInProgress ? (
          <div
            className="form-card"
            style={{ padding: '1.5rem', maxWidth: '34rem' }}
          >
            <h3 className="h3 mb-2">Onboarding in progress</h3>
            <p className="mb-2">
              Stripe is verifying your account. You can continue or update
              your onboarding details below.
            </p>
            <ul className="muted mb-4" style={{ paddingLeft: '1.25rem' }}>
              <li>
                Charges enabled:{' '}
                <strong>{account.chargesEnabled ? 'Yes' : 'Not yet'}</strong>
              </li>
              <li>
                Payouts enabled:{' '}
                <strong>{account.payoutsEnabled ? 'Yes' : 'Not yet'}</strong>
              </li>
            </ul>
            <OnboardingCtaButton label="Continue onboarding" />
          </div>
        ) : (
          <div
            className="form-card"
            style={{ padding: '1.5rem', maxWidth: '34rem' }}
            data-testid="connect-complete"
          >
            <h3 className="h3 mb-2">Onboarding complete</h3>
            <p className="mb-4">
              Your Stripe Connect account is active. Bookings on your spaces
              will be charged through Stripe once Story 9-3 ships the payment
              flow.
            </p>
            <dl
              style={{
                display: 'grid',
                gridTemplateColumns: 'max-content 1fr',
                gap: '0.5rem 1.5rem',
                margin: 0,
              }}
            >
              <dt className="muted">Stripe account</dt>
              <dd className="tnum">{maskAccountId(account.stripeAccountId)}</dd>
              <dt className="muted">Charges enabled</dt>
              <dd data-testid="charges-enabled-indicator">
                <strong>{account.chargesEnabled ? 'Yes' : 'No'}</strong>
              </dd>
              <dt className="muted">Payouts enabled</dt>
              <dd data-testid="payouts-enabled-indicator">
                <strong>{account.payoutsEnabled ? 'Yes' : 'No'}</strong>
              </dd>
            </dl>
          </div>
        )}
      </section>
    </main>
  );
}

/**
 * Show first 8 + last 4 chars of the Stripe account id. The id is not
 * a secret (Stripe distributes it in dashboard URLs etc.) but masking
 * the middle keeps the surface tidy on screen.
 */
function maskAccountId(id: string): string {
  if (id.length <= 12) return id;
  return `${id.slice(0, 8)}…${id.slice(-4)}`;
}
