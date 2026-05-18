# Story 9-5: Webhook Dispatch Generalization — BA Decisions

**Story:** 9-5
**Epic:** 9 — Payments (Theme B)
**Phase:** 2
**Type:** Refactor (route → dispatcher) + new payment-intent webhook handlers + new sub-module `src/lib/payments/webhooks.ts`
**Author:** Ikhtiyor Ziyayev, Business Analyst
**Date drafted:** 2026-05-19
**Status:** LOCKED 2026-05-19. Ready for dispatch.
**Source:** Phase 2 PRD §6.4 (Stripe Webhook Endpoint) + §8 Epic 9 Story 9-5 + forward-looking flags from 9-3 BA-decisions §6 (`checkout.session.expired` deferral) + 9-4 BA-decisions §8 (`payment_intent.succeeded` + `payment_intent.canceled` deferral)

**Companion / dependency chain:**

- **Story 9-1** (Stripe SDK wrapper) shipped at `aff4060`. Provides `src/lib/stripe.ts` singleton + `StripeServiceResult<T>` discriminated union.
- **Story 9-2** (Stripe Connect Express onboarding) shipped at `0d384e0` + `8a06402` (BA-walk fix). Provides:
  - `stripe_connect_accounts` table + `webhook_events` table (idempotency log).
  - Narrow `account.updated` handler at [src/app/api/stripe/webhook/route.ts](deskhive/src/app/api/stripe/webhook/route.ts).
  - **Load-bearing: the defensive 3-stage try-catch wrapper** introduced as a BA-walk fix when the first real `account.updated` event surfaced a 500. Each DB op wraps in its own try-catch logging `error.message` + `error.cause` separately (DrizzleQueryError collapses PG errors into `.cause`). This pattern is **NON-NEGOTIABLE** to preserve through 9-5's refactor.
- **Story 9-2b** (publish gating) shipped at `7e7251c` + `2d65c54`. Not directly relevant to 9-5 but the cached-Connect-state-active check pattern was the 9-2 carry-forward.
- **Story 9-3** (booking with payment) shipped at `bd76dc3` + `8035907`. Provides the narrow `checkout.session.completed` handler that 9-5 absorbs into the dispatcher, the booking pre-claim state machine, and the `webhook_events` per-handler insert-only-on-first-real-handle convention.
- **Story 9-4** (confirm/reject with capture/cancel) shipped at `32dd63a`. Provides `src/lib/payments/payment-intents.ts` (3rd Theme B sub-module) + `markBookingConfirmedAndCaptured` / `markBookingRejectedAndVoided` query helpers (with conditional WHERE on `(PENDING, AUTHORIZED)`). **Explicitly deferred `payment_intent.succeeded` + `payment_intent.canceled` webhook handlers to 9-5** per Decision §8 — those are the load-bearing additions in this story.

Story 9-5 cannot dispatch until all of 9-1 / 9-2 / 9-2b / 9-3 / 9-4 are on `main` (they are). 9-5 is the second-to-last Theme B story; 9-6 (refunds + Guest-cancel) and 9-7 (`/owner/payouts`) follow.

---

## Context

**Phase 2 PRD §6.4 — Stripe Webhook Endpoint:**

> New route: `app/api/stripe/webhook/route.ts`
>
> Handles these event types:
> - `payment_intent.succeeded` — fires payment-captured email
> - `payment_intent.payment_failed` — logs failure, surfaces to user via toast/email
> - `charge.refunded` — fires refund-confirmation email
> - `account.updated` (Connect) — updates `stripe_connect_accounts.charges_enabled` / `payouts_enabled`
> - `payout.paid` (Connect, test-mode-simulated) — fires payout email
>
> All webhook handlers verify signature, look up by `stripe_event_id` in `webhook_events` for idempotency, process, then record in `webhook_events`.

**PRD §6.4 anti-patterns (carry-forward):**

- **Do NOT** trust webhook payloads without signature verification (NFR-3 / CC-7).
- **Do NOT** assume webhook events arrive in order. Use the database state as source of truth, not webhook timing.

**PRD §4.3 — email triggers driven by webhooks (Story 8-4 territory; 9-5 ships zero email work):**

| Event | Recipient | Subject | Trigger |
|---|---|---|---|
| Payment captured | Guest | "Receipt for your DeskHive booking" | Stripe `payment_intent.succeeded` webhook |
| Payment refunded | Guest | "Refund processed" | Stripe `charge.refunded` webhook |
| Payout sent | Space Owner | "Payout sent" | Stripe Connect `payout.paid` webhook |

**Current shape of [src/app/api/stripe/webhook/route.ts](deskhive/src/app/api/stripe/webhook/route.ts) (post-9-3, pre-9-5):**

- 329 lines, one POST function.
- Hardcoded narrow dispatch via `if (event.type === 'account.updated') { ... } if (event.type === 'checkout.session.completed') { ... }` then "unhandled event" 200 OK fallback.
- Each handler branch has its own 3-stage try-catch wrappers (the 9-2 BA-walk fix pattern carried forward to the 9-3 branch).
- Idempotency check on `webhook_events.stripe_event_id` lives at the TOP of the function (before dispatch).
- `webhook_events` insert lives at the END of each handler branch (only on first real handle — Decision §7 from 9-2 + carry-forward in 9-3).
- Signature verification via `stripe.webhooks.constructEvent(rawBody, signature, secret)` at function entry.
- Helper functions `errMessage(err)` + `errCause(err)` for the 3-stage try-catch wrappers.

**What 9-5 does NOT touch (carved by 9-6 / 9-7 / 8-4):**

- ❌ `charge.refunded` handler — Story 9-6 lands this alongside the refund flow + `refund-${bookingId}` idempotency key.
- ❌ `payout.paid` handler — Story 9-7 lands this alongside the `/owner/payouts` view.
- ❌ Payment-driven emails (receipt on capture, payment-failed notification, refund email, payout email) — Story 8-4 wires up after 9-5's dispatch lands.
- ❌ Frontend Stripe SDK (`@stripe/stripe-js`) — never needed for Theme B (deferred forever per 9-3 Decision §7 rationale).
- ❌ `cancelBookingAction` extension for Guest-side refund — Story 9-6.

---

## Scope

**In scope:**

