import { Check } from 'lucide-react';
import Link from 'next/link';
import { requireSession } from '@/lib/auth/guards';
import { getConnectAccountByUserId } from '@/db/queries/stripe-connect';
import { OnboardingCtaButton } from './onboarding-cta-button';

/**
 * Story 9-2 + DESIGN-INT-11: Space Owner settings page — Stripe Connect
 * onboarding surface restyled to the prototype's HostOnboarding shape.
 *
 * The prototype renders a 5-step wizard (Get started → Verify identity
 * → Add bank → Payout schedule → Done) UNTIL the Connect account is
 * complete; then a success card with 4 capability indicators + Manage
 * on Stripe + Disconnect.
 *
 * Production reality: the wizard is largely cosmetic — Stripe Express
 * handles identity verification + bank + schedule in its own hosted UI
 * after a single redirect-out + redirect-back. So our shape:
 *
 *   • No Connect row OR in-progress: render the prototype's "Get
 *     started" landing as the step body (Stripe-S chrome + steps rail
 *     + 'Continue with Stripe' CTA → server-driven redirect).
 *   • Complete: render the success card with 4 indicators (charges /
 *     payouts / identity / tax form) + Manage on Stripe + a Stripe-
 *     dashboard hint footer.
 *
 * Auth: inherits from src/app/(owner)/layout.tsx (Story 7-1).
 */
const STEPS = [
  { n: 1, t: 'Get started', d: 'Quick intro — what Stripe collects and why.' },
  {
    n: 2,
    t: 'Verify your identity',
    d: 'Legal name, date of birth, address. Stripe verifies.',
  },
  {
    n: 3,
    t: 'Add a bank account',
    d: 'Where payouts land. Routing + account.',
  },
  {
    n: 4,
    t: 'Payout schedule',
    d: 'Frequency, currency, statement descriptor.',
  },
  { n: 5, t: 'Done', d: 'Ready to accept payouts.' },
] as const;

export default async function OwnerSettingsPage() {
  const session = await requireSession();
  const userId = String(session.user.id);
  const account = await getConnectAccountByUserId(userId);

  const isComplete =
    !!account && account.chargesEnabled && account.payoutsEnabled;

  return (
    <main className="container-content admin-page">
      <div className="admin-page-head">
        <div>
          <h1 className="page-h1">Settings</h1>
          <p className="sub muted">Payments &amp; account configuration.</p>
        </div>
      </div>

      {isComplete ? (
        <ConnectCompleteCard account={account} />
      ) : (
        <ConnectWizardCard hasAccount={!!account} />
      )}
    </main>
  );
}

