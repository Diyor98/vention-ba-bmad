# Story 7.3: Guest Application Form + Entry Point

Status: review

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a **Guest user who wants to host coworking desks on DeskHive**,
I want **a `/become-a-host` page with a clear application form and a dropdown entry to find it**,
so that **I can submit an application end-to-end through the browser without anyone touching the DB on my behalf, and the page tells me what's going on whether I'm pre-, post-, or mid-application.**

> Story 7.3 is the third story of **Epic 7 — Multi-Tenant**. Source of truth: [docs/design/7-3-guest-application-form-ba-decisions.md](docs/design/7-3-guest-application-form-ba-decisions.md). All decisions locked.

> **UI-only story.** Consumes Story 7-2's `createApplicationAction` + validation schema as-is — no schema changes, no Server Action changes, no new query helpers. The page is a Server Component with state branching; the form is a Client Component using the established `useActionState` + `useFormStatus` pattern from Phase 1.

> **First UI surface in Epic 7.** Stories 7.1 + 7.2 built the role/mode/data foundations; this story is the first user-facing entry point that exercises the application-creation Server Action in real browser context.

## Pre-implementation clarifications (small mismatches with the BA doc)

The BA decisions doc has two minor inconsistencies with Phase 1's established conventions. Locked here so the dev-story doesn't waste a debug cycle:

