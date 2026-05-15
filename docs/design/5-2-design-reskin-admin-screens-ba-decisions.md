# BA Decisions — Story 5-2: Design Reskin (Admin Screens)

**Story title:** `5-2-design-reskin-admin-screens`

**Context:** Designer Makhbuba delivered the complete design package on Monday, May 11. Story 5-1 (public screens) shipped on Thursday May 7 — that work is live on `origin/main` (commits `adabba7` + `c4b832b`). Story 5-2 closes Epic 5 (Design Integration) by applying Makhbuba's 3 new admin screen designs plus folding in `admin.css` (the admin design language she pre-shipped in v1 and now pairs with admin HTML files). After 5-2 ships, Phase 1 is fully closed including design.

---

## Source artifacts (Amelia reads from these)

**From the v2 design package** at `docs/design/DeskHive - Coworking Space Booking Web App/`:

- `screens/06-admin-spaces.html` — Admin Spaces List design reference (NEW)
- `screens/07-admin-space-edit.html` — Admin Space Edit design reference (NEW)
- `screens/08-admin-bookings.html` — Admin Bookings List design reference (NEW)
- `screens/admin.css` — admin design language (CSS classes for admin chrome, tables, filter chips, action buttons)
- `screens/shared.css` — component class definitions (carried over from v1, unchanged)
- `screens/04-login.html` — login screen, includes new role-selector toggle (small carry-over change, see Decision 8)
- `globals.css` — design tokens v2 (unchanged from v1, no token re-application needed)
- `brief.txt` — designer's full intent (read first for context)

**Files Amelia should NOT use this story:**
- `01-landing.html` and variants — marketing landing page, deferred to Phase 2
- `02-space-detail.html`, `03-register.html`, `05-my-bookings.html` — unchanged from v1, already shipped in Story 5-1
- `tweaks-panel.js` — Claude Design tooling artifact, ignore
- `DeskHive Landing.html` — rendered demo, ignore

**v1 archive** at `docs/design/DeskHive - Coworking Space Booking Web App (v1)/` — preserved for history, do not read from it for implementation.

---

## Scope

Reskin of 3 admin screens + 1 small carry-over change (login role-selector visual) + 1 incidental fix (B© footer typo from Story 5-1). **No schema changes, no new Server Actions, no new REST endpoints, no new functional pages, no changes to Better Auth flow.**

---

## Decisions

### 1. Consolidate `admin.css` into `src/app/globals.css`

Append component classes from Makhbuba's `screens/admin.css` to the existing `globals.css`. The existing `@theme {}` block (design tokens) stays as-is — tokens are unchanged in v2. Append admin-specific component classes:

- Admin chrome: `.admin-tabs`, `.admin-tab` (with `[aria-current="page"]` state), `.admin-actions`
- Admin tables: `.table`, `.table.compact`, `.table-wrap`, `.table-footer`, `.sortable`, `.sort-arrow`
- Admin filter chips: `.chip` (with `[aria-pressed="true"]` state), `.count` (default + `.count.alert` variant)
- Admin action buttons: `.btn-xs`, `.btn-confirm`, `.btn-reject`, `.action-set`, `.action` (td cell)
- Anything else in `admin.css` that supports the 3 admin HTML reference screens

**Do NOT duplicate** any class definitions that already exist in `shared.css` (which is already integrated). Inspect first, then append only the admin-specific additions.

### 2. Reskin `app/admin/bookings/page.tsx`

Translate patterns from `screens/08-admin-bookings.html`:

- **3-tab admin sub-nav** (currently in `app/admin/layout.tsx`): Spaces / Bookings / **Guests** (NEW tab)
  - Replace the existing 2-tab sub-nav (Spaces + Bookings) with 3-tab structure per design
  - Tab counts: Spaces (real count, computed server-side), Bookings (real count of PENDING bookings, with `.count.alert` styling), Guests (no count shown — see Decision 3)
- **Filter chips row** below the page title: All / Pending / Confirmed / Rejected / Cancelled
  - Render visually per design
  - Implement as a Client Component with **client-side filtering** of the already-loaded booking list (Decision 4 from BA choices)
  - Active chip uses `aria-pressed="true"` state
  - Chip counts reflect counts of currently-loaded data