function ConnectWizardCard({ hasAccount }: { hasAccount: boolean }) {
  // Pre-complete view — prototype's step-rail + "Get started" body.
  // Active step = 1 (this page hosts the redirect-to-Stripe CTA).
  // Steps 2-4 are visited on Stripe's hosted UI between the redirect
  // and the return; they're shown here for transparency only.
  const activeStep = hasAccount ? 2 : 1;

  return (
    <div
      style={{
        marginTop: '2rem',
        display: 'grid',
        gridTemplateColumns: 'minmax(0, 260px) minmax(0, 1fr)',
        gap: '1.5rem',
        alignItems: 'start',
      }}
    >
      {/* Step rail */}
      <div className="form-card connect-card" style={{ padding: '0.75rem' }}>
        <ol style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {STEPS.map((s) => {
            const done = s.n < activeStep;
            const active = s.n === activeStep;
            return (
              <li key={s.n} style={{ margin: 0 }}>
                <div
                  style={{
                    display: 'flex',
                    gap: '0.625rem',
                    padding: '0.625rem 0.75rem',
                    borderRadius: 'var(--radius-lg)',
                    background: active
                      ? 'var(--color-brand-50)'
                      : 'transparent',
                  }}
                >
                  <span
                    aria-hidden="true"
                    style={{
                      width: 24,
                      height: 24,
                      borderRadius: 9999,
                      display: 'grid',
                      placeItems: 'center',
                      fontSize: 11,
                      fontWeight: 600,
                      color: active || done ? '#ffffff' : 'var(--color-neutral-600)',
                      background: active
                        ? 'var(--color-primary)'
                        : done
                          ? '#10B981'
                          : 'var(--color-neutral-100)',
                      flex: 'none',
                    }}
                  >
                    {done ? '✓' : s.n}
                  </span>
                  <div style={{ minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: 13,
                        fontWeight: 600,
                        color: active
                          ? 'var(--color-brand-800)'
                          : done
                            ? '#166534'
                            : 'var(--color-neutral-800)',
                      }}
                    >
                      {s.t}
                    </div>
                    <div
                      style={{
                        fontSize: 11,
                        color: 'var(--color-neutral-500)',
                        lineHeight: 1.4,
                      }}
                    >
                      {s.d}
                    </div>
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      </div>

      {/* Step body */}
      <div className="form-card" style={{ padding: '1.5rem' }}>
        {!hasAccount ? (
          <>
            <h2 className="h2 mb-2">Get paid via Stripe</h2>
            <p className="muted mb-4" style={{ maxWidth: '60ch' }}>
              DeskHive uses Stripe Connect Express to handle your payouts.
              Stripe will collect a few details to verify your account and
              pay you out — DeskHive never stores your bank info.
            </p>
            <ul
              style={{
                listStyle: 'none',
                padding: 0,
                margin: '1rem 0 1.5rem',
                display: 'grid',
                gap: '0.625rem',
              }}
            >
              {[
                'Verifies your identity (KYC required by US regulations)',
                'Adds your bank account so payouts land directly',
                'Issues 1099-K tax forms at year-end if you qualify',
                'Lets you update payment details anytime from Stripe',
              ].map((t) => (
                <li
                  key={t}
                  style={{
                    display: 'flex',
                    gap: '0.625rem',
                    alignItems: 'flex-start',
                    fontSize: 14,
                    color: 'var(--color-neutral-700)',
                  }}
                >
                  <span
                    aria-hidden="true"
                    style={{
                      width: 20,
                      height: 20,
                      marginTop: 1,
                      flex: 'none',
                      borderRadius: 9999,
                      background: 'var(--color-brand-100)',
                      color: 'var(--color-brand-700)',
                      display: 'grid',
                      placeItems: 'center',
                    }}
                  >
                    <Check size={11} />
                  </span>
                  {t}
                </li>
              ))}
            </ul>
            <OnboardingCtaButton label="Continue with Stripe →" />
          </>
        ) : (
          <>
            <h2 className="h2 mb-2">Continue your Stripe setup</h2>
            <p className="muted mb-4" style={{ maxWidth: '60ch' }}>
              Stripe is verifying your account. Charges enabled:{' '}
              <strong>Not yet</strong>. Payouts enabled:{' '}
              <strong>Not yet</strong>. Continue the flow to finish
              identity verification + add your bank account.
            </p>
            <OnboardingCtaButton label="Continue onboarding →" />
          </>
        )}
      </div>
    </div>
  );
}

function ConnectCompleteCard({
  account,
}: {
  account: {
    stripeAccountId: string;
    chargesEnabled: boolean;
    payoutsEnabled: boolean;
  };
}) {
  return (
    <div
      style={{
        marginTop: '2rem',
        display: 'grid',
        gridTemplateColumns: 'minmax(0, 2fr) minmax(0, 1fr)',
        gap: '1.5rem',
        alignItems: 'start',
      }}
      data-testid="connect-complete"
    >
      <article className="form-card" style={{ padding: '1.5rem' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.75rem',
            paddingBottom: '1rem',
            borderBottom: '1px solid var(--color-border)',
          }}
        >
          <span
            aria-hidden="true"
            style={{
              width: 36,
              height: 36,
              display: 'grid',
              placeItems: 'center',
              borderRadius: 'var(--radius-lg)',
              background: '#635BFF',
              color: '#ffffff',
              fontSize: 16,
              fontWeight: 700,
            }}
          >
            S
          </span>
          <div>
            <div
              style={{
                fontSize: 15,
                fontWeight: 600,
                color: 'var(--color-neutral-900)',
              }}
            >
              Stripe Connect · Express
            </div>
            <div style={{ fontSize: 12, color: 'var(--color-neutral-500)' }}>
              Connected · Test mode
            </div>
          </div>
          <span
            className="badge badge-confirmed"
            style={{ marginLeft: 'auto' }}
          >
            <span className="dot" aria-hidden="true" />
            Active
          </span>
        </div>

        <div
          style={{
            marginTop: '1.25rem',
            display: 'grid',
            gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
            gap: '0.75rem',
          }}
        >
          {[
            ['Charges enabled', 'Cards are accepted on your spaces'],
            [
              'Payouts enabled',
              'Funds settle to your bank on Stripe’s schedule',
            ],
            ['Identity verified', 'Government ID + DOB on file with Stripe'],
            ['Tax form on file', '1099-K issued at year-end if eligible'],
          ].map(([title, body]) => (
            <div
              key={title}
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: '0.625rem',
                padding: '0.75rem',
                borderRadius: 'var(--radius-lg)',
                background: '#F0FDF4',
                border: '1px solid #BBF7D0',
              }}
            >
              <span
                aria-hidden="true"
                style={{
                  width: 20,
                  height: 20,
                  marginTop: 1,
                  flex: 'none',
                  borderRadius: 9999,
                  background: '#10B981',
                  color: '#ffffff',
                  display: 'grid',
                  placeItems: 'center',
                }}
              >
                <Check size={11} />
              </span>
              <div>
                <div
                  style={{
                    fontSize: 14,
                    fontWeight: 500,
                    color: 'var(--color-neutral-900)',
                  }}
                >
                  {title}
                </div>
                <div
                  style={{
                    fontSize: 12,
                    color: 'var(--color-neutral-600)',
                  }}
                >
                  {body}
                </div>
              </div>
            </div>
          ))}
        </div>

        <div
          style={{
            marginTop: '1.25rem',
            paddingTop: '1.25rem',
            borderTop: '1px solid var(--color-border)',
            display: 'grid',
            gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
            gap: '1rem',
            fontSize: 14,
          }}
        >
          <KV k="Stripe account" v={<code className="tnum">{maskAccountId(account.stripeAccountId)}</code>} />
          <KV k="Currency" v="USD" />
          <KV
            k="Charges enabled"
            v={<strong data-testid="charges-enabled-indicator">{account.chargesEnabled ? 'Yes' : 'No'}</strong>}
          />
          <KV
            k="Payouts enabled"
            v={<strong data-testid="payouts-enabled-indicator">{account.payoutsEnabled ? 'Yes' : 'No'}</strong>}
          />
        </div>
      </article>

      <aside className="form-card" style={{ padding: '1.5rem', height: 'fit-content' }}>
        <div
          style={{
            fontSize: 14,
            fontWeight: 600,
            color: 'var(--color-neutral-900)',
            marginBottom: '0.25rem',
          }}
        >
          Manage on Stripe
        </div>
        <p
          className="muted"
          style={{ fontSize: 12, marginBottom: '1rem' }}
        >
          Update your bank account, tax info, or payout schedule from
          your Stripe Express dashboard.
        </p>
        <Link href="/owner/payouts" className="btn btn-secondary" style={{ width: '100%' }}>
          See payouts →
        </Link>
        <p
          className="muted"
          style={{
            marginTop: '1.25rem',
            paddingTop: '1.25rem',
            borderTop: '1px solid var(--color-border)',
            fontSize: 11,
            lineHeight: 1.55,
          }}
        >
          DeskHive uses Stripe Connect Express. Your bank details live
          with Stripe, not us.
        </p>
      </aside>
    </div>
  );
}

function KV({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div>
      <div
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 11,
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
          color: 'var(--color-neutral-500)',
        }}
      >
        {k}
      </div>
      <div
        style={{
          marginTop: '0.25rem',
          fontSize: 14,
          color: 'var(--color-neutral-900)',
        }}
      >
        {v}
      </div>
    </div>
  );
}

function maskAccountId(id: string): string {
  if (id.length <= 12) return id;
  return `${id.slice(0, 8)}…${id.slice(-4)}`;
}
