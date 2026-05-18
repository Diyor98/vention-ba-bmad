# Story 9-4: Confirm/Reject with Capture/Cancel — BA Decisions

**Story:** 9-4
**Epic:** 9 — Payments (Theme B)
**Phase:** 2
**Type:** Schema migration (CHECK extension) + Server Action extensions + new Stripe sub-module wrapping `paymentIntents.capture` + `paymentIntents.cancel`
**Author:** Ikhtiyor Ziyayev, Business Analyst
**Date drafted:** 2026-05-19
**Status:** LOCKED 2026-05-19. Ready for dispatch.
**Source:** Phase 2 PRD §4.4 FR-PAY-4 + FR-PAY-5 + §6.3 (`confirmBookingAction` + `rejectBookingAction` extension hooks) + §8 Epic 9 Story 9-4

**Companion / dependency chain:**
- **Story 9-1** (Stripe SDK wrapper) shipped at `aff4060`. Provides `src/lib/stripe.ts` singleton + `StripeServiceResult<T>` discriminated union.
- **Story 9-2** (Stripe Connect Express onboarding) shipped at `0d384e0`. Provides `stripe_connect_accounts` table + narrow webhook handler at `src/app/api/stripe/webhook/route.ts` + `getConnectAccountByUserId` helper.
- **Story 9-2b** (publish gating) shipped at `7e7251c` + `2d65c54`. Provides DRAFT enum + cached-Connect-state-active check pattern + the CHECK-constraint-extension migration template.
- **Story 9-3** (booking with payment) shipped at `bd76dc3` + `8035907`. Provides `bookings.payment_intent_id` + `bookings.payment_status` ('AWAITING_PAYMENT' / 'AUTHORIZED') + `bookings_payment_status_check` CHECK constraint + `checkout.session.completed` webhook backstop branch + `src/lib/payments/checkout.ts` sub-module. **9-4 directly extends 9-3's `payment_status` state machine** — without 9-3 on `main`, 9-4 cannot dispatch.

Story 9-4 cannot dispatch until 9-3 is at `done` on `main` (it is). 9-4 is the "Owner Confirm/Reject" half of the Phase 2 payment flow — Guest authorizes payment in 9-3, Owner captures or releases the hold in 9-4. Story 9-5 (webhook generalization) is the next dispatch after 9-4 and absorbs 9-3's + 9-4's narrow webhook branches into a single dispatcher.

---

## Context

**Phase 2 PRD §4.4 — capture/cancel locked behaviors:**

- **FR-PAY-4:** When Space Owner clicks Confirm on a PENDING booking, the server captures the Payment Intent (`stripe.paymentIntents.capture(...)`). On successful capture, booking status becomes CONFIRMED. **On capture failure, the booking remains PENDING and the Space Owner sees an error.**
- **FR-PAY-5:** When Space Owner clicks Reject on a PENDING booking, the server cancels the Payment Intent (`stripe.paymentIntents.cancel(...)`), releasing the hold on the Guest's card. Booking status becomes REJECTED.
- **FR-PAY-6:** (Guest-side cancel — Story 9-6 territory; outside 9-4 scope.)

**Phase 1 actions being extended (NOT replaced):**

- `confirmBookingAction(prevState, formData)` — pre-Phase-2 behavior: validates bookingId UUID + auth + role (SUPER_ADMIN or SPACE_OWNER) + owner-scope check (Story 7-5) + conditional UPDATE on `status` PENDING → CONFIRMED. Currently NO Stripe interaction; bookings have `payment_intent_id IS NULL` for Phase 1 rows.
- `rejectBookingAction(prevState, formData)` — same shape with target `'REJECTED'`.

Both actions live in [src/actions/booking.ts](deskhive/src/actions/booking.ts) alongside `cancelBookingAction`; the file's header comment already flags 9-4 + 9-6 as the extension stories ("Stories 9-4 + 9-6 extend them with Stripe capture / cancel / refund").

Phase 1 UI surfaces:
- `<ConfirmBookingButton>` at [src/app/admin/bookings/confirm-booking-button.tsx](deskhive/src/app/admin/bookings/confirm-booking-button.tsx) — `useActionState` form with inline error rendering (no toast on success per Phase 1 / Story 5-2 design).
- `<RejectBookingButton>` at [src/app/admin/bookings/reject-booking-button.tsx](deskhive/src/app/admin/bookings/reject-booking-button.tsx) — mirror shape.
- Both consumed by `<BookingsTable>` (admin) + `<OwnerBookingsTable>` (Story 7-5 owner mirror). The owner page imports the SAME admin button components — single source of truth.

**What 9-4 does NOT touch (carved by 9-5 / 9-6 / 9-7 / 8-4):**

