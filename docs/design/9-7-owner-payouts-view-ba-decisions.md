# Story 9-7: Space Owner Payouts View — BA Decisions

**Story:** 9-7
**Epic:** 9 — Payments (Theme B)
**Phase:** 2
**Type:** New Server Component route (`/owner/payouts`) + new Stripe sub-module `src/lib/payments/payouts.ts` (6th Theme B sub-module) wrapping `stripe.payouts.list` + NEW `payout.paid` handler in the 9-5 dispatcher map. **Last Theme B story; closes Epic 9.**
**Author:** Ikhtiyor Ziyayev, Business Analyst
**Date drafted:** 2026-05-19
**Status:** LOCKED 2026-05-19. Ready for dispatch.
**Source:** Phase 2 PRD §4.6 FR-OWNER-1 (`/owner/payouts` sub-route lock) + §4.4 FR-PAY-7 (platform fee → owner payout calculation) + §6.4 (`payout.paid` Connect webhook) + §4.3 (Email triggers — "Payout sent" notification, deferred to Story 8-4) + §7.2 New Screens #5 (`/owner/payouts` Payout history with table of date/amount/status) + §8 Epic 9 Story 9-7 + Story 7-5 Decision §1 ("no $0 payouts stub" — explicit refusal to populate the dashboard payouts card before 9-7 lands).

**Companion / dependency chain:**

- **Story 9-1** (Stripe SDK wrapper) shipped at `aff4060`. Provides `src/lib/stripe.ts` singleton + `StripeServiceResult<T>` discriminated union.
- **Story 9-2** (Stripe Connect Express onboarding) shipped at `0d384e0` + `8a06402`. Provides `stripe_connect_accounts` table (the lookup row 9-7 needs to find the `stripeAccountId`) + `getConnectAccountByUserId` helper + the load-bearing 3-stage try-catch pattern carried forward to 9-7's webhook handler.
- **Story 9-2b** (publish gating) shipped at `7e7251c` + `2d65c54`. Provides the cached-Connect-state pattern (`charges_enabled` + `payouts_enabled` flags in the DB) — 9-7's pre-flight gate reads these same flags.
- **Story 9-3** (booking with payment) shipped at `bd76dc3` + `8035907`. Provides the destination-charge marketplace model where Stripe automatically settles funds to the connected account via the platform's `application_fee_amount` — meaning real test-mode payouts WILL flow to the BA's `owner@deskhive.local` Connect account once captures fire.
- **Story 9-4** (confirm/reject with capture/cancel) shipped at `32dd63a`. Each successful capture moves funds from the platform's Stripe balance to the connected account's available balance → eventually appears as a Stripe payout (test-mode-simulated daily).
- **Story 9-5** (webhook dispatch generalization) shipped at `2950e15`. Provides the `WEBHOOK_HANDLERS` map + `dispatchWebhookEvent()` entry that 9-7 extends by adding ONE new handler function + ONE new map entry. **Second proof of 9-5's dispatcher extensibility design** (9-6's `charge.refunded` was the first).
- **Story 9-6** (Guest cancellation with refund) shipped at `bb94bd4` + `428734d`. RESOLVED the long-standing PRD §4.5 cancel-interpretation open question. Refunds reverse part of the connected account's available balance → can affect future payout amounts but not historical ones (Stripe's posted-payout state is immutable).

Story 9-7 cannot dispatch until all six are on `main` (they are). **After 9-7 ships, Theme B (Epic 9) is COMPLETE.** Trigger the Epic 9 retrospective per the BMad standard.

---

## Context

**Phase 2 PRD §4.6 FR-OWNER-1 — the `/owner/payouts` lock:**

> Approved Space Owners have a new route surface at `/owner/*`. Sub-routes:
> [...]
> • `/owner/payouts` — payout history from Stripe Connect

**Phase 2 PRD §7.2 New Screens #5 — visual spec (`/owner/payouts`):**

> Payout history
> - Table of Stripe Connect payouts
> - Per-row date, amount, status

**Phase 2 PRD §8 Epic 9 Story 9-7 — AC:**

> Space Owner payouts view
> - `/owner/payouts` page with list of Stripe Connect payouts (test-mode simulated)
> - Stripe Connect API to fetch payout history
> - AC: payout list displays correctly, includes status and amounts

**Phase 2 PRD §6.4 — `payout.paid` webhook event lock:**

> `payout.paid` (Connect, test-mode-simulated) — fires payout email

**Phase 2 PRD §4.3 — email trigger lock (deferred to Story 8-4):**

> | Event | Recipient | Subject | Trigger |
> | Payout sent | Space Owner | "Payout sent" | Stripe Connect `payout.paid` webhook (test mode simulated) |

**Story 7-5 Decision §1 — the dashboard stat-card carve-out:**

> Three honest stat cards (no $0 payouts stub — Decision §1).

The Owner dashboard at `/owner` deliberately omitted the PRD §4.6 "this-month payouts" stat card during Story 7-5 because no payouts data was yet wired. 9-7 makes that data available — **but whether 9-7 populates the dashboard stat card is a load-bearing decision** (see Decision §11).

**What 9-7 does NOT touch:**

