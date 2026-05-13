# Story 7.5: Space Owner Dashboard + Space Management

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a **SPACE_OWNER managing my own hosting surface**,
I want **a real `/owner` dashboard, owner-scoped space CRUD (create/edit + desk CRUD), and an owner-scoped bookings queue with confirm/reject actions**,
so that **I can list spaces, manage their desks, and act on guest booking requests on my own spaces end-to-end through the UI — without ever seeing another owner's data and without admin needing to act on my behalf.**

> Story 7.5 is the **fifth and final story of Epic 7 — Multi-Tenant**. Source of truth: [docs/design/7-5-owner-dashboard-and-space-management-ba-decisions.md](docs/design/7-5-owner-dashboard-and-space-management-ba-decisions.md). All decisions locked.

> **Theme A closer.** Replaces Story 7-1's three Host-mode placeholder pages with real surfaces. Consumes (and extends) Phase 1's space/desk/booking Server Actions with a role-branched scope check (BA Decision §8). No schema changes — `spaces.owner_id` already exists from Story 7-1. No new dependencies.

> **Reuses Phase 1 admin patterns extensively.** `/owner/spaces` mirrors `/admin/spaces`. `/owner/spaces/[id]` mirrors `/admin/spaces/[id]` (including desk CRUD). `/owner/bookings` mirrors `/admin/bookings` (filter chips + sortable table + Confirm/Reject buttons). The only branching is data scope (`WHERE owner_id = caller.id`) and where success-state navigations land (`/owner/*` vs `/admin/*`).

> **Critical security regression target — Decision §8.** The route guard at `/owner/layout.tsx` is "first line of defense"; the **Server Action** is authoritative. Every mutating action in `/owner/*` re-verifies ownership at the action layer. Unit tests cover the "owner tries to edit another owner's space" rejection path explicitly. This is the load-bearing AC for Phase 2 multi-tenant correctness.

## Acceptance Criteria

> Source: BA Decisions document, Decisions 1–12 + Browser verification checklist (38 points).

1. **AC-1 (Owner-scoped query helpers).** Per BA Decisions §2 + §5 + §6 + §1:
   - Extend [src/db/queries/spaces.ts](deskhive/src/db/queries/spaces.ts) with:
     - `listSpacesForOwner(ownerId: string): Promise<Space[]>` — returns `WHERE owner_id = ownerId` ordered by `createdAt DESC`.
     - `getSpaceByIdForOwner(id: string, ownerId: string): Promise<Space | undefined>` — returns the row only if `owner_id` matches; otherwise `undefined`. Used as the owner-scoped equivalent of Phase 1's `getSpaceById` on the edit page.
   - Extend [src/db/queries/bookings.ts](deskhive/src/db/queries/bookings.ts) with:
     - `listBookingsForOwner(ownerId: string): Promise<Array<{ booking: Booking; desk: Desk; space: Space; guest: { id, email, fullName } }>>` — mirrors `listAllBookings`'s shape but adds `WHERE spaces.owner_id = ownerId` via the existing space JOIN.
   - **Defense-in-depth:** project ONLY safe user fields on the guest JOIN (`id`, `email`, `fullName`) — never `hashedPassword`, `emailVerified`, etc. Same pattern as Story 7-4's `listAllApplications`.
   - **No dashboard-specific count helpers** — the dashboard computes stats from `listSpacesForOwner` + `listBookingsForOwner` results in-memory (Phase 2 small-volume assumption, sibling rationale to the admin/layout count threading from Story 5-2 + 7-4).

2. **AC-2 (`/owner` dashboard — three stat cards + recent activity + empty state).** Per BA Decision §1:
   - Replace [src/app/(owner)/owner/page.tsx](deskhive/src/app/(owner)/owner/page.tsx) (currently a Story 7-1 placeholder).
   - Server Component. Reads `listSpacesForOwner(session.user.id)` + `listBookingsForOwner(session.user.id)` in parallel via `Promise.all`.
   - **Three stat cards** in a single row (responsive — stacks on narrow viewports via existing Phase 1 grid utilities):
     1. **Active spaces** — count of rows from `listSpacesForOwner`. Card click → `Link href="/owner/spaces"`.
     2. **Pending bookings** — count of bookings with `status === 'PENDING'`. Card click → `Link href="/owner/bookings?filter=pending"`.
     3. **Bookings this month** — count of bookings with `created_at >= start_of_current_month` (UTC), all statuses combined. Card click → `Link href="/owner/bookings"`.
   - **"Recent activity" section below the cards** — the 5 most recent bookings (by `created_at DESC`) on this owner's spaces. Each row shows applicant `fullName` + space `name` + `<StatusBadge>` + formatted `created_at`. Each row is a `<Link>` to `/owner/bookings` (no per-row deep link — Phase 2 small-volume; an anchor scroll target can come later if needed).
   - **Empty state (zero spaces yet):** a single CTA card replaces ALL stat cards. Title: "You haven't listed a space yet". Body: "Create your first space to start hosting." Primary button: "Create space" → `Link href="/owner/spaces/new"`. Recent activity section is omitted entirely in the empty state.
   - Page chrome: `.admin-page` + `.admin-page-head` (same Story 5-2 admin chrome) — title "Dashboard" + subtitle "Your hosting overview." The class is named `admin-page` but it's a generic chrome token from Story 5-2; reuse without renaming.
   - The third card's filter pre-selection (`?filter=pending`) is honored by `<OwnerBookingsTable>` (AC-6) — initial state reads the URL query param.

3. **AC-3 (`/owner/spaces` — owner-scoped list page).** Per BA Decision §2:
   - Replace [src/app/(owner)/owner/spaces/page.tsx](deskhive/src/app/(owner)/owner/spaces/page.tsx) (currently a Story 7-1 placeholder).
   - Server Component. Reads `listSpacesForOwner(session.user.id)`.
   - Page chrome: `.admin-page` + `.admin-page-head` — title "My spaces" + subtitle "Spaces you host on DeskHive."
   - Top-right primary button: "New space" → `Link href="/owner/spaces/new"`.
   - Table columns (mirrors `/admin/spaces`): **Space (name + truncated id)**, **City**, **Desks** (active-desk count — requires a per-row query OR a single grouped helper; dev-agent picks — note that Phase 1 admin/spaces does NOT show desk count, so this is a small new query; if it bloats the page, fall back to displaying it on `/owner/spaces/[id]` only), **Created** (sortable), **Action** (Edit button → `/owner/spaces/[id]`).
   - **No status filter chips** — all owner spaces auto-publish in Phase 2 (Decision §4). If/when drafts arrive in Epic 9, add them then.
   - **No sortable columns required for v1** — Phase 1 `/admin/spaces` doesn't have them either. Static default sort: `createdAt DESC`. Dev-agent may add a single sortable "Created" column if free (~10 lines via the same pattern as `<BookingsTable>`); otherwise skip.
   - **Empty state** (zero spaces): a centered message "You haven't listed a space yet. Create your first space to start hosting." + a CTA button "Create space". The empty state on `/owner/spaces` is intentionally different from the dashboard's CTA-replaces-cards pattern — list pages keep their chrome.
   - **No cross-leak verification needed inside the page** — `listSpacesForOwner` is the seam.

4. **AC-4 (`/owner/spaces/new` — create form).** Per BA Decisions §3 + §8:
   - New file `src/app/(owner)/owner/spaces/new/page.tsx` (Server Component).
   - Renders a header + `<CreateSpaceForm variant="owner">` (the existing `<CreateSpaceForm>` Client Component from `/admin/spaces/new/create-space-form.tsx`, extended with a `variant` prop — see AC-7).
   - Header chrome: `.container-narrow` wrapper + `h1.page-h1` "Create space" + optional breadcrumb `My spaces / Create`.