- ❌ Guest-side cancellation + refund flow — Story 9-6.
- ❌ Full webhook dispatch generalization (`payment_intent.succeeded`, `payment_intent.payment_failed`, `payment_intent.canceled`, `charge.refunded`, `payout.paid`, `checkout.session.expired`) — Story 9-5. See Decision §8 for the open question on whether 9-4 ships narrow handlers as backstop.
- ❌ Refund flow + 24-hour policy — Story 9-6.
- ❌ `/owner/payouts` view — Story 9-7.
- ❌ Payment-driven emails (receipt on capture, payment-failed notification) — Story 8-4 (depends on 9-5's webhook dispatch).
- ❌ UI refactor of the existing Confirm/Reject buttons — preserved per Phase 1 / Story 5-2 design. 9-4 only extends the underlying action's behavior + error states.

---

## Scope

**In scope:**

- **Drizzle schema:** extend `bookings_payment_status_check` CHECK constraint (locked in 9-3 with `('AWAITING_PAYMENT', 'AUTHORIZED')`) to `('AWAITING_PAYMENT', 'AUTHORIZED', 'CAPTURED', 'VOIDED')`. Migration `0006_*.sql`. See Decision §1.
- **New Stripe sub-module:** `src/lib/payments/payment-intents.ts` — wraps `stripe.paymentIntents.capture` + `stripe.paymentIntents.cancel`. Returns `StripeServiceResult<{ paymentIntentId, status }>`. Mirrors 9-2's `connect.ts` + 9-3's `checkout.ts` sub-module pattern. See Decision §5.
- **`confirmBookingAction` extension:** preserve Phase 1 behavior for legacy bookings (NULL `payment_intent_id`); for Phase 2 bookings (NON-NULL `payment_intent_id` + `payment_status='AUTHORIZED'`), capture the Payment Intent BEFORE the DB UPDATE. Stripe-first-then-DB ordering. See Decision §2 + §4.
- **`rejectBookingAction` extension:** mirror shape. Stripe `paymentIntents.cancel` BEFORE the DB UPDATE. Sets `cancellation_reason: 'requested_by_customer'`. See Decision §3 + §4.
- **New `bookings` query helpers:** `markBookingCaptured(bookingId)` (parallels 9-3's `markBookingAuthorized`) and `markBookingVoided(bookingId)`. Conditional UPDATE clauses prevent race conditions. See Decision §2.
- **Idempotency keys:** per-booking-id namespace — `capture-${bookingId}` + `cancel-${bookingId}`. See Decision §7.
- **Phase 1 backwards-compat:** bookings with `payment_intent_id IS NULL` skip the Stripe call entirely; the action runs the Phase 1 DB UPDATE path unchanged. See Decision §6.
- **Error code expansions:** new `STRIPE_CAPTURE_FAILED` + `STRIPE_CANCEL_FAILED` on the action states. Inline error rendering preserved per Phase 1 button design. See Decision §10.
- **Toast copy** — none new. Phase 1 confirm/reject inline-error pattern preserved (no toast on success or failure for these buttons). See Decision §11.
- **Unit tests:** ~10 new across action + wrapper. See Decision §12.
- **E2E tests:** 0 new — confirm/reject path is too fragile to E2E without real Stripe API calls (see Decision §13 for rationale and the open question on test depth).
- **Memory:** extend `reference_stripe_service_pattern.md` with the 9-4 section. See Decision §14.

**Out of scope (deferred to Story 9-5 / 9-6 / 9-7 / 8-4):**

- ❌ Webhook handlers for `payment_intent.succeeded` / `payment_intent.canceled` — DEFERRED to Story 9-5 per Decision §8. Zero changes to `src/app/api/stripe/webhook/route.ts` in 9-4. BA accepts the narrow window between 9-4 ship and 9-5 ship as acceptable ops risk for the rare "Stripe-succeeds-but-DB-fails" scenario.
- ❌ Refund flow + Guest cancel — Story 9-6.
- ❌ Payment receipt email + payment-failed email — Story 8-4.
- ❌ `/owner/payouts` view — Story 9-7.
- ❌ Phase 2 PRD §4.5 cancel-interpretation question — Story 9-6 territory (still load-bearing flag for that story).
- ❌ UI redesign of Confirm/Reject buttons — preserve Phase 1 design.
- ❌ Audit-trail / capture-history table — out of Phase 2 scope.

---

## Decisions

### Decision 1: Schema migration — extend `bookings_payment_status_check`

**Rationale:** Story 9-3 locked the CHECK constraint with two values (`'AWAITING_PAYMENT'`, `'AUTHORIZED'`) and explicitly designed it to extend via DROP/ADD CONSTRAINT (the same pattern 9-2b used for `spaces.status`). 9-4 lands the next two values.

**Locked proposal:**

Migration `0006_<name>.sql`:

```sql
ALTER TABLE "bookings" DROP CONSTRAINT "bookings_payment_status_check";--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_payment_status_check" CHECK ("bookings"."payment_status" IN ('AWAITING_PAYMENT', 'AUTHORIZED', 'CAPTURED', 'VOIDED'));
```

Story-tag comment block at the top following the `0005_soft_wither.sql` / `0004_fine_ronan.sql` convention: describe the two new values, the state-machine transitions, and the rollback hint (DROP + ADD with the 9-3 set; safe IFF no rows are in CAPTURED or VOIDED state at rollback time).

**Naming sub-decision: `VOIDED` (not `CANCELLED`).**

Three candidates considered:
- **(a) `VOIDED`** — distinguishes the payment-side cancel from the booking-side `CANCELLED` status (which is Guest-initiated in 9-6 territory). Maps to Stripe's `payment_intent.canceled` event but uses a name we own.
- **(b) `CANCELLED`** — mirrors Stripe's `payment_intent.canceled` event name + matches `bookings.status='CANCELLED'`. Risk: conflates booking-CANCELLED-by-guest with payment-CANCELLED-by-owner. Phase 2 PRD treats these as semantically different (Reject = no charge ever happened; Guest-cancel = either no-charge-yet or refund-of-already-captured).
- **(c) `REJECTED`** — matches `bookings.status='REJECTED'`. Confusing because payment_status and booking_status are different sub-systems; "REJECTED" on a payment-side enum suggests the bank declined, not the owner.

**Locked: (a) `VOIDED`.** Aligns with Stripe's "release the authorization hold" semantics + avoids confusion with the booking-status enum + leaves "CANCELLED" available for 9-6 if Guest-side cancellation needs a payment_status (TBD per Story 9-6).

**Anti-pattern forbidden:**
- Do NOT add the values without the DROP/ADD CONSTRAINT pattern. The existing 9-3 constraint must be dropped first.
- Do NOT change the existing 'AWAITING_PAYMENT' or 'AUTHORIZED' values — they're load-bearing for 9-3's flow.
- Do NOT add a `payment_status_history` audit table — not in Phase 2 scope.

---

### Decision 2: `confirmBookingAction` extension — capture-then-DB ordering with PI-id branching

**Rationale:** Phase 1's action does only the DB UPDATE (`PENDING` → `CONFIRMED`). 9-4 wraps this with a Stripe capture step, but the ordering matters:

- **Stripe first, then DB**: capture the Payment Intent → on success, UPDATE booking. If Stripe fails, no DB mutation. If DB fails AFTER Stripe success, the booking is in an inconsistent state (PENDING + AUTHORIZED in DB, but `succeeded` on Stripe). The webhook backstop (Decision §8) or manual ops can reconcile.
- **DB first, then Stripe**: UPDATE booking → call Stripe capture → on failure, rollback the DB UPDATE. Race-unsafe (concurrent Guest cancel could see a CONFIRMED status mid-rollback).

**Locked: Stripe first, then DB.** Same shape Story 9-3's pre-claim-then-Stripe decided NOT to use (because slot-claim race made DB-first essential there), but the inverse trade-off applies here: there's no concurrent "two owners confirming the same booking" race (booking ownership is single-tenant), so DB-first offers no benefit and creates a rollback-correctness problem.

**Locked extension to `confirmBookingAction`:**

```typescript
// After the Phase 1 pre-checks (auth, role, owner-scope, status === 'PENDING')
// and BEFORE the DB UPDATE:

// 1. Branch on payment_intent_id.
if (booking.paymentIntentId && booking.paymentStatus === 'AUTHORIZED') {
  // Phase 2 booking — capture via Stripe.
  const captureResult = await capturePaymentIntent({
    paymentIntentId: booking.paymentIntentId,
    idempotencyKey: `capture-${bookingId}`,
  });
  if (!captureResult.ok) {
    logger.error('confirm_booking_action_capture_failed', {
      bookingId,
      paymentIntentId: booking.paymentIntentId,
      error: captureResult.error,
    });
    return {
      status: 'error',
      code: 'STRIPE_CAPTURE_FAILED',
      message: captureResult.error,
    };
  }
}
// (else: Phase 1 booking — skip Stripe, fall through to DB UPDATE.)

// 2. Phase 1 DB UPDATE (status → CONFIRMED) + new Phase 2 payment_status set.
// Use a NEW helper `markBookingConfirmedAndCaptured` (parallels 9-3's
// markBookingAuthorized) when payment_intent_id is set; else use the
// existing `confirmBooking` helper unchanged.
```

**Two new query helpers** in `src/db/queries/bookings.ts`:

```typescript
// Updates status='CONFIRMED' + payment_status='CAPTURED' in one statement.
// Conditional WHERE: only transitions rows in (PENDING, AUTHORIZED) state.
// Returns undefined if the row already moved (race against the webhook backstop
// per Decision §8, or concurrent Guest cancel) — caller treats as idempotent
// no-op + skips downstream notification.
export async function markBookingConfirmedAndCaptured(
  id: string,
): Promise<Booking | undefined>;

// Updates status='REJECTED' + payment_status='VOIDED'. Same shape.
export async function markBookingRejectedAndVoided(
  id: string,
): Promise<Booking | undefined>;
```

**Anti-pattern forbidden:**
- Do NOT call `stripe.paymentIntents.capture` from outside `src/lib/payments/payment-intents.ts` (the new sub-module — Decision §5).
- Do NOT do the DB UPDATE before the Stripe call (Stripe-first-then-DB is locked).
- Do NOT skip the conditional WHERE on the new query helpers — concurrent Guest-side cancel (Story 9-6) needs the race-safety net.
- Do NOT widen `confirmBookingAction`'s role check beyond `SUPER_ADMIN | SPACE_OWNER`. Phase 1's gate stays.
- Do NOT add new self-action skip logic — the existing `notifyBookingConfirmed(bookingId, callerId)` handles the owner-confirms-own-booking case via the Story 8-3 self-action skip rule.

---

### Decision 3: `rejectBookingAction` extension — cancel-then-DB ordering with `cancellation_reason`

**Rationale:** Mirror of Decision §2 with `stripe.paymentIntents.cancel` instead of capture.

**Locked extension shape** (same pattern as Decision §2's `confirmBookingAction` change). Branch on `payment_intent_id` + `payment_status === 'AUTHORIZED'`; call `cancelPaymentIntent` first; on success, run the new `markBookingRejectedAndVoided` helper.

**`cancellation_reason` parameter for `stripe.paymentIntents.cancel`:**

Stripe accepts four values: `'duplicate'`, `'fraudulent'`, `'requested_by_customer'`, `'abandoned'`. For owner-rejecting-a-booking:
- `'requested_by_customer'` is the closest semantic match — the platform-as-merchant is canceling on behalf of the customer (the Space Owner is the platform's user; the platform's user is rejecting).
- `'abandoned'` would imply Guest never completed something — wrong direction.
- `'duplicate'` / `'fraudulent'` — not applicable.

**Locked: `'requested_by_customer'`.** Hardcoded in `cancelPaymentIntent` wrapper args. Phase 3 may parametrize if multiple reject paths emerge.

**Anti-pattern forbidden:**
- Do NOT call `stripe.paymentIntents.cancel` from outside the sub-module.
- Do NOT use `'fraudulent'` or `'duplicate'` — semantically wrong for Owner-Reject.
- Do NOT skip the `cancellation_reason` arg — Stripe accepts the call without it, but the reason is useful for ops/dashboard filtering and Story 9-5's webhook event-type filtering.

---

### Decision 4: Booking state machine after 9-4

```
[booking pre-claimed by createBookingWithPaymentAction]
  status='PENDING', payment_status='AWAITING_PAYMENT', payment_intent_id=NULL
  ↓
[Guest completes Stripe Checkout → return-URL handler / webhook]
  status='PENDING', payment_status='AUTHORIZED', payment_intent_id='pi_...'
  ↓
  ├── Owner confirms (9-4):
  │     1. stripe.paymentIntents.capture(payment_intent_id) — funds settle
  │        to platform account; Stripe automatically transfers payout
  │        (minus application_fee_amount) to connected account.
  │     2. UPDATE booking SET status='CONFIRMED', payment_status='CAPTURED'.
  │
  └── Owner rejects (9-4):
        1. stripe.paymentIntents.cancel(payment_intent_id, {
             cancellation_reason: 'requested_by_customer'
           }) — releases the hold on the Guest's card.
        2. UPDATE booking SET status='REJECTED', payment_status='VOIDED'.

[Guest cancels in Story 9-6 — out of 9-4 scope]
```

**Phase 1 backwards-compat** (Decision §6 — bookings with `payment_intent_id IS NULL`): the action skips the Stripe step entirely; only the DB UPDATE fires. Phase 1 seeded bookings stay confirm-able/reject-able without Stripe involvement.

**No new `bookings.status` enum values.** The four Phase 1 values (`PENDING / CONFIRMED / REJECTED / CANCELLED`) remain the full set; 9-4 + 9-6 modulate `payment_status` alongside.

---

### Decision 5: Stripe Payment-Intent wrapper sub-module — `src/lib/payments/payment-intents.ts`

**Rationale:** Story 9-2 established `src/lib/payments/connect.ts`; Story 9-3 added `src/lib/payments/checkout.ts`. The pattern: each Theme B story that needs a new family of Stripe operations adds a cohesive sub-module. 9-4's operations are `paymentIntents.capture` + `paymentIntents.cancel` — distinct from Checkout Session operations (those create the PI; these mutate its state post-creation).

**Locked: new sub-module `src/lib/payments/payment-intents.ts`** (NOT extending `checkout.ts`).

Two exports:

```typescript
import Stripe from 'stripe';
import { stripe } from '@/lib/stripe';
import type { StripeServiceResult } from '@/lib/stripe-service';

/**
 * Captures a Payment Intent in `requires_capture` state (the post-9-3
 * authorized state). On success, the PI moves to `succeeded` and Stripe
 * settles funds — splitting between platform's application_fee_amount
 * and the connected account's payout automatically.
 */
export async function capturePaymentIntent(args: {
  paymentIntentId: string;
  idempotencyKey: string;
}): Promise<StripeServiceResult<{ paymentIntentId: string; status: string }>>;

/**
 * Cancels a Payment Intent in `requires_capture` state. On success, the
 * PI moves to `canceled` and the authorization hold is released.
 * `cancellation_reason` is hardcoded to 'requested_by_customer' per
 * Decision §3.
 */
export async function cancelPaymentIntent(args: {
  paymentIntentId: string;
  idempotencyKey: string;
}): Promise<StripeServiceResult<{ paymentIntentId: string; status: string }>>;
```

Internal error mapping: `Stripe.errors.StripeError` → `{ ok: false, error: err.message }` (mirrors 9-2's + 9-3's `mapStripeError`). Stripe's error messages for capture/cancel are reasonably end-user-facing (e.g., "The PaymentIntent has already been canceled"); no manual translation in Phase 2.

**Why a separate file (vs. extending `checkout.ts`):**
- `checkout.ts` operations create Sessions; `payment-intents.ts` operations mutate post-creation state. Different responsibilities.
- Future Stripe-touching stories may extend `payment-intents.ts` with `paymentIntents.retrieve` (Story 9-5 may use this for webhook handlers) without polluting `checkout.ts`.
- Test mocks stay narrow — `checkout.test.ts` mocks `stripe.checkout.sessions`; `payment-intents.test.ts` mocks `stripe.paymentIntents`.

**Anti-pattern forbidden:**
- Do NOT call `stripe.paymentIntents.*` from anywhere outside this sub-module (singleton-import discipline from 9-1).
- Do NOT add `paymentIntents.create` here — that's already done inside `checkout.sessions.create` (under `payment_intent_data`); we never directly call `paymentIntents.create` in DeskHive.
- Do NOT add `paymentIntents.retrieve` in 9-4 — defer until a story needs it (Story 9-5 webhook handlers likely).

---

### Decision 6: Phase 1 backwards-compat — `payment_intent_id IS NULL` skips Stripe

**Rationale:** Phase 1 seeded bookings + any bookings created via the surviving `/api/bookings` REST route (Phase 1 endpoint, not deleted in 9-3) have `payment_intent_id IS NULL`. They predate the payment flow. The Owner's `<ConfirmBookingButton>` for these rows still needs to work — admin-side workflow continuity.

**Locked branching logic** (inside both `confirmBookingAction` and `rejectBookingAction`):

```typescript
const isPaymentBooking =
  booking.paymentIntentId !== null &&
  booking.paymentStatus === 'AUTHORIZED';

if (isPaymentBooking) {
  // Phase 2 path: Stripe capture/cancel + new query helper.
} else if (booking.paymentIntentId === null) {
  // Phase 1 path: existing confirmBooking() / rejectBooking() helper.
  // No Stripe call.
} else {
  // Edge case: payment_intent_id is set but payment_status is NOT
  // 'AUTHORIZED'. This shouldn't happen under normal flow (9-3's
  // pre-claim sets AWAITING_PAYMENT; return-URL/webhook sets AUTHORIZED;
  // 9-4 transitions to CAPTURED/VOIDED). Surface INTERNAL_ERROR with
  // ops-friendly logger.error line — likely indicates state
  // corruption or a 9-3 abandoned-payment row (Story 9-5 will clean up).
}
```

**Locked: Phase 1 backwards-compat YES + edge-case INTERNAL_ERROR.** The cost is two lines of branching logic; the benefit is admin-side workflow continuity for any Phase 1 booking still in PENDING state. Phase 1 seed data + the surviving `/api/bookings` REST endpoint both produce these rows. Forcing all confirm/reject through Stripe would break Phase 1 admin workflows on seeded data with no upside.

The edge case (`payment_intent_id IS NOT NULL` but `payment_status !== 'AUTHORIZED'`) surfaces as `INTERNAL_ERROR` with an ops-friendly `logger.error` line. Attempting automatic recovery (e.g., re-querying Stripe to figure out the right path) would invite Stripe API errors on already-mutated PIs — surfacing to ops is the conservative choice. The edge case is rare enough in test mode that the cost of a manual cleanup is acceptable.

**Anti-pattern forbidden:**
- Do NOT branch on `booking.status` alone — `status === 'PENDING'` is true for both Phase 1 and Phase 2 bookings. The PI-id check is the load-bearing discriminator.
- Do NOT try to recover from the edge case automatically (attempting capture on a non-AUTHORIZED row could trigger Stripe API errors). Surface to ops.

---

### Decision 7: Idempotency keys — per-booking-id namespace

**Rationale:** Story 9-3 used per-attempt UUIDs for Checkout Session creation (to avoid Stripe-cache-hits on orphaned Session URLs). Capture and cancel are different — the operation is bounded to a specific Payment Intent (which is itself bounded to a specific booking), and there's no "orphan" concept (a PI is captured-or-not, canceled-or-not; idempotent retries on the same key return the same result).

**Locked: per-booking-id idempotency keys.**

```typescript
// In confirmBookingAction:
const idempotencyKey = `capture-${bookingId}`;

// In rejectBookingAction:
const idempotencyKey = `cancel-${bookingId}`;
```

**Why this is safe:**
- Owner double-clicks Confirm → second call hits Stripe's 24h idempotency cache → returns the same successful `succeeded` PI state.
- Owner clicks Confirm, then clicks Reject after a successful capture: the Reject would hit `payment_intent_unexpected_state` on Stripe (can't cancel a captured PI). The action surfaces `STRIPE_CANCEL_FAILED` with Stripe's error message. The booking would already be in `CONFIRMED + CAPTURED` per the prior Confirm; the conditional WHERE on `markBookingRejectedAndVoided` would also no-op (booking is no longer PENDING/AUTHORIZED). Outcome: error to UI, no state corruption.
- Owner retries Confirm after a network blip during the first attempt: second request reuses the same key, Stripe returns the cached successful capture. Action proceeds to DB UPDATE (which is also idempotent via the conditional WHERE).

**Why NOT per-attempt UUID (the 9-3 approach):**
- 9-3's per-attempt UUID was driven by the orphan-Session-on-retry concern: a fresh Checkout Session URL was needed on each user-initiated retry. For capture/cancel, there's no "fresh URL" needed — the PI itself is the resource being mutated, and Stripe's idempotency cache correctly memoizes the mutation.
- Per-attempt UUID for capture would defeat the idempotency contract: each retry would create a new "capture attempt" at Stripe, racing.

**Anti-pattern forbidden:**
- Do NOT use per-attempt UUIDs for capture/cancel.
- Do NOT collide namespaces — `checkout-${uuid}` (9-3), `connect-create-${userId}` (9-2), `capture-${bookingId}` (9-4), `cancel-${bookingId}` (9-4) are all distinct.

---

### Decision 8: Webhook handler scope in 9-4 — DEFER to Story 9-5

**Locked: DEFER all webhook handlers to Story 9-5.** Zero changes to `src/app/api/stripe/webhook/route.ts` in 9-4.

**Rationale:** 9-3's `checkout.session.completed` backstop was load-bearing because the user-redirect path could miss firing (browser close — a normal user behavior). 9-4's capture/cancel happens entirely server-side; there's no "browser-close-mid-call" failure mode. The only scenario where a webhook helps is DB-fails-after-Stripe-succeeds, which is genuinely rare in test mode (Neon Postgres has minimal flakiness in practice), and Story 9-5 ships the full webhook dispatch generalization in the very next story.

**What this means operationally:**
- If `stripe.paymentIntents.capture` succeeds at Stripe but the local DB UPDATE fails (PG outage, network blip post-Stripe), the booking sits in `PENDING + AUTHORIZED` with Stripe in `succeeded` state. Manual cleanup is the recovery path until 9-5 lands.
- Story 9-5 will absorb `payment_intent.succeeded` + `payment_intent.canceled` + the rest into a single dispatcher under `src/lib/payments/webhooks.ts`. The handlers will be written in the same shape as 9-3's `checkout.session.completed` branch (idempotency check + conditional UPDATE + insert into `webhook_events` only on first real handle).
- BA accepts the narrow window between 9-4 ship and 9-5 ship as an acceptable ops risk for Phase 2.

**Smaller 9-4 = faster review + fewer test surfaces + cleaner 9-5 dispatch.** This is the locked stance.

**Anti-pattern forbidden:**
- Do NOT add any branches to `src/app/api/stripe/webhook/route.ts` in 9-4 — `account.updated` (9-2) + `checkout.session.completed` (9-3) are the only event types handled until 9-5 lands.
- Do NOT trigger email sends from any webhook handler — 8-4 territory.
- Do NOT call `stripe.paymentIntents.retrieve` from `src/lib/payments/payment-intents.ts` in 9-4 — defer until 9-5's webhook handlers need it.

---

### Decision 9: UI affordances — preserve Phase 1 `<ConfirmBookingButton>` + `<RejectBookingButton>`

**Rationale:** Phase 1 + Story 5-2 locked the inline `<ConfirmBookingButton>` + `<RejectBookingButton>` design: form-based, no toast on success, inline error rendering via `state.message`. 9-4 doesn't change this UI shape.

**Locked: zero UI file changes.** Both button components stay at their current paths:
- [src/app/admin/bookings/confirm-booking-button.tsx](deskhive/src/app/admin/bookings/confirm-booking-button.tsx)
- [src/app/admin/bookings/reject-booking-button.tsx](deskhive/src/app/admin/bookings/reject-booking-button.tsx)

Both are consumed by `<BookingsTable>` (admin) AND `<OwnerBookingsTable>` (owner). Single source of truth — Story 7-5's Decision §7 deliberately avoided abstracting these into a variant-prop component.

**What changes from the user's POV:**
- The error messages surfaced inline gain two new strings: `STRIPE_CAPTURE_FAILED` and `STRIPE_CANCEL_FAILED` (the underlying Stripe error message passes through as `state.message`). Phase 1 errors (`FORBIDDEN`, `NOT_FOUND`, `CANNOT_CONFIRM` / `CANNOT_REJECT`, `INTERNAL_ERROR`) carry forward unchanged.
- The "Confirming…" / "Rejecting…" pending state from `useFormStatus` already shows during the Stripe API call (which can take 1-3 seconds in test mode). No spinner change needed.

**Locked: zero UI changes + inline-error-only for STRIPE_CAPTURE_FAILED / STRIPE_CANCEL_FAILED visibility.** Preserves the Phase 1 / Story 5-2 design across both confirm/reject paths. The existing `<ConfirmBookingButton>` / `<RejectBookingButton>` `state.message` render path surfaces the underlying Stripe error string verbatim — Stripe's error messages for capture/cancel are reasonably end-user-readable in test mode (e.g., "The PaymentIntent has already been canceled" / "Your card was declined"). No toast variant needed; no detail-page polling.

The pending-state copy from `useFormStatus` ("Confirming…" / "Rejecting…") already covers the 1–3 second Stripe round-trip in test mode. No spinner change.

**Anti-pattern forbidden:**
- Do NOT rewrite the buttons as toast-based (preserve Story 5-2 design).
- Do NOT add new `TOAST_COPY` entries for STRIPE_CAPTURE_FAILED / STRIPE_CANCEL_FAILED (Decision §11 carries this forward).
- Do NOT add real-time payment_status reflection on the booking detail page (e.g., polling) — Phase 2 doesn't have a detail page surface; the bookings table re-renders on next page load.

---

### Decision 10: Error code expansions on action states

**Rationale:** The new Stripe-failure paths need typed error codes for downstream consumers (button + future toast call sites + tests).

**Locked additions to action state types:**

```typescript
// ConfirmBookingActionState — append:
  | { status: 'error'; code: 'STRIPE_CAPTURE_FAILED'; message: string };

// RejectBookingActionState — append:
  | { status: 'error'; code: 'STRIPE_CANCEL_FAILED'; message: string };
```

`message` carries the Stripe error string verbatim (Stripe's errors are end-user-friendly; no manual translation in Phase 2).

**Why two distinct codes (vs. one shared `STRIPE_ERROR`):**
- Caller can branch on Confirm vs Reject context without inspecting the message.
- Future toast copy variants (in a later story, should Phase 3 introduce richer error UX) can map distinctly. Phase 2 surfaces both codes inline per Decision §9.
- Mirror 9-2 + 9-3's convention of typed codes per action.

**Anti-pattern forbidden:**
- Do NOT collapse into a shared `STRIPE_ERROR` code.
- Do NOT use these codes for non-Stripe errors — `INTERNAL_ERROR` is the catch-all for unexpected DB/runtime failures.

---

### Decision 11: Toast copy / inline error display — preserve Phase 1 pattern

**Rationale:** Story 5-2 locked the inline-error pattern for Confirm/Reject buttons (no toast). 9-4 introduces zero new toast strings.

**Locked: zero changes to `src/lib/toast.ts`'s `TOAST_COPY`.**

The two new error codes (`STRIPE_CAPTURE_FAILED`, `STRIPE_CANCEL_FAILED`) surface their `message` inline next to the button via the existing `state.message` rendering path.

**Anti-pattern forbidden:**
- Do NOT add new `TOAST_COPY` entries unless Decision §9's open question is resolved as "ship a toast for Stripe-failed."

---

### Decision 12: Unit test coverage

**Target after 9-4 ships: 346 + ~10 new = ~356 unit tests.** Per the 9-1/9-2/9-2b/9-3 precedent, dev-agent typically ships 1-3 bonus tests beyond the BA estimate.

**New test files / additions:**

1. **`src/lib/payments/payment-intents.test.ts`** (NEW — 4 tests):
   - `capturePaymentIntent` happy path — Stripe SDK called with correct args + idempotency key; result wrapped as `StripeServiceResult<{ paymentIntentId, status }>`.
   - `capturePaymentIntent` error path — Stripe throws `StripeError` → `{ ok: false, error: <message> }`.
   - `cancelPaymentIntent` happy path — same shape, verifies `cancellation_reason: 'requested_by_customer'` is passed.
   - `cancelPaymentIntent` error path.

2. **`src/actions/booking.test.ts`** extension or new tests in a sibling file (NEW — 5 tests):
   - **Confirm happy path (Phase 2)** — Phase 2 booking with `paymentIntentId` set + `paymentStatus='AUTHORIZED'` → action calls `capturePaymentIntent` → `markBookingConfirmedAndCaptured` → state success.
   - **Confirm Phase 1 backwards-compat** — booking with `paymentIntentId IS NULL` → action skips Stripe → uses existing `confirmBooking` helper unchanged. Stripe wrapper NOT called.
   - **Confirm STRIPE_CAPTURE_FAILED** — Stripe wrapper returns `{ ok: false }` → action returns `STRIPE_CAPTURE_FAILED`; booking stays PENDING + AUTHORIZED (no DB write).
   - **Reject happy path (Phase 2)** — mirrors confirm.
   - **Reject Phase 1 backwards-compat** — mirrors confirm.

3. **`src/db/queries/bookings.test.ts`** (NEW or extension — 1 test):
   - `markBookingConfirmedAndCaptured` conditional-WHERE no-op — running on a row already in CONFIRMED state returns undefined (race-safe). One test covers both new helpers since they share shape.

**Target unit-test count: 346 + 10 = 356.** Dev-agent may ship +1-3 bonus per pattern.

**Mock pattern reminder:** split-by-mock-boundary (memorized from 9-2 / 9-3). Action tests mock `@/lib/payments/payment-intents`; wrapper tests mock `@/lib/stripe`. Do NOT cross the mock boundary.

**Anti-pattern forbidden:**
- Do NOT write integration tests that hit the real Stripe API in unit tests. Mock at the appropriate boundary.

---

### Decision 13: E2E test coverage — 1 new backwards-compat E2E (target 61)

**Locked: option (i) — ship 1 new Phase 1 backwards-compat E2E test.** Target E2E count moves from 60 (post-9-3) to **61** after 9-4.

**Rationale:** Decision §6 introduces a runtime branch (`payment_intent_id IS NULL` → skip Stripe; otherwise → capture/cancel via Stripe) that unit tests can mock but can't prove production short-circuit behavior end-to-end. A Phase 1 admin confirming a legacy seeded booking is the canonical regression path: if 9-4 silently breaks the `IS NULL` branch (e.g., a refactor that always calls `capturePaymentIntent` and assumes a non-null PI ID), the test catches it before the BA walk. Mirrors Story 7-5's regression-style E2E pattern.

**Out-of-scope for E2E (deliberately):**
- **Phase 2 happy capture path** — would need a REAL test-mode Payment Intent in `requires_capture` state, which means either real `stripe.paymentIntents.create({ capture_method: 'manual', amount, currency: 'usd' })` in test setup (slow, flaky, costs Stripe-test-account quota) or dev-server-layer Stripe stubs (invasive, out of scope). Unit tests cover the Phase 2 action logic via mocked `@/lib/payments/payment-intents`; BA manual walk covers end-to-end with the 9-3 BA-walk artifact booking.
- **Phase 2 reject path** — same reasoning.
- **STRIPE_CAPTURE_FAILED / STRIPE_CANCEL_FAILED paths** — Stripe-side error simulation requires direct API manipulation; covered at the unit-test layer.

**Locked E2E shape** (1 test):
- **Phase 1 backwards-compat confirm:** seed/create a booking with `paymentIntentId IS NULL` + `paymentStatus IS NULL` + `status='PENDING'` (the Phase 1 / `/api/bookings` REST path produces these). Sign in as admin or space-owner via `authenticatedPage()`. Navigate to the bookings table (`/admin/bookings` or `/owner/bookings`). Click Confirm. Assert: booking row transitions to `status='CONFIRMED'`; `payment_status` stays NULL (no Stripe call); no error toast or inline error surfaces. The reject mirror path can be covered by the same test or split — dev-agent picks. **File path: `deskhive/tests/e2e/confirm-booking-phase1-backcompat.spec.ts`** (or similar; dev-agent picks the path/name that fits the existing E2E folder convention).

**Why NOT also the reject mirror as a second E2E test:**
- Both confirm and reject share the exact same branching logic from Decision §6. One test proves the runtime branch holds; a second mirror test is redundant for the cost of an additional ~5s E2E run + maintenance.
- If dev-agent finds the test naturally splits (e.g., confirm leaves the row in CONFIRMED + reject leaves it in REJECTED — both useful regression assertions), shipping as 2 tests is acceptable and target becomes 62. Document in Dev Agent Record.

**Anti-pattern forbidden:**
- Do NOT call real Stripe API from E2E for the happy Phase 2 path. Flakiness + cost not justified for 9-4.
- Do NOT enter Stripe Checkout UI from E2E (same anti-pattern as 9-3).
- Do NOT mock `paymentIntents.capture` / `cancel` at the dev-server layer via env-var stubs — invasive, out of 9-4's scope. Unit-test mocks are the right boundary.

---

### Decision 14: Memory file extension — extend `reference_stripe_service_pattern.md`

**Locked: continue the Theme B reference doc with a new section "Story 9-4 additions — Confirm/Reject with Capture/Cancel."**

Cover:
- Sub-module pattern: `src/lib/payments/payment-intents.ts` as the third example (after `connect.ts` + `checkout.ts`).
- Stripe-first-then-DB ordering — the inverse of 9-3's pre-claim model. Rationale: no slot-claim race on Owner-side confirm/reject (single-tenant); DB-rollback-on-Stripe-fail is the bad alternative.
- `payment_status` CHECK constraint extension to 4 values — third instance of the DROP/ADD pattern (after 9-2b's `spaces.status` and 9-3's initial constraint).
- `VOIDED` naming choice — distinct from booking-side `CANCELLED` to avoid sub-system confusion.
- Per-booking-id idempotency keys (`capture-${bookingId}` + `cancel-${bookingId}`) — distinct from 9-3's per-attempt UUID. Pattern: per-resource keys when the operation is bounded; per-attempt keys when retries should produce distinct attempts.
- Phase 1 backwards-compat branch (`paymentIntentId IS NULL` → skip Stripe) — pattern for any future story extending a Phase 1 action.
- `cancellation_reason: 'requested_by_customer'` hardcoded with rationale.
- Inline-error display preserved (no new toast strings).
- Forward-looking note: Story 9-6 adds REFUNDED state + Guest-cancel-with-refund flow. The PRD §4.5 cancel-interpretation question (CONFIRMED + within-24h cancellation policy) becomes load-bearing for 9-6, not 9-4.

**No new memory file.** Extend the existing reference.

**Anti-pattern forbidden:**
- Do NOT spin out a new memory file. Theme B's reference doc remains the canonical container.

---

### Decision 15: Files likely touched (estimate, not directive)

**New:**
- `deskhive/drizzle/migrations/0006_<name>.sql` (auto + story-tag comment)
- `deskhive/drizzle/migrations/meta/0006_snapshot.json` (auto)
- `deskhive/src/lib/payments/payment-intents.ts` — `capturePaymentIntent` + `cancelPaymentIntent`
- `deskhive/src/lib/payments/payment-intents.test.ts` (4 unit tests)
- `deskhive/src/actions/booking.test.ts` (NEW — 5 unit tests for the new branches; or extend an existing test file — dev-agent picks)
- `deskhive/tests/e2e/confirm-booking-phase1-backcompat.spec.ts` (NEW — 1 backwards-compat E2E test per Decision §13; dev-agent picks the exact path/name if it fits the existing E2E folder convention better)

**Modified:**
- `deskhive/src/db/schema.ts` — extend `bookings_payment_status_check` constraint to 4 values
- `deskhive/drizzle/migrations/meta/_journal.json` (auto)
- `deskhive/src/db/queries/bookings.ts` — add `markBookingConfirmedAndCaptured` + `markBookingRejectedAndVoided` helpers
- `deskhive/src/actions/booking.ts` — extend `confirmBookingAction` + `rejectBookingAction` with the new branching logic (Decision §6) + Stripe-first-then-DB ordering (Decision §2/§3)
- `_bmad-output/implementation-artifacts/sprint-status.yaml` — Epic 9 row
- `_bmad-output/implementation-artifacts/9-4-confirm-reject-capture-cancel.md` — story file (created by `*create-story 9-4`)
- Memory: `~/.claude/.../memory/reference_stripe_service_pattern.md` (Decision §14)
- Memory: `~/.claude/.../memory/MEMORY.md` (one-liner refresh)

**Zero changes to** (carved-out for later stories):
- `deskhive/src/lib/stripe.ts` (Story 9-1's singleton)
- `deskhive/src/lib/stripe-service.ts` (Story 9-1's barrel)
- `deskhive/src/lib/payments/connect.ts` (Story 9-2's wrappers)
- `deskhive/src/lib/payments/checkout.ts` (Story 9-3's wrappers)
- `deskhive/src/lib/email*` / email-templates/
- `deskhive/src/app/(owner)/owner/settings/*` (Story 9-2's UI)
- `deskhive/src/app/(owner)/owner/spaces/*` (Story 9-2b's UI)
- `deskhive/src/app/spaces/[id]/booking/return/page.tsx` (Story 9-3's return handler)
- `deskhive/src/app/api/stripe/webhook/route.ts` — confirmed zero changes per Decision §8 (webhooks deferred to Story 9-5).
- `deskhive/src/lib/toast.ts` (Phase 1 design preserved per Decision §9 / §11)
- The Confirm / Reject button Client Components (Phase 1 design preserved per Decision §9)
- `scripts/seed.ts` (no new seed users; the existing 9-3 BA-walk PENDING + AUTHORIZED booking is the test target for the manual walk)

---

## Architectural anti-patterns forbidden (rollup)

1. Floating-point math anywhere (CC-2 carry-forward).
2. Stripe SDK imports outside `src/lib/stripe.ts` and `src/lib/payments/*` sub-modules (CC-3).
3. DB-first-then-Stripe ordering for capture/cancel — Stripe-first is locked (Decision §2 / §3).
4. Calling `stripe.paymentIntents.*` from anywhere outside the new `payment-intents.ts` sub-module (Decision §5).
5. Per-attempt UUID idempotency keys for capture/cancel — per-booking-id is locked (Decision §7).
6. Adding `paymentIntents.create` or `paymentIntents.retrieve` to the sub-module in 9-4 — `create` is already inside `checkout.sessions.create`; `retrieve` defers to whatever story actually needs it (Story 9-5 likely).
7. New `bookings.status` enum values (4-state set stays).
8. `payment_status_history` audit table — out of Phase 2 scope.
9. Toast copy additions — Phase 1 inline-error pattern preserved (Decision §11).
10. Widening webhook scope beyond Decision §8's resolution (defer or narrow — 9-5 owns the rest).
11. Email sends from any webhook handler — 8-4 territory.
12. UI redesign of `<ConfirmBookingButton>` / `<RejectBookingButton>` — Phase 1 / Story 5-2 design preserved.
13. Real Stripe API calls from E2E without explicit BA approval (Decision §13 anti-pattern).
14. Stripe `cancellation_reason: 'fraudulent'` / `'duplicate'` — `'requested_by_customer'` is locked (Decision §3).
15. Removing Phase 1 backwards-compat (Decision §6 — `payment_intent_id IS NULL` skip path is locked unless BA overrides on lock).

---

## Operator prereqs (BA completes BEFORE dev-story dispatch)

- [ ] **Stripe dashboard test-mode active** — reconfirm.
- [ ] **`.env.local` has `STRIPE_SECRET_KEY` + `STRIPE_PUBLISHABLE_KEY` + `STRIPE_WEBHOOK_SECRET`** — present from 9-2 / 9-3.
- [ ] **`pnpm db:seed` has been run on the latest schema** (after 9-3 ship). Verify `owner@deskhive.local` has synthetic Connect row + at least one published space.
- [ ] **9-3 BA-walk artifact preserved** — the booking row `92bd9829-92ed-4360-b317-367122ffbe0e` (PENDING + AUTHORIZED + `paymentIntentId='pi_3TYWSJRvIpZbtPbe1cXXP5hT'`) from the 9-3 walk is the canonical test target for the 9-4 BA walk. If that row has been cleaned up between 9-3 ship and 9-4 dispatch, BA needs to create a fresh AUTHORIZED booking via the 9-3 flow before 9-4 walk.
- [ ] **Stripe Connect account for `owner@deskhive.local` is REAL** (not the synthetic `acct_seed_for_e2e_only`) — the 9-3 BA walk created `acct_1TXqOpRpNLekzL0p` (or similar). The capture API call needs a real connected account to settle funds to.
- [ ] **`pnpm typecheck` + `pnpm test` + `pnpm test:e2e` baseline green on `main`** — confirms 9-3 + the BA-walk fix are stable before 9-4 dispatches.
- [ ] **`stripe listen` NOT required for 9-4 dev** — Decision §8 defers all webhook handlers to Story 9-5. The 9-4 BA walk can verify capture/cancel directly via the Stripe dashboard without `stripe listen` running.

---

## Forward-looking flags

- **Phase 2 PRD §4.5 cancel-interpretation** — memory `project_phase2_prd_4_5_cancel_interpretation.md` says: Phase 1's `cancelBookingAction` rejects non-PENDING; PRD implies CONFIRMED-cancel should work with refund logic. **Re-flag for Story 9-6** (which adds the refund flow and reads CAPTURED state introduced by 9-4). 9-4's `cancelBookingAction` is NOT touched — the Guest-side cancel path stays Phase-1-PENDING-only until 9-6.
- **Story 9-5 webhook generalization** absorbs 9-3's `checkout.session.completed` branch AND lands the `payment_intent.succeeded` + `payment_intent.canceled` handlers that 9-4 deliberately deferred (Decision §8). The handlers will be written in the same shape as 9-3's narrow branch (idempotency check + lookup-by-`payment_intent_id` + conditional UPDATE + insert into `webhook_events` only on first real handle), then refactored into a single dispatcher under `src/lib/payments/webhooks.ts`. The narrow window between 9-4 ship and 9-5 ship is the documented ops risk per Decision §8.
- **Story 9-6 refunds** reads CAPTURED state from 9-4 → calls `stripe.refunds.create` → transitions `payment_status` to REFUNDED (5th value) via another DROP/ADD CHECK constraint migration. Re-uses the per-booking-id idempotency key pattern from 9-4 (`refund-${bookingId}`).
- **Story 8-4 payment-driven emails** — receipt on capture (9-4 webhook event → 8-4 email send via 9-5's dispatch). 9-4 ships zero email work.
- **The 9-3 BA-walk booking `92bd9829...` is the canonical 9-4 walk target.** It carries a real Stripe Payment Intent (`pi_3TYWSJRvIpZbtPbe1cXXP5hT`) in `requires_capture` state. The 9-4 BA walk should: navigate to that booking → click Confirm → watch Stripe dashboard reflect the capture + the platform_fee_amount transfer + the connected account payout. Mirror walk for reject (would need a fresh AUTHORIZED booking since the 9-3 one is being captured).
