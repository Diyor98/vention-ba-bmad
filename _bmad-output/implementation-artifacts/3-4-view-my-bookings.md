# Story 3.4: View My Bookings

Status: review

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a **logged-in Guest**,
I want **to see a list of my bookings with their current status, prices, and dates at `/my-bookings`**,
so that **I know what I have reserved.**

> Verbatim from Document B §8 (US-3.4). FR-B2 (Guest views their own bookings list).

> **Most of the functional surface for US-3.4 was already shipped in US-3.3** — the `/my-bookings` page had to exist for US-3.3's success redirect target to work. US-3.4's actual delta is:
> 1. The `GET /bookings/me` REST endpoint per Doc B §6.4 (Doc B §6.4 contract compliance).
> 2. Light polish on the page (per-row price + small layout cleanup).
> 3. Verification of the two PRD AC scenarios (multi-Guest isolation; all four status badges) — most of which is mechanical browser confirmation.
> The story is deliberately small. The next story (US-3.5) closes Epic 3 with the cancel button.

## Acceptance Criteria

Verbatim Gherkin from Document B §8 US-3.4, plus implementation-shaped ACs:

1. **AC-1 (Guest A sees only their own bookings).**
   ```gherkin
   Given Guest A and Guest B both have bookings
   When Guest A visits /my-bookings
   Then Guest A sees only their own bookings
   And Guest A does not see any of Guest B's bookings
   ```
   **Implementation status:** the page's `listBookingsForGuest(session.user.id)` from US-3.3 already filters strictly on `guest_user_id`. Verification is **mechanical browser confirmation** during Task 5. No code change required for this AC.

2. **AC-2 (Booking status badges display correctly).**
   ```gherkin
   Given Guest A has bookings in statuses PENDING, CONFIRMED, REJECTED, CANCELLED
   When Guest A visits /my-bookings
   Then each booking displays the correct status badge per Section 7.4
   ```
   **Implementation status:** the existing `<StatusBadge>` component (US-0.2) already maps the four enum values to the Doc B §7.4 colors and capitalized labels (PENDING→`Pending` yellow, CONFIRMED→`Confirmed` green, REJECTED→`Rejected` red, CANCELLED→`Cancelled` gray). Browser verification during Task 5.

