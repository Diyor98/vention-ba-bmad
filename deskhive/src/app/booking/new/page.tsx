'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { BookingCheckoutEmbed } from '@/components/booking-checkout-embed';

/**
 * DESIGN-INT-CHECKOUT-EMBED Phase 2.5 — dedicated /booking/new route.
 *
 * Phase 2 inline-mounted the embed at the bottom of /spaces/[id]. BA
 * walk found this wrong: the prototype's BookingFlow is a dedicated
 * full-page checkout with no space-detail content visible. This page
 * is the dedicated route.
 *
 * Data-flow:
 *   1. `<BookDeskButtonEmbedded>` on /spaces/[id] runs the Server
 *      Action that creates the embedded Checkout Session.
 *   2. On success, the button stashes
 *      `{ clientSecret, sessionId, bookingId, ...summary }` in
 *      sessionStorage keyed by a fresh UUID (`ck=<uuid>`), then
 *      `router.push('/booking/new?ck=<uuid>')`.
 *   3. This page reads the `ck` query param, retrieves the stash from
 *      sessionStorage, and mounts `<BookingCheckoutEmbed>` with the
 *      data.
 *
 * Why sessionStorage and not URL params: the `clientSecret` is
 * session-specific and we don't want it in URLs, browser history,
 * or referer headers. sessionStorage is tab-scoped + cleared on tab
 * close — fits the "transient one-tab checkout" usage perfectly.
 *
 * Refresh / direct-URL handling: if the user reloads with a stale
 * `ck` OR navigates directly to /booking/new without first clicking
 * Book on a space, sessionStorage misses → render an empty-state
 * card with a "Browse spaces" CTA. No leakage, no broken layout.
 *
 * Auth gating: deliberately not enforced at the route layer. The
 * Stripe Session was already created against an authenticated
 * Server Action call; the booking row is pre-claimed under the
 * authenticated guest_user_id. Webhook + return-URL handler verify
 * the linkage server-side. The page's only job is to mount the
 * iframe — Stripe owns the rest.
 */

const SESSION_STORAGE_PREFIX = 'deskhive:checkout:';

type CheckoutStash = {
  clientSecret: string;
  sessionId: string;
  bookingId: string;
  spaceId: string;
  spaceName: string;
  spaceImageUrl: string;
  deskLabel: string;
  bookingDate: string;
  amountCents: number;
  platformFeeCents: number;
};

export default function BookingNewPage() {
  return (
    <Suspense
      fallback={
        <main
          className="container-content"
          style={{ paddingTop: '3rem', paddingBottom: '4rem', textAlign: 'center' }}
          data-testid="booking-new-loading"
        >
          <p className="muted">Loading payment form…</p>
        </main>
      }
    >
      <BookingNewInner />
    </Suspense>
  );
}

function BookingNewInner() {
  const params = useSearchParams();
  const ck = params.get('ck');
  const [stash, setStash] = useState<CheckoutStash | null>(null);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    // Legitimate set-state-in-effect: this effect reads the
    // browser-only sessionStorage on mount; the only way to get the
    // result into render is via state. Both setters (hydrated +
    // stash) are guarded — they run exactly once per ck change and
    // don't depend on prior state.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setHydrated(true);
    if (!ck) return;
    try {
      const raw = window.sessionStorage.getItem(SESSION_STORAGE_PREFIX + ck);
      if (!raw) return;
      const parsed = JSON.parse(raw) as CheckoutStash;
      // Defensive: ensure the load looks like a CheckoutStash before
      // we trust it (the user could in principle put anything in
      // their own sessionStorage). Minimum-viable shape check.
      if (typeof parsed?.clientSecret === 'string' && parsed.clientSecret.length > 0) {
        setStash(parsed);
      }
    } catch {
      // Malformed JSON → render empty state.
    }
  }, [ck]);

  // SSR + first paint: render empty placeholder. sessionStorage isn't
  // available server-side, and reading it before mount would throw.
  if (!hydrated) {
    return (
      <main
        className="container-content"
        style={{ paddingTop: '3rem', paddingBottom: '4rem', textAlign: 'center' }}
        data-testid="booking-new-hydrating"
      >
        <p className="muted">Loading payment form…</p>
      </main>
    );
  }

  if (!ck || !stash) {
    return (
      <main
        className="container-content"
        style={{
          paddingTop: '3rem',
          paddingBottom: '4rem',
          maxWidth: '36rem',
        }}
        data-testid="booking-new-empty"
      >
        <div className="form-card" style={{ padding: '1.5rem' }}>
          <h1 className="page-h1 mb-2">No active checkout</h1>
          <p className="muted mb-4">
            Looks like you opened this page directly, or your checkout
            session expired. Start a new booking from any space.
          </p>
          <Link className="btn btn-primary" href="/">
            Browse spaces
          </Link>
        </div>
      </main>
    );
  }

  return (
    <BookingCheckoutEmbed
      clientSecret={stash.clientSecret}
      spaceId={stash.spaceId}
      spaceName={stash.spaceName}
      spaceImageUrl={stash.spaceImageUrl}
      deskLabel={stash.deskLabel}
      bookingDate={stash.bookingDate}
      amountCents={stash.amountCents}
      platformFeeCents={stash.platformFeeCents}
    />
  );
}