- ❌ "Payout sent" email template — Story 8-4 territory (wires the `payout.paid` event delivery to email send AFTER 9-7's handler lands; 9-7 ships ZERO email work).
- ❌ Local `payouts` table — 9-7 reads directly from Stripe Connect API; no DB schema changes. Phase 3 may add a cache for SLA / dashboard speed (Decision §1).
- ❌ Per-payout drill-down (which captured bookings rolled up into this payout?) — Phase 3. Stripe's payout-to-charge linkage requires a separate `stripe.payouts.listLineItems` API call + cross-referencing.
- ❌ CSV export, date-range filters, currency conversion — Phase 3.
- ❌ Admin-side payouts view (`/admin/payouts`) — out of Phase 2 (Super Admin uses Stripe dashboard directly).
- ❌ Owner-initiated payout (manual "request payout now") — Stripe handles payout scheduling automatically per Connect account settings.

---

## Scope

**In scope:**

- **New Server Component route** at [src/app/(owner)/owner/payouts/page.tsx](deskhive/src/app/(owner)/owner/payouts/page.tsx) — fetches the SPACE_OWNER's payouts list from Stripe Connect API at page-load time + renders a table of date / amount / status. See Decision §1 + §2.
- **New Stripe sub-module** at [src/lib/payments/payouts.ts](deskhive/src/lib/payments/payouts.ts) — **6th Theme B sub-module** after `connect.ts` (9-2) / `checkout.ts` (9-3) / `payment-intents.ts` (9-4) / `webhooks.ts` (9-5) / `refunds.ts` (9-6). Wraps `stripe.payouts.list({ stripeAccount: connectAccountId })` with `StripeServiceResult<T>` shape. See Decision §3.
- **NEW `handlePayoutPaid` webhook handler** in [src/lib/payments/webhooks.ts](deskhive/src/lib/payments/webhooks.ts) — extends 9-5's `WEBHOOK_HANDLERS` map by ONE new handler + ONE new map entry. **Second proof of the dispatcher extensibility design.** Phase 2 the handler is an audit-only acknowledgment (no email send, no DB writes — see Decision §4).
- **Pre-flight Connect-state gate** at the page — owner without a Connect row OR with `charges_enabled !== true && payouts_enabled !== true` → inline empty-state explanation + CTA back to `/owner/settings` (the existing onboarding entry). See Decision §5.
- **Pagination strategy** — Phase 2 ships single-page-only (first 25 payouts, no "Next page" UI). See Decision §6.
- **Status badge component reuse** — reuse the existing `<StatusBadge>` pattern with a new `payout` status variant (or inline-styled — dev-agent picks). See Decision §7.
- **Header nav addition** — PRD §4.7 mentions "My spaces + Bookings + Payouts" in the Host-mode nav. Verify the existing nav already includes Payouts OR add it. See Decision §8.
- **Unit tests** — wrapper tests for `listPayouts` + page render tests + webhook handler tests. See Decision §9.
- **E2E tests** — 0 new (locked). See Decision §10.
- **Story 7-5 dashboard stat-card** — strawman locks **DEFER to a polish item**, not 9-7 scope. See Decision §11.
- **Memory** — extend `reference_stripe_service_pattern.md` with the 9-7 section; trigger Epic 9 retrospective. See Decision §12.

**Out of scope (deferred):**

- ❌ Local `payouts` DB cache — Phase 3.
- ❌ Per-payout drill-down — Phase 3.
- ❌ Pagination UI ("Next page" / cursor) — Phase 3.
- ❌ Date-range filters — Phase 3.
- ❌ CSV export — Phase 3.
- ❌ Multi-currency — Phase 2 USD-only.
- ❌ Dashboard "this-month payouts" stat card — Story 7-5 Decision §1's deliberate carve-out; 9-7 strawman locks DEFER per Decision §11.
- ❌ "Payout sent" email send — Story 8-4 territory; 9-7 handler is audit-only.
- ❌ Webhook handler that triggers UI revalidation — `/owner/payouts` is read-direct-from-Stripe on every page load; no cache to invalidate.
- ❌ Admin-side payouts view — out of Phase 2.
- ❌ Manual payout trigger / payout-now button — Stripe handles scheduling.

---

## Decisions

### Decision 1: Data source — direct Stripe API read at page-load time (NO local cache)

**Rationale:** PRD §4.6 + §7.2 + §8 Epic 9 Story 9-7 all consistently say "from Stripe Connect" / "fetch payout history" — strongly implying a direct Stripe API read pattern, not a locally-mirrored cache. The codebase has no `payouts` table in the schema (verified) and adding one would be a load-bearing schema decision the PRD doesn't sanction.

**Locked: direct Stripe API read at page-load time via `stripe.payouts.list({ stripeAccount: connectAccountId })`. NO local cache. NO DB schema changes.**

**Trade-offs:**

- **Pro:** Simpler architecture; no schema churn; Stripe is the source of truth (always fresh); Stripe handles pagination semantics + filtering server-side.
- **Pro:** Aligns with the "no premature cache" principle from prior stories (we don't cache the Connect account's full state either — we read `getConnectAccountStatus` from the singleton Stripe API when needed).
- **Con:** Page-load latency depends on Stripe API response (~200–500ms typical in test mode).
- **Con:** Stripe rate limits theoretically possible at scale (Phase 2 single-user demo: not a concern).
- **Con:** If Stripe API is down, the page can't render. Mitigation: handle the `{ ok: false }` path gracefully with a "Payouts temporarily unavailable" empty state (Decision §5 carries this).

**Phase 3 considerations** (out of 9-7 scope but worth flagging): a local `payouts` cache table updated by the `payout.paid` webhook handler would solve the latency + availability concern, AND would enable the dashboard "this-month payouts" stat card (Story 7-5 Decision §1) without a Stripe API call per dashboard render. **9-7 strawman defers this** — the schema + cache invalidation logic is too much for the "last Theme B story" budget.

**Anti-pattern forbidden:**
- Do NOT add a `payouts` table to `src/db/schema.ts` (out of Phase 2 scope; PRD doesn't sanction).
- Do NOT cache the Stripe API response in any in-memory store (Next.js's `'use cache'` directive, React's `cache()` helper, or similar) — would diverge from Stripe-as-truth on every refund / new capture.
- Do NOT cross-reference Stripe payouts with local bookings to compute per-booking attribution — Phase 3 territory.

---

### Decision 2: Server Component route shape — `/owner/payouts`

**Locked: new Server Component at `src/app/(owner)/owner/payouts/page.tsx`.**

The route surface follows the established `/owner/*` family (bookings, settings, spaces). The page is Server-Side rendered (no Client Component split per-component — same pattern as `/owner/bookings/page.tsx`). Auth + role check happens at the page entry via `requireSession()` + a role check; role-mismatched users (Guest / Admin) get redirected to their natural workspace per the existing `/owner/*` pattern (Story 7-5).

**Page lifecycle (locked):**

1. `requireSession()` — 401 → redirect to `/login?callbackUrl=/owner/payouts`.
2. Role check: SPACE_OWNER (mode-aware — Host mode). Guest in Guest mode → silent redirect to `/my-bookings` (same pattern as Story 7-5 / Story 6-2). Super Admin → silent redirect to `/admin/bookings`.
3. `getConnectAccountByUserId(ownerId)` — fetch the cached Connect row (9-2 helper).
4. Pre-flight Connect-state gate (Decision §5) — if row missing OR `charges_enabled !== true` OR `payouts_enabled !== true`, render empty-state with CTA to `/owner/settings` (no Stripe API call).
5. `listPayouts({ stripeAccountId })` — new sub-module call (Decision §3). Returns `StripeServiceResult<{ payouts: Stripe.Payout[] }>`.
6. On Stripe error → render fallback "Payouts temporarily unavailable. Please refresh in a moment." inline (no error toast — Server Component can't fire toasts; inline message in the table area is the right pattern).
7. On success → render the table OR an empty-state if `payouts.length === 0`.

**Anti-pattern forbidden:**
- Do NOT make this a Client Component (no React state needed; Stripe call is server-side).
- Do NOT split the page into a Server-fetch wrapper + Client-render child (no interactivity needed — pure table).
- Do NOT use `useSWR` or other client-side data-fetching — server-render is the right pattern.

---

### Decision 3: New Stripe sub-module — `src/lib/payments/payouts.ts` (6th Theme B sub-module)

**Locked: new sub-module at `src/lib/payments/payouts.ts` following the 9-2 / 9-3 / 9-4 / 9-5 / 9-6 convention.**

Single export `listPayouts`:

```typescript
// src/lib/payments/payouts.ts (NEW — 6th Theme B sub-module)

import Stripe from 'stripe';
import { stripe } from '@/lib/stripe';
import type { StripeServiceResult } from '@/lib/stripe-service';

/**
 * Story 9-7: lists payouts for a connected Stripe account. Read-only
 * Stripe API call — Phase 2 ships single-page-only (first 25 payouts;
 * no pagination UI per BA Decision §6). Phase 3 may extend the args
 * with cursor (`starting_after`) + date range.
 *
 * Returns the raw Stripe.Payout[] array. The page (Decision §2) reads
 * .id / .amount / .currency / .status / .arrival_date for the table
 * render.
 */
export async function listPayouts(args: {
  stripeAccountId: string;
  limit?: number; // defaults to 25 per Decision §6
}): Promise<StripeServiceResult<{ payouts: Stripe.Payout[] }>>;
```

Internal Stripe API call:

```typescript
const result = await stripe.payouts.list(
  { limit: args.limit ?? 25 },
  { stripeAccount: args.stripeAccountId },
);
return { ok: true, data: { payouts: result.data } };
```

**`stripeAccount` header (the second `Stripe.RequestOptions` arg) is the load-bearing piece.** This tells Stripe to scope the list to the connected account, NOT the platform's own payouts. Without it, the call would return the platform's payout history (not what we want).

`mapStripeError` helper — identical shape to 9-2 / 9-3 / 9-4 / 9-6 wrappers. Stripe SDK errors (`Stripe.errors.StripeError`) → `err.message`. Other errors → `'Unexpected error'` + `console.error` for ops visibility.

**Idempotency key: N/A.** Read-only operations don't need idempotency keys (Stripe's idempotency model is for write operations). The list endpoint is naturally idempotent.

**Anti-pattern forbidden:**
- Do NOT call `stripe.payouts.*` from anywhere outside this sub-module.
- Do NOT pass `stripeAccount` as the first arg — that's the wrong position (Stripe SDK ts-typed signature: first arg is params; second is RequestOptions which includes `stripeAccount`).
- Do NOT extract per-payout line items (`stripe.payouts.listLineItems`) in 9-7 — Phase 3.
- Do NOT cache the response across requests (no `unstable_cache`, no React `cache()` — Decision §1 carry-forward).

---

### Decision 4: NEW `handlePayoutPaid` webhook handler — audit-only (NO email send, NO DB writes)

**Rationale:** PRD §6.4 + §4.3 say the `payout.paid` event fires the "Payout sent" email. But email work is Story 8-4 territory (deferred — pattern carry-forward from 9-4 / 9-5 / 9-6 handlers that all defer email sends to 8-4). And **9-7 reads payouts directly from Stripe** (Decision §1), so there's no local DB cache to update from the webhook event.

**That leaves the handler as audit-only:** acknowledge the event (route inserts into `webhook_events`), return `{ handled: true }`, and that's it. No DB writes, no email sends, no cache invalidation.

**Locked handler shape:**

```typescript
// src/lib/payments/webhooks.ts (extend with one more handler + one more map entry)

export async function handlePayoutPaid(
  event: Stripe.Event,
): Promise<WebhookHandlerResult> {
  const payout = event.data.object as Stripe.Payout;
  // Defensive log for ops visibility. `payout.id` is the canonical
  // identifier (po_*); `payout.amount` is in cents; `payout.currency`
  // is the Stripe currency code (usd for Phase 2).
  logger.info('stripe_webhook_payout_paid_acknowledged', {
    eventId: event.id,
    payoutId: payout.id,
    amountCents: payout.amount,
    currency: payout.currency,
  });
  // No DB writes — payouts are read direct from Stripe at page-load
  // time (BA Decision §1). No email send — 8-4 wires that up later.
  // Return handled:true so the route inserts webhook_events for the
  // audit trail (Story 8-4 will hook into this event delivery).
  return { ok: true, handled: true };
}
```

**Map entry:**

```typescript
export const WEBHOOK_HANDLERS = {
  // ... existing 6 entries from 9-2 / 9-3 / 9-5 / 9-6 ...
  'payout.paid': handlePayoutPaid, // NEW in 9-7 — last handler for Theme B.
};
```

**Why `{ handled: true }` even though no DB write happens:**

The `handled: true / deferred: true / idempotent: true` distinction in 9-5 was about whether the handler did "real work" (state-mutation). For 9-7's audit-only handler, there's no state to mutate — but the audit trail IS the work product. Logging the event into `webhook_events` so Story 8-4 can hook into the same delivery (via `webhook_events` query OR via extending this handler later) is the load-bearing reason to insert.

**Semantic stretch note:** this handler does no DB writes or email sends, but returns `{ handled: true }` so `webhook_events` gets the row inserted for Story 8-4's downstream consumption. "Handled" here means "recorded for audit", not "DB state transitioned".

**Alternative considered + rejected:** return `{ handled: false }` to skip the `webhook_events` insert. Rejected because it would silently drop the audit trail; 8-4 would have no record of when each payout event arrived.

**Log key:** `stripe_webhook_payout_paid_acknowledged` (follows the 9-5 handler-name-prefix convention).

**Idempotency:** Layer 1 (centralized route-entry check on `webhook_events.stripe_event_id`) handles dedup — if the same `payout.paid` event arrives twice, the second delivery short-circuits at the route. No per-handler conditional WHERE needed (there's no booking row to UPDATE).

**Anti-pattern forbidden:**
- Do NOT trigger email sends from this handler — 8-4 territory.
- Do NOT create a `payouts` table (Decision §1 anti-pattern).
- Do NOT call `stripe.payouts.retrieve` to enrich the event payload — webhook payload is the source of truth (9-3 / 9-5 carry-forward).
- Do NOT also handle `payout.failed` / `payout.canceled` / `payout.created` in 9-7 — Phase 3.
- Do NOT skip the audit-log insert — the audit trail is the handler's primary product.

---

### Decision 5: Pre-flight Connect-state gate + empty state UX

**Rationale:** PRD §4.6 + 9-2b's publish-gating pattern both establish that owners without active Connect state can't transact. The `/owner/payouts` page needs the same gate — but unlike `/owner/spaces` (which silently disables the Publish button), the Payouts page has nothing to show for unactivated owners.

**Locked: three rendered states at `/owner/payouts`:**

1. **Connect-not-onboarded** (no `stripe_connect_accounts` row OR `onboarding_completed === false`):
   - Render an empty-state card: *"Set up payouts to see your earnings history."* + CTA button "Complete onboarding" → `/owner/settings`.
   - NO Stripe API call fires (the gate is purely DB-row-based, same as 9-2b's publish gate).
2. **Connect-onboarded-but-inactive** (`charges_enabled !== true` OR `payouts_enabled !== true`):
   - Render an empty-state card: *"Payouts are paused. Re-onboard to receive funds."* + CTA → `/owner/settings`.
   - NO Stripe API call fires.
3. **Connect-active + payouts.length === 0** (eligible but no payouts yet):
   - Render an empty-state card: *"No payouts yet. Once a booking is confirmed and captured, your share will be paid out within a few days."*
   - Stripe API DID fire (returned empty array).
4. **Connect-active + payouts.length > 0**:
   - Render the table per PRD §7.2 (date / amount / status).
5. **Stripe API error** (`listPayouts` returned `{ ok: false }`):
   - Render the table area with an inline error: *"Payouts temporarily unavailable. Please refresh in a moment."*
   - Logger.error with the Stripe error message for ops debugging.

**Locked copy** — strawman picks; BA may edit exact wording during lock.

**Why empty-state vs server-side redirect:**

The `/owner/payouts` URL is bookmarkable and the owner may have legitimately landed there. Silently redirecting on Connect-not-onboarded would be hostile (user thinks the link is broken). Empty-state + CTA is the right UX — same pattern as `/owner/spaces` for an owner with zero spaces (Story 7-5).

**Anti-pattern forbidden:**
- Do NOT redirect on Connect-not-active — empty-state is the right UX.
- Do NOT make the Stripe API call without the pre-flight DB gate — wastes a Stripe round-trip for owners who can't transact.
- Do NOT silently return empty array on Stripe error — surface the error so ops + the user know.
- Do NOT skip the `onboarding_completed` check (some Stripe accounts can be partially-onboarded; `payouts_enabled === false` covers this but the explicit onboarding flag is the canonical signal per 9-2b).

---

### Decision 6: Pagination — single-page, first 25 payouts, no UI

**Locked: Phase 2 single-page-only. `limit: 25` on the Stripe API call. No "Next page" / "Show more" UI.**

**Rationale:**

- Phase 2 demo flow exercises ~1–3 payouts max (the user creates a few bookings + captures them; Stripe rolls them into 1–2 daily-simulated payouts in test mode).
- Building cursor-based pagination requires: URL search params (`?starting_after=po_xxx`), state management, prev/next buttons, total-count display, edge cases (last page, empty page, malformed cursor). Significant scope creep for the "last Theme B story."
- Phase 3 polish item: extend `listPayouts` args with `startingAfter?: string` + add "Show more" button.

**What "first 25" gets you:** Stripe's `/v1/payouts` API defaults to `limit: 10`, max `100`. 25 is a sensible middle ground (covers ~3–4 weeks of daily payouts for an active owner; well below the API max).

**Anti-pattern forbidden:**
- Do NOT add a `?page=` query param in 9-7 — Phase 3 will do cursor-based (not offset-based) pagination per Stripe's API.
- Do NOT default to `limit: 100` "just in case" — fetching 100 items per page-load wastes Stripe quota for the common case.
- Do NOT silently hide payouts past row 25 — if the BA walk uncovers an owner with >25 payouts, surface a "Showing 25 of N — pagination coming soon" footer note (dev-agent picks the wording; this is a polish-leaning detail).

---

### Decision 7: Status badge — reuse `<StatusBadge>` OR inline

**Rationale:** PRD §7.2 says "Per-row date, amount, status" — the status column needs visual distinction (paid / in_transit / pending / failed / canceled). Existing `<StatusBadge>` component supports booking-status colors (CONFIRMED / PENDING / etc.) — could extend OR build inline.

**Stripe payout statuses to display:**
- `paid` — green/success (the happy state — funds settled in owner's bank).
- `in_transit` — blue/info (en route from Stripe to owner's bank; usually 1–2 business days).
- `pending` — gray/neutral (Stripe has scheduled the payout but not initiated transfer yet).
- `failed` — red/error (transfer failed; needs owner action).
- `canceled` — gray/struck-through (owner or Stripe canceled before transfer; rare in test mode).

**Three options considered:**

- **(a) Extend `<StatusBadge>`** with a new `payoutStatus` variant prop. Pro: reuses existing styling pattern; consistent across the app. Con: couples booking-status enum and payout-status enum into one component (type-fragile).
- **(b) New `<PayoutStatusBadge>` component** at `src/components/payout-status-badge.tsx`. Pro: clear separation of concerns; matches Story 7-5's role-specific component pattern. Con: minor copy-paste of `<StatusBadge>` styling.
- **(c) Inline status rendering** with utility classes (e.g., `<span className={statusClasses(payout.status)}>{payout.status}</span>`). Pro: minimal new code. Con: skips the design-system pattern; inconsistent with rest of app.

**Strawman pick: (b) — new `<PayoutStatusBadge>` component.** Mirrors Story 7-5's role-specific pattern; clean separation; cheap (~30 lines). The existing `<StatusBadge>` stays scoped to BookingStatus.

**Anti-pattern forbidden:**
- Do NOT inline raw `payout.status` strings without status-specific visual treatment (PRD §7.2 implies "status" is visually meaningful).
- Do NOT introduce a new design token / color — reuse the existing brand-token set (CC-8 carry-forward from earlier stories).
- Do NOT extend `<StatusBadge>` with conditional logic that hides the existing booking-status prop interface.

---

### Decision 8: Header nav — verify "Payouts" link

**Rationale:** PRD §4.7 (header nav variants) says the Space-Owner-in-Host-mode nav is: *"logo + Dashboard + My spaces + Bookings + Payouts + user-pill"*. Story 7-1 wired up role + mode switching with the header nav variants — need to verify the "Payouts" link is already present (pointing to `/owner/payouts`) OR add it.

**Locked: Audit Header component during dev-story Task 0. If "Payouts" link is missing, add it as a 5-line change. If present, no work needed.**

The dev-agent's audit step in Task 0 captures this. Conservatively scope as "verify + minimal-add" — the nav implementation is small (one `<Link>` between Bookings and the user pill).

**Anti-pattern forbidden:**
- Do NOT add the Payouts link to OTHER nav variants (Guest mode, Super Admin, etc.). Host-mode only.
- Do NOT change the link order from PRD §4.7's locked sequence.

---

### Decision 9: Unit test coverage — ~6–8 new tests

**Target after 9-7 ships: 404 + ~6–8 new = ~410–412 unit tests.** Per the 9-1 → 9-6 precedent, dev-agent typically ships +1–3 bonus tests beyond the BA estimate.

**Test files / additions:**

1. **`src/lib/payments/payouts.test.ts`** (NEW — 2 wrapper tests):
   - `listPayouts` happy path — Stripe SDK called with `({ limit: 25 }, { stripeAccount })` shape; result wrapped as `StripeServiceResult<{ payouts: Stripe.Payout[] }>`.
   - `listPayouts` error path — Stripe throws `StripeError` → `{ ok: false, error: <message> }`.
   - Mock at `@/lib/stripe` boundary.

2. **`src/lib/payments/webhooks.test.ts`** extension (2 new handler tests):
   - `handlePayoutPaid` happy path — Stripe.Payout event → `{ ok: true, handled: true }`. Asserts logger called with the right payload (`payoutId`, `amountCents`, `currency`).
   - `handlePayoutPaid` shape — event with malformed payload (missing `payout.id`) → still returns `{ handled: true }` (no DB writes that could fail; the handler is audit-only). Or — if BA prefers strictness — return `{ deferred: true }` on missing id. Strawman picks the lenient path (handler is audit-only; logger captures whatever's there).

3. **Page render tests** — TBD. Server Components are awkward to unit-test (require React Server Component test helpers OR Playwright). Two options:
   - (a) Skip page-render unit tests; rely on the BA walk + the wrapper + handler tests.
   - (b) Add a small Node-render test verifying the pre-flight gate behavior (Connect-not-active → empty-state vs active → calls `listPayouts`).
   - **Strawman: (a) skip.** Server Component testing is heavyweight; the gate logic is trivially-verifiable via direct DB read; the BA walk covers all 5 rendered states (Decision §5).

4. **Header nav nav-link existence** — TBD. Dev-agent picks (could be a snapshot test or a simple node-test of the render output).

**Mock-boundary reminder:**
- Wrapper tests mock `@/lib/stripe`.
- Handler tests mock `@/db/queries/*` (none needed for audit-only) — actually, since 9-7's handler does no DB queries, only `vi.spyOn(logger, ...)` is needed.

**Target net new: ~4 unit tests** (2 wrapper + 2 handler). Below the BA's earlier estimate range — Theme B's last story is small.

**Anti-pattern forbidden:**
- Do NOT mock the Stripe SDK at the dev-server layer (out of test scope).
- Do NOT skip the wrapper happy path test — verifies the `stripeAccount` arg position (load-bearing per Decision §3).

---

### Decision 10: E2E test coverage — 0 new (locked target: 61 unchanged)

**Locked: 0 new E2E tests in 9-7. Target stays at 61.**

**Rationale (same shape as 9-4 / 9-5 / 9-6):** the happy `/owner/payouts` render requires a real Stripe test-mode account with at least one historical payout — fragile to seed deterministically + slow to set up. The empty-state path (Connect-not-active OR zero payouts) is application-layer logic that's verified at the wrapper + page level via unit tests; the BA walk covers end-to-end.

**Optional BA override:** add 1 E2E that asserts an unactivated owner lands on the empty-state CTA (DB-direct manipulation of `stripe_connect_accounts.charges_enabled = false` + page load + assert the CTA element). Strawman doesn't lock this — dev-agent picks if it's cheap, document in DAR.

**Anti-pattern forbidden:**
- Do NOT call real Stripe `payouts.list` from E2E.
- Do NOT mock the Stripe SDK at the dev-server layer.
- Do NOT seed historical Stripe payouts (test-mode payouts are simulated by Stripe on a daily schedule; can't be force-created via API).

---

### Decision 11: Story 7-5 dashboard stat-card — DEFER to polish (NOT 9-7 scope)

**The open question:** Story 7-5 Decision §1 deliberately left the "this-month payouts" stat card empty (`no $0 payouts stub`) because no payouts wiring existed. 9-7 makes the wiring available. Should 9-7 populate the dashboard stat card too?

**Two options:**

- **(a) 9-7 also populates `/owner` dashboard's "this-month payouts" stat card.** Requires: a NEW Stripe API call from `/owner/page.tsx` filtering payouts by `created: { gte: startOfMonthUtc }` + summing `amount`. Adds page-load latency to the dashboard (another ~200–500ms Stripe round-trip) + adds Server Component branching for the empty/error cases.
- **(b) 9-7 ships `/owner/payouts` only; dashboard stat card stays empty (defer to polish).** Smaller blast radius; closes Theme B cleanly.

**Locked: (b) — DEFER the dashboard stat card to a polish item.**

**Rationale:**
- 9-7 is the **last Theme B story**; scope discipline matters for clean Epic 9 closure.
- The dashboard stat card needs design clarity (PRD §4.6 says "this-month payouts" but doesn't lock the time-zone boundary, the loading state, or the empty-state copy).
- Phase 3's local-cache decision (Decision §1 forward-flag) is the natural home for this — once payouts are mirrored locally, the dashboard query is a SQL `SUM` instead of a Stripe API call.
- A polish item with its own BA review pass is the safer slot.

**Anti-pattern forbidden:**
- Do NOT populate the dashboard stat card in 9-7 unless BA overrides this strawman.
- Do NOT add a Stripe API call from `/owner/page.tsx` without BA approval.

---

### Decision 12: Memory file extension + Epic 9 retrospective trigger

**Locked: continue extending `reference_stripe_service_pattern.md` with a new "Story 9-7 additions — Owner Payouts View" section.**

Cover:
- 6th sub-module pattern: `src/lib/payments/payouts.ts`. Single export `listPayouts`. The `stripeAccount` RequestOptions arg position (load-bearing — first vs second arg).
- Read-only Stripe API call pattern (Decision §1) — first read-only API call surfaced to a page in Theme B; contrast with 9-2 / 9-3 / 9-4 / 9-6 write operations.
- `handlePayoutPaid` — 7th handler in the 9-5 dispatcher map. Audit-only acknowledgment pattern (no DB writes; the audit trail IS the work product). **Second proof of 9-5's extensibility design**.
- Pre-flight Connect-state gate at the page (Decision §5) — 4th pattern instance (after 9-2b's publish gate, 9-3's booking-create gate, 9-7's payouts-page gate). Pure DB-read; no Stripe API call.
- `<PayoutStatusBadge>` component pattern (Decision §7) — role-specific component variant; doesn't extend `<StatusBadge>`'s booking-status scope.
- Phase 3 local-cache forward-flag — payouts cache table + `payout.paid` handler upgraded from audit-only to cache-populating + dashboard stat card enabled.
- Theme B closure: `/owner/payouts` is the final user-facing surface. Trigger Epic 9 retrospective.

**Trigger Epic 9 retrospective.** Per the BMad standard, when an epic moves from in-progress → done, the retrospective is optional but valuable. Theme B (Payments) is the most complex theme in Phase 2 — 7 stories spanning schema migrations, Stripe SDK seams, webhook dispatch, action extensions, refund flows, and the resolution of a long-standing PRD §4.5 interpretation question. A retrospective captures the patterns (single sub-module per story, dispatcher extensibility, audit-gap-on-retry, Stripe-first-then-DB ordering) and the gotchas (idempotency-key sharing, `acct_seed_for_e2e_only` reset hazard, the 9-2 BA-walk-fix 3-stage try-catch) for Phase 3.

**No new memory file** — extend the existing reference + flag the retrospective.

**Anti-pattern forbidden:**
- Do NOT spin out a new memory file. Theme B's reference doc is the canonical container.

---

### Decision 13: Files likely touched (estimate, not directive)

**New:**
- `deskhive/src/lib/payments/payouts.ts` — `listPayouts` wrapper
- `deskhive/src/lib/payments/payouts.test.ts` — 2 wrapper tests
- `deskhive/src/app/(owner)/owner/payouts/page.tsx` — Server Component route
- `deskhive/src/components/payout-status-badge.tsx` (or similar) — payout-status visual treatment (Decision §7)

**Modified:**
- `deskhive/src/lib/payments/webhooks.ts` — add `handlePayoutPaid` + map entry
- `deskhive/src/lib/payments/webhooks.test.ts` — extend with handler tests
- `deskhive/src/components/header.tsx` (or wherever the Host-mode nav lives — dev-agent finds during Task 0 audit) — add "Payouts" link if missing
- `_bmad-output/implementation-artifacts/sprint-status.yaml` — Epic 9 row → done after greenlight + Epic 9 retrospective optional → done
- `_bmad-output/implementation-artifacts/9-7-owner-payouts-view.md` — story file (created by `*create-story 9-7`)
- Memory: `~/.claude/.../memory/reference_stripe_service_pattern.md` (Decision §12)
- Memory: `~/.claude/.../memory/MEMORY.md` (one-liner refresh)

**Zero changes to** (carved-out):
- `deskhive/src/lib/stripe.ts` (Story 9-1's singleton)
- `deskhive/src/lib/stripe-service.ts` (Story 9-1's barrel)
- `deskhive/src/lib/payments/connect.ts` (Story 9-2's wrappers)
- `deskhive/src/lib/payments/checkout.ts` (Story 9-3's wrappers)
- `deskhive/src/lib/payments/payment-intents.ts` (Story 9-4's wrappers)
- `deskhive/src/lib/payments/refunds.ts` (Story 9-6's wrappers)
- `deskhive/src/app/api/stripe/webhook/route.ts` (Story 9-5's thin shell — new handler lives in `webhooks.ts`)
- `deskhive/src/actions/booking.ts` / `booking-with-payment.ts` (no action work in 9-7)
- `deskhive/src/db/schema.ts` (NO schema changes per Decision §1)
- `deskhive/drizzle/migrations/*` (no migrations)
- `deskhive/src/lib/email*` / `email-templates/` (Story 8-4 wires payout email AFTER 9-7's handler lands)
- `deskhive/src/app/(owner)/owner/page.tsx` — dashboard stat card stays empty per Decision §11
- `deskhive/src/app/(owner)/owner/bookings/*` / `spaces/*` / `settings/*` (no owner-route changes outside `/payouts`)
- `deskhive/src/lib/toast.ts` (no new toasts; Server Component can't fire toasts)
- `deskhive/scripts/seed.ts` (no seed changes — payouts come from Stripe API, not local DB)
- `deskhive/.env.example` (no new env vars)

---

## Architectural anti-patterns forbidden (rollup)

1. Floating-point math anywhere (CC-2 carry-forward) — payout amounts are integer cents from Stripe.
2. Stripe SDK imports outside `src/lib/stripe.ts` and `src/lib/payments/*` sub-modules (CC-3).
3. Calling `stripe.payouts.*` outside `src/lib/payments/payouts.ts`.
4. Local `payouts` DB cache table (Decision §1).
5. Caching the Stripe API response in any in-memory / Next.js cache layer (Decision §1).
6. Cursor-based pagination UI in 9-7 — Phase 3 (Decision §6).
7. Date-range filters / CSV export — Phase 3.
8. Cross-referencing payouts with local bookings for per-payout attribution — Phase 3.
9. Adding the `<PayoutStatusBadge>` logic to the existing `<StatusBadge>` (Decision §7).
10. Triggering email sends from `handlePayoutPaid` — Story 8-4 territory.
11. Stripe API calls from inside the webhook handler (9-3 / 9-5 / 9-6 carry-forward).
12. Skipping signature verification at the route (CC-7 / 9-5 carry-forward).
13. Server-side redirect on Connect-not-active — empty-state with CTA is the right UX (Decision §5).
14. Adding the `<PayoutStatusBadge>` to non-Host-mode nav variants (Decision §8).
15. Populating the `/owner` dashboard stat card in 9-7 — defer to polish (Decision §11).
16. Schema changes / migrations in 9-7 — pure read + new sub-module + new route (Decision §1 carry-forward).
17. New env vars in 9-7 — none needed.
18. New routes outside `/owner/payouts` — single new route.

---

## Operator prereqs (BA completes BEFORE dev-story dispatch)

- [ ] **Stripe dashboard test-mode active** — reconfirm.
- [ ] **`.env.local` has `STRIPE_SECRET_KEY` + `STRIPE_PUBLISHABLE_KEY` + `STRIPE_WEBHOOK_SECRET`** — present from 9-2 / 9-3 / 9-4 / 9-5 / 9-6.
- [ ] **`pnpm db:seed` has been run on the latest schema** (after 9-6 ship). Verify `owner@deskhive.local` has Connect row.
- [ ] **`pnpm typecheck` + `pnpm test` + `pnpm test:e2e` baseline green on `main`** — confirms 9-6 ship + BA-walk-fix are stable before 9-7 dispatches.
- [ ] **`stripe listen --forward-to localhost:3000/api/stripe/webhook`** running during BA walk + `STRIPE_WEBHOOK_SECRET` swapped to CLI-printed `whsec_...` value + `pnpm dev` restarted (same operator pattern as 9-5 / 9-6 BA walks).
- [ ] **`owner@deskhive.local`'s Connect row is in REAL state** (not synthetic `acct_seed_for_e2e_only`) — payouts only exist on real test-mode Connect accounts. Re-onboard via `/owner/settings` if seed has reset.
- [ ] **At least one captured booking on `main` for `owner@deskhive.local`** — Stripe needs at least one capture for a payout to materialize. The 9-3/9-4 BA-walk artifact `92bd9829-...` (CONFIRMED + CAPTURED) is the canonical capture; verify it's still in DB AND that the corresponding Stripe payout has materialized (Stripe simulates test-mode payouts on a daily schedule — may need to wait 1 business day after the capture).
- [ ] **Stripe Test-mode payouts simulator state** — Stripe automatically simulates test-mode payouts via daily batches. BA may need to trigger payouts manually via Stripe dashboard or `stripe trigger payout.paid` to ensure at least one row appears for the BA walk happy-path render.
- [ ] **Decision §5 empty-state copy reviewed** — strawman picks initial wording; BA may edit the 3 empty-state strings during lock.
- [ ] **Decision §7 component choice resolution recorded** — (a) extend `<StatusBadge>` vs (b) new `<PayoutStatusBadge>` vs (c) inline. Strawman picks (b); BA may override.
- [ ] **Decision §8 header nav audit** — dev-agent verifies / adds the Payouts link during Task 0.
- [ ] **Decision §11 dashboard stat card** — confirm DEFER (strawman pick) or override to ALSO populate in 9-7.
- [ ] **Epic 9 retrospective trigger documented** — BA confirms readiness to mark Epic 9 done after 9-7 ships + (optionally) hold the retrospective per BMad standard.

---

## Forward-looking flags

- **Phase 3 payouts table cache** — wire the `payout.paid` handler to insert into a new `payouts` cache table; switch `/owner/payouts` from direct Stripe API read to DB read. Enables the dashboard "this-month payouts" stat card (Story 7-5 Decision §1 + Decision §11 of 9-7). Also enables CSV export and date-range filters.
- **Phase 3 per-payout drill-down** — `stripe.payouts.listLineItems` API surfaces which charges rolled up into each payout. Useful for tax / accounting; out of Phase 2 scope.
- **Phase 3 pagination UI** — cursor-based "Show more" or page-numbered nav. Currently single-page-only per Decision §6.
- **Phase 3 multi-currency** — Phase 2 is USD-only.
- **Phase 3 admin-side payouts** — `/admin/payouts` for Super Admin to see platform-wide payout activity. Currently Super Admin uses Stripe dashboard.
- **Story 8-4 "Payout sent" email** — extends `handlePayoutPaid` to call `sendPaymentReceiptEmail(...)`-style helper. Same split as 9-4's `payment_intent.succeeded` → 8-4 email wiring + 9-6's `charge.refunded` → 8-4 refund email.
- **Epic 9 retrospective topics** (proposed by 9-7 — BA picks scope):
  - Single-sub-module-per-story discipline — worked well; 6 sub-modules with cohesive responsibilities.
  - Dispatcher extensibility design (9-5) — proven by 9-6 + 9-7's 1-function-1-entry additions.
  - Idempotency-key namespace conventions (`{operation}-${resourceId}`).
  - The 9-2 BA-walk-fix 3-stage try-catch pattern — load-bearing across all webhook handlers.
  - Audit-gap-on-retry trade-off — accepted Phase 2 stance; revisit for Phase 3 compliance.
  - Stripe-first-then-DB vs pre-claim-then-Stripe — context-dependent ordering decisions.
  - Schema CHECK constraint DROP/ADD pattern — 4 instances across 9-2b / 9-3 / 9-4 / 9-6.
  - The `acct_seed_for_e2e_only` reset hazard — recurring operator-prereq friction.
  - PRD §4.5 cancel-interpretation resolution — case study in deferring open questions until the right story dispatches.

