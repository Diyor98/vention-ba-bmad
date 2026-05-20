# Checkout-Embed migration plan + risk analysis

DESIGN-INT-CHECKOUT-EMBED — migrate booking checkout from Stripe-hosted redirect to Stripe Embedded Checkout. Generated 2026-05-20.

## Current state (Story 9-3 pattern) — investigated end to end

### Session creation
- `src/lib/payments/checkout.ts:49-126` — `createCheckoutSession({ … })` calls `stripe.checkout.sessions.create({ mode: 'payment', line_items, payment_intent_data: { capture_method: 'manual', transfer_data, application_fee_amount, metadata: { bookingId } }, client_reference_id, customer_email, success_url, cancel_url })` with `idempotencyKey` as the second arg.
- Returns `{ sessionId, url }`. The hosted-Checkout `session.url` is the redirect target.

### Caller — Server Action
- `src/actions/booking-with-payment.ts:1-271` — `createBookingWithPaymentAction`. 9-step flow ends at step 9 by returning `{ status: 'success', redirectUrl: checkoutResult.data.url }`.
- `idempotencyKey = checkout-${crypto.randomUUID()}` (BA Decision §9, per-attempt UUID).
- `successUrl = ${baseUrl}/spaces/${spaceId}/booking/return?session_id={CHECKOUT_SESSION_ID}`.
- `cancelUrl  = ${baseUrl}/spaces/${spaceId}?booking_cancelled=1`.
- Pre-claim booking row is INSERTed at step 7 BEFORE the Stripe round-trip — payment_status='AWAITING_PAYMENT', payment_intent_id=NULL. The booking row holds the (desk_id, booking_date) slot via the partial unique index.