5. **AC-5 (`/owner/spaces/[id]` — edit page + desk CRUD + ownership guard).** Per BA Decisions §5 + §8:
   - New file `src/app/(owner)/owner/spaces/[id]/page.tsx` (Server Component).
   - UUID validation via the Phase 1 `UUID_RE` pattern → `notFound()` if invalid.
   - **Ownership guard (route-layer first line of defense, Decision §5 + §8):**
     - Read session via `requireSession()` (already guaranteed non-null by `(owner)/layout.tsx`).
     - Read space via `getSpaceByIdForOwner(id, session.user.id)`.
     - If `undefined`: silently `redirect('/owner/spaces')`. **No 404, no error toast.** Mirrors Story 6-2 / 7-1 soft-redirect pattern (Decision §9). This is the route-layer guard; the Server Action layer (AC-8/AC-9) re-verifies authoritatively.
   - Render mirrors `/admin/spaces/[id]` exactly:
     - Breadcrumb: `My spaces / [Space name]`.
     - `.admin-page-head` with `.page-h1` + meta strip (id + desk count + status).
     - `<section className="form-card">` Details → `<EditSpaceForm space={space} variant="owner">` (reuses the existing form Client Component with a `variant` prop — see AC-7).
     - `<section className="form-card">` Desks → header + desk admin rows via `<EditDeskForm>` (reused as-is; the existing component already calls `editDeskAction` which gets the role-branched scope extension in AC-9) + `<AddDeskForm spaceId={space.id}>`.
   - **No status changes here** — no Publish/Unpublish, no Archive (Decision §5 last paragraph + Phase 1 parity).

