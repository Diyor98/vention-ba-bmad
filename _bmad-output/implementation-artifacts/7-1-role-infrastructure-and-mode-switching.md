# Story 7.1: Role Infrastructure + Mode Switching

Status: review

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a **product team opening Phase 2's multi-tenant theme**,
I want **the SPACE_OWNER role wired through the schema, auth helpers, header nav, and post-auth mode-switching affordance, with stub `/owner/*` routes ready for Story 7.5 to fill in**,
so that **a user can sign in, switch into Host mode, see the Host nav, and explore the (placeholder) owner surface — verifying the post-auth Airbnb-model role switch end-to-end before any application or dashboard logic exists.**

> Story 7.1 opens **Epic 7 — Multi-Tenant (Space Owner Role)** and **Phase 2** overall. Source of truth: [docs/design/7-1-role-infrastructure-and-mode-switching-ba-decisions.md](docs/design/7-1-role-infrastructure-and-mode-switching-ba-decisions.md). The BA combined what was originally 7-1 (role infrastructure with dormant nav) and 7-5 (mode-switching wire-up) into this one story to eliminate the dormant-code smell. **The PRD renumbering ripples through Epic 7:** original 7-2/3/4 stay (applications data model → guest apply → admin review); original 7-6 becomes new 7-5 (owner dashboard fills in the `/owner/*` stubs from this story).

> **Foundational story, not feature delivery.** The visible behavior shipped is small (header dropdown affordance + 3 stub pages + 1 cookie + 1 Server Action). The foundation laid is large (new role, new column, new auth-aware mode concept, new memory pattern for Phase 2 to reuse).

## Critical naming evolution: `SPACE_ADMIN` → `SPACE_OWNER`

Phase 1 schema reserved `SPACE_ADMIN` as a TS literal in `Role` (`src/db/schema.ts:171`) per architecture.md §7.4 forward-compat. The BA decisions doc for this story (and the Phase 2 PRD it cites) settled on **`SPACE_OWNER`** as the product-facing role name — better aligned with the user-visible language ("Switch to hosting" / "Space Owner application") and the Airbnb-model framing locked in Story 6.6's memory.

**This story renames the literal:** `Role = 'GUEST' | 'SUPER_ADMIN' | 'SPACE_ADMIN'` → `Role = 'GUEST' | 'SUPER_ADMIN' | 'SPACE_OWNER'`. The DB CHECK constraint is extended with the new value (no `SPACE_ADMIN` to migrate from — Phase 1 CHECK was `IN ('GUEST', 'SUPER_ADMIN')`, the literal-only reservation was never written to the DB). The architecture.md note is OUT OF SCOPE per BA's "do NOT update design package files" pattern; the rename is documented in the new memory entry instead.

## Acceptance Criteria

> Source: BA Decisions document, Decisions 1–10 + Browser verification checklist + locked Option A from "Open question".

1. **AC-1 (Schema — extend role CHECK + add `spaces.owner_id`).** In [src/db/schema.ts](deskhive/src/db/schema.ts):
   - `usersTable`'s CHECK constraint: `${t.role} IN ('GUEST', 'SUPER_ADMIN')` → `${t.role} IN ('GUEST', 'SUPER_ADMIN', 'SPACE_OWNER')`.
   - `spacesTable`: add nullable `ownerId: uuid('owner_id').references(() => usersTable.id)` column. **Nullable** — Phase 1 seeded spaces have NULL `owner_id` and continue to work. No backfill in this story.
   - `Role` type literal: `'GUEST' | 'SUPER_ADMIN' | 'SPACE_ADMIN'` → `'GUEST' | 'SUPER_ADMIN' | 'SPACE_OWNER'`. Update the leading comment on lines 169–171 to reflect Phase 2's chosen name + the rename rationale.

