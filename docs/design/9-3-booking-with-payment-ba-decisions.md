# Story 9-3: Booking with Payment via Stripe Checkout — BA Decisions

**Story:** 9-3
**Epic:** 9 — Payments (Theme B)
**Phase:** 2
**Type:** Schema migration + Server Action + payment integration + Server Component return-URL handler + narrow webhook extension
**Author:** Ikhtiyor Ziyayev, Business Analyst
**Date drafted:** 2026-05-18
**Status:** LOCKED 2026-05-18. Ready for dispatch.
**Source:** Phase 2 PRD §4.4 (FR-PAY 1-8), §4.7, §6.1 (bookings schema additions), §6.3 (`createBookingWithPaymentAction`), §6.4 (webhook events), §8 Epic 9 Story 9-3

**Companion / dependency chain:**
- **Story 9-1** (Stripe SDK wrapper) shipped at `aff4060`. Provides `src/lib/stripe.ts` singleton + `StripeServiceResult<T>` discriminated union.
- **Story 9-2** (Stripe Connect Express onboarding) shipped at `0d384e0`. Provides `stripe_connect_accounts` table + narrow webhook handler at `src/app/api/stripe/webhook/route.ts` + `getConnectAccountByUserId` query helper.
- **Story 9-2b** (publish gating) shipped at `7e7251c` + `2d65c54`. Provides the DRAFT enum + the cached-Connect-state-active check pattern (read DB row, no Stripe SDK call at the gate).

Story 9-3 cannot dispatch until all three are on `main` (they are). 9-3 is the first Phase 2 story that exercises real money flow (test mode) — every prior payment story was infrastructure or owner-side setup.

---

## Context

**Phase 2 PRD §4.4 — Payment Flow (Test Mode):**

- **FR-PAY-1:** Booking flow extends to include a Stripe payment step. After Guest clicks Book this desk, the client redirects to Stripe-hosted Checkout. **PRD-locked: use Stripe Checkout, NOT Elements** — fewer custom UI components, faster to ship.
- **FR-PAY-2:** Payment Intent created with `capture_method: 'manual'` — funds authorized but not captured. Holds money on Guest's card without charging.
- **FR-PAY-3:** On successful payment authorization, booking is created with status PENDING and `payment_intent_id` linked. On authorization failure, booking is NOT created; error toast shown to Guest.
- **FR-PAY-7:** Platform fee is **15% of booking total**, calculated in cents. Stored on the booking row as `platform_fee_cents`. Owner payout = `total_cents - platform_fee_cents`.
- **FR-PAY-8:** All money math goes through `src/lib/money.ts` extensions.

**Phase 2 PRD §6.1 — bookings table additions for 9-3:**

```sql
ALTER TABLE bookings ADD COLUMN payment_intent_id TEXT;
ALTER TABLE bookings ADD COLUMN total_cents INTEGER NOT NULL DEFAULT 0;
ALTER TABLE bookings ADD COLUMN platform_fee_cents INTEGER NOT NULL DEFAULT 0;
-- (refunded_at + refund_amount_cents are 9-6 territory; NOT in 9-3.)
```

Note: Phase 1's bookings table already has `payment_status TEXT` (nullable) — a Doc A §7.4 forward-compat field. 9-3 will populate it (see Decision §3).

**Phase 2 PRD §4.7 — Existing Phase 1 Functionality:**

> "Booking confirmation toast (Story 6-3) extends to handle the new payment step's success/error states."

This is the only PRD line that mentions Phase 1 booking continuity. Practically: the existing `createBookingAction` + `<BookDeskButton>` get replaced with a `createBookingWithPaymentAction` + a redesigned button that initiates a redirect to Stripe Checkout instead of creating the booking inline. The toast moves from "Booking requested" (fires immediately) to "Booking requested" (fires on the return-from-Checkout page).

**PRD divergence note (spirit-vs-letter, no PRD amendment needed):** FR-PAY-3 says *"booking is created on successful payment authorization."* Story 9-3's pre-claim model (Decision §3) inserts the PENDING booking row before the Stripe Checkout redirect. The PRD wording describes the happy-path outcome, not the ordering. The pre-claim model honors the spirit (booking exists in PENDING after successful auth) while solving the slot-claim race that the literal ordering would create (two guests racing on the same desk/date both pay; refund-the-loser would be the only remediation). Documented as spirit-vs-letter; no PRD amendment needed.

**What 9-3 does NOT touch (carved by 9-4 / 9-5 / 9-6 / 9-7):**

