# Story 9-2: Stripe Connect Express Onboarding — BA Decisions

**Story:** 9-2
**Epic:** 9 — Payments (Theme B)
**Phase:** 2
**Type:** Infrastructure + first user-facing payments surface (onboarding only)
**Author:** Ikhtiyor Ziyayev, Business Analyst
**Date drafted:** 2026-05-15
**Status:** LOCKED — 2026-05-15 (BA: Ikhtiyor Ziyayev).
**Source:** Phase 2 PRD §4.4 / §4.6 / §6.1 / §6.4 / §7.2 / §8 Epic 9 Story 9-2 + Story 9-1's forward-looking notes (memory `reference_stripe_service_pattern.md` §"Downstream contract") + idiomatic Stripe Connect Express conventions

**Companion story:** **9-2b — Publish Gating** (separate decisions doc at [docs/design/9-2b-publish-gating-ba-decisions.md](docs/design/9-2b-publish-gating-ba-decisions.md)). 9-2b ships AFTER 9-2 and adds the DRAFT-status enum + publish-action + gated-publish UI. The split was made because the combined scope (onboarding + gating) was too ambitious for one story. **Story 9-2 ONLY ships the onboarding plumbing + status surface; the publish-gating concept is entirely in 9-2b.**

---

## Context

Story 9-2 is the **second story in Theme B** and the **first user-facing payments surface**. Story 9-1 shipped the SDK seam (`src/lib/stripe.ts` singleton + `src/lib/stripe-service.ts` empty seam). Story 9-2 populates that seam with the Connect-onboarding operations and stands up the first owner-facing UI for managing Stripe state.

