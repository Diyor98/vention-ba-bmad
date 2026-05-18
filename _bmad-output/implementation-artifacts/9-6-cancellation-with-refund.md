# Story 9-6: Guest Cancellation with Refund

Status: review

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a **Guest who has either a PENDING (not-yet-confirmed) booking OR a CONFIRMED (Owner-captured) booking and wants to cancel — with a full refund of my card if I cancel 24+ hours before the booking date, OR a refusal toast if I'm within 24 hours**,
I want **the existing Cancel button on `/my-bookings` to handle all three flows behind a single Server Action: (1) Phase 1 PENDING bookings (no `payment_intent_id`) cancel via DB-only UPDATE just like Phase 1; (2) Phase 2 PENDING + AUTHORIZED bookings cancel by releasing the Stripe auth hold via `paymentIntents.cancel` (no refund needed — funds were never captured); (3) Phase 2 CONFIRMED + CAPTURED bookings either issue a full refund via `stripe.refunds.create` (if 24+ hours before booking date in UTC) OR refuse entirely with an error toast (if within 24 hours)** —
so that **(a) Phase 2 PRD §4.5's refund-policy intent is honored end-to-end with no manual ops involvement; (b) the long-standing Phase 1 / Phase 2 cancel-interpretation open question from `project_phase2_prd_4_5_cancel_interpretation.md` is RESOLVED at action-layer; (c) the booking state machine transitions cleanly across `(PENDING, AWAITING_PAYMENT/AUTHORIZED) / (CONFIRMED, CAPTURED) → (CANCELLED, VOIDED/REFUNDED)`; (d) the `charge.refunded` webhook backstop reconciles any narrow ops window where Stripe succeeds but the DB UPDATE fails; and (e) the dispatcher's extensibility design from Story 9-5 is proven by adding ONE new handler function + ONE new map entry — no refactoring of the route or webhooks.ts beyond that.**

> Story 9-6 is the **Guest-cancel-with-refund** story of Theme B (Phase 2 Payments). It RESOLVES the load-bearing PRD §4.5 cancel-interpretation open question (memorized in `project_phase2_prd_4_5_cancel_interpretation.md` for 5+ stories) by locking Option (a) — extend `cancelBookingAction` in-place to support PENDING + CONFIRMED + Phase 1 backwards-compat — and ships the supporting infrastructure: schema additions (`refunded_at`, `refund_amount_cents`, `payment_status='REFUNDED'`), new sub-module `src/lib/payments/refunds.ts` (5th Theme B sub-module), refund-eligibility helper, 3 new bookings query helpers, NEW `handleChargeRefunded` webhook handler extending the 9-5 dispatcher map, UI surface extension (cancel button shown on CONFIRMED future-dated bookings), and one new toast string for the within-24h refusal.
>
> Source of truth: [docs/design/9-6-cancellation-with-refund-ba-decisions.md](docs/design/9-6-cancellation-with-refund-ba-decisions.md) — 15 locked decisions. Locked 2026-05-19 (BA: Ikhtiyor Ziyayev), committed `f4766f7`. **Lock context flag**: Decisions §2 / §3 / §11 were batch-locked end-of-shift on Claude's recommendation. Future-readers should re-verify if downstream issues arise — see the Lock context note in the BA decisions doc.

> **Companion / dependency chain:** Story 9-1 (`feat(stripe): Story 9-1 — Stripe SDK wrapper`, shipped at `aff4060`) + Story 9-2 (`feat(stripe): Story 9-2 — Stripe Connect Express onboarding`, shipped at `0d384e0` + BA-walk fix `8a06402`) + Story 9-2b (`feat(stripe): Story 9-2b — publish gating`, shipped at `7e7251c` + `2d65c54`) + Story 9-3 (`feat(stripe): Story 9-3 — booking with payment`, shipped at `bd76dc3` + `8035907`) + Story 9-4 (`feat(stripe): Story 9-4 — confirm/reject with capture/cancel`, shipped at `32dd63a`) + Story 9-5 (`feat(stripe): Story 9-5 — webhook dispatch generalization`, shipped at `2950e15`). All six are on `main`. 9-6 directly extends 9-3's `payment_status` state machine to a 5th value (REFUNDED), reuses 9-4's `cancelPaymentIntent` wrapper unchanged for the PENDING-AUTHORIZED branch, and proves out 9-5's dispatcher extensibility by adding `charge.refunded` as the 6th handler.

> **After 9-6 ships, the running app behaves like this:**
> 1. Guest on `/my-bookings` sees a Cancel button on PENDING bookings (Phase 1 carry-forward) AND on CONFIRMED future-dated bookings (NEW). The button label is uniform: "Cancel booking".
> 2. Guest clicks Cancel → `cancelBookingAction` runs through 3-branch logic:
>    - Phase 1 PENDING (no `payment_intent_id`): DB UPDATE only → `(PENDING) → (CANCELLED)`. No Stripe call. Phase 1 path unchanged.
>    - Phase 2 PENDING + AUTHORIZED: `cancelPaymentIntent` (from 9-4, idempotency key `cancel-${bookingId}` shared with 9-4 reject path — intentional, same Stripe operation) → DB UPDATE → `(PENDING, AUTHORIZED) → (CANCELLED, VOIDED)`. Card auth hold released; no money moved.
>    - Phase 2 CONFIRMED + CAPTURED: refund-eligibility check via `isRefundEligible(booking.bookingDate)` against UTC clock. If eligible (24+ hours before booking date at 00:00:00 UTC): `createRefund` (NEW wrapper, idempotency key `refund-${bookingId}`) → DB UPDATE → `(CONFIRMED, CAPTURED) → (CANCELLED, REFUNDED)` + writes `refunded_at = NOW()` + `refund_amount_cents = totalCents`. If ineligible (within 24h): action returns `REFUND_INELIGIBLE` → button fires `toastError(CANCEL_REFUND_INELIGIBLE)` per PRD §1.2 step 21's explicit "error toast" mandate. No DB write; no Stripe call.
> 3. Stripe asynchronously fires `charge.refunded` to `/api/stripe/webhook` → 9-5's route shell verifies signature + Layer 1 idempotency → calls `dispatchWebhookEvent(event)` → new `handleChargeRefunded` in `WEBHOOK_HANDLERS` map looks up booking by `charge.payment_intent` (PI ID) → conditional UPDATE via `markBookingCancelledAndRefundedByPaymentIntent` → returns `{ handled: true }` if action's DB write failed (rescue path) OR `{ idempotent: true }` if action won the race (happy path — backstop is a no-op). `webhook_events` insert ONLY on `{ handled: true }`.
> 4. Story 8-4 will later wire `charge.refunded` event delivery to a refund-confirmation email (carry-forward; 9-6 ships ZERO email work).

> **Key anti-patterns to keep in mind:**
> - **No floating-point math** anywhere — refund-policy helper is integer-ms arithmetic only (CC-2 carry-forward).
> - **No Stripe SDK imports outside `src/lib/stripe.ts` + `src/lib/payments/*` sub-modules** (CC-3 carry-forward).
> - **No DB-first-then-Stripe ordering** — Stripe-first-then-DB locked for both PENDING-cancel and CONFIRMED-refund branches (Decision §5; 9-4 carry-forward).
> - **No `stripe.refunds.*` calls outside `src/lib/payments/refunds.ts`** (Decision §4).
> - **No `stripe.refunds.retrieve` / `.list` / `.update` in 9-6** — defer until a story needs them.
> - **No partial refunds** in 9-6 — full-refund-only; Phase 3 territory.
> - **No `amount` arg or `refund_application_fee: true`** on `stripe.refunds.create` — destination-charge mode auto-reverses the platform fee on full refunds.
> - **No per-attempt UUID idempotency keys** — per-booking-id (`refund-${bookingId}`) is locked (Decision §4).
> - **No Owner-side / Admin-side refund UI** — FR-REFUND-4 forward-ready signature only (Phase 2 UI scope locked).
> - **No new `bookings.status` enum values** — 4-state set (`PENDING / CONFIRMED / REJECTED / CANCELLED`) stays.
> - **No `refund.created` handler** — `charge.refunded` is the locked event per PRD §4.5 FR-REFUND-5 (Decision §7).
> - **No Stripe API calls from inside the webhook handler** (carry-forward from 9-3 + 9-5).
> - **No emails from inside the action OR inside the webhook handler** — Story 8-4 wires payment-driven emails on top.
> - **No inline-rendering of `REFUND_INELIGIBLE`** — PRD §1.2 step 21 explicit "error toast" lock (Decision §9). Other Stripe-failed codes use inline rendering per 9-4 pattern.
> - **No confirm dialog** before cancel — Phase 1 UX precedent is no-dialog (Decision §8).
> - **No pre-computing refund eligibility client-side** — server is the source of truth (Decision §8 anti-pattern).
> - **No timezone-aware date math** — UTC-only per FR-REFUND-2 (Decision §3).
> - **No transactional write-with-rollback for `handleChargeRefunded`** — 9-5's audit-gap-on-retry pattern carries forward; the bookings row IS the financial audit trail (Decision §11).
> - **No keeping the verbatim Phase 1 "Only pending bookings can be cancelled" message** for `booking.status !== 'PENDING'` — Phase 2 PRD §4.5 explicitly supersedes (Decision §2).
> - **No widening the role gate beyond GUEST** — Owner-side refund is forward-signature-prepared only.

## Acceptance Criteria

> Source: locked BA Decisions document Decisions 1–15.

1. **AC-1 (Schema migration: 2 new bookings columns + extend `bookings_payment_status_check` to 5 values).** Per BA Decision §1:
   - Edit [src/db/schema.ts](deskhive/src/db/schema.ts) `bookingsTable` — add two NULL-able columns:
     ```typescript
     refundedAt: timestamp('refunded_at', { withTimezone: true }),
     refundAmountCents: integer('refund_amount_cents'),
     ```
     Both NULL-able by design: Phase 1 rows + non-refunded Phase 2 rows (PENDING/CONFIRMED/REJECTED/already-VOIDED) keep NULL. Set together (`refundedAt = NOW()` + `refundAmountCents = totalCents`) in the same UPDATE that flips `payment_status='REFUNDED'`.
   - Extend the `bookings_payment_status_check` constraint from 4 values (`'AWAITING_PAYMENT', 'AUTHORIZED', 'CAPTURED', 'VOIDED'`) to 5 by adding `'REFUNDED'`:
     ```typescript
     check(
       'bookings_payment_status_check',
       sql`${t.paymentStatus} IN ('AWAITING_PAYMENT', 'AUTHORIZED', 'CAPTURED', 'VOIDED', 'REFUNDED')`,
     ),
     ```
   - Run `pnpm db:generate` → produces migration `deskhive/drizzle/migrations/0007_<random_name>.sql`. Inspect the SQL — should be a single `DROP CONSTRAINT ... ADD CONSTRAINT ...` block (mirrors `0006_cold_rictor.sql` for the previous extension) + the two `ADD COLUMN` statements for the new columns. No data migrations.
   - Add a story-tag comment block at the top of `0007_*.sql` matching the `0006_cold_rictor.sql` / `0005_soft_wither.sql` convention. Cover: the new payment_status value (`REFUNDED`), the state-machine transition (`CAPTURED → REFUNDED`), the two new columns, and the rollback hint (DROP COLUMN twice + DROP/ADD CONSTRAINT to the 9-4 4-value set; safe IFF no rows are in REFUNDED state at rollback time).
   - **Anti-pattern enforced:** do NOT add `refundedAt` / `refundAmountCents` as NOT NULL (Phase 1 + Phase 2 non-refunded rows would fail). Do NOT add a separate `refunds` table (one refund per booking is sufficient for Phase 2; Phase 3 may revisit). Do NOT change existing values; the 4 prior payment_status values stay.

