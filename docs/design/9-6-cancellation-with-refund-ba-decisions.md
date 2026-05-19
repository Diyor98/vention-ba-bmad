# Story 9-6: Guest Cancellation with Refund — BA Decisions

**Story:** 9-6
**Epic:** 9 — Payments (Theme B)
**Phase:** 2
**Type:** Schema migration (CHECK extension + 2 new columns) + extend `cancelBookingAction` (resolves PRD §4.5 open question) + new Stripe sub-module `src/lib/payments/refunds.ts` + new `bookings` query helpers + NEW `charge.refunded` handler in the 9-5 dispatcher map + refund-eligibility helper
**Author:** Ikhtiyor Ziyayev, Business Analyst
**Date drafted:** 2026-05-19
**Status:** LOCKED 2026-05-19. Ready for dispatch.
**Source:** Phase 2 PRD §4.4 FR-PAY-6 + §4.5 (Refund Policy, FR-REFUND 1–5) + §1.2 demo flow steps 20–21 + §6.1 (bookings additions: `refunded_at`, `refund_amount_cents`) + §6.3 (`cancelBookingWithRefundAction`) + §8 Epic 9 Story 9-6 + forward-looking flags from 9-3 / 9-4 / 9-5 BA-decisions docs + memory `project_phase2_prd_4_5_cancel_interpretation.md` (the load-bearing open question this story resolves)

> **Lock context (2026-05-19):** Story 9-6 was locked at the end of a long session (5 prior stories shipped same day) during the BA's work shift. The BA explicitly requested that the load-bearing §2 decision (PRD §4.5 cancel-interpretation) be locked on Claude's recommendation rather than further BA debate, due to end-of-shift time pressure. Decision §2 was locked as Option (a) extend cancelBookingAction in-place — the rationale stands on its merits (PRD §4.5 explicit supersedence + 9-4 in-place extension precedent), but future-readers should be aware of the decision context and re-verify if any downstream issues arise. Decisions §3 (24-hour policy) + §11 (audit-trail strictness) were similarly batch-locked on Claude's recommendation. All other decisions are routine Theme B convention carry-forwards.

**Companion / dependency chain:**

