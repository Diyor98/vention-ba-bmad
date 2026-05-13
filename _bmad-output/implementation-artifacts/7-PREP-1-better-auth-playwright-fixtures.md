# Story 7-PREP-1: Better Auth Playwright Fixtures + Targeted E2E Migration

Status: review

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a **dev-agent writing E2E coverage for authenticated flows**,
I want **a Playwright `authenticatedPage(role)` fixture that creates Better Auth sessions server-side and sets the cookie on the browser context**,
so that **I can write authenticated E2E tests in a single line of setup instead of either (a) skipping the test, (b) navigating to `/login` and form-filling, or (c) deferring to a BA browser walk — closing the load-bearing cross-tenant security gap from Story 7-5 Decision §8 and unblocking Theme C's email-test coverage before Epic 8 ships.**

> Story 7-PREP-1 is a **prep story** — sits between Theme A close (Story 7-5) and Theme C start (Story 8-1). Source of truth: [docs/design/7-PREP-1-better-auth-playwright-fixtures-ba-decisions.md](docs/design/7-PREP-1-better-auth-playwright-fixtures-ba-decisions.md). All decisions locked.

> **Infrastructure-only with one bounded seed exception.** Zero production-code changes (BA Decision §9 forbids silent prod fixes; if a prod bug surfaces, escalate). New code lives in `tests/`. Memory entry codifies the fixture API + "authenticated-first by default" principle for Themes B/C.

> **Bounded Decision §10 exception (BA-approved 2026-05-13 pre-dispatch):** this prep story adds **one** fresh Guest seed user (`guest@deskhive.local` / `GuestPass1!`, no application) for E2E State A coverage; otherwise the seed script is unchanged. The exception is bounded to this single user — no other seed additions, no schema changes, no application/booking seed changes. Rationale (from BA): "paying down test debt is the point of this story; leaving a weaker assertion in place because of a self-imposed rule defeats the purpose."

> **The cross-tenant test (Decision §4) is the load-bearing AC.** Story 7-5 Decision §8 demanded automated coverage for "SPACE_OWNER tries to navigate to another owner's space → soft-redirect, no data leak." The BA browser walk skipped it. This story closes that gap.

> **`'fresh-owner'` role mapping — small BA alignment.** Decision §1 names `ihtiyor@mail.com` as the "fresh-approved owner, zero spaces" subject. That user was created manually during the Story 7-4 BA browser walk and is NOT in the seed. The seeded equivalent — `applicant3@deskhive.local`, promoted to SPACE_OWNER via Story 7-4's APPROVED-application seed, owns zero spaces (Story 7-5 only assigned a seeded space to `owner@deskhive.local`) — fulfills the same role. This story maps `'fresh-owner'` → `applicant3@deskhive.local` and notes the alignment in fixture comments + memory entry.

## Acceptance Criteria

> Source: BA Decisions document, Decisions 1–10 + Browser verification checklist.