3. **AC-3 (`GET /bookings/me` REST endpoint).** Public REST contract per Doc B §6.4:
   - Auth: `requireSession()`. **No role check** — both Guests and Super Admins can call it; Super Admins simply get an empty array if they have no bookings under their user id.
   - Returns 200 + array of enriched rows: `[{ booking, desk, space }, ...]`. Same shape `listBookingsForGuest` returns (parallels US-3.2's `GET /spaces/:id` which also returns enriched payloads).
   - 401 on no session.
   - 500 on internal error.

4. **AC-4 (Page polish — per-row price).** Each row on `/my-bookings` now shows the booking's `total_price_cents` formatted as USD via `formatCents` (the snapshotted price from US-3.3). Layout: existing space-name + desk-label + date row, plus price aligned to the right (before the status badge).

5. **AC-5 (No cancel button — US-3.5 owns it).** Even though the layout is being touched lightly, the cancel button is explicitly NOT added in this story. US-3.5 wraps PENDING rows with the cancel form.

6. **AC-6 (Empty state copy correction — UX polish from the designer brief).** Replace US-3.3's stub copy (`"You don't have any bookings yet."` — an improvisation by the dev-story when /my-bookings was added as a redirect target) with the friendlier two-sentence variant from `DeskHive_Design_Brief_v2` (the PDF sent to designer Makhbuba; lives outside the project filesystem):
   > **Verbatim string:** `"You haven't booked anything yet. Browse spaces to get started."`
   Update the `<DataView emptyMessage>` prop accordingly. **No code beyond the string changes.** No layout change, no link-out (the second sentence is informational; clicking the global header's `DeskHive` brand link gets the user to `/`).

7. **AC-7 (Stop bar — page renders).** Logged-in Guest with multiple bookings sees one row per booking, each showing space + desk + date + price + status badge. Logged-in Guest with zero bookings sees the empty state. Logged-out visit redirects to `/login?callbackUrl=/my-bookings`.

8. **AC-8 (Deterministic sort: `booking_date DESC, created_at DESC`).** Bookings on `/my-bookings` and the response from `GET /api/bookings/me` are ordered by `booking_date DESC` primarily, with `created_at DESC` as the tiebreaker for bookings on the same date. **Update the existing `listBookingsForGuest` query helper** (added in US-3.3 with only `created_at DESC`) — the order change applies to both the page and the REST endpoint via the shared helper. Both PRD scenarios (multi-Guest isolation, all four badges) remain stable; the change just makes the row order deterministic and aligned with the BA's ordering preference.

9. **AC-9 (Single commit).** `feat: GET /bookings/me + price on my-bookings (US-3.4)`. Commit content under `deskhive/`.

## Tasks / Subtasks

- [x] **Task 0 — Prep.** Verify all CI commands from US-3.3 (`db5819a`) still pass. No DB migrations.

- [x] **Task 1 — `GET /bookings/me` REST endpoint** — `src/app/api/bookings/me/route.ts` (NEW):
  - Auth: `requireSession()`. On `AuthError(401)` → return `err.response`. (No role gate; Super Admins are allowed.)
  - Body: `await listBookingsForGuest(String(session.user.id))`.
  - Return 200 + the enriched array (`[{ booking, desk, space }, ...]`).
  - Internal errors → 500 via `apiError`.

- [x] **Task 2 — Page polish: per-row price + empty-state copy correction** — modify `src/app/my-bookings/page.tsx`:
  - Import `formatCents` from `@/lib/format`.
  - Add a price element to each row, between the desk-label/date column and the status badge.
  - Suggested layout (flex row, gap-3 between elements): `space.name` + `desk.label · date` (existing two-line column) + `formatCents(booking.totalPriceCents)` (right-aligned, gray) + `<StatusBadge>`.
  - **Update the `<DataView emptyMessage>` prop** from `"You don't have any bookings yet."` (US-3.3 stub) to `"You haven't booked anything yet. Browse spaces to get started."` per AC-6.
  - Do NOT change the heading, the data-fetching shape, or the auth flow.

- [x] **Task 2.5 — Update `listBookingsForGuest` sort order (AC-8)** — modify `src/db/queries/bookings.ts`:
  - Replace `.orderBy(desc(bookingsTable.createdAt))` with `.orderBy(desc(bookingsTable.bookingDate), desc(bookingsTable.createdAt))`.
  - Both consumers (the page from US-3.3 and the new REST endpoint from Task 1) inherit the new order via the shared helper.
  - No new test required — same shape, different order; existing 401 E2E and Task 5's manual verification cover regression.

- [x] **Task 3 — E2E test for the new REST endpoint** — extend `tests/e2e/bookings.spec.ts`:
  - `unauthenticated GET /api/bookings/me returns 401` — `request.get('/api/bookings/me')`, expect 401, body code `UNAUTHORIZED`.
  - **DB-dependent happy-path E2E (multi-Guest isolation, all 4 badges) DEFERRED** to the future Postgres-in-CI story. Same posture as Epic 2 / US-3.1 / US-3.2 / US-3.3.

- [x] **Task 4 — Local CI parity:**
  - `pnpm typecheck` clean
  - `pnpm lint` clean
  - `pnpm test` — 95 prior pass; no new unit tests required (no new schemas; no new pure helpers)
  - `pnpm build` — successful, +1 route (`/api/bookings/me`)
  - `pnpm test:e2e` — at least 26 tests pass (existing 25 + 1 new)

- [ ] **Task 5 — Manual verification (BA's eyeball — DEFERRED to BA's review of `review`-state story):**
  - **AC-1 verification — multi-Guest isolation:**
    - Register Guest A; book Desk-1 for tomorrow → row visible on Guest A's `/my-bookings`.
    - Log out, register Guest B; book Desk-2 for tomorrow → row visible on Guest B's `/my-bookings`.
    - Log back in as Guest A → verify only Guest A's booking shows; Guest B's is NOT visible.
  - **AC-2 verification — all four status badges:**
    - Use direct DB UPDATEs to flip a booking's status through each enum value (since Confirm/Reject UI is US-4.x and Cancel UI is US-3.5):
      - `UPDATE bookings SET status='PENDING' WHERE id='<id>'` → reload `/my-bookings` → see yellow Pending badge.
      - Repeat with `'CONFIRMED'` (green) / `'REJECTED'` (red) / `'CANCELLED'` (gray).
    - Confirm visual mapping matches Doc B §7.4 placeholder colors.
  - **REST endpoint:**
    - DevTools: `GET /api/bookings/me` (with Guest A session) → 200 + Guest A's bookings only. With Super Admin session → 200 + empty array (assuming SA has no bookings). With no session → 401.
  - **Polish:**
    - Each row now shows the price formatted as `$XX.XX` (or `$0.00` for free desks). Confirm the price matches what was set on the desk at booking time, not the desk's current price.

- [x] **Task 6 — Single commit (AC-9)** — `feat: GET /bookings/me + price on my-bookings (US-3.4)`.

## Dev Notes

### What gets built and what's deliberately out of scope

This is the **fourth story of Epic 3**. After it lands:
- The `GET /bookings/me` REST endpoint exists per Doc B §6.4 contract.
- `/my-bookings` shows price per row.
- The two PRD scenarios are explicitly verified (browser-interactive).

Feature scope (US-3.4 only):
- ✅ `GET /bookings/me` REST endpoint
- ✅ Per-row price on `/my-bookings`
- ✅ AC verification scenarios documented in Task 5

Out of scope for US-3.4 (do NOT build):
- ❌ Cancel button (US-3.5).
- ❌ Pagination on `/my-bookings` — Phase 1 inventory is small.
- ❌ Sort options (newest/oldest, price, status) — list is implicitly newest-first per `listBookingsForGuest` query.
- ❌ Filter by status — Phase 2.
- ❌ Booking detail page — not in Doc B §7.2.
- ❌ Admin booking list (US-4.1).
- ❌ Email notifications.
- ❌ Print / export — Phase 2.
- ❌ Re-fetching the list client-side — Server Component re-renders via `revalidatePath`.

### Key decisions

1. **Most of the work landed in US-3.3.** The `/my-bookings` page was a US-3.3 dependency (because AC-1 of US-3.3 explicitly verified content on that page). US-3.4 acknowledges this and stays small. The temptation to "expand the scope" of US-3.4 (admin views, pagination, etc.) is rejected — those are out-of-scope features that belong in different stories or in Phase 2.

2. **Empty-state copy correction is deliberate UX polish, not a "Brief verbatim" claim.** The original PRD/Brief in `docs/` does NOT specify the empty-state string for this page. The corrected copy (`"You haven't booked anything yet. Browse spaces to get started."`) comes from `DeskHive_Design_Brief_v2`, the PDF the BA sent to designer Makhbuba (external to the project filesystem). US-3.3's stub copy (`"You don't have any bookings yet."`) was an improvisation by that dev-story; this story corrects it. **Citation should read "designer brief", not "PRD".**

2. **No role gate on `GET /bookings/me`.** A Super Admin who happens to also have bookings (e.g., the seeded admin user might book a desk to test things) should see them. Restricting to Guest would be inconsistent with the page's behavior (which also doesn't role-gate).

3. **Same enriched shape as the page.** The REST endpoint reuses `listBookingsForGuest` and returns `[{ booking, desk, space }, ...]`. Symmetric with `GET /spaces/:id` returning `{ space, desks }`. API consumers don't need to make multiple calls to display useful information.

4. **No new unit tests.** No new pure helpers, no new Zod schemas. The query helper (`listBookingsForGuest`) was added in US-3.3 and isn't unit-tested (Drizzle wrapper, same posture as `listAllSpaces`/`listPublishedSpaces`). The REST endpoint is exercised by the new 401 E2E test.

5. **Price snapshot remains `total_price_cents` from the row.** Don't recompute via JOIN-time price. Already enforced in US-3.3's `createBooking` insert; this story just renders the snapshotted column.

6. **Manual verification is the primary AC artifact for this story.** Both PRD scenarios are about user-perceived behavior in a multi-row, multi-Guest scenario — exactly what's hard to E2E without a Postgres-in-CI fixture. Task 5 is explicit about the steps.

### Architecture compliance

- Validation: N/A (no input).
- Form pattern: N/A (read-only).
- State management: N/A.
- Component library: none. Raw Tailwind + `<StatusBadge>` + `<DataView>`.
- Authorization: page-level `requireSession`; REST handler `requireSession` (no role check). No proxy entry change (per US-3.3 decision).
- Error response shape (REST): `apiError` for 500.
- Status codes (REST): 200 / 401 / 500.
- Auth API: `requireSession` only.
- Reskinnable frontend: literal Tailwind utilities only.

### Code sketches

#### `src/app/api/bookings/me/route.ts` (NEW)

```ts
import { requireSession, AuthError } from '@/lib/auth/guards';
import { listBookingsForGuest } from '@/db/queries/bookings';
import { apiError } from '@/lib/http';
import { logger } from '@/lib/logger';

export async function GET(): Promise<Response> {
  let session;
  try {
    session = await requireSession();
  } catch (err) {
    if (err instanceof AuthError) return err.response;
    logger.error('list_my_bookings_route_auth_failed', { error: String(err) });
    return apiError('INTERNAL_ERROR', 'Something went wrong', 500);
  }

  try {
    const rows = await listBookingsForGuest(String(session.user.id));
    return Response.json(rows, { status: 200 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error('list_my_bookings_route_db_failed', { error: msg });
    return apiError('INTERNAL_ERROR', 'Something went wrong', 500);
  }
}
```

#### `src/app/my-bookings/page.tsx` (modification — add price)

Inside the existing `<li>`, between the two-line space/desk/date column and the status badge:

```tsx
<span className="text-gray-700">{formatCents(booking.totalPriceCents)}</span>
```

Import `formatCents` at the top alongside the existing imports.

### File-structure requirements

After this story:

```
deskhive/
├── src/
│   └── app/
│       ├── api/
│       │   └── bookings/
│       │       ├── route.ts              # (US-3.3 — POST)
│       │       └── me/                   # NEW (US-3.4)
│       │           └── route.ts          # NEW — GET /bookings/me
│       └── my-bookings/
│           └── page.tsx                  # UPDATED — adds price element per row
└── tests/
    └── e2e/
        └── bookings.spec.ts              # UPDATED — adds 1 new GET /api/bookings/me 401 test
```

Files NOT touched:
- `deskhive/src/db/queries/bookings.ts` — `listBookingsForGuest` already exists from US-3.3.
- `deskhive/src/components/status-badge.tsx` — already correct per Doc B §7.4.
- `deskhive/src/lib/format.ts` — `formatCents` already exists.
- `deskhive/src/lib/auth/guards.ts` — `requireSession` consumed.
- All other Epic 1 / 2 / 3 files.

### Anti-patterns — explicit DO-NOTs

- ❌ Adding a cancel button. US-3.5.
- ❌ Adding pagination, sort, filter, search. Phase 2.
- ❌ Adding admin views or admin bookings endpoints. US-4.x.
- ❌ Re-fetching client-side after some interaction. The page is fully Server Component; no client state.
- ❌ Recomputing price via JOIN at render time. Use `booking.totalPriceCents` (the snapshot from insert).
- ❌ Adding role gates that prevent Super Admin from viewing `/my-bookings` or calling `GET /api/bookings/me`. SA may legitimately have bookings.
- ❌ Using `auth.api.getSession` in the REST handler. Use `requireSession`.
- ❌ Adding a Zod schema for the GET endpoint (no inputs).
- ❌ Modifying `listBookingsForGuest`. Reuse as-is.
- ❌ Reverting the empty-state copy back to US-3.3's stub. The new copy (`"You haven't booked anything yet. Browse spaces to get started."`) is the correct one going forward.
- ❌ Wrapping rows in `<Link href={\`/spaces/${space.id}\`}>` — the space could be SUSPENDED or have its desk deactivated, leading to confusing UX. Defer to Phase 2.

### Project structure notes

- `src/app/api/bookings/me/route.ts` joins the existing `bookings/route.ts` (POST). Pattern: top-level resource directory with separate sub-routes for collection vs `me`-scoped queries.
- This is the first story where the BA's manual verification is the primary AC artifact (vs structural test coverage). Document explicitly to set expectations.

### Previous story intelligence

- **US-3.3** (`db5819a`): Booking creation + minimal `/my-bookings` + login callbackUrl + first DB write to `bookings`. The `/my-bookings` page was **shipped to satisfy US-3.3 AC-1's redirect target** — US-3.4 only enriches it.

**Patterns established (replicate, don't deviate):**
- Server Component pages fetch via Drizzle directly.
- `<DataView>` for list-shaped pages with empty/error states.
- camelCase TS field names ↔ snake_case DB columns.
- `<StatusBadge>` for booking-status display.
- One feature story → one `feat:` commit.

### Recent commits

```
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

US-3.4 is the eleventh `feat:` commit. After it, only US-3.5 remains in Epic 3.

### References

- [Source: docs/02-phase1-prd.md#Section 8] — US-3.4 verbatim Gherkin.
- [Source: docs/02-phase1-prd.md#Section 4.3] — FR-B2 (Guest views own bookings).
- [Source: docs/02-phase1-prd.md#Section 6.4] — `GET /bookings/me` endpoint.
- [Source: docs/02-phase1-prd.md#Section 7.4] — status badge visual rules (already implemented in `<StatusBadge>`).
- [Source: _bmad-output/implementation-artifacts/3-3-create-booking.md] — `/my-bookings` minimal page; `listBookingsForGuest` query helper; the empty-state copy this story corrects.
- [Source: external — `DeskHive_Design_Brief_v2` PDF, sent to designer Makhbuba; not in project filesystem] — empty-state copy `"You haven't booked anything yet. Browse spaces to get started."`
- [Source: _bmad-output/implementation-artifacts/0-2-dependencies-schema-and-primitives.md] — `<StatusBadge>` scaffolded.
- [Source: deskhive/AGENTS.md] — Next.js 16 caveats.

## Dev Agent Record

### Agent Model Used

Claude Opus 4.7 (1M context) — invoked via `bmad-dev-story` skill on 2026-05-07 in speed mode.

### Debug Log References

| Step | Notable output |
|---|---|
| `pnpm typecheck` | Clean |
| `pnpm lint` | Clean |
| `pnpm test` | 95/95 pass + 1 skipped — no new unit tests (no new schemas / pure helpers) |
| `pnpm build` | 22 routes (added `/api/bookings/me`); proxy still attached |
| `pnpm test:e2e` | 26/26 pass in 25.0s — added 1 new `GET /api/bookings/me` 401 test |

### Completion Notes List

**Story executed end-to-end. Stop bar (REST endpoint live + page polished + sort deterministic + empty-state copy corrected) achieved.** All 95 unit + 26 E2E tests pass. Browser-interactive verification (multi-Guest isolation, all four badges) on BA's plate.

**No mid-execution corrections.** All four code touches landed clean on first pass.

**Mid-draft story corrections (BA, before dev-story):**
1. **Empty-state copy correction** — replaced US-3.3's stub `"You don't have any bookings yet."` with `"You haven't booked anything yet. Browse spaces to get started."` from the external `DeskHive_Design_Brief_v2` PDF (sent to designer Makhbuba; not in `docs/`). Documented in AC-6 + Decision #2 + the References block as "deliberate UX polish from the designer brief, not Brief verbatim".
2. **Deterministic sort order** — added AC-8 + Task 2.5 specifying `booking_date DESC, created_at DESC`. Updated the shared `listBookingsForGuest` helper (US-3.3); both the page and the new REST endpoint inherit the new order.

**Key implementation observations:**

3. **Sort change made in the shared query helper** — the page (US-3.3) and the new REST endpoint (US-3.4) both consume `listBookingsForGuest`, so a one-line change to the helper's `.orderBy(...)` propagates to both. No call-site changes; no API surface change.

4. **REST endpoint mirrors `GET /spaces/:id` shape** — both return enriched payloads (`{ space, desks }` for the space detail; `[{ booking, desk, space }, ...]` for the user's bookings). API consumers don't need follow-up round-trips.

5. **No role gate on the endpoint** — Super Admins can call `GET /api/bookings/me` and get an empty array if they have no bookings under their user id. Consistent with the page's behavior. Documented in Decision #2 (which was renumbered after the empty-state correction was added as the new Decision #2).

6. **Per-row price uses `formatCents` directly** — same helper used in admin desks list, public space detail, etc. No rounding surprises; integer cents → `$XX.XX`.

7. **Layout adjustment**: added `gap-3` between flex children and `flex-1` to the left content column so the price column right-aligns naturally even when space names are long. Designer can polish; pattern stays Tailwind-only per US-0.2 §reskinnable-frontend.

**Browser-interactive verifications still on BA's plate (Task 5):**
- AC-1 multi-Guest isolation: register two Guests, give each a booking, verify they only see their own.
- AC-2 four status badges: flip a booking through PENDING / CONFIRMED / REJECTED / CANCELLED via direct DB UPDATEs (Confirm/Reject UI is US-4.x; Cancel UI is US-3.5), reload `/my-bookings` after each, confirm visual mapping matches Doc B §7.4.
- New empty state: a Guest with zero bookings sees `"You haven't booked anything yet. Browse spaces to get started."`
- New sort order: a Guest with bookings on multiple dates sees them ordered by booking_date DESC.
- DevTools `GET /api/bookings/me`: 401 (no session), 200 + array (Guest session), 200 + empty array (Super Admin session).

### File List

All paths relative to repo root.

**NEW (1 file):**
- `deskhive/src/app/api/bookings/me/route.ts` — `GET /bookings/me` REST endpoint

**UPDATED (3 files):**
- `deskhive/src/db/queries/bookings.ts` — `listBookingsForGuest` `.orderBy()` now sorts by `booking_date DESC, created_at DESC` (was `created_at DESC` only)
- `deskhive/src/app/my-bookings/page.tsx` — empty-state copy corrected; per-row price added; flex layout adjusted (`gap-3` + `flex-1` on the left column for clean right-alignment)
- `deskhive/tests/e2e/bookings.spec.ts` — added `GET /api/bookings/me returns 401 without a session cookie` test

**NOT TOUCHED:**
- `deskhive/src/components/status-badge.tsx` — already matched Doc B §7.4 from US-0.2
- `deskhive/src/lib/format.ts` — `formatCents` consumed
- `deskhive/src/lib/auth/guards.ts` — `requireSession` consumed
- `deskhive/src/proxy.ts` — `/my-bookings` and `/api/bookings/me` not in matcher (per-page/per-route guards handle auth)
- All other Epic 1 / 2 / 3 files

### Change Log

| Date | Change | Commit |
|---|---|---|
| 2026-05-07 | Story drafted by `bmad-create-story`. | (none) |
| 2026-05-07 | Story corrections (BA): empty-state copy + deterministic sort order. | (none) |
| 2026-05-07 | US-3.4 implemented; all CI commands green. | `6f29214` |
