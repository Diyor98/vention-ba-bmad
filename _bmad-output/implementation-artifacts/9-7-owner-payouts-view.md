# Story 9-7: Space Owner Payouts View

Status: review

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a **Space Owner who has completed Stripe Connect onboarding and accumulated payout activity (from captured bookings via Story 9-4's `paymentIntents.capture` + Stripe's daily test-mode-simulated transfer schedule)**,
I want **a new `/owner/payouts` route surfacing my payout history directly from the Stripe Connect API (`stripe.payouts.list({ stripeAccount: connectAccountId })`), rendered as a table of date / amount / status — with empty-state CTAs for the not-yet-onboarded and zero-payouts cases, an inline error fallback if Stripe is unavailable, and a new `<PayoutStatusBadge>` component giving each Stripe payout status (`paid` / `in_transit` / `pending` / `failed` / `canceled`) its own visual treatment** —
so that **(1) PRD §4.6 FR-OWNER-1's `/owner/payouts` sub-route is finally realized; (2) PRD §7.2 New Screens #5's "table of Stripe Connect payouts: per-row date, amount, status" spec is satisfied; (3) the 9-5 dispatcher map gets its SECOND extensibility proof (after 9-6's `charge.refunded` was the first) via a new audit-only `handlePayoutPaid` handler — exactly 1 new function + 1 new map entry; (4) Story 8-4 has a stable `webhook_events` audit trail to hook the "Payout sent" email into when it ships; and (5) Theme B (Epic 9) closes cleanly — 9-7 is the LAST story in the epic, and BMad's optional Epic 9 retrospective becomes available immediately after greenlight.**

> Story 9-7 is the **Owner Payouts View** story of Theme B (Phase 2 Payments). It's a deliberately small story — the last in Epic 9 — with tightly-scoped reads to keep the closing surface clean. After 9-7 ships at greenlight, Epic 9 transitions from in-progress → done; the Epic 9 retrospective is the BMad-standard optional follow-up.
>
> Source of truth: [docs/design/9-7-owner-payouts-view-ba-decisions.md](docs/design/9-7-owner-payouts-view-ba-decisions.md) — 13 locked decisions. Locked 2026-05-19 (BA: Ikhtiyor Ziyayev), committed `0abb2e0`.

> **Companion / dependency chain:** Story 9-1 (`feat(stripe): Story 9-1 — Stripe SDK wrapper`, shipped at `aff4060`) + Story 9-2 (`feat(stripe): Story 9-2 — Stripe Connect Express onboarding`, shipped at `0d384e0` + BA-walk fix `8a06402`) + Story 9-2b (`feat(stripe): Story 9-2b — publish gating`, shipped at `7e7251c` + `2d65c54`) + Story 9-3 (`feat(stripe): Story 9-3 — booking with payment`, shipped at `bd76dc3` + `8035907`) + Story 9-4 (`feat(stripe): Story 9-4 — confirm/reject with capture/cancel`, shipped at `32dd63a`) + Story 9-5 (`feat(stripe): Story 9-5 — webhook dispatch generalization`, shipped at `2950e15`) + Story 9-6 (`feat(stripe): Story 9-6 — Guest cancellation with refund`, shipped at `bb94bd4` + BA-walk fix `428734d`). All seven are on `main`. 9-7 extends 9-2's `stripe_connect_accounts` table (read-only via the existing `getConnectAccountByUserId` helper), reuses 9-5's `WEBHOOK_HANDLERS` dispatcher map mechanism (proven by 9-6's `charge.refunded` addition), and shares the per-owner Connect-state-gate pattern from 9-2b's publish gating + 9-3's booking-create gate.

> **After 9-7 ships, the running app behaves like this:**
> 1. Space Owner in Host mode clicks "Payouts" in the header nav → navigates to `/owner/payouts`.
> 2. Page Server Component fires (in order): `requireSession()` (401 → `/login?callbackUrl=/owner/payouts`); role check (Guest in Guest mode → silent redirect to `/my-bookings`; Super Admin → `/admin/bookings`); `getConnectAccountByUserId(ownerId)` (9-2 helper) for the cached Connect row.
> 3. Pre-flight Connect-state gate (pure DB-read, no Stripe API call) classifies the owner into one of three pre-Stripe states:
>    - No Connect row OR `onboarding_completed === false` → empty-state CTA: *"Set up payouts to see your earnings history."* → `/owner/settings`.
>    - `charges_enabled !== true` OR `payouts_enabled !== true` → empty-state CTA: *"Payouts are paused. Re-onboard to receive funds."* → `/owner/settings`.
>    - Connect-active → proceed to step 4.
> 4. `listPayouts({ stripeAccountId, limit: 25 })` — new wrapper in `src/lib/payments/payouts.ts` (the 6th and final Theme B sub-module). Calls `stripe.payouts.list({ limit: 25 }, { stripeAccount: connectAccountId })`. **No local cache** — direct Stripe read on every page-load per BA Decision §1.
> 5. Render outcomes:
>    - `payouts.length === 0` → empty-state: *"No payouts yet. Once a booking is confirmed and captured, your share will be paid out within a few days."*
>    - `payouts.length > 0` → table of date / amount / status with the new `<PayoutStatusBadge>` component variant for the status column.
>    - Stripe API error (`{ ok: false }`) → inline fallback: *"Payouts temporarily unavailable. Please refresh in a moment."* + `logger.error` for ops.
> 6. Concurrently, Stripe fires `payout.paid` webhook events on its test-mode daily schedule → hits the route at `/api/stripe/webhook` → signature verified at route entry → Layer 1 idempotency check on `webhook_events.stripe_event_id` → `dispatchWebhookEvent(event)` looks up `'payout.paid'` in `WEBHOOK_HANDLERS` → new `handlePayoutPaid` handler logs the event for ops visibility + returns `{ handled: true }` → route inserts into `webhook_events`. **No DB writes; no email sends.** The audit trail IS the work product (BA Decision §4 semantic-stretch note). Story 8-4 will later hook into this `webhook_events` row to send the "Payout sent" email per PRD §4.3.
> 7. Header nav in Host mode shows the "Payouts" link (verified or added per BA Decision §8 audit step in Task 0).

> **Theme B (Epic 9) closes after 9-7 ships at greenlight.** Per the BMad standard, the Epic 9 retrospective becomes available — optional but valuable. 9 proposed retrospective topics are captured in the BA decisions doc's Forward-looking flags section (sub-module discipline, dispatcher extensibility, idempotency-key conventions, the 9-2 BA-walk-fix 3-stage try-catch pattern, audit-gap-on-retry trade-off, Stripe-first-then-DB ordering, schema CHECK DROP/ADD pattern, `acct_seed_for_e2e_only` reset hazard, PRD §4.5 cancel-interpretation resolution).

> **Key anti-patterns to keep in mind:**
> - **No floating-point math** anywhere — payout amounts are integer cents from Stripe (CC-2 carry-forward).
> - **No Stripe SDK imports outside `src/lib/stripe.ts` + `src/lib/payments/*` sub-modules** (CC-3 carry-forward).
> - **No `stripe.payouts.*` calls outside `src/lib/payments/payouts.ts`** (Decision §3).
> - **No local `payouts` DB cache table** — direct Stripe API read at page-load (Decision §1). Phase 3 may add cache; not 9-7.
> - **No caching the Stripe API response** in `unstable_cache` / `React.cache()` / similar — Decision §1's "Stripe is source of truth" anti-pattern.
> - **No cursor-based pagination UI in 9-7** — single-page-only with `limit: 25` per Decision §6. Phase 3.
> - **No date-range filters / CSV export / per-payout drill-down** — all Phase 3.
> - **No cross-referencing Stripe payouts with local bookings** for per-charge attribution — Phase 3 (`stripe.payouts.listLineItems` territory).
> - **No multi-currency** — Phase 2 USD-only.
> - **No email sends from `handlePayoutPaid`** — Story 8-4 territory (carry-forward from all prior webhook handlers in 9-2 / 9-3 / 9-5 / 9-6).
> - **No Stripe API calls from inside `handlePayoutPaid`** — webhook payload is the source of truth (9-3 / 9-5 / 9-6 carry-forward).
> - **No extending `<StatusBadge>` with payout-status branching** — new `<PayoutStatusBadge>` per Decision §7 (Option b — clean separation of booking-status enum from payout-status enum).
> - **No server-side redirect on Connect-not-active** — empty-state-with-CTA is the right UX (Decision §5 anti-pattern).
> - **No populating the `/owner` dashboard "this-month payouts" stat card** in 9-7 — Story 7-5 Decision §1's deliberate carve-out is preserved; deferred to polish (BA Decision §11).
> - **No schema changes / no migrations** in 9-7 (pure read-only + new sub-module + new route).
> - **No new env vars / no `.env.example` changes.**
> - **No new routes outside `/owner/payouts`** — single new Server Component route.
> - **No client-side data fetching** (useSWR / React Query / similar) — Server Component fetch at page-load is the right pattern (Decision §2).
> - **No `payout.failed` / `payout.canceled` / `payout.created` handlers in 9-7** — only `payout.paid` (Decision §4). Phase 3 may add the other lifecycle events if 8-4's email scope expands.

## Acceptance Criteria

> Source: locked BA Decisions document Decisions 1–13.

1. **AC-1 (Data source — direct Stripe API read at page-load; NO local cache).** Per BA Decision §1:
   - `/owner/payouts` reads payouts directly from Stripe Connect via `stripe.payouts.list({ stripeAccount: connectAccountId })` on every page-load.
   - **No `payouts` table** in `src/db/schema.ts`. No Drizzle migration. No schema changes.
   - **No in-memory / Next.js cache** of the Stripe response (no `unstable_cache`, no `React.cache()`, no `'use cache'` directive).
   - Page-load latency depends on Stripe API response time (~200–500ms typical in test mode); BA accepts this for Phase 2 demo scale.
   - On Stripe API error, the page renders an inline fallback message (AC-5's state #5); does NOT crash.
   - Phase 3 will land a local `payouts` cache table (out of 9-7 scope per Forward-looking flags); flagged in BA decisions §1 + reference memory.
   - **Anti-pattern enforced:** do NOT add a `payouts` table. Do NOT cache the response. Do NOT cross-reference Stripe payouts with local bookings.

2. **AC-2 (New Server Component route — `src/app/(owner)/owner/payouts/page.tsx` with 7-step lifecycle).** Per BA Decision §2:
   - Create [src/app/(owner)/owner/payouts/page.tsx](deskhive/src/app/(owner)/owner/payouts/page.tsx). Server-rendered (no `'use client'` directive on the page). Follows the existing `/owner/*` family conventions (auth + role check + mode-aware silent redirect for role-mismatched users, mirroring `/owner/bookings/page.tsx`).
   - **Page lifecycle (in order):**
     1. `requireSession()` (from `@/lib/auth/guards`) — 401 → redirect to `/login?callbackUrl=/owner/payouts`.
     2. Role + mode check: SPACE_OWNER in Host mode. Guest in Guest mode → silent redirect to `/my-bookings` (Story 7-5 / Story 6-2 carry-forward); Super Admin → silent redirect to `/admin/bookings`.
     3. `getConnectAccountByUserId(ownerId)` (9-2 helper) — fetch the cached `stripe_connect_accounts` row.
     4. Pre-flight Connect-state gate (AC-5) — pure DB-read; NO Stripe API call on the gate-failure paths.
     5. `listPayouts({ stripeAccountId, limit: 25 })` (AC-3) — Stripe API call.
     6. On `{ ok: false }` → render the table area with the inline fallback message (AC-5 state #5); `logger.error` the Stripe error for ops.
     7. On `{ ok: true, data: { payouts } }` → render the table per AC-7 OR the zero-payouts empty-state per AC-5 state #3.
   - The page is a pure Server Component — no Client Component sub-tree, no React state, no client-side data fetching.
   - **Anti-pattern enforced:** do NOT make this a Client Component. Do NOT use `useSWR` / React Query / similar. Do NOT split into a Server-fetch wrapper + Client-render child (no interactivity needed).

3. **AC-3 (New Stripe sub-module — `src/lib/payments/payouts.ts` as the 6th and final Theme B sub-module).** Per BA Decision §3:
   - Create new sub-module [src/lib/payments/payouts.ts](deskhive/src/lib/payments/payouts.ts) following the established convention from 9-2 (`connect.ts`) / 9-3 (`checkout.ts`) / 9-4 (`payment-intents.ts`) / 9-5 (`webhooks.ts`) / 9-6 (`refunds.ts`). Single export `listPayouts`:
     ```typescript
     import Stripe from 'stripe';
     import { stripe } from '@/lib/stripe';
     import type { StripeServiceResult } from '@/lib/stripe-service';

     /**
      * Story 9-7: lists payouts for a connected Stripe account. Read-only
      * Stripe API call — Phase 2 single-page-only (BA Decision §6).
      */
     export async function listPayouts(args: {
       stripeAccountId: string;
       limit?: number; // defaults to 25 per BA Decision §6
     }): Promise<StripeServiceResult<{ payouts: Stripe.Payout[] }>>;
     ```
   - Internal Stripe API call (load-bearing `stripeAccount` arg position):
     ```typescript
     const result = await stripe.payouts.list(
       { limit: args.limit ?? 25 },
       { stripeAccount: args.stripeAccountId },
     );
     return { ok: true, data: { payouts: result.data } };
     ```
   - **`stripeAccount` MUST be in the second `Stripe.RequestOptions` arg**, NOT the first params arg. Without it, Stripe returns the platform's own payouts (wrong scope). The wrapper test (AC-9) asserts the call-shape exactly.
   - `mapStripeError` helper — identical shape to 9-2 / 9-3 / 9-4 / 9-6 (`Stripe.errors.StripeError → err.message`; other errors → `'Unexpected error'` + `console.error('[stripe-payouts] ...')` for ops visibility).
   - **No idempotency key** — read-only operations don't need them. Stripe's idempotency model is for writes.
   - **Anti-pattern enforced:** do NOT call `stripe.payouts.*` outside this sub-module. Do NOT pass `stripeAccount` as the first arg (load-bearing). Do NOT extract `stripe.payouts.listLineItems` in 9-7 (Phase 3). Do NOT cache the response.

4. **AC-4 (NEW `handlePayoutPaid` webhook handler — audit-only; extends 9-5's `WEBHOOK_HANDLERS` map).** Per BA Decision §4:
   - Edit [src/lib/payments/webhooks.ts](deskhive/src/lib/payments/webhooks.ts). Add ONE new handler function + ONE new map entry. **Second proof of 9-5's dispatcher extensibility design** (after 9-6's `charge.refunded`). The route shell + `dispatchWebhookEvent` + `WebhookHandlerResult` type all stay UNCHANGED.
   - Handler shape:
     ```typescript
     export async function handlePayoutPaid(
       event: Stripe.Event,
     ): Promise<WebhookHandlerResult> {
       const payout = event.data.object as Stripe.Payout;
       logger.info('stripe_webhook_payout_paid_acknowledged', {
         eventId: event.id,
         payoutId: payout.id,
         amountCents: payout.amount,
         currency: payout.currency,
       });
       // No DB writes — payouts read direct from Stripe at page-load (AC-1).
       // No email send — Story 8-4 wires that up later.
       // Return handled:true so the route inserts webhook_events for the
       // audit trail (Story 8-4 will hook into this event delivery).
       return { ok: true, handled: true };
     }
     ```
   - Map entry:
     ```typescript
     export const WEBHOOK_HANDLERS = {
       // ... existing 6 entries from 9-2 / 9-3 / 9-5 / 9-6 ...
       'payout.paid': handlePayoutPaid, // NEW in 9-7 — final Theme B handler.
     };
     ```
   - **Semantic stretch note (BA Decision §4 lock):** this handler does no DB writes or email sends, but returns `{ handled: true }` so `webhook_events` gets the row inserted for Story 8-4's downstream consumption. "Handled" here means "recorded for audit", not "DB state transitioned". Documented in the handler's docstring + the memory entry.
   - **Log key:** `stripe_webhook_payout_paid_acknowledged` (follows the 9-5 handler-name-prefix convention).
   - **Idempotency:** Layer 1 (centralized route-entry check on `webhook_events.stripe_event_id`) handles dedup. No per-handler conditional WHERE (no booking row to UPDATE).
   - **Anti-pattern enforced:** do NOT trigger email sends. Do NOT create a `payouts` table. Do NOT call `stripe.payouts.retrieve` from inside the handler (webhook payload is the source of truth). Do NOT handle `payout.failed` / `payout.canceled` / `payout.created` in 9-7. Do NOT return `{ handled: false }` to skip the audit-log insert (Story 8-4 needs the trail).

5. **AC-5 (Pre-flight Connect-state gate + 5 rendered states).** Per BA Decision §5:
   - The page renders one of 5 distinct states based on the owner's Connect state + the Stripe API result:
     1. **No Connect row OR `onboarding_completed === false`** → empty-state card: *"Set up payouts to see your earnings history."* + CTA button "Complete onboarding" → `/owner/settings`. **No Stripe API call fires** (pure DB-row-based gate).
     2. **`charges_enabled !== true` OR `payouts_enabled !== true`** (onboarded but inactive) → empty-state card: *"Payouts are paused. Re-onboard to receive funds."* + CTA → `/owner/settings`. **No Stripe API call fires.**
     3. **Connect-active + `payouts.length === 0`** → empty-state card: *"No payouts yet. Once a booking is confirmed and captured, your share will be paid out within a few days."*
     4. **Connect-active + `payouts.length > 0`** → render the table per AC-7 (date / amount / status).
     5. **Stripe API error** (`listPayouts` returned `{ ok: false, error }`) → render the table area with inline fallback: *"Payouts temporarily unavailable. Please refresh in a moment."* + `logger.error('owner_payouts_page_stripe_failed', { error: result.error })` for ops debugging.
   - States 1 and 2 (gate-failure) MUST NOT call Stripe — the gate is purely DB-row-based per Decision §5. States 3 / 4 / 5 are after the Stripe call.
   - **Empty-state copy is strawman-locked** — dev-agent renders the exact strings above; BA may edit during BA walk if needed.
   - **Anti-pattern enforced:** do NOT server-side-redirect on Connect-not-active (empty-state-with-CTA is the right UX). Do NOT make the Stripe API call without the pre-flight DB gate (wastes a Stripe round-trip for un-transacting owners). Do NOT silently return empty array on Stripe error (state #5 is load-bearing for ops + user trust). Do NOT skip the `onboarding_completed` check (the canonical signal per 9-2b).

6. **AC-6 (Pagination — single-page; `limit: 25`; NO cursor UI).** Per BA Decision §6:
   - `listPayouts` called with `limit: 25` (Stripe API max is 100; 25 is the Phase 2 lock).
   - **No "Next page" / "Show more" / cursor-based UI** in 9-7. Phase 3.
   - If the owner has >25 payouts (unlikely at Phase 2 scale), the page shows only the first 25. Dev-agent MAY add a small "Showing 25 of N — pagination coming soon" footer note IF the BA walk surfaces an owner with >25 payouts (BA Decision §6 carry-forward — this is a polish-leaning detail).
   - **Anti-pattern enforced:** do NOT add a `?page=` query param or cursor-based "Next page" UI. Do NOT default to `limit: 100`. Do NOT silently hide payouts past row 25 without any UI indication if N > 25.

7. **AC-7 (New `<PayoutStatusBadge>` component — Option (b) from BA Decision §7).** Per BA Decision §7:
   - Create new component [src/components/payout-status-badge.tsx](deskhive/src/components/payout-status-badge.tsx). Accepts a `status` prop of type `Stripe.Payout.Status` (`'paid' | 'in_transit' | 'pending' | 'failed' | 'canceled'`) — narrow union from Stripe's TS types.
   - Visual treatment per status:
     - `paid` → green/success (the happy state — funds settled in owner's bank).
     - `in_transit` → blue/info (en route from Stripe to owner's bank; usually 1–2 business days).
     - `pending` → gray/neutral (Stripe has scheduled the payout but not initiated transfer yet).
     - `failed` → red/error (transfer failed; owner action needed).
     - `canceled` → gray/struck-through (owner or Stripe canceled before transfer; rare in test mode).
   - Visual style: reuse existing brand tokens + status-color conventions from `<StatusBadge>` — do NOT introduce new colors (CC-8 carry-forward).
   - **Anti-pattern enforced:** do NOT extend `<StatusBadge>` with payout-status branching (Decision §7 anti-pattern). Do NOT inline raw `payout.status` strings without status-specific visual treatment (PRD §7.2 implies "status" is visually meaningful). Do NOT introduce a new design token / color (CC-8).

8. **AC-8 (Header nav audit — verify or add "Payouts" link in Host-mode nav).** Per BA Decision §8 + PRD §4.7:
   - During Task 0 audit (see Tasks section), dev-agent verifies the existing Host-mode header nav has a "Payouts" link pointing to `/owner/payouts`. PRD §4.7 locks the order: *"logo + Dashboard + My spaces + Bookings + Payouts + user-pill"*.
   - If the link exists already (likely added in Story 7-1's role+mode-switching nav scaffolding), no work needed.
   - If missing, add a minimal `<Link href="/owner/payouts">Payouts</Link>` (or matching nav-item shape) in the right position (between "Bookings" and the user pill). 5-line change at most.
   - **DO NOT add the Payouts link to other nav variants** (Guest mode, Super Admin nav, public nav). Host-mode SPACE_OWNER only.
   - **DO NOT change the link order** from PRD §4.7's locked sequence.
   - **Anti-pattern enforced:** do NOT change other nav variants. Do NOT change the link order. Do NOT add Payouts to the user-pill dropdown — it's a top-level nav item per PRD §4.7.

9. **AC-9 (Unit tests — ~4 new across wrapper + handler).** Per BA Decision §9:
   - **`src/lib/payments/payouts.test.ts`** (NEW — 2 wrapper tests):
     1. `listPayouts` happy path — Stripe SDK called with `({ limit: 25 }, { stripeAccount: 'acct_test_...' })` shape; result wrapped as `StripeServiceResult<{ payouts: Stripe.Payout[] }>`. **Critical assertion**: verify `stripeAccount` is in the SECOND arg (RequestOptions), NOT the first params arg.
     2. `listPayouts` error path — Stripe throws `StripeError` → `{ ok: false, error: <message> }`.
     Mock at `@/lib/stripe` boundary.
   - **`src/lib/payments/webhooks.test.ts`** extension (2 new handler tests):
     1. `handlePayoutPaid` happy path — synthetic `Stripe.Payout` event payload → `{ ok: true, handled: true }`. Asserts logger called with the right context (`eventId`, `payoutId`, `amountCents`, `currency`).
     2. `handlePayoutPaid` malformed payload defensive — event with missing `payout.id` → still returns `{ ok: true, handled: true }` (handler is audit-only; no DB writes that could fail; logger captures whatever's there). Documents the lenient stance per BA Decision §4.
   - **Page render unit tests** — DEFERRED per BA Decision §9 (Server Component testing is heavyweight; the gate logic is trivially-verifiable via DB-state setup; BA walk covers all 5 rendered states).
   - **Header nav unit test** — DEFERRED per BA Decision §8 (dev-agent's discretion; the audit step in Task 0 is the primary verification).
   - **Target unit-test count after this story:** 404 (post-9-6 baseline including the BA-walk-fix's defensive test) + 4 = **408**. Dev-agent may ship +1-2 bonus per the 9-1 / 9-2 / 9-2b / 9-3 / 9-4 / 9-5 / 9-6 +N-bonus pattern; document any divergence in DAR.
   - **Mock-boundary reminder (3 layers from 9-5):** wrapper tests mock `@/lib/stripe`; handler tests don't mock anything (the handler does no DB queries — only `vi.spyOn(logger, ...)` if asserting log calls).
   - **Anti-pattern enforced:** do NOT mock the Stripe SDK at the dev-server layer. Do NOT skip the wrapper happy-path test — verifying the `stripeAccount` arg position is load-bearing per Decision §3.

10. **AC-10 (E2E test target — 0 new; stays at 61).** Per BA Decision §10:
    - **Locked: 0 new E2E tests in 9-7.** Target stays at **61** (post-9-6 baseline).
    - Rationale: the happy `/owner/payouts` render requires a real Stripe test-mode account with at least one historical payout — Stripe simulates test-mode payouts on a daily schedule (NOT force-creatable via the standard API), so seeding deterministic test data is fragile + slow. The empty-state paths (Connect-not-active / zero payouts) are application-layer logic verified via wrapper + handler unit tests; the BA walk covers all 5 states end-to-end.
    - **Optional BA override:** add 1 E2E that asserts an unactivated owner lands on the empty-state CTA (DB-direct manipulation of `stripe_connect_accounts.charges_enabled = false` + page load + assert the CTA element). Dev-agent picks if cheap; document in DAR if shipped.
    - BA-walk verification path: `stripe listen` + manual Stripe-dashboard payout verification (or `stripe trigger payout.paid` for the webhook delivery walk).
    - **Anti-pattern enforced:** do NOT call real Stripe `payouts.list` from E2E. Do NOT mock the Stripe SDK at the dev-server layer. Do NOT try to force-create test-mode payouts via API.

11. **AC-11 (Dashboard "this-month payouts" stat card — DEFERRED to polish).** Per BA Decision §11:
    - **Story 7-5 Decision §1's `/owner` dashboard stat-card carve-out is PRESERVED.** No changes to [src/app/(owner)/owner/page.tsx](deskhive/src/app/(owner)/owner/page.tsx) in 9-7.
    - The dashboard's "this-month payouts" stat card stays empty (or its current rendering — strawman audit during Task 0 confirms).
    - Rationale: PRD §4.6 says "this-month payouts" but doesn't lock the timezone boundary, loading state, or empty-state copy. Phase 3's local-cache decision (BA Decision §1 forward-flag) is the natural home for this — once payouts are mirrored locally, the dashboard query is a SQL `SUM` instead of a Stripe API call. A polish item with its own BA review pass is the safer slot.
    - **Anti-pattern enforced:** do NOT populate the dashboard stat card in 9-7. Do NOT add a Stripe API call from `/owner/page.tsx`. The 7-5 Decision §1 lock stands.

12. **AC-12 (Memory file extension + Epic 9 retrospective trigger).** Per BA Decision §12:
    - Extend out-of-tree `~/.claude/.../memory/reference_stripe_service_pattern.md` with a new section "Story 9-7 additions — Owner Payouts View" covering:
      - 6th sub-module pattern: `src/lib/payments/payouts.ts`. Single export `listPayouts`. The `stripeAccount` `RequestOptions` arg position (load-bearing — first vs second arg; common Stripe SDK gotcha).
      - Read-only Stripe API call pattern (BA Decision §1) — first read-only API call surfaced to a page in Theme B; contrast with 9-2 / 9-3 / 9-4 / 9-6's write operations.
      - `handlePayoutPaid` — 7th handler in the 9-5 dispatcher map. Audit-only acknowledgment pattern (no DB writes; the audit trail IS the work product). **Second proof of 9-5's extensibility design** (after 9-6's `charge.refunded` was the first; both adds = exactly 1 function + 1 map entry).
      - Semantic stretch note (Decision §4 lock): "Handled" can mean "recorded for audit" — not just "DB state transitioned". Pattern for any future audit-only webhook handler.
      - Pre-flight Connect-state gate at the page (BA Decision §5) — 4th pattern instance after 9-2b's publish gate, 9-3's booking-create gate, 9-6's UI-visibility gate on `/my-bookings`. Pure DB-read; no Stripe API call.
      - `<PayoutStatusBadge>` component pattern (BA Decision §7) — role-specific component variant; doesn't extend `<StatusBadge>`'s booking-status scope.
      - Phase 3 local-cache forward-flag — payouts cache table + `payout.paid` handler upgraded from audit-only to cache-populating + dashboard stat card enabled.
      - Theme B closure: `/owner/payouts` is the final user-facing surface in Epic 9.
    - Update `~/.claude/.../memory/MEMORY.md` index entry's one-liner for `reference_stripe_service_pattern.md` to reflect 9-7 additions + the Epic 9 completion.
    - **Trigger Epic 9 retrospective:** sprint-status.yaml flips `epic-9: in-progress` → `done` AND `epic-9-retrospective: optional` stays as-is (BMad standard — retrospective is optional). The 9 proposed retrospective topics live in the BA decisions doc's Forward-looking flags section (not duplicated to memory — the retrospective is a separate workflow if/when BA chooses to run it).
    - **No new memory file** — extend the existing Theme B reference.

13. **AC-13 (`git diff` scope bounded + single commit + BA walk + docs follow-up).** Per BA Decision §13 + the Story 5-1 → 9-6 established pattern:
    - **All changes confined to:**
      - `deskhive/src/lib/payments/payouts.ts` (new) — `listPayouts` wrapper
      - `deskhive/src/lib/payments/payouts.test.ts` (new) — 2 wrapper tests
      - `deskhive/src/app/(owner)/owner/payouts/page.tsx` (new) — Server Component route
      - `deskhive/src/components/payout-status-badge.tsx` (new) — payout-status visual component
      - `deskhive/src/lib/payments/webhooks.ts` — add `handlePayoutPaid` + map entry
      - `deskhive/src/lib/payments/webhooks.test.ts` — extend with 2 handler tests
      - `deskhive/src/components/header.tsx` (or wherever the Host-mode nav lives — dev-agent finds during Task 0) — add "Payouts" link IF missing per AC-8 audit
      - `_bmad-output/implementation-artifacts/sprint-status.yaml` — 9-7 row → review (during dev-story commit); → done + `epic-9: done` (during the post-greenlight docs follow-up)
      - `_bmad-output/implementation-artifacts/9-7-owner-payouts-view.md` (this file) — Status → review, tasks `[x]`, DAR filled in
      - Memory files in `~/.claude/.../memory/` (out-of-tree)
    - **Zero changes to:**
      - `deskhive/src/lib/stripe.ts` (Story 9-1's singleton)
      - `deskhive/src/lib/stripe-service.ts` (Story 9-1's barrel)
      - `deskhive/src/lib/payments/connect.ts` (Story 9-2's wrappers)
      - `deskhive/src/lib/payments/checkout.ts` (Story 9-3's wrappers)
      - `deskhive/src/lib/payments/payment-intents.ts` (Story 9-4's wrappers)
      - `deskhive/src/lib/payments/refunds.ts` (Story 9-6's wrappers)
      - `deskhive/src/app/api/stripe/webhook/route.ts` (Story 9-5's thin shell — handler lives in `webhooks.ts`)
      - `deskhive/src/actions/booking.ts` / `booking-with-payment.ts` (no action work in 9-7)
      - `deskhive/src/db/schema.ts` (NO schema changes per AC-1)
      - `deskhive/drizzle/migrations/*` (no migrations)
      - `deskhive/src/lib/email*` / `email-templates/` (Story 8-4 wires payout email AFTER 9-7's handler lands)
      - `deskhive/src/app/(owner)/owner/page.tsx` — dashboard stat card stays empty per AC-11
      - `deskhive/src/app/(owner)/owner/bookings/*` / `spaces/*` / `settings/*` (no other owner-route changes)
      - `deskhive/src/lib/toast.ts` (no new toasts; Server Component can't fire toasts)
      - `deskhive/scripts/seed.ts` (no seed changes — payouts come from Stripe API, not local DB)
      - `deskhive/.env.example` (no new env vars)
    - All Story 9-7 changes land in a single commit on `main` titled `feat(stripe): Story 9-7 — owner payouts view`. (Matches the `feat(stripe):` scope from 9-1 + 9-2 + 9-2b + 9-3 + 9-4 + 9-5 + 9-6.)
    - A small follow-up `docs:` commit fills in the Change Log hash + records BA greenlight + flips sprint-status from `review` → `done` + flips `epic-9: in-progress` → `done` (the Epic 9 closure marker; BMad standard). Same `docs:` follow-up pattern as 9-1 / 9-2 / 9-2b / 9-3 / 9-4 / 9-5 / 9-6.
    - Memory entry lives in `~/.claude/.../memory/` (out-of-tree, NOT staged).
    - **BA browser walk (stop bar):**
      1. All unit tests pass — target **~408** (404 baseline + 4 new). Document any divergence (+N bonus) in DAR.
      2. All E2E tests pass — target **61** (unchanged; 0 new). Restart `pnpm dev` first + re-run `pnpm db:seed` if any DB state is suspect. Pre-existing 5 hazards may still surface — flag if anything new joins them.
      3. `pnpm typecheck` + `pnpm lint` clean.
      4. `pnpm build` — **42 routes** (41 baseline from 9-6 + 1 new for `/owner/payouts`). Document the +1 in DAR.
      5. `git diff --stat` matches AC-13 file list. Zero entries in carved-out files.
      6. **`stripe listen` setup**: start `stripe listen --forward-to localhost:3000/api/stripe/webhook` in a side terminal. Swap `STRIPE_WEBHOOK_SECRET` to the CLI-printed `whsec_...` value AND restart `pnpm dev` (same operator pattern as 9-5 / 9-6 walks).
      7. **State #1 walk (Connect-not-onboarded):** create a fresh user with NO `stripe_connect_accounts` row (OR temporarily DELETE the seeded row for `owner@deskhive.local`) → sign in → navigate to `/owner/payouts` → verify the "Set up payouts to see your earnings history." empty-state + CTA renders → click CTA → lands on `/owner/settings`. Restore the Connect row afterward.
      8. **State #2 walk (Connect-inactive):** temporarily set `owner@deskhive.local`'s `charges_enabled = false` in the DB → sign in → navigate to `/owner/payouts` → verify the "Payouts are paused. Re-onboard to receive funds." empty-state + CTA renders. Restore `charges_enabled = true` afterward.
      9. **State #3 walk (zero payouts):** ensure `owner@deskhive.local` is in real-Connect-active state but has accumulated zero materialized payouts (this is the default state immediately after onboarding before any captures settle) → navigate to `/owner/payouts` → verify the "No payouts yet. Once a booking is confirmed and captured, your share will be paid out within a few days." empty-state renders.
      10. **State #4 walk (payouts present):** the canonical happy path. Requires at least one captured booking (the 9-3 → 9-4 BA-walk artifact `92bd9829-...` was captured by 9-4; Stripe simulates the payout on its daily test-mode schedule — may need to wait 1 business day OR trigger via `stripe trigger payout.paid`). Navigate to `/owner/payouts` → verify the table renders with date / amount / status columns + `<PayoutStatusBadge>` rendering correctly per status. Verify the `limit: 25` cap is respected (won't matter at Phase 2 scale but verify the wrapper call).
      11. **State #5 walk (Stripe API error):** OPTIONAL — temporarily mock the Stripe response to fail (e.g., briefly invalidate `STRIPE_SECRET_KEY` in `.env.local` + restart dev server). Navigate to `/owner/payouts` → verify the inline fallback "Payouts temporarily unavailable. Please refresh in a moment." renders. Restore the secret afterward. **DEFERRED** for BA discretion; may not be worth the disruption.
      12. **`payout.paid` webhook walk:** with `stripe listen` running, trigger `stripe trigger payout.paid` from the side terminal → verify the dev server log shows `stripe_webhook_payout_paid_acknowledged` with the event's payout id + amount → verify `webhook_events` row inserted (`SELECT * FROM webhook_events WHERE event_type = 'payout.paid' ORDER BY processed_at DESC LIMIT 1;`).
      13. **Header nav walk:** verify the "Payouts" link is visible in the Host-mode header nav (per AC-8 audit + add-if-missing) and clicking it lands on `/owner/payouts`.
      14. **Epic 9 closure walk:** after greenlight + docs follow-up, verify `sprint-status.yaml` shows `epic-9: done` AND all 7 stories (9-1, 9-2, 9-2b, 9-3, 9-4, 9-5, 9-6, 9-7) at `done`. The optional Epic 9 retrospective workflow is BA-triggered separately if desired.
      15. **Operator prereq from BA decisions doc operator-prereqs:** `owner@deskhive.local`'s Connect row should be in real test-mode state (not synthetic `acct_seed_for_e2e_only`) — payouts only exist on real test-mode Connect accounts. Re-onboard via `/owner/settings` if seed has reset (carry-forward from 9-4 / 9-5 / 9-6).

## Tasks / Subtasks

- [x] **Task 0 — Prep + 9-6 baseline check + audit existing files.**
  - Verify baseline CI clean: `pnpm typecheck` / `lint` / `test` (404 expected) / `build` (41 routes expected) / `test:e2e` (61 expected, modulo the documented hazards).
  - Confirm Story 9-6 is at `done` on `main` (`git log --oneline` shows `bb94bd4` + `428734d` + `adb3594`).
  - Re-read [docs/design/9-7-owner-payouts-view-ba-decisions.md](docs/design/9-7-owner-payouts-view-ba-decisions.md) end-to-end (13 locked decisions + the §4 semantic-stretch note).
  - Inspect existing `/owner/*` routes — [src/app/(owner)/owner/page.tsx](deskhive/src/app/(owner)/owner/page.tsx) + [src/app/(owner)/owner/bookings/page.tsx](deskhive/src/app/(owner)/owner/bookings/page.tsx) + [src/app/(owner)/owner/settings/page.tsx](deskhive/src/app/(owner)/owner/settings/page.tsx) — confirm the auth + role + mode pattern (`requireSession` + role check + silent redirect for role-mismatched users) the new `/owner/payouts` page mirrors.
  - Inspect [src/db/queries/stripe-connect.ts](deskhive/src/db/queries/stripe-connect.ts) `getConnectAccountByUserId` — confirm the return shape used in the gate (BA Decision §5).
  - Inspect [src/lib/payments/webhooks.ts](deskhive/src/lib/payments/webhooks.ts) — confirm the dispatcher pattern + how 9-6 added `handleChargeRefunded` (the canonical extensibility example).
  - Inspect [src/components/status-badge.tsx](deskhive/src/components/status-badge.tsx) — understand the booking-status badge's visual approach so the new `<PayoutStatusBadge>` mirrors the style without colliding with the type.
  - **Audit the header nav per AC-8 + BA Decision §8.** Search for the Host-mode nav variant rendering — likely in a layout file or a `<Header>` component. Look for an existing "Payouts" link to `/owner/payouts`. Note: PRD §4.7 locks the order `Dashboard + My spaces + Bookings + Payouts + user-pill` for Host mode. If missing, prep to add in Task 4.
  - Verify `stripe listen` is available locally: `stripe --version`.
  - Verify the operator prereqs from the BA decisions doc — Stripe test-mode active, `STRIPE_*` env vars present, seed run, `owner@deskhive.local` Connect row in real state (re-onboard via `/owner/settings` if seed has reset to synthetic per the carry-forward operator hazard).

- [x] **Task 1 — New Stripe sub-module `src/lib/payments/payouts.ts`** (AC-3):
  - Create [src/lib/payments/payouts.ts](deskhive/src/lib/payments/payouts.ts) with single export `listPayouts({ stripeAccountId, limit? })` returning `StripeServiceResult<{ payouts: Stripe.Payout[] }>`.
  - Internal call: `stripe.payouts.list({ limit: args.limit ?? 25 }, { stripeAccount: args.stripeAccountId })`. **Load-bearing**: `stripeAccount` MUST be in the SECOND `RequestOptions` arg.
  - `mapStripeError` helper identical to 9-2 / 9-3 / 9-4 / 9-6's shape (`[stripe-payouts]` prefix for the `console.error` ops log).
  - File-header docstring matches the convention from `refunds.ts` (9-6) — explains the 6th-sub-module status + read-only API call (vs Theme B's prior 5 write-only sub-modules) + Phase 3 forward-flag for cache table.

- [x] **Task 2 — NEW `handlePayoutPaid` webhook handler** (AC-4):
  - Edit [src/lib/payments/webhooks.ts](deskhive/src/lib/payments/webhooks.ts). Add the handler function (mirrors 9-6's `handleChargeRefunded` shape but with no DB writes) + ONE new map entry `'payout.paid': handlePayoutPaid`.
  - Returns `{ ok: true, handled: true }` always (semantic stretch note from BA Decision §4 — "handled" = "recorded for audit" not "DB state transitioned").
  - `logger.info('stripe_webhook_payout_paid_acknowledged', { eventId, payoutId, amountCents, currency })`.
  - Add a docstring block explaining the audit-only pattern + cross-reference Story 8-4's downstream consumption.

- [x] **Task 3 — New Server Component route at `/owner/payouts`** (AC-2 + AC-5 + AC-6 + AC-7):
  - Create [src/app/(owner)/owner/payouts/page.tsx](deskhive/src/app/(owner)/owner/payouts/page.tsx) with the 7-step lifecycle from AC-2.
  - Implement the 5 rendered states per AC-5 (Connect-not-onboarded / Connect-inactive / zero-payouts / payouts-listed / Stripe-error).
  - Wire `listPayouts({ stripeAccountId, limit: 25 })` per AC-6.
  - Render the `<PayoutStatusBadge>` component (created in Task 4) in the status column.

- [x] **Task 4 — NEW `<PayoutStatusBadge>` component** (AC-7):
  - Create [src/components/payout-status-badge.tsx](deskhive/src/components/payout-status-badge.tsx) with status prop typed as `Stripe.Payout.Status`. Render the 5 visual variants (`paid` / `in_transit` / `pending` / `failed` / `canceled`) using existing brand-token + status-color conventions.
  - Do NOT extend `<StatusBadge>` (Decision §7 anti-pattern).

- [x] **Task 5 — Header nav verification / addition** (AC-8):
  - Per Task 0 audit results — if the "Payouts" link is missing from the Host-mode header nav, add it between "Bookings" and the user-pill per PRD §4.7's locked order. 5-line change.
  - If the link already exists (likely from Story 7-1 nav scaffolding), no work needed; note in DAR.

- [x] **Task 6 — Unit tests** (AC-9):
  - Create [src/lib/payments/payouts.test.ts](deskhive/src/lib/payments/payouts.test.ts) with 2 wrapper tests (happy + error). **Critical assertion**: verify `stripeAccount` is in the SECOND arg to `stripe.payouts.list`.
  - Extend [src/lib/payments/webhooks.test.ts](deskhive/src/lib/payments/webhooks.test.ts) with 2 new tests for `handlePayoutPaid` (happy + malformed-payload defensive).
  - Mock at `@/lib/stripe` boundary for the wrapper tests; no mocks needed for the handler tests (audit-only handler has no DB calls).
  - Target: 404 + 4 = **408**.

- [x] **Task 7 — E2E (deferred per AC-10 lock)**:
  - 0 new E2E. If dev-agent ships the optional unactivated-empty-state E2E (BA Decision §10 carry-forward), document in DAR + target moves to 62.
  - Run `pnpm test:e2e` → target 61 (or 62 if optional shipped).

- [x] **Task 8 — Local CI parity** (AC-13):
  - `pnpm typecheck` clean.
  - `pnpm lint` clean.
  - `pnpm test` — ~408 expected.
  - `pnpm build` — **42 routes** (+1 for `/owner/payouts`). Document in DAR.
  - `pnpm test:e2e` — 61 expected (modulo the documented hazards from prior stories).

- [x] **Task 9 — `git diff` verification + quick smoke test** (AC-13):
  - `git diff --stat` matches the AC-13 file list. Zero entries in the carved-out files (Stripe singleton, other 5 payments sub-modules, the route shell at `route.ts`, action files, schema/migrations, email infrastructure, UI files outside `/owner/payouts` + the nav file + the new badge component, toast.ts, seed.ts).
  - Quick smoke test: `pnpm dev` running, sign in as `owner@deskhive.local` → click "Payouts" in the header nav (or navigate directly to `/owner/payouts`) → verify whichever state renders matches the owner's current Connect + payouts state.
  - **AC-13 §6–§15 (full BA browser walk including all 5 rendered states + `stripe listen` setup + `payout.paid` webhook walk + Epic 9 closure walk)** is DEFERRED to BA's review pass per the established precedent.

- [x] **Task 10 — Memory + sprint-status + DAR + single commit (no push)** (AC-12 + AC-13):
  - Extend `~/.claude/.../memory/reference_stripe_service_pattern.md` with the Story 9-7 section per AC-12.
  - Update `~/.claude/.../memory/MEMORY.md` index entry's one-liner for `reference_stripe_service_pattern.md`.
  - Update `_bmad-output/implementation-artifacts/sprint-status.yaml`: add `9-7-owner-payouts-view: review` to Epic 9 (after `9-6-cancellation-with-refund: done`); update `last_updated` parenthetical. **Do NOT flip `epic-9: in-progress` → `done` in the dev-story commit** — that happens in the post-greenlight `docs:` follow-up.
  - Update this story file: `Status: ready-for-dev` → `Status: review`; mark Tasks 0–9 `[x]` (Task 9's BA-walk DEFERRED note stays); fill in Dev Agent Record.
  - Stage all files per AC-13.
  - Commit: `feat(stripe): Story 9-7 — owner payouts view`.
  - **Do NOT push.** Wait for BA browser-verification per Task 9 + AC-13 §6–§15 before pushing.
  - After BA greenlight: push, then add a small `docs:` follow-up commit to:
    - Flip sprint-status `9-7-owner-payouts-view: review` → `done`.
    - **Flip `epic-9: in-progress` → `done`** (the Epic 9 closure marker).
    - Update `last_updated` parenthetical with the ship commit hash + Epic 9 closure note.
    - Same `docs:` follow-up pattern as 9-1 / 9-2 / 9-2b / 9-3 / 9-4 / 9-5 / 9-6.

## Dev Notes

### What gets built and what's deliberately out of scope

Story 9-7 is the **last Theme B story** and the smallest by feature surface — deliberately scoped to a tight closing surface for clean Epic 9 closure.

**The 5 pieces of work:**
1. **New `/owner/payouts` Server Component route** rendering 5 distinct states (Connect-not-onboarded / Connect-inactive / zero-payouts / payouts-listed / Stripe-error).
2. **New `src/lib/payments/payouts.ts` sub-module** — the 6th and final Theme B sub-module.
3. **NEW `handlePayoutPaid` audit-only webhook handler** — 2nd proof of 9-5's dispatcher extensibility design.
4. **New `<PayoutStatusBadge>` component** — payout-status visual treatment.
5. **Header nav audit + add-if-missing** for the "Payouts" link.

After 9-7 lands at `review` and BA greenlights:

- Space Owners see their Stripe Connect payouts directly from the Stripe API at `/owner/payouts`.
- Stripe's `payout.paid` events are acknowledged + recorded in `webhook_events` for Story 8-4's downstream email consumption.
- The dispatcher map has its final Theme B handler — 7 handlers total (`account.updated` + `checkout.session.completed` + `checkout.session.expired` + `payment_intent.succeeded` + `payment_intent.canceled` + `charge.refunded` + `payout.paid`).
- Theme B (Epic 9) closes; BMad's optional Epic 9 retrospective becomes available.

Feature scope (Story 9-7 only):
- ✅ New `/owner/payouts` Server Component route with 5 rendered states.
- ✅ New `src/lib/payments/payouts.ts` sub-module (6th Theme B sub-module).
- ✅ NEW `handlePayoutPaid` audit-only webhook handler.
- ✅ New `<PayoutStatusBadge>` component.
- ✅ Header nav audit + add-if-missing.
- ✅ 4 new unit tests (2 wrapper + 2 handler).
- ✅ Memory extension + Epic 9 retrospective trigger.

Out of scope (do NOT build):
- ❌ Local `payouts` DB cache table — Phase 3.
- ❌ Cursor-based pagination UI — Phase 3.
- ❌ Date-range filters / CSV export / per-payout drill-down — Phase 3.
- ❌ Multi-currency — Phase 2 USD-only.
- ❌ Admin-side payouts view (`/admin/payouts`) — out of Phase 2.
- ❌ "Payout sent" email — Story 8-4.
- ❌ Other `payout.*` events (`payout.failed`, `payout.canceled`, `payout.created`) — Phase 3.
- ❌ Dashboard "this-month payouts" stat card — preserved Story 7-5 Decision §1 carve-out; deferred to polish (BA Decision §11).
- ❌ Schema changes / migrations — pure reads.
- ❌ Manual payout trigger — Stripe handles scheduling.

### Key decisions baked into the spec

1. **Direct Stripe API read on page-load** (BA Decision §1). No local cache. Phase 3 forward-flag for cache table.
2. **Server Component with 7-step lifecycle** (BA Decision §2). Auth → role check → Connect-state gate → Stripe call → render. No Client Component split.
3. **Sub-module pattern: `src/lib/payments/payouts.ts`** (BA Decision §3). 6th Theme B sub-module. `stripeAccount` in the SECOND `RequestOptions` arg — load-bearing.
4. **Audit-only webhook handler returning `{ handled: true }`** (BA Decision §4). Semantic stretch note: "handled" = "recorded for audit". The audit trail IS the work product.
5. **5 rendered states with empty-state-with-CTA pattern** (BA Decision §5). NO server-side redirects on Connect-not-active.
6. **Single-page `limit: 25`; NO pagination UI** (BA Decision §6). Phase 3.
7. **New `<PayoutStatusBadge>` component** (BA Decision §7, Option b). Doesn't extend `<StatusBadge>`.
8. **Header nav audit/add** (BA Decision §8). Verify or add the "Payouts" link in Host-mode nav.
9. **~4 new unit tests** (BA Decision §9). Target 408. Page-render + nav unit tests deferred.
10. **0 new E2E** (BA Decision §10). Target stays 61.
11. **Dashboard stat card DEFERRED to polish** (BA Decision §11). Story 7-5 Decision §1's carve-out preserved.
12. **Epic 9 retrospective trigger** (BA Decision §12). After greenlight, Epic 9 → done; retrospective optional per BMad.

### Test-count baseline alignment

BA Decision §9 cites "404 baseline + ~4 new = ~408 unit tests". The 404 baseline is the post-9-6 actual including the BA-walk-fix's defensive non-refund-paths test (`pnpm test` output at commit `428734d`: `404 passed | 1 skipped`).

E2E baseline: 61 (post-9-6 actual; 0 new in 9-6). +0 new locked in 9-7 → target **61** (or 62 if dev-agent ships the optional unactivated-empty-state E2E).

Build route count: 41 (post-9-6 actual). 9-7 adds **1 new route** (`/owner/payouts`) → target **42 routes** post-9-7.

### Sprint status update

[`_bmad-output/implementation-artifacts/sprint-status.yaml`](_bmad-output/implementation-artifacts/sprint-status.yaml) — add `9-7-owner-payouts-view: ready-for-dev` to Epic 9's section (after `9-6-cancellation-with-refund: done`). On move-to-review (Task 10), flip to `review`. On BA greenlight (post-push), flip to `done` AND flip `epic-9: in-progress` → `done` (Epic 9 closure).

### Recent commits (Epic 9 chain)

```
0abb2e0 docs: lock Story 9-7 BA decisions (owner payouts view)  ← THIS STORY's source-of-truth lock
adb3594 chore: mark Story 9-6 done in sprint status
428734d fix: add refund-success toast to eligible-refund cancel path (BA walk fix)
bb94bd4 feat(stripe): Story 9-6 — Guest cancellation with refund
3c3d11f chore: mark Story 9-5 done in sprint status
2950e15 feat(stripe): Story 9-5 — webhook dispatch generalization
```

Story 9-7 will be the **eighth Epic 9 feature commit** (after 9-1, 9-2, 9-2's BA-walk fix, 9-2b, 9-3, 9-3's BA-walk fix, 9-4, 9-5, 9-6, 9-6's BA-walk fix). Subject: `feat(stripe): Story 9-7 — owner payouts view`. **Theme B's final feature commit.**

### Forward-looking notes preserved (per BA decisions doc Forward-looking flags section)

- **Phase 3 payouts cache table** — wire `handlePayoutPaid` to insert into a new `payouts` table; switch `/owner/payouts` from direct Stripe API read to DB read. Enables the dashboard stat card (BA Decision §11) + CSV export + date-range filters + dashboard "this-month payouts" stat card from PRD §4.6.
- **Phase 3 per-payout drill-down** — `stripe.payouts.listLineItems` API surfaces which charges rolled up into each payout (tax/accounting use case).
- **Phase 3 pagination UI** — cursor-based "Show more" navigation.
- **Phase 3 multi-currency** — Phase 2 is USD-only.
- **Phase 3 admin-side payouts** — `/admin/payouts` for platform-wide payout activity.
- **Story 8-4 "Payout sent" email** — extends `handlePayoutPaid` (or hooks into `webhook_events`) to call the email helper. Same split as 9-4's `payment_intent.succeeded` / 9-6's `charge.refunded` → 8-4 email wiring.
- **Epic 9 retrospective** — optional per BMad standard; 9 proposed retrospective topics in the BA decisions doc's Forward-looking flags section (sub-module discipline, dispatcher extensibility, idempotency-key conventions, the 9-2 BA-walk-fix 3-stage try-catch pattern, audit-gap-on-retry trade-off, Stripe-first-then-DB ordering, schema CHECK DROP/ADD pattern, `acct_seed_for_e2e_only` reset hazard, PRD §4.5 cancel-interpretation resolution).
- **`acct_seed_for_e2e_only` operator hazard** — carries forward from 9-4 / 9-5 / 9-6 BA walks. BA may need to re-onboard `owner@deskhive.local` via `/owner/settings` before AC-13 §6–§15 walks if the seed has reset.

### References

- [Source: docs/design/9-7-owner-payouts-view-ba-decisions.md](docs/design/9-7-owner-payouts-view-ba-decisions.md) — locked 2026-05-19 (BA: Ikhtiyor Ziyayev), committed `0abb2e0`. 13 decisions including the §4 semantic-stretch note for the audit-only handler.
- [Source: docs/03-phase2-prd.md §4.6 FR-OWNER-1] — `/owner/payouts` sub-route lock.
- [Source: docs/03-phase2-prd.md §4.7 nav variants] — Host-mode nav order: `Dashboard + My spaces + Bookings + Payouts + user-pill`.
- [Source: docs/03-phase2-prd.md §6.4 webhook events] — `payout.paid` event lock.
- [Source: docs/03-phase2-prd.md §7.2 New Screens #5] — `/owner/payouts` visual spec: table of date / amount / status.
- [Source: docs/03-phase2-prd.md §8 Epic 9 Story 9-7] — AC + Stripe Connect API mention.
- [Source: deskhive/src/lib/payments/webhooks.ts](deskhive/src/lib/payments/webhooks.ts) — 9-5 dispatcher map + 9-6's `handleChargeRefunded` as the canonical extensibility example for `handlePayoutPaid` to mirror.
- [Source: deskhive/src/db/queries/stripe-connect.ts](deskhive/src/db/queries/stripe-connect.ts) — `getConnectAccountByUserId` for the pre-flight gate.
- [Source: deskhive/src/app/(owner)/owner/page.tsx](deskhive/src/app/(owner)/owner/page.tsx) — Story 7-5 Decision §1's "no $0 payouts stub" carve-out; preserved per AC-11.
- [Source: deskhive/src/app/(owner)/owner/bookings/page.tsx](deskhive/src/app/(owner)/owner/bookings/page.tsx) — sibling `/owner/*` Server Component pattern that `/owner/payouts` mirrors.
- [Source: deskhive/src/components/status-badge.tsx](deskhive/src/components/status-badge.tsx) — existing booking-status badge styling reference for the new `<PayoutStatusBadge>` (visually similar; types intentionally separate per BA Decision §7).
- Dev-agent memory `reference_stripe_service_pattern.md` — extend with Story 9-7 section per AC-12.

## Dev Agent Record

### Agent Model

Claude Opus 4.7 (1M context).

### Debug Log References

- `pnpm typecheck` clean (one minor fix: `Stripe.Payout.Status` is NOT exposed as a named union in the Stripe SDK's `.d.ts`; switched to indexed access `Stripe.Payout['status']`).
- `pnpm lint` clean.
- `pnpm test` — **408 passed + 1 skipped** (404 baseline + 4 new — exactly per AC-9 target; **no bonus tests this story**).
- `pnpm build` — **42 routes** (41 baseline + 1 new `/owner/payouts`). First route count increase since Story 9-3's `/spaces/[id]/booking/return`.
- `pnpm test:e2e` — **51 passed, 5 failed (documented hazards), 5 did not run = 61 total**. Matches AC-10's unchanged target. Zero new regressions from 9-7.

### Completion Notes

- **PRD §4.7 nav order reconciliation:** PRD §4.7 locked the Host-mode nav as `Dashboard + My spaces + Bookings + Payouts + user-pill` — but the existing header had Settings inserted between Bookings and the user-pill (Story 9-2's Stripe Connect onboarding surface, post-dating PRD §4.7). 9-7 inserts "Payouts" between Bookings and Settings — preserves PRD's relative order of the four PRD-mentioned items + keeps Settings as the post-9-2 trailing item. Documented in the header.tsx comment block.
- **Stripe SDK TS types gotcha:** `Stripe.Payout.Status` is NOT exposed as a named union in the SDK's type declarations. The component file initially typed the prop as `Stripe.Payout.Status` and the typecheck failed with `TS2694: Namespace 'Stripe.Payout' has no exported member 'Status'`. Fixed by switching to indexed-access `type PayoutStatus = Stripe.Payout['status']`. Resolves to the union `'paid' | 'pending' | 'in_transit' | 'canceled' | 'failed'`. Documented in the component file's comment.
- **Net unit-test count: +4 (BA-stated ~4; NO bonus this story).** Story 9-7 is the smallest Theme B story by test surface — the deliberate "last-story scope discipline" per BA Decision §13's scope-creep guard. 2 wrapper tests + 2 handler tests; no bonus regression coverage needed (the wrapper test's load-bearing assertion on `stripeAccount` arg position is the critical safety net). Page-render unit tests deferred per BA Decision §9 (Server Component testing is heavyweight; BA walk covers all 5 rendered states).
- **Net E2E-test count: +0 → 61 target met unchanged.** BA Decision §10 locked 0 new. Optional unactivated-empty-state E2E NOT shipped (Decision §10's optional override) — the empty-state logic is pure application-layer with no Stripe involvement; BA walk + the wrapper unit tests cover it adequately.
- **Route count: 42** (41 + 1). First route count increase since Story 9-3 (which added `/spaces/[id]/booking/return`). Theme B's final user-facing route surface.
- **6th sub-module + final Theme B handler — dispatcher extensibility validated.** 9-6's `charge.refunded` was the first proof of 9-5's design; 9-7's `payout.paid` is the second. Both adds = exactly 1 function + 1 map entry. Route shell at `src/app/api/stripe/webhook/route.ts` UNCHANGED. `dispatchWebhookEvent` UNCHANGED. `WebhookHandlerResult` type UNCHANGED. The dispatcher design is validated as extensible — future Phase 3 handlers (`payout.failed`, `charge.dispute.created`, `payment_intent.payment_failed`) follow the same shape.
- **`stripeAccount` arg position safety-net test.** The wrapper test asserts `expect(params).not.toHaveProperty('stripeAccount')` + `expect(opts.stripeAccount).toBe('acct_test_connected')` — explicitly catches the accidental-refactor case where someone flattens the call into `stripe.payouts.list({ limit: 25, stripeAccount: ... })`. Misplacing the arg silently returns the platform's own payouts (wrong scope) — a subtle bug class that this test prevents from regressing.
- **Pre-flight Connect-state gate** keeps Stripe round-trips off the un-transacting paths. States 1 (no Connect row / incomplete onboarding) and 2 (Connect-inactive) short-circuit BEFORE `listPayouts` fires — pure DB-row-based decision via the existing `getConnectAccountByUserId` helper from 9-2. The 9-2b publish gate + 9-3 booking-create gate established this pattern; 9-7 is the 4th instance.
- **Empty-state-with-CTA UX.** The `/owner/payouts` URL is bookmarkable; un-onboarded owners landing there get the helpful empty-state + CTA instead of a hostile silent redirect. Same pattern as `/owner/spaces` for owners with zero spaces (Story 7-5). All 3 pre-payouts empty states (no-Connect / inactive / zero-payouts) follow this shape.
- **AC-13 §6–§15 (full BA browser walk including all 5 rendered states + `stripe listen` + `payout.paid` event walk + Epic 9 closure walk)** is DEFERRED to BA's review pass per the established precedent. BA needs: (1) `owner@deskhive.local` Connect in REAL state (re-onboard via `/owner/settings` if seed reset to synthetic — recurring operator hazard); (2) `stripe listen --forward-to localhost:3000/api/stripe/webhook` + `STRIPE_WEBHOOK_SECRET` swap to CLI value + `pnpm dev` restart; (3) at least one materialized test-mode payout for the State #4 happy-path walk (Stripe simulates payouts daily; `stripe trigger payout.paid` is the manual short-circuit if a fresh payout hasn't materialized yet).
- **Theme B closure path** (post-greenlight): the standard `docs:` follow-up commit flips `9-7-owner-payouts-view: review` → `done` AND `epic-9: in-progress` → `done` (the Theme B closure marker). The optional Epic 9 retrospective workflow then becomes available per BMad standard — 9 proposed retrospective topics documented in the BA decisions doc's Forward-looking flags section.
- **Phase 3 forward-flags catalog** (preserved in memory):
  - Local payouts cache table → dashboard "this-month payouts" stat card (Story 7-5 Decision §1 finally enabled).
  - Per-payout drill-down via `stripe.payouts.listLineItems`.
  - Cursor-based pagination UI for `/owner/payouts`.
  - Multi-currency support (Phase 2 USD-only).
  - Admin-side `/admin/payouts` view.
  - `payout.failed` / `payout.canceled` handlers for richer lifecycle tracking.
  - `payment_intent.payment_failed` handler (no current Phase 2 consumer).

### File List

**New (in-tree):**
- `deskhive/src/lib/payments/payouts.ts` — `listPayouts` Stripe Connect Payouts list wrapper (6th and final Theme B sub-module)
- `deskhive/src/lib/payments/payouts.test.ts` — 2 wrapper unit tests with load-bearing `stripeAccount` arg-position assertion
- `deskhive/src/app/(owner)/owner/payouts/page.tsx` — Server Component route with 5-state rendering logic
- `deskhive/src/components/payout-status-badge.tsx` — `<PayoutStatusBadge>` component (Stripe payout status → existing badge-* CSS tokens)

**Modified (in-tree):**
- `_bmad-output/implementation-artifacts/sprint-status.yaml` — `9-7-owner-payouts-view: review`; last_updated parenthetical refreshed
- `_bmad-output/implementation-artifacts/9-7-owner-payouts-view.md` — Status → review, tasks `[x]`, DAR filled in
- `deskhive/src/components/header.tsx` — added "Payouts" link in Host-mode nav variant (between Bookings + Settings, preserving PRD §4.7 relative order); comment block updated
- `deskhive/src/lib/payments/webhooks.ts` — added `handlePayoutPaid` audit-only handler + map entry; final Theme B handler
- `deskhive/src/lib/payments/webhooks.test.ts` — added 2 new handler tests (happy + malformed-defensive)

**Out-of-tree (memory):**
- `~/.claude/.../memory/reference_stripe_service_pattern.md` — extended with full Story 9-7 section (6th sub-module + read-only API pattern + audit-only handler semantic-stretch + 5-state rendering + `<PayoutStatusBadge>` + header nav + Theme B closure markers + 9 proposed Epic 9 retrospective topics + Phase 3 forward-flag catalog)
- `~/.claude/.../memory/MEMORY.md` — index entry one-liner refreshed to reflect 9-7 additions + Theme B completion

### Change Log

| Date | Change | Commit |
|---|---|---|
| 2026-05-19 | Story drafted by `bmad-create-story` from locked BA decisions document (commit `0abb2e0`). Last Theme B story; Epic 9 closes after 9-7 ships at greenlight. | `0dda7c8` |
| 2026-05-19 | Story implemented; new `/owner/payouts` Server Component route with 5 rendered states (no-Connect / inactive / zero-payouts / payouts-listed / Stripe-error); new 6th and FINAL Theme B sub-module `src/lib/payments/payouts.ts` (read-only `listPayouts` wrapper; load-bearing `stripeAccount` in 2nd RequestOptions arg with safety-net test); NEW `handlePayoutPaid` audit-only webhook handler — SECOND proof of 9-5's dispatcher extensibility design (exactly 1 new function + 1 new map entry; route + dispatcher + types all unchanged); semantic-stretch lock: "handled" = "recorded for audit" not "DB state transitioned"; new `<PayoutStatusBadge>` component (Option b — separate from `<StatusBadge>` to avoid type-coupling 3 enums); header nav extended with "Payouts" link in Host-mode variant (PRD §4.7 relative order preserved); 4 new unit tests (no bonus this story — deliberate last-story scope discipline); 0 new E2E (target 61 unchanged); +1 new route (42 total). Memory entry extended; MEMORY.md index refreshed. Single commit per AC-13 — awaiting BA browser walk via `stripe listen` before push. After greenlight + `docs:` follow-up, `epic-9: in-progress` → `done` (Theme B closure). | _TBD (filled by `docs:` follow-up after BA greenlight + push; same pattern as Stories 9-1 + 9-2 + 9-2b + 9-3 + 9-4 + 9-5 + 9-6)_ |
