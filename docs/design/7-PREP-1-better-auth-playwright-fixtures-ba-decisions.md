# Story 7-PREP-1: Better Auth Playwright Fixtures + Targeted E2E Migration — BA Decisions

**Story:** 7-PREP-1 (prep story, not a numbered epic story)
**Epic:** Cross-cutting infrastructure (sits between Theme A close and Theme C start)
**Phase:** 2
**Author:** Ikhtiyor Ziyayev, Business Analyst
**Date:** Wednesday, May 13, 2026
**Status:** Locked, ready for dispatch
**Source:** Cumulative debt flagged in Stories 7-1, 7-2, 7-3, 7-4, 7-5 close-outs.

---

## Context

Every Phase 2 story so far has deferred authenticated E2E coverage. The pattern shows up in every close-out: Amelia writes the new spec, runs into "the test needs a logged-in user," and falls back to either (a) an unauthenticated redirect check that hits `/login`, or (b) a unit test on the underlying service module. The actual authenticated flows — "logged-in Guest applies via `/become-a-host`," "logged-in admin reviews application," "logged-in owner edits a space" — are verified by BA browser walks but **not by automation**.

The cost is two-fold:

1. **BA browser walks are becoming the single point of failure.** Every story relies on me eyeballing screenshots. The 40/40 E2E pass after Story 7-5 sounds great, but a chunk of those tests only verify "unauthenticated user gets redirected to `/login`" — not "authenticated owner sees only their own bookings." The cross-tenant security test from Decision §8 of Story 7-5 is the canonical example: the BA decisions doc demanded it, the BA browser walk skipped it, and the E2E suite doesn't cover it.

2. **Theme C (Email, Epic 8) breaks this open.** Email behavior is fundamentally post-authenticated (Guest submits application → email fires; admin approves → email fires; owner confirms booking → email fires). If Theme C's test suite still can't log in, every email test will defer to BA walks too — and there are 11+ email templates across Stories 8-2 / 8-3 / 8-4. The debt becomes blocking.

This prep story lands the **authenticated Playwright fixture infrastructure** and migrates the **specific E2E specs that currently work around the gap** before Theme C ships.

---

## Scope

**In scope:**

- New Playwright fixture: `authenticatedPage(role)` — returns a Page with a pre-seeded session cookie for one of the seed users (`guest@deskhive.local`, `owner@deskhive.local`, `admin@deskhive.local`, `ihtiyor@mail.com`)
- Helper utility: programmatic Better Auth session creation that bypasses the browser login form (creates a session row in DB + sets the session cookie on the page context) — equivalent to "log in as this user without doing the form dance"
- Memory entry codifying the fixture pattern and the "authenticated-first by default" testing principle for Phase 2 onward
- Migration of **specific high-value E2E specs** that currently use unauthenticated-only workarounds (see Decision §3 for the exact list — bounded, not opportunistic)
- Updated E2E baseline: each migrated spec should add **at least one authenticated case** that the spec previously couldn't cover
- New documentation in `deskhive/tests/README.md` (or wherever Phase 1 docs E2E patterns) explaining when to reach for the fixture
- No changes to Better Auth configuration, schema, or production code

**Out of scope:**