- **Refactor:** generalize the dispatch in [src/app/api/stripe/webhook/route.ts](deskhive/src/app/api/stripe/webhook/route.ts) from a flat if/if/if into a typed dispatcher map. Route handler stays thin (signature verification + idempotency check + dispatch); per-event logic moves into the new sub-module. See Decision §1 + §2.
- **New sub-module `src/lib/payments/webhooks.ts`** — fourth Theme B sub-module (after `connect.ts` / `checkout.ts` / `payment-intents.ts`). Exports a `WEBHOOK_HANDLERS` map keyed by Stripe event type + per-event handler functions. See Decision §2 + §3.
- **Migrate 9-2's `account.updated` handler** into `webhooks.ts` WITHOUT behavior change. Preserves the defensive 3-stage try-catch wrapper introduced by the 9-2 BA-walk fix. See Decision §4.
- **Migrate 9-3's `checkout.session.completed` handler** into `webhooks.ts` WITHOUT behavior change. Preserves the conditional-WHERE-as-race-safety-net pattern from `markBookingAuthorized`. See Decision §4.
- **NEW `payment_intent.succeeded` handler** — capture-confirmation backstop deferred from 9-4. Looks up booking by `payment_intent_id`; conditional UPDATE transitions `(PENDING, AUTHORIZED) → (CONFIRMED, CAPTURED)` via a new `markBookingConfirmedAndCapturedByPaymentIntent` query helper (parallels 9-4's `markBookingConfirmedAndCaptured` but lookup-by-PI rather than lookup-by-id). See Decision §5.
- **NEW `payment_intent.canceled` handler** — cancel-confirmation backstop deferred from 9-4. Mirror shape: conditional UPDATE transitions `(PENDING, AUTHORIZED) → (REJECTED, VOIDED)` via `markBookingRejectedAndVoidedByPaymentIntent`. See Decision §5.
- **NEW `checkout.session.expired` handler** — orphan-booking cleanup deferred from 9-3. Looks up the pre-claimed booking by `session.metadata.bookingId`; conditional DELETE via 3-condition WHERE (`status='PENDING' AND payment_status='AWAITING_PAYMENT' AND id=$bookingId`) removes the abandoned row so the desk/date slot frees up in the partial unique index. See Decision §5.
- **Centralized handler-dispatch infrastructure:** dispatcher `dispatchWebhookEvent(event)` function lives in `webhooks.ts`. Per-event handlers are exported individually for unit testing; the dispatcher is what the route handler calls. See Decision §2.
- **Centralized idempotency check** stays at route entry (top of the POST function); per-handler `webhook_events` insert stays at handler end (only on first real handle — preserved from 9-2 + 9-3). See Decision §6.
- **Centralized signature verification** stays at route entry (top of the POST function). See Decision §7.
- **Per-handler error handling** — each handler keeps the 9-2-pattern defensive 3-stage try-catch wrappers (lookup → mutate → log). Route handler wraps `dispatchWebhookEvent(event)` in a top-level try-catch that returns `500` on unexpected throws (so Stripe retries). See Decision §8.
- **Structured logging** — each handler logs with a handler-name prefix (`stripe_webhook_account_updated_*`, `stripe_webhook_checkout_session_completed_*`, `stripe_webhook_payment_intent_succeeded_*`, `stripe_webhook_payment_intent_canceled_*`). Existing log key conventions preserved. See Decision §9.
- **Unknown event types** — dispatcher returns `{ handled: false, deferred: true }` without `webhook_events` insert (preserved 9-2 / 9-3 pattern — keeps the log clean for future stories to backfill). See Decision §10.
- **Two new `bookings` query helpers** in [deskhive/src/db/queries/bookings.ts](deskhive/src/db/queries/bookings.ts) — `markBookingConfirmedAndCapturedByPaymentIntent(paymentIntentId)` and `markBookingRejectedAndVoidedByPaymentIntent(paymentIntentId)`. Same conditional WHERE pattern as their 9-4 cousins, just keyed on `payment_intent_id` instead of `id`. See Decision §11.
- **Helper extraction:** the `errMessage(err)` + `errCause(err)` helpers move from the route file into `webhooks.ts` (or a shared internal helper inside the new sub-module). See Decision §12.
- **Unit tests** — ~8 new across handlers + dispatcher + helpers. Existing route-level tests refactored to mock at the `@/lib/payments/webhooks` boundary (split-by-mock-boundary pattern). See Decision §13.
- **E2E tests** — **0 new.** Webhooks can't be E2E-tested from Playwright (no Stripe-side trigger available without `stripe trigger` in the BA loop). 9-5's BA walk depends on `stripe listen --forward-to localhost:3000/api/stripe/webhook` + manual Stripe-dashboard actions to trigger real events. See Decision §14.
- **Memory:** extend `reference_stripe_service_pattern.md` with the 9-5 dispatcher section. See Decision §15.

**Out of scope (deferred to Story 9-6 / 9-7 / 8-4):**

- ❌ `charge.refunded` handler — Story 9-6 (refund flow).
- ❌ `payout.paid` handler — Story 9-7 (`/owner/payouts` view).
- ❌ `payment_intent.payment_failed` handler — Phase 2 doesn't currently surface this state to any user; Story 9-6 may pick it up alongside `charge.refunded`, OR Phase 3 backlog. **9-5 leaves this in the "unhandled" path explicitly.** See Decision §10.
- ❌ Payment-driven email sends (receipt, refund, payout) — Story 8-4 wires up AFTER 9-5's dispatch lands. **9-5 ships zero email work** to keep the refactor reviewable.
- ❌ Webhook retry-after-backoff custom logic — Stripe handles retries server-side; 9-5 leaves error responses as plain `500` and trusts Stripe's built-in retry behavior. PRD NFR-4 satisfied via idempotency, not in-band retry.
- ❌ Webhook event audit table beyond `webhook_events` — out of Phase 2 scope.
- ❌ Migration to a queue-based handler dispatch (e.g., Stripe → Inngest → handler) — Phase 3 if ever; Phase 2 is single-process synchronous handling.
- ❌ `stripe.paymentIntents.retrieve` from inside the handlers — webhook payload is the source of truth (already signature-verified); no additional Stripe API calls per Decision §8 from 9-3 + carry-forward.
- ❌ Phase 1 backwards-compat path — webhooks ONLY fire on real Stripe-side events, which only exist for Phase 2 bookings. Phase 1 bookings have `payment_intent_id IS NULL` and never trigger a webhook handler. See Decision §11.

---

## Decisions

### Decision 1: Dispatcher architecture — single-file map (Option C)

**Three candidates considered:**

- **(A) Single route handler with switch/if-else.** Current shape, just generalized. The route file grows to ~600 lines as handlers accumulate. Pro: minimal refactor; preserves the existing shape exactly. Con: violates the "Stripe SDK + handler logic lives in `src/lib/payments/*`" pattern established by 9-2 / 9-3 / 9-4. Route file ends up doing real business logic (DB writes, conditional UPDATEs).
- **(B) Handlers-as-files.** Each event type gets its own file: `src/lib/payments/webhooks/handlers/account-updated.ts`, `src/lib/payments/webhooks/handlers/checkout-session-completed.ts`, etc. Most ceremonial; mirrors larger codebases (e.g., a NestJS-style module). Pro: maximum isolation. Con: 4 handlers in 9-5 (5 if we absorb `checkout.session.expired`) → 4 files of ~80 lines each; the indirection cost exceeds the readability gain for Phase 2's scale.
- **(C) Dispatcher map in a single file.** `src/lib/payments/webhooks.ts` exports a `WEBHOOK_HANDLERS: Record<EventType, HandlerFn>` map; each handler is a top-level function in the same file. Route handler imports the dispatcher entry point. Pro: matches the established sub-module pattern (`connect.ts`, `checkout.ts`, `payment-intents.ts` are each single files with a small number of exports). Easy to unit-test individual handlers. Easy for 9-6 / 9-7 to extend (add a new handler function + a new map entry). Con: file grows to ~400 lines once 9-6 + 9-7 add their handlers, but that's still smaller than the current route file would become.

**Locked: (C) — dispatcher map in `src/lib/payments/webhooks.ts`.**

Rationale:
- Matches the Theme B sub-module convention. 4th sub-module after `connect.ts` / `checkout.ts` / `payment-intents.ts`.
- Single file means the dispatcher map and the handlers are co-located — review-friendly + grep-friendly.
- Per-handler unit testability is preserved by exporting each handler individually alongside the map (Decision §13 documents the test pattern).
- File size projection after 9-7 ships: ~450 lines. Below the readability threshold where (B)'s ceremony would pay off.

**Anti-pattern forbidden:**
- Do NOT use Option (A) — the route file should not own DB write logic after 9-5.
- Do NOT use Option (B) — handler-per-file ceremony exceeds Phase 2's scale.
- Do NOT introduce a class-based dispatcher (e.g., `class WebhookDispatcher`) — Phase 2's codebase is functional-by-convention; classes are reserved for things that need state (e.g., Stripe SDK singleton).

---

### Decision 2: Sub-module location — `src/lib/payments/webhooks.ts` (4th Theme B sub-module)

**Locked: confirm `src/lib/payments/webhooks.ts` as the 4th Theme B sub-module.**

Carries forward the pattern established by:
- Story 9-2: `src/lib/payments/connect.ts` (Connect account / Account Link operations)
- Story 9-3: `src/lib/payments/checkout.ts` (Checkout Session operations)
- Story 9-4: `src/lib/payments/payment-intents.ts` (PI capture / cancel operations)
- Story 9-5: `src/lib/payments/webhooks.ts` (webhook event dispatch + per-event handlers)
- Story 9-6 (future): `src/lib/payments/refunds.ts` (refund operations, called BY a handler but defined in its own sub-module)
- Story 9-7 (future): `src/lib/payments/payouts.ts` (payout list operations) — payouts is read-mostly so the sub-module footprint will be small

**Exports from `webhooks.ts`:**

```typescript
// src/lib/payments/webhooks.ts — Story 9-5 contract

import Stripe from 'stripe';

/**
 * Result returned by each handler — passes back to the route so the
 * route can choose the response shape (200 handled / 200 deferred /
 * 200 idempotent).
 */
type WebhookHandlerResult =
  | { ok: true; handled: true }            // first real handle — insert webhook_events
  | { ok: true; deferred: true }            // booking row not found / etc — Stripe will retry
  | { ok: true; idempotent: true }          // already in target state — skip webhook_events
  | { ok: false; status: number; message: string }; // DB error → 500 → Stripe retries

/**
 * Each handler is exported individually for unit testing. The
 * dispatcher map below references them.
 */
export async function handleAccountUpdated(event: Stripe.Event): Promise<WebhookHandlerResult>;
export async function handleCheckoutSessionCompleted(event: Stripe.Event): Promise<WebhookHandlerResult>;
export async function handleCheckoutSessionExpired(event: Stripe.Event): Promise<WebhookHandlerResult>;
export async function handlePaymentIntentSucceeded(event: Stripe.Event): Promise<WebhookHandlerResult>;
export async function handlePaymentIntentCanceled(event: Stripe.Event): Promise<WebhookHandlerResult>;

/**
 * Map keyed by Stripe event type. The dispatcher uses this to find
 * the handler. Unknown event types short-circuit before dispatch.
 */
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
 * Top-level entry point the route calls. Idempotency check + insert
 * stays at the route level; this dispatcher just runs the right
 * handler based on event.type. Returns the handler result.
 */
export async function dispatchWebhookEvent(event: Stripe.Event): Promise<WebhookHandlerResult>;
```

**Anti-pattern forbidden:**
- Do NOT spin out a `webhooks/` subdirectory — single file per Decision §1.
- Do NOT export handlers under an `internal/` namespace — they're tested directly.
- Do NOT pull in any dependency Phase 2 doesn't already use (e.g., `inversify`, `tsyringe`) — vanilla TS + Drizzle is the existing stack.

---

### Decision 3: Refactor of 9-3's `checkout.session.completed` branch — behavior-preserving

**Locked: zero behavior change for the migrated `checkout.session.completed` handler.**

The 9-3 handler currently lives inside the route file (lines 200–303 of [src/app/api/stripe/webhook/route.ts](deskhive/src/app/api/stripe/webhook/route.ts)). 9-5 moves it verbatim into `handleCheckoutSessionCompleted` inside `webhooks.ts`. Specifically preserved:

- `session.metadata.bookingId` is the lookup key (with `session.client_reference_id` as the belt-and-suspenders fallback per 9-3 Decision §5).
- `markBookingAuthorized({ bookingId, paymentIntentId })` is the DB seam — its conditional WHERE clause is the race-safety net against the return-URL handler winning first.
- Returns `deferred: true` if `bookingId` is missing from metadata, `paymentIntentId` is missing, OR the booking row is not found.
- Returns `idempotent: true` if `markBookingAuthorized` returns `undefined` (booking already in AUTHORIZED state — return-URL won OR a prior webhook delivery already authorized).
- Each DB op wraps in its own try-catch logging `error.message` + `error.cause` separately (the 9-2 BA-walk-fix pattern).
- **Webhook payload is the source of truth.** No `stripe.paymentIntents.retrieve` call from inside the handler — Decision §6 from 9-3 carries forward.

**Regression-risk surface:** the move is mechanical; the unit tests added in 9-3 (the 2 `checkout.session.completed` tests in `webhook/route.test.ts`) will be ported to test against `handleCheckoutSessionCompleted` directly. Behavior-preserving refactor verified by green tests.

**Anti-pattern forbidden:**
- Do NOT change any branching logic or error messages in the migrated handler. Behavior-preserving refactor.
- Do NOT call any Stripe API from inside the handler (anti-pattern from 9-3 Decision §6).
- Do NOT alter the conditional WHERE semantics of `markBookingAuthorized`.

---

### Decision 4: Refactor of 9-2's `account.updated` branch — behavior-preserving + load-bearing 3-stage try-catch

**Locked: zero behavior change for the migrated `account.updated` handler.**

The 9-2 handler currently lives at lines 104–173 of the route file. 9-5 moves it verbatim into `handleAccountUpdated`. Specifically preserved:

- `account.id` is the lookup key via `getConnectAccountByStripeAccountId`.
- Returns `deferred: true` if the connect-row is not found (Stripe delivered `account.updated` before our `initiateConnectOnboardingAction`'s upsert — Stripe will retry).
- `upsertConnectAccount` writes `chargesEnabled` / `payoutsEnabled` / `onboardingCompleted` from the event payload.
- Each DB op wraps in its own try-catch logging `error.message` + `error.cause` separately.

**Load-bearing pattern preserved: the defensive 3-stage try-catch wrapper.** This pattern was introduced by the 9-2 BA-walk fix (commit `8a06402`) when the first real `account.updated` event surfaced a 500 with no readable error. Drizzle's `DrizzleQueryError` collapses the underlying PG error into `error.cause`; without explicit `errCause(err)` capture in the log we lost the actual failure reason. Every handler in 9-5 keeps the same wrappers around every DB op.

**Why this is the locked stance (not "centralize all error handling at the dispatcher"):** the centralized-at-dispatcher pattern (single big try-catch in the route) would lose the per-stage attribution that the 9-2 fix specifically introduced. If the lookup fails vs. the upsert fails vs. the webhook_events insert fails, we need to know WHICH op died and WHY. Per-stage logging gives ops the breadcrumb trail; centralized try-catch collapses it.

**Anti-pattern forbidden:**
- Do NOT collapse the 3-stage try-catch into a single try-catch around the whole handler.
- Do NOT remove the `errMessage(err)` / `errCause(err)` helper calls in any handler.
- Do NOT change the log keys (`stripe_webhook_account_lookup_failed`, `stripe_webhook_upsert_failed`, `stripe_webhook_event_insert_failed`) — ops dashboards / future log search depends on these.

---

### Decision 5: NEW `payment_intent.succeeded` + `payment_intent.canceled` + `checkout.session.expired` handlers

**Locked: ship all three new handlers — two as backstops for the 9-4-deferred narrow ops window + one as the orphan-booking cleanup deferred from 9-3.**

**Rationale (carries forward from 9-4 Decision §8):**

9-4 ships Stripe-first-then-DB ordering: capture/cancel at Stripe, then UPDATE the booking. If Stripe succeeds but the DB write fails (PG outage, network blip), the booking sits in `PENDING + AUTHORIZED` with Stripe in `succeeded` / `canceled` state — the documented narrow-window ops risk that 9-4 accepted. 9-5 closes this gap by adding webhook backstops:

- `payment_intent.succeeded` fires when a PI moves to `succeeded` (capture completed). The handler looks up the booking by `payment_intent_id`; if it's still in `(PENDING, AUTHORIZED)` (i.e., the 9-4 action's DB write missed), conditional UPDATE transitions to `(CONFIRMED, CAPTURED)`. If the booking is already in the target state (the 9-4 action's DB write succeeded; this webhook is just a duplicate confirmation), the conditional WHERE returns no rows; handler reports `idempotent: true`.
- `payment_intent.canceled` mirrors: transitions `(PENDING, AUTHORIZED) → (REJECTED, VOIDED)`.

**Locked handler shape (succeeded path):**

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
    // No DeskHive booking matches this PI. Could be a test event or
    // a race where the booking row hasn't been written yet. Defer; do
    // NOT insert into webhook_events.
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
    // 9-4's action already wrote (CONFIRMED, CAPTURED). The conditional
    // WHERE filtered the row out. No state change — but this is the
    // happy path of "9-4 worked AND the webhook fired" — NOT a failure.
    // Do NOT insert into webhook_events (preserved 9-2 / 9-3 pattern).
    logger.info('stripe_webhook_payment_intent_succeeded_already_captured', {
      eventId: event.id,
      paymentIntentId,
    });
    return { ok: true, idempotent: true };
  }

  // First real handle — the booking was stuck in (PENDING, AUTHORIZED)
  // and we just rescued it. Caller inserts webhook_events.
  return { ok: true, handled: true };
}
```

**`payment_intent.canceled` handler is the mirror shape** with `markBookingRejectedAndVoidedByPaymentIntent` + the `requires_payment_method` / `canceled` state on the PI. Same conditional-WHERE-as-race-safety pattern; same log key conventions.

**Key design choices locked (PI handlers):**

- **Lookup by `payment_intent.id`, not by `bookingId` from metadata.** Why: the PI itself is the resource that changed state; the metadata on the PI was set at Checkout Session create time (Decision §4 from 9-3 — `payment_intent_data.metadata.bookingId`). Reading from `payment_intent.metadata.bookingId` is technically equivalent but adds a fragile dependency on metadata being preserved through Stripe's PI lifecycle. The PI ID is THE join key (`bookings.payment_intent_id` is the column 9-3 created for exactly this).
- **New query helpers `markBookingConfirmedAndCapturedByPaymentIntent` + `markBookingRejectedAndVoidedByPaymentIntent`.** Parallels 9-4's by-id helpers; differs only in the WHERE clause's join column. Same `(status='PENDING' AND payment_status='AUTHORIZED')` conditional. Same `Booking | undefined` return type signaling idempotent-no-op when the row already moved.
- **Webhook handler completes the FULL state transition** — it doesn't just sync `payment_status`. The webhook is the backstop for the 9-4 action's DB write failure, so it has to do the same DB work the action would have done (both `status` and `payment_status` flip atomically). This means 9-4 and 9-5 produce the same booking row state regardless of which path "won the race."

---

**`handleCheckoutSessionExpired` — orphan-booking cleanup (deferred from 9-3 Decision §6).**

**Why this lands in 9-5 (NOT a polish item):**

- The 9-3 Decision §6 lock explicitly said: *"9-5 will land the full webhook dispatch generalization including `checkout.session.expired` or a dedicated cleanup mechanism."* That was the deal made when 9-3 deferred cleanup; honoring it here keeps the cross-story contract intact.
- Polish-backlog deferral risks chain-breaking — every subsequent story keeps deferring, and the orphan-cleanup problem migrates from "explicitly scoped to 9-5" to "perpetually next-up." The cost of doing it now is bounded (+1 handler, +1 unit test, +1 query helper); the cost of deferring again compounds.
- The orphan-row problem is **concrete, not theoretical**: the BA's own DB currently carries abandoned-9-3-attempt rows that produce `DOUBLE_BOOKING` blockers when re-booking the same desk/date. Phase 2 demo flow may not exercise abandonment, but real BA-walk artifacts are accumulating.
- The DELETE-path safety concern (could a misfired event delete a confirmed booking?) is solved by the 3-condition conditional WHERE: `status='PENDING' AND payment_status='AWAITING_PAYMENT' AND id=$bookingId`. A CONFIRMED row CANNOT match (status mismatch); a CAPTURED row CANNOT match (payment_status mismatch); only the pre-claimed-but-abandoned shape matches.

**Locked handler shape:**

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
    // Either a different path won (Guest came back and completed; return-URL
    // handler authorized; 9-4 captured) OR the booking row was already cleaned
    // up by a prior delivery. Both are "everything's fine" — do NOT insert
    // into webhook_events.
    logger.info('stripe_webhook_checkout_session_expired_no_orphan', {
      eventId: event.id,
      bookingId,
    });
    return { ok: true, idempotent: true };
  }

  // Real orphan deleted — caller inserts webhook_events.
  return { ok: true, handled: true };
}
```