- ❌ Payment capture (Space Owner clicks Confirm) — Story 9-4.
- ❌ Payment cancel (Space Owner clicks Reject) — Story 9-4.
- ❌ Refund flow (Guest cancels with payment reversal) — Story 9-6.
- ❌ Full webhook dispatch generalization (`payment_intent.succeeded`, `payment_intent.payment_failed`, `charge.refunded`, `payout.paid`) — Story 9-5. **9-3 ships a narrow webhook handler extension for `checkout.session.completed` only** — see Decision §6.
- ❌ Payouts view (`/owner/payouts`) — Story 9-7.
- ❌ Payment-driven emails (receipt, payment failed) — Story 8-4 (depends on 9-5's webhook dispatch).
- ❌ Frontend Stripe SDK (`@stripe/stripe-js`) — see Decision §7 (deferred from 9-1, deferred again here).

---

## Scope

**In scope:**

- **Drizzle schema:** add `paymentIntentId TEXT`, `totalCents INTEGER NOT NULL DEFAULT 0`, `platformFeeCents INTEGER NOT NULL DEFAULT 0` to `bookingsTable`. Drizzle-generates migration `0005_*.sql`. (`payment_status` column already exists from Phase 1.) See Decision §1.
- **Money helpers:** extend `src/lib/money.ts` with `calculatePlatformFee(amountCents, feeBps)` + `calculateOwnerPayout(amountCents, feeCents)`. PRD-locked. See Decision §2.
- **New Server Action `createBookingWithPaymentAction`** — replaces the existing `createBookingAction` for Guest bookings. Validates the booking inputs, performs the Connect-state-active gate, INSERTs a booking in PENDING + `paymentStatus: 'AWAITING_PAYMENT'` + `paymentIntentId: NULL` (claims the desk for the date via the existing partial unique index), then creates a Stripe Checkout Session in `manual` capture mode with `transfer_data.destination` + `application_fee_amount`, and returns the Session URL. See Decision §3 + §4 + §5.
- **New sub-module `src/lib/payments/checkout.ts`** — `createCheckoutSession({ ...args })` wrapper returning `StripeServiceResult<{ sessionId, url }>`. Mirrors 9-2's `src/lib/payments/connect.ts` sub-module pattern. See Decision §4.
- **`<BookDeskButton>` rewrite** — Client Component uses `useTransition` + `window.location.assign(url)` to redirect to Stripe Checkout. Mirrors 9-2's `<OnboardingCtaButton>` pattern. The success-state toast moves from this button to the return-from-Checkout Server Component.
- **New return-from-Checkout Server Component** at `src/app/spaces/[id]/booking/return/page.tsx` (or similar — Amelia picks the exact path) — reads `?session_id=cs_xxx` query param, verifies the Session status, looks up the corresponding booking, redirects to `/my-bookings` with a success state OR back to `/spaces/[id]` with an error state. See Decision §5.
- **Narrow webhook handler extension** in `src/app/api/stripe/webhook/route.ts` — add a `checkout.session.completed` branch that backfills the booking's `paymentIntentId` + `paymentStatus` if the return-URL handler missed it (e.g., Guest closed browser between paying and the redirect). Mirrors how 9-2 extended this file for `account.updated`. See Decision §6.
- **Connect-state-active gate at booking-create boundary** — `createBookingWithPaymentAction` reads the space's owner's `stripe_connect_accounts` row (cached state, no live Stripe SDK call) and refuses booking with a typed `STRIPE_NOT_ACTIVE` error code if `charges_enabled !== true OR payouts_enabled !== true`. Parallels 9-2b's `publishSpaceAction` gate. See Decision §8.
- **Idempotency keys** — per-attempt UUID for the Checkout Session creation; per-booking-row-id for the booking insert (the existing `uniq_active_booking_per_desk_per_date` partial unique index handles the slot-claim race). See Decision §9.
- **Toast copy extensions** in `src/lib/toast.ts` — new `TOAST_COPY` constants for booking-payment errors. See Decision §10.
- **Unit tests** — `createBookingWithPaymentAction` happy path + 4 error branches; `calculatePlatformFee` + `calculateOwnerPayout`; webhook handler's new `checkout.session.completed` branch. See Decision §11.
- **E2E tests** — happy path (covers up to the Stripe Checkout redirect boundary; cross-origin Stripe-hosted UI not entered by Playwright); gated path (no Connect → action returns STRIPE_NOT_ACTIVE before Checkout). See Decision §12.
- **Memory:** extend `reference_stripe_service_pattern.md` with the booking-with-payment section. See Decision §13.

**Out of scope (deferred to Story 9-4 / 9-5 / 9-6 / 9-7 / 8-4):**

- ❌ Capture-on-Confirm flow (9-4)
- ❌ Cancel-on-Reject flow (9-4)
- ❌ Full webhook dispatch generalization beyond `checkout.session.completed` (9-5)
- ❌ Refund flow + 24-hour policy (9-6)
- ❌ `/owner/payouts` view (9-7)
- ❌ Payment receipt + payment-failed emails (8-4)
- ❌ Cleanup of abandoned-payment bookings (PENDING + AWAITING_PAYMENT + created > N minutes ago) — deferred to Story 9-5 / a polish backlog item per Decision §3. Phase 2 demo flow does not exercise the abandonment path; BA-walk-triggered orphans can be manually cleared from the DB.
- ❌ Phase 2 PRD §4.5 cancel-interpretation (CONFIRMED + within-24h cancellation policy) — 9-6 territory.
- ❌ `@stripe/stripe-js` install (deferred — Decision §7).
- ❌ Admin-side booking-creation flow (Phase 1's `/admin/bookings` continues to work; admins don't create bookings directly via the UI).

---

## Decisions

### Decision 1: Schema additions to `bookings` — minimal columns + reuse existing `payment_status`

**Rationale:** PRD §6.1 mandates `payment_intent_id`, `total_cents`, `platform_fee_cents`. Phase 1's bookings table already has `payment_status TEXT` (nullable) per Doc A §7.4 forward-compat. 9-3 doesn't need new state-machine columns beyond these three.

**Locked proposal:**

```typescript
// src/db/schema.ts — bookingsTable additions for 9-3
paymentIntentId: text('payment_intent_id'),
totalCents: integer('total_cents').notNull().default(0),
platformFeeCents: integer('platform_fee_cents').notNull().default(0),
```

Drizzle-generated migration `0005_<name>.sql`:
- 3 `ALTER TABLE bookings ADD COLUMN ...` statements.
- `DEFAULT 0` for the integer columns covers the backfill of Phase 1 seeded bookings (which have `totalPriceCents` already; 9-3 leaves Phase 1 rows untouched at 0/0 — they're already CONFIRMED/REJECTED/CANCELLED so the new columns don't affect them).
- **NO** `NOT NULL` on `payment_intent_id` — it's NULL while the Guest is mid-Checkout (the AWAITING_PAYMENT pre-claim state) and gets populated either by the return-URL handler or by the webhook backfill.

**Story-tag comment block at the top of the generated migration:** explain the three columns + the Phase 1 backfill stance + rollback hint (DROP COLUMN three times). Same convention as `0003_numerous_stone_men.sql` and `0004_fine_ronan.sql`.

**Anti-pattern forbidden:**
- Do NOT add a new `bookings.status` enum value (e.g., 'PENDING_PAYMENT'). The existing 4-state enum (PENDING / CONFIRMED / REJECTED / CANCELLED) is sufficient — the AWAITING_PAYMENT pre-claim state is tracked via the new `payment_status` value, NOT a new top-level status.
- Do NOT add `refunded_at` / `refund_amount_cents` — those are 9-6 territory. Keep 9-3 lean.
- Do NOT make `payment_intent_id` `UNIQUE` at the DB level — Stripe Payment Intent IDs are unique by construction, and a unique constraint here would conflict with the AWAITING_PAYMENT row's NULL value (well, NULL is allowed in UNIQUE on PG, but the lookup-by-PI-id path in 9-4 doesn't need it; let an index be added later if 9-4 needs it).

---

### Decision 2: Money helper extensions — `calculatePlatformFee` + `calculateOwnerPayout`

**Rationale:** PRD §4.4 FR-PAY-7: platform fee is 15% of booking total, in cents. PRD §4.4 FR-PAY-8 mandates all money math through `src/lib/money.ts`.

**Locked proposal:**

```typescript
// src/lib/money.ts — new exports

/**
 * Platform fee as a percentage of the booking total, in cents.
 *
 * Phase 2 uses 1500 bps (15%) per PRD FR-PAY-7. Storing the rate as
 * basis points rather than a float keeps the math integer-only.
 *
 * @param amountCents — the booking total in cents (non-negative integer)
 * @param feeBps — fee in basis points (e.g., 1500 = 15%). Default 1500.
 * @returns fee in cents, rounded to nearest integer (banker's rounding
 *          NOT used — Phase 2 rounds toward zero via Math.floor, locked
 *          by PRD FR-PAY-7's "calculated in cents" wording).
 */
export function calculatePlatformFee(amountCents: number, feeBps = 1500): number;

/**
 * Owner payout = total - fee. Same integer-only guarantee.
 */
export function calculateOwnerPayout(amountCents: number, feeCents: number): number;
```

**Why basis points (bps) over a decimal:**
- 15% as `0.15` is a float — multiplying a cents integer by 0.15 returns a float.
- 1500 bps as an integer keeps everything integer. `Math.floor(amountCents * 1500 / 10000)`.
- Phase 3 may need fees < 1% (e.g., a small payment-processing carve-out) — bps gives sub-1% precision without floats.

**Locked sub-decisions:**

