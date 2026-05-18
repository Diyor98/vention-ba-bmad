# Story 9-5: Webhook Dispatch Generalization

Status: review

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a **DeskHive platform operator who needs the Stripe webhook endpoint to absorb 9-3's `checkout.session.completed` branch + 9-4's deferred `payment_intent.*` handlers + 9-3's deferred `checkout.session.expired` orphan-cleanup, all behind a single typed dispatcher seam**,
I want **`src/app/api/stripe/webhook/route.ts` slimmed to a thin route shell (signature verification + idempotency check + dispatch + `webhook_events` insert on first real handle) while the per-event handler logic moves into a new sub-module `src/lib/payments/webhooks.ts` (4th Theme B sub-module after `connect.ts` / `checkout.ts` / `payment-intents.ts`) exporting a `WEBHOOK_HANDLERS: Record<eventType, HandlerFn>` map and a `dispatchWebhookEvent(event)` entry point** —
so that **(1) the narrow ops window 9-4 documented (Stripe-capture-succeeds-but-DB-write-fails leaves booking stuck in `PENDING + AUTHORIZED`) is closed by the new `payment_intent.succeeded` / `payment_intent.canceled` backstop handlers; (2) orphan pre-claimed bookings from abandoned 9-3 Checkout attempts can be cleaned via the new `checkout.session.expired` handler with its 3-condition safety-net WHERE; (3) Stories 9-6 (refund `charge.refunded`) and 9-7 (`payout.paid`) extend the dispatcher map by adding one handler function + one map entry instead of editing the monolithic route; (4) the load-bearing per-handler 3-stage try-catch wrapper from the 9-2 BA-walk fix is preserved verbatim across the migration; and (5) zero behavior change for the migrated `account.updated` + `checkout.session.completed` branches.**

> Story 9-5 is the **Webhook generalization story** of Theme B (Phase 2 Payments). It absorbs three deferrals from prior stories — `checkout.session.expired` (deferred from 9-3 Decision §6), `payment_intent.succeeded` + `payment_intent.canceled` (deferred from 9-4 Decision §8) — into a single dispatcher seam under `src/lib/payments/webhooks.ts`, refactors the existing 2 narrow handlers from 9-2 + 9-3 in place (behavior-preserving), and lands 4 new `bookings` query helpers (3 keyed on `payment_intent_id`, 1 keyed on `(status, payment_status, id)` for the orphan-DELETE path).
>
> Source of truth: [docs/design/9-5-webhook-dispatch-generalization-ba-decisions.md](docs/design/9-5-webhook-dispatch-generalization-ba-decisions.md) — 16 locked decisions. Locked 2026-05-19 (BA: Ikhtiyor Ziyayev), committed `38d8c6b`.

> **Companion / dependency chain:** Story 9-1 (`feat(stripe): Story 9-1 — Stripe SDK wrapper`, shipped at `aff4060`) + Story 9-2 (`feat(stripe): Story 9-2 — Stripe Connect Express onboarding`, shipped at `0d384e0` + BA-walk fix `8a06402` — **load-bearing for the defensive 3-stage try-catch pattern that 9-5 preserves verbatim**) + Story 9-2b (`feat(stripe): Story 9-2b — publish gating`, shipped at `7e7251c` + `2d65c54`) + Story 9-3 (`feat(stripe): Story 9-3 — booking with payment`, shipped at `bd76dc3` + `8035907`) + Story 9-4 (`feat(stripe): Story 9-4 — confirm/reject with capture/cancel`, shipped at `32dd63a`). All five are on `main`. 9-5 directly extends 9-3's `webhook_events` idempotency infrastructure + 9-4's `payment_intent.*` deferral.

> **After 9-5 ships, the running app behaves like this:** Stripe webhook events arrive at `/api/stripe/webhook` → the route's POST handler verifies signature via `stripe.webhooks.constructEvent` → checks `webhook_events.stripe_event_id` for idempotency → calls `dispatchWebhookEvent(event)` which looks up the handler in `WEBHOOK_HANDLERS` by event type → handler runs its conditional DB write with per-stage 3-stage try-catch wrappers + structured logging → returns a `WebhookHandlerResult` discriminated union (`{ handled: true }` / `{ deferred: true }` / `{ idempotent: true }` / `{ ok: false, status, message }`) → route translates result to HTTP response + inserts into `webhook_events` ONLY on `{ handled: true }`. 5 event types are handled in 9-5: `account.updated` (9-2 origin, migrated verbatim) + `checkout.session.completed` (9-3 origin, migrated verbatim) + `payment_intent.succeeded` (NEW backstop for 9-4 capture path) + `payment_intent.canceled` (NEW backstop for 9-4 reject path) + `checkout.session.expired` (NEW orphan-DELETE for 9-3 abandoned pre-claims). All other event types return `200 OK { handled: false }` without `webhook_events` insert (preserved 9-2 / 9-3 pattern; 9-6 picks up `charge.refunded`, 9-7 picks up `payout.paid`).