1. **AC-1 (`authenticatedPage(role)` fixture API + 4 role shorthands + arbitrary-email variant).** Per BA Decisions §1:
   - New file `tests/fixtures/authenticated-page.ts`. Exports an extended `test` (and `expect`) following Playwright's [test.extend](https://playwright.dev/docs/test-fixtures) idiom so specs can destructure `{ authenticatedPage }` directly.
   - Signature:
     ```ts
     authenticatedPage(role: 'guest' | 'owner' | 'admin' | 'fresh-owner'): Promise<Page>
     authenticatedPage({ email: string }): Promise<Page>
     ```
   - **No password parameter** (Decision §1). Seed-user credentials live in a fixture-internal `SEED_CREDENTIALS` map; tests never pass passwords.
   - **Locked role-mapping table** (BA-approved pre-dispatch):

     | Role | Seed user | Credentials | State |
     |---|---|---|---|
     | `'guest'` | `guest@deskhive.local` | `Guest1!` | GUEST, no application (NEW — see AC-2) |
     | `'owner'` | `owner@deskhive.local` | `SpaceOwner1!` | SPACE_OWNER, owns `Seeded Owner Coworks` |
     | `'admin'` | `admin@deskhive.local` | `SuperAdmin1!` | SUPER_ADMIN |
     | `'fresh-owner'` | `applicant3@deskhive.local` | `Applicant3!` | SPACE_OWNER, zero spaces (BA alignment vs §1's `ihtiyor@mail.com` placeholder — applicant3 is the seeded equivalent) |

   - Arbitrary-email variant: when called with `{ email }`, the fixture looks up the password from the same `SEED_CREDENTIALS` map by email — if the email isn't in the map, throw a clear error (e.g., `Cannot create session for non-seed user: ${email}`). This prevents tests from accidentally targeting non-seed users (which would need new seed entries — out of scope beyond the AC-2 bounded exception).

2. **AC-2 (Seed user addition — bounded Decision §10 exception).** Per BA approval 2026-05-13 pre-dispatch:
   - **Add one new seed user** to [scripts/seed.ts](deskhive/scripts/seed.ts):
     - Email: `guest@deskhive.local`
     - Password: `Guest1!`
     - Full name: `Test Guest`
     - Role: `GUEST` (Better Auth default — no role promotion)
     - **No application seeded** for this user — they remain a fresh Guest. This is what makes the user useful for State A E2E coverage; any application would push them into State B.
   - **Seed delta shape:**
     ```ts
     // scripts/seed.ts — add to main() after the SPACE_OWNER seed, before the
     // applicants block:
     const SEED_GUEST_EMAIL = 'guest@deskhive.local';
     const SEED_GUEST_PASSWORD = 'GuestPass1!';  // 11 chars — bumped from `Guest1!` (7 chars) to satisfy Better Auth's 8-char minimum + src/lib/validation/auth.ts:9
     const SEED_GUEST_FULL_NAME = 'Test Guest';

     await seedUser({
       email: SEED_GUEST_EMAIL,
       password: SEED_GUEST_PASSWORD,
       fullName: SEED_GUEST_FULL_NAME,
       role: 'GUEST',
     });
     // No application seeded for this user — they remain fresh Guest for
     // Story 7-PREP-1's State A E2E coverage.
     ```
   - **Idempotent** via the existing `seedUser` helper's email-exists check (lines 56-65). Re-running the seed is a no-op.
   - **README update:** one line addition under the "Seeded accounts" section listing the new user with its purpose: `guest@deskhive.local` / `GuestPass1!` — plain Guest, no application (for E2E State A coverage).
   - **Verify the full seed credential set** matches what the fixture's `SEED_CREDENTIALS` map will hold:
     - SUPER_ADMIN: `admin@deskhive.local` / `SuperAdmin1!`
     - SPACE_OWNER: `owner@deskhive.local` / `SpaceOwner1!`
     - Fresh GUEST (NEW): `guest@deskhive.local` / `GuestPass1!`
     - 4 applicants: `applicant{1-4}@deskhive.local` / `Applicant{1-4}!` (applicant1=PENDING, applicant2=PENDING, applicant3=APPROVED→SPACE_OWNER, applicant4=REJECTED)
   - **The four applicants stay in the fixture's arbitrary-email map** so tests can target them directly when state-coupling matters (e.g., AC-6 targets applicant1 with their PENDING application; AC-8 targets applicant2 with their CONFIRMED booking).
   - **No other seed additions in this story.** The bounded exception is one user only.

3. **AC-3 (Session creation bypasses the login form — direct Better Auth integration, no backdoor route).** Per BA Decisions §2 + §10:
   - **No new production routes.** No `/api/test/login`. The fixture talks to Better Auth from the test process. **Dev-agent picks** one of two approaches:
     - **(A) `auth.api.signInEmail` direct call from the fixture (recommended).** Import `auth` from `@/lib/auth/config` in the fixture file, call `auth.api.signInEmail({ body: { email, password }, asResponse: true })` to get a `Response` with Set-Cookie headers (the same path `/api/auth/login` uses). Parse the Set-Cookie header, extract the session token cookie, and feed it into `context.addCookies(...)`. Pro: uses the production auth API exactly as `/api/auth/login` does — single seam of truth. Con: requires importing `@/lib/auth/config` into the test process (already done by `scripts/seed.ts`, so the DB + config plumbing already exists for non-Next.js callers).
     - **(B) Direct insert into `sessionTable`.** Generate a UUID session token, insert into `sessionTable` with `userId` + `token` + `expiresAt`, set the matching cookie on the Playwright context. Pro: zero password handling, even simpler. Con: relies on knowing Better Auth's exact cookie name + token format; if Better Auth versions change those, the fixture breaks silently. Higher coupling to internal details.
   - **Recommendation: (A)** — the production endpoint already uses `auth.api.signInEmail`; the fixture should too. The single seam minimizes drift risk.
   - **If neither approach is viable** (e.g., Better Auth's API signature has changed or doesn't expose `signInEmail` as expected), escalate to BA before adding a backdoor route or installing a new package (Decision §10).
   - **Helper file:** the actual session-creation logic lives in `tests/fixtures/auth-helpers.ts` (separate from the fixture entry-point `authenticated-page.ts`). Pure function: `createSessionCookie(email, password): Promise<{ name: string; value: string; expires: number }>`. Easier to test in isolation and reuse if any future story (e.g., Theme C's email tests) needs the raw cookie without the Page wrapper.

4. **AC-4 (Fixture registration in `playwright.config.ts` — minimal touch).** Per BA Decision §1:
   - Playwright's `test.extend(...)` pattern handles fixture composition at the spec level — the spec file imports `test` from `tests/fixtures` (instead of from `@playwright/test`) and the extended `test` already has `authenticatedPage` in scope.
   - **No changes to `playwright.config.ts` are necessarily required** — the extension is per-spec. **But verify by running the suite once with the new fixture**: if Playwright can't auto-discover or there's a TS resolution issue, that's the only legitimate reason to touch the config.
   - **Strongly preferred:** zero changes to `playwright.config.ts`. The fixture is imported per-spec; the config stays Phase 1 vanilla.

5. **AC-5 (Migrate `tests/e2e/owner-routes.spec.ts` — add cross-tenant test + 1 authenticated case).** Per BA Decisions §3 (item 3) + §4 (**non-negotiable**):
   - Keep all 5 existing unauthenticated redirect tests (Decision §6).
   - **Add cross-tenant test** (the load-bearing AC, verbatim from BA Decision §4):
     ```ts
     test("owner cannot access another owner's space via direct URL", async ({ authenticatedPage }) => {
       const page = await authenticatedPage('fresh-owner');  // applicant3@deskhive.local (BA alignment note)
       // The seeded owner's space ID: query at runtime by name marker
       // 'Seeded Owner Coworks' (Story 7-5 seed Decision §10) — cuid-style IDs aren't predictable.
       const ownerSpaceId = await getSeededOwnerSpaceId();
       await page.goto(`/owner/spaces/${ownerSpaceId}`);
       await expect(page).toHaveURL('/owner/spaces');
       await expect(page.getByText(/haven['’]t listed a space yet/i)).toBeVisible();
     });
     ```
   - `getSeededOwnerSpaceId()` is a tiny helper in `tests/fixtures/seed-helpers.ts`: queries the DB for the space named `'Seeded Owner Coworks'` and returns its id. If the seed hasn't run, throws a clear error.
   - **Add at least 1 more authenticated case**: authenticated owner sees their own space row at `/owner/spaces` (positive case alongside the cross-tenant negative case). Example:
     ```ts
     test('owner sees their own spaces at /owner/spaces', async ({ authenticatedPage }) => {
       const page = await authenticatedPage('owner');
       await page.goto('/owner/spaces');
       await expect(page.getByText('Seeded Owner Coworks')).toBeVisible();
     });
     ```
   - **Net spec count after migration:** 5 unauthenticated + 2 authenticated = **7 tests minimum** (was 5).

6. **AC-6 (Migrate `tests/e2e/admin-applications.spec.ts` — add 1+ authenticated case).** Per BA Decisions §3 (item 2):
   - Keep the 2 existing unauthenticated redirect tests.
   - **Add at least one authenticated case.** Recommended: authenticated admin lists applications and verifies a known seeded application is visible. Example:
     ```ts
     test('admin sees seeded applications in the list', async ({ authenticatedPage }) => {
       const page = await authenticatedPage('admin');
       await page.goto('/admin/applications');
       // Story 7-4 seed creates a PENDING application for applicant1@deskhive.local
       await expect(page.getByText('Anna Bergstrom')).toBeVisible();
     });
     ```
   - **Approve/reject flow tests are bonus** (the BA Decision §3 says "approves a PENDING application → toast appears" is welcome but the AC bar is "at least 1 authenticated case"). Adding the approve test means mutating seed state — coordinate with AC-9 (mutation discipline).
   - **Net spec count after migration:** 2 unauthenticated + ≥1 authenticated = **≥3 tests** (was 2).

7. **AC-7 (Migrate `tests/e2e/become-a-host.spec.ts` — add State A + State B authenticated cases).** Per BA Decisions §3 (item 1) — now unblocked by the AC-2 fresh-Guest seed addition:
   - Keep the 2 existing unauthenticated tests (Decision §6).
   - **Add State A case** (fresh Guest → form visible):
     ```ts
     test('fresh Guest with no application sees State A apply form', async ({ authenticatedPage }) => {
       const page = await authenticatedPage('guest');  // guest@deskhive.local, no application
       await page.goto('/become-a-host');
       // State A: the apply form is visible (Story 7-3 State A — no PENDING/APPROVED/REJECTED app).
       await expect(page.getByRole('heading', { name: /become a space owner/i })).toBeVisible();
       await expect(page.getByLabel(/business name/i)).toBeVisible();
     });
     ```
   - **Add State B case** (applicant1 with PENDING application → "under review" banner):
     ```ts
     test('Guest with PENDING application sees State B (under review)', async ({ authenticatedPage }) => {
       const page = await authenticatedPage({ email: 'applicant1@deskhive.local' });
       await page.goto('/become-a-host');
       // State B: applicant1 has a PENDING application (Story 7-4 seed).
       await expect(page.getByText(/under review/i)).toBeVisible();
     });
     ```
   - **Optional State A → submit → State B end-to-end** (welcome but mutates seed state — see AC-9 mutation discipline). If included, the test must clean up by deleting the new application row in `afterAll` so re-runs stay deterministic. **Recommendation: ship without** for v1 — the two state assertions above already prove the fixture + state branching; the full submit flow can land in a follow-up that brings DB reset infrastructure.
   - **Net spec count after migration:** 2 unauthenticated + 2 authenticated = **4 tests minimum** (was 2). Adding the optional submit flow would make it 5.

8. **AC-8 (Migrate `tests/e2e/bookings.spec.ts` — add 1+ authenticated case OR document why not feasible).** Per BA Decisions §3 (item 4):
   - Phase 1 `bookings.spec.ts` currently has 5 unauthenticated tests (4 API 401 checks + 1 page redirect).
   - **Best-effort: add at least one authenticated case.** Recommended: authenticated Guest visits `/my-bookings` and sees their seeded bookings (the Story 7-5 seed creates bookings for `applicant1`, `applicant2`, `applicant4`). Example:
     ```ts
     test('Guest sees their own bookings at /my-bookings', async ({ authenticatedPage }) => {
       const page = await authenticatedPage({ email: 'applicant2@deskhive.local' });
       await page.goto('/my-bookings');
       // Story 7-5 seed creates a CONFIRMED booking by applicant2 on Seeded Owner Coworks
       await expect(page.getByText('Seeded Owner Coworks')).toBeVisible();
     });
     ```
   - If this proves too brittle (seed-coupling concerns), document the trade-off and ship without it — the cross-tenant test (AC-5) is the only **non-negotiable** new authenticated case. Decision §3 says "at least 5 new authenticated E2E cases total across the migrated specs"; AC-5 already provides 2.

9. **AC-9 (Mutation discipline — no new database reset infrastructure).** Per BA Decision §5:
   - Migrated tests **read** from seeded state by default. Tests that read are safe to run in any order.
   - Migrated tests that **mutate** (e.g., approve an application via `/admin/applications/[id]`) must either:
     - Clean up after themselves (e.g., manually update the row back to PENDING), OR
     - Be carefully ordered so one test's mutation is acceptable as setup for the next, OR
     - Use a unique seeded resource that no other test touches (e.g., approve applicant2's PENDING application, but never approve applicant1's because BA browser walks may rely on it being PENDING)
   - **No `globalSetup` reset, no per-test rollback, no database snapshot/restore in this story.** That's Phase 3+ territory.
   - **Recommendation: minimize mutation in this story.** Lean on read-heavy assertions (list views, state-branch detection). Save mutation testing for a future story that lands the DB reset infrastructure.

10. **AC-10 (Hard count target — at least 5 new authenticated E2E cases across the migrated specs).** Per BA Decisions §3 + §7:
    - AC-5 contributes 2 (cross-tenant + owner-sees-own-spaces).
    - AC-6 contributes ≥1.
    - AC-7 contributes 2 (State A + State B — unblocked by AC-2 fresh-Guest seed).
    - AC-8 contributes ≥1 (best-effort; ≥0 if not feasible).
    - **Total: ≥6 new authenticated E2E cases** (the BA-locked floor is 5; AC-2's seed addition lifts the achievable floor to 6). More is fine.
    - Baseline E2E count after Story 7-5: **40**. Target after 7-PREP-1: **46–50** (+6 minimum across AC-5/6/7/8; bonus tests welcome).

11. **AC-11 (No production code changes — `git diff` verification).** Per BA Decisions §9 + Browser verification §5:
    - All changes confined to:
      - `deskhive/tests/` (new fixtures + spec migrations)
      - `deskhive/tests/README.md` (new doc, see AC-12)
      - `deskhive/scripts/seed.ts` (**bounded AC-2 exception** — one new seed user; no other changes)
      - `deskhive/README.md` (one-line addition under "Seeded accounts" for the new Guest user)
      - `deskhive/playwright.config.ts` (only if AC-4's "strongly preferred zero changes" is violated by a real technical need — document why)
      - `_bmad-output/implementation-artifacts/sprint-status.yaml` (status update)
      - `_bmad-output/implementation-artifacts/7-PREP-1-better-auth-playwright-fixtures.md` (this file)
      - Memory file in `~/.claude/.../memory/` (out-of-tree)
    - **Zero changes** to `deskhive/src/` (production code), `deskhive/drizzle/`, `deskhive/package.json` dependencies (Decision §10).
    - **`scripts/seed.ts` changes are bounded to AC-2** — one new `seedUser` call for `guest@deskhive.local`. Any other seed edit (new applicants, schema-level changes, application/booking seed changes) is OUT OF SCOPE and should fail BA review.
    - If dev-agent encounters a production bug during migration (Decision §9), **stop and escalate** — do not silently fix.

12. **AC-12 (New documentation in `tests/README.md`).** Per BA Decision §"Files likely touched":
    - New file `deskhive/tests/README.md` (or extend if already exists — Glob confirms it doesn't yet).
    - Sections:
      - **"When to use the `authenticatedPage` fixture"** — guidance: any test that needs a logged-in user. Unauthenticated redirect tests stay vanilla (no fixture needed).
      - **"Role shorthands"** — table of the 4 roles + their seeded mappings + the BA alignment note for `'fresh-owner'`.
      - **"Arbitrary email variant"** — when to reach for it (non-shorthand seed users).
      - **"Mutation discipline"** — link to AC-9's rules.
      - **"What the fixture does NOT do"** — no UI form fill, no backdoor route, no DB reset.
      - **"Where to find examples"** — links to the 4 migrated specs as canonical patterns.

13. **AC-13 (Memory entry — `reference_authenticated_e2e_fixture.md`).** Per BA Decision §8:
    - New memory file codifies:
      - The `authenticatedPage(role)` fixture API + the 4 role shorthands + the arbitrary-email variant.
      - The Better Auth server-side session creation pattern (`auth.api.signInEmail` direct call, no `/login` form fill, no backdoor route).
      - The `'fresh-owner'` → `applicant3@deskhive.local` alignment note (BA Decision §1 named `ihtiyor@mail.com` — that's a placeholder; applicant3 is the seeded SPACE_OWNER-with-zero-spaces).
      - **Authenticated-first by default principle**: "From Theme B/C onward, E2E tests covering authenticated flows default to using the fixture. Unauthenticated redirect tests remain valuable for route-guard verification but should not be the only coverage for an authenticated feature."
      - The 5 migrated specs as canonical examples of the migration pattern.
      - Mutation discipline rules (AC-9).
      - The "opportunistic migration of Phase 1 specs" note — future stories touching those files should migrate them then (no scheduled bulk migration in this story).
    - Update `MEMORY.md` index with a one-line pointer.

14. **AC-14 (No regression in any prior story).** All flows verified through Story 7-5 must still work:
    - Phase 1 + Stories 5-1 / 5-2 / 6-1 / 6-2 / 6-3 / 6-6 / 7-1 / 7-2 / 7-3 / 7-4 / 7-5 unchanged.
    - Existing 40 E2E tests **all still pass** (Decision §6 — migration adds; does not remove).
    - Baseline unit tests: **220 unchanged** (Decision §7 — this is an E2E story, no new unit tests expected).
    - `pnpm typecheck` / `lint` / `test` / `build` / `test:e2e` all clean.
    - **Build routes unchanged at 36** (Decision §7 — no new production routes).

15. **AC-15 (Single commit + memory entry).** Per the established pattern:
    - All Story 7-PREP-1 changes land in a single commit on `main` titled exactly `test: better auth playwright fixtures + targeted e2e migration (Story 7-PREP-1)`. Commit content is files under `deskhive/tests/` + `_bmad-output/implementation-artifacts/`.
    - A small follow-up `docs:` commit fills in the Change Log hash + BA verification after push.
    - Memory entry + index update live in `~/.claude/.../memory/` (out-of-tree, NOT staged).
    - **NB on subject prefix:** `test:` instead of `feat:` since this story ships zero user-facing features. Conventional-commits convention.

16. **AC-16 (Stop bar — BA browser verification checklist).** All 10 points from BA Decisions §"Browser verification checklist" verified by BA before greenlight. Highlights:
    1. All unit tests pass (~220 unchanged).
    2. All E2E tests pass (45-50 — at least +5 from baseline 40).
    3. Cross-tenant E2E test exists, is the test from Decision §4, and passes in isolation.
    4. A migrated spec has at least one new `test('...', async ({ authenticatedPage }) => ...)` block.
    5. `git diff` shows ZERO changes to `src/`.
    6. Browser smoke test: Phase 1 + Theme A flows still work end-to-end (Guest applies → admin approves → owner switches to hosting).
    7. No console errors during smoke test.
    8. Build still produces 36 routes (unchanged).
    9. Footer reads `© 2026 DeskHive`.
    10. CI runs clean (or local `pnpm test && pnpm test:e2e && pnpm typecheck && pnpm lint` passes).

## Tasks / Subtasks

- [x] **Task 0 — Prep + Phase 1/Theme A audit.**
  - Verify baseline CI: `pnpm typecheck` / `lint` / `test` (220 expected) / `build` (36 routes expected) / `test:e2e` (40 expected) all clean on a fresh `main` checkout.
  - Re-read [docs/design/7-PREP-1-better-auth-playwright-fixtures-ba-decisions.md](docs/design/7-PREP-1-better-auth-playwright-fixtures-ba-decisions.md) end-to-end (~300 lines).
  - Re-read [src/lib/auth/config.ts](deskhive/src/lib/auth/config.ts) — Better Auth instance + `signInEmail` availability.
  - Re-read [src/app/api/auth/login/route.ts](deskhive/src/app/api/auth/login/route.ts) — the production endpoint pattern the fixture's session creation mirrors.
  - Re-read [scripts/seed.ts](deskhive/scripts/seed.ts) — confirm exact email/password pairs (AC-2). NB the `'fresh-owner'` BA alignment.
  - Re-read [tests/e2e/owner-routes.spec.ts](deskhive/tests/e2e/owner-routes.spec.ts) — current state of the load-bearing migration target.
  - Re-read [tests/e2e/admin-applications.spec.ts](deskhive/tests/e2e/admin-applications.spec.ts), [become-a-host.spec.ts](deskhive/tests/e2e/become-a-host.spec.ts), [bookings.spec.ts](deskhive/tests/e2e/bookings.spec.ts) — migration targets.
  - Re-read [playwright.config.ts](deskhive/playwright.config.ts) — confirm zero-touch is feasible.

- [x] **Task 1 — Fixture helpers: `tests/fixtures/auth-helpers.ts` + `seed-helpers.ts`** (AC-1, AC-2, AC-3, AC-5):
  - Create `deskhive/tests/fixtures/auth-helpers.ts`:
    - Internal `SEED_CREDENTIALS: Record<string, { email: string; password: string }>` map per AC-2.
    - Exported `createSessionCookie(email: string, password: string): Promise<{ name; value; expires; domain; path }>`.
    - Calls `auth.api.signInEmail({ body: { email, password }, asResponse: true })` (Approach (A) from AC-3) — extracts Set-Cookie header from the returned `Response`, parses out the Better Auth session token cookie, returns it in the shape Playwright's `context.addCookies` expects.
    - Cookie parser: minimal — split on `;`, look for `Set-Cookie` headers with names matching Better Auth's session cookie (typically `better-auth.session_token` or similar; dev-agent confirms by running once and inspecting). Robust to whatever name Better Auth uses currently.
    - Throws clear errors on auth failure (invalid credentials, network issues).
  - Create `deskhive/tests/fixtures/seed-helpers.ts`:
    - Exported `getSeededOwnerSpaceId(): Promise<string>` — queries the DB for the space named `'Seeded Owner Coworks'` (Story 7-5 seed marker); returns its id. Throws if not found.
    - Uses the existing `db` client from `@/db/client` (same as seed script does).

- [x] **Task 2 — Add fresh Guest seed user + verify full credential set** (AC-2):
  - **Edit `scripts/seed.ts`** — add the new `guest@deskhive.local` seed user per AC-2's "Seed delta shape":
    - Define `SEED_GUEST_EMAIL = 'guest@deskhive.local'`, `SEED_GUEST_PASSWORD = 'Guest1!'`, `SEED_GUEST_FULL_NAME = 'Test Guest'` as module constants near the existing `SEED_OWNER_*` constants.
    - In `main()`, add `await seedUser({ email: SEED_GUEST_EMAIL, password: SEED_GUEST_PASSWORD, fullName: SEED_GUEST_FULL_NAME, role: 'GUEST' });` after the SPACE_OWNER seed call, before the applicants loop.
    - **No application seeded for this user** — they remain a fresh Guest.
  - **Edit `deskhive/README.md`** — add one line under "Seeded accounts": `- **Plain Guest** — `guest@deskhive.local` / `GuestPass1!` (no application; for E2E State A coverage)`.
  - **Re-run `pnpm db:seed`** to populate the new user on Neon. Verify idempotency by running once more — should be a no-op for the new user.
  - **Hard-code the verified credential set** in `tests/fixtures/auth-helpers.ts` `SEED_CREDENTIALS` map per AC-1's locked table:
    - `admin@deskhive.local` / `SuperAdmin1!`
    - `owner@deskhive.local` / `SpaceOwner1!`
    - `guest@deskhive.local` / `GuestPass1!` (NEW)
    - `applicant1@deskhive.local` / `Applicant1!`
    - `applicant2@deskhive.local` / `Applicant2!`
    - `applicant3@deskhive.local` / `Applicant3!`
    - `applicant4@deskhive.local` / `Applicant4!`
  - **Document the AC-2 bounded exception** in the fixture file's header comment: "scripts/seed.ts gains ONE new user in this story (guest@deskhive.local); otherwise unchanged. Decision §10 exception logged in story file."

- [x] **Task 3 — Fixture entry-point: `tests/fixtures/authenticated-page.ts` + `index.ts`** (AC-1, AC-4):
  - Create `deskhive/tests/fixtures/authenticated-page.ts`:
    - Imports `test as baseTest, expect` from `@playwright/test`.
    - Extends `test` with an `authenticatedPage` fixture using Playwright's `test.extend(...)` pattern. The fixture is a factory: returns an async function that takes a role/email and returns a `Page`.
    - The fixture implementation:
      1. Resolves role → credentials via `SEED_CREDENTIALS` (or throws for unmapped emails).
      2. Calls `createSessionCookie(email, password)` from `auth-helpers.ts`.
      3. Creates a fresh browser context via the test's `browser` fixture; calls `context.addCookies([cookie])`; creates a new `page` from that context.
      4. Returns the `page`.
    - Exports the extended `test` and the `expect` re-export so specs can `import { test, expect } from '../fixtures'` (or wherever the fixture lives — dev-agent picks path).
  - Create `deskhive/tests/fixtures/index.ts`:
    - Re-exports `test` + `expect` from `authenticated-page.ts`.
    - Spec import shape: `import { test, expect } from '../fixtures'`.

- [x] **Task 4 — Migrate `tests/e2e/owner-routes.spec.ts`** (AC-5, AC-10):
  - Keep all 5 existing unauthenticated redirect tests verbatim (Decision §6).
  - Add **cross-tenant test** (the non-negotiable load-bearing AC) — verbatim from AC-5 specification.
  - Add **`owner sees their own spaces` test** — positive case alongside the negative.
  - Net count: **7 tests** (was 5).

- [x] **Task 5 — Migrate `tests/e2e/admin-applications.spec.ts`** (AC-6, AC-10):
  - Keep the 2 existing unauthenticated tests.
  - Add at least 1 authenticated case (recommended: admin sees seeded applications in the list).
  - Net count: **≥3 tests** (was 2).

- [x] **Task 6 — Migrate `tests/e2e/become-a-host.spec.ts`** (AC-7, AC-10):
  - Keep the 2 existing unauthenticated tests.
  - Add State A test (fresh `'guest'` → form visible — verbatim from AC-7).
  - Add State B test (applicant1 with PENDING → "under review" — verbatim from AC-7).
  - **Skip the optional State A → submit → State B end-to-end** for v1 (mutation discipline — AC-9). Mention in Completion Notes that the full submit flow waits for a future story with DB reset infrastructure.
  - Net count: **4 tests** (was 2).

- [x] **Task 7 — Migrate `tests/e2e/bookings.spec.ts` (best-effort)** (AC-8, AC-10):
  - Keep the 5 existing unauthenticated tests.
  - Best-effort: add 1 authenticated case (applicant2 sees their CONFIRMED booking at `/my-bookings`).
  - If brittle, ship without — but document the deferral in Completion Notes.
  - Net count: 5 or 6 tests.

- [x] **Task 8 — Verify migration adds at least 6 new authenticated cases** (AC-10):
  - Run `pnpm test:e2e` and count the new authenticated cases.
  - Expected minimum: 2 (AC-5 owner-routes) + 1 (AC-6 admin-applications) + 2 (AC-7 become-a-host State A + B) + 1 (AC-8 bookings best-effort) = **6**.
  - If fewer than 6, add more before commit. AC-5's cross-tenant test is the non-negotiable load-bearing case; the rest must collectively meet the floor.

- [x] **Task 9 — `tests/README.md` documentation** (AC-12):
  - Create `deskhive/tests/README.md` with the sections from AC-12.

- [x] **Task 10 — Local CI parity** (AC-14):
  - `pnpm typecheck` clean.
  - `pnpm lint` clean.
  - `pnpm test` — baseline 220 unchanged.
  - `pnpm build` — 36 routes unchanged.
  - `pnpm test:e2e` — 45–50 total (40 baseline + ≥5 new).

- [x] **Task 11 — `git diff` verification: production code untouched + seed change bounded to AC-2** (AC-11):
  - `git diff --stat` should show changes ONLY in:
    - `deskhive/tests/` (fixtures + spec migrations)
    - `deskhive/tests/README.md` (new doc)
    - `deskhive/scripts/seed.ts` (AC-2 bounded exception — one new `seedUser` call + 3 new module constants; NOTHING ELSE)
    - `deskhive/README.md` (one-line addition under "Seeded accounts")
    - `deskhive/playwright.config.ts` (only if AC-4 forces it)
    - `_bmad-output/`
  - **Zero entries** under `deskhive/src/`, `deskhive/drizzle/`, `deskhive/package.json` dependencies.
  - **`scripts/seed.ts` diff should be ~10 lines** — 3 new constants + 1 `seedUser` call + a comment block explaining the AC-2 exception. Any larger seed diff = scope creep, escalate.

- [ ] **Task 12 — Manual verification (BA's eyeball — AC-16 / Verification §1–10).** *(DEFERRED to BA's review pass per the Stories 5-1 → 7-5 precedent — dev-agent runs the full automated suite + does the browser smoke test from Verification §6 to confirm Theme A flows are intact; BA owns the 10-point verification checklist.)*

- [x] **Task 13 — Memory + sprint-status + Dev Agent Record + single commit (no push)** (AC-13, AC-15):
  - Create `~/.claude/.../memory/reference_authenticated_e2e_fixture.md` per AC-13. Type: `reference`. Cross-reference Story 7-5's `reference_owner_scoped_crud_pattern.md` (the cross-tenant test originates from there).
  - Update `MEMORY.md` index.
  - Update `_bmad-output/implementation-artifacts/sprint-status.yaml`: add `7-PREP-1` entry under a new "Cross-cutting infra" section OR appended to Epic 7 (dev-agent picks — Epic 7 is `done`, so a new section is cleaner). Status: `ready-for-dev` → `review` upon ship.
  - Update this story file: `Status: ready-for-dev` → `Status: review`; mark all Tasks `[x]` except Task 12 (BA's eyeball); fill in Dev Agent Record.
  - Stage all `deskhive/tests/...` files + the two `_bmad-output/...` files.
  - Commit: `test: better auth playwright fixtures + targeted e2e migration (Story 7-PREP-1)`.
  - **Do NOT push.** Wait for BA browser-verification per Task 12 before pushing.
  - After BA greenlight: push, then add a small `docs:` follow-up commit to fill in the Change Log hash + mark Status `done`.

## Dev Notes

### What gets built and what's deliberately out of scope

This is a **prep story** — pure infrastructure, zero user-facing features. After it lands at `review` and BA greenlights:

- Phase 2's accumulated authenticated-E2E debt is paid down (the 5-spec bounded migration list).
- The cross-tenant security test from Story 7-5 Decision §8 (which the BA browser walk skipped) is now in CI.
- Theme C (Email, Epic 8) ships with the fixture pre-built — no further deferral of authenticated email-flow tests.
- The `authenticatedPage(role)` fixture becomes the canonical pattern for Phase 2/3 authenticated E2E. Opportunistic migration of Phase 1 specs happens as future stories touch those files.

Feature scope (Story 7-PREP-1 only):
- ✅ `authenticatedPage(role)` fixture with 4 role shorthands + arbitrary-email variant.
- ✅ `createSessionCookie(email, password)` helper using `auth.api.signInEmail` directly.
- ✅ `getSeededOwnerSpaceId()` seed-helper for the cross-tenant test.
- ✅ Cross-tenant E2E test (the load-bearing AC).
- ✅ Migration of 4 specs with at least 6 new authenticated cases total.
- ✅ `tests/README.md` documentation.
- ✅ **One** new seed user `guest@deskhive.local` — bounded Decision §10 exception per BA approval 2026-05-13.
- ✅ One-line README addition for the new seed user.
- ✅ Memory entry codifying the fixture API + authenticated-first principle.

Out of scope (do NOT build):
- ❌ Migration of every Phase 1 / Phase 2 spec — only the 4 listed in Decision §3.
- ❌ Backdoor `/api/test/login` or any test-only auth route — Decision §2 explicit anti-pattern.
- ❌ Form-based login in the fixture (slow + brittle) — Decision §2 explicit anti-pattern.
- ❌ Password parameter on the fixture API — Decision §1.
- ❌ Production code changes — Decision §9.
- ❌ **Seed script changes beyond the AC-2 bounded exception** — exactly one new GUEST user (`guest@deskhive.local`); any other seed edit (new applicants, schema-level changes, application/booking/space seed changes) is OUT OF SCOPE.
- ❌ Better Auth configuration changes — Decision §10.
- ❌ New dependencies — Decision §10.
- ❌ Database reset infrastructure between tests — Decision §5.
- ❌ Visual regression testing — Phase 3.
- ❌ Multi-browser matrix — still Chromium-only.
- ❌ Mobile viewport testing — Phase 3.
- ❌ Unit tests for the fixture itself — the migrated specs are the verification.
- ❌ New production routes.
- ❌ Mutation-based tests that don't clean up (AC-9 mutation discipline).
- ❌ Full State A → submit → State B end-to-end in `become-a-host.spec.ts` — deferred to a future story with DB reset infra (AC-7 ships the two state-check tests only).

### Key decisions

1. **Bounded Decision §10 exception (BA-approved 2026-05-13 pre-dispatch).** This story adds **one** new seed user (`guest@deskhive.local` / `GuestPass1!`, role GUEST, no application) so the `become-a-host.spec.ts` migration can do proper State A (form visible) vs State B (under review) coverage. All four applicant seed users have applications and therefore land in State B; State A coverage is otherwise unreachable. The exception is bounded to this single user. Rationale (BA quote): "paying down test debt is the point of this story; leaving a weaker assertion in place because of a self-imposed rule defeats the purpose."

2. **`auth.api.signInEmail` direct call from the fixture (AC-3 Approach A).** The production `/api/auth/login` endpoint uses the same call. Single seam of truth; minimal coupling drift. Alternative (direct insert into `sessionTable`) is rejected because it requires knowing Better Auth's internal cookie name + token-signing scheme — too brittle.

3. **`'fresh-owner'` → `applicant3@deskhive.local` (BA alignment).** BA Decision §1 named `ihtiyor@mail.com` as the "fresh-approved owner, zero spaces" subject. That user was created manually during Story 7-4's BA browser walk and is NOT in the seed. `applicant3@deskhive.local` is the canonical seeded equivalent: SPACE_OWNER (via Story 7-4's APPROVED-application atomic promotion), owns zero spaces (Story 7-5 only seeded a space for `owner@deskhive.local`). Documented in fixture file + memory entry.

4. **`'guest'` → `guest@deskhive.local` (NEW per AC-2).** Maps to the new fresh Guest seed user — no application, GUEST role, perfect for State A E2E coverage. Rejected alternatives: aliasing to applicant1 (would force State B-only coverage), or requiring arbitrary-email variant only (asymmetric API, more verbose at call sites).

4. **Forms share via variant prop in `<CreateSpaceForm>` + `<EditSpaceForm>` (already done in Story 7-5).** Mentioned here only as a reminder: the fixture's authenticated tests will exercise the owner variant — Story 7-5 already wired it.

5. **`tests/fixtures/` directory is new.** No prior tests/fixtures pattern exists. The dev-story phase establishes this — fixture entry-point at `tests/fixtures/index.ts`, internal helpers at `tests/fixtures/auth-helpers.ts` + `tests/fixtures/seed-helpers.ts`.

6. **`playwright.config.ts` change-zero strongly preferred (AC-4).** Playwright's `test.extend(...)` pattern composes at the spec level; specs import the extended `test` from `tests/fixtures` instead of `@playwright/test`. No global registration needed. If the dev-story phase finds otherwise, document why.

7. **Mutation discipline — no DB reset in this story (AC-9).** Migrated tests lean read-heavy. The "approve a PENDING application end-to-end" test from BA Decision §3 is welcome but optional; if it lands, it must clean up after itself or be carefully ordered. The bigger DB-reset infrastructure is a future story.

8. **No subject-prefix drift — this is a `test:` story (AC-15).** Conventional Commits says `test:` for tests-only changes. The 11 prior commits in Phase 2 used `feat:` because they shipped user-facing functionality. 7-PREP-1 ships zero user-facing — the prefix change reflects that.

9. **All cross-cutting framework choices preserved:** Better Auth config, `nextCookies()` plugin, `auth.api.signInEmail` server-side, conditional UPDATE pattern, `db.transaction` (Story 7-2), Server Actions return success state, Story 5-2 admin chrome, Story 6-3 toast wrapper, Story 7-1 role + mode infrastructure, Story 7-5 owner-scoped CRUD pattern + two-layer ownership check + NOT_FOUND-not-FORBIDDEN principle. **Every prior story remains byte-for-byte unchanged by this story.**

### Architectural anti-patterns forbidden (Decision §"Architectural anti-patterns forbidden")

- **Do NOT** add a `/api/test/login` or any test-only backdoor route to production code.
- **Do NOT** navigate to `/login` and submit credentials in the fixture.
- **Do NOT** require a password parameter in the fixture API.
- **Do NOT** migrate Phase 1 E2E specs without an authenticated gap.
- **Do NOT** migrate every Phase 2 spec — only the 4 listed.
- **Do NOT** delete pre-existing unauthenticated tests during migration.
- **Do NOT** add new production routes.
- **Do NOT** modify Better Auth configuration or session schema.
- **Do NOT** modify the seed script **beyond the AC-2 bounded exception** (exactly one new GUEST user, `guest@deskhive.local`). Any other seed edit fails BA review.
- **Do NOT** silently fix production code during this story — escalate first.
- **Do NOT** add seed users beyond `guest@deskhive.local`.
- **Do NOT** install new dependencies.
- **Do NOT** add database reset infrastructure between tests.
- **Do NOT** add visual regression testing.
- **Do NOT** add multi-browser or mobile viewport coverage.

### Sprint status update

`_bmad-output/implementation-artifacts/sprint-status.yaml` updates:

```yaml
  # ─────────────────────────────────────────────────────────────────
  # Cross-cutting infrastructure — Phase 2 prep stories
  # Story 7-PREP-1 sits between Theme A close (Epic 7 done) and
  # Theme C start (Epic 8). Source: docs/design/7-PREP-1-...md
  # ─────────────────────────────────────────────────────────────────
  7-prep-1-better-auth-playwright-fixtures: review  # was: backlog → ready-for-dev → review
```

Update the `last_updated` parenthetical at top of file.

### Recent commits

```
6e5b8a1 docs: fill commit hash in Story 7-5 Change Log + close Epic 7
3fd797d feat: owner dashboard + space management (Story 7-5)                ← Last feature commit
3b2ac9c docs: fill commit hash in Story 7-4 Change Log + record BA greenlight
bac6bc0 feat: admin application review UI (Story 7-4)
a49e15f docs: fill commit hash in Story 7-3 Change Log + record BA greenlight
...
```

Story 7-PREP-1 is the **first `test:`-prefixed commit on `main`**. Subject: `test: better auth playwright fixtures + targeted e2e migration (Story 7-PREP-1)`.

### References

- [Source: docs/design/7-PREP-1-better-auth-playwright-fixtures-ba-decisions.md](docs/design/7-PREP-1-better-auth-playwright-fixtures-ba-decisions.md) — BA decisions document (305 lines, 10 decisions).
- [Source: deskhive/src/lib/auth/config.ts](deskhive/src/lib/auth/config.ts) — Better Auth instance + `signInEmail` API.
- [Source: deskhive/src/app/api/auth/login/route.ts](deskhive/src/app/api/auth/login/route.ts) — production login endpoint pattern the fixture mirrors.
- [Source: deskhive/scripts/seed.ts](deskhive/scripts/seed.ts) — seed user credentials (AC-2).
- [Source: deskhive/playwright.config.ts](deskhive/playwright.config.ts) — Playwright config (should remain untouched per AC-4).
- [Source: deskhive/tests/e2e/owner-routes.spec.ts](deskhive/tests/e2e/owner-routes.spec.ts) — Migration target (load-bearing cross-tenant test).
- [Source: deskhive/tests/e2e/admin-applications.spec.ts](deskhive/tests/e2e/admin-applications.spec.ts) — Migration target.
- [Source: deskhive/tests/e2e/become-a-host.spec.ts](deskhive/tests/e2e/become-a-host.spec.ts) — Migration target.
- [Source: deskhive/tests/e2e/bookings.spec.ts](deskhive/tests/e2e/bookings.spec.ts) — Migration target (best-effort).
- [Source: deskhive/AGENTS.md] — Next.js 16 caveats.
- [_bmad-output/implementation-artifacts/7-5-owner-dashboard-and-spaces.md] — Story 7-5 (the cross-tenant test gap originates here).
- Dev-agent memory `reference_owner_scoped_crud_pattern.md` — Story 7-5's two-layer ownership check (the cross-tenant test validates this).
- Dev-agent memory `reference_admin_review_ui_pattern.md` — Story 7-4's admin review trio (admin-applications migration target).
- Dev-agent memory `reference_guest_application_form_ui.md` — Story 7-3's State A/B/C/D/E branching (become-a-host migration target).

## Dev Agent Record

### Agent Model

Claude Opus 4.7 (1M context).

### Debug Log References

| # | Issue | Resolution |
|---|---|---|
| 1 | BA pre-dispatch named `Guest1!` (7 chars) for the new seed user. Better Auth's default + our own `registerSchema` ([src/lib/validation/auth.ts:9](deskhive/src/lib/validation/auth.ts)) enforce 8-char minimum. Seed run failed with `PASSWORD_TOO_SHORT`. | Bumped to `GuestPass1!` (11 chars, parallel style to `SpaceOwner1!`/`Applicant1!`). Updated everywhere (seed.ts, README.md, fixture map, story file). Documented in both the seed comment and the memory entry. |
| 2 | E2E run #1: all 6 new authenticated tests failed with `DATABASE_URL is not set`. Playwright workers don't inherit the seed script's dotenv loading. | Added `dotenv` preload to the top of `playwright.config.ts` (3 lines: `loadEnv({ path: '.env.local' }); loadEnv({ path: '.env' });`). Same pattern `scripts/seed.ts` uses. Documented as the AC-4 "real technical need" exception to the zero-config-touch preference. E2E run #2: 46/46 passed. |
| 3 | Lint flagged `react-hooks/rules-of-hooks` on the fixture's `await use(factory)` line. Playwright's `use` is the fixture-injection API, not React's hook. The lint rule false-positives because the enclosing property name `authenticatedPage` doesn't match React Hook naming conventions (Playwright convention forces the lowercase name). | Added an inline `// eslint-disable-next-line react-hooks/rules-of-hooks` comment on the `await use(factory)` line. Lint clean. |

### Decision-point answers

1. **Session-creation approach (AC-3):** Approach A — `auth.api.signInEmail({ asResponse: true })` from the fixture process. Same path `/api/auth/login` uses internally. The Response's Set-Cookie headers are parsed via `response.headers.getSetCookie()` (Node ≥19.7) and forwarded en bloc to Playwright's `context.addCookies` — all cookies scoped to `http://localhost:3000` via the `url:` shorthand. No cookie-name introspection needed; Playwright handles the rest.
2. **`'fresh-owner'` mapping (AC-1):** `applicant3@deskhive.local`. BA Decision §1's `ihtiyor@mail.com` is a placeholder for the manually-created Story 7-4 browser-walk user; applicant3 is the seeded SPACE_OWNER-with-zero-spaces. Documented in `auth-helpers.ts` header comment + the memory entry.
3. **`'guest'` mapping (AC-2):** `guest@deskhive.local` — the NEW seed user added under the bounded AC-2 exception. The four applicant seed users all have applications and would force State-B-only coverage; the fresh Guest enables proper State A coverage in `become-a-host.spec.ts`.
4. **AC-7 optional submit-flow test:** Deferred (AC-9 mutation discipline). The State A + State B tests cover the fixture and the state branching; the full State A → submit → State B end-to-end waits for a future story with DB reset infrastructure.
5. **AC-8 bookings best-effort case:** Shipped. `applicant2@deskhive.local` has a CONFIRMED booking on `Seeded Owner Coworks` per the Story 7-5 seed; the test asserts the space name is visible at `/my-bookings`. Brittle to seed shape, but the assertion is narrow (one space name).
6. **`playwright.config.ts` touch (AC-4 exception):** Forced by Debug Log #2 — dotenv preload is the only legitimate technical reason to touch the config. Documented in the file header.

### Completion Notes

- **Six new authenticated E2E cases shipped** (exact AC-10 floor):
  1. `owner-routes.spec.ts` — fresh-owner cross-tenant ownership rejection (**load-bearing AC-5 / Decision §4**)
  2. `owner-routes.spec.ts` — owner sees their own seeded space
  3. `admin-applications.spec.ts` — admin sees seeded applications
  4. `become-a-host.spec.ts` — fresh Guest sees State A apply form
  5. `become-a-host.spec.ts` — applicant1 sees State B "under review"
  6. `bookings.spec.ts` — applicant2 sees their seeded CONFIRMED booking at /my-bookings
- **Fixture architecture:** `tests/fixtures/auth-helpers.ts` (credentials map + `createSessionCookies`), `tests/fixtures/seed-helpers.ts` (`getSeededOwnerSpaceId`, `getSeededUserId`), `tests/fixtures/authenticated-page.ts` (Playwright `test.extend`), `tests/fixtures/index.ts` (barrel). Specs import `{ test, expect }` from `'../fixtures'`.
- **AC-2 bounded seed exception:** exactly one new seed user (`guest@deskhive.local` / `GuestPass1!`, role GUEST, no application). 24-line diff to `scripts/seed.ts` (3 module constants + 1 `seedUser` call + comment block). Verified in `git diff` — no other seed changes.
- **AC-4 dotenv exception:** `playwright.config.ts` gains 3 lines of dotenv preload at the top. Documented in file header + memory entry as the AC-4 "real technical need" exception.
- **`git diff` confirms zero `src/` changes** — production code untouched. Changes confined to `tests/`, `tests/README.md`, `scripts/seed.ts` (bounded), `README.md`, `playwright.config.ts` (dotenv), and `_bmad-output/`.
- **CI parity** all green: typecheck ✓ / lint ✓ / 220 unit tests (unchanged) / build 36 routes (unchanged) / **46/46 E2E (was 40, +6)**.
- **Cumulative authenticated-E2E debt resolved** for the 4 migration targets. Opportunistic migration of other Phase 1 specs happens as future stories touch them.
- **Memory entry** codifies: fixture API + 4 role mappings + `auth.api.signInEmail` approach + dotenv preload + authenticated-first principle + cross-tenant security test pattern + mutation discipline + bounded-exception process for future seed expansions.

### File List

**New files (6):**
- `deskhive/tests/fixtures/auth-helpers.ts` — `SEED_CREDENTIALS`, `ROLE_EMAIL`, `resolveEmail`, `createSessionCookies`
- `deskhive/tests/fixtures/seed-helpers.ts` — `getSeededOwnerSpaceId`, `getSeededUserId`
- `deskhive/tests/fixtures/authenticated-page.ts` — `test.extend({ authenticatedPage })`
- `deskhive/tests/fixtures/index.ts` — barrel
- `deskhive/tests/README.md` — fixture documentation
- `~/.claude/.../memory/reference_authenticated_e2e_fixture.md` (out-of-tree)

**Modified files (in-tree, 6):**
- `deskhive/scripts/seed.ts` — AC-2 bounded exception (1 new GUEST seed user, 24-line addition)
- `deskhive/README.md` — one-line addition under "Seeded accounts" for the new Guest
- `deskhive/playwright.config.ts` — AC-4 dotenv preload (3 lines at top)
- `deskhive/tests/e2e/owner-routes.spec.ts` — +2 authenticated tests including cross-tenant load-bearing
- `deskhive/tests/e2e/admin-applications.spec.ts` — +1 authenticated test
- `deskhive/tests/e2e/become-a-host.spec.ts` — +2 authenticated tests (State A + State B)
- `deskhive/tests/e2e/bookings.spec.ts` — +1 authenticated test (best-effort)

**Sprint/Story metadata (2):**
- `_bmad-output/implementation-artifacts/sprint-status.yaml` — `7-prep-1` → `review` + last_updated parenthetical
- `_bmad-output/implementation-artifacts/7-PREP-1-better-auth-playwright-fixtures.md` — Status: review, Dev Agent Record filled

**Memory (out-of-tree, in `~/.claude/projects/.../memory/`):**
- **Created:** `reference_authenticated_e2e_fixture.md`
- **Updated:** `MEMORY.md` — index appended with the new entry.

### Change Log

| Date | Change | Commit |
|---|---|---|
| 2026-05-13 | Story drafted by `bmad-create-story` from BA decisions document. | (none) |
| _TBD_ | Story implemented; `authenticatedPage` fixture shipped; 4 specs migrated with ≥5 new authenticated cases including the load-bearing cross-tenant test from Story 7-5 Decision §8. Memory entry codifies the authenticated-first principle. Single commit per AC-15. | (filled by a small follow-up commit after push, once the hash is stable — same pattern as Stories 5.1 / 5.2 / 6.1 / 6.2 / 6.3 / 6.6 / 7.1 / 7.2 / 7.3 / 7.4 / 7.5) |
