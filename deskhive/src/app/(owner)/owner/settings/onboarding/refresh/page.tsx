import Link from 'next/link';
import { redirect } from 'next/navigation';
import { initiateConnectOnboardingAction } from '@/actions/connect';

/**
 * Story 9-2: refresh-URL handler for Stripe Connect Account Links.
 * Stripe redirects here if the Account Link expires (they're short-lived
 * ephemeral URLs) or the user clicks "back to platform" mid-onboarding
 * without completing. We re-mint a fresh Account Link and redirect to it.
 *
 * If the action fails (e.g., Stripe API error), we render an error page
 * with a manual fallback link to /owner/settings.
 *
 * BA Decision §5: refresh and return are deliberately distinct routes
 * — this page's behavior (re-mint + redirect) is meaningfully different
 * from the return page's (sync state + render status). Query-param
 * branching would obscure the difference.
 */
export default async function OnboardingRefreshPage() {
  const result = await initiateConnectOnboardingAction();

  if (result.ok) {
    // Server-side redirect to the external Stripe URL. Next.js's
    // `redirect()` works fine for external URLs from a Server Component
    // (the throw is consumed by the rendering layer, not the Server
    // Action layer that struggles with external redirects).
    redirect(result.redirectUrl);
  }

  return (
    <main className="container-content admin-page">
      <div className="admin-page-head">
        <div>
          <h1 className="page-h1">Could not resume onboarding</h1>
        </div>
      </div>

      <section
        className="form-card"
        style={{ marginTop: '2rem', maxWidth: '34rem', padding: '1.5rem' }}
      >
        <h2 className="h3 mb-2">We couldn&apos;t generate a new onboarding link</h2>
        <p className="mb-4">{result.error}</p>
        <Link href="/owner/settings" className="btn btn-secondary">
          Back to Settings
        </Link>
      </section>
    </main>
  );
}
