# Story 0.1: Project Initialization

Status: review

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a **developer working on the DeskHive Phase 1 MVP**,
I want **to initialize the Next.js application using the agreed starter command from the architecture document**,
so that **subsequent scaffolding (US-0.2 dependencies + schema, US-0.3 CI) and feature stories (US-1.1 onward) can build on a clean, pinned, reproducible Next.js 16 + Tailwind v4 + TypeScript foundation rather than fighting unintended starter opinions.**

## Acceptance Criteria

1. **AC-1 (Initialization command).** The project is initialized using **the exact `pnpm create next-app@latest` command from architecture §Starter Template Evaluation**, into a directory named `deskhive` at the repository root. No flags are added, removed, or reordered. No alternative starters (`create-t3-app`, `create-remix`, `saasykits/nextjs-sessionauth-template`, etc.) are used.

2. **AC-2 (Dev server boots).** Running `pnpm dev` from `deskhive/` starts the Next.js dev server with Turbopack on `http://localhost:3000` without errors. The default `create-next-app` welcome page renders in a browser.

3. **AC-3 (Starter configuration verified).** The resulting `deskhive/` directory has all of the following true after `create-next-app` completes:
   - `tsconfig.json` exists and has `"strict": true`.
   - `src/app/layout.tsx` and `src/app/page.tsx` exist (App Router enabled, `src/` dir enabled).
   - `src/app/globals.css` contains `@import "tailwindcss";` (Tailwind v4 configured).
   - `tsconfig.json` `paths` block contains `"@/*": ["./src/*"]` (import alias configured).
   - `package.json` lists Next.js 16.x as a dependency.
   - `package.json` `scripts.dev` runs Next.js with the Turbopack flag (default in Next.js 16).
   - `eslint.config.mjs` (or equivalent) exists.

4. **AC-4 (No premature additions).** The initialized project contains only what `create-next-app` produces. **No files have been added beyond `create-next-app` output.** Specifically, none of the following exist yet (they are owned by US-0.2 and US-0.3): `src/db/`, `src/components/`, `src/actions/`, `src/lib/`, `drizzle/`, `drizzle.config.ts`, `docker-compose.yml`, `middleware.ts`, `playwright.config.ts`, `vitest.config.ts`, `scripts/seed.ts`, `.github/workflows/`, any `better-auth` / `drizzle-orm` / `argon2` / `vitest` / `@playwright/test` packages in `package.json`.

5. **AC-5 (Initial commit).** A single initial commit titled exactly `chore: initialize next.js 16 project via create-next-app` exists on `main`. The commit includes the entire `deskhive/` directory tree as produced by `create-next-app`, with `node_modules/` and `.next/` properly excluded by the starter's default `.gitignore`. No content is committed outside `deskhive/`.

## Tasks / Subtasks

- [x] **Task 1 — Verify prerequisites (AC-1)**
  - [x] Confirm Node.js ≥ 20 LTS is installed: `node --version`. *Got: v24.14.1.*
  - [x] Confirm pnpm ≥ 9 is available: `pnpm --version`. *Got: 10.33.3.*
- [x] **Task 2 — Run the starter command (AC-1)**
  - [x] From the repository root, ran exactly the command from architecture §Starter Template Evaluation.
  - [x] Starter installed dependencies (1m 27s, 350 packages, no `--no-install`).
  - [x] No modifications to starter output.
- [x] **Task 3 — Verify the dev server (AC-2)**
  - [x] `cd deskhive && pnpm dev` — started in 1332ms.
  - [x] HTTP GET `http://localhost:3000/` returned 200 OK, 17400 bytes, `<title>Create Next App</title>`. (Used curl in lieu of an interactive browser; same surface.)
  - [x] Confirmed default Next.js welcome page renders. No errors in stdout/stderr.
  - [x] Stopped the dev server (`pkill`-equivalent); clean shutdown verified.