After 9-2 ships:
- A Space Owner sees `/owner/settings` (a new route) with their Connect onboarding status and a "Complete onboarding" CTA when incomplete.
- Clicking the CTA generates a Stripe Account Link and redirects the owner to Stripe-hosted Express onboarding.
- Returning from Stripe, the owner lands on a status page; the page polls Stripe (and/or a webhook handler keeps state synced) to surface real onboarding state.
- Owners can finish onboarding; charges_enabled / payouts_enabled flags are persisted in the DB.
- **The publish-gating side-effect (a non-onboarded owner can't publish a space) is NOT in this story** — that's Story 9-2b. Phase 1 spaces continue to default to PUBLISHED on creation; nothing about the "space goes live" flow changes in 9-2.

**Stripe dashboard prereq:** before this story can be fully verified, the BA (or operator) must enable Connect on the Stripe dashboard (test mode). This is ~5–10 min of dashboard work, NOT a `STRIPE_CONNECT_CLIENT_ID` activation — Express + Account Links uses the platform's existing `STRIPE_SECRET_KEY`, not the OAuth flow that Standard Connect uses. See Decision §10.

---

## Scope

**In scope:**

- New Drizzle table `stripe_connect_accounts` (per PRD §6.1, verbatim shape).
- New Drizzle table `webhook_events` (per PRD §6.1) — created in 9-2 so the `account.updated` handler is idempotent from day one. 9-5 extends usage; 9-2 introduces the table.
- New file `src/lib/payments/connect.ts` — typed wrappers for `createConnectAccount`, `createConnectAccountLink`, `getConnectAccountStatus`. Each returns a `StripeServiceResult<T>` per Story 9-1 Decision §6.
- New Server Action `initiateConnectOnboardingAction` — creates a Stripe Express account (idempotent if one already exists), creates an Account Link, returns the URL.
- New Server Action `refreshConnectStatusAction` — re-fetches account status from Stripe and updates the DB row. Called from the return-URL page (and optionally as a polling endpoint).
- New route `/owner/settings` — Stripe Connect status + onboarding CTA + (when complete) read-only summary of `charges_enabled` / `payouts_enabled` / external account.
- New routes `/owner/settings/onboarding/return` + `/owner/settings/onboarding/refresh` — the two Account Link URLs Stripe redirects to. See Decision §5.
- Minimal webhook endpoint `app/api/stripe/webhook/route.ts` that handles ONLY `account.updated` events. The full webhook infrastructure (signature verification middleware, idempotency, broader event handling) is Story 9-5 — but 9-2 needs a narrow handler so the Express onboarding state stays synced without polling. See Decision §7.
- Seed update — give `owner@deskhive.local` a `stripe_connect_accounts` row with synthetic `onboarding_completed=true / charges_enabled=true / payouts_enabled=true` so Story 7-5 + 8-3 E2E flows continue working. See Decision §8.
- New env var `STRIPE_WEBHOOK_SECRET` — added to `.env.example`. (Story 9-1 deliberately deferred this; 9-2 introduces it.)
- Unit tests for the service-layer wrappers + the webhook handler. E2E coverage limited to the redirect-out-and-back-with-mocked-success path (Decision §9).
- Memory entry: extend `reference_stripe_service_pattern.md` with Connect-onboarding patterns.

**Out of scope:**

- ❌ **Publish gating (DRAFT enum, `publishSpaceAction`, gated UI, second seed user)** — **all of this is Story 9-2b.** Phase 1's `spaces.status = 'PUBLISHED'` default behavior is preserved unchanged in 9-2.
- ❌ Payment intents / Checkout sessions — Story 9-3.
- ❌ Payment capture/cancel on booking state transitions — Story 9-4.
- ❌ Full webhook infrastructure (signature verification middleware, full event-type dispatch, retry+backoff, `payment_intent.*` / `charge.*` / `payout.*` handlers) — Story 9-5. **9-2 introduces a narrow `account.updated`-only handler; 9-5 generalizes it.**
- ❌ Refund flow — Story 9-6.
- ❌ Payouts view (`/owner/payouts`) — Story 9-7.
- ❌ Payment-event-driven emails (the `payment-*` / `payout-*` templates from Story 8-1's registry) — Story 8-4.
- ❌ Frontend Stripe SDK (`@stripe/stripe-js`) — Story 9-3.
- ❌ Modifying any email infrastructure (`src/lib/email*`, `src/lib/email-templates/`) — Theme C decoupled.
- ❌ Phase 2 PRD §4.5 cancel-interpretation — Story 9-4 / 9-6 territory (BA dropped from 9-2 scope explicitly).
- ❌ Stripe dashboard configuration UI — that's manual operator setup, documented in `.env.example` comments + memory.
- ❌ Live-mode activation — Phase 3.
- ❌ Re-onboarding for owners with `restricted` accounts — minimal CTA exists (re-uses the same `initiateConnectOnboardingAction`), but no special UI for the various Stripe-imposed restriction states beyond "not yet active." Polish backlog if needed.
- ❌ Email notifications for onboarding-state changes (e.g., "Your Connect account is now active") — out of Phase 2 scope; could be a polish item.

---

## Decisions

### Decision 1: Connect variant — Express + hosted Account Links

**Rationale:** PRD §8 Epic 9 Story 9-2 explicitly says *"Stripe Connect Express onboarding."* PRD §6.4 references `createConnectAccountLink` and "redirects Space Owner to Stripe-hosted onboarding (test mode)." Both lock us to **Express** (the variant Stripe builds the onboarding UI for) + **hosted Account Links** (the redirect-out flow, NOT embedded Connect components).

**Locked behavior:**

- Account creation: `stripe.accounts.create({ type: 'express', country: <see Decision §6>, capabilities: <see Decision §6>, ... })`.
- Onboarding: `stripe.accountLinks.create({ account: <accountId>, type: 'account_onboarding', return_url, refresh_url })`.
- The browser redirects to the returned `url`. Stripe hosts the entire onboarding form.

**Why this matters:** Express is the lowest-effort variant for the platform — Stripe handles all the KYC/AML/banking-data UI. Standard would require us to build more, Custom would require us to build everything. Hosted Account Links (vs. embedded Connect components) avoids pulling in `@stripe/connect-js` and keeps 9-2 free of any browser-side Stripe SDK installation.

**Anti-pattern forbidden:**
- Do NOT install `@stripe/connect-js` or any embedded-Connect-components packages.
- Do NOT build a custom onboarding form in DeskHive (KYC/AML/banking forms are Stripe's responsibility).
- Do NOT use Connect Standard or Custom variants — Express only.

---

### Decision 2: Service-layer file structure — `src/lib/payments/connect.ts`

**Rationale:** Story 9-1's `src/lib/stripe-service.ts` is the empty seam reserved for typed wrappers. As wrappers accumulate across 9-2 / 9-3 / 9-4 / 9-5 / 9-6 / 9-7, a single flat file becomes unwieldy. The Connect-onboarding operations (~3 functions) form a cohesive group worth grouping in a sub-module from the start.

**Locked structure:**

```
src/lib/
  stripe.ts                       # Story 9-1: SDK init + env validation
  stripe-service.ts               # Story 9-1: re-exports stripe + StripeServiceResult<T>
  payments/
    connect.ts                    # Story 9-2: NEW — Connect onboarding wrappers
    # (future) payment-intents.ts # Story 9-3
    # (future) refunds.ts         # Story 9-6
    # (future) payouts.ts         # Story 9-7
    # (future) webhooks.ts        # Story 9-5 — signature verification + dispatch
```

`stripe-service.ts` becomes a "barrel" that re-exports from sub-modules as they're added (or callers can import the sub-modules directly — both work).

**Alternative considered:** flat `src/lib/stripe-service.ts` that grows with every story. Rejected because by Story 9-7 it'd be 500+ lines of mixed concerns.

**Anti-pattern forbidden:**
- Do NOT create per-function files (`createConnectAccount.ts`, `createAccountLink.ts`) — over-fragmentation.
- Do NOT import `stripe` directly from any new file outside `src/lib/payments/*` — the singleton-import-discipline rule from Story 9-1 still applies.

---

### Decision 3: Connect account creation timing — eager-create on first onboarding click

**Rationale:** Two reasonable patterns:
- **(A) Eager:** create the Stripe account the first time the owner clicks "Complete onboarding." Store the resulting `acct_*` ID immediately. Subsequent clicks re-use the same ID and just re-issue a fresh Account Link.
- **(B) Lazy:** create the Stripe account the moment the application is approved (Story 7-4 hook). Owner gets an `acct_*` ID before they ever visit `/owner/settings`.

(A) is cleaner for testing (an admin reviewer who never plans to host doesn't pollute Stripe with empty accounts) and matches the PRD's `initiateConnectOnboardingAction` naming (the action *initiates* — implies it creates).

**Locked behavior:** Pattern (A). `initiateConnectOnboardingAction` is idempotent:
1. Look up `stripe_connect_accounts` row by `user_id`.
2. If row exists, re-use `stripe_account_id`.
3. If row doesn't exist, call `stripe.accounts.create(...)` and insert the row.
4. Create a fresh Account Link with `account_onboarding` type.
5. Return the `url`.

**Why this matters:** owners may bounce off onboarding multiple times before completing — each retry should reuse the same Stripe account, not create new ones.

**Anti-pattern forbidden:**
- Do NOT create accounts at application-approval time (Story 7-4 hook).
- Do NOT create a new `acct_*` on every onboarding click — must be idempotent.

---

### Decision 4: Server Actions added by 9-2

Two Server Actions, locked names + signatures:

```typescript
// Returns the Stripe Account Link URL the browser should redirect to.
async function initiateConnectOnboardingAction(): Promise<
  { ok: true; redirectUrl: string } | { ok: false; error: string }
>;

// Re-fetches the Stripe account state and updates the DB row.
// Called from /owner/settings/onboarding/return after Stripe redirects back.
async function refreshConnectStatusAction(): Promise<
  | { ok: true; charges_enabled: boolean; payouts_enabled: boolean }
  | { ok: false; error: string }
>;
```

> **Note:** the third Server Action originally drafted here — `publishSpaceAction` — has moved entirely to Story 9-2b along with the DRAFT enum + gated-publish UI. 9-2 ships only the two onboarding-related actions.

**Locked invariants:**
- Both actions verify the caller's session, route through `effectiveMode(session)` from Story 7-1, and confirm the caller is a SPACE_OWNER in host mode.
- `initiateConnectOnboardingAction` does NOT redirect server-side — it returns the URL and the client component does `window.location.assign(url)`. (Server Actions can't return redirects across the form boundary cleanly when the redirect target is external.)

**Why these two specifically:**
- `initiateConnectOnboardingAction` is the user-clicks-CTA entry point.
- `refreshConnectStatusAction` is the user-returns-from-Stripe entry point (also covers the case where webhook is delayed/dropped — polling beats waiting).

**Anti-pattern forbidden:**
- Do NOT inline the Connect-status check inside every existing Server Action — concentrate the check in 9-2b's `publishSpaceAction` and (Stories 9-3+) in the booking-creation path.

---

### Decision 5: Return + refresh URLs — two distinct routes

**Rationale:** Stripe Account Links require two URLs:
- `return_url` — Stripe redirects here after the user completes onboarding OR explicitly cancels.
- `refresh_url` — Stripe redirects here if the Account Link expires or the user clicks "back to platform" mid-flow without completing.

Two clean patterns:
- **(A) Two distinct routes** (`/owner/settings/onboarding/return` + `/owner/settings/onboarding/refresh`).
- **(B) One route with `?status=return|refresh` query param.**

**Locked:** Pattern (A). Two distinct routes.

**Why:**
- Clearer route table (any future operator reading the routes-list sees "ah, two onboarding redirect targets").
- Server Component on the return page can immediately call `refreshConnectStatusAction()` to sync state; the refresh page calls `initiateConnectOnboardingAction()` again to mint a fresh Account Link and re-redirects.
- The two pages have meaningfully different behavior — query-param branching obscures it.

**Locked route map:**

```
/owner/settings                            # GET: status + CTA
/owner/settings/onboarding/return          # GET: sync state, render "you're all set" or "needs more"
/owner/settings/onboarding/refresh         # GET: re-mint Account Link + auto-redirect to Stripe
```

**Anti-pattern forbidden:**
- Do NOT use one route with query-param branching.
- Do NOT use the same URL for return + refresh.
- Do NOT redirect to `/owner` from the return page — landing on `/owner/settings/onboarding/return` is the explicit "you came back from Stripe" affordance; staying there with a clear status surface is better UX than vanishing back to the dashboard.

---

### Decision 6: Capabilities + country requested at account creation

**Rationale:** Stripe accounts need explicit capability requests. For a marketplace that captures payments and pays out to hosts:
- `card_payments` — required to accept card payments on behalf of the connected account.
- `transfers` — required to send funds from platform to connected account (i.e., do payouts).

**Country:** the seeded owner is in Uzbekistan (`Tashkent · Amir Temur Avenue 23` per the seeded space), but Stripe Connect Express is not available in Uzbekistan (as of the SDK version this story uses). The seeded country needs to be a Stripe-Connect-Express-supported country for verification to be possible.

**Locked behavior:**

```typescript
stripe.accounts.create({
  type: 'express',
  // Phase 2 test-mode: hardcoded to 'US' for Stripe Express compatibility
  // (Uzbekistan not supported). Phase 3: per-owner country derived from
  // application.businessAddress (Story 7-2 data).
  country: 'US',
  email: <user.email>,
  capabilities: {
    card_payments: { requested: true },
    transfers: { requested: true },
  },
});
```

**`country: 'US'` for all Phase 2 accounts** — pragmatic test-mode choice. The owner's actual country (per the application form data from Story 7-3) is informational only at this stage. When DeskHive eventually expands beyond test mode to multi-country production, this becomes a per-owner field; Phase 3 territory.

**Why this matters:**
- Without `capabilities` requested, the account is created but can't transact (Stripe Express defaults vary; explicit request avoids surprises).
- `card_payments: { requested: true }` is what activates `charges_enabled` after onboarding.
- `transfers: { requested: true }` is what activates `payouts_enabled` after onboarding.

**Anti-pattern forbidden:**
- Do NOT request additional capabilities (`tax_reporting_us_1099_k`, `legacy_payments`, etc.) — explicit minimal scope.
- Do NOT omit `capabilities` — Stripe accounts without requested capabilities can't transact.
- Do NOT take the country from the application's `businessAddress` field in Story 7-2's data — that's free-text and Stripe expects an ISO 3166-1 alpha-2 code.

**Open question for BA:** is hardcoding `country: 'US'` acceptable for Phase 2 test-mode, with multi-country deferred to Phase 3? **Strawman recommends YES.**

---

### Decision 7: Webhook handling — narrow `account.updated` handler in 9-2

**Rationale:** PRD §8 Epic 9 Story 9-2 says *"Webhook handler for `account.updated` keeps status synced"* — directly in 9-2's scope. PRD §6.4 puts the full webhook endpoint in Story 9-5. The seam between them needs locking.

**Locked behavior:**

Story 9-2 adds:
- `app/api/stripe/webhook/route.ts` — a minimal POST handler that:
  1. Verifies the Stripe signature using `STRIPE_WEBHOOK_SECRET` env var.
  2. Looks up `webhook_events` by `stripe_event_id` for idempotency. If already processed, returns `200 OK` (Stripe will stop retrying).
  3. Switches on `event.type`:
     - `account.updated` → update the matching `stripe_connect_accounts` row's `charges_enabled` / `payouts_enabled` / `onboarding_completed`. Insert into `webhook_events`.
     - any other event → return `200 OK` with a "not yet handled" log line. Do NOT insert into `webhook_events` (lets 9-5 process the event when it ships).
- New env var `STRIPE_WEBHOOK_SECRET` — added to `.env.example`. (Story 9-1 deliberately deferred this; 9-2 introduces it.)

Story 9-5 extends:
- Generalized event-type dispatch.
- Handlers for `payment_intent.succeeded` / `payment_intent.payment_failed` / `charge.refunded` / `payout.paid`.
- Webhook signature verification helper extracted from 9-2's inline implementation into `src/lib/payments/webhooks.ts`.
- Idempotency check pulled into a shared helper.

**Why this matters:** without `account.updated` handling, the only way to know when an owner finishes onboarding is the return-URL polling (`refreshConnectStatusAction`). That works but creates two problems:
1. If the owner closes the browser tab right after completing Stripe but before the return-URL page loads, their state is stale until they revisit `/owner/settings`.
2. Stripe accounts can transition from `charges_enabled=true` to `false` later (e.g., if the owner's documents need re-verification). Without the webhook, DeskHive never finds out.

**Anti-pattern forbidden:**
- Do NOT skip signature verification — never trust unsigned webhook payloads.
- Do NOT process the same `stripe_event_id` twice — idempotency is non-negotiable.
- Do NOT block on webhook delivery — Stripe expects 200 OK within a few seconds; complex processing belongs in async followups.
- Do NOT add webhook routes outside `app/api/stripe/webhook/route.ts` — one endpoint, switch by event type.
- Do NOT insert into `webhook_events` for unhandled event types in 9-2. Only insert when a real handler ran. This preserves Story 9-5's ability to backfill if needed once those handlers ship.

**Open question for BA:** is the narrow `account.updated`-only scope in 9-2 (with everything else returning `200 OK` ignored) the right seam? **Strawman recommends YES — defers complexity to 9-5 without leaving the onboarding-state-sync hole open.**

---

### Decision 8: Seed strategy — synthetic Connect account for `owner@deskhive.local`

**Rationale:** Story 7-PREP-1's authenticated E2E fixtures rely on `owner@deskhive.local` having spaces (Story 7-5) and bookings flowing through normally (Story 8-3). Story 9-2 itself does NOT introduce gating that would break Phase 1 (publish gating is 9-2b), but the `stripe_connect_accounts` row needs to exist so that:
- `/owner/settings` for the seeded owner shows the "onboarding complete" path (not the "needs to onboard" path) — gives E2E test #2 a stable target.
- Once Story 9-2b ships, the seeded owner already has the active Connect state needed for publish-gating-happy-path E2E.

Three options:
- **(A) Seed a synthetic row** with a fake `stripe_account_id` (e.g., `'acct_seed_for_e2e_only'`) and all three boolean flags = `true`. Any actual Stripe API call against this ID will fail (the ID isn't a real Stripe account), but Phase 2 code paths that only consult the DB row work.
- **(B) Skip the seed row.** Seeded owner has to manually run through Connect onboarding in test mode the first time. E2E test #2 then has no stable target.
- **(C) Create a real Stripe Connect Express account at seed time** by calling the Stripe API. Adds an external dependency to the seed script + pollutes Stripe with seeded accounts.

**Locked:** Option (A). Synthetic row.

**Implementation:**

```typescript
// scripts/seed.ts — additive block, idempotent like the rest of the seed
const SEED_OWNER_CONNECT_ACCOUNT_ID = 'acct_seed_for_e2e_only';
const existingConnect = await db.select().from(stripeConnectAccountsTable).where(eq(stripeConnectAccountsTable.userId, ownerId));
if (existingConnect.length === 0) {
  await db.insert(stripeConnectAccountsTable).values({
    userId: ownerId,
    stripeAccountId: SEED_OWNER_CONNECT_ACCOUNT_ID,
    onboardingCompleted: true,
    chargesEnabled: true,
    payoutsEnabled: true,
  });
  console.log(`Seeded Stripe Connect account row for ${ownerEmail} (synthetic ID; for E2E state only).`);
} else {
  console.log(`Stripe Connect row already exists for ${ownerEmail}; seed is a no-op.`);
}
```

**Why this matters:** the synthetic row is the practical middle ground between never-onboarded (breaks E2E once 9-2b's gating ships) and real-API-call-at-seed-time (introduces an external dependency).

**Anti-pattern forbidden:**
- Do NOT call the real Stripe API from `scripts/seed.ts` (Option C).
- Do NOT use the synthetic `acct_seed_for_e2e_only` ID in any production code path — the seeded ID is for DB-state purposes only. If a future code path actually calls Stripe with this ID, Stripe will return a 404 and that's the correct signal to mock at the test boundary instead.
- The synthetic ID format `'acct_seed_for_e2e_only'` deliberately does NOT match Stripe's real `'acct_*'` prefix-then-base32 format — makes it obvious in logs that this is test fixture data.

> **Note:** the second seed user `owner-no-connect@deskhive.local` originally drafted here has moved to Story 9-2b, where the gated-publish E2E test needs it. 9-2's E2E coverage doesn't need a second owner.

**Open question for BA:** is the synthetic-ID approach acceptable, knowing real Stripe calls against this ID will fail? **Strawman recommends YES.**

---

### Decision 9: E2E coverage strategy — redirect-out limitation

**Rationale:** The Connect onboarding flow redirects out to Stripe's hosted page. Playwright cannot full-loop the onboarding because:
1. The redirect target is on a different origin (`connect.stripe.com`).
2. Stripe's hosted onboarding has anti-bot protections.
3. The flow completes asynchronously via webhook delivery to a different endpoint.

**Locked E2E scope (3 tests):**

1. **`/owner/settings` complete state test** — `owner@deskhive.local` (with synthetic Connect row) sees the "Onboarding complete" affordance + `charges_enabled` / `payouts_enabled` indicators.

2. **`/owner/settings` initial state test** — requires a fresh owner with no `stripe_connect_accounts` row. The seeded `owner@deskhive.local` doesn't satisfy this (Decision §8 gives them a complete row). **Approach:** in this test only, programmatically delete the seeded Connect row before navigating, then restore via re-seed in test teardown. (Avoids polluting the seed with a second owner just for this one test.)

3. **`initiateConnectOnboardingAction` produces a URL** — invokes the Server Action directly (or submits the form), intercepts the `redirectUrl` from the response (no `window.location.assign` in Playwright headless), asserts it starts with `https://connect.stripe.com/`.

> **Note:** E2E tests for publish-gating happy-path + gated-path are in Story 9-2b's E2E spec, not here.

**Out of scope for E2E:** the actual Stripe-hosted onboarding flow (can't be automated cleanly); the return-URL state-sync (would need a webhook simulator running during the test).

**Webhook handler test** — covered as a UNIT test in Decision §14, not E2E. Uses `stripe.webhooks.generateTestHeaderString(...)` to produce a signed test payload + POST it to `/api/stripe/webhook` + asserts the DB row updated. Unit-level because no UI surface — webhook is an API.

**Anti-pattern forbidden:**
- Do NOT mock the redirect out — let it happen, just intercept the URL via the Server Action return value.
- Do NOT try to script Stripe's hosted onboarding form via Playwright cross-origin — it's brittle and against Stripe's TOS.
- Do NOT skip the webhook unit test — it's the only proof that the `account.updated` handler works end-to-end.

---

### Decision 10: Stripe dashboard prereq + env vars

**Rationale:** Express + Account Links uses the platform's existing `STRIPE_SECRET_KEY` to create accounts and Account Links. It does NOT use the OAuth flow that Standard Connect uses, so `STRIPE_CONNECT_CLIENT_ID` is NOT needed.

**Operator prereq (before merging 9-2):**
1. Open Stripe dashboard → toggle to test mode.
2. Settings → Connect → activate "Express" platform (~5–10 min of one-time setup; mostly accept Stripe's default platform settings).
3. Settings → Connect → branding (optional polish; can defer).
4. Settings → Developers → Webhooks → add endpoint `https://<deployed-url>/api/stripe/webhook` (or for local dev: use Stripe CLI's `stripe listen --forward-to localhost:3000/api/stripe/webhook` which prints a `whsec_*` to copy into `.env.local`).
5. Copy the webhook signing secret into `.env.local` as `STRIPE_WEBHOOK_SECRET=whsec_*`.

**Locked env-var additions:**

| Variable | Required by | Value pattern | Purpose |
|---|---|---|---|
| `STRIPE_WEBHOOK_SECRET` | `app/api/stripe/webhook/route.ts` | `whsec_*` | Verify webhook payload authenticity |

**`STRIPE_CONNECT_CLIENT_ID` is NOT added** — Express doesn't need it.

**`.env.example` update:** add `STRIPE_WEBHOOK_SECRET` to the existing "Story 9-1 — Payments (Stripe)" section (rename to "Stories 9-1 / 9-2 — Payments (Stripe)").

**Why this matters:**
- Without `STRIPE_WEBHOOK_SECRET`, the webhook handler's signature verification fails on every event → onboarding state never syncs via the webhook path.
- For local dev, the Stripe CLI's `listen` command is the standard pattern (PRD §6.4 + idiomatic Stripe practice). The CLI must be installed separately (`brew install stripe/stripe-cli/stripe` or platform equivalent); not a `pnpm` dep.

**Anti-pattern forbidden:**
- Do NOT add `STRIPE_CONNECT_CLIENT_ID` (only Standard Connect needs it).
- Do NOT skip the dashboard prereq — Connect must be activated for `stripe.accounts.create({ type: 'express', ... })` to succeed.
- Do NOT hardcode the webhook secret — env-var only, never committed.
- Do NOT add Stripe CLI as an npm dep — it's a separate operator tool.

**Open question for BA:** is the operator-prereq step (5 minutes on the Stripe dashboard) acceptable as part of the 9-2 ship checklist, or should it be a separate Stripe-dashboard-setup mini-story? **Strawman recommends inline.**

---

### Decision 11: Error states + retry behavior

**Rationale:** Connect onboarding has rich error states from Stripe (rejected, restricted, requirements.past_due). Phase 2 polish budget can't cover all variants.

**Locked behavior:**

- **Connect not yet started** — UI: "Complete onboarding" CTA + explanatory text.
- **Connect in progress (onboarding row exists, `charges_enabled=false`)** — UI: "Continue onboarding" CTA (re-uses the same Account Link mechanism) + status text.
- **Connect complete (both flags true)** — UI: "Onboarding complete" status badge + read-only summary of Stripe account.
- **Connect restricted (Stripe sets `requirements.disabled_reason` to a non-null value)** — UI: "Action required: complete additional Stripe verification" + a "Continue onboarding" CTA. Detection: stored in `stripe_connect_accounts.payouts_enabled=false` and/or `charges_enabled=false` after a transition from `true`. The webhook handler from Decision §7 keeps these in sync.
- **Connect API error during `initiateConnectOnboardingAction`** — UI: error toast surfacing the Stripe error message (already `StripeServiceResult<T>`-typed per Story 9-1 Decision §6). Owner can retry.

**Retry behavior:**
- NO automatic retry from the wrapper. Owner retries by clicking the CTA again.
- Idempotency: the wrappers use Stripe's `Idempotency-Key` header for `stripe.accounts.create(...)` (deterministic key = `connect-create-${userId}`) so duplicate clicks don't create duplicate accounts. (For `stripe.accountLinks.create(...)`, idempotency is unnecessary — each call legitimately produces a new ephemeral link.)

**Why this matters:**
- Idempotency keys are Stripe's official guardrail against double-submit duplicates.
- Surfacing the raw Stripe error message (via the `StripeServiceResult<T>.error` field) keeps the owner informed without DeskHive having to translate every Stripe error variant.

**Anti-pattern forbidden:**
- Do NOT auto-retry in `src/lib/payments/connect.ts` — let the user-driven retry remain explicit.
- Do NOT translate Stripe error messages — pass them through (they're already designed for end-user display).
- Do NOT skip idempotency keys on `accounts.create` — duplicate-account creation is a real risk on retries.

---

### Decision 12: Files likely touched

Estimate, not directive.

**New files:**
- `deskhive/src/lib/payments/connect.ts` — service-layer wrappers.
- `deskhive/src/lib/payments/connect.test.ts` — unit tests.
- `deskhive/src/actions/connect.ts` — Server Actions: `initiateConnectOnboardingAction`, `refreshConnectStatusAction`.
- `deskhive/src/db/queries/stripe-connect.ts` — `getConnectAccountByUserId`, `upsertConnectAccount` query helpers.
- `deskhive/src/app/(owner)/owner/settings/page.tsx` — main settings page.
- `deskhive/src/app/(owner)/owner/settings/onboarding/return/page.tsx` — return-URL handler.
- `deskhive/src/app/(owner)/owner/settings/onboarding/refresh/page.tsx` — refresh-URL handler.
- `deskhive/src/app/api/stripe/webhook/route.ts` — minimal webhook endpoint.
- `deskhive/src/app/api/stripe/webhook/route.test.ts` (or co-located equivalent) — webhook handler unit tests.
- `deskhive/drizzle/<timestamp>_stripe_connect_and_webhook_events.sql` — auto-generated migration.

**Modified files:**
- `deskhive/src/db/schema.ts` — add `stripeConnectAccountsTable`, `webhookEventsTable`. **NO changes to `spaces.status` enum in this story** (that's 9-2b).
- `deskhive/scripts/seed.ts` — seed synthetic Connect row for `owner@deskhive.local`.
- `deskhive/.env.example` — add `STRIPE_WEBHOOK_SECRET`; rename Stripe section header to span 9-1 + 9-2.
- `deskhive/src/components/header.tsx` (or wherever owner-side nav lives) — add a "Settings" link to host-mode nav.
- `_bmad-output/implementation-artifacts/sprint-status.yaml` — 9-2 status entry under Epic 9.
- `_bmad-output/implementation-artifacts/9-2-stripe-connect-onboarding.md` — story file.
- Memory: `reference_stripe_service_pattern.md` (extend with Connect-onboarding patterns).

**Zero changes to:**
- `deskhive/src/lib/email*` / `deskhive/src/lib/email-templates/` (Theme C decoupled).
- `deskhive/src/lib/stripe.ts` (Story 9-1's singleton stays untouched).
- `deskhive/src/lib/stripe-service.ts` (the empty seam stays; new operations live in `src/lib/payments/connect.ts`).
- `deskhive/src/app/(owner)/owner/spaces/*` (publish gating UI is 9-2b).
- `deskhive/src/actions/space.ts` (no `publishSpaceAction` — that's 9-2b).
- Better Auth config.
- Tailwind / proxy.ts.

---

### Decision 13: Memory file extension

Extend `reference_stripe_service_pattern.md` with:
- Sub-module structure under `src/lib/payments/` (Decision §2).
- Express vs. Standard vs. Custom decision rationale (Decision §1).
- Account Link onboarding flow (Decision §3, §5).
- Capabilities + country (Decision §6).
- Narrow `account.updated`-only webhook handler in 9-2 vs. full dispatch in 9-5 (Decision §7).
- Synthetic seed Connect ID for E2E state (Decision §8).
- E2E redirect-out limitation + intercept-redirect-URL pattern (Decision §9).
- `STRIPE_WEBHOOK_SECRET` env var added in 9-2 (closes the Story 9-1 placeholder).
- Idempotency-key convention for `accounts.create` (Decision §11).
- **Note that publish-gating + DRAFT enum + `publishSpaceAction` will be appended by Story 9-2b** — leave a forward-reference placeholder.

**No new memory file** — extend the existing one.

---

### Decision 14: Test coverage

**Unit tests** (target: 11 new):

1. `createConnectAccount` wrapper — success path + Stripe error mapping to `StripeServiceResult<T>`.
2. `createConnectAccount` wrapper — idempotency key includes `userId`.
3. `createConnectAccountLink` wrapper — success path.
4. `getConnectAccountStatus` wrapper — returns `{ charges_enabled, payouts_enabled, onboarding_completed }`.
5. `initiateConnectOnboardingAction` — creates new account on first call (no existing row).
6. `initiateConnectOnboardingAction` — re-uses existing account on subsequent calls.
7. `refreshConnectStatusAction` — updates DB row from Stripe response.
8. Webhook handler — valid `account.updated` signature → DB row updated.
9. Webhook handler — invalid signature → `400 Bad Request`, no DB write.
10. Webhook handler — duplicate `stripe_event_id` → idempotent no-op.
11. Webhook handler — unhandled event type → `200 OK` + no `webhook_events` insert.

**E2E tests** (target: 3 new per Decision §9).

**Target unit test count after this story:** 312 (baseline at end of 9-1) + 11 = **323**.

**Target E2E test count after this story:** 53 (baseline) + 3 = **56**.

**Target build routes after this story:** 35 + 4 new (`/owner/settings`, `/owner/settings/onboarding/return`, `/owner/settings/onboarding/refresh`, `/api/stripe/webhook`) = **39**.

> Companion story 9-2b adds: +4 unit tests (publish-action cases) → 327; +2 E2E (publish-gating) → 58; no new routes.

---

## Architectural anti-patterns forbidden (rollup)

- Do NOT install `@stripe/connect-js` or `@stripe/stripe-js` (Decision §1, Decision §8 anti-pattern preserved from 9-1).
- Do NOT use Connect Standard or Custom variants (Decision §1).
- Do NOT call `stripe.accounts.create` outside `src/lib/payments/connect.ts` (Decision §2 + PRD §6.5 anti-pattern).
- Do NOT eager-create Stripe accounts at application-approval time (Decision §3).
- Do NOT skip the idempotency-key on `stripe.accounts.create` (Decision §11).
- Do NOT request capabilities beyond `card_payments` + `transfers` (Decision §6).
- Do NOT use one route with query-param branching for return + refresh (Decision §5).
- Do NOT skip webhook signature verification (Decision §7).
- Do NOT process the same `stripe_event_id` twice (Decision §7).
- Do NOT add `STRIPE_CONNECT_CLIENT_ID` env var (Decision §10).
- Do NOT auto-retry Stripe calls in the wrapper (Decision §11).
- Do NOT call the real Stripe API from `scripts/seed.ts` (Decision §8).
- **Do NOT introduce DRAFT to the `spaces.status` enum, `publishSpaceAction`, or any publish-gating UI in this story** — that's Story 9-2b.

---

## Operator prereq (BA completes BEFORE dev verification)

These four items are operational setup on the Stripe dashboard + local env file. Dev verification (the Browser verification checklist below) assumes all four are ticked. If any are missing, `pnpm stripe-ping` will still work (Story 9-1 plumbing), but the 9-2 onboarding flow will fail with a non-obvious Stripe error.

- [ ] Stripe dashboard → Settings → Connect → Express platform activated (test mode)
- [ ] Stripe dashboard → Settings → Connect → Branding → platform name set to "DeskHive" (30 seconds; makes Stripe-hosted onboarding feel on-brand instead of raw Stripe)
- [ ] Stripe dashboard → Developers → Webhooks → endpoint added (prod) OR `stripe listen` running locally (dev)
- [ ] `STRIPE_WEBHOOK_SECRET` copied into `.env.local` (`whsec_*`)

---

## Browser verification checklist (preliminary — BA finalizes after lock)

**Setup:**
- `.env.local` contains valid `STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY`, AND new `STRIPE_WEBHOOK_SECRET`.
- Stripe Connect has been activated on the dashboard (Decision §10 prereq).
- For webhook testing: `stripe listen --forward-to localhost:3000/api/stripe/webhook` running in a separate terminal.

**Checks (12 points, refined post-lock):**

1. All unit tests pass — target 323.
2. All E2E tests pass — target 56.
3. Typecheck + lint clean.
4. `pnpm build` — 39 routes (35 baseline + 4 new).
5. `git diff --stat` shows ONLY files in Decision §12. **Zero changes to `src/app/(owner)/owner/spaces/*`, `src/actions/space.ts`, `spaces.status` enum.**
6. **Happy onboarding flow:** sign in as a fresh owner → `/owner/settings` shows "Complete onboarding" → click CTA → redirected to Stripe Connect Express → fill test fixtures (`000-000-0000` SSN, `110000000` routing) → submitted → redirected back to `/owner/settings/onboarding/return` → status shows complete.
7. **Refresh flow:** mid-onboarding on Stripe, click "back to platform" → redirected to `/owner/settings/onboarding/refresh` → automatically re-redirected to a fresh Stripe Account Link → continue onboarding.
8. **Webhook sync:** complete onboarding → Stripe sends `account.updated` to local webhook (via `stripe listen`) → `stripe_connect_accounts` row updated within ~5 seconds.
9. **Phase 1 regression:** existing `/spaces` listing still shows seeded PUBLISHED spaces; Guest can still browse + book; existing bookings flow unaffected.
10. **Email regression:** `pnpm send-test-email` still works.
11. **CLI regression:** `pnpm stripe-ping` still returns 0.00 USD.
12. **Stripe dashboard sanity:** in the dashboard's Connect → Accounts list, the test-mode account created during the happy-onboarding-flow check (point 6) appears with the test-mode badge.

---

## Memory note for Phase 2 continuation

After 9-2 ships:
- Epic 9 progress: 2 of 7 stories shipped (+ 9-2b in flight).
- Phase 2 overall: 13 of ~18 stories shipped (counting 9-2b as separate).
- **Next dispatch: Story 9-2b** (Publish gating — depends on 9-2's `stripe_connect_accounts` table and shipped Connect-state flags). After 9-2b: Story 9-3 (Booking flow with payment intents).

**Dependencies cleared by 9-2:**
- Owners can complete Stripe Connect onboarding end-to-end.
- Webhook infrastructure (signature verification + idempotency) is partially in place; 9-5 generalizes it.
- The `stripe_connect_accounts` row exists for the seeded owner — 9-2b can rely on this for its happy-path test fixture.

**Open seams 9-2 leaves for later stories:**
- Story 9-2b adds publish gating.
- Story 9-3 introduces the booking-with-payment-intent flow.
- Story 9-4 wires payment capture/cancel to confirm/reject actions.
- Story 9-5 generalizes the webhook dispatch.
- Story 9-6 wires refund.
- Story 9-7 surfaces payouts.
- Story 8-4 wires payment-event emails.

---

**End of BA decisions document.**
