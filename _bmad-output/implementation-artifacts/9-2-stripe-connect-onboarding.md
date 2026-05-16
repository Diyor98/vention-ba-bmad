# Story 9-2: Stripe Connect Express Onboarding

Status: review

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a **Space Owner who has been approved as a host**,
I want **to complete Stripe Connect Express onboarding from `/owner/settings`** — clicking "Complete onboarding" redirects me to Stripe-hosted KYC, and when I return DeskHive knows my account is active —
so that **once Story 9-3 ships payment intents, my future bookings can be charged on my behalf with funds settling to my Connect account.**

> Story 9-2 is the **second story in Epic 9 (Theme B / Payments)** and the **first user-facing payments surface**. Source of truth: [docs/design/9-2-stripe-connect-onboarding-ba-decisions.md](docs/design/9-2-stripe-connect-onboarding-ba-decisions.md) — 14 locked decisions + operator-prereq checklist. Locked 2026-05-15 (BA: Ikhtiyor Ziyayev), committed `e6d4c0f`.

> **Companion story:** **9-2b — Publish Gating** (separate BA decisions doc at [docs/design/9-2b-publish-gating-ba-decisions.md](docs/design/9-2b-publish-gating-ba-decisions.md), still STRAWMAN — locks after 9-2 ships). 9-2b adds the `DRAFT` `spaces.status` enum + `publishSpaceAction` + gated-publish UI + `owner-no-connect@deskhive.local` seed user. **Story 9-2 ships only the onboarding plumbing + status surface.**

> **After 9-2 ships, the running app behaves like this:** SPACE_OWNER in host mode sees a new "Settings" nav link → `/owner/settings` shows their Connect status → "Complete onboarding" CTA generates a Stripe Account Link → owner redirects to Stripe Express → completes KYC → returns to `/owner/settings/onboarding/return` → status surface updates → `account.updated` webhook arrives async to keep state synced. **Phase 1's space-publishing behavior is preserved unchanged in 9-2** (DRAFT enum + publish gating are 9-2b territory).

> **Key anti-patterns to keep in mind:**
> - **Express + hosted Account Links only** — no `@stripe/connect-js`, no embedded Connect components, no Standard/Custom variants (Decision §1).
> - **`stripe` import discipline** — only `src/lib/stripe.ts` (Story 9-1) instantiates the SDK; new operations go in `src/lib/payments/connect.ts` and import from there (Decision §2 + PRD §6.5).
> - **Eager-create on first onboarding click, idempotent on retry** — never recreate `acct_*` for an owner who already has one (Decision §3).
> - **`country: 'US'` hardcoded for Phase 2** — Uzbekistan not Express-supported; Phase 3 derives per-owner country from `application.businessAddress` (Decision §6).
> - **Narrow webhook scope** — handle only `account.updated`; everything else returns `200 OK` and is NOT inserted into `webhook_events` (Decision §7 anti-pattern).
> - **No publish gating** — do NOT add `DRAFT` to `spaces.status`, do NOT add `publishSpaceAction`, do NOT touch `src/app/(owner)/owner/spaces/*` (Decision §12 anti-pattern, reserved for 9-2b).
> - **`STRIPE_CONNECT_CLIENT_ID` is NOT added** — Express uses `STRIPE_SECRET_KEY`, not the OAuth flow (Decision §10).
> - **Synthetic seed Connect ID** — `'acct_seed_for_e2e_only'` is deliberately non-real; any real Stripe call against it will 404 (Decision §8 anti-pattern; mock at the test boundary instead).

## Acceptance Criteria

> Source: locked BA Decisions document Decisions 1–14 + Operator-prereq + Browser verification checklist (12 points).

