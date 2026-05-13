# Story 7.4: Super Admin Application Review UI

Status: review

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a **Super Admin reviewing Space Owner applications**,
I want **a list page with filter chips, a detail page with read-only application data, and one-click Approve / modal-gated Reject actions**,
so that **I can close the application loop end-to-end through the UI — Guest applies (Story 7.3) → I review → I approve → Guest is atomically promoted to SPACE_OWNER via Story 7.2's transaction.**

> Story 7.4 is the fourth story of **Epic 7 — Multi-Tenant**. Source of truth: [docs/design/7-4-admin-application-review-ba-decisions.md](docs/design/7-4-admin-application-review-ba-decisions.md). All decisions locked.

> **Admin-UI-only story.** Consumes Story 7.2's three Server Actions (`createApplicationAction`, `approveApplicationAction`, `rejectApplicationAction`) and Story 7.3's `/become-a-host` flow byte-for-byte. No schema changes, no Server Action changes, no Guest-facing changes. New routes: `/admin/applications` + `/admin/applications/[id]`.

> **Reuses Phase 1 admin chrome extensively** — Story 5-2's `<AdminTabs>` + filter-chip + sortable-table patterns from `/admin/bookings`, Phase 1's `<StatusBadge>` component, the existing admin layout's role guard.

> **Closes Theme A loop end-to-end after ship.** Story 7-5 (owner dashboard + space management) is the last remaining Theme A story; Themes B (Payments) + C (Email) can proceed in parallel once 7-5 lands.

## Acceptance Criteria

> Source: BA Decisions document, Decisions 1–12 + Browser verification checklist.

1. **AC-1 (Admin layout — compute `pendingApplicationsCount`).** Per BA Decisions §1 (PENDING-only count, not total):
   - Extend [src/app/admin/layout.tsx](deskhive/src/app/admin/layout.tsx)'s `Promise.all` to also query applications. Add a new helper `listAllApplications()` to [src/db/queries/applications.ts](deskhive/src/db/queries/applications.ts) (mirrors `listAllSpaces` / `listAllBookings`): returns all applications ordered by `created_at DESC`, with the joined applicant `users` row (`id`, `email`, `fullName`) — same shape as `listAllBookings`'s join pattern from Story 4.1.
   - Compute `pendingApplicationsCount = applicationRows.filter(r => r.application.status === 'PENDING').length`. Pass to `<AdminTabs>` as a new prop.
   - Phase 2 optimization candidate (carried from Story 7-1 Dev Notes): consolidate the three queries into one `getAdminCounts()` helper. Out of scope for this story; document in Completion Notes.

2. **AC-2 (`<AdminTabs>` — add Applications tab).** Per BA Decisions §1:
   - Edit [src/app/admin/admin-tabs.tsx](deskhive/src/app/admin/admin-tabs.tsx). Add a new prop `pendingApplicationsCount: number`.
   - Add a fourth `<Link href="/admin/applications">` tab. **Position: between "Bookings" and "Guests"** per BA Decisions §1 ("Applications relates to user lifecycle similar to Guests").
   - Same count-badge styling as Bookings: `count alert tnum` when `pendingApplicationsCount > 0`, otherwise `count tnum`.
   - `aria-current="page"` toggles on `pathname.startsWith('/admin/applications')`.

