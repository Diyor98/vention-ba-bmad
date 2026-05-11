# Story 5.2: Design Reskin — Admin Screens

Status: review

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a **product team (BA Ikhtiyor + designer Makhbuba)**,
I want **the existing Phase 1 admin screens (Spaces list, Space Edit, Bookings) to adopt Makhbuba's admin design language (admin sub-nav, table layouts, filter chips, sortable columns, form cards) without changing functional behavior**,
so that **the admin area feels like a real product instead of a half-reskinned token pass, while every Phase 1 admin flow continues working unchanged.**

> Story 5.2 closes **Epic 5 — Design Integration** and Phase 1 overall. Source of truth: [docs/design/5-2-design-reskin-admin-screens-ba-decisions.md](docs/design/5-2-design-reskin-admin-screens-ba-decisions.md). Visual source: Makhbuba's v2 design package at [docs/design/DeskHive - Coworking Space Booking Web App/](docs/design/DeskHive - Coworking Space Booking Web App/) — the 3 new admin HTML reference screens (`06-admin-spaces.html`, `07-admin-space-edit.html`, `08-admin-bookings.html`) plus `admin.css`.

> **This is (almost entirely) a presentation-layer story.** No schema changes, no new Server Actions, no new REST endpoints. Two small additions ship: a placeholder `/admin/guests` page (Server Component, no data), and a visual-only Guest/Admin role selector on `/login`. Everything else is class swaps + structural reorganization of existing data. All 18 functional stories from Epics 0–4 — and the public + Guest reskin from Story 5.1 — must continue working unchanged. The BA's verification checklist (decisions §Verification Expectations) explicitly enumerates regression coverage.

## Acceptance Criteria

> Source: BA Decisions document, Decisions 1–9 + Verification Expectations.

