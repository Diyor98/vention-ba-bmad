# Story 9-4: Confirm/Reject with Capture/Cancel

Status: ready-for-dev

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a **Space Owner who has received a PENDING booking from a Guest who already authorized payment in Stripe Checkout**,
I want **the existing Confirm button to capture the held payment (settling funds + automatically transferring the owner payout via Stripe Connect minus DeskHive's 15% platform fee) and the existing Reject button to cancel the authorization (releasing the hold on the Guest's card)** —
so that **the Guest's card is either charged (Confirm) or released (Reject) immediately when I act, the booking's payment state in the DB tracks the Stripe state, and Phase 1 bookings without a Payment Intent (legacy seeded rows + any bookings created via the surviving `/api/bookings` REST endpoint) continue to confirm/reject without touching Stripe.**

> Story 9-4 is the **Owner-side capture/cancel half** of the Phase 2 payment flow. Story 9-3 ships the Guest-side authorize half (`paymentIntents.create` with `capture_method: 'manual'` via Stripe Checkout, leaving the PI in `requires_capture` state); 9-4 ships the `paymentIntents.capture` (Confirm) and `paymentIntents.cancel` (Reject) operations that resolve the held authorization.
>
> Source of truth: [docs/design/9-4-confirm-reject-capture-cancel-ba-decisions.md](docs/design/9-4-confirm-reject-capture-cancel-ba-decisions.md) — 15 locked decisions. Locked 2026-05-19 (BA: Ikhtiyor Ziyayev), committed `4f73cf3`.

> **Companion / dependency chain:** Story 9-1 (`feat(stripe): Story 9-1 — Stripe SDK wrapper`, shipped at `aff4060`) + Story 9-2 (`feat(stripe): Story 9-2 — Stripe Connect Express onboarding`, shipped at `0d384e0`) + Story 9-2b (`feat(stripe): Story 9-2b — publish gating`, shipped at `7e7251c` + `2d65c54`) + Story 9-3 (`feat(stripe): Story 9-3 — booking with payment`, shipped at `bd76dc3` + `8035907`). All four are on `main`. 9-4 directly extends 9-3's `payment_status` state machine.

> **After 9-4 ships, the running app behaves like this:** an Owner navigates to `/owner/bookings` → sees a PENDING booking from a Guest who completed Stripe Checkout in 9-3 (booking is in `status='PENDING' + payment_status='AUTHORIZED' + payment_intent_id='pi_...'`) → clicks Confirm → server calls `stripe.paymentIntents.capture(payment_intent_id)` first, then UPDATEs the booking to `status='CONFIRMED' + payment_status='CAPTURED'` only on Stripe success. Funds settle on DeskHive's platform Stripe account; Stripe automatically transfers the payout (booking total minus 15% `application_fee_amount`) to the Owner's connected account. On capture failure (declined re-auth, expired PI, etc.), the booking stays in `PENDING + AUTHORIZED` and the Owner sees an inline error message with Stripe's verbatim description. Reject is the mirror — Stripe `paymentIntents.cancel` with `cancellation_reason: 'requested_by_customer'` first, then `status='REJECTED' + payment_status='VOIDED'` on success. **Phase 1 bookings with `payment_intent_id IS NULL`** (seeded Phase 1 rows + bookings created via the still-active `/api/bookings` REST endpoint) skip the Stripe step entirely — the action runs the Phase 1 `confirmBooking` / `rejectBooking` helper unchanged. This is the explicit Phase 1 admin-workflow-continuity contract.

> **Key anti-patterns to keep in mind:**
> - **No floating-point math** — all money math through `src/lib/money.ts` integer-cents helpers (CC-2 carry-forward).
> - **No Stripe SDK imports outside `src/lib/stripe.ts` and `src/lib/payments/*` sub-modules** (CC-3; Decision §5).
> - **No DB-first-then-Stripe ordering** — Stripe-first-then-DB is locked for both confirm and reject (Decision §2 + §3 load-bearing).
> - **No per-attempt UUID idempotency keys** — per-booking-id (`capture-${bookingId}`, `cancel-${bookingId}`) is locked (Decision §7). Diverges from 9-3's per-attempt UUID for Checkout.
> - **No `paymentIntents.create` or `paymentIntents.retrieve` in the new sub-module** — `create` is already done inside `checkout.sessions.create`; `retrieve` defers to Story 9-5 (Decision §5 + §8).
> - **No new `bookings.status` enum values** — 4-state set (`PENDING / CONFIRMED / REJECTED / CANCELLED`) stays; payment_status modulates alongside.
> - **No widening of the webhook scope** — `payment_intent.succeeded` + `payment_intent.canceled` handlers DEFERRED to Story 9-5 (Decision §8 load-bearing). Zero changes to `src/app/api/stripe/webhook/route.ts` in 9-4.
> - **No UI redesign of `<ConfirmBookingButton>` / `<RejectBookingButton>`** — Phase 1 / Story 5-2 design preserved (Decision §9).
> - **No new `TOAST_COPY` entries** — Phase 1 inline-error pattern preserved (Decision §11).
> - **No automatic recovery of the `payment_intent_id IS NOT NULL` + `payment_status !== 'AUTHORIZED'` edge case** — surfaces as INTERNAL_ERROR for ops cleanup (Decision §6).
> - **No `cancellation_reason: 'fraudulent'` or `'duplicate'`** — `'requested_by_customer'` is hardcoded for Owner-Reject (Decision §3).
> - **No real Stripe API calls from Playwright E2E** for the happy capture/reject paths (Decision §13).

## Acceptance Criteria

> Source: locked BA Decisions document Decisions 1–15.

1. **AC-1 (Drizzle schema: extend `bookings_payment_status_check` constraint to 4 values).** Per BA Decision §1:
   - Edit [src/db/schema.ts](deskhive/src/db/schema.ts) `bookingsTable`'s `bookings_payment_status_check` constraint (locked in 9-3 with `('AWAITING_PAYMENT', 'AUTHORIZED')`):
     ```typescript
     // Before:
     check(
       'bookings_payment_status_check',
       sql`${t.paymentStatus} IN ('AWAITING_PAYMENT', 'AUTHORIZED')`,
     ),
     // After:
     check(
       'bookings_payment_status_check',
       sql`${t.paymentStatus} IN ('AWAITING_PAYMENT', 'AUTHORIZED', 'CAPTURED', 'VOIDED')`,
     ),
     ```
   - Existing Phase 1 NULL rows continue to satisfy the constraint (PG CHECK allows NULL by default). 9-3's existing AWAITING_PAYMENT / AUTHORIZED rows continue to satisfy.
   - Run `pnpm db:generate` to produce migration `deskhive/drizzle/migrations/0006_*.sql`. Inspect the SQL — should be a `DROP CONSTRAINT ... ADD CONSTRAINT ...` block (mirrors `0004_fine_ronan.sql` for `spaces.status` enum extension). No data changes.
   - Add a story-tag comment block at the top of `0006_*.sql` matching the `0005_soft_wither.sql` convention. Cover: the two new values, the state-machine transitions they unlock (`AUTHORIZED → CAPTURED` for confirm, `AUTHORIZED → VOIDED` for reject), and the rollback hint (`DROP CONSTRAINT` + `ADD CONSTRAINT` with the 9-3 two-value set; safe iff no rows are in CAPTURED or VOIDED state at rollback time).
   - **Anti-pattern enforced:** do NOT change the existing AWAITING_PAYMENT / AUTHORIZED values (load-bearing for 9-3). Do NOT add a `payment_status_history` audit table (out of Phase 2 scope).

