import Link from 'next/link';
import { refreshConnectStatusAction } from '@/actions/connect';

/**
 * Story 9-2: return-URL handler for Stripe Connect Account Links.
 * Stripe redirects here after the user completes (or explicitly cancels)
 * onboarding. On load, we call `refreshConnectStatusAction()` to sync
 * state via the Stripe API in case the `account.updated` webhook
 * hasn't arrived yet.
 *
 * Three outcomes:
 *   • Both flags true → "Onboarding complete" + link back to /owner/settings.
 *   • Flags still false → "Stripe is still verifying your account" + link
 *     back to /owner/settings (the in-progress state will show there).
 *   • Action errored (no Connect row, Stripe API failure, etc.) → show
 *     the error message + link back.
 *
 * BA Decision §5 anti-pattern: do NOT redirect away from this page —
 * landing here is the explicit "you came back from Stripe" affordance.
 */
export default async function OnboardingReturnPage() {
  const result = await refreshConnectStatusAction();

  return (
    <main className="container-content admin-page">
      <div className="admin-page-head">
        <div>
          <h1 className="page-h1">Returned from Stripe</h1>
        </div>
      </div>

      <section
        className="form-card"
        style={{ marginTop: '2rem', maxWidth: '34rem', padding: '1.5rem' }}
      >
        {!result.ok ? (
          <>
            <h2 className="h3 mb-2">Could not sync your account</h2>
            <p className="mb-4">
              We could not retrieve your Stripe Connect status: {result.error}
            </p>
            <Link href="/owner/settings" className="btn btn-secondary">
              Back to Settings
            </Link>
          </>
        ) : result.chargesEnabled && result.payoutsEnabled ? (
          <>
            <h2 className="h3 mb-2">Onboarding complete</h2>
            <p className="mb-4">
              Stripe has verified your account. Charges and payouts are
              enabled.
            </p>
            <Link href="/owner/settings" className="btn btn-primary">
              Back to Settings
            </Link>
          </>
        ) : (
          <>
            <h2 className="h3 mb-2">Verification in progress</h2>
            <p className="mb-4">
              Stripe is still verifying your account. This usually takes a
              few minutes. We&apos;ll update your status automatically — check
              back shortly.
            </p>
            <ul className="muted mb-4" style={{ paddingLeft: '1.25rem' }}>
              <li>
                Charges enabled:{' '}
                <strong>{result.chargesEnabled ? 'Yes' : 'Not yet'}</strong>
              </li>
              <li>
                Payouts enabled:{' '}
                <strong>{result.payoutsEnabled ? 'Yes' : 'Not yet'}</strong>
              </li>
            </ul>
            <Link href="/owner/settings" className="btn btn-secondary">
              Back to Settings
            </Link>
          </>
        )}
      </section>
    </main>
  );
}