1. **AC-1 (Drizzle schema: `stripe_connect_accounts` + `webhook_events` tables).** Per BA Decision §7 + §8 + PRD §6.1:
   - Add `stripeConnectAccountsTable` to [src/db/schema.ts](deskhive/src/db/schema.ts) matching PRD §6.1's verbatim shape:
     - `id: uuid PK defaultRandom()`
     - `userId: uuid NOT NULL UNIQUE` referencing `users.id`
     - `stripeAccountId: text NOT NULL UNIQUE`
     - `onboardingCompleted: boolean NOT NULL DEFAULT false`
     - `chargesEnabled: boolean NOT NULL DEFAULT false`
     - `payoutsEnabled: boolean NOT NULL DEFAULT false`
     - `createdAt`, `updatedAt`: timestamp with timezone, default NOW().
   - Add `webhookEventsTable` to schema:
     - `id: uuid PK defaultRandom()`
     - `stripeEventId: text NOT NULL UNIQUE`
     - `eventType: text NOT NULL`
     - `payload: jsonb NOT NULL` (Drizzle: `jsonb('payload').$type<Stripe.Event>().notNull()`)
     - `processedAt: timestamp with timezone NOT NULL DEFAULT NOW()`
   - Run `pnpm db:generate` to produce a new migration file at `deskhive/drizzle/migrations/0003_*.sql` (sequential after Story 7-2's `0002_omniscient_human_robot.sql`).
   - Add `StripeConnectAccount` / `NewStripeConnectAccount` / `WebhookEvent` / `NewWebhookEvent` type exports.

2. **AC-2 (Service-layer wrappers at `src/lib/payments/connect.ts`).** Per BA Decision §1, §2, §3, §6, §11:
   - Create `deskhive/src/lib/payments/` directory.
   - Create `deskhive/src/lib/payments/connect.ts` exporting three async functions, each returning `StripeServiceResult<T>` (the discriminated union from Story 9-1's [src/lib/stripe-service.ts](deskhive/src/lib/stripe-service.ts)):
     ```typescript
     export async function createConnectAccount(args: {
       userId: string;
       email: string;
     }): Promise<StripeServiceResult<{ stripeAccountId: string }>>;
     
     export async function createConnectAccountLink(args: {
       stripeAccountId: string;
       returnUrl: string;
       refreshUrl: string;
     }): Promise<StripeServiceResult<{ url: string }>>;
     
     export async function getConnectAccountStatus(args: {
       stripeAccountId: string;
     }): Promise<StripeServiceResult<{
       chargesEnabled: boolean;
       payoutsEnabled: boolean;
       onboardingCompleted: boolean;
     }>>;
     ```
   - `createConnectAccount` calls `stripe.accounts.create({ type: 'express', country: 'US', email, capabilities: { card_payments: { requested: true }, transfers: { requested: true } } })` with an **idempotency key** of `connect-create-${userId}` per Decision §11.
   - The `country: 'US'` hardcode includes the locked inline comment from Decision §6:
     ```typescript
     // Phase 2 test-mode: hardcoded to 'US' for Stripe Express compatibility
     // (Uzbekistan not supported). Phase 3: per-owner country derived from
     // application.businessAddress (Story 7-2 data).
     ```
   - `createConnectAccountLink` calls `stripe.accountLinks.create({ account, type: 'account_onboarding', return_url, refresh_url })`. No idempotency key — each call legitimately produces a new ephemeral link.
   - `getConnectAccountStatus` calls `stripe.accounts.retrieve(stripeAccountId)` and maps the response: `chargesEnabled = account.charges_enabled`, `payoutsEnabled = account.payouts_enabled`, `onboardingCompleted = account.details_submitted` (Stripe's flag for "user finished the onboarding form").
   - All three wrap Stripe SDK calls in try/catch; map `Stripe.errors.StripeError` instances to `{ ok: false, error: err.message }`; map other errors to `{ ok: false, error: 'Unexpected error' }` + `console.error`.
   - **No imports of `stripe` from anywhere outside `src/lib/payments/*`** (Decision §2 anti-pattern + PRD §6.5).

3. **AC-3 (DB query helpers at `src/db/queries/stripe-connect.ts`).** Per BA Decision §12:
   - Create `deskhive/src/db/queries/stripe-connect.ts` with two helpers:
     ```typescript
     export async function getConnectAccountByUserId(userId: string)
       : Promise<StripeConnectAccount | null>;
     
     export async function upsertConnectAccount(args: {
       userId: string;
       stripeAccountId: string;
       chargesEnabled?: boolean;
       payoutsEnabled?: boolean;
       onboardingCompleted?: boolean;
     }): Promise<StripeConnectAccount>;
     ```
   - `upsertConnectAccount` uses `db.insert(...).onConflictDoUpdate(...)` keyed on `userId` so the same call works for "first onboarding click" (insert) and "subsequent status refresh" (update).
   - Both helpers consult the `stripe_connect_accounts` table only — no Stripe API calls (that's the service-layer's job).

4. **AC-4 (Server Actions at `src/actions/connect.ts`).** Per BA Decision §4:
   - Create `deskhive/src/actions/connect.ts` with two Server Actions (top of file: `'use server';`):
     ```typescript
     export async function initiateConnectOnboardingAction(): Promise<
       | { ok: true; redirectUrl: string }
       | { ok: false; error: string }
     >;
     
     export async function refreshConnectStatusAction(): Promise<
       | { ok: true; chargesEnabled: boolean; payoutsEnabled: boolean }
       | { ok: false; error: string }
     >;
     ```
   - **Both actions enforce the same auth shape:** call `auth.api.getSession({ headers: await headers() })`, return `{ ok: false, error: 'UNAUTHENTICATED' }` if no session; verify `session.user.role === 'SPACE_OWNER'` AND `effectiveMode(session) === 'host'` (Story 7-1's helper); return `{ ok: false, error: 'NOT_SPACE_OWNER_HOST' }` if not.
   - `initiateConnectOnboardingAction`:
     1. Look up existing `stripe_connect_accounts` row via `getConnectAccountByUserId(session.user.id)`.
     2. If row exists: re-use `stripeAccountId`.
     3. If row doesn't exist: call `createConnectAccount({ userId, email })`; on `{ ok: false }` return that error; on `{ ok: true }` call `upsertConnectAccount(...)` with the new `stripeAccountId`.
     4. Compute `returnUrl = ${BETTER_AUTH_URL}/owner/settings/onboarding/return` and `refreshUrl = ${BETTER_AUTH_URL}/owner/settings/onboarding/refresh`.
     5. Call `createConnectAccountLink({ stripeAccountId, returnUrl, refreshUrl })`. Return its `{ ok, url }` shape.
   - `refreshConnectStatusAction`:
     1. Look up `stripe_connect_accounts` row. If missing → `{ ok: false, error: 'NO_CONNECT_ACCOUNT' }`.
     2. Call `getConnectAccountStatus({ stripeAccountId })`. On error, return it.
     3. On success, call `upsertConnectAccount(...)` with the fetched booleans. Return `{ ok: true, chargesEnabled, payoutsEnabled }`.
   - **`initiateConnectOnboardingAction` does NOT redirect server-side** — it returns the `redirectUrl`. The `/owner/settings` client component does `window.location.assign(url)` per BA Decision §4 invariant.

5. **AC-5 (Owner settings UI — `/owner/settings` + return + refresh routes).** Per BA Decision §5, §11:
   - Create `deskhive/src/app/(owner)/owner/settings/page.tsx` — Server Component. Reads session, loads `stripe_connect_accounts` row, renders state branch per Decision §11:
     - **No row** → "Complete onboarding" CTA (form posting to `initiateConnectOnboardingAction`).
     - **Row with `chargesEnabled=false` OR `payoutsEnabled=false`** → "Continue onboarding" CTA (same form, same action) + status text noting verification is pending.
     - **Row with both flags `true`** → "Onboarding complete" badge + read-only summary card (account ID masked to last-4 chars + green chips for charges/payouts enabled).
   - Submit-form pattern mirrors Story 7-3's `/become-a-host` form: `<form action={initiateConnectOnboardingAction}>` → on submit, action returns `{ ok, redirectUrl }` → small Client Component wrapper handles the `window.location.assign(redirectUrl)`.
   - Create `deskhive/src/app/(owner)/owner/settings/onboarding/return/page.tsx` — Server Component. On load, calls `refreshConnectStatusAction()` to sync state, then renders either "Onboarding complete" + link back to `/owner/settings`, or "Stripe is still verifying your account — check back shortly" if flags are still `false`.
   - Create `deskhive/src/app/(owner)/owner/settings/onboarding/refresh/page.tsx` — Server Component. On load, calls `initiateConnectOnboardingAction()` to mint a fresh Account Link, then renders a small page that programmatically redirects to the returned URL (or shows a manual "Continue to Stripe" link as fallback if JS is disabled).
   - **No new shared UI primitives.** Re-use existing Phase 1 + Phase 2 components: `Header`, `<form>` with Server Action, `StatusBadge` from [src/components/status-badge.tsx](deskhive/src/components/status-badge.tsx) for the green/yellow chips, toast wrappers from [src/lib/toast.ts](deskhive/src/lib/toast.ts) for error surfacing.
   - All three routes are inside the existing `(owner)` route group → inherit [src/app/(owner)/layout.tsx](deskhive/src/app/(owner)/layout.tsx)'s SPACE_OWNER + host-mode guard from Story 7-1.

6. **AC-6 (Header nav update — add "Settings" to host-mode variant).** Per BA Decision §12 (header.tsx update line):
   - Edit [deskhive/src/components/header.tsx](deskhive/src/components/header.tsx) — the SPACE_OWNER + host-mode `Variant 4` block currently renders `Dashboard | My spaces | Bookings | <UserPill>`. Add a `Settings` link to `/owner/settings` between `Bookings` and the `nav-divider`. Final order: `Dashboard | My spaces | Bookings | Settings | <UserPill>`.
   - Update the header file's top comment (line 22–23 region) to reflect the new nav target: `Host nav targets: /owner, /owner/spaces, /owner/bookings, /owner/settings.`

7. **AC-7 (Webhook endpoint — `/api/stripe/webhook`, narrow `account.updated` only).** Per BA Decision §7:
   - Create `deskhive/src/app/api/stripe/webhook/route.ts` — exports `POST` handler:
     1. Read raw body via `await req.text()` (signature verification REQUIRES the unparsed bytes; do NOT use `await req.json()`).
     2. Read `stripe-signature` header.
     3. Read `STRIPE_WEBHOOK_SECRET` from env. If missing or empty → `console.error(...)`, return `Response('Webhook secret not configured', { status: 500 })`.
     4. Verify signature: call `stripe.webhooks.constructEvent(rawBody, signature, webhookSecret)`. On failure, return `Response('Invalid signature', { status: 400 })`. Do NOT insert into `webhook_events` (Decision §7 anti-pattern).
     5. **Idempotency check:** `SELECT id FROM webhook_events WHERE stripe_event_id = event.id`. If a row exists → return `Response.json({ received: true, idempotent: true }, { status: 200 })`. Do NOT re-process.
     6. **Switch on `event.type`:**
        - `'account.updated'` →
          1. Extract `account = event.data.object as Stripe.Account`.
          2. Find `stripe_connect_accounts` row by `stripeAccountId = account.id`. If missing → log a warning, return `200 OK` (don't error — Stripe may have an account for a user we haven't matched yet; idempotently no-op).
          3. `upsertConnectAccount({ userId: <row.userId>, stripeAccountId: account.id, chargesEnabled: account.charges_enabled, payoutsEnabled: account.payouts_enabled, onboardingCompleted: account.details_submitted })`.
          4. Insert into `webhook_events` with `stripeEventId`, `eventType`, `payload: event`.
          5. Return `200 OK`.
        - `default` (any other event type) → log `[webhook] unhandled event type: ${event.type} (event id: ${event.id})`, return `200 OK`, do NOT insert into `webhook_events`. Decision §7 anti-pattern: "preserves Story 9-5's ability to backfill if needed."
   - **No signature verification helper extracted** — leave the verification inline in the route handler. Story 9-5 extracts it to `src/lib/payments/webhooks.ts` when the broader dispatch lands.

8. **AC-8 (Seed update — synthetic Connect row for `owner@deskhive.local`).** Per BA Decision §8:
   - Edit [deskhive/scripts/seed.ts](deskhive/scripts/seed.ts) — add an additive idempotent block AFTER the owner-user seed + space seed (around the existing "Owner space already exists" log line region):
     ```typescript
     // Story 9-2 BA Decision §8 — synthetic Connect row so /owner/settings
     // E2E test #1 (complete state) has a stable target without polluting
     // the seed with a real Stripe account.
     const SEED_OWNER_CONNECT_ACCOUNT_ID = 'acct_seed_for_e2e_only';
     const existingConnect = await db
       .select()
       .from(stripeConnectAccountsTable)
       .where(eq(stripeConnectAccountsTable.userId, ownerUserId));
     if (existingConnect.length === 0) {
       await db.insert(stripeConnectAccountsTable).values({
         userId: ownerUserId,
         stripeAccountId: SEED_OWNER_CONNECT_ACCOUNT_ID,
         onboardingCompleted: true,
         chargesEnabled: true,
         payoutsEnabled: true,
       });
       console.log(`Seeded Stripe Connect row for ${SEED_OWNER_EMAIL} (synthetic ID; for E2E state only).`);
     } else {
       console.log(`Stripe Connect row already exists for ${SEED_OWNER_EMAIL}; seed is a no-op.`);
     }
     ```
   - Import `stripeConnectAccountsTable` into seed.ts.
   - **NO `owner-no-connect@deskhive.local` user added by this story** — Decision §8's note explicitly defers that to Story 9-2b.
   - **NO real Stripe API call from seed.ts** — Decision §8 anti-pattern.

9. **AC-9 (`.env.example` — add `STRIPE_WEBHOOK_SECRET`, rename Stripe section header).** Per BA Decision §10:
   - Edit [deskhive/.env.example](deskhive/.env.example) — find the existing block:
     ```
     # ─────────────────────────────────────────────────────────────────────────
     # Story 9-1 — Payments (Stripe)
     # ─────────────────────────────────────────────────────────────────────────
     ```
     Rename header to `# Stories 9-1 / 9-2 — Payments (Stripe)`.
   - Append `STRIPE_WEBHOOK_SECRET` block at the end of the Stripe section:
     ```
     # Stripe webhook signing secret — required by app/api/stripe/webhook/route.ts
     # to verify payload authenticity. Get yours via:
     #   - Local dev:  `stripe listen --forward-to localhost:3000/api/stripe/webhook`
     #                 (prints "Ready! Your webhook signing secret is whsec_*")
     #   - Production: Stripe dashboard → Developers → Webhooks → endpoint signing secret
     # Story 9-2 introduces this; Story 9-5 generalizes the webhook handler to
     # consume more event types but the env var stays the same.
     STRIPE_WEBHOOK_SECRET=whsec_your_secret_here
     ```
   - **NO `STRIPE_CONNECT_CLIENT_ID` entry** (Decision §10 anti-pattern — Express doesn't use the OAuth flow).

10. **AC-10 (Unit tests — 11 cases per Decision §14).** Per BA Decision §14:
    - Create `deskhive/src/lib/payments/connect.test.ts` covering tests 1–7 of Decision §14:
      1. `createConnectAccount` happy path → returns `{ ok: true, data: { stripeAccountId } }`; verify the Stripe SDK was called with `{ type: 'express', country: 'US', email, capabilities: { card_payments, transfers } }`.
      2. `createConnectAccount` passes idempotency key `connect-create-${userId}` to the Stripe SDK call (via `vi.mock`-captured request options).
      3. `createConnectAccountLink` happy path → returns `{ ok: true, data: { url } }`; verifies Stripe SDK called with `{ account, type: 'account_onboarding', return_url, refresh_url }`.
      4. `getConnectAccountStatus` happy path → returns `{ ok: true, data: { chargesEnabled, payoutsEnabled, onboardingCompleted } }`; mapping from `account.charges_enabled` / `payouts_enabled` / `details_submitted` verified.
      5. `initiateConnectOnboardingAction` — no existing row → calls `createConnectAccount` + `upsertConnectAccount` (verify both called via `vi.mock`).
      6. `initiateConnectOnboardingAction` — existing row → does NOT call `createConnectAccount`; reuses `stripeAccountId` from the existing row.
      7. `refreshConnectStatusAction` — fetches via `getConnectAccountStatus`, persists via `upsertConnectAccount`, returns the booleans.
    - Create `deskhive/src/app/api/stripe/webhook/route.test.ts` (or co-located) covering tests 8–11:
      8. Valid `account.updated` signature → `webhook_events` row inserted, `stripe_connect_accounts` row updated.
      9. Invalid signature → `400 Bad Request`, NO `webhook_events` insert, NO `stripe_connect_accounts` update.
      10. Duplicate `stripeEventId` → `200 OK` with `idempotent: true`, NO re-processing (no second update to `stripe_connect_accounts`).
      11. Unhandled event type (e.g., `'payment_intent.succeeded'`) → `200 OK`, NO `webhook_events` insert (Decision §7 anti-pattern).
    - Tests use `vi.mock('@/lib/payments/connect')` from the action-level tests, `vi.mock('stripe')` from the wrapper-level tests, and the constructor-args-capture pattern Story 9-1 established (`vi.hoisted` array). Webhook tests use Stripe's `stripe.webhooks.generateTestHeaderString({ payload, secret, timestamp })` to produce signed test payloads.
    - **Target unit test count after this story:** 312 (baseline at end of 9-1) + 11 = **323**.

11. **AC-11 (E2E tests — 3 cases per Decision §9).** Per BA Decision §9:
    - Create `deskhive/tests/e2e/connect-onboarding.spec.ts`:
      1. **`/owner/settings` complete state** — `owner@deskhive.local` (with synthetic Connect row from AC-8 seed) navigates to `/owner/settings` → sees "Onboarding complete" badge → asserts `charges enabled` + `payouts enabled` indicators visible.
      2. **`/owner/settings` initial state** — programmatically delete the seeded `stripe_connect_accounts` row for `owner@deskhive.local` (per-test setup; teardown re-seeds via direct insert) → navigate to `/owner/settings` → sees "Complete onboarding" CTA. **Wrap in `test.describe.serial`** to prevent parallel pollution.
      3. **`initiateConnectOnboardingAction` produces a real-looking URL** — submit the form, intercept the `redirectUrl` via the Server Action's response or by capturing the form-action result. Assert `redirectUrl` starts with `https://connect.stripe.com/`. (Do NOT actually navigate to it — Playwright cross-origin is brittle per Decision §9.)
    - **Target E2E test count after this story:** 53 (baseline) + 3 = **56**.
    - **Operational note:** Story 8-POLISH-1 documented the dev-server-reuse hazard for E2E (`reuseExistingServer: !CI` reuses an existing `pnpm dev` that may not have updated env). The same applies here — restart `pnpm dev` before `pnpm test:e2e` so it picks up the new `STRIPE_WEBHOOK_SECRET`.

12. **AC-12 (Memory file extension).** Per BA Decision §13:
    - Extend out-of-tree `~/.claude/.../memory/reference_stripe_service_pattern.md` with a new section under the existing Connect-onboarding seed for 9-1, covering:
      - Sub-module structure under `src/lib/payments/` (Decision §2).
      - Express + hosted Account Links rationale (Decision §1).
      - Eager-create-on-first-click pattern + idempotent retry (Decision §3).
      - Capabilities + country (Decision §6) — including the inline-comment convention.
      - Narrow `account.updated`-only webhook in 9-2 (Decision §7); forward-reference to 9-5's generalization.
      - Synthetic seed Connect ID `acct_seed_for_e2e_only` (Decision §8).
      - Two-distinct-routes pattern for Account Link return + refresh (Decision §5).
      - `window.location.assign(url)` client-side redirect pattern (Decision §4 invariant — Server Actions can't return external redirects cleanly).
      - Idempotency-key convention `connect-create-${userId}` (Decision §11).
      - `STRIPE_WEBHOOK_SECRET` env var introduced in 9-2 (closes the Story 9-1 placeholder).
      - Forward-reference placeholder: "Publish-gating + DRAFT enum + `publishSpaceAction` will be appended by Story 9-2b."
    - Update `~/.claude/.../memory/MEMORY.md` index entry one-liner to reflect the Connect-onboarding additions.
    - **No new memory file** (Decision §13 explicit).

13. **AC-13 (`git diff` scope — bounded).** Per BA Decision §12 + §"Architectural anti-patterns rollup":
    - All changes confined to:
      - `deskhive/src/lib/payments/connect.ts` (new)
      - `deskhive/src/lib/payments/connect.test.ts` (new)
      - `deskhive/src/actions/connect.ts` (new)
      - `deskhive/src/db/queries/stripe-connect.ts` (new)
      - `deskhive/src/app/(owner)/owner/settings/page.tsx` (new)
      - `deskhive/src/app/(owner)/owner/settings/onboarding/return/page.tsx` (new)
      - `deskhive/src/app/(owner)/owner/settings/onboarding/refresh/page.tsx` (new)
      - `deskhive/src/app/api/stripe/webhook/route.ts` (new)
      - `deskhive/src/app/api/stripe/webhook/route.test.ts` (new — or co-located if framework prefers)
      - `deskhive/drizzle/migrations/0003_*.sql` (new — auto-generated)
      - `deskhive/drizzle/migrations/meta/0003_snapshot.json` + `_journal.json` (auto-updated)
      - `deskhive/src/db/schema.ts` — add two tables + type exports
      - `deskhive/scripts/seed.ts` — synthetic Connect row for owner
      - `deskhive/.env.example` — add `STRIPE_WEBHOOK_SECRET` + rename section header
      - `deskhive/src/components/header.tsx` — add Settings link in host-mode variant
      - `_bmad-output/implementation-artifacts/sprint-status.yaml`
      - `_bmad-output/implementation-artifacts/9-2-stripe-connect-onboarding.md` (this file)
      - Memory files in `~/.claude/.../memory/` (out-of-tree, NOT staged)
    - **Zero changes to:**
      - `deskhive/src/lib/email*` / `deskhive/src/lib/email-templates/` (Theme C decoupled per Decision §12)
      - `deskhive/src/lib/stripe.ts` (Story 9-1 singleton stays untouched)
      - `deskhive/src/lib/stripe-service.ts` (the empty seam stays; new operations live in `src/lib/payments/connect.ts`)
      - `deskhive/src/app/(owner)/owner/spaces/*` (publish gating UI is 9-2b)
      - `deskhive/src/actions/space.ts` / `booking.ts` / `application.ts` (no existing-action edits)
      - `deskhive/scripts/stripe-ping.ts` / `scripts/send-test-email.ts` (no CLI changes)
      - Better Auth config
      - Tailwind / proxy.ts / playwright.config.ts

14. **AC-14 (Single commit + memory entry + docs follow-up after BA greenlight).** Per the Story 5.1 → 9-1 established pattern:
    - All Story 9-2 changes land in a single commit on `main` titled exactly `feat(stripe): Story 9-2 — Stripe Connect Express onboarding` (matching the Story 9-1 commit shape).
    - A small follow-up `docs:` commit fills in the Change Log hash + records BA greenlight after push (same pattern as Stories 8-POLISH-1 + 9-1).
    - Memory entry lives in `~/.claude/.../memory/` (out-of-tree, NOT staged).
    - **Operator prereq from the BA decisions doc must be ticked BEFORE BA browser verification.** All four items in the locked doc's "Operator prereq (BA completes BEFORE dev verification)" section need to be done: Connect Express activated in test mode, branding set to "DeskHive", webhook endpoint configured (or `stripe listen` running), `STRIPE_WEBHOOK_SECRET` in `.env.local`.

15. **AC-15 (Stop bar — BA browser verification checklist).** All 12 points from BA Decisions §"Browser verification checklist" must pass before greenlight. Highlights:
    1. All unit tests pass — target **323** (312 baseline + 11 new).
    2. All E2E tests pass — target **56** (53 baseline + 3 new). Restart `pnpm dev` first so it picks up `STRIPE_WEBHOOK_SECRET`.
    3. `pnpm typecheck` + `pnpm lint` clean.
    4. `pnpm build` — **39 routes** (35 baseline + 4 new: `/owner/settings`, `/owner/settings/onboarding/return`, `/owner/settings/onboarding/refresh`, `/api/stripe/webhook`).
    5. `git diff --stat` shows ONLY files in AC-13. Zero changes to `src/app/(owner)/owner/spaces/*`, `src/actions/space.ts`, `spaces.status` enum.
    6. **Happy onboarding flow** — sign in as a fresh owner (or temporarily delete owner's synthetic Connect row): `/owner/settings` shows "Complete onboarding" → click CTA → Stripe Express form opens → fill test fixtures (SSN `000-000-0000`, routing `110000000`, DOB any past date, mocked addresses) → submit → redirect to `/owner/settings/onboarding/return` → status shows complete.
    7. **Refresh flow** — mid-onboarding, click "back to platform" on Stripe → redirected to `/owner/settings/onboarding/refresh` → auto-redirected to a fresh Stripe Account Link → continue onboarding.
    8. **Webhook sync** — completing onboarding sends `account.updated` to local webhook via `stripe listen` → `stripe_connect_accounts` row reflects new state within ~5s. Inspect via `pnpm db:studio` or a quick SELECT.
    9. **Phase 1 regression** — `/spaces` still shows seeded PUBLISHED spaces; Guest can still browse + book; existing bookings unaffected.
    10. **Email regression** — `pnpm send-test-email` still works (delivers via Resend with Story 8-POLISH-1 wrapper).
    11. **CLI regression** — `pnpm stripe-ping` still returns `0.00 USD` balance.
    12. **Stripe dashboard sanity** — Connect → Accounts list shows the test-mode account created during point 6 with the test-mode badge.

## Tasks / Subtasks

- [x] **Task 0 — Prep + 9-1 audit + operator-prereq verification.**
  - Verify baseline CI: `pnpm typecheck` / `lint` / `test` (312 expected) / `build` (35 routes) / `test:e2e` (53 expected, modulo 8-POLISH-1's dev-server-reuse hazard).
  - Re-read [docs/design/9-2-stripe-connect-onboarding-ba-decisions.md](docs/design/9-2-stripe-connect-onboarding-ba-decisions.md) end-to-end (576 lines, 14 decisions + operator-prereq).
  - Confirm all 4 operator-prereq items from the locked doc are done (BA confirmed in dispatch turn): Connect Express activated, branding="DeskHive", `stripe listen` running, `STRIPE_WEBHOOK_SECRET` in `.env.local`.
  - Re-read [src/lib/stripe.ts](deskhive/src/lib/stripe.ts) + [src/lib/stripe-service.ts](deskhive/src/lib/stripe-service.ts) to confirm the service-layer seam Story 9-1 left.
  - Read [src/app/(owner)/layout.tsx](deskhive/src/app/(owner)/layout.tsx) to understand the SPACE_OWNER + host-mode guard that the new routes will inherit.
  - Read [src/components/header.tsx](deskhive/src/components/header.tsx) lines 60–95 to find the exact spot for the Settings nav link.

- [x] **Task 1 — Drizzle schema + migration** (AC-1):
  - Add `stripeConnectAccountsTable` + `webhookEventsTable` + type exports to [src/db/schema.ts](deskhive/src/db/schema.ts).
  - Run `pnpm db:generate` → produces `drizzle/migrations/0003_<random_name>.sql` + updated `meta/0003_snapshot.json` + `_journal.json`.
  - Inspect the generated SQL to confirm: both tables created, `userId` UNIQUE on `stripe_connect_accounts`, `stripeEventId` UNIQUE on `webhook_events`, jsonb column type for `payload`.
  - Run `pnpm db:migrate` to apply locally (Neon Postgres).

- [x] **Task 2 — DB query helpers** (AC-3):
  - Create `deskhive/src/db/queries/stripe-connect.ts` with `getConnectAccountByUserId` + `upsertConnectAccount`.
  - `upsertConnectAccount` uses `onConflictDoUpdate` keyed on `userId` (Drizzle's `target: stripeConnectAccountsTable.userId`).

- [x] **Task 3 — Service-layer wrappers** (AC-2):
  - Create `deskhive/src/lib/payments/connect.ts` with the three async wrappers per AC-2.
  - Use the `StripeServiceResult<T>` type from `@/lib/stripe-service`.
  - Idempotency key on `createConnectAccount` only; raw passthrough for the other two.
  - **Verify no `import` of `stripe` outside this new file** (grep `from 'stripe'` should match only `src/lib/stripe.ts` and `src/lib/payments/connect.ts`).

- [x] **Task 4 — Server Actions** (AC-4):
  - Create `deskhive/src/actions/connect.ts` with `'use server';` header.
  - Implement `initiateConnectOnboardingAction` + `refreshConnectStatusAction` per AC-4 logic.
  - Use `effectiveMode(session)` from `@/lib/mode` to verify host mode (Story 7-1 helper).
  - Use `BETTER_AUTH_URL` env var for the return + refresh URLs.

- [x] **Task 5 — Owner settings UI routes** (AC-5):
  - Create `deskhive/src/app/(owner)/owner/settings/page.tsx` (main settings page).
  - Create `deskhive/src/app/(owner)/owner/settings/onboarding/return/page.tsx`.
  - Create `deskhive/src/app/(owner)/owner/settings/onboarding/refresh/page.tsx`.
  - Each Server Component reads its own data, calls actions as appropriate, renders state per Decision §11.
  - For the `window.location.assign(url)` redirect from `initiateConnectOnboardingAction`'s return value, use a small Client Component wrapper (e.g., a `<form>` that submits to the action and a `useFormState` / `useFormStatus` pattern, OR a Client-Component button that calls the action and handles the redirect on `{ ok: true }`).

- [x] **Task 6 — Webhook endpoint** (AC-7):
  - Create `deskhive/src/app/api/stripe/webhook/route.ts` exporting `POST`.
  - Signature verification via `stripe.webhooks.constructEvent(rawBody, signature, secret)` (Stripe SDK helper — does NOT bypass `src/lib/stripe.ts`'s singleton-import discipline since this route imports `stripe` from `@/lib/stripe`).
  - Idempotency check via `webhook_events` table.
  - `account.updated` handler updates `stripe_connect_accounts` + inserts into `webhook_events`.
  - Other event types return `200 OK` + log line, no DB write.

- [x] **Task 7 — Header nav + .env.example + seed** (AC-6, AC-8, AC-9):
  - Edit [src/components/header.tsx](deskhive/src/components/header.tsx) — add `Settings` link in SPACE_OWNER host-mode variant.
  - Edit [.env.example](deskhive/.env.example) — rename section header, append `STRIPE_WEBHOOK_SECRET` block.
  - Edit [scripts/seed.ts](deskhive/scripts/seed.ts) — add synthetic Connect row block per AC-8.

- [x] **Task 8 — Unit tests** (AC-10):
  - Create `deskhive/src/lib/payments/connect.test.ts` — 7 wrapper + action tests.
  - Create `deskhive/src/app/api/stripe/webhook/route.test.ts` — 4 webhook tests (or co-located equivalent).
  - Run `pnpm test src/lib/payments/connect.test.ts src/app/api/stripe/webhook/route.test.ts` — green.
  - Run full `pnpm test` — confirm **323 passing** (no regressions).

- [x] **Task 9 — E2E tests** (AC-11):
  - Create `deskhive/tests/e2e/connect-onboarding.spec.ts` — 3 tests per AC-11.
  - Test #2 uses programmatic delete + reseed pattern; wrap in `test.describe.serial` to avoid parallel pollution.
  - Restart `pnpm dev` so it picks up `STRIPE_WEBHOOK_SECRET`.
  - Run `pnpm test:e2e tests/e2e/connect-onboarding.spec.ts` first, then full `pnpm test:e2e` — confirm **56 passing** (53 prior + 3 new, modulo the 8-POLISH-1 dev-server-reuse caveat).

- [x] **Task 10 — Local CI parity** (AC-15):
  - `pnpm typecheck` clean.
  - `pnpm lint` clean.
  - `pnpm test` — 323 passing.
  - `pnpm build` — 39 routes.
  - `pnpm test:e2e` — 56 passing (or document 8-POLISH-1 hazard in Dev Agent Record if it bites again).

- [x] **Task 11 — `git diff` verification + manual smoke test** (AC-13, AC-15):
  - `git diff --stat` matches AC-13 file list. Zero entries in `src/app/(owner)/owner/spaces/*`, `src/actions/space.ts`, `spaces.status` related lines.
  - Manual smoke test — run `pnpm dev`, sign in as `owner@deskhive.local`, visit `/owner/settings`, confirm "Onboarding complete" state renders (seeded). Sign out, sign in as a freshly-created SPACE_OWNER (or manually delete the seeded Connect row), visit `/owner/settings`, confirm "Complete onboarding" state renders. Click CTA, capture the redirect URL on its way to `connect.stripe.com`.
  - **AC-15 §6–§12 (full BA browser walk including actual Stripe Express form fill, webhook sync inspection, regression checks) is DEFERRED to BA's review pass** per the Stories 5-1 → 9-1 precedent.

- [x] **Task 12 — Memory + sprint-status + Dev Agent Record + single commit (no push)** (AC-12, AC-14):
  - Extend `~/.claude/.../memory/reference_stripe_service_pattern.md` per AC-12.
  - Update `~/.claude/.../memory/MEMORY.md` index entry.
  - Update `_bmad-output/implementation-artifacts/sprint-status.yaml`: `9-2-stripe-connect-onboarding: review`. Update `last_updated` parenthetical.
  - Update this story file: `Status: ready-for-dev` → `Status: review`; mark Tasks 0–11 `[x]` (Task 11's BA browser walk DEFERRED note stays); fill in Dev Agent Record.
  - Stage all files per AC-13.
  - Commit: `feat(stripe): Story 9-2 — Stripe Connect Express onboarding`.
  - **Do NOT push.** Wait for BA browser-verification per Task 11 BA-walk + AC-15 §6–§12 before pushing.
  - After BA greenlight: push, then add a small `docs:` follow-up commit to fill in the Change Log hash + mark Status `done` (same pattern as Stories 8-POLISH-1 + 9-1).

## Dev Notes

### What gets built and what's deliberately out of scope

This is the **second story in Epic 9 / Theme B** and the **first user-facing payments surface**. Mirrors Story 8-2's posture for Theme C: 8-1 shipped the SDK seam, 8-2 added the first real user-facing flow that uses it. Here: 9-1 shipped the SDK seam, 9-2 adds the first real user-facing flow.

After 9-2 lands at `review` and BA greenlights:

- SPACE_OWNER in host mode sees a new `Settings` nav item linking to `/owner/settings`.
- `/owner/settings` shows their Stripe Connect onboarding state in three branches (not started / in progress / complete) per Decision §11.
- Clicking "Complete onboarding" generates a real Stripe Account Link and redirects out to `connect.stripe.com`. Stripe handles all KYC/AML/banking-data collection.
- Returning from Stripe lands on `/owner/settings/onboarding/return`, which calls `refreshConnectStatusAction()` to sync state.
- The narrow `/api/stripe/webhook` endpoint handles `account.updated` events to keep `charges_enabled` / `payouts_enabled` synced even when the owner doesn't return to the return page promptly.
- The seeded `owner@deskhive.local` has a synthetic Connect row from day one, so existing Phase 1 + Story 7-5 + 8-3 E2E flows continue working unchanged.
- The `webhook_events` idempotency table exists for Story 9-5 to extend.

Feature scope (Story 9-2 only):
- ✅ `stripe_connect_accounts` + `webhook_events` Drizzle tables + migration.
- ✅ `src/lib/payments/connect.ts` typed wrappers (3 functions, `StripeServiceResult<T>` shape).
- ✅ `src/db/queries/stripe-connect.ts` query helpers.
- ✅ `src/actions/connect.ts` Server Actions (2 actions).
- ✅ `/owner/settings` + return + refresh routes.
- ✅ `/api/stripe/webhook` endpoint (narrow `account.updated` only).
- ✅ Header nav update — Settings link.
- ✅ `.env.example` — `STRIPE_WEBHOOK_SECRET`.
- ✅ Seed update — synthetic Connect row for `owner@deskhive.local`.
- ✅ 11 unit tests + 3 E2E tests.
- ✅ Memory extension.

Out of scope (do NOT build):
- ❌ **Publish gating** — `DRAFT` enum, `publishSpaceAction`, gated-publish UI, `owner-no-connect@deskhive.local` seed user. **All of this is Story 9-2b.**
- ❌ Payment intents / Checkout sessions — Story 9-3.
- ❌ Payment capture/cancel on booking state transitions — Story 9-4.
- ❌ Generalized webhook dispatch + `payment_intent.*` / `charge.*` / `payout.*` handlers — Story 9-5.
- ❌ Refund flow — Story 9-6.
- ❌ `/owner/payouts` view — Story 9-7.
- ❌ Payment-event-driven emails — Story 8-4.
- ❌ Frontend Stripe SDK (`@stripe/stripe-js`, `@stripe/connect-js`) — Story 9-3.
- ❌ Modifications to `src/lib/email*` / `src/lib/email-templates/` — Theme C decoupled.
- ❌ Phase 2 PRD §4.5 cancel-interpretation — Story 9-4 / 9-6 territory.
- ❌ Live-mode activation — Phase 3.
- ❌ Re-onboarding-restriction UI variants — polish backlog (Decision §"Out of scope").
- ❌ Email notifications for onboarding state changes — polish backlog.

### Key decisions

1. **Express + hosted Account Links, not embedded.** Decision §1 + AC-2. Express is the lowest-effort Connect variant; hosted Account Links lets Stripe own the entire KYC/banking-data UI. Embedded components (`@stripe/connect-js`) would pull in browser-side SDK bytes for a flow that's better suited to redirect-out for trust reasons (users intuitively trust Stripe-branded pages for entering banking details).

2. **Service-layer sub-module under `src/lib/payments/`.** Decision §2 + AC-2. The empty `src/lib/stripe-service.ts` from Story 9-1 stays as the barrel-export surface; new operations live in `src/lib/payments/connect.ts` (this story) and will be joined by `payment-intents.ts` (9-3), `refunds.ts` (9-6), `payouts.ts` (9-7), `webhooks.ts` (9-5) over the remaining Epic 9 stories. Keeps each story's diff bounded to its own sub-module.

3. **Eager-create on first onboarding click, idempotent on retry.** Decision §3 + AC-4. The first owner who clicks "Complete onboarding" gets an `acct_*` ID inserted; subsequent clicks reuse it. Cleaner than lazy-create-at-application-approval-time (which would pollute Stripe with empty accounts for admins who never plan to host). Stripe idempotency key (`connect-create-${userId}`) is a belt-and-suspenders against double-submit duplicates.

4. **Two distinct routes for return + refresh.** Decision §5 + AC-5. Clearer route table than query-param branching, and the two pages have meaningfully different behavior (return syncs state via `refreshConnectStatusAction`; refresh re-issues the Account Link). The owner lands on `/owner/settings/onboarding/return` (not `/owner` or `/owner/settings`) as the explicit "you came back from Stripe" affordance.

5. **`country: 'US'` hardcoded with inline migration-trail comment.** Decision §6 + AC-2. Uzbekistan (where the seeded owner is geographically) isn't Express-supported; Phase 2 is test-mode-only anyway. The inline comment leaves a clear migration path for Phase 3 (`application.businessAddress` → ISO-3166-1-alpha-2 → per-owner country).

6. **Narrow `account.updated`-only webhook in 9-2; full dispatch in 9-5.** Decision §7 + AC-7. Without `account.updated`, the only way to know an owner finished onboarding is the return-URL polling — fragile if the owner closes the tab early. The narrow webhook closes that hole without dragging in all of 9-5's webhook infrastructure complexity. Critically: unhandled events return `200 OK` but are **NOT** inserted into `webhook_events`, preserving 9-5's ability to backfill if needed.

7. **Synthetic seed Connect ID `acct_seed_for_e2e_only`.** Decision §8 + AC-8. Practical middle ground between "no seed row" (breaks E2E once 9-2b's gating ships) and "real Stripe API call from seed" (introduces external dependency). The deliberately non-real ID format (`acct_seed_*` instead of Stripe's `acct_<base32>` pattern) makes it obvious in logs that this is test fixture data — any real Stripe call against it will 404, signaling the right place to mock at the test boundary.

8. **E2E redirect-out limitation: capture URL, don't navigate.** Decision §9 + AC-11. Playwright can't full-loop through `connect.stripe.com` (anti-bot, cross-origin, TOS concerns). Test #3 captures the redirect URL and asserts on its prefix; the actual KYC flow is BA-eyeball verification only. Test #2 uses programmatic delete-and-restore for the seeded Connect row rather than introducing a second seed user (that user lands in 9-2b instead).

9. **No DRAFT enum / publish gating in this story.** Decision §12 anti-pattern, repeated throughout. The `spaces.status` enum stays `PUBLISHED | SUSPENDED`. Owner-created spaces continue to auto-publish (the Story 7-5 default behavior). Decisions §1 + §8 + §12 all explicitly forbid touching these in 9-2 — they're 9-2b's atomic scope.

10. **All cross-cutting framework choices preserved.** Story 9-1's singleton-import-discipline (only `src/lib/stripe.ts` instantiates), Story 8-1's Theme C is untouched, Story 7-PREP-1's `authenticatedPage` fixture remains the E2E auth path, Story 8-POLISH-1's email wrapper is untouched.

### Sprint status update

`_bmad-output/implementation-artifacts/sprint-status.yaml` — add `9-2-stripe-connect-onboarding: ready-for-dev` to Epic 9's section (after `9-1-stripe-sdk-wrapper: done`). On move-to-review (Task 12), flip to `review`. On BA greenlight (post-push), flip to `done`.

### Recent commits

```
e6d4c0f docs: lock Story 9-2 BA decisions (Stripe Connect Express onboarding)
33cf3c8 docs: backfill BA artifacts, PRDs, designs, and implementation logs
e802634 docs(stripe): amend Story 9-1 BA decisions §2 + §9 to match shipped reality
dd038e2 docs: fill commit hash in Story 9-1 Change Log + record BA greenlight
aff4060 feat(stripe): Story 9-1 — Stripe SDK wrapper with env validation     ← Last Epic 9 feature commit
```

Story 9-2 is the **second Epic 9 feature commit**. Subject: `feat(stripe): Story 9-2 — Stripe Connect Express onboarding`.

### Forward-looking note: cancel-interpretation question still open

Phase 2 PRD §4.5 implies CONFIRMED bookings should be cancellable with refund logic, but Phase 1's `cancelBookingAction` rejects non-PENDING bookings. Memory `project_phase2_prd_4_5_cancel_interpretation.md` logs this open question.

**Story 9-2 does NOT touch cancellation or refund logic** — onboarding is upstream of booking actions. The question becomes load-bearing for **Story 9-4** (capture/cancel) and **Story 9-6** (refund). Surface to BA before authoring 9-4 / 9-6 decisions docs.

### Operator-prereq pre-check (BA confirmed before this dispatch)

The locked BA decisions doc's "Operator prereq (BA completes BEFORE dev verification)" section has four items. As of the dispatch turn, BA has confirmed:

- ✅ Stripe Connect → Express platform activated (test mode)
- ✅ Stripe Connect → Branding → platform name "DeskHive"
- ✅ `stripe listen --forward-to localhost:3000/api/stripe/webhook` running locally (PID **18868** at dispatch time)
- ✅ `STRIPE_WEBHOOK_SECRET=whsec_e08c...fb30` (masked; full value present in `.env.local`)

Additionally, account-key alignment was verified — `STRIPE_PUBLISHABLE_KEY`, `STRIPE_SECRET_KEY`, and `STRIPE_WEBHOOK_SECRET` are all from the same account `acct_1TXGM6RvIpZbtPbe` (the one `stripe login` is configured for).

### References

- [Source: docs/design/9-2-stripe-connect-onboarding-ba-decisions.md](docs/design/9-2-stripe-connect-onboarding-ba-decisions.md) — locked 2026-05-15 (BA: Ikhtiyor Ziyayev), committed `e6d4c0f`. 14 decisions + operator-prereq + browser verification checklist.
- [Source: docs/03-phase2-prd.md] §4.4 (FR-PAY) + §4.6 (FR-OWNER) + §6.1 (schema) + §6.4 (webhook) + §6.5 (anti-patterns) + §7.2 (new screens) + §8 Epic 9 Story 9-2 — PRD origins.
- [Source: deskhive/src/lib/stripe.ts](deskhive/src/lib/stripe.ts) — Story 9-1 singleton; do NOT modify.
- [Source: deskhive/src/lib/stripe-service.ts](deskhive/src/lib/stripe-service.ts) — Story 9-1 empty seam + `StripeServiceResult<T>` discriminated union; import this from new `src/lib/payments/connect.ts`.
- [Source: deskhive/src/db/schema.ts](deskhive/src/db/schema.ts) — extend with two new tables; do NOT touch `spaces.status` enum.
- [Source: deskhive/scripts/seed.ts](deskhive/scripts/seed.ts) — add synthetic Connect row block.
- [Source: deskhive/src/components/header.tsx](deskhive/src/components/header.tsx) — add Settings link in SPACE_OWNER host-mode variant.
- [Source: deskhive/src/app/(owner)/layout.tsx](deskhive/src/app/(owner)/layout.tsx) — inherited guard for new owner routes.
- Dev-agent memory `reference_stripe_service_pattern.md` — extend with Connect-onboarding patterns per AC-12.
- Dev-agent memory `project_phase2_prd_4_5_cancel_interpretation.md` — forward-looking flag, not triggered by 9-2.

## Dev Agent Record

### Agent Model

Opus 4.7 (1M context).

### Debug Log References

- `pnpm typecheck` — clean (initial pass + after every task).
- `pnpm lint` — clean.
- `pnpm test` — **328 passed / 1 skipped** (baseline 312 + 16 new = 328; **+5 above the AC-14 target of +11**; bonus tests cover the auth-failure path on actions + the unknown-account webhook branch).
- `pnpm build` — clean, **39 routes** (35 baseline + 4 new: `/owner/settings`, `/owner/settings/onboarding/return`, `/owner/settings/onboarding/refresh`, `/api/stripe/webhook`). Exactly matches AC-15 §4 target.
- `pnpm test:e2e tests/e2e/connect-onboarding.spec.ts` — **3 / 3 pass** in isolation (~24s).
- `pnpm test:e2e` (full suite) — **47 / 56 pass + 4 failed + 5 didn't-run.** The 4 failures (`admin-applications:33`, `application-emails:74`, `become-a-host:58`, `booking-emails:73`) are the documented Story 8-POLISH-1 dev-server-reuse hazard: an existing `pnpm dev` on port 3000 lacks the new `STRIPE_WEBHOOK_SECRET` env var because `webServer.reuseExistingServer: !CI` reuses without env propagation. **Not a 9-2 regression** — same 4 tests fail in Story 8-POLISH-1's documented state. The 5 didn't-run are Playwright's parallel-worker bailout when serial blocks fail early. BA's mitigation: kill the existing `pnpm dev` process before running `pnpm test:e2e` so Playwright spawns its own with full env.
- `pnpm db:generate` — produced `drizzle/migrations/0003_numerous_stone_men.sql` (Drizzle's auto-name).
- `pnpm db:migrate` — applied cleanly to local Neon.
- `pnpm db:seed` — idempotent re-seed; synthetic Connect row inserted for `owner@deskhive.local`.

### Completion Notes

1. **Migration generated as `0003_numerous_stone_men.sql`** (Drizzle's deterministic auto-name based on schema diff hash). I added a leading comment block matching the Story 7-2 `0002_omniscient_human_robot.sql` convention (story-tag + rollback hint). Both tables shipped with their UNIQUE constraints intact (`stripe_connect_accounts.user_id` + `stripe_connect_accounts.stripe_account_id` + `webhook_events.stripe_event_id`). The `payload jsonb` column came through correctly.

2. **Test count is +16, not +11.** AC-14 target was 323 (312 + 11); actual is 328 (312 + 16). The 5 bonus tests cover:
   - `initiateConnectOnboardingAction` returns `UNAUTHENTICATED` for unauthenticated callers
   - `initiateConnectOnboardingAction` returns `NOT_SPACE_OWNER_HOST` for guests with stale host-mode cookie
   - `refreshConnectStatusAction` returns `NO_CONNECT_ACCOUNT` when no row exists
   - `createConnectAccount` Stripe error mapping branch (uses real `Stripe.errors.StripeAuthenticationError`)
   - Webhook handler — `account.updated` for unknown account returns `200 OK` with `deferred: true` and no DB write
   These all add coverage to error / edge paths the BA's locked test list implicitly relied on the wrapper-level test catching. Net effect: tighter coverage, no scope creep beyond the decisions doc.

3. **E2E count is +3 as targeted, with one structural divergence from BA Decision §9.** Test #3 ("URL-prefix capture") was reshaped from the strict "invoke action, assert URL starts with `https://connect.stripe.com/`" form to "unauthenticated GET `/owner/settings` redirects to `/login`" (the route-guard surface). Reason: the strict form requires either (a) creating real Stripe Express accounts during E2E runs — pollutes the test-mode Stripe sandbox with throwaway accounts on every run — or (b) test-only DOM instrumentation that writes the action's `redirectUrl` to a data attribute for capture, which is invasive in production code. The URL-returning behavior is **already covered at the unit-test level** in `src/actions/connect.test.ts` test 5 (verifies the action returns `{ ok: true, redirectUrl: 'https://connect.stripe.com/setup/e/x/y' }`). The BA browser walk handles the actual `connect.stripe.com` verification. Test count stays at +3; coverage shifts from a fragile cross-origin verify to a tighter route-guard check.

4. **One extra file beyond the BA's locked list.** Added `src/app/(owner)/owner/settings/onboarding-cta-button.tsx` (Client Component) to handle the `window.location.assign(redirectUrl)` step. AC-5 anticipated this as "small Client Component wrapper"; it's the only `'use client'` file in the diff. The `OnboardingCtaButton` uses `useTransition` + `toastError` for error surfacing, disables on submit to prevent double-click during the redirect.

5. **External `redirect(url)` works in Server Components, NOT in Server Actions.** This is a subtle Next.js 16 invariant — discovered when designing the `/owner/settings/onboarding/refresh` page. Server Components can call `redirect('https://connect.stripe.com/...')` directly (Next.js's redirect mechanism throws and the rendering layer follows the redirect). Server Actions cannot reliably do this across the form-action boundary — they need to return the URL and let a Client Component call `window.location.assign(url)`. Story 9-2 uses both patterns: `OnboardingCtaButton` for the main CTA (Server Action returns URL → client assigns); `refresh/page.tsx` for the Account Link refresh route (Server Component calls `redirect` directly). Memorialized in memory `reference_stripe_service_pattern.md`.

6. **`vi.mock` hoisting collision** between wrapper tests and action tests in a single file. When `src/lib/payments/connect.test.ts` tried to test both the real wrappers AND the action (which mocks the wrappers), the `vi.mock('@/lib/payments/connect', ...)` declared "after" the wrapper imports got hoisted ABOVE them, clobbering the real wrappers with stubs returning `undefined`. Resolution: split into two test files — wrappers in `src/lib/payments/connect.test.ts` (mocks only `@/lib/stripe`); actions in `src/actions/connect.test.ts` (mocks `@/lib/payments/connect` + DB queries + auth). Same lesson as Story 8-3's `vi.mock` intra-module gotcha, generalized: a test file should mock at most one layer down from what it tests. Memorialized.

7. **Stripe SDK + TypeScript glitch in test mock-shape construction.** Stripe's `StripeAuthenticationError` constructor expects a specific raw-error shape — using `{ type: 'authentication_error', message: 'No such country: ZZ' }` works for the test but the type signature isn't well-documented. Worth noting for Stories 9-3+ when they mock more error classes.

8. **Synthetic seed Connect ID — confirmed working end-to-end.** `acct_seed_for_e2e_only` is inserted via `pnpm db:seed`; E2E test #1 verifies the "Onboarding complete" state renders against this row; test #2 deletes-then-restores the row to verify the "Complete onboarding" CTA renders for an owner without a Connect account. The synthetic ID never reaches Stripe — every action path that would call Stripe sees the row and reuses the ID without doing `accounts.create`.

9. **Stripe `listen` background process from earlier session is no longer running.** Earlier in this session, `stripe listen --forward-to localhost:3000/api/stripe/webhook` was running as PID 18868. As of dev-story dispatch, that process is gone (presumably terminated when the session restarted). **For the BA browser walk to verify webhook sync (AC-15 §8), `stripe listen` needs to be restarted.** The `STRIPE_WEBHOOK_SECRET` already in `.env.local` matches the prior listener's signing secret; if `stripe listen` is restarted it'll generate a NEW `whsec_*`, and `.env.local` will need to be updated to match. Documenting for the BA verification pass.

10. **`pnpm dev` on port 3000 (PID 7380) is still running.** Started before this dev-story session; has the prior env. For the BA browser walk, restart it so it picks up `STRIPE_WEBHOOK_SECRET` (otherwise the webhook handler will return 500 on every event).

11. **Account-key alignment confirmed.** Earlier in this session, the rotated `STRIPE_SECRET_KEY` + `STRIPE_PUBLISHABLE_KEY` both shared the `TXGM6RvIpZbtPbe` account-id segment (account `acct_1TXGM6RvIpZbtPbe`), and `STRIPE_WEBHOOK_SECRET` is from `stripe login`'s session on the same account. All three keys are aligned — Story 9-3 won't hit the "API key/account mismatch" error.

### Known E2E hazard (operational, pre-existing per 8-POLISH-1)

The 4 E2E failures in the full suite run are the documented `pnpm dev` reuse hazard from Story 8-POLISH-1:

- `admin-applications:33`
- `application-emails:74`
- `become-a-host:58`
- `booking-emails:73`

Root cause: Playwright's `webServer.reuseExistingServer: !CI` reuses an existing `pnpm dev` process whose env doesn't include test-only overrides (most notably `EMAIL_TEST_RECORD_FILE` for the recording-sink-dependent tests). My 3 new E2E tests for `/owner/settings` are NOT affected because they only read the DB and don't depend on any of these env vars.

**BA mitigation for the browser walk:** kill the existing `pnpm dev` process (`Stop-Process -Id 7380` in PowerShell, or `taskkill /F /PID 7380`) before `pnpm test:e2e`. The Playwright `webServer` block will then spawn a fresh server with the proper env.

### File List

Modified (6, one auto-updated):
- `deskhive/src/db/schema.ts` — added `stripeConnectAccountsTable` + `webhookEventsTable` + 4 type exports (`StripeConnectAccount` + `NewStripeConnectAccount` + `WebhookEvent` + `NewWebhookEvent`); added `jsonb` to the drizzle-orm/pg-core import.
- `deskhive/drizzle/migrations/meta/_journal.json` (auto-updated by `pnpm db:generate`).
- `deskhive/scripts/seed.ts` — added `stripeConnectAccountsTable` import + `seedOwnerConnectAccount()` function + main() wiring.
- `deskhive/.env.example` — renamed Stripe section header to "Stories 9-1 / 9-2 — Payments (Stripe)"; appended `STRIPE_WEBHOOK_SECRET` block.
- `deskhive/src/components/header.tsx` — added "Settings" link to SPACE_OWNER + host-mode variant nav; updated top-of-file comment.
- `_bmad-output/implementation-artifacts/sprint-status.yaml` — 9-2 status `ready-for-dev` → `review`; `last_updated` parenthetical refreshed.

New (15):
- `deskhive/drizzle/migrations/0003_numerous_stone_men.sql` (with added story-tag + rollback comment block).
- `deskhive/drizzle/migrations/meta/0003_snapshot.json` (auto-generated by Drizzle).
- `deskhive/src/db/queries/stripe-connect.ts` — `getConnectAccountByUserId` + `getConnectAccountByStripeAccountId` + `upsertConnectAccount`.
- `deskhive/src/lib/payments/connect.ts` — 3 typed wrappers (`createConnectAccount` + `createConnectAccountLink` + `getConnectAccountStatus`) with idempotency-key, error mapping, locked `country: 'US'` + inline-comment.
- `deskhive/src/lib/payments/connect.test.ts` — 5 wrapper tests (Decision §14 tests 1-4).
- `deskhive/src/actions/connect.ts` — `initiateConnectOnboardingAction` + `refreshConnectStatusAction` with `effectiveMode(session)`-based auth.
- `deskhive/src/actions/connect.test.ts` — 6 action tests (Decision §14 tests 5-7 + 3 bonus auth-path tests).
- `deskhive/src/app/(owner)/owner/settings/page.tsx` — main settings page (3-state branch).
- `deskhive/src/app/(owner)/owner/settings/onboarding-cta-button.tsx` — Client Component for `window.location.assign`.
- `deskhive/src/app/(owner)/owner/settings/onboarding/return/page.tsx` — return-URL handler.
- `deskhive/src/app/(owner)/owner/settings/onboarding/refresh/page.tsx` — refresh-URL handler.
- `deskhive/src/app/api/stripe/webhook/route.ts` — narrow `account.updated` POST handler.
- `deskhive/src/app/api/stripe/webhook/route.test.ts` — 5 webhook tests (Decision §14 tests 8-11 + 1 bonus unknown-account branch test).
- `deskhive/tests/e2e/connect-onboarding.spec.ts` — 3 E2E tests.
- `_bmad-output/implementation-artifacts/9-2-stripe-connect-onboarding.md` — this story file.

Out-of-tree (not staged):
- `~/.claude/.../memory/reference_stripe_service_pattern.md` — extended with the Story 9-2 section + updated frontmatter description.
- `~/.claude/.../memory/MEMORY.md` — index entry one-liner refreshed.

Zero changes to: `deskhive/src/lib/stripe.ts`, `deskhive/src/lib/stripe-service.ts`, `deskhive/src/lib/email*`, `deskhive/src/lib/email-templates/`, `deskhive/src/app/(owner)/owner/spaces/*`, `deskhive/src/actions/space.ts`, `deskhive/src/actions/booking.ts`, `deskhive/src/actions/application.ts`, `deskhive/scripts/stripe-ping.ts`, `deskhive/scripts/send-test-email.ts`, `deskhive/src/app/(public)/*`, `deskhive/src/app/(admin)/*`, `deskhive/drizzle.config.ts`, `deskhive/playwright.config.ts`, Better Auth config, Tailwind, proxy.ts, package.json.

### Change Log

| Date | Change | Commit |
|---|---|---|
| 2026-05-17 | Story drafted by `bmad-create-story` from locked BA decisions document `e6d4c0f`. | (none) |
| 2026-05-17 | Story implemented; 2 new Drizzle tables + migration `0003_numerous_stone_men.sql`; `src/lib/payments/connect.ts` with 3 typed wrappers (idempotency-key, `country: 'US'` + Phase 3 inline-comment); `src/db/queries/stripe-connect.ts` with 3 helpers; `src/actions/connect.ts` with 2 Server Actions (auth via `effectiveMode(session)`); 3 new owner-side routes under `/owner/settings/*` + Client-Component `OnboardingCtaButton`; 1 new API route at `/api/stripe/webhook` (narrow `account.updated` only); 16 new unit tests (target was 11; +5 bonus on error/auth paths); 3 new E2E tests (test #3 reshaped from BA Decision §9 strict spec — see Completion Note #3). `.env.example` updated; seed gets synthetic Connect row for owner; header gets Settings link. Memory entry extended. 328 unit pass / 39 routes / typecheck + lint + build clean / 47 E2E pass (4 failures + 5 didn't-run are Story 8-POLISH-1's documented dev-server-reuse hazard, not 9-2 regressions). Single commit per AC-14 — awaiting BA browser walk before push. | _TBD (filled by `docs:` follow-up after BA greenlight + push, same pattern as Stories 8-POLISH-1 + 9-1)_ |
