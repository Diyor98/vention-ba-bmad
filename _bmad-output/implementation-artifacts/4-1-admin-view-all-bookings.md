# Story 4.1: Admin View All Bookings

Status: review

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a **Super Admin**,
I want **to see all bookings on the platform with their status, guest, space, desk, and date at `/admin/bookings`**,
so that **I can manage them.**

> Verbatim from Document B §8 (US-4.1). FR-AB1 (Super Admin views all bookings).

> **This story opens Epic 4 — Admin Booking Management.** It's small: the admin variant of US-3.4's `/my-bookings` (no role-scoped filter; enriched with guest user info via a fourth JOIN). US-4.2 (Confirm) and US-4.3 (Reject) layer Server Actions on top of the rows shipped here.

## Acceptance Criteria

Verbatim Gherkin from Document B §8 US-4.1, plus implementation-shaped ACs:

1. **AC-1 (Super Admin sees all bookings).**
   ```gherkin
   Given three bookings exist across two different guests
   And I am logged in as Super Admin
   When I visit /admin/bookings
   Then I see all three bookings
   And each row shows guest name, space name, desk label, date, and status
   ```

2. **AC-2 (Guest cannot access admin bookings list).**
   ```gherkin
   Given I am logged in as a Guest
   When I send GET /admin/bookings
   Then I receive HTTP 403 Forbidden
   ```
   **Two surfaces:** (a) UI route — `/admin/bookings` page redirects Guests to `/` per US-2.2's `admin/layout.tsx` guard. (b) REST endpoint `GET /api/admin/bookings` — returns 403 (`apiForbidden`) when the session is a Guest. The PRD's "GET /admin/bookings" wording is the REST contract per Doc B §6.4.

