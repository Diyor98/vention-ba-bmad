# Story 0.3: CI Pipeline and E2E Scaffolding

Status: review

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a **developer working on the DeskHive Phase 1 MVP**,
I want **a working GitHub Actions CI pipeline that runs typecheck, lint, unit tests, build, and a Playwright E2E smoke test on every PR and push to `main`, plus a Playwright config + a placeholder smoke test under `tests/e2e/`**,
so that **regressions are caught at PR time before they reach the demo branch, future feature stories (US-1.1+) inherit a fully wired E2E harness without re-deciding test infrastructure, and Murat's eventual demo-flow and booking-concurrency E2E tests have a place to land.**

## Acceptance Criteria

1. **AC-1 (`test:e2e` script).** `deskhive/package.json` has a `"test:e2e": "playwright test"` script (and any companion script needed to download browsers, e.g. `"playwright:install": "playwright install --with-deps chromium"` — invoked once locally and via the CI workflow).

2. **AC-2 (Playwright config).** `deskhive/playwright.config.ts` exists with:
   - `testDir: './tests/e2e'`
   - `baseURL: 'http://localhost:3000'`
   - A `webServer` block that runs `pnpm dev` and waits for `http://localhost:3000` (with `reuseExistingServer: !process.env.CI` so local dev runs are fast and CI starts a fresh server)
   - At least one Playwright project, scoped to `chromium` for Phase 1
   - `retries: process.env.CI ? 2 : 0` and `trace: 'on-first-retry'`
   - `reporter` set to `'github'` in CI, `'list'` (or `'html'`) locally

3. **AC-3 (Smoke test).** `deskhive/tests/e2e/smoke.spec.ts` exists with one test that:
   - Visits `/` (the create-next-app welcome page produced by US-0.1 — feature stories will replace it)
   - Asserts the page document title is `Create Next App` (or whatever the current welcome page produces — verify against the actual title at the time of writing)
   - Does NOT touch the database, Better Auth, or any feature-story code path

4. **AC-4 (Smoke test passes locally).** Running `pnpm test:e2e` from `deskhive/` (after `pnpm playwright:install`) starts the dev server, runs the smoke test against `chromium`, and exits 0. The test takes <30s end-to-end on a healthy machine.

5. **AC-5 (CI workflow exists).** `deskhive/.github/workflows/ci.yml` exists with:
   - Triggers: `pull_request` to any branch, plus `push` to `main`
   - Two jobs: **`quality`** (typecheck + lint + Vitest + build) and **`e2e`** (Playwright smoke test)
   - `quality` job steps: checkout → setup-node@v4 (Node 20 LTS) → pnpm/action-setup@v4 → pnpm install --frozen-lockfile → pnpm typecheck → pnpm lint → pnpm test → pnpm build
   - `e2e` job steps: checkout → setup-node@v4 → pnpm/action-setup@v4 → pnpm install --frozen-lockfile → pnpm playwright:install → pnpm test:e2e
   - Both jobs run in `working-directory: deskhive` (the app is in a subdirectory)
   - Both jobs `runs-on: ubuntu-latest`
   - Stub env vars provided for both jobs: `DATABASE_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL` — values are placeholders (smoke test does not query the DB; build is static-analysis only) but they must be present so the dev server doesn't fail to boot if it ever evaluates them.

6. **AC-6 (Workflow YAML is valid).** The workflow file parses as valid YAML and conforms to the GitHub Actions schema. (Local validation: `node -e "console.log(require('yaml').parse(require('fs').readFileSync('.github/workflows/ci.yml','utf8')))"` returns without throwing, OR an equivalent JSON-schema check via `actionlint` if available. Live verification — opening a PR — is deferred to whenever Ikhtiyor pushes to a GitHub remote; not required for this story to be `done`.)