- **Story 9-1** (Stripe SDK wrapper) shipped at `aff4060`. Provides `src/lib/stripe.ts` singleton + `StripeServiceResult<T>` discriminated union.
- **Story 9-2** (Stripe Connect Express onboarding) shipped at `0d384e0` + `8a06402`. Provides `webhook_events` idempotency table + the load-bearing 3-stage try-catch pattern.
- **Story 9-3** (booking with payment) shipped at `bd76dc3` + `8035907`. Provides `bookings.payment_intent_id` + `bookings.payment_status` state machine that 9-6 extends to a 5th value.
- **Story 9-4** (confirm/reject with capture/cancel) shipped at `32dd63a`. Provides `src/lib/payments/payment-intents.ts` (the 3rd Theme B sub-module pattern that 9-6's `refunds.ts` mirrors) + Stripe-first-then-DB ordering pattern + per-booking-id idempotency key pattern (`refund-${bookingId}` follows the same shape) + `payment_status` CHECK constraint extended to 4 values (9-6 extends to 5).
- **Story 9-5** (webhook dispatch generalization) shipped at `2950e15`. Provides the `WEBHOOK_HANDLERS` map + `dispatchWebhookEvent()` entry that 9-6 extends by adding one new handler function + one new map entry — **9-6 is the first story to prove out the dispatcher's extensibility design.**

Story 9-6 cannot dispatch until all five are on `main` (they are). 9-6 is the second-to-last Theme B story; 9-7 (`/owner/payouts` view) follows.

---

## Context

**The PRD §4.5 open question this story resolves (load-bearing):**

Memory `project_phase2_prd_4_5_cancel_interpretation.md` flagged a long-standing tension: Phase 1's `cancelBookingAction` rejects non-PENDING bookings with verbatim `CANNOT_CANCEL` message "Only pending bookings can be cancelled" (US-3.5 AC-2). Phase 2 PRD §4.5 / FR-REFUND-3 explicitly allows Guests to cancel **PENDING or CONFIRMED** bookings, with refund logic kicking in for the CONFIRMED case. Story 9-6 is the dispatch that resolves this gap.

**Phase 2 PRD §4.5 — Refund Policy (the authoritative spec):**

- **FR-REFUND-1:** Single policy — **Full refund if cancelled 24 hours or more before the booking date; no refund within 24 hours of the booking date.**
- **FR-REFUND-2:** The 24-hour cutoff is **calculated server-side using UTC.** Refund eligibility is computed on cancellation request.
- **FR-REFUND-3:** Guests can attempt to cancel any of their PENDING or CONFIRMED bookings. The server determines refund eligibility and either:
  - Issues a full refund and marks booking CANCELLED (if eligible)
  - **Refuses the cancellation entirely with an error toast** (if not eligible)
- **FR-REFUND-4:** Space Owners can always refund a confirmed booking unilaterally (force majeure). **Out of scope for Phase 2 UI** but the Server Action signature is built to accept it for future use.
- **FR-REFUND-5:** Refunds processed via `stripe.refunds.create(...)`. The Stripe `charge.refunded` webhook fires the refund-confirmation email.

**Phase 2 PRD §4.4 FR-PAY-6 (cross-reference):**

> When a Guest cancels their own PENDING or CONFIRMED booking and is within the refund policy window (Section 4.5), the server refunds the captured payment (or cancels the uncaptured authorization). Booking status becomes CANCELLED.

Two distinct flows: **captured payment → refund** (CONFIRMED + CAPTURED state); **uncaptured authorization → cancel PI** (PENDING + AUTHORIZED state). Plus the Phase 1 legacy path (PENDING + `payment_intent_id IS NULL`) where there's no Stripe operation at all.

**Phase 2 PRD §1.2 demo flow steps 20–21 (the locked acceptance behavior):**

- Step 20: Guest cancels >24h before booking date → full refund + refund-confirmation email.
- Step 21: Guest cancels <24h before booking date → cancellation refused per policy + error toast.

**Phase 1 functionality preserved:**

- Phase 1 `cancelBookingAction` shape (auth via `requireSession` + `requireRole(GUEST)` + ownership check via `requireOwnership` + race-safe conditional UPDATE) is preserved end-to-end.
- The button stays at [src/app/my-bookings/cancel-booking-button.tsx](deskhive/src/app/my-bookings/cancel-booking-button.tsx) with the existing `useActionState` + inline-error-on-state.message + toast-on-success pattern from Story 6-3.
- The PRD §4.7 line *"Guest can cancel a PENDING booking (existing flow extends to handle refund per Section 4.5)"* governs: extend, do not replace.

**What 9-6 does NOT touch:**

- ❌ Owner / Admin force-majeure refund UI — FR-REFUND-4 explicitly out of Phase 2 UI scope. The action signature is forward-prepared but no Owner-side button ships.
- ❌ Partial refunds — Phase 3 territory. 9-6 ships full-refund-only (`refund_amount_cents === total_cents`).
- ❌ `/owner/payouts` view — Story 9-7.
- ❌ `payment_intent.payment_failed` webhook handler — still deferred (no current consumer in Phase 2).
- ❌ `payout.paid` webhook handler — Story 9-7.
- ❌ Re-flagging Phase 3 multi-policy support — out of Phase 2 scope.
- ❌ Refund disputes / partial-recovery flows — out of Phase 2 scope.

---

## Scope

**In scope:**

- **Drizzle schema additions** to [src/db/schema.ts](deskhive/src/db/schema.ts) `bookingsTable`:
  - New column `refundedAt: timestamp('refunded_at', { withTimezone: true })` — NULL-able, populated by the action OR the webhook backstop when refund completes.
  - New column `refundAmountCents: integer('refund_amount_cents')` — NULL-able for Phase 1 / non-refunded rows; equals `total_cents` for Phase 2 full refunds.
  - Extend `bookings_payment_status_check` CHECK constraint to 5 values: `('AWAITING_PAYMENT', 'AUTHORIZED', 'CAPTURED', 'VOIDED', 'REFUNDED')`. Migration `0007_*.sql` via DROP/ADD CONSTRAINT pattern (third instance after 9-3 and 9-4). See Decision §1.
- **Refund-eligibility helper** — pure function computing 24h-before-booking-date eligibility against `Date.now()` in UTC. Lives in a new `src/lib/refund-policy.ts` OR extends `src/lib/bookings.ts` (dev-agent pick; strawman recommends `refund-policy.ts` for Phase 3 multi-policy headroom). See Decision §3.
- **New Stripe sub-module** `src/lib/payments/refunds.ts` — 5th Theme B sub-module. Wraps `stripe.refunds.create({ payment_intent })` with `StripeServiceResult<T>` shape, per-booking-id idempotency key (`refund-${bookingId}`), and the standard `mapStripeError` helper. See Decision §4.
- **`cancelBookingAction` extension** — single action handling all 3 branches (Phase 1 PENDING-no-PI / Phase 2 PENDING-AUTHORIZED / Phase 2 CONFIRMED-CAPTURED). Resolves the PRD §4.5 open question. See Decision §2 + §5.
- **3 new `bookings` query helpers** in [src/db/queries/bookings.ts](deskhive/src/db/queries/bookings.ts):
  - `markBookingCancelledAndVoided(id, guestUserId)` — Phase 2 PENDING cancel (releases auth hold on Stripe; transitions `(PENDING, AUTHORIZED) → (CANCELLED, VOIDED)`).
  - `markBookingCancelledAndRefunded(id, guestUserId, refundAmountCents)` — Phase 2 CONFIRMED cancel with refund (transitions `(CONFIRMED, CAPTURED) → (CANCELLED, REFUNDED)` + writes `refunded_at = NOW()` + `refund_amount_cents`).
  - `markBookingCancelledAndRefundedByPaymentIntent(paymentIntentId, refundAmountCents)` — webhook variant for the `charge.refunded` handler (no `guestUserId` clause; lookup by PI).
  - See Decision §6.
- **NEW webhook handler** `handleChargeRefunded(event)` in [src/lib/payments/webhooks.ts](deskhive/src/lib/payments/webhooks.ts) — extends 9-5's `WEBHOOK_HANDLERS` map by one entry. Backstop for the action's DB write failure (same shape as 9-5's `payment_intent.succeeded`). See Decision §7.
- **UI surface extension** — the existing [src/app/my-bookings/cancel-booking-button.tsx](deskhive/src/app/my-bookings/cancel-booking-button.tsx) is rendered for BOTH `PENDING` and `CONFIRMED` future-dated bookings (currently only `PENDING` per [page.tsx:178](deskhive/src/app/my-bookings/page.tsx)). Button label may need a softer copy for the CONFIRMED case (e.g., "Cancel booking"). See Decision §8.
- **Toast copy additions** in [src/lib/toast.ts](deskhive/src/lib/toast.ts) — new `CANCEL_REFUND_INELIGIBLE` entry for the within-24h refusal (PRD §1.2 step 21 mandates "error toast"). Existing `CANCEL_SUCCESS` is reused for all 3 happy paths. See Decision §9.
- **Error code additions** on `CancelBookingActionState` — `REFUND_INELIGIBLE`, `STRIPE_REFUND_FAILED`, `STRIPE_CANCEL_FAILED` (mirror of 9-4's `STRIPE_CANCEL_FAILED` for the PENDING-AUTHORIZED branch). See Decision §10.
- **Unit tests** — ~12-15 new across action + wrapper + query helpers + refund-policy + webhook handler. See Decision §11.
- **E2E tests** — 0 new locked; the happy refund path mirrors 9-4's reasoning (real-Stripe-API E2E too fragile / costly; unit-tested + BA-walked instead). See Decision §12.
- **Memory** — extend `reference_stripe_service_pattern.md` with the 9-6 section + RESOLVE `project_phase2_prd_4_5_cancel_interpretation.md` (mark the open question closed; cross-reference the locked decision here). See Decision §13.

**Out of scope (carved-out for 9-7 / Phase 3):**

- ❌ `/owner/payouts` view — Story 9-7.
- ❌ `payout.paid` webhook handler — Story 9-7 (one more `WEBHOOK_HANDLERS` map entry).
- ❌ Owner-side force-majeure refund UI — PRD FR-REFUND-4 forward-ready signature only.
- ❌ Partial refunds — Phase 3.
- ❌ `payment_intent.payment_failed` handler — still no consumer in Phase 2.
- ❌ Multi-policy refund windows (different windows per space type) — Phase 3.
- ❌ Refund email template — Story 8-4 wires payment-driven emails on top of 9-6's `charge.refunded` event delivery via 9-5's dispatch. 9-6 ships ZERO email work.
- ❌ Refund disputes / chargebacks — Phase 3.
- ❌ Refund cancel by Owner before processing — out of Phase 2 (refunds are issued immediately, not queued).
- ❌ Currency conversion / multi-currency — out of Phase 2 (USD-only).

---

## Decisions

### Decision 1: Schema migration — 2 new columns + extend `bookings_payment_status_check` to 5 values

**Rationale:** PRD §6.1 mandates `refunded_at` + `refund_amount_cents` as new bookings columns for the refund flow. PRD §4.5 implies a 5th `payment_status` value (`REFUNDED`) for the post-refund state. The DROP/ADD CONSTRAINT pattern is now triple-proven (9-2b for `spaces.status`, 9-3 for the initial `bookings_payment_status_check`, 9-4 for the 4-value extension).

**Locked proposal:**

```typescript
// src/db/schema.ts — bookingsTable additions for 9-6
refundedAt: timestamp('refunded_at', { withTimezone: true }),
refundAmountCents: integer('refund_amount_cents'),
```

Both columns are NULL-able. Rationale:
- Phase 1 NULL rows continue to pass (PG default NULL).
- Phase 2 non-refunded rows (PENDING + AWAITING_PAYMENT, CONFIRMED + CAPTURED, etc.) have NULL until/unless the refund fires.
- Setting `refundedAt = NOW()` happens in the same UPDATE as `payment_status='REFUNDED'`. The two are always written together (the conditional WHERE on the query helper enforces this).

**CHECK constraint migration:**

```sql
-- 0007_<name>.sql (drizzle-generated)
ALTER TABLE "bookings" DROP CONSTRAINT "bookings_payment_status_check";--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_payment_status_check" CHECK ("bookings"."payment_status" IN ('AWAITING_PAYMENT', 'AUTHORIZED', 'CAPTURED', 'VOIDED', 'REFUNDED'));
```

Story-tag comment block at the top of `0007_*.sql` (same convention as `0006_cold_rictor.sql`): document the new value, the state-machine transition `CAPTURED → REFUNDED`, and the rollback hint (DROP + ADD with 9-4's 4-value set; safe IFF no rows are in REFUNDED state at rollback time).

**Anti-pattern forbidden:**
- Do NOT add `refunded_at` / `refund_amount_cents` as `NOT NULL` — Phase 1 + non-refunded Phase 2 rows would fail.
- Do NOT add a separate `refunds` table (out of Phase 2 scope; one refund per booking is sufficient).
- Do NOT widen the constraint without the DROP/ADD pattern.
- Do NOT change existing values; the 4 prior values stay.

---

### Decision 2: PRD §4.5 cancel-interpretation — LOAD-BEARING resolution

**The open question** (memory `project_phase2_prd_4_5_cancel_interpretation.md`): Phase 1's `cancelBookingAction` rejects non-PENDING bookings; Phase 2 PRD §4.5 implies CONFIRMED-cancel should work with refund logic. Three resolution paths considered:

- **(a) Extend `cancelBookingAction` in-place** to support PENDING + CONFIRMED with branching logic. Single action, single button, single state shape. Phase 1's verbatim "Only pending bookings can be cancelled" message is updated (Phase 2 PRD §4.5 explicitly supersedes Phase 1's PENDING-only restriction). **Mirrors 9-4's pattern of extending `confirmBookingAction` + `rejectBookingAction` in place.**
- **(b) Keep `cancelBookingAction` PENDING-only + add a new `cancelBookingWithRefundAction` for CONFIRMED.** Two actions; the button has to dispatch to the right one based on booking status. Action surface bloats; cross-action consistency burden.
- **(c) Replace `cancelBookingAction` with `cancelBookingWithRefundAction` as the single Guest-cancel path.** Mirrors 9-3's pattern of deleting `createBookingAction` in favor of `createBookingWithPaymentAction`.

**Locked: (a) — extend `cancelBookingAction` in-place.**

Rationale:
- The PRD §6.3 list uses `cancelBookingWithRefundAction` as the conceptual name, but PRD §4.7 says *"existing flow extends to handle refund per Section 4.5"* — pointing to in-place extension as the locked intent. The PRD's two phrasings reconcile if "with refund" is read as a capability descriptor, not a rename.
- (b) duplicates action surface with no benefit (the Guest's `<CancelBookingButton>` works the same way; client never branches).
- (c) is the 9-3 precedent's strongest analogue but creates more disruption than needed. `cancelBookingAction` only has 2 call sites (button + tests); both stay valid. The verbatim message change is a controlled update (BA Decision §9 below + story file's AC + DAR documents the supersedence).
- 9-4 already established the in-place-extension pattern: `confirmBookingAction` + `rejectBookingAction` were extended in place (NOT renamed to `confirmBookingAndCaptureAction` etc.). 9-6 follows the same pattern for `cancelBookingAction`.

**Locked extension shape (branching logic — full spec in Decision §5):**

```typescript
// After Phase 1 pre-checks pass (auth + ownership + booking lookup):

if (booking.status === 'PENDING' && booking.paymentIntentId === null) {
  // Phase 1 path: pure DB cancel, no Stripe involvement.
  // Use existing cancelBooking(bookingId, callerId) — UNCHANGED.
} else if (
  booking.status === 'PENDING' &&
  booking.paymentStatus === 'AUTHORIZED' &&
  booking.paymentIntentId !== null
) {
  // Phase 2 PENDING path: cancel Stripe PI auth + DB UPDATE.
  // No refund — funds were never captured. Auth-hold release only.
  // Use cancelPaymentIntent (from 9-4) + markBookingCancelledAndVoided (NEW).
} else if (
  booking.status === 'CONFIRMED' &&
  booking.paymentStatus === 'CAPTURED' &&
  booking.paymentIntentId !== null
) {
  // Phase 2 CONFIRMED path: check 24h refund eligibility.
  if (!isRefundEligible(booking.bookingDate)) {
    return { status: 'error', code: 'REFUND_INELIGIBLE', message: <copy> };
  }
  // Stripe refund + DB UPDATE.
  // Use createRefund (NEW sub-module) + markBookingCancelledAndRefunded (NEW).
} else {
  // Already CANCELLED / REJECTED / mid-refund-with-unexpected-state.
  // Phase 1's verbatim CANNOT_CANCEL message supersedes — see below.
  return { status: 'error', code: 'CANNOT_CANCEL', message: <updated copy> };
}
```

**The Phase 1 verbatim message supersedence (load-bearing for AC):**

The existing `cancelBookingAction` returns `'Only pending bookings can be cancelled.'` on `booking.status !== 'PENDING'`. Phase 2 PRD §4.5 explicitly enables CONFIRMED cancel, so this message is now incorrect. Updated message:

```
'This booking has already been cancelled or rejected.'
```

(Or similar — dev-agent picks the exact phrasing. The locked behavior: the message ONLY fires for terminal states like CANCELLED / REJECTED / already-REFUNDED — the eligible PENDING + CONFIRMED paths fall through the new branches.)

**Anti-pattern forbidden:**
- Do NOT ship a new action `cancelBookingWithRefundAction` (Option (b) anti-pattern).
- Do NOT delete `cancelBookingAction` (Option (c) anti-pattern).
- Do NOT preserve the verbatim Phase 1 "Only pending bookings can be cancelled" message — Phase 2 PRD §4.5 explicitly supersedes the Phase 1 invariant.
- Do NOT widen the role check beyond `GUEST` (FR-REFUND-4's Owner-side refund is forward-ready but unsurfaced).
- Do NOT change the 401-redirect behavior (`/login?callbackUrl=/my-bookings` stays).

---

### Decision 3: 24-hour refund-eligibility policy interpretation

**The PRD locks the policy; this decision locks the interpretation of edge cases.**

**Reference point:** Per FR-REFUND-1: "24 hours or more before the **booking date**." The reference is `bookings.booking_date` — a PG `DATE` column (YYYY-MM-DD, no time component). Interpreting "before the booking date" requires picking a specific moment on that date:

- **Strawman pick: 00:00:00 UTC of the booking date.** A booking on `2026-06-15` has refund-eligibility cutoff at `2026-06-14 00:00:00 UTC` (i.e., 24h before the start of the booking day in UTC).
- Alternative considered: end-of-day on the booking date (23:59:59 UTC). Rejected because PRD §1.2 step 20–21 imply the cutoff is "before the booking date" — start-of-day is more conservative for the Guest (gives them less time to cancel; aligns with "we've blocked this slot for you and may have rejected other bookings" semantics).

**Timezone:** FR-REFUND-2 explicit lock — **UTC server-side, always.** No Guest-timezone conversion. The booking_date column is a DATE (no timezone); we treat it as a UTC date when constructing the cutoff timestamp.

**Boundary behavior** (FR-REFUND-1's "or more" wording):

- Strict inequality: `now < (bookingDateUTC - 24h)` → eligible (refund issued).
- Boundary: `now === (bookingDateUTC - 24h)` → INELIGIBLE (refused).
- After: `now > (bookingDateUTC - 24h)` → INELIGIBLE.

Rationale: "24 hours or more before" is naturally read as "strict more than 24h" in user-facing copy. The boundary is treated as the ineligible side to favor the platform / Owner (the slot has been blocked; the Owner can't easily re-book).

**Past-date bookings:** A Guest tries to cancel a booking whose `booking_date` is in the past. The cutoff `bookingDateUTC - 24h` is also in the past → `now > cutoff` → INELIGIBLE → refusal. This is the correct behavior (you can't refund a booking after the slot has passed).

**Locked helper signature:**

```typescript
// src/lib/refund-policy.ts (NEW — dev-agent may put in src/lib/bookings.ts instead)

/**
 * Story 9-6: Phase 2 single-policy refund-eligibility check.
 *
 * Eligible iff: now (UTC) < (bookingDate at 00:00:00 UTC) - 24h.
 *
 * @param bookingDate — the `bookings.booking_date` value (a YYYY-MM-DD
 *                      string OR a Date object; interpreted as UTC).
 * @param now         — optional override (defaults to `new Date()`).
 *                      Tests inject deterministic values.
 */
export function isRefundEligible(
  bookingDate: string | Date,
  now: Date = new Date(),
): boolean;
```

Implementation note: `bookingDate` from Drizzle's `date('booking_date')` is returned as a `string` in `YYYY-MM-DD` form. The helper constructs `new Date(bookingDate + 'T00:00:00Z')` for the UTC anchor; subtracts `24 * 60 * 60 * 1000` ms; compares against `now.getTime()`. Pure integer-ms math — no floating-point, no timezone library.

**File location:** strawman locks `src/lib/refund-policy.ts` (new file) rather than extending `src/lib/bookings.ts`. Rationale: Phase 3 may add multi-policy support (different windows per space type, owner-overridable, etc.); a dedicated module makes the seam explicit. Alternative: extend `bookings.ts` (which exists for notification helpers + already-coupled-to-bookings utilities) — dev-agent may pick this if the override-headroom argument isn't compelling. Document the choice in DAR.

**Anti-pattern forbidden:**
- Do NOT use floating-point math (CC-2 carry-forward).
- Do NOT use a timezone library (`date-fns-tz`, `moment-timezone`, etc.) — UTC-only is the PRD lock.
- Do NOT compute the cutoff from `booking.createdAt` or `booking.updatedAt` — `booking_date` is the locked reference.
- Do NOT inject server-clock skew handling — assume the server's `Date.now()` is authoritative.
- Do NOT compute eligibility client-side (the button doesn't preview the result; the action is the source of truth).

---

### Decision 4: New Stripe sub-module — `src/lib/payments/refunds.ts` (5th Theme B sub-module)

**Rationale:** Story 9-5's `webhooks.ts` proved the 4-sub-module pattern. 9-6 adds the 5th. The pattern: each new family of Stripe operations gets a cohesive sub-module.

**Locked shape — single export `createRefund`:**

```typescript
// src/lib/payments/refunds.ts (NEW)

import Stripe from 'stripe';
import { stripe } from '@/lib/stripe';
import type { StripeServiceResult } from '@/lib/stripe-service';

/**
 * Story 9-6: refunds a captured Payment Intent in full. Phase 2 ships
 * full-refund-only (no `amount` arg; Stripe defaults to the full
 * captured amount). Phase 3 may add a partial-refund variant.
 *
 * Idempotency key per BA Decision §4: per-booking-id namespace
 * `refund-${bookingId}`. Mirrors 9-4's per-resource pattern; distinct
 * from 9-2 / 9-3 / 9-4 namespaces.
 *
 * On Stripe success, the PI moves to `succeeded` → `refunded` (or
 * `partially_refunded`); Stripe reverses the platform_fee_amount
 * automatically (no `refund_application_fee` arg needed for full
 * refunds in destination-charge mode).
 */
export async function createRefund(args: {
  paymentIntentId: string;
  idempotencyKey: string;
}): Promise<
  StripeServiceResult<{
    refundId: string;
    paymentIntentId: string;
    status: string;
    amountCents: number;
  }>
>;
```

Internal Stripe API call:

```typescript
const refund = await stripe.refunds.create(
  {
    payment_intent: args.paymentIntentId,
    // NO `amount` arg — full refund. Phase 3 may parametrize.
    // NO `refund_application_fee: true` — destination-charge mode
    // automatically reverses the platform_fee_amount on full refunds.
    // Phase 3 may need to revisit if partial refunds land.
  },
  { idempotencyKey: args.idempotencyKey },
);
return {
  ok: true,
  data: {
    refundId: refund.id,
    paymentIntentId: args.paymentIntentId,
    status: refund.status ?? 'unknown',
    amountCents: refund.amount,
  },
};
```

**`mapStripeError` helper** — identical shape to 9-2 / 9-3 / 9-4's wrappers (`Stripe.errors.StripeError → err.message`; other errors → `'Unexpected error'` + `console.error`).

**Idempotency key naming alignment:**

```
9-2: connect-create-${userId}        per-user
9-3: checkout-${randomUUID()}        per-attempt
9-4: capture-${bookingId}            per-resource
9-4: cancel-${bookingId}             per-resource
9-6: refund-${bookingId}             per-resource  ← THIS
```

**Anti-pattern forbidden:**
- Do NOT call `stripe.refunds.*` from anywhere outside this sub-module.
- Do NOT add `stripe.refunds.retrieve` / `stripe.refunds.list` / `stripe.refunds.update` in 9-6 — defer until a story needs them.
- Do NOT pass `amount` in 9-6 — Phase 2 is full-refund-only.
- Do NOT pass `refund_application_fee: true` — destination-charge full refunds auto-reverse the fee. Adding the flag would double-reverse and break the math.
- Do NOT use per-attempt UUIDs — per-booking-id is correct (the operation is bounded to one PI, and retries should hit Stripe's idempotency cache).

---

### Decision 5: `cancelBookingAction` extension — 3-branch logic with Stripe-first-then-DB ordering

**Locked branching logic** (full spec; ties to Decision §2):

```typescript
// After Phase 1 pre-checks (auth + role + getBookingById + requireOwnership):

const isPhase1Pending =
  booking.status === 'PENDING' && booking.paymentIntentId === null;
const isPhase2PendingAuth =
  booking.status === 'PENDING' &&
  booking.paymentStatus === 'AUTHORIZED' &&
  booking.paymentIntentId !== null;
const isPhase2ConfirmedCaptured =
  booking.status === 'CONFIRMED' &&
  booking.paymentStatus === 'CAPTURED' &&
  booking.paymentIntentId !== null;

if (isPhase1Pending) {
  // No Stripe call. Use existing cancelBooking helper unchanged.
  const updated = await cancelBooking(bookingId, callerId);
  if (!updated) {
    return { status: 'error', code: 'CANNOT_CANCEL', message: '<updated copy>' };
  }
  // post-success: revalidate + notify + return success
} else if (isPhase2PendingAuth) {
  // Stripe-first-then-DB ordering (BA Decision §5 + 9-4 carry-forward):
  const cancelResult = await cancelPaymentIntent({
    paymentIntentId: booking.paymentIntentId!,
    idempotencyKey: `cancel-${bookingId}`,  // same key as 9-4's reject path
  });
  if (!cancelResult.ok) {
    return { status: 'error', code: 'STRIPE_CANCEL_FAILED', message: cancelResult.error };
  }
  const updated = await markBookingCancelledAndVoided(bookingId, callerId);
  if (!updated) {
    return { status: 'error', code: 'CANNOT_CANCEL', message: '<updated copy>' };
  }
  // post-success: revalidate + notify + return success
} else if (isPhase2ConfirmedCaptured) {
  // Check refund eligibility FIRST — no Stripe call if ineligible.
  if (!isRefundEligible(booking.bookingDate)) {
    return {
      status: 'error',
      code: 'REFUND_INELIGIBLE',
      message: 'Cancellations within 24 hours of the booking date are non-refundable.',
    };
  }
  // Stripe-first-then-DB ordering:
  const refundResult = await createRefund({
    paymentIntentId: booking.paymentIntentId!,
    idempotencyKey: `refund-${bookingId}`,
  });
  if (!refundResult.ok) {
    return { status: 'error', code: 'STRIPE_REFUND_FAILED', message: refundResult.error };
  }
  // Full refund: refund amount === booking.totalCents.
  const updated = await markBookingCancelledAndRefunded(
    bookingId,
    callerId,
    booking.totalCents,
  );
  if (!updated) {
    return { status: 'error', code: 'CANNOT_CANCEL', message: '<updated copy>' };
  }
  // post-success: revalidate + notify + return success
} else {
  // Terminal state (CANCELLED, REJECTED) OR mid-refund OR unexpected
  // (e.g., booking.paymentIntentId NOT NULL but payment_status is not
  // AUTHORIZED/CAPTURED — could indicate state corruption).
  return { status: 'error', code: 'CANNOT_CANCEL', message: '<updated copy>' };
}
```

**Idempotency-key sharing with 9-4's reject path is INTENTIONAL.** The same key `cancel-${bookingId}` lets Stripe's idempotency cache resolve correctly:
- If a Phase 2 PENDING booking was already PI-cancelled (e.g., 9-4 Owner-Reject ran first), `cancelPaymentIntent` returns the cached `canceled` PI — Stripe API succeeds; our subsequent `markBookingCancelledAndVoided` no-ops (the booking is no longer in `(PENDING, AUTHORIZED)`); we surface CANNOT_CANCEL. Clean.
- If a Guest-cancel runs first, then Owner clicks Reject on the now-CANCELLED row, 9-4 returns CANNOT_REJECT.

**Cross-references to other patterns from prior stories:**
- Stripe-first-then-DB: 9-4 Decision §2/§3 (inverse of 9-3's pre-claim; correct here because no slot-claim race on Guest cancel).
- Conditional UPDATE for race-safety: 9-4 Decision §2 (carries forward).
- Refusal returns the error code (no DB write happens on ineligible / Stripe-failed paths): 9-4 Decision §6 (carries forward).

**Anti-pattern forbidden:**
- Do NOT do DB-first-then-Stripe (preserves Stripe-first ordering lock from 9-4).
- Do NOT call `stripe.refunds.*` from outside `src/lib/payments/refunds.ts`.
- Do NOT issue a refund without checking eligibility first (PRD §4.5 / FR-REFUND-3 explicit lock — refusal IS the policy enforcement).
- Do NOT roll the eligibility check into the SQL WHERE clause — keep it as application-layer logic so the error message is precise.
- Do NOT skip `requireOwnership` (Phase 1 carry-forward — defense-in-depth alongside the conditional WHERE on `guestUserId`).
- Do NOT widen the role gate to SPACE_OWNER or SUPER_ADMIN in 9-6 (PRD FR-REFUND-4 force-majeure Owner-refund is forward-prepared at the signature level but NOT surfaced — Phase 2 UI scope).
- Do NOT keep the verbatim Phase 1 message "Only pending bookings can be cancelled" — that's the load-bearing supersedence.

---

### Decision 6: New `bookings` query helpers — 3 new conditional UPDATEs

**Locked: 3 new helpers in [src/db/queries/bookings.ts](deskhive/src/db/queries/bookings.ts).**

```typescript
/**
 * Story 9-6: Phase 2 PENDING Guest-cancel. Transitions
 * (PENDING, AUTHORIZED) → (CANCELLED, VOIDED). Used by
 * `cancelBookingAction` AFTER `cancelPaymentIntent` succeeds.
 *
 * Conditional WHERE keyed on (id, status='PENDING',
 * payment_status='AUTHORIZED', guest_user_id) — race-safety net AND
 * ownership defense-in-depth. Mirrors 9-4's `markBookingRejectedAndVoided`
 * with the additional guest_user_id clause (since the Guest-cancel path
 * carries that constraint, vs. 9-4's admin/owner reject).
 */
export async function markBookingCancelledAndVoided(
  id: string,
  guestUserId: string,
): Promise<Booking | undefined>;

/**
 * Story 9-6: Phase 2 CONFIRMED Guest-cancel with full refund.
 * Transitions (CONFIRMED, CAPTURED) → (CANCELLED, REFUNDED) and writes
 * refunded_at + refund_amount_cents.
 *
 * Conditional WHERE keyed on (id, status='CONFIRMED',
 * payment_status='CAPTURED', guest_user_id) — same race-safety net.
 */
export async function markBookingCancelledAndRefunded(
  id: string,
  guestUserId: string,
  refundAmountCents: number,
): Promise<Booking | undefined>;

/**
 * Story 9-6: webhook backstop for charge.refunded handler. Same
 * transition as markBookingCancelledAndRefunded but keyed on
 * payment_intent_id (no guest_user_id clause — the webhook doesn't
 * know who initiated; the bookingId/PI uniqueness is the join).
 *
 * Used by handleChargeRefunded as the Stripe-side-truth-syncing
 * backstop for the narrow window where the action's DB write fails
 * AFTER stripe.refunds.create succeeds.
 */
export async function markBookingCancelledAndRefundedByPaymentIntent(
  paymentIntentId: string,
  refundAmountCents: number,
): Promise<Booking | undefined>;
```

All three helpers use the by-now-canonical pattern: conditional `WHERE and(eq(id|paymentIntentId), eq(status), eq(payment_status), [eq(guestUserId)])` + SET `(status, payment_status, refunded_at, refund_amount_cents, updated_at)` + `.returning()`. Empty `.returning()` → caller surfaces CANNOT_CANCEL (Phase 1 carry-forward) or webhook returns `{ idempotent: true }`.

**Anti-pattern forbidden:**
- Do NOT skip the guest_user_id clause in the two action-facing helpers (defense-in-depth alongside the action's `requireOwnership`).
- Do NOT collapse the three helpers into one with a parameterized "target state" arg — the type checker should enforce each state transition's column writes.
- Do NOT add a `markBookingCancelledByPaymentIntent` payment_status-only variant for the webhook — the webhook is the FULL state backstop (transitions both `status` AND `payment_status` atomically), matching 9-5's pattern from Decision §5.
- Do NOT widen the WHERE clauses; race-safety is the whole point.

---

### Decision 7: NEW `handleChargeRefunded` webhook handler — extends 9-5's dispatcher map

**Locked: add 1 new handler + 1 new map entry to [src/lib/payments/webhooks.ts](deskhive/src/lib/payments/webhooks.ts).**

**Why this is the first proof of 9-5's extensibility design:**

Story 9-5 locked the dispatcher map shape with the promise that 9-6 and 9-7 each extend by adding one handler function + one map entry. 9-6 is the first story to prove this works in practice. If extending the map turns out to be more work than expected, this is the early-warning signal to re-evaluate the dispatcher design before 9-7.

**Locked handler shape:**

```typescript
// src/lib/payments/webhooks.ts — new handler added to the existing file

export async function handleChargeRefunded(
  event: Stripe.Event,
): Promise<WebhookHandlerResult> {
  const charge = event.data.object as Stripe.Charge;
  // `charge.payment_intent` is the string PI ID (not expanded). We use
  // it as the join key — same pattern as 9-5's PI handlers.
  const paymentIntentId =
    typeof charge.payment_intent === 'string'
      ? charge.payment_intent
      : (charge.payment_intent?.id ?? null);
  if (!paymentIntentId) {
    logger.warn('stripe_webhook_charge_refunded_no_payment_intent', {
      eventId: event.id,
      chargeId: charge.id,
    });
    return { ok: true, deferred: true };
  }

  // `charge.amount_refunded` is the cumulative refunded amount (cents).
  // For Phase 2 full refunds, this equals charge.amount. Phase 3 partials
  // would need richer logic — see anti-patterns.
  const refundAmountCents = charge.amount_refunded;

  // 3-stage try-catch wrapper from 9-2 BA-walk-fix pattern preserved.
  // (Lookup + UPDATE + per-stage error logging.)
  // ... (mirror of handlePaymentIntentSucceeded's structure from 9-5)

  // Conditional UPDATE via markBookingCancelledAndRefundedByPaymentIntent
  // restricts to rows currently in (CONFIRMED, CAPTURED). Action-side
  // already won → conditional returns undefined → handler reports
  // idempotent (route skips webhook_events insert).
}
```

**Map entry:**

```typescript
export const WEBHOOK_HANDLERS = {
  // ... existing 5 entries from 9-5 ...
  'charge.refunded': handleChargeRefunded,  // NEW in 9-6
};
```

**Log keys for the new handler** (follow the 9-5 convention):
- `stripe_webhook_charge_refunded_no_payment_intent`
- `stripe_webhook_charge_refunded_lookup_failed`
- `stripe_webhook_charge_refunded_booking_not_found`
- `stripe_webhook_charge_refunded_update_failed`
- `stripe_webhook_charge_refunded_already_refunded`

**Why `charge.refunded` (not `refund.created`):**

Stripe emits both events when a refund is created. `refund.created` is the per-refund-attempt event; `charge.refunded` is the per-charge state-change event. For Phase 2 full-refund-only:
- `charge.refunded` fires once with `charge.amount_refunded === charge.amount`.
- `refund.created` fires once with the new Refund object.

Both events carry sufficient info to look up the booking by PI. `charge.refunded` is the more canonical "the customer was refunded" signal; `refund.created` is the "Stripe started a refund attempt" signal (which could still fail). PRD §4.5 FR-REFUND-5 explicitly names `charge.refunded`. Strawman locks `charge.refunded`.

**Phase 3 partial refunds** (out of 9-6 scope but worth flagging): `charge.refunded` fires on every partial refund with cumulative `amount_refunded`. The handler would need richer logic to update `refund_amount_cents` cumulatively rather than once. 9-6 ships full-refund-only; the simpler shape works.

**Anti-pattern forbidden:**
- Do NOT also handle `refund.created` — `charge.refunded` is the locked event per FR-REFUND-5.
- Do NOT call `stripe.refunds.retrieve` from the handler — webhook payload is the source of truth (9-5 carry-forward).
- Do NOT trigger any email send from the handler — 8-4 territory.
- Do NOT skip the conditional WHERE on `markBookingCancelledAndRefundedByPaymentIntent`.
- Do NOT add `payment_intent.payment_failed` in 9-6 — still no consumer.

---

### Decision 8: UI surface extension — cancel button on CONFIRMED future-dated bookings

**Rationale:** Phase 1 only renders `<CancelBookingButton>` on PENDING bookings (per [page.tsx:178](deskhive/src/app/my-bookings/page.tsx) — `isPending ? <CancelBookingButton /> : ...`). Phase 2 PRD §4.5 enables CONFIRMED cancel; the UI must surface the button.

**Locked changes to [my-bookings/page.tsx](deskhive/src/app/my-bookings/page.tsx):**

1. Show `<CancelBookingButton>` on CONFIRMED + future-dated bookings (in addition to PENDING).
2. The PENDING branch's "Awaiting confirmation from the space." context line stays.
3. The CONFIRMED + future-dated branch (currently `null` per the `// CONFIRMED future-dated → no footer (keep card tight)` comment) gets a footer with the button.
4. Past-dated CONFIRMED bookings continue to show no cancel button (the 24h refund-eligibility helper would refuse anyway; rendering the button just to error out is bad UX).

**Button label** — strawman picks softer copy for the CONFIRMED case. Two options:

- **(a) Single label "Cancel booking"** for both PENDING and CONFIRMED — uniform copy; loses the Phase 1 "Cancel request" framing for PENDING.
- **(b) Branch label** — "Cancel request" for PENDING, "Cancel booking" for CONFIRMED. Requires passing booking.status as a prop OR splitting into two buttons.

**Strawman pick: (a) "Cancel booking"** — simpler component (no new prop), more universal copy. The "request" framing leaked Phase 1's PENDING-only assumption; Phase 2 makes both states cancellable.

**Pending-state copy** — "Cancelling…" stays from [cancel-booking-button.tsx:52](deskhive/src/app/my-bookings/cancel-booking-button.tsx). Works for all three branches.

**Confirm dialog?** — Phase 1 has NO confirm dialog (single-click cancel). Phase 2 cancellation with money movement could justify a confirm dialog ("Cancel this booking? You'll receive a full refund."). **Strawman: NO confirm dialog in 9-6** — Phase 1 UX precedent is no-dialog; adding one here breaks the established pattern for what's still a Guest-driven cancellation. The refund-ineligible toast (Decision §9) gives clear feedback for the within-24h case.

If BA wants a confirm dialog (e.g., to surface "this will refund your card" before the destructive action), that's a Phase 2 polish or a 9-6 BA override.

**Anti-pattern forbidden:**
- Do NOT split `<CancelBookingButton>` into two components (PENDING vs CONFIRMED variants).
- Do NOT show the cancel button on past-dated bookings (would always error out → bad UX).
- Do NOT show the cancel button on already-CANCELLED / REJECTED bookings (existing logic; preserved).
- Do NOT add a confirm dialog without BA approval (Phase 1 UX precedent is no-dialog).
- Do NOT pre-compute refund eligibility client-side and disable the button — the action is the source of truth; client-side preview would diverge from server clock and confuse Guests.

---

### Decision 9: Toast copy + error display — new `CANCEL_REFUND_INELIGIBLE` toast + inline for Stripe errors

**Rationale:** PRD §1.2 step 21 mandates "error toast" for the within-24h refusal. That's a new TOAST_COPY entry. Other error codes (Stripe failures) carry forward 9-4's inline-error pattern.

**Locked additions to [src/lib/toast.ts](deskhive/src/lib/toast.ts):**

```typescript
// TOAST_COPY — new entry for the 9-6 refund-ineligible refusal:
CANCEL_REFUND_INELIGIBLE: {
  title: 'Cancellation not eligible',
  description:
    'Cancellations within 24 hours of the booking date are non-refundable.',
},
```

(Strawman picks the title/description shape; dev-agent OR BA may pick the exact phrasing.)

**Existing `CANCEL_SUCCESS` entry reused** for all 3 happy paths (Phase 1 PENDING / Phase 2 PENDING / Phase 2 CONFIRMED + refund). The single "Booking cancelled." message works because:
- The booking IS cancelled in all 3 cases.
- The refund-confirmation email (Story 8-4 territory; depends on 9-5's dispatch + 9-6's webhook handler) handles the "we refunded your card" message — separation of concerns.

**Inline error rendering preserved** (from 9-4's pattern) for:
- `STRIPE_CANCEL_FAILED` (Phase 2 PENDING path; Stripe `paymentIntents.cancel` failed) — message is Stripe's verbatim error.
- `STRIPE_REFUND_FAILED` (Phase 2 CONFIRMED path; Stripe `refunds.create` failed) — same.
- `CANNOT_CANCEL` (existing; semantics shifted per Decision §2's supersedence) — already in the action; existing inline rendering works.

**Button-side toast dispatch** — [cancel-booking-button.tsx:21–26](deskhive/src/app/my-bookings/cancel-booking-button.tsx) currently fires `toastSuccess(TOAST_COPY.CANCEL_SUCCESS)` on `state.status === 'success'`. Extend the `useEffect` to also fire `toastError(TOAST_COPY.CANCEL_REFUND_INELIGIBLE)` on `state.code === 'REFUND_INELIGIBLE'`. Other error codes stay inline (via `state.message`).

**Anti-pattern forbidden:**
- Do NOT inline-render the `REFUND_INELIGIBLE` message — PRD §1.2 step 21 explicit "error toast" lock.
- Do NOT use a toast for the `STRIPE_*_FAILED` codes — 9-4's inline pattern carries forward.
- Do NOT introduce ad-hoc strings at the call site — all toast text lives in `TOAST_COPY`.
- Do NOT change the existing `CANCEL_SUCCESS` copy — Story 6-3 lock, preserved.

**BA walk supplement (2026-05-19):** success toast for the eligible-refund branch added in follow-up commit `fix: add refund-success toast to eligible-refund cancel path (BA walk fix)`. Specifies the in-app confirmation pattern for guest cancels with refund; Phase 1 generic cancel toast unchanged. The BA-walk uncovered that the original Decision §9 only specified the `CANCEL_REFUND_INELIGIBLE` failure toast — the success path silently fell through to the Phase 1 generic `CANCEL_SUCCESS` ("Booking cancelled."), which under-conveyed the refund processing + the 5–10 business-day settlement window. New `CANCEL_REFUND_SUCCESS_TITLE` constant added to `TOAST_COPY`; description interpolates the formatted refund amount at the call site (same convention as `APPLICATION_APPROVED_TITLE`). Final wording: title `"Booking cancelled"` + description `"Refund of $X.XX is being processed. It will appear on your original payment method within 5–10 business days."` where `$X.XX` is `formatCents(refundAmountCents)` from `src/lib/format.ts`. Action's success-state shape extended with optional `refundAmountCents` field — only populated on the eligible-refund branch; absent on Phase 1 + Phase 2 PENDING+AUTHORIZED paths (no money moved → button falls through to the generic toast).

---

### Decision 10: Error code expansions on `CancelBookingActionState`

**Locked additions to `CancelBookingActionState`:**

```typescript
export type CancelBookingActionState =
  | { status: 'idle' }
  | { status: 'success' }
  | { status: 'error'; code: 'FORBIDDEN'; message: string }
  | { status: 'error'; code: 'NOT_FOUND'; message: string }
  | { status: 'error'; code: 'CANNOT_CANCEL'; message: string }
  // Story 9-6 additions:
  | { status: 'error'; code: 'REFUND_INELIGIBLE'; message: string }
  | { status: 'error'; code: 'STRIPE_REFUND_FAILED'; message: string }
  | { status: 'error'; code: 'STRIPE_CANCEL_FAILED'; message: string }
  | { status: 'error'; code: 'INTERNAL_ERROR'; message: string };
```

`REFUND_INELIGIBLE` triggers the new toast (Decision §9). `STRIPE_REFUND_FAILED` + `STRIPE_CANCEL_FAILED` use inline rendering (9-4 carry-forward).

**Why distinct codes for `STRIPE_REFUND_FAILED` + `STRIPE_CANCEL_FAILED` (instead of one shared `STRIPE_FAILED`):**

- Mirrors 9-4's split (`STRIPE_CAPTURE_FAILED` + `STRIPE_CANCEL_FAILED` are distinct in `ConfirmBookingActionState` + `RejectBookingActionState`).
- Test assertions can target the specific code path.
- Future toast variants (if richer UX lands in Phase 3) can map distinctly.

**Anti-pattern forbidden:**
- Do NOT collapse into a single `STRIPE_FAILED` code.
- Do NOT reuse `STRIPE_CANCEL_FAILED` from 9-4's `RejectBookingActionState` — different state type even if the code name is the same.

---

### Decision 11: Audit-trail strictness — accept the 9-5 audit-gap-on-retry pattern for the refund handler

**The 9-5 forward-flag question:** the `charge.refunded` handler is money-outbound. Should it use stricter audit semantics (transactional write-with-rollback) vs. 9-5's accepted audit-gap-on-retry pattern?

**Trade-off:**

- **9-5 pattern (audit-gap-on-retry):** handler succeeds at DB UPDATE → returns `{ handled: true }` → route attempts `webhook_events` INSERT → if INSERT fails, return 500 → Stripe retries → next delivery's idempotent path runs (no audit row recorded, but DB state is correct). Cost: the specific Stripe event ID that caused the DB transition isn't recorded in `webhook_events`.
- **Stricter pattern (transactional write-with-rollback):** handler's DB UPDATE + `webhook_events` INSERT happen in a single transaction; rollback if INSERT fails. Cost: introduces transaction-spanning code into the dispatcher (which is otherwise transaction-free); doesn't actually buy compliance-grade audit because the `bookings.refunded_at` + `refund_amount_cents` columns ARE the financial audit trail — the `webhook_events` row is operational (idempotency / replay debugging), not financial.

**Locked: accept the 9-5 audit-gap-on-retry pattern for the `charge.refunded` handler.**

Rationale:
- The financial audit trail is on the booking row itself (`refunded_at` timestamp + `refund_amount_cents` integer + `payment_status='REFUNDED'`). Missing a `webhook_events` row doesn't lose financial truth.
- Transactional write-with-rollback introduces dispatcher complexity for a benefit (Stripe-event-id traceability) that's not load-bearing for compliance.
- 9-5's pattern is proven across 5 handlers. Adding a special case for one handler increases cognitive load on future maintainers.
- If Phase 3 compliance review demands stricter Stripe-event traceability, the bookings table can grow a `last_refund_event_id` column (cheap) — better than dispatcher refactoring.

**The locked stance:** 9-5's pattern carries forward to the refund handler. The 9-5 forward-flag is RESOLVED — no transactional semantics needed.

**Anti-pattern forbidden:**
- Do NOT introduce transactional write-with-rollback for `handleChargeRefunded` (the 9-5 pattern is preserved).
- Do NOT add a `last_refund_event_id` column in 9-6 (out of scope; flag for Phase 3 if compliance review demands).
- Do NOT widen the audit trade-off discussion to ALL 9-5 handlers — this decision is specifically about `charge.refunded`.

---

### Decision 12: Unit test coverage — ~12-15 new across action + wrapper + helpers + handler

**Target after 9-6 ships: 378 + ~12-15 new = ~390-393 unit tests.** Per the 9-1 / 9-2 / 9-2b / 9-3 / 9-4 / 9-5 precedent, dev-agent typically ships 1-3 bonus tests beyond the BA estimate (9-5 shipped +9 over — high outlier; expect a tighter delta here).

**Test split by mock boundary (carry-forward from 9-5):**

1. **`src/lib/payments/refunds.test.ts`** (NEW — 2 wrapper tests):
   - Happy path: Stripe SDK called with correct args + idempotency key; result wrapped as `StripeServiceResult<{ refundId, paymentIntentId, status, amountCents }>`.
   - Error path: Stripe throws `StripeError` → `{ ok: false, error: <message> }`.
   - Mock at `@/lib/stripe` boundary.

2. **`src/lib/refund-policy.test.ts`** (NEW — 4-5 helper tests):
   - Boundary at exactly 24h before booking date → INELIGIBLE.
   - 24h00m01s before → ELIGIBLE.
   - 23h59m59s before → INELIGIBLE.
   - Past booking date → INELIGIBLE.
   - Far-future booking date (e.g., 30 days) → ELIGIBLE.
   - Parameterized table preferred. Pure function — no mocks needed (inject `now` arg).

3. **`src/actions/booking.test.ts`** extension (~5-6 tests for the new branches):
   - **Phase 2 PENDING happy** — booking in `(PENDING, AUTHORIZED, PI)` → action calls `cancelPaymentIntent` with `cancel-${bookingId}` key → `markBookingCancelledAndVoided` → state success. Stripe wrapper called once.
   - **Phase 2 CONFIRMED eligible happy** — booking in `(CONFIRMED, CAPTURED, PI)` + booking_date 30 days out → eligibility check passes → `createRefund` with `refund-${bookingId}` → `markBookingCancelledAndRefunded` with `refundAmountCents === totalCents` → state success.
   - **Phase 2 CONFIRMED ineligible refusal** — booking in `(CONFIRMED, CAPTURED, PI)` + booking_date 12h out → eligibility check fails → action returns `REFUND_INELIGIBLE`; Stripe wrappers NOT called; DB NOT touched.
   - **Phase 2 CONFIRMED + Stripe refund failure** — eligible booking, but `createRefund` returns `{ ok: false }` → action returns `STRIPE_REFUND_FAILED`; DB NOT touched.
   - **Phase 1 backwards-compat preservation** — booking in `(PENDING, NULL payment_intent_id)` → action calls existing `cancelBooking` helper; Stripe wrappers NOT called.
   - **CANNOT_CANCEL on terminal state** — booking in `(CANCELLED, REFUNDED)` → action returns `CANNOT_CANCEL`; no Stripe calls.
   - Mock at `@/lib/payments/refunds` + `@/lib/payments/payment-intents` boundaries (per the split-by-mock-boundary pattern from 9-2 / 9-3 / 9-4).

4. **`src/lib/payments/webhooks.test.ts`** extension (~2-3 handler tests):
   - **`handleChargeRefunded` happy** — booking in `(CONFIRMED, CAPTURED, PI)` → conditional UPDATE returns row → `{ handled: true }`. Verifies `markBookingCancelledAndRefundedByPaymentIntent` called with PI id + `charge.amount_refunded` value.
   - **`handleChargeRefunded` idempotent** — booking already in `(CANCELLED, REFUNDED)` → conditional UPDATE returns undefined → `{ idempotent: true }`.
   - **`handleChargeRefunded` deferred booking-not-found** — `getBookingByPaymentIntentId` returns undefined → `{ deferred: true }`. (Reuses the existing helper from 9-5 — no new lookup helper needed.)

5. **`src/db/queries/bookings.test.ts`** extension (~3-4 parameterized helper tests):
   - `markBookingCancelledAndVoided` happy + race-lost (1 parameterized).
   - `markBookingCancelledAndRefunded` happy + race-lost (1 parameterized).
   - `markBookingCancelledAndRefundedByPaymentIntent` happy + race-lost (1 parameterized).
   - Optional: a test for the `refunded_at` + `refund_amount_cents` write verification (assert SET clause via mock assertion).

**Mock boundary reminder (3 layers from 9-5):**
- Action tests mock `@/lib/payments/refunds` + `@/lib/payments/payment-intents` + `@/db/queries/bookings`.
- Wrapper tests mock `@/lib/stripe`.
- Handler tests mock `@/db/queries/*`.
- Query tests mock `@/db/client`.

**Anti-pattern forbidden:**
- Do NOT write integration tests that hit the real Stripe API.
- Do NOT skip the boundary-of-24h test (the load-bearing edge case for the eligibility helper).
- Do NOT mock the refund-policy helper from inside the action tests — inject `now` if needed, but the helper is pure and trivial to evaluate.

---

### Decision 13: E2E test coverage — 0 new (lock target at 61 unchanged)

**Locked: 0 new E2E tests in 9-6. Target stays at 61.**

**Rationale (same shape as 9-4 + 9-5):** the Phase 2 refund happy path requires a real Stripe-captured booking, which means either:
- Real `stripe.paymentIntents.create({ capture_method: 'manual' })` + capture + refund (slow, costs test-mode quota, fragile).
- Dev-server-layer Stripe stubs (invasive, out of scope).

Unit tests + BA-walk via `stripe listen` + manual dashboard refund verification cover the verification surface. The within-24h refusal path is unit-testable with the eligibility helper (no Stripe involvement). The Phase 1 backwards-compat path is already E2E-covered (US-3.5 tests from Phase 1).

**Optional E2E** that BA may consider locking instead of (i) `0 new`:
- **Within-24h refusal E2E**: seed a `(CONFIRMED, CAPTURED)` booking via DB-direct insert + booking_date set to today/tomorrow → click Cancel → assert `REFUND_INELIGIBLE` toast surfaces + no DB state change. No Stripe API call fires (eligibility check is application-layer). Strawman doesn't lock this as required, but flag for BA — could be a +1 E2E if BA wants regression coverage.

**Anti-pattern forbidden:**
- Do NOT call real Stripe `refunds.create` from E2E.
- Do NOT mock the Stripe SDK at dev-server layer.
- Do NOT enter Stripe-hosted UI from E2E (no UI involved here anyway — refunds are server-side only).

---

### Decision 14: Memory file extension + RESOLVE the open-question memory

**Locked: continue extending `reference_stripe_service_pattern.md` with a new "Story 9-6 additions — Cancellation with Refund" section.**

Cover:
- 5th sub-module pattern: `src/lib/payments/refunds.ts`.
- `cancelBookingAction` in-place extension (vs replacement). The 3-branch logic. The Phase 1 verbatim message supersedence.
- Refund-eligibility helper at `src/lib/refund-policy.ts` (or `src/lib/bookings.ts` — record dev-agent's pick). UTC-only 24h math; integer-ms arithmetic.
- `payment_status` CHECK constraint extended to 5 values (3rd DROP/ADD instance).
- `refunded_at` + `refund_amount_cents` columns — NULL-able by design.
- Per-booking-id idempotency key `refund-${bookingId}` (alignment with 9-4's pattern; same namespace for `cancel-${bookingId}` is shared between 9-4 reject + 9-6 Phase 2 PENDING cancel — INTENTIONAL since the operation is the same).
- `handleChargeRefunded` — 6th handler in the dispatcher map; PROVES 9-5's extensibility design (1 new function + 1 new map entry).
- Audit-trail decision: 9-5's audit-gap-on-retry pattern accepted for refunds (the bookings row IS the financial audit; webhook_events is operational).
- Refund-policy helper location decision (dev-agent's choice between `src/lib/refund-policy.ts` and `src/lib/bookings.ts`).
- Forward-looking flags for Phase 3: partial refunds, multi-policy, Owner-side force-majeure UI.

**RESOLVE the open-question memory `project_phase2_prd_4_5_cancel_interpretation.md`:**

Mark the memory as RESOLVED with a header pointing to this decision doc. The body stays for historical context but the file ceases to be a "needs attention" flag. Add the resolution date + the locked stance (Decision §2 + §5: extend `cancelBookingAction` in-place to support PENDING + CONFIRMED + Phase 1 backwards-compat). Future stories that touch cancellation should reference 9-6's resolution rather than re-opening the question.

**Anti-pattern forbidden:**
- Do NOT spin out a new memory file for 9-6's Stripe pattern additions — extend the existing reference.
- Do NOT delete the open-question memory — preserve as resolved/historical (other stories may need the context).

---

### Decision 15: Files likely touched (estimate, not directive)

**New:**
- `deskhive/drizzle/migrations/0007_<name>.sql` (auto-generated + story-tag comment block)
- `deskhive/drizzle/migrations/meta/0007_snapshot.json` (auto)
- `deskhive/src/lib/payments/refunds.ts` — `createRefund` wrapper
- `deskhive/src/lib/payments/refunds.test.ts` — 2 wrapper tests
- `deskhive/src/lib/refund-policy.ts` — `isRefundEligible` helper (OR add to `src/lib/bookings.ts` — dev-agent picks)
- `deskhive/src/lib/refund-policy.test.ts` — 4-5 policy tests (OR colocated with `bookings.test.ts`)

**Modified:**
- `deskhive/src/db/schema.ts` — add 2 columns + extend `bookings_payment_status_check` to 5 values
- `deskhive/drizzle/migrations/meta/_journal.json` (auto)
- `deskhive/src/db/queries/bookings.ts` — add 3 new helpers
- `deskhive/src/db/queries/bookings.test.ts` — add tests for the new helpers
- `deskhive/src/actions/booking.ts` — extend `cancelBookingAction` with 3-branch logic + 3 new error codes
- `deskhive/src/actions/booking.test.ts` — add ~5-6 tests for the new branches
- `deskhive/src/lib/payments/webhooks.ts` — add `handleChargeRefunded` + map entry
- `deskhive/src/lib/payments/webhooks.test.ts` — add ~2-3 handler tests
- `deskhive/src/app/my-bookings/page.tsx` — render `<CancelBookingButton>` for CONFIRMED future-dated bookings
- `deskhive/src/app/my-bookings/cancel-booking-button.tsx` — update label to "Cancel booking"; fire `toastError(CANCEL_REFUND_INELIGIBLE)` on `REFUND_INELIGIBLE` state
- `deskhive/src/lib/toast.ts` — add `CANCEL_REFUND_INELIGIBLE` entry
- `_bmad-output/implementation-artifacts/sprint-status.yaml` — Epic 9 row
- `_bmad-output/implementation-artifacts/9-6-cancellation-with-refund.md` — story file (created by `*create-story 9-6`)
- Memory: `~/.claude/.../memory/reference_stripe_service_pattern.md` (Decision §14)
- Memory: `~/.claude/.../memory/project_phase2_prd_4_5_cancel_interpretation.md` — mark RESOLVED
- Memory: `~/.claude/.../memory/MEMORY.md` — one-liner refresh

**Zero changes to** (carved-out for later stories):
- `deskhive/src/lib/stripe.ts` (Story 9-1's singleton)
- `deskhive/src/lib/stripe-service.ts` (Story 9-1's barrel)
- `deskhive/src/lib/payments/connect.ts` (Story 9-2's wrappers)
- `deskhive/src/lib/payments/checkout.ts` (Story 9-3's wrappers)
- `deskhive/src/lib/payments/payment-intents.ts` (Story 9-4's wrappers — `cancelPaymentIntent` is REUSED but the file isn't modified)
- `deskhive/src/app/api/stripe/webhook/route.ts` (Story 9-5's thin shell — the new handler lives in `webhooks.ts`; the route isn't touched)
- `deskhive/src/actions/booking-with-payment.ts` (Story 9-3's create-with-payment)
- `deskhive/src/lib/email*` / `deskhive/src/lib/email-templates/` (Story 8-4 wires payment-driven emails AFTER 9-6 lands `charge.refunded`)
- `deskhive/src/app/(owner)/owner/*` / `deskhive/src/app/admin/*` (no UI changes in 9-6 outside `/my-bookings`)
- `deskhive/scripts/seed.ts` (no seed changes)

---

## Architectural anti-patterns forbidden (rollup)

1. Floating-point math anywhere (CC-2 carry-forward) — refund-policy helper is integer-ms math only.
2. Stripe SDK imports outside `src/lib/stripe.ts` + `src/lib/payments/*` sub-modules (CC-3).
3. DB-first-then-Stripe ordering — Stripe-first locked (Decision §5; 9-4 carry-forward).
4. Calling `stripe.refunds.*` outside `src/lib/payments/refunds.ts`.
5. Adding `stripe.refunds.retrieve` / `stripe.refunds.list` / `stripe.refunds.update` in 9-6 — defer.
6. Partial refunds — Phase 3.
7. Per-attempt UUID idempotency keys for refunds — per-booking-id is locked.
8. Owner-side / Admin-side refund UI — FR-REFUND-4 forward-ready signature only.
9. New `bookings.status` enum values (4-state set stays).
10. Skipping signature verification or the idempotency check at the route (CC-7 / 9-5 carry-forward).
11. Email sends from inside the action OR inside the webhook handler — 8-4 territory (carry-forward from 9-2 / 9-3 / 9-4 / 9-5).
12. Stripe API calls from inside the webhook handler (9-3 + 9-5 carry-forward).
13. Inline-rendering the `REFUND_INELIGIBLE` message — PRD §1.2 step 21 explicit "error toast" lock.
14. Toast for `STRIPE_*_FAILED` codes — 9-4 inline-error pattern carries forward.
15. Confirm dialog before cancel — Phase 1 UX precedent is no-dialog; out of 9-6 scope unless BA overrides.
16. Multi-policy refund windows — Phase 3.
17. Transactional write-with-rollback for the webhook handler — 9-5 audit-gap-on-retry pattern carries forward (Decision §11).
18. Adding `last_refund_event_id` or similar audit-trail columns — out of 9-6 scope.
19. Adding `payment_intent.payment_failed` handler — still no consumer.
20. `refund.created` handler — `charge.refunded` is the locked event (Decision §7).
21. Showing the cancel button on past-dated bookings — would always error out.
22. Pre-computing refund eligibility client-side — server is the source of truth (Decision §8 anti-pattern).
23. Floating-point booking-date math — Date.getTime() + integer ms (Decision §3).
24. Timezone-aware date math — UTC-only per FR-REFUND-2 (Decision §3).
25. Re-keying the idempotency namespace `cancel-${bookingId}` — INTENTIONALLY shared with 9-4's reject path (Decision §5).
26. Skipping `requireOwnership` — defense-in-depth carries forward.
27. Widening the role gate beyond GUEST — Owner-side refund is forward-signature-prepared only.

---

## Operator prereqs (BA completes BEFORE dev-story dispatch)

- [ ] **Stripe dashboard test-mode active** — reconfirm.
- [ ] **`.env.local` has `STRIPE_SECRET_KEY` + `STRIPE_PUBLISHABLE_KEY` + `STRIPE_WEBHOOK_SECRET`** — present from 9-2 / 9-3 / 9-4 / 9-5.
- [ ] **`pnpm db:seed` has been run on the latest schema** (after 9-5 ship). Verify `owner@deskhive.local` has Connect row + at least one published space.
- [ ] **`pnpm typecheck` + `pnpm test` + `pnpm test:e2e` baseline green on `main`** — confirms 9-5 ship is stable before 9-6 dispatches.
- [ ] **`stripe listen --forward-to localhost:3000/api/stripe/webhook`** running during BA walk + `STRIPE_WEBHOOK_SECRET` swapped to CLI-printed `whsec_...` value + `pnpm dev` restarted (same operator pattern as 9-5 BA walk).
- [ ] **At least one fresh CONFIRMED + CAPTURED booking** with `booking_date` at least 30 days out — for the eligible-refund happy path walk. **Recommended**: also seed a CONFIRMED + CAPTURED booking with `booking_date` within 24h for the ineligible-refusal walk (the BA's actual DB likely has the 9-4 BA-walk artifact `92bd9829-...` already in CONFIRMED + CAPTURED state — confirm via SELECT before walk).
- [ ] **`owner@deskhive.local`'s Connect row is in real (not synthetic) state** — refund payouts settle against the real connected account. Re-onboard via `/owner/settings` if seed has reset (same prereq carries forward from 9-4 / 9-5 walks).
- [ ] **Decision §3 helper-location resolution recorded** — `src/lib/refund-policy.ts` (new file) OR `src/lib/bookings.ts` (extension). BA picks before dispatch, or leaves dev-agent to pick + document in DAR.
- [ ] **Decision §8 button-label resolution recorded** — "Cancel booking" uniform OR branch by status. Strawman picks (a) uniform; BA confirms or overrides.
- [ ] **Decision §13 E2E resolution recorded** — strawman locks 0 new; BA may override to ship 1 within-24h-refusal regression E2E.

---

## Forward-looking flags

- **Story 9-7** (`/owner/payouts` view) is the last Theme B story. Extends `WEBHOOK_HANDLERS` by adding `payout.paid` handler (one more function + one more map entry — same pattern proven by 9-6's `charge.refunded` extension). 9-7 also lands the `/owner/payouts` page consuming Stripe Connect's payouts list API.
- **Story 8-4** (payment-driven emails) wires `charge.refunded` event delivery to a refund-confirmation email per PRD §4.3. 9-6 ships the webhook handler; 8-4 attaches the email send. Same split as 9-4's `payment_intent.succeeded` → 8-4 email wiring.
- **Phase 3** considerations:
  - Partial refunds (`stripe.refunds.create({ amount: ... })`) + cumulative `refund_amount_cents` tracking + `charge.refunded` handler richer logic.
  - Owner-side force-majeure refund UI (PRD FR-REFUND-4 forward-ready) — would surface in `/owner/bookings` with a dedicated "Issue refund" button.
  - Multi-policy refund windows — different time-based or amount-based policies per space type or per owner.
  - Refund disputes / chargebacks — `charge.dispute.created` handler + `bookings.dispute_*` columns.
  - Multi-currency support (USD-only in Phase 2).
- **Refund-policy override headroom**: locking the helper in `src/lib/refund-policy.ts` (Decision §3) leaves a natural seam for Phase 3 multi-policy. If 9-6 inlines the logic into `src/lib/bookings.ts`, future stories may need to extract it back — dev-agent picks based on overall codebase preference.
- **Idempotency key sharing** (`cancel-${bookingId}` between 9-4 reject + 9-6 Phase 2 PENDING cancel): intentional. Both paths call the same `stripe.paymentIntents.cancel` with the same PI. If 9-6 dispatches AFTER a 9-4 reject already ran on the same booking, the 9-6 action would hit `markBookingCancelledAndVoided`'s conditional WHERE (booking is now REJECTED + VOIDED, not PENDING + AUTHORIZED) → no-op → CANNOT_CANCEL. Race is safe.
- **The 9-3 BA-walk booking `92bd9829-...`** is currently in `(CONFIRMED, CAPTURED)` from the 9-4 BA walk. It's the canonical 9-6 walk target IF its `booking_date` is >24h out (likely — created May 13ish for "Tue Jun 23"). BA needs to verify before walk.
- **No Stripe-side state to clean up** between 9-5 ship and 9-6 dispatch — the 9-5 BA walk used `stripe listen` event triggers, not real refund operations. The Stripe test-mode account state is clean for 9-6's first refund.