- [x] **Task 4 — Verify starter configuration (AC-3)**
  - [x] `deskhive/tsconfig.json` has `"strict": true` and `"@/*": ["./src/*"]`.
  - [x] `deskhive/src/app/globals.css` first line is `@import "tailwindcss";`.
  - [x] `deskhive/package.json` lists `"next": "16.2.4"` (`^16.x` target met).
  - [x] `deskhive/package.json` `scripts.dev` reads `"next dev"` (no explicit `--turbo` flag); the dev server's startup banner shows `▲ Next.js 16.2.4 (Turbopack)` confirming Turbopack is active by default in Next.js 16. AC-3's behavioral intent satisfied. *(See Completion Notes Issue 1.)*
  - [x] `deskhive/src/app/layout.tsx` and `deskhive/src/app/page.tsx` both exist.
- [x] **Task 5 — Verify no premature additions (AC-4)**
  - [x] Diffed the produced tree against the architecture's "Day 1 Follow-up Additions" list. **None of the forbidden files/dirs exist** (`src/db/`, `src/components/`, `src/actions/`, `src/lib/`, `drizzle/`, `drizzle.config.ts`, `docker-compose.yml`, `middleware.ts`, `playwright.config.ts`, `vitest.config.ts`, `scripts/seed.ts`, `.github/workflows/`).
  - [x] `package.json` lists only `next`/`react`/`react-dom` deps and `@tailwindcss/postcss`/`@types/*`/`eslint`/`eslint-config-next`/`tailwindcss`/`typescript` devDeps. No `better-auth`, `drizzle-orm`, `argon2`, `vitest`, or `@playwright/test`.