- **(a) Rounding direction: `Math.floor`** (toward zero). Platform never collects more than the nominal 15% — any sub-cent remainder accrues to the owner payout. Predictable, single-direction; no banker's-rounding ambiguity. PRD's "15% calculated in cents" leaves the rounding rule open; `Math.floor` is the conservative platform-cut choice.
- **(b) Fee BPS storage: hardcoded `1500` constant in `src/lib/money.ts`** (with an inline Phase 3 migration comment, mirroring 9-2's `country: 'US'` hardcoded pattern). Phase 2 is a single-fee-rate marketplace; the constant lives next to the math. Phase 3 moves it to env or a `platform_settings` table when per-owner / per-region rates become real requirements. The migration comment in `money.ts` documents the future seam.

**Anti-pattern forbidden:**
- Do NOT use floating-point math anywhere (`*0.15`, `parseFloat`, etc.). Phase 2 PRD CC-2 anti-pattern.
- Do NOT round at intermediate steps — calculate `feeCents` once, derive `payoutCents = totalCents - feeCents` from it. Avoids drift if two callers round independently.
- Do NOT read `PLATFORM_FEE_BPS` from env in Phase 2 — the env-driven seam belongs to Phase 3. Adding it now would invite per-environment drift before any product reason demands variance.

---

### Decision 3: Booking record state machine + slot-claim race

**LOAD-BEARING DECISION** — affects everything downstream.

**The problem:** Phase 1's `createBookingAction` inserts the booking row before any payment exists. The partial unique index `uniq_active_booking_per_desk_per_date WHERE status IN ('PENDING','CONFIRMED')` rejects double-bookings at the DB layer. With Stripe Checkout in the loop, the booking creation is no longer atomic with the user's "Book this desk" click — there's a redirect-to-Stripe-and-back gap.

**Two race scenarios:**

1. **Two guests race on the same desk/date:** Guest A clicks Book → Checkout Session created → Guest A on Stripe paying. Guest B clicks Book → also gets a Checkout Session → also on Stripe paying. Both successfully authorize. Server tries to insert two bookings for the same desk/date — one wins, the other loses with a unique violation, but **the loser has already had their card authorized.** Refund the loser? Bad UX.

2. **Guest closes browser mid-Checkout:** Guest A authorizes payment, then closes the browser tab before the success_url redirect fires. The booking never gets created server-side, but the payment authorization is live on Stripe.

**Three options for resolution:**

- **(A) Pre-claim the slot with a PENDING booking row before creating the Checkout Session.** Booking exists in PENDING + `payment_status='AWAITING_PAYMENT'` + `payment_intent_id=NULL`. Partial unique index blocks Guest B at the booking-insert step BEFORE Stripe is involved. Guest B sees "this desk was just booked" toast and never gets charged. Guest A's Checkout Session URL is returned. Guest A either:
  - Completes Checkout → return-URL handler updates booking with `payment_intent_id`, `payment_status='AUTHORIZED'`. Webhook backstop if return-URL handler is missed.
  - Abandons Checkout → the booking row sits in AWAITING_PAYMENT indefinitely. **Cleanup mechanism needed** (see open question below).

- **(B) Create booking AFTER successful payment authorization, accept the race, refund the loser.** Matches the PRD's FR-PAY-3 wording literally ("On successful payment authorization, the booking is created"). But the refund-the-loser path is real money flow (test mode for Phase 2) and bad UX even in test mode.

- **(C) Use Stripe-side locking (`payment_intent_data.metadata` + atomic UPDATE).** Convoluted; introduces a Stripe-as-state-store anti-pattern.

**Locked: (A) — pre-claim with PENDING + AWAITING_PAYMENT.**

**Why over (B):** the PRD's FR-PAY-3 wording is the literal description of the happy-path outcome — booking exists in PENDING after successful auth. It doesn't actually mandate the ordering of booking-insert and Checkout-redirect. Pre-claiming uses Phase 1's race-safe partial unique index (battle-tested) instead of introducing a refund-the-loser flow that doesn't exist anywhere else in the codebase.

**Why over (C):** Stripe is for payments, not coordination. Use the DB.

**Booking state machine after 9-3:**

```
[booking-insert in createBookingWithPaymentAction]
  status='PENDING', payment_status='AWAITING_PAYMENT', payment_intent_id=NULL
  ↓
[Checkout Session created, Guest redirected to Stripe]
  ↓
  ├── Guest completes auth → return-URL handler OR checkout.session.completed webhook
  │     UPDATE booking SET payment_intent_id='pi_...', payment_status='AUTHORIZED'
  │     (status stays PENDING — capture happens in Story 9-4 on Owner Confirm)
  │
  └── Guest abandons Checkout (browser close, cancel button, timeout)
        Booking row stays in AWAITING_PAYMENT indefinitely (no auto-cleanup in 9-3)
```

> **Phase 2 demo flow does not exercise the abandonment path. Manual DB cleanup acceptable for BA walks. Story 9-5 will handle via `checkout.session.expired` or a dedicated mechanism.**

**Locked sub-decisions:**

1. **Cleanup of abandoned-payment bookings: DEFERRED (option iii).** 9-3 ships no cleanup mechanism. Abandoned `PENDING + AWAITING_PAYMENT + payment_intent_id IS NULL` rows persist until manually cleaned or until Story 9-5 lands a `checkout.session.expired` handler. Rationale: the Phase 2 demo flow (PRD §1.2) is a single-user happy-path walk that never abandons Checkout; a Phase 2 polish or 9-5 will handle the abandonment case alongside the broader webhook dispatch. Until then, BA walks that DO trigger abandonment can clear the row via a one-line DB query.

   **Operational consequence:** an abandoned booking row holds the desk/date slot in the partial unique index. If the same Guest re-clicks Book for the same desk/date, they'll see `DOUBLE_BOOKING` from their own prior orphan. This is acceptable for Phase 2 — the BA can clean manually; 9-5 will fix structurally.

2. **`payment_status` CHECK constraint: LOCKED YES.** 9-3 introduces a `bookings_payment_status_check` constraint enforcing `payment_status IN ('AWAITING_PAYMENT', 'AUTHORIZED')`. Existing Phase 1 NULL rows continue to satisfy the constraint (PG CHECK constraints allow NULL by default). Stories 9-4 + 9-6 extend the constraint via the same DROP CONSTRAINT / ADD CONSTRAINT migration pattern that 9-2b used for `spaces.status`:
   - Story 9-4 extends to `('AWAITING_PAYMENT', 'AUTHORIZED', 'CAPTURED')`.
   - Story 9-6 extends to `('AWAITING_PAYMENT', 'AUTHORIZED', 'CAPTURED', 'REFUNDED')`.

   The constraint is added in the same `0005_*.sql` migration as the 3 new columns (Decision §1).

3. **Legacy `createBookingAction` fate: LOCKED DELETE.** 9-3 removes Phase 1's `createBookingAction` entirely. Single source of truth — the Guest booking path is `createBookingWithPaymentAction`. The Phase 1 action has no remaining call sites after the `<BookDeskButton>` rewrite; keeping it as dead code violates the "no half-finished or unused exports" principle. `CreateBookingActionState` type goes with it; the new action defines its own state shape (see Decision §11 for the new error codes).

**Anti-pattern forbidden:**
- Do NOT keep Phase 1's `createBookingAction` as a legacy export. Delete the export, delete the function, delete its type. The call site in `<BookDeskButton>` is the only consumer; both move together.
- Do NOT ship a 9-3 cleanup mechanism (cron, in-band, or webhook). Cleanup is 9-5 territory.
- Do NOT delete the booking row on Stripe abandonment via a webhook (`checkout.session.expired`) — also deferred to 9-5 per Decision §6.
- Do NOT add a new status value to the bookings.status enum. The PENDING state is enough; payment_status carries the payment sub-state.

---

### Decision 4: Stripe Checkout integration — destination charge + manual capture + sub-module pattern

**Stripe API choice: Checkout Session with `mode: 'payment'`, `payment_intent_data` configured for manual capture + Connect destination charge.**

**Locked proposal — `createCheckoutSession` signature:**

```typescript
// src/lib/payments/checkout.ts (new sub-module; mirrors 9-2's connect.ts)
import { stripe } from '@/lib/stripe';
import type { StripeServiceResult } from '@/lib/stripe-service';

export async function createCheckoutSession(args: {
  spaceName: string;             // for line_items.price_data.product_data.name
  amountCents: number;            // total booking price in cents
  platformFeeCents: number;       // platform's cut (Story 9-3 Decision §2)
  ownerStripeAccountId: string;   // destination — from stripe_connect_accounts
  bookingId: string;              // pre-claimed booking row id — used as
                                  //   client_reference_id for webhook lookup
  guestEmail: string;             // pre-fills the Checkout email field
  successUrl: string;             // absolute URL with {CHECKOUT_SESSION_ID}
  cancelUrl: string;              // absolute URL (Guest abandoned)
  idempotencyKey: string;         // per-attempt UUID
}): Promise<StripeServiceResult<{ sessionId: string; url: string }>>;
```

**The Stripe API call body:**

```typescript
const session = await stripe.checkout.sessions.create({
  mode: 'payment',
  line_items: [{
    quantity: 1,
    price_data: {
      currency: 'usd',
      unit_amount: args.amountCents,
      product_data: { name: `Desk booking — ${args.spaceName}` },
    },
  }],
  payment_intent_data: {
    capture_method: 'manual',                        // PRD FR-PAY-2
    transfer_data: { destination: args.ownerStripeAccountId },
    application_fee_amount: args.platformFeeCents,    // platform's cut
    metadata: { bookingId: args.bookingId },          // for webhook backfill
  },
  client_reference_id: args.bookingId,                // also on the Session itself
  customer_email: args.guestEmail,                    // pre-fill
  success_url: args.successUrl,                       // e.g., /spaces/[id]/booking/return?session_id={CHECKOUT_SESSION_ID}
  cancel_url: args.cancelUrl,                         // e.g., /spaces/[id]
}, {
  idempotencyKey: args.idempotencyKey,
});
```

**Connect-charge variant: destination charge with `transfer_data.destination`.**

Stripe offers three Connect charge patterns: destination charges, separate-charges-and-transfers, and direct charges on connected account. For DeskHive's "one space per booking, one owner per space" model:

- **Destination charges (locked):** the platform charges the customer; the funds settle to the platform's Stripe account; Stripe automatically transfers the payout (minus platform fee) to the connected account on capture. Single Payment Intent. Single Charge object. Cleanest accounting.
- Separate charges + transfers: too much bookkeeping for a simple 15% fee model.
- Direct charges: the connected account is the merchant of record; fee model gets complicated.

Destination charges with `transfer_data.destination` + `application_fee_amount` is the Stripe-recommended marketplace pattern and what DeskHive needs.

**Why a new sub-module `src/lib/payments/checkout.ts`** (vs. adding to `connect.ts`):
- 9-2's `connect.ts` handles Connect account / Account Links. Adding Checkout to it muddies the seam.
- Each Theme B story extends `src/lib/payments/` with a cohesive new sub-module. Memory entry `reference_stripe_service_pattern.md` already documents this convention (9-2 → `connect.ts`; 9-3 → `checkout.ts`; 9-6 → `refunds.ts`; 9-7 → `payouts.ts`; 9-5 → `webhooks.ts`).
- The `stripe-service.ts` barrel doesn't need a new import — sub-modules are imported directly by Server Actions per the established pattern.

**Anti-pattern forbidden:**
- Do NOT use `mode: 'subscription'` — DeskHive bookings are single-shot.
- Do NOT use `payment_method_types: ['card']` — let Stripe pick the default set from the dashboard config (this is the modern Stripe recommendation; specifying `payment_method_types` is a 2022-era pattern).
- Do NOT set `customer` on the Session (would create a Stripe Customer object) — Phase 2 has no customer persistence model. Use `customer_email` for pre-fill only.
- Do NOT skip `idempotencyKey` — Stripe's network is retried by the SDK, and without an idempotency key a network retry creates a duplicate Session. Per-attempt UUID is the locked pattern (Decision §9).
- Do NOT call `stripe.checkout.sessions.create` from outside `src/lib/payments/checkout.ts`. The wrapper enforces the seam.

---

### Decision 5: Return-from-Checkout handler — Server Component reading `session_id`

**Locked proposal:**

`success_url`: `${BETTER_AUTH_URL}/spaces/[id]/booking/return?session_id={CHECKOUT_SESSION_ID}`

`cancel_url`: `${BETTER_AUTH_URL}/spaces/[id]?booking_cancelled=1`

**Return page Server Component:**

`src/app/spaces/[id]/booking/return/page.tsx`

Flow:
1. Read `?session_id=cs_xxx` query param. If missing or malformed → redirect to `/spaces/[id]` with error toast state.
2. `stripe.checkout.sessions.retrieve(sessionId, { expand: ['payment_intent'] })`. If lookup fails → redirect to `/spaces/[id]` with error state.
3. Verify BOTH `session.status === 'complete'` AND `session.payment_intent.status === 'requires_capture'`. Belt-and-suspenders: `session.status` reflects the Checkout Session lifecycle; `payment_intent.status === 'requires_capture'` confirms that manual-capture mode authorized successfully but did not yet capture (the expected post-9-3 / pre-9-4 state). Either field alone could leave a subtle gap (e.g., `session.status === 'complete'` with an unexpected payment_intent state). If either check fails, redirect to `/spaces/[id]` with an error toast state and DO NOT mark the booking AUTHORIZED.
4. Look up the pre-claimed booking by `session.metadata.bookingId` OR `session.client_reference_id`. Verify the booking is owned by the current session's user (cross-tenant defense — though session arrival here is post-Stripe-redirect so the threat model is narrow).
5. `db.update(bookings).set({ paymentIntentId: session.payment_intent.id, paymentStatus: 'AUTHORIZED' })`. Idempotent — running twice is a no-op.
6. `revalidatePath('/my-bookings')` + `revalidatePath('/spaces/[id]')`.
7. `redirect('/my-bookings?just_booked=1')` so the existing `/my-bookings` page fires the success toast.

**Why a Server Component, not a Server Action:**
- The return-URL is a `GET` navigation — Stripe redirects the browser to it with a query param. That's a page-load, not a form submission.
- The page can call `redirect(...)` from Next.js's `next/navigation` directly (Server Components can throw redirects across page boundaries; Server Actions can't for external URLs but CAN for internal navigations).