2. **AC-2 (`VOIDED` naming, not `CANCELLED`).** Per BA Decision §1 naming sub-decision:
   - The new payment_status value for the reject path is **`VOIDED`** (NOT `'CANCELLED'`, NOT `'REJECTED'`).
   - Aligns with Stripe's "release the authorization hold" semantics; avoids confusion with booking-side `status='CANCELLED'` (which is Guest-initiated in 9-6 territory) and booking-side `status='REJECTED'` (semantically distinct — the reject is the owner's choice, not a bank decline).
   - Leaves `'CANCELLED'` available for Story 9-6 if Guest-side cancellation ends up needing a payment_status (TBD per Story 9-6's decisions).

3. **AC-3 (New sub-module `src/lib/payments/payment-intents.ts`).** Per BA Decision §5:
   - Create new sub-module [src/lib/payments/payment-intents.ts](deskhive/src/lib/payments/payment-intents.ts) following the same pattern as 9-2's `connect.ts` + 9-3's `checkout.ts`. Two exports:
     ```typescript
     export async function capturePaymentIntent(args: {
       paymentIntentId: string;
       idempotencyKey: string;
     }): Promise<StripeServiceResult<{ paymentIntentId: string; status: string }>>;

     export async function cancelPaymentIntent(args: {
       paymentIntentId: string;
       idempotencyKey: string;
     }): Promise<StripeServiceResult<{ paymentIntentId: string; status: string }>>;
     ```
   - Internal Stripe API calls:
     - `capturePaymentIntent` → `stripe.paymentIntents.capture(args.paymentIntentId, undefined, { idempotencyKey: args.idempotencyKey })`. Wraps the result as `{ ok: true, data: { paymentIntentId, status } }`.
     - `cancelPaymentIntent` → `stripe.paymentIntents.cancel(args.paymentIntentId, { cancellation_reason: 'requested_by_customer' }, { idempotencyKey: args.idempotencyKey })`. Same wrap shape. `cancellation_reason` hardcoded per Decision §3.
   - Error mapping: `Stripe.errors.StripeError` → `{ ok: false, error: err.message }` (Stripe's messages are end-user-readable in test mode). Other errors → `{ ok: false, error: 'Unexpected error' }` + `console.error` for ops visibility. Mirror 9-2's + 9-3's `mapStripeError` helper.
   - **Anti-pattern enforced:** do NOT call `stripe.paymentIntents.*` from anywhere outside this sub-module (singleton-import discipline from 9-1). Do NOT add `paymentIntents.create` here (already done inside `checkout.sessions.create`). Do NOT add `paymentIntents.retrieve` (defer to Story 9-5).

4. **AC-4 (`confirmBookingAction` extension with Stripe-first-then-DB ordering + PI-id branching).** Per BA Decision §2 + §6:
   - Edit [src/actions/booking.ts](deskhive/src/actions/booking.ts) `confirmBookingAction`. Preserve ALL Phase 1 pre-checks unchanged (auth + role gate + owner-scope check + `status === 'PENDING'`). Add the new logic BETWEEN the pre-checks and the DB UPDATE:
     ```typescript
     // After Phase 1 pre-checks pass:
     const isPaymentBooking =
       booking.paymentIntentId !== null &&
       booking.paymentStatus === 'AUTHORIZED';

     if (isPaymentBooking) {
       // Phase 2 path: capture Stripe FIRST, then DB UPDATE.
       const captureResult = await capturePaymentIntent({
         paymentIntentId: booking.paymentIntentId!,
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
       // Stripe succeeded — now DB UPDATE.
       const updated = await markBookingConfirmedAndCaptured(bookingId);
       if (!updated) {
         // Conditional WHERE no-op — booking moved out of (PENDING, AUTHORIZED)
         // between the pre-check and the UPDATE (concurrent Guest cancel or
         // future 9-5 webhook race). Stripe has already captured the funds;
         // surface CANNOT_CONFIRM (Phase 1 carry-forward) for the Owner.
         return {
           status: 'error',
           code: 'CANNOT_CONFIRM',
           message: 'Only pending bookings can be confirmed.',
         };
       }
     } else if (booking.paymentIntentId === null) {
       // Phase 1 path: no Stripe involvement; use existing confirmBooking helper.
       const updated = await confirmBooking(bookingId);
       if (!updated) {
         // Race against concurrent Guest cancel; Phase 1 behavior preserved.
         return {
           status: 'error',
           code: 'CANNOT_CONFIRM',
           message: 'Only pending bookings can be confirmed.',
         };
       }
     } else {
       // Edge case: paymentIntentId set but paymentStatus !== 'AUTHORIZED'.
       // Shouldn't happen under normal flow — Decision §6 surfaces INTERNAL_ERROR.
       logger.error('confirm_booking_action_unexpected_payment_state', {
         bookingId,
         paymentIntentId: booking.paymentIntentId,
         paymentStatus: booking.paymentStatus,
       });
       return {
         status: 'error',
         code: 'INTERNAL_ERROR',
         message: 'Something went wrong. Please try again.',
       };
     }
     ```
   - The post-success path (revalidatePath calls + `notifyBookingConfirmed` fire-and-forget) stays identical to Phase 1 — fire AFTER the conditional UPDATE succeeds, regardless of which branch ran.
   - The action's role check + owner-scope check + `status === 'PENDING'` pre-check + 401 redirect handling are NOT changed.
   - **Anti-pattern enforced:** do NOT do the DB UPDATE before the Stripe call (Stripe-first is locked). Do NOT widen the role check beyond SUPER_ADMIN | SPACE_OWNER (Phase 1 gate stays). Do NOT add new self-action skip logic — the existing `notifyBookingConfirmed(bookingId, callerId)` already handles owner-confirms-own-booking via Story 8-3's self-action skip rule.

5. **AC-5 (`rejectBookingAction` extension — mirror shape with `cancelPaymentIntent`).** Per BA Decision §3 + §6:
   - Mirror AC-4 in [src/actions/booking.ts](deskhive/src/actions/booking.ts) `rejectBookingAction`:
     - Same `isPaymentBooking` branch.
     - On Phase 2 path: call `cancelPaymentIntent({ paymentIntentId, idempotencyKey: \`cancel-${bookingId}\` })` BEFORE the DB UPDATE. On success, run `markBookingRejectedAndVoided(bookingId)`. On failure, return `STRIPE_CANCEL_FAILED` with Stripe's verbatim error message.
     - On Phase 1 path: use the existing `rejectBooking` helper unchanged.
     - On edge case: same INTERNAL_ERROR surface as confirm.
   - `cancellation_reason` is hardcoded inside `cancelPaymentIntent` to `'requested_by_customer'` (Decision §3 + AC-3).
   - The post-success path (revalidatePath calls + `notifyBookingRejected` fire-and-forget) stays identical to Phase 1.
   - **Anti-pattern enforced:** same as AC-4.

6. **AC-6 (New `bookings` query helpers: `markBookingConfirmedAndCaptured` + `markBookingRejectedAndVoided`).** Per BA Decision §2:
   - Edit [src/db/queries/bookings.ts](deskhive/src/db/queries/bookings.ts). Add two new helpers paralleling 9-3's `markBookingAuthorized`:
     ```typescript
     export async function markBookingConfirmedAndCaptured(
       id: string,
     ): Promise<Booking | undefined> {
       const [row] = await db
         .update(bookingsTable)
         .set({
           status: 'CONFIRMED',
           paymentStatus: 'CAPTURED',
           updatedAt: new Date(),
         })
         .where(
           and(
             eq(bookingsTable.id, id),
             eq(bookingsTable.status, 'PENDING'),
             eq(bookingsTable.paymentStatus, 'AUTHORIZED'),
           ),
         )
         .returning();
       return row;
     }

     export async function markBookingRejectedAndVoided(
       id: string,
     ): Promise<Booking | undefined> {
       const [row] = await db
         .update(bookingsTable)
         .set({
           status: 'REJECTED',
           paymentStatus: 'VOIDED',
           updatedAt: new Date(),
         })
         .where(
           and(
             eq(bookingsTable.id, id),
             eq(bookingsTable.status, 'PENDING'),
             eq(bookingsTable.paymentStatus, 'AUTHORIZED'),
           ),
         )
         .returning();
       return row;
     }
     ```
   - The conditional WHERE on `(status='PENDING', payment_status='AUTHORIZED')` is the race-safety net: a concurrent Guest cancel (Phase 1's `cancelBookingAction`) OR a 9-5 webhook backstop arriving first OR a duplicate retry will leave the row in some state other than `(PENDING, AUTHORIZED)`, and `.returning()` will be empty. Caller (AC-4 / AC-5) detects the empty return and surfaces `CANNOT_CONFIRM` / `CANNOT_REJECT` — Phase 1 error-code carry-forward.
   - **Anti-pattern enforced:** do NOT skip the conditional WHERE — concurrent Guest-side cancel (Story 9-6) needs the race-safety net.

7. **AC-7 (Phase 1 backwards-compat — `payment_intent_id IS NULL` skips Stripe).** Per BA Decision §6:
   - The branching logic in AC-4 / AC-5 routes Phase 1 bookings (where `payment_intent_id IS NULL`) through the existing `confirmBooking` / `rejectBooking` helpers, bypassing Stripe entirely.
   - This preserves admin-side workflow continuity for: (a) Phase 1 seeded bookings still in PENDING state; (b) bookings created via the still-active `/api/bookings` REST endpoint (which doesn't go through `createBookingWithPaymentAction` and therefore doesn't get a `payment_intent_id`).
   - The edge case `(payment_intent_id IS NOT NULL AND payment_status !== 'AUTHORIZED')` surfaces as INTERNAL_ERROR with an ops-friendly `logger.error` line (AC-4 / AC-5). Manual cleanup is the documented recovery path; automatic recovery would invite Stripe API errors on already-mutated PIs.
   - **Anti-pattern enforced:** do NOT branch on `booking.status` alone (`status === 'PENDING'` is true for both Phase 1 and Phase 2 bookings; the `payment_intent_id` check is the load-bearing discriminator). Do NOT attempt automatic recovery on the edge case.

8. **AC-8 (Per-booking-id idempotency keys).** Per BA Decision §7:
   - `capturePaymentIntent` called with `idempotencyKey: \`capture-${bookingId}\``.
   - `cancelPaymentIntent` called with `idempotencyKey: \`cancel-${bookingId}\``.
   - Distinct from 9-3's per-attempt UUID for Checkout (`checkout-${randomUUID()}`) and 9-2's per-user key for Connect-create (`connect-create-${userId}`). Namespaces never collide.
   - Why per-booking-id (not per-attempt UUID): the operation is bounded to one Payment Intent. Owner double-clicks Confirm → Stripe's 24h idempotency cache returns the same `succeeded` PI state. Owner retries Confirm after a network blip → second request reuses the same key → Stripe returns the cached successful capture → action proceeds to DB UPDATE (which is also idempotent via the conditional WHERE).
   - **Anti-pattern enforced:** do NOT use per-attempt UUIDs (would defeat the idempotency contract on retries). Do NOT collide namespaces with `checkout-` / `connect-create-`.

9. **AC-9 (Error code expansions on action states).** Per BA Decision §10:
   - Edit [src/actions/booking.ts](deskhive/src/actions/booking.ts):
     ```typescript
     // ConfirmBookingActionState — append (between CANNOT_CONFIRM and INTERNAL_ERROR):
       | { status: 'error'; code: 'STRIPE_CAPTURE_FAILED'; message: string };

     // RejectBookingActionState — append (between CANNOT_REJECT and INTERNAL_ERROR):
       | { status: 'error'; code: 'STRIPE_CANCEL_FAILED'; message: string };
     ```
   - `message` carries the Stripe error string verbatim (Stripe's errors are end-user-friendly in test mode).
   - Two distinct codes (not one shared `STRIPE_ERROR`) so the caller can branch on confirm vs reject context without inspecting the message, and so unit tests have a typed assertion target.
   - **Anti-pattern enforced:** do NOT collapse into a shared `STRIPE_ERROR`. Do NOT use these codes for non-Stripe errors (INTERNAL_ERROR is the catch-all).

10. **AC-10 (Zero UI changes + inline-error-only for Stripe-failed visibility).** Per BA Decision §9 + §11:
    - Both [src/app/admin/bookings/confirm-booking-button.tsx](deskhive/src/app/admin/bookings/confirm-booking-button.tsx) and [src/app/admin/bookings/reject-booking-button.tsx](deskhive/src/app/admin/bookings/reject-booking-button.tsx) get ZERO file changes. The existing `useActionState` form + inline `state.message` render path surfaces the new `STRIPE_CAPTURE_FAILED` / `STRIPE_CANCEL_FAILED` codes via `state.message` (the Stripe error string) — no code change required at the button layer.
    - The "Confirming…" / "Rejecting…" pending-state copy from `useFormStatus` already covers the 1–3 second Stripe round-trip in test mode. No spinner change.
    - The button components stay consumed by BOTH [src/app/admin/bookings/bookings-table.tsx](deskhive/src/app/admin/bookings/bookings-table.tsx) (admin) AND [src/app/(owner)/owner/bookings/owner-bookings-table.tsx](deskhive/src/app/(owner)/owner/bookings/owner-bookings-table.tsx) (Story 7-5 owner mirror — same imports). Single source of truth.
    - **No new `TOAST_COPY` entries** in [src/lib/toast.ts](deskhive/src/lib/toast.ts). Phase 1 inline-error pattern preserved.
    - **Anti-pattern enforced:** do NOT rewrite the buttons as toast-based. Do NOT add real-time payment_status polling.

11. **AC-11 (Unit tests — ~10 new across action + wrapper).** Per BA Decision §12:
    - **`src/lib/payments/payment-intents.test.ts`** (NEW — 4 tests):
      1. `capturePaymentIntent` happy path — Stripe SDK called with correct args + idempotency key; result wrapped as `StripeServiceResult<{ paymentIntentId, status }>`.
      2. `capturePaymentIntent` error path — Stripe throws `StripeError` → `{ ok: false, error: <message> }`.
      3. `cancelPaymentIntent` happy path — same shape, verifies `cancellation_reason: 'requested_by_customer'` is passed in args.
      4. `cancelPaymentIntent` error path.
    - **`src/actions/booking.test.ts`** (NEW or extension — 5 tests for the new branches in confirm + reject):
      1. **Confirm happy path (Phase 2)** — booking with `paymentIntentId` set + `paymentStatus='AUTHORIZED'` → action calls `capturePaymentIntent` → `markBookingConfirmedAndCaptured` → state success. Asserts Stripe wrapper called with `capture-${bookingId}` key.
      2. **Confirm Phase 1 backwards-compat** — booking with `paymentIntentId IS NULL` → action skips Stripe → uses existing `confirmBooking` helper unchanged. Asserts `capturePaymentIntent` NOT called.
      3. **Confirm STRIPE_CAPTURE_FAILED** — Stripe wrapper returns `{ ok: false, error: '...' }` → action returns `STRIPE_CAPTURE_FAILED` with Stripe's message; booking stays in PENDING + AUTHORIZED (no DB write).
      4. **Reject happy path (Phase 2)** — mirrors confirm happy path with `cancelPaymentIntent` + `markBookingRejectedAndVoided`. Asserts `cancel-${bookingId}` key.
      5. **Reject Phase 1 backwards-compat** — mirrors confirm Phase 1 backwards-compat.
    - **`src/db/queries/bookings.test.ts`** (NEW or extension — 1 test):
      1. `markBookingConfirmedAndCaptured` conditional-WHERE no-op — running on a row already in CONFIRMED state returns `undefined` (race-safe). One test covers both new helpers' shared shape; dev-agent may split into 2 tests at discretion.
    - **Target unit-test count after this story:** 346 (baseline at end of Story 9-3) + 10 = **356**. Dev-agent may ship +1-3 bonus per the 9-1 / 9-2 / 9-2b / 9-3 +N-bonus pattern; document any divergence in DAR.
    - **Mock pattern reminder:** split-by-mock-boundary (memorized from 9-2 / 9-3). Action tests mock `@/lib/payments/payment-intents`; wrapper tests mock `@/lib/stripe`. Do NOT cross the mock boundary.
    - **Anti-pattern enforced:** do NOT write integration tests that hit the real Stripe API in unit tests.

12. **AC-12 (E2E test — 1 new Phase 1 backwards-compat regression).** Per BA Decision §13 (locked option (i)):
    - Create [tests/e2e/confirm-booking-phase1-backcompat.spec.ts](deskhive/tests/e2e/confirm-booking-phase1-backcompat.spec.ts) (or another path that fits the existing E2E folder convention — dev-agent picks). 1 new test:
      1. **Phase 1 backwards-compat confirm:** seed/create a booking with `paymentIntentId IS NULL` + `paymentStatus IS NULL` + `status='PENDING'` (use the `createPendingBookingViaDb` helper from [tests/fixtures/seed-helpers.ts](deskhive/tests/fixtures/seed-helpers.ts) — that helper already creates Phase 1-shape rows). Sign in as admin OR space-owner via `authenticatedPage()`. Navigate to the relevant bookings table (`/admin/bookings` or `/owner/bookings`). Click Confirm on the row. Assert: booking row transitions to `status='CONFIRMED'`; `payment_status` stays NULL (no Stripe call happened); no error toast or inline error surfaces.
    - **Rationale (per Decision §13 lock):** Decision §6 introduces a runtime branch that unit tests can mock but can't prove production short-circuit behavior end-to-end. This regression test provides lockdown on the Phase 1 admin-workflow-continuity contract — if a future refactor accidentally calls `capturePaymentIntent` on a NULL-PI row, this test catches it before BA walk.
    - Dev-agent picks confirm vs reject for the single test, OR splits into 2 mirror tests if they fall out naturally (total target then 62 instead of 61). Both confirm and reject share the same branching logic from Decision §6, so 1 test is sufficient; 2 is acceptable if it doesn't grow maintenance cost meaningfully.
    - **Target E2E count after this story:** 60 (baseline at end of 9-3) + 1 = **61** (or 62 if dev-agent splits).
    - **Anti-pattern enforced:** do NOT call real Stripe API from E2E for the happy Phase 2 path (flakiness + cost not justified for 9-4). Do NOT enter Stripe Checkout UI from E2E. Do NOT mock `paymentIntents.capture` / `cancel` at the dev-server layer via env-var stubs (out of 9-4's scope).

13. **AC-13 (Memory file extension).** Per BA Decision §14:
    - Extend out-of-tree `~/.claude/.../memory/reference_stripe_service_pattern.md` with a new section "Story 9-4 additions — Confirm/Reject with Capture/Cancel" covering:
      - Sub-module pattern: `src/lib/payments/payment-intents.ts` as the third example after 9-2's `connect.ts` + 9-3's `checkout.ts`.
      - Stripe-first-then-DB ordering — the inverse of 9-3's pre-claim model. Rationale: no slot-claim race on Owner-side confirm/reject (single-tenant); DB-rollback-on-Stripe-fail is the bad alternative.
      - `payment_status` CHECK constraint extension to 4 values — third instance of the DROP/ADD pattern (after 9-2b's `spaces.status` and 9-3's initial constraint).
      - `VOIDED` naming choice — distinct from booking-side `CANCELLED` to avoid sub-system confusion.
      - Per-booking-id idempotency keys (`capture-${bookingId}` + `cancel-${bookingId}`) — distinct from 9-3's per-attempt UUID. Pattern: per-resource keys when the operation is bounded; per-attempt keys when retries should produce distinct attempts.
      - Phase 1 backwards-compat branch (`paymentIntentId IS NULL` → skip Stripe) — pattern for any future story extending a Phase 1 action.
      - `cancellation_reason: 'requested_by_customer'` hardcoded with rationale.
      - Inline-error display preserved (no new toast strings).
      - Webhook handler deferral to 9-5 — accepted ops risk for the narrow Stripe-succeeds-but-DB-fails window.
      - Forward-looking note: Story 9-6 adds REFUNDED state + Guest-cancel-with-refund flow. The PRD §4.5 cancel-interpretation question becomes load-bearing for 9-6.
    - Update `~/.claude/.../memory/MEMORY.md` index entry's one-liner.
    - **No new memory file** — extend the existing reference.

14. **AC-14 (`git diff` scope — bounded per Decision §15).**
    - All changes confined to:
      - `deskhive/src/db/schema.ts` — extend `bookings_payment_status_check` to 4 values
      - `deskhive/drizzle/migrations/0006_*.sql` (new, auto-generated + story-tag comment)
      - `deskhive/drizzle/migrations/meta/0006_snapshot.json` + `_journal.json` (auto)
      - `deskhive/src/lib/payments/payment-intents.ts` (new) — `capturePaymentIntent` + `cancelPaymentIntent`
      - `deskhive/src/lib/payments/payment-intents.test.ts` (new) — 4 unit tests
      - `deskhive/src/db/queries/bookings.ts` — `markBookingConfirmedAndCaptured` + `markBookingRejectedAndVoided`
      - `deskhive/src/db/queries/bookings.test.ts` (new or extension) — 1 unit test
      - `deskhive/src/actions/booking.ts` — extend `confirmBookingAction` + `rejectBookingAction` with the new branching logic
      - `deskhive/src/actions/booking.test.ts` (new or extension) — 5 unit tests
      - `deskhive/tests/e2e/confirm-booking-phase1-backcompat.spec.ts` (new — 1 E2E test; dev-agent picks final path if folder convention differs)
      - `_bmad-output/implementation-artifacts/sprint-status.yaml`
      - `_bmad-output/implementation-artifacts/9-4-confirm-reject-capture-cancel.md` (this file)
      - Memory files in `~/.claude/.../memory/` (out-of-tree)
    - **Zero changes to:**
      - `deskhive/src/lib/stripe.ts` (Story 9-1's singleton)
      - `deskhive/src/lib/stripe-service.ts` (Story 9-1's barrel)
      - `deskhive/src/lib/payments/connect.ts` (Story 9-2's wrappers)
      - `deskhive/src/lib/payments/checkout.ts` (Story 9-3's wrappers)
      - `deskhive/src/lib/email*` / `deskhive/src/lib/email-templates/`
      - `deskhive/src/app/(owner)/owner/settings/*` (Story 9-2's UI)
      - `deskhive/src/app/(owner)/owner/spaces/*` (Story 9-2b's UI)
      - `deskhive/src/app/spaces/[id]/booking/return/page.tsx` (Story 9-3's return handler)
      - `deskhive/src/app/api/stripe/webhook/route.ts` — Decision §8 confirmed zero changes; `payment_intent.succeeded` + `payment_intent.canceled` handlers deferred to Story 9-5
      - `deskhive/src/lib/toast.ts` — Phase 1 inline-error pattern preserved (Decision §9 + §11)
      - `deskhive/src/app/admin/bookings/confirm-booking-button.tsx` — Phase 1 / Story 5-2 design preserved (Decision §9)
      - `deskhive/src/app/admin/bookings/reject-booking-button.tsx` — same
      - `deskhive/src/app/admin/bookings/bookings-table.tsx` — table consumes the unchanged buttons
      - `deskhive/src/app/(owner)/owner/bookings/owner-bookings-table.tsx` — same
      - `deskhive/scripts/seed.ts` — no new seed users; the 9-3 BA-walk's PENDING + AUTHORIZED booking is the canonical 9-4 walk target

15. **AC-15 (Single commit + memory + docs follow-up after BA greenlight).** Per the Story 5-1 → 9-3 established pattern:
    - All Story 9-4 changes land in a single commit on `main` titled `feat(stripe): Story 9-4 — confirm/reject with capture/cancel`. (Matches the `feat(stripe):` scope from 9-1 + 9-2 + 9-2b + 9-3.)
    - A small follow-up `docs:` commit fills in the Change Log hash + records BA greenlight + flips sprint-status from `review` → `done` after push (same pattern as 9-1 / 9-2 / 9-2b / 9-3).
    - Memory entry lives in `~/.claude/.../memory/` (out-of-tree, NOT staged).
    - **BA browser walk (stop bar):**
      1. All unit tests pass — target **356** (346 baseline + 10 new). Document any divergence (+N bonus) in DAR.
      2. All E2E tests pass — target **61** (60 baseline + 1 new). Restart `pnpm dev` first + re-run `pnpm db:seed`. Pre-existing 5 hazards may still surface — flag if anything new joins them.
      3. `pnpm typecheck` + `pnpm lint` clean.
      4. `pnpm build` — **41 routes unchanged** (zero new routes; capture/cancel runs on existing `/admin/bookings` + `/owner/bookings` paths).
      5. `git diff --stat` matches AC-14. Zero entries in `src/lib/stripe*`, `src/lib/payments/connect.ts`, `src/lib/payments/checkout.ts`, the booking-buttons + tables, the Stripe webhook route, email infrastructure, the Stripe sub-modules that aren't `payment-intents.ts`, or `scripts/seed.ts`.
      6. **Happy capture path (real walk):** sign in as `owner@deskhive.local` → navigate to `/owner/bookings` → find the BA-walk artifact booking `92bd9829-92ed-4360-b317-367122ffbe0e` (the 9-3-walk PENDING + AUTHORIZED row with real PI `pi_3TYWSJRvIpZbtPbe1cXXP5hT`). If that row has been cleaned up since 9-3 ship, the BA needs to create a fresh AUTHORIZED booking via the 9-3 Stripe Checkout flow first. Click Confirm. Verify: row transitions to `status='CONFIRMED' + payment_status='CAPTURED'` in DB; Stripe dashboard shows the Payment Intent in `succeeded` state with the platform's `application_fee_amount` recorded and the connected account's payout (booking total minus 15%) reflected.
      7. **Happy reject path (real walk):** create a fresh PENDING + AUTHORIZED booking via the 9-3 flow → click Reject. Verify: row transitions to `status='REJECTED' + payment_status='VOIDED'`; Stripe dashboard shows the PI in `canceled` state with `cancellation_reason: requested_by_customer`.
      8. **Phase 1 backwards-compat regression (real walk):** seed-side or DB-direct insert a Phase 1-shape booking (`payment_intent_id IS NULL`, `payment_status IS NULL`, `status='PENDING'`). Click Confirm. Verify: row goes to CONFIRMED with `payment_status` still NULL; no Stripe API calls fired (check Stripe dashboard's "no recent activity"). This is the same scenario AC-12 covers automatically; BA-walk is belt-and-suspenders.
      9. **Capture failure path (optional):** simulate a Stripe-side capture failure (e.g., manually cancel the PI via Stripe dashboard BEFORE clicking Confirm). Click Confirm in the app. Verify: inline error message surfaces with Stripe's verbatim error string; booking stays in PENDING + AUTHORIZED.
      10. **Operator prereq from Decision §15:** verify the `owner@deskhive.local` Connect account is the REAL test-mode account (e.g., `acct_1TXqOpRpNLekzL0p` from the 9-3 walk), not the synthetic `acct_seed_for_e2e_only`. Capture only settles funds to a real connected account.

## Tasks / Subtasks

- [ ] **Task 0 — Prep + 9-3 audit + operator state check.**
  - Verify baseline CI clean: `pnpm typecheck` / `lint` / `test` (346 expected) / `build` (41 routes expected) / `test:e2e` (60 expected, modulo the documented hazards).
  - Confirm Story 9-3 + its BA-walk fix are at `done` on `main` (`git log --oneline` shows `bd76dc3` + `8035907` + `9401ad4`).
  - Re-read [docs/design/9-4-confirm-reject-capture-cancel-ba-decisions.md](docs/design/9-4-confirm-reject-capture-cancel-ba-decisions.md) end-to-end.
  - Inspect [src/actions/booking.ts](deskhive/src/actions/booking.ts) — the file's header comment already flags 9-4 as the extension story. Re-read `confirmBookingAction` + `rejectBookingAction` for the exact pre-check sequence that needs preservation.
  - Inspect [src/lib/payments/connect.ts](deskhive/src/lib/payments/connect.ts) + [src/lib/payments/checkout.ts](deskhive/src/lib/payments/checkout.ts) to confirm the sub-module pattern + `mapStripeError` helper shape that `payment-intents.ts` will mirror.
  - Inspect [src/db/queries/bookings.ts](deskhive/src/db/queries/bookings.ts) — read 9-3's `markBookingAuthorized` (lines ~177–215) as the template for `markBookingConfirmedAndCaptured` + `markBookingRejectedAndVoided`.
  - Verify the BA-walk artifact booking `92bd9829-92ed-4360-b317-367122ffbe0e` is still in the DB (`SELECT id, status, payment_status, payment_intent_id FROM bookings WHERE id = '92bd9829-...';`). If gone, dev-agent creates a fresh PENDING + AUTHORIZED booking via the 9-3 flow during prep.
  - Confirm `owner@deskhive.local`'s real Stripe Connect account ID is still in the DB (the 9-3 BA walk created `acct_1TXqOpRpNLekzL0p` or similar). If the seed has reset it to `acct_seed_for_e2e_only`, run `pnpm db:seed` and confirm the BA-walk Stripe state is preserved before AC-15 §6 / §7 walks.

- [ ] **Task 1 — Schema + migration** (AC-1 + AC-2):
  - Edit [src/db/schema.ts](deskhive/src/db/schema.ts) `bookings_payment_status_check` constraint to include `'CAPTURED'` and `'VOIDED'`.
  - Run `pnpm db:generate` → produces `drizzle/migrations/0006_<random_name>.sql`.
  - Inspect the generated SQL: should be a `DROP CONSTRAINT ... ADD CONSTRAINT ...` block, no data changes.
  - Add the story-tag comment block at the top of `0006_*.sql` matching the `0005_soft_wither.sql` convention. Cover the two new values + state-machine transitions + rollback hint.
  - Apply locally: `pnpm db:migrate`.

- [ ] **Task 2 — Stripe Payment-Intent sub-module** (AC-3):
  - Create [src/lib/payments/payment-intents.ts](deskhive/src/lib/payments/payment-intents.ts) with `capturePaymentIntent` + `cancelPaymentIntent` per the locked signatures.
  - Internal `mapStripeError` helper mirrors 9-2's + 9-3's shape.
  - `cancellation_reason: 'requested_by_customer'` hardcoded inside `cancelPaymentIntent`.

- [ ] **Task 3 — New `bookings` query helpers** (AC-6):
  - Edit [src/db/queries/bookings.ts](deskhive/src/db/queries/bookings.ts). Add `markBookingConfirmedAndCaptured` + `markBookingRejectedAndVoided` with the conditional WHERE on `(status='PENDING', payment_status='AUTHORIZED')`.

- [ ] **Task 4 — Extend `confirmBookingAction`** (AC-4 + AC-7 + AC-8 + AC-9):
  - Edit [src/actions/booking.ts](deskhive/src/actions/booking.ts). Add the branching logic (Phase 2 / Phase 1 / edge case) between the existing pre-checks and the DB UPDATE.
  - Append `STRIPE_CAPTURE_FAILED` to `ConfirmBookingActionState`.
  - Use `capture-${bookingId}` idempotency key.
  - Preserve all post-success path (revalidatePath + notifyBookingConfirmed).

- [ ] **Task 5 — Extend `rejectBookingAction`** (AC-5 + AC-7 + AC-8 + AC-9):
  - Same shape as Task 4 with `cancelPaymentIntent` + `markBookingRejectedAndVoided` + `STRIPE_CANCEL_FAILED` + `cancel-${bookingId}` key.

- [ ] **Task 6 — Verify zero changes to Confirm/Reject Client Components + tables + webhook + toast** (AC-10):
  - Grep to verify [src/app/admin/bookings/confirm-booking-button.tsx](deskhive/src/app/admin/bookings/confirm-booking-button.tsx), [src/app/admin/bookings/reject-booking-button.tsx](deskhive/src/app/admin/bookings/reject-booking-button.tsx), [src/app/admin/bookings/bookings-table.tsx](deskhive/src/app/admin/bookings/bookings-table.tsx), [src/app/(owner)/owner/bookings/owner-bookings-table.tsx](deskhive/src/app/(owner)/owner/bookings/owner-bookings-table.tsx), [src/app/api/stripe/webhook/route.ts](deskhive/src/app/api/stripe/webhook/route.ts), and [src/lib/toast.ts](deskhive/src/lib/toast.ts) remain untouched.

- [ ] **Task 7 — Unit tests** (AC-11):
  - Create [src/lib/payments/payment-intents.test.ts](deskhive/src/lib/payments/payment-intents.test.ts) with the 4 wrapper tests.
  - Create or extend [src/actions/booking.test.ts](deskhive/src/actions/booking.test.ts) with the 5 action tests. Mock pattern: `vi.mock('@/lib/payments/payment-intents')` for the action tests; the wrapper tests mock `@/lib/stripe`.
  - Create or extend [src/db/queries/bookings.test.ts](deskhive/src/db/queries/bookings.test.ts) with the 1 helper test.
  - Run `pnpm test` → target 356.

- [ ] **Task 8 — E2E test for Phase 1 backwards-compat** (AC-12):
  - Create [tests/e2e/confirm-booking-phase1-backcompat.spec.ts](deskhive/tests/e2e/confirm-booking-phase1-backcompat.spec.ts) (or path that fits the convention). Use `createPendingBookingViaDb` from [tests/fixtures/seed-helpers.ts](deskhive/tests/fixtures/seed-helpers.ts) for the Phase 1-shape booking.
  - Run isolated: `pnpm test:e2e tests/e2e/confirm-booking-phase1-backcompat.spec.ts` → 1/1 green.

- [ ] **Task 9 — Local CI parity** (AC-15):
  - `pnpm typecheck` clean.
  - `pnpm lint` clean.
  - `pnpm test` — 356 expected.
  - `pnpm build` — 41 routes unchanged.
  - `pnpm test:e2e` — 61 expected (modulo the documented hazards from prior stories).

- [ ] **Task 10 — `git diff` verification + manual smoke test** (AC-14 + AC-15):
  - `git diff --stat` matches AC-14 file list. Zero entries in the carved-out files (Stripe singleton, the other two payments sub-modules, the booking buttons + tables, the webhook route, email infrastructure, toast.ts, seed.ts).
  - Quick smoke test: `pnpm dev` running, sign in as `owner@deskhive.local`, navigate to `/owner/bookings`. If the 9-3 BA-walk row is still present, click Confirm and verify the dev log shows the `capture` call + the DB row moves to CONFIRMED + CAPTURED. Phase 1 backwards-compat smoke: insert a Phase-1-shape booking (paymentIntentId NULL) via SQL and confirm the Confirm button still works without firing Stripe.
  - **AC-15 §6–§10 (full BA browser walk including the real Stripe capture/cancel + Phase 1 backwards-compat + optional capture-failure walks)** is DEFERRED to BA's review pass per the precedent.

- [ ] **Task 11 — Memory + sprint-status + Dev Agent Record + single commit (no push)** (AC-13 + AC-15):
  - Extend `~/.claude/.../memory/reference_stripe_service_pattern.md` with the Story 9-4 section per AC-13.
  - Update `~/.claude/.../memory/MEMORY.md` index entry's one-liner.
  - Update `_bmad-output/implementation-artifacts/sprint-status.yaml`: `9-4-confirm-reject-capture-cancel: review`; update `last_updated` parenthetical.
  - Update this story file: `Status: ready-for-dev` → `Status: review`; mark Tasks 0–10 `[x]` (Task 10's BA-walk DEFERRED note stays); fill in Dev Agent Record.
  - Stage all files per AC-14.
  - Commit: `feat(stripe): Story 9-4 — confirm/reject with capture/cancel`.
  - **Do NOT push.** Wait for BA browser-verification per Task 10 + AC-15 §6–§10 before pushing.
  - After BA greenlight: push, then add a small `docs:` follow-up commit to flip sprint-status to `done` (same pattern as 9-1 / 9-2 / 9-2b / 9-3).

## Dev Notes

### What gets built and what's deliberately out of scope

Story 9-4 is the Owner-side resolution of the held Payment Intent from Story 9-3. It's intentionally narrow: extend two existing Phase 1 Server Actions with a Stripe call, add a new sub-module for the Stripe operations, extend the `payment_status` CHECK constraint by two values, and add two new query helpers paralleling 9-3's `markBookingAuthorized`. Zero new UI files; zero new toast strings; zero changes to the webhook route.

After 9-4 lands at `review` and BA greenlights:

- Space Owners can Confirm PENDING + AUTHORIZED bookings via the existing inline button → Stripe captures the held Payment Intent → funds settle on DeskHive's platform account → Stripe automatically transfers the owner payout (booking total minus 15% `application_fee_amount`) to the connected Stripe Connect account → booking moves to CONFIRMED + CAPTURED.
- Space Owners can Reject the same bookings → Stripe cancels the Payment Intent with `cancellation_reason: 'requested_by_customer'` → the hold on the Guest's card is released → booking moves to REJECTED + VOIDED.
- Phase 1 bookings (where `payment_intent_id IS NULL`) continue to confirm/reject via the existing `confirmBooking` / `rejectBooking` helpers, unchanged. Admin-side workflow continuity preserved.
- Capture/cancel failures (Stripe rejects, network blip, etc.) surface inline next to the button with Stripe's verbatim error message. Booking stays in PENDING + AUTHORIZED; Owner can retry.
- The `payment_status` CHECK constraint now permits 4 values. Story 9-6 will extend it again to add `REFUNDED`.

Feature scope (Story 9-4 only):
- ✅ Schema migration `0006_*.sql` extending `bookings_payment_status_check` to 4 values.
- ✅ New sub-module `src/lib/payments/payment-intents.ts` with `capturePaymentIntent` + `cancelPaymentIntent`.
- ✅ Two new query helpers: `markBookingConfirmedAndCaptured` + `markBookingRejectedAndVoided`.
- ✅ `confirmBookingAction` + `rejectBookingAction` extended with the Phase 2 branching logic.
- ✅ Two new error codes: `STRIPE_CAPTURE_FAILED` + `STRIPE_CANCEL_FAILED`.
- ✅ Phase 1 backwards-compat branch on `payment_intent_id IS NULL`.
- ✅ Per-booking-id idempotency keys.
- ✅ ~10 new unit tests across action + wrapper + query helper.
- ✅ 1 new Phase 1 backwards-compat E2E test (or 2 if dev-agent splits naturally).
- ✅ Memory entry extension.

Out of scope (do NOT build):
- ❌ Webhook handlers for `payment_intent.succeeded` / `payment_intent.canceled` — DEFERRED to Story 9-5 per Decision §8. Zero changes to `src/app/api/stripe/webhook/route.ts` in 9-4. BA accepts the narrow window between 9-4 ship and 9-5 ship as acceptable ops risk.
- ❌ Guest-side cancellation + refund flow — Story 9-6.
- ❌ Refund flow + 24-hour policy — Story 9-6.
- ❌ `/owner/payouts` view — Story 9-7.
- ❌ Payment receipt + payment-failed emails — Story 8-4 (depends on 9-5's webhook dispatch).
- ❌ `@stripe/stripe-js` install — still deferred (no new client-side Stripe surface).
- ❌ `payment_status_history` audit table — out of Phase 2 scope.
- ❌ UI redesign of `<ConfirmBookingButton>` / `<RejectBookingButton>` — Phase 1 / Story 5-2 design preserved.
- ❌ Real-time payment_status polling on a booking detail page — Phase 2 doesn't have a detail page surface.
- ❌ Phase 2 PRD §4.5 cancel-interpretation — Story 9-6 territory (re-flagged below).

### Key decisions baked into the spec

1. **`VOIDED` (not `CANCELLED`).** Decision §1. Distinct from booking-side `CANCELLED` (Guest-initiated, 9-6 territory) and Stripe's event-type alignment (Stripe uses `canceled` for the event; we use `VOIDED` for the column value to avoid intra-codebase sub-system confusion). Leaves `CANCELLED` available for 9-6 if needed.

2. **Stripe-first-then-DB ordering** for both confirm and reject. Decision §2 + §3. Inverse of 9-3's pre-claim model — there's no slot-claim race on Owner-side confirm/reject (single-tenant booking ownership), so DB-first offers no benefit and creates a rollback-correctness problem on Stripe-success-then-DB-fail.

3. **Per-booking-id idempotency keys** (`capture-${bookingId}`, `cancel-${bookingId}`). Decision §7. Different from 9-3's per-attempt UUID for Checkout — the operation here is bounded to one Payment Intent, so retries should produce the same result.

4. **Phase 1 backwards-compat branch.** Decision §6. Bookings with `payment_intent_id IS NULL` skip Stripe entirely; the Phase 1 `confirmBooking` / `rejectBooking` helpers run unchanged. Edge case (PI-id set + payment_status not AUTHORIZED) surfaces as INTERNAL_ERROR for ops.

5. **`cancellation_reason: 'requested_by_customer'`** hardcoded. Decision §3. Closest semantic match for Owner-Reject; `'fraudulent'` / `'duplicate'` are semantically wrong; `'abandoned'` is wrong direction. Phase 3 may parametrize.

6. **Zero UI changes.** Decision §9. Existing `<ConfirmBookingButton>` + `<RejectBookingButton>` Client Components stay untouched. Inline `state.message` render path surfaces the new STRIPE_CAPTURE_FAILED / STRIPE_CANCEL_FAILED codes via Stripe's verbatim error string.

7. **Webhook handlers deferred to Story 9-5.** Decision §8. Zero changes to `src/app/api/stripe/webhook/route.ts` in 9-4. Story 9-5 (next dispatch) will land `payment_intent.succeeded` + `payment_intent.canceled` alongside `charge.refunded` / `payout.paid` / `checkout.session.expired` + refactor the existing narrow branches into a single dispatcher under `src/lib/payments/webhooks.ts`.

8. **No new TOAST_COPY entries.** Decision §11. Phase 1 inline-error pattern preserved.

9. **1 new E2E (Phase 1 backwards-compat regression).** Decision §13 locked option (i). Phase 2 happy capture/reject paths are unit-tested + BA-walked; not E2E'd. The Phase 1 backwards-compat test provides end-to-end lockdown on the `payment_intent_id IS NULL` short-circuit.

### Test-count baseline alignment

Decision §12 cites "346 baseline + ~10 = ~356 unit tests". This is precise: the 346 baseline is the post-9-3-fix actual (`pnpm test` output at commit `8035907`: `346 passed | 1 skipped`).

E2E baseline: 60 (post-9-3 actual, +2 from 9-3's two new tests). +1 new (or +2 if dev-agent splits) → target **61** (or 62).

Build route count: 41 (post-9-3 actual, +1 from 9-3's `/spaces/[id]/booking/return`). 9-4 adds ZERO routes — capture/cancel run on existing `/admin/bookings` + `/owner/bookings` paths.

### Sprint status update

`_bmad-output/implementation-artifacts/sprint-status.yaml` — add `9-4-confirm-reject-capture-cancel: ready-for-dev` to Epic 9's section (after `9-3-booking-with-payment: done`). On move-to-review (Task 11), flip to `review`. On BA greenlight (post-push), flip to `done`.

### Recent commits (Epic 9 chain)

```
9401ad4 chore: mark Story 9-3 done in sprint status
8035907 fix(payments): move revalidatePath out of return-URL Server Component render path
bd76dc3 feat(stripe): Story 9-3 — booking with payment            ← Story 9-3 ship
ce03771 chore: dispatch Story 9-3 (ready-for-dev)
4f73cf3 docs: lock Story 9-4 BA decisions (confirm/reject with capture/cancel)  ← THIS STORY's source-of-truth lock
```

Story 9-4 is the **sixth Epic 9 feature commit** (after 9-1, 9-2, 9-2's BA-walk fix, 9-2b, 9-3, and 9-3's BA-walk fix). Subject: `feat(stripe): Story 9-4 — confirm/reject with capture/cancel`.

### Forward-looking notes preserved

- **Story 9-5 generalizes the webhook dispatch.** Will land `payment_intent.succeeded` + `payment_intent.canceled` handlers (the ones 9-4 deferred) alongside `charge.refunded` / `payout.paid` / `checkout.session.expired`. Then refactor the now-three narrow branches in `src/app/api/stripe/webhook/route.ts` into a single dispatcher under `src/lib/payments/webhooks.ts`. The narrow window between 9-4 ship and 9-5 ship is the documented ops risk per Decision §8.
- **Story 9-5 also handles abandoned-payment cleanup** via `checkout.session.expired` or a dedicated mechanism. Carries 9-3's deferred orphan rows.
- **Story 9-6 adds the refund flow.** Reads CAPTURED state introduced by 9-4 → `stripe.refunds.create` → transitions `payment_status` to REFUNDED (5th value) via another DROP/ADD CHECK constraint migration. Re-uses the per-booking-id idempotency key pattern from 9-4 (`refund-${bookingId}`). **The Phase 2 PRD §4.5 cancel-interpretation question** (`project_phase2_prd_4_5_cancel_interpretation.md`) becomes load-bearing for 9-6 — Phase 1's `cancelBookingAction` rejects non-PENDING bookings; PRD implies CONFIRMED + within-24h cancellation should be allowed with refund. Re-flag before authoring 9-6 decisions.
- **Story 9-7 builds the payouts view.** Reads from Stripe Connect API; no DB writes. Owner-side dashboard view.
- **Story 8-4 wires up payment-driven emails.** Receipt on capture (9-4 webhook event delivery via 9-5 → 8-4 email send); refund email on refund (9-6 event → 9-5 → 8-4). 9-4 ships zero email work.
- **The 9-3 BA-walk booking `92bd9829-92ed-4360-b317-367122ffbe0e` is the canonical 9-4 walk target.** It carries a real Stripe Payment Intent (`pi_3TYWSJRvIpZbtPbe1cXXP5hT`) in `requires_capture` state. If that row has been cleaned up between 9-3 ship and 9-4 dispatch, the BA needs to create a fresh AUTHORIZED booking via the 9-3 flow before the 9-4 walk. The reject walk needs a SECOND fresh AUTHORIZED booking (the first is being captured).
- **The `owner@deskhive.local` Connect account MUST be the real test-mode account** (e.g., `acct_1TXqOpRpNLekzL0p` from the 9-3 walk), NOT the synthetic `acct_seed_for_e2e_only`. The capture API call needs a real connected account to settle funds to. If the seed has reset the row, the BA must re-onboard via `/owner/settings` before the walk.

### References

- [Source: docs/design/9-4-confirm-reject-capture-cancel-ba-decisions.md](docs/design/9-4-confirm-reject-capture-cancel-ba-decisions.md) — locked 2026-05-19 (BA: Ikhtiyor Ziyayev), committed `4f73cf3`. 15 decisions + anti-pattern rollup + operator prereqs.
- [Source: docs/03-phase2-prd.md §4.4 FR-PAY-4 + FR-PAY-5] — PRD origin for capture/cancel behavior.
- [Source: docs/03-phase2-prd.md §6.3 — `confirmBookingAction` + `rejectBookingAction` extension hooks] — Phase 2 PRD's explicit extension points.
- [Source: deskhive/src/db/schema.ts](deskhive/src/db/schema.ts) — extend `bookings_payment_status_check` constraint.
- [Source: deskhive/src/db/queries/bookings.ts](deskhive/src/db/queries/bookings.ts) — add `markBookingConfirmedAndCaptured` + `markBookingRejectedAndVoided`; 9-3's `markBookingAuthorized` (lines ~177–215) is the template.
- [Source: deskhive/src/actions/booking.ts](deskhive/src/actions/booking.ts) — extend `confirmBookingAction` + `rejectBookingAction`. The file's header comment already flags 9-4 as the extension story.
- [Source: deskhive/src/lib/payments/connect.ts](deskhive/src/lib/payments/connect.ts) + [deskhive/src/lib/payments/checkout.ts](deskhive/src/lib/payments/checkout.ts) — sub-module pattern + `mapStripeError` helper shape that `payment-intents.ts` mirrors.
- [Source: deskhive/src/app/admin/bookings/confirm-booking-button.tsx](deskhive/src/app/admin/bookings/confirm-booking-button.tsx) + [deskhive/src/app/admin/bookings/reject-booking-button.tsx](deskhive/src/app/admin/bookings/reject-booking-button.tsx) — UI surfaces (zero changes in 9-4).
- [Source: deskhive/src/app/api/stripe/webhook/route.ts](deskhive/src/app/api/stripe/webhook/route.ts) — zero changes in 9-4 (Decision §8); Story 9-5 absorbs.
- [Source: deskhive/tests/fixtures/seed-helpers.ts](deskhive/tests/fixtures/seed-helpers.ts) — `createPendingBookingViaDb` helper for the AC-12 backwards-compat E2E.
- Story 7-PREP-1 `authenticatedPage(role)` fixture — used for the AC-12 backwards-compat E2E.
- Dev-agent memory `reference_stripe_service_pattern.md` — extend with Story 9-4 section per AC-13.
- Dev-agent memory `project_phase2_prd_4_5_cancel_interpretation.md` — unchanged; re-flag for Story 9-6.

## Dev Agent Record

### Agent Model

_To be filled in by dev-agent during the dev-story phase._

### Debug Log References

_To be filled in by dev-agent during the dev-story phase._

### Completion Notes

_To be filled in by dev-agent during the dev-story phase. Expected highlights:_
- Migration file name (`0006_<random_name>.sql`) and whether Drizzle's auto-generation produced clean SQL (DROP/ADD CONSTRAINT block, no data changes).
- Net unit-test count change (+10 → 356). If actual differs from target, surface why (e.g., bonus tests on the new query helpers' edge cases).
- Net E2E-test count change (+1 → 61, or +2 → 62 if dev-agent split the backwards-compat test into confirm + reject mirrors).
- `pnpm build` route count change (zero — should stay at 41).
- Whether the BA-walk artifact booking `92bd9829-...` was still in the DB at dispatch (if not, dev-agent's prep created a fresh one via the 9-3 flow).
- Whether the `owner@deskhive.local` Connect account was still real (vs. reset to synthetic) at dispatch.
- Any Stripe API surprises during dev (e.g., `paymentIntents.capture` returns a different shape than expected in test mode, or `cancellation_reason: 'requested_by_customer'` causes an unexpected Stripe response).
- Whether the Phase 1 backwards-compat E2E was 1 test or 2 (confirm + reject mirrors). If 2, document why splitting was natural.
- Whether the conditional WHERE on the new query helpers caught any unexpected race conditions during dev.
- Whether the inline-error display of `STRIPE_CAPTURE_FAILED` / `STRIPE_CANCEL_FAILED` felt right, or if the BA flagged a need for richer UX during the walk (Decision §9 stance to revisit if so).

### File List

_To be filled in by dev-agent during the dev-story phase._

### Change Log

| Date | Change | Commit |
|---|---|---|
| 2026-05-19 | Story drafted by `bmad-create-story` from locked BA decisions document (commit `4f73cf3`). | (none) |
| _TBD_ | Story implemented; `bookings_payment_status_check` constraint extended to 4 values via migration `0006_<name>.sql`; new sub-module `src/lib/payments/payment-intents.ts` with `capturePaymentIntent` + `cancelPaymentIntent` (per-booking-id idempotency keys, `cancellation_reason: 'requested_by_customer'` hardcoded); new query helpers `markBookingConfirmedAndCaptured` + `markBookingRejectedAndVoided` with conditional WHERE race-safety; `confirmBookingAction` + `rejectBookingAction` extended with Stripe-first-then-DB ordering + Phase 1 backwards-compat branch on `paymentIntentId IS NULL` + edge-case INTERNAL_ERROR; two new error codes `STRIPE_CAPTURE_FAILED` + `STRIPE_CANCEL_FAILED`; zero UI changes (Phase 1 inline-error pattern preserved); zero webhook route changes (deferred to Story 9-5); 10 new unit tests + 1 new Phase 1 backwards-compat E2E test. Memory entry extended. Single commit per AC-15 — awaiting BA browser walk before push. | _TBD (filled by `docs:` follow-up after BA greenlight + push, same pattern as Stories 9-1 + 9-2 + 9-2b + 9-3)_ |
