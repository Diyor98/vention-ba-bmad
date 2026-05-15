# Story 9-1: Stripe SDK Wrapper + Service Layer — BA Decisions

**Story:** 9-1
**Epic:** 9 — Payments (Theme B)
**Phase:** 2
**Type:** Infrastructure — no UX surface
**Author:** Ikhtiyor Ziyayev, Business Analyst
**Date:** Thursday, May 14, 2026
**Status:** Locked, ready for dispatch
**Source:** Phase 2 PRD §4.4 (FR-PAY rows 1-3), §8 Epic 9 Story 9-1

---

## Context

Epic 9 (Theme B) is the third and final thematic workstream of Phase 2. It introduces real Stripe-based payments to DeskHive — payment at booking time, host onboarding via Stripe Connect Express, webhook handling for payment events, refund flow, and payouts view for hosts.

Story 9-1 is the **infrastructure-only kickoff** for Theme B. Mirroring how Story 8-1 set up the email plumbing (Resend SDK wrapper, base template, CLI smoke test) before 8-2 and 8-3 used it, Story 9-1 sets up the payment plumbing before 9-2, 9-3, etc. start using it.

**Stripe test-mode account created May 14.** Sandbox active. API keys (`pk_test_*` and `sk_test_*`) have been added to `.env.local`. No real money will move during all of Phase 2 — Phase 2 PRD §3.3 locks test-mode-only operation.

**Bob's dispatch may surface 2-3 implementation choices** around Stripe API version pinning, error handling pattern, and CLI smoke-test scope. All locked in this doc — see Decisions §2, §6, §9.

---

## Scope

**In scope:**

- Install Stripe Node.js SDK as a project dependency (`pnpm add stripe`)
- Create `src/lib/stripe.ts` — typed Stripe client wrapper that:
  - Reads `STRIPE_SECRET_KEY` from environment variables
  - Validates the key format on startup (must start with `sk_test_` for non-production environments — Decision §3)
  - Initializes a singleton Stripe client with pinned API version (Decision §2)
  - Exports the typed `stripe` client for use across the codebase
- Create a service-layer helper file `src/lib/stripe-service.ts` (or similar — Amelia picks the exact location) — empty service stubs for now (no actual payment operations); just establishes the seam where future stories (9-3 createPaymentIntent, 9-5 webhook handling, etc.) will plug in
- CLI smoke test command `pnpm stripe-ping` — calls Stripe's `/balance` endpoint to verify the API key is valid and connection works (Decision §9)
- Environment variable validation:
  - Throw startup error if `STRIPE_SECRET_KEY` is missing
  - Throw startup error if a `sk_live_*` key is detected outside `NODE_ENV=production` (Decision §3)
  - Throw startup error if key format is malformed
- Unit tests covering the wrapper initialization, env validation, and key-format detection (Decision §10)
- Memory file: `reference_stripe_service_pattern.md` documenting the wrapper conventions and patterns established by this story

**Out of scope:**