**Why the `/my-bookings?just_booked=1` redirect:**
- Existing `/my-bookings` page is where the Guest expects to land after a successful booking (Phase 1 pattern from US-3.3).
- The `?just_booked=1` query param triggers the existing success toast (extends the Story 6-3 pattern; `<MyBookingsPage>` reads the param and fires `toastSuccess('Booking requested', ...)`).
- Alternative considered: fire the toast on the return-URL page itself. Rejected because the return-URL page is transient (immediate redirect away); a toast there wouldn't be seen.

**Anti-pattern forbidden:**
- Do NOT create the booking from the return-URL handler — the booking already exists (pre-claimed in Decision §3). The handler just updates `payment_intent_id` + `payment_status`.
- Do NOT trust `session.client_reference_id` as the only lookup key — verify against `session.metadata.bookingId` too. Belt-and-suspenders.
- Do NOT skip the user-ownership check — a malicious actor could craft a URL with someone else's `session_id` and try to confirm their booking. The bookingId lookup MUST verify `booking.guest_user_id === session.user.id`.
- Do NOT do anything financial on this page — capture happens in Story 9-4 on Owner Confirm. The return-URL handler is purely a state-sync.

---

### Decision 6: Narrow webhook handler extension — `checkout.session.completed` only

**Rationale:** The return-URL handler in Decision §5 handles the happy path. The race where Guest closes their browser between paying and the redirect needs a webhook backstop. Stripe's `checkout.session.completed` event fires when the Checkout Session reaches a terminal success state, regardless of whether the redirect ever fired.