**Key design choices locked (expired handler):**

- **3-condition WHERE is non-negotiable**: `status='PENDING' AND payment_status='AWAITING_PAYMENT' AND id=$bookingId`. Any one condition missing opens a path to deleting the wrong row. The combination matches ONLY the pre-claimed-but-abandoned shape; anything that progressed past AWAITING_PAYMENT is safe.
- **Lookup by metadata.bookingId, not by session_id.** The booking has no `checkout_session_id` column; the Stripe → DeskHive join goes through `session.metadata.bookingId` (set at Session-create time in 9-3 Decision §4). This is the inverse of the PI handlers (which key on `payment_intent_id`) — different join column because the resources are different.
- **DELETE rather than UPDATE-to-CANCELLED.** Rationale: the booking was never visible to the Guest (never confirmed, never appeared in `/my-bookings` as a real booking — only as an in-progress attempt). A CANCELLED row would clutter the Guest's history and the admin views with a non-event. DELETE returns the slot to the partial unique index and removes the audit cruft.
- **`{ idempotent: true }` on zero rows affected covers three winning paths**: (a) the Guest came back and completed Checkout (booking moved to AUTHORIZED — different path won); (b) 9-4 captured (booking moved to CONFIRMED + CAPTURED); (c) a prior `checkout.session.expired` delivery already cleaned the orphan. All three are "no action needed" from this handler's POV.