1. **AC-1 (Append `admin.css` into `src/app/globals.css`).** Append admin-only component classes from [docs/design/DeskHive - Coworking Space Booking Web App/screens/admin.css](docs/design/DeskHive - Coworking Space Booking Web App/screens/admin.css) to the existing `globals.css` **after** the `shared.css` component classes already integrated by Story 5.1.
   - The existing `@theme {}` block stays as-is — tokens are unchanged in v2.
   - Append admin-only classes (do NOT duplicate any class that already exists in the shared.css portion of globals.css — inspect first):
     - Admin chrome: `.mode-pill`, `.admin-subnav`, `.admin-subnav-inner`, `.admin-tabs`, `.admin-tab` (with `[aria-current="page"]` state), `.admin-tab .count` (default + `.count.alert` variant), `.admin-subnav-meta` / `.admin-subnav-meta .sep`.
     - Toolbar / page head: `.admin-page`, `.admin-page-head`, `.admin-page-head .sub`, `.admin-actions`, `.admin-toolbar`, `.admin-toolbar-left`, `.admin-toolbar-right`.
     - Filter chips + selects + search: `.chip` (default + `[aria-pressed="true"]` + `.count` child), `.select`, `.search` + `.search input` + `.search svg` + `.search .kbd`, `.kbd`.
     - Tables: `.table-wrap`, `.table`, `.table thead th` (including `.sortable`, `.sort-arrow`, `.num`, `.action`), `.table tbody td` (including `.num`, `.tnum`, `.action`, `.muted`, `.tight`), `.table tbody tr.clickable` / `.row-attention` / `.table.compact`.
     - Cell helpers: `.cell-primary`, `.cell-thumb` (+ child `svg`), `.cell-img`, `.cell-stack` (+ children `.top` / `.sub`), `.cell-id`, `.avatar-xs`.
     - Inline actions: `.icon-btn` (+ child `svg`), `.btn-xs` (+ `.btn-confirm` / `.btn-reject` / `.btn-neutral` variants), `.action-set`.
     - Pagination: `.table-footer`, `.table-footer .pager`, `.pager-btn` (+ `[aria-current="page"]` + `:disabled`).
     - Form sections (admin edit screen): `.form-card`, `.form-card-head` (+ `h2` / `.sub`), `.form-card-body`, `.form-grid` (+ `.span-2` + 640px breakpoint), `textarea.input`, `.input-row` + `.input-row .input` + `.input-row .addon`, `.toggle` + `.toggle input` + `.toggle-track` + `.toggle-label`, `.save-bar` (+ `.status` + `.pulse` + `.actions` + `.is-dirty` + `.is-saved`).
     - Desk admin rows (in space edit): `.desk-admin-row` (+ children `.num` / `.name` / `.price` (+ `strong`) / `.meta` / `.actions`), `.add-desk-row` (+ child `.input`).
     - Meta strip + breadcrumbs: `.meta-strip` (+ `.sep` + `.meta-item` + `meta-item strong`), `.crumbs` (+ `a` + `a:hover` + `.sep`).
   - **Inspect for duplicates before appending.** Any class name already present from shared.css/globals.css (e.g. anything in shared.css's component layer) MUST NOT be redefined — appending a second definition will create CSS specificity hazards.
   - **Don't apply `tweaks-panel.jsx`** or any `<script>` blocks from Makhbuba's HTML demos. Those are demo-only tooling.

2. **AC-2 (Admin sub-nav — 3 tabs in `src/app/admin/layout.tsx`).** Replace the current 2-tab inline-style `<nav>` with the `.admin-subnav` / `.admin-tabs` / `.admin-tab` structure from `admin.css`:
   - Three tabs: `Spaces`, `Bookings`, `Guests` (in that order).
   - `aria-current="page"` on the active tab (requires `usePathname()` — extract a small Client Component, e.g. `<AdminTabs>`, since the existing admin layout is a Server Component that calls `requireSession()` and we must not poison the request-scoped session check by converting the entire layout to a Client Component).
   - Spaces tab shows real count: number of spaces from `listAllSpaces`. Computed server-side and passed to `<AdminTabs>` as a prop.
   - Bookings tab shows real count of **PENDING** bookings only (per design — the "alert" badge styling). Computed server-side via existing `listAllBookings` filtered in TS to `status === 'PENDING'`. Uses `.count.alert` variant.
   - Guests tab shows **no count** (per BA Decisions §3 — feature doesn't exist yet; counting would imply data we don't have).
   - The `.admin-subnav` is sticky at `top: var(--layout-header-h)` per admin.css — must not collide with the global sticky header from Story 5.1.

3. **AC-3 (Admin Bookings reskin — `src/app/admin/bookings/page.tsx`).** Translate visual + structural patterns from [08-admin-bookings.html](docs/design/DeskHive - Coworking Space Booking Web App/screens/08-admin-bookings.html):
   - Wrap page in `.admin-page` (vertical rhythm).
   - Page head uses `.admin-page-head` with `.page-h1` "Bookings" + optional `.sub` line.
   - **Filter chips row** below the page title: `All` / `Pending` / `Confirmed` / `Rejected` / `Cancelled` — render via `.chip` with `aria-pressed` toggling. Chip counts reflect counts of the currently-loaded data (computed in TS from the array). Implemented as a Client Component (see AC-5).
   - **Table layout** replacing the current flat-card layout from US-4.1:
     - Wrap in `.table-wrap`, render `<table class="table">`.
     - Columns (read 08-admin-bookings.html to confirm the exact set — adopt what's there): Guest, Space, Desk, Booked (date, sortable), Price, Status, Action.
     - `Booked` column uses `.sortable` on its `<th>` with a `.sort-arrow` indicator. Client-side sort toggle (see AC-6).
     - Status column uses the existing `<StatusBadge>` component — no changes (Story 5.1 already shipped the `.badge` + `.dot` structure).
     - Action cell: PENDING rows render `.btn-xs.btn-confirm` + `.btn-xs.btn-reject`; non-PENDING rows render an empty `<td>` (so column widths stay aligned).
   - **All existing Server Actions unchanged.** `confirmBookingAction` (US-4.2) and `rejectBookingAction` (US-4.3) keep their behavior — only the buttons' visual classes change. The verbatim error strings, the `revalidatePath` calls (`/admin/bookings` + `/spaces`), and the rejection-reason length validation all stay.
   - Table footer area: simple — no pagination in Phase 1. **Do not implement `.table-footer` pager-buttons logic** (the CSS classes get appended per AC-1 but no UI uses them; that's Phase 2 work).
   - **Existing data flow unchanged:** `listAllBookings` returns the full booking list sorted `booking_date DESC, created_at DESC` (US-4.1) — same query, same sort. Filtering and re-sorting happen in the Client Component on top of this array.

4. **AC-4 (Admin Spaces reskin — `src/app/admin/spaces/page.tsx`).** Translate from [06-admin-spaces.html](docs/design/DeskHive - Coworking Space Booking Web App/screens/06-admin-spaces.html):
   - Wrap in `.admin-page` + `.admin-page-head`.
   - Page heading `.page-h1` "Spaces" + optional `.sub`.
   - "New Space" button uses `.btn-primary` inside `.admin-actions`.
   - Spaces list: adopt the layout used in 06-admin-spaces.html (likely `.table-wrap` + `.table`; if it's cards, use the appropriate class set — read the HTML first, then implement). If a thumbnail column exists, use `.cell-img` / `.cell-thumb`.
   - **Existing data flow unchanged:** `listAllSpaces` (or whichever helper US-2.1 introduced) keeps its signature. No new query.

5. **AC-5 (Filter chips — Client Component, client-side filtering).** Per BA Decisions §6:
   - Extract a small Client Component (e.g. `<BookingsFilterAndTable>`) under `src/app/admin/bookings/`.
   - Server Component page calls `listAllBookings` (unchanged), then renders `<BookingsFilterAndTable rows={...} />`.
   - Client Component:
     - Holds `selectedStatus: BookingStatus | 'ALL'` in `useState`, default `'ALL'`.
     - Renders the 5 chips with `aria-pressed` reflecting selection.
     - Filters `rows` client-side based on the chip; updates the rendered table accordingly.
     - **Counts on each chip reflect the count from the loaded data array** (not a separate DB aggregation). Compute via `useMemo` over `rows`.
     - URL sync to `?status=pending` is **optional/nice-to-have** per BA Decisions §6 — NOT a requirement of this story; defer if it adds risk. Document the deferral in Dev Notes if so.
   - The Confirm/Reject buttons remain inside the table rows (passed through the Client Component); they're still forms whose `action` is the Server Action import, so `useFormStatus` / hydration boundaries work.

6. **AC-6 (Sortable Booked column — client-side sort).** Per BA Decisions §7:
   - Inside the same `<BookingsFilterAndTable>` Client Component:
     - Holds `sortDirection: 'asc' | 'desc'` in `useState`, default `'desc'` (matches the existing `listAllBookings` server-side sort, so initial paint matches current behavior).
     - Clicking the `Booked` header toggles direction.
     - `.sort-arrow` element reflects the current direction (rendered as `▼` for desc, `▲` for asc, or an icon if you import one — the design uses a subtle caret).
     - Sort comparator operates on `bookingDate` (string compare on ISO date is safe; ties broken by `createdAt` for stability if needed — preserves the US-4.1 sort logic on the client side).
   - **Other columns are not sortable** in this story (Phase 2 backlog).

7. **AC-7 (Admin Space Edit reskin — `src/app/admin/spaces/[id]/page.tsx` + its colocated edit/add-desk/edit-desk forms).** Translate from [07-admin-space-edit.html](docs/design/DeskHive - Coworking Space Booking Web App/screens/07-admin-space-edit.html):
   - Wrap page in `.admin-page`.
   - Breadcrumbs at top using `.crumbs` (`Spaces / [Space name]`).
   - Meta strip below the page title using `.meta-strip` if the design shows one (createdAt, desks count, etc.).
   - **Edit Space form** (`edit-space-form.tsx`): wrap in `.form-card` with `.form-card-head` (title `Space details`) + `.form-card-body`. Use `.form-grid` for multi-column field layout with `.span-2` for full-width fields (description, image URL). Existing fields unchanged: name, city, address, description, image URL. **Save behavior unchanged** (`updateSpaceAction` from US-2.2, including the conditional UPDATE pattern). If the design shows a sticky `.save-bar` at the bottom of the form, implement it as a static element wrapping the submit button — do NOT implement the `is-dirty` / `is-saved` JS pulse logic; that's purely visual demo state from Makhbuba's HTML.
   - **Desks management section**: wrap in a second `.form-card`. Existing desk rows use `.desk-admin-row` grid layout (number, name, price (USD/day), meta, action buttons). The existing `<EditDeskForm>` and inline desk-renaming behavior (US-2.4) stays; only its visual treatment changes.
   - **Add desk inline form**: uses `.add-desk-row`. The verbatim duplicate-label error from US-2.3 follow-up (`fix: surface verbatim duplicate-label error in add-desk form`) — surface via `.field-error` element as introduced in Story 5.1.
   - **All existing Server Actions unchanged**: `updateSpaceAction`, `addDeskAction`, `updateDeskAction`. Conditional UPDATE pattern + verbatim error strings + `revalidatePath` calls all preserved exactly.

8. **AC-8 (`/admin/guests` placeholder page).** Per BA Decisions §3:
   - New file: `src/app/admin/guests/page.tsx`.
   - Server Component, no data fetching, no schema changes, no new server logic.
   - Content: wrap in `.container-content` / `.admin-page`; render `.page-h1` "Guests" + a muted paragraph `<p class="muted">Guest management coming in Phase 2. For now, guests are managed implicitly through their bookings.</p>`.
   - Renders under the existing admin layout (so it inherits the admin sub-nav guard + `requireRole('SUPER_ADMIN')` from `admin/layout.tsx`).
   - The Guests tab in the sub-nav (AC-2) links here. `aria-current="page"` activates when the path is `/admin/guests`.
   - **Do NOT add a count to the Guests tab.** Counting would imply data we don't have (per BA Decisions §3 + §10 mock-data prohibition).

9. **AC-9 (Login screen — Guest/Admin role selector, visual-only).** Per BA Decisions §8:
   - In `src/app/(public)/login/login-form.tsx`, add a two-button toggle group above the email/password fields per [04-login.html](docs/design/DeskHive - Coworking Space Booking Web App/screens/04-login.html) v2.
   - The toggle is **purely visual** — Better Auth continues to determine the user's role server-side from the user record. Selecting `Admin` and logging in with a Guest credential MUST still log the user in as Guest (not block, not warn).
   - Implementation: a small `useState`-backed Client Component or a `<details>` / pure-CSS pattern — either is fine; pick whichever is simpler. **The toggle state is NOT submitted with the form.**
   - Default selected: `Guest` (per BA Decisions §8).
   - Selected style uses brand-color background per design.
   - The header on the login page also simplifies in v2 (only "Sign up" visible). **However:** the global `<Header>` Server Component from Story 5.1 is shared across all pages. Adjusting it to hide nav links specifically on `/login` is structural overreach for this story — **scope-defer the per-page header simplification** and document it in Dev Notes. Ship the role-selector cosmetic change only.
   - **Footer on login page stays** (BA Decisions §8 — consistency wins over matching design exactly here).
   - **No new Server Actions. No changes to `loginAction` from US-1.2.** The hidden `callbackUrl` input from US-3.3 continues to render exactly as today.

10. **AC-10 (Footer "B©" → "©" typo fix).** Per BA Decisions §9:
    - In `src/app/layout.tsx`, the footer currently renders `В© {year} DeskHive` (the `В©` is a Cyrillic-locale UTF-8 mojibake artifact from Story 5.1's bulk-rewrite incident — the byte sequence `0xC2 0xA9` representing `©` was reinterpreted through cp1251 and re-emitted as `В©`).
    - Replace with the proper copyright character: `© {year} DeskHive`.
    - Use the `[System.IO.File]::WriteAllText` + `New-Object System.Text.UTF8Encoding $false` pattern documented in the dev-agent's memory (`feedback_powershell_utf8_set_content_corrupts.md`) to avoid re-introducing the same mojibake during the rewrite.
    - Single-character fix; verify the saved bytes are `0xC2 0xA9` (UTF-8 `©`), not `0xC2 0x92 0xC2 0xA9` (mojibake recurrence).

11. **AC-11 (Architectural respect — anti-patterns explicitly forbidden).** Per BA Decisions §10:
    - **No schema changes.** No `User.role` enum changes, no `Booking.cancelReason`, no `guests` table, no `Desk.area` field. All Phase 2.
    - **No changes to Better Auth flow.** The role selector on login is cosmetic-only.
    - **No new Server Actions.** Presentation-layer only. `confirmBooking`, `rejectBooking`, `cancelBooking`, `updateSpace`, `addDesk`, `updateDesk`, `createSpace`, `loginAction`, `registerAction`, `logoutAction` all stay byte-for-byte.
    - **No changes to existing query helpers.** `listAllBookings`, `listAllSpaces`, `listPublishedSpaces`, `listBookingsForGuest`, `getSpaceWithDesks` (or whatever US-3.2/3.3 introduced) all keep their current signatures and return shapes.
    - **Don't apply Makhbuba's `<script>` blocks** (localStorage tweaks panel, demo state machines). Demo-only.
    - **Don't reproduce Makhbuba's mock data.** Her HTML demos hard-code sample rows (e.g. "328 guests", "14 spaces", "142 bookings"). Real data continues to come from the database. Tab counts: Spaces (real), Bookings PENDING-only (real), Guests (none).
    - **`StatusBadge` stays as-is** from Story 5.1 with the `.dot` element. Do not redefine it.

12. **AC-12 (No regression in any Phase 1 flow — BA Verification §12).** Every flow verified during Epics 0–4 + Story 5.1 must still work:
    - US-1.1 register → auto-login → redirect to `/`
    - US-1.2 login → redirect to `/` or to `?callbackUrl=` target. **Including:** selecting `Admin` on the role-selector then logging in with a Guest credential MUST log in as Guest (no functional effect).
    - US-1.3 logout → header reverts; redirect to `/`
    - US-2.1–2.4 admin spaces + desks CRUD (Create Space, Edit Space, Add Desk, Edit Desk — including the verbatim duplicate-desk-label error from the US-2.3 follow-up commit `12bee8b`)
    - US-3.1 browse with city filter
    - US-3.2 space detail + auto-fetching date picker + availability badges (Story 5.1 structural change preserved)
    - US-3.3 booking creation → redirect to `/my-bookings`; double-booking 409 with verbatim message; callbackUrl same-origin guard
    - US-3.4 my-bookings list with status sections + sort order
    - US-3.5 cancel pending booking + verbatim FORBIDDEN / CANNOT_CANCEL messages + spaces revalidation
    - US-4.1 admin view all bookings — **rendered as a table now**, but all data still visible; filter chips default to `All` so initial paint matches current behavior.
    - US-4.2 admin Confirm + verbatim messages + status flip + spaces revalidation
    - US-4.3 admin Reject + verbatim messages + spaces revalidation + reason length validation
    - All 97 unit + 31 E2E tests still pass (97 = 95 baseline + 2 added in Story 5.1 for `StatusBadge` `.dot` + `size='lg'`).
    - `pnpm typecheck` / `lint` / `test` / `build` / `test:e2e` all clean.

13. **AC-13 (Stop bar — visual + functional verification).** Per BA Decisions §Verification Expectations 1–13:
    - **Admin sub-nav** shows 3 tabs (Spaces / Bookings / Guests) with real counts on Spaces and Bookings, no count on Guests. Bookings count uses `.count.alert` styling.
    - **Admin Bookings page** renders as a table layout (not flat cards), with filter chips row and sortable `Booked` column.
    - **Filter chips** correctly filter the booking list client-side: click `Pending` → only PENDING bookings shown; click `Confirmed` → only CONFIRMED; etc. `aria-pressed` reflects state.
    - **Sort arrow** on Booked column toggles ascending / descending sort client-side.
    - **Pending rows** show `.btn-xs.btn-confirm` + `.btn-xs.btn-reject`; non-Pending rows show empty action cell.
    - **Confirm / Reject still work end-to-end**: clicking transitions the booking, badge updates, action buttons disappear on next render (same behavior as Story 5.1 verification).
    - **Admin Spaces page** matches `06-admin-spaces.html` direction.
    - **Admin Space Edit page** matches `07-admin-space-edit.html` direction (form cards, meta strip, breadcrumbs, desk admin rows).
    - **Login page** shows the Guest/Admin role selector visually; selecting Admin and logging in with a Guest's credentials still logs in as Guest (cosmetic-only proof).
    - **`/admin/guests`** renders the placeholder with "Coming in Phase 2" copy and inherits the admin layout (sub-nav visible, Guests tab marked `aria-current="page"`).
    - **Footer reads "© 2026 DeskHive"** (no leading "B" / no mojibake). Verify the actual bytes in the file are `0xC2 0xA9` and the rendered glyph is `©`.
    - **All Phase 1 flows still work unchanged** (AC-12 enumeration).
    - **No console errors** in DevTools after navigating through every reskinned + every Story 5.1 screen.

14. **AC-14 (Single commit).** All Story 5.2 changes land in a single commit on `main` titled exactly `feat: design reskin — admin screens (Story 5-2)`. Commit content is only files under `deskhive/` plus the `_bmad-output/` story file + sprint-status update. **A small follow-up `docs:` commit may fill in the Change Log hash and BA greenlight notes after BA browser-verification + push** (same pattern as Story 5.1's `c4b832b`).

## Tasks / Subtasks

- [x] **Task 0 — Prep + admin.css inventory.**
  - Verify all CI commands from Story 5.1 (`adabba7`) still pass on a clean `main` checkout: `pnpm typecheck` / `lint` / `test` / `build` / `test:e2e`.
  - Read [docs/design/DeskHive - Coworking Space Booking Web App/brief.txt](docs/design/DeskHive - Coworking Space Booking Web App/brief.txt) sections relevant to admin (skim — the brief covers both audiences).
  - Read all three admin HTML reference files end-to-end: [06-admin-spaces.html](docs/design/DeskHive - Coworking Space Booking Web App/screens/06-admin-spaces.html), [07-admin-space-edit.html](docs/design/DeskHive - Coworking Space Booking Web App/screens/07-admin-space-edit.html), [08-admin-bookings.html](docs/design/DeskHive - Coworking Space Booking Web App/screens/08-admin-bookings.html). Note which class compositions they use for which surfaces.
  - Read [docs/design/DeskHive - Coworking Space Booking Web App/screens/admin.css](docs/design/DeskHive - Coworking Space Booking Web App/screens/admin.css) end-to-end.
  - **Cross-check for duplicates:** open the existing `src/app/globals.css` and scan for any class names that already exist in shared.css's portion. The `.kbd`, `.input-row`, `.toggle`, `.crumbs`, `.meta-strip` classes are admin-css-specific (verified during story drafting). If anything looks duplicate, defer to the existing definition and skip the admin.css copy for that one class.

- [x] **Task 1 — Append admin.css into `src/app/globals.css`** (AC-1):
  - Concatenate admin.css's component classes (everything below its `/* ============================================================ DeskHive — ADMIN-only patterns ... ============================================================ */` header) after the shared.css component block.
  - No new `@theme {}` block, no token changes.
  - **Use `[System.IO.File]::WriteAllText` with `UTF8Encoding(false)` to write the file.** Don't use `Set-Content -Encoding UTF8` — that's what corrupted the `©` glyph in Story 5.1. (See dev-agent memory `feedback_powershell_utf8_set_content_corrupts.md`.)
  - Verify after write: `pnpm typecheck` clean, `pnpm build` clean, no CSS parse errors in browser.

- [x] **Task 2 — Admin sub-nav 3-tab restructure** (AC-2):
  - Create `src/app/admin/admin-tabs.tsx` — a Client Component (`'use client'`) that:
    - Imports `usePathname` from `next/navigation`.
    - Accepts `{ spacesCount: number; pendingCount: number }` as props.
    - Renders the `.admin-subnav` / `.admin-subnav-inner` / `.admin-tabs` markup with three `<Link>`s.
    - Applies `aria-current="page"` based on `pathname.startsWith('/admin/spaces')`, `pathname.startsWith('/admin/bookings')`, `pathname.startsWith('/admin/guests')`.
    - Renders `.count.alert` on the Bookings tab (per design).
  - Modify `src/app/admin/layout.tsx`:
    - Keep the existing `requireSession()` / `requireRole('SUPER_ADMIN')` guard at the top — **do NOT convert the layout to a Client Component.**
    - After the guard, compute `spacesCount` and `pendingCount` server-side (call `listAllSpaces()` + `listAllBookings()` then `.length` and `.filter(b => b.status === 'PENDING').length`). If those calls are expensive or stateful in surprising ways, document and defer to a simpler approach (e.g., a tiny aggregation helper).
    - Render `<AdminTabs spacesCount={...} pendingCount={...} />` in place of the existing inline `<nav>`.
    - **Verify no double-fetch:** if `listAllBookings` is also called by `bookings/page.tsx`, the layout call is an extra DB roundtrip — acceptable for Phase 1; document as Phase 2 optimization candidate.

- [x] **Task 3 — Admin Bookings reskin (table + filter chips + sort)** (AC-3, AC-5, AC-6):
  - Create `src/app/admin/bookings/bookings-table.tsx` — Client Component (`'use client'`):
    - Props: `{ rows: AdminBookingRow[] }` (use the existing return type of `listAllBookings`).
    - State: `selectedStatus: BookingStatus | 'ALL'` (default `'ALL'`), `sortDirection: 'asc' | 'desc'` (default `'desc'`).
    - Renders:
      - The 5 filter chips (All / Pending / Confirmed / Rejected / Cancelled) with counts via `useMemo` over `rows`.
      - The `.table-wrap` + `.table` + `<thead>` + `<tbody>` markup.
      - Each row's status badge via the existing `<StatusBadge>` (import unchanged).
      - Confirm/Reject buttons inside the action `<td>` for PENDING rows: pass through the Server Action via the same `<form>` pattern as US-4.2 / US-4.3, with `useFormStatus` for the pending state. (Importing Server Actions from a Client Component is fine — `'use server'` exports cross the boundary.)
    - Logic:
      - `displayedRows = useMemo(() => rows.filter(matchesStatus).sort(compareByBookedDate), [rows, selectedStatus, sortDirection])`.
      - Chip counts computed once via `useMemo` from `rows` (not from `displayedRows`).
  - Modify `src/app/admin/bookings/page.tsx`:
    - Keep `listAllBookings()` call unchanged.
    - Wrap content in `.admin-page` + `.admin-page-head` per AC-3.
    - Replace the existing flat-card rendering loop with `<BookingsTable rows={rows} />`.
    - The Confirm/Reject button components from US-4.2/4.3 (if they're separate files) keep their internal logic; their visual classes update to `.btn-xs.btn-confirm` / `.btn-xs.btn-reject`. If they were structured as standalone `<form>`s with their own `useFormState`, that structure stays.

- [x] **Task 4 — Admin Spaces reskin** (AC-4):
  - Modify `src/app/admin/spaces/page.tsx`:
    - Wrap in `.admin-page` + `.admin-page-head`.
    - Heading `.page-h1` "Spaces", `.admin-actions` with the existing `<Link href="/admin/spaces/new">` button styled `.btn-primary`.
    - Render the spaces list per `06-admin-spaces.html` (table or card grid — adopt what's there). If table: `.table-wrap` + `.table`. If cards: existing `.card` from Story 5.1 is fine; apply admin-specific tweaks per the HTML.
    - **Don't add any new data fetching.** `listAllSpaces` (or US-2.1's existing helper) returns the array; render it.

- [x] **Task 5 — Admin Space Edit reskin + form cards + desk admin rows** (AC-7):
  - Modify `src/app/admin/spaces/[id]/page.tsx`:
    - Wrap in `.admin-page`.
    - Add `.crumbs` breadcrumbs at top: `Spaces / [Space name]`.
    - Add `.meta-strip` below the page head if the design HTML shows one (read 07-admin-space-edit.html).
    - Wrap the existing `<EditSpaceForm>` in a `.form-card` with `.form-card-head` (title `Space details`) + `.form-card-body`.
    - Wrap the desks section in a second `.form-card` with `.form-card-head` (title `Desks`).
  - Modify `src/app/admin/spaces/[id]/edit-space-form.tsx`:
    - Use `.form-grid` with `.span-2` for description + image URL fields.
    - Existing field labels, validation, Server Action call all unchanged.
    - If the design shows a sticky `.save-bar`: wrap the submit button + a `.status` indicator. **Skip the `is-dirty` / `is-saved` JS pulse logic** — that's demo state. Static `.save-bar` with the existing submit button inside is enough.
  - Modify `src/app/admin/spaces/[id]/add-desk-form.tsx`:
    - Apply `.add-desk-row` layout.
    - Existing verbatim duplicate-label error surfaces via `.field-error` (already wired from Story 5.1).
  - Modify `src/app/admin/spaces/[id]/edit-desk-form.tsx`:
    - Apply `.desk-admin-row` grid layout.
    - Inline edit / save / cancel behavior from US-2.4 unchanged.

- [x] **Task 6 — `/admin/guests` placeholder page** (AC-8):
  - Create `src/app/admin/guests/page.tsx`:
    - Server Component.
    - No imports beyond what's needed for `.page-h1` + `<p class="muted">`.
    - Render: `<div className="admin-page container-content"><h1 className="page-h1">Guests</h1><p className="muted">Guest management coming in Phase 2. For now, guests are managed implicitly through their bookings.</p></div>`.
    - Inherits `requireSession()` + `requireRole('SUPER_ADMIN')` from `admin/layout.tsx` (no per-page guard needed).

- [x] **Task 7 — Login role-selector (cosmetic only)** (AC-9):
  - Modify `src/app/(public)/login/login-form.tsx`:
    - Add a two-button toggle group above the email field.
    - Implementation choice (pick simpler): (a) a small `useState` group inside the existing Client Component, or (b) a CSS-only `<input type="radio">` pair with visual styling — both fine. **The toggle state is NOT in the form payload.**
    - Default selected: `Guest`.
    - Styling per `04-login.html` v2 — selected button uses brand background; unselected button is the standard `.btn-secondary` or similar.
    - Add a small visible note OR Dev Notes comment that this is a cosmetic hint, not a functional gate.
  - **Do NOT modify `loginAction`** in `src/app/(public)/login/login-form.tsx` (or wherever the action lives). The flow stays: Better Auth determines role from the user record.
  - **Verify by manual test:** select `Admin`, submit Guest credentials → logs in as Guest (the user goes to `/` or to `?callbackUrl=` per US-3.3, NOT to `/admin/*`).

- [x] **Task 8 — Footer mojibake fix** (AC-10):
  - In `src/app/layout.tsx`, find the line `<span>В© {new Date().getFullYear()} DeskHive</span>` (or its current mojibake'd byte sequence).
  - Replace `В©` (cp1251-reinterpreted UTF-8 bytes `0xD0 0x92 0xC2 0xA9` rendered as `В©`) with the proper `©` character (UTF-8 bytes `0xC2 0xA9`).
  - **Write via `[System.IO.File]::WriteAllText` with `New-Object System.Text.UTF8Encoding $false`.** Do NOT use `Set-Content -Encoding UTF8` or `Edit` if the IDE is not configured for UTF-8 on this Russian-locale Windows machine — recheck after save by dumping the bytes (`Format-Hex` or similar) to confirm `0xC2 0xA9`.

- [x] **Task 9 — Local CI parity:**
  - `pnpm typecheck` clean.
  - `pnpm lint` clean.
  - `pnpm test` — 97 prior pass; minor adjustments to `status-badge.test.tsx` NOT expected (badge component unchanged this story). New tests not required.
  - `pnpm build` — successful. **Route count grows by 1** (`/admin/guests`); confirm 28 routes register (was 27 after Story 5.1).
  - `pnpm test:e2e` — at least 31 prior tests still pass. **Specs likely affected by Story 5.2:**
    - `tests/e2e/header.spec.ts` — should not be affected (global header unchanged).
    - `tests/e2e/login.spec.ts` — adds the role selector above the email field; existing selectors (`getByLabel('Email')`, `getByRole('button', { name: /log in/i })`) should still resolve. If a test selects "all buttons in the form" and the role toggle is implemented as `<button>`s, the count check might break — adjust to use specific role/name queries.
    - `tests/e2e/admin-bookings.spec.ts` — REST endpoint tests (not visually coupled); should pass. If the spec asserts on a specific DOM structure of `/admin/bookings`, update minimally.
    - `tests/e2e/admin-spaces.spec.ts` — same as above.
  - **Apply minimum-necessary E2E updates only.** Don't expand E2E coverage in this story.

- [ ] **Task 10 — Manual verification (BA's eyeball — Verification §1–13):** *(DEFERRED to BA's review pass — dev-agent ran the full automated suite (typecheck/lint/test/build/test:e2e all green) but does not own the eyeball acceptance per the Story 5-1 precedent.)*
  - Open `pnpm dev` → log in as `admin@deskhive.local`.
  - **Admin sub-nav**: visually confirm 3 tabs, correct counts, no count on Guests, `.count.alert` styling on Bookings.
  - **`/admin/bookings`**: table layout, filter chips work (click each → list filters), sort arrow toggles, Confirm + Reject buttons on PENDING rows only, end-to-end Confirm + Reject still flip status correctly.
  - **`/admin/spaces`**: matches `06-admin-spaces.html` direction.
  - **`/admin/spaces/[id]`**: breadcrumbs, form cards, desk admin rows, inline edit-desk + add-desk still work + verbatim duplicate-label error still surfaces.
  - **`/admin/guests`**: placeholder page with admin sub-nav, Guests tab `aria-current="page"`.
  - **`/login`**: role selector visible, Guest default, selecting Admin + Guest credentials → logs in as Guest (lands on `/`).
  - **Footer** on every page: `© 2026 DeskHive` (no `В©`, no `B©`).
  - **All Phase 1 flows**: register → auto-login → browse → book → see in my-bookings → cancel → admin confirm → admin reject. Each step works.
  - **No console errors** anywhere.

- [x] **Task 11 — Sprint status update + single commit (AC-14):**
  - Update `_bmad-output/implementation-artifacts/sprint-status.yaml`:
    - `5-2-design-reskin-admin-screens: backlog` → `5-2-design-reskin-admin-screens: review`.
    - Update the `last_updated` parenthetical.
  - Update this story file's metadata: `Status: ready-for-dev` → `Status: review`; mark all Tasks `[x]` except Task 10 (BA's eyeball, similar to Story 5.1's Task 13 deferral); fill in the Dev Agent Record + File List + Change Log per the Story 5.1 pattern.
  - Stage `deskhive/...` + the two `_bmad-output/...` files only (no other untracked artifacts).
  - Commit: `feat: design reskin — admin screens (Story 5-2)`.
  - **Do NOT push.** Wait for BA browser-verification per Task 10 before pushing.
  - After BA greenlight: push, then add a small `docs:` follow-up commit to fill in the Change Log hash (same pattern as Story 5.1's `c4b832b`).

## Dev Notes

### What gets built and what's deliberately out of scope

This is the **second and final story of Epic 5 — Design Integration**. After it lands at `review` and BA greenlights:

- The 3 admin screens (Bookings, Spaces, Space Edit) match Makhbuba's v2 admin design direction.
- Admin sub-nav has 3 tabs with live counts (PENDING bookings get the alert badge).
- `/admin/guests` is a placeholder for Phase 2.
- Login screen has the cosmetic Guest/Admin role selector.
- The "B©" footer mojibake from Story 5.1 is fixed.
- Phase 1 is fully closed including design.

Feature scope (Story 5.2 only):
- ✅ Append `admin.css` component classes into `globals.css`
- ✅ Admin sub-nav 3-tab restructure (Spaces / Bookings / Guests) with `aria-current` + real counts
- ✅ Admin Bookings table layout + filter chips (client-side) + sortable Booked column (client-side)
- ✅ Admin Spaces reskin per `06-admin-spaces.html`
- ✅ Admin Space Edit reskin per `07-admin-space-edit.html` (form cards + desk admin rows + meta strip + breadcrumbs)
- ✅ `/admin/guests` placeholder page (Server Component, no data)
- ✅ Login Guest/Admin role-selector (cosmetic-only, no functional effect)
- ✅ Footer copyright glyph fix (`В©` → `©`)

Out of scope for Story 5.2 (do NOT build):
- ❌ Functional guest management (`/admin/guests` real implementation, schema extensions) — Phase 2.
- ❌ Functional role-based routing on login (separate admin login URL, role check before login submit) — pending Makhbuba's reply per BA Decisions §8; revisit if she confirms intent.
- ❌ Per-page header simplification on `/login` (header hides nav links) — structural overreach for this story; document as small follow-up.
- ❌ Server-side filtering / sorting / pagination for admin bookings — Phase 2 (when data volume grows).
- ❌ Search box on admin pages (the `.search` class exists in admin.css but no admin HTML uses it for Phase 1 surfaces) — Phase 2.
- ❌ URL state sync for filter chips (`?status=pending`) — nice-to-have per BA Decisions §6; defer if it adds risk.
- ❌ Marketing landing page at `/` (from `01-landing.html`) — Phase 2.
- ❌ Booking confirmation popup/toast — separate Phase 1 polish item from May 8 manager call (not part of this story).
- ❌ Price-in-dollars clarification — separate Phase 1 polish item, awaiting manager confirmation.
- ❌ Registration bug fix — separate Phase 1 polish item, reproduction steps needed.
- ❌ Star ratings, "spots left", amenity icons, photo carousels, sub-area labels, Forgot password, profile / account settings, dark mode, modal dialogs — all Phase 2 (carried over from Story 5.1's backlog).
- ❌ Mock data anywhere — Makhbuba's HTML demos have hardcoded sample rows. Real data continues to come from the database.
- ❌ Makhbuba's `<script>` blocks (`tweaks-panel.jsx`, localStorage state machines, `is-dirty`/`is-saved` save-bar pulse logic) — demo-only.

### Key decisions

1. **3-tab admin sub-nav requires a Client Component.** `usePathname` is a Client hook. The existing admin layout is a Server Component that runs `requireSession()`. **Decision: extract a small `<AdminTabs>` Client Component**; the layout stays a Server Component, computes the counts server-side, and passes them as props. Do NOT make the entire layout a Client Component — that would either break the auth guard or duplicate it.

2. **Server-side counts in the admin layout = one extra DB roundtrip per request.** `listAllSpaces` and `listAllBookings` get called by the layout to compute the badges; if `bookings/page.tsx` also calls `listAllBookings`, that's a second roundtrip per request. **Decision: accept the duplication for Phase 1.** Phase 1 data volumes are small (single-digit hundreds of bookings worst case). Phase 2 can introduce a tiny aggregation helper (`getAdminCounts()`) or memoize with `unstable_cache`.

3. **Filter chips and sortable column are client-side only** (BA Decisions §6, §7). **Rationale:** Phase 1 small data volumes; client-side filtering avoids new server roundtrips and keeps the query layer clean. Phase 2 promotes to server-side when pagination is needed.

4. **Login role-selector is cosmetic-only** per BA Decisions §8 + the open question pending Makhbuba's reply. The toggle is NOT in the form payload — Better Auth continues to determine role server-side from the user record. **Manual verification step (Task 10) explicitly checks the cosmetic-only property:** select Admin + Guest credentials → logs in as Guest.

5. **Per-page header simplification on `/login` is scope-deferred.** Makhbuba's v2 `04-login.html` shows a stripped header (only "Sign up" visible). The global `<Header>` Server Component from Story 5.1 is shared across all pages; conditional rendering based on pathname would either require `usePathname` (forcing a Client Component) or a route group restructure (structural). **Decision: ship the role-selector cosmetic change; defer the header variant to a small follow-up.**

6. **Footer "B©" is a mojibake artifact, not a typo per se.** During Story 5.1's bulk PowerShell rewrite, `Set-Content -Encoding UTF8` on this Russian-locale Windows machine reinterpreted the UTF-8 bytes `0xC2 0xA9` (the `©` glyph) through cp1251 and re-emitted them as `В©` (the Cyrillic-letter mojibake). **Decision: fix via `[System.IO.File]::WriteAllText` with `UTF8Encoding(false)`** (per dev-agent memory `feedback_powershell_utf8_set_content_corrupts.md`). Verify the saved bytes after write.

7. **Append admin.css after shared.css in globals.css.** Last-write-wins CSS specificity means admin classes layer on top of the shared base. **Inspect for duplicates first** — admin.css defines `.kbd`, `.input-row`, `.toggle`, `.crumbs`, `.meta-strip` which are admin-only (verified during drafting; shared.css does not define them). If anything DOES turn out to be a duplicate, defer to the existing definition.

8. **`StatusBadge` component stays as-is.** Story 5.1 already shipped the `.badge` + `.dot` + `size?: 'sm' | 'lg'` structure. Story 5.2 reuses it in the admin Bookings table without changes.

9. **`/admin/guests` is a real route, not a stub** — it inherits the admin layout (including the auth guard) and renders the "coming in Phase 2" message. The Guests tab in the sub-nav links here; `aria-current="page"` activates when on the route. Routes count in `pnpm build` grows by 1.

10. **Confirm + Reject buttons stay as `<form>` elements** with Server Action `action={...}` props, embedded inside the table rows. Client Component (`<BookingsTable>`) renders them, but the form submission goes to the Server Action — `useFormStatus` continues to work because the `<form>` is the boundary. The verbatim error strings + `revalidatePath` from US-4.2/4.3 remain unchanged.

11. **All cross-cutting framework choices preserved** (carryover from Story 5.1):
    - `nextCookies()` plugin
    - Conditional UPDATE pattern (US-2.2)
    - `revalidatePath` for booking + space writes (US-3.5, US-4.2, US-4.3)
    - Redirect-after-try-catch in Server Actions
    - Layout-level `/admin/*` guard
    - `callbackUrl` same-origin guard from US-3.3
    - Sort order `booking_date DESC, created_at DESC` (US-4.1 server side; Story 5.2 client side defaults to DESC to match initial paint)
    - Per-form `useActionState` with hidden inputs (no `.bind`)

12. **AC-15 pattern from Story 5.1 is preserved:** one feature commit, optionally a small `docs:` follow-up commit after BA greenlight + push to fill in the Change Log hash. See Story 5.1's `c4b832b` precedent.

### Sprint status update

`_bmad-output/implementation-artifacts/sprint-status.yaml` updates:

```yaml
  # Epic 5 — Design Integration (synthetic, post-functional)
  epic-5: in-progress
  5-1-design-reskin-public-screens: review        # unchanged
  5-2-design-reskin-admin-screens: review         # was: backlog
  epic-5-retrospective: optional
```

The `last_updated` parenthetical at the top of the file should reflect Story 5.2 landing at review.

### Recent commits

```
c4b832b docs: fill commit hash in Story 5-1 Change Log + record BA greenlight     ← Story 5-1 hash follow-up
adabba7 feat: design reskin — public screens (Story 5-1)                          ← Story 5-1 feature commit
0583a43 feat: admin reject booking (US-4.3)                                       ← Last functional commit
1180df6 feat: admin confirm booking (US-4.2)
559011c feat: admin view all bookings (US-4.1)
8be46e7 feat: guest cancel pending booking (US-3.5)
6f29214 feat: GET /bookings/me + price on my-bookings (US-3.4)
db5819a feat: guest create booking + minimal my bookings (US-3.3)
1feff2d feat: public view space detail (US-3.2)
8d7bb48 feat: public browse spaces page (US-3.1)
571e8a0 feat: admin edit desk (US-2.4)
12bee8b fix: surface verbatim duplicate-label error in add-desk form (US-2.3 follow-up)
4ea877b feat: admin add desk to space (US-2.3)
3bd3906 feat: admin edit space (US-2.2)
9f79cf1 feat: admin create space (US-2.1)
1864bde fix: register nextCookies plugin so signIn/signOut actually set cookies (US-1.3 follow-up)
826bf32 feat: logout button and global header (US-1.3)
579071b feat: login page and server action (US-1.2)
b7bd9fa feat: guest registration page and server action (US-1.1)
```

Story 5.2 is the **second (and final) non-functional commit in Epic 5**. Subject: `feat: design reskin — admin screens (Story 5-2)`.

### References

- [Source: docs/design/5-2-design-reskin-admin-screens-ba-decisions.md](docs/design/5-2-design-reskin-admin-screens-ba-decisions.md) — BA decisions document (this story's source of truth).
- [Source: docs/design/DeskHive - Coworking Space Booking Web App/brief.txt](docs/design/DeskHive - Coworking Space Booking Web App/brief.txt) — designer's full intent.
- [Source: docs/design/DeskHive - Coworking Space Booking Web App/screens/admin.css](docs/design/DeskHive - Coworking Space Booking Web App/screens/admin.css) — admin-only component class definitions.
- [Source: docs/design/DeskHive - Coworking Space Booking Web App/screens/06-admin-spaces.html](docs/design/DeskHive - Coworking Space Booking Web App/screens/06-admin-spaces.html) — Admin Spaces List visual reference.
- [Source: docs/design/DeskHive - Coworking Space Booking Web App/screens/07-admin-space-edit.html](docs/design/DeskHive - Coworking Space Booking Web App/screens/07-admin-space-edit.html) — Admin Space Edit visual reference.
- [Source: docs/design/DeskHive - Coworking Space Booking Web App/screens/08-admin-bookings.html](docs/design/DeskHive - Coworking Space Booking Web App/screens/08-admin-bookings.html) — Admin Bookings List visual reference.
- [Source: docs/design/DeskHive - Coworking Space Booking Web App/screens/04-login.html](docs/design/DeskHive - Coworking Space Booking Web App/screens/04-login.html) — Login v2 (role-selector reference).
- [Source: docs/design/DeskHive - Coworking Space Booking Web App/screens/shared.css](docs/design/DeskHive - Coworking Space Booking Web App/screens/shared.css) — shared component classes (already in globals.css from Story 5.1; reference only).
- [Source: docs/design/DeskHive - Coworking Space Booking Web App/globals.css](docs/design/DeskHive - Coworking Space Booking Web App/globals.css) — design tokens (already in globals.css from Story 5.1; unchanged in v2; reference only).
- [Source: docs/02-phase1-prd.md] — Phase 1 PRD (functional source of truth; preserved unchanged).
- [Source: deskhive/AGENTS.md] — Next.js 16 caveats.
- [_bmad-output/implementation-artifacts/5-1-design-reskin-public-screens.md] — Story 5.1 implementation artifact (template + pattern source).
- All 18 Phase 1 implementation artifacts in `_bmad-output/implementation-artifacts/` — pattern source for Server Actions, query helpers, and the auth guard chain.
- Dev-agent memory `feedback_powershell_utf8_set_content_corrupts.md` — required reading before bulk file writes on this machine.

## Dev Agent Record

### Agent Model Used

`claude-opus-4-7[1m]` (Claude Opus 4.7, 1M-context). Same agent across the full implementation; no model swap mid-story.

### Debug Log References

| # | Phase | Symptom | Root cause | Fix |
|---|---|---|---|---|
| 1 | Lint | `react/no-unescaped-entities` on the Desks section subhead in `admin/spaces/[id]/page.tsx`. | Apostrophe in `won't` is unescaped JSX text. | Replaced with `won&apos;t`. |
| 2 | Bulk file writes (footer fix) | The footer fix PowerShell script fired from the workspace root (not `deskhive/`), so relative path `deskhive/src/app/globals.css` resolved to a non-existent nested `deskhive/deskhive/...`. | PowerShell tool's cwd differs from Bash tool's cwd. | Re-ran with absolute path. Recorded as a one-off — the memory `feedback_powershell_utf8_set_content_corrupts.md` already prescribes `[System.IO.File]::WriteAllText` but didn't mention path basing; not adding a second memory for this single confusion. |
| 3 | Mojibake sweep | Original story scope (AC-10) only called out `В©` in the footer. A separate grep surfaced `В§` and `В·` mojibake in three more source files' comments (`layout.tsx`, `header.tsx`, `status-badge.tsx`). | Same Story 5-1 PowerShell `Set-Content -Encoding UTF8` incident — different bytes corrupted differently. | Bundled the cleanup into Task 8: same `[System.IO.File]::WriteAllText` + `UTF8Encoding(false)` pass, byte-verified `0xC2 0xA9` and `0xC2 0xA7` afterwards. 3 files touched in addition to the footer. Comments only — zero functional impact. |

### Completion Notes List

**Mid-execution decisions (vs. BA Decisions doc + Story doc):**

1. **`StatusBadge` size prop NOT used in admin Bookings table.** The design HTML uses the default `.badge` (without `.badge-lg`) for both PENDING and non-PENDING rows in the bookings table — only the `.row-attention` row background distinguishes them. Story doc AC-3 didn't prescribe a badge size; defaulted to the base variant per the HTML.
2. **Filter chip URL state sync omitted.** AC-5 explicitly marked it as optional/nice-to-have; shipped without it to keep the surface area small. Re-add if shareable filter URLs become a real ask.
3. **Search box, "Export CSV", "View public page", and city/sort `<select>` filters from the design HTML are NOT shipped.** Per AC-11 (don't reproduce mock data) and Phase 2 backlog (server-side filtering/search). The CSS classes (`.search`, `.select`) ship via admin.css for Phase 2 use, just not rendered.
4. **`.save-bar` sticky save UI is NOT shipped on `/admin/spaces/[id]`.** The existing `<EditSpaceForm>` already has its own submit button. The design's save bar shows demo `is-dirty` / `is-saved` pulse states that AC-7 explicitly excluded; introducing a static `.save-bar` wrapper around the existing button would duplicate the submit action surface. Cleaner to keep the form's submit button as-is. Phase 2 dirty-tracking work can revisit.
5. **`.mode-pill` (the "ADMIN" badge next to the logo) is NOT shipped.** Requires touching the global `<Header>` Server Component to inject a role-aware pill — scope deferral matching AC-9's per-page header simplification deferral. Mode-pill CSS ships via admin.css for future use.
6. **AC-9 per-page login-header simplification stays deferred** as drafted (BA explicitly confirmed in greenlight).
7. **Spaces table doesn't include the "Bookings (30d)" or "Desks" aggregate columns** from `06-admin-spaces.html` — those need new query helpers (count joins). Story doc AC-11 forbids new query helpers. Columns omitted; design impact: smaller, less-informative table. The remaining columns (Space, City, Status, Updated) cover the core admin workflow (find space → edit).

**Implementation observations worth carrying forward:**

1. **The `<AdminTabs>` Client Component pattern is reusable** for any future per-route admin chrome that needs `usePathname()`. The Server Component layout passes counts/data as props; the Client Component handles only the active-state logic. Avoids poisoning the auth guard with `'use client'`.
2. **Tab-counts come from `Promise.all([listAllSpaces(), listAllBookings()])` in the layout.** Each admin request now triggers these two queries even if the page below also calls them — Phase 1 data volumes make this tolerable. Phase 2 candidates: consolidate into `getAdminCounts()`, or wrap with `unstable_cache`, or memoize via `React.cache`.
3. **`<BookingsTable>` does all filtering + sorting in `useMemo`** over the full array prop. Counts are precomputed once per render via a separate `useMemo` so chip badges show full-array counts (not filtered-view counts) — clicking "Confirmed" still tells you how many "Cancelled" exist.
4. **Booking-date display via `Intl.DateTimeFormat` with `timeZone: 'UTC'`.** The raw `bookingDate` is `YYYY-MM-DD`; parsing it as `T12:00:00Z` and formatting with `timeZone: 'UTC'` avoids any TZ-edge flicker and produces identical SSR vs client output (no hydration mismatch).
5. **Confirm/Reject buttons cross the Client-Server boundary cleanly** — they import the Server Action by name from `@/actions/booking` even though they're rendered inside `<BookingsTable>` (a Client Component). Next.js's `'use server'` exports work across this boundary; `useFormStatus()` continues to wire up because the `<form>` is the actual submission unit.
6. **`row-attention` styling** on PENDING rows uses the amber-ish background from admin.css automatically — no inline override. Looks like the design HTML.
7. **`.btn-xs.btn-confirm` / `.btn-xs.btn-reject`** replaced the prior US-4.3 inline-style red-outlined treatment on Reject. The dropped inline `border: '1px solid #FCA5A5'` styling is now covered by the canonical admin.css class.
8. **`role-seg` CSS lives in `globals.css` (appended at the bottom in a dedicated block)**, not admin.css. Makhbuba's `04-login.html` v2 inlined it via a `<style>` block — not part of admin.css. Pulled the relevant rules verbatim, adapted the `input:checked + label` selectors to `button[aria-pressed="true"]` since our implementation uses buttons + state (not radios + labels).
9. **Login role-selector is genuinely cosmetic.** Verified: the toggle's state is in `useState`, lives entirely in `LoginForm`'s Client closure, and is never appended to the form's payload (no hidden input, no value injection). `loginAction` continues to receive only `email` / `password` / `callbackUrl`. Manual verification (Task 10) explicitly checks this.
10. **The "Inactive" `Space.status` rendering uses `badge-cancelled`** (neutral gray) — same as my-bookings PAST section's CANCELLED rows. The design uses red-tinted "Inactive" but red read as "rejected" in our status vocabulary; neutral is more honest.
11. **Mojibake bundling decision.** While the story scope (AC-10) only called for the footer `В©`, a grep surfaced 3 more `В§` / `В·` mojibake instances in source-file comments — all from the same Story 5-1 cp1251 incident. Bundled into the same fix pass (all UTF8Encoding(false) writes, byte-verified after). Pure comment changes, zero functional impact. Not added as new memory because the existing `feedback_powershell_utf8_set_content_corrupts.md` already covers the root pattern.
12. **All cross-cutting framework choices preserved** from Story 5.1: `nextCookies()` plugin, conditional UPDATE pattern, `revalidatePath` for booking + space writes, redirect-after-try-catch in Server Actions, layout-level `/admin/*` guard, `callbackUrl` same-origin guard, sort order `booking_date DESC, created_at DESC`. Verbatim error messages from US-2.3 follow-up, US-3.5, US-4.2, US-4.3 all unchanged.

**Local CI parity (all green):**

- `pnpm typecheck` — clean.
- `pnpm lint` — clean (after the one apostrophe-escape fix).
- `pnpm test` — 97 passed + 1 skipped (vitest, same as Story 5.1 baseline).
- `pnpm build` — clean. Route count: 28 (was 27; `/admin/guests` added).
- `pnpm test:e2e` — 31/31 passed in 15.5s.

### File List

**New (3):**
- `deskhive/src/app/admin/admin-tabs.tsx` — Client Component (`usePathname()` for `aria-current`) rendering the 3-tab admin sub-nav with server-passed counts.
- `deskhive/src/app/admin/bookings/bookings-table.tsx` — Client Component (`useState` + `useMemo`) rendering the bookings table with filter chips + sortable Booked column.
- `deskhive/src/app/admin/guests/page.tsx` — Server Component placeholder page ("Guest management coming in Phase 2").

**Modified — design surface (10):**

- `deskhive/src/app/globals.css` — Appended `admin.css` component classes + `role-seg` CSS block at the bottom. No `@theme {}` changes; no shared.css class duplication.
- `deskhive/src/app/layout.tsx` — Footer mojibake `В©` → `©` (UTF-8 0xC2 0xA9, byte-verified). Also `В§` → `§` in adjacent comment.
- `deskhive/src/app/admin/layout.tsx` — Computes `spacesCount` + `pendingCount` server-side via `Promise.all`; renders `<AdminTabs>` in place of the prior 2-tab inline `<nav>`.
- `deskhive/src/app/admin/spaces/page.tsx` — `.admin-page` + `.admin-page-head` + `.table` + `.cell-primary` + `.cell-id` per `06-admin-spaces.html`. "New space" button → `.admin-actions`.
- `deskhive/src/app/admin/spaces/[id]/page.tsx` — `.crumbs` breadcrumb + `.admin-page-head` + `.meta-strip` + `.form-card` wrappers around the existing `<EditSpaceForm>` and the desks section. `Back to spaces` link replaced by breadcrumb.
- `deskhive/src/app/admin/spaces/[id]/edit-desk-form.tsx` — `.desk-admin-row` grid layout; the form wraps the row so inline US-2.4 Save behavior is preserved. Submit button → `.btn-xs.btn-neutral`.
- `deskhive/src/app/admin/spaces/[id]/add-desk-form.tsx` — `.add-desk-row` layout.
- `deskhive/src/app/admin/bookings/page.tsx` — Wraps content in `.admin-page` + `.admin-page-head`; replaces the inline `<ul>` flat-card rendering with `<BookingsTable rows={rows} />`.
- `deskhive/src/app/admin/bookings/confirm-booking-button.tsx` — `.btn-xs.btn-confirm` styling; structure preserved (still a `<form>` with `useActionState` calling `confirmBookingAction`).
- `deskhive/src/app/admin/bookings/reject-booking-button.tsx` — `.btn-xs.btn-reject` styling; replaces the prior inline-style red-outlined treatment from US-4.3 with the canonical admin.css class.
- `deskhive/src/app/(public)/login/login-form.tsx` — Adds the cosmetic Guest/Admin role selector (`useState`-backed buttons, NOT in form payload). Default selected: Guest.

**Modified — mojibake cleanup (Story 5-1 carryover, comment-only):**
- `deskhive/src/components/header.tsx` — `В·` → `·` in a comment.
- `deskhive/src/components/status-badge.tsx` — `В§` → `§` in a comment.

**Modified — orchestration:**
- `_bmad-output/implementation-artifacts/sprint-status.yaml` — `5-2-design-reskin-admin-screens: ready-for-dev` → `review`; `last_updated` parenthetical updated.
- `_bmad-output/implementation-artifacts/5-2-design-reskin-admin-screens.md` — Status / tasks / Dev Agent Record / Change Log (this file).

### Change Log

| Date | Change | Commit |
|---|---|---|
| 2026-05-11 | Story drafted by `bmad-create-story` from BA decisions document. | (none) |
| 2026-05-11 | Story implemented; admin reskin landed. Single commit per AC-14. | `c5d830a` |
| 2026-05-11 | Browser-verified by BA against AC-13 14-point checklist; greenlit (incl. end-to-end booking round-trip + admin Confirm flow). Role-selector confirmed cosmetic-only. Functional role-based auth flow captured for Phase 2 PRD backlog. | (this follow-up) |