**Locked proposal:** Extend `src/app/api/stripe/webhook/route.ts` (the 9-2 file) with a new event branch for `checkout.session.completed`. Mirrors how 9-2 extended that file for `account.updated`.

**Handler logic:**
1. Idempotency check via `webhook_events.stripe_event_id` (existing 9-2 pattern).
2. `session.metadata.bookingId` → look up the pre-claimed booking.
3. If booking already has `paymentIntentId` populated → idempotent no-op (return-URL handler already won).
4. Else → `db.update(bookings).set({ paymentIntentId, paymentStatus: 'AUTHORIZED' })`.
5. Insert into `webhook_events` on success (Decision §7 anti-pattern from 9-2 — only on successful handle).

**Other event types stay unhandled** (acknowledged with `200 OK`, NOT inserted into `webhook_events`). 9-5 generalizes.

**`checkout.session.expired`: LOCKED NO for 9-3.** Consistent with Decision §3's cleanup-deferred stance — abandoned bookings persist as orphans in 9-3, and the `checkout.session.expired` event is the natural signal to clean them. Both are 9-5 territory: 9-5 will land the full webhook dispatch generalization including `checkout.session.expired` (or a dedicated cleanup mechanism) alongside `payment_intent.*` / `charge.refunded` / `payout.paid`. 9-3 keeps a single narrow handler branch to minimize the surface 9-5 has to absorb.

**Anti-pattern forbidden:**
- Do NOT widen the webhook scope beyond `checkout.session.completed` in 9-3. `payment_intent.succeeded`, `payment_intent.payment_failed`, `charge.refunded`, `payout.paid` are 9-5 territory.
- Do NOT trigger any email send from this webhook in 9-3. Story 8-4 wires up payment-driven emails after 9-5's dispatch stabilizes.
- Do NOT call any Stripe API from inside the webhook handler — the event payload contains everything we need (Decision §7 from 9-2 carries forward).

---

### Decision 7: `@stripe/stripe-js` install — DEFERRED again

**Rationale:** Story 9-1 §8 deferred `@stripe/stripe-js` install with the note "9-3 may install it." After actually thinking through 9-3's design, **`@stripe/stripe-js` is NOT needed** for Stripe Checkout via redirect.

**Why deferred:** Stripe Checkout (hosted) has two integration patterns:
- **(a) Server creates Session → returns `session.url` → client redirects via `window.location.assign(session.url)`.** No client SDK.
- **(b) Server creates Session → returns `sessionId` → client calls `stripe.redirectToCheckout({ sessionId })` from `@stripe/stripe-js`.** Requires the SDK.

Pattern (a) is the modern recommended approach (Stripe deprecated `redirectToCheckout` in newer SDK versions in favor of just using `session.url`). DeskHive uses pattern (a) — mirrors 9-2's `<OnboardingCtaButton>` which does the same `window.location.assign(url)` pattern for the Account Link URL.

`@stripe/stripe-js` becomes necessary only when DeskHive needs:
- Stripe Elements (custom card form) — explicitly out of scope per FR-PAY-1.
- Embedded Checkout — explicitly out of scope per FR-PAY-1.
- Stripe.js Identity / Issuing / Terminal — not in any Phase 2 story.

**Locked proposal:** Do NOT install `@stripe/stripe-js` in 9-3. Add a forward-looking note in `reference_stripe_service_pattern.md` documenting that the client SDK is deferred and only needs to be installed when a story actually requires Elements or embedded Checkout.

**Anti-pattern forbidden:**
- Do NOT install `@stripe/stripe-js` "in case future stories need it" — Phase 1 + Phase 2 principle: install when needed, not preemptively.

---

### Decision 8: Connect-state-active gate at booking-create boundary

**Rationale:** 9-2b's `publishSpaceAction` ships the cached-Connect-state-active check pattern. 9-3 extends it to the booking-creation boundary: a Guest cannot book a space if the space's owner has lost their Connect activation (which can happen via the `account.updated` webhook flipping `charges_enabled` to false — e.g., owner failed a Stripe re-verification).

**Locked proposal:** Inside `createBookingWithPaymentAction`, after resolving the space → owner, read the owner's `stripe_connect_accounts` row via `getConnectAccountByUserId(ownerId)` (the 9-2 helper). If the row is missing OR `charges_enabled !== true` OR `payouts_enabled !== true`:

```typescript
return { status: 'error', code: 'STRIPE_NOT_ACTIVE', message: 'This space can\'t accept bookings right now.' };
```

This catches:
- Newly-published spaces whose owner subsequently became inactive (rare in test mode but a real prod scenario).
- A subtle defense-in-depth against the case where 9-2b's `publishSpaceAction` gate was bypassed somehow (e.g., admin-created space whose owner_id was set to a non-Connect-active SPACE_OWNER — currently not possible via UI but the action defends anyway).

**Pure DB read** — no Stripe SDK call from this gate. Same pattern as 9-2b's `publishSpaceAction` step 6.

**Anti-pattern forbidden:**
- Do NOT make a Stripe API call to verify Connect state at this gate. The DB row is kept in sync by the `account.updated` webhook (9-2) + `refreshConnectStatusAction` polling. DB is the source of truth.
- Do NOT collapse this error into `DESK_NOT_FOUND` (the Phase 1 pattern for hiding unavailable desks). The Guest needs a clear error so they can pick a different space rather than retrying the same desk. `STRIPE_NOT_ACTIVE` is a distinct typed code with its own toast message.
- Do NOT skip this gate entirely "because 9-2b already gates publication" — defense in depth. The window between an owner losing Connect activation and an admin manually suspending their spaces is non-zero.

---

### Decision 9: Idempotency keys

**Two idempotency layers:**

**Layer 1 — the booking-row INSERT.** Phase 1's `uniq_active_booking_per_desk_per_date` partial unique index is the source of truth on conflicts. Two concurrent `createBookingWithPaymentAction` calls for the same desk/date will see one win and one fail with `DOUBLE_BOOKING`. Already exists.

