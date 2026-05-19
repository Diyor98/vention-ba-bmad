/**
 * DESIGN-INT-18 — Loading UI for the booking return-URL handler.
 *
 * Renders while the Server Component is doing its work: retrieving
 * Stripe session → verifying → markBookingAuthorized → redirect to
 * /my-bookings. Stripe routinely takes 100-500ms on this round-trip;
 * showing the user "what's happening" is preferable to a blank page.
 *
 * Mirrors the prototype's BookingFlow "Redirecting to Stripe Checkout…"
 * interstitial chrome: Stripe-S icon + centered spinner + reassuring
 * copy + Stripe attribution. Inline styles only — no per-page CSS.
 */
export default function BookingReturnLoading() {
  return (
    <main
      className="container-content"
      style={{
        minHeight: '60vh',
        display: 'grid',
        placeItems: 'center',
        paddingTop: '3rem',
        paddingBottom: '4rem',
      }}
    >
      <div style={{ textAlign: 'center' }}>
        {/* Stripe-Checkout-style mini-chrome */}
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.5rem',
            fontFamily: 'var(--font-mono)',
            fontSize: 11,
            color: 'var(--color-neutral-500)',
            marginBottom: '1.5rem',
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

        <div
          aria-hidden="true"
          style={{
            width: 48,
            height: 48,
            borderRadius: '9999px',
            border: '2px solid var(--color-brand-200)',
            borderTopColor: '#635BFF',
            margin: '0 auto',
            animation: 'spin 0.8s linear infinite',
          }}
        />
        <p
          style={{
            marginTop: '1rem',
            fontSize: '1rem',
            fontWeight: 600,
            letterSpacing: '-0.01em',
            color: 'var(--color-neutral-900)',
          }}
        >
          Finalizing your booking…
        </p>
        <p
          style={{
            marginTop: '0.375rem',
            fontSize: 14,
            color: 'var(--color-neutral-500)',
          }}
        >
          DeskHive is verifying your payment with Stripe. This takes a
          moment.
        </p>
        <p
          style={{
            marginTop: '1.5rem',
            fontSize: 11,
            color: 'var(--color-neutral-400)',
            fontFamily: 'var(--font-mono)',
          }}
        >
          Powered by{' '}
          <span style={{ fontWeight: 600, color: 'var(--color-neutral-600)' }}>
            stripe
          </span>
        </p>
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </main>
  );
}