2. **AC-2 (Resolve PRD §4.5 cancel-interpretation — extend `cancelBookingAction` in-place, not rename / replace).** Per BA Decision §2:
   - Locked: **Option (a) — extend `cancelBookingAction` in-place** to support PENDING + CONFIRMED with branching logic. Single action, single button, single state shape. The PRD §6.3 list's `cancelBookingWithRefundAction` name is treated as a capability descriptor, NOT a rename mandate.
   - The existing `cancelBookingAction` is preserved at its current path [src/actions/booking.ts](deskhive/src/actions/booking.ts) with these structural preservations:
     - `'use server'` directive at top.
     - `requireSession()` + `requireRole('GUEST')` + 401-redirect-to-`/login?callbackUrl=/my-bookings` + 403-error-state pattern stays.
     - `getBookingById` lookup + `requireOwnership` check stays.
     - Conditional UPDATE race-safety net stays (carry-forward + extended via new helpers).
     - Post-success `notifyBookingCancelledByGuest(bookingId, previousStatus).catch(...)` fire-and-forget pattern stays.
     - `revalidatePath('/my-bookings')` + `revalidatePath('/spaces/${booking.spaceId}')` stays.
     - Return `{ status: 'success' }` on all 3 happy paths stays.
   - **The Phase 1 verbatim message supersedence (load-bearing):** the existing return on `booking.status !== 'PENDING'`:
     ```typescript
     return {
       status: 'error',
       code: 'CANNOT_CANCEL',
       message: 'Only pending bookings can be cancelled.',  // ← Phase 1 verbatim, US-3.5 AC-2
     };
     ```
     Is REPLACED. The new check fires only on terminal states (CANCELLED, REJECTED, already-REFUNDED). New copy:
     ```
     'This booking has already been cancelled or rejected.'
     ```
     (Or similar — dev-agent picks the exact phrasing. The locked behavior: the message ONLY fires for terminal states; eligible PENDING + CONFIRMED paths flow through the new branches in AC-5.)
   - **Anti-pattern enforced:** do NOT ship a new `cancelBookingWithRefundAction` action (Option (b) anti-pattern from Decision §2). Do NOT delete `cancelBookingAction` (Option (c) anti-pattern). Do NOT preserve the Phase 1 verbatim message — Phase 2 PRD §4.5 explicit supersedence. Do NOT widen the role check beyond `GUEST` (FR-REFUND-4 Owner-refund is forward-prepared at the signature level but unsurfaced in Phase 2 UI). Do NOT change the 401-redirect URL.

3. **AC-3 (24-hour refund-eligibility helper at `src/lib/refund-policy.ts`).** Per BA Decision §3:
   - Create new file [src/lib/refund-policy.ts](deskhive/src/lib/refund-policy.ts). Single export:
     ```typescript
     /**
      * Story 9-6: Phase 2 single-policy refund-eligibility check
      * (FR-REFUND-1 + FR-REFUND-2).
      *
      * Eligible iff: now (UTC) < (bookingDate at 00:00:00 UTC) - 24h.
      *
      * - Reference point: 00:00:00 UTC of the booking date (BA Decision §3).
      * - Timezone: UTC-only (FR-REFUND-2 explicit lock — no Guest-TZ).
      * - Boundary: now === cutoff is INELIGIBLE (strict-less-than for eligible;
      *   favors the platform / Owner).
      * - Past-date bookings: cutoff is in the past → now > cutoff → INELIGIBLE.
      *
      * @param bookingDate  the `bookings.booking_date` value. Drizzle's
      *                     `date('booking_date')` returns this as a `string`
      *                     in `YYYY-MM-DD` form; accept either string or Date.
      * @param now          optional override (defaults to `new Date()`).
      *                     Tests inject deterministic values.
      */
     export function isRefundEligible(
       bookingDate: string | Date,
       now: Date = new Date(),
     ): boolean;
     ```
     Implementation: construct `new Date(${bookingDate}T00:00:00Z)` for the UTC anchor → subtract `24 * 60 * 60 * 1000` ms → compare against `now.getTime()`. Pure integer-ms math — no floating-point, no timezone library.
   - **File location decision (Decision §3 + §15 dev-agent note):** locked as new file `src/lib/refund-policy.ts` (Phase 3 multi-policy headroom). Dev-agent MAY override to extend [src/lib/bookings.ts](deskhive/src/lib/bookings.ts) if codebase conventions favor consolidation. If overridden, document in DAR.
   - **Anti-pattern enforced:** do NOT use floating-point math (CC-2). Do NOT use a timezone library (`date-fns-tz`, `moment-timezone`, etc.) — UTC-only is the PRD lock. Do NOT compute the cutoff from `booking.createdAt` or `booking.updatedAt` — `booking_date` is the locked reference. Do NOT inject server-clock skew handling (assume `Date.now()` is authoritative).

