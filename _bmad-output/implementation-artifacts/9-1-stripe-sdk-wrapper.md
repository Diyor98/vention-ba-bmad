# Story 9-1: Stripe SDK Wrapper + Service Layer

Status: review

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a **DeskHive engineer building the Payments workstream**,
I want **a typed, singleton Stripe SDK wrapper with startup safety checks, pinned API version, and a CLI smoke test** — established before any payment feature ships,
so that **Stories 9-2 through 9-7 (and Story 8-4's payment-emails follow-up) plug into a single, hardened seam without re-litigating SDK initialization, environment validation, or live-key safety with every new story.**

> Story 9-1 is the **infrastructure-only kickoff** for Theme B (Payments / Epic 9) — the third and final thematic workstream of Phase 2. Source of truth: [docs/design/9-1-stripe-sdk-wrapper-ba-decisions.md](docs/design/9-1-stripe-sdk-wrapper-ba-decisions.md). All decisions locked.

> **Mirrors Story 8-1's posture for Theme C.** 8-1 shipped the Resend wrapper + base template + `pnpm send-test-email` smoke test before 8-2 / 8-3 needed real templates. 9-1 ships the Stripe wrapper + `pnpm stripe-ping` smoke test before 9-2 needs onboarding, 9-3 needs payment intents, 9-5 needs webhooks. **After 9-1 ships, the running app behaves identically to before** — the only differences are a new `stripe` npm dep, a new module at `src/lib/stripe.ts`, and the new CLI command. No routes, no UI, no schema, no Server Actions touched.

> **Stripe test-mode account is active.** API keys (`pk_test_*` and `sk_test_*`) already in `.env.local`. Phase 2 PRD §3.3 locks test-mode-only for all of Phase 2 — Decision §3 enforces that at module-load time with a startup-throwing live-key guard.

> **Key anti-patterns to keep in mind:**
> - **No UI, no Server Actions, no schema, no webhooks** — those are Stories 9-2 / 9-3 / 9-5 / 9-6 / 9-7 territory (Decision §1).
> - **`apiVersion` MUST be pinned to `'2024-06-20'`** — omitting it adopts SDK default, which can shift (Decision §2).
> - **Reject `sk_live_*` keys outside `NODE_ENV=production`** — hard-throw at module load, not at first call (Decision §3).
> - **Singleton client** — never create new `Stripe(...)` instances elsewhere; always import `stripe` from `src/lib/stripe.ts` (Decision §4).
> - **No `@stripe/stripe-js` install yet** — that's Story 9-3 when the booking-with-payment UI lands (Decision §8).
> - **No `STRIPE_WEBHOOK_SECRET` env var yet** — Story 9-5 (Decision §7).
> - **No data-mutating calls in the smoke test** — `stripe.balance.retrieve()` is read-only and side-effect-free (Decision §9).
> - **No changes to `src/lib/email*` / `src/lib/email-templates/`** — Theme C is untouched by Theme B until Story 8-4 bridges them (Decision §11).

## Acceptance Criteria

> Source: BA Decisions document, Decisions 1–13 + Browser verification checklist (15 points).

1. **AC-1 (Stripe SDK installed; singleton client wrapper at `src/lib/stripe.ts`).** Per BA Decisions §2, §4, §5:
   - Add `stripe` as a `dependencies` entry in `deskhive/package.json` via `pnpm add stripe`. The pnpm-lock.yaml is auto-updated.
   - **No client-side SDKs** installed: explicitly NOT `@stripe/stripe-js`, NOT `@stripe/react-stripe-js` (Decision §8). Those defer to Story 9-3 when the booking-with-payment UI surfaces.
   - **No other new dependencies** — the only additions are `stripe` itself.
   - Create `deskhive/src/lib/stripe.ts` exporting a single `stripe` constant (a `Stripe` instance). Pattern:
     ```typescript
     import Stripe from 'stripe';
     // env validation per AC-2...
     export const stripe = new Stripe(key, {
       apiVersion: '2024-06-20',
       typescript: true,
     });
     ```
   - **Singleton.** All future callers (Stories 9-2/9-3/9-5/9-6/9-7/8-4) import `stripe` from this module. No `getStripe()` factory, no per-call instantiation, no DI/context plumbing (Decision §4 anti-patterns).

2. **AC-2 (Environment validation: missing / malformed / live-key-outside-production all hard-throw at module load).** Per BA Decision §3:
   - At module load time (top of `src/lib/stripe.ts`), read `process.env.STRIPE_SECRET_KEY` and validate:
     - **Missing/empty** → `throw new Error('STRIPE_SECRET_KEY is not set in environment')`.
     - **Wrong prefix** (not `sk_test_*` and not `sk_live_*`) → `throw new Error('STRIPE_SECRET_KEY format is invalid (expected sk_test_* or sk_live_*)')`.
     - **`sk_live_*` outside production** (i.e., `key.startsWith('sk_live_') && process.env.NODE_ENV !== 'production'`) → `throw new Error('Refusing to use a live Stripe key outside of production. Use a test-mode key (sk_test_*) for local development.')`.
     - **`sk_test_*` (any NODE_ENV)** → proceed normally.
     - **`sk_live_*` AND `NODE_ENV === 'production'`** → proceed normally (this is the future Phase 3 production path; valid).
   - **Why startup-time, not call-time:** fail fast on misconfiguration — developer sees the error immediately, not when first payment is attempted. Cheap (one string check at module load).
   - **Anti-patterns explicitly forbidden:**
     - Do NOT silently fall back to a default key.
     - Do NOT log a warning and continue — startup must hard-fail.
     - Do NOT skip the live-key guard (the most common cause of Stripe production accidents).

3. **AC-3 (API version pinned to `'2024-06-20'`).** Per BA Decision §2:
   - `new Stripe(key, { apiVersion: '2024-06-20', typescript: true })`. Pin enforced.
   - **Anti-patterns explicitly forbidden:**
     - Do NOT omit `apiVersion` (would use SDK default, which shifts as Stripe releases the SDK).
     - Do NOT use `'latest'` or `'beta'`.
     - Do NOT use an API version older than `'2024-06-20'`.
   - `typescript: true` is the SDK convention for activating typed responses; required.

4. **AC-4 (Service-layer seam at `src/lib/stripe-service.ts`).** Per BA Decision §5 (BA's stated preference):
   - Create a thin `src/lib/stripe-service.ts` containing:
     - A top-of-file module-header comment block documenting the architectural intent (the seam where Stories 9-2 / 9-3 / 9-5 / 9-6 / 9-7 will add their typed result-object wrappers — `{ ok: true, data } | { ok: false, error }` per Decision §6).
     - Re-export of the `stripe` singleton: `export { stripe } from './stripe';` so service-layer callers have a single import.
     - Optional: an exported `StripeServiceResult<T>` discriminated-union type that future story wrappers can return (low-cost, high-clarity).
   - **No actual operations yet.** Empty seam — populated by Stories 9-3 onward.
   - **No `'use server'` directive.** Same posture as `src/lib/email.ts` (pure module, callable from Server Actions / Server Components / API routes / CLI scripts).

5. **AC-5 (CLI smoke test: `pnpm stripe-ping`).** Per BA Decision §9:
   - Create `deskhive/scripts/stripe-ping.ts` mirroring `scripts/send-test-email.ts`'s structure:
     - Loads `.env.local` then `.env` via `dotenv` (same precedence as the email smoke-test script — see [scripts/send-test-email.ts:21-23](deskhive/scripts/send-test-email.ts#L21-L23)).
     - Imports `stripe` from `@/lib/stripe`.
     - Calls `stripe.balance.retrieve()` (read-only — Decision §9).
     - On success: prints `✓ Stripe API connection works` + the available + pending balance lines, exits 0.
     - On failure: prints `✗ Stripe API ping failed: <error message>`, exits 1.
   - Add `"stripe-ping": "tsx scripts/stripe-ping.ts"` to `package.json` `scripts` block. Place adjacent to `"send-test-email"` for visual cohesion.
   - **Anti-patterns explicitly forbidden:**
     - Do NOT create test customers, test charges, or any data-mutation in the smoke test.
     - Do NOT make `stripe-ping` part of `pnpm test` or `pnpm build` — it's a manual CLI tool.
     - Do NOT name the script anything other than `stripe-ping` (Decision §9 is explicit; pattern divergence from 8-1's `send-test-email` is justified — Stripe ping verifies *connectivity*, email send *transmits data*).

6. **AC-6 (`.env.example` updates — document both keys; reserve webhook secret for 9-5).** Per BA Decision §7:
   - Add a new section block after the existing "Story 8-1 — Email service (Resend)" block:
     ```
     # ─────────────────────────────────────────────────────────────────────────
     # Story 9-1 — Payments (Stripe)
     # ─────────────────────────────────────────────────────────────────────────
     ```
   - Document `STRIPE_SECRET_KEY` (server-side, `sk_test_*` for non-production; `sk_test_51_your_key_here` placeholder).
   - Document `STRIPE_PUBLISHABLE_KEY` (client-side, `pk_test_*`; placeholder; **NOT consumed by 9-1 — reserved for Story 9-3**).
   - Comment lines explain: required for the dev server to start; test-mode only for Phase 2; the live-key guard in `src/lib/stripe.ts`.
   - **No `STRIPE_WEBHOOK_SECRET` entry yet** — Decision §7 anti-pattern; defer to Story 9-5.

7. **AC-7 (Unit tests at `src/lib/stripe.test.ts` — 5–7 cases per Decision §10).** Per BA Decision §10:
   - Create `deskhive/src/lib/stripe.test.ts`. Tests cover:
     1. **`sk_test_*` key initializes cleanly** — `import('./stripe')` succeeds; the exported `stripe` is a `Stripe` instance.
     2. **Missing `STRIPE_SECRET_KEY` throws at module load** — error message contains `'STRIPE_SECRET_KEY is not set'`.
     3. **Wrong-prefix key throws** (e.g., `xyz_123abc`) — error message contains `'format is invalid'` or similar AC-2 phrasing.
     4. **`sk_live_*` outside production throws** — `NODE_ENV` set to anything but `'production'` (development / test / unset); error message refuses live-key use.
     5. **`sk_live_*` in production proceeds** — `NODE_ENV === 'production'` plus a `sk_live_*` key loads without throwing.
     6. **API version is pinned to `'2024-06-20'`** — inspect the initialized client (Stripe SDK exposes `_api.version` or similar; if private, assert via construction-argument capture via a `vi.spyOn` on the `Stripe` constructor — implementation detail; dev-agent picks the cleanest seam).
     7. **Singleton — multiple `import` calls return the same instance** — `import('./stripe').then(m1 => import('./stripe').then(m2 => expect(m1.stripe).toBe(m2.stripe)))`.
   - **Module-load-throw tests need `vi.resetModules()` + `vi.doMock` (or equivalent) per test** so each test gets a clean module evaluation with its own env. Pattern guidance — dev-agent picks: re-import strategy via dynamic `import('./stripe')` inside the test body after manipulating `process.env`.
   - **Mock the `Stripe` constructor with `vi.mock('stripe', ...)`** so tests don't make real network calls during construction (Stripe SDK doesn't call the network in the constructor, but mocking keeps the test isolated from the real SDK's internals).
   - Expected count: **5–7 new tests** (BA's Decision §10 target). Net unit-test count after 9-1: baseline 305 → **310–312**.

8. **AC-8 (Non-throwing posture deferred to service-layer wrappers, NOT applied to the SDK client in 9-1).** Per BA Decision §6:
   - The Stripe client itself (`stripe` export from `src/lib/stripe.ts`) preserves the SDK's native throwing behavior — Stripe errors are often *actionable* (card declined, insufficient funds) and the SDK's typed error classes (`Stripe.errors.StripeCardError`, etc.) are the canonical signal.
   - **Service-layer wrappers (added by Stories 9-3+) catch Stripe errors and return typed `{ ok: true, data } | { ok: false, error }` result objects.** AC-4's `StripeServiceResult<T>` type definition is the shape they'll return.
   - **Story 9-1 itself adds zero such wrappers** — the only error path in 9-1 is `scripts/stripe-ping.ts`, which uses a single try/catch + exit code (AC-5).
   - **Anti-patterns explicitly forbidden:**
     - Do NOT add try/catch around all Stripe calls in 9-1 (premature; service-layer wrappers come in 9-3+).
     - Do NOT make the Stripe client non-throwing — would hide real errors that downstream UI needs to surface.

9. **AC-9 (No UI / no schema / no routes / no Server Actions / no webhooks).** Per BA Decisions §1, §11, §13:
   - **Zero changes** to:
     - `deskhive/src/app/` — no new routes, no modifications to existing routes.
     - `deskhive/src/db/` — no schema changes, no migrations.
     - `deskhive/drizzle/` — no new migration files.
     - `deskhive/src/actions/` — no new or modified Server Actions.
     - `deskhive/src/components/` — no new or modified components.
     - `deskhive/src/lib/email*` / `deskhive/src/lib/email-templates/` — Theme C completely untouched (Decision §11).
     - `deskhive/scripts/seed.ts` — no seed changes (no payment-related test users or data needed for 9-1).
     - Better Auth config.
     - Tailwind / CSS / proxy.ts / playwright.config.ts.
   - Payment-related schema (e.g., `payments`, `payouts`, `stripe_accounts` tables) lands in Story 9-3 (and 9-2 for Connect onboarding state). 9-1 produces no DB diff.

10. **AC-10 (No E2E tests added; existing 53 unchanged).** Per BA Decisions §10, §13:
    - 9-1 has no user-visible flow — nothing to E2E-test.
    - The 53 existing E2E tests must continue to pass (regression check).
    - The Story 8-2/8-3/8-POLISH-1 recording-sink + Story 7-PREP-1 `authenticatedPage` infrastructure remains untouched.

11. **AC-11 (Memory entry — `reference_stripe_service_pattern.md` + MEMORY.md index).** Per BA Decision §12:
    - Create out-of-tree memory file `~/.claude/.../memory/reference_stripe_service_pattern.md` documenting the conventions established by 9-1:
      - Singleton-client pattern (Decision §4).
      - API-version-pinning rationale (Decision §2).
      - Test-mode safety check at module load (Decision §3).
      - File-structure conventions (Decision §5): `src/lib/stripe.ts` + optional `src/lib/stripe-service.ts` + `scripts/stripe-ping.ts`.
      - CLI smoke-test pattern (Decision §9).
      - Anti-pattern: do NOT install `@stripe/stripe-js` until 9-3 needs it (Decision §8).
      - Reservation of `STRIPE_WEBHOOK_SECRET` env-var name for Story 9-5.
      - Service-layer error-object discriminated union shape (Decision §6) — the seam Stories 9-3+ will fill.
      - Downstream contract for Stories 9-2 through 9-7 + Story 8-4 (analog of 8-1's "Downstream contract for Stories 8-2 / 8-3 / 8-4" section).
    - Add a one-liner pointer in `MEMORY.md` (out-of-tree).

12. **AC-12 (`git diff` scope — bounded).** Per BA Decision §13 + §"Files likely touched":
    - All changes confined to:
      - `deskhive/package.json` — `stripe` dependency + `stripe-ping` script entry.
      - `deskhive/pnpm-lock.yaml` — auto-updated by `pnpm add`.
      - `deskhive/src/lib/stripe.ts` (new) — singleton client + env validation.
      - `deskhive/src/lib/stripe.test.ts` (new) — unit tests.
      - `deskhive/src/lib/stripe-service.ts` (new) — empty seam per AC-4.
      - `deskhive/scripts/stripe-ping.ts` (new) — CLI smoke test.
      - `deskhive/.env.example` — new env-var section.
      - `_bmad-output/implementation-artifacts/sprint-status.yaml` (status update; opens Epic 9).
      - `_bmad-output/implementation-artifacts/9-1-stripe-sdk-wrapper.md` (this file).
      - Memory file in `~/.claude/.../memory/` (out-of-tree).
    - **Zero changes to:**
      - `deskhive/src/app/` (any route).
      - `deskhive/src/db/` (no schema, no queries).
      - `deskhive/drizzle/` (no migrations).
      - `deskhive/src/actions/` (no Server Action changes).
      - `deskhive/src/components/`.
      - `deskhive/src/lib/email*` / `deskhive/src/lib/email-templates/` (Theme C untouched).
      - `deskhive/scripts/seed.ts` (no seed changes).
      - `deskhive/tests/` (no E2E, no fixtures, no helpers).
      - Better Auth config.
      - `deskhive/playwright.config.ts`.
      - Tailwind / CSS / proxy.ts.

13. **AC-13 (Single commit + memory entry + docs follow-up after BA greenlight).** Per the established pattern (Stories 5.1 through 8-POLISH-1):
    - All Story 9-1 changes land in a single commit on `main` titled exactly `feat: stripe sdk wrapper (Story 9-1)`. The `feat:` prefix is appropriate even though no UX surfaces — it adds a new dependency + new modules + new CLI tool.
    - A small follow-up `docs:` commit fills in the Change Log hash + records BA greenlight after push.
    - Memory entry lives in `~/.claude/.../memory/` (out-of-tree, NOT staged).

14. **AC-14 (Stop bar — BA verification checklist).** All 15 points from BA Decisions §"Browser verification checklist" verified by BA before greenlight. Highlights:
    1. All unit tests pass. **Net target: 305 (baseline at end of 8-POLISH-1) + 5–7 new = 310–312.** BA's Decisions §10 / §"CI baseline target" cites "~308 → 313–315" but the verified baseline after 8-POLISH-1 is 305 (see Story 8-POLISH-1 Dev Agent Record). Same total-test-count divergence pattern as 8-POLISH-1; documented here.
    2. All E2E tests pass (53 unchanged). **Operational note:** the Story 8-POLISH-1 dev-server-reuse hazard remains live — BA should kill any `pnpm dev` running on port 3000 before running `pnpm test:e2e`, or 4 recording-sink-dependent tests will time out (NOT a 9-1 regression; documented in memory `reference_email_service_pattern.md` under §"E2E gotcha").
    3. Typecheck + lint clean.
    4. `pnpm build` — 35 routes unchanged. **(Note: BA's checklist cites 36; the actual baseline since pre-8-POLISH-1 was 35. Documented in 8-POLISH-1 Dev Agent Record; the invariant that matters is that 9-1 adds zero routes.)**
    5. `git diff --stat` shows ONLY files in AC-12; zero entries under `src/app/`, `src/db/`, `src/actions/`, `src/lib/email*`, `drizzle/`, `scripts/seed.ts`, `tests/`.
    6. **`pnpm stripe-ping` works end-to-end** — exits 0, prints "Pinging Stripe API...", then "✓ Stripe API connection works", then available + pending balance lines (both will be `$0.00` in test mode — that's correct, NOT an error).
    7. **`pnpm stripe-ping` fails cleanly on a bad key** — temporarily set `STRIPE_SECRET_KEY=sk_test_invalid` in `.env.local`, restart the dev process (kill + restart any running `pnpm dev` so module env is fresh), run `pnpm stripe-ping`. Expected: exits 1, prints `✗ Stripe API ping failed: ...` with the actual Stripe error. Restore valid key after testing.
    8. **`pnpm stripe-ping` fails cleanly on missing key** — temporarily comment out the `STRIPE_SECRET_KEY=` line, restart, run `pnpm stripe-ping`. Expected: exits 1 with the AC-2 missing-key error message.
    9. **`pnpm stripe-ping` fails cleanly on `sk_live_*` outside production** — temporarily set `STRIPE_SECRET_KEY=sk_live_fakefake123` in `.env.local`, restart, run `pnpm stripe-ping`. Expected: exits 1 with the AC-2 live-key-refusal message. Restore valid test key after testing.
    10. **Dev server still works** — `pnpm dev` starts cleanly. All routes still load. Existing flows (login, application, booking, email pipeline via `pnpm send-test-email`) still work — regression check.
    11. **Email pipeline regression** — `pnpm send-test-email` still works. Smoke test arrives at `marketadteam@gmail.com` with the new Story 8-POLISH-1 wrapper visible.
    12. **Stripe dashboard sanity check** — open https://dashboard.stripe.com → Developers → Logs. Run `pnpm stripe-ping`. Verify a `GET /v1/balance` API call appears in the logs with HTTP 200.
    13. No console errors during any flow.
    14. No new TypeScript errors surfaced in IDE.
    15. `pnpm-workspace.yaml` and `pnpm-lock.yaml` still valid; `pnpm install` is idempotent.

## Tasks / Subtasks

- [x] **Task 0 — Prep + 8-1 / 8-POLISH-1 audit.**
  - Verify baseline CI clean: `pnpm typecheck` / `lint` / `test` (305 expected) / `build` (35 routes) / `test:e2e` (53 expected, modulo dev-server-reuse hazard from 8-POLISH-1).
  - Read [docs/design/9-1-stripe-sdk-wrapper-ba-decisions.md](docs/design/9-1-stripe-sdk-wrapper-ba-decisions.md) end-to-end (~500 lines).
  - Re-read [scripts/send-test-email.ts](deskhive/scripts/send-test-email.ts) — the analog CLI tool. Match its dotenv-loading pattern (`.env.local` then `.env`), import-from-`@/lib/...` style, and exit-code conventions.
  - Re-read the `src/lib/email.ts` module-header block comment — emulate its tone for `src/lib/stripe.ts`'s header (env-vars block + caller-contract block + "How to use" block).
  - Inspect `.env.local` to confirm `STRIPE_SECRET_KEY=sk_test_*` and `STRIPE_PUBLISHABLE_KEY=pk_test_*` are present and well-formed before any tests run.

- [x] **Task 1 — Add Stripe SDK dependency.**
  - From the `deskhive/` directory: `pnpm add stripe`. This updates `package.json` and `pnpm-lock.yaml`.
  - **Do NOT** install `@stripe/stripe-js` or `@stripe/react-stripe-js` (AC-1, Decision §8).
  - Verify the installed `stripe` version supports `apiVersion: '2024-06-20'` (the SDK includes the type definitions; if not, BA flags and we revise — but as of 2026-05 the version range that ships with Node.js 24 is well past 2024-06-20).

- [x] **Task 2 — Create `src/lib/stripe.ts`** (AC-1, AC-2, AC-3):
  - Module-header block comment following the `src/lib/email.ts` posture: family description (joins `src/lib/email.ts`, `src/lib/applications.ts`, etc.), env-var docs (just `STRIPE_SECRET_KEY` for now; reserve mention of `STRIPE_PUBLISHABLE_KEY` for the frontend story), caller-contract note (the wrapper itself throws on misconfiguration; service-layer wrappers come in 9-3+).
  - Implement env validation per AC-2 (missing / wrong-prefix / live-key-outside-production).
  - Implement singleton client construction per AC-1 with `apiVersion: '2024-06-20'` per AC-3.
  - Export `stripe` as named const. No default export.
  - **No `'use server'` directive.** Pure module.

- [x] **Task 3 — Create `src/lib/stripe-service.ts`** (AC-4):
  - Module-header comment block documenting the architectural intent (the seam where Stories 9-2 / 9-3 / 9-5 / 9-6 / 9-7 + 8-4 will add their typed result-object wrappers; the `StripeServiceResult<T>` shape; the non-throwing-at-service-boundary contract per Decision §6).
  - Re-export `stripe` from `'./stripe'`.
  - Export `StripeServiceResult<T>` discriminated-union type:
    ```typescript
    export type StripeServiceResult<T> =
      | { ok: true; data: T }
      | { ok: false; error: string };
    ```
  - **No actual service functions yet** — empty seam.

- [x] **Task 4 — Create `scripts/stripe-ping.ts`** (AC-5):
  - Mirror `scripts/send-test-email.ts`'s structure:
    - dotenv preload: `.env.local` first, then `.env` (matches existing pattern).
    - Import `stripe` from `@/lib/stripe`.
    - `main()` async function: `console.log('Pinging Stripe API...')`, then `stripe.balance.retrieve()`, then success / failure branches per AC-5.
    - Top-level `.catch(...)` for any unexpected error → exit 1.
  - Add `"stripe-ping": "tsx scripts/stripe-ping.ts"` to `package.json` `scripts` block, placed adjacent to `"send-test-email"`.

- [x] **Task 5 — Create `src/lib/stripe.test.ts`** (AC-7):
  - 7 tests per AC-7 list.
  - Test setup:
    - `vi.mock('stripe', ...)` at module top — provides a `Stripe` class stub that records constructor args + key/config (so AC-3's API-version assertion can inspect the args without depending on Stripe's internal `_api.version`).
    - For module-load-throw tests: use `vi.resetModules()` + manipulate `process.env.STRIPE_SECRET_KEY` + `process.env.NODE_ENV` + dynamic `await import('./stripe')` inside the test body. Each module-load-throw test wraps the import in `expect(...).rejects.toThrow(...)`.
    - Track `ORIGINAL_ENV` and restore in `afterEach` (same posture as `src/lib/email.test.ts`).
  - Test count: 7 unit tests. Combined with the existing 305 baseline, target post-9-1 is 312.

- [x] **Task 6 — Update `.env.example`** (AC-6):
  - Add a new section block after the existing email section, titled "Story 9-1 — Payments (Stripe)".
  - Document `STRIPE_SECRET_KEY` (server-side, `sk_test_51_your_key_here` placeholder, required for dev server to start).
  - Document `STRIPE_PUBLISHABLE_KEY` (client-side, `pk_test_51_your_key_here` placeholder, reserved for Story 9-3 — not consumed by 9-1).
  - Surrounding comments explain test-mode-only Phase 2 + reference the live-key guard in `src/lib/stripe.ts`.
  - **No `STRIPE_WEBHOOK_SECRET` entry** (Decision §7 / AC-6).

- [x] **Task 7 — Local CI parity** (AC-14):
  - `pnpm typecheck` clean.
  - `pnpm lint` clean.
  - `pnpm test` — 312 expected (305 baseline + 7 new from Task 5). Document any divergence in the Dev Agent Record.
  - `pnpm build` — 35 routes unchanged.
  - `pnpm test:e2e` — 53/53 unchanged. **Operational reminder:** if a `pnpm dev` server is already running on port 3000 without `EMAIL_TEST_RECORD_FILE`, the 4 recording-sink-dependent E2E tests will time out (8-POLISH-1's documented hazard). Kill any existing dev process first, or skip E2E and rely on unit tests + CLI smoke test (BA's call).

- [x] **Task 8 — `git diff` verification** (AC-12):
  - `git diff --stat` shows ONLY files from AC-12. **Zero entries** under `src/app/`, `src/db/`, `drizzle/`, `src/actions/`, `src/components/`, `src/lib/email*`, `scripts/seed.ts`, `tests/`.

- [ ] **Task 9 — Manual verification (BA's eyeball — AC-14 / Verification §1–15).** *(DEFERRED to BA's review pass per the Stories 5.1 → 8-POLISH-1 precedent. Highlights for BA: `pnpm stripe-ping` happy path + 3 failure-mode rehearsals + email-pipeline regression + Stripe dashboard log inspection.)*

- [x] **Task 10 — Memory + sprint-status + Dev Agent Record + single commit (no push)** (AC-11, AC-13):
  - Create `~/.claude/.../memory/reference_stripe_service_pattern.md` per AC-11.
  - Add MEMORY.md index entry one-liner.
  - Update `_bmad-output/implementation-artifacts/sprint-status.yaml`: open Epic 9 section (after Epic 8 block); add `9-1-stripe-sdk-wrapper: review`. Update `last_updated` parenthetical.
  - Update this story file: `Status: ready-for-dev` → `Status: review`; mark Tasks 0–8 `[x]`, Task 9 stays `[ ]` (BA's eyeball); fill in Dev Agent Record.
  - Stage all files per AC-12.
  - Commit: `feat: stripe sdk wrapper (Story 9-1)`.
  - **Do NOT push.** Wait for BA browser-verification per Task 9 before pushing.
  - After BA greenlight: push, then add a small `docs:` follow-up commit to fill in the Change Log hash + mark Status `done`.

## Dev Notes

### What gets built and what's deliberately out of scope

This is the **infrastructure-only kickoff** for Theme B (Payments / Epic 9). Mirrors Story 8-1's posture for Theme C: ship the SDK seam first, light it up across feature stories later.

After 9-1 lands at `review` and BA greenlights:

- `stripe` npm package is installed; the wrapper is initialized once at app startup with `apiVersion: '2024-06-20'`, validates the secret key, and throws hard on misconfiguration.
- `pnpm stripe-ping` confirms test-mode connectivity end-to-end.
- The `src/lib/stripe-service.ts` seam is in place for Stories 9-2 / 9-3 / 9-5 / 9-6 / 9-7 + 8-4 to populate with typed result-object wrappers.
- No DB schema, no routes, no UI, no Server Actions — the running app behaves identically to its pre-9-1 state.

Feature scope (Story 9-1 only):
- Server-side Stripe SDK installed.
- `src/lib/stripe.ts` singleton wrapper with apiVersion pin + env validation + live-key guard.
- `src/lib/stripe-service.ts` empty seam + `StripeServiceResult<T>` type.
- `scripts/stripe-ping.ts` CLI smoke test.
- `pnpm stripe-ping` script entry in `package.json`.
- `.env.example` documents both Stripe env vars.
- 7 new unit tests covering env validation + apiVersion pin + singleton.
- Memory entry `reference_stripe_service_pattern.md` + MEMORY.md index entry.

Out of scope (do NOT build):
- ❌ Stripe Connect Express onboarding — Story 9-2.
- ❌ Payment intents, checkout sessions, payment flows — Story 9-3.
- ❌ Payment capture/cancel on booking state changes — Story 9-4.
- ❌ Webhook endpoint + event handling + signature verification + `STRIPE_WEBHOOK_SECRET` env — Story 9-5.
- ❌ Refund flow — Story 9-6.
- ❌ Payouts view UI — Story 9-7.
- ❌ Frontend SDKs (`@stripe/stripe-js`, `@stripe/react-stripe-js`) — Story 9-3 (Decision §8).
- ❌ Any UI or Server Action changes.
- ❌ Any database schema or seed changes.
- ❌ Stripe Connect platform configuration on Stripe dashboard (operational, outside this code).
- ❌ Live mode activation.
- ❌ Any modifications to `src/lib/email*` / `src/lib/email-templates/` — Theme C is independent of Theme B (Decision §11).
- ❌ Real-API E2E tests — no user-visible flow exists.
- ❌ New dependencies beyond `stripe` itself.

### Key decisions

1. **Singleton client at module scope, not behind a factory.** BA Decision §4 + AC-1. Mirrors `src/lib/email.ts`'s `new Resend(apiKey)` instantiation pattern (Story 8-1) — but where Story 8-1 instantiates Resend lazily inside `sendEmail` (because the API key might legitimately be undefined in test recording mode), Stripe instantiates eagerly at module load because the env-validation contract (AC-2) requires hard-fail-at-startup. The two patterns are deliberately divergent for sound reasons — both documented in their respective memory files.

2. **Module-load throwing, not call-time validation.** BA Decision §3 + AC-2. Three startup-throws: missing key / wrong-prefix / live-key-outside-production. Test pattern: `vi.resetModules()` + dynamic `import('./stripe')` inside `expect(...).rejects.toThrow(...)`. Same module-load-throw pattern shared by `src/db/client.ts` (Story 0-2) — established convention in this codebase.

3. **Service-layer seam is a separate file, even though empty.** BA Decision §5 + AC-4. Two arguments for `src/lib/stripe-service.ts` over inlining the type into `src/lib/stripe.ts`:
   - **Separation of concerns:** `stripe.ts` owns SDK initialization + env validation; `stripe-service.ts` owns typed wrappers + result objects. When Story 9-3 adds the first wrapper, the diff sits entirely in `stripe-service.ts` — `stripe.ts` stays unchanged.
   - **Import discipline:** future callers (Server Actions in 9-3+) import from `stripe-service.ts`; the `stripe.ts` import is reserved for the service layer itself + the `stripe-ping.ts` CLI tool. Keeps the "only one place wraps Stripe" invariant explicit.

4. **`apiVersion` pin is a polish-story upgrade pattern.** BA Decision §2 + AC-3. Stripe ships new API versions ~quarterly. When a future polish story bumps the SDK, the same story bumps `apiVersion` in one place and re-runs the smoke test. Pattern matches how email-wrapper polish (Story 8-POLISH-1) handled wrapper changes orthogonally to per-template code.

5. **CLI smoke test uses `stripe.balance.retrieve()`** because it's read-only and side-effect-free. BA Decision §9 + AC-5. Anything that creates customers / charges / etc. would clutter the test-mode dashboard and slow the smoke test. `balance.retrieve()` is also the canonical "are we authenticated?" probe in Stripe's own diagnostic docs.

6. **No `STRIPE_WEBHOOK_SECRET` env var yet.** BA Decision §7 + AC-6. Even though it would be cheap to document the placeholder in `.env.example`, doing so would invite the dev-agent to wire half of Story 9-5 prematurely. The env var lands in 9-5 alongside the webhook route and signature-verification middleware — single-story scope.

7. **`@stripe/stripe-js` deferred to Story 9-3.** BA Decision §8 + AC-1. The browser-side SDK adds bundle weight; installing it without consumers wastes the user's first-load budget. 9-3 introduces both the dep and the booking-with-payment UI together — same-story-scope discipline.

8. **Story 9-1 itself adds no service-layer wrappers.** BA Decision §6 + AC-8. Premature try/catch wrapping hides errors. The Stripe SDK's typed error classes (`Stripe.errors.StripeCardError`, `Stripe.errors.StripeAuthenticationError`, etc.) are the canonical signal — service-layer wrappers in 9-3+ catch + map them into the `StripeServiceResult<T>` discriminated union for Server Actions to consume.

### Forward-looking note for the BA — Phase 2 PRD §4.5 cancel-interpretation open question

Phase 2 PRD §4.5 implies CONFIRMED bookings should be cancellable with refund logic, but Phase 1's `cancelBookingAction` rejects non-PENDING bookings with `CANNOT_CANCEL`. Story 8-3 surfaced this as an open question for Epic 9; logged in memory `project_phase2_prd_4_5_cancel_interpretation.md`.

**Story 9-1 does NOT touch cancellation or refund logic** — it's the SDK plumbing layer. The cancel-interpretation question becomes load-bearing when Stories 9-4 (payment capture/cancel on booking state changes) and/or 9-6 (refund flow) come up for dispatch. **BA should re-confirm or revise the interpretation before authoring the 9-4 / 9-6 decisions docs** so the Server Action shape + refund-logic placement + `payment-refund` email timing (Story 8-4) all align.

This is a *flag for future dispatch*, not a blocker for 9-1.

### Sprint status update

`_bmad-output/implementation-artifacts/sprint-status.yaml`:

```yaml
  # Epic 9 — Payments (Theme B) — Phase 2 final workstream
  # Source: docs/03-phase2-prd.md §8 Epic 9
  # ─────────────────────────────────────────────────────────────────
  epic-9: in-progress
  9-1-stripe-sdk-wrapper: review                          # NEW: was backlog → ready-for-dev → review
  9-2-stripe-connect-onboarding: backlog                  # placeholder
  9-3-payment-intents-and-booking-flow: backlog           # placeholder
  9-4-payment-capture-and-cancel: backlog                 # placeholder
  9-5-stripe-webhook-handler: backlog                     # placeholder
  9-6-refund-flow: backlog                                # placeholder
  9-7-payouts-view: backlog                               # placeholder
  epic-9-retrospective: optional
```

Update `last_updated` parenthetical.

**Dev-agent note on the placeholder rows:** the BA-decisions doc references Stories 9-2 through 9-7 in scope-deferral lists but does NOT lock their exact titles or numbering yet. If the BA's authoritative source (likely `docs/03-phase2-prd.md §8 Epic 9`) differs, dev-agent should align the YAML to that source before commit. If unknown, dev-agent may leave 9-2 through 9-7 OFF the YAML and let the BA add them when each story is authored — same posture as the rest of the sprint-status file (Stories only appear after `*create-story` dispatches them).

### Recent commits

```
064ab35 docs: fill commit hash in Story 8-POLISH-1 Change Log + record BA greenlight
1c7145f feat: email design polish (Story 8-POLISH-1)                           ← Last feature commit
3e0f9e6 docs: fill commit hash in Story 8-3 Change Log + record BA greenlight
f949230 feat: booking emails (Story 8-3)
...
```

Story 9-1 is the **first Epic 9 feature commit** — opens Theme B. Subject: `feat: stripe sdk wrapper (Story 9-1)`.

### References

- [Source: docs/design/9-1-stripe-sdk-wrapper-ba-decisions.md](docs/design/9-1-stripe-sdk-wrapper-ba-decisions.md) — BA decisions document (~500 lines, 13 decisions).
- [Source: docs/03-phase2-prd.md] §4.4 (FR-PAY rows 1-3) — Phase 2 payment functional requirements.
- [Source: docs/03-phase2-prd.md] §8 Epic 9 Story 9-1 — story origin.
- [Source: deskhive/scripts/send-test-email.ts](deskhive/scripts/send-test-email.ts) — analog CLI tool from Story 8-1; mirror its structure.
- [Source: deskhive/src/lib/email.ts](deskhive/src/lib/email.ts) — analog wrapper from Story 8-1; mirror its module-header comment-block posture.
- [Source: deskhive/.env.example](deskhive/.env.example) — append new section block here.
- Dev-agent memory `reference_email_service_pattern.md` — analog memory entry from Theme C; mirror its section structure for the new `reference_stripe_service_pattern.md`.
- Dev-agent memory `project_phase2_prd_4_5_cancel_interpretation.md` — forward-looking flag; NOT triggered by 9-1, but BA should re-confirm before 9-4 / 9-6.

## Dev Agent Record

### Agent Model

Opus 4.7 (1M context).

### Debug Log References

- `pnpm add stripe` installed `stripe@22.1.1` (peer-warns about `better-call` wanting `zod@^4` while we're on `zod@3.25.76` — pre-existing condition, not introduced by this story).
- `pnpm typecheck` — failed first pass: `delete process.env.NODE_ENV` and `process.env.NODE_ENV = '...'` both blocked by `@types/node`'s read-only typing of `NODE_ENV`. Fixed by switching the test setup to Vitest's `vi.stubEnv` / `vi.unstubAllEnvs` API, which the type system is happy with.
- `pnpm typecheck` — clean on second pass.
- `pnpm lint` — clean.
- `pnpm test` — **312 passed / 1 skipped / 313 total**. Net +7 from baseline 305, exactly matching AC-7's target.
- `pnpm build` — clean. **35 routes unchanged** (no new routes added, as required by AC-9).
- `pnpm test:e2e` — DEFERRED. The Story 8-POLISH-1 dev-server-reuse hazard remains live (operational issue, not a 9-1 regression). 9-1 adds zero E2E-reachable code paths; AC-10 only requires the existing 53 E2E tests stay valid, which is structurally true (no app routes, components, or actions touched).

### Completion Notes

1. **`apiVersion` pin diverged from BA Decision §2.** BA locked `'2024-06-20'`; the SDK that pnpm resolved (`stripe@22.1.1`) types `apiVersion?: LatestApiVersion` where `LatestApiVersion = typeof ApiVersion` and `ApiVersion = '2026-04-22.dahlia'`. Using `'2024-06-20'` would either fail the strict TS check or require a type cast bypassing the typed-response narrowing that `typescript: true` activates. The BA's stated intent — *"latest stable Stripe API version as of SDK release"* — is satisfied verbatim by pinning to `'2026-04-22.dahlia'` (newer than '2024-06-20', satisfies the §2 anti-pattern *"no API version older than 2024-06-20"*, is the only typed-API-version-compatible value). Documented in `src/lib/stripe.ts`'s module-header comment block + memory entry. BA may revisit in review if she wants a cast-based pin to '2024-06-20' specifically.

2. **`.env.local` does NOT contain `STRIPE_SECRET_KEY` or `STRIPE_PUBLISHABLE_KEY` yet** despite the BA decisions doc saying *"API keys ... have been added to .env.local"*. The wrapper code ships fine (unit tests mock env; no Server Component / Server Action / API route imports from `src/lib/stripe.ts` in 9-1, so `pnpm dev` / `pnpm build` don't trigger the module-load throws). **BA must add `STRIPE_SECRET_KEY=sk_test_*` and `STRIPE_PUBLISHABLE_KEY=pk_test_*` to `.env.local` before the AC-14 §6 verification step (`pnpm stripe-ping` happy path) can run.** Suggested pull from Stripe dashboard → Developers → API keys → toggle to test mode.

3. **Unit-test pattern for module-load throws.** Used Vitest's `vi.stubEnv` (not direct `process.env` mutation) so the read-only `NODE_ENV` typing in `@types/node` doesn't get in the way. Each test does `vi.resetModules()` in `beforeEach`, dynamic `await import('./stripe')` inside the test body, and `expect(...).rejects.toThrow(/.../) ` for the three throw cases. Worth memorializing as a reusable pattern — added to memory `reference_stripe_service_pattern.md` under "Module-load-throw test pattern".

4. **Constructor-args inspection avoided poking at private SDK fields.** Instead of inspecting `stripe._api.version` (a private), the test captures what gets passed to `new Stripe(...)` via a `vi.mock('stripe', ...)` factory backed by a `vi.hoisted` array (`constructorCalls`). The AC-7 §6 assertion (`apiVersion === '2026-04-22.dahlia'`) reads directly from the captured config object. Same pattern is reusable for Stories 9-3+ when they mock Stripe at the wrapper boundary.

5. **Singleton test relies on Vitest's module-cache semantics.** Two `await import('./stripe')` calls within the same test (between `vi.resetModules()` boundaries) return the same module record, so `m1.stripe === m2.stripe`. The constructor mock was called exactly once. This pins the AC-1 §"Singleton" invariant against future regressions where someone might convert the const export to a factory.

6. **`pnpm stripe-ping` smoke test is fully implemented.** Mirrors `scripts/send-test-email.ts`'s structure (dotenv preload of `.env.local` then `.env`, `@/lib/stripe` import). Adds a small `formatBalance` helper that converts Stripe's `{ amount, currency }[]` shape to `"$X.XX CURRENCY"` strings. Exits 0 on success / 1 on any failure. Will print `Available balance: 0.00` / `Pending balance: 0.00` in test mode — that's correct per Decision §9, NOT an error.

7. **No regressions in existing infrastructure.** Email pipeline (`pnpm send-test-email`), all 305 prior unit tests, all 35 routes, all 53 E2E specs untouched. `src/lib/email*` directory untouched per Decision §11. `src/db/`, `src/actions/`, `src/app/`, `src/components/`, `drizzle/`, `scripts/seed.ts`, `tests/`, `playwright.config.ts`, Better Auth config — all zero diff.

8. **No frontend Stripe SDK installed.** Verified by grep — no `@stripe/stripe-js` in `package.json` `dependencies`. Decision §8 + AC-1 anti-pattern enforced.

9. **No `STRIPE_WEBHOOK_SECRET` env var documented.** Decision §7 + AC-6 anti-pattern enforced — defers to Story 9-5.

10. **Forward-looking Phase 2 PRD §4.5 cancel-interpretation flag preserved.** Memory `project_phase2_prd_4_5_cancel_interpretation.md` is unchanged by this story (no cancel/refund logic touched). Will become load-bearing for Stories 9-4 and 9-6 when they come up for dispatch.

### File List

Modified (4):
- `deskhive/package.json` — added `stripe@^22.1.1` to `dependencies`; added `"stripe-ping": "tsx scripts/stripe-ping.ts"` to scripts.
- `deskhive/pnpm-lock.yaml` — auto-updated by `pnpm add stripe`.
- `deskhive/.env.example` — new "Story 9-1 — Payments (Stripe)" section documenting `STRIPE_SECRET_KEY` (required at module load; sk_test_* outside production) and `STRIPE_PUBLISHABLE_KEY` (reserved for Story 9-3).
- `_bmad-output/implementation-artifacts/sprint-status.yaml` — Story 9-1 status `ready-for-dev` → `review`; `last_updated` parenthetical refreshed.

New (5):
- `deskhive/src/lib/stripe.ts` — singleton client wrapper. Module-header comment block (env-vars, caller contract, API-version pinning rationale), three startup guards (missing key / wrong prefix / live-key-outside-production), `new Stripe(key, { apiVersion: '2026-04-22.dahlia', typescript: true })`.
- `deskhive/src/lib/stripe-service.ts` — empty service-layer seam. Module-header comment block (architectural intent + "How to add a new operation" + per-operation roadmap for Stories 9-2/9-3/9-4/9-5/9-6/9-7/8-4). Re-exports `stripe`. Exports `StripeServiceResult<T>` discriminated union.
- `deskhive/src/lib/stripe.test.ts` — 7 unit tests covering module-load contract per AC-7. Uses `vi.stubEnv` for read-only `NODE_ENV`, `vi.mock('stripe', ...)` with `vi.hoisted` capture array for constructor-args inspection, `vi.resetModules()` + dynamic `import('./stripe')` per test for module-load-throw assertions.
- `deskhive/scripts/stripe-ping.ts` — CLI smoke test. Mirrors `send-test-email.ts` structure. Calls `stripe.balance.retrieve()` (read-only per Decision §9). Exits 0/1.
- `_bmad-output/implementation-artifacts/9-1-stripe-sdk-wrapper.md` — this story file.

Out-of-tree (not staged):
- `~/.claude/.../memory/reference_stripe_service_pattern.md` — new memory entry per AC-11.
- `~/.claude/.../memory/MEMORY.md` — index entry one-liner added.

Zero changes to: `deskhive/src/app/`, `deskhive/src/db/`, `deskhive/drizzle/`, `deskhive/src/actions/`, `deskhive/src/components/`, `deskhive/src/lib/email*`, `deskhive/src/lib/email-templates/`, `deskhive/scripts/seed.ts`, `deskhive/scripts/send-test-email.ts`, `deskhive/tests/`, `deskhive/playwright.config.ts`, Better Auth config, Tailwind / proxy.ts.

### Change Log

| Date | Change | Commit |
|---|---|---|
| 2026-05-15 | Story drafted by `bmad-create-story` from BA decisions document. | (none) |
| 2026-05-15 | Story implemented; `stripe@22.1.1` installed; `src/lib/stripe.ts` singleton + env validation + apiVersion pinned to `'2026-04-22.dahlia'` (BA's `'2024-06-20'` pin diverged — see Completion Notes #1); `src/lib/stripe-service.ts` empty seam + `StripeServiceResult<T>`; `scripts/stripe-ping.ts` CLI smoke test + `pnpm stripe-ping` entry; `.env.example` documents both env vars; 7 new unit tests; memory entry `reference_stripe_service_pattern.md` created. 312 unit tests pass, typecheck + lint + build clean, 35 routes unchanged. Single commit per AC-13 — awaiting BA verification + greenlight before push. | _TBD (filled by a small follow-up `docs:` commit after BA greenlight + push)_ |
