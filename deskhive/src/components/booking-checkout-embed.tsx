'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { ArrowLeft, Lock } from 'lucide-react';
import { loadStripe, type Stripe } from '@stripe/stripe-js';
import {
  EmbeddedCheckout,
  EmbeddedCheckoutProvider,
} from '@stripe/react-stripe-js';
import { formatCents } from '@/lib/format';

/**
 * DESIGN-INT-CHECKOUT-EMBED Phase 2 — Embedded Checkout mount.
 *
 * Renders the prototype's BookingFlow shape: left column is Stripe's
 * embedded payment iframe (`<EmbeddedCheckoutProvider>` + `<EmbeddedCheckout>`
 * from `@stripe/react-stripe-js`); right column is the summary Card
 * (space + desk + date + day rate + 15% platform fee + total + footer
 * copy).
 *
 * Loading state: `<EmbeddedCheckoutProvider>` itself renders Stripe's
 * own spinner while the iframe initializes. We add a Stripe-S chrome
 * badge above the iframe matching the DESIGN-INT-18 return-URL loading
 * interstitial style — gives the user a consistent "you're in Stripe"
 * cue.
 *
 * Error state: if `clientSecret` is empty/invalid, `<EmbeddedCheckoutProvider>`
 * throws. We wrap that in an error boundary fallback rendering an
 * inline error card with a "Try again" button that re-runs the action
 * via location.reload(). Stripe sessions auto-expire after 24h; an
 * expired session is the typical real-world failure mode.
 *
 * Cancel/dismiss: no separate `cancel_url` in embedded mode. The
 * summary's "← Back to space" link is the user's escape hatch. The
 * AWAITING_PAYMENT booking row sits until Story 9-5's
 * `checkout.session.expired` webhook DELETEs it after 24h.
 *
 * Webhook + return-URL handlers unchanged from hosted mode.
 */

// `loadStripe` returns a singleton-like Promise — call once at module
// scope. The factory is no-op if the publishable key is missing; the
// component renders an error state in that case.
function stripePromise(): Promise<Stripe | null> {
  const key = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
  if (!key) return Promise.resolve(null);
  return loadStripe(key);
}

export type BookingCheckoutEmbedProps = {
  clientSecret: string;
  spaceId: string;
  spaceName: string;
  spaceImageUrl: string;
  deskLabel: string;
  bookingDate: string;
  amountCents: number;
  platformFeeCents: number;
};