> **Key anti-patterns to keep in mind:**
> - **No Stripe SDK imports outside `src/lib/stripe.ts` and `src/lib/payments/*` sub-modules** (CC-3 carry-forward).
> - **No skipping signature verification** (CC-7 / NFR-3 / Decision §7). Raw body via `req.text()` MUST stay at route level — once consumed it can't be re-read; pushing verification into the sub-module would invert the dependency.
> - **No inserting into `webhook_events` BEFORE a real handler ran** — only-on-first-real-handle semantics are load-bearing (Decision §6 from 9-2 / 9-3 carry-forward).
> - **No collapsing the per-stage try-catch wrappers into a single try-catch around the whole handler** — the 9-2 BA-walk-fix per-stage attribution is load-bearing (Decision §4 + §8). Each DB op gets its own try-catch logging `error.message` + `error.cause` separately (Drizzle's `DrizzleQueryError` collapses PG errors into `.cause`).
> - **No renaming existing log keys** (`stripe_webhook_*_failed`, `stripe_webhook_*_not_found`, etc.) — silently breaks any dashboard / alert that depends on them (Decision §9).
> - **No `charge.refunded` / `payout.paid` / `payment_intent.payment_failed` handlers in 9-5** — explicitly deferred to 9-6 / 9-7 / Phase 3 (Decision §10).
> - **No email sends from any webhook handler** — 8-4 territory (carry-forward from 9-2 / 9-3 / 9-4).
> - **No `stripe.paymentIntents.retrieve` (or any Stripe API) calls from inside a handler** — webhook payload is the source of truth (Decision §6 from 9-3 carry-forward).
> - **No metadata-`bookingId` as the primary lookup key in the PI handlers** — `payment_intent_id` is the load-bearing join (Decision §5). The expired handler is the exception: it has no PI to key on, so it uses `metadata.bookingId` (set at 9-3 Checkout Session create time).
> - **No skipping the conditional WHERE in the by-PI query helpers** — race-safety is the whole point (Decision §11).
> - **No widening the expired handler's WHERE to fewer than 3 conditions** (`status='PENDING' AND payment_status='AWAITING_PAYMENT' AND id=$bookingId`) — the 3-condition shape is the safety net against ever DELETE-ing a row that progressed past abandonment (Decision §5 + §11).
> - **No UPDATE-to-CANCELLED for the expired handler** — orphan cleanup is the goal; CANCELLED would clutter user-facing views with a non-event (Decision §5).
> - **No forged-signature POSTs from E2E** to bypass signature verification (Decision §14). 9-5 ships 0 new E2E tests; webhook walks happen via `stripe listen` + BA dashboard actions.
> - **No `Stripe → Inngest → handler` queue indirection** — Phase 2 stays single-process synchronous dispatch.
> - **No `webhook_events` schema changes in 9-5** (no `retry_count` column; no audit-trail expansion).
> - **No migrations in 9-5** — pure refactor + new in-app code; zero schema changes.

## Acceptance Criteria

> Source: locked BA Decisions document Decisions 1–16.

1. **AC-1 (Thin route shell — `src/app/api/stripe/webhook/route.ts` slimmed to ~120 lines).** Per BA Decision §1 + §7 + §10:
   - Refactor [src/app/api/stripe/webhook/route.ts](deskhive/src/app/api/stripe/webhook/route.ts) (currently 329 lines) into a thin shell. POST handler responsibilities (in order):
     1. Env check — `STRIPE_WEBHOOK_SECRET` present; 500 + `stripe_webhook_secret_missing` log if absent.
     2. Header check — `stripe-signature` present; 400 if absent.
     3. Raw body read via `await req.text()` (NOT `req.json()` — raw bytes required for HMAC).
     4. Signature verification via `stripe.webhooks.constructEvent(rawBody, signature, secret)`; 400 + `stripe_webhook_signature_invalid` warn log on failure (NO `webhook_events` insert on signature failure).
     5. Idempotency check (Layer 1 — centralized) via `SELECT FROM webhook_events WHERE stripe_event_id = $1`; return `200 { received: true, idempotent: true }` if hit; 500 + `stripe_webhook_idempotency_select_failed` on DB error.
     6. Call `dispatchWebhookEvent(event)` (the new sub-module entry point from AC-2).
     7. Convert `WebhookHandlerResult` to HTTP response:
        - `{ ok: true, handled: true }` → insert into `webhook_events` (Layer 2 — per-handler) → on success return `200 { received: true, handled: true }`; on insert failure 500 + `stripe_webhook_event_insert_failed`.
        - `{ ok: true, deferred: true }` → return `200 { received: true, deferred: true }`; do NOT insert into `webhook_events`.
        - `{ ok: true, idempotent: true }` → return `200 { received: true, idempotent: true }`; do NOT insert into `webhook_events`.
        - `{ ok: false, status, message }` → return `<status> <message>`; do NOT insert into `webhook_events` (Stripe retries the event).
   - Unhandled event types (where `WEBHOOK_HANDLERS[event.type]` is undefined): the dispatcher returns `{ ok: true, handled: false }` and the route returns `200 { received: true, handled: false }` + `stripe_webhook_unhandled_event` info log; do NOT insert into `webhook_events`.
   - The route file's helper functions `errMessage` + `errCause` (currently at lines ~322–329) MOVE to `webhooks.ts` per AC-2 + Decision §12. The route does NOT need them after the refactor — its remaining DB ops (idempotency check + `webhook_events` insert) keep their existing error-log shapes.
   - **Anti-pattern enforced:** do NOT skip signature verification (CC-7). Do NOT push signature verification into `webhooks.ts` (raw body is route-level state). Do NOT consume `req.text()` more than once. Do NOT log the raw body or the signature value (sensitive).

2. **AC-2 (New sub-module `src/lib/payments/webhooks.ts` — 4th Theme B sub-module with dispatcher map).** Per BA Decision §1 + §2:
   - Create new sub-module [src/lib/payments/webhooks.ts](deskhive/src/lib/payments/webhooks.ts) following the same convention as 9-2's `connect.ts` + 9-3's `checkout.ts` + 9-4's `payment-intents.ts`. Exports:
     ```typescript
     // src/lib/payments/webhooks.ts

     import type Stripe from 'stripe';

     /**
      * Result returned by each handler. The route translates this to an
      * HTTP response shape + decides whether to insert into webhook_events.
      */
     export type WebhookHandlerResult =
       | { ok: true; handled: true }                          // first real handle — caller inserts webhook_events
       | { ok: true; deferred: true }                          // retriable / dependency-not-ready — Stripe retries
       | { ok: true; idempotent: true }                        // already in target state — no insert
       | { ok: true; handled: false }                          // unknown event type — no insert
       | { ok: false; status: number; message: string };        // unexpected error — caller returns this status

     /** Individual handlers — exported for unit-test access. */
     export async function handleAccountUpdated(event: Stripe.Event): Promise<WebhookHandlerResult>;
     export async function handleCheckoutSessionCompleted(event: Stripe.Event): Promise<WebhookHandlerResult>;
     export async function handleCheckoutSessionExpired(event: Stripe.Event): Promise<WebhookHandlerResult>;
     export async function handlePaymentIntentSucceeded(event: Stripe.Event): Promise<WebhookHandlerResult>;
     export async function handlePaymentIntentCanceled(event: Stripe.Event): Promise<WebhookHandlerResult>;

     /** Dispatcher map keyed by Stripe event type. */
     export const WEBHOOK_HANDLERS: Readonly<
       Record<string, (event: Stripe.Event) => Promise<WebhookHandlerResult>>
     > = {
       'account.updated': handleAccountUpdated,
       'checkout.session.completed': handleCheckoutSessionCompleted,
       'checkout.session.expired': handleCheckoutSessionExpired,
       'payment_intent.succeeded': handlePaymentIntentSucceeded,
       'payment_intent.canceled': handlePaymentIntentCanceled,
     };

     /**
      * Top-level dispatch entry point. The route calls this with the
      * signature-verified Stripe.Event. Unknown event types return
      * { handled: false }; safety-net try-catch around the handler call
      * converts unexpected throws into { ok: false, status: 500 }.
      */
     export async function dispatchWebhookEvent(event: Stripe.Event): Promise<WebhookHandlerResult>;
     ```
   - Internal helpers `errMessage(err: unknown): string` + `errCause(err: unknown): string | null` live as **non-exported** module-level functions inside `webhooks.ts` per Decision §12. Their shape is identical to the current route file's helpers (move them verbatim).
   - The dispatcher's top-level try-catch (Decision §8 safety net):
     ```typescript
     export async function dispatchWebhookEvent(event: Stripe.Event): Promise<WebhookHandlerResult> {
       const handler = WEBHOOK_HANDLERS[event.type];
       if (!handler) {
         logger.info('stripe_webhook_unhandled_event', { eventType: event.type, eventId: event.id });
         return { ok: true, handled: false };
       }
       try {
         return await handler(event);
       } catch (err) {
         logger.error('stripe_webhook_dispatcher_unexpected_throw', {
           eventId: event.id,
           eventType: event.type,
           error: errMessage(err),
           cause: errCause(err),
         });
         return { ok: false, status: 500, message: 'Unexpected handler error' };
       }
     }
     ```
   - **Anti-pattern enforced:** do NOT spin out a `webhooks/` subdirectory (single file per Decision §1). Do NOT export `errMessage` / `errCause` (internal only). Do NOT introduce a class-based dispatcher.

3. **AC-3 (`handleAccountUpdated` — behavior-preserving migration of 9-2's branch).** Per BA Decision §4:
   - Move the existing `account.updated` logic from [src/app/api/stripe/webhook/route.ts](deskhive/src/app/api/stripe/webhook/route.ts) (lines 104–173) into `handleAccountUpdated(event)` inside `webhooks.ts`. **Zero behavior change.** Specifically preserved:
     - `account.id` is the lookup key via `getConnectAccountByStripeAccountId`.
     - Returns `{ ok: true, deferred: true }` if the connect-row is not found (Stripe delivered `account.updated` before our `initiateConnectOnboardingAction`'s upsert).
     - `upsertConnectAccount` writes `chargesEnabled` / `payoutsEnabled` / `onboardingCompleted` from the event payload.
     - Each DB op (lookup, upsert) wrapped in its own try-catch logging `errMessage(err)` + `errCause(err)` separately — the load-bearing 9-2 BA-walk-fix pattern. Returns `{ ok: false, status: 500, message }` to surface to Stripe (so Stripe retries).
     - On success returns `{ ok: true, handled: true }` (caller inserts `webhook_events`).
   - Existing log keys preserved verbatim: `stripe_webhook_account_lookup_failed`, `stripe_webhook_account_not_found`, `stripe_webhook_upsert_failed`. **DO NOT rename.**
   - The `webhook_events` insert that currently lives at lines 152–170 of the route file is removed from `handleAccountUpdated` — that insert is now the route's responsibility per AC-1 (on `{ handled: true }` result). The handler ONLY does the lookup + upsert + per-stage error wrapping.
   - **Anti-pattern enforced:** do NOT change any branching logic or error messages. Do NOT collapse the 3-stage try-catch into a single try-catch. Do NOT add Stripe API calls (carry-forward of 9-3 Decision §6). Do NOT trigger email sends (8-4 territory).

4. **AC-4 (`handleCheckoutSessionCompleted` — behavior-preserving migration of 9-3's branch).** Per BA Decision §3:
   - Move the existing `checkout.session.completed` logic from [src/app/api/stripe/webhook/route.ts](deskhive/src/app/api/stripe/webhook/route.ts) (lines 200–303) into `handleCheckoutSessionCompleted(event)` inside `webhooks.ts`. **Zero behavior change.** Specifically preserved:
     - `session.metadata.bookingId` is the lookup key (9-3's belt-and-suspenders fallback to `session.client_reference_id` was not implemented in the route; preserve current shape).
     - Returns `{ ok: true, deferred: true }` on missing `bookingId` from metadata, missing `paymentIntentId` from the session, OR booking-row not found.
     - `markBookingAuthorized({ bookingId, paymentIntentId })` is the DB seam — its conditional WHERE clause is the race-safety net against the return-URL handler winning first. On `undefined` return → `{ ok: true, idempotent: true }`.
     - Each DB op (lookup, update) wrapped in its own try-catch logging `errMessage(err)` + `errCause(err)` separately — same load-bearing pattern as AC-3.
     - On successful `markBookingAuthorized` return → `{ ok: true, handled: true }` (caller inserts `webhook_events`).
   - Existing log keys preserved verbatim: `stripe_webhook_checkout_no_booking_id`, `stripe_webhook_checkout_no_payment_intent`, `stripe_webhook_checkout_booking_lookup_failed`, `stripe_webhook_checkout_booking_not_found`, `stripe_webhook_checkout_update_failed`, `stripe_webhook_checkout_already_authorized`, `stripe_webhook_checkout_event_insert_failed` (the last one only fires from the route now, not from the handler).
   - The `webhook_events` insert that lived inside this branch is removed from the handler — same shift as AC-3.
   - **Anti-pattern enforced:** do NOT change branching logic or error messages. Do NOT call any Stripe API from inside the handler (Decision §6 from 9-3 carry-forward). Do NOT alter the conditional WHERE semantics of `markBookingAuthorized`.

5. **AC-5 (`handlePaymentIntentSucceeded` — NEW capture-confirmation backstop).** Per BA Decision §5:
   - Create new handler `handlePaymentIntentSucceeded(event)` inside `webhooks.ts`. Closes the narrow ops window 9-4 documented (Stripe-capture-succeeds-but-DB-write-fails leaves booking stuck in `PENDING + AUTHORIZED`):
     ```typescript
     async function handlePaymentIntentSucceeded(event: Stripe.Event): Promise<WebhookHandlerResult> {
       const paymentIntent = event.data.object as Stripe.PaymentIntent;
       const paymentIntentId = paymentIntent.id;

       let booking;
       try {
         booking = await getBookingByPaymentIntentId(paymentIntentId);
       } catch (err) {
         logger.error('stripe_webhook_payment_intent_succeeded_lookup_failed', {
           eventId: event.id,
           paymentIntentId,
           error: errMessage(err),
           cause: errCause(err),
         });
         return { ok: false, status: 500, message: 'Booking lookup failed' };
       }

       if (!booking) {
         logger.warn('stripe_webhook_payment_intent_succeeded_booking_not_found', {
           eventId: event.id,
           paymentIntentId,
         });
         return { ok: true, deferred: true };
       }

       let updated;
       try {
         updated = await markBookingConfirmedAndCapturedByPaymentIntent(paymentIntentId);
       } catch (err) {
         logger.error('stripe_webhook_payment_intent_succeeded_update_failed', {
           eventId: event.id,
           paymentIntentId,
           error: errMessage(err),
           cause: errCause(err),
         });
         return { ok: false, status: 500, message: 'Booking update failed' };
       }

       if (!updated) {
         logger.info('stripe_webhook_payment_intent_succeeded_already_captured', {
           eventId: event.id,
           paymentIntentId,
         });
         return { ok: true, idempotent: true };
       }

       return { ok: true, handled: true };
     }
     ```
   - **Lookup keyed on `payment_intent.id`, NOT `metadata.bookingId`** (load-bearing per Decision §5): the PI itself is the resource that changed state; `bookings.payment_intent_id` is the column 9-3 created for exactly this join.
   - **Handler completes the FULL state transition** (BOTH `status` and `payment_status` flip atomically via `markBookingConfirmedAndCapturedByPaymentIntent`). This means 9-4's action and 9-5's webhook produce the same booking row state regardless of which path "won the race."
   - The new query helper `markBookingConfirmedAndCapturedByPaymentIntent` (AC-8) does the conditional UPDATE with WHERE clause `(payment_intent_id=$1 AND status='PENDING' AND payment_status='AUTHORIZED')`. Returns `Booking | undefined` (undefined → handler returns `idempotent: true`).
   - `getBookingByPaymentIntentId` (AC-8) is a separate lookup BEFORE the conditional UPDATE so the handler can distinguish "no booking matches this PI" (return `deferred: true`) from "booking matches but already in target state" (return `idempotent: true`).
   - **Anti-pattern enforced:** do NOT call `stripe.paymentIntents.retrieve` from inside the handler (webhook payload is the source of truth). Do NOT use `event.data.object.metadata.bookingId` as the primary lookup key (PI ID is the join). Do NOT trigger email sends (8-4 territory). Do NOT alter `payment_status` without also flipping `status` (full state transition is the backstop's job).

6. **AC-6 (`handlePaymentIntentCanceled` — NEW cancel-confirmation backstop).** Per BA Decision §5:
   - Create new handler `handlePaymentIntentCanceled(event)` inside `webhooks.ts`. Mirror shape of AC-5 but for the reject path:
     - Lookup booking by `paymentIntent.id` via `getBookingByPaymentIntentId`.
     - Conditional UPDATE via `markBookingRejectedAndVoidedByPaymentIntent` (AC-8) with WHERE `(payment_intent_id=$1 AND status='PENDING' AND payment_status='AUTHORIZED')` → target state `(REJECTED, VOIDED)`.
     - Same `{ deferred | idempotent | handled }` result semantics as AC-5.
   - Log keys: `stripe_webhook_payment_intent_canceled_lookup_failed`, `stripe_webhook_payment_intent_canceled_booking_not_found`, `stripe_webhook_payment_intent_canceled_update_failed`, `stripe_webhook_payment_intent_canceled_already_voided`.
   - **Anti-pattern enforced:** same as AC-5. Also: do NOT handle other PI lifecycle states (`requires_action`, `processing`, `requires_payment_method`) — only `canceled` is wired (terminal state).

7. **AC-7 (`handleCheckoutSessionExpired` — NEW orphan-cleanup with 3-condition WHERE).** Per BA Decision §5 + §11:
   - Create new handler `handleCheckoutSessionExpired(event)` inside `webhooks.ts`. Cleans up pre-claimed-but-abandoned booking rows from 9-3's slot-claim model. Closes the 9-3 Decision §6 deferred orphan-cleanup problem:
     ```typescript
     async function handleCheckoutSessionExpired(event: Stripe.Event): Promise<WebhookHandlerResult> {
       const session = event.data.object as Stripe.Checkout.Session;
       const bookingId = session.metadata?.bookingId;

       if (!bookingId) {
         logger.warn('stripe_webhook_checkout_session_expired_no_booking_id', {
           eventId: event.id,
           sessionId: session.id,
         });
         return { ok: true, deferred: true };
       }

       let deleted;
       try {
         deleted = await deleteAbandonedBookingByCheckoutSession(bookingId);
       } catch (err) {
         logger.error('stripe_webhook_checkout_session_expired_delete_failed', {
           eventId: event.id,
           bookingId,
           error: errMessage(err),
           cause: errCause(err),
         });
         return { ok: false, status: 500, message: 'Booking cleanup failed' };
       }

       if (!deleted) {
         logger.info('stripe_webhook_checkout_session_expired_no_orphan', {
           eventId: event.id,
           bookingId,
         });
         return { ok: true, idempotent: true };
       }

       return { ok: true, handled: true };
     }
     ```
   - **3-condition WHERE is load-bearing** (per Decision §11 anti-pattern): `status='PENDING' AND payment_status='AWAITING_PAYMENT' AND id=$bookingId`. Any one condition missing opens a path to deleting the wrong row. A CONFIRMED row mismatches on status; a CAPTURED row mismatches on payment_status; the bookingId narrows to the specific abandoned attempt. The combination matches ONLY the pre-claimed-but-abandoned shape; anything that progressed (Guest came back and completed, 9-4 captured, prior cleanup already ran) is safe.
   - **Lookup by `session.metadata.bookingId`, NOT by `payment_intent_id`** (the inverse of AC-5 / AC-6). The booking has no `checkout_session_id` column; the Stripe → DeskHive join goes through `metadata.bookingId` (set at Session-create time in 9-3 Decision §4). Different join column because the resource (Checkout Session) is different from the PI handlers.
   - **`{ idempotent: true }` on zero rows affected** covers three winning paths: (a) Guest came back and completed Checkout (booking moved to AUTHORIZED — different path won); (b) 9-4 captured (booking moved to CONFIRMED + CAPTURED); (c) a prior `checkout.session.expired` delivery already cleaned the orphan. All three are "no action needed" from this handler's POV.
   - **Anti-pattern enforced:** do NOT widen the WHERE to 2 conditions or 1 condition. Do NOT use `UPDATE bookings SET status='CANCELLED' WHERE ...` instead of `DELETE FROM bookings WHERE ...` — orphan cleanup is the goal; CANCELLED would clutter user-facing views with a non-event. Do NOT call any Stripe API (webhook payload is the source of truth).

8. **AC-8 (4 new `bookings` query helpers).** Per BA Decision §11:
   - Edit [src/db/queries/bookings.ts](deskhive/src/db/queries/bookings.ts). Add 4 new helpers:
     ```typescript
     /**
      * Story 9-5: lookup helper for the payment_intent.* webhook
      * handlers. Returns the booking with the matching payment_intent_id,
      * or undefined if none exists.
      */
     export async function getBookingByPaymentIntentId(
       paymentIntentId: string,
     ): Promise<Booking | undefined>;

     /**
      * Story 9-5: webhook backstop for capture. Updates status='CONFIRMED' +
      * payment_status='CAPTURED' for the booking matching payment_intent_id,
      * ONLY IF the row is currently in (PENDING, AUTHORIZED). Mirrors 9-4's
      * markBookingConfirmedAndCaptured (by-id helper); differs only in the
      * join column.
      */
     export async function markBookingConfirmedAndCapturedByPaymentIntent(
       paymentIntentId: string,
     ): Promise<Booking | undefined>;

     /** Story 9-5: webhook backstop for reject. Mirror of the above. */
     export async function markBookingRejectedAndVoidedByPaymentIntent(
       paymentIntentId: string,
     ): Promise<Booking | undefined>;

     /**
      * Story 9-5: orphan-booking cleanup for the checkout.session.expired
      * handler. Deletes the booking row IFF status='PENDING' AND
      * payment_status='AWAITING_PAYMENT' AND id=$bookingId. The 3-condition
      * WHERE is the load-bearing safety net against ever DELETE-ing a row
      * that progressed past abandonment.
      *
      * Returns true if exactly 1 row was deleted; false on 0 rows (the
      * idempotent path — different path won, or a prior delivery already
      * cleaned).
      */
     export async function deleteAbandonedBookingByCheckoutSession(
       bookingId: string,
     ): Promise<boolean>;
     ```
   - All three mark/delete helpers use Drizzle's conditional WHERE pattern (capture/void use 2 conditions on `(status, payment_status)`; expired-delete needs 3 — also `id`). The `.returning()` chain (or `.executeTakeFirst()`-equivalent for the delete) detects the zero-rows case for the idempotent path.
   - **Anti-pattern enforced:** do NOT collapse the by-PI helpers and the by-id helpers (from 9-4) into a single helper with `WHERE id = $1 OR payment_intent_id = $2` — that's a defensive query smell + ambiguous race semantics. Do NOT skip the conditional WHERE in the by-PI helpers (race-safety is the point). Do NOT add `markBookingCapturedByPaymentIntent` payment_status-only variant (webhook is the FULL backstop). Do NOT widen `deleteAbandonedBookingByCheckoutSession`'s WHERE to 2 conditions (the 3-condition shape is the safety net). Do NOT use UPDATE-to-CANCELLED instead of DELETE for the orphan path.

9. **AC-9 (Two-layer idempotency preserved — Layer 1 at route entry + Layer 2 per-handler-result).** Per BA Decision §6:
   - **Layer 1 (centralized at route entry, BEFORE dispatch)**: `SELECT FROM webhook_events WHERE stripe_event_id = $1`. If the row exists, return `200 { received: true, idempotent: true }` immediately (AC-1 step 5). Same shape as the current route file's lines 80–101.
   - **Layer 2 (per-handler at route response time)**: ONLY when the handler returns `{ ok: true, handled: true }`, the route inserts a row into `webhook_events`. On `{ deferred: true }` / `{ idempotent: true }` / `{ handled: false }` / `{ ok: false }` paths, NO insert. This preserves 9-2's Decision §7 anti-pattern ("only insert when a real handler ran") and 9-3's carry-forward.
   - **Partial-failure recovery semantics:** if the handler returns `{ handled: true }` and the route's `webhook_events` insert fails, the route returns 500 → Stripe retries → next delivery's Layer 1 check misses (row never inserted) → dispatcher fires the handler again → handler's conditional WHERE finds the booking already in target state → handler returns `{ idempotent: true }` → route returns 200 + does NOT insert. The DB state is correct (booking row in target state); the only loss is an audit-trail gap (`webhook_events` doesn't record the specific Stripe event ID that caused the transition). **Acceptable for Phase 2** per Decision §6.
   - The forward-looking flag for Story 9-6 (refund flow may need transactional write-with-rollback semantics, given money-outbound compliance traceability requirements) is documented in the BA decisions doc Decision §6 + the memory entry per AC-15; 9-5 does NOT touch this — 9-6's decision doc will pick it up.
   - **Anti-pattern enforced:** do NOT insert into `webhook_events` BEFORE the handler runs. Do NOT insert on `deferred` / `idempotent` / `handled: false` paths. Do NOT make the route's `webhook_events` insert transactional with the handler's DB writes (the partial-failure-is-OK semantics already make this unnecessary). Do NOT add a "retry count" column to `webhook_events` in 9-5.

10. **AC-10 (Per-handler defensive 3-stage try-catch + top-level dispatcher safety-net wrapper).** Per BA Decision §4 + §8:
    - Each handler keeps the load-bearing 9-2 BA-walk-fix pattern: every DB op gets its own try-catch logging `errMessage(err)` + `errCause(err)` separately (Drizzle's `DrizzleQueryError` collapses PG errors into `.cause`; without explicit `errCause(err)` capture in the log we lose the actual failure reason). Per-stage attribution is what the 9-2 BA-walk fix introduced and what 9-5 preserves verbatim.
    - **Top-level dispatcher wrapper (NEW in 9-5)**: `dispatchWebhookEvent(event)` wraps the handler call in a try-catch as a should-never-happen safety net. Handlers SHOULD always return a `WebhookHandlerResult`; if one throws, the dispatcher logs `stripe_webhook_dispatcher_unexpected_throw` with `errMessage` + `errCause` and returns `{ ok: false, status: 500, message: 'Unexpected handler error' }`. The route surfaces this as 500 → Stripe retries.
    - The dispatcher wrapper does NOT replace per-stage try-catch in handlers — it's a defensive belt over the suspenders. Per-stage logging gives ops the breadcrumb trail (which DB op died); centralized try-catch collapses it (which is why the dispatcher wrapper is a SAFETY NET, not the primary error path).
    - **Anti-pattern enforced:** do NOT remove `errMessage(err)` / `errCause(err)` helper calls in any handler. Do NOT swallow errors silently — every error path logs with a structured key. Do NOT return 500 from the route for `deferred: true` results (Stripe's retry policy is what we want).

11. **AC-11 (Structured logging — preserve existing key conventions + extend for new handlers).** Per BA Decision §9:
    - **Existing keys preserved verbatim** (load-bearing — ops dashboards / future log search filters depend on these):
      - Route-level: `stripe_webhook_secret_missing`, `stripe_webhook_signature_invalid`, `stripe_webhook_idempotency_select_failed`, `stripe_webhook_event_insert_failed`, `stripe_webhook_unhandled_event`.
      - `account.updated` handler: `stripe_webhook_account_lookup_failed`, `stripe_webhook_account_not_found`, `stripe_webhook_upsert_failed`.
      - `checkout.session.completed` handler: `stripe_webhook_checkout_no_booking_id`, `stripe_webhook_checkout_no_payment_intent`, `stripe_webhook_checkout_booking_lookup_failed`, `stripe_webhook_checkout_booking_not_found`, `stripe_webhook_checkout_update_failed`, `stripe_webhook_checkout_already_authorized`.
    - **New keys for the 9-5 handlers** (per AC-5 / AC-6 / AC-7 + dispatcher safety net):
      - `stripe_webhook_payment_intent_succeeded_lookup_failed`
      - `stripe_webhook_payment_intent_succeeded_booking_not_found`
      - `stripe_webhook_payment_intent_succeeded_update_failed`
      - `stripe_webhook_payment_intent_succeeded_already_captured`
      - `stripe_webhook_payment_intent_canceled_lookup_failed`
      - `stripe_webhook_payment_intent_canceled_booking_not_found`
      - `stripe_webhook_payment_intent_canceled_update_failed`
      - `stripe_webhook_payment_intent_canceled_already_voided`
      - `stripe_webhook_checkout_session_expired_no_booking_id`
      - `stripe_webhook_checkout_session_expired_delete_failed`
      - `stripe_webhook_checkout_session_expired_no_orphan`
      - `stripe_webhook_dispatcher_unexpected_throw`
    - **Common log fields:** every log line includes `{ eventId, eventType, error?, cause? }`. Per-handler logs additionally include the resource key (`paymentIntentId`, `bookingId`, `stripeAccountId` as appropriate).
    - **Anti-pattern enforced:** do NOT rename existing log keys. Do NOT log raw event payloads at INFO/WARN level (payloads can be ~20KB and contain sensitive PII; `webhook_events.payload` jsonb is where they go). Do NOT log without the handler-name prefix.

12. **AC-12 (Unit tests — ~10-12 new across handler + dispatcher + query helpers).** Per BA Decision §13:
    - **`src/lib/payments/webhooks.test.ts`** (NEW — 6 handler tests; mocks at `@/db/queries/*` boundary via `vi.mock('@/db/queries/bookings')` + `vi.mock('@/db/queries/stripe-connect')`):
      1. `handlePaymentIntentSucceeded` happy path — booking in `(PENDING, AUTHORIZED)` → conditional UPDATE returns the row → handler returns `{ ok: true, handled: true }`. Asserts `markBookingConfirmedAndCapturedByPaymentIntent` called with the PI id.
      2. `handlePaymentIntentSucceeded` idempotent — booking already in `(CONFIRMED, CAPTURED)` → conditional UPDATE returns undefined → handler returns `{ ok: true, idempotent: true }`.
      3. `handlePaymentIntentSucceeded` deferred (booking-not-found) — `getBookingByPaymentIntentId` returns undefined → handler returns `{ ok: true, deferred: true }`. Asserts `markBookingConfirmedAndCapturedByPaymentIntent` NOT called.
      4. `handlePaymentIntentCanceled` happy path — booking in `(PENDING, AUTHORIZED)` → `markBookingRejectedAndVoidedByPaymentIntent` called → handler returns `{ ok: true, handled: true }`.
      5. `handlePaymentIntentCanceled` idempotent — booking already in `(REJECTED, VOIDED)` → handler returns `{ ok: true, idempotent: true }`.
      6. `handleCheckoutSessionExpired` happy + idempotent — parameterized: orphan in `(PENDING, AWAITING_PAYMENT)` → DELETE returns true → `{ ok: true, handled: true }`. Same handler on a non-orphan (DELETE returns false) → `{ ok: true, idempotent: true }`. Combined into 1 parameterized vitest case (dev-agent may split into 2 if it falls out more naturally).
    - **`src/app/api/stripe/webhook/route.test.ts`** REFACTOR (move existing 4 tests to mock at `@/lib/payments/webhooks` boundary via `vi.mock('@/lib/payments/webhooks')` + add 2 new dispatcher-level tests):
      - **Existing tests preserved** — the 2 `account.updated` tests from 9-2 + the 2 `checkout.session.completed` tests from 9-3 stay; their internal mocks shift from `@/db/queries/*` (the old direct mock) to `@/lib/payments/webhooks` (the new dispatch seam). Assertion lists unchanged.
      - **NEW dispatcher-unknown-event test** — event with type `customer.created` → dispatcher returns `{ ok: true, handled: false }` → route returns `200 { handled: false }` and does NOT insert `webhook_events`. Tests the unhandled-event path from AC-1.
      - **NEW dispatcher-throws test** — handler-throws scenario (simulate via `vi.mocked(dispatchWebhookEvent).mockRejectedValueOnce(...)` OR mock the underlying handler to throw); dispatcher's top-level try-catch catches it → returns `{ ok: false, status: 500 }` → route returns 500. Tests the safety-net wrapper from AC-10.
    - **`src/db/queries/bookings.test.ts`** extension (NEW — ~3 parameterized test groups for the new helpers):
      1. `markBookingConfirmedAndCapturedByPaymentIntent` happy path + conditional-WHERE no-op (combined into 1 parameterized table — 2-3 vitest cases).
      2. `markBookingRejectedAndVoidedByPaymentIntent` same shape (1 parameterized table).
      3. `getBookingByPaymentIntentId` happy + not-found (combined into 1 test, 2 vitest cases).
      4. `deleteAbandonedBookingByCheckoutSession` happy + 3-condition WHERE no-op on each of (status mismatch / payment_status mismatch / id mismatch) — combined into 1 parameterized test that exercises the safety net (4 vitest cases). **Test this one carefully** — the 3-condition WHERE is the production safety net against deleting the wrong row.
    - **Target unit-test count after this story:** 357 (baseline at end of Story 9-4) + ~10-12 = **~367-369**. Dev-agent may ship +1-3 bonus per the 9-1 / 9-2 / 9-2b / 9-3 / 9-4 +N-bonus pattern; document any divergence in DAR.
    - **Mock pattern reminder:** split-by-mock-boundary, **3 layers** in 9-5: route → `@/lib/payments/webhooks` boundary; handler → `@/db/queries/*` boundary; query → `@/db/client` boundary. Do NOT cross.
    - **Anti-pattern enforced:** do NOT write integration tests that hit a real Stripe webhook endpoint. Do NOT skip the dispatcher-unknown-event test (regression guard for the unhandled-event path). Do NOT delete the existing 9-2 / 9-3 webhook route tests — preserve them through the refactor (mocks shift; assertions stay).

13. **AC-13 (0 new E2E tests — target stays at 61).** Per BA Decision §14:
    - **Locked: 0 new E2E tests in 9-5.** Target stays at **61** (post-9-4 baseline).
    - Rationale: webhooks fire from Stripe's servers to our `/api/stripe/webhook` endpoint. Playwright can't simulate this without `stripe trigger` in the test runner (significant CI lift) or forged-signature POSTs (anti-pattern per Decision §14). Handler logic is unit-tested via the boundary split in AC-12; BA verifies end-to-end via `stripe listen` + manual dashboard actions per AC-15.
    - **Anti-pattern enforced:** do NOT POST forged signatures from E2E. Do NOT skip signature verification "for testing" — production behavior must match test behavior. Do NOT add `stripe` CLI as a CI dependency in 9-5.

14. **AC-14 (Memory file extension).** Per BA Decision §15:
    - Extend out-of-tree `~/.claude/.../memory/reference_stripe_service_pattern.md` with a new section "Story 9-5 additions — Webhook Dispatch Generalization" covering:
      - **Dispatcher pattern:** `WEBHOOK_HANDLERS` map + `dispatchWebhookEvent(event)` entry point in `src/lib/payments/webhooks.ts`. The route handler becomes thin (signature + idempotency + dispatch); business logic lives in handlers.
      - **Sub-module pattern carry-forward:** 4th sub-module after `connect.ts` (9-2) / `checkout.ts` (9-3) / `payment-intents.ts` (9-4). Future stories' sub-modules: `refunds.ts` (9-6) / `payouts.ts` (9-7).
      - **Defensive 3-stage try-catch wrapper:** load-bearing pattern from the 9-2 BA-walk fix; preserved per-handler in 9-5. Logs `error.message` + `error.cause` separately to capture Drizzle's collapsed PG error. Top-level dispatcher try-catch is a safety net (NOT the primary error path).
      - **Idempotency two-layer pattern:** centralized check at route entry; per-handler insert at handler end (only on first real handle). Partial-failure recovery via Stripe retry + conditional WHERE — DB state ends correct, audit-trail gap accepted for capture/void/cleanup paths.
      - **Forward-looking flag for Story 9-6 (refund flow):** the audit-gap trade-off is acceptable for capture/void/cleanup (state transitions with no money movement) but NOT for refunds (money-outbound to the customer; compliance/finance/tax audit needs traceability). 9-6's decision doc should reconsider whether the refund handler specifically needs transactional write-with-rollback semantics, with retry-of-the-whole-operation as the recovery mode rather than the audit-gap pattern that 9-5 carries forward.
      - **Lookup-by-PI pattern:** new `getBookingByPaymentIntentId` + `markBooking*ByPaymentIntent` helpers parallel the by-id 9-4 helpers; the difference is the join column. Webhooks key on PI id (the Stripe-side resource), not on metadata `bookingId` (except the expired handler, which has no PI to key on).
      - **Webhook-as-backstop semantic:** the webhook handler completes the FULL state transition the action would have made, not just a partial sync. Closes the 9-4-documented narrow ops window where Stripe-succeeds-then-DB-fails leaves the booking stuck.
      - **3-condition WHERE for orphan-DELETE:** `status='PENDING' AND payment_status='AWAITING_PAYMENT' AND id=$bookingId`. Any one condition missing opens a path to deleting the wrong row. Pattern for any future story that needs to safely DELETE state-machine rows.
      - **Unknown-event-types pattern:** `200 OK { handled: false }` without `webhook_events` insert. Keeps the audit log clean for future stories to backfill. Flip side: `customer.created` (or any Stripe event not in our map) will surface as `stripe_webhook_unhandled_event` at INFO level — ops should expect to see this frequently in dev.
      - **Out-of-scope events explicit list:** `payment_intent.payment_failed` (Phase 3 or 9-6) / `charge.refunded` (9-6) / `payout.paid` (9-7).
      - **Test pattern split-by-mock-boundary, 3 layers:** route → `@/lib/payments/webhooks`; handler → `@/db/queries/*`; query → `@/db/client`.
    - Update `~/.claude/.../memory/MEMORY.md` index entry's one-liner.
    - **No new memory file** — extend the existing reference.

15. **AC-15 (Single commit + BA browser walk via `stripe listen` + docs follow-up after BA greenlight).** Per the Story 5-1 → 9-4 established pattern:
    - All Story 9-5 changes land in a single commit on `main` titled `feat(stripe): Story 9-5 — webhook dispatch generalization`. (Matches the `feat(stripe):` scope from 9-1 + 9-2 + 9-2b + 9-3 + 9-4.)
    - A small follow-up `docs:` commit fills in the Change Log hash + records BA greenlight + flips sprint-status from `review` → `done` after push (same pattern as 9-1 / 9-2 / 9-2b / 9-3 / 9-4).
    - Memory entry lives in `~/.claude/.../memory/` (out-of-tree, NOT staged).
    - **BA browser walk (stop bar):**
      1. All unit tests pass — target **~367-369** (357 baseline + ~10-12 new). Document any divergence (+N bonus) in DAR.
      2. All E2E tests pass — target **61** (unchanged from 9-4 baseline; 0 new). Restart `pnpm dev` first + re-run `pnpm db:seed` if any DB state is suspect. Pre-existing 5 hazards + the 9-3 cross-file Connect-row race may still surface — flag if anything new joins them.
      3. `pnpm typecheck` + `pnpm lint` clean.
      4. `pnpm build` — **41 routes unchanged** (zero new routes; 9-5 is a pure refactor + sub-module extraction).
      5. `git diff --stat` matches AC-16. Zero entries in `src/lib/stripe*`, the other three payments sub-modules (`connect.ts`, `checkout.ts`, `payment-intents.ts`), email infrastructure, schema/migrations, the booking buttons + tables, `src/lib/toast.ts`, or `scripts/seed.ts`.
      6. **`stripe listen` setup**: start `stripe listen --forward-to localhost:3000/api/stripe/webhook` in a side terminal. Note the **fresh** `STRIPE_WEBHOOK_SECRET` value the CLI prints — this is DIFFERENT from any dashboard-webhook secret and must be set in `.env.local` for the BA walk session. Restart `pnpm dev` after setting it.
      7. **`account.updated` walk (regression):** toggle `owner@deskhive.local`'s Connect account state via the Stripe dashboard (e.g., go to Connect → connected accounts → flip a setting that fires `account.updated`). Verify: `webhook_events` row inserted; `stripe_connect_accounts` row updated; log shows `stripe_webhook_account_lookup_failed` / `stripe_webhook_upsert_failed` did NOT fire; behavior matches the pre-9-5 9-2 path exactly.
      8. **`checkout.session.completed` walk (regression):** start a 9-3 Stripe Checkout flow as `guest@deskhive.local`; complete the payment (test card `4242 4242 4242 4242`). Verify: `webhook_events` row inserted; booking row transitioned to `(PENDING, AUTHORIZED, payment_intent_id='pi_...')`; behavior matches the pre-9-5 9-3 path exactly.
      9. **`payment_intent.succeeded` walk (NEW backstop):** sign in as `owner@deskhive.local` → `/owner/bookings` → click Confirm on the booking from step 8. The 9-4 action will capture the PI + write `(CONFIRMED, CAPTURED)` to the DB. Stripe will ALSO fire `payment_intent.succeeded` to the webhook. Verify: the second-layer handler's conditional WHERE sees the row already in `(CONFIRMED, CAPTURED)` → returns `{ idempotent: true }` → log shows `stripe_webhook_payment_intent_succeeded_already_captured` → `webhook_events` row NOT inserted (idempotent path). The handler is correctly a no-op when the 9-4 action wins the race.
      10. **`payment_intent.canceled` walk (NEW backstop):** start a SECOND 9-3 Checkout flow + complete payment → click Reject in `/owner/bookings`. Same pattern as step 9 but for the cancel path. Log shows `stripe_webhook_payment_intent_canceled_already_voided`.
      11. **`checkout.session.expired` walk (NEW orphan-cleanup):** start a THIRD 9-3 Checkout flow but ABANDON it (close the Stripe-hosted Checkout tab without completing payment). Wait for Stripe to fire `checkout.session.expired` (~30 minutes in test mode — may need `stripe trigger checkout.session.expired` to short-circuit). Verify: orphan row in `(PENDING, AWAITING_PAYMENT)` deleted from `bookings`; `webhook_events` row inserted; log shows the orphan delete fired. **Alternate verification path** if 30-min wait is impractical: directly insert a Phase-2-shape orphan row + use `stripe trigger checkout.session.expired --override checkout_session:metadata.bookingId=<orphan-id>`. **Document in DAR** which path was taken.
      12. **Dispatcher-unknown-event walk:** use `stripe trigger customer.created` (or any event type not in our map). Verify: webhook endpoint returns `200 { handled: false }`; log shows `stripe_webhook_unhandled_event`; `webhook_events` row NOT inserted.
      13. **Operator prereq from Decision §16:** `owner@deskhive.local`'s Connect row should be in the real test-mode state (not synthetic) for the BA walk's payment_intent.succeeded path to verify real fund settlement. Same prereq carried forward from 9-4 BA walk.

16. **AC-16 (`git diff` scope — bounded per Decision §16).**
    - All changes confined to:
      - `deskhive/src/app/api/stripe/webhook/route.ts` — slim down from 329 lines to ~120; preserve signature verification + idempotency check + dispatch + `webhook_events` insert on `{ handled: true }`
      - `deskhive/src/app/api/stripe/webhook/route.test.ts` — refactor existing 4 tests to mock at `@/lib/payments/webhooks` boundary + add 2 new dispatcher tests
      - `deskhive/src/lib/payments/webhooks.ts` (new) — dispatcher map + 5 handler functions + internal `errMessage` / `errCause` helpers
      - `deskhive/src/lib/payments/webhooks.test.ts` (new) — 6 handler unit tests
      - `deskhive/src/db/queries/bookings.ts` — add 4 new helpers (`getBookingByPaymentIntentId`, `markBookingConfirmedAndCapturedByPaymentIntent`, `markBookingRejectedAndVoidedByPaymentIntent`, `deleteAbandonedBookingByCheckoutSession`)
      - `deskhive/src/db/queries/bookings.test.ts` (new or extension) — ~3 parameterized test groups for the new helpers
      - `_bmad-output/implementation-artifacts/sprint-status.yaml`
      - `_bmad-output/implementation-artifacts/9-5-webhook-dispatch-generalization.md` (this file)
      - Memory files in `~/.claude/.../memory/` (out-of-tree)
    - **Zero changes to:**
      - `deskhive/src/lib/stripe.ts` (Story 9-1's singleton)
      - `deskhive/src/lib/stripe-service.ts` (Story 9-1's barrel)
      - `deskhive/src/lib/payments/connect.ts` (Story 9-2's wrappers)
      - `deskhive/src/lib/payments/checkout.ts` (Story 9-3's wrappers)
      - `deskhive/src/lib/payments/payment-intents.ts` (Story 9-4's wrappers)
      - `deskhive/src/actions/booking.ts` (Story 9-4's confirm/reject — webhook is the backstop, not a parallel path)
      - `deskhive/src/actions/booking-with-payment.ts` (Story 9-3's create-with-payment)
      - `deskhive/src/db/schema.ts` (no schema changes in 9-5)
      - `deskhive/drizzle/migrations/*` (no migrations in 9-5)
      - `deskhive/src/lib/email*` / `deskhive/src/lib/email-templates/` (Story 8-4 wires up payment-driven emails AFTER 9-5)
      - `deskhive/src/app/(owner)/owner/*` / `deskhive/src/app/admin/*` (no UI changes)
      - `deskhive/src/lib/toast.ts` (no new toasts)
      - `deskhive/scripts/seed.ts` (no seed changes)
      - `deskhive/.env.example` (no new env vars)

## Tasks / Subtasks

- [x] **Task 0 — Prep + 9-4 baseline check + operator state verification.**
  - Verify baseline CI clean: `pnpm typecheck` / `lint` / `test` (357 expected) / `build` (41 routes expected) / `test:e2e` (61 expected, modulo the documented hazards).
  - Confirm Story 9-4 is at `done` on `main` (`git log --oneline` shows `32dd63a` + `d866e33`).
  - Re-read [docs/design/9-5-webhook-dispatch-generalization-ba-decisions.md](docs/design/9-5-webhook-dispatch-generalization-ba-decisions.md) end-to-end (16 locked decisions).
  - Inspect [src/app/api/stripe/webhook/route.ts](deskhive/src/app/api/stripe/webhook/route.ts) (current 329-line shape) — re-read both the `account.updated` branch (lines 104–173, 9-2) and the `checkout.session.completed` branch (lines 200–303, 9-3) carefully. Catalog: every log key, every error-message string, every conditional return shape. The migrations in AC-3 + AC-4 must preserve ALL of this verbatim.
  - Inspect [src/lib/payments/payment-intents.ts](deskhive/src/lib/payments/payment-intents.ts) (9-4) + [src/lib/payments/checkout.ts](deskhive/src/lib/payments/checkout.ts) (9-3) + [src/lib/payments/connect.ts](deskhive/src/lib/payments/connect.ts) (9-2) for the sub-module pattern that `webhooks.ts` mirrors (file-header docstring + export shape + internal helper conventions).
  - Inspect [src/db/queries/bookings.ts](deskhive/src/db/queries/bookings.ts):
    - 9-3's `markBookingAuthorized` (~lines 177–215) as the template for `markBookingConfirmedAndCapturedByPaymentIntent` + `markBookingRejectedAndVoidedByPaymentIntent`.
    - 9-4's `markBookingConfirmedAndCaptured` + `markBookingRejectedAndVoided` (by-id) as the conditional-WHERE template for the new by-PI helpers (differs only in the join column).
    - Confirm Drizzle's `db.delete(bookingsTable).where(and(...)).returning()` shape for `deleteAbandonedBookingByCheckoutSession` — returns array of deleted rows; `.length > 0` is the "deleted" signal.
  - Inspect [src/app/api/stripe/webhook/route.test.ts](deskhive/src/app/api/stripe/webhook/route.test.ts) — read the existing 4 tests (2 from 9-2 + 2 from 9-3) so the refactor in AC-12 knows what to preserve.
  - Verify `stripe listen` is available locally for the BA walk: `stripe --version`.
  - Optional: check if there are orphan `(PENDING, AWAITING_PAYMENT)` rows in the DB right now (`SELECT id, status, payment_status, created_at FROM bookings WHERE status='PENDING' AND payment_status='AWAITING_PAYMENT';`). If yes, those become natural BA-walk targets for the `checkout.session.expired` verification per AC-15 step 11.

- [x] **Task 1 — New sub-module `src/lib/payments/webhooks.ts` skeleton** (AC-2 + AC-9 + AC-10):
  - Create [src/lib/payments/webhooks.ts](deskhive/src/lib/payments/webhooks.ts) with the file-header docstring (matching the convention of `connect.ts` / `checkout.ts` / `payment-intents.ts`) + the `WebhookHandlerResult` type + the `WEBHOOK_HANDLERS` map skeleton (function names referenced, bodies stub-only) + the `dispatchWebhookEvent(event)` function with the top-level safety-net try-catch + the internal `errMessage` / `errCause` helpers (moved verbatim from the route file).
  - Map all 5 event types up-front so the dispatcher's `WEBHOOK_HANDLERS[event.type]` lookup compiles even with stub handlers.

- [x] **Task 2 — Migrate `account.updated` handler (behavior-preserving)** (AC-3 + AC-10 + AC-11):
  - Implement `handleAccountUpdated(event)` inside `webhooks.ts` by moving the current route file's `account.updated` branch (lines 104–173) verbatim, with two structural changes:
    - Return `WebhookHandlerResult` shapes instead of `Response` objects (`{ ok: true, deferred: true }` instead of `Response.json({ received: true, deferred: true }, { status: 200 })`; `{ ok: true, handled: true }` for the success path; `{ ok: false, status: 500, message }` for the error paths).
    - The `db.insert(webhookEventsTable)` block (currently at lines 152–170) is REMOVED from the handler — that responsibility moves to the route (AC-1) on `{ handled: true }`.
  - All log keys preserved verbatim. All error messages preserved verbatim. The 3-stage try-catch wrappers (lookup → upsert) stay in place.

- [x] **Task 3 — Migrate `checkout.session.completed` handler (behavior-preserving)** (AC-4 + AC-10 + AC-11):
  - Implement `handleCheckoutSessionCompleted(event)` inside `webhooks.ts` by moving the current route file's `checkout.session.completed` branch (lines 200–303) verbatim, with the same two structural changes as Task 2.
  - All log keys preserved verbatim. The `markBookingAuthorized` conditional WHERE semantics stay (idempotent return → `{ ok: true, idempotent: true }`).

- [x] **Task 4 — NEW `handlePaymentIntentSucceeded`** (AC-5 + AC-10 + AC-11):
  - Implement the handler per the AC-5 spec. Lookup by `paymentIntent.id` via `getBookingByPaymentIntentId` (new helper, see Task 7); conditional UPDATE via `markBookingConfirmedAndCapturedByPaymentIntent` (new helper, see Task 7).
  - 3-stage try-catch around the lookup + the update. New log keys per AC-11.

- [x] **Task 5 — NEW `handlePaymentIntentCanceled`** (AC-6 + AC-10 + AC-11):
  - Mirror of Task 4 with `markBookingRejectedAndVoidedByPaymentIntent` (new helper, see Task 7).

- [x] **Task 6 — NEW `handleCheckoutSessionExpired`** (AC-7 + AC-10 + AC-11):
  - Implement the handler per the AC-7 spec. Lookup by `session.metadata.bookingId` (different join column from Tasks 4/5 — Checkout Session ID has no booking-side equivalent column, so metadata is the join); conditional DELETE via `deleteAbandonedBookingByCheckoutSession` (new helper, see Task 7) with the 3-condition WHERE.
  - Single try-catch around the delete (no separate lookup step — DELETE-with-conditional-WHERE handles both the find + delete atomically).

- [x] **Task 7 — 4 new `bookings` query helpers** (AC-8):
  - Edit [src/db/queries/bookings.ts](deskhive/src/db/queries/bookings.ts). Add:
    1. `getBookingByPaymentIntentId(paymentIntentId): Promise<Booking | undefined>` — `db.select().from(bookingsTable).where(eq(bookingsTable.paymentIntentId, paymentIntentId)).limit(1)` + destructure to first row.
    2. `markBookingConfirmedAndCapturedByPaymentIntent(paymentIntentId): Promise<Booking | undefined>` — conditional UPDATE with WHERE `(payment_intent_id=$1 AND status='PENDING' AND payment_status='AUTHORIZED')` → SET `(status='CONFIRMED', payment_status='CAPTURED', updated_at=now())` + `.returning()`.
    3. `markBookingRejectedAndVoidedByPaymentIntent(paymentIntentId): Promise<Booking | undefined>` — mirror with `(REJECTED, VOIDED)`.
    4. `deleteAbandonedBookingByCheckoutSession(bookingId): Promise<boolean>` — conditional DELETE with WHERE `(id=$1 AND status='PENDING' AND payment_status='AWAITING_PAYMENT')` + `.returning({ id: bookingsTable.id })` + return `result.length > 0`.

- [x] **Task 8 — Refactor `src/app/api/stripe/webhook/route.ts` to thin shell** (AC-1 + AC-9):
  - Slim the file from 329 lines to ~120. Keep: env check + header check + raw body read + `stripe.webhooks.constructEvent` + Layer 1 idempotency check + call `dispatchWebhookEvent(event)` + result-to-Response translation + Layer 2 `webhook_events` insert on `{ handled: true }`.
  - Remove: all the `if (event.type === 'account.updated') { ... }` / `if (event.type === 'checkout.session.completed') { ... }` branches; the `errMessage` / `errCause` helpers (now in `webhooks.ts`).
  - Preserve all route-level log keys verbatim.

- [x] **Task 9 — Refactor `src/app/api/stripe/webhook/route.test.ts` + add dispatcher tests** (AC-12):
  - Update the existing 4 tests (2 `account.updated` + 2 `checkout.session.completed`) to mock at `@/lib/payments/webhooks` boundary via `vi.mock('@/lib/payments/webhooks')`. The assertion lists for each test do NOT change; only the internal mock shifts.
  - Add 2 NEW dispatcher-level tests:
    - Unknown event type → 200 + handled:false + no insert.
    - Handler throws → safety-net wrapper → 500.
  - Verify mock-pattern split: route tests mock at `@/lib/payments/webhooks`; handler tests (Task 10) mock at `@/db/queries/*`; query tests (Task 11) mock at `@/db/client`.

- [x] **Task 10 — Handler unit tests `src/lib/payments/webhooks.test.ts`** (AC-12):
  - Create [src/lib/payments/webhooks.test.ts](deskhive/src/lib/payments/webhooks.test.ts) with the 6 handler tests per AC-12.
  - `vi.mock('@/db/queries/bookings')` + `vi.mock('@/db/queries/stripe-connect')` at the top.
  - Each test constructs a synthetic `Stripe.Event` (use `Partial<Stripe.PaymentIntent>` / `Partial<Stripe.Checkout.Session>` + cast — same trick the existing 9-3 webhook tests use).
  - Verify the right query helpers were called (or NOT called) on each branch.

- [x] **Task 11 — Query helper unit tests `src/db/queries/bookings.test.ts`** (AC-12):
  - Create or extend [src/db/queries/bookings.test.ts](deskhive/src/db/queries/bookings.test.ts) with the ~3 parameterized test groups per AC-12. The `deleteAbandonedBookingByCheckoutSession` 3-condition WHERE test is especially important — exercise EACH of the 3 mismatch paths individually.
  - Mock at `@/db/client` boundary (`vi.mock('@/db/client')`).

- [x] **Task 12 — Local CI parity + `git diff` verification + manual smoke test** (AC-15 + AC-16):
  - `pnpm typecheck` clean.
  - `pnpm lint` clean.
  - `pnpm test` — target **~367-369** (357 baseline + ~10-12 new).
  - `pnpm build` — **41 routes** (unchanged).
  - `pnpm test:e2e` — **61** (unchanged; 0 new).
  - `git diff --stat` matches AC-16 file list. Zero entries in the carved-out files (Stripe singleton, the other three payments sub-modules, action files, schema/migrations, email infrastructure, UI files, toast.ts, seed.ts).
  - Quick smoke test: `pnpm dev` running, `stripe listen --forward-to localhost:3000/api/stripe/webhook` in a side terminal. Trigger a synthetic event via `stripe trigger account.updated` and verify the local dev log shows `stripe_webhook_account_lookup_failed` OR `stripe_webhook_account_not_found` OR (if a matching connect-row exists) the upsert + `webhook_events` insert paths fire. AC-15 §6–§13 (full BA browser walk including all 5 handler scenarios + dispatcher-unknown-event + the 3-condition WHERE verification) is DEFERRED to BA's review pass per the precedent.

- [x] **Task 13 — Memory + sprint-status + Dev Agent Record + single commit (no push)** (AC-14 + AC-15):
  - Extend `~/.claude/.../memory/reference_stripe_service_pattern.md` with the Story 9-5 section per AC-14.
  - Update `~/.claude/.../memory/MEMORY.md` index entry's one-liner.
  - Update `_bmad-output/implementation-artifacts/sprint-status.yaml`: `9-5-webhook-dispatch-generalization: review`; update `last_updated` parenthetical.
  - Update this story file: `Status: ready-for-dev` → `Status: review`; mark Tasks 0–12 `[x]` (Task 12's BA-walk DEFERRED note stays); fill in Dev Agent Record.
  - Stage all files per AC-16.
  - Commit: `feat(stripe): Story 9-5 — webhook dispatch generalization`.
  - **Do NOT push.** Wait for BA browser-verification per Task 12 + AC-15 §6–§13 before pushing.
  - After BA greenlight: push, then add a small `docs:` follow-up commit to flip sprint-status to `done` (same pattern as 9-1 / 9-2 / 9-2b / 9-3 / 9-4).

## Dev Notes

### What gets built and what's deliberately out of scope

Story 9-5 is the **webhook generalization** of Theme B. It's primarily a refactor: take the 329-line route file with 2 narrow handlers and slim it to a ~120-line shell delegating to a new sub-module `src/lib/payments/webhooks.ts` (4th Theme B sub-module). On top of the refactor, 3 NEW handlers land:

1. `payment_intent.succeeded` — backstop for 9-4's narrow ops window (Stripe-capture-succeeds-but-DB-write-fails).
2. `payment_intent.canceled` — backstop for 9-4's reject path (same shape).
3. `checkout.session.expired` — orphan-cleanup for 9-3's abandoned pre-claims (with a 3-condition safety-net WHERE).

After 9-5 lands at `review` and BA greenlights:

- The `/api/stripe/webhook` endpoint dispatches 5 event types via a typed `WEBHOOK_HANDLERS` map.
- Stories 9-6 (refund `charge.refunded`) and 9-7 (`payout.paid`) extend the dispatcher map by adding one handler function + one map entry. The current 329-line monolith is gone.
- The narrow ops window 9-4 documented is closed — if the 9-4 action's DB write fails after a successful Stripe capture, the `payment_intent.succeeded` webhook handler fires and completes the booking transition.
- Orphan `PENDING + AWAITING_PAYMENT` bookings from abandoned 9-3 Checkout flows get cleaned up via the `checkout.session.expired` webhook (after Stripe's ~30-minute Session expiration). The DOUBLE_BOOKING-from-own-orphan problem the BA has been seeing in their actual DB right now is structurally fixed.
- The 9-2 BA-walk-fix defensive 3-stage try-catch pattern is preserved verbatim across the migration — load-bearing for ops debugging.

Feature scope (Story 9-5 only):
- ✅ Refactor `src/app/api/stripe/webhook/route.ts` to thin route shell (signature + idempotency + dispatch + insert-on-handled).
- ✅ New sub-module `src/lib/payments/webhooks.ts` with `WEBHOOK_HANDLERS` map + 5 handler functions + `dispatchWebhookEvent` entry + internal helpers.
- ✅ Behavior-preserving migration of `account.updated` (9-2) + `checkout.session.completed` (9-3) into the sub-module.
- ✅ NEW `payment_intent.succeeded` handler.
- ✅ NEW `payment_intent.canceled` handler.
- ✅ NEW `checkout.session.expired` handler with 3-condition safety-net WHERE.
- ✅ 4 new `bookings` query helpers.
- ✅ Two-layer idempotency preserved.
- ✅ Per-handler 3-stage try-catch + top-level dispatcher safety-net wrapper.
- ✅ Structured logging with handler-name-prefixed keys (existing keys preserved verbatim; new keys for the 3 new handlers).
- ✅ ~10-12 new unit tests across handler + dispatcher + query helpers; existing route tests refactored to the new mock boundary.
- ✅ Memory entry extension.

Out of scope (do NOT build):
- ❌ `charge.refunded` handler — Story 9-6 (refund flow).
- ❌ `payout.paid` handler — Story 9-7 (`/owner/payouts` view).
- ❌ `payment_intent.payment_failed` handler — Phase 3 backlog OR Story 9-6 picks up. **9-5 leaves this in the "unhandled" path explicitly.**
- ❌ Payment-driven email sends (receipt on capture, refund email, payout email) — Story 8-4 wires up AFTER 9-5's dispatch lands.
- ❌ Webhook retry-after-backoff custom logic — Stripe handles retries server-side; 9-5 trusts Stripe's built-in retry behavior.
- ❌ Webhook event audit table beyond `webhook_events` — out of Phase 2 scope.
- ❌ Migration to a queue-based handler dispatch (e.g., Stripe → Inngest → handler) — Phase 3 if ever.
- ❌ `stripe.paymentIntents.retrieve` from inside the handlers — webhook payload is the source of truth.
- ❌ Phase 1 backwards-compat path — webhooks ONLY fire on real Stripe-side events, which only exist for Phase 2 bookings.
- ❌ Schema migrations — pure refactor + new in-app code; zero schema changes.
- ❌ Frontend Stripe SDK (`@stripe/stripe-js`) — never needed for Theme B.
- ❌ New E2E tests — 0 new; rely on unit tests + `stripe listen` BA walk.

### Key decisions baked into the spec

1. **Dispatcher map in a single file (Option C from Decision §1).** Not single-route-handler-with-switch (would violate sub-module pattern) and not handlers-as-files (over-ceremony for Phase 2 scale). The `WEBHOOK_HANDLERS` map + per-handler functions co-located in `webhooks.ts` is the locked shape.

2. **`src/lib/payments/webhooks.ts` as the 4th Theme B sub-module** (Decision §2). Continues the convention from `connect.ts` (9-2) / `checkout.ts` (9-3) / `payment-intents.ts` (9-4).

3. **Behavior-preserving migration of the 2 existing handlers** (Decisions §3 + §4). The 9-2 BA-walk-fix 3-stage try-catch pattern is LOAD-BEARING and MUST be preserved verbatim. Existing log keys MUST NOT be renamed (silently breaks ops dashboards).

4. **Lookup-by-PI for the new PI handlers** (Decision §5). `bookings.payment_intent_id` is the column 9-3 created for exactly this join. Metadata-`bookingId` is technically equivalent but adds a fragile dependency on metadata preservation through the PI lifecycle.

5. **Webhook completes the FULL state transition** (Decision §5). Not just a partial sync of `payment_status` — both `status` and `payment_status` flip atomically. The handler is the backstop for the 9-4 action's DB write failure, so it has to do the same DB work the action would have done.

6. **3-condition safety-net WHERE for the orphan-DELETE** (Decision §5 + §11). `status='PENDING' AND payment_status='AWAITING_PAYMENT' AND id=$bookingId`. Any one condition missing opens a path to deleting the wrong row. The combination matches ONLY the pre-claimed-but-abandoned shape.

7. **DELETE (not UPDATE-to-CANCELLED) for the orphan path** (Decision §5). The booking was never visible to the Guest; a CANCELLED row would clutter their `/my-bookings` history with a non-event.

8. **Two-layer idempotency preserved** (Decision §6). Layer 1 centralized at route entry; Layer 2 per-handler-result at the route's response time. Partial-failure recovery via Stripe retry + conditional WHERE — DB state ends correct; audit-trail gap accepted (forward-flagged for 9-6 reconsider for refund-specific transactional semantics).

9. **Signature verification stays at route entry** (Decision §7). Raw body is route-level state — once consumed it can't be re-read. Pushing verification into the sub-module would invert the dependency.

10. **Per-handler 3-stage try-catch + dispatcher safety-net wrapper** (Decisions §4 + §8). Per-stage attribution is what the 9-2 BA-walk fix specifically introduced — losing it would lose the breadcrumb trail. Top-level dispatcher try-catch is the should-never-happen safety net.

11. **Structured logging with handler-name-prefixed keys** (Decision §9). Existing keys preserved verbatim (load-bearing); new keys for the 3 new handlers follow the same convention.

12. **Unknown event types return 200 OK + `handled: false` without `webhook_events` insert** (Decision §10). Keeps the audit log clean for 9-6 / 9-7 to backfill when they ship.

13. **4 new query helpers** (Decision §11). 3 by-PI helpers paralleling 9-4's by-id ones (different join column only); 1 expired-cleanup DELETE helper with 3-condition safety-net WHERE.

14. **0 new E2E tests** (Decision §14). Webhooks can't be Playwright-tested without `stripe trigger` in the test runner (significant CI lift) or forged signatures (anti-pattern). Unit tests + `stripe listen` BA walk cover the verification.

### Test-count baseline alignment

Decision §13 cites "357 baseline + ~10-12 = ~367-369 unit tests". The 357 baseline is the post-9-4 actual (`pnpm test` output at commit `32dd63a`: `357 passed | 1 skipped`).

E2E baseline: 61 (post-9-4 actual). +0 new → target **61** (unchanged).

Build route count: 41 (post-9-3 actual; 9-4 added 0 routes). 9-5 also adds ZERO routes — the refactor + new sub-module are server-side internal; the route at `/api/stripe/webhook` is unchanged.

### Sprint status update

`_bmad-output/implementation-artifacts/sprint-status.yaml` — add `9-5-webhook-dispatch-generalization: ready-for-dev` to Epic 9's section (after `9-4-confirm-reject-capture-cancel: done`). On move-to-review (Task 13), flip to `review`. On BA greenlight (post-push), flip to `done`.

### Recent commits (Epic 9 chain)

```
38d8c6b docs: lock Story 9-5 BA decisions (webhook dispatch generalization)  ← THIS STORY's source-of-truth lock
d866e33 chore: mark Story 9-4 done in sprint status
32dd63a feat(stripe): Story 9-4 — confirm/reject with capture/cancel    ← Story 9-4 ship
1292e7e chore: dispatch Story 9-4 (ready-for-dev)
4f73cf3 docs: lock Story 9-4 BA decisions (confirm/reject with capture/cancel)
9401ad4 chore: mark Story 9-3 done in sprint status
8035907 fix(payments): move revalidatePath out of return-URL Server Component render path
bd76dc3 feat(stripe): Story 9-3 — booking with payment
```

Story 9-5 is the **sixth Epic 9 feature commit** (after 9-1, 9-2, 9-2's BA-walk fix, 9-2b, 9-3, 9-3's BA-walk fix, and 9-4). Subject: `feat(stripe): Story 9-5 — webhook dispatch generalization`.

### Forward-looking notes preserved

- **Story 9-6 refunds absorbs `charge.refunded` into the dispatcher map.** Adds a `refunds.ts` sub-module + a `markBookingRefundedByPaymentIntent` helper. The 9-5 dispatcher's extensibility is the load-bearing seam — adding a new handler = one new function + one new map entry. Forward-flag: 9-6 may also reconsider whether `payment_intent.payment_failed` is needed (Phase 3 deferral OR 9-6 picks up).
- **Story 9-6 may need transactional write-with-rollback for the refund handler.** The 9-5 audit-gap trade-off (partial-failure recovery via retry + conditional WHERE; `webhook_events` row gap on retry) is acceptable for capture/void/cleanup (state transitions without money outbound). Refunds are money-outbound to the customer; compliance/finance/tax audit needs traceability from "refund initiated" through to "webhook acknowledged in `webhook_events`." 9-6's decision doc should pick this up as a load-bearing decision; 9-5 explicitly does NOT touch transactional semantics.
- **Story 9-7 payouts absorbs `payout.paid` into the dispatcher.** Same one-new-function + one-new-map-entry shape. 9-7 also lands the `/owner/payouts` view that consumes the data.
- **Story 8-4 payment-driven emails depends on 9-5's dispatch being stable.** Each handler will be extended (in 8-4, NOT in 9-5) to call `sendPaymentCapturedEmail(...)` etc. after the DB write. The split: 9-5 makes the dispatch seam; 8-4 wires the emails. The "don't trigger email sends from inside database transactions" anti-pattern (PRD §6.5) is satisfied because webhook handlers don't use transactions.
- **`webhook_events` table volume grows in 9-5.** Currently rare (9-2 only inserts on Connect changes; 9-3 only inserts on Checkout completes). After 9-5 + 9-4-action wins races, every successful booking flow generates 1× `checkout.session.completed` row (current) + the `payment_intent.succeeded` event fires but the handler returns `idempotent: true` (no extra row) when 9-4 wins. If the 9-4 action's DB write fails (narrow window), the webhook backstop's row IS inserted — 1 row per recovered booking. Phase 2 demo flow is single-user; theoretical at scale.
- **Phase 2 PRD §4.5 cancel-interpretation** — still flagged for Story 9-6 (the refund flow makes the CONFIRMED-cancel interpretation load-bearing). 9-5 doesn't touch it.
- **The 9-3 BA-walk booking `92bd9829-...` was captured during the 9-4 BA walk** — it's now in `CONFIRMED + CAPTURED` state. For 9-5's BA walk per AC-15 §8/§9/§10, BA needs to create FRESH bookings via the 9-3 Stripe Checkout flow (multiple — one for the `payment_intent.succeeded` walk, one for the `payment_intent.canceled` walk, optionally one to abandon for the `checkout.session.expired` walk).
- **`stripe listen` setup hazard.** The CLI prints a `whsec_...` secret on startup; that secret is DIFFERENT from any dashboard-webhook secret already in `.env.local` from prior stories. BA needs to swap the env var to the `stripe listen`-printed value AND restart `pnpm dev` for the BA walk session. After the walk, BA may want to restore the original secret (or leave the dev-only `stripe listen` value in place if the dashboard webhook isn't being actively used).

### References

- [Source: docs/design/9-5-webhook-dispatch-generalization-ba-decisions.md](docs/design/9-5-webhook-dispatch-generalization-ba-decisions.md) — locked 2026-05-19 (BA: Ikhtiyor Ziyayev), committed `38d8c6b`. 16 decisions + anti-pattern rollup + operator prereqs.
- [Source: docs/03-phase2-prd.md §6.4 (Stripe Webhook Endpoint)] — PRD origin for the handled event-type list.
- [Source: docs/03-phase2-prd.md §6.5 (Architectural Anti-Patterns)] — CC-7 / NFR-3 signature verification mandate; no-email-sends-from-DB-transactions.
- [Source: deskhive/src/app/api/stripe/webhook/route.ts](deskhive/src/app/api/stripe/webhook/route.ts) — current 329-line shape; the file being refactored.
- [Source: deskhive/src/lib/payments/connect.ts](deskhive/src/lib/payments/connect.ts) + [src/lib/payments/checkout.ts](deskhive/src/lib/payments/checkout.ts) + [src/lib/payments/payment-intents.ts](deskhive/src/lib/payments/payment-intents.ts) — sub-module convention that `webhooks.ts` mirrors.
- [Source: deskhive/src/db/queries/bookings.ts](deskhive/src/db/queries/bookings.ts) — 9-3's `markBookingAuthorized` (template for by-PI conditional UPDATE) + 9-4's `markBookingConfirmedAndCaptured` / `markBookingRejectedAndVoided` (template for the by-id pattern that the by-PI helpers mirror).
- [Source: deskhive/src/db/schema.ts](deskhive/src/db/schema.ts) — `webhook_events` table (from 9-2) + `bookings_payment_status_check` constraint (extended to 4 values in 9-4). Zero changes in 9-5.
- [Source: deskhive/src/actions/booking.ts](deskhive/src/actions/booking.ts) — Story 9-4's `confirmBookingAction` + `rejectBookingAction`. Zero changes in 9-5; the webhook is the backstop, not a parallel path.
- Dev-agent memory `reference_stripe_service_pattern.md` — extend with Story 9-5 section per AC-14.
- Dev-agent memory `project_phase2_prd_4_5_cancel_interpretation.md` — unchanged; re-flag for Story 9-6.

## Dev Agent Record

### Agent Model

Claude Opus 4.7 (1M context).

### Debug Log References

- `pnpm typecheck` clean (no output).
- `pnpm lint` clean (no output).
- `pnpm test` — **378 passed + 1 skipped** (357 baseline + **+21 new** — significantly over BA's stated +10-12 target; rationale documented below). Breakdown of the +21:
  - 12 in new `src/lib/payments/webhooks.test.ts`: 6 locked handler tests per BA Decision §13 (3× handlePaymentIntentSucceeded + 2× handlePaymentIntentCanceled + 1× handleCheckoutSessionExpired-parameterized = 6) + bonus: 1× handleCheckoutSessionExpired-deferred-missing-metadata + 1× handleAccountUpdated regression coverage + 1× handleCheckoutSessionCompleted regression coverage + 2× dispatchWebhookEvent direct tests (unknown-event + safety-net-throw) = +6 bonus over the locked 6.
  - 8 in new `src/db/queries/bookings.test.ts`: 4 parameterized describe groups × 2 cases each (`getBookingByPaymentIntentId` happy/not-found, `markBookingConfirmedAndCapturedByPaymentIntent` happy/race-lost, `markBookingRejectedAndVoidedByPaymentIntent` happy/race-lost, `deleteAbandonedBookingByCheckoutSession` happy/3-condition-WHERE-no-op). The 3-condition WHERE safety net's 3 mismatch paths (status / payment_status / id) all collapse to the single "no-rows → false" case at the `@/db/client` mock boundary; the SQL composition is trusted (Drizzle typed builder).
  - +1 net in `src/app/api/stripe/webhook/route.test.ts`: existing 8 tests refactored to mock at `@/lib/payments/webhooks` boundary (assertion lists preserved in spirit; internal mocks shifted from leaf DB ops to the dispatch seam per BA Decision §13) + 2 NEW dispatcher-level tests (unknown event + handler-throws-via-mocked-result). One pre-existing test consolidated through the refactor.
- `pnpm build` — **41 routes** (unchanged from 9-4 baseline; 9-5 is a pure refactor + new sub-module — zero new routes).
- `pnpm test:e2e` — **51 passed, 5 failed, 5 did not run = 61 total** matching AC-13's unchanged target. The 5 failures are documented pre-existing hazards (admin-applications, application-emails, become-a-host × 2, booking-emails). The 9-3 cross-file Connect-row race for booking-with-payment is NOT in the failed set this run — slightly better luck of test ordering than the 9-4 walk (49 passed) but the race is fundamentally still latent.

### Completion Notes

- **Route file slimmed from 329 → 161 lines** (51% reduction). Pure routing logic post-refactor: env check + signature verification via `stripe.webhooks.constructEvent` + Layer 1 idempotency check + `dispatchWebhookEvent(event)` call + result-to-Response translation + Layer 2 `webhook_events` insert on `{ handled: true }`. Per-event handler logic + the load-bearing 3-stage try-catch wrapper from 9-2's BA-walk fix moved verbatim into `src/lib/payments/webhooks.ts`. ~120-line target from AC-1 was a strict estimate; the 161 actual reflects the verbose error-log shapes at the route level (env-missing, signature-invalid, idempotency-select-failed, webhook_events-insert-failed). Acceptable per BA's "≈" framing.
- **`src/lib/payments/webhooks.ts` is 580 lines** — sizable but well-structured. 5 handler functions + `WEBHOOK_HANDLERS` map + `dispatchWebhookEvent` + `WebhookHandlerResult` type + internal `errMessage` / `errCause` helpers. Each handler section has its own docstring block explaining the preserved/new logic. Future Theme B stories (9-6 / 9-7) extend by adding one function + one map entry.
- **Net unit-test count: +21 (BA-stated +10-12, +9 bonus)**. The overshoot is +9 over the BA estimate — significantly more than the typical +1-3 from prior stories. Rationale for shipping the bonus tests:
  - **2 regression coverage tests for the migrated handlers** (handleAccountUpdated + handleCheckoutSessionCompleted happy paths): pre-9-5 the route file's tests exercised these handlers via leaf-DB mocks; post-refactor the route mocks at the `@/lib/payments/webhooks` boundary, so without these the handler internals would be untested at the new layer. Genuine coverage gap, cheap to close.
  - **2 dispatchWebhookEvent direct tests**: the route-level test mocks `dispatchWebhookEvent` entirely; the dispatcher's own behavior (unknown-event-lookup + safety-net-try-catch-wrapping-handler-throw) wasn't directly covered. The safety-net test specifically required swapping a `WEBHOOK_HANDLERS` entry at runtime to a throwing function (test cleans up via try/finally) — the only path to exercise the real safety net since handlers' own try-catches catch everything otherwise.
  - **2 extra cases in the query helper tests** beyond the BA's tight estimate: the 4-describe-block × 2-case structure produces 8 vitest cases vs the BA's `~3 parameterized groups + 4 cases for delete` = 7-10 implicit cases. Net +1-2 cases over the inner bound; not load-bearing but cheap.
  - **1 extra `handleCheckoutSessionExpired` deferred-missing-metadata test**: BA locked happy + idempotent (parameterized = 2 cases). Added a 3rd case for the missing-metadata defer path. Tightens the contract.
- **Net E2E-test count: +0 → 61 target met unchanged.** Decision §14 locked this. Webhooks can't be Playwright-tested without `stripe trigger` in the CI runner (significant lift) or forged-signature POSTs (anti-pattern per CC-7). Verification path is unit tests at 3 mock boundaries + `stripe listen` BA walk per AC-15 §6–§13.
- **Route count: 41 unchanged.** Pure refactor + new sub-module; the route at `/api/stripe/webhook` is unchanged.
- **Two-layer idempotency + partial-failure recovery semantics**: confirmed to behave as documented. Layer 1 (centralized `SELECT FROM webhook_events`) at route entry; Layer 2 (per-handler-result `INSERT INTO webhook_events`) at route response time ONLY on `{ handled: true }`. Partial-failure scenario (handler succeeds → webhook_events insert fails → 500 → Stripe retries → next delivery hits idempotent path → no insert ever recorded): DB state is correct; audit-trail gap accepted for capture/void/cleanup paths.
- **Forward-looking flag for 9-6 (refund flow transactional semantics)**: documented in BA decisions doc Decision §6 + memory entry. 9-6's refund handler may want transactional write-with-rollback (handler's DB UPDATE + webhook_events insert in a single transaction; rollback if audit-log insert fails) since money-outbound to customer has stricter compliance/finance/tax audit traceability requirements than the state-transition paths in 9-5. 9-5 explicitly does NOT touch this — 9-6's decision doc picks it up.
- **`handleCheckoutSessionExpired` 3-condition safety-net WHERE** is the production safety against ever DELETE-ing the wrong row. At the `@/db/client` mock layer all 3 mismatch paths (status / payment_status / id) surface identically as "DB returned no rows" — the test exercises both the happy path (DB returns row) and the no-row path. The SQL composition (Drizzle's typed `and(eq(...), eq(...), eq(...))`) is trusted; the test would catch a regression that loosened the row-count check from `rows.length > 0` to e.g. `rows.length >= 0`.
- **Lookup-by-PI for the PI handlers, lookup-by-metadata.bookingId for the expired handler**: confirmed via the handler-level tests. The PI handlers' first DB call is `getBookingByPaymentIntentId(paymentIntent.id)`; the expired handler reads `session.metadata.bookingId` directly without an intermediate lookup. Different join columns because the Stripe-side resources are different (PI vs Checkout Session).
- **All existing log keys preserved verbatim**: `stripe_webhook_account_lookup_failed` / `stripe_webhook_account_not_found` / `stripe_webhook_upsert_failed` / `stripe_webhook_checkout_*` are unchanged from the pre-9-5 route file. New keys for the 9-5 handlers follow the same convention (handler-name prefix + `_lookup_failed` / `_booking_not_found` / `_update_failed` / `_already_*` / `_delete_failed` / `_no_orphan` / `_no_booking_id` patterns).
- **AC-15 §6–§13 (full BA browser walk via `stripe listen` + all 5 handler scenarios + dispatcher-unknown-event verification)** is DEFERRED to BA's review pass per the precedent. BA needs to: (1) start `stripe listen --forward-to localhost:3000/api/stripe/webhook` in a side terminal; (2) swap `STRIPE_WEBHOOK_SECRET` in `.env.local` to the CLI-printed `whsec_...` value AND restart `pnpm dev`; (3) walk the 5 handler scenarios per AC-15 §7-§11 + the dispatcher-unknown-event walk per §12. Operator prereqs from AC-15 §13 (real Connect state for owner@deskhive.local) carry forward from 9-4 BA walk.
- **`owner@deskhive.local` Connect state hazard carries forward**: the seeded Connect row resets to synthetic `acct_seed_for_e2e_only` on each `pnpm db:seed`. For the `payment_intent.succeeded` BA walk to verify real fund-settlement on the connected account, BA needs to re-onboard via `/owner/settings` before AC-15 §9. Same operational pattern documented in 9-4's DAR.

### File List

**New (in-tree):**
- `deskhive/src/lib/payments/webhooks.ts` — 580 lines: `WebhookHandlerResult` type + 5 handler functions (account.updated migrated from 9-2 + checkout.session.completed migrated from 9-3 + NEW payment_intent.succeeded + payment_intent.canceled + checkout.session.expired) + `WEBHOOK_HANDLERS` map + `dispatchWebhookEvent` entry with top-level safety-net try-catch + internal `errMessage` / `errCause` helpers (moved from the route per Decision §12)
- `deskhive/src/lib/payments/webhooks.test.ts` — 12 unit tests: 3× handlePaymentIntentSucceeded + 2× handlePaymentIntentCanceled + 3× handleCheckoutSessionExpired (happy + idempotent parameterized + deferred-missing-metadata) + 1× handleAccountUpdated regression + 1× handleCheckoutSessionCompleted regression + 2× dispatchWebhookEvent direct (unknown-event + safety-net-throw via runtime handler swap)
- `deskhive/src/db/queries/bookings.test.ts` — 8 unit tests across 4 parameterized describes for the new query helpers

**Modified (in-tree):**
- `_bmad-output/implementation-artifacts/sprint-status.yaml` — added `9-5-webhook-dispatch-generalization: review` to Epic 9; updated `last_updated` parenthetical
- `_bmad-output/implementation-artifacts/9-5-webhook-dispatch-generalization.md` — Status → review, tasks `[x]`, DAR filled in
- `deskhive/src/app/api/stripe/webhook/route.ts` — slimmed from 329 lines to **161 lines**; preserves env check + signature verification + Layer 1 idempotency check + dispatch + Layer 2 `webhook_events` insert on `{ handled: true }` + result-to-Response translation
- `deskhive/src/app/api/stripe/webhook/route.test.ts` — refactored existing 8 tests to mock at `@/lib/payments/webhooks` boundary (`dispatchWebhookEvent`) + added 2 new dispatcher-level tests (unknown-event + ok:false-result-translation). Net 9 tests after refactor.
- `deskhive/src/db/queries/bookings.ts` — added 4 new helpers: `getBookingByPaymentIntentId` (lookup by PI), `markBookingConfirmedAndCapturedByPaymentIntent` + `markBookingRejectedAndVoidedByPaymentIntent` (2-condition conditional UPDATE by PI), `deleteAbandonedBookingByCheckoutSession` (3-condition safety-net WHERE DELETE)

**Out-of-tree (memory):**
- `~/.claude/.../memory/reference_stripe_service_pattern.md` — extended with Story 9-5 section per AC-14; frontmatter `name` + `description` refreshed
- `~/.claude/.../memory/MEMORY.md` — one-liner index entry refreshed to reflect 9-5 additions

### Change Log

| Date | Change | Commit |
|---|---|---|
| 2026-05-19 | Story drafted by `bmad-create-story` from locked BA decisions document (commit `38d8c6b`). | `4b07064` |
| 2026-05-19 | Story implemented; webhook route refactored to thin shell (329 → 161 lines); new sub-module `src/lib/payments/webhooks.ts` (4th Theme B sub-module) with 5 handlers + dispatcher map + safety-net wrapper; 4 new bookings query helpers (3 by-PI + 1 orphan-DELETE with 3-condition safety-net WHERE); load-bearing 9-2 BA-walk-fix 3-stage try-catch pattern preserved verbatim across migration; +21 unit tests across handler + dispatcher + query helper layers (split-by-mock-boundary 3 layers pattern); 0 new E2E (webhooks can't be Playwright-tested per Decision §14); zero schema changes / zero action changes / zero UI changes. Memory entry extended. Single commit per AC-15 — awaiting BA browser walk via `stripe listen` before push. | _TBD (filled by `docs:` follow-up after BA greenlight + push, same pattern as Stories 9-1 + 9-2 + 9-2b + 9-3 + 9-4)_ |