- **Table layout** (replacing current flat-card layout):
  - Sortable "Booked" column with `.sort-arrow` indicator
  - Client-side sort by booking date (Decision 5)
  - Status badges in their own column with `.dot` element (already exists from Story 5-1)
  - Action cell per row: PENDING rows show `Confirm` + `Reject` buttons (`.btn-xs.btn-confirm` + `.btn-xs.btn-reject`); non-PENDING rows show empty action cell
- All existing Server Actions (`confirmBooking`, `rejectBooking`) continue to work unchanged — only the presentation layer changes
- Table footer area: keep simple, no pagination for Phase 1

### 3. Add `app/admin/guests/page.tsx` as a placeholder

The design shows a Guests tab in the admin sub-nav. Create a minimal placeholder page:

- Route: `/admin/guests`
- Server Component, no data fetching
- Page content: `.page-h1` "Guests" + a muted paragraph: "Guest management coming in Phase 2. For now, guests are managed implicitly through their bookings."
- No counts in nav tab (per BA decision C)
- Keep page chrome consistent (header, admin sub-nav, footer)

This honors the design without overcommitting to a feature that doesn't exist yet.

### 4. Reskin `app/admin/spaces/page.tsx`

Translate patterns from `screens/06-admin-spaces.html`:

- Same 3-tab admin sub-nav (Decision 2)
- Page title `.page-h1` "Spaces"
- "New Space" button (existing functionality, restyled per design)
- Spaces list using design's table or card pattern (read `06-admin-spaces.html` for the chosen layout — adopt what's there)
- Existing data flow unchanged: `listAllSpaces` query, no schema changes

### 5. Reskin `app/admin/spaces/[id]/page.tsx`

Translate patterns from `screens/07-admin-space-edit.html`:

- Same 3-tab admin sub-nav (Decision 2)
- Edit Space form (existing fields: name, city, address, description, image URL)
- Desks management section (existing functionality)
- Apply design's form styling, button hierarchy, section spacing
- "Back to spaces" link/breadcrumb if shown in design
- Existing Server Actions unchanged

### 6. Filter chips — client-side filtering implementation

Per BA decision B:

- Filter chips become a small Client Component
- Server Component continues to fetch all bookings via `listAllBookings` (unchanged)
- Client Component receives the full array as a prop and filters client-side based on selected chip
- Default chip on page load: "All"
- URL state optional (nice-to-have): chip selection can sync to `?status=pending` query param for shareability, but not required
- Counts shown on each chip reflect the count from the loaded data array (not a separate DB aggregation)

**Rationale:** Phase 1 has small data volumes. Client-side filtering avoids new server roundtrips and keeps the query layer clean. Phase 2 can promote this to server-side when pagination becomes necessary.

### 7. Sortable column — client-side sort implementation

Per BA decision B:

- "Booked" column gets a sort arrow per design
- Client-side sort by booking date (ascending / descending toggle)
- Default sort: booking date DESC (matches current `listAllBookings` server-side sort, so no visible change on first paint)
- Other columns: not sortable in this story (defer to Phase 2 if requested)

**Rationale:** Same as Decision 6 — small data volumes, no need to invent new query helpers, presentation-layer only.

### 8. Login screen — role-selector visual addition

Makhbuba's `04-login.html` v2 adds a Guest/Admin toggle at the top of the login form. **Treat as visual-only.**

- Render the toggle per design (two-button group, Guest selected by default, brand-color background on selected)
- The selection has **NO effect** on auth flow — Better Auth continues to determine role server-side from the user record
- The toggle is purely a UX hint ("hey admin, you're in the right place")
- No new routes, no new Server Actions, no changes to Better Auth configuration
- Header in login screen v2 design also simplifies (only "Sign up" button visible) — apply this simplification

**Open question pending Makhbuba's reply:** if she confirms she intended functional role-based routing (separate admin login URL), we revisit in a follow-up story. Until confirmed, ship cosmetic-only.

**Footer on login page:** v2 design shows no footer on the login screen. **Decision: keep the footer**. Consistency across pages > matching design exactly here. Footer is small and matches every other page in the app.

### 9. Fix the "B©" footer typo

Carry-over from Story 5-1. Current `app/layout.tsx` footer renders "B© 2026 DeskHive". Should be "© 2026 DeskHive" (no leading "B" — that was likely a copy-paste artifact in `shared.css` or the layout template).