**Anti-pattern forbidden:**
- Do NOT call `stripe.paymentIntents.retrieve` from inside the handler — webhook payload is the source of truth (carry-forward of 9-3 Decision §6).
- Do NOT use the metadata `bookingId` as the primary lookup key for the PI handlers — `payment_intent_id` is the load-bearing join for those (but the expired handler DOES use metadata.bookingId because it has no PI to key on).
- Do NOT trigger any email send from inside these handlers — Story 8-4 territory.
- Do NOT also handle `payment_intent.payment_failed` in 9-5 — explicitly deferred (see Decision §10).
- Do NOT also handle `payment_intent.requires_action` / `payment_intent.processing` / etc. — these are intermediate states; 9-5 only wires the terminal-state events.
- Do NOT widen the expired handler's WHERE to 2 conditions or 1 condition — the 3-condition WHERE is the safety net against ever DELETE-ing a row that progressed past abandonment.
- Do NOT use UPDATE-to-CANCELLED instead of DELETE for the expired handler — orphan cleanup is the goal; CANCELLED would clutter user-facing views.

---

### Decision 6: Idempotency strategy — centralized check at route entry; per-handler insert at handler end

**Locked: keep the existing two-layer idempotency pattern from 9-2 + 9-3.**

**Layer 1 (centralized at route entry, BEFORE dispatch):** `SELECT FROM webhook_events WHERE stripe_event_id = $1`. If the row exists, return `200 { received: true, idempotent: true }` immediately. Same shape as the current route file's lines 80–101.

**Layer 2 (per-handler at handler end):** if the handler returns `{ handled: true }`, the route inserts a row into `webhook_events`. If the handler returns `{ deferred: true }` or `{ idempotent: true }`, NO insert. This preserves 9-2's Decision §7 anti-pattern ("only insert when a real handler ran") and 9-3's Decision §6 carry-forward.

**Why NOT centralize everything (single-insert-or-skip at the dispatcher):**
- The "only-insert-on-first-real-handle" semantics are different from "insert on every event we acknowledge." If we insert on every event (including deferred ones), then Stripe's retry of a deferred event would short-circuit on the idempotency check — but we WANT Stripe to retry, because the deferral usually means "the prerequisite DB row didn't exist yet, try again in 10s."
- The deferred-vs-idempotent distinction is load-bearing for ops debugging — a stuck "deferred forever" booking gets surfaced through log-line frequency; if we collapsed all paths into a single insert, this signal disappears.

**Partial-failure recovery scenario (load-bearing question from BA's prompt):**

> "If a handler partially succeeds (DB write OK, webhook_events insert fails), what's the recovery?"

The current pattern (carried forward from 9-2 / 9-3):
- DB write succeeds → handler returns `{ handled: true }`.
- Route attempts the `webhook_events` insert → it fails → route returns `500`.
- Stripe retries the same event.
- Next delivery: idempotency check (Layer 1) does NOT find the row (the insert failed); dispatcher fires the handler again.
- Handler's conditional WHERE finds the booking already in target state; handler returns `{ idempotent: true }` (NOT `handled: true`).
- Route returns `200 { idempotent: true }` and does NOT insert into `webhook_events`.

**Operational consequence:** the `webhook_events` table is missing a row for the actual first-real-handle event. The DB state is correct (booking row in target state) and Stripe stopped retrying. The only loss is an audit-trail gap — `webhook_events` doesn't record the specific Stripe event ID that caused the transition. For Phase 2's scale this is acceptable.

**Forward-looking flag for Story 9-6 (refunds):** the partial-failure audit-trail gap accepted here is the right trade-off for capture/void/cleanup paths — those are state transitions on the booking row with no outbound money movement (capture moves funds Stripe-side via the prior PI authorization; void releases the hold without moving funds; expired-cleanup is pure DB hygiene). For **refunds**, the calculus changes: a refund is an actual money-outbound operation from the platform's Stripe balance, and compliance/finance/tax audit needs traceability from "refund initiated" through to "webhook acknowledged in `webhook_events`." When 9-6 dispatches, BA should reconsider whether the refund handler specifically needs transactional write-with-rollback semantics (handler's DB UPDATE + `webhook_events` insert in a single transaction; rollback the booking-state change if the audit-log insert fails) — accepting a retry-of-the-whole-operation as the recovery mode rather than the audit-gap pattern that 9-5 carries forward. This is NOT a 9-5 decision — flagged here so 9-6's decision doc picks it up.