- [x] **Task 6 — Initial commit (AC-5)**
  - [x] From the repo root, `git add deskhive/` — 20 files staged, all under `deskhive/`.
  - [x] Verified `node_modules/` and `.next/` excluded by the starter's `.gitignore`.
  - [x] `git commit -m "chore: initialize next.js 16 project via create-next-app"` — commit `a32ff6e` on `main`.
  - [x] Not pushed (no Railway/CI yet — that's US-0.3).
  - [x] `deskhive/`-specific working tree is clean. Pre-existing untracked items (`_bmad-output/`, `docs/`, `.claude/settings.local.json`) are out of scope for this story. *(See Completion Notes Issue 2.)*

## Dev Notes

### Why this story exists (context)

This story was surfaced as IR finding **EQ-1** in the Day 1 Implementation Readiness report. The architecture (§Starter Template Evaluation) requires `create-next-app@latest` as the project foundation, but Document B §8 — the merged Phase 1 PRD/Epics/Stories — begins at US-1.1 (Guest Registration) and assumes a working application. Without this scaffolding story, Amelia would face an empty repository at the start of US-1.1.

Three scaffolding stories (US-0.1, US-0.2, US-0.3) precede US-1.1 in the sprint plan. **This is the first.**

### Why these specific flags (do not deviate)

The starter command is reproduced verbatim from `architecture.md §Starter Template Evaluation`. Each flag matters:

| Flag | Why |
|---|---|
| `--typescript` | Doc B NFR-stack assumes TypeScript-on-Node. Locked. |
| `--tailwind` | Doc B §7.1 requires Tailwind. Auto-configures Tailwind v4 with the Next.js Tailwind PostCSS plugin. |
| `--app` | Doc B implementation depends on Server Components and Server Actions per architecture §Frontend Architecture. App Router only; Pages Router is in maintenance per Next.js 16 release notes. |
| `--eslint` | Architecture §Implementation Patterns → Enforcement Mechanisms relies on ESLint rules (`naming-convention`, `no-console`, `import/order`). |
| `--src-dir` | Architecture §Project Structure mandates the `src/` layout. |
| `--import-alias "@/*"` | Architecture mandates `@/*` absolute imports throughout. |
| `--turbo` | Default in Next.js 16 anyway, but explicit for safety. Faster builds and Fast Refresh. |
| `--use-pnpm` | Architecture chose pnpm. If you switch to npm/yarn, downstream lockfile assumptions break. |

### What this story explicitly does NOT do (do not be helpful)

The architecture's "Day 1 Follow-up Additions" list and full directory layout are **US-0.2's job**, not this story's. **Resist any temptation to be helpful by:**

- Installing `drizzle-orm`, `drizzle-kit`, `pg`, `better-auth`, `argon2`, `zod`, `vitest`, `@playwright/test`, or any other dependency.
- Creating `src/db/`, `src/components/`, `src/actions/`, `src/lib/`, or any subdirectory not produced by `create-next-app`.
- Authoring `drizzle.config.ts`, `docker-compose.yml`, `middleware.ts`, `playwright.config.ts`, `vitest.config.ts`, `scripts/seed.ts`, `.env.local`, `.env.example`, or `.github/workflows/ci.yml`.
- Modifying the default `src/app/page.tsx` content.
- Creating any database, schema, or auth code.
- Committing partial work toward US-0.2.

The reason for the strict boundary is **auditability**: each story's commit set should be reviewable in isolation. Mixing US-0.1 with US-0.2 makes the diff unreadable and breaks the story-by-story progression that makes the sprint trackable.

### Expected output structure (from `create-next-app` defaults)

After running the command, `deskhive/` should look approximately like this:

```
deskhive/
├── .gitignore                  # excludes node_modules, .next, .env*.local, etc.
├── README.md                   # default Next.js README
├── eslint.config.mjs
├── next.config.ts
├── next-env.d.ts
├── package.json
├── pnpm-lock.yaml
├── postcss.config.mjs          # Tailwind v4 PostCSS plugin
├── public/
│   ├── file.svg
│   ├── globe.svg
│   ├── next.svg
│   ├── vercel.svg
│   └── window.svg
├── src/
│   └── app/
│       ├── favicon.ico
│       ├── globals.css         # contains `@import "tailwindcss";`
│       ├── layout.tsx
│       └── page.tsx            # default Next.js welcome page
├── tsconfig.json
└── node_modules/               # installed by starter, gitignored
```

The starter may rename or restructure some files between Next.js versions; the structural assertions in AC-3 are the binding ones.

### Architecture compliance

This story does not exercise any architecture decision beyond the starter command itself. All architectural patterns (auth, data, state, etc.) come into play in US-0.2 and feature stories.

**Key reference:** [_bmad-output/planning-artifacts/architecture.md](../planning-artifacts/architecture.md) §Starter Template Evaluation — full rationale and the verbatim init command.

### Library / framework requirements (latest as of 2026-05-06)

The `create-next-app@latest` invocation pulls **whatever is current at install time**. Expected versions per Day 1's web research:

- Next.js: `16.x` (current stable: 16.2 as of 2026-03-18)
- React: `19.x` (bundled with Next.js 16)
- Tailwind CSS: `v4.x` (current stable since 2025-01-22)
- TypeScript: `5.x`
- ESLint: `9.x`

If `create-next-app` produces a major-version below the above (e.g. Next.js 15), STOP and escalate to the BA — the architecture assumes Next.js 16 features (Turbopack default, React Compiler stable, App Router stability).

### File-structure requirements

After this story, the repository should have **only**:

- The pre-existing `_bmad/`, `_bmad-output/`, `docs/`, `.git/` etc. directories (untouched).
- A new `deskhive/` directory containing the `create-next-app` output.

No files at the repository root should be created or modified except for the new `deskhive/` directory. Do not add a root-level `.gitignore`, `README.md`, or any other file in this story.

### Testing requirements

This is a scaffolding story; **no automated tests are written here**. Test framework configuration (Vitest, Playwright) is part of US-0.2 and US-0.3.

Verification is **manual** for this story:

1. `pnpm dev` shows a server URL with no errors.
2. Browser at `localhost:3000` shows the default Next.js page.
3. Browser console is clean.
4. Terminal (after Ctrl+C) shows clean shutdown.

### Anti-patterns — explicit DO-NOTs for this story

- ❌ Using `npx create-next-app` instead of `pnpm create next-app` — the starter then installs an npm lockfile, conflicting with the architecture's pnpm choice.
- ❌ Skipping the `--use-pnpm` flag and accepting the interactive prompt — the prompt may default to npm depending on environment.
- ❌ Adding `--ts-strict-config` or any flag not in the canonical command list. The starter's defaults already give us strict mode.
- ❌ Cleaning up the default page boilerplate (the `src/app/page.tsx` with the Next.js logo). It's the verification surface for AC-2 and AC-3.
- ❌ Renaming the project directory from `deskhive` to anything else.
- ❌ Initializing the project at the repository root instead of inside a `deskhive/` subdirectory. The architecture's directory structure assumes the app lives in `deskhive/`, with the BMad orchestration workspace (`_bmad/`, `_bmad-output/`, `docs/`) at the parent level.
- ❌ Running `pnpm install` or `pnpm add` for any additional package after the starter completes. US-0.2 owns dependency additions.
- ❌ Force-pushing or amending the initial commit if a hook fails — fix the underlying issue and create a new commit.

### Project structure notes

The architecture's full directory tree (architecture.md §Implementation Patterns → Structure Patterns) describes the *eventual* state after US-0.2 and US-0.3 complete. **This story produces only a small subset** — specifically, only the files `create-next-app` generates.

Conflicts/variances vs. the architecture's planned tree:
- **Expected variances:** absence of `src/db/`, `src/components/`, `src/actions/`, `src/lib/`, `drizzle/`, `tests/e2e/`, `docker-compose.yml`, `drizzle.config.ts`, `playwright.config.ts`, `vitest.config.ts`, `middleware.ts`, `scripts/`, `.github/workflows/`, `.env.example`. **All of these arrive in US-0.2 and US-0.3 — they are not bugs in this story.**
- **No actual conflicts.** The starter's output is a strict subset of the architecture's planned tree.

### References

- [Source: _bmad-output/planning-artifacts/architecture.md#Starter Template Evaluation] — verbatim init command, flag rationale, and version pins.
- [Source: _bmad-output/planning-artifacts/architecture.md#Implementation Patterns] — full target directory tree (the *eventual* state after US-0.2 + US-0.3).
- [Source: _bmad-output/planning-artifacts/implementation-readiness-report-2026-05-05.md#6-summary-and-recommendations] — IR finding EQ-1 and the proposed text for this story.
- [Source: docs/02-phase1-prd.md#Section 7.1] — Tailwind-only design philosophy (informs why we accept the Tailwind defaults from the starter).
- [Source: Next.js 16 release notes — verified 2026-05-05] — Turbopack default, React Compiler stable, App Router stability.

## Dev Agent Record

### Agent Model Used

Claude Opus 4.7 (1M context) — invoked via `bmad-dev-story` skill on 2026-05-06.

### Debug Log References

| Step | Notable output |
|---|---|
| Prereq check | `node v24.14.1`, `pnpm 10.33.3`, no existing `deskhive/` |
| `pnpm create next-app@latest` | 1m 27.2s, 350 packages added, exit 0. Versions: next 16.2.4, react 19.2.4, react-dom 19.2.4, @tailwindcss/postcss 4.2.4, tailwindcss 4.2.4, typescript 5.9.3, eslint 9.39.4, eslint-config-next 16.2.4. |
| `pnpm dev` startup banner | `▲ Next.js 16.2.4 (Turbopack)` / `Local: http://localhost:3000` / `✓ Ready in 1332ms` |
| `curl http://localhost:3000/` | HTTP 200, 17400 bytes, `<title>Create Next App</title>`, references to `[turbopack]` chunks |
| `git commit` | `[main a32ff6e] chore: initialize next.js 16 project via create-next-app — 20 files changed, 4378 insertions(+)` |

### Completion Notes List

**Story executed end-to-end without blocking issues.** Two non-blocking observations:

**Issue 1 (informational, AC nuance) — Turbopack flag absent from `package.json` script string.**
The story's AC-3 expected `package.json` `scripts.dev` to "run Next.js with the Turbopack flag." The starter generated `"dev": "next dev"` — no explicit `--turbo` flag. However, in Next.js 16 Turbopack is the **default** bundler; the dev server's own startup banner (`▲ Next.js 16.2.4 (Turbopack)`) and the page's `[turbopack]` chunk URLs confirm Turbopack is active. The architecture document itself acknowledged this: *"Default in Next.js 16 anyway, but explicit for safety."* AC-3 should be read as a **behavioral** requirement (use Turbopack) rather than a **string** requirement (literal `--turbo` in script). The behavior is correct. **No fix needed.** Recommendation: when US-0.2 lands, consider whether to explicitly add `next dev --turbopack` to the script for visibility, or leave it implicit.

**Issue 2 (informational, scope boundary) — pre-existing untracked files outside `deskhive/`.**
After committing US-0.1, `git status --short` shows three pre-existing untracked items: `_bmad-output/` (BMad orchestration artifacts), `docs/` (PRDs), `.claude/settings.local.json` (Claude Code settings). These were already untracked when US-0.1 began and are outside this story's scope. The story's commit is clean and contains only `deskhive/` content. The user should decide separately when/whether to commit the orchestration artifacts (or add them to a root `.gitignore`). **Out of US-0.1 scope; flagging for awareness during code review.**

**Three minor surprises from `create-next-app` not anticipated by the story's "Expected output structure"** — none are violations:
- `AGENTS.md` (327B) — Vercel's standard agent-context file; new in recent `create-next-app`.
- `CLAUDE.md` (11B) — Claude Code-friendly placeholder; new in recent `create-next-app`.
- `pnpm-workspace.yaml` (57B) — pnpm workspace config the starter now generates by default.

All three were produced by `create-next-app` itself, so they fall within AC-4's "only what `create-next-app` produces" allowance.

### File List

All paths relative to repo root. All NEW; no UPDATEs to pre-existing files outside `deskhive/`.

| Path | Status | Source |
|---|---|---|
| `deskhive/.gitignore` | NEW | create-next-app default |
| `deskhive/AGENTS.md` | NEW | create-next-app default |
| `deskhive/CLAUDE.md` | NEW | create-next-app default |
| `deskhive/README.md` | NEW | create-next-app default |
| `deskhive/eslint.config.mjs` | NEW | create-next-app default |
| `deskhive/next.config.ts` | NEW | create-next-app default |
| `deskhive/package.json` | NEW | create-next-app default |
| `deskhive/pnpm-lock.yaml` | NEW | create-next-app default |
| `deskhive/pnpm-workspace.yaml` | NEW | create-next-app default |
| `deskhive/postcss.config.mjs` | NEW | create-next-app default |
| `deskhive/public/file.svg` | NEW | create-next-app default |
| `deskhive/public/globe.svg` | NEW | create-next-app default |
| `deskhive/public/next.svg` | NEW | create-next-app default |
| `deskhive/public/vercel.svg` | NEW | create-next-app default |
| `deskhive/public/window.svg` | NEW | create-next-app default |
| `deskhive/src/app/favicon.ico` | NEW | create-next-app default |
| `deskhive/src/app/globals.css` | NEW | create-next-app default |
| `deskhive/src/app/layout.tsx` | NEW | create-next-app default |
| `deskhive/src/app/page.tsx` | NEW | create-next-app default |
| `deskhive/tsconfig.json` | NEW | create-next-app default |

**Excluded from commit** (gitignored by `deskhive/.gitignore`): `deskhive/node_modules/`, `deskhive/.next/`, `deskhive/next-env.d.ts`.

**No files outside `deskhive/`** were created or modified by this story.

### Change Log

| Date | Change | Commit |
|---|---|---|
| 2026-05-06 | Initialized Next.js 16 project via `create-next-app` per architecture §Starter Template Evaluation. 20 files, 4378 insertions. | `a32ff6e` |