Single-line fix. Bundle into this story.

### 10. Architectural respect (anti-patterns explicitly forbidden)

- **No new schema fields.** No `User.role` enum changes, no `Booking.cancelReason`, no guest table. All Phase 2.
- **No changes to Better Auth flow.** The role selector on login is cosmetic-only.
- **No new Server Actions.** Reskin touches presentation layer only. `confirmBooking`, `rejectBooking`, `cancelBooking`, all space/desk Server Actions remain unchanged.
- **No changes to existing query helpers.** `listAllBookings`, `listAllSpaces`, `listPublishedSpaces`, `listBookingsForGuest` all keep their current signatures and behavior. Client-side filtering/sorting operates on the data they return.
- **All existing Phase 1 functionality must continue working unchanged.** Login, register, browse, book, cancel (US-3.5), confirm (US-4.2), reject (US-4.3) — every flow verified in Story 5-1 must still work after this reskin.
- **Don't apply Makhbuba's localStorage demo code.** The `<script>` blocks at the bottom of her HTML files are demo-only.
- **Don't reproduce Makhbuba's mock data.** Her HTML demos have hardcoded mock data (sample bookings, "328 guests", "14 spaces", "142 bookings"). Real data continues to come from the database. The Guests tab shows no count; Spaces and Bookings tabs show real counts.
- **Status badge component (`StatusBadge`) stays as-is** — already correct from Story 5-1 with the `.dot` element.

### 11. Phase 2 backlog (Amelia documents in Dev Notes section, does NOT implement)

- Guests management feature (`/admin/guests` real implementation, `User` table extensions if needed)
- Server-side filtering/sorting/pagination for admin bookings (when data volume grows)
- Marketing landing page at `/` (from `01-landing.html`)
- Booking confirmation popup/toast (separate Phase 1 polish item from May 8 manager feedback)
- Price-in-dollars clarification (separate Phase 1 polish item, awaiting manager confirmation of intent)
- Registration bug fix (separate Phase 1 polish item, reproduction steps needed)
- Star ratings, "spots left", amenity icons, photo carousels — same as documented in Story 5-1 backlog
- "Forgot password" flow (if role-selector turns out to require it for admin)

### 12. Sprint status

This is Story 5-2 of Epic 5 (Design Integration). After 5-2 lands at review, Epic 5 closes and Phase 1 is fully complete including design. After Phase 1 close, focus shifts to Phase 2 PRD drafting (manager priority from May 8 call) and the separate Phase 1 polish items (popup, registration bug, price clarification).

---

## Verification expectations (BA's checklist post dev-story)

When Amelia completes dev-story, BA will verify:

1. **Admin sub-nav** shows 3 tabs (Spaces / Bookings / Guests) with real counts on Spaces and Bookings, no count on Guests
2. **Admin Bookings page** renders as table layout (not flat cards), with filter chips row and sortable Booked column
3. **Filter chips** correctly filter the booking list client-side (click Pending → only PENDING bookings shown; click Confirmed → only CONFIRMED; etc.)
4. **Sort arrow** on Booked column toggles ascending/descending sort client-side
5. **Pending rows** show Confirm + Reject buttons; non-Pending rows show empty action cell
6. **Confirm/Reject still work** — clicking transitions the booking to Confirmed/Rejected, badge updates, action buttons disappear (same end-to-end behavior as Story 5-1 verification)
7. **Admin Spaces page** matches `06-admin-spaces.html` design direction
8. **Admin Space Edit page** matches `07-admin-space-edit.html` design direction
9. **Login page** shows the Guest/Admin role selector visually; selecting Admin and logging in with a guest's credentials still logs in as guest (proves cosmetic-only treatment)
10. **`/admin/guests` page** renders the placeholder with "Coming in Phase 2" copy
11. **Footer** reads "© 2026 DeskHive" — no leading "B"
12. **All Phase 1 flows still work unchanged:** register, login, browse, book, cancel, admin confirm, admin reject
13. **No console errors** in browser DevTools after navigating through all reskinned screens
14. **All existing unit + E2E tests still pass** (97 unit + 31 E2E from Story 5-1 baseline; minimum-necessary updates only)

---

**End of BA decisions block.**