### Client trigger
- `src/app/spaces/[id]/book-desk-button.tsx:30-74` — `<BookDeskButton>` form posts to the action; on `status === 'success'`, calls `window.location.assign(state.redirectUrl)` (BA Decision §7 — Server Actions can't return external redirects across the form boundary cleanly).

### Return-URL handler
- `src/app/spaces/[id]/booking/return/page.tsx` (Server Component). 6-step flow: read session_id → `retrieveCheckoutSession(sessionId)` → belt-and-suspenders verify `session.status === 'complete'` AND `paymentIntent.status === 'requires_capture'` → lookup booking by `metadata.bookingId || client_reference_id` → cross-tenant verify guest → `markBookingAuthorized({ bookingId, paymentIntentId })` → `redirect('/my-bookings?just_booked=1')`.
- `src/app/spaces/[id]/booking/return/loading.tsx` (DESIGN-INT-18) renders the Stripe-S chrome interstitial while the Server Component does its work.

### Webhook backstop
- `src/lib/payments/webhooks.ts:216-303` — `handleCheckoutSessionCompleted`. Reads `session.metadata.bookingId` + `session.payment_intent`. Calls `markBookingAuthorized(...)`. Conditional WHERE makes the return-URL-vs-webhook race a no-op — whichever wins first transitions the booking, the loser silently no-ops.

### Booking-id round-trips through Stripe
- `payment_intent_data.metadata.bookingId` — survives on the PaymentIntent, queried by 9-5's `handlePaymentIntentSucceeded` rescue path.
- `client_reference_id` at Session level — used by the return-URL handler.
- `payment_intent_data.application_fee_amount` + `transfer_data.destination` — destination-charge marketplace shape, unchanged for embedded.

### Prototype shape (HostPayouts of BookingFlow — `DeskHive Prototype.html` lines 1044-1194)
- Left column: payment form area (card number + exp/cvc + cardholder name + email + 'Pay $X' button). Stripe-S chrome at top.
- Right column: summary Card with space photo + name + desk + date + Row(Day rate, $X) + Row(Platform fee 15%, $Y) + divider + Row(Total due today, $Z bold) + "Authorisation only. You'll only be charged after the host confirms." copy + "Funds are held on your card via Stripe…" footer.
- 2-column grid `md:grid-cols-2 gap-8 items-start`, container `max-w-5xl`, light background `#F6F9FC` to evoke Stripe's hosted Checkout.

## Migration target — Stripe Embedded Checkout

Per Stripe's docs (https://docs.stripe.com/checkout/embedded/quickstart):

1. **Server creates a Session with `ui_mode: 'embedded'` and `return_url` instead of `success_url`/`cancel_url`.** Returns `client_secret` instead of `url`.
2. **Client mounts `<EmbeddedCheckoutProvider>` from `@stripe/react-stripe-js`** with the `client_secret`, then `<EmbeddedCheckout>` inside it.
3. **On payment success, Stripe redirects in-page to `return_url` with `?session_id={CHECKOUT_SESSION_ID}`.** Our existing return-URL handler is already shaped for this — no change needed.
4. **Webhook contract unchanged** — Stripe still emits `checkout.session.completed` with the same payload; metadata + payment_intent linkage flow identically. `handleCheckoutSessionCompleted` does NOT change.

## Files to change

| File | Change |
|---|---|
| `src/lib/payments/checkout.ts` | **Add** `createEmbeddedCheckoutSession(args): StripeServiceResult<{ sessionId; clientSecret }>` next to existing `createCheckoutSession`. Same metadata + line_items + payment_intent_data, but `ui_mode: 'embedded'` + `return_url` replaces `success_url`/`cancel_url`. **Do NOT delete** the existing function in Phase 2. |
| `src/actions/booking-with-payment.ts` | **Add** sibling action `createBookingWithPaymentEmbeddedAction` returning `{ status: 'success', clientSecret, sessionId }` (NOT `redirectUrl`). Reuses all 8 of the existing 9 steps; only step 9's Stripe call differs. Feature-flag-gated dispatch in step 9. |
| `src/components/booking-checkout-embed.tsx` | **NEW.** Client Component mounting `<EmbeddedCheckoutProvider>` + summary panel. Accepts `clientSecret`, `space`, `desk`, `bookingDate`, `totalCents`, `platformFeeCents`. Handles loading + error states. |
| `src/app/spaces/[id]/book-desk-button.tsx` | **No change in Phase 2.** Phase 3 will branch the success handler: if action returns `clientSecret` (new), navigate to a new `/spaces/[id]/booking/checkout?bid=...` page that mounts the embed; if it returns `redirectUrl` (legacy), keep the `window.location.assign`. Feature flag drives which action is called. |
| `src/app/spaces/[id]/booking/checkout/page.tsx` | **NEW route (Phase 2).** Auth-gated Server Component that loads the booking row + space + desk by id, calls the new embedded action OR receives the client_secret via search params, renders `<BookingCheckoutEmbed>`. **Initially unreachable** (no caller wires to it until Phase 3). |
| `src/app/spaces/[id]/booking/return/page.tsx` | **No change.** Stripe redirects to the same URL shape (`?session_id=…`); verification logic is shared. |
| `package.json` | **Add** `@stripe/react-stripe-js` + `@stripe/stripe-js` (Embedded Checkout's client SDK). Existing `stripe` (server SDK 22.x) already supports `ui_mode: 'embedded'`. |
| `.env.example` | **Add** `NEXT_PUBLIC_CHECKOUT_EMBED_ENABLED=false` + `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_…` documentation. **Do NOT write `.env.local`** — instruct BA to add. |

## Files NOT changing — load-bearing

- `src/lib/payments/webhooks.ts` — `handleCheckoutSessionCompleted` reads `session.metadata.bookingId` + `session.payment_intent`. Identical payload shape between hosted + embedded. **Zero changes.**
- `src/lib/payments/refunds.ts`, `src/lib/payments/payouts.ts`, `src/lib/payments/payment-intents.ts` — entirely off the Checkout path.
- `src/lib/email-templates/*`, `src/lib/email.ts`, `src/lib/bookings.ts` (notify helpers) — fire on webhook events, not on Checkout creation. **Zero changes.**
- `src/db/queries/bookings.ts` — `markBookingAuthorized` + `createBooking` + `getBookingById` shapes unchanged.
- `src/db/schema.ts` — no new columns.
- `src/app/spaces/[id]/booking/return/page.tsx` — return-URL handler. Stripe's `?session_id={CHECKOUT_SESSION_ID}` substitution works the same way for embedded `return_url`.
- `src/app/spaces/[id]/booking/return/loading.tsx` — DESIGN-INT-18 chrome stays.

## Feature flag

`NEXT_PUBLIC_CHECKOUT_EMBED_ENABLED`. Default `false`. Read in `<BookDeskButton>` to choose which Server Action to call:
- `false` → `createBookingWithPaymentAction` (legacy, returns `redirectUrl`).
- `true` → `createBookingWithPaymentEmbeddedAction` (new, returns `clientSecret`).

Phase 2 ships both paths; Phase 3 flips the default to `true`; Phase 4 removes the flag + the legacy action.

## Mount strategy

`<BookingCheckoutEmbed>`:

```tsx
'use client';

import { useEffect, useState } from 'react';
import { loadStripe, type Stripe } from '@stripe/stripe-js';
import {
  EmbeddedCheckoutProvider,
  EmbeddedCheckout,
} from '@stripe/react-stripe-js';

const stripePromise = loadStripe(
  process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!,
);

export function BookingCheckoutEmbed({ clientSecret, summary }: {…}) {
  // EmbeddedCheckoutProvider options accept either `fetchClientSecret`
  // (server callback) or `clientSecret` (direct). We use the latter —
  // the client_secret was created in the action's step 9 already.
  return (
    <div className="grid md:grid-cols-2 gap-8 items-start">
      <div id="checkout">
        <EmbeddedCheckoutProvider stripe={stripePromise} options={{ clientSecret }}>
          <EmbeddedCheckout />
        </EmbeddedCheckoutProvider>
      </div>
      <BookingSummaryCard {…summary} />
    </div>
  );
}
```

### Loading + error states
- `loadStripe(...)` is async; `<EmbeddedCheckoutProvider>` itself renders a Stripe spinner while it initializes. We don't need a custom spinner; per the prototype's chrome we add a "Loading payment form…" placeholder + DESIGN-INT-18-style Stripe-S badge above.
- Error state: `<EmbeddedCheckoutProvider>` will throw if `clientSecret` is invalid (e.g., Session expired). We render an inline error card with "Booking unavailable — try again" + a button that hits `createBookingWithPaymentEmbeddedAction` afresh.

## return_url handling

Embedded Checkout's `return_url` is hit AFTER the in-page payment completes. Stripe substitutes `{CHECKOUT_SESSION_ID}` exactly like hosted. So:

```ts
return_url: `${baseUrl}/spaces/${spaceId}/booking/return?session_id={CHECKOUT_SESSION_ID}`
```

is identical to the current `success_url`. The return-URL handler (which is the GET endpoint) already does the verify → markAuthorized → redirect-to-`/my-bookings?just_booked=1` flow. Reuses verbatim.

## Cancel / dismiss handling

Embedded Checkout has no separate `cancel_url`. The user can:
1. Click "Pay" → completes → return_url fires.
2. Navigate away (back button / nav link) → no Stripe-side event. The `AWAITING_PAYMENT` booking row sits; Story 9-5's `checkout.session.expired` webhook will DELETE it after Stripe's 24h Session TTL elapses (handler unchanged).

We add a "← Back to space" link in the summary card that hard-navigates to `/spaces/[id]?booking_cancelled=1`. Same Phase-1 cancel-URL behavior; just a client-side nav.

## E2E + test impact

| Test | Impact |
|---|---|
| `src/actions/booking-with-payment.test.ts` (5 tests) | Legacy action retained in Phase 2; tests pass unchanged. Phase 4 removes legacy → these tests delete OR move to `…embedded.test.ts`. |
| `src/lib/payments/checkout.test.ts` (2 tests) | Legacy `createCheckoutSession` retained; tests pass. Phase 2 adds tests for `createEmbeddedCheckoutSession`. |
| `tests/e2e/booking-with-payment.spec.ts` | Currently has 1 test on the gated `STRIPE_NOT_ACTIVE` path — uses the action's return state, doesn't actually drive Stripe. **No change Phase 1-3.** Phase 4 may need to update the happy-path E2E (currently `did not run` set) to use the embed mount; deferred to a follow-up. |
| Unit tests overall | 461 baseline. Phase 2 adds ~5 new tests (`createEmbeddedCheckoutSession` happy path + error mapping; component mount smoke test). Phase 4 removes ~5 legacy tests. Net +0. |

## Phase 2 component testability

Vitest can mount `<BookingCheckoutEmbed>` by mocking `@stripe/stripe-js` (`loadStripe` returns a stub `Stripe` object) + `@stripe/react-stripe-js` (`EmbeddedCheckoutProvider` + `EmbeddedCheckout` as pass-through divs). We get:
- Component renders without throwing given a non-empty `clientSecret`.
- Summary card renders the right amounts (day rate / 15% fee / total).
- Error state renders when `clientSecret` is empty.

We don't simulate Stripe's actual rendering — that's E2E territory.

## Rollback plan

If BA-walk at the CHECKPOINT or post-Phase-3 reveals issues, the revert is:

```sh
# Phase 3 flip introduced as commit <hash>; revert it:
git revert <phase-3-flip-commit-hash>
# OR force-flag-off:
# in .env.local set NEXT_PUBLIC_CHECKOUT_EMBED_ENABLED=false and restart.
```

Phase 3 commit will be a single atomic change to `<BookDeskButton>` + the new `/spaces/[id]/booking/checkout/page.tsx` mount. `git revert` cleanly restores the legacy `window.location.assign(redirectUrl)` path. The legacy `createBookingWithPaymentAction` + `createCheckoutSession` remain on disk through Phase 3 expressly to enable single-commit reverts.

## Hard constraints respected throughout

- Webhook handler logic — zero changes (same `checkout.session.completed` event, same payload).
- Refund / payout / email-sending logic — zero changes.
- Story 8-4 sprint-status — untouched (still `done`).
- `.env.local` — NEVER written by the assistant; BA adds the feature flag locally.
- Sequential commits + push per phase.
- No `--amend`.
- `data-testid` attributes preserved on `<BookDeskButton>`; new ones added for `<BookingCheckoutEmbed>` + summary card.

## BA-walk script (after Phase 2)

1. `npm install` (will pick up the new `@stripe/react-stripe-js` + `@stripe/stripe-js` deps from package.json).
2. Add to `.env.local`:
   ```
   NEXT_PUBLIC_CHECKOUT_EMBED_ENABLED=true
   NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_…   (from Stripe dashboard → Developers → API keys)
   ```
3. Restart `pnpm dev`. Restart `stripe listen` if running.
4. Sign in as `guest@deskhive.local` (or `marketadteam@gmail.com` / `marketadteam+1test@gmail.com` per the active routing).
5. Browse → pick a Cedar-equivalent space → pick a date → click "Book this desk".
6. Verify: the embedded Checkout iframe renders inline on a new `/spaces/[id]/booking/checkout?bid=…` page alongside the summary card on the right. **No redirect off-site.**
7. Pay with test card `4242 4242 4242 4242`, any future exp, any 3-digit CVC.
8. Verify return: URL lands at `/my-bookings?just_booked=1`, booking row visible in `webhook_events` (`checkout.session.completed`) + booking row status moves to `PENDING` / `payment_status=AUTHORIZED`.
9. Verify receipt email arrives at `marketadteam@gmail.com` (post-DESIGN-INT-11 polish; per-recipient routing handles whoever is the verified address).
10. Toggle the flag to `false`, restart, repeat — verify the legacy hosted redirect still works.

## Stop-conditions

- Phase 1 (this plan) → commit → push → proceed to Phase 2.
- Phase 2 (parallel endpoint + component) → commit → push → **STOP at CHECKPOINT**.
- BA approves → proceed to Phase 3 → commit → push.
- BA approves Phase 3 → Phase 4 → commit → push.
- All passing → Phase 5 final report → commit → push.

If Phase 2 build/typecheck/lint fail → don't push; fix in place. If Phase 2 BA-walk fails post-CHECKPOINT → debug in Phase 2 commits; do NOT proceed to Phase 3.