2. **AC-2 (Drizzle migration generation + reversibility documentation).** Generate the migration via `pnpm drizzle-kit generate` (yields `drizzle/migrations/0001_*.sql`). The generated SQL must:
   - DROP and re-ADD the `users_role_check` CHECK constraint with the expanded enum.
   - ADD `owner_id` column to `spaces` with the foreign-key reference.
   - **Reversibility (Decision §8):** drizzle-kit does not auto-generate `down.sql`. Add a leading comment block to the generated migration documenting the rollback steps in SQL (DROP constraint, re-ADD with original 2-value enum; DROP COLUMN owner_id). The dev-agent picks: comment block OR a sibling `0001_*.down.sql` file (drizzle-kit's convention is loose; document the choice in Completion Notes).
   - Run `pnpm drizzle-kit migrate` against the configured Neon database. Verify the migration applies cleanly. Spot-check via psql or Drizzle Studio that the constraint and column are present.

3. **AC-3 (Mode cookie helpers — `src/lib/mode.ts` new file).** Create a small helper module that owns the `deskhive_mode` cookie:
   - `readMode(): Promise<'guest' | 'host'>` — reads the cookie via `cookies()` from `next/headers`. Returns `'guest'` when the cookie is absent or malformed. **Does NOT** validate role here — that's `effectiveMode`'s job.
   - `effectiveMode(session: AuthSession | null): Promise<'guest' | 'host'>` — reads the cookie AND validates against the session's role. If `cookie === 'host'` but `session.user.role !== 'SPACE_OWNER'`, returns `'guest'`. Defense against stale cookies after a hypothetical future role downgrade (BA Decision §2 explicit requirement).
   - Constants: `MODE_COOKIE_NAME = 'deskhive_mode' as const`, `MODE_VALUES = ['guest', 'host'] as const`. Export both so tests + the Server Action share the same source of truth.
   - No `'use client'` — this module is server-only. Importing from a Client Component is a hard error; document in a comment.

4. **AC-4 (`switchModeAction` Server Action — `src/actions/mode.ts` new file).** Per BA Decision §5:
   - File begins with `'use server';`.
   - Signature: `switchModeAction(_prevState: SwitchModeActionState, formData: FormData): Promise<SwitchModeActionState>`. The target mode comes from `formData.get('targetMode')` (a hidden input in the form). The `useActionState`-compatible shape mirrors all Phase 1 Server Actions.
   - State type: `SwitchModeActionState = { status: 'idle' } | { status: 'success' } | { status: 'error'; code: 'UNAUTHORIZED' | 'FORBIDDEN' | 'INVALID_TARGET' | 'INTERNAL_ERROR'; message: string }`.
   - Logic:
     1. `requireSession()` — if no session, return `{ status: 'error', code: 'UNAUTHORIZED', message: 'Please log in.' }` (do NOT redirect — Server Action is a fragment; the form's parent handles the auth state).
     2. Validate `targetMode` is `'guest'` or `'host'` — return `INVALID_TARGET` otherwise.
     3. If `targetMode === 'host'` AND `session.user.role !== 'SPACE_OWNER'` AND `session.user.role !== 'SUPER_ADMIN'`: return `FORBIDDEN`. **Note SUPER_ADMIN is intentionally NOT allowed to switch to Host mode** (BA Decision §3: "SUPER_ADMIN users: no switch option, no Host mode" — admins use the existing `/admin/*` chrome). So the role gate here is strictly `=== 'SPACE_OWNER'`.
     4. Set the cookie via `cookies().set(MODE_COOKIE_NAME, targetMode, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/' })`. **No `maxAge`** — session cookie (cleared when browser closes).
     5. `revalidatePath('/', 'layout')` — refreshes the header on the next render.
     6. Return `{ status: 'success' }`.
   - **Verbatim error messages** per a minimal set: `'Please log in.'` / `'You don't have permission to switch to Host mode.'` / `'Invalid mode.'` / `'Something went wrong. Please try again.'`. Lock them as `SWITCH_MODE_MESSAGES` constants in the file.

5. **AC-5 (Header nav — 5 variants, role + mode aware).** Refactor [src/components/header.tsx](deskhive/src/components/header.tsx) to render the variants per BA Decision §4 table:
   - **Public (logged out):** unchanged — logo + Browse spaces + Log in + Sign up.
   - **Guest user (logged in, role === 'GUEST'):** unchanged — logo + Browse spaces + My bookings + user-pill + Log out.
   - **SPACE_OWNER in Guest mode:** logo + Browse spaces + My bookings + user-pill (with "Switch to hosting" affordance) + Log out.
   - **SPACE_OWNER in Host mode:** logo + Dashboard (`/owner`) + My spaces (`/owner/spaces`) + Bookings (`/owner/bookings`) + user-pill (with "Switch to traveling" affordance) + Log out.
   - **SUPER_ADMIN (role === 'SUPER_ADMIN'):** unchanged from Story 6.2 — logo + Browse spaces + Admin (`/admin/spaces`) + user-pill (NO switch affordance) + Log out.
   - The Header is a Server Component (today's pattern preserved). It reads the session via `auth.api.getSession({ headers: await headers() })` AND calls `await effectiveMode(session)` from `src/lib/mode.ts`. The mode and role together determine which variant to render. Update the leading source-comment block with the new variant table (Decision §4).

6. **AC-6 (User-pill dropdown — "Switch to hosting" / "Switch to traveling" affordance).** The switch lives inside the user-pill dropdown per BA Decision §3 + §5 ("dropdown's switch item is a form submission, not a link"):
   - Today the user-pill renders inline (`<span className="user-pill">…</span>`) without a dropdown. **Add a minimal dropdown** keyed by `aria-haspopup="menu"` + `aria-expanded`. Implementation: a tiny `<UserPill>` Client Component (`'use client'`) using a `<details>` element OR `useState` + outside-click handler — pick the simpler. The Header Server Component passes the necessary props (role, mode, displayName, initial).
   - When `role === 'SPACE_OWNER'`, the dropdown contains a `<form action={switchModeAction}>` with a hidden `<input name="targetMode" value="host" | "guest">` (depending on current mode) and a button labeled `Switch to hosting` (when in Guest mode) or `Switch to traveling` (when in Host mode).
   - When `role === 'SUPER_ADMIN'` or `role === 'GUEST'`, the dropdown has no switch entry. (The dropdown itself can stay since it's a useful UI affordance home, even if currently empty for those roles — the **Log out** button can live inside it. Dev-agent picks: dropdown for all logged-in users with role-aware contents, OR dropdown only for SPACE_OWNER; document choice in Completion Notes.)
   - Keyboard-accessible (Tab to focus, Enter/Space to open). Sonner's keyboard pattern + `<details>` summary is the simplest path.

7. **AC-7 (Three `/owner/*` placeholder pages).** Per BA Decision §4 + AC-5's nav targets:
   - `src/app/(owner)/owner/page.tsx` — Server Component. Renders a minimal page with `.page-h1` "Dashboard" + a muted paragraph: `Coming soon — full owner dashboard in Story 7-5.` Guards: `requireSession()` + role check `=== 'SPACE_OWNER'` → if not, redirect to `/` (Guest) or `/admin/spaces` (Super Admin) per the role-redirect pattern from Story 6.2.
   - `src/app/(owner)/owner/spaces/page.tsx` — Same shape. h1 "My spaces" + "Coming soon" copy.
   - `src/app/(owner)/owner/bookings/page.tsx` — Same shape. h1 "Bookings" + "Coming soon" copy.
   - All three pages inherit the global Header from `app/layout.tsx` (no separate `app/(owner)/layout.tsx` needed unless the dev-agent finds a tight reason). The Header's Host-mode variant takes care of the in-page nav.
   - Route group `(owner)` chosen to mirror Phase 1's `(public)` grouping convention.

8. **AC-8 (Owner-route role guard — soft redirect, not deny).** Per Story 6.2's locked pattern (memory: `reference_role_specific_nav_pattern.md`):
   - Each `/owner/*` page calls `requireSession()` first. If unauthenticated → `redirect('/login?callbackUrl=<original-path>')`.
   - Then check `session.user.role`. If `role !== 'SPACE_OWNER'`:
     - `role === 'SUPER_ADMIN'` → `redirect('/admin/spaces')` (admin's natural workspace).
     - Otherwise (Guest or any future role) → `redirect('/')` (Browse spaces, the guest landing).
   - **Inline check pattern**, NOT `requireRole(session, 'SPACE_OWNER')` from `lib/auth/guards.ts` — that helper throws `AuthError(403)`, wrong shape for a "wrong role, send them somewhere useful" redirect. Matches Story 6.2's documented decision in its memory.

9. **AC-9 (Sticky mode — Decision §"Open question" lock to Option A).** Per the BA's locked decision:
   - Mode does NOT auto-switch when a SPACE_OWNER navigates between guest-feeling and host-feeling routes. The cookie is sticky; switching only happens via the affordance.
   - Example: SPACE_OWNER in Host mode navigates to `/` (Browse spaces). The page renders normally for browsing, the Header continues to show Host-mode nav (Dashboard + My spaces + Bookings + user-pill with "Switch to traveling" + Log out). User is allowed to be both Host and Guest; they explicitly opt in/out.
   - Caveat: the `/my-bookings` Story 6.2 admin redirect for SUPER_ADMIN is **not** affected — it's a server-side role redirect for a different role, orthogonal to mode. A SPACE_OWNER in either mode hitting `/my-bookings` sees their own bookings (they can be a guest of someone else's space).

10. **AC-10 (Role-helper extension — `requireRole` already covers SPACE_OWNER).** Per BA Decision §7 ("extend, don't refactor"):
    - The existing `requireRole(session, role: Role)` helper in `src/lib/auth/guards.ts` already accepts any value from the `Role` union. Once `Role` is extended in AC-1, **`requireRole` automatically accepts `'SPACE_OWNER'` with zero code change**. No new helper required.
    - **Do NOT introduce** `isSpaceOwner(user)` or `hasRole(user, role)` helpers as part of this story. The story's inline checks for the soft-redirect pattern (AC-8) cast `session.user.role` directly — that's the cleanest expression for soft redirects, matching Story 6.2's pattern.
    - The existing `requireRole` test in `lib/auth/guards.test.ts` continues to pass without modification. The dev-agent may **add** a small new test asserting `requireRole(session, 'SPACE_OWNER')` accepts a SPACE_OWNER session and rejects others — symmetric with the existing SUPER_ADMIN test. Bundled in this story; not a blocker if the dev-agent decides it's over-specification.

11. **AC-11 (Seed update — `owner@deskhive.local` SPACE_OWNER).** Per BA Decision §6 + the existing seed pattern from Story 6-1:
    - Extend `scripts/seed.ts` (or its current location/equivalent) to also seed `owner@deskhive.local` as a SPACE_OWNER. Follow the established pattern: sign up via `auth.api.signUpEmail`, then direct DB UPDATE to set `role = 'SPACE_OWNER'` and `fullName = 'DeskHive Space Owner'`. Idempotent — if the user already exists, skip.
    - Document credentials in seed comments: `owner@deskhive.local` / `SpaceOwner1!` (matching the admin pattern `SuperAdmin1!`). Also update `deskhive/README.md` if it documents seed credentials (verify in Task 0 audit).
    - Verify by running `pnpm db:seed` against the dev DB and confirming the user is created with the correct role.

12. **AC-12 (No changes to Better Auth, register, login, callback URL guard, or existing Phase 1 admin routes).** Per BA Decisions §9 + anti-patterns:
    - `src/lib/auth/config.ts` — unchanged. `additionalFields.role.defaultValue: 'GUEST'` and `input: false` continue to gate role at register. SPACE_OWNER promotion happens via direct DB UPDATE only (seed or future Story 7-4).
    - `loginAction` / `registerAction` — unchanged.
    - `/admin/spaces`, `/admin/spaces/[id]`, `/admin/bookings`, `/admin/guests` — all unchanged. Phase 1 admin chrome preserved.
    - `(public)/login/login-form.tsx` from Story 6.6 — unchanged. No reintroduction of any pre-auth toggle.

13. **AC-13 (No regression in any Phase 1 / Epic 6 flow).** Every flow verified through Story 6.6 must still work:
    - US-1.1–1.3 auth flows; Story 6.6 simplified login form preserved (no toggle).
    - US-2.x admin spaces/desks CRUD; Story 6.1 dollar-input still works.
    - US-3.1–3.5 guest browse/book/cancel; Story 6.3 toast on `/spaces/[id]` still fires.
    - US-4.1–4.3 admin Confirm/Reject; Story 5.2 admin reskin preserved.
    - Story 6.2 admin redirect on `/my-bookings` continues to work.
    - Footer `© 2026 DeskHive` everywhere.
    - 166 unit + 31 E2E baseline still pass (plus any small tests this story adds — `mode.ts` helpers + optional `switchModeAction` state-machine test).
    - `pnpm typecheck` / `lint` / `test` / `build` / `test:e2e` all clean.

14. **AC-14 (Memory entry — `reference_role_and_mode_switching.md`).** Per BA Decision §10:
    - New memory file `~/.claude/.../memory/reference_role_and_mode_switching.md`. Type: `reference`. Codifies:
      - `deskhive_mode` cookie pattern (name, values, default, HttpOnly+SameSite=Lax+Secure-in-prod, no maxAge).
      - The "Switch to hosting / Switch to traveling" affordance pattern as the canonical post-auth role switcher (Airbnb model).
      - The header nav variants table from BA Decision §4 (5 variants).
      - The `effectiveMode(session)` validation requirement: a Host-mode cookie is only honored if the session's role is SPACE_OWNER; otherwise falls back to Guest. Server-side, defense against stale cookies.
      - Cross-reference: `project_login_single_form_post_auth_role_switch.md` (Story 6.6 — one-login model, this memory complements it with the implementation).
      - The `SPACE_ADMIN` → `SPACE_OWNER` rename rationale (Phase 1 reserved literal vs. Phase 2 product-facing name).
    - Update `MEMORY.md` index with a one-line pointer.

15. **AC-15 (Stop bar — BA browser verification checklist).** All 17 points from BA Decisions §"Browser verification checklist" verified in browser by BA before greenlight. Highlights:
    1. Migration applies cleanly on a fresh DB.
    2. Seed creates `owner@deskhive.local` as SPACE_OWNER.
    3. Login as the seed owner → lands on `/` in Guest mode, Guest nav.
    4. Dropdown shows "Switch to hosting".
    5. Switch works → Host nav appears, URL stays.
    6. Switch back works.
    7. Host nav items resolve to placeholder pages.
    8. Mode persists across navigation (sticky — Decision §"Open question" Option A).
    9. Guest user has no switch affordance.
    10. SUPER_ADMIN has no switch affordance.
    11. Guest cannot force-switch via crafted form submit (server rejects with FORBIDDEN).
    12. All Phase 1 flows unchanged.
    13. Story 6.3 booking toast still works.
    14. Story 6.1 dollar input still works.
    15. No console errors.
    16. Unit + E2E tests pass.
    17. Footer `© 2026 DeskHive` everywhere.

16. **AC-16 (Tests — minimum-necessary additions).**
    - `src/lib/mode.test.ts` (new) — tests `readMode` (default → 'guest', valid cookie → value, malformed cookie → 'guest') and `effectiveMode` (host cookie + SPACE_OWNER role → 'host', host cookie + GUEST role → 'guest' fallback, host cookie + SUPER_ADMIN role → 'guest' fallback, no cookie → 'guest', `null` session → 'guest'). Mock `cookies()` via `vi.mock('next/headers', ...)` or use a thin abstraction the helpers accept for testability.
    - `src/actions/mode.test.ts` (optional) — only if the dev-agent finds the state-machine non-trivial. The Server Action is small; the role-gate logic is the main behavior worth testing. The cookie-set side effect is hard to unit-test cleanly; defer to BA browser checklist for end-to-end verification.
    - Optional: `requireRole(session, 'SPACE_OWNER')` symmetric test in `guards.test.ts` (AC-10).
    - **NO authenticated E2E tests added** — same precedent as Stories 5.1 / 5.2 / 6.1 / 6.2 / 6.3 / 6.6. Authenticated E2E infrastructure is its own side quest; BA browser checklist owns end-to-end verification.

17. **AC-17 (Single commit + memory entry).** Per BA Decisions §10 + the established commit pattern:
    - All Story 7.1 changes land in a single commit on `main` titled exactly `feat: role infrastructure + mode switching (Story 7-1)`. Commit content is only files under `deskhive/` plus the `_bmad-output/` story file + sprint-status update + the new `drizzle/migrations/0001_*.sql` file.
    - A small follow-up `docs:` commit fills in the Change Log hash + BA greenlight after browser-verification + push.
    - Memory entry creation + index update happen alongside the commit but live in `~/.claude/.../memory/` (out-of-tree, NOT staged).

## Tasks / Subtasks

- [x] **Task 0 — Prep + Phase 1 audit.**
  - Verify all CI commands on a clean `main` checkout still pass: `pnpm typecheck` / `lint` / `test` / `build` / `test:e2e`. Baseline from Story 6.6: 166 unit + 31 E2E.
  - Read [docs/design/7-1-role-infrastructure-and-mode-switching-ba-decisions.md](docs/design/7-1-role-infrastructure-and-mode-switching-ba-decisions.md) end-to-end.
  - Read [src/db/schema.ts](deskhive/src/db/schema.ts) — note the existing `usersTable` CHECK and the `Role` literal that reserves `SPACE_ADMIN`. AC-1 renames this to `SPACE_OWNER`.
  - Read [src/components/header.tsx](deskhive/src/components/header.tsx) — note the 4 current variants (Public/Guest/SUPER_ADMIN/logged-out) and the inline user-pill (no dropdown).
  - Read [src/lib/auth/guards.ts](deskhive/src/lib/auth/guards.ts) — confirm `requireRole(session, role: Role)` already handles any Role value; no helper to add.
  - Read [scripts/seed.ts](deskhive/scripts/seed.ts) — note the existing admin-promotion pattern (sign up → UPDATE role); AC-11 duplicates it for owner.
  - Check [deskhive/README.md] for seed credential documentation — if present, plan to add owner credentials.
  - Read the existing memory files `project_login_single_form_post_auth_role_switch.md` + `reference_role_specific_nav_pattern.md` — the new AC-14 memory complements both.

- [x] **Task 1 — Schema changes + migration** (AC-1, AC-2):
  - Edit `src/db/schema.ts`:
    - Extend the `users_role_check` CHECK constraint to `IN ('GUEST', 'SUPER_ADMIN', 'SPACE_OWNER')`.
    - Add `ownerId: uuid('owner_id').references(() => usersTable.id)` to `spacesTable` (nullable — no `.notNull()`).
    - Update the `Role` type: `'GUEST' | 'SUPER_ADMIN' | 'SPACE_OWNER'` (replace `SPACE_ADMIN`).
    - Update the leading comment (lines 169–171): replace the SPACE_ADMIN reservation note with a Phase 2 rename note documenting the rationale.
  - Run `pnpm drizzle-kit generate` to produce `drizzle/migrations/0001_*.sql`.
  - Inspect the generated SQL. Add a leading comment block documenting the reversible rollback (DROP constraint with new values, re-ADD with old values; DROP COLUMN owner_id; DROP FOREIGN KEY if present).
  - Run `pnpm drizzle-kit migrate` to apply against Neon. Verify via psql or Drizzle Studio: `\d users` shows the updated CHECK; `\d spaces` shows `owner_id` column with foreign-key to `users(id)`.

- [x] **Task 2 — Mode cookie helpers + tests** (AC-3, AC-16):
  - Create `src/lib/mode.ts` with `readMode()`, `effectiveMode(session)`, `MODE_COOKIE_NAME`, `MODE_VALUES`. Server-only (uses `cookies()` from `next/headers`).
  - Create `src/lib/mode.test.ts`. Mock `next/headers`'s `cookies` via `vi.mock('next/headers', ...)`. Cover the 7 cases enumerated in AC-16.

- [x] **Task 3 — `switchModeAction` Server Action** (AC-4):
  - Create `src/actions/mode.ts` with `'use server';` directive at the top.
  - Implement `switchModeAction(_prevState, formData)` per the 6-step logic in AC-4. Include the `SwitchModeActionState` discriminated union + `SWITCH_MODE_MESSAGES` constants.
  - Verify the role gate: only `SPACE_OWNER` can target `'host'`. SUPER_ADMIN is intentionally rejected (BA Decision §3).
  - Cookie attributes: HttpOnly + SameSite=Lax + Secure-in-prod + path='/'. No maxAge.
  - Optional `src/actions/mode.test.ts` per AC-16 (dev-agent's call).

- [x] **Task 4 — Header refactor — 5 variants + dropdown affordance** (AC-5, AC-6):
  - Edit `src/components/header.tsx`:
    - Add `import { effectiveMode } from '@/lib/mode'`.
    - Compute `const mode = await effectiveMode(session)` after the session read.
    - Branch the rendered nav on `role` AND `mode` per the AC-5 table. Update the leading source-comment block to reflect the 5 variants.
  - Create a new `src/components/user-pill.tsx` (or similar) — Client Component (`'use client'`) that renders the user-pill + a dropdown via `<details>` (simplest) containing:
    - For SPACE_OWNER: `<form action={switchModeAction}>` with hidden `targetMode` and a button "Switch to hosting" / "Switch to traveling" depending on current mode.
    - For all logged-in roles: the existing `<LogoutButton>` (move from inline header → inside the dropdown for consistent affordance home).
    - **Dev-agent choice (document in Completion Notes):** dropdown for all logged-in roles, OR dropdown only when SPACE_OWNER. Recommended: dropdown for all (keeps the UI consistent; Log out + role-specific items live in one place).
  - Header passes `{ role, mode, displayName, initial }` props to `<UserPill>`.

- [x] **Task 5 — `/owner/*` placeholder pages** (AC-7, AC-8):
  - Create the route group `src/app/(owner)/`.
  - Create `src/app/(owner)/owner/page.tsx` (Dashboard placeholder), `src/app/(owner)/owner/spaces/page.tsx` (My spaces placeholder), `src/app/(owner)/owner/bookings/page.tsx` (Bookings placeholder).
  - Each page:
    - Server Component.
    - `requireSession()` first; on AuthError(401) → `redirect('/login?callbackUrl=<this-route>')`.
    - Inline role check: if `role !== 'SPACE_OWNER'` → if `role === 'SUPER_ADMIN'` → `redirect('/admin/spaces')`, else → `redirect('/')`.
    - Render: wrap in `.container-content`, render `.page-h1` with the route's heading, render a muted paragraph: `Coming soon — full owner dashboard in Story 7-5.` (Customize the heading per route: "Dashboard" / "My spaces" / "Bookings".)
  - No new `(owner)/layout.tsx` needed — global Header from `app/layout.tsx` provides the chrome (with Host-mode variant from AC-5).

- [x] **Task 6 — Seed update** (AC-11):
  - Edit `scripts/seed.ts`. After the admin promotion block, add a parallel owner-promotion block:
    - `SEED_OWNER_EMAIL = 'owner@deskhive.local'`, `SEED_OWNER_PASSWORD = 'SpaceOwner1!'`, `SEED_OWNER_FULL_NAME = 'DeskHive Space Owner'`.
    - Check if user exists; if so, skip. Otherwise, `auth.api.signUpEmail({ body: { email, password, name } })`, then UPDATE role + fullName.
    - Log: `Space Owner seeded: owner@deskhive.local / SpaceOwner1!`.
  - Update `deskhive/README.md` if it documents seed credentials (verify in Task 0 audit; if it doesn't, no update needed).
  - Run `pnpm db:seed` against the dev DB and verify the user exists with `role = 'SPACE_OWNER'`.

- [x] **Task 7 — Local CI parity** (AC-13):
  - `pnpm typecheck` clean.
  - `pnpm lint` clean.
  - `pnpm test` — baseline 166 + new mode tests (≥7 per AC-16). Expected: ~173+.
  - `pnpm build` — clean. **Route count grows by 3** (`/owner`, `/owner/spaces`, `/owner/bookings`) → 31 routes (was 28 at Story 6.6).
  - `pnpm test:e2e` — 31 prior tests still pass. No new authenticated E2E added per AC-16 + precedent.

- [ ] **Task 8 — Manual verification (BA's eyeball — AC-15 / Verification §1–17).** *(DEFERRED to BA's review pass per Stories 5.1 / 5.2 / 6.1 / 6.2 / 6.3 / 6.6 precedent — dev-agent runs the automated suite (typecheck/lint/test/build/test:e2e all green); BA owns the 17-point browser checklist incl. the migration + seed verification + cross-role end-to-end walkthrough.)*

- [x] **Task 9 — Memory entry + sprint status + single commit** (AC-14, AC-17):
  - Create `~/.claude/.../memory/reference_role_and_mode_switching.md` per AC-14. Type: `reference`. Update `MEMORY.md` index with a one-line pointer.
  - Update `_bmad-output/implementation-artifacts/sprint-status.yaml`:
    - Add Epic 7 block. Mark `epic-7: in-progress`, `7-1-role-infrastructure-and-mode-switching: review` (will be flipped to review at end of Task 9), `7-2-applications-data-model: backlog`, `7-3-guest-application-form: backlog`, `7-4-admin-application-review: backlog`, `7-5-owner-dashboard-and-spaces: backlog` (note the renumbering from original 7-6), `epic-7-retrospective: optional`.
    - Update `last_updated` parenthetical.
  - Update this story file's metadata: `Status: ready-for-dev` → `Status: review`; mark all Tasks `[x]` except Task 8 (BA's eyeball); fill in Dev Agent Record.
  - Stage `deskhive/...` (incl. `drizzle/migrations/0001_*.sql`, `src/db/schema.ts`, the new mode helpers + Server Action + UserPill, the three `/owner/*` placeholder pages, the seed update, the README update if any, and any test additions) + the two `_bmad-output/...` files.
  - Commit: `feat: role infrastructure + mode switching (Story 7-1)`.
  - **Do NOT push.** Wait for BA browser-verification per Task 8 before pushing.
  - After BA greenlight: push, then add a small `docs:` follow-up commit to fill in the Change Log hash (Phase 1 precedent).

## Dev Notes

### What gets built and what's deliberately out of scope

This is the **first story of Phase 2** and the **foundational story of Epic 7 — Multi-Tenant (Space Owner Role)**. After it lands at `review` and BA greenlights:

- The DB knows about SPACE_OWNER and ownable spaces.
- A seeded SPACE_OWNER user can switch between Guest mode and Host mode end-to-end.
- The Header renders 5 distinct nav variants role+mode aware.
- The Host-mode nav targets resolve (to placeholders that Story 7.5 fills in).
- The Airbnb-model post-auth role-switch pattern is codified in memory for the rest of Epic 7 (and Phase 2 themes B/C) to reuse.

Feature scope (Story 7.1 only):
- ✅ Schema: extend role CHECK + add `spaces.owner_id`.
- ✅ Drizzle migration 0001 + documented rollback.
- ✅ `Role` literal rename `SPACE_ADMIN` → `SPACE_OWNER`.
- ✅ `src/lib/mode.ts` helpers + tests.
- ✅ `switchModeAction` Server Action with role gate.
- ✅ Header 5 variants + user-pill dropdown affordance.
- ✅ `/owner/*` placeholder pages (3) with soft-redirect role guards.
- ✅ Seed: `owner@deskhive.local`.
- ✅ Memory entry codifying the role+mode pattern.
- ✅ No-regression sweep across Phase 1 + Epic 6.

Out of scope (do NOT build):
- ❌ Applications data model (`applications` table) — Story 7.2.
- ❌ Guest-facing "Become a Space Owner" form — Story 7.3.
- ❌ Admin review UI for applications — Story 7.4.
- ❌ Real owner dashboard / spaces / bookings content — Story 7.5 (renumbered from original 7-6).
- ❌ Payouts UI or Stripe wiring — Epic 9 (Theme B).
- ❌ Email infrastructure — Epic 8 (Theme C).
- ❌ Backfill migration assigning Phase 1 spaces to a SPACE_OWNER — locked OUT (BA Decisions §"Out of scope"). `owner_id` stays NULL for seeded spaces.
- ❌ Generic `hasRole(user, role)` helper — explicit BA anti-pattern (Decision §7 + general anti-pattern §1).
- ❌ Storing mode in the DB — explicit BA anti-pattern (Decision §2).
- ❌ Trusting the mode cookie without server-side role re-verification — explicit BA anti-pattern (Decision §2). `effectiveMode(session)` is the validation seam.
- ❌ Modifying Better Auth, `loginAction`, `registerAction`, or any Phase 1 admin route.
- ❌ Authenticated E2E tests — same precedent deferral as all Epic 5 + 6 stories.

### Key decisions

1. **`SPACE_ADMIN` → `SPACE_OWNER` rename is locked.** The Phase 1 architecture.md §7.4 reservation used `SPACE_ADMIN` as the forward-compat literal. The Phase 2 PRD + BA Decisions doc settled on `SPACE_OWNER` as the product-facing name (better alignment with the Airbnb-model "host/owner" language and Story 6.6's memory). This story renames the literal at the source. **The architecture.md doc is NOT updated** (out of dev-agent scope; BA/architect role owns those edits). The memory entry codifies the rename rationale instead.

2. **Mode is a server-validated session cookie, never trusted alone.** BA Decision §2 explicit. The `effectiveMode(session)` helper enforces that a `host` cookie only resolves to Host mode if the session's role is currently SPACE_OWNER. Future role downgrades (revocation in a hypothetical Story 7-N) safely fall back to Guest mode without surprising the user with a broken nav.

3. **SUPER_ADMIN does NOT get Host mode.** BA Decision §3 explicit. The admin chrome at `/admin/*` is the established home for SUPER_ADMIN; Host mode would be a parallel and confusing surface. The `switchModeAction` role gate is strictly `role === 'SPACE_OWNER'`, NOT `role === 'SPACE_OWNER' || role === 'SUPER_ADMIN'`.

4. **`requireRole(session, role)` already covers SPACE_OWNER.** The Phase 1 helper accepts any `Role` value. Once AC-1 extends the union, the helper auto-extends — zero new code. BA Decision §7's "extend, don't refactor" is satisfied trivially; no `isSpaceOwner` helper added.

5. **Inline soft-redirect for owner routes, NOT `requireRole`.** Per Story 6.2's locked pattern (memory `reference_role_specific_nav_pattern.md`): `requireRole` throws `AuthError(403)` (right shape for API deny), wrong shape for "wrong role, send them somewhere useful." Inline `if (role !== 'SPACE_OWNER') redirect('/...')` is the cleanest expression of the soft-redirect intent.

6. **Mode is sticky (Decision §"Open question" Option A locked).** A SPACE_OWNER in Host mode who navigates to `/` keeps Host-mode nav. The user opted in; they exit explicitly via the switch affordance. Browse spaces in Host mode is allowed — owners are humans who can also be guests of other people's spaces.

7. **`/owner/*` placeholders are real pages, not 404s.** Three Server Components with auth guards + soft-redirects + "Coming soon" copy. This avoids the broken-link UX while Story 7.5 builds the real surface. The route group `(owner)` mirrors Phase 1's `(public)` grouping convention.

8. **Cookie attributes:** HttpOnly + SameSite=Lax + Secure-in-prod, **no maxAge**. The cookie is a session cookie (cleared on browser close). This matches the BA's "session-level preference, not persistent" framing in Decision §2.

9. **No authenticated E2E tests added.** Same scope-deferral as every prior story in Epics 5–6. The cost of standing up Playwright auth helpers + seed orchestration is meaningful (estimated >100 lines per the AC-13 cost-cap analysis in Story 6.3). BA's 17-point browser checklist (AC-15) owns end-to-end verification. Phase 2 should bundle authenticated E2E infrastructure as a separate prep story before Theme C (email) work begins — flagged in `reference_toast_wrapper_and_voice.md`'s "Phase 2 application" section.

10. **All cross-cutting framework choices preserved:** `nextCookies()` plugin, conditional UPDATE pattern, `revalidatePath` for booking + space writes, redirect-after-try-catch in Server Actions where applicable, layout-level `/admin/*` guard, Story 6.2's `/my-bookings` admin redirect, Story 6.3's toast-in-context booking flow, Story 6.1's dollar-input desk seam, Story 6.6's removal of pre-auth toggle (cosmetic-only patterns stay forbidden — the Host-mode switch is post-auth, role-gated, and server-validated).

### Sprint status update

`_bmad-output/implementation-artifacts/sprint-status.yaml` needs a new Epic 7 block:

```yaml
  # ─────────────────────────────────────────────────────────────────
  # Epic 7 — Multi-Tenant (Space Owner Role) — Phase 2 Theme A
  # Source: docs/03-phase2-prd.md §8 Epic 7
  # NB: BA combined original 7-1 (role infra) + original 7-5 (mode switch)
  # into the new 7-1. Original 7-6 (owner dashboard) becomes new 7-5.
  # PRD itself will be updated post-7-1-ship.
  # ─────────────────────────────────────────────────────────────────
  epic-7: in-progress
  7-1-role-infrastructure-and-mode-switching: ready-for-dev
  7-2-applications-data-model: backlog
  7-3-guest-application-form: backlog
  7-4-admin-application-review: backlog
  7-5-owner-dashboard-and-spaces: backlog
  epic-7-retrospective: optional
```

(Item 6-5 from the Phase 1 polish backlog continues to await manager input; it stays in its own block.)

Update the `last_updated` parenthetical at top of file.

### Recent commits

```
d8c9e08 docs: fill commit hash in Story 6-6 Change Log + record BA greenlight
48c8f2e feat: remove cosmetic login role selector (Story 6-6)                    ← Last Phase 1 commit
c8055bb docs: fill commit hash in Story 6-3 Change Log + record BA greenlight
71ab26c feat: booking confirmation toast (Story 6-3)
6a4c741 docs: fill commit hash in Story 6-2 Change Log + record BA greenlight
be3e16a feat: hide My Bookings from admin nav + redirect direct nav (Story 6-2)
9471224 docs: fill commit hash in Story 6-1 Change Log + record BA greenlight
6e256f6 feat: desk price input accepts dollars, stores cents (Story 6-1)
...
```

Story 7.1 is the **first Phase 2 feature commit**. Subject: `feat: role infrastructure + mode switching (Story 7-1)`.

### References

- [Source: docs/design/7-1-role-infrastructure-and-mode-switching-ba-decisions.md](docs/design/7-1-role-infrastructure-and-mode-switching-ba-decisions.md) — BA decisions document (this story's source of truth).
- [Source: docs/03-phase2-prd.md §8 Epic 7] — Phase 2 PRD (note: PRD predates the 7-1+7-5 combination; will be updated post-ship).
- [Source: _bmad-output/planning-artifacts/architecture.md §7.4] — Phase 1 architecture's `SPACE_ADMIN` reservation (now superseded by `SPACE_OWNER`; not updated as part of this story).
- [Source: deskhive/src/db/schema.ts:34, :171](deskhive/src/db/schema.ts) — the CHECK constraint + `Role` literal to extend in AC-1.
- [Source: deskhive/src/lib/auth/guards.ts:31](deskhive/src/lib/auth/guards.ts) — `requireRole` auto-extends with the `Role` union (AC-10).
- [Source: deskhive/src/components/header.tsx](deskhive/src/components/header.tsx) — Header to refactor in AC-5.
- [Source: deskhive/scripts/seed.ts](deskhive/scripts/seed.ts) — seed pattern to extend in AC-11.
- [Source: deskhive/drizzle/migrations/0000_tough_strong_guy.sql] — Phase 1 migration to follow in shape (AC-2).
- [Source: deskhive/src/lib/auth/config.ts] — Better Auth config (NOT modified per AC-12).
- [Source: deskhive/AGENTS.md] — Next.js 16 caveats.
- [_bmad-output/implementation-artifacts/6-6-remove-cosmetic-login-role-selector.md] — Story 6.6 (most recent commit + memory rename pattern source).
- Dev-agent memory `project_login_single_form_post_auth_role_switch.md` — Story 6.6's one-login model + Airbnb forward-pointer (this story implements that forward-pointer).
- Dev-agent memory `reference_role_specific_nav_pattern.md` — Story 6.2's role-nav + soft-redirect pattern (this story extends it with mode-awareness).
- Dev-agent memory `reference_toast_wrapper_and_voice.md` — Story 6.3's toast pattern (unchanged by this story; preserved across Phase 2).
- Dev-agent memory `feedback_powershell_utf8_set_content_corrupts.md` — required reading if any PowerShell rewrites happen (unlikely in this story, but possible if globals.css gets touched).

## Dev Agent Record

### Agent Model Used

`claude-opus-4-7[1m]` (Claude Opus 4.7, 1M-context). Same agent across the full implementation; no model swap mid-story.

### Debug Log References

| # | Phase | Symptom | Root cause | Fix |
|---|---|---|---|---|
| 1 | E2E suite | `login.spec.ts` + `register.spec.ts` empty-submit tests failed with "Element not found" for `.field-error`. Test screenshot showed a Next.js Runtime Error overlay: `A "use server" file can only export async functions, found object.` | The first `src/actions/mode.ts` exported `SWITCH_MODE_MESSAGES` (a const object) alongside the async `switchModeAction`. Next.js bundles `'use server'` files and rejects any non-async export — breaking the bundle for **every page that transitively pulls in the action** (`<Header>` → `<UserPill>` → `switchModeAction`), including `/login` and `/register` where the user isn't even authenticated. | Moved `SWITCH_MODE_MESSAGES` out of the `'use server'` file into `src/lib/mode.ts` (constants colocated with the other mode helpers). The Server Action file now exports only the async function + the type union. Codified the pitfall in the new memory entry (`reference_role_and_mode_switching.md`) so Phase 2 stories avoid the trap. |
| 2 | Seed run | `pnpm db:seed` first attempt timed out with ETIMEDOUT on Neon. | Transient network hiccup on the hosted Neon connection. | Retried; second run succeeded. `owner@deskhive.local` created with `role = 'SPACE_OWNER'`. |

### Completion Notes List

**BA-required decision-point answers:**

1. **Migration rollback documentation choice:** ✅ **Comment block at the top of `drizzle/migrations/0001_tricky_tigra.sql`** (not a sibling `.down.sql` file). Drizzle-kit's migration apply only reads the main `.sql` file; a sibling down-file would be cosmetic. Inline comment documents the precise rollback DDL plus the pre-rollback data-cleanup prerequisite (no rows with `role='SPACE_OWNER'` and no `spaces.owner_id` non-NULL must exist before the CHECK swap + DROP COLUMN can succeed).

2. **UserPill dropdown scope choice:** ✅ **Dropdown for ALL authenticated roles** (not just SPACE_OWNER). Per BA Decision §6's explicit "dev-agent picks; document the choice" — picked the consistent UI pattern: every logged-in user clicks the user-pill to access actions. Log out moved from inline (Phase 1) into the dropdown. The Switch-mode form is conditionally rendered inside the dropdown only when `role === 'SPACE_OWNER'`. SUPER_ADMIN + GUEST see a dropdown containing only Log out (plus the "Signed in as <email>" header). Phase 2 will naturally accrete profile-related actions in the same place.

3. **`requireRole(session, 'SPACE_OWNER')` symmetric test (AC-10 optional):** ⚪ **Skipped.** The existing `requireRole` tests in `guards.test.ts` already cover the generic shape (matching role passes, mismatching role throws AuthError(403)). Adding a SPACE_OWNER-specific test would just exercise the same code path with a different string — over-specification per the BA's "extend, don't refactor" framing in Decision §7. The new `mode.test.ts` validates the role-aware logic where it matters (in `effectiveMode`).

4. **`switchModeAction` test file (AC-16 optional):** ⚪ **Skipped.** The action's logic is straightforward (auth check, target validation, role gate, cookie set, revalidate); the load-bearing role logic is captured by `mode.test.ts`'s `effectiveMode` coverage. The cookie-set side effect is hard to unit-test cleanly without large `cookies()` mocks. BA browser checklist owns end-to-end verification (AC-15 §3–6 + §11 covers all the action paths).

5. **README seed-credential update:** ✅ **Updated.** The README's "Seeded Super Admin credentials" section became "Seeded accounts" with two bullets (admin + owner). The "Scripts" table's `pnpm db:seed` description updated to "Seed the Super Admin + Space Owner test users."

6. **`/owner/*` route group layout (Task 5 design choice):** ✅ **Used a route-group layout (`src/app/(owner)/layout.tsx`)** for the soft-redirect guard rather than triplicating the guard across the three placeholder pages. AC-7 allowed this with "unless the dev-agent finds a tight reason"; the tight reason is DRY guard avoidance + matches the Phase 1 admin/layout.tsx pattern (memory `reference_role_specific_nav_pattern.md`'s "Phase 2 application" recommendation). The global Header from `app/layout.tsx` still renders — route-group layouts compose with the root layout.

**Implementation observations worth carrying forward:**

1. **The `'use server'` non-async-export pitfall is the load-bearing lesson from this story.** Next.js bundles Server Actions by chunk; a single offending export breaks every page in the chunk's reach. The symptom is a Runtime Error overlay on unrelated pages (`/login` crashed in this story). The new memory entry documents the trap explicitly — Phase 2 stories adding more Server Actions should colocate const/object exports in a non-server-only sibling module (e.g., `lib/<feature>.ts`).

2. **`effectiveMode(session)` is the validation seam, not `readMode()`.** The split was deliberate per BA Decision §2: `readMode()` is the raw cookie reader (testable in isolation); `effectiveMode()` is the canonical UI-branching function that validates the cookie against the session's role. Future hypothetical features (e.g., role revocation in Story 7-N) can degrade SPACE_OWNER → GUEST safely without surprising users with a stale Host-mode nav.

3. **`SPACE_ADMIN` → `SPACE_OWNER` rename is contained at the schema seam.** The `Role` literal in `schema.ts:172`. All other Phase 1 code that referenced `'SPACE_ADMIN'` did so only via the `Role` union (no string-literal usages outside the type itself, verified via grep). architecture.md is unchanged per the BA's "design package files stay out of dev-agent scope" pattern; the rename rationale is codified in the new memory entry.

4. **`requireRole` auto-extends.** Once the `Role` union grew to include `'SPACE_OWNER'`, the existing `requireRole(session, role: Role)` helper in `src/lib/auth/guards.ts` accepts the new value with zero code change. AC-10 honored: extend, don't refactor.

5. **Mode is sticky** (BA's Open-Question Option A locked). A SPACE_OWNER in Host mode navigating to `/` keeps Host-mode nav. The cookie outlives navigation; switching is explicit only.

6. **SUPER_ADMIN does NOT get Host mode.** `switchModeAction`'s role gate is strictly `=== 'SPACE_OWNER'`, NOT `|| 'SUPER_ADMIN'`. Defense-in-depth: even if the UI ever leaked a switch affordance to an admin, the action rejects with FORBIDDEN.

7. **Route count grew by 3** (`/owner`, `/owner/spaces`, `/owner/bookings`) → 31 routes in `pnpm build` output. Unit test count grew by 11 (`mode.test.ts`). E2E count unchanged at 31 (no authenticated E2E added per AC-16 + Phase 1 precedent).

8. **All cross-cutting framework choices preserved:** `nextCookies()` plugin (US-1.3 — Better Auth's session cookie pattern, NOT modified), conditional UPDATE pattern, `revalidatePath` for booking + space writes + the new `revalidatePath('/', 'layout')` in `switchModeAction`, redirect-after-try-catch in Server Actions where applicable, layout-level `/admin/*` guard, Story 6.2's `/my-bookings` admin redirect, Story 6.3's toast-in-context booking flow, Story 6.1's dollar-input desk seam, Story 6.6's removal of pre-auth toggle.

**Local CI parity (all green):**

- `pnpm typecheck` — clean.
- `pnpm lint` — clean (no new lint surface).
- `pnpm test` — **177 passed + 1 skipped** (was 166; +11 from `mode.test.ts`).
- `pnpm build` — clean. **31 routes** (was 28; +3 from `/owner/*` placeholders).
- `pnpm test:e2e` — 31/31 passed in 41.8s (post-fix). The Runtime Error from the `'use server'` mis-export caused a 2-test failure on first run; root cause + fix documented in Debug Log #1 above.

### File List

**New (10):**
- `deskhive/drizzle/migrations/0001_tricky_tigra.sql` — migration: extend `users_role_check` with `SPACE_OWNER`, add nullable `spaces.owner_id` FK to `users.id`. Includes documented rollback comment block.
- `deskhive/src/lib/mode.ts` — server-only helpers `readMode()` + `effectiveMode(session)` + constants `MODE_COOKIE_NAME` / `MODE_VALUES` / `SWITCH_MODE_MESSAGES` / type `Mode`.
- `deskhive/src/lib/mode.test.ts` — 11 vitest cases covering both helpers across all role + cookie combinations.
- `deskhive/src/actions/mode.ts` — `'use server'`-only `switchModeAction` Server Action + `SwitchModeActionState` type. NO const exports (moved to mode.ts after debug #1).
- `deskhive/src/components/user-pill.tsx` — Client Component dropdown affordance via `<details>`. Renders Switch-mode form (SPACE_OWNER only) + Log out form (all authenticated).
- `deskhive/src/app/(owner)/layout.tsx` — route-group layout handling the SPACE_OWNER soft-redirect guard.
- `deskhive/src/app/(owner)/owner/page.tsx` — Dashboard placeholder (Coming soon copy).
- `deskhive/src/app/(owner)/owner/spaces/page.tsx` — My spaces placeholder.
- `deskhive/src/app/(owner)/owner/bookings/page.tsx` — Bookings placeholder.
- `_bmad-output/implementation-artifacts/7-1-role-infrastructure-and-mode-switching.md` — story file (this file).

**Modified (6):**
- `deskhive/src/db/schema.ts` — extended `users_role_check` CHECK constraint to include `SPACE_OWNER`, added nullable `spacesTable.ownerId` referencing `usersTable.id`, renamed `Role` literal `SPACE_ADMIN` → `SPACE_OWNER`, updated leading comment with the rename rationale.
- `deskhive/src/components/header.tsx` — full refactor: 5 audience-aware variants (Public / Guest / SPACE_OWNER Guest-mode / SPACE_OWNER Host-mode / SUPER_ADMIN); reads `effectiveMode(session)`; delegates Log out + Switch affordance to the new `<UserPill>`.
- `deskhive/src/app/globals.css` — appended user-menu dropdown CSS (positioning + panel + meta + menu-button styles) using brand tokens.
- `deskhive/scripts/seed.ts` — refactored into a generic `seedUser({email,password,fullName,role})` helper; seeds both the Phase 1 admin and the new Phase 2 SPACE_OWNER (`owner@deskhive.local` / `SpaceOwner1!`).
- `deskhive/README.md` — "Seeded Super Admin credentials" section updated to "Seeded accounts" listing both users; Scripts table's `db:seed` description updated.
- `_bmad-output/implementation-artifacts/sprint-status.yaml` — added Epic 7 block, marked `7-1` → `review`, updated `last_updated` parenthetical.

**Memory (out-of-tree, in `~/.claude/projects/.../memory/`):**
- **Created:** `reference_role_and_mode_switching.md` — codifies the Phase 2 role + mode infrastructure pattern (5-variant Header table, `deskhive_mode` cookie attributes, `effectiveMode` validation seam, the `'use server'` non-async-export pitfall, anti-patterns for remaining Phase 2 stories).
- **Updated:** `MEMORY.md` — index appended with the new entry.

### Change Log

| Date | Change | Commit |
|---|---|---|
| 2026-05-12 | Story drafted by `bmad-create-story` from BA decisions document (which combines original PRD 7-1 + 7-5 into a single coherent first Epic 7 story; PRD renumbering documented in story header). | (none) |
| 2026-05-12 | Story implemented; schema + migration applied to Neon, mode helpers + `switchModeAction` shipped, Header refactored to 5 variants, `<UserPill>` dropdown + `/owner/*` placeholders landed, seed extended with SPACE_OWNER. One mid-implementation pivot (Debug Log #1) moved const exports out of the `'use server'` file. Single commit per AC-17. | `b74a68d` |
| 2026-05-12 | Browser-verified by BA against AC-15 17-point checklist; greenlit. First Phase 2 feature commit lands — Epic 7 opens with the role + mode infrastructure foundation. | (this follow-up) |