**Anti-pattern forbidden:**
- Do NOT insert into `webhook_events` before the handler runs — defeats the only-on-first-real-handle semantics.
- Do NOT make the dispatcher's `webhook_events` insert transactional with the handler's DB writes — that would require pulling DB transactions through the abstraction, and the partial-failure-is-OK semantics already make this unnecessary.
- Do NOT add a "retry count" column to `webhook_events` in 9-5 — out of scope.

---

### Decision 7: Stripe event signature verification — stays at route entry

**Locked: signature verification stays at route entry (top of POST function); zero change from 9-2 / 9-3.**

The route handler's first action (after env-check) is `stripe.webhooks.constructEvent(rawBody, signature, secret)`. If it throws, return `400 Invalid signature` without inserting anything. PRD NFR-3 + CC-7 mandate this; the current pattern satisfies it. 9-5 doesn't touch it.

**Why this is NOT in the new sub-module:** signature verification requires the **raw request body** (not the parsed event). Once the body is consumed by Next.js's `req.text()`, it can't be re-read. The route handler is the natural place to consume the raw body and produce the verified `Stripe.Event` object. Pushing signature verification into the sub-module would invert the dependency (the sub-module would need `req: Request` instead of `event: Stripe.Event`).

**Locked: route handler signature stays:**

```typescript
export async function POST(req: Request): Promise<Response> {
  // 1. Env check (STRIPE_WEBHOOK_SECRET)
  // 2. Header check (stripe-signature)
  // 3. Raw body read + constructEvent → Stripe.Event
  // 4. Idempotency check (centralized — Layer 1 from Decision §6)
  // 5. Dispatch via dispatchWebhookEvent(event) — the new entry point
  // 6. Convert handler result to Response + insert webhook_events on { handled: true }
}
```

**Anti-pattern forbidden:**
- Do NOT push signature verification into `webhooks.ts` — raw body is route-level state.
- Do NOT skip signature verification on any event type (CC-7).
- Do NOT log the signature value or the raw body — sensitive.

---

### Decision 8: Per-handler error handling — preserve the 9-2 3-stage try-catch pattern + top-level dispatcher wrapper

**Locked: per-handler defensive 3-stage try-catch (lookup → mutate → log) + a thin top-level try-catch at the route around `dispatchWebhookEvent(event)`.**

**Per-handler (the load-bearing 9-2 pattern from Decision §4):** each DB op has its own try-catch logging `error.message` + `error.cause` separately. Returns `{ ok: false, status: 500, message: '...' }` to surface to Stripe (so Stripe retries).

**Top-level dispatcher (NEW in 9-5):** the dispatcher itself wraps the handler call in a try-catch to catch UNEXPECTED throws (e.g., a handler accidentally throws instead of returning a `{ ok: false }` result). This is a defensive safety net — handlers should always return a result, but if one throws, the dispatcher converts it to `{ ok: false, status: 500, message: 'Unexpected handler error' }` and logs with a `stripe_webhook_dispatcher_unexpected_throw` key.

**Why NOT centralize at the dispatcher only (no per-handler try-catch):**
- Per-stage attribution would be lost (the 9-2 BA-walk-fix lesson).
- The dispatcher's try-catch can't distinguish between "lookup failed" / "upsert failed" / "webhook_events insert failed" — those go through different DB operations within a single handler call.
- The 9-2 + 9-3 + 9-4 handlers already have the per-stage pattern; 9-5 carries it forward consistently.

**Locked: top-level dispatcher wrapper acts as a "should-never-happen" safety net, NOT as the primary error path.** The primary error handling is per-stage inside each handler.

**Anti-pattern forbidden:**
- Do NOT remove the per-stage try-catch wrappers from any handler.
- Do NOT swallow errors silently — every error path logs with a structured key.
- Do NOT return `500` from the route for `deferred: true` results — Stripe's retry policy is what we want; deferred → 200, ops-noise via log frequency.

---

### Decision 9: Structured logging — preserve existing key conventions + extend for new handlers

**Locked: structured logging with handler-name-prefixed keys.**

Existing keys (preserved verbatim):
- `stripe_webhook_secret_missing` / `stripe_webhook_signature_invalid`
- `stripe_webhook_idempotency_select_failed`
- `stripe_webhook_account_lookup_failed` / `stripe_webhook_account_not_found` / `stripe_webhook_upsert_failed`
- `stripe_webhook_checkout_no_booking_id` / `stripe_webhook_checkout_no_payment_intent` / `stripe_webhook_checkout_booking_lookup_failed` / `stripe_webhook_checkout_booking_not_found` / `stripe_webhook_checkout_update_failed` / `stripe_webhook_checkout_already_authorized` / `stripe_webhook_checkout_event_insert_failed`
- `stripe_webhook_event_insert_failed` (generic)
- `stripe_webhook_unhandled_event`

New keys for the 9-5 handlers:
- `stripe_webhook_payment_intent_succeeded_lookup_failed`
- `stripe_webhook_payment_intent_succeeded_booking_not_found`
- `stripe_webhook_payment_intent_succeeded_update_failed`
- `stripe_webhook_payment_intent_succeeded_already_captured`
- `stripe_webhook_payment_intent_canceled_lookup_failed`
- `stripe_webhook_payment_intent_canceled_booking_not_found`
- `stripe_webhook_payment_intent_canceled_update_failed`
- `stripe_webhook_payment_intent_canceled_already_voided`
- `stripe_webhook_dispatcher_unexpected_throw` (top-level safety-net log)

**Common fields:** every log line includes `{ eventId, eventType, error?, cause? }`. Per-handler logs additionally include the resource key (`paymentIntentId`, `bookingId`, `stripeAccountId` as appropriate).

**Why this matters:** ops dashboards / future log search filters on these keys. Renaming would silently break dashboards. The 9-2 BA-walk fix specifically used these keys, so they're load-bearing for at least the `account.updated` handler.

**Anti-pattern forbidden:**
- Do NOT rename existing log keys — silently breaks any dashboard / alert that depends on them.
- Do NOT log raw event payloads at INFO/WARN level — payloads can be ~20KB and contain sensitive PII. The `webhook_events` table is where payloads go (jsonb column).
- Do NOT log without the handler-name prefix — makes filter-by-handler impossible.

---

### Decision 10: Unhandled events + explicitly out-of-scope event types

**Locked: unhandled events return `200 OK { handled: false }` without `webhook_events` insert.** Preserved from 9-2 / 9-3. This keeps the log clean for 9-6 / 9-7 to backfill when they ship.

**Out-of-scope event types explicitly enumerated (so 9-5 has a tight surface).** 9-5 handles **5 event types total**: `account.updated`, `checkout.session.completed`, `checkout.session.expired`, `payment_intent.succeeded`, `payment_intent.canceled`.

| Event type | Stays unhandled in 9-5? | Owning story |
|---|---|---|
| `account.updated` | ❌ handled (migrated from 9-2) | 9-2 |
| `checkout.session.completed` | ❌ handled (migrated from 9-3) | 9-3 |
| `checkout.session.expired` | ❌ handled (NEW in 9-5) | 9-5 |
| `payment_intent.succeeded` | ❌ handled (NEW in 9-5) | 9-5 |
| `payment_intent.canceled` | ❌ handled (NEW in 9-5) | 9-5 |
| `payment_intent.payment_failed` | ✅ unhandled | Phase 3 backlog OR 9-6 if it picks up |
| `charge.refunded` | ✅ unhandled | 9-6 |
| `payout.paid` | ✅ unhandled | 9-7 |
| all others | ✅ unhandled | n/a |

**Anti-pattern forbidden:**
- Do NOT add `charge.refunded` or `payout.paid` handlers in 9-5 — those are 9-6 / 9-7 territory.
- Do NOT add `payment_intent.payment_failed` in 9-5 — no current story consumes it.
- Do NOT add ANY new handler types beyond the 5 locked above without BA approval.