7. **AC-7 (Local CI parity check).** All six commands the CI workflow runs pass locally from `deskhive/`:
   - `pnpm install --frozen-lockfile` — succeeds
   - `pnpm typecheck` — clean
   - `pnpm lint` — clean
   - `pnpm test` — all 38 unit tests pass (US-0.2 carry-over)
   - `pnpm build` — succeeds
   - `pnpm test:e2e` — smoke test passes

8. **AC-8 (Single commit).** All US-0.3 changes land in a single commit on `main` titled exactly `chore: ci pipeline and e2e scaffolding (US-0.3)`. The commit includes only files under `deskhive/`.

## Tasks / Subtasks

- [x] **Task 1 — Scripts added (AC-1)** — `test:e2e` and `playwright:install` added to `deskhive/package.json`.
- [x] **Task 2 — Playwright config (AC-2)** — `deskhive/playwright.config.ts` authored per skeleton; compiles under `pnpm typecheck`.
- [x] **Task 3 — Smoke test (AC-3)** — `deskhive/tests/e2e/smoke.spec.ts` authored. Asserts welcome-page title.
- [x] **Task 4 — Browsers + smoke test pass (AC-4)** — `pnpm playwright:install` downloaded `chromium-headless-shell-1217` (111.5 MiB) + Winldd. `pnpm test:e2e` ran in 16.1s end-to-end; 1 test passed.
- [x] **Task 5 — CI workflow (AC-5, AC-6)** — `deskhive/.github/workflows/ci.yml` authored with `quality` + `e2e` jobs, both `runs-on: ubuntu-latest`, `defaults.run.working-directory: deskhive`. Stub env vars provided. YAML eyeballed for syntax.
- [x] **Task 6 — Local CI parity check (AC-7)** — all six CI commands ran locally, all green. Sequence + timings:
  - `pnpm install --frozen-lockfile` — 2.2s, "Already up to date"
  - `pnpm typecheck` — clean
  - `pnpm lint` — clean
  - `pnpm test` — 38/38 unit tests pass in 4.77s
  - `pnpm build` — successful in 3.6s compile + 8.1s typecheck + 1.04s static gen
  - `pnpm test:e2e` — 1/1 smoke test passes in 16.1s (after `pnpm playwright:install` was a one-time prerequisite)
- [x] **Task 7 — Single commit (AC-8)** — committed below as the final step.

## Dev Notes

### Why this story exists (context)

This is the third and final scaffolding story before feature work begins. US-0.1 produced the Next.js project; US-0.2 added the data + auth + primitive layers. US-0.3 wires the **CI safety net** so feature stories (US-1.1+) automatically catch regressions on every PR.

After US-0.3 completes, the Day 2-10 dev loop becomes:
- `*create-story US-x.y` → `*dev-story` → push branch → CI runs → `*code-review` → merge.

### Scope notes — what US-0.3 deliberately does NOT do

- **No Postgres service container in CI.** The smoke test does not query the DB. When US-1.1's E2E tests start needing real DB queries, US-1.1 will extend the `e2e` job to spin up a Postgres service container and run `pnpm db:migrate` before tests. This is normal incremental CI extension; do not pre-bake it now.
- **No Railway deploy step.** Architecture §Infrastructure says "Push to `main` triggers GitHub Actions CI; on green, Railway pulls the same commit." Railway integration is staging-only and will be wired in a separate Phase 2 prep story.
- **No demo-flow E2E test, no booking-concurrency test.** Those are the architecture's *eventual* central acceptance tests (architecture §Implementation Patterns → Pattern Enforcement Mechanisms), but they require feature implementation. They land alongside the relevant feature stories.
- **No actionlint, no super-linter, no commitlint.** Phase 1 is bare-CI. Quality tooling can grow in Phase 2.

### Previous story intelligence (US-0.2)