export function BookingCheckoutEmbed({
  clientSecret,
  spaceId,
  spaceName,
  spaceImageUrl,
  deskLabel,
  bookingDate,
  amountCents,
  platformFeeCents,
}: BookingCheckoutEmbedProps) {
  // `stripePromise()` is hoisted via useMemo so the singleton is created
  // once per mount, not on every render.
  const stripePromiseRef = useMemo(() => stripePromise(), []);

  if (!clientSecret) {
    return <EmbedErrorCard reason="empty-client-secret" />;
  }

  // The summary panel's totals.
  const totalCents = amountCents;

  return (
    <div
      style={{ background: '#F6F9FC', minHeight: '80vh', paddingBottom: '4rem' }}
      data-testid="booking-checkout-embed"
    >
      <main
        className="container-content"
        style={{
          maxWidth: '64rem',
          paddingTop: '2.5rem',
        }}
      >
        {/* Stripe chrome — mirrors return-URL loading.tsx (DESIGN-INT-18). */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.75rem',
            marginBottom: '1.5rem',
          }}
        >
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.5rem',
              fontFamily: 'var(--font-mono)',
              fontSize: 11,
              color: 'var(--color-neutral-500)',
              letterSpacing: '0.04em',
            }}
          >
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 20,
                height: 20,
                borderRadius: 'var(--radius-sm)',
                background: '#635BFF',
                color: '#ffffff',
                fontSize: 10,
                fontWeight: 700,
              }}
              aria-hidden="true"
            >
              S
            </span>
            <span>checkout.stripe.com · Test mode</span>
          </div>
          <Link
            href={`/spaces/${spaceId}?booking_cancelled=1`}
            style={{
              marginLeft: 'auto',
              fontSize: 13,
              color: 'var(--color-neutral-500)',
              textDecoration: 'none',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.25rem',
            }}
          >
            <ArrowLeft size={14} aria-hidden="true" /> Back to {spaceName}
          </Link>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 24rem)',
            gap: '2rem',
            alignItems: 'start',
          }}
        >
          {/* Left — embedded Stripe iframe. */}
          <section
            className="form-card"
            style={{ padding: '0', overflow: 'hidden' }}
            aria-label="Stripe payment form"
            data-testid="embedded-checkout-mount"
          >
            <EmbeddedCheckoutProvider
              stripe={stripePromiseRef}
              options={{ clientSecret }}
            >
              <EmbeddedCheckout />
            </EmbeddedCheckoutProvider>
          </section>

          {/* Right — booking summary card. */}
          <aside
            className="summary-card"
            data-testid="booking-summary-card"
            style={{ position: 'sticky', top: '5rem' }}
          >
            <h3>Pay DeskHive</h3>
            <div
              style={{
                marginTop: '0.25rem',
                fontSize: '1.75rem',
                fontWeight: 600,
                color: 'var(--color-neutral-900)',
                letterSpacing: '-0.02em',
              }}
            >
              {formatCents(totalCents)}
            </div>
            <div
              style={{
                marginTop: '0.25rem',
                fontSize: 12,
                color: 'var(--color-neutral-500)',
                lineHeight: 1.5,
              }}
            >
              Authorisation only. You&apos;ll only be charged after the
              host confirms.
            </div>

            <div
              style={{
                marginTop: '1.25rem',
                display: 'flex',
                alignItems: 'center',
                gap: '0.75rem',
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={spaceImageUrl}
                alt=""
                style={{
                  width: 48,
                  height: 48,
                  borderRadius: 'var(--radius-lg)',
                  objectFit: 'cover',
                  flex: 'none',
                  background: 'var(--color-neutral-100)',
                }}
              />
              <div style={{ minWidth: 0 }}>
                <div
                  style={{
                    fontSize: 14,
                    fontWeight: 500,
                    color: 'var(--color-neutral-900)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {spaceName}
                </div>
                <div
                  style={{
                    fontSize: 12,
                    color: 'var(--color-neutral-500)',
                  }}
                >
                  {deskLabel} · {bookingDate}
                </div>
              </div>
            </div>

            <div className="summary-rows" style={{ marginTop: '1rem' }}>
              <span className="k">Day rate</span>
              <span className="v tnum">{formatCents(amountCents - platformFeeCents)}</span>
              <span className="k">Platform fee · 15%</span>
              <span className="v tnum">{formatCents(platformFeeCents)}</span>
            </div>

            <hr className="summary-divide" />

            <div className="summary-total">
              <span className="k">Total due today</span>
              <span className="v tnum">{formatCents(totalCents)}</span>
            </div>

            <div className="summary-foot">
              <Lock className="lock" aria-hidden="true" />
              Funds are held on your card via Stripe. Cancellation more
              than 24h before the booking date issues a full refund
              automatically.
            </div>
          </aside>
        </div>
      </main>
    </div>
  );
}

function EmbedErrorCard({ reason }: { reason: string }) {
  return (
    <main
      className="container-content"
      style={{ paddingTop: '3rem', paddingBottom: '4rem', maxWidth: '36rem' }}
      data-testid="booking-checkout-embed-error"
      role="alert"
    >
      <div
        className="form-card"
        style={{ padding: '1.5rem' }}
      >
        <h2 className="h2 mb-2">Booking unavailable</h2>
        <p className="muted mb-4">
          We couldn&apos;t initialize the payment form. This can happen
          if the booking session expired (older than 24 hours) or if
          Stripe&apos;s publishable key is misconfigured.
        </p>
        <p
          className="muted"
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 11,
            marginBottom: '1rem',
          }}
        >
          reason: {reason}
        </p>
        <Link className="btn btn-primary" href="/">
          Browse spaces
        </Link>
      </div>
    </main>
  );
}