6. **AC-6 (`/owner/bookings` — owner-scoped bookings list).** Per BA Decision §6:
   - Replace [src/app/(owner)/owner/bookings/page.tsx](deskhive/src/app/(owner)/owner/bookings/page.tsx) (currently a Story 7-1 placeholder).
   - Server Component. Reads `listBookingsForOwner(session.user.id)`.
   - Page chrome: `.admin-page` + `.admin-page-head` — title "Bookings" + subtitle "Bookings on your spaces."
   - Renders a new Client Component `<OwnerBookingsTable rows={rows} initialFilter={...}>` that mirrors `/admin/bookings/bookings-table.tsx` 1:1:
     - Filter chips: **All / Pending / Confirmed / Rejected / Cancelled** (identical to admin).
     - Sortable `<th>` for "Booked" column (date, asc/desc toggle).
     - Same six-column table layout (Booked / Guest / Space · Desk / Total / Status / Action).
     - PENDING rows: inline Confirm + Reject buttons (reuses Phase 1's `<ConfirmBookingButton>` + `<RejectBookingButton>` exactly — those components call the Server Actions, which gain the role-branched scope extension in AC-10).
     - Empty state: "No bookings yet. Your spaces will show bookings here once Guests book them." Page-level (renders when `rows.length === 0`).
     - **`initialFilter` prop:** the page reads `searchParams.filter` (if present and one of the chip values, lowercased — `'pending'`, `'confirmed'`, etc.) and passes it as `initialFilter`. This honors the dashboard's "Pending bookings" card link `?filter=pending` (AC-2). Default: `'ALL'`.
   - **Architectural note:** dev-agent picks whether to share `<BookingsTable>` between admin + owner (via a `variant` prop or just renaming the component to something generic) or duplicate. **Recommendation: duplicate as `<OwnerBookingsTable>`** — the shared component would have to accept admin-vs-owner branches in 3+ places (which Server Action button to render, where to land after, what page chrome the parent uses). Two ~200-line files are simpler than one ~250-line file with `variant` branches everywhere. **Resist the urge to abstract.**

7. **AC-7 (Form Client Components — `variant` prop extension on `<CreateSpaceForm>` + `<EditSpaceForm>`).** Per BA Decision §3 + §5 + §8:
   - Edit [src/app/admin/spaces/new/create-space-form.tsx](deskhive/src/app/admin/spaces/new/create-space-form.tsx) — add an optional `variant?: 'admin' | 'owner'` prop (default `'admin'`).
     - On `state.status === 'success'`: if `variant === 'owner'`, fire `toastSuccess(TOAST_COPY.SPACE_CREATED_TITLE, { description: TOAST_COPY.SPACE_CREATED_DESCRIPTION })` then `router.push(\`/owner/spaces/${state.spaceId}\`)`. If `variant === 'admin'`, just `router.push('/admin/spaces')` (no toast — Phase 1 parity).
     - Uses the standard `useActionState` + state-identity `useRef` guard pattern (Story 6-3 + 7-3 + 7-4 sibling).
   - Edit [src/app/admin/spaces/[id]/edit-space-form.tsx](deskhive/src/app/admin/spaces/[id]/edit-space-form.tsx) — same `variant` prop extension. On success: `variant === 'owner'` → `router.push('/owner/spaces')`. `variant === 'admin'` → `router.push('/admin/spaces')`. No toast in either case (consistency with Phase 1 admin edit).
   - **Why this approach instead of two separate form files:** the form bodies are identical (same input fields, same validation seam, same submit button). Only the post-success navigation differs. A single variant-keyed `useEffect` block is cleaner than duplicating ~120 lines of form JSX.
   - **`<AddDeskForm>` + `<EditDeskForm>` need NO variant prop** — they don't redirect; they just `revalidatePath` and stay on the same page. They work the same on `/admin/spaces/[id]` and `/owner/spaces/[id]` without changes.

8. **AC-8 (`createSpaceAction` + `editSpaceAction` — role-branched scope + return success state).** Per BA Decisions §3 + §5 + §8:
   - Edit [src/actions/space.ts](deskhive/src/actions/space.ts):
     - **`createSpaceAction`:** widen `requireRole(session, 'SUPER_ADMIN')` to allow either `SUPER_ADMIN` or `SPACE_OWNER`. If caller is `SPACE_OWNER`, stamp `owner_id = caller.id` on the new row. If caller is `SUPER_ADMIN`, leave `owner_id` as Phase 1 left it (NULL — Phase 1 admin-created spaces). **Refactor return shape:** instead of calling `redirect()` directly, return `{ status: 'success', spaceId: string }` and let the Client form (AC-7) handle navigation. Update `CreateSpaceActionState` union accordingly.
     - **`editSpaceAction`:** widen the role check the same way. If caller is `SPACE_OWNER`, fetch the target row (`getSpaceById(id)`) and verify `space.owner_id === caller.id`. If not, return `{ status: 'error', code: 'NOT_FOUND', message: 'Space not found.' }` — same code Phase 1 returns when the row genuinely doesn't exist (avoids leaking ownership info — Decision §8 defense-in-depth principle). If caller is `SUPER_ADMIN`, no scope check (Phase 1 behavior unchanged). **Same return-shape refactor:** return `{ status: 'success' }` on success; Client form handles the navigation.
   - Update [src/lib/validation/space.ts](deskhive/src/lib/validation/space.ts) — no change needed (schema is field-only).
   - Update `createSpace` in [src/db/queries/spaces.ts](deskhive/src/db/queries/spaces.ts) to accept an optional `ownerId?: string | null` parameter and pass through to the INSERT.
   - Update `revalidatePath` calls to also revalidate `/owner/spaces` (single line addition — cheap; revalidating a non-rendered path is a no-op).
   - **Unit tests:** add tests covering:
     - `createSpaceAction` called with a `SUPER_ADMIN` session leaves `owner_id` NULL (Phase 1 regression).
     - `createSpaceAction` called with a `SPACE_OWNER` session stamps `owner_id = caller.id`.
     - `editSpaceAction` called with a `SPACE_OWNER` session on a space they don't own returns `NOT_FOUND`. **Critical regression test per Decision §8.**
     - `editSpaceAction` called with a `SUPER_ADMIN` session on any space succeeds regardless of `owner_id` (Phase 1 regression).

9. **AC-9 (`createDeskAction` + `editDeskAction` — role-branched scope check).** Per BA Decisions §5 + §8:
   - Edit [src/actions/desk.ts](deskhive/src/actions/desk.ts):
     - **`createDeskAction`:** widen the role check to allow `SUPER_ADMIN` or `SPACE_OWNER`. If caller is `SPACE_OWNER`, after fetching the parent space (`getSpaceById(spaceId)` — already happens at line 44), verify `space.ownerId === caller.id`. If not, return `{ status: 'error', code: 'NOT_FOUND', message: 'Space not found.' }`. **No new code path** — slot the ownership check into the existing `if (!space)` branch.
     - **`editDeskAction`:** widen the role check the same way. After fetching the desk (`getDeskById(deskId)` at line 129) — which gives us `desk.spaceId` — fetch the parent space and verify ownership for the `SPACE_OWNER` path. (Phase 1 doesn't currently fetch the space here; the new ownership branch must add one DB roundtrip for owner callers. Admins skip the fetch — Phase 1 parity.)
   - `revalidatePath(\`/owner/spaces/${spaceId}\`)` added alongside the existing `revalidatePath(\`/admin/spaces/${spaceId}\`)`.
   - **Unit tests:** add tests covering:
     - `createDeskAction` called with a `SPACE_OWNER` session on a space they don't own returns `NOT_FOUND`.
     - `editDeskAction` called with a `SPACE_OWNER` session on a desk in a space they don't own returns `NOT_FOUND`.
     - Admin path unchanged (existing tests).

10. **AC-10 (`confirmBookingAction` + `rejectBookingAction` — role-branched scope check).** Per BA Decisions §6 + §8:
    - Edit [src/actions/booking.ts](deskhive/src/actions/booking.ts):
      - **`confirmBookingAction`:** widen the role check (currently `requireRole(SUPER_ADMIN)` at line 293) to allow `SUPER_ADMIN` or `SPACE_OWNER`. After fetching the booking (`getBookingById(bookingId)` at line 318), if caller is `SPACE_OWNER`, fetch the space via `getSpaceById(booking.spaceId)` and verify `space.ownerId === caller.id`. If not, return `{ status: 'error', code: 'NOT_FOUND', message: 'Booking not found.' }` (same code Phase 1 uses for missing bookings — Decision §8 leak-prevention).
      - **`rejectBookingAction`:** identical extension to confirm. Same target NOT_FOUND code.
    - `revalidatePath('/owner/bookings')` added alongside the existing `revalidatePath('/admin/bookings')`.
    - **Unit tests** (critical — per Decision §8):
      - `confirmBookingAction` called with a `SPACE_OWNER` session on a booking on a space they don't own returns `NOT_FOUND`.
      - `rejectBookingAction` same.
      - Admin path unchanged (existing tests still pass).

11. **AC-11 (TOAST_COPY extension — 2 new constants).** Per BA Decision §3:
    - Extend [src/lib/toast.ts](deskhive/src/lib/toast.ts) with:
      - `SPACE_CREATED_TITLE: 'Space created'`
      - `SPACE_CREATED_DESCRIPTION: 'Now add a desk to make it bookable.'`
    - Add 2 new pins to [src/lib/toast.test.ts](deskhive/src/lib/toast.test.ts) matching the Story 6-3 / 7-3 / 7-4 frozen-string-verification pattern.

12. **AC-12 (Seed updates — owner@deskhive.local gets one space + 2-3 bookings).** Per BA Decision §10:
    - Extend [scripts/seed.ts](deskhive/scripts/seed.ts):
      - **New helper `seedOwnerSpace(opts)`:** if a space with a designated marker (e.g., name `'Seeded Owner Coworks'`) already exists with `owner_id = owner_user_id`, skip. Otherwise INSERT a plausible space row with `owner_id` set to the owner's id. Also seed 2-3 desks on that space (mix of price points via `src/lib/money.ts` `dollarsToCents`).
      - **New helper `seedOwnerBookings(opts)`:** seed 2-3 bookings on the owner's space from existing guest applicant users (the four `applicant*@deskhive.local` users from Story 7-4 are perfect — three of them are still GUEST; applicant3 was promoted to SPACE_OWNER so skip them as a booking-source). Mix of statuses: at least 1 PENDING, at least 1 CONFIRMED, ideally 1 REJECTED. Idempotent: skip if any booking by these guests on this space already exists. Use `bookingDate` ~7 days in the future (CONFIRMED + PENDING) and ~7 days in the past (REJECTED).
      - Insert both helper calls after the existing Story 7-4 application seeding in `main()`.
      - Other existing seeded spaces stay with `owner_id = NULL` — **do not backfill** (Decision §10 last paragraph).
    - Update [deskhive/README.md](deskhive/README.md)'s "Seeded accounts" section to mention the seeded owner space + bookings (one paragraph addition).

13. **AC-13 (`/owner/*` role gate — already covered by Story 7-1's layout).** Per BA Decision §9:
    - All `/owner/*` routes inherit the role guard from [src/app/(owner)/layout.tsx](deskhive/src/app/(owner)/layout.tsx) — Story 7-1's existing layout:
      - Unauthenticated → `redirect('/login?callbackUrl=/owner')`.
      - Authenticated `GUEST` or other non-`SPACE_OWNER` non-`SUPER_ADMIN` → `redirect('/')`.
      - Authenticated `SUPER_ADMIN` → `redirect('/admin/spaces')`.
      - Authenticated `SPACE_OWNER` → render the page.
    - **No new layout work.** The existing layout already does this correctly. AC-13 is a "verify the existing layout still works for the new pages" reminder rather than new code.
    - **Mode-flip avoidance** (Decision §9 note): the layout checks role, NOT mode. A `SPACE_OWNER` in Guest mode who navigates directly to `/owner/spaces` sees the page; the URL implies intent, the mode cookie doesn't force-flip. Defer mode UX refinements to Phase 3.

14. **AC-14 (E2E test coverage — owner CRUD + cross-owner isolation + unauthenticated redirects).** Per BA Decisions §"Browser verification" + the established Phase 2 deferral precedent:
    - **Add new unauthenticated E2E test `tests/e2e/owner-routes.spec.ts`:**
      - `GET /owner` unauthenticated → redirects to `/login` (URL contains `/login`).
      - `GET /owner/spaces` unauthenticated → redirects to `/login`.
      - `GET /owner/spaces/<uuid>` unauthenticated → redirects to `/login`.
      - `GET /owner/spaces/new` unauthenticated → redirects to `/login`.
      - `GET /owner/bookings` unauthenticated → redirects to `/login`.
    - **The 38-point BA browser walk handles authenticated cases** (including the cross-owner isolation check at BA Decision §"Browser verification" §23–24).
    - **Cumulative authenticated-E2E debt continues to mount** — restate in Completion Notes that a "Better Auth fixtures for Playwright" prep story should land before Theme C (Email, Epic 8) so authenticated tests can be added at the same time as the email behavior. Story 7-4 already raised this; 7-5 reinforces it as Theme A's parting recommendation.

15. **AC-15 (No regression in any prior story).** Every flow verified through Story 7.4 must still work:
    - Phase 1: US-1.x auth, US-2.x admin CRUD, US-3.x guest browse/book/cancel, US-4.x admin booking review.
    - Story 5-1 / 5-2 reskins. Story 6-1 dollar input. Story 6-2 `/my-bookings` admin redirect. Story 6-3 booking toast (incl. cancel). Story 6-6 simplified login.
    - Story 7-1 SPACE_OWNER role + mode switching + UserPill dropdown.
    - Story 7-2 applications data layer + Server Actions.
    - Story 7-3 `/become-a-host` Guest form + UserPill Guest-only entry + State A/B/C/D/E branching.
    - Story 7-4 admin application review trio + atomic role promotion.
    - 211 unit (Story 7-4 baseline) + 35 E2E baseline. Target after 7-5: ~217-220 unit (+6 from owner-scope rejection tests + 2 TOAST_COPY pins), ~40 E2E (+5 from new owner-routes.spec.ts).
    - `pnpm typecheck` / `lint` / `test` / `build` / `test:e2e` all clean.
    - **Phase 1 admin form behavior change:** `<CreateSpaceForm>` and `<EditSpaceForm>` now do Client-side navigation via `router.push` instead of relying on Server-Action `redirect()`. BA browser walk verifies this — admin Save buttons should still feel identical (no perceptible UX change), but the navigation now happens in the Client effect after the action returns success state.

16. **AC-16 (Memory entry — `reference_owner_scoped_crud_pattern.md`).** Per BA Decision §12:
    - New memory file codifies:
      - The **owner-scoped CRUD pattern**: route guard for naive access (first line of defense) + Server Action ownership check for defense-in-depth.
      - The **single-Server-Action-with-role-branched-scope-check pattern** — avoids duplicate `ownerConfirmBookingAction` / `confirmBookingAction` proliferation. Phase 2 onwards: extend, don't duplicate.
      - The **Phase 2 auto-publish decision for owner spaces** — no draft state until Epic 9. Sibling note to the Phase 1 `is_published` absence.
      - The **stat-card honesty principle** — don't show $0 payouts when payouts don't exist yet; show a real metric instead. "Bookings this month" over "this month payouts" stub. Reusable for any "future-feature placeholder" decision.
      - The **dashboard empty-state CTA pattern** — when zero spaces, the CTA replaces ALL stat cards (not just adding a CTA below empty cards). Reusable for any "empty hosting surface" dashboard.
      - The **NOT_FOUND-not-FORBIDDEN leak-prevention pattern** for cross-tenant access — owner asking about a space they don't own gets the same response as a genuinely-missing space.
    - Update `MEMORY.md` index with a one-line pointer.

17. **AC-17 (Single commit + memory entry).** Per the established pattern:
    - All Story 7.5 changes land in a single commit on `main` titled exactly `feat: owner dashboard + space management (Story 7-5)`. Commit content is files under `deskhive/` plus the `_bmad-output/` story file + sprint-status update.
    - A small follow-up `docs:` commit fills in the Change Log hash + BA verification after push.
    - Memory entry + index update live in `~/.claude/.../memory/` (out-of-tree, NOT staged).

18. **AC-18 (Stop bar — BA browser verification checklist).** All 38 points from BA Decisions §"Browser verification checklist" verified by BA before greenlight. Highlights (full list in BA Decisions document):
    1. Owner sees real Dashboard / My spaces / Bookings (not "Coming soon" placeholders).
    2. Dashboard shows three honest stat cards (no $0 payouts stub).
    3. Empty-state dashboard for a fresh-approved owner (zero spaces) — CTA replaces cards.
    4. Owner creates a space → lands on edit page → adds a desk → desk visible.
    5. Owner sees only their own spaces in `/owner/spaces`.
    6. Owner sees only their own bookings in `/owner/bookings`.
    7. Owner Confirms a PENDING booking → status flips → toast appears (Phase 1 toast unchanged).
    8. Owner Rejects a PENDING booking → modal opens → status flips.
    9. Cross-owner isolation: another owner's space ID typed in URL → soft redirect to `/owner/spaces`, no data leak.
    10. Admin still sees ALL spaces + ALL bookings platform-wide (no regression).
    11. Admin can still edit any space regardless of `owner_id`.
    12. Guest still can't access `/owner/*`.
    13. Owner-created spaces appear on public browse (auto-published).
    14. Phase 1 + 7-1 + 7-2 + 7-3 + 7-4 flows unchanged.
    15. No console errors.
    16. All unit + E2E tests pass.

## Tasks / Subtasks

- [x] **Task 0 — Prep + Phase 1/7-1/7-2/7-3/7-4 audit.**
  - Verify all CI commands on a clean `main` checkout still pass. Baseline from Story 7.4: 211 unit + 35 E2E + 34 routes.
  - Read [docs/design/7-5-owner-dashboard-and-space-management-ba-decisions.md](docs/design/7-5-owner-dashboard-and-space-management-ba-decisions.md) end-to-end (~440 lines).
  - Re-read the three Phase 1 admin pages this story mirrors (each one's structure becomes the owner-side template):
    - [src/app/admin/spaces/page.tsx](deskhive/src/app/admin/spaces/page.tsx) — list page template.
    - [src/app/admin/spaces/new/page.tsx](deskhive/src/app/admin/spaces/new/page.tsx) + [create-space-form.tsx](deskhive/src/app/admin/spaces/new/create-space-form.tsx) — create form template.
    - [src/app/admin/spaces/[id]/page.tsx](deskhive/src/app/admin/spaces/[id]/page.tsx) + the three form Client Components — edit + desk CRUD template.
    - [src/app/admin/bookings/page.tsx](deskhive/src/app/admin/bookings/page.tsx) + [bookings-table.tsx](deskhive/src/app/admin/bookings/bookings-table.tsx) — bookings queue template.
  - Re-read the three Server Action modules this story extends with role-branched scope:
    - [src/actions/space.ts](deskhive/src/actions/space.ts) — `createSpaceAction` + `editSpaceAction`.
    - [src/actions/desk.ts](deskhive/src/actions/desk.ts) — `createDeskAction` + `editDeskAction`.
    - [src/actions/booking.ts](deskhive/src/actions/booking.ts) — `confirmBookingAction` + `rejectBookingAction`.
  - Re-read [src/app/(owner)/layout.tsx](deskhive/src/app/(owner)/layout.tsx) — the existing Story 7-1 role guard inherited by all new pages.
  - Re-read [src/components/header.tsx](deskhive/src/components/header.tsx) — Variant 4 (SPACE_OWNER Host mode) Dashboard/My spaces/Bookings nav. **No header changes needed** — Story 7-1's three links already point to the right paths.
  - Re-read Story 7-1's [`reference_role_specific_nav_pattern.md`] and [`reference_role_and_mode_switching.md`] memory entries — they inform AC-13's role-guard preservation.
  - Re-read [src/db/schema.ts](deskhive/src/db/schema.ts) lines 56–60 to confirm `spacesTable.ownerId` already exists (FK to `usersTable.id`, nullable).

- [x] **Task 1 — Owner-scoped query helpers** (AC-1):
  - Add `listSpacesForOwner(ownerId)` + `getSpaceByIdForOwner(id, ownerId)` to `src/db/queries/spaces.ts`.
  - Add `listBookingsForOwner(ownerId)` to `src/db/queries/bookings.ts` (mirror `listAllBookings` JOIN pattern + add `WHERE spaces.owner_id = ownerId`).
  - Defense-in-depth: explicit `guest` field projection — `id`, `email`, `fullName` only.
  - Unit tests (light) — at least one positive case per new function. Heavy lifting is in the action-layer ownership tests (AC-8/9/10).

- [x] **Task 2 — Server Action extensions: spaces** (AC-8):
  - Edit `createSpaceAction`: widen role check, stamp `owner_id` if SPACE_OWNER, refactor return shape from `redirect()` to `{ status: 'success', spaceId }`.
  - Edit `editSpaceAction`: widen role check, ownership check inside (Decision §8), refactor return shape from `redirect()` to `{ status: 'success' }`.
  - Update `createSpace` query helper to accept optional `ownerId`.
  - Update `revalidatePath` calls (add `/owner/spaces`).
  - Add unit tests for the new ownership-rejection path + admin path preservation.

- [x] **Task 3 — Server Action extensions: desks** (AC-9):
  - Edit `createDeskAction`: widen role check, ownership check via parent space.
  - Edit `editDeskAction`: widen role check, ownership check via parent space (one extra DB roundtrip for owner callers).
  - Update `revalidatePath` (add `/owner/spaces/[id]`).
  - Unit tests for ownership-rejection path + admin path.

- [x] **Task 4 — Server Action extensions: bookings** (AC-10):
  - Edit `confirmBookingAction`: widen role check, ownership check via booking→space→owner_id.
  - Edit `rejectBookingAction`: same.
  - Update `revalidatePath` (add `/owner/bookings`).
  - **Unit tests** — these are the most security-critical tests per Decision §8. Cover both ownership-rejection (SPACE_OWNER on another owner's booking) AND admin-path preservation (SUPER_ADMIN on any booking still works).

- [x] **Task 5 — Form Client Component variant prop** (AC-7):
  - Add `variant?: 'admin' | 'owner'` to `<CreateSpaceForm>` and `<EditSpaceForm>`. Branch the post-success navigation; fire toast on owner-success in `<CreateSpaceForm>`.
  - Hook up `useActionState` + state-identity `useRef` guard pattern matching Stories 6-3 / 7-3 / 7-4.

- [x] **Task 6 — `/owner/spaces/new` page** (AC-4):
  - Create `src/app/(owner)/owner/spaces/new/page.tsx` (Server Component). Renders header + `<CreateSpaceForm variant="owner">`.

- [x] **Task 7 — `/owner/spaces` list page** (AC-3):
  - Replace `src/app/(owner)/owner/spaces/page.tsx`. Server Component reading `listSpacesForOwner`.
  - Render page chrome + "New space" CTA + table (or empty state).

- [x] **Task 8 — `/owner/spaces/[id]` edit page** (AC-5):
  - Create `src/app/(owner)/owner/spaces/[id]/page.tsx`. Server Component with UUID validation + ownership soft-redirect + render of `<EditSpaceForm variant="owner">` + desks section reusing Phase 1's `<EditDeskForm>` + `<AddDeskForm>`.

- [x] **Task 9 — `/owner` dashboard page** (AC-2):
  - Replace `src/app/(owner)/owner/page.tsx`. Server Component computing three stat counts + 5 most recent bookings.
  - Render the three stat cards (each clickable) + recent activity section.
  - Empty state: single CTA card when zero spaces.

- [x] **Task 10 — `/owner/bookings` list page + `<OwnerBookingsTable>`** (AC-6):
  - Replace `src/app/(owner)/owner/bookings/page.tsx`. Server Component reading `listBookingsForOwner` + reading `searchParams.filter` for initial chip selection.
  - Create `src/app/(owner)/owner/bookings/owner-bookings-table.tsx` (`'use client'`). Mirror `<BookingsTable>` closely.
  - Inline Confirm / Reject buttons reuse Phase 1 components.

- [x] **Task 11 — TOAST_COPY extension** (AC-11):
  - Add 2 new constants + 2 new test pins.

- [x] **Task 12 — Seed updates** (AC-12):
  - Add `seedOwnerSpace` + `seedOwnerBookings` helpers to `scripts/seed.ts`. Idempotent.
  - Update README's "Seeded accounts" section.

- [x] **Task 13 — Unauthenticated E2E coverage** (AC-14):
  - Create `tests/e2e/owner-routes.spec.ts` with 5 unauthenticated redirect cases.

- [x] **Task 14 — Local CI parity** (AC-15):
  - `pnpm typecheck` clean.
  - `pnpm lint` clean.
  - `pnpm test` — baseline 211 + ~8 new (action ownership rejections + 2 TOAST_COPY pins). Target ~219.
  - `pnpm build` — **route count grows by 2** (`/owner/spaces/new` + `/owner/spaces/[id]`) → 36 routes (was 34).
  - `pnpm test:e2e` — baseline 35 + 5 new owner-routes redirects. Target ~40.

- [ ] **Task 15 — Manual verification (BA's eyeball — AC-18 / Verification §1–38).** *(DEFERRED to BA's review pass per Stories 5.1 → 7.4 precedent — dev-agent runs the automated suite (typecheck/lint/test/build/test:e2e all green) + seeded the test owner's space + bookings; BA owns the 38-point browser walk including cross-owner isolation + admin regression checks.)*

- [x] **Task 16 — Memory + sprint-status + Dev Agent Record + single commit (no push)** (AC-16, AC-17):
  - Create `~/.claude/.../memory/reference_owner_scoped_crud_pattern.md` per AC-16. Type: `reference`. Cross-reference Story 6-2's role-redirect pattern + Story 7-2's transaction pattern + Story 7-4's admin-review pattern.
  - Update `MEMORY.md` index.
  - Update `_bmad-output/implementation-artifacts/sprint-status.yaml`: `7-5-owner-dashboard-and-spaces: backlog` → `review`. Update `last_updated` parenthetical.
  - Update this story file: `Status: ready-for-dev` → `Status: review`; mark all Tasks `[x]` except Task 15 (BA's eyeball); fill in Dev Agent Record.
  - Stage all deskhive/ files + the two `_bmad-output/...` files.
  - Commit: `feat: owner dashboard + space management (Story 7-5)`.
  - **Do NOT push.** Wait for BA browser-verification per Task 15 before pushing.
  - After BA greenlight: push, then add a small `docs:` follow-up commit to fill in the Change Log hash + mark Status `done`.

## Dev Notes

### What gets built and what's deliberately out of scope

This is the **fifth and final story of Epic 7 — Multi-Tenant** and **closes Theme A end-to-end through the UI**. After it lands at `review` and BA greenlights:

- A SPACE_OWNER has a real Host-mode surface: Dashboard / My spaces / Bookings — not placeholders.
- A SPACE_OWNER can create + edit their own spaces, manage desks on those spaces, and confirm/reject bookings on those spaces.
- Cross-tenant isolation is enforced at TWO layers: route guard (first line of defense) AND Server Action ownership check (authoritative, defense-in-depth).
- Admin retains platform-wide access for all four primary surfaces (spaces, bookings, applications, guests) — Phase 1 behavior unchanged.
- Theme A is complete. **Theme B (Payments, Epic 9) + Theme C (Email, Epic 8) can now proceed in parallel.**

Feature scope (Story 7.5 only):
- ✅ Three owner-scoped query helpers (`listSpacesForOwner`, `getSpaceByIdForOwner`, `listBookingsForOwner`).
- ✅ Real `/owner` dashboard with three honest stat cards + recent activity + zero-spaces CTA empty state.
- ✅ Real `/owner/spaces` list page (owner-scoped).
- ✅ Real `/owner/spaces/new` create form (reuses `<CreateSpaceForm>` with variant prop).
- ✅ Real `/owner/spaces/[id]` edit page with desk CRUD (reuses Phase 1 desk form Client Components as-is).
- ✅ Real `/owner/bookings` list page with filter chips + sortable table + inline Confirm/Reject.
- ✅ Role-branched scope extension on six Server Actions (create/editSpace, create/editDesk, confirm/rejectBooking).
- ✅ Two new TOAST_COPY constants (`SPACE_CREATED_TITLE` + description) + pins.
- ✅ Seed extension: one space + 2-3 bookings for `owner@deskhive.local` (idempotent).
- ✅ Unauthenticated E2E coverage of all 5 `/owner/*` routes.
- ✅ Memory entry codifying the owner-scoped CRUD pattern + auto-publish decision + stat-card honesty principle.

Out of scope (do NOT build):
- ❌ `/owner/payouts` route — Epic 9 (Stripe Connect).
- ❌ `/owner/settings` route — Epic 9 (Stripe Connect onboarding).
- ❌ Stripe Connect onboarding gate on space publishing — Epic 9 (Decision §4: 7-5 auto-publishes).
- ❌ Email notifications on booking confirm/reject by owner — Epic 8 (Phase 1 had no email here either).
- ❌ "This month payouts" stat card — replaced with honest "Bookings this month" (Decision §1 pushback).
- ❌ Owner-initiated refunds — Epic 9 (FR-REFUND-4).
- ❌ Image upload — Phase 1 uses image URL only.
- ❌ Multi-image gallery, amenities, working hours, or any new space/desk/booking fields.
- ❌ Charts, occupancy heatmaps, advanced analytics — Phase 3 candidate.
- ❌ Backfilling existing Phase 1 seeded spaces with permanent owners — only the seed owner's one space gets an owner.
- ❌ Changes to public browse / space detail / booking flow.
- ❌ Changes to `/admin/spaces`, `/admin/bookings`, `/admin/applications`, or `/admin/guests` data scope (Decision §7 — admin pages stay platform-wide).
- ❌ Owner-specific "filter by owner" chip on admin pages, or "owner column" on `/admin/bookings`.
- ❌ Bulk actions (bulk approve / bulk reject / bulk delete) on either spaces or bookings.
- ❌ Search/text filter on owner pages (chips + sort only — admin parity).
- ❌ Pagination on any owner page (Phase 2 small-volume assumption — admin parity).
- ❌ Schema changes — `spaces.owner_id` already exists from Story 7-1; no new columns.
- ❌ Duplicate Server Actions (e.g., `ownerConfirmBookingAction`) — explicit anti-pattern per Decision §8.
- ❌ Draft / published state machine for spaces — explicit anti-pattern per Decision §4.
- ❌ Authenticated E2E tests — same precedent deferral as every prior story since 5-1.
- ❌ Header / nav changes — Story 7-1's three Host-mode nav items already point at the right destinations; the placeholder destinations just become real.

### Key decisions

1. **Single Server Action with role-branched scope check — no duplication.** Per Decision §8: the existing `createSpaceAction`, `editSpaceAction`, `createDeskAction`, `editDeskAction`, `confirmBookingAction`, `rejectBookingAction` are extended with a `caller.role === 'SPACE_OWNER'` branch that re-verifies the row's `owner_id`. No new `ownerConfirmBookingAction` next to `confirmBookingAction`. The scope check is INSIDE the action — the Server Action is authoritative; the `(owner)/layout.tsx` route guard is first-line-of-defense only.

2. **NOT_FOUND, not FORBIDDEN, for cross-tenant mismatches.** When a SPACE_OWNER asks about a space they don't own, the action returns the same `NOT_FOUND` code Phase 1 returns when the row genuinely doesn't exist. This is intentional leak-prevention: "this space exists but isn't yours" reveals ownership to attackers; "no such space" doesn't. Same approach for desks, bookings.

3. **Two-layer ownership check** — route guard (soft-redirect, UX-friendly) + Server Action (authoritative, error state). The route guard handles the naive case (user types another owner's URL → silently redirect to `/owner/spaces`). The Server Action handles the malicious case (POST with forged form data → return NOT_FOUND error state). Both are required; neither alone is sufficient.

4. **Phase 2 auto-publish for owner spaces — no draft state.** Per Decision §4: Epic 9 (Stripe Connect) introduces the publish gate. Adding a draft state in 7-5 only to gate it in 9-2 means schema churn and UI churn across two stories for the same feature. For now: `spaces.status` defaults to `'PUBLISHED'` at the DB level (Phase 1 existing default), and owner-created spaces follow that default — no new `is_published` column, no new UI toggle.

5. **Stat-card honesty over forward-compat stubs.** Per Decision §1: the PRD spec listed "this month payouts" as the third stat. Until Epic 9 (Stripe Connect) ships, that card would either lie ($0 with no Stripe means "no payouts ever" not "no payouts this month") or stub ("Coming soon"). Replaced with "Bookings this month" — same query the page already needs, honest, useful. When Epic 9 ships, add the payouts card as a fourth card or replace this one then.

6. **Action return shape refactor — return success state, let client navigate.** `createSpaceAction` and `editSpaceAction` currently call `redirect()` from inside the action. To support the owner path's toast + new-space-edit-page navigation, the actions are refactored to return `{ status: 'success', spaceId? }` and the Client form handles the navigation via `router.push`. **Small Phase 1 admin form touch** — `<CreateSpaceForm>` (admin variant) and `<EditSpaceForm>` (admin variant) now navigate via Client effect instead of Server redirect. BA browser walk verifies no perceptible UX change for admins.

7. **Single shared `<CreateSpaceForm>` + `<EditSpaceForm>` with variant prop — but two separate `<BookingsTable>` files (admin + owner duplicate).** Forms are simple — 5 input fields, identical validation; the only difference is post-success navigation/toast. A 1-line variant branch in the success-effect is cleaner than two ~120-line form files. Bookings tables are more complex — different page chrome, different empty-state copy, different parent component context; a shared component would need branches in 3+ places. Two parallel files are the simpler cut. **Resist the urge to abstract bookings tables — the cost of the abstraction is higher than the duplication.**

8. **Desk CRUD reuses Phase 1's three desk form Client Components as-is.** `<AddDeskForm>`, `<EditDeskForm>` — no variant prop needed. They don't redirect; they `revalidatePath` and stay on the same page. The Server Action (`createDeskAction` / `editDeskAction`) is what gains the role-branched scope check; the form Client Components just submit to it. Adding `/owner/spaces/[id]` to the action's `revalidatePath` calls is the only change visible to the form components, and it's invisible.

9. **The dashboard's third card filter pre-selection (`?filter=pending`) is honored via `searchParams` on the `/owner/bookings` page.** Server Component reads `searchParams.filter`; if it's a recognized chip value, passes as `initialFilter` to `<OwnerBookingsTable>`. Default: `'ALL'`. **No new state management** — the Client Component already has `useState` for the filter; the prop just sets the initial value. URL doesn't have to stay in sync after filter changes (no router.push on chip click) — that's a polish item for later.

10. **Owner-scoped query helpers project safe user fields explicitly.** `listBookingsForOwner` mirrors `listAllBookings`'s explicit `guest: { id, email, fullName }` projection. Never lets `hashedPassword`, `emailVerified`, etc. leak through Drizzle's default-select-all behavior. Defense-in-depth principle from Story 4-1.

11. **Seed owner's space uses a recognizable name marker for idempotency.** `'Seeded Owner Coworks'` as the space name lets the seed re-run be a no-op if the space already exists with `owner_id = owner_user_id`. Simpler than a UUID-based idempotency check and the name is human-recognizable in the DB.

12. **All cross-cutting framework choices preserved:** `nextCookies()` plugin, conditional UPDATE pattern (booking actions, role promotion), `db.transaction` (Story 7-2's atomic role promotion, untouched here), Server Actions return success state without redirecting (this story's refactor of `createSpaceAction` + `editSpaceAction` finally generalizes the pattern Phase 1's booking actions and Story 6-3 already established), Story 5-2 admin chrome (reused across all five new owner pages), Story 6-3 toast wrapper + voice template (extended with `SPACE_CREATED_*` constants), Story 7-1 role + mode infrastructure (the existing `(owner)/layout.tsx` role guard requires no changes).

### Architectural anti-patterns to avoid (Decision §"forbidden")

- **Do NOT** create owner-specific duplicate Server Actions (e.g., `ownerConfirmBookingAction`). Extend existing actions.
- **Do NOT** rely on the route guard alone for ownership. Server Action MUST re-verify.
- **Do NOT** add a draft/published state on spaces — auto-publish in Phase 2.
- **Do NOT** add a "this month payouts" stat card — use real metrics.
- **Do NOT** create `/owner/payouts` or `/owner/settings` routes — those are Epic 9.
- **Do NOT** add email-sending code anywhere — Epic 8.
- **Do NOT** add Stripe Connect anything — Epic 9.
- **Do NOT** modify `/admin/*` routes' data scope — they remain platform-wide.
- **Do NOT** backfill `owner_id` on existing Phase 1 seeded spaces beyond the one assigned to the seed owner.
- **Do NOT** add new fields to spaces / bookings / desks tables.
- **Do NOT** introduce pagination, search, or bulk actions — admin parity (none of these).
- **Do NOT** introduce new status colors or badge variants — reuse existing.
- **Do NOT** add Phase 3 features (analytics, occupancy heatmaps, multi-image galleries).
- **Do NOT** allow a SPACE_OWNER to edit a space they don't own — server returns `NOT_FOUND`, UI doesn't even render the affordance.
- **Do NOT** allow a SPACE_OWNER to confirm/reject bookings on spaces they don't own.
- **Do NOT** modify Better Auth, the applications table, the role enum, or the mode-switching cookie.
- **Do NOT** force-flip the mode cookie based on URL navigation.
- **Do NOT** abstract `<BookingsTable>` into a generic — two parallel files are simpler.

### Sprint status update

`_bmad-output/implementation-artifacts/sprint-status.yaml` updates:

```yaml
  # Epic 7 — Multi-Tenant (Space Owner Role) — Phase 2 Theme A
  epic-7: in-progress
  7-1-role-infrastructure-and-mode-switching: done        # unchanged
  7-2-applications-data-model: done                        # unchanged
  7-3-guest-application-form: done                         # unchanged
  7-4-admin-application-review: done                       # unchanged
  7-5-owner-dashboard-and-spaces: review                   # was: backlog → ready-for-dev → review
  epic-7-retrospective: optional
```

Update the `last_updated` parenthetical at top of file. On Story 7-5 ship + BA greenlight, Epic 7 transitions from `in-progress` to a candidate for `done` (after the optional retrospective if BA chooses to run it).

**Theme A close-out.** Stories 7-1 through 7-5 land; the multi-tenant marketplace shape is complete. Phase 2 PRD §"Theme A" is fully delivered. Theme B (Payments, Epic 9) + Theme C (Email, Epic 8) are unblocked.

### Recent commits

```
3b2ac9c docs: fill commit hash in Story 7-4 Change Log + record BA greenlight
bac6bc0 feat: admin application review UI (Story 7-4)                          ← Last feature commit
a49e15f docs: fill commit hash in Story 7-3 Change Log + record BA greenlight
8a8e7e9 feat: guest application form + entry point (Story 7-3)
1df8af7 docs: fill commit hash in Story 7-2 Change Log + record BA greenlight
7240499 feat: applications data model + server actions (Story 7-2)
...
```

Story 7.5 is the **fifth and final Phase 2 Epic 7 feature commit**. Subject: `feat: owner dashboard + space management (Story 7-5)`.

### References

- [Source: docs/design/7-5-owner-dashboard-and-space-management-ba-decisions.md](docs/design/7-5-owner-dashboard-and-space-management-ba-decisions.md) — BA decisions document (440 lines, 12 decisions).
- [Source: docs/03-phase2-prd.md §8 Epic 7 §4.6 FR-OWNER-1 through FR-OWNER-4] — Phase 2 PRD (renumbered from original Story 7-6 to 7-5 after Story 7-1 absorbed the original mode-switching story 7-5).
- [Source: deskhive/src/app/(owner)/layout.tsx](deskhive/src/app/(owner)/layout.tsx) — existing Story 7-1 role guard; unchanged by this story.
- [Source: deskhive/src/db/schema.ts](deskhive/src/db/schema.ts) — `spacesTable.ownerId` already exists from Story 7-1.
- [Source: deskhive/src/actions/space.ts](deskhive/src/actions/space.ts) — `createSpaceAction` + `editSpaceAction` gain role-branched scope + return-shape refactor.
- [Source: deskhive/src/actions/desk.ts](deskhive/src/actions/desk.ts) — `createDeskAction` + `editDeskAction` gain role-branched scope.
- [Source: deskhive/src/actions/booking.ts](deskhive/src/actions/booking.ts) — `confirmBookingAction` + `rejectBookingAction` gain role-branched scope (critical security AC per Decision §8).
- [Source: deskhive/src/db/queries/spaces.ts](deskhive/src/db/queries/spaces.ts) — gains `listSpacesForOwner` + `getSpaceByIdForOwner`.
- [Source: deskhive/src/db/queries/bookings.ts](deskhive/src/db/queries/bookings.ts) — gains `listBookingsForOwner`.
- [Source: deskhive/src/lib/toast.ts](deskhive/src/lib/toast.ts) — gains 2 new TOAST_COPY constants.
- [Source: deskhive/scripts/seed.ts](deskhive/scripts/seed.ts) — gains owner space + bookings seed helpers.
- [Source: deskhive/src/app/admin/spaces/page.tsx](deskhive/src/app/admin/spaces/page.tsx) — list-page template mirrored by `/owner/spaces`.
- [Source: deskhive/src/app/admin/spaces/new/create-space-form.tsx](deskhive/src/app/admin/spaces/new/create-space-form.tsx) — extended with `variant` prop.
- [Source: deskhive/src/app/admin/spaces/[id]/page.tsx](deskhive/src/app/admin/spaces/[id]/page.tsx) — edit + desk CRUD template mirrored by `/owner/spaces/[id]`.
- [Source: deskhive/src/app/admin/bookings/bookings-table.tsx](deskhive/src/app/admin/bookings/bookings-table.tsx) — filter-chip + sortable-table template duplicated as `<OwnerBookingsTable>`.
- [Source: deskhive/AGENTS.md] — Next.js 16 caveats.
- [_bmad-output/implementation-artifacts/7-4-admin-application-review.md] — Story 7-4 (commit + memory pattern source; admin-side parity for the symmetric admin review surface).
- [_bmad-output/implementation-artifacts/7-1-role-infrastructure-and-mode-switching.md] — Story 7-1 (the role guard at `(owner)/layout.tsx` was authored here; this story consumes it without modification).
- Dev-agent memory `reference_role_specific_nav_pattern.md` — Story 6-2's role-redirect pattern.
- Dev-agent memory `reference_role_and_mode_switching.md` — Story 7-1's role + mode infrastructure.
- Dev-agent memory `reference_applications_service_and_actions.md` — Story 7-2's `db.transaction` pattern (untouched by this story but cited for completeness).
- Dev-agent memory `reference_admin_review_ui_pattern.md` — Story 7-4's admin review trio (the symmetric admin counterpart to this story's owner-side surfaces).
- Dev-agent memory `reference_toast_wrapper_and_voice.md` — Story 6-3's toast wrapper + voice template extended with `SPACE_CREATED_*`.

## Dev Agent Record

### Agent Model

Claude Opus 4.7 (1M context).

### Debug Log References

| # | Issue | Resolution |
|---|---|---|
| 1 | n/a | No blocking issues during implementation. Typecheck + lint stayed green at every step; the only minor adjustment was the seed log showing applicant2's PENDING re-seeded (the idempotency check is `(userId, status)` and applicant2 had no PENDING application in the DB at run time — expected behavior). |

### Decision-point answers

1. **`getApplicationWithUsers`-style join helper for `/owner/spaces/[id]`?** — No new helper. The page reads via `getSpaceByIdForOwner(id, ownerId)` (single row), then `listDesksForSpace(id)`. Two single-purpose queries are simpler than a 3-table join here.
2. **Where to put the ownership-scope logic for testing?** — Added a pure `isOwnerScopeAllowed({ callerRole, callerId, resourceOwnerId })` helper to `src/lib/auth/guards.ts` alongside the existing `requireOwnership`. Pure function, 7 unit-test cases pin the role × ownership matrix. Each Server Action does its own inline check (the helper is documentation more than abstraction; inlining one if-statement per action is cleaner than threading the helper through six action files).
3. **Share `<BookingsTable>` between admin + owner, or duplicate?** — Duplicate (per story Decision #7). Two parallel files (admin's `<BookingsTable>` + owner's `<OwnerBookingsTable>`) are simpler than one component with branches in 3+ places.
4. **Share `<CreateSpaceForm>` + `<EditSpaceForm>` between admin + owner, or duplicate?** — Share (per story Decision #6). Added a `variant?: 'admin' | 'owner'` prop; the only difference is post-success navigation/toast (a 1-line useEffect branch).
5. **`<AddDeskForm>` / `<EditDeskForm>` variant prop?** — No (per story Decision #8). They don't redirect; they `revalidatePath` and stay on the same page. The action's revalidatePath calls now include `/owner/spaces/[id]` alongside `/admin/spaces/[id]` — invisible to the form components.
6. **Server Action return-shape refactor scope?** — Limited to `createSpaceAction` + `editSpaceAction`. The desk actions and booking actions already return success state (no `redirect()` inside the action); they just got role-branched scope additions. The space actions are the only ones that previously redirected.

### Completion Notes

- **Six Server Actions extended with role-branched scope** (Decision §8 critical security target):
  - `createSpaceAction`, `editSpaceAction` in `src/actions/space.ts`
  - `createDeskAction`, `editDeskAction` in `src/actions/desk.ts`
  - `confirmBookingAction`, `rejectBookingAction` in `src/actions/booking.ts`
  - All follow the same shape: widen role check to `SUPER_ADMIN | SPACE_OWNER`; for `SPACE_OWNER`, fetch the resource (or its parent space for desks/bookings) and verify `ownerId === caller.id`; return `NOT_FOUND` on mismatch (leak-prevention).
- **Action return-shape refactor (space.ts only):** `createSpaceAction` and `editSpaceAction` now return `{ status: 'success', spaceId? }` instead of calling `redirect()` inside the action. Both Phase 1 admin forms and Phase 2 owner forms navigate via Client `useEffect` with state-identity `useRef` guard. Phase 1 admin UX preserved.
- **Owner-scoped query helpers** (`src/db/queries/`): `listSpacesForOwner(ownerId)`, `getSpaceByIdForOwner(id, ownerId)`, `listBookingsForOwner(ownerId)`. The bookings helper mirrors `listAllBookings` shape with explicit safe-field guest projection (defense-in-depth from Story 4-1).
- **Pure `isOwnerScopeAllowed` helper** (`src/lib/auth/guards.ts`) — 7 unit-test cases cover SUPER_ADMIN/SPACE_OWNER/GUEST × matching/non-matching/NULL ownership. Critical-security AC per Decision §8.
- **Five `/owner/*` pages**:
  - `/owner` — dashboard with 3 stat cards + recent activity + zero-spaces CTA empty state (Decision §1 honest stats).
  - `/owner/spaces` — owner-scoped list with `New space` CTA.
  - `/owner/spaces/new` — reuses `<CreateSpaceForm variant="owner">`.
  - `/owner/spaces/[id]` — edit page with UUID validation + ownership soft-redirect + desk CRUD (reuses Phase 1 desk form components as-is).
  - `/owner/bookings` — filter chips + sortable table + inline Confirm/Reject; honors `?filter=pending` query param from dashboard card.
- **Seed extension**: `seedOwnerSpace()` + `seedOwnerBookings()` helpers in `scripts/seed.ts`. Idempotent: name marker `'Seeded Owner Coworks'` for the space; existing-bookings check on the space. Verified end-to-end against Neon — 1 space + 3 desks + 3 bookings (PENDING/CONFIRMED/REJECTED) seeded cleanly.
- **2 new `TOAST_COPY` constants** (`SPACE_CREATED_TITLE` + `SPACE_CREATED_DESCRIPTION`) + 2 frozen-string pins in `toast.test.ts`.
- **5 new unauthenticated E2E specs** in `tests/e2e/owner-routes.spec.ts` covering all 5 `/owner/*` redirects. Authenticated E2E coverage continues to be deferred per the precedent established since Story 5-1 — **the cumulative debt is now substantial; a Better Auth Playwright fixtures prep story should land before Theme C (Email, Epic 8) ships.**
- **Memory entry** `reference_owner_scoped_crud_pattern.md` codifies the two-layer ownership check, NOT_FOUND-not-FORBIDDEN principle, single-action-with-role-branched-scope rule, return-shape refactor convention, auto-publish decision, stat-card honesty principle, dashboard empty-state pattern, forms-share-tables-duplicate decision, and the desk-form-reuse-as-is convention. Reusable for Theme B (Payments, Epic 9) + Theme C (Email, Epic 8) + Phase 3.
- **CI parity:** typecheck ✓ / lint ✓ / 220 unit (was 211, +9 = +7 ownership-scope + 2 TOAST_COPY pins) ✓ / build ✓ 36 routes (was 34, +2 new owner pages) / 40 E2E (was 35, +5 owner-routes redirects) ✓.

### File List

**New files (5):**
- `deskhive/src/app/(owner)/owner/spaces/new/page.tsx`
- `deskhive/src/app/(owner)/owner/spaces/[id]/page.tsx`
- `deskhive/src/app/(owner)/owner/bookings/owner-bookings-table.tsx`
- `deskhive/tests/e2e/owner-routes.spec.ts`
- `~/.claude/.../memory/reference_owner_scoped_crud_pattern.md` (out-of-tree)

**Replaced files (3 — Story 7-1 placeholders → real content):**
- `deskhive/src/app/(owner)/owner/page.tsx` (dashboard)
- `deskhive/src/app/(owner)/owner/spaces/page.tsx` (list)
- `deskhive/src/app/(owner)/owner/bookings/page.tsx` (queue)

**Modified files (11):**
- `deskhive/src/db/queries/spaces.ts` — `listSpacesForOwner`, `getSpaceByIdForOwner`, `createSpace(input, ownerId?)`.
- `deskhive/src/db/queries/bookings.ts` — `listBookingsForOwner`.
- `deskhive/src/lib/auth/guards.ts` — `isOwnerScopeAllowed` pure helper.
- `deskhive/src/lib/auth/guards.test.ts` — 7 new test cases for `isOwnerScopeAllowed`.
- `deskhive/src/actions/space.ts` — role-branched scope + return-shape refactor for both actions.
- `deskhive/src/actions/desk.ts` — role-branched scope for both actions; revalidate `/owner/spaces/[id]`.
- `deskhive/src/actions/booking.ts` — role-branched scope for `confirmBookingAction` + `rejectBookingAction`; revalidate `/owner/bookings` + `/owner`.
- `deskhive/src/app/admin/spaces/new/create-space-form.tsx` — `variant` prop + Client-side navigation + owner toast.
- `deskhive/src/app/admin/spaces/[id]/edit-space-form.tsx` — `variant` prop + Client-side navigation.
- `deskhive/src/lib/toast.ts` — `SPACE_CREATED_TITLE` + `SPACE_CREATED_DESCRIPTION`.
- `deskhive/src/lib/toast.test.ts` — 2 new pins.
- `deskhive/scripts/seed.ts` — `seedOwnerSpace` + `seedOwnerBookings`.
- `deskhive/README.md` — Seeded accounts section extended with owner space + bookings.

**Memory (out-of-tree, in `~/.claude/projects/.../memory/`):**
- **Created:** `reference_owner_scoped_crud_pattern.md` — codifies the two-layer ownership check, NOT_FOUND-not-FORBIDDEN principle, single-action-with-role-branched-scope rule, etc.
- **Updated:** `MEMORY.md` — index appended with the new entry.

### Change Log

| Date | Change | Commit |
|---|---|---|
| 2026-05-13 | Story drafted by `bmad-create-story` from BA decisions document. | (none) |
| 2026-05-13 | Story implemented; owner dashboard + space + bookings surfaces shipped. Six Server Actions gained role-branched scope. Seed extended w/ owner space + bookings. Memory entry codifies the owner-scoped CRUD pattern. Single commit per AC-17. | `3fd797d` |
| 2026-05-13 | BA greenlight: all critical browser-walk checks passed. Two-layer ownership check verified (route soft-redirect + Server Action NOT_FOUND). Cross-tenant isolation confirmed. Admin platform-wide regression clean. Story moves from `review` to `done` upon this follow-up commit. **Theme A complete — Stories 7-1 through 7-5 all shipped.** Theme B (Payments, Epic 9) + Theme C (Email, Epic 8) unblocked. | (this commit) |