- ❌ Stripe Connect Express onboarding (Story 9-2)
- ❌ Payment intents, checkout sessions, payment flows (Story 9-3)
- ❌ Payment capture/cancel logic on booking state changes (Story 9-4)
- ❌ Webhook endpoint and event handling (Story 9-5)
- ❌ Refund flow (Story 9-6)
- ❌ Payouts view UI (Story 9-7)
- ❌ Stripe domain configuration on Stripe dashboard
- ❌ Live mode activation
- ❌ Any UI changes — this story is purely backend infrastructure
- ❌ Any database schema changes — payment-related tables come in Story 9-3
- ❌ Any new Server Actions (Stripe operations will be wrapped by future stories)
- ❌ Resend domain verification or any email work
- ❌ Modifying any existing email infrastructure (8-1, 8-2, 8-3, 8-POLISH-1) — that's a separate concern
- ❌ Stripe webhook signature verification (that's 9-5)
- ❌ E2E tests — there are no user-visible flows in this story; Stripe SDK errors are unit-testable but not E2E-testable
- ❌ Frontend SDK installation (`@stripe/stripe-js`) — that's deferred to Story 9-3 when the booking-with-payment UI ships

---

## Decisions

### Decision 1: Infrastructure-only — no UX surface

This story produces no visible change to any user. After 9-1 ships, the running app behaves identically to before. The only differences:

- A new `stripe` library is in `node_modules`
- A new `src/lib/stripe.ts` module exists
- A new CLI command `pnpm stripe-ping` exists
- New env variables (`STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY`) are required for the dev server to start

**Why this matters:**
- Sets up the *seam* where 9-2 through 9-7 will plug in
- No risk of breaking existing functionality (no shipped code paths touch Stripe yet)
- Mirrors 8-1's approach — infrastructure first, features later

**Anti-pattern explicitly forbidden:** do NOT add UI components, Server Actions for payments, payment-related schema changes, or webhook routes in this story. Those belong in 9-2 through 9-7.

### Decision 2: Stripe API version pinning

Stripe versions their API (different from SDK versions). Without pinning, Stripe could roll out a breaking change and the SDK auto-adopts it, causing surprise breakage.

**Locked (amended 2026-05-15 post-ship):** pin API version to the **SDK-matched `LatestApiVersion` string literal** — i.e., whatever string is exported from `node_modules/stripe/cjs/apiVersion.d.ts` for the resolved SDK version. As of `stripe@22.1.1` (the version pnpm resolved on 2026-05-15), that literal is **`'2026-04-22.dahlia'`**, and that is what shipped in `src/lib/stripe.ts`.

**Amendment rationale:** the original lock (`'2024-06-20'`) was incompatible with the SDK's strict typing. `stripe@22.1.1` types `apiVersion?: LatestApiVersion` where `LatestApiVersion = typeof ApiVersion = '2026-04-22.dahlia'` — a string literal, not `string`. Pinning to anything older requires bypassing the type check (via `as Stripe.LatestApiVersion` cast), which also bypasses the typed-response narrowing that `typescript: true` activates. The amendment supersedes the original lock and matches the BA's *intent* in the original Decision §2 ("latest stable Stripe API version as of SDK release") verbatim.

**Implementation (as shipped):**

```typescript
import Stripe from 'stripe'

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2026-04-22.dahlia',
  typescript: true,
})
```

**Why this matters:**
- Stripe deprecates API versions over time; pinning protects against surprise breakage
- TypeScript types are generated per API version; pinning keeps types stable
- Upgrades become deliberate polish decisions, not silent dependency drift
- **Matching the SDK's typed `LatestApiVersion` keeps the typed-response narrowing active** — `typescript: true` only delivers the typed shapes when the apiVersion string matches the SDK's compiled types

**Anti-pattern explicitly forbidden (updated):**
- Do NOT omit `apiVersion` (would use SDK default, which may shift)
- Do NOT use `'latest'` or `'beta'`
- Do NOT cast a non-matching `apiVersion` string with `as Stripe.LatestApiVersion` — defeats the typing guarantee
- When bumping the SDK (polish story), bump `apiVersion` in the same change to the new SDK's exported `LatestApiVersion` literal. Do not let the two drift

### Decision 3: Test-mode safety — reject `sk_live_*` keys in non-production

We're locked to test-mode-only for all of Phase 2 (Phase 2 PRD §3.3). Accidental use of a live key would cause real money movement.

**Locked:** at module initialization, the wrapper inspects the `STRIPE_SECRET_KEY` value:

- If it starts with `sk_test_` → proceed normally
- If it starts with `sk_live_` AND `NODE_ENV !== 'production'` → throw error at startup with a clear message
- If it has any other prefix or is malformed → throw error at startup
- If it's undefined/empty → throw error at startup

**Implementation pattern:**

```typescript
const key = process.env.STRIPE_SECRET_KEY

if (!key) {
  throw new Error('STRIPE_SECRET_KEY is not set in environment')
}

if (!key.startsWith('sk_test_') && !key.startsWith('sk_live_')) {
  throw new Error('STRIPE_SECRET_KEY format is invalid (expected sk_test_* or sk_live_*)')
}

if (key.startsWith('sk_live_') && process.env.NODE_ENV !== 'production') {
  throw new Error(
    'Refusing to use a live Stripe key outside of production. ' +
    'Use a test-mode key (sk_test_*) for local development.'
  )
}
```

**Why startup-time check, not call-time:**
- Fail fast — developer sees the error immediately, not when first payment is attempted
- Cannot accidentally ship a misconfigured deployment to staging/dev with wrong keys
- Cheap — one string check at module load

**Anti-pattern explicitly forbidden:**
- Do NOT silently fall back to a default key
- Do NOT log a warning and continue — startup must hard-fail
- Do NOT skip the live-key check (some teams do; it's the most common cause of Stripe production accidents)

### Decision 4: Singleton client pattern

The Stripe SDK creates an HTTP client when instantiated. Creating multiple instances wastes connections and memory.

**Locked:** export a single `stripe` instance from `src/lib/stripe.ts`. All callers (current and future) import the same instance.

**Implementation:**

```typescript
// src/lib/stripe.ts
import Stripe from 'stripe'

const key = process.env.STRIPE_SECRET_KEY!
// ...validation per Decision §3...

export const stripe = new Stripe(key, { apiVersion: '2024-06-20', typescript: true })
```

**Anti-pattern explicitly forbidden:**
- Do NOT create new `Stripe(...)` instances inside Server Actions or services
- Do NOT export a `getStripe()` factory — singleton import is simpler and idiomatic
- Do NOT pass the `stripe` instance through props or context — import where needed

### Decision 5: File structure

Mirror 8-1's structure for consistency:

| 8-1 (email) | 9-1 (Stripe) |
|---|---|
| `src/lib/email.ts` | `src/lib/stripe.ts` |
| `src/lib/email-templates/` | (none yet — Story 9-3 adds `src/lib/payments/` or similar) |
| `scripts/send-test-email.ts` | `scripts/stripe-ping.ts` |
| `pnpm send-test-email` | `pnpm stripe-ping` |

**Locked file structure for 9-1:**

- `src/lib/stripe.ts` — Stripe client wrapper (singleton, env validation, API version pin)
- `scripts/stripe-ping.ts` — CLI smoke test
- `package.json` scripts section adds `"stripe-ping": "tsx scripts/stripe-ping.ts"`

**Service-layer file** — Amelia's discretion. Could be:
- A new `src/lib/stripe-service.ts` with empty exports ready for 9-3+ to populate
- A new `src/lib/payments/` directory with `index.ts` exporting the seam
- Or nothing yet — wait for 9-2/9-3 to need it and create then

**My preference: a thin `src/lib/stripe-service.ts` with just type exports and a comment block documenting that 9-2+ will populate operations here.** Sets the architectural intent without empty stub functions.

### Decision 6: Error handling — non-throwing at service boundaries (mirror 8-1)

Story 8-1 Decision §4 locked that `sendEmail` is fire-and-forget and non-throwing — Resend failures don't break user flows. **Same pattern for Stripe**, but with a critical difference: **Stripe errors are often actionable** (card declined, insufficient funds, etc.), so users WILL see error states. The pattern is:

- The `stripe` SDK itself can throw — that's fine, errors bubble up through normal try/catch
- Service-layer wrappers (added in 9-3+) will catch Stripe errors and return typed result objects: `{ ok: true, data: ... } | { ok: false, error: ... }`
- Server Actions consume the typed results and show appropriate UI feedback
- **9-1 itself doesn't add service-layer wrappers yet** — those come in 9-3 when the first real operation is needed

**For 9-1 specifically:** the only error path is the smoke test (`stripe-ping`). It should:
- Try `stripe.balance.retrieve()`
- If success → print balance and exit 0
- If failure → print error and exit 1

**Anti-pattern explicitly forbidden:**
- Do NOT add try/catch wrappers around all Stripe calls in 9-1 (premature; service-layer wrappers come in 9-3)
- Do NOT make the Stripe client itself non-throwing — that would hide real errors

### Decision 7: Environment variable strategy

**Required env vars added by this story:**

| Variable | Required by | Value pattern | Purpose |
|---|---|---|---|
| `STRIPE_SECRET_KEY` | Server-side | `sk_test_51...` | Authenticate API calls to Stripe |
| `STRIPE_PUBLISHABLE_KEY` | Client-side (later, Story 9-3) | `pk_test_51...` | Stripe.js initialization in browser |

**Story 9-1 only validates `STRIPE_SECRET_KEY`** since no client-side code is added yet. `STRIPE_PUBLISHABLE_KEY` is added to `.env.local` for future use but not consumed by any 9-1 code.

**`.env.example` update:**
- Add example lines for both keys (with placeholder values, not real)
- Document that test-mode keys are required for non-production environments

**Anti-pattern explicitly forbidden:**
- Do NOT consume `STRIPE_PUBLISHABLE_KEY` in 9-1 — defer to 9-3 when client-side Stripe.js is added
- Do NOT add Stripe webhook secret env var (`STRIPE_WEBHOOK_SECRET`) — defer to 9-5

### Decision 8: No frontend SDK installation in 9-1

Stripe has two SDKs:
- `stripe` (Node.js, server-side) — installed in 9-1 ✅
- `@stripe/stripe-js` + `@stripe/react-stripe-js` (browser/React, client-side) — **NOT installed in 9-1**

The client-side SDK is needed when the booking UI integrates with Stripe Checkout or Elements (Story 9-3). Installing it now would bloat the bundle for code paths that don't exist.

**Anti-pattern explicitly forbidden:** do NOT install `@stripe/stripe-js` or `@stripe/react-stripe-js` in this story.

### Decision 9: CLI smoke test — `pnpm stripe-ping`

**Locked name:** `pnpm stripe-ping`

**Why this name (not `send-test-stripe`):**
- Semantically accurate — we're querying Stripe's `/balance` endpoint, not "sending" anything
- "Ping" is universal dev terminology for API connectivity check
- Stripe's own documentation uses "ping" for similar diagnostic scripts
- Pattern divergence from 8-1's `send-test-email` is justified by semantic difference (email sends data; Stripe verifies connectivity)

**Implementation behavior (amended 2026-05-15 post-ship — dotenv-then-dynamic-import order):**

```typescript
// scripts/stripe-ping.ts
import { config } from 'dotenv'
config({ path: '.env.local' })
config({ path: '.env' })

async function main() {
  console.log('Pinging Stripe API...')
  // Dynamic import — must happen AFTER the dotenv preload above.
  // See "Amendment rationale" below.
  const { stripe } = await import('@/lib/stripe')
  const balance = await stripe.balance.retrieve()
  console.log('✓ Stripe API connection works')
  console.log(`  Available balance: ${balance.available.map(b => `${b.amount/100} ${b.currency}`).join(', ')}`)
  console.log(`  Pending balance: ${balance.pending.map(b => `${b.amount/100} ${b.currency}`).join(', ')}`)
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('✗ Stripe API ping failed:', err.message)
    process.exit(1)
  })
```

**Amendment rationale (dotenv-vs-ES-module-hoisting):** the original implementation pattern used a top-level static `import { stripe } from '...'`. That import gets *hoisted above* the `config({ path: '.env.local' })` function calls at module-graph build time, so `src/lib/stripe.ts`'s Decision §3 module-load guards fire **before** dotenv populates `process.env`. The script then crashes with "STRIPE_SECRET_KEY is not set in environment" even though the key is sitting in `.env.local` waiting to be read.

The fix preserves Decision §3's "hard-throw at module load" contract by **deferring the import until after dotenv has run**:
- Load dotenv at the top of the script via top-level `config()` calls (no hoisting issue — these are function calls, not imports).
- Inside `main()`, do `const { stripe } = await import('@/lib/stripe')`. By the time this dynamic import evaluates `stripe.ts`, `process.env.STRIPE_SECRET_KEY` is populated, so the three guards (missing / wrong-prefix / live-key-outside-production) see real values and behave correctly.

The Next.js app doesn't have this problem because Next.js's own tooling loads `.env*` files *before* any user module evaluates. tsx (which runs `pnpm stripe-ping`) does not.

`scripts/send-test-email.ts` (Story 8-1) uses a top-level static import and works fine — but only because `src/lib/email.ts` validates env *inside* `sendEmail()`, not at module load. Stripe's stricter Decision §3 contract is what forces the dynamic-import pattern here.

**Why `balance.retrieve()` and not a more elaborate endpoint:**
- Simplest read-only Stripe API call
- Requires the secret key to work — verifies authentication
- Returns immediately, no side effects
- Test-mode balance will always show $0.00 — that's expected and not an error
- **Confirmed live on 2026-05-15:** `pnpm stripe-ping` returned 0.00 USD against the test-mode sandbox — end-to-end seam works

**Anti-pattern explicitly forbidden (updated):**
- Do NOT create test customers, test charges, or any data-mutation in the smoke test
- Do NOT skip the smoke test (it's our proof that the wrapper works end-to-end)
- Do NOT make `stripe-ping` run as part of `pnpm test` or `pnpm build` (it's a manual CLI tool)
- Do NOT use a top-level `import { stripe } from '@/lib/stripe'` in any tsx-run script — the dotenv-vs-hoisting trap will fire. Use the dynamic-import-inside-main pattern shown above
- Do NOT move the dotenv `config()` calls below the dynamic import — order matters

### Decision 10: Test coverage

**Unit tests added by 9-1** (~5-7 tests in `src/lib/stripe.test.ts`):

1. `stripe` client initializes successfully with valid `sk_test_*` key
2. Module throws if `STRIPE_SECRET_KEY` is missing/empty
3. Module throws if key has invalid prefix (e.g., `xyz_123...`)
4. Module throws if `sk_live_*` is set but `NODE_ENV !== 'production'`
5. Module proceeds without throwing if `sk_live_*` is set AND `NODE_ENV === 'production'` (production env is acceptable for live keys)
6. Stripe client is initialized with the correct API version (`'2024-06-20'`)
7. Module exports a singleton — multiple imports return the same instance

**E2E tests added:** none. There are no user-visible flows in 9-1.

**Note on testing the smoke test script:** `scripts/stripe-ping.ts` is a CLI tool, not unit-tested. Verification is manual: run `pnpm stripe-ping` and observe output.

**Target unit test count after this story:**
- Baseline (end of 8-POLISH-1): ~308
- After 9-1: **~313-315** (+5-7 new from Decision §10)

**Target E2E test count after this story:**
- Baseline: 53
- After 9-1: **53** (unchanged)

### Decision 11: No dependency on Resend / email infrastructure

This story does not touch any existing email infrastructure (8-1 through 8-POLISH-1). Stripe and Resend are independent integrations. Future Story 8-4 will bridge them (payment events → email notifications), but that requires both Story 9-5 (webhook handler) and 8-4 to be in scope — neither is in 9-1.

**Anti-pattern explicitly forbidden:** do NOT modify any file under `src/lib/email*`, `src/lib/email-templates/`, or any email-related test files in this story.

### Decision 12: Memory file

Create `reference_stripe_service_pattern.md` documenting:

- Singleton client pattern (Decision §4)
- API version pinning rationale (Decision §2)
- Test-mode safety check at startup (Decision §3)
- File structure conventions (Decision §5)
- CLI smoke-test pattern (Decision §9)
- Anti-pattern: do not install `@stripe/stripe-js` until 9-3 needs it (Decision §8)
- Reservation of `STRIPE_WEBHOOK_SECRET` env var name for Story 9-5

This file will be extended by 9-2 through 9-7 as new patterns are established.

### Decision 13: Files likely touched

Estimate, not directive.

- `package.json` — add `stripe` dependency, add `stripe-ping` script
- `pnpm-lock.yaml` — auto-updated
- `src/lib/stripe.ts` (new) — singleton client wrapper
- `src/lib/stripe.test.ts` (new) — unit tests
- `src/lib/stripe-service.ts` (new, optional) — empty seam for future stories
- `scripts/stripe-ping.ts` (new) — CLI smoke test
- `.env.example` — document new env var requirements
- Memory file: `reference_stripe_service_pattern.md`

**No changes to:**
- `src/app/` (any route)
- `drizzle/` (no schema)
- `scripts/seed.ts`
- `src/lib/email*` (Theme C untouched)
- Any existing Server Action
- Any existing component
- Better Auth configuration
- Tailwind/CSS

---

## Architectural anti-patterns forbidden

- **Do NOT** add any UI components (Decision §1)
- **Do NOT** install `@stripe/stripe-js` or `@stripe/react-stripe-js` (Decision §8)
- **Do NOT** create payment intents, checkout sessions, or any payment operations (Story 9-3 territory)
- **Do NOT** add webhook routes (Story 9-5 territory)
- **Do NOT** add database schema changes (Story 9-3 territory)
- **Do NOT** omit `apiVersion` from Stripe client init (Decision §2)
- **Do NOT** allow `sk_live_*` outside production (Decision §3)
- **Do NOT** create multiple Stripe client instances (Decision §4)
- **Do NOT** make the Stripe client itself non-throwing (Decision §6)
- **Do NOT** add try/catch wrappers around future Stripe operations in 9-1 (Decision §6)
- **Do NOT** modify any email infrastructure (Decision §11)
- **Do NOT** name CLI smoke test anything other than `stripe-ping` (Decision §9)
- **Do NOT** make `stripe-ping` run automatically in `pnpm test` or `pnpm build` (Decision §9)
- **Do NOT** create test customers, test charges, or data-mutating calls in the smoke test (Decision §9)
- **Do NOT** add `STRIPE_WEBHOOK_SECRET` env var (Decision §7 — Story 9-5)
- **Do NOT** add real-API E2E tests (no user-visible flow exists)
- **Do NOT** add new dependencies beyond `stripe` itself

---

## Browser verification checklist

This story has no user-visible flows. Verification is via CLI and unit tests.

### Setup

- `.env.local` contains valid `STRIPE_SECRET_KEY=sk_test_*` and `STRIPE_PUBLISHABLE_KEY=pk_test_*`
- `pnpm install` has run (Stripe SDK installed)

### Checks

1. **All unit tests pass** — `pnpm test` runs clean. Target ~313-315 (was 308).

2. **All E2E tests pass** — `pnpm test:e2e` runs clean. Target 53 (unchanged).

3. **Typecheck + lint clean** — `pnpm typecheck` + `pnpm lint`.

4. **Build 36 routes unchanged** — `pnpm build`.

5. **`git diff --stat`** shows ONLY:
   - `package.json` + `pnpm-lock.yaml` (dependency added)
   - `src/lib/stripe.ts` (new)
   - `src/lib/stripe.test.ts` (new)
   - `scripts/stripe-ping.ts` (new)
   - `.env.example` (new env vars documented)
   - Possibly `src/lib/stripe-service.ts` (Decision §5)
   - Memory file
   - NO changes to `src/app/`, `src/lib/email*`, `drizzle/`, `scripts/seed.ts`

6. **CLI smoke test works** — `pnpm stripe-ping` exits 0 and prints:
   - "Pinging Stripe API..."
   - "✓ Stripe API connection works"
   - Available balance (will be $0.00 in test mode — that's correct)
   - Pending balance (will be $0.00)

7. **CLI fails cleanly on bad key** — temporarily set `STRIPE_SECRET_KEY=sk_test_invalid` in `.env.local`, restart, run `pnpm stripe-ping`. Expected: exits 1, prints "✗ Stripe API ping failed: ..." with the actual error. Restore valid key after testing.

8. **CLI fails cleanly on missing key** — temporarily comment out `STRIPE_SECRET_KEY=` line, restart, run `pnpm stripe-ping`. Expected: error mentioning the missing env var.

9. **CLI fails cleanly on `sk_live_*` outside production** — temporarily set `STRIPE_SECRET_KEY=sk_live_fakefake123` in `.env.local`, restart, run `pnpm stripe-ping`. Expected: clear error message refusing to proceed. Restore valid test key after testing.

10. **Dev server still works** — `pnpm dev` starts cleanly. App routes still load. Existing flows (login, application, booking, email) all still work — regression check.

11. **Regression on email pipeline** — `pnpm send-test-email` still works (Story 8-1 regression check). Smoke test arrives at `marketadteam@gmail.com`.

12. **Stripe dashboard sanity check** — open Stripe dashboard at https://dashboard.stripe.com → navigate to Developers → Logs. Run `pnpm stripe-ping`. Verify a `GET /v1/balance` API call appears in the logs with HTTP 200.

13. **No console errors during all flows.**

14. **No new TypeScript errors** in IDE.

15. **`pnpm-workspace.yaml` and `pnpm-lock.yaml`** still valid.

---

## Files likely touched

(Same as Decision §13:)

- `package.json` — add `stripe` dep, add `stripe-ping` npm script
- `pnpm-lock.yaml` — auto-updated by pnpm
- `src/lib/stripe.ts` (new) — singleton client
- `src/lib/stripe.test.ts` (new) — unit tests
- `src/lib/stripe-service.ts` (new, optional) — seam for future operations
- `scripts/stripe-ping.ts` (new) — CLI smoke test
- `.env.example` — document `STRIPE_SECRET_KEY` and `STRIPE_PUBLISHABLE_KEY`
- Memory file `reference_stripe_service_pattern.md`

**No changes to:**

- Any route under `src/app/`
- Any Server Action
- Any database schema or seed
- Better Auth config
- Tailwind / CSS
- Email infrastructure (`src/lib/email*`, `src/lib/email-templates/`)
- Existing tests
- Build configuration

---

## CI baseline target after this story

Current baseline (end of 8-POLISH-1):
- Unit tests: ~308
- E2E tests: 53
- Build routes: 36

After Story 9-1:
- Unit tests: **~313-315** (+5-7 new from Decision §10)
- E2E tests: **53** (unchanged)
- Build routes: 36 (unchanged)

---

## Memory note for Phase 2 continuation

This story:

- Establishes Theme B (Epic 9) — the payments workstream
- Locks Stripe SDK conventions: singleton client, pinned API version, test-mode safety checks
- Mirrors 8-1's infrastructure-first approach for Theme C
- Creates the CLI smoke test pattern for Stripe (analogous to `send-test-email` for Resend)
- Reserves architectural seam for Stripe Connect Express (9-2), payment operations (9-3+), webhook handling (9-5)

**After 9-1 ships:**
- Epic 9 progress: 1 of 7 stories shipped
- Phase 2 overall: 12 of ~17 stories shipped
- **Next dispatch: Story 9-2** (Stripe Connect Express onboarding for hosts)

**Story 9-2 will need:**
- Stripe Connect platform configuration on dashboard (likely 30-60 min of dashboard work outside the code)
- `STRIPE_CONNECT_CLIENT_ID` env var (configured on Stripe dashboard, copied into .env.local)
- UI components for onboarding status on owner dashboard (`p2-08-owner-settings.html` design from Makhbuba's package)
- New owner-side surface for "Connect your Stripe account" call-to-action

**Dependencies cleared by 9-1:**
- Stripe client is available for any future server-side use
- Test-mode safety is enforced
- Smoke test confirms connectivity before deeper work

---

**End of BA decisions document.**