---

### Decision 11: New query helpers — by-PI capture/void + getBookingByPaymentIntentId + deleteAbandonedBookingByCheckoutSession

**Locked: 4 new helpers in [deskhive/src/db/queries/bookings.ts](deskhive/src/db/queries/bookings.ts).**

**`markBookingConfirmedAndCapturedByPaymentIntent`:**

```typescript
/**
 * Story 9-5: webhook backstop for capture. Updates status='CONFIRMED' +
 * payment_status='CAPTURED' for the booking with the matching
 * payment_intent_id, ONLY IF the row is currently in (PENDING, AUTHORIZED).
 *
 * Race-safety net: if the 9-4 action's DB write already moved the row to
 * (CONFIRMED, CAPTURED), the conditional WHERE returns no row and the
 * caller treats it as idempotent. Mirrors `markBookingConfirmedAndCaptured`
 * (the by-id helper from 9-4) — the only difference is the join column.
 *
 * Returns undefined if no row matched (race lost OR no booking has this
 * payment_intent_id yet — possible if the webhook arrives before 9-3's
 * return-URL handler set payment_intent_id, but that's covered by the
 * checkout.session.completed handler running first; this helper is the
 * backstop for the 9-4 narrow window).
 */
export async function markBookingConfirmedAndCapturedByPaymentIntent(
  paymentIntentId: string,
): Promise<Booking | undefined>;
```

**`markBookingRejectedAndVoidedByPaymentIntent`** — same shape, target state `(REJECTED, VOIDED)`.

**Why two new helpers rather than reusing the by-id ones (Decision §2 from 9-4):**
- The 9-4 helpers take `id` (booking row id) as the join key. The webhook handlers don't know the booking row id — they only know the Stripe PI id. Adding a `getBookingByPaymentIntentId` lookup before the 9-4 helper would be two DB roundtrips; a single conditional UPDATE keyed on `payment_intent_id` is one roundtrip.
- The conditional WHERE is identical (`status='PENDING' AND payment_status='AUTHORIZED'`); only the join column differs.

**Lookup helper also needed:** `getBookingByPaymentIntentId(paymentIntentId): Promise<Booking | undefined>` — used by the webhook handler BEFORE the conditional UPDATE to distinguish "no booking matches this PI" (return `deferred`) from "booking matches but already in target state" (return `idempotent`). Locked: yes, add this helper too. ~3 lines of Drizzle code.

**Fourth helper — `deleteAbandonedBookingByCheckoutSession` (for the expired handler):**

```typescript
/**
 * Story 9-5: orphan-booking cleanup for the checkout.session.expired
 * handler. Deletes the booking row IFF it matches the 3-condition
 * pre-claimed-but-abandoned shape: status='PENDING' AND
 * payment_status='AWAITING_PAYMENT' AND id=$bookingId.
 *
 * The 3-condition WHERE is the load-bearing safety net: any one
 * condition missing opens a path to deleting the wrong row. A
 * CONFIRMED row mismatches on status; a CAPTURED row mismatches on
 * payment_status; the bookingId narrows to the specific abandoned
 * attempt. The combination matches ONLY the pre-claimed-but-abandoned
 * shape; anything that progressed (Guest came back and completed,
 * 9-4 captured, prior cleanup already ran) is safe.
 *
 * Returns true if exactly 1 row was deleted (real orphan); false on
 * 0 rows (idempotent — different path won, OR a prior delivery
 * cleaned it). Never returns true on >1 (bookingId is the PK).
 */
export async function deleteAbandonedBookingByCheckoutSession(
  bookingId: string,
): Promise<boolean>;
```

Same 3-condition conditional WHERE pattern as the other Decision §5 + §11 helpers (capture/void use 2 conditions on (status, payment_status); expired-delete needs 3 because the row is targeted by id but the safety check is on the (status, payment_status) shape).

**Phase 1 backwards-compat — N/A here.** Phase 1 bookings have `payment_intent_id IS NULL` and never trigger a webhook. The webhooks are Phase-2-only by construction. The expired handler also never matches Phase 1 rows because Phase 1 bookings don't have `payment_status='AWAITING_PAYMENT'` (that's the Phase 2 pre-claim state).

**Anti-pattern forbidden:**
- Do NOT collapse the by-PI helpers and the by-id helpers into a single helper with a `WHERE id = $1 OR payment_intent_id = $2` clause — that's a defensive query smell + ambiguous race semantics.
- Do NOT skip the conditional WHERE in the by-PI helpers — race-safety is the whole point.
- Do NOT add `markBookingCapturedByPaymentIntent` (payment_status-only) variant — the webhook is the FULL backstop, so it transitions BOTH columns atomically.
- Do NOT widen `deleteAbandonedBookingByCheckoutSession`'s WHERE to 2 conditions — the 3-condition shape is the safety net.
- Do NOT use `UPDATE bookings SET status='CANCELLED' WHERE ...` instead of `DELETE FROM bookings WHERE ...` — orphan cleanup is the goal; a CANCELLED row clutters user-facing views with a non-event.

---

### Decision 12: Helper extraction — `errMessage` / `errCause` move into `webhooks.ts`

**Locked: move the `errMessage(err)` + `errCause(err)` helpers from the route file into `webhooks.ts`.**

These helpers were introduced by the 9-2 BA-walk fix to extract Drizzle's collapsed PG error message from `error.cause`. They're used by every handler. With the dispatch generalization, the natural home is alongside the handlers — `webhooks.ts` exports them as private (not exported) module-level helpers.