1. **Validation schema location.** BA Decision §3 suggests `src/lib/applications.ts`. Story 7-2 actually placed the Zod schema at `src/lib/validation/application.ts` (matches Phase 1's `src/lib/validation/{entity}.ts` pattern). The schema is already importable from both client and server contexts (no `'use server'` directive, pure Zod). This story uses the actual Story 7-2 location; no rename.

2. **Auth-redirect query param.** BA Decision §1 State E says redirect to `/login?redirect=/become-a-host`. Phase 1's convention (locked in Story 6-2's memory and US-3.3's `callbackUrl` same-origin guard) is `?callbackUrl=...`. This story uses `?callbackUrl=/become-a-host` to stay consistent — `redirect` would silently fail the existing `loginAction` callback guard.

## Acceptance Criteria

> Source: BA Decisions document, Decisions 1–13 + Browser verification checklist.

1. **AC-1 (Route + page-state branching).** New file `src/app/become-a-host/page.tsx` — Server Component, audience-aware. Per BA Decision §1 + auth-redirect clarification above:
   - **State E (unauthenticated):** `requireSession()` fails → `redirect('/login?callbackUrl=/become-a-host')`. Same pattern as `/my-bookings` from Story 6-2's memory `reference_role_specific_nav_pattern.md`.
   - **State C (SPACE_OWNER):** render "You're already a Space Owner" heading + muted paragraph + `<Link href="/owner">` to the dashboard (Story 7-1's placeholder for now; Story 7-5 fills in).
   - **State D (SUPER_ADMIN):** render "Admins can't apply to host" heading + muted explanatory paragraph. No link. Per Story 7-2's `ADMINS_CANNOT_APPLY` role gate.
   - **State B (Guest with PENDING application):** `findPendingForUser(session.user.id)` returns a row → render "Application under review" heading + submission-date subhead + read-only summary of the four submitted fields + "We'll let you know via email when the review is complete. Reviews typically take 1-2 business days." copy.
   - **State A (Guest, no PENDING):** the application form (AC-2 + AC-3) wrapped in the "Become a Space Owner" page chrome (value-prop cards + "What's next" numbered list + form section).
   - Branching order: auth check first, then role check, then `findPendingForUser` (only if role === 'GUEST'). Matches Story 6-2's "auth → role → render" execution-order pattern.

2. **AC-2 (Application form — Client Component).** New file `src/app/become-a-host/application-form.tsx`. `'use client'`. Per BA Decision §3 + §10:
   - Wraps `createApplicationAction` via `useActionState` (Phase 1's locked pattern).
   - **Four input fields per Story 7-2's validation schema** (`src/lib/validation/application.ts`):
     - `businessName` — single-line text input. `name="businessName"`. Required.
     - `businessAddress` — `<textarea rows={3}>`. `name="businessAddress"`. Required.
     - `taxId` — single-line text input. `name="taxId"`. Required.
     - `motivation` — `<textarea rows={5}>`. `name="motivation"`. Optional; 1000-char `maxLength` attribute.
   - **"Your details" subsection** above the inputs displays read-only `Full name` + `Email` from the session (passed as props from the Server Component parent — keeps the Client Component free of session reads per Phase 1 separation).
   - Single-column layout (Decision §10). Phase 1 form-field classes from globals.css (`.input`, `.field-label`, `.field-help`, `.field-error`).
   - Submit button uses `useFormStatus` for pending state — label `Submitting…` while in flight, otherwise `Submit application`. `disabled={pending}` + `aria-disabled` (Phase 1 pattern).

3. **AC-3 (Submit-success flow — toast + redirect).** Per BA Decisions §4 + §7 + §8 + the Story 6-3 toast-in-context pattern:
   - In the Client Component, add a `useEffect` with state-identity `useRef` guard (Story 6-3 React 19 Strict Mode pattern) that watches `state.status === 'success'` from `useActionState`.
   - On success, in order: (a) call `toastSuccess('Application submitted', { description: TOAST_COPY.APPLICATION_SUBMITTED_DESCRIPTION })` via the wrapper from `src/lib/toast.ts`; (b) call `router.push('/my-bookings')`.
   - The toast survives the navigation because `<Toaster>` is mounted globally in `app/layout.tsx` (Story 6-3's mount, unchanged).
   - **No `redirect()` call inside `createApplicationAction`.** Story 7-2's action returns `{ status: 'success'; applicationId }` precisely so the client controls the post-submit UX. This story honors that contract — do NOT modify the action.
   - Toast copy is verbatim per AC-9 below.

4. **AC-4 (Error-state mapping).** Per BA Decision §4. The Client Component reads `state` from `useActionState` and renders:
   - `VALIDATION_ERROR` → inline `.field-error` per `state.fields` map (matches Phase 1's per-field error rendering from US-1.1 / US-1.2 / Story 6-1).
   - `PENDING_APPLICATION_EXISTS` → `router.push('/become-a-host')` (no toast — the redirect lands on State B which is informational). Use a `useRef` guard so the redirect only fires once per error-state identity.
   - `ALREADY_SPACE_OWNER` → `router.push('/become-a-host')` (lands on State C).
   - `ADMINS_CANNOT_APPLY` → unreachable in practice (AC-5 hides the entry; AC-1 renders State D for direct nav) but render a generic `.field-error` block defensively: the action's `state.message` displayed at the form footer.
   - `UNAUTHORIZED` → `router.push('/login?callbackUrl=/become-a-host')` (defensive; should also be unreachable post-State-E redirect).
   - `INTERNAL_ERROR` and any unmapped code → form-footer error block displaying `state.message` (verbatim from Story 7-2's `APPLICATION_MESSAGES.INTERNAL_ERROR`).

5. **AC-5 (User-pill dropdown — "Become a Space Owner" entry).** Per BA Decision §2 (final/locked variant — show entry for any Guest, destination page handles state branching):
   - In [src/components/user-pill.tsx](deskhive/src/components/user-pill.tsx), add a new `<Link href="/become-a-host" className="user-menu-link">Become a Space Owner</Link>` entry inside the dropdown panel.
   - **Visibility:** only when `role === 'GUEST'`. Hidden for `SPACE_OWNER` and `SUPER_ADMIN`. Public (logged-out) users never see the user-pill at all (Story 7-1 variant table).
   - Place the link **between** the "Signed in as <email>" meta block and the existing Switch-mode form (which renders only for SPACE_OWNER anyway, so for Guests the new link sits just above the Log out button — clean adjacency).
   - The link is a `<Link>`, not a `<form>` submission — no Server Action invoked from the dropdown itself; the action runs on the destination page's form submit. Differs from the Switch-mode and Log out forms, but matches the "My bookings" plain-link pattern.
   - Add a small `.user-menu-link` CSS rule to `globals.css` that visually matches `.user-menu-button` (Story 7-1's existing dropdown button class) so the link reads as a menu item.

6. **AC-6 (Pending-state read-only summary).** Per BA Decision §1 State B + Decision §6:
   - The Server Component renders State B inline (no separate component file required — small enough to live in `page.tsx`).
   - Layout: `.page-h1` "Application under review" + subhead with submission date (`createdAt` formatted via Phase 1's date convention — `Intl.DateTimeFormat('en-US', { month: 'long', day: 'numeric', year: 'numeric' })` with UTC timezone for SSR/hydration stability per Story 5-2's pattern).
   - Read-only summary: business name, business address (preserve newlines via `white-space: pre-wrap`), tax ID, motivation (if non-null). Use the `.muted` + `.field-label` Phase 1 tokens for visual hierarchy.
   - Closing paragraph: `We'll let you know via email when the review is complete. Reviews typically take 1-2 business days.`
   - **No `"Need to update something? Contact support"` line shipped.** Decision §1 State B mentioned it parenthetically as "informational" with "no real action"; better to omit than to ship dead text. Document the omission in Dev Agent Record.

7. **AC-7 (State A page chrome — value props + "What's next").** Per BA Decision §1:
   - Page header: `.page-h1` "Become a Space Owner" + subheader copy "Earn from unused desks in your coworking space."
   - **Value props section:** four `.card` blocks (Phase 1 token from Story 5-1's globals.css) in a responsive grid (`.grid-cards-3` or similar — dev-agent picks the cleanest CSS approach; the `.card` class itself is unchanged). Copy verbatim from Decision §1: "No long-term contracts", "15% platform fee", "Get paid via Stripe", "You control bookings". Single sentence under each headline (dev-agent writes plausible body copy — keep it short, no marketing fluff per Story 6-3's voice).
   - **"What's next" section:** numbered list (3 items): `1. Submit your application`, `2. We review (1-2 business days)`, `3. We email you the decision`. Short and informative.
   - **No hero images, illustrations, or marketing imagery** per BA Decision §1 + anti-pattern. Pure typography + cards.
   - Container: `.container-content` (1152px max — matches Phase 1's content-width token).

8. **AC-8 (Form submission flow integration — Story 7-2 contract preserved).** Per BA Decisions §4 + §11:
   - The form's `action={formAction}` (from `useActionState(createApplicationAction, initialState)`) hits Story 7-2's `createApplicationAction` exactly as it shipped — no signature changes, no return-shape changes.
   - All four required FormData fields supplied via the `name=` attribute on each input. `motivation` empty/whitespace normalizes to null **server-side** (Story 7-2 already handles this); the client doesn't need to do anything special.
   - `useFormStatus` for pending state (Decision §11 — no new deps; this hook is already used by Phase 1 forms).
   - The post-submit `useEffect` for toast + navigation guards via state-identity `useRef` (Story 6-3 pattern, memory `reference_toast_wrapper_and_voice.md`).

9. **AC-9 (Toast copy — verbatim, added to `TOAST_COPY`).** Per BA Decision §8 + Story 6-3's voice-template pattern:
   - Extend [src/lib/toast.ts](deskhive/src/lib/toast.ts)'s `TOAST_COPY` constants with two new keys:
     - `APPLICATION_SUBMITTED_TITLE: 'Application submitted'`
     - `APPLICATION_SUBMITTED_DESCRIPTION: "We'll email you when it's reviewed."`
   - Toast invocation: `toastSuccess(TOAST_COPY.APPLICATION_SUBMITTED_TITLE, { description: TOAST_COPY.APPLICATION_SUBMITTED_DESCRIPTION })`. **No action button** — the user is being navigated automatically.
   - Pin the new constants in the `toast.test.ts` `TOAST_COPY` section (Story 6-3 already established the frozen-string-verification pattern there).
   - Voice rationale (Story 6-3 + this story's Decision §8): non-celebratory (no exclamation), informative (says what happens next), calm transactional tone.

10. **AC-10 (No changes to Story 7-2's data layer).** Per BA Decisions §11 + anti-pattern §"Do NOT modify the `applications` table or its Server Actions":
    - `src/db/schema.ts` — untouched.
    - `src/lib/applications.ts` — untouched.
    - `src/lib/validation/application.ts` — untouched (already covers the four fields the form submits).
    - `src/actions/applications.ts` — untouched.
    - `src/db/queries/applications.ts` — `findPendingForUser` consumed as-is by the Server Component.

11. **AC-11 (No changes to other Phase 1 / Epic 6 / 7-1 surfaces).** Per anti-patterns + Decision §2's final form:
    - The Header (`src/components/header.tsx`) is unchanged. Only `<UserPill>` (its child Client Component) gets the new link.
    - Story 7-1's `/owner/*` placeholders unchanged. State C's link to `/owner` points at Story 7-1's existing placeholder until Story 7-5 ships.
    - Story 6-3's `<Toaster />` mount + `src/lib/toast.ts` wrapper unchanged except for the two new TOAST_COPY constants (AC-9).
    - `loginAction`, `registerAction`, Better Auth config — all untouched.
    - No new dependencies (Decision §11).

12. **AC-12 (CSS — minimal additions to globals.css).** Per Decision §11 (reuse existing tokens):
    - One small new rule: `.user-menu-link` styled to match `.user-menu-button` (Story 7-1's existing class). Lives in the user-menu CSS block at the end of `globals.css`.
    - **Use `[System.IO.File]::WriteAllText` with `UTF8Encoding(false)`** per dev-agent memory `feedback_powershell_utf8_set_content_corrupts.md` if writing globals.css via PowerShell; the `Edit` tool is also safe.
    - Optional: a small `.value-prop-grid` rule for the 4-card layout in State A if Tailwind utility classes don't suffice. Dev-agent picks; either approach is fine.

13. **AC-13 (E2E test strategy — unauthenticated coverage + BA browser walk for authenticated cases).** Per BA Decision §12 + the established authenticated-E2E-deferral precedent (Stories 5.1 / 5.2 / 6.1 / 6.2 / 6.3 / 6.6 / 7.1 all deferred authenticated E2E):
    - **Add new unauthenticated E2E test `tests/e2e/become-a-host.spec.ts`** covering the State E behavior:
      - `GET /become-a-host` while unauthenticated → redirects to `/login?callbackUrl=/become-a-host`.
      - Optionally: navigating to `/become-a-host` while unauthenticated preserves the callbackUrl through to the login page's hidden form input.
    - **The 5 authenticated test cases from BA Decision §12 (happy path, pending state, hidden-entry-for-SPACE_OWNER, hidden-entry-for-SUPER_ADMIN, validation error) are deferred to BA browser walk** per the precedent. Authenticated Playwright infrastructure would require Better Auth fixture login + DB cleanup hooks (>150 lines per the Story 6.3 cost-cap analysis), which is the same side quest deferred across all prior stories.
    - **Dev-agent decision-point:** if the cumulative cost of deferred authenticated E2E across Epic 7 is becoming a concern, escalate before this commit and propose a dedicated Phase 2 prep story to set up the auth fixture once. Otherwise hold the line.
    - **Validation schema tests** (`src/lib/validation/application.test.ts`) already exist from Story 7-2 and cover the empty-business-name / motivation-length cases at the validation layer. No new validation tests needed in this story.

14. **AC-14 (Stop bar — BA browser verification checklist).** All 18 points from BA Decisions §"Browser verification checklist" verified in browser by BA before greenlight. Highlights:
    1. Migration unchanged (Story 7-2 already added the table).
    2. Login as Guest → dropdown shows "Become a Space Owner".
    3. Click → State A.
    4. Form pre-fill shows session name + email read-only.
    5. Empty submit → inline validation errors.
    6. Valid submit → toast + redirect to `/my-bookings`.
    7. DB inspection: PENDING row exists.
    8. State B on revisit.
    9. Dropdown entry still visible (clicking lands on State B).
    10. Login as SPACE_OWNER → dropdown does NOT show entry.
    11. Direct nav to `/become-a-host` as SPACE_OWNER → State C.
    12. Login as SUPER_ADMIN → dropdown does NOT show entry.
    13. Direct nav as SUPER_ADMIN → State D.
    14. Logged out → redirects to `/login?callbackUrl=/become-a-host` (NB: not `?redirect=` per the clarification at top of this story).
    15. Phase 1 + 7-1 + 7-2 flows unchanged.
    16. No console errors.
    17. All unit + E2E tests pass.
    18. Footer `© 2026 DeskHive` on `/become-a-host`.

15. **AC-15 (No regression in any prior story).** Every flow verified through Story 7.2 must still work:
    - US-1.x auth, US-2.x admin CRUD, US-3.x guest browse/book/cancel, US-4.x admin review.
    - Story 5-1 / 5-2 reskins; Story 6-1 dollar input; Story 6-2 admin redirect; Story 6-3 booking toast (incl. cancel toast); Story 6-6 simplified login form.
    - Story 7-1 role infrastructure + mode switching (the new entry sits cleanly inside the existing `<UserPill>` panel; mode-switch + Log out forms unaffected).
    - Story 7-2 data layer untouched.
    - 207 unit + 31 E2E baseline + the new unauthenticated `become-a-host.spec.ts` cases (target ~33 E2E).
    - `pnpm typecheck` / `lint` / `test` / `build` / `test:e2e` all clean.

16. **AC-16 (Memory entry — `reference_guest_application_form_ui.md`).** Per BA Decision §13:
    - New memory file codifies:
      - The **State A/B/C/D/E branching pattern** in `/become-a-host/page.tsx` — Server Component reads session + role + DB state, renders the appropriate variant. Reusable template for `/owner` (Story 7-5) and any other "context-aware page" in Phase 2.
      - The **toast-on-success + router.push pattern** for forms that should both confirm AND navigate: fire the toast in a `useRef`-guarded `useEffect` watching `state.status === 'success'`, then `router.push(...)`. Toaster's global mount keeps the toast visible across the navigation. Cross-reference Story 6-3's toast-in-context pattern (which deliberately did NOT navigate); this story's pattern is the "confirm + go" variant.
      - The **`/login?callbackUrl=` query-param convention** for unauthenticated redirects (NOT `?redirect=`) — BA decisions doc had a one-off `redirect=` hint that conflicts with Phase 1's locked `callbackUrl` pattern.
      - The **`useFormStatus` + `useActionState` + state-identity-`useRef` triad** for form submissions: the same triad used in Story 6-3's `<BookDeskButton>`. Locked Phase 2 form pattern.
    - Update `MEMORY.md` index with a one-line pointer.

17. **AC-17 (Single commit + memory entry).** Per the established pattern:
    - All Story 7.3 changes land in a single commit on `main` titled exactly `feat: guest application form + entry point (Story 7-3)`. Commit content is files under `deskhive/` (the new page + form + globals.css edit + UserPill edit + toast wrapper edit + new E2E spec + any tiny test additions) plus the `_bmad-output/` story file + sprint-status update.
    - A small follow-up `docs:` commit fills in the Change Log hash + BA verification after push.
    - Memory entry creation + index update happen alongside the commit but live in `~/.claude/.../memory/` (out-of-tree, NOT staged).

## Tasks / Subtasks

- [x] **Task 0 — Prep + Phase 1/7-2 audit.**
  - Verify all CI commands on a clean `main` checkout still pass: `pnpm typecheck` / `lint` / `test` / `build` / `test:e2e`. Baseline from Story 7.2: 207 unit + 31 E2E + 31 routes.
  - Read [docs/design/7-3-guest-application-form-ba-decisions.md](docs/design/7-3-guest-application-form-ba-decisions.md) end-to-end.
  - Re-read [src/lib/validation/application.ts](deskhive/src/lib/validation/application.ts) — confirm field names + types match what AC-2's form will submit.
  - Re-read [src/actions/applications.ts](deskhive/src/actions/applications.ts) — confirm `createApplicationAction`'s `useActionState`-compatible signature + the `{ status: 'success'; applicationId }` return shape.
  - Re-read [src/components/user-pill.tsx](deskhive/src/components/user-pill.tsx) — note the `role` prop already plumbed through; the new entry conditionally renders on `role === 'GUEST'`.
  - Re-read [src/app/spaces/[id]/book-desk-button.tsx](deskhive/src/app/spaces/%5Bid%5D/book-desk-button.tsx) — the `useEffect` + `useRef` state-identity guard pattern for the toast-on-success path.
  - Re-read [src/lib/toast.ts](deskhive/src/lib/toast.ts) — the `TOAST_COPY` constants block to extend (AC-9).
  - Re-read dev-agent memory `reference_toast_wrapper_and_voice.md` — the toast-in-context pattern (this story diverges with toast-AND-navigate; document the divergence in completion notes).
  - Read [src/db/queries/applications.ts](deskhive/src/db/queries/applications.ts) — `findPendingForUser` is what the Server Component calls.

- [x] **Task 1 — Extend `TOAST_COPY` + update test pins** (AC-9):
  - Add `APPLICATION_SUBMITTED_TITLE` + `APPLICATION_SUBMITTED_DESCRIPTION` to the `TOAST_COPY` block in `src/lib/toast.ts`.
  - Add corresponding `it(...)` pins to the `describe('TOAST_COPY', ...)` block in `src/lib/toast.test.ts` matching the Story 6-3 verbatim-pin pattern.

- [x] **Task 2 — UserPill dropdown: "Become a Space Owner" entry** (AC-5, AC-12):
  - Edit `src/components/user-pill.tsx`. Inside the `<div className="user-menu-panel">`, after the `.user-menu-meta` paragraph and before any role-specific forms, insert a Guest-only `<Link>` entry:
    ```tsx
    {role === 'GUEST' && (
      <Link
        href="/become-a-host"
        role="menuitem"
        className="user-menu-link"
      >
        Become a Space Owner
      </Link>
    )}
    ```
  - Import `Link` from `next/link` at the top of the file.
  - Append a `.user-menu-link` CSS rule to `globals.css` matching `.user-menu-button` styling — display: flex; same padding; same hover/focus states. Use the safe `Edit` tool path (not PowerShell, to avoid the mojibake regression possibility on a globals.css rewrite).

- [x] **Task 3 — Server Component `/become-a-host/page.tsx` with state branching** (AC-1, AC-6, AC-7):
  - Create `src/app/become-a-host/page.tsx`. Server Component.
  - Imports: `requireSession`, `AuthError` from `@/lib/auth/guards`; `findPendingForUser` from `@/db/queries/applications`; `redirect` from `next/navigation`; `Link` from `next/link`; the new `<ApplicationForm>` from Task 4.
  - Auth handling in try/catch (mirror Story 7-1 / Story 6-2 pattern): on `AuthError(401)` → `redirect('/login?callbackUrl=/become-a-host')` (use `callbackUrl`, NOT `redirect=`).
  - Compute `role = (session.user as { role?: string }).role` after the auth check.
  - Role + pending branching:
    - `role === 'SUPER_ADMIN'` → render State D inline.
    - `role === 'SPACE_OWNER'` → render State C inline (link to `/owner`).
    - Otherwise (Guest or unknown role) → `const pending = await findPendingForUser(String(session.user.id))`. If pending → render State B inline (date formatted via `Intl.DateTimeFormat('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' })`). Else → render State A with value-prop cards + "What's next" list + `<ApplicationForm fullName={...} email={...} />`.
  - **Container:** wrap in `.container-content` for consistent layout (matches `/my-bookings` and other Phase 1 + 5-1 pages).

- [x] **Task 4 — Client Component `<ApplicationForm>`** (AC-2, AC-3, AC-4, AC-8):
  - Create `src/app/become-a-host/application-form.tsx`. `'use client'` at top.
  - Props: `{ fullName: string; email: string }` — for the read-only "Your details" section. **Do NOT** pass the session itself; the parent computes the strings.
  - Hooks: `useActionState(createApplicationAction, initialState)`, `useRouter()` from `next/navigation`, `useRef` for state-identity guards.
  - **Two `useEffect` guards** (each with its own `useRef`):
    1. Success-path: fires `toastSuccess(TOAST_COPY.APPLICATION_SUBMITTED_TITLE, { description: TOAST_COPY.APPLICATION_SUBMITTED_DESCRIPTION })` then `router.push('/my-bookings')`.
    2. Conflict-redirect-path: on `state.code === 'PENDING_APPLICATION_EXISTS'` or `'ALREADY_SPACE_OWNER'` or `'ADMINS_CANNOT_APPLY'` → `router.push('/become-a-host')` (re-renders the page in the new state). On `UNAUTHORIZED` → `router.push('/login?callbackUrl=/become-a-host')`.
  - Form markup: `<form action={formAction} noValidate>` with the four inputs (`name="businessName" | "businessAddress" | "taxId" | "motivation"`). Each input gets:
    - `<label className="field-label" htmlFor={...}>`
    - `<input className="input" id={...} name={...} required={...} aria-invalid={fieldError(...) ? true : undefined}>`
    - `{fieldError(name) && <p className="field-error">{fieldError(name)}</p>}` per Phase 1 pattern.
  - Submit button uses `useFormStatus` (sub-component pattern from Phase 1 — `useFormStatus` only works inside a `<form>`). Labels: `Submitting…` while pending, otherwise `Submit application`. `disabled={pending}` + `aria-disabled`.
  - Form-footer generic error block (for `INTERNAL_ERROR` etc.): `{topLevelError && <p className="field-error" role="alert">{topLevelError}</p>}`.

- [x] **Task 5 — Unauthenticated E2E coverage** (AC-13):
  - Create `tests/e2e/become-a-host.spec.ts`. Two tests minimum:
    1. `GET /become-a-host` unauthenticated → redirects to `/login`. URL ends with `?callbackUrl=%2Fbecome-a-host` (URL-encoded).
    2. The login page's hidden `callbackUrl` input has value `/become-a-host` (or equivalent — check the existing login page's hidden-input structure).
  - **No authenticated tests added** per AC-13 + the established Story 5.1 → 7.2 precedent. Document the deferral in Completion Notes.

- [x] **Task 6 — Local CI parity** (AC-15):
  - `pnpm typecheck` clean.
  - `pnpm lint` clean.
  - `pnpm test` — baseline 207 + 2 new pins in `toast.test.ts` (for the two new TOAST_COPY constants). Target ~209.
  - `pnpm build` — clean. **Route count grows by 1** (`/become-a-host`) → 32 routes (was 31).
  - `pnpm test:e2e` — baseline 31 + new `become-a-host.spec.ts` cases. Target ~33.

- [ ] **Task 7 — Manual verification (BA's eyeball — AC-14 / Verification §1–18).** *(DEFERRED to BA's review pass per Stories 5.1 → 7.2 precedent — dev-agent runs the automated suite (typecheck/lint/test/build/test:e2e all green); BA owns the 18-point browser walk including authenticated end-to-end paths the test suite doesn't cover.)*

- [x] **Task 8 — Memory + sprint status + single commit** (AC-16, AC-17):
  - Create `~/.claude/.../memory/reference_guest_application_form_ui.md` per AC-16. Type: `reference`. Cross-reference Story 6-3's toast-in-context memory + Story 6-2's role-redirect memory + Story 7-1's role-mode memory.
  - Update `MEMORY.md` index with a one-line pointer.
  - Update `_bmad-output/implementation-artifacts/sprint-status.yaml`: `7-3-guest-application-form: backlog` → `review`. Update `last_updated` parenthetical.
  - Update this story file: `Status: ready-for-dev` → `Status: review`; mark all Tasks `[x]` except Task 7 (BA's eyeball deferral); fill in Dev Agent Record.
  - Stage `deskhive/...` (the new page + form, UserPill edit, globals.css edit, toast.ts + toast.test.ts edits, new E2E spec) + the two `_bmad-output/...` files.
  - Commit: `feat: guest application form + entry point (Story 7-3)`.
  - **Do NOT push.** Wait for BA browser-verification per Task 7 before pushing.
  - After BA greenlight: push, then add a small `docs:` follow-up commit to fill in the Change Log hash.

## Dev Notes

### What gets built and what's deliberately out of scope

This is the **third story of Epic 7 — Multi-Tenant** and the **first UI surface** of the application flow. After it lands at `review` and BA greenlights:

- Guests can submit applications end-to-end through the browser.
- The user-pill dropdown's "Become a Space Owner" link is the canonical entry point.
- `/become-a-host` is audience-aware: shows the form to applicable Guests, pending status to in-flight applicants, friendly messages to SPACE_OWNER + SUPER_ADMIN.
- The post-submit success path (toast + redirect to `/my-bookings`) is the locked Phase 2 form-submit pattern.

Feature scope (Story 7.3 only):
- ✅ `/become-a-host` Server Component page with A/B/C/D/E state branching.
- ✅ `<ApplicationForm>` Client Component for State A (form + read-only "Your details" + submit flow).
- ✅ "Become a Space Owner" entry in the `<UserPill>` dropdown (Guest-only).
- ✅ Two new `TOAST_COPY` constants + pins in `toast.test.ts`.
- ✅ One new CSS rule in `globals.css` (`.user-menu-link`).
- ✅ Unauthenticated E2E coverage of `/become-a-host` → login redirect.
- ✅ Memory entry codifying the state-branching pattern + "confirm + navigate" toast variant.

Out of scope (do NOT build):
- ❌ Any changes to Story 7-2's data layer (schema, validation, queries, Server Actions) — explicit anti-pattern.
- ❌ Authenticated E2E tests — same scope-deferral as Stories 5.1 → 7.2 (cost-cap analysis in Story 6.3).
- ❌ Application editing or withdrawing — out of Phase 2 scope.
- ❌ Rejection-reason / rejection-history surfacing — Decision §5 explicitly defers.
- ❌ Hero images, illustrations, marketing graphics — polish pass later if Makhbuba wants them.
- ❌ Multi-step / wizard form — single-page (Decision §10).
- ❌ Custom Tax ID format validation per country — free text per Story 7-2.
- ❌ Application history page — out of Phase 2 scope.
- ❌ SUPER_ADMIN "Become a Space Owner" entry — anti-pattern.
- ❌ Toast on application approval/rejection — email channel only (Decision §9 + Epic 8).
- ❌ In-app notification system / unread indicator — anti-pattern.
- ❌ Email sending on submission — Epic 8 (Story 7-2's stub still no-ops).
- ❌ Owner dashboard at `/owner` — Story 7-5.
- ❌ Admin review UI — Story 7-4.
- ❌ New npm dependencies (Decision §11).
- ❌ Admin sub-nav changes (Story 7-4 will add the Applications tab).

### Key decisions

1. **Toast + redirect (the "confirm + go" variant).** Story 6-3 locked toast-in-context (toast fires on the action page; action button navigates if the user wants). This story diverges: BA explicitly wants both toast AND auto-redirect on success (Decisions §4 + §7). Implementation: fire the toast in a `useRef`-guarded `useEffect`, then `router.push('/my-bookings')`. The global `<Toaster />` mount in `app/layout.tsx` keeps the toast visible across the navigation. **Memory entry documents this as a sibling pattern to Story 6-3's** — not a contradiction, just a different UX choice for a different action context.

2. **Server Component reads role + DB state; Client Component handles form.** Phase 1's locked separation. The Server Component (`page.tsx`) is where the State A/B/C/D/E branching lives; the Client Component (`application-form.tsx`) only knows how to render and submit State A's form. Props pass the read-only `fullName` + `email` strings; the Client Component never reads `headers()` / `cookies()` / session directly.

3. **`callbackUrl` not `redirect`.** BA Decision §1 State E had a `?redirect=` query-param hint that doesn't match Phase 1's `?callbackUrl=` convention (locked by `loginAction`'s same-origin guard from US-3.3). This story honors Phase 1; the BA-doc hint is a minor inconsistency captured in the "Pre-implementation clarifications" section at the top.

4. **Validation schema location: existing `src/lib/validation/application.ts`.** BA Decision §3 suggested `src/lib/applications.ts`, but Story 7-2 placed it at `src/lib/validation/application.ts` (matches Phase 1's pattern). The schema is already pure Zod with no `'use server'` directive — importable from both client and server. No rename needed.

5. **`<UserPill>` dropdown: simple text "Become a Space Owner", always shown for Guests.** BA Decision §2 had an internal reconsideration; the locked variant is "always shown for Guests, destination page handles state." This matches "My bookings" + "Switch to hosting" — text is static; the route does the audience-aware rendering.

6. **Form composition: Phase 1 tokens, no new design.** BA Decision §11 + framing note explicitly defers Makhbuba design refinements. The page uses existing `.card`, `.input`, `.field-label`, `.field-error`, `.field-help`, `.page-h1`, `.btn-primary`, `.container-content` classes. No `globals.css` extension beyond `.user-menu-link`.

7. **State B omits the "Contact support" line.** Decision §1 State B mentioned a parenthetical "Need to update something? Contact support (no real action, just informational)". Dev-agent decision: omit. Phase 2 has no support contact surface; shipping a dead line invites user confusion ("the link doesn't work?"). Documented in Dev Agent Record.

8. **Authenticated E2E tests deferred.** Same precedent as every prior story since 5.1. The BA's 5 listed authenticated tests (Decision §12) are covered by the BA browser walk per AC-13. Unauthenticated `/become-a-host` → login redirect IS automated (Task 5) since no auth fixture is needed.

9. **No new dependencies.** Decision §11. Every required hook + library already in use Phase 1 / Stories 6-3 + 7-1 + 7-2: `useActionState`, `useFormStatus`, `useRouter`, `useEffect`, `useRef`, `next/link`, `next/navigation`, the toast wrapper.

10. **All cross-cutting framework choices preserved:** `nextCookies()` plugin, conditional UPDATE pattern, `revalidatePath` (NB: `createApplicationAction` already calls `revalidatePath('/admin/applications')` from Story 7-2; this story doesn't add new revalidations), no redirect on Server Action success (the client decides), Story 6-2's `/my-bookings` admin redirect, Story 6-3's toast wrapper + voice template, Story 7-1's role + mode infrastructure, Story 7-2's notification-stub Epic 8 contract.

### Sprint status update

`_bmad-output/implementation-artifacts/sprint-status.yaml` updates:

```yaml
  # Epic 7 — Multi-Tenant (Space Owner Role) — Phase 2 Theme A
  epic-7: in-progress
  7-1-role-infrastructure-and-mode-switching: review     # unchanged
  7-2-applications-data-model: review                     # unchanged
  7-3-guest-application-form: review                      # was: backlog
  7-4-admin-application-review: backlog
  7-5-owner-dashboard-and-spaces: backlog
  epic-7-retrospective: optional
```

Update the `last_updated` parenthetical at top of file.

### Recent commits

```
1df8af7 docs: fill commit hash in Story 7-2 Change Log + record BA greenlight
7240499 feat: applications data model + server actions (Story 7-2)             ← Last feature commit
e265b21 docs: fill commit hash in Story 7-1 Change Log + record BA greenlight
b74a68d feat: role infrastructure + mode switching (Story 7-1)
d8c9e08 docs: fill commit hash in Story 6-6 Change Log + record BA greenlight
48c8f2e feat: remove cosmetic login role selector (Story 6-6)
...
```

Story 7.3 is the **third Phase 2 feature commit**. Subject: `feat: guest application form + entry point (Story 7-3)`.

### References

- [Source: docs/design/7-3-guest-application-form-ba-decisions.md](docs/design/7-3-guest-application-form-ba-decisions.md) — BA decisions document.
- [Source: docs/03-phase2-prd.md §8 Epic 7 Story 7-3] — Phase 2 PRD.
- [Source: deskhive/src/lib/validation/application.ts](deskhive/src/lib/validation/application.ts) — Story 7-2's schema; consumed by AC-2 inputs.
- [Source: deskhive/src/actions/applications.ts](deskhive/src/actions/applications.ts) — `createApplicationAction`; consumed by `useActionState` in AC-2.
- [Source: deskhive/src/db/queries/applications.ts](deskhive/src/db/queries/applications.ts) — `findPendingForUser`; consumed by AC-1's State B branch.
- [Source: deskhive/src/components/user-pill.tsx](deskhive/src/components/user-pill.tsx) — UserPill dropdown to extend with the new link entry.
- [Source: deskhive/src/lib/toast.ts](deskhive/src/lib/toast.ts) — `TOAST_COPY` block + `toastSuccess` wrapper.
- [Source: deskhive/src/app/spaces/[id]/book-desk-button.tsx](deskhive/src/app/spaces/%5Bid%5D/book-desk-button.tsx) — Story 6-3's `useActionState` + `useEffect` + `useRef` form template (this story mirrors the shape).
- [Source: deskhive/src/app/(public)/login/login-form.tsx](deskhive/src/app/%28public%29/login/login-form.tsx) — Phase 1 form-pattern template (single-column layout, field labels, inline errors).
- [Source: deskhive/AGENTS.md] — Next.js 16 caveats.
- [_bmad-output/implementation-artifacts/7-2-applications-data-model.md] — Story 7-2 (data layer this story consumes).
- Dev-agent memory `reference_toast_wrapper_and_voice.md` — toast-in-context pattern. **This story's "confirm + navigate" variant is a sibling pattern documented in the new memory entry**.
- Dev-agent memory `reference_role_specific_nav_pattern.md` — Story 6-2's role-redirect + callbackUrl convention.
- Dev-agent memory `reference_role_and_mode_switching.md` — Story 7-1's `<UserPill>` dropdown structure.
- Dev-agent memory `reference_applications_service_and_actions.md` — Story 7-2's service + action contracts.
- Dev-agent memory `feedback_powershell_utf8_set_content_corrupts.md` — required if PowerShell rewrites happen on globals.css.

## Dev Agent Record

### Agent Model Used

`claude-opus-4-7[1m]` (Claude Opus 4.7, 1M-context). Same agent across the full implementation; no model swap mid-story.

### Debug Log References

| # | Phase | Symptom | Root cause | Fix |
|---|---|---|---|---|
| 1 | E2E suite | `become-a-host.spec.ts:10` failed: `toHaveURL(/\/login\?callbackUrl=%2Fbecome-a-host$/)` got `http://localhost:3000/login?callbackUrl=/become-a-host` instead. | Next.js's `redirect()` doesn't URL-encode `/` inside query values (the slash is a reserved sub-delim that's valid unencoded in query strings per RFC 3986). The test regex assumed URL-encoded form. | Updated the regex to match the literal `/login?callbackUrl=/become-a-host`. Documented the gotcha in the new memory entry's "Other locked decisions" section. |
| 2 | BA pre-commit review | The Guest dropdown's new "Become a Space Owner" `<Link>` rendered with a visibly larger font than the sibling "Log out" `<button>`, even though both `.user-menu-link` and `.user-menu-button` set `font-size: 13px` + `font-weight: var(--font-weight-medium)`. | Tailwind v4 preflight resets `<button>` typography to inherit the parent's font (`font-family: inherit`, `font-size: 100%`, `line-height: inherit`, etc.) but does NOT apply the same reset to `<a>` elements. The link picked up browser UA defaults for some typography props (likely line-height/font-family interaction), making the rendered text effectively larger than the button's. | Added `font: inherit;` as the first declaration in `.user-menu-link` — the `font` shorthand mirrors what Tailwind preflight does for `<button>`. The explicit `font-size: 13px` + `font-weight: var(--font-weight-medium)` declarations after `font: inherit` then override the inherited values. Net effect: link + button render identical typography. |

### Completion Notes List

**BA-required decision-point answers:**

1. **State B "Contact support" line omitted:** ✅ As planned per AC-6. The BA-doc's parenthetical mentioned it explicitly as "no real action, just informational." Shipping a dead link or a non-functional "Contact support" button invites user friction. The State B copy reads cleanly without it: header + submission date + read-only summary + the "we'll email you" closing paragraph. No copy gap surfaced.

2. **Toast + redirect ordering:** ✅ `toastSuccess(...)` fires BEFORE `router.push('/my-bookings')` inside the same `useEffect` tick. Verified by reading the rendered code in `application-form.tsx` — the two calls are sequential, both inside the `if (state.status === 'success')` branch. The toast survives navigation because `<Toaster />` is mounted globally in `app/layout.tsx` (Story 6-3) and persists across App Router transitions (sonner's portal is route-independent). Cannot fully prove "the toast survives" without an authenticated browser run; BA browser walk confirms in practice.

3. **`callbackUrl` vs `redirect` clarification:** ✅ The unauthenticated redirect uses `'/login?callbackUrl=/become-a-host'`. Grep-verified: no `?redirect=` occurrences anywhere in the new files. The BA doc's `?redirect=` hint was caught during pre-implementation reading and clarified at the top of the story file before any code was written.

4. **`<UserPill>` link placement:** ✅ The new Guest-only `<Link>` sits between the `.user-menu-meta` paragraph ("Signed in as <email>") and the existing Switch-mode form. For Guests (the only role that sees the link), the visual order is: meta → "Become a Space Owner" link → Log out button. For SPACE_OWNER: meta → Switch-mode form → Log out. For SUPER_ADMIN: meta → Log out. The link is a true `<Link>`, not a form submission — Server Action invocation happens on the destination page's form submit, not from the dropdown.

5. **Authenticated E2E deferral:** ✅ Only unauthenticated coverage added (`become-a-host.spec.ts` has 2 cases: redirect-to-login + hidden-input callbackUrl pass-through). The 5 BA-listed authenticated cases (happy path, pending state, hidden entry for SPACE_OWNER / SUPER_ADMIN, validation error) are deferred to BA browser walk per the established precedent. The cumulative authenticated-E2E debt is mounting (every Phase 2 story so far has deferred); a dedicated Phase 2 prep story to set up Better Auth fixtures + DB cleanup hooks would unblock all future stories. Flagged for BA consideration.

6. **Route count delta:** ✅ `pnpm build` reports 32 routes; `/become-a-host` is in the listed routes (verified). Was 31 at end of Story 7-2.

**Implementation observations worth carrying forward:**

1. **The `useRef` state-identity guard pattern from Story 6-3 generalizes cleanly.** Same `lastHandledState.current === state` check works for the application form's success-and-navigate path. React 19 Strict Mode dev double-invocations are caught by the identity check; re-renders with the same state are no-ops.

2. **The 5-state branching keeps the Server Component readable.** Total `page.tsx` length is ~250 lines including the inline State B + inline State C/D renders. If a sixth state appeared (e.g., "user has REJECTED applications they can re-apply with rejection-reason surfaced"), I'd extract State B into its own file to keep `page.tsx` from growing. For 5 states, inline rendering is cleaner than 5 separate components.

3. **Concurrency-redirect mapping for `PENDING_APPLICATION_EXISTS` / `ALREADY_SPACE_OWNER` / `ADMINS_CANNOT_APPLY`** is a quiet but important pattern. The user had two tabs open; the other tab changed state; this tab's submit hits the server-side check and gets a typed error code that maps to a `router.push` back to the same page. The destination re-renders in the new state. The pattern lives in the same `useEffect` as the success path, gated by error-code matching.

4. **Inline error rendering split:** `VALIDATION_ERROR.fields` map → per-input `.field-error` paragraphs (Phase 1 pattern); `INTERNAL_ERROR` etc. → form-footer error block; `PENDING_APPLICATION_EXISTS` / `ALREADY_SPACE_OWNER` / `ADMINS_CANNOT_APPLY` / `UNAUTHORIZED` → no inline render, `useEffect` handles via `router.push`. The `topLevelError` computation explicitly excludes the concurrency codes so they don't double-render before the redirect fires.

5. **No dependency on Story 7-2's `applicationId` return field** in this story's UI. `createApplicationAction` returns `{ status: 'success'; applicationId: string }`; the form only cares about `status === 'success'`. Future Story 7-5 (owner dashboard) might display application history and could consume the applicationId; for now it's unused but the contract is preserved.

6. **All cross-cutting framework choices preserved:** `nextCookies()` plugin, conditional UPDATE pattern, no `redirect()` on Server Action success (client decides), Story 6-2's `/my-bookings` admin redirect (which a SPACE_OWNER user who submitted an application would hit when the client `router.push('/my-bookings')` fires — they'd actually land on `/admin/bookings` instead. NB: this scenario is unreachable because SPACE_OWNER users don't see the form per State C; they're already promoted), Story 6-3's toast-in-context (which this story extends with the confirm-and-navigate sibling), Story 7-1's role + mode infrastructure, Story 7-2's data layer untouched.

**Local CI parity (all green):**

- `pnpm typecheck` — clean.
- `pnpm lint` — clean.
- `pnpm test` — **209 passed + 1 skipped** (was 207; +2 from `toast.test.ts` TOAST_COPY pins).
- `pnpm build` — clean. **Route count grew by 1** (`/become-a-host`) → 32 routes.
- `pnpm test:e2e` — **33/33 passed** in 13.8s (was 31; +2 from new `become-a-host.spec.ts`).

### File List

**New (3):**
- `deskhive/src/app/become-a-host/page.tsx` — Server Component with State A/B/C/D/E branching. Value-prop cards + "What's next" + inline State B/C/D renders.
- `deskhive/src/app/become-a-host/application-form.tsx` — `'use client'` form. `useActionState` + `useFormStatus` + state-identity `useRef` guard. Read-only "Your details" subsection. Concurrency-redirect mapping in the success/error `useEffect`.
- `deskhive/tests/e2e/become-a-host.spec.ts` — 2 unauthenticated cases (redirect to login + callbackUrl pass-through).

**Modified (4):**
- `deskhive/src/components/user-pill.tsx` — Added Guest-only `<Link href="/become-a-host">` entry inside the dropdown panel, between meta paragraph and existing forms. Imported `Link` from `next/link`.
- `deskhive/src/lib/toast.ts` — Extended `TOAST_COPY` with `APPLICATION_SUBMITTED_TITLE` + `APPLICATION_SUBMITTED_DESCRIPTION` constants.
- `deskhive/src/lib/toast.test.ts` — 2 new pins for the new TOAST_COPY constants (Story 6-3's frozen-string-verification pattern).
- `deskhive/src/app/globals.css` — Added `.user-menu-link` CSS rule matching `.user-menu-button` visual shape.

**Modified — orchestration:**
- `_bmad-output/implementation-artifacts/sprint-status.yaml` — `7-3-guest-application-form: backlog` → `review`; `last_updated` parenthetical updated.
- `_bmad-output/implementation-artifacts/7-3-guest-application-form.md` — Status + tasks + Dev Agent Record (this file).

**Memory (out-of-tree, in `~/.claude/projects/.../memory/`):**
- **Created:** `reference_guest_application_form_ui.md` — codifies the State A/B/C/D/E branching pattern + the "confirm + navigate" toast variant (sibling to Story 6-3) + the concurrency-redirect mapping for error codes + the Next.js `redirect()` URL-encoding gotcha for `?callbackUrl=`.
- **Updated:** `MEMORY.md` — index appended with the new entry.

### Change Log

| Date | Change | Commit |
|---|---|---|
| 2026-05-13 | Story drafted by `bmad-create-story` from BA decisions document. | (none) |
| 2026-05-13 | Story implemented; `/become-a-host` page with 5-state branching, Client form w/ confirm-and-navigate toast, UserPill Guest-only entry. 2 new TOAST_COPY constants pinned. 2 new E2E cases (unauthenticated). Memory entry codifies the state-branching + toast-pattern siblings. Single commit per AC-17. | (filled by a small follow-up commit after push, once the hash is stable — same pattern as Stories 5.1 / 5.2 / 6.1 / 6.2 / 6.3 / 6.6 / 7.1 / 7.2) |