4. **AC-4 (New Stripe sub-module `src/lib/payments/refunds.ts` — 5th Theme B sub-module).** Per BA Decision §4:
   - Create new sub-module [src/lib/payments/refunds.ts](deskhive/src/lib/payments/refunds.ts) following the same pattern as 9-2's `connect.ts` / 9-3's `checkout.ts` / 9-4's `payment-intents.ts` / 9-5's `webhooks.ts`. Single export:
     ```typescript
     import Stripe from 'stripe';
     import { stripe } from '@/lib/stripe';
     import type { StripeServiceResult } from '@/lib/stripe-service';

     /**
      * Story 9-6: refunds a captured Payment Intent in full. Phase 2 ships
      * full-refund-only (no `amount` arg; Stripe defaults to full captured
      * amount). Phase 3 may add a partial-refund variant.
      *
      * Idempotency key per BA Decision §4: per-booking-id namespace
      * `refund-${bookingId}`. Mirrors 9-4's per-resource pattern; distinct
      * from 9-2 / 9-3 / 9-4 namespaces.
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
   - Internal Stripe API call:
     ```typescript
     const refund = await stripe.refunds.create(
       {
         payment_intent: args.paymentIntentId,
         // NO `amount` arg — full refund.
         // NO `refund_application_fee: true` — destination-charge mode
         // automatically reverses platform_fee_amount on full refunds.
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
   - `mapStripeError` helper — identical shape to 9-2 / 9-3 / 9-4's wrappers (`Stripe.errors.StripeError → err.message`; other errors → `'Unexpected error'` + `console.error('[stripe-refunds] ...')` for ops visibility).
   - **Anti-pattern enforced:** do NOT call `stripe.refunds.*` from anywhere outside this sub-module. Do NOT add `stripe.refunds.retrieve` / `.list` / `.update` in 9-6. Do NOT pass `amount` arg (Phase 2 full-refund-only). Do NOT pass `refund_application_fee: true` (destination-charge auto-reverses fee; adding the flag would double-reverse and break the math). Do NOT use per-attempt UUIDs — per-booking-id is correct (operation bounded to one PI).

5. **AC-5 (`cancelBookingAction` 3-branch extension with Stripe-first-then-DB ordering).** Per BA Decision §5:
   - Edit [src/actions/booking.ts](deskhive/src/actions/booking.ts) `cancelBookingAction`. Preserve ALL existing Phase 1 pre-checks (UUID regex + auth + role + ownership + booking lookup) UNCHANGED. Insert the new branching logic AFTER the pre-checks succeed:
     ```typescript
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
       // Phase 1 path: pure DB cancel, no Stripe involvement.
       const updated = await cancelBooking(bookingId, String(session.user.id));
       if (!updated) {
         return {
           status: 'error',
           code: 'CANNOT_CANCEL',
           message: 'This booking has already been cancelled or rejected.',
         };
       }
     } else if (isPhase2PendingAuth) {
       // Phase 2 PENDING path: cancel Stripe PI auth first (no refund — funds
       // never captured), then DB UPDATE. Idempotency key INTENTIONALLY shared
       // with 9-4's reject path (same Stripe operation; Stripe's cache
       // resolves correctly per Decision §5).
       const cancelResult = await cancelPaymentIntent({
         paymentIntentId: booking.paymentIntentId!,
         idempotencyKey: `cancel-${bookingId}`,
       });
       if (!cancelResult.ok) {
         logger.error('cancel_booking_action_stripe_cancel_failed', {
           bookingId,
           paymentIntentId: booking.paymentIntentId,
           error: cancelResult.error,
         });
         return {
           status: 'error',
           code: 'STRIPE_CANCEL_FAILED',
           message: cancelResult.error,
         };
       }
       const updated = await markBookingCancelledAndVoided(
         bookingId,
         String(session.user.id),
       );
       if (!updated) {
         return {
           status: 'error',
           code: 'CANNOT_CANCEL',
           message: 'This booking has already been cancelled or rejected.',
         };
       }
     } else if (isPhase2ConfirmedCaptured) {
       // Phase 2 CONFIRMED path: check eligibility FIRST. No Stripe call if
       // ineligible (PRD §4.5 / FR-REFUND-3 explicit "refuses cancellation
       // entirely" lock).
       if (!isRefundEligible(booking.bookingDate)) {
         return {
           status: 'error',
           code: 'REFUND_INELIGIBLE',
           message: 'Cancellations within 24 hours of the booking date are non-refundable.',
         };
       }
       // Stripe-first-then-DB: refund first; DB UPDATE on Stripe success.
       const refundResult = await createRefund({
         paymentIntentId: booking.paymentIntentId!,
         idempotencyKey: `refund-${bookingId}`,
       });
       if (!refundResult.ok) {
         logger.error('cancel_booking_action_stripe_refund_failed', {
           bookingId,
           paymentIntentId: booking.paymentIntentId,
           error: refundResult.error,
         });
         return {
           status: 'error',
           code: 'STRIPE_REFUND_FAILED',
           message: refundResult.error,
         };
       }
       const updated = await markBookingCancelledAndRefunded(
         bookingId,
         String(session.user.id),
         booking.totalCents,
       );
       if (!updated) {
         return {
           status: 'error',
           code: 'CANNOT_CANCEL',
           message: 'This booking has already been cancelled or rejected.',
         };
       }
     } else {
       // Terminal state (already CANCELLED / REJECTED / REFUNDED) OR unexpected
       // edge case (paymentIntentId set but payment_status not in the expected
       // 9-3/9-4 progression — could indicate state corruption).
       return {
         status: 'error',
         code: 'CANNOT_CANCEL',
         message: 'This booking has already been cancelled or rejected.',
       };
     }
     ```
   - The post-success path (`notifyBookingCancelledByGuest(bookingId, previousStatus).catch(...)` + `revalidatePath` calls + `return { status: 'success' }`) stays identical across all 3 happy paths.
   - **Idempotency-key sharing with 9-4 reject path is INTENTIONAL** (Decision §5): if a Phase 2 PENDING booking was already PI-cancelled (e.g., 9-4 Owner-Reject ran first), `cancelPaymentIntent` hits Stripe's idempotency cache, returns the cached `canceled` PI → action proceeds to `markBookingCancelledAndVoided` which no-ops (booking is no longer in `(PENDING, AUTHORIZED)`) → action returns `CANNOT_CANCEL`. Race is safe.
   - **Anti-pattern enforced:** do NOT do DB-first-then-Stripe (preserves 9-4 Stripe-first lock). Do NOT issue a refund without checking eligibility first. Do NOT roll the eligibility check into SQL WHERE (application-layer precision needed for the error message). Do NOT skip `requireOwnership` (defense-in-depth alongside the conditional WHERE's `guestUserId`). Do NOT widen the role gate to SPACE_OWNER / SUPER_ADMIN (FR-REFUND-4 forward-prepared at signature level only). Do NOT preserve the Phase 1 verbatim "Only pending bookings can be cancelled" message.

6. **AC-6 (3 new `bookings` query helpers).** Per BA Decision §6:
   - Edit [src/db/queries/bookings.ts](deskhive/src/db/queries/bookings.ts). Add 3 new helpers paralleling 9-4's by-id helpers + 9-5's by-PI helpers:
     ```typescript
     /**
      * Story 9-6: Phase 2 PENDING Guest-cancel. Transitions
      * (PENDING, AUTHORIZED) → (CANCELLED, VOIDED). Called by
      * cancelBookingAction AFTER cancelPaymentIntent succeeds.
      *
      * Conditional WHERE on (id, status='PENDING',
      * payment_status='AUTHORIZED', guest_user_id) — race-safety net +
      * ownership defense-in-depth. Returns undefined if the row moved
      * out of (PENDING, AUTHORIZED) between pre-check and UPDATE.
      */
     export async function markBookingCancelledAndVoided(
       id: string,
       guestUserId: string,
     ): Promise<Booking | undefined>;

     /**
      * Story 9-6: Phase 2 CONFIRMED Guest-cancel with full refund.
      * Transitions (CONFIRMED, CAPTURED) → (CANCELLED, REFUNDED) and
      * writes refunded_at = NOW() + refund_amount_cents. Called AFTER
      * createRefund succeeds.
      *
      * Conditional WHERE on (id, status='CONFIRMED',
      * payment_status='CAPTURED', guest_user_id) — same race-safety
      * net + ownership defense.
      */
     export async function markBookingCancelledAndRefunded(
       id: string,
       guestUserId: string,
       refundAmountCents: number,
     ): Promise<Booking | undefined>;

     /**
      * Story 9-6: webhook backstop for charge.refunded handler. Same
      * state transition as markBookingCancelledAndRefunded but keyed
      * on payment_intent_id (no guest_user_id clause — webhook doesn't
      * know who initiated; the PI uniqueness is the join). Closes the
      * narrow ops window where action's DB write fails AFTER
      * stripe.refunds.create succeeds.
      */
     export async function markBookingCancelledAndRefundedByPaymentIntent(
       paymentIntentId: string,
       refundAmountCents: number,
     ): Promise<Booking | undefined>;
     ```
     All three use the canonical pattern: conditional `WHERE and(eq(id|paymentIntentId), eq(status), eq(payment_status), [eq(guestUserId)])` + SET `(status, payment_status, refunded_at, refund_amount_cents, updated_at)` + `.returning()`. Empty `.returning()` → caller surfaces CANNOT_CANCEL (action) OR `{ idempotent: true }` (webhook handler).
   - **Anti-pattern enforced:** do NOT skip the guest_user_id clause in the action-facing helpers (defense-in-depth). Do NOT collapse the three helpers into one parameterized helper (type checker should enforce each transition's column writes). Do NOT add a `markBookingRefundedByPaymentIntent` payment_status-only variant for the webhook — the handler is the FULL state backstop (atomically transitions both `status` AND `payment_status`).

7. **AC-7 (NEW `handleChargeRefunded` webhook handler — extends 9-5's `WEBHOOK_HANDLERS` map).** Per BA Decision §7:
   - Edit [src/lib/payments/webhooks.ts](deskhive/src/lib/payments/webhooks.ts). Add 1 new handler function + 1 new map entry. **First proof of 9-5's extensibility design — if extending takes more than one new function + one new entry, that's the early-warning signal to re-evaluate the dispatcher.**
   - New handler shape (mirrors 9-5's `handlePaymentIntentSucceeded` structure):
     ```typescript
     export async function handleChargeRefunded(
       event: Stripe.Event,
     ): Promise<WebhookHandlerResult> {
       const charge = event.data.object as Stripe.Charge;
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

       // charge.amount_refunded is the cumulative refunded amount (cents).
       // For Phase 2 full refunds, this equals charge.amount.
       const refundAmountCents = charge.amount_refunded;

       let booking;
       try {
         booking = await getBookingByPaymentIntentId(paymentIntentId);
       } catch (err) {
         logger.error('stripe_webhook_charge_refunded_lookup_failed', { ... });
         return { ok: false, status: 500, message: 'Booking lookup failed' };
       }
       if (!booking) {
         logger.warn('stripe_webhook_charge_refunded_booking_not_found', { ... });
         return { ok: true, deferred: true };
       }

       let updated;
       try {
         updated = await markBookingCancelledAndRefundedByPaymentIntent(
           paymentIntentId,
           refundAmountCents,
         );
       } catch (err) {
         logger.error('stripe_webhook_charge_refunded_update_failed', { ... });
         return { ok: false, status: 500, message: 'Booking update failed' };
       }
       if (!updated) {
         logger.info('stripe_webhook_charge_refunded_already_refunded', { ... });
         return { ok: true, idempotent: true };
       }
       return { ok: true, handled: true };
     }
     ```
   - Add to `WEBHOOK_HANDLERS` map:
     ```typescript
     export const WEBHOOK_HANDLERS = {
       'account.updated': handleAccountUpdated,
       'checkout.session.completed': handleCheckoutSessionCompleted,
       'checkout.session.expired': handleCheckoutSessionExpired,
       'payment_intent.succeeded': handlePaymentIntentSucceeded,
       'payment_intent.canceled': handlePaymentIntentCanceled,
       'charge.refunded': handleChargeRefunded,  // ← NEW in 9-6
     };
     ```
   - Reuse 9-5's existing `getBookingByPaymentIntentId` lookup helper unchanged.
   - **Why `charge.refunded` and NOT `refund.created`:** PRD §4.5 FR-REFUND-5 explicit lock on `charge.refunded`. `charge.refunded` is the canonical "the customer was refunded" signal; `refund.created` is the "Stripe started a refund attempt" signal that could still fail.
   - 3-stage try-catch wrapper from 9-2 BA-walk-fix pattern preserved (per-stage error attribution).
   - **Anti-pattern enforced:** do NOT also handle `refund.created`. Do NOT call `stripe.refunds.retrieve` from inside the handler (webhook payload is the source of truth). Do NOT trigger email sends (8-4 territory). Do NOT skip the conditional WHERE on `markBookingCancelledAndRefundedByPaymentIntent`. Do NOT add `payment_intent.payment_failed` in 9-6 (still no consumer).

8. **AC-8 (UI surface — cancel button on CONFIRMED future-dated bookings).** Per BA Decision §8:
   - Edit [src/app/my-bookings/page.tsx](deskhive/src/app/my-bookings/page.tsx). The current rendering at lines ~178–198 shows `<CancelBookingButton>` ONLY on PENDING bookings (the `isPending ? <CancelBookingButton /> : ... null` branch). Extend to ALSO render on `CONFIRMED + future-dated` bookings (the current `// CONFIRMED future-dated → no footer (keep card tight)` branch).
   - **Past-dated CONFIRMED bookings: do NOT show cancel button** (refund eligibility helper would refuse anyway; rendering the button just to error is bad UX). The check is `booking.bookingDate > today (UTC)` — dev-agent uses the same UTC-date comparison logic the refund-policy helper uses, or a simpler `new Date(booking.bookingDate) > new Date()` is acceptable for the rendering gate.
   - Edit [src/app/my-bookings/cancel-booking-button.tsx](deskhive/src/app/my-bookings/cancel-booking-button.tsx):
     - Update button label from "Cancel request" to **"Cancel booking"** (uniform copy across PENDING and CONFIRMED per Decision §8 (a); the Phase 1 "request" framing leaked PENDING-only assumption).
     - "Cancelling…" pending-state copy stays.
     - Extend the `useEffect` toast-dispatch block to ALSO fire `toastError(TOAST_COPY.CANCEL_REFUND_INELIGIBLE)` when `state.status === 'error' && state.code === 'REFUND_INELIGIBLE'`. Use the same `lastFiredState` ref-guard pattern from Story 6-3 to prevent double-fire in React 19 Strict Mode.
     - Other error codes (`STRIPE_REFUND_FAILED`, `STRIPE_CANCEL_FAILED`, `FORBIDDEN`, `NOT_FOUND`, `CANNOT_CANCEL`, `INTERNAL_ERROR`) continue to render inline via the existing `{errorMessage && <p className="field-error" role="alert">{errorMessage}</p>}` block (9-4 carry-forward).
   - **No confirm dialog** (Decision §8 explicit lock — Phase 1 UX precedent is single-click cancel).
   - **No client-side eligibility pre-compute** (action is the source of truth; client-side preview would diverge from server clock).
   - **Anti-pattern enforced:** do NOT split `<CancelBookingButton>` into two components (PENDING vs CONFIRMED variants). Do NOT show on past-dated bookings. Do NOT show on already-CANCELLED / REJECTED bookings (existing logic preserved). Do NOT add a confirm dialog. Do NOT add new props to the button component (`bookingId` is the only prop; no `bookingStatus` etc.).

9. **AC-9 (Toast copy + error display — new `CANCEL_REFUND_INELIGIBLE` toast + inline for Stripe-error codes).** Per BA Decision §9:
   - Edit [src/lib/toast.ts](deskhive/src/lib/toast.ts). Add one new entry to `TOAST_COPY`:
     ```typescript
     // Story 9-6: surfaces the within-24h refusal per PRD §1.2 step 21.
     // FR-REFUND-3 explicit "refuses the cancellation entirely with an
     // error toast" lock.
     CANCEL_REFUND_INELIGIBLE: {
       title: 'Cancellation not eligible',
       description:
         'Cancellations within 24 hours of the booking date are non-refundable.',
     },
     ```
     (Dev-agent OR BA may pick the exact title/description phrasing during dev-story.)
   - **Existing `CANCEL_SUCCESS` entry reused** for all 3 happy paths (Phase 1 PENDING / Phase 2 PENDING-VOIDED / Phase 2 CONFIRMED-REFUNDED). The single "Booking cancelled." message works because the booking IS cancelled in all 3 cases; refund-confirmation is a separate Story 8-4 email.
   - **Inline rendering preserved** (9-4 pattern) for:
     - `STRIPE_CANCEL_FAILED` — Stripe `paymentIntents.cancel` failed (Phase 2 PENDING branch).
     - `STRIPE_REFUND_FAILED` — Stripe `refunds.create` failed (Phase 2 CONFIRMED branch).
     - `CANNOT_CANCEL` — terminal-state catch-all (new copy from AC-2).
     - `FORBIDDEN` / `NOT_FOUND` / `INTERNAL_ERROR` — Phase 1 carry-forward.
   - **Anti-pattern enforced:** do NOT inline-render `REFUND_INELIGIBLE` (PRD §1.2 step 21 explicit toast lock). Do NOT use a toast for `STRIPE_*_FAILED` (9-4 inline-error pattern carries forward). Do NOT introduce ad-hoc strings at call sites — all toast text lives in `TOAST_COPY`. Do NOT change `CANCEL_SUCCESS` copy.

10. **AC-10 (Error code expansions on `CancelBookingActionState`).** Per BA Decision §10:
    - Edit [src/actions/booking.ts](deskhive/src/actions/booking.ts) `CancelBookingActionState` discriminated union:
      ```typescript
      export type CancelBookingActionState =
        | { status: 'idle' }
        | { status: 'success' }
        | { status: 'error'; code: 'FORBIDDEN'; message: string }
        | { status: 'error'; code: 'NOT_FOUND'; message: string }
        | { status: 'error'; code: 'CANNOT_CANCEL'; message: string }
        // Story 9-6 additions (BA Decision §10):
        | { status: 'error'; code: 'REFUND_INELIGIBLE'; message: string }
        | { status: 'error'; code: 'STRIPE_REFUND_FAILED'; message: string }
        | { status: 'error'; code: 'STRIPE_CANCEL_FAILED'; message: string }
        | { status: 'error'; code: 'INTERNAL_ERROR'; message: string };
      ```
    - `message` for `REFUND_INELIGIBLE` carries the same copy as the toast description (action returns a fallback message in case the toast wrapper fails; both surfaces show the same text).
    - `message` for `STRIPE_REFUND_FAILED` / `STRIPE_CANCEL_FAILED` carries the Stripe error string verbatim (end-user-readable in test mode per 9-4 precedent).
    - **Why distinct codes (not one shared `STRIPE_FAILED`):** mirrors 9-4's `STRIPE_CAPTURE_FAILED` + `STRIPE_CANCEL_FAILED` split. Test assertions target specific code paths. Future Phase 3 toast variants can map distinctly.
    - **Anti-pattern enforced:** do NOT collapse into a single `STRIPE_FAILED` code. Do NOT use `STRIPE_CANCEL_FAILED` from this state in `ConfirmBookingActionState` / `RejectBookingActionState` (different state types even though the code name is the same).

11. **AC-11 (Audit-trail strictness — accept the 9-5 audit-gap-on-retry pattern for `handleChargeRefunded`).** Per BA Decision §11:
    - The 9-5 forward-flag asked whether the refund handler needs transactional write-with-rollback semantics. **Locked: NO. Accept 9-5's audit-gap-on-retry pattern.**
    - Rationale: the financial audit trail lives on the booking row itself (`refunded_at` timestamp + `refund_amount_cents` integer + `payment_status='REFUNDED'`). Missing a `webhook_events` row on retry-after-partial-failure does NOT lose financial truth — `webhook_events` is operational (idempotency / replay debugging), not financial.
    - The handler MUST follow 9-5's existing pattern verbatim:
      - 3-stage try-catch wrapper (lookup → mutate → log).
      - Return `WebhookHandlerResult` discriminated union.
      - Route's `webhook_events` insert at Layer 2 ONLY on `{ handled: true }`.
      - On retry after partial failure (Stripe succeeds → handler succeeds → route's insert fails → 500 → Stripe retries → next delivery hits conditional-WHERE idempotent path → no insert ever recorded). The DB state remains correct; only the Stripe-event-id traceability is lost.
    - **Anti-pattern enforced:** do NOT introduce transactional write-with-rollback for `handleChargeRefunded`. Do NOT add a `last_refund_event_id` column in 9-6 (out of scope; flag for Phase 3 if compliance review demands). Do NOT widen the audit trade-off discussion to ALL 9-5 handlers — this is specifically about `charge.refunded`.

12. **AC-12 (Unit tests — ~12-15 new across action + wrapper + helpers + handler).** Per BA Decision §12:
    - **`src/lib/payments/refunds.test.ts`** (NEW — 2 wrapper tests):
      1. `createRefund` happy path — Stripe SDK called with correct args + idempotency key; result wrapped as `StripeServiceResult<{ refundId, paymentIntentId, status, amountCents }>`. Verifies no `amount` arg + no `refund_application_fee` arg.
      2. `createRefund` error path — Stripe throws `StripeError` → `{ ok: false, error: <message> }`.
      Mock at `@/lib/stripe` boundary.
    - **`src/lib/refund-policy.test.ts`** (NEW — 4-5 parameterized policy tests; OR colocated with `bookings.test.ts` if dev-agent locks file location in `src/lib/bookings.ts`):
      1. Exactly 24h before booking date (boundary at `bookingDate at 00:00:00 UTC` - 24h, with `now === cutoff`) → INELIGIBLE.
      2. 24h + 1 second before → ELIGIBLE.
      3. 23h59m59s before → INELIGIBLE.
      4. Past booking date (e.g., yesterday) → INELIGIBLE.
      5. Far-future booking date (e.g., 30 days out) → ELIGIBLE.
      Use a parameterized `it.each` table; inject `now` arg for determinism. Pure function — no mocks.
    - **`src/actions/booking.test.ts`** (extend or add ~5-6 tests for the new branches):
      1. **Phase 2 PENDING happy** — booking `(PENDING, AUTHORIZED, paymentIntentId='pi_...')` → action calls `cancelPaymentIntent` with key `cancel-${bookingId}` → `markBookingCancelledAndVoided` → state success. Asserts Stripe wrapper called once with the expected key + arg.
      2. **Phase 2 CONFIRMED eligible happy** — booking `(CONFIRMED, CAPTURED, paymentIntentId, bookingDate=30 days out)` → eligibility check passes → `createRefund` with key `refund-${bookingId}` → `markBookingCancelledAndRefunded` with `refundAmountCents === booking.totalCents` → state success.
      3. **Phase 2 CONFIRMED ineligible refusal** — same shape but `bookingDate=12 hours out` → eligibility fails → action returns `REFUND_INELIGIBLE` with the toast-copy message; Stripe wrappers NOT called; DB UPDATE helper NOT called.
      4. **Phase 2 CONFIRMED + Stripe refund failure** — eligible booking, but `createRefund` returns `{ ok: false, error: 'card_declined' }` → action returns `STRIPE_REFUND_FAILED` with Stripe's message; DB UPDATE helper NOT called.
      5. **Phase 1 backwards-compat preservation** — booking `(PENDING, paymentIntentId IS NULL)` → action calls existing `cancelBooking(bookingId, callerId)` helper; Stripe wrappers NOT called; DB UPDATE helper NOT called (existing helper instead).
      6. **CANNOT_CANCEL on terminal state** — booking `(CANCELLED, REFUNDED)` or `(REJECTED, VOIDED)` → action returns `CANNOT_CANCEL` with the new "This booking has already been cancelled or rejected." message.
      Mock pattern (split-by-mock-boundary from 9-4 / 9-5): `vi.mock('@/lib/payments/refunds')` + `vi.mock('@/lib/payments/payment-intents')` + `vi.mock('@/db/queries/bookings')`.
    - **`src/lib/payments/webhooks.test.ts`** (extend — ~2-3 handler tests for `handleChargeRefunded`):
      1. **Happy** — booking `(CONFIRMED, CAPTURED, paymentIntentId='pi_...')` → conditional UPDATE returns the row → `{ handled: true }`. Asserts `markBookingCancelledAndRefundedByPaymentIntent` called with PI id + `charge.amount_refunded` value.
      2. **Idempotent** — booking already `(CANCELLED, REFUNDED)` → conditional UPDATE returns undefined → `{ idempotent: true }`.
      3. **Deferred (booking-not-found)** — `getBookingByPaymentIntentId` returns undefined → `{ deferred: true }`. UPDATE helper NOT called.
    - **`src/db/queries/bookings.test.ts`** (extend — ~3-4 parameterized helper tests):
      1. `markBookingCancelledAndVoided` happy + race-lost (1 parameterized).
      2. `markBookingCancelledAndRefunded` happy + race-lost (1 parameterized).
      3. `markBookingCancelledAndRefundedByPaymentIntent` happy + race-lost (1 parameterized).
      Mock at `@/db/client` boundary (carry-forward from 9-5).
    - **Target unit-test count after this story:** 378 (baseline at end of 9-5) + ~12-15 = **~390-393**. Dev-agent may ship +1-3 bonus per the 9-1 / 9-2 / 9-2b / 9-3 / 9-4 / 9-5 +N-bonus pattern (9-5 shipped +9 over due to regression coverage + direct dispatcher tests; expect a tighter delta here since 9-6 doesn't refactor existing layers).
    - **Mock pattern reminder (3 layers from 9-5):** action tests mock `@/lib/payments/*` + `@/db/queries/*`; wrapper tests mock `@/lib/stripe`; handler tests mock `@/db/queries/*`; query tests mock `@/db/client`. Do NOT cross.
    - **Anti-pattern enforced:** do NOT write integration tests that hit real Stripe API. Do NOT skip the boundary-of-24h test (load-bearing edge case for the eligibility helper). Do NOT mock the refund-policy helper from inside action tests — inject `now` if needed, but it's pure and trivial to evaluate.

13. **AC-13 (E2E test target — 0 new; stays at 61).** Per BA Decision §13:
    - **Locked: 0 new E2E tests in 9-6.** Target stays at **61** (post-9-5 baseline).
    - Rationale: the Phase 2 refund happy path requires a real Stripe-captured booking (slow, flaky, costs Stripe-test-quota). The within-24h refusal path is application-layer eligibility logic (no Stripe API call) — already unit-tested. The Phase 1 backwards-compat path is E2E-covered by existing US-3.5 tests.
    - **Optional BA override**: ship 1 within-24h-refusal regression E2E (pure DB-state assertion, no Stripe). Dev-agent picks based on time budget; document in DAR if shipped.
    - BA-walk verification path: `stripe listen` + manual Stripe-dashboard refund verification + DB-direct insert for the ineligible path.
    - **Anti-pattern enforced:** do NOT call real Stripe `refunds.create` from E2E. Do NOT mock the Stripe SDK at the dev-server layer.

14. **AC-14 (Memory file extension + RESOLVE the open-question memory).** Per BA Decision §14:
    - Extend out-of-tree `~/.claude/.../memory/reference_stripe_service_pattern.md` with a new section **"Story 9-6 additions — Cancellation with Refund"** covering:
      - 5th sub-module pattern: `src/lib/payments/refunds.ts`. Single export `createRefund`; no `amount` arg; no `refund_application_fee: true` (destination-charge auto-reverses fee).
      - `cancelBookingAction` in-place extension (vs replacement) — the 3-branch logic. The Phase 1 verbatim message supersedence.
      - Refund-eligibility helper at `src/lib/refund-policy.ts` (or `src/lib/bookings.ts` if dev-agent overrode — record final pick). UTC-only 24h math; integer-ms arithmetic; start-of-day anchor.
      - `payment_status` CHECK constraint extended to 5 values (3rd DROP/ADD instance after 9-3 and 9-4).
      - `refunded_at` + `refund_amount_cents` columns — NULL-able by design (Phase 1 + non-refunded Phase 2 rows pass).
      - Per-booking-id idempotency key `refund-${bookingId}` (alignment with 9-4's per-resource pattern). Key `cancel-${bookingId}` is INTENTIONALLY shared between 9-4 reject + 9-6 Phase 2 PENDING cancel (same Stripe operation).
      - `handleChargeRefunded` — 6th handler in the 9-5 dispatcher map; **proves 9-5's extensibility design** (1 new function + 1 new map entry).
      - Audit-trail decision: 9-5's audit-gap-on-retry pattern accepted for `charge.refunded` (the bookings row IS the financial audit; webhook_events is operational).
      - Forward-looking flags for Phase 3: partial refunds, multi-policy support, Owner-side force-majeure UI, refund disputes / chargebacks.
    - **RESOLVE the open-question memory** [project_phase2_prd_4_5_cancel_interpretation.md](~/.claude/.../memory/project_phase2_prd_4_5_cancel_interpretation.md):
      - Add a "RESOLVED 2026-05-19" header at the top pointing to Story 9-6 + this story file + the 9-6 BA decisions doc (`f4766f7`).
      - Body stays for historical context (don't delete) — but the file ceases to be a "needs attention" flag.
      - Locked stance: extend `cancelBookingAction` in-place to support PENDING + CONFIRMED + Phase 1 backwards-compat (Option (a) from BA Decision §2).
    - Update `~/.claude/.../memory/MEMORY.md` index entry's one-liner for `reference_stripe_service_pattern.md` to reflect 9-6 additions.
    - **No new memory file** — extend the existing reference + flip the resolution memory.

15. **AC-15 (`git diff` scope bounded + single commit + BA walk + docs follow-up).** Per BA Decision §15 + the Story 9-1 → 9-5 established pattern:
    - **All changes confined to:**
      - `deskhive/src/db/schema.ts` — add 2 columns + extend CHECK constraint to 5 values
      - `deskhive/drizzle/migrations/0007_*.sql` (new, auto-generated + story-tag comment)
      - `deskhive/drizzle/migrations/meta/0007_snapshot.json` + `_journal.json` (auto)
      - `deskhive/src/lib/payments/refunds.ts` (new) — `createRefund` wrapper
      - `deskhive/src/lib/payments/refunds.test.ts` (new) — 2 wrapper tests
      - `deskhive/src/lib/refund-policy.ts` (new) — `isRefundEligible` helper (OR add to `src/lib/bookings.ts` — dev-agent picks)
      - `deskhive/src/lib/refund-policy.test.ts` (new) — 4-5 policy tests (OR colocated)
      - `deskhive/src/db/queries/bookings.ts` — 3 new helpers
      - `deskhive/src/db/queries/bookings.test.ts` — extend with new helper tests
      - `deskhive/src/actions/booking.ts` — extend `cancelBookingAction` with 3-branch logic + 3 new error codes; replace Phase 1 verbatim message
      - `deskhive/src/actions/booking.test.ts` — extend with new branch tests
      - `deskhive/src/lib/payments/webhooks.ts` — add `handleChargeRefunded` + map entry
      - `deskhive/src/lib/payments/webhooks.test.ts` — extend with handler tests
      - `deskhive/src/app/my-bookings/page.tsx` — render `<CancelBookingButton>` for CONFIRMED future-dated bookings
      - `deskhive/src/app/my-bookings/cancel-booking-button.tsx` — label "Cancel booking"; toastError on `REFUND_INELIGIBLE`
      - `deskhive/src/lib/toast.ts` — add `CANCEL_REFUND_INELIGIBLE` entry
      - `_bmad-output/implementation-artifacts/sprint-status.yaml`
      - `_bmad-output/implementation-artifacts/9-6-cancellation-with-refund.md` (this file)
      - Memory files in `~/.claude/.../memory/` (out-of-tree)
    - **Zero changes to:**
      - `deskhive/src/lib/stripe.ts` (Story 9-1's singleton)
      - `deskhive/src/lib/stripe-service.ts` (Story 9-1's barrel)
      - `deskhive/src/lib/payments/connect.ts` (Story 9-2's wrappers)
      - `deskhive/src/lib/payments/checkout.ts` (Story 9-3's wrappers)
      - `deskhive/src/lib/payments/payment-intents.ts` (Story 9-4's wrappers — `cancelPaymentIntent` REUSED but file unmodified)
      - `deskhive/src/app/api/stripe/webhook/route.ts` (Story 9-5's thin shell — new handler lives in `webhooks.ts`; route untouched)
      - `deskhive/src/actions/booking-with-payment.ts` (Story 9-3's create-with-payment)
      - `deskhive/src/lib/email*` / `deskhive/src/lib/email-templates/` (Story 8-4 wires payment-driven emails AFTER 9-6)
      - `deskhive/src/app/(owner)/owner/*` / `deskhive/src/app/admin/*` (no UI changes outside `/my-bookings`)
      - `deskhive/scripts/seed.ts` (no seed changes)
      - `deskhive/.env.example` (no new env vars)
    - All Story 9-6 changes land in a single commit on `main` titled `feat(stripe): Story 9-6 — Guest cancellation with refund`. (Matches the `feat(stripe):` scope from 9-1 + 9-2 + 9-2b + 9-3 + 9-4 + 9-5.)
    - A small follow-up `docs:` commit fills in the Change Log hash + records BA greenlight + flips sprint-status from `review` → `done` after push.
    - Memory entry lives in `~/.claude/.../memory/` (out-of-tree, NOT staged).
    - **BA browser walk (stop bar):**
      1. All unit tests pass — target **~390-393** (378 baseline + ~12-15 new). Document any divergence (+N bonus) in DAR.
      2. All E2E tests pass — target **61** (unchanged; 0 new). Restart `pnpm dev` first + re-run `pnpm db:seed` if any DB state is suspect. Pre-existing 5 hazards may still surface — flag if anything new joins them.
      3. `pnpm typecheck` + `pnpm lint` clean.
      4. `pnpm build` — **41 routes unchanged** (zero new routes; refund work runs on existing `/my-bookings` action path + the webhook route).
      5. `git diff --stat` matches the file list above. Zero entries in the carved-out files (Stripe singleton, the other 4 payments sub-modules, the route shell, actions other than booking.ts, email infrastructure, UI files outside `/my-bookings`, etc.).
      6. **`stripe listen` setup**: start `stripe listen --forward-to localhost:3000/api/stripe/webhook` in a side terminal. Swap `STRIPE_WEBHOOK_SECRET` in `.env.local` to the CLI-printed `whsec_...` value AND restart `pnpm dev` (same operator pattern as 9-5).
      7. **Phase 1 backwards-compat walk:** sign in as `guest@deskhive.local` → navigate to `/my-bookings` → find a Phase 1 PENDING booking (`payment_intent_id IS NULL`); seed-side a fresh one if needed → click Cancel → verify booking transitions to CANCELLED in DB; `payment_status` stays NULL; no Stripe API calls fire.
      8. **Phase 2 PENDING walk:** create a fresh Phase 2 PENDING + AUTHORIZED booking via the 9-3 Checkout flow (complete Stripe Checkout with test card `4242 4242 4242 4242`; booking lands at `(PENDING, AUTHORIZED, pi_...)`) → click Cancel → verify `stripe.paymentIntents.cancel` fires + booking transitions to `(CANCELLED, VOIDED)`. Stripe dashboard shows the PI in `canceled` state.
      9. **Phase 2 CONFIRMED eligible refund walk:** start a SECOND 9-3 Checkout flow → Owner confirms (`(CONFIRMED, CAPTURED, pi_...)`) → ensure booking_date is at least 30 days out → click Cancel on `/my-bookings` → verify `stripe.refunds.create` fires + booking transitions to `(CANCELLED, REFUNDED)` + `refunded_at` populated + `refund_amount_cents === totalCents`. Stripe dashboard shows the Refund in `succeeded` state. Stripe webhook `charge.refunded` fires; verify dispatch route returns 200 + the handler returns `{ idempotent: true }` (action won the race) → no second `webhook_events` insert.
      10. **Phase 2 CONFIRMED ineligible refusal walk:** ensure a booking exists in `(CONFIRMED, CAPTURED, booking_date <24h out)` — seed/DB-direct insert OR use a booking from step 9 with `booking_date` adjusted (or just walk it pragmatically with a fresh booking dated tomorrow). Click Cancel → verify `REFUND_INELIGIBLE` toast surfaces ("Cancellations within 24 hours of the booking date are non-refundable.") + booking stays in `(CONFIRMED, CAPTURED)` + no Stripe API calls fire.
      11. **`charge.refunded` backstop walk (optional):** use `stripe trigger charge.refunded` against a known PI id (or rely on the natural event from step 9's refund) → verify the handler runs through real-event flow; `webhook_events` row inserted IF it's a first-handle (i.e., action's DB write hadn't won — rare in normal flow but the handler's safety net).
      12. **Past-date cancel button hidden walk:** verify `/my-bookings` does NOT render the Cancel button on past-dated CONFIRMED bookings (eligibility-helper-implied UX gate).
      13. **Operator prereq from Decision §15:** `owner@deskhive.local`'s Connect row should be in real test-mode state (not synthetic `acct_seed_for_e2e_only`) for refund payouts to settle on the real connected account. Same prereq carries forward from 9-4 / 9-5 walks.

## Tasks / Subtasks

- [x] **Task 0 — Prep + 9-5 baseline check + locked-decision audit.**
  - Verify baseline CI clean: `pnpm typecheck` / `lint` / `test` (378 expected) / `build` (41 routes expected) / `test:e2e` (61 expected, modulo documented hazards).
  - Confirm Story 9-5 is at `done` on `main` (`git log --oneline` shows `2950e15` + `3c3d11f`).
  - Re-read [docs/design/9-6-cancellation-with-refund-ba-decisions.md](docs/design/9-6-cancellation-with-refund-ba-decisions.md) end-to-end (15 locked decisions + the **Lock context note** flagging Decisions §2 / §3 / §11 as end-of-shift batch-locks). If anything looks suspicious or ambiguous during implementation, STOP and re-engage BA rather than guess.
  - Inspect [src/actions/booking.ts](deskhive/src/actions/booking.ts) — re-read the current `cancelBookingAction` shape (lines 65–177). Catalog every existing pre-check, error code, message, redirect, and post-success call to ensure the in-place extension preserves them all.
  - Inspect [src/lib/payments/payment-intents.ts](deskhive/src/lib/payments/payment-intents.ts) — `cancelPaymentIntent` is REUSED unchanged for the Phase 2 PENDING branch (idempotency key `cancel-${bookingId}` shared with 9-4 reject path).
  - Inspect [src/lib/payments/webhooks.ts](deskhive/src/lib/payments/webhooks.ts) — re-read the 9-5 dispatcher map + the `handlePaymentIntentSucceeded` / `handleCheckoutSessionExpired` handler shapes that `handleChargeRefunded` will mirror. Specifically catalog the 3-stage try-catch pattern + log key conventions.
  - Inspect [src/db/queries/bookings.ts](deskhive/src/db/queries/bookings.ts) — re-read 9-4's `markBookingConfirmedAndCaptured` / `markBookingRejectedAndVoided` AND 9-5's by-PI helpers; the new 9-6 helpers mirror those patterns.
  - Inspect [src/app/my-bookings/page.tsx](deskhive/src/app/my-bookings/page.tsx) (lines ~178–200) — confirm the `isPending` / `archived` / past-date branching structure that the AC-8 UI extension modifies.
  - Inspect [src/app/my-bookings/cancel-booking-button.tsx](deskhive/src/app/my-bookings/cancel-booking-button.tsx) — re-read the `useActionState` + `useEffect`-toast pattern that AC-8 extends.
  - Inspect [src/lib/toast.ts](deskhive/src/lib/toast.ts) — re-read the `TOAST_COPY` shape; confirm the `CANCEL_SUCCESS` entry stays unchanged.
  - Confirm `stripe listen` is available locally: `stripe --version`.
  - Verify the 9-3 BA-walk artifact booking + the 9-4 BA-walk artifacts (the `92bd9829-...` row is currently in `(CONFIRMED, CAPTURED)` from 9-4's capture — if its `booking_date` is >24h out, it's the canonical 9-6 walk target for AC-15 §9 eligible-refund).

- [x] **Task 1 — Schema migration** (AC-1):
  - Edit [src/db/schema.ts](deskhive/src/db/schema.ts) `bookingsTable`: add `refundedAt` + `refundAmountCents` columns; extend `bookings_payment_status_check` to 5 values.
  - Run `pnpm db:generate` → produces `drizzle/migrations/0007_<random_name>.sql`.
  - Inspect the generated SQL: should contain ALTER TABLE statements for the 2 new columns + a `DROP CONSTRAINT ... ADD CONSTRAINT ...` block for the CHECK extension. No data migrations.
  - Add the story-tag comment block at the top of `0007_*.sql` matching the `0006_cold_rictor.sql` convention.
  - Apply locally: `pnpm db:migrate`.

- [x] **Task 2 — Refund-eligibility helper** (AC-3):
  - Create [src/lib/refund-policy.ts](deskhive/src/lib/refund-policy.ts) with `isRefundEligible(bookingDate, now?)` per the locked signature + UTC + integer-ms math.
  - Document the location choice in DAR if dev-agent overrode to extend `src/lib/bookings.ts` instead.

- [x] **Task 3 — Stripe refunds sub-module** (AC-4):
  - Create [src/lib/payments/refunds.ts](deskhive/src/lib/payments/refunds.ts) with `createRefund` per the locked signature. Mirror 9-4's `payment-intents.ts` file-header docstring conventions.
  - Internal `mapStripeError` helper identical to 9-2 / 9-3 / 9-4 wrappers.

- [x] **Task 4 — New `bookings` query helpers** (AC-6):
  - Edit [src/db/queries/bookings.ts](deskhive/src/db/queries/bookings.ts). Add 3 new helpers per AC-6 with the conditional WHERE clauses + `guestUserId` defense-in-depth on the 2 action-facing helpers.

- [x] **Task 5 — Extend `cancelBookingAction`** (AC-2 + AC-5 + AC-10):
  - Edit [src/actions/booking.ts](deskhive/src/actions/booking.ts). Insert the 3-branch logic between the pre-checks and the post-success path. Replace the Phase 1 verbatim message per AC-2.
  - Add the 3 new error codes to `CancelBookingActionState` per AC-10.
  - Idempotency keys: `cancel-${bookingId}` (shared with 9-4 — intentional) + `refund-${bookingId}` (new per AC-4).

- [x] **Task 6 — NEW `handleChargeRefunded` webhook handler** (AC-7 + AC-11):
  - Edit [src/lib/payments/webhooks.ts](deskhive/src/lib/payments/webhooks.ts). Add the handler function (mirroring `handlePaymentIntentSucceeded`'s shape from 9-5) + the 1 new map entry. Preserve the 3-stage try-catch wrapper + 9-5 log-key conventions.

- [x] **Task 7 — Toast copy addition** (AC-9):
  - Edit [src/lib/toast.ts](deskhive/src/lib/toast.ts). Add `CANCEL_REFUND_INELIGIBLE` entry per AC-9.

- [x] **Task 8 — UI surface extension on `/my-bookings`** (AC-8):
  - Edit [src/app/my-bookings/page.tsx](deskhive/src/app/my-bookings/page.tsx) to render `<CancelBookingButton>` on CONFIRMED + future-dated bookings (in addition to PENDING). Past-dated CONFIRMED bookings get no button.
  - Edit [src/app/my-bookings/cancel-booking-button.tsx](deskhive/src/app/my-bookings/cancel-booking-button.tsx): update label to "Cancel booking" + add `toastError(TOAST_COPY.CANCEL_REFUND_INELIGIBLE)` dispatch on `state.code === 'REFUND_INELIGIBLE'`.

- [x] **Task 9 — Unit tests** (AC-12):
  - Create [src/lib/payments/refunds.test.ts](deskhive/src/lib/payments/refunds.test.ts) — 2 wrapper tests.
  - Create [src/lib/refund-policy.test.ts](deskhive/src/lib/refund-policy.test.ts) — 4-5 parameterized policy tests (OR colocate per Task 2 location decision).
  - Extend [src/actions/booking.test.ts](deskhive/src/actions/booking.test.ts) — ~5-6 action tests.
  - Extend [src/lib/payments/webhooks.test.ts](deskhive/src/lib/payments/webhooks.test.ts) — ~2-3 `handleChargeRefunded` tests.
  - Extend [src/db/queries/bookings.test.ts](deskhive/src/db/queries/bookings.test.ts) — ~3-4 parameterized helper tests.
  - Run `pnpm test` → target ~390-393.

- [x] **Task 10 — E2E (optional 0-1)** (AC-13):
  - Default: 0 new E2E. If dev-agent ships the optional within-24h-refusal regression E2E, document in DAR + target moves to 62.
  - Run `pnpm test:e2e` → target 61 (or 62 if optional shipped).

- [x] **Task 11 — Local CI parity** (AC-15):
  - `pnpm typecheck` clean.
  - `pnpm lint` clean.
  - `pnpm test` — ~390-393 expected.
  - `pnpm build` — 41 routes unchanged.
  - `pnpm test:e2e` — 61 expected (modulo documented hazards from prior stories).

- [x] **Task 12 — `git diff` verification + quick smoke test** (AC-15 + AC-16-equivalent):
  - `git diff --stat` matches the AC-15 file list. Zero entries in the carved-out files (Stripe singleton, the other 4 payments sub-modules, the route shell, action files other than `booking.ts`, email infrastructure, UI files outside `/my-bookings`, etc.).
  - Quick smoke test: `pnpm dev` running, sign in as `guest@deskhive.local`, navigate to `/my-bookings`. Verify the Cancel button now appears on the seeded CONFIRMED future-dated bookings (if any exist) AND continues to appear on PENDING bookings. Click Cancel on a Phase 1 PENDING booking (no PI) to confirm the backwards-compat branch fires without Stripe.
  - **AC-15 §6–§13 (full BA browser walk including `stripe listen` setup + all 3 happy paths + ineligible refusal + past-date hidden walk + optional `charge.refunded` backstop)** is DEFERRED to BA's review pass per the precedent.

- [x] **Task 13 — Memory + open-question RESOLVE + sprint-status + DAR + single commit (no push)** (AC-14 + AC-15):
  - Extend `~/.claude/.../memory/reference_stripe_service_pattern.md` with the Story 9-6 section per AC-14.
  - RESOLVE `~/.claude/.../memory/project_phase2_prd_4_5_cancel_interpretation.md` per AC-14 — add the "RESOLVED 2026-05-19" header pointing to this story file + the 9-6 BA decisions doc; preserve historical body.
  - Update `~/.claude/.../memory/MEMORY.md` index entry's one-liner for `reference_stripe_service_pattern.md`.
  - Update `_bmad-output/implementation-artifacts/sprint-status.yaml`: add `9-6-cancellation-with-refund: review` to Epic 9 (after `9-5-webhook-dispatch-generalization: done`); update `last_updated` parenthetical.
  - Update this story file: `Status: ready-for-dev` → `Status: review`; mark Tasks 0–12 `[x]` (Task 12's BA-walk DEFERRED note stays); fill in Dev Agent Record.
  - Stage all files per AC-15.
  - Commit: `feat(stripe): Story 9-6 — Guest cancellation with refund`.
  - **Do NOT push.** Wait for BA browser verification per Task 12 + AC-15 §6–§13 before pushing.
  - After BA greenlight: push, then add a small `docs:` follow-up commit to flip sprint-status to `done` (same pattern as 9-1 / 9-2 / 9-2b / 9-3 / 9-4 / 9-5).

## Dev Notes

### What gets built and what's deliberately out of scope

Story 9-6 is the **Guest cancellation with refund** story of Theme B. It's a moderate-scope story landing across several layers:

1. **Schema additions** (`refunded_at`, `refund_amount_cents`, `payment_status='REFUNDED'`) via migration `0007_*.sql`.
2. **New sub-module** `src/lib/payments/refunds.ts` (5th Theme B sub-module).
3. **New helper file** `src/lib/refund-policy.ts` (single export — refund-eligibility check).
4. **3 new bookings query helpers** for the 3 state transitions (Phase 2 PENDING void, Phase 2 CONFIRMED refund, webhook-by-PI variant).
5. **`cancelBookingAction` extension** with 3-branch logic resolving PRD §4.5's cancel-interpretation open question.
6. **NEW webhook handler** `handleChargeRefunded` extending 9-5's dispatcher map (proves out the extensibility design).
7. **UI surface extension** — Cancel button on CONFIRMED future-dated bookings + label "Cancel booking" + toastError on `REFUND_INELIGIBLE`.
8. **One new toast copy entry** for the within-24h refusal (PRD §1.2 step 21 explicit toast lock).

After 9-6 lands at `review` and BA greenlights:

- Phase 2 PRD §4.5 (Refund Policy) is honored end-to-end: full refund 24+ hours before booking date OR refusal toast within 24h.
- The long-standing PRD §4.5 cancel-interpretation open question (memorized in `project_phase2_prd_4_5_cancel_interpretation.md` since Story 8-3) is RESOLVED.
- The booking state machine cleanly transitions across all combinations: `(PENDING, NULL) → (CANCELLED, NULL)` (Phase 1 path); `(PENDING, AUTHORIZED) → (CANCELLED, VOIDED)` (Phase 2 PENDING path); `(CONFIRMED, CAPTURED) → (CANCELLED, REFUNDED)` (Phase 2 CONFIRMED path).
- The `charge.refunded` webhook backstop reconciles narrow ops windows where Stripe succeeds but DB writes fail.
- 9-5's dispatcher map proves extensible: adding the 6th handler is exactly 1 new function + 1 new map entry. Story 9-7 will do the same for `payout.paid`.

Feature scope (Story 9-6 only):
- ✅ Schema migration `0007_*.sql` adding 2 columns + extending CHECK to 5 values.
- ✅ New sub-module `src/lib/payments/refunds.ts` with `createRefund`.
- ✅ New helper `src/lib/refund-policy.ts` with `isRefundEligible`.
- ✅ 3 new bookings query helpers.
- ✅ `cancelBookingAction` 3-branch extension (Phase 1 PENDING / Phase 2 PENDING / Phase 2 CONFIRMED).
- ✅ Refund-ineligible refusal with toast.
- ✅ NEW `handleChargeRefunded` webhook handler + map entry in `webhooks.ts`.
- ✅ UI surface extension on `/my-bookings`.
- ✅ Three new error codes: `REFUND_INELIGIBLE` + `STRIPE_REFUND_FAILED` + `STRIPE_CANCEL_FAILED`.
- ✅ One new toast copy entry: `CANCEL_REFUND_INELIGIBLE`.
- ✅ ~12-15 new unit tests across action + wrapper + helpers + handler.
- ✅ 0 new E2E (optional within-24h-refusal regression at dev-agent discretion).
- ✅ Memory entry extension + RESOLVE the open-question memory.

Out of scope (do NOT build):
- ❌ Owner-side / Admin-side refund UI — FR-REFUND-4 forward-signature-prepared only; Phase 2 UI scope explicit lock.
- ❌ Partial refunds — Phase 3 (Story 9-6 ships full-refund-only).
- ❌ `payout.paid` webhook handler — Story 9-7.
- ❌ `/owner/payouts` view — Story 9-7.
- ❌ Refund email template — Story 8-4 wires `charge.refunded` event delivery to email send AFTER 9-6 lands the handler.
- ❌ Multi-policy refund windows (different windows per space type / per owner) — Phase 3.
- ❌ Refund disputes / chargebacks — Phase 3.
- ❌ Currency conversion / multi-currency — Phase 2 is USD-only.
- ❌ Confirm dialog before cancel — Phase 1 UX precedent is no-dialog.
- ❌ Transactional write-with-rollback for the webhook handler — 9-5's audit-gap-on-retry pattern carries forward (Decision §11).
- ❌ `payment_intent.payment_failed` handler — still no consumer in Phase 2.
- ❌ Owner force-majeure refund button or shortcut — Phase 3.

### Key decisions baked into the spec

1. **`cancelBookingAction` extended in-place** (vs renamed / replaced). BA Decision §2. Resolves the PRD §4.5 open question via Option (a). Phase 1 verbatim "Only pending bookings can be cancelled" message is SUPERSEDED.
2. **24-hour cutoff anchor: `bookingDate at 00:00:00 UTC` (start-of-day).** BA Decision §3. Boundary at `now === cutoff` is INELIGIBLE (favor platform). UTC-only — no timezone library.
3. **Stripe-first-then-DB ordering** for both PENDING-void and CONFIRMED-refund branches (9-4 carry-forward). BA Decision §5.
4. **Per-booking-id idempotency keys** — `cancel-${bookingId}` (shared with 9-4 reject path; intentional) + `refund-${bookingId}` (new namespace).
5. **`charge.refunded` (not `refund.created`)** as the locked webhook event per PRD §4.5 FR-REFUND-5.
6. **No partial refunds** — Phase 2 full-refund-only. No `amount` arg on `stripe.refunds.create`. No `refund_application_fee: true` (destination-charge mode auto-reverses).
7. **Audit-trail accept the 9-5 pattern** — bookings row IS the financial audit; `webhook_events` is operational. No transactional write-with-rollback.
8. **UI button label: "Cancel booking" uniform** (not branched by status). Phase 1's "Cancel request" framing leaked PENDING-only assumption.
9. **No confirm dialog** before cancel — Phase 1 UX precedent.
10. **`REFUND_INELIGIBLE` uses a toast; other Stripe-error codes render inline** (9-4 inline-error pattern preserved for Stripe-error visibility).
11. **`payment_status` CHECK constraint extended to 5 values** via DROP/ADD pattern (3rd instance after 9-3 + 9-4).
12. **Refund-policy helper at `src/lib/refund-policy.ts` (new file)** — Phase 3 multi-policy headroom; dev-agent may override to `src/lib/bookings.ts` if codebase favors consolidation (document in DAR).

### Test-count baseline alignment

Decision §12 cites "378 baseline + ~12-15 = ~390-393 unit tests". The 378 baseline is the post-9-5 actual (`pnpm test` output at commit `2950e15`: `378 passed | 1 skipped`).

E2E baseline: 61 (post-9-5 actual; 0 new in 9-5). +0 new locked in 9-6 → target **61** (or 62 if dev-agent ships the optional within-24h-refusal regression).

Build route count: 41 (post-9-5 actual; 9-5 added 0 routes). 9-6 also adds ZERO routes — refund work runs on the existing `/my-bookings` page → existing `cancelBookingAction` Server Action + the existing `/api/stripe/webhook` route.

### Sprint status update

[`_bmad-output/implementation-artifacts/sprint-status.yaml`](_bmad-output/implementation-artifacts/sprint-status.yaml) — add `9-6-cancellation-with-refund: ready-for-dev` to Epic 9's section (after `9-5-webhook-dispatch-generalization: done`). On move-to-review (Task 13), flip to `review`. On BA greenlight (post-push), flip to `done`.

### Recent commits (Epic 9 chain)

```
f4766f7 docs: lock Story 9-6 BA decisions (cancellation with refund)  ← THIS STORY's source-of-truth lock
3c3d11f chore: mark Story 9-5 done in sprint status
2950e15 feat(stripe): Story 9-5 — webhook dispatch generalization     ← Story 9-5 ship
4b07064 chore: dispatch Story 9-5 (ready-for-dev)
38d8c6b docs: lock Story 9-5 BA decisions (webhook dispatch generalization)
d866e33 chore: mark Story 9-4 done in sprint status
32dd63a feat(stripe): Story 9-4 — confirm/reject with capture/cancel
```

Story 9-6 is the **seventh Epic 9 feature commit** (after 9-1, 9-2, 9-2's BA-walk fix, 9-2b, 9-3, 9-3's BA-walk fix, 9-4, and 9-5). Subject: `feat(stripe): Story 9-6 — Guest cancellation with refund`.

### Forward-looking notes preserved

- **Story 9-7** (`/owner/payouts` view) is the LAST Theme B story. Will extend `WEBHOOK_HANDLERS` with `payout.paid` handler (one more function + one more map entry — same extensibility pattern proven by 9-6's `charge.refunded` addition). 9-7 lands the `/owner/payouts` page consuming Stripe Connect's payouts list API. After 9-7, Theme B is complete.
- **Story 8-4** (payment-driven emails) — extends `charge.refunded` event delivery to a refund-confirmation email per PRD §4.3. 9-6 ships the webhook handler; 8-4 attaches the email send. Same split as 9-4's `payment_intent.succeeded` → 8-4 email wiring (currently still pending until 8-4 dispatches).
- **Phase 3** considerations:
  - Partial refunds (`stripe.refunds.create({ amount: ... })`) + cumulative `refund_amount_cents` tracking + `charge.refunded` handler richer logic.
  - Owner-side force-majeure refund UI (PRD FR-REFUND-4 forward-ready) — would surface in `/owner/bookings` with a dedicated "Issue refund" button.
  - Multi-policy refund windows — different time-based or amount-based policies per space type / owner.
  - Refund disputes / chargebacks — `charge.dispute.created` handler + `bookings.dispute_*` columns.
  - Multi-currency support (USD-only in Phase 2).
  - Last-refund-event-id audit column if compliance review demands stricter Stripe-event traceability.
- **Refund-policy override headroom**: locking the helper in `src/lib/refund-policy.ts` leaves a natural seam for Phase 3 multi-policy. If dev-agent inlines into `src/lib/bookings.ts`, future stories may need to extract it back.
- **Idempotency key sharing** (`cancel-${bookingId}` between 9-4 reject + 9-6 Phase 2 PENDING cancel) is INTENTIONAL. Both paths call the same `stripe.paymentIntents.cancel` with the same PI. If 9-6 dispatches AFTER a 9-4 reject already ran on the same booking, the 9-6 action would hit `markBookingCancelledAndVoided`'s conditional WHERE (booking is now REJECTED + VOIDED, not PENDING + AUTHORIZED) → no-op → CANNOT_CANCEL. Race is safe.
- **The 9-3 BA-walk booking `92bd9829-...`** is currently in `(CONFIRMED, CAPTURED)` from the 9-4 BA walk. If its `booking_date` is >24h out at 9-6 BA-walk time, it's the canonical eligible-refund target. BA needs to verify before walk.
- **The Lock context flag** in the BA decisions doc: Decisions §2 / §3 / §11 were end-of-shift batch-locks on Claude's recommendation. If dev-agent encounters any ambiguity implementing these (the cancel-action shape, the 24h cutoff anchor, the audit-trail trade-off), STOP and re-engage BA rather than guess.

### References

- [Source: docs/design/9-6-cancellation-with-refund-ba-decisions.md](docs/design/9-6-cancellation-with-refund-ba-decisions.md) — locked 2026-05-19 (BA: Ikhtiyor Ziyayev), committed `f4766f7`. 15 decisions + Lock context note flagging end-of-shift batch-locks for §2 / §3 / §11.
- [Source: docs/03-phase2-prd.md §4.4 FR-PAY-6] — Guest-cancel-with-refund-or-PI-cancel locked behavior.
- [Source: docs/03-phase2-prd.md §4.5] — Refund Policy (FR-REFUND 1–5).
- [Source: docs/03-phase2-prd.md §1.2 demo flow steps 20–21] — Eligible refund + ineligible refusal toast.
- [Source: docs/03-phase2-prd.md §6.1] — bookings.refunded_at + refund_amount_cents columns.
- [Source: docs/03-phase2-prd.md §6.3] — `cancelBookingWithRefundAction` named in the action list (treated as capability descriptor per BA Decision §2).
- [Source: docs/03-phase2-prd.md §8 Epic 9 Story 9-6] — Migration + AC summary.
- [Source: deskhive/src/actions/booking.ts](deskhive/src/actions/booking.ts) — `cancelBookingAction` Phase 1 shape preserved + extended.
- [Source: deskhive/src/lib/payments/payment-intents.ts](deskhive/src/lib/payments/payment-intents.ts) — `cancelPaymentIntent` reused unchanged for Phase 2 PENDING branch.
- [Source: deskhive/src/lib/payments/webhooks.ts](deskhive/src/lib/payments/webhooks.ts) — 9-5 dispatcher map extended with `charge.refunded` entry; new `handleChargeRefunded` mirrors `handlePaymentIntentSucceeded` structure.
- [Source: deskhive/src/db/queries/bookings.ts](deskhive/src/db/queries/bookings.ts) — 9-4's by-id helpers + 9-5's by-PI helpers as templates for 9-6's 3 new helpers.
- [Source: deskhive/src/app/my-bookings/page.tsx](deskhive/src/app/my-bookings/page.tsx) + [cancel-booking-button.tsx](deskhive/src/app/my-bookings/cancel-booking-button.tsx) — UI surface extension target.
- [Source: deskhive/src/lib/toast.ts](deskhive/src/lib/toast.ts) — `TOAST_COPY` registry; new `CANCEL_REFUND_INELIGIBLE` entry.
- Dev-agent memory `reference_stripe_service_pattern.md` — extend with Story 9-6 section per AC-14.
- Dev-agent memory `project_phase2_prd_4_5_cancel_interpretation.md` — flip to RESOLVED per AC-14.

## Dev Agent Record

### Agent Model

Claude Opus 4.7 (1M context).

### Debug Log References

- `pnpm db:generate` produced `0007_sudden_nick_fury.sql` cleanly — 1 DROP CONSTRAINT + 2 ADD COLUMN + 1 ADD CONSTRAINT, no data migrations. Story-tag comment block prepended matching the `0006_cold_rictor.sql` convention.
- `pnpm db:migrate` applied cleanly.
- `pnpm typecheck` clean (after one fix: `previousStatus` cast to `BookingStatus` since the Phase 1 `booking.status !== 'PENDING'` type-narrowing precondition was removed; the conditional WHERE in the new query helpers + the CHECK constraint guarantee the value is in the union, so the cast is safe).
- `pnpm lint` clean.
- `pnpm test` — **403 passed + 1 skipped** (378 baseline + **+25 new**). Over BA's +12-15 target but the breakdown is defensible — see Completion Notes for the per-test-file tally + rationale for each bonus.
- `pnpm build` — **41 routes unchanged** (zero new routes; refund work runs on the existing `/my-bookings` action path + the existing `/api/stripe/webhook` route).
- `pnpm test:e2e` — **50 passed, 6 failed, 5 did not run = 61 total**. Matches AC-13's unchanged target. The 6 failures: 5 pre-existing documented hazards (admin-applications, application-emails, become-a-host × 2, booking-emails) + the 9-3 cross-file Connect-row race for `booking-with-payment.spec.ts` (the documented hazard that occasionally surfaces depending on test ordering; same hazard surface as 9-4's BA-walk run which saw 49 passed). No new regressions from 9-6.

### Completion Notes

- **Schema migration `0007_sudden_nick_fury.sql`** — Drizzle auto-generated cleanly: 1 `DROP CONSTRAINT` + 2 `ADD COLUMN` + 1 `ADD CONSTRAINT` block. NULL-able columns mean Phase 1 + Phase 2 non-refunded rows pass without backfill. Story-tag comment block added at the top of the SQL file with full state-machine context + rollback hint.
- **Net unit-test count: +25 (BA-stated +12-15; +10 over the upper bound).** Per-test-file breakdown + bonus rationale:
  - **`src/lib/payments/refunds.test.ts`** (NEW): 2 tests — happy + error path. Matches BA AC-12 spec exactly.
  - **`src/lib/refund-policy.test.ts`** (NEW): 7 parameterized cases — boundary at exactly 24h (INELIGIBLE), 24h+1ms (ELIGIBLE), 23h59m59s (INELIGIBLE), past date (INELIGIBLE), far-future (ELIGIBLE) + 2 bonus: `Date` input shape (tests the `string | Date` type-flexibility) + same-day morning of booking (INELIGIBLE — extra coverage of the strict-less-than boundary semantics). BA target was 4-5; shipped 7 with +2 bonus. The parameterized `it.each` table makes the coverage cheap to add.
  - **`src/actions/booking.test.ts`** extension: 6 new tests — Phase 2 PENDING happy / Phase 2 CONFIRMED eligible / Phase 2 CONFIRMED ineligible refusal / Phase 2 CONFIRMED Stripe refund failure / Phase 1 backwards-compat / CANNOT_CANCEL on terminal state. Matches BA AC-12 spec exactly (6 tests).
  - **`src/lib/payments/webhooks.test.ts`** extension: 4 new tests for `handleChargeRefunded` — happy / idempotent / deferred-booking-not-found / **bonus: deferred-missing-charge.payment_intent** (defensive case where Stripe sends `charge.refunded` without a PI; handler returns deferred without calling lookup helper). BA target was 2-3; shipped 4 with +1 bonus.
  - **`src/db/queries/bookings.test.ts`** extension: 6 new parameterized cases across 3 describe blocks (markBookingCancelledAndVoided × 2 + markBookingCancelledAndRefunded × 2 + markBookingCancelledAndRefundedByPaymentIntent × 2). Matches BA AC-12 spec exactly (3 helpers × 2 cases each).
  - Total: 2 + 7 + 6 + 4 + 6 = **25 new**. The +10 over upper bound is concentrated in: +2 refund-policy boundary cases (cheap parameterized rows) + +1 defensive webhook case (catches a Stripe-side malformation that could matter at scale). The 6 action tests + 6 query tests are EXACTLY per BA spec.
- **Net E2E-test count: +0 → 61 target met.** BA Decision §13 locked 0 new; the optional within-24h-refusal regression E2E was NOT shipped (Phase 1 backwards-compat path is already covered by existing US-3.5 tests, and the within-24h refusal is exhaustively unit-tested via the eligibility helper + the action's branching). BA may walk the optional case via DB-direct insert if richer regression confidence is wanted.
- **Route count: 41 unchanged.** Refund work runs entirely on existing routes.
- **PRD §4.5 cancel-interpretation RESOLVED.** The long-standing open question (memorized in `project_phase2_prd_4_5_cancel_interpretation.md` since Story 8-3) is now closed. Phase 1 verbatim "Only pending bookings can be cancelled." message SUPERSEDED by Phase 2 PRD §4.5's explicit enablement of CONFIRMED-cancel. The action's 3-branch logic handles all combinations (Phase 1 NULL-PI / Phase 2 PENDING-AUTHORIZED / Phase 2 CONFIRMED-CAPTURED) + the terminal-state catch-all.
- **9-5 dispatcher extensibility design PROVEN.** The `charge.refunded` handler addition was exactly 1 new function (`handleChargeRefunded`) + 1 new map entry in `WEBHOOK_HANDLERS`. The route shell at `src/app/api/stripe/webhook/route.ts` is UNCHANGED. The `dispatchWebhookEvent` entry is UNCHANGED. The `WebhookHandlerResult` type is UNCHANGED. Story 9-7's `payout.paid` will follow the same shape.
- **No `amount` arg + no `refund_application_fee` flag** on `stripe.refunds.create` — confirmed via the wrapper unit test that asserts the params object equals `{ payment_intent }` exactly (no extra fields). Destination-charge mode auto-reverses the platform_fee_amount on full refunds per Stripe's documented behavior; adding `refund_application_fee: true` would double-reverse and break the math.
- **Idempotency key sharing** (`cancel-${bookingId}` between 9-4's reject path + 9-6's Phase 2 PENDING cancel path) confirmed via unit test (test 1 — the Phase 2 PENDING happy test asserts the key value `cancel-${BOOKING_ID}` matches 9-4's namespace exactly). New `refund-${bookingId}` key for the CONFIRMED-refund branch (test 2).
- **Audit-trail decision honored** — `handleChargeRefunded` follows 9-5's audit-gap-on-retry pattern verbatim. No transactional write-with-rollback. The bookings row's `refunded_at` + `refund_amount_cents` + `payment_status='REFUNDED'` IS the financial audit trail; `webhook_events` is operational. BA Decision §11 RESOLVES the 9-5 forward-flag.
- **2 test-fixture files modified** (`src/lib/availability.test.ts` + `src/lib/bookings.test.ts`) — both gained 2-line additions (`refundedAt: null`, `refundAmountCents: null`) to satisfy the new `Booking` type shape required by the 9-6 schema change. These fixture-file edits were NOT in AC-15's explicit file list but are trivial mechanical fixes; the alternative (refactor every Booking mock to use a factory) is out of scope.
- **Lock context flag check passed.** BA Decisions §2 / §3 / §11 were end-of-shift batch-locks per the BA decisions doc Lock context note. Implementation surfaced NO ambiguity during the dev-story run — the locked specs were precise enough to follow verbatim. Did NOT need to re-engage BA per Task 0's contingency.
- **Phase 1 backwards-compat unchanged.** The existing `cancelBooking(id, guestUserId)` helper is REUSED unchanged on the Phase 1 PENDING branch (no PI ID). Test 5 (Phase 1 backwards-compat) confirms the existing helper is called + Stripe wrappers are NOT.
- **UI surface change is minimal.** `<CancelBookingButton>` gained: (1) `toastError` import; (2) extended `useEffect` to fire `toastError(CANCEL_REFUND_INELIGIBLE.title, .description)` on the new error code; (3) `errorMessage` now filters out `REFUND_INELIGIBLE` so it doesn't double-render inline AND toast; (4) label changed from "Cancel request" to uniform "Cancel booking". `my-bookings/page.tsx` gained one footer-rendering branch for CONFIRMED future-dated bookings. No new components, no new props on the button.
- **AC-15 §6–§13 (full BA browser walk via `stripe listen` + 5 cancel scenarios)** is DEFERRED to BA's review pass per the established precedent. BA needs: (1) `stripe listen` running; (2) `STRIPE_WEBHOOK_SECRET` swapped to CLI value + `pnpm dev` restart; (3) `owner@deskhive.local` Connect row in real (not synthetic) state — re-onboard via `/owner/settings` if seed reset.

### File List

**New (in-tree):**
- `deskhive/drizzle/migrations/0007_sudden_nick_fury.sql` — DROP/ADD CONSTRAINT + 2 ADD COLUMN + story-tag comment block
- `deskhive/drizzle/migrations/meta/0007_snapshot.json` (auto)
- `deskhive/src/lib/refund-policy.ts` — `isRefundEligible` UTC + start-of-day + integer-ms helper
- `deskhive/src/lib/refund-policy.test.ts` — 7 parameterized policy tests
- `deskhive/src/lib/payments/refunds.ts` — `createRefund` Stripe wrapper (5th Theme B sub-module)
- `deskhive/src/lib/payments/refunds.test.ts` — 2 wrapper tests

**Modified (in-tree):**
- `_bmad-output/implementation-artifacts/sprint-status.yaml` — `9-6-cancellation-with-refund: review`; last_updated parenthetical refreshed
- `_bmad-output/implementation-artifacts/9-6-cancellation-with-refund.md` — Status → review, tasks `[x]`, DAR filled in
- `deskhive/drizzle/migrations/meta/_journal.json` (auto)
- `deskhive/src/db/schema.ts` — add `refundedAt` + `refundAmountCents` columns; extend `bookings_payment_status_check` to 5 values (added `REFUNDED`)
- `deskhive/src/db/queries/bookings.ts` — add 3 new helpers: `markBookingCancelledAndVoided`, `markBookingCancelledAndRefunded`, `markBookingCancelledAndRefundedByPaymentIntent`
- `deskhive/src/db/queries/bookings.test.ts` — add 6 parameterized cases for the new helpers
- `deskhive/src/actions/booking.ts` — extend `cancelBookingAction` with 3-branch logic + supersede Phase 1 verbatim message; import the 9-6 helpers; cast `previousStatus` to `BookingStatus`
- `deskhive/src/actions/booking.test.ts` — add 6 cancel-action tests + 9-6 mocks (cancelBooking, markBookingCancelledAndVoided, markBookingCancelledAndRefunded, createRefund, isRefundEligible)
- `deskhive/src/lib/payments/webhooks.ts` — add `handleChargeRefunded` handler + import the by-PI helper + map entry
- `deskhive/src/lib/payments/webhooks.test.ts` — add 4 `handleChargeRefunded` tests + mock for new helper
- `deskhive/src/app/my-bookings/page.tsx` — render `<CancelBookingButton>` on CONFIRMED future-dated bookings (3rd footer branch)
- `deskhive/src/app/my-bookings/cancel-booking-button.tsx` — label "Cancel booking"; `toastError` import + `useEffect` dispatch on `REFUND_INELIGIBLE`; `errorMessage` filters out `REFUND_INELIGIBLE`
- `deskhive/src/lib/toast.ts` — add `CANCEL_REFUND_INELIGIBLE` entry (nested-object shape with `title` + `description`)
- `deskhive/src/lib/availability.test.ts` — fixture: add `refundedAt: null` + `refundAmountCents: null` to mkBooking helper (required by 9-6 type change)
- `deskhive/src/lib/bookings.test.ts` — fixture: add `refundedAt: null` + `refundAmountCents: null` to makeInfo helper

**Out-of-tree (memory):**
- `~/.claude/.../memory/reference_stripe_service_pattern.md` — extended with full Story 9-6 section per AC-14; frontmatter `name` + `description` refreshed
- `~/.claude/.../memory/project_phase2_prd_4_5_cancel_interpretation.md` — flipped to RESOLVED with header pointing to 9-6 BA decisions doc (`f4766f7`); historical body preserved
- `~/.claude/.../memory/MEMORY.md` — index entry for `reference_stripe_service_pattern.md` refreshed; resolution memory entry retitled to reflect closure

### Change Log

| Date | Change | Commit |
|---|---|---|
| 2026-05-19 | Story drafted by `bmad-create-story` from locked BA decisions document (commit `f4766f7`). Lock context flag noted — Decisions §2 / §3 / §11 were end-of-shift batch-locks; dev-agent re-engages BA if ambiguity surfaces during implementation. | `270f540` |
| 2026-05-19 | Story implemented; PRD §4.5 cancel-interpretation RESOLVED via Option (a) in-place extension of `cancelBookingAction`; Phase 1 verbatim message superseded; schema migration `0007_sudden_nick_fury.sql` adds 2 NULL-able columns + extends `bookings_payment_status_check` to 5 values; new sub-module `src/lib/payments/refunds.ts` (5th Theme B sub-module) + new helper `src/lib/refund-policy.ts` (UTC + start-of-day + integer-ms math); 3 new bookings query helpers + 1 new dispatcher map entry (`charge.refunded` — first proof of 9-5 extensibility design); 3 new error codes + 1 new toast (`CANCEL_REFUND_INELIGIBLE`); UI surface extension on `/my-bookings` (cancel button on CONFIRMED future-dated; uniform "Cancel booking" label; `toastError` on `REFUND_INELIGIBLE`); 25 new unit tests (+10 over BA upper bound; bonus rationale documented in Completion Notes — concentrated in parameterized boundary cases for refund-policy + 1 defensive webhook case); 0 new E2E (target 61 unchanged). Memory entry extended; open-question memory flipped to RESOLVED. Single commit per AC-15 — awaiting BA browser walk via `stripe listen` before push. Lock context flag check passed — no ambiguity surfaced during implementation. | _TBD (filled by `docs:` follow-up after BA greenlight + push, same pattern as Stories 9-1 + 9-2 + 9-2b + 9-3 + 9-4 + 9-5)_ |