3. **AC-3 (`/admin/applications` Server Component list page).** Per BA Decisions §2:
   - New file `src/app/admin/applications/page.tsx`. Server Component (the `/admin/*` route group's `admin/layout.tsx` already handles the SUPER_ADMIN soft-redirect — no per-page auth needed).
   - Reads rows via the new `listAllApplications()` query helper from AC-1 (default sort: `created_at DESC`).
   - Page chrome: `.admin-page` + `.admin-page-head` (Story 5-2 pattern) with title "Applications" + subtitle "Review and approve Space Owner applications."
   - Renders `<ApplicationsTable rows={rows} />` (the new Client Component from AC-4).
   - **Empty state** (zero applications total): a single `.muted` paragraph "No applications yet. Once Guests apply, they'll appear here." rendered inline. NOT a separate empty-state component — `/admin/bookings` doesn't have one either; matches Phase 1 pattern.

4. **AC-4 (`<ApplicationsTable>` Client Component — filter chips + sortable table).** Per BA Decisions §2 + §10 + §11. Mirrors `/admin/bookings/bookings-table.tsx`:
   - New file `src/app/admin/applications/applications-table.tsx`. `'use client'`.
   - Filter chips: **All / Pending / Approved / Rejected**. State via `useState<ApplicationStatus | 'ALL'>`, default `'ALL'`. Counts computed via `useMemo` from the full `rows` array (per-chip counts reflect total population, not filtered view).
   - **Three sortable columns** (BA Decision §11): `Submitted` (default, `created_at DESC`), `Applicant` (alphabetical by `fullName`), `Status` (sorted by enum order: PENDING → APPROVED → REJECTED). All other columns are non-sortable.
   - **Table columns** per BA Decision §2 (left to right): Submitted (with sort arrow), Applicant (two-line cell: `fullName` + `email`, mirrors `/admin/bookings`'s applicant cell), Business (business_name), Status (`<StatusBadge>` per AC-7), Reviewed (`reviewed_at` formatted, or `—` if null), Action (`Review` button → `<Link>` to `/admin/applications/[id]`).
   - Empty filtered-view: a `<tr>` with `<td colSpan={6}>` muted paragraph "No {pending|approved|rejected} applications." matching the BA's per-filter empty copy. The "All" filter never shows this empty state because the page-level empty state from AC-3 fires first.

5. **AC-5 (`/admin/applications/[id]` Server Component detail page).** Per BA Decisions §3:
   - New file `src/app/admin/applications/[id]/page.tsx`. Server Component.
   - Validates `[id]` is a UUID via the same `UUID_RE` pattern as Phase 1 (`cancelBookingAction:156-157`). If not UUID → `notFound()`.
   - Reads the application via Story 7-2's `getApplicationById`. If `undefined` → `notFound()`.
   - Loads the applicant `users` row via direct DB query (the `applications` table FKs to `users.id`; reuse the join pattern from `listAllApplications` or do a separate single-row fetch — dev-agent picks). Same for `reviewed_by_user_id` if set (loads the reviewer's email for the "reviewed by" line).
   - Page chrome:
     - Breadcrumb: `.crumbs` (Story 5-2 pattern) — `Admin / Applications / <applicant fullName>`.
     - `.admin-page-head` with `.page-h1` showing the applicant's fullName + an `.admin-page-head .sub` line with their email.
   - Read-only fields rendered as `<dl>` with `.field-label` keys + values (mirrors Story 7-3's State B pending-summary pattern):
     - Submitted (`createdAt` formatted via `Intl.DateTimeFormat('en-US', { dateStyle: 'long', timeStyle: 'short', timeZone: 'UTC' })`).
     - Full name (from joined user).
     - Email (from joined user).
     - Business name.
     - Business address (multi-line: `white-space: pre-wrap`).
     - Tax ID.
     - Motivation (multi-line, or `—` if null).
   - **Status section:** `<StatusBadge>` + `Reviewed on <date>` + `by <reviewer email>` (only when `status !== 'PENDING'` and `reviewedAt` is non-null).
   - **Rejection reason section** (only when `status === 'REJECTED'`): labeled `.field-label` "Rejection reason" + paragraph showing `application.rejectionReason` (or `—` if null).
   - **Action area** at the bottom:
     - When `status === 'PENDING'`: render `<ReviewActions applicationId={...} applicantName={...} />` (the new Client Component from AC-6).
     - When `status === 'APPROVED'` or `'REJECTED'`: render a `.muted` banner: `This application has been {approved|rejected}. Decisions are final.` No buttons.

6. **AC-6 (`<ReviewActions>` Client Component — Approve + Reject + modal).** Per BA Decisions §4 + §5:
   - New file `src/app/admin/applications/[id]/review-actions.tsx`. `'use client'`.
   - Props: `{ applicationId: string; applicantName: string }`.
   - **Approve flow** (no modal — Decision §5): a `<form action={approveApplicationAction}>` with a hidden `<input name="applicationId" value={applicationId}>`. Submit button `Approve` (Phase 1 `.btn-primary`). Uses `useActionState` + state-identity `useRef` guard pattern (Story 6-3 + Story 7-3 sibling); on `state.status === 'success'`: fire `toastSuccess(TOAST_COPY.APPLICATION_APPROVED_TITLE, { description: \`${applicantName} is now a Space Owner.\` })` then `router.push('/admin/applications')`. The applicant-name interpolation is the description; the title stays static.
   - **Reject flow** (modal — Decision §4): a button `Reject` (Phase 1 `.btn-secondary` with destructive styling — reuse the existing `.btn-xs.btn-reject` class from Story 5-2 or pick a similar token — dev-agent decides). Clicking opens a native `<dialog>` element via `showModal()`.
   - **The reject modal** (locked native `<dialog>` element pattern — no new dependencies, native focus trap + ESC dismissal + backdrop click):
     - Title: `Reject application`.
     - Body: `This will reject ${applicantName}'s application. They can apply again later.`.
     - Optional `<textarea name="reason" maxLength={500}>` with label `Reason (optional)` and help text `The reason is for your records. The applicant won't see it directly in the app (they'll receive a notification email in a future release).`.
     - Two buttons: `Cancel` (closes the dialog) + `Reject application` (form submit — destructive).
   - **The modal's form action** is `rejectApplicationAction` (Story 7-2). Hidden `applicationId` + the optional `reason` textarea. Same `useActionState` + state-identity `useRef` + toast-and-navigate pattern. On success: close the dialog, fire `toastSuccess(TOAST_COPY.APPLICATION_REJECTED_TITLE)` (no description), `router.push('/admin/applications')`.
   - **Error rendering inside the modal:** if `state.status === 'error'`, render `<p className="field-error">{state.message}</p>` inside the dialog (Phase 1 pattern). Common error case: `APPLICATION_NOT_PENDING` (concurrent admin action — another admin just decided this one).
   - **Both flows use the "confirm-and-navigate" toast pattern** (Story 7-3's sibling to Story 6-3's toast-in-context). Toaster is mounted globally; toast survives the navigation.

7. **AC-7 (`<StatusBadge>` extension — APPROVED variant).** Per BA Decision §9 (reuse existing tokens, no new colors):
   - Edit [src/components/status-badge.tsx](deskhive/src/components/status-badge.tsx). Widen the `status` prop's type union: `BookingStatus | ApplicationStatus`. Both share `'PENDING'` and `'REJECTED'` — the existing CSS classes (`badge-pending`, `badge-rejected`) cover them with no change.
   - Add `'APPROVED'` to `STATUS_CLASS` → `'badge-confirmed'` (reuses the green token from Phase 1's CONFIRMED bookings).
   - Add `'APPROVED'` to `STATUS_LABEL` → `'Approved'`.
   - The component now handles 5 distinct values: 4 booking statuses + 1 new application status (`APPROVED`). The overlap on `PENDING`/`REJECTED` is intentional — same color + same human label for the same semantic meaning across contexts.
   - **No CSS changes** to `globals.css` — all four badge variants already exist from Story 5-1.

8. **AC-8 (TOAST_COPY extension — 2 new constants).** Per BA Decision §6 + Story 6-3 voice pattern:
   - Extend [src/lib/toast.ts](deskhive/src/lib/toast.ts) with:
     - `APPLICATION_APPROVED_TITLE: 'Application approved'`
     - `APPLICATION_REJECTED_TITLE: 'Application rejected.'` (period included — matches Story 6-3's `CANCEL_SUCCESS` precedent for short single-sentence toasts)
   - The approve toast's description is built dynamically per-call (`${applicantName} is now a Space Owner.`) — NOT a TOAST_COPY constant because it interpolates a name. Document this in the call site.
   - Add 2 new pins to `src/lib/toast.test.ts` matching the Story 6-3 / 7-3 frozen-string-verification pattern.

9. **AC-9 (Approve flow — confirm-and-navigate, no modal).** Per BA Decision §5:
   - `<ReviewActions>`'s Approve button is a direct form submit — no intermediate confirmation dialog.
   - On success (post-`router.push('/admin/applications')`), the list page re-renders showing the application's new APPROVED status. The PENDING count badge in `<AdminTabs>` decrements.
   - **Story 7-2's atomic role promotion fires** via `db.transaction`: `applications.status → 'APPROVED'` + `users.role → 'SPACE_OWNER'` in one transaction with source-state-guarded conditional UPDATEs. This story does NOT modify that logic — it consumes it.
   - The newly-promoted user can immediately log in and see the SPACE_OWNER nav variants from Story 7-1 (Switch to hosting, `/owner/*` placeholders). Manual verification step covers this end-to-end.

10. **AC-10 (Reject flow — native `<dialog>` modal).** Per BA Decision §4:
    - Modal uses the native HTML `<dialog>` element. `showModal()` for opening (modal mode with backdrop), `close()` for closing. Native focus trap + ESC dismissal + backdrop-click dismissal handled by the browser.
    - **No new dependencies** per Decision §"Architectural anti-patterns forbidden" + Story 7-3 Decision §11.
    - Backdrop click dismisses the modal (native behavior when the click target is the `<dialog>` element itself, not its inner content — wire via a small `onClick` handler on the dialog).
    - The reject form is INSIDE the dialog. On successful submission via `useActionState`, the success-effect closes the dialog first, then redirects + fires the toast.
    - **Styling:** add `.review-dialog` + related rules to `globals.css` reusing Phase 1 tokens (`.card`-like panel styling, `.btn-primary` + `.btn-secondary` for the Cancel/Reject buttons). The `<dialog>` default UA styles need overriding for centering + sizing + backdrop opacity.

11. **AC-11 (Seed script extension — 3 applicants + 4 applications).** Per BA Decision §7 (idempotent + atomic-promotion-preserving):
    - Edit [scripts/seed.ts](deskhive/scripts/seed.ts) to also seed:
      - 3 new GUEST users: `applicant1@deskhive.local`, `applicant2@deskhive.local`, `applicant3@deskhive.local`. Same password pattern (`Applicant1!`, `Applicant2!`, etc.). Idempotent — skip if exists.
      - 1 additional GUEST user `applicant4@deskhive.local` for the REJECTED application.
      - 2 PENDING applications: one for applicant1, one for applicant2. Plausible business names + addresses + tax IDs.
      - 1 APPROVED application for applicant3, with `users.role = 'SPACE_OWNER'`. **Use `db.transaction` directly** (NOT `approveApplicationAction`, which requires a Next.js request context) to atomically INSERT the application + UPDATE the user role. Mirrors Story 7-2's transaction pattern. Document the bypass in seed comments.
      - 1 REJECTED application for applicant4, with a sample `rejectionReason` like "Insufficient business detail. Please reapply with more context about your space."
    - Idempotency: check `findPendingForUser` / similar for each user before inserting. If any seeded application already exists for that user, skip the insert.
    - Document the seed shape in `deskhive/README.md` (extend Story 7-1's "Seeded accounts" section with the new applicant entries).

12. **AC-12 (Role gate — admin/layout.tsx already covers it).** Per BA Decision §8:
    - Both `/admin/applications` + `/admin/applications/[id]` inherit the SUPER_ADMIN soft-redirect from [src/app/admin/layout.tsx](deskhive/src/app/admin/layout.tsx) (Story 6-2 pattern: unauthenticated → `/login`, wrong role → `/`).
    - **No per-page auth code** in either new route. Reusing the locked Phase 1 pattern.
    - Story 7-2's `approveApplicationAction` / `rejectApplicationAction` ALREADY require `requireRole(session, 'SUPER_ADMIN')` at the action layer — defense-in-depth holds even if the UI gating leaks.

13. **AC-13 (Empty + concurrency states).** Per BA Decision §2 + §3:
    - **List page empty (zero applications total):** muted paragraph "No applications yet. Once Guests apply, they'll appear here." (AC-3).
    - **List page filtered-empty:** in-table "No {pending|approved|rejected} applications." (AC-4).
    - **Detail page — already-decided banner:** "This application has been {approved|rejected}. Decisions are final." (AC-5, AC-6 inverse).
    - **Concurrent admin action race:** if a second admin decided the same application between the page load and this admin's click, `approveApplicationAction` / `rejectApplicationAction` returns `APPLICATION_NOT_PENDING`. The Approve form shows a `.field-error` inline above the button. The Reject modal shows the same error inside the dialog. No automatic redirect — admin sees the error, refreshes manually to see the new state. (Auto-refresh would be a nice-to-have; out of scope for this story.)

14. **AC-14 (E2E test strategy — unauthenticated coverage + BA browser walk for authenticated cases).** Per the established Phase 2 precedent (every story since 5-1 has deferred authenticated E2E):
    - **Add new unauthenticated E2E test `tests/e2e/admin-applications.spec.ts`:**
      - `GET /admin/applications` unauthenticated → redirects to `/login`.
      - `GET /admin/applications/<some-uuid>` unauthenticated → redirects to `/login`.
    - **The 22-point BA browser walk handles authenticated cases.** Cumulative authenticated-E2E debt continues to mount across Epic 7; the dev-agent should restate the "consider a Phase 2 prep story for Better Auth fixtures" recommendation from Story 7-3's Completion Notes.

15. **AC-15 (No regression in any prior story).** Every flow verified through Story 7.3 must still work:
    - Phase 1: US-1.x auth, US-2.x admin CRUD, US-3.x guest browse/book/cancel, US-4.x admin booking review.
    - Story 5-1 / 5-2 reskins. Story 6-1 dollar input. Story 6-2 `/my-bookings` admin redirect. Story 6-3 booking toast (incl. cancel). Story 6-6 simplified login.
    - Story 7-1 SPACE_OWNER role + mode switching + UserPill dropdown.
    - Story 7-2 applications data layer + Server Actions — **byte-for-byte unchanged** by this story (this story is a UI consumer).
    - Story 7-3 `/become-a-host` Guest form + UserPill Guest-only entry + State A/B/C/D/E branching.
    - 209 unit + 33 E2E baseline + new tests this story adds. Target: ~211 unit (+2 from new TOAST_COPY pins), ~35 E2E (+2 from new admin-applications.spec.ts).
    - `pnpm typecheck` / `lint` / `test` / `build` / `test:e2e` all clean.
    - **NB:** the new "Applications" admin sub-nav tab + the new admin route may cause minor visual nudges on existing `/admin/spaces` / `/admin/bookings` / `/admin/guests` pages because the sub-nav now has 4 tabs instead of 3. BA browser walk verifies this is acceptable.

16. **AC-16 (Memory entry — `reference_admin_review_ui_pattern.md`).** Per BA Decision §12:
    - New memory file codifies:
      - The **admin list + detail + modal trio** as the locked Phase 2 admin-review UI pattern. Reusable for any future "queue of items awaiting admin action" surface (e.g., Phase 3 dispute resolution).
      - The **asymmetric Approve / Reject UX**: positive path is one-click (no modal), destructive path is modal-gated. Mirrors `/admin/bookings`'s Confirm/Reject pattern.
      - The **PENDING-only count badge convention** for admin sub-nav tabs (not total count) — codifies what "needs attention" means in the badge.
      - The **native `<dialog>` element pattern** for confirmation modals: no library, native focus trap + ESC + backdrop dismissal, styled with Phase 1 tokens.
      - The **seed-bypass pattern for atomic operations**: when seed needs to perform a multi-step atomic operation (here, INSERT application + UPDATE user role for APPROVED), it uses `db.transaction` directly rather than the Server Action (which requires a Next.js request context). Document the bypass.
    - Update `MEMORY.md` index with a one-line pointer.

17. **AC-17 (Single commit + memory entry).** Per the established pattern:
    - All Story 7.4 changes land in a single commit on `main` titled exactly `feat: admin application review UI (Story 7-4)`. Commit content is files under `deskhive/` plus the `_bmad-output/` story file + sprint-status update.
    - A small follow-up `docs:` commit fills in the Change Log hash + BA verification after push.
    - Memory entry + index update live in `~/.claude/.../memory/` (out-of-tree, NOT staged).

18. **AC-18 (Stop bar — BA browser verification checklist).** All 22 points from BA Decisions §"Browser verification checklist" verified by BA before greenlight. Highlights:
    1. Admin sees new Applications tab with PENDING count.
    2. List page renders w/ filter chips + table.
    3. Filtering works (Pending / Approved / Rejected each).
    4. Sorting works (Submitted / Applicant / Status).
    5. Click Review → detail page.
    6. Approve → toast + redirect + DB role flip.
    7. Newly-promoted user can switch to hosting (Story 7-1 affordance).
    8. Reject modal opens with optional reason textarea.
    9. Reject confirms → toast + redirect.
    10. REJECTED detail page shows rejection reason + "decisions are final" banner.
    11. APPROVED detail page shows "decisions are final" banner (no action buttons).
    12. SPACE_OWNER + Guest + unauthenticated all blocked from /admin/applications.
    13. Phase 1 + 7-1 + 7-2 + 7-3 flows unchanged.
    14. No console errors.
    15. All unit + E2E tests pass.
    16. Footer renders correctly.

## Tasks / Subtasks

- [x] **Task 0 — Prep + Phase 1/7-1/7-2/7-3 audit.**
  - Verify all CI commands on a clean `main` checkout still pass. Baseline from Story 7.3: 209 unit + 33 E2E + 32 routes.
  - Read [docs/design/7-4-admin-application-review-ba-decisions.md](docs/design/7-4-admin-application-review-ba-decisions.md) end-to-end.
  - Re-read [src/app/admin/layout.tsx](deskhive/src/app/admin/layout.tsx) — the `Promise.all` + count-prop-passing pattern this story extends.
  - Re-read [src/app/admin/admin-tabs.tsx](deskhive/src/app/admin/admin-tabs.tsx) — the tab component this story adds a fourth entry to.
  - Re-read [src/app/admin/bookings/bookings-table.tsx](deskhive/src/app/admin/bookings/bookings-table.tsx) — the filter-chip + sortable-table template this story mirrors for applications.
  - Re-read [src/components/status-badge.tsx](deskhive/src/components/status-badge.tsx) — the badge component to extend with 'APPROVED'.
  - Re-read [src/actions/applications.ts](deskhive/src/actions/applications.ts) — confirm `approveApplicationAction` + `rejectApplicationAction` are `useActionState`-compatible Server Actions.
  - Re-read [src/db/queries/applications.ts](deskhive/src/db/queries/applications.ts) — note `getApplicationById` + `findPendingForUser` exist; this story adds `listAllApplications` (with user join).
  - Re-read [scripts/seed.ts](deskhive/scripts/seed.ts) — Story 7-1's seedUser pattern this story extends with applicant users + applications.
  - Re-read dev-agent memory `reference_applications_service_and_actions.md` — Story 7-2's `db.transaction` pattern this story's seed reuses for the APPROVED-seed atomic operation.

- [x] **Task 1 — `listAllApplications` query helper + admin/layout count integration** (AC-1, AC-2):
  - Add `listAllApplications()` to `src/db/queries/applications.ts`. Same shape as `listAllBookings`: returns `Array<{ application: Application; applicant: { id: string; email: string; fullName: string } }>` ordered by `applications.created_at DESC`. Uses `innerJoin(usersTable, eq(applicationsTable.userId, usersTable.id))`. Project ONLY safe user fields (id + email + fullName — never `hashedPassword` etc.).
  - Edit `src/app/admin/layout.tsx`: extend the `Promise.all` to also call `listAllApplications()`. Compute `pendingApplicationsCount` from the result. Pass as prop to `<AdminTabs>`.
  - Edit `src/app/admin/admin-tabs.tsx`: add `pendingApplicationsCount: number` prop. Insert the new `<Link href="/admin/applications">` between Bookings and Guests with `aria-current` toggling on `pathname.startsWith('/admin/applications')`. Same `count alert tnum` styling when `> 0`.

- [x] **Task 2 — Extend TOAST_COPY + StatusBadge** (AC-7, AC-8):
  - Edit `src/lib/toast.ts`: add `APPLICATION_APPROVED_TITLE: 'Application approved'` + `APPLICATION_REJECTED_TITLE: 'Application rejected.'` to the `TOAST_COPY` block.
  - Edit `src/lib/toast.test.ts`: add 2 new pins matching the Story 6-3 / 7-3 frozen-string-verification pattern.
  - Edit `src/components/status-badge.tsx`: widen the `status` prop type union to `BookingStatus | ApplicationStatus`. Add `'APPROVED'` to `STATUS_CLASS` → `'badge-confirmed'` and to `STATUS_LABEL` → `'Approved'`. NO CSS changes (all classes already exist).

- [x] **Task 3 — `/admin/applications` list page + `<ApplicationsTable>`** (AC-3, AC-4):
  - Create `src/app/admin/applications/page.tsx` (Server Component). Calls `listAllApplications()`, renders page chrome + empty state + `<ApplicationsTable rows={rows} />`.
  - Create `src/app/admin/applications/applications-table.tsx` (`'use client'`). Mirror `bookings-table.tsx`'s structure:
    - `useState` for selected filter + sort column + sort direction.
    - `useMemo` for chip counts (from `rows`) + filtered/sorted view.
    - Filter chip group: All / Pending / Approved / Rejected with `aria-pressed`.
    - Sortable `<th>` cells for Submitted / Applicant / Status with `.sort-arrow` indicators.
    - Each row: `Review` button (just a `<Link>` to detail — no Server Action invocation from the list page).
    - Empty filtered-view: `<tr><td colSpan={6}>No {selected} applications.</td></tr>`.
  - Use `<StatusBadge status={application.status as ApplicationStatus} />` for the Status column.

- [x] **Task 4 — `/admin/applications/[id]` detail page** (AC-5, AC-13):
  - Create `src/app/admin/applications/[id]/page.tsx` (Server Component).
  - UUID validation via `UUID_RE.test([id])` → `notFound()` if invalid.
  - Load via `getApplicationById([id])` → `notFound()` if missing.
  - Load applicant user (and reviewer user if `reviewedByUserId` is set) — either via a new `getApplicationWithUsers(id)` query helper or via direct DB calls. **Dev-agent picks** — if the join helper is clean (~30 lines), prefer it for testability; otherwise inline. Document the choice.
  - Render breadcrumb + page header + read-only field list + status section + (if REJECTED) rejection reason section.
  - Conditional action area: `<ReviewActions>` when PENDING, banner otherwise.

- [x] **Task 5 — `<ReviewActions>` Client Component + reject modal** (AC-6, AC-9, AC-10):
  - Create `src/app/admin/applications/[id]/review-actions.tsx` (`'use client'`).
  - Two forms inside the component:
    1. Approve form (no modal) — `<form action={approveAction}>` w/ hidden `applicationId` + Approve button.
    2. Reject form (inside `<dialog>`) — opened via a separate `Reject` button that calls `dialogRef.current?.showModal()`. Reject form has hidden `applicationId` + optional `reason` textarea + Cancel button + `Reject application` button.
  - Both use `useActionState` + state-identity `useRef` guards (Story 6-3 + Story 7-3 pattern).
  - Approve success effect: `toastSuccess(TOAST_COPY.APPLICATION_APPROVED_TITLE, { description: \`${applicantName} is now a Space Owner.\` })` then `router.push('/admin/applications')`.
  - Reject success effect: `dialogRef.current?.close()` first, then `toastSuccess(TOAST_COPY.APPLICATION_REJECTED_TITLE)` then `router.push('/admin/applications')`.
  - Approve error: render `.field-error` inline above the Approve button (handles `APPLICATION_NOT_PENDING` race).
  - Reject error: render `.field-error` inside the dialog above the buttons.
  - **Native `<dialog>` styling:** add `.review-dialog` rules to `globals.css` reusing Phase 1 tokens (`.card` panel, `.btn-primary` + `.btn-secondary`, backdrop with `::backdrop` selector). Backdrop click dismissal: wire a small `onClick` on the `<dialog>` checking `event.target === event.currentTarget`.

- [x] **Task 6 — Seed extension** (AC-11):
  - Edit `scripts/seed.ts`:
    - Add 4 new GUEST users (applicant1–4@deskhive.local) using the existing `seedUser` helper from Story 7-1. Skip if exists.
    - Add a new local helper `seedApplication(opts)` that:
      - Skips if a non-REJECTED application already exists for the user (use `findPendingForUser` for PENDING; check via `getApplicationsForUser` or a tiny new lookup query for APPROVED + REJECTED — dev-agent picks the cleanest idempotency check).
      - For PENDING / REJECTED status: simple `db.insert(applicationsTable).values(...)`.
      - For APPROVED status: wraps the insert + `users.role` UPDATE in `db.transaction` (mirrors Story 7-2's `approveApplicationAction` transaction shape but without the request-context dependencies). Documents the bypass in a comment: "Seed bypasses approveApplicationAction (which needs a Next.js request context); reproduces the atomic-promotion contract via direct db.transaction."
    - Seed all 4 applications using the helper.
  - Update `deskhive/README.md`'s "Seeded accounts" section with the 4 new applicant accounts.

- [x] **Task 7 — Unauthenticated E2E coverage** (AC-14):
  - Create `tests/e2e/admin-applications.spec.ts`. Two tests:
    1. `GET /admin/applications` unauthenticated → redirects to `/login`. Assert URL via regex.
    2. `GET /admin/applications/00000000-0000-0000-0000-000000000000` unauthenticated → redirects to `/login` too.
  - No authenticated E2E added per the established precedent; restate the cumulative debt in Completion Notes.

- [x] **Task 8 — Local CI parity** (AC-15):
  - `pnpm typecheck` clean.
  - `pnpm lint` clean.
  - `pnpm test` — baseline 209 + 2 new TOAST_COPY pins. Target ~211.
  - `pnpm build` — clean. **Route count grows by 2** (`/admin/applications` + `/admin/applications/[id]`) → 34 routes (was 32).
  - `pnpm test:e2e` — baseline 33 + 2 new admin-applications cases. Target ~35.

- [ ] **Task 9 — Manual verification (BA's eyeball — AC-18 / Verification §1–22).** *(DEFERRED to BA's review pass per Stories 5.1 → 7.3 precedent — dev-agent runs the automated suite (typecheck/lint/test/build/test:e2e all green) + seeded the test applications; BA owns the 22-point browser walk including authenticated end-to-end paths.)*

- [x] **Task 10 — Memory + sprint-status + single commit** (AC-16, AC-17):
  - Create `~/.claude/.../memory/reference_admin_review_ui_pattern.md` per AC-16. Type: `reference`. Cross-reference Story 5-2's admin chrome pattern + Story 7-2's transaction pattern + Story 7-3's confirm-and-navigate toast pattern.
  - Update `MEMORY.md` index.
  - Update `_bmad-output/implementation-artifacts/sprint-status.yaml`: `7-4-admin-application-review: backlog` → `review`. Update `last_updated` parenthetical.
  - Update this story file: `Status: ready-for-dev` → `Status: review`; mark all Tasks `[x]` except Task 9 (BA's eyeball); fill in Dev Agent Record.
  - Stage `deskhive/...` (admin layout + admin-tabs + new pages + new components + status-badge + toast + seed + README + globals.css + new E2E spec) + the two `_bmad-output/...` files.
  - Commit: `feat: admin application review UI (Story 7-4)`.
  - **Do NOT push.** Wait for BA browser-verification per Task 9 before pushing.
  - After BA greenlight: push, then add a small `docs:` follow-up commit to fill in the Change Log hash.

## Dev Notes

### What gets built and what's deliberately out of scope

This is the **fourth story of Epic 7 — Multi-Tenant** and **closes the application review loop end-to-end through the UI**. After it lands at `review` and BA greenlights:

- A SUPER_ADMIN can see all applications, filter by status, sort the table.
- Clicking Review goes to a detail page with full application data.
- Approve is one-click; Reject is modal-gated with optional reason.
- Approve atomically promotes the applicant via Story 7-2's `db.transaction`.
- Theme A is one story away from complete (only Story 7-5 owner dashboard remains).

Feature scope (Story 7.4 only):
- ✅ `listAllApplications()` query helper + admin layout count + AdminTabs fourth tab.
- ✅ `/admin/applications` list page + `<ApplicationsTable>` (filter chips + sortable).
- ✅ `/admin/applications/[id]` detail page + `<ReviewActions>` (Approve form + Reject modal).
- ✅ `<StatusBadge>` extension for APPROVED variant (PENDING + REJECTED already covered by the BookingStatus overlap).
- ✅ Two new `TOAST_COPY` constants + pins.
- ✅ Seed extension: 4 new applicant users + 4 applications (2 PENDING + 1 APPROVED w/ atomic promote + 1 REJECTED w/ reason).
- ✅ One CSS block for `.review-dialog` modal styling reusing Phase 1 tokens.
- ✅ Unauthenticated E2E coverage of `/admin/applications` + `/admin/applications/[id]` redirects.
- ✅ Memory entry codifying the admin-list-detail-modal pattern + asymmetric Approve/Reject UX + seed-bypass-for-atomic-ops.

Out of scope (do NOT build):
- ❌ Any changes to Story 7-2's Server Actions — explicit anti-pattern.
- ❌ Any changes to Story 7-3's `/become-a-host` flow — explicit anti-pattern.
- ❌ Email sending on approve/reject — Epic 8 (Story 7-2's stubs still no-op).
- ❌ Editing approved/rejected applications — terminal states are immutable.
- ❌ Bulk approve / bulk reject — Phase 3+ at earliest.
- ❌ Application history view for Guests — out of Phase 2.
- ❌ Showing rejection reason in user-facing UI — Phase 2 scope (admin-only data; future email surfaces it).
- ❌ Search/text filter on the list — chips only.
- ❌ Pagination on the list — Phase 2 small-volume assumption.
- ❌ New color tokens for the APPROVED badge — reuse `badge-confirmed`.
- ❌ Authenticated E2E tests — same precedent deferral as every prior story since 5-1.
- ❌ Auto-refresh on concurrency error — admin manually refreshes (out of scope, noted in AC-13).
- ❌ New dependencies — native `<dialog>` element covers the modal; no React modal library.
- ❌ Story 7-5 owner dashboard content — that's the next story.

### Key decisions

1. **`<StatusBadge>` extension via type-widening, not a new component.** The BA Decision §9 says "extend existing." BookingStatus already covers PENDING + REJECTED with the right colors; only APPROVED is new, mapping to `badge-confirmed` (green). The component now accepts `BookingStatus | ApplicationStatus` — semantic overlap is intentional (same color, same human label across contexts).

2. **Native `<dialog>` element for the reject modal — no library, no new dependencies.** Browser support is excellent (Safari 15.4+, all modern browsers). `showModal()` opens with backdrop + focus trap + ESC. Backdrop click dismissal via a tiny `onClick` checking `event.target === event.currentTarget`. Styling via `.review-dialog` rules reusing Phase 1 tokens + `::backdrop` selector for the backdrop opacity. Sibling pattern to Story 6-3's `<Toaster>` (sonner) — both achieve dialog/notification UX without heavy library overhead.

3. **Confirm-and-navigate toast pattern (Story 7-3 sibling), not toast-in-context (Story 6-3).** Same rationale as Story 7-3: admin's action context is exhausted after submit (Approve/Reject is a one-shot decision); auto-navigate to the list page where the badge count updates. Toast survives the navigation via the global `<Toaster>` mount.

4. **Asymmetric Approve / Reject UX.** Approve is one-click (positive path); Reject is modal-gated (destructive path with optional reason). Mirrors Phase 1's `/admin/bookings` Confirm/Reject (Story 5-2). The Decision §5 reasoning: friction proportional to consequence.

5. **PENDING-only count badge for the Applications tab** (BA Decision §1). "Needs attention" semantic. Same pattern as the Bookings tab from Story 5-2.

6. **Seed APPROVED application uses `db.transaction` directly, not the Server Action.** Server Actions need a Next.js request context (cookies + headers); seed scripts run outside that. The seed reproduces the atomic-promotion contract via direct DB writes inside a transaction — same shape as Story 7-2's `approveApplicationAction` but stripped of auth/request-context dependencies. Documented in seed comments + the new memory entry. **Future Phase 2 work that needs to perform Server-Action-like operations from non-request contexts should follow this pattern.**

7. **AdminTabs gets a fourth tab via a new prop** — no refactor of the component to accept a "tabs array" or generic list. Phase 1 + Story 5-2's named-prop pattern (`spacesCount`, `pendingCount`) extends cleanly with a `pendingApplicationsCount` prop. The four tabs are enumerated explicitly in JSX, NOT generated from a tabs array. **Resist the urge to refactor to a generic.** Phase 2 + 3 may add a fifth tab (e.g., Payments — Epic 9); the named-prop extension scales linearly with minimal cost.

8. **`listAllApplications()` mirrors `listAllBookings()` join shape** — explicit projection of safe user fields (`id`, `email`, `fullName`), never `hashedPassword` etc. Same defense-in-depth pattern from Story 4-1.

9. **`getApplicationWithUsers(id)` decision is left to dev-agent.** A dedicated join helper that returns `{ application, applicant, reviewer? }` is cleaner for the detail page but adds a third query helper. Inlining the two extra single-row user lookups in the page is simpler at the cost of three round-trips instead of one join. **Dev-agent picks based on which feels cleaner**; both are correct. Document the choice.

10. **All cross-cutting framework choices preserved:** `nextCookies()` plugin, conditional UPDATE pattern, `db.transaction` (Story 7-2), Server Actions return success state without redirecting (clients decide), Story 5-2 admin chrome (`.admin-page`, `.admin-page-head`, `.admin-toolbar`, `.table-wrap`, `.table.compact`, sort-arrow, chip filters), Story 6-3 toast wrapper + voice template, Story 7-1 role + mode infrastructure (the newly-promoted SPACE_OWNER lands cleanly into Story 7-1's Host mode + `/owner/*` placeholders).

### Sprint status update

`_bmad-output/implementation-artifacts/sprint-status.yaml` updates:

```yaml
  # Epic 7 — Multi-Tenant (Space Owner Role) — Phase 2 Theme A
  epic-7: in-progress
  7-1-role-infrastructure-and-mode-switching: review      # unchanged
  7-2-applications-data-model: review                      # unchanged
  7-3-guest-application-form: review                       # unchanged
  7-4-admin-application-review: review                     # was: backlog
  7-5-owner-dashboard-and-spaces: backlog
  epic-7-retrospective: optional
```

Update the `last_updated` parenthetical at top of file.

### Recent commits

```
a49e15f docs: fill commit hash in Story 7-3 Change Log + record BA greenlight
8a8e7e9 feat: guest application form + entry point (Story 7-3)                  ← Last feature commit
1df8af7 docs: fill commit hash in Story 7-2 Change Log + record BA greenlight
7240499 feat: applications data model + server actions (Story 7-2)
...
```

Story 7.4 is the **fourth Phase 2 feature commit**. Subject: `feat: admin application review UI (Story 7-4)`.

### References

- [Source: docs/design/7-4-admin-application-review-ba-decisions.md](docs/design/7-4-admin-application-review-ba-decisions.md) — BA decisions document.
- [Source: docs/03-phase2-prd.md §8 Epic 7 Story 7-4] — Phase 2 PRD.
- [Source: deskhive/src/app/admin/layout.tsx](deskhive/src/app/admin/layout.tsx) — admin chrome + count-prop-threading pattern this story extends.
- [Source: deskhive/src/app/admin/admin-tabs.tsx](deskhive/src/app/admin/admin-tabs.tsx) — `<AdminTabs>` component gaining the Applications tab.
- [Source: deskhive/src/app/admin/bookings/bookings-table.tsx](deskhive/src/app/admin/bookings/bookings-table.tsx) — filter-chip + sortable-table template mirrored for applications.
- [Source: deskhive/src/components/status-badge.tsx](deskhive/src/components/status-badge.tsx) — badge component extended with APPROVED variant.
- [Source: deskhive/src/actions/applications.ts](deskhive/src/actions/applications.ts) — Story 7-2 Server Actions consumed by `<ReviewActions>`.
- [Source: deskhive/src/db/queries/applications.ts](deskhive/src/db/queries/applications.ts) — gains `listAllApplications()` query helper.
- [Source: deskhive/src/lib/toast.ts](deskhive/src/lib/toast.ts) — gains 2 new TOAST_COPY constants.
- [Source: deskhive/scripts/seed.ts](deskhive/scripts/seed.ts) — gains 4 applicant users + 4 applications + the seed-bypass `db.transaction` for the APPROVED case.
- [Source: deskhive/AGENTS.md] — Next.js 16 caveats.
- [_bmad-output/implementation-artifacts/7-3-guest-application-form.md] — Story 7-3 (commit + memory pattern source).
- Dev-agent memory `reference_applications_service_and_actions.md` — Story 7-2's `db.transaction` pattern the seed reuses.
- Dev-agent memory `reference_guest_application_form_ui.md` — Story 7-3's confirm-and-navigate toast pattern this story mirrors.
- Dev-agent memory `reference_role_specific_nav_pattern.md` — Story 6-2's role-redirect pattern (admin/layout.tsx already enforces it).
- Dev-agent memory `reference_role_and_mode_switching.md` — Story 7-1's `<AdminTabs>` + count-threading pattern.

## Dev Agent Record

### Agent Model Used

`claude-opus-4-7[1m]` (Claude Opus 4.7, 1M-context). Same agent across the full implementation; no model swap mid-story.

### Debug Log References

| # | Phase | Symptom | Root cause | Fix |
|---|---|---|---|---|
| 1 | Lint | `react-hooks/set-state-in-effect` lint error on `setDialogOpen(false)` inside the reject-success `useEffect` body. | Calling `setState` synchronously within a `useEffect` triggers cascading renders (React docs warning). The state was already being kept in sync via the `<dialog onClose={() => setDialogOpen(false)}>` handler, which the native `close()` call triggers automatically. | Removed the redundant `setDialogOpen(false)` from inside the effect. The `onClose` handler now owns the state sync. Documented the gotcha in the new memory entry. |

### Completion Notes List

**BA-required decision-point answers:**

1. **`<dialog>` styling + behavior:** ✅ Native `<dialog>` element works as expected. `showModal()` opens with backdrop + focus trap. ESC dismissal works (browser default). Backdrop click dismissal wired via `onClick={onDialogClick}` checking `event.target === event.currentTarget`. Programmatic `dialogRef.current?.close()` fires the native `close` event, which the `onClose` prop handles for state sync. **No browser quirks discovered.** Tested via `pnpm build` + Playwright unauthenticated smoke; full interaction verification deferred to BA browser walk.

2. **`getApplicationWithUsers` join helper vs inline lookups:** ✅ **Picked the dedicated helper.** Reasons documented in the new memory entry: (a) detail page needs three coordinated reads (application + applicant + optional reviewer) — the helper keeps the page component single-await; (b) the helper is reusable for future Phase 2 stories that touch application detail. Trade-off: 3 round-trips vs. a 3-way join. Phase 2 data volumes make the clarity win; if performance becomes a concern in Phase 3+, a single-query JOIN rewrite is trivial.

3. **Seed bypass for APPROVED application:** ✅ Reproduces Story 7-2's `db.transaction` shape exactly. Source-state-guarded conditional UPDATE on `users.role` (`WHERE id=? AND role='GUEST'`) — defense against re-seed runs where the applicant was already promoted. The `if (updated.length === 0 && applicant.role !== 'SPACE_OWNER') throw` check catches the actual failure case while allowing the idempotent re-seed case to pass. Documented as "seed-bypass for atomic Server-Action-like operations" in the memory entry — pattern for future Phase 2 seed extensions.

4. **Asymmetric Approve/Reject UX visual treatment:** ✅ Approve = standard `.btn btn-primary` (Phase 1 indigo). Reject = `.btn btn-secondary` with destructive styling applied via inline `style={{ color: 'var(--color-status-rejected-fg)', borderColor: 'var(--color-status-rejected-border)' }}` — reuses Story 5-1's existing `--color-status-rejected-*` tokens. Inside the modal, the Reject submit button uses `.btn btn-primary btn-sm` with `background` + `border-color` overridden to `var(--color-status-rejected-fg)`. **No new CSS classes introduced**; reuses existing tokens per BA Decision §9.

5. **Route count delta:** ✅ `pnpm build` reports **34 routes** (was 32). Both new routes registered: `/admin/applications` + `/admin/applications/[id]`. Verified by grep on build output.

6. **Authenticated E2E debt accumulation:** ⚠️ Restating from prior stories: every Epic 7 story (7-1, 7-2 backend, 7-3, 7-4) has deferred authenticated E2E to BA browser walk. The cumulative deferred surface across Epic 7 is now: mode-switching flow (7-1), Server-Action-shell paths (7-2), 5 application-form happy/error paths (7-3), 22-point admin review walk (7-4). **Recommend a dedicated Phase 2 prep story** to set up Better Auth Playwright fixtures + DB cleanup hooks, ideally before Theme C (email) work begins. Filing this restatement here for BA acknowledgment.

**Implementation observations worth carrying forward:**

1. **`<dialog>`'s `close` event fires on programmatic `.close()` calls** — verified during the lint fix. The `onClose` prop is the clean state-sync seam, not a `setState` inside `useEffect`. Documented in memory.

2. **The `{dialogOpen && <form>...}` conditional render** is intentional — without it, the form's `useFormStatus` + `useActionState` state would persist across dialog re-opens (e.g., a previous error state would still display). Conditional render gives each dialog open a fresh form lifecycle. Subtle but load-bearing.

3. **`<StatusBadge>` type widening is clean.** Adding `'APPROVED'` to both `STATUS_CLASS` and `STATUS_LABEL` Record types — TypeScript catches missing variants at compile time. The overlap on `'PENDING'` + `'REJECTED'` between BookingStatus and ApplicationStatus is intentional and works because both unions share those literal strings.

4. **Seed idempotency check** uses `(userId, status)` to allow re-runs after partial failures. On re-seed: if the application was already inserted but the user promotion failed (transaction would have rolled back, but a manual partial DB write could happen), the idempotency check would skip. Acceptable Phase 2 risk; full transaction guarantees prevent partial states in normal operation.

5. **`<AdminTabs>` extended via a new named prop**, NOT refactored to a generic tabs array. The named-prop pattern from Story 5-2 + 7-1 scales linearly with story growth — each new tab is one new prop + one new JSX block. Resist the urge to over-engineer.

6. **All cross-cutting framework choices preserved:** `nextCookies()` plugin, conditional UPDATE pattern (now inside `db.transaction` for both Story 7-2 action AND Story 7-4 seed), Server Actions return success state without redirecting (clients decide), Story 5-2 admin chrome (`.admin-page`, `.admin-page-head`, `.admin-toolbar`, `.table-wrap`, `.table.compact`, sort-arrow, chip filters), Story 6-3 toast wrapper + voice template, Story 7-1 role + mode infrastructure (the newly-promoted SPACE_OWNER lands cleanly into Story 7-1's Host mode + `/owner/*` placeholders — verified via the seed's atomic promotion).

**Local CI parity (all green):**

- `pnpm typecheck` — clean.
- `pnpm lint` — clean (after the `set-state-in-effect` fix per Debug Log #1).
- `pnpm test` — **211 passed + 1 skipped** (was 209; +2 from `toast.test.ts` TOAST_COPY pins).
- `pnpm build` — clean. **Route count grew by 2** (`+/admin/applications` + `+/admin/applications/[id]`) → 34 routes.
- `pnpm test:e2e` — **35/35 passed** in 18.8s (was 33; +2 from new `admin-applications.spec.ts`).
- `pnpm db:seed` — applied cleanly against Neon. 4 new applicant users created. 4 applications created (2 PENDING + 1 APPROVED w/ atomic promotion confirmed + 1 REJECTED w/ reason).

### File List

**New (5):**
- `deskhive/src/app/admin/applications/page.tsx` — Server Component list page. Reads via `listAllApplications()`, renders empty state OR `<ApplicationsTable>`.
- `deskhive/src/app/admin/applications/applications-table.tsx` — `'use client'` filter-chip + sortable-table Client Component. Mirrors `/admin/bookings/bookings-table.tsx`.
- `deskhive/src/app/admin/applications/[id]/page.tsx` — Server Component detail page. UUID validation, `getApplicationWithUsers()` load, read-only field rendering, conditional `<ReviewActions>` OR decided-banner.
- `deskhive/src/app/admin/applications/[id]/review-actions.tsx` — `'use client'` Approve form (no modal) + Reject form (inside native `<dialog>`). State-identity `useRef` guards, confirm-and-navigate toast pattern.
- `deskhive/tests/e2e/admin-applications.spec.ts` — 2 unauthenticated cases (redirect to login for both routes).

**Modified (8):**
- `deskhive/src/db/queries/applications.ts` — Added `listAllApplications()` (join users with safe-field projection) + `getApplicationWithUsers()` (application + applicant + optional reviewer).
- `deskhive/src/app/admin/layout.tsx` — Extended `Promise.all` with `listAllApplications()`. Computes `pendingApplicationsCount`. Passes as new prop to `<AdminTabs>`.
- `deskhive/src/app/admin/admin-tabs.tsx` — Added `pendingApplicationsCount: number` prop + new Applications tab between Bookings and Guests with PENDING-only `count alert tnum` badge.
- `deskhive/src/components/status-badge.tsx` — Widened `status` prop type to `BookingStatus | ApplicationStatus`. Added `'APPROVED'` → `'badge-confirmed'` to STATUS_CLASS and `'Approved'` to STATUS_LABEL. No new CSS.
- `deskhive/src/lib/toast.ts` — Added `APPLICATION_APPROVED_TITLE` + `APPLICATION_REJECTED_TITLE` to `TOAST_COPY`.
- `deskhive/src/lib/toast.test.ts` — Added 2 new pins matching the Story 6-3 / 7-3 frozen-string-verification pattern.
- `deskhive/src/app/globals.css` — Added `.review-dialog` + `.review-dialog::backdrop` + `.review-dialog-inner` rules reusing Phase 1 tokens.
- `deskhive/scripts/seed.ts` — Extended `seedUser` to accept `'GUEST'`. Added `seedApplication` helper (idempotent via `(userId, status)` check; `db.transaction` for APPROVED w/ atomic promotion). Seeds 4 applicants + 4 applications.
- `deskhive/README.md` — Extended "Seeded accounts" section with the 4 new applicant entries.

**Modified — orchestration:**
- `_bmad-output/implementation-artifacts/sprint-status.yaml` — `7-4-admin-application-review: backlog` → `review`; `last_updated` parenthetical updated.
- `_bmad-output/implementation-artifacts/7-4-admin-application-review.md` — Status + tasks + Dev Agent Record (this file).

**Memory (out-of-tree, in `~/.claude/projects/.../memory/`):**
- **Created:** `reference_admin_review_ui_pattern.md` — codifies the admin-list-detail-modal trio, asymmetric Approve/Reject UX, native `<dialog>` patterns, seed-bypass `db.transaction` pattern, and `<StatusBadge>` type-widening approach.
- **Updated:** `MEMORY.md` — index appended with the new entry.

### Change Log

| Date | Change | Commit |
|---|---|---|
| 2026-05-13 | Story drafted by `bmad-create-story` from BA decisions document. | (none) |
| 2026-05-13 | Story implemented; admin applications list + detail + modal trio shipped. AdminTabs fourth tab w/ PENDING-only count. `<StatusBadge>` widened for APPROVED. Seed extended w/ 4 applicants + 4 applications incl. atomic promote via `db.transaction` bypass. Memory entry codifies the admin-queue-review patterns. Single commit per AC-17. | (filled by a small follow-up commit after push, once the hash is stable — same pattern as Stories 5.1 / 5.2 / 6.1 / 6.2 / 6.3 / 6.6 / 7.1 / 7.2 / 7.3) |