**Layer 2 — the Stripe Checkout Session creation.** Stripe's idempotency key prevents duplicate Sessions when the SDK retries on transient network errors. Per-attempt UUID:

```typescript
const idempotencyKey = `checkout-${crypto.randomUUID()}`;
```

**Why per-attempt UUID** (not per-booking-id):
- A user clicking Book twice within 24h on the same desk SHOULD get two separate Checkout attempts (first might have errored, second is a retry). Per-booking-id key would return the cached failed Session.
- The booking-row UNIQUE constraint already prevents the user from ever having two concurrent bookings for the same desk/date — at most one valid pre-claimed booking row exists, so at most one Checkout Session per real attempt.
- Network-retry case: same `createBookingWithPaymentAction` invocation retries; same UUID is used; Stripe returns the cached Session. ✓

**Locked stance on orphan-Session-on-retry:** the UUID is generated INSIDE the action. If the action itself fails after the booking-row insert but before the Stripe call returns, a user retry generates a NEW UUID and creates a NEW Session. The first Session goes orphan (Stripe's 24h TTL cleans it). The user gets a fresh Session URL on the retry. No double-charge — the first Session was never paid. The pre-claimed booking row is the same row (idempotent on the unique-index slot); only the Checkout Session is regenerated.

Alternative considered + rejected: derive the idempotency key from the booking row ID (`checkout-${bookingId}`). Problem: if the booking row exists from a prior abandoned attempt, retrying would Stripe-cache-hit the orphaned Session URL even after the lazy in-band cleanup deleted the booking. Per-attempt UUID avoids this.

**Anti-pattern forbidden:**
- Do NOT skip the idempotency key on Stripe API calls. PRD NFR-2 mandates idempotency keys for "all payment intent and refund operations." Checkout Session creation is in the spirit of that rule.
- Do NOT reuse `connect-create-${userId}` (9-2's pattern) for Checkout. Each story has its own key namespace.

---

### Decision 10: Toast copy extensions in `src/lib/toast.ts`

**Rationale:** Story 6-3 locked the toast copy as a single source of truth (`TOAST_COPY` const). 9-3 introduces new error states that need user-facing strings.

**Locked — new `TOAST_COPY` entries:**

```typescript
// src/lib/toast.ts — additions
BOOKING_FAILED_STRIPE_NOT_ACTIVE: 'This space can\'t accept bookings right now.',
BOOKING_FAILED_PAYMENT_INIT: 'Payment couldn\'t start. Please try again.',
BOOKING_CANCELLED_PAYMENT: 'Payment cancelled — your card was not charged.',
```

`BOOKING_SUCCESS_TITLE` + `BOOKING_SUCCESS_DESCRIPTION` from Story 6-3 stay unchanged — they fire on the `/my-bookings?just_booked=1` page after the return-URL handler redirects.

**Anti-pattern forbidden:**
- Do NOT introduce ad-hoc strings at call sites. All toast text lives in `TOAST_COPY`.
- Do NOT change `BOOKING_SUCCESS_*` copy — Phase 1's voice is locked. The toast fires in a new context (return-URL → `/my-bookings`) but the copy stays.

---

### Decision 11: Unit test coverage

**Target after 9-3 ships: 334 + ~9 new = ~343 unit tests.** (Actual count to be confirmed in dev-story; per 9-2 / 9-2b precedent, dev-agent typically ships 1-3 bonus tests beyond the BA estimate.)

**New test files / additions:**

1. **`src/actions/booking-with-payment.test.ts`** (NEW — 5 tests):
   - **Happy path:** valid inputs + Connect-active owner → booking pre-claimed + Checkout Session URL returned.
   - **DOUBLE_BOOKING:** unique-violation surfaces as DOUBLE_BOOKING code (Phase 1 parity).
   - **STRIPE_NOT_ACTIVE:** owner without Connect row → action returns the new error code; booking NOT inserted; Stripe NOT called.
   - **PAST_DATE / VALIDATION_ERROR / DESK_NOT_FOUND** — carry-forward from Phase 1; one combined test verifying the new action preserves them (or split per-code at dev-agent discretion).
   - **Stripe API failure** (Checkout Session creation throws AFTER the pre-claim insert) → action returns INTERNAL_ERROR. **Cleanup is deferred per Decision §3** — the AWAITING_PAYMENT row stays in the DB; the test asserts the action's return shape, not row cleanup.

2. **`src/lib/money.test.ts`** extensions (3 tests):
   - `calculatePlatformFee(2500)` → 375 (15% of $25 = $3.75).
   - `calculatePlatformFee(amountCents, feeBps)` with various bps values.
   - `calculateOwnerPayout(2500, 375)` → 2125.
   - Edge case: `calculatePlatformFee(0)` → 0; `calculatePlatformFee(1)` → 0 (Math.floor(150/10000) = 0).

   Counted as 3 (the edge case + the parameterized bps test combine into one parameterized vitest).

3. **`src/lib/payments/checkout.test.ts`** (NEW — 2 tests):
   - Wrapper happy path: Stripe SDK called with correct args (mocked); result wrapped as `StripeServiceResult<{ sessionId, url }>`.
   - Wrapper error path: Stripe throws → result wrapped as `{ ok: false, error: '...' }`.

4. **`src/app/api/stripe/webhook/route.test.ts`** extension (2 new tests):
   - `checkout.session.completed` happy path: booking updated with `payment_intent_id` + `payment_status='AUTHORIZED'`; `webhook_events` row inserted.
   - `checkout.session.completed` idempotent: booking already has `payment_intent_id` (return-URL handler won the race) → handler is a no-op; `webhook_events` row is NOT inserted (mirrors 9-2's "only insert on first real handle" anti-pattern from its Decision §7).

Total: 5 + 2 + 2 = **9 new unit tests**. The lazy-in-band-cleanup test that an earlier draft enumerated is dropped because cleanup itself is deferred per Decision §3.

**Anti-pattern forbidden:**
- Do NOT write integration tests that hit the real Stripe API. Mock at the `@/lib/payments/checkout` boundary for actions; mock at the `stripe` SDK boundary for `checkout.ts` itself. Split-by-mock-boundary pattern (memorized from 9-2).

---

### Decision 12: E2E test coverage

**Target after 9-3 ships: 58 + 2 = 60 E2E tests.**

**New E2E file: `tests/e2e/booking-with-payment.spec.ts`** — 2 tests:

1. **Happy path up to Checkout boundary:** Sign in as `guest@deskhive.local`, navigate to `/spaces/[seeded-space-id]`, pick a date, click Book this desk → assert that the response redirects to a URL starting with `https://checkout.stripe.com/` (verifies the action ran end-to-end and returned a valid Stripe URL). Also verify a `bookings` row exists in `PENDING + AWAITING_PAYMENT + payment_intent_id IS NULL` state (the pre-claim).
2. **Gated path:** Sign in as `guest@deskhive.local`, attempt to book the seeded `Seeded Owner Coworks` space → action returns STRIPE_NOT_ACTIVE → error toast surfaces; no booking row created. The test setup mutates the seeded `owner@deskhive.local`'s Connect row state in `beforeEach` to simulate Connect-inactive (see "Gated-path setup" below).

**Why we don't enter Stripe Checkout:** same reasoning as 9-2's E2E (`connect-onboarding.spec.ts`). Stripe-hosted UI is cross-origin, anti-bot-protected, and the UI may change without notice. Playwright should not enter it. The action's contract (return a valid Stripe URL) is what the E2E verifies; the actual payment authorization is unit-tested at the wrapper level.

**Test card numbers for any future E2E that DOES enter Checkout** (post-9-3 polish, or 9-4's capture flow): `4242 4242 4242 4242` (always succeeds), `4000 0000 0000 9995` (insufficient funds), `4000 0027 6000 3184` (3D Secure required).

**Gated-path setup: LOCKED option (b) — test-owns-Connect-state.** Mutate the seeded `owner@deskhive.local`'s `stripe_connect_accounts` row in `beforeEach` (set `charges_enabled=false`); restore in `afterEach`. Mirrors the 9-2b post-BA-walk pattern memorialized in `reference_stripe_service_pattern.md` ("Test owns the Connect-row lifecycle"). Rejected alternatives: (a) seeding a published space for `owner-pending-onboarding@deskhive.local` would contradict 9-2b's Decision §5 anti-pattern ("DO NOT give the gated-test seed user an existing space"); (c) mutating the seeded space's `owner_id` is brittle and conflates two state changes.

**Implications of (b):**
- The describe block must `test.describe.configure({ mode: 'serial' })` since both tests mutate the same `owner@deskhive.local` Connect row — concurrent workers would race. Cheap (only 2 tests).
- The `beforeEach` for the happy-path test restores Connect-active; the `beforeEach` for the gated-path test forces Connect-inactive. `afterAll` restores the seeded synthetic-active state to leave the DB clean for downstream specs.
- Cross-file race awareness: `connect-onboarding.spec.ts` also mutates this row. The serial-within-describe + the test-owns-state pattern make `booking-with-payment.spec.ts` resilient as long as no parallel worker runs `connect-onboarding.spec.ts` concurrently. If full-suite parallel exposes a race, the mitigation is the same defensive re-restore pattern from 9-2b (immediately before the click).

**Authenticated fixture role:** existing `authenticatedPage('guest')` (uses `guest@deskhive.local`). Same fixture for both tests; the gate is on the space's owner, not the guest.

**Anti-pattern forbidden:**
- Do NOT enter Stripe Checkout UI from Playwright. Cross-origin, fragile, Stripe TOS.
- Do NOT create a fresh Guest user per test — the seeded `guest@deskhive.local` is sufficient. (Same reasoning as 9-2b's bounded-seed-exception principle.)
- Do NOT use the `LIKE 'prefix%'` cleanup pattern for booking rows — 9-2b's lesson: exact-name cleanup is parallelism-safe. Booking cleanup goes by `(guestUserId, deskId, bookingDate)` exact match in `afterEach`.
- Do NOT seed a published space for `owner-pending-onboarding@deskhive.local` to ease the gated test — 9-2b Decision §5 anti-pattern.

---

### Decision 13: Memory file extension — extend `reference_stripe_service_pattern.md`

**Locked proposal:** continue the Theme B reference doc with a new section "Story 9-3 additions — Booking with Payment via Stripe Checkout."

Cover:
- Sub-module pattern: `src/lib/payments/checkout.ts` as the second example after 9-2's `connect.ts`.
- Checkout Session with destination charge + manual capture + `application_fee_amount` — the marketplace-payment template for Stories 9-4 / 9-6.
- Pre-claim booking row before Checkout Session — the slot-claim-race pattern. Cross-reference Phase 1's `uniq_active_booking_per_desk_per_date` partial unique index.
- `payment_status` column populated by 9-3 ('AWAITING_PAYMENT' → 'AUTHORIZED'); CHECK constraint extended (mirrors 9-2b's enum-extension migration pattern).
- Per-attempt UUID idempotency key for Checkout (distinct from 9-2's per-user key for Connect-create).
- Return-URL Server Component + webhook backstop pattern: handler updates booking with `payment_intent_id`; webhook is the safety net for browser-close scenarios.
- Lazy in-band cleanup of abandoned-payment bookings — the "no scheduler" Phase 2 pattern.
- Connect-state-active gate at the booking-create boundary — the third instance of the pattern (after 9-2b's publish gate and `publishSpaceAction`'s step 6).
- Test-owns-Connect-state pattern (`beforeEach` mutates `owner@`'s Connect row, `afterEach` restores) — explicit cross-reference to 9-2b's same pattern.

**No new memory file.** Extend the existing reference.

**Anti-pattern forbidden:**
- Do NOT spin out a new memory file for 9-3. Theme B's reference doc is the canonical pattern container.

---

### Decision 14: Files likely touched (estimate, not directive)

> Estimates per the established 9-2 / 9-2b convention. Dev-agent's actual diff may differ slightly; the AC scope list in the story file is authoritative.

**New:**
- `deskhive/drizzle/migrations/0005_<name>.sql` (auto + story-tag comment block)
- `deskhive/drizzle/migrations/meta/0005_snapshot.json` (auto)
- `deskhive/src/actions/booking-with-payment.ts` — `createBookingWithPaymentAction`
- `deskhive/src/actions/booking-with-payment.test.ts` (6 unit tests per Decision §11)
- `deskhive/src/lib/payments/checkout.ts` — Stripe Checkout wrapper
- `deskhive/src/lib/payments/checkout.test.ts` (2 unit tests)
- `deskhive/src/app/spaces/[id]/booking/return/page.tsx` — Server Component for return-URL handling
- `deskhive/tests/e2e/booking-with-payment.spec.ts` (2 E2E tests per Decision §12)

**Modified:**
- `deskhive/src/db/schema.ts` — add 3 columns to `bookingsTable`; add new `bookings_payment_status_check` CHECK constraint (Decision §3 — `AWAITING_PAYMENT` + `AUTHORIZED`)
- `deskhive/drizzle/migrations/meta/_journal.json` (auto)
- `deskhive/src/lib/money.ts` — add `calculatePlatformFee` + `calculateOwnerPayout` (Decision §2 — hardcoded `PLATFORM_FEE_BPS = 1500` constant with Phase 3 migration comment)
- `deskhive/src/lib/money.test.ts` — add 3 unit tests
- `deskhive/src/lib/toast.ts` — add 3 new `TOAST_COPY` entries (Decision §10)
- `deskhive/src/app/spaces/[id]/book-desk-button.tsx` — rewrite to use the new action + `window.location.assign(url)` redirect pattern (replaces the inline Phase 1 booking + toast-on-success pattern)
- `deskhive/src/app/api/stripe/webhook/route.ts` — add `checkout.session.completed` branch
- `deskhive/src/app/api/stripe/webhook/route.test.ts` — add 2 unit tests
- `deskhive/src/app/my-bookings/page.tsx` — read `?just_booked=1` query param + fire success toast (extends Story 6-3 pattern)
- `_bmad-output/implementation-artifacts/sprint-status.yaml` — Epic 9 row
- `_bmad-output/implementation-artifacts/9-3-booking-with-payment.md` — story file (created by `*create-story 9-3`)
- Memory: `~/.claude/.../memory/reference_stripe_service_pattern.md` (Decision §13)
- Memory: `~/.claude/.../memory/MEMORY.md` (one-liner refresh)

**Replaced (deleted in 9-3):**
- `deskhive/src/actions/booking.ts` — DELETE the `createBookingAction` export + its `CreateBookingActionState` type. Single source of truth: `createBookingWithPaymentAction` is the only Guest booking action after 9-3 ships. The Phase 1 action's only call site (`<BookDeskButton>`) is being rewritten in this same story. Keeping the legacy export as dead code would violate the "no half-finished or unused exports" principle (Decision §3 lock). Other exports from `booking.ts` (`cancelBookingAction`, `confirmBookingAction`, `rejectBookingAction`) stay — they remain valid Guest / Owner / Admin paths and will be extended (not replaced) by Stories 9-4 + 9-6.

**Zero changes to** (carved-out for later stories):
- `deskhive/src/lib/stripe.ts` (Story 9-1's singleton)
- `deskhive/src/lib/stripe-service.ts` (Story 9-1's barrel)
- `deskhive/src/lib/payments/connect.ts` (Story 9-2's wrappers)
- `deskhive/src/lib/email*` (Story 8-4 wires up payment-driven emails)
- `deskhive/src/app/(owner)/owner/settings/*` (Story 9-2's UI)
- `deskhive/src/app/(owner)/owner/spaces/*` (Story 9-2b's UI)
- The booking Confirm / Reject Server Actions (Story 9-4 extends them with capture / cancel)

---

### Decision 15: Test card + Stripe dashboard prereqs

**Test cards (for BA verification + future stories' E2E):**
- `4242 4242 4242 4242` — always succeeds.
- `4000 0027 6000 3184` — requires 3DS authentication (Phase 2 Stripe Checkout handles 3DS automatically).
- `4000 0000 0000 9995` — declines for insufficient funds.

Stripe's full test-card matrix: <https://docs.stripe.com/testing>. BA should verify the 9-3 BA-walk happy path with `4242`; the failed-auth path is unit-tested.

**Stripe dashboard prereqs (BA verifies BEFORE story dispatch):**

- [ ] Stripe test-mode account exists (already confirmed for 9-1/9-2/9-2b).
- [ ] `STRIPE_SECRET_KEY` (test mode `sk_test_*`) + `STRIPE_PUBLISHABLE_KEY` + `STRIPE_WEBHOOK_SECRET` are in `.env.local`. Already in place from 9-2.
- [ ] Stripe dashboard's Checkout settings: ensure "Stripe Checkout" is enabled (default for test mode).
- [ ] Stripe dashboard's Connect settings: platform display name + branding (cosmetic; doesn't block ship). Skip unless BA wants it.
- [ ] `stripe listen --forward-to localhost:3000/api/stripe/webhook` running during local dev so the new `checkout.session.completed` event reaches the handler. Same operational pattern as 9-2.

---

## Architectural anti-patterns forbidden (rollup)

1. Floating-point math anywhere in money calculations (CC-2 / Decision §2).
2. Stripe SDK imports outside `src/lib/stripe.ts` and `src/lib/payments/*` sub-modules (CC-3 / Decision §4).
3. Creating the booking row AFTER successful payment authorization — pre-claim is non-negotiable (Decision §3).
4. New `bookings.status` enum values — payment sub-state lives in `payment_status` (Decision §3).
5. `@stripe/stripe-js` install — deferred (Decision §7).
6. Stripe API calls from inside webhook handlers (Decision §6).
7. Trusting Stripe Checkout's `session_id` query param without re-fetching the Session from Stripe (Decision §5).
8. Skipping the Connect-active gate at booking-create — defense in depth (Decision §8).
9. Per-booking-id idempotency keys for Checkout — per-attempt UUID is the locked pattern (Decision §9).
10. Email sends from this story's webhook handler — 8-4 territory (Decision §6).
11. Entering Stripe Checkout UI from Playwright (Decision §12).
12. `LIKE 'prefix%'` cleanup patterns in E2E `afterEach` — exact-name cleanup is parallelism-safe (Decision §12; 9-2b carry-forward).
13. Ad-hoc toast strings at call sites — `TOAST_COPY` is the single source (Decision §10).

---

## Operator prereqs (BA completes BEFORE dev-story dispatch)

- [ ] **Stripe dashboard test-mode active** — confirmed for 9-1/9-2/9-2b; reconfirm before 9-3 dispatch.
- [ ] **`.env.local` has `STRIPE_SECRET_KEY` + `STRIPE_PUBLISHABLE_KEY` + `STRIPE_WEBHOOK_SECRET`** — present from 9-2.
- [ ] **`pnpm db:seed` has been run on the latest schema** (after 9-2b ship). Verify `owner@deskhive.local` has synthetic Connect row + at least one published space (`Seeded Owner Coworks`).
- [ ] **`pnpm typecheck` + `pnpm test` + `pnpm test:e2e` baseline green on `main`** — confirms the 9-2b ship + follow-up are stable before 9-3 dispatches.
- [ ] **`stripe listen` running during local dev** — for the `checkout.session.completed` webhook backstop path.
- [ ] **PRD §4.4 FR-PAY-2's `manual` capture mode confirmed compatible with destination charges + Connect** — Stripe docs say yes; a quick `stripe-ping`-style script that creates a tiny test Session and inspects the resulting Payment Intent's `status` field is sufficient pre-dispatch confirmation if BA wants belt-and-suspenders.

---

## Forward-looking flags

- **Phase 2 PRD §4.5 cancel-interpretation** — memory `project_phase2_prd_4_5_cancel_interpretation.md` says: Phase 1's `cancelBookingAction` rejects non-PENDING; PRD implies CONFIRMED-cancel should work with refund logic. Re-flag before 9-4 (which extends Confirm/Reject) and 9-6 (which adds refund flow). Not load-bearing for 9-3 — Guest cancellation is unchanged in 9-3.
- **Story 9-5 webhook generalization** — 9-3 ships a narrow `checkout.session.completed` handler. 9-5 will refactor `src/app/api/stripe/webhook/route.ts` into a dispatcher with handlers under `src/lib/payments/webhooks.ts`. 9-3's narrow handler should be written so 9-5 can absorb it cleanly (same shape as 9-2's `account.updated` branch).
- **Story 9-4 captures the Payment Intent** — `confirmBookingAction` extends with `stripe.paymentIntents.capture(paymentIntentId)`. 9-3 leaves `payment_intent_id` populated for that call. `payment_status` transitions AUTHORIZED → CAPTURED in 9-4.
- **Story 9-6 refunds + the 24-hour policy** — `cancelBookingWithRefundAction` reads `payment_intent_id`, calls `stripe.refunds.create`, transitions `payment_status` to REFUNDED, adds `refunded_at` + `refund_amount_cents` columns.
- **Story 9-7 payouts** — reads from Stripe Connect API, not from local DB. Owner-side dashboard view.
- **Story 8-4 payment-driven emails** — receipt email on capture (9-4 + 9-5 + 8-4); refund email on refund (9-6 + 9-5 + 8-4). 9-3 ships zero payment-driven emails.