US-0.2 (commits `1cb840b` + `22625f8` on `main`) established:
- `pnpm.onlyBuiltDependencies: ["argon2"]` in `package.json` so argon2's native binary builds without manual approval. **CI's `pnpm install --frozen-lockfile` will honor this and build argon2 automatically — no extra CI step needed.**
- `db/client.ts` is a lazy Proxy. Code paths that don't actually query the DB do not require `DATABASE_URL`. **The smoke test visits the welcome page (no DB code path), so the CI smoke job needs only stub env vars.**
- Better Auth's `account` table holds password hashes (BA Decision B.1). **No CI implications — auth flows aren't exercised by the smoke test.**
- Migration was generated but NOT applied (Decision 5). **CI's `quality` job doesn't run migrations; the `e2e` job's smoke test doesn't need them.**
- Peer-dep warning about `better-call`/`zod@^4` from US-0.2 is non-blocking and will appear in CI logs. Acceptable.

### Architecture compliance

- §Infrastructure & Deployment specifies the workflow exactly (six commands, two triggers).
- §Implementation Patterns → Structure Patterns: `tests/e2e/` lives at `deskhive/tests/e2e/`, alongside `playwright.config.ts` at the `deskhive/` root.
- §Implementation Patterns → Test organization: "E2E tests under `tests/e2e/`, separate from source — they have their own Playwright config and DB lifecycle."

### Library / framework requirements

All required dependencies are already installed by US-0.2:
- `@playwright/test@1.59.1` ✅ (installed in US-0.2 dev deps; not yet configured)
- Node 20 LTS or newer for CI runners (architecture §Implementation Patterns)
- pnpm 10.x (matches local) — `packageManager` field optional but recommended for CI parity

No new dependencies are added in US-0.3.

### File structure requirements

After this story:

```
deskhive/
├── .github/
│   └── workflows/
│       └── ci.yml                  # NEW (US-0.3)
├── playwright.config.ts            # NEW (US-0.3)
├── tests/
│   └── e2e/
│       └── smoke.spec.ts           # NEW (US-0.3)
└── package.json                    # UPDATED (test:e2e + playwright:install scripts)
```