3. **AC-3 (Page route under admin layout).** `/admin/bookings/page.tsx` is a Server Component. **No per-page guard** — the admin layout (US-2.2's `admin/layout.tsx`) already runs `requireSession` + `requireRole('SUPER_ADMIN')` for every `/admin/*` page. Same convention as `/admin/spaces` and `/admin/spaces/[id]`.

4. **AC-4 (REST endpoint `GET /admin/bookings`).** Per Doc B §6.4 contract:
   - Auth: `requireSession()` + `requireRole('SUPER_ADMIN')` → 401 / 403 via `AuthError.response`.
   - Returns 200 + array of enriched rows: `[{ booking, desk, space, guest }, ...]`. Same shape pattern as `GET /bookings/me` plus a `guest` field with `id`, `email`, `fullName`. **No password / hashedPassword fields exposed** — explicit field selection in the JOIN's `select(...)`.
   - 500 via `apiError` on internal error.

5. **AC-5 (Doc B §7.4 status badges).** Every row renders the same `<StatusBadge>` component used on `/my-bookings`. The four enum values map to the same colors and labels (`Pending` yellow, `Confirmed` green, `Rejected` red, `Cancelled` gray).

6. **AC-6 (Sort order — same as `/my-bookings`).** `booking_date DESC, created_at DESC` (newest-future first; recent bookings break ties). Same pattern as US-3.4's `listBookingsForGuest`. Implemented in a new sibling helper `listAllBookings` in `src/db/queries/bookings.ts`.

7. **AC-7 (Doc B §7.3 four UI states).** Server Component renders synchronously, so loading is N/A. Empty state: `"No bookings yet."` via `<DataView>`. Error state: default `<DataView>` error message. Loaded: list of rows.

8. **AC-8 (Admin sub-nav for navigability).** **Small UX polish**: extend `admin/layout.tsx` to render a horizontal sub-nav (`Spaces | Bookings`) above `{children}`. Without it, Super Admins have to type `/admin/bookings` directly to navigate from `/admin/spaces` (or vice-versa). The header's existing `Admin` link from US-2.1 still goes to `/admin/spaces` (default landing); the sub-nav is the secondary navigation surface within the admin area.

9. **AC-9 (Stop bar — page renders).** As Super Admin, click `Admin` in the header → land on `/admin/spaces` → click `Bookings` in the admin sub-nav → land on `/admin/bookings`. See one row per booking across all guests, each showing guest name (e.g., `Ada Lovelace`) + space name + desk label + booking date + price + status badge. As Guest, visit `/admin/bookings` → redirect to `/`. As Guest, `GET /api/admin/bookings` → 403.

10. **AC-10 (Single commit).** `feat: admin view all bookings (US-4.1)`. Commit content under `deskhive/`.

## Tasks / Subtasks

- [x] **Task 0 — Prep.** Verify all CI commands from US-3.5 (`8be46e7`) still pass. No DB migrations.

- [x] **Task 1 — Bookings query (extension)** — `src/db/queries/bookings.ts`:
  - Add `listAllBookings(): Promise<Array<{ booking: Booking; desk: Desk; space: Space; guest: { id: string; email: string; fullName: string } }>>`.
  - 4-table JOIN: `bookings → desks → spaces → users`.
  - **Explicit field selection on `users`** — pick `id`, `email`, `fullName` only. **Do NOT select `hashedPassword`, `emailVerified`, etc.** Even though admin sees them, exposing PII via REST should be intentional.
  - Drizzle pattern:
    ```ts
    db.select({
      booking: bookingsTable,
      desk: desksTable,
      space: spacesTable,
      guest: {
        id: usersTable.id,
        email: usersTable.email,
        fullName: usersTable.fullName,
      },
    })
      .from(bookingsTable)
      .innerJoin(desksTable, eq(bookingsTable.deskId, desksTable.id))
      .innerJoin(spacesTable, eq(bookingsTable.spaceId, spacesTable.id))
      .innerJoin(usersTable, eq(bookingsTable.guestUserId, usersTable.id))
      .orderBy(desc(bookingsTable.bookingDate), desc(bookingsTable.createdAt));
    ```

- [x] **Task 2 — `/admin/bookings` page** — `src/app/admin/bookings/page.tsx` (NEW):
  - Server Component. **No per-page guard** — the layout handles it.
  - Calls `listAllBookings()`. Wrap in try/catch → set `<DataView>` status accordingly.
  - Render: heading `Bookings` + `<DataView>` with empty message `"No bookings yet."` + a list. Each row: guest fullName + space.name + desk.label + booking.bookingDate + `formatCents(booking.totalPriceCents)` + `<StatusBadge>`.
  - Layout: same flex pattern as `/my-bookings` — `flex items-center justify-between gap-3` per row.

- [x] **Task 3 — `GET /admin/bookings` REST endpoint** — `src/app/api/admin/bookings/route.ts` (NEW):
  - `requireSession()` + `requireRole('SUPER_ADMIN')` → on AuthError, return `err.response` (401 or 403).
  - Call `listAllBookings()`.
  - Return 200 + array.
  - Internal errors → 500 via `apiError`.

- [x] **Task 4 — Admin sub-nav** — modify `src/app/admin/layout.tsx`:
  - Add a horizontal nav above `{children}`: two `<Link>` elements (`Spaces` → `/admin/spaces`, `Bookings` → `/admin/bookings`).
  - Use raw Tailwind utility classes only. Suggested layout: `<nav className="border-b border-gray-200"><div className="mx-auto max-w-4xl px-6 py-2 flex gap-4 text-sm">…</div></nav>`.
  - **No active-state highlighting** — that requires `usePathname()` from a Client Component; defer to Phase 2 polish or US-4.2/US-4.3 if it bothers anyone.

- [x] **Task 5 — E2E tests** — `tests/e2e/admin-bookings.spec.ts` (NEW):
  - `unauthenticated GET /admin/bookings redirects to /login` — `page.goto('/admin/bookings')`, expect URL `/login`.
  - `unauthenticated GET /api/admin/bookings returns 401` — `request.get('/api/admin/bookings')`, expect 401.
  - **DB-dependent happy-path E2E (multi-guest list rendering, all four badges) DEFERRED** to the Postgres-in-CI story. Same posture as Epic 2 / 3.

- [x] **Task 6 — Local CI parity:**
  - `pnpm typecheck` clean
  - `pnpm lint` clean
  - `pnpm test` — 95 prior pass; no new unit tests required (no new schemas / pure helpers; query is straightforward Drizzle).
  - `pnpm build` — successful, +2 routes (`/admin/bookings`, `/api/admin/bookings`)
  - `pnpm test:e2e` — at least 29 tests pass (existing 27 + 2 new)

- [ ] **Task 7 — Manual verification (BA's eyeball — DEFERRED to BA's review of `review`-state story):**
  - Log in as Super Admin → header shows `Admin` link → click → `/admin/spaces` (sub-nav now shows `Spaces` and `Bookings`).
  - Click `Bookings` in sub-nav → `/admin/bookings` shows list of all bookings (across all guests) with `guest fullName + space + desk + date + price + status badge` per row.
  - Verify with at least one PENDING + one CONFIRMED + one CANCELLED booking (use direct DB UPDATEs to seed the variety) — all three status badges render correctly.
  - Log out → visit `/admin/bookings` → redirect to `/login`.
  - Log in as Guest → visit `/admin/bookings` → redirect to `/`.
  - DevTools: `GET /api/admin/bookings` matrix:
    - No session → 401
    - Guest session → 403
    - Super Admin session → 200 + array of enriched rows (verify `guest.email`, `guest.fullName`, `guest.id` are present; verify `guest.hashedPassword` is NOT present)

- [x] **Task 8 — Single commit (AC-10)** — `feat: admin view all bookings (US-4.1)`.

## Dev Notes

### What gets built and what's deliberately out of scope

This is the **first story of Epic 4 — Admin Booking Management**. After it lands:
- Super Admins can see the full bookings list at `/admin/bookings`.
- The `GET /admin/bookings` REST endpoint exists per Doc B §6.4.
- The admin area gains a sub-nav for Spaces/Bookings navigability.

Feature scope (US-4.1 only):
- ✅ `/admin/bookings` Server Component page
- ✅ `GET /admin/bookings` REST endpoint
- ✅ `listAllBookings` query helper (4-table JOIN with explicit field selection)
- ✅ Admin sub-nav in `admin/layout.tsx`

Out of scope for US-4.1 (do NOT build):
- ❌ Confirm / Reject buttons (US-4.2 / US-4.3 own the actions).
- ❌ Filter by status / guest / space / date — Phase 2.
- ❌ Pagination — Phase 1 inventory is small.
- ❌ Search — Phase 2.
- ❌ Export CSV — Phase 2.
- ❌ A booking-detail admin page — not in Doc B §7.2.
- ❌ Audit log of who did what — Phase 2.
- ❌ Inline editing of any booking field — bookings move via state-machine transitions only.
- ❌ Active-state highlighting on the admin sub-nav — requires Client Component; minimal UX hit; defer.
- ❌ Showing CANCELLED rows differently (struck-through / faded). The status badge color already conveys it.

### Key decisions

1. **Layout-level guard handles auth.** Same pattern US-2.2 established for `/admin/*` pages. Per-page `requireSession` would be a redundant call.

2. **Explicit field selection on the `users` JOIN** — `id`, `email`, `fullName` only. Even though Super Admin sees all data, exposing `hashedPassword` (or any future credential-related field) via JSON REST is bad-by-default. Drizzle's `select({ guest: { id: ..., email: ..., fullName: ... } })` shape gives clean field control without `omit`-style filtering.

3. **Admin sub-nav in the layout** is a small UX win for $5 of effort (5-line addition). Without it, the only path between `/admin/spaces` and `/admin/bookings` is typing the URL. Documented as a deliberate scope addition (not a slippery-slope; one nav element).

4. **Sort order matches `/my-bookings`** — `booking_date DESC, created_at DESC`. Consistent UX between Guest and admin views.

5. **No new validation file.** Pure read endpoint; no input.

6. **`<DataView>` empty message: `"No bookings yet."`** Different from `/my-bookings`'s designer-brief copy because the audience is different (admin, not guest). One short PRD-aligned sentence; no need for a "browse spaces" follow-up since admins don't book.

7. **Guest fullName is the displayed name.** Doc B §6.1 maps Better Auth's `name` to our `fullName` column (US-0.2 follow-up). Matches the PRD AC's "guest name" wording.

### Architecture compliance

- Validation: N/A (no input).
- Form pattern: N/A (read-only).
- State management: N/A.
- Component library: none. Raw Tailwind + `<StatusBadge>` + `<DataView>`.
- Authorization: layout-level `requireRole('SUPER_ADMIN')` for the page; route-level `requireSession + requireRole` for the REST endpoint.
- Error response shape (REST): `apiError` for 500.
- Status codes (REST): 200 / 401 / 403 / 500.
- Auth API: `requireSession` only.
- Reskinnable frontend: literal Tailwind utilities only.

### Code sketches

#### `src/db/queries/bookings.ts` (extension)

```ts
import { usersTable } from '@/db/schema';

export async function listAllBookings(): Promise<
  Array<{
    booking: Booking;
    desk: Desk;
    space: Space;
    guest: { id: string; email: string; fullName: string };
  }>
> {
  return db
    .select({
      booking: bookingsTable,
      desk: desksTable,
      space: spacesTable,
      guest: {
        id: usersTable.id,
        email: usersTable.email,
        fullName: usersTable.fullName,
      },
    })
    .from(bookingsTable)
    .innerJoin(desksTable, eq(bookingsTable.deskId, desksTable.id))
    .innerJoin(spacesTable, eq(bookingsTable.spaceId, spacesTable.id))
    .innerJoin(usersTable, eq(bookingsTable.guestUserId, usersTable.id))
    .orderBy(desc(bookingsTable.bookingDate), desc(bookingsTable.createdAt));
}
```

#### `src/app/admin/bookings/page.tsx` (NEW)

```tsx
import { listAllBookings } from '@/db/queries/bookings';
import { DataView, type DataViewStatus } from '@/components/data-view';
import { StatusBadge } from '@/components/status-badge';
import { formatCents } from '@/lib/format';
import { logger } from '@/lib/logger';
import type { Booking, BookingStatus, Desk, Space } from '@/db/schema';

// Guarded by src/app/admin/layout.tsx — Super Admin only.
export default async function AdminBookingsPage() {
  type Row = {
    booking: Booking;
    desk: Desk;
    space: Space;
    guest: { id: string; email: string; fullName: string };
  };

  let rows: Row[] = [];
  let dataStatus: DataViewStatus = 'loaded';
  try {
    rows = await listAllBookings();
    if (rows.length === 0) dataStatus = 'empty';
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error('admin_bookings_page_failed', { error: msg });
    dataStatus = 'error';
  }

  return (
    <main className="mx-auto max-w-5xl p-8">
      <h1 className="mb-6 text-2xl font-semibold">Bookings</h1>
      <DataView status={dataStatus} emptyMessage="No bookings yet.">
        <ul>
          {rows.map(({ booking, desk, space, guest }) => (
            <li
              key={booking.id}
              className="flex items-center justify-between gap-3 border-b border-gray-200 py-3 text-sm"
            >
              <div className="flex-1">
                <div className="font-medium">{guest.fullName}</div>
                <div className="text-gray-700">
                  {space.name} · {desk.label} · {booking.bookingDate}
                </div>
              </div>
              <span className="text-gray-700">
                {formatCents(booking.totalPriceCents)}
              </span>
              <StatusBadge status={booking.status as BookingStatus} />
            </li>
          ))}
        </ul>
      </DataView>
    </main>
  );
}
```

#### `src/app/api/admin/bookings/route.ts` (NEW)

```ts
import { requireSession, requireRole, AuthError } from '@/lib/auth/guards';
import { listAllBookings } from '@/db/queries/bookings';
import { apiError } from '@/lib/http';
import { logger } from '@/lib/logger';

export async function GET(): Promise<Response> {
  try {
    const session = await requireSession();
    requireRole(session, 'SUPER_ADMIN');
  } catch (err) {
    if (err instanceof AuthError) return err.response;
    logger.error('admin_bookings_route_auth_failed', { error: String(err) });
    return apiError('INTERNAL_ERROR', 'Something went wrong', 500);
  }

  try {
    const rows = await listAllBookings();
    return Response.json(rows, { status: 200 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error('admin_bookings_route_db_failed', { error: msg });
    return apiError('INTERNAL_ERROR', 'Something went wrong', 500);
  }
}
```

#### `src/app/admin/layout.tsx` (modification)

Add a `<nav>` above `{children}`:

```tsx
import Link from 'next/link';
// ...existing imports unchanged

return (
  <>
    <nav className="border-b border-gray-200">
      <div className="mx-auto flex max-w-5xl gap-4 px-6 py-2 text-sm">
        <Link href="/admin/spaces" className="text-gray-700 hover:underline">
          Spaces
        </Link>
        <Link href="/admin/bookings" className="text-gray-700 hover:underline">
          Bookings
        </Link>
      </div>
    </nav>
    {children}
  </>
);
```

The admin guard logic above the `return` stays untouched.

### File-structure requirements

After this story:

```
deskhive/
├── src/
│   ├── app/
│   │   ├── admin/
│   │   │   ├── layout.tsx                     # UPDATED — adds Spaces/Bookings sub-nav
│   │   │   ├── bookings/                      # NEW directory
│   │   │   │   └── page.tsx                   # NEW
│   │   │   └── spaces/                        # (US-2.x — unchanged)
│   │   └── api/
│   │       └── admin/
│   │           ├── bookings/                  # NEW directory
│   │           │   └── route.ts               # NEW — GET /admin/bookings
│   │           ├── desks/                     # (US-2.4 — unchanged)
│   │           └── spaces/                    # (US-2.x — unchanged)
│   └── db/
│       └── queries/
│           └── bookings.ts                    # UPDATED — add listAllBookings
└── tests/
    └── e2e/
        └── admin-bookings.spec.ts             # NEW — 2 unauthenticated tests
```

Files NOT touched:
- `deskhive/src/db/schema.ts` — schema unchanged.
- `deskhive/src/lib/auth/guards.ts` — `requireSession` + `requireRole` consumed.
- `deskhive/src/proxy.ts` — `/admin/bookings` and `/api/admin/bookings` are matched by the existing `/admin/:path*` and `/api/admin/:path*` patterns; no proxy change.
- `deskhive/src/components/header.tsx` — `Admin` link still points to `/admin/spaces` (sub-nav handles within-admin navigation).
- `deskhive/src/components/status-badge.tsx`, `data-view.tsx` — consumed; no source change.
- `deskhive/src/lib/format.ts` — consumed.
- `deskhive/src/actions/*` — read-only story; no Server Actions.
- All Epic 1 / 2 / 3 files except as listed.

### Anti-patterns — explicit DO-NOTs

- ❌ Adding Confirm / Reject buttons. US-4.2 / US-4.3.
- ❌ Including `hashedPassword` (or any auth-internal field) in the JOIN's user select. Explicit field list only.
- ❌ Adding pagination, filters, sort options, search. Phase 2.
- ❌ Re-running `requireSession` inside the page Server Component. Layout handles it.
- ❌ Linking the header's `Admin` element directly to `/admin/bookings`. Stays at `/admin/spaces` (default landing).
- ❌ Adding active-state highlighting in the sub-nav. Requires `usePathname` (Client Component); minimal value, defer.
- ❌ Reusing `listBookingsForGuest` with a "skip filter" arg. Add a sibling `listAllBookings` helper instead — clearer intent, no flag-toggling for an audience switch.
- ❌ Using `auth.api.getSession` directly. `requireSession` only.
- ❌ Adding role gates on the REST endpoint that fall through to 401 for Guests. Guests must get 403 (FR per AC-2 and Section 9 cross-cutting AC).

### Project structure notes

- `src/app/admin/bookings/` joins `src/app/admin/spaces/` as the second top-level admin route. The pattern (`page.tsx` for the list; future `[id]/page.tsx` if needed) parallels `/admin/spaces`. **For Phase 1 there's no `/admin/bookings/[id]` page** — booking actions happen inline on this list (US-4.2 / US-4.3 add per-row Confirm / Reject buttons).
- `src/app/api/admin/bookings/` is the second admin-scoped REST collection. Same naming/structure as `/api/admin/spaces`.
- `listAllBookings` joins `listBookingsForGuest` (US-3.3) in `src/db/queries/bookings.ts`. Two siblings, two audiences, two query shapes — the explicit `listAll*` vs `list*ForGuest` naming is clean.

### Previous story intelligence

- **Epic 3 (US-3.1 → US-3.5):** public discovery + booking flows. `bookings` table writes via `createBooking` (US-3.3) and conditional-UPDATE `cancelBooking` (US-3.5).
- **US-3.5** (`8be46e7`): conditional-UPDATE state-machine pattern + first `requireOwnership` use; closed Epic 3.
- **US-2.2** (`3bd3906`): `admin/layout.tsx` introduced — already running `requireSession` + `requireRole('SUPER_ADMIN')` for every `/admin/*` page.

**Patterns established (replicate, don't deviate):**
- Server Component pages fetch via Drizzle directly.
- `<DataView>` for list-shaped pages with empty/error states.
- camelCase TS field names ↔ snake_case DB columns.
- `<StatusBadge>` for booking-status display.
- Distinct query helpers per audience (`listAll*` vs `list*ForGuest`).
- One feature story → one `feat:` commit.
- Sort: `booking_date DESC, created_at DESC` for booking lists.

### Recent commits

```
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

US-4.1 is the thirteenth `feat:` commit. After it, Epic 4 has US-4.2 / US-4.3 still in `backlog`.

### References

- [Source: docs/02-phase1-prd.md#Section 8] — US-4.1 verbatim Gherkin.
- [Source: docs/02-phase1-prd.md#Section 4.4] — FR-AB1.
- [Source: docs/02-phase1-prd.md#Section 6.1] — `bookings` schema; `users` schema (full_name column).
- [Source: docs/02-phase1-prd.md#Section 6.4] — `GET /admin/bookings` endpoint (Super Admin).
- [Source: docs/02-phase1-prd.md#Section 7.2] — Admin Bookings List screen at `/admin/bookings`.
- [Source: docs/02-phase1-prd.md#Section 7.4] — status badge visual rules.
- [Source: docs/02-phase1-prd.md#Section 9] — cross-cutting: 401 unauth, 403 wrong role, four UI states, integer cents.
- [Source: _bmad-output/implementation-artifacts/2-2-edit-space.md] — `admin/layout.tsx` introduced; per-page guards forbidden in `/admin/*`.
- [Source: _bmad-output/implementation-artifacts/3-3-create-booking.md] — `<StatusBadge>` cast pattern; sort order convention.
- [Source: _bmad-output/implementation-artifacts/3-4-view-my-bookings.md] — `/my-bookings` shape parallels this page; `listBookingsForGuest` query is the sibling.
- [Source: deskhive/AGENTS.md] — Next.js 16 caveats.

## Dev Agent Record

### Agent Model Used

Claude Opus 4.7 (1M context) — invoked via `bmad-dev-story` skill on 2026-05-07 in speed mode.

### Debug Log References

| Step | Notable output |
|---|---|
| `pnpm typecheck` | Clean |
| `pnpm lint` | Clean |
| `pnpm test` | 95/95 pass + 1 skipped — no new unit tests (no new schemas / pure helpers; query is straight Drizzle) |
| `pnpm build` | 25 routes (added `/admin/bookings`, `/api/admin/bookings`) |
| `pnpm test:e2e` | 29/29 pass in 19.8s — added 2 new admin-bookings tests (UI redirect to /login + REST 401) |

### Completion Notes List

**Story executed end-to-end. Stop bar (admin can view all bookings + admin sub-nav navigates between Spaces and Bookings) achieved structurally.** All 95 unit + 29 E2E tests pass. Browser-interactive verification (multi-guest list, status badge variety, REST role matrix) on BA's plate.

**No mid-execution corrections.** Patterns from US-3.4 (`/my-bookings` shape) and US-2.2 (`admin/layout.tsx` guard) carried over cleanly. The admin sub-nav landed in five lines exactly as the story sketched.

**Key implementation observations:**

1. **Explicit field selection on the `users` JOIN** — `id`, `email`, `fullName` only. Verified at the build/typecheck level: TypeScript narrows the result type to exactly those three fields on `guest`, with no `hashedPassword` leak path. Anti-pattern would have been writing `.innerJoin(usersTable, eq(...))` and then `select({ guest: usersTable })` (which would expose every column).

2. **Sub-nav rendered in `admin/layout.tsx`** above `{children}` — single source of truth for the nav. Both `/admin/spaces` and `/admin/bookings` (and any future `/admin/*` page) get it for free. **No active-state highlighting** as planned — would require `usePathname()` from a Client Component; deferred. Tradeoff explicitly accepted in the story's anti-pattern list.

3. **Two `<Link>` elements only** — `Spaces` and `Bookings`. No active state, no icons, no hover indicator beyond Tailwind's `hover:underline`. Designer reskins later.

4. **`listAllBookings` placement in `bookings.ts`** — added between `listBookingsForGuest` (Guest-scoped) and `cancelBooking` (state transition). Reads top-to-bottom: list-active-on-date → for-guest → all → conditional-update. Audience naming convention (`listAll*` vs `list*ForGuest`) makes intent clear at the call site.

5. **No per-page guard on `/admin/bookings`** — layout handles it. Same convention every `/admin/*` page has used since US-2.2's extraction.

6. **REST endpoint follows the shape `GET /admin/spaces` established** (US-2.1's collection list, sort of — actually that one didn't ship a public-list GET, only POST). This is the second admin-collection GET; pattern: try `requireSession` + `requireRole`, return `err.response` on AuthError, then run the query.

7. **DataView empty message: `"No bookings yet."`** Different from `/my-bookings`'s designer-brief two-sentence version because the audience is different (admin doesn't book).

**Browser-interactive verifications still on BA's plate (Task 7):**
- Log in as Super Admin → header `Admin` → `/admin/spaces` (sub-nav now visible: `Spaces` and `Bookings`).
- Click `Bookings` → `/admin/bookings` shows all bookings across guests with `guest.fullName + space + desk + date + price + status badge`.
- Seed booking variety via DB UPDATEs (PENDING / CONFIRMED / REJECTED / CANCELLED) → all four badges render.
- Log out → `/admin/bookings` redirects to `/login`.
- Login as Guest → `/admin/bookings` redirects to `/`.
- DevTools `GET /api/admin/bookings` matrix: 401 (no session), 403 (Guest), 200 + array (Super Admin). Verify the array's `guest` objects expose ONLY `id`/`email`/`fullName` (no `hashedPassword`).

### File List

All paths relative to repo root.

**NEW (3 files):**
- `deskhive/src/app/admin/bookings/page.tsx` — admin bookings list (Server Component)
- `deskhive/src/app/api/admin/bookings/route.ts` — `GET /admin/bookings` REST endpoint
- `deskhive/tests/e2e/admin-bookings.spec.ts` — 2 unauthenticated tests

**UPDATED (2 files):**
- `deskhive/src/app/admin/layout.tsx` — added Spaces/Bookings sub-nav above `{children}`; guard logic unchanged
- `deskhive/src/db/queries/bookings.ts` — added `listAllBookings` (4-table JOIN with explicit `users` field selection) + `usersTable` import

**NOT TOUCHED:**
- `deskhive/src/db/schema.ts` — schema unchanged
- `deskhive/src/lib/auth/guards.ts` — `requireSession` + `requireRole` consumed
- `deskhive/src/proxy.ts` — `/admin/bookings` and `/api/admin/bookings` are matched by the existing patterns
- `deskhive/src/components/header.tsx` — `Admin` link still points to `/admin/spaces`; sub-nav handles within-admin navigation
- `deskhive/src/components/status-badge.tsx`, `data-view.tsx` — consumed; no source change
- `deskhive/src/lib/format.ts` — consumed
- `deskhive/src/actions/*` — read-only story; no Server Actions
- All Epic 1 / 2 / 3 files

### Change Log

| Date | Change | Commit |
|---|---|---|
| 2026-05-07 | Story drafted by `bmad-create-story`. | (none) |
| 2026-05-07 | US-4.1 implemented; admin sub-nav landed in admin/layout.tsx; 4-table JOIN with redacted user fields; all CI commands green. | `559011c` |