- Migrating every Phase 1 E2E spec (deferred — opportunistic migration happens as Theme B/C touch those files)
- Migrating every Phase 2 E2E spec (deferred — same reason)
- Building a custom auth-bypass test endpoint (the fixture creates sessions directly via Better Auth's API, not via a backdoor route — see Decision §2)
- Performance benchmarks on the fixture (it'll be fast enough; if it's not, address in a follow-up)
- Visual regression testing infrastructure (Phase 3 candidate)
- Multi-browser matrix (still Chromium-only per Phase 1)
- Mobile viewport testing (Phase 3 candidate)
- Unit tests for the fixture itself (the fixture is verified by the migrated specs working)
- Any feature work — this story adds zero user-facing changes
- Refactoring the seed script — seed users stay as they are
- New seed users specifically for E2E (use the existing ones)

---

## Decisions

### Decision 1: Fixture API — `authenticatedPage(role)` with seed-user shorthand

The fixture exposes a single primary helper. Spec example:

```typescript
test('owner sees only own bookings', async ({ authenticatedPage }) => {
  const page = await authenticatedPage('owner')  // owner@deskhive.local
  await page.goto('/owner/bookings')
  await expect(page.locator(...)).toBeVisible()
})
```

Supported role shorthands (mapped to seed user emails):
- `'guest'` → `guest@deskhive.local`
- `'owner'` → `owner@deskhive.local`
- `'admin'` → `admin@deskhive.local`
- `'fresh-owner'` → `ihtiyor@mail.com` (the just-approved owner from Story 7-4, zero spaces — perfect for empty-state and cross-tenant tests)

For arbitrary users (e.g., one of the applicant seed users), allow an email-string variant:

```typescript
const page = await authenticatedPage({ email: 'applicant1@deskhive.local' })
```

**No password parameter.** The fixture creates sessions directly via Better Auth's server-side session API — passwords aren't part of the flow. Decision §2 explains why.

### Decision 2: Session creation bypasses the login form

The fixture does NOT navigate to `/login`, type credentials, and click submit. That approach is slow (browser round-trip), brittle (one form change breaks every authenticated test), and tests the login form alongside every other test (which we don't want — login is tested explicitly in its own spec).

Instead, the fixture:

1. Looks up the target seed user by email (`db.query.users.findFirst(...)`) — server-side, in the test fixture file
2. Creates a Better Auth session row directly via Better Auth's server-side session-creation API (whatever the canonical method is — `auth.api.signInEmail` or equivalent server-side mechanism that bypasses the form)
3. Sets the resulting session cookie on the Playwright `context` via `context.addCookies(...)`
4. Returns the page ready to navigate

**Two important constraints:**

- **No backdoor route.** Don't add a `/api/test/login` endpoint or any test-only auth bypass to production code. The fixture talks to Better Auth directly from the test process. If Better Auth doesn't expose a server-side session-creation API for this pattern, escalate — don't add a backdoor.
- **Test-only credentials.** The seed user passwords are already test-only (set in the seed script). The fixture doesn't need them. But Amelia confirms by inspecting Better Auth's API whether session creation needs the password hash or not.

### Decision 3: Targeted migration list — the specs to migrate, not all of them

This is the bounded scope. We migrate these specific specs because they each have at least one authenticated case that's currently deferred or worked around:

1. **`tests/e2e/become-a-host.spec.ts`** (Story 7-3) — currently covers unauthenticated redirect to `/login` only. Add: authenticated Guest submits valid application → State B (under review). Authenticated owner → no entry visible in dropdown. Authenticated admin → no entry visible in dropdown.

2. **`tests/e2e/admin-applications.spec.ts`** (Story 7-4) — currently covers unauthenticated redirect only. Add: authenticated admin filters and sorts the applications list. Authenticated admin approves a PENDING application → toast appears, applicant role promoted. Authenticated admin rejects via modal → toast appears, status flips.

3. **`tests/e2e/owner-routes.spec.ts`** (Story 7-5) — currently covers the 5 unauthenticated `/owner/*` redirect cases. Add: **authenticated cross-tenant test** (the security check from Story 7-5 Decision §8 that BA browser walk skipped). `fresh-owner` user navigates directly to a different owner's space URL → silent soft-redirect to `/owner/spaces`. This is the most important new test in this story.

4. **`tests/e2e/bookings.spec.ts`** (Phase 1 + Story 7-5) — if Phase 1's booking spec exists and currently fakes auth via direct DB inserts or skips authenticated cases, add at least one authenticated case: Guest books a desk → booking row exists. Owner confirms a PENDING booking on own space → status flips inline.

5. **`tests/e2e/applications-form.spec.ts`** or equivalent if it exists separately — same treatment as become-a-host.

**Exact spec filenames may differ from above** — Amelia inspects the `tests/e2e/` directory and migrates the specs that match the above patterns. If a planned spec doesn't exist, skip it (don't create new specs in this story beyond the cross-tenant case in owner-routes).

**Hard count: at least 5 new authenticated E2E cases** added across the migrated specs. More is fine. Fewer means the migration scope wasn't met.

### Decision 4: The cross-tenant test is non-negotiable

Story 7-5 Decision §8 demanded the cross-tenant ownership rejection test. The BA browser walk skipped it. The E2E suite must now cover it.

**Test specification:**

```typescript
test('owner cannot access another owner\'s space via direct URL', async ({ authenticatedPage }) => {
  const page = await authenticatedPage('fresh-owner')  // ihtiyor@mail.com, zero spaces
  const otherOwnerSpaceId = '<seeded owner@deskhive.local space ID>'

  await page.goto(`/owner/spaces/${otherOwnerSpaceId}`)

  // Expect soft-redirect to /owner/spaces, NOT a 403/404 error page
  await expect(page).toHaveURL('/owner/spaces')
  // Expect empty-state CTA (fresh-owner has zero spaces)
  await expect(page.locator('text=You haven\'t listed a space yet')).toBeVisible()
})
```

The seeded owner's space ID is known from the seed script (Story 7-5 Decision §10) — Amelia reads it from the seed file or queries the DB at fixture setup. If the seed makes the ID predictable (cuid is not predictable, so query by owner email), the test fetches it at runtime.

### Decision 5: Database state between tests

E2E tests historically share the seeded DB. This story doesn't change that — tests continue to read from seeded data and avoid mutating it where possible.

For tests that DO mutate (e.g., approving an application, confirming a booking), the existing Phase 1 pattern applies: either the test cleans up after itself, OR the test order is such that one test's mutation is the setup for another. **No new database reset infrastructure in this story.**

If specific migrated tests need fresh state, they use beforeEach to either re-seed a single row or pick a different seeded row that hasn't been touched. Amelia decides per spec.

### Decision 6: Migrated specs must not break existing CI

The migration adds authenticated cases but does not delete the existing unauthenticated cases. End state per migrated spec:

- Pre-existing unauthenticated redirect tests: **still present, still passing**
- New authenticated cases: **added alongside**, also passing
- Total spec test count: net positive (always more tests after migration than before)

If a migrated spec ends up with fewer tests than before, Amelia explains why before commit.

### Decision 7: CI baseline target after this story

Current baseline (end of Story 7-5):
- Unit tests: ~219
- E2E tests: 40
- Build routes: 36

After 7-PREP-1:
- Unit tests: ~219 (no change — this is an E2E story, no new unit tests expected)
- E2E tests: **45-50** (at least +5 from Decision §3; more is welcome but not required)
- Build routes: 36 (no change — no new production routes)

### Decision 8: Memory entry — "authenticated-first by default" testing principle

Amelia adds a memory file with:

- The `authenticatedPage(role)` fixture API and usage examples for all four roles
- The Better Auth server-side session-creation pattern (no login form, no backdoor route)
- A principle statement: **"From Theme B/C onward, E2E tests covering authenticated flows default to using the fixture. Unauthenticated redirect tests are still valuable for route-guard verification but should not be the only coverage for an authenticated feature."**
- A pointer to the 5 migrated specs as canonical examples of the migration pattern
- A note that opportunistic migration of remaining specs happens as future stories touch those files (no scheduled migration of Phase 1 specs in this story)

Suggested file name: `reference_authenticated_e2e_fixture.md` (Amelia picks per convention).

### Decision 9: This is NOT a place to refactor production code

If during the migration Amelia notices a bug in production code (e.g., the cross-tenant test fails because the ownership check isn't quite right), she **stops, flags the bug, and we triage**. She does NOT silently fix production bugs during a test-infra story.

Reason: this story should ship clean and predictable. Surprise production fixes mid-story make review harder and increase the risk of an unrelated regression.

If a bug is found, document it in a follow-up issue and either patch it in this story (with explicit BA approval) or defer to a dedicated bug-fix story.

### Decision 10: No new dependencies

The fixture is built on top of Playwright (already installed) and Better Auth (already installed). No new packages.

If Amelia thinks a new package is needed (e.g., `playwright-fixtures-extra` or similar), escalate before installing.

---

## Architectural anti-patterns forbidden

- **Do NOT** add a `/api/test/login` or any test-only backdoor route to production code (Decision §2)
- **Do NOT** navigate to `/login` and submit credentials in the fixture (slow, brittle — Decision §2)
- **Do NOT** require a password parameter in the fixture API (Decision §1)
- **Do NOT** migrate Phase 1 E2E specs that don't have an authenticated gap (out of scope)
- **Do NOT** migrate every Phase 2 spec (out of scope — only the 5 listed in Decision §3)
- **Do NOT** delete pre-existing unauthenticated tests during migration (Decision §6)
- **Do NOT** add new production routes
- **Do NOT** modify Better Auth configuration or session schema
- **Do NOT** modify the seed script
- **Do NOT** silently fix production code during this story (Decision §9 — escalate first)
- **Do NOT** add new seed users for E2E
- **Do NOT** install new dependencies (Decision §10)
- **Do NOT** add database reset infrastructure between tests (Decision §5)
- **Do NOT** add visual regression testing
- **Do NOT** add multi-browser or mobile viewport coverage

---

## Browser verification checklist

This is an E2E infrastructure story — most verification is via the test suite itself, not the browser. But a sanity check matters.

### Setup

- Dev server running on `localhost:3000`
- Seed run fresh: `pnpm db:seed`
- Test credentials still work via UI: log in once as `owner@deskhive.local` to confirm the seeded user is still authenticatable

### Checks

1. **All unit tests pass** — `pnpm test` runs clean. Baseline unchanged (~219).

2. **All E2E tests pass** — `pnpm test:e2e` runs clean. New baseline is 45-50 tests (at least +5).

3. **The cross-tenant E2E test exists and passes** — find it in the spec file, confirm it's the test described in Decision §4. Run it in isolation: `pnpm test:e2e --grep "cross-tenant"` or similar. Should pass.

4. **A migrated spec has at least one new authenticated case** — pick one (e.g., `become-a-host.spec.ts`) and read the spec file. Confirm there's at least one `test('... authenticated ...', async ({ authenticatedPage }) => ...)` block that didn't exist before.

5. **Production code is unchanged** — `git diff` shows changes only in:
   - `tests/` directory
   - `playwright.config.ts` (if fixture registration needs it)
   - Possibly `tests/README.md` for documentation
   - Memory file (outside `src/`)
   - **NO changes** to `src/` (or wherever Phase 1 puts production code)

6. **Browser smoke test — Story 7-4 + 7-5 still work end-to-end:**
   - Log in as Guest, apply via `/become-a-host` → form submits
   - Log in as admin, approve the application → user becomes SPACE_OWNER
   - Log in as owner (newly promoted), Switch to hosting, view dashboard → loads
   - This confirms the seed didn't break, Better Auth still works in the actual browser, and Theme A flows are intact

7. **No console errors** during the browser smoke test

8. **No new production routes** — `pnpm build` still produces 36 routes (unchanged from Story 7-5)

9. **Footer reads `© 2026 DeskHive`** during the smoke test (low-risk regression)

10. **CI runs clean on the commit** — if there's a CI pipeline, the run passes. If CI is local only, `pnpm test && pnpm test:e2e && pnpm typecheck && pnpm lint` all pass

---

## Files likely touched

Estimate, not directive.

- `tests/fixtures/authenticated-page.ts` (new) — the fixture implementation
- `tests/fixtures/index.ts` (new or updated) — fixture registration / extension of `test`
- `playwright.config.ts` — possibly updated to register the fixture
- `tests/e2e/become-a-host.spec.ts` — migrated per Decision §3
- `tests/e2e/admin-applications.spec.ts` — migrated per Decision §3
- `tests/e2e/owner-routes.spec.ts` — migrated + cross-tenant test added per Decision §4
- `tests/e2e/bookings.spec.ts` — migrated per Decision §3 (if exists)
- `tests/e2e/applications-form.spec.ts` or similar — migrated per Decision §3 (if exists separately)
- `tests/README.md` (new or updated) — documentation of the fixture
- Memory file in `~/.claude/.../memory/` — fixture + principle codified

**No changes to:**
- `src/` (production code)
- `drizzle/` (schema)
- `scripts/seed.ts`
- Better Auth configuration files
- `package.json` dependencies (Decision §10)

---

## Memory note for Phase 2 continuation

This prep story:

- Lands the fixture infrastructure that Theme B and Theme C will rely on
- Pays down the specific authenticated-E2E debt accumulated across Stories 7-1 through 7-5 (the bounded migration list)
- Codifies the cross-tenant security test that Story 7-5 Decision §8 demanded (closing the last gap from Theme A)
- Establishes "authenticated-first by default" as the testing principle for Theme B/C

**After 7-PREP-1 ships:**

- Theme C (Email, Epic 8) can ship with proper authenticated E2E coverage for every email flow — no further deferral
- Theme B (Payments, Epic 9) authenticated flows (Stripe Connect onboarding, payout views) also benefit
- Future Phase 1 spec migration is opportunistic — happens as B/C touch those files
- BA browser walks shift from "verify everything" to "verify the UX" — automation handles the contract testing

**Suggested next dispatch after this ships:** start Theme C with Story 8-1 (Resend wrapper + email service layer). Theme C ships in parallel with the second half of Theme B per the original Phase 2 sequencing plan.

---

**End of BA decisions document.**