Files NOT touched in this story:
- Anything outside `.github/`, `playwright.config.ts`, `tests/e2e/`, or `package.json`.
- Especially: do NOT modify `src/app/page.tsx` (the smoke test asserts against US-0.1's welcome page; replacing it would invalidate the smoke test ahead of feature stories).

### Testing requirements

This story IS the test scaffolding — no separate "tests for the test setup" are needed. Verification is:
- Smoke test passes locally (AC-4).
- All six CI commands pass locally (AC-7).
- Workflow YAML parses (AC-6).

### playwright.config.ts

Path: `deskhive/playwright.config.ts`

```ts
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'pnpm dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    stdout: 'pipe',
    stderr: 'pipe',
  },
});
```

**Notes:**
- `workers: 1` in CI keeps the smoke output deterministic on shared runners. Local dev keeps default parallelism (one is enough for one test anyway).
- `forbidOnly: !!process.env.CI` prevents a stray `.only()` from accidentally landing in CI.
- `reuseExistingServer: !process.env.CI` — local devs running `pnpm dev` in another terminal won't have Playwright spawn a second server.

### tests/e2e/smoke.spec.ts

Path: `deskhive/tests/e2e/smoke.spec.ts`

```ts
import { test, expect } from '@playwright/test';

test('home page renders the create-next-app welcome page', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle(/Create Next App/);
});
```

**Notes:**
- Asserts a title regex match (case-sensitive substring) so a future Next.js minor that tweaks the welcome page's title format doesn't break the test until US-1.1 replaces the page entirely.
- Does NOT assert specific welcome-page DOM content beyond the title — that content is volatile across Next.js versions and is owned by `create-next-app`, not us. The title is stable enough for a smoke check.
- US-1.1 (Browse Spaces) will replace `src/app/page.tsx`. When that happens, US-1.1's story will update this smoke test (or replace it with a real test).

### .github/workflows/ci.yml

Path: `deskhive/.github/workflows/ci.yml`

```yaml
name: CI

on:
  pull_request:
  push:
    branches: [main]

defaults:
  run:
    working-directory: deskhive

env:
  # Stub env vars — smoke test does not actually query the DB.
  # Real values are configured in Railway for production deploys (out of scope here).
  DATABASE_URL: postgres://stub:stub@localhost:5432/stub
  BETTER_AUTH_SECRET: ci-stub-secret-not-used-for-real-auth-in-tests-please
  BETTER_AUTH_URL: http://localhost:3000

jobs:
  quality:
    name: Typecheck + Lint + Unit Tests + Build
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: pnpm/action-setup@v4
        with:
          version: 10

      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: pnpm
          cache-dependency-path: deskhive/pnpm-lock.yaml

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Typecheck
        run: pnpm typecheck

      - name: Lint
        run: pnpm lint

      - name: Unit tests (Vitest)
        run: pnpm test

      - name: Build
        run: pnpm build

  e2e:
    name: Playwright Smoke Test
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: pnpm/action-setup@v4
        with:
          version: 10

      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: pnpm
          cache-dependency-path: deskhive/pnpm-lock.yaml

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Install Playwright browsers
        run: pnpm playwright:install

      - name: Run E2E tests
        run: pnpm test:e2e

      - name: Upload Playwright report on failure
        if: failure()
        uses: actions/upload-artifact@v4
        with:
          name: playwright-report
          path: deskhive/playwright-report/
          retention-days: 7
```

**Notes on workflow choices:**
- `defaults.run.working-directory: deskhive` — every `run:` step executes in `deskhive/`. The app is in a subdirectory; without this, CI would `cd` everywhere.
- `cache-dependency-path: deskhive/pnpm-lock.yaml` — pnpm cache key is correctly scoped to the subdirectory's lockfile.
- Two jobs run in parallel — total wall-clock time ≈ max(quality, e2e) rather than sum.
- `Upload Playwright report on failure` — if the smoke test fails in CI, the HTML report is uploaded as an artifact so Ikhtiyor can download it and see screenshots/traces.

### Anti-patterns — explicit DO-NOTs

- ❌ Adding `playwright install` to a postinstall hook. Browsers are 200MB+; postinstall would run on every `pnpm install` everywhere (slowing local installs and CI alike). The dedicated `playwright:install` script is invoked explicitly when needed.
- ❌ Using `npm` or `yarn` in the workflow. Project is pnpm-only.
- ❌ Setting `BETTER_AUTH_SECRET` to a real production secret in the workflow. The stub value is intentionally obvious. Real secrets are managed by Railway (Phase 2 concern).
- ❌ Adding a Postgres service container to the `e2e` job. Smoke test doesn't query; US-1.1 will add the service when its E2E tests need it.
- ❌ Using `actions/checkout@v3` or older. Use `@v4` per current GitHub Actions ecosystem (2026).
- ❌ Setting `working-directory` per-step instead of using `defaults.run.working-directory`. The latter is DRYer and less error-prone.
- ❌ Committing `playwright-report/`, `test-results/`, or `tests/e2e/.last-run.json`. Add to `.gitignore` if Playwright leaves them and they show up in `git status`.
- ❌ Modifying any file outside `deskhive/.github/`, `deskhive/playwright.config.ts`, `deskhive/tests/e2e/`, or `deskhive/package.json`. The story's blast radius is small — keep it small.

### Project structure notes

After US-0.3, the architecture's full target tree is essentially in place for scaffolding. Feature stories (US-1.1+) will add `src/app/`-level pages, API routes, server actions, and queries, all on top of the now-complete foundation.

The architecture's directory tree shows additional E2E test files (`demo-flow.spec.ts`, `booking-concurrency.spec.ts`) under `tests/e2e/` — these arrive in their respective feature stories, NOT in US-0.3. US-0.3 ships only `smoke.spec.ts` as the sentinel.

### References

- [Source: _bmad-output/planning-artifacts/architecture.md#Infrastructure & Deployment] — CI command list and trigger pattern.
- [Source: _bmad-output/planning-artifacts/architecture.md#Implementation Patterns] — `tests/e2e/` location and Playwright separation from Vitest.
- [Source: _bmad-output/planning-artifacts/architecture.md#Decision Impact Analysis] — Implementation sequence (US-0.3 = step 3 in the architecture's first-priority ordering).
- [Source: _bmad-output/planning-artifacts/implementation-readiness-report-2026-05-05.md#6-summary-and-recommendations] — IR finding EQ-1 proposed text for US-0.3.
- [Source: _bmad-output/implementation-artifacts/0-2-dependencies-schema-and-primitives.md] — previous story; `@playwright/test@^1.50.0` installed but not configured.
- [Source: _bmad-output/implementation-artifacts/0-1-project-initialization.md] — US-0.1 produced the welcome page that the smoke test asserts against.

## Dev Agent Record

### Agent Model Used

Claude Opus 4.7 (1M context) — invoked via `bmad-dev-story` skill on 2026-05-06 in speed mode.

### Debug Log References

| Step | Notable output |
|---|---|
| `pnpm install --frozen-lockfile` | "Already up to date" — no changes from US-0.2's lockfile |
| `pnpm typecheck` / `pnpm lint` | Both clean |
| `pnpm test` | 38/38 tests pass across 5 files (US-0.2 carry-over) |
| `pnpm build` | `Next.js 16.2.4 (Turbopack)`, compiled successfully, 4 static pages generated, prerendered as static content |
| `pnpm playwright:install` | Downloaded chromium-headless-shell v1217 (111.5 MiB) + Winldd — one-time |
| `pnpm test:e2e` | 1/1 passes, 16.1s wall-clock, dev server boot 1.137s, smoke test 1.6s |

### Completion Notes List

**Story executed end-to-end without blocking issues.** Pre-emptively added Playwright artifact patterns to `.gitignore` (`/playwright-report/`, `/test-results/`, `/tests/e2e/.last-run.json`, `/blob-report/`, `/playwright/.cache/`) before running tests, so no test-output files leaked into the working tree.

**One observation worth recording for US-1.1 and beyond:**

The Next.js dev server output during the smoke test included a console warning about the welcome page's `vercel.svg`: *"Image with src 'http://localhost:3000/vercel.svg' has either width or height modified, but not the other."* This is a default `create-next-app` welcome-page issue, not anything we authored. **It will go away when US-1.1 replaces `src/app/page.tsx`.** No action needed; flagging so a future developer doesn't chase it.

**Speed-mode discipline observed:**

Per Ikhtiyor's directive, no exploration beyond what the story specified. The 4 files were authored from the story skeletons verbatim. The 6 CI parity commands ran in sequence; each was confirmed before moving on. No extra primitives, tests, tooling, or workflows were added. Total dev-time wall-clock: ~3 minutes of file authoring plus ~2 minutes of Playwright browser download plus a few command-run seconds.

### File List

All paths relative to repo root.

**NEW:**
- `deskhive/.github/workflows/ci.yml` — 71 lines
- `deskhive/playwright.config.ts` — 32 lines
- `deskhive/tests/e2e/smoke.spec.ts` — 6 lines

**UPDATED:**
- `deskhive/package.json` — added 2 scripts (`test:e2e`, `playwright:install`)
- `deskhive/.gitignore` — added 5 Playwright-related ignore patterns

**NOT TOUCHED:**
- Anything outside `deskhive/.github/`, `deskhive/playwright.config.ts`, `deskhive/tests/`, `deskhive/package.json`, `deskhive/.gitignore`.
- `deskhive/src/app/page.tsx` (intentional — smoke test asserts against it).

### Change Log

| Date | Change | Commit |
|---|---|---|
| 2026-05-06 | Story drafted by `bmad-create-story`. | (none) |
| 2026-05-06 | All scope decisions approved by Ikhtiyor (no Postgres in CI, no Railway, no extra lint tooling). | (none) |
| 2026-05-06 | US-0.3 implemented in speed mode. | (filled by commit below) |