The route file no longer needs them (it doesn't do DB ops; signature verification + idempotency-check happen at the route, but those have their own error logging shapes that are already specific to the route).

**Anti-pattern forbidden:**
- Do NOT duplicate the helpers — single home in `webhooks.ts`.
- Do NOT export them from `webhooks.ts` (they're internal); the file is otherwise heavy on exports for testing — these stay private.

---

### Decision 13: Unit test coverage — split-by-mock-boundary + dispatcher-level integration

**Target after 9-5 ships: 357 + ~10-12 new = ~367-369 unit tests.** Per the 9-1/9-2/9-2b/9-3/9-4 precedent, dev-agent typically ships 1-3 bonus tests beyond the BA estimate.

**Test split (load-bearing — uses the split-by-mock-boundary pattern memorized from 9-2 / 9-3 / 9-4):**

1. **`src/lib/payments/webhooks.test.ts`** (NEW — 6 tests at the handler level; mocks at `@/db/queries/*` boundary):
   - **`handlePaymentIntentSucceeded` happy path** — booking in `(PENDING, AUTHORIZED)` → conditional UPDATE returns the row → handler returns `{ handled: true }`.
   - **`handlePaymentIntentSucceeded` idempotent** — booking already in `(CONFIRMED, CAPTURED)` (9-4 action's DB write won) → conditional UPDATE returns undefined → handler returns `{ idempotent: true }`.
   - **`handlePaymentIntentSucceeded` deferred (booking-not-found)** — no booking matches the PI id → handler returns `{ deferred: true }` (without webhook_events insert).
   - **`handlePaymentIntentCanceled` happy path** — booking in `(PENDING, AUTHORIZED)` → conditional UPDATE returns the row → handler returns `{ handled: true }`.
   - **`handlePaymentIntentCanceled` idempotent** — booking already in `(REJECTED, VOIDED)` → handler returns `{ idempotent: true }`.
   - **`handleCheckoutSessionExpired` happy path + idempotent** — orphan in `(PENDING, AWAITING_PAYMENT)` → DELETE returns true → handler returns `{ handled: true }`. Same handler called on a booking that's already progressed (or already cleaned) → DELETE returns false → `{ idempotent: true }`. Combined into a single parameterized vitest case OR split into 2 — dev-agent picks; counted as 1 row here, but reasonable to ship as 2.

2. **`src/app/api/stripe/webhook/route.test.ts`** REFACTOR (move existing tests to mock at `@/lib/payments/webhooks` boundary + add 1 new dispatcher test):
   - **Existing tests preserved** — the 2 `account.updated` tests from 9-2 + the 2 `checkout.session.completed` tests from 9-3 stay, but their internal mocks shift from `@/db/queries/*` (the old direct mock) to `@/lib/payments/webhooks` (the new dispatch seam).
   - **NEW dispatcher-unknown-event test** — event with type `customer.created` → dispatcher returns `{ ok: true, handled: false }` → route returns `200 { handled: false }` and does NOT insert `webhook_events`. Tests the unhandled-event path.
   - **NEW dispatcher-throws test** — handler throws (simulate via mock); dispatcher's top-level try-catch catches it → route returns `500`. Tests the safety-net wrapper from Decision §8.

3. **`src/db/queries/bookings.test.ts`** extension (NEW — 3 tests for the new helpers):
   - `markBookingConfirmedAndCapturedByPaymentIntent` happy path + conditional-WHERE no-op (combined into 1 parameterized test).
   - `markBookingRejectedAndVoidedByPaymentIntent` same shape (1 test).
   - `getBookingByPaymentIntentId` happy + not-found (combined into 1 test).
   - `deleteAbandonedBookingByCheckoutSession` happy + 3-condition WHERE no-op on each of (status mismatch / payment_status mismatch / id mismatch) — combined into 1 parameterized test that exercises the safety net.
   - Effectively ~3 vitest case groups when combined into parameterized tables per helper.

**Total new: ~10-12 unit tests** (6 handler + 2 dispatcher + 3 query helper = 11 in the parameterized-collapse count; expands to ~12 if dev-agent splits the expired-happy/idempotent into separate cases per their preference). Existing route-level test refactors don't count (no net change to count; just internal mock shift).

**Why the refactor in `route.test.ts` doesn't count as "behavior change":** the tests verify the same Stripe event → response shape contract. The internal mock boundary moving from `@/db/queries/*` to `@/lib/payments/webhooks` is a test-implementation detail; the assertion list doesn't change.

**Mock pattern reminder:** split-by-mock-boundary. The route-level tests mock at the handler boundary (`@/lib/payments/webhooks`); the handler-level tests mock at the query boundary (`@/db/queries/bookings` + `@/db/queries/stripe-connect`); the query-level tests mock at the Drizzle boundary (`@/db/client`). Three layers, three mock boundaries. Do NOT cross.

**Anti-pattern forbidden:**
- Do NOT write integration tests that hit a real Stripe webhook endpoint in unit tests. Mock the `Stripe.Event` payload.
- Do NOT skip the dispatcher-unknown-event test — it's the regression guard for the "200 OK without webhook_events insert" semantics that the unhandled-event path depends on.
- Do NOT delete the existing 9-2 / 9-3 webhook tests in the route file — preserve them through the refactor (assertions unchanged; internal mocks shift).

---

### Decision 14: E2E test coverage — 0 new

**Locked: 0 new E2E tests in 9-5. Target stays at 61.**

**Rationale:** Webhooks fire from Stripe's servers to our `/api/stripe/webhook` endpoint. Playwright can't simulate this — there's no in-process Stripe-to-our-endpoint trigger that Playwright can drive. The closest options:

- **(a) Use `stripe trigger payment_intent.succeeded` from inside the test** — requires `stripe` CLI to be installed on the test runner + `stripe listen` to be running + the test runner has access to the Stripe test-mode API. None of these are baseline assumptions for `pnpm test:e2e`. Adding them to CI is a significant lift.
- **(b) POST a forged-signature event to the endpoint from the test** — signature verification (CC-7) rejects forged events with `400`. Disabling verification "just for tests" is the anti-pattern this story explicitly forbids.
- **(c) Test the handler functions directly via unit tests** — the handler is pure server-side logic; unit tests cover the happy + idempotent + deferred + error paths. This is what 9-5 already does (Decision §13).

**Locked: rely on unit tests + BA manual walk via `stripe listen`.** BA walk pattern (memorialized in operator prereqs):
1. Run `stripe listen --forward-to localhost:3000/api/stripe/webhook` in a side terminal.
2. Manually trigger `account.updated` / `checkout.session.completed` / `payment_intent.succeeded` / `payment_intent.canceled` via the Stripe dashboard (or `stripe trigger` from the same side terminal).
3. Verify the booking row transitions and the `webhook_events` row appears as expected.

**Anti-pattern forbidden:**
- Do NOT POST forged signatures from E2E.
- Do NOT skip signature verification "for testing" — production behavior must match test behavior.
- Do NOT add `stripe` CLI as a CI dependency in 9-5 — out of scope.

---

### Decision 15: Memory file extension — extend `reference_stripe_service_pattern.md`

**Locked: continue the Theme B reference doc with a new section "Story 9-5 additions — Webhook Dispatch Generalization."**

Cover:
- **Dispatcher pattern:** `WEBHOOK_HANDLERS` map + `dispatchWebhookEvent(event)` entry point in `src/lib/payments/webhooks.ts`. The route handler becomes thin (signature + idempotency + dispatch); business logic lives in handlers.
- **Sub-module pattern carry-forward:** 4th sub-module after `connect.ts` (9-2) / `checkout.ts` (9-3) / `payment-intents.ts` (9-4). Future stories' sub-modules: `refunds.ts` (9-6) / `payouts.ts` (9-7).
- **Defensive 3-stage try-catch wrapper:** load-bearing pattern from the 9-2 BA-walk fix; preserved per-handler in 9-5. Logs `error.message` + `error.cause` separately to capture Drizzle's collapsed PG error.
- **Idempotency two-layer pattern:** centralized check at route entry; per-handler insert at handler end (only on first real handle). Partial-failure recovery via Stripe retry + conditional WHERE — DB state ends correct, audit-trail gap accepted.
- **Lookup-by-PI pattern:** new `getBookingByPaymentIntentId` + `markBooking*ByPaymentIntent` helpers parallel the by-id 9-4 helpers; the difference is the join column. Webhooks key on PI id (the Stripe-side resource), not on metadata `bookingId`.
- **Webhook-as-backstop semantic:** webhook completes the FULL state transition the action would have made, not just a partial sync. Closes the 9-4-documented narrow ops window where Stripe-succeeds-then-DB-fails leaves the booking stuck.
- **Unknown-event-types pattern:** `200 OK { handled: false }` without `webhook_events` insert. Keeps the audit log clean for future stories to backfill. The flip side: a `customer.created` event from Stripe will silently no-op in our logs at INFO level — ops should expect to see `stripe_webhook_unhandled_event` frequently in dev.
- **Out-of-scope events explicit list:** `payment_intent.payment_failed` (Phase 3 or 9-6) / `charge.refunded` (9-6) / `payout.paid` (9-7) / `checkout.session.expired` (BA-pick in Decision §10).
- **Test pattern split-by-mock-boundary, 3 layers:** route → `@/lib/payments/webhooks` boundary; handler → `@/db/queries/*` boundary; query → `@/db/client` boundary.

**No new memory file.** Extend the existing reference.

**Anti-pattern forbidden:**
- Do NOT spin out a new memory file. Theme B's reference doc remains the canonical container.

---

### Decision 16: Files likely touched (estimate, not directive)

**New:**
- `deskhive/src/lib/payments/webhooks.ts` — dispatcher map + **5 handler functions** (`handleAccountUpdated`, `handleCheckoutSessionCompleted`, `handleCheckoutSessionExpired`, `handlePaymentIntentSucceeded`, `handlePaymentIntentCanceled`) + internal `errMessage` / `errCause` helpers
- `deskhive/src/lib/payments/webhooks.test.ts` — 6 unit tests at the handler level

**Modified:**
- `deskhive/src/app/api/stripe/webhook/route.ts` — slim down to: env check + signature verification + idempotency check + `dispatchWebhookEvent(event)` + result-to-Response conversion + `webhook_events` insert on `{ handled: true }`. Should drop from 329 lines to ~120.
- `deskhive/src/app/api/stripe/webhook/route.test.ts` — refactor existing tests to mock at `@/lib/payments/webhooks` boundary + add 2 dispatcher tests (unknown event + safety-net throw).
- `deskhive/src/db/queries/bookings.ts` — add **4 new helpers**: `getBookingByPaymentIntentId`, `markBookingConfirmedAndCapturedByPaymentIntent`, `markBookingRejectedAndVoidedByPaymentIntent`, `deleteAbandonedBookingByCheckoutSession`
- `deskhive/src/db/queries/bookings.test.ts` — add ~3 parameterized test groups for the new helpers
- `_bmad-output/implementation-artifacts/sprint-status.yaml` — Epic 9 row
- `_bmad-output/implementation-artifacts/9-5-webhook-dispatch-generalization.md` — story file (created by `*create-story 9-5`)
- Memory: `~/.claude/.../memory/reference_stripe_service_pattern.md` (Decision §15)
- Memory: `~/.claude/.../memory/MEMORY.md` (one-liner refresh)

**Zero changes to** (carved-out for later stories):
- `deskhive/src/lib/stripe.ts` (Story 9-1's singleton)
- `deskhive/src/lib/stripe-service.ts` (Story 9-1's barrel)
- `deskhive/src/lib/payments/connect.ts` (Story 9-2's wrappers)
- `deskhive/src/lib/payments/checkout.ts` (Story 9-3's wrappers)
- `deskhive/src/lib/payments/payment-intents.ts` (Story 9-4's wrappers)
- `deskhive/src/actions/booking.ts` (Story 9-4's confirm/reject; webhook is the backstop, not a parallel path)
- `deskhive/src/actions/booking-with-payment.ts` (Story 9-3's create-with-payment)
- `deskhive/src/db/schema.ts` (no schema changes in 9-5; webhook_events + bookings tables unchanged)
- `deskhive/drizzle/migrations/*` (no migrations in 9-5)
- `deskhive/src/lib/email*` / email-templates/ (Story 8-4 wires up after 9-5 dispatch)
- `deskhive/src/app/(owner)/owner/*` / `(admin)/admin/*` (no UI changes)
- `deskhive/src/lib/toast.ts` (no new toasts)
- `scripts/seed.ts` (no seed changes)

---

## Architectural anti-patterns forbidden (rollup)

1. Stripe SDK imports outside `src/lib/stripe.ts` and `src/lib/payments/*` sub-modules (CC-3 carry-forward).
2. Skipping signature verification (CC-7).
3. Trusting webhook payloads without signature verification (NFR-3).
4. Inserting into `webhook_events` BEFORE a real handler ran — only-on-first-real-handle semantics are load-bearing (Decision §6 from 9-2 + carry-forward).
5. Collapsing the per-stage try-catch wrappers into a single try-catch around the whole handler — the 9-2 BA-walk-fix attribution is load-bearing (Decision §4 + §8).
6. Renaming existing log keys (`stripe_webhook_*_failed`, `stripe_webhook_*_not_found`, etc.) — silently breaks any dashboard / alert (Decision §9).
7. Adding `charge.refunded` / `payout.paid` / `payment_intent.payment_failed` handlers in 9-5 — explicitly deferred (Decision §10).
8. Email sends from any webhook handler — 8-4 territory (carry-forward from 9-2 / 9-3 / 9-4).
9. Calling `stripe.paymentIntents.retrieve` (or any Stripe API) from inside a handler — webhook payload is the source of truth (Decision §6 from 9-3 carry-forward).
10. POST-forging events in E2E to bypass signature verification (Decision §14).
11. Inserting a "retry count" column into `webhook_events` (Decision §6 anti-pattern, out of scope).
12. Spinning out a new memory file (Decision §15) — Theme B reference is canonical.
13. Adding `@stripe/stripe-js` (carry-forward — never needed for Theme B).
14. Using metadata `bookingId` as the primary lookup key in the PI handlers — `payment_intent_id` is the load-bearing join (Decision §5).
15. Skipping the conditional WHERE in the by-PI query helpers — race-safety is the whole point (Decision §11).
16. Disabling signature verification "for testing" (Decision §14).

---

## Operator prereqs (BA completes BEFORE dev-story dispatch)

- [ ] **Stripe dashboard test-mode active** — reconfirm.
- [ ] **`.env.local` has `STRIPE_SECRET_KEY` + `STRIPE_PUBLISHABLE_KEY` + `STRIPE_WEBHOOK_SECRET`** — present from 9-2 / 9-3 / 9-4.
- [ ] **`pnpm db:seed` has been run on the latest schema** — verify `owner@deskhive.local` has Connect row + at least one published space.
- [ ] **`pnpm typecheck` + `pnpm test` + `pnpm test:e2e` baseline green on `main`** — confirms 9-4 ship is stable before 9-5 dispatches.
- [ ] **`stripe listen --forward-to localhost:3000/api/stripe/webhook` documented as REQUIRED for the 9-5 BA walk** — different from 9-4 (which didn't need it). The BA walk needs real Stripe events flowing to verify the 4 handlers. The `STRIPE_WEBHOOK_SECRET` env var must be set to the value Stripe CLI prints when `stripe listen` starts (vs. the dashboard webhook secret used in prod).
- [ ] **Stripe CLI installed locally** — `stripe --version` works. Confirmed for 9-2; reconfirm.
- [ ] **At least one PI in `requires_capture` state available for the `payment_intent.succeeded` BA-walk** — either the 9-3 BA-walk artifact booking (if still in PENDING + AUTHORIZED) OR a fresh AUTHORIZED booking created via the 9-3 flow before 9-5 dispatch. The BA walk for `payment_intent.succeeded` requires triggering an actual capture (via 9-4's Confirm button OR via `stripe trigger payment_intent.succeeded`).
- [ ] **`owner@deskhive.local`'s Connect row is in real (not synthetic) state** — see 9-4's same prereq. The account.updated webhook handler still works in synthetic mode, but the BA walk's payment_intent.succeeded path triggers a real capture which needs a real connected account.
- [ ] **Optional — stale orphan rows ready for `checkout.session.expired` BA-walk verification** — if BA wants to verify the expired-cleanup handler end-to-end, an existing `PENDING + AWAITING_PAYMENT + payment_intent_id IS NULL` orphan row in the DB is ideal as a walk target. If none exists, BA can either trigger one by starting a 9-3 Checkout flow and abandoning, OR rely on `stripe trigger checkout.session.expired` against the dev environment.

---

## Forward-looking flags

- **Story 9-6 refunds** absorbs the `charge.refunded` handler (currently unhandled in 9-5) into the same dispatcher map. Adds a `refunds.ts` sub-module + a `markBookingRefundedByPaymentIntent` helper. The 9-5 dispatcher's extensibility is the load-bearing seam — adding a new handler = one new function + one new map entry. Forward-flag: 9-6 should also reconsider whether `payment_intent.payment_failed` is needed (Phase 3 deferral OR 9-6 picks up).
- **Story 9-7 payouts** absorbs the `payout.paid` handler into the dispatcher. Same one-new-function + one-new-map-entry shape. 9-7 also lands the `/owner/payouts` view that consumes the data.
- **Story 8-4 payment-driven emails** depends on 9-5's dispatch being stable. Each handler will be extended (in 8-4, NOT in 9-5) to call `sendPaymentCapturedEmail(...)` etc. after the DB write. The split is: 9-5 makes the dispatch seam; 8-4 wires the emails. Forward-flag: 8-4 will introduce email-send-from-webhook patterns; the "don't trigger email sends from inside database transactions" anti-pattern (PRD §6.5) is satisfied because webhook handlers don't use transactions.
- **`webhook_events` table content for ops debugging** — 9-5 ships zero changes to the table shape, but the volume of inserted rows grows from "rare" (9-2 only inserts on Connect changes; 9-3 only inserts on Checkout completes) to "potentially many per day in prod" (every successful booking flow generates 1× `checkout.session.completed` + 1× `payment_intent.succeeded` row, so 2 rows per confirmed booking). Phase 2 demo flow is single-user, so this is theoretical. Phase 3 may need a retention policy.
- **Phase 2 PRD §4.5 cancel-interpretation** — still flagged for Story 9-6 (the refund flow makes the CONFIRMED-cancel interpretation load-bearing). 9-5 doesn't touch it.
- **The 9-3 BA-walk booking `92bd9829...` was captured during the 9-4 BA walk** — it's now in `CONFIRMED + CAPTURED` state. For 9-5's BA walk, BA needs to create a FRESH booking in `PENDING + AUTHORIZED` (via the 9-3 Checkout flow) BEFORE the 9-5 walk, since the `payment_intent.succeeded` backstop only fires for PI captures + the most natural way to trigger one is to actually click Confirm in the admin UI (with `stripe listen` running).


