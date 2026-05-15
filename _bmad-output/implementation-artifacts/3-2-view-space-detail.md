# Story 3.2: View Space Detail

Status: review

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a **Guest or visitor (logged-in or not)**,
I want **to view a space's full details and the list of its desks with their availability for a chosen date at `/spaces/:id`**,
so that **I can decide what to book.**

> Verbatim from Document B §8 (US-3.2). FR-D3 (view space detail with desks) and FR-D4 (per-desk availability for a date).

> **This story is read-only.** It introduces the public space detail page, two public REST endpoints, and the availability-by-date query — but the "Book this desk" button is structural only. Clicking does not yet create a booking; US-3.3 wires the action.

## Acceptance Criteria

Verbatim Gherkin from Document B §8 US-3.2, plus implementation-shaped ACs:

1. **AC-1 (Viewing space detail and availability — happy path).**
   ```gherkin
   Given a Space "Hive Central" exists with desks "Desk-1" and "Desk-2"
   And no bookings exist
   When I open the space detail page
   And I select tomorrow's date in the date picker
   Then both desks display the badge "Available"
   And both "Book this desk" buttons are enabled
   ```

2. **AC-2 (Booked desks show as unavailable).**
   ```gherkin
   Given Desk-1 has a CONFIRMED booking for 2026-06-01
   When I open the space detail page and select 2026-06-01
   Then Desk-1 shows the badge "Unavailable"
   And the "Book this desk" button for Desk-1 is disabled
   ```

3. **AC-3 (Inactive desks are filtered out — US-2.4 cross-story dependency).** Desks with `is_active = false` are NOT shown on `/spaces/:id`. The space detail query filters on `is_active = true`. (Per US-2.4 AC-2 carry-over.)

4. **AC-4 (Only PUBLISHED spaces resolve).** Visiting `/spaces/:id` for a SUSPENDED or non-existent space yields Next.js's 404 page. The query filters on `status = 'PUBLISHED' AND id = :id`.

5. **AC-5 (Date picker per Doc B §7.5).** A `<form action="/spaces/[id]" method="GET">` with a `<input type="date" name="date">` and a "Show availability" Submit button. URL-driven (`/spaces/:id?date=YYYY-MM-DD`), no client-side state. Same minimalist pattern as US-3.1's city filter.

6. **AC-6 (Doc B §7.5: button disabled without a date).** When no date is in the URL, every "Book this desk" button is disabled (`disabled` attribute set), and **no availability badge is rendered** for any desk (only the desk row + label + price are shown). The page header explains: `"Select a date to see availability."`

7. **AC-7 (Doc B §7.6: cannot be a past date).** If the URL's `?date=...` is malformed or strictly before today (UTC), the page treats it as "no date selected" — buttons are disabled, no badges, and a small inline notice appears: `"Please pick today or a future date."`. Today (UTC) is valid.

8. **AC-8 (Click behavior NOT wired in this story).** The "Book this desk" button is `<button type="button">` with no `onClick` and no wrapping `<form>`. **Clicking does nothing.** US-3.3 wraps the button in a Server-Action form. **Anti-pattern: do not pre-render the booking form here** — it would couple this story to US-3.3 and make US-3.3 harder to land cleanly.

9. **AC-9 (Cards on `/` link to `/spaces/:id`).** US-3.1's anti-pattern explicitly deferred the `<Link>` wrapping to this story. **Modify `src/app/page.tsx`** to wrap each card's content in `<Link href={\`/spaces/${s.id}\`}>`. Inactive desks / suspended spaces are already filtered by `listPublishedSpaces` so the link never lands on a 404.

10. **AC-10 (REST endpoint `GET /spaces/:id`).** Public, no auth. Returns 200 with `{ space, desks }` shape (the space row + an array of its `is_active = true` desks). 404 if space doesn't exist or is SUSPENDED.

11. **AC-11 (REST endpoint `GET /spaces/:id/availability?date=YYYY-MM-DD`).** Public, no auth. Returns 200 with `{ date, availability: [{ deskId, isAvailable: boolean }, ...] }`. 400 if `date` is missing or malformed (`!/^\d{4}-\d{2}-\d{2}$/.test(date)`). 400 if `date` is in the past (per Doc B §7.6 — keeping the same constraint at the API boundary). 404 if the space doesn't resolve.

12. **AC-12 (Doc B §7.3 four UI states).** Loading is N/A (Server Component). Loaded / empty / error states handled at the page level:
    - **Empty desks** (space exists but has no active desks): show `"No desks available in this space yet."` (NOT "No spaces…" — different scope).
    - **Error** (DB throws): show `"Something went wrong. Please try again."` via `<DataView status="error">`.

13. **AC-13 (Stop bar — page renders).** Visiting `http://localhost:3000/spaces/<some-real-published-space-id>` shows: header (global) + space heading + image + description + city + date picker + desks list (with prices). After picking today's or a future date, each desk shows an "Available" / "Unavailable" badge and a button whose enabled state matches the badge.

14. **AC-14 (Single commit).** `feat: public view space detail (US-3.2)`. Commit content under `deskhive/`.

## Tasks / Subtasks

- [x] **Task 0 — Prep.** Verify all CI commands from US-3.1 (`8d7bb48`) still pass. Schema unchanged; no migrations.

- [x] **Task 1 — Date validation helper** — extend `src/lib/format.ts` (or use existing `isPastDate` + ISO regex):
  - The existing `isPastDate(iso: string)` already throws on bad format. We need a non-throwing variant for the page (which receives raw URL input).
  - Add `isValidIsoDate(s: string): boolean` that returns true iff the string matches `^\d{4}-\d{2}-\d{2}$` AND `isPastDate(s)` returns false (i.e. today or future) — no, simpler: just `isValidIsoDate` checks format. Past-date check stays separate via `isPastDate`.
  - **Decision:** add a small `parseDateParam(s: string | undefined)` helper to `src/lib/format.ts` that returns `{ valid: true; iso: string } | { valid: false; reason: 'missing' | 'malformed' | 'past' }`. Single source of truth used by both the page and the REST handler.
  - Add unit tests covering all four paths.

- [x] **Task 2 — Spaces query (extension)** — `src/db/queries/spaces.ts`:
  - `getPublishedSpaceById(id: string): Promise<Space | undefined>`: select-where(`id = :id AND status = 'PUBLISHED'`).limit(1).
  - **Do NOT modify** `getSpaceById` (admin variant — still returns SUSPENDED spaces for admin edit). Public adds a sibling.

- [x] **Task 3 — Desks query (extension)** — `src/db/queries/desks.ts`:
  - `listActiveDesksForSpace(spaceId: string): Promise<Desk[]>`: same as `listDesksForSpace` but with `where(and(eq(spaceId), eq(isActive, true)))`. **Don't modify** `listDesksForSpace` (admin variant).

- [x] **Task 4 — Bookings query (NEW file)** — `src/db/queries/bookings.ts`:
  - First file in the bookings domain.
  - `listActiveBookingsForSpaceOnDate(spaceId: string, isoDate: string): Promise<Booking[]>`: returns bookings where `space_id = :spaceId AND booking_date = :isoDate AND status IN ('PENDING', 'CONFIRMED')`. (REJECTED/CANCELLED bookings free up the desk per Doc B §6.2.)
  - Used by both the page's availability computation AND the REST endpoint.

- [x] **Task 5 — Availability helper** — extend `src/lib/availability.ts` (NEW small file):
  - `computeDeskAvailability(desks: Desk[], activeBookings: Booking[]): Map<string, boolean>` — returns deskId → isAvailable. A desk is unavailable iff there's a booking with `desk_id` matching and status in active set.
  - Pure function, easy to unit-test. ~3 unit tests.

- [x] **Task 6 — Public space detail page** — `src/app/spaces/[id]/page.tsx`:
  - Server Component. `params: Promise<{ id: string }>`, `searchParams: Promise<{ date?: string }>`.
  - Resolve space via `getPublishedSpaceById`. If undefined → `notFound()`.
  - Fetch desks via `listActiveDesksForSpace`.
  - Parse date from URL via `parseDateParam`. If valid → fetch active bookings via `listActiveBookingsForSpaceOnDate(spaceId, date)`, compute availability map. If invalid → no availability map; show inline notice if `?date=` was provided but malformed/past.
  - Render: heading + image + description + city + date picker + desks list (each row: label + formatted price + optional availability badge + "Book this desk" `<button type="button" disabled={!isAvailable || !date}>`).
  - Empty desks state via `<DataView>`: `"No desks available in this space yet."`
  - Error state via try/catch around the queries → `"Something went wrong. Please try again."`
  - Use `formatCents` for prices.

- [x] **Task 7 — `GET /spaces/:id` REST endpoint** — `src/app/api/spaces/[id]/route.ts`:
  - Public. `params: Promise<{ id: string }>`, `await`.
  - `getPublishedSpaceById` + `listActiveDesksForSpace`. Return `{ space, desks }` with status 200. 404 if space doesn't resolve.
  - Internal error → 500 via `apiError`.

- [x] **Task 8 — `GET /spaces/:id/availability` REST endpoint** — `src/app/api/spaces/[id]/availability/route.ts`:
  - Public. `params: Promise<{ id: string }>`, search params have required `date`.
  - Validate `date` via `parseDateParam`. On invalid → 400 with `apiError('VALIDATION_ERROR', 'Invalid or past date', 400)`.
  - `getPublishedSpaceById` for 404 check.
  - `listActiveBookingsForSpaceOnDate` + `listActiveDesksForSpace` → compute availability map → return `{ date, availability: [{ deskId, isAvailable }, ...] }` with status 200.

- [x] **Task 9 — Wire up cards on `/` to link to `/spaces/[id]`** — modify `src/app/page.tsx`:
  - Wrap each `<li>`'s inner content in `<Link href={\`/spaces/${s.id}\`} className="block ...">`. The card visually stays the same; clicking now navigates.

- [x] **Task 10 — E2E tests** — extend `tests/e2e/browse.spec.ts` (or NEW `tests/e2e/space-detail.spec.ts`):
  - `GET /api/spaces/<bogus-uuid> returns 404` — public endpoint, no auth needed.
  - `GET /api/spaces/<bogus-uuid>/availability?date=<future-iso> returns 404` — same.
  - `GET /api/spaces/<bogus-uuid>/availability without date returns 400` — query param validation.
  - `/spaces/<bogus-uuid> renders Next 404` — visit, expect a 404 indicator (e.g. a 404 status, or check for the Next default 404 heading).
  - **DB-dependent happy paths (real space, badges, button states) DEFERRED** to the future Postgres-in-CI story.

- [x] **Task 11 — Local CI parity:**
  - `pnpm typecheck` clean
  - `pnpm lint` clean
  - `pnpm test` — 81 prior + ~5 new tests (parseDateParam + computeDeskAvailability) = ~86 passing + 1 skipped
  - `pnpm build` — successful, +3 routes (`/spaces/[id]`, `/api/spaces/[id]`, `/api/spaces/[id]/availability`)
  - `pnpm test:e2e` — at least 22 tests pass (existing 18 + 4 new)

- [ ] **Task 12 — Manual verification (BA's eyeball — DEFERRED to BA's review of `review`-state story):**
  - Visit `/` → cards now clickable; click one → land on `/spaces/<id>`.
  - Page shows heading, image, description, city, date picker, list of active desks (with prices), no badges yet.
  - Pick today's date → submit → URL becomes `/spaces/<id>?date=YYYY-MM-DD`. Each desk shows "Available" badge; "Book this desk" buttons enabled.
  - Click a button → nothing happens (correct — US-3.3 wires it).
  - Pick yesterday's date → page renders with notice "Please pick today or a future date" + buttons disabled + no badges.
  - Pick a fake date string via direct URL (`?date=not-a-date`) → same notice + disabled state.
  - DevTools `GET /api/spaces/<id>` → 200 + `{ space, desks }`. `GET /api/spaces/<id>/availability?date=<future>` → 200 + `{ date, availability: [...] }`. Without date → 400. Bogus space id → 404.
  - **Dependency on real bookings:** create a CONFIRMED booking via direct DB insert (since US-3.3 isn't shipped yet) on a real `desk_id` for tomorrow's date. Re-pick that date on the page → that desk now shows "Unavailable" + button disabled.

- [x] **Task 13 — Single commit (AC-14)** — `feat: public view space detail (US-3.2)`.

## Dev Notes

### What gets built and what's deliberately out of scope

This is the **second story of Epic 3**. After it lands:
- `/spaces/[id]` is the public space detail page.
- Cards on `/` are clickable and route to the detail page.
- Two new public REST endpoints exist (`GET /spaces/:id`, `GET /spaces/:id/availability`).
- The bookings domain is queryable for the first time (`listActiveBookingsForSpaceOnDate`) — even though no bookings can be created yet through the UI (US-3.3 lands that).

Feature scope (US-3.2 only):
- ✅ `/spaces/[id]` Server Component renders space + active desks
- ✅ Date picker via `?date=YYYY-MM-DD`
- ✅ Per-desk availability badge ("Available" / "Unavailable") when a valid date is selected
- ✅ Per-desk "Book this desk" button rendered with the right disabled state (NO click wiring)
- ✅ Two public REST endpoints
- ✅ Cards on `/` wrapped in `<Link>` (deferred from US-3.1)

Out of scope for US-3.2 (do NOT build):
- ❌ Actually creating a booking on click — US-3.3 owns it.
- ❌ Wrapping the button in `<form action={...}>`. US-3.3 lands the form.
- ❌ Showing the user's own pending bookings on this page — US-3.4 has the "My Bookings" page.
- ❌ Multi-day booking / range picker — Phase 2 (Doc B §6.1 desks model is single-day).
- ❌ Booking confirmation/rejection UI for admins — US-4.x.
- ❌ Calendar widget / month grid view — Phase 2 (the native `<input type="date">` is enough for Phase 1).
- ❌ Server-side caching of availability — every render is fresh; same dynamic-render posture as `/`.
- ❌ Admin shortcut "Edit this space" link from `/spaces/[id]` — US-2.2's edit page is admin-only; the public detail page has no admin chrome.
- ❌ Suggesting nearby dates / "next available" affordances — Phase 2 UX.
- ❌ Inactive-desk visibility for admins on the public page — admins still see SUSPENDED in admin pages; public detail filters strictly.

### Key decisions

1. **Click behavior deferred to US-3.3.** US-3.2 ships the button structure, the disabled-state logic, and the visual state. The button is `<button type="button">` with no handler. **This is the cleanest split** — US-3.2 is 100% read-only; US-3.3 introduces booking writes, the bookings table state machine in real, and the double-booking constraint exercise.

2. **URL-driven date picker** (same pattern as US-3.1's city filter). `?date=YYYY-MM-DD`. Native `<input type="date">` with `min={todayIso()}`. Form GET submit; no JS state. The browser's native date picker is "good enough" per Doc B §7.1 minimalism.

3. **Past-date semantics.** Doc B §7.6 says "Booking date: required; cannot be a past date." We enforce this at three places:
   - Page: invalid date → "no date selected" state + a small notice.
   - REST availability endpoint: invalid date → 400.
   - US-3.3's booking creation: same validation enforced again at write time (defense in depth).
   Today (UTC) is valid (`isPastDate(today) === false` per the existing helper).

4. **`parseDateParam` extracted to `src/lib/format.ts`** as a single source of truth. The page and the REST endpoint both call it; their behavior on `'missing' | 'malformed' | 'past'` cases stays in lockstep.

5. **Distinct bookings query for active reservations.** `listActiveBookingsForSpaceOnDate` filters on `status IN ('PENDING', 'CONFIRMED')` — the same statuses the partial unique index `uniq_active_booking_per_desk_per_date` covers. REJECTED/CANCELLED bookings free up the desk. **Anti-pattern: don't filter on `status != 'CANCELLED'`** — that misses REJECTED. Always whitelist the active states.

6. **`computeDeskAvailability` is a pure function**, easy to unit-test. Takes `desks[]` and `activeBookings[]` (already filtered to active statuses + the date), returns `Map<deskId, isAvailable>`. The page and the REST handler both consume it.

7. **No admin chrome on the public detail page.** Even Super Admins see the public detail; the "Admin" link in the global header (US-2.1) is the only path to admin pages. No "Edit this space" shortcut on `/spaces/:id`. Keeps the public page truly public.

8. **Cards become clickable in this story (US-3.1 deferred).** Wrapping `<li>` content in `<Link>` is one-line change. After this story, the welcome → browse → detail flow works end-to-end.

### Architecture compliance

- Validation: `parseDateParam` for date input. No Zod schema for the GET filter (passthrough).
- Form pattern: native `<form action="/spaces/[id]" method="GET">` for the date picker. No Server Action.
- State management: none beyond URL.
- Component library: none. Raw Tailwind.
- DataView: used for the desks list's empty/error states.
- Authorization: none — public route.
- Error response shape (REST): standard `apiError`/`apiNotFound`.
- Status codes (REST): 200 / 400 / 404 / 500.
- Auth API: not used.
- Reskinnable frontend: literal Tailwind utilities only.

### Code sketches

#### `src/lib/format.ts` (extension)

```ts
// existing exports unchanged

export type DateParamResult =
  | { valid: true; iso: string }
  | { valid: false; reason: 'missing' | 'malformed' | 'past' };

export function parseDateParam(s: string | undefined): DateParamResult {
  if (!s || s.trim() === '') return { valid: false, reason: 'missing' };
  const trimmed = s.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return { valid: false, reason: 'malformed' };
  }
  if (isPastDate(trimmed)) return { valid: false, reason: 'past' };
  return { valid: true, iso: trimmed };
}
```

#### `src/db/queries/spaces.ts` (extension)

```ts
export async function getPublishedSpaceById(
  id: string,
): Promise<Space | undefined> {
  const [row] = await db
    .select()
    .from(spacesTable)
    .where(and(eq(spacesTable.id, id), eq(spacesTable.status, 'PUBLISHED')))
    .limit(1);
  return row;
}
```

#### `src/db/queries/desks.ts` (extension)

```ts
export async function listActiveDesksForSpace(
  spaceId: string,
): Promise<Desk[]> {
  return db
    .select()
    .from(desksTable)
    .where(and(eq(desksTable.spaceId, spaceId), eq(desksTable.isActive, true)))
    .orderBy(asc(desksTable.createdAt));
}
```

#### `src/db/queries/bookings.ts` (NEW)

```ts
import { and, eq, inArray } from 'drizzle-orm';
import { db } from '@/db/client';
import { bookingsTable, type Booking } from '@/db/schema';

const ACTIVE_STATUSES = ['PENDING', 'CONFIRMED'] as const;

export async function listActiveBookingsForSpaceOnDate(
  spaceId: string,
  isoDate: string,
): Promise<Booking[]> {
  return db
    .select()
    .from(bookingsTable)
    .where(
      and(
        eq(bookingsTable.spaceId, spaceId),
        eq(bookingsTable.bookingDate, isoDate),
        inArray(bookingsTable.status, ACTIVE_STATUSES as unknown as string[]),
      ),
    );
}
```

#### `src/lib/availability.ts` (NEW)

```ts
import type { Booking, Desk } from '@/db/schema';

/**
 * Maps each desk's id → isAvailable for the supplied set of "active" bookings
 * (status PENDING or CONFIRMED on the target date). A desk is unavailable iff
 * at least one active booking references it.
 *
 * Pure function — no DB, no I/O, easy to unit-test.
 */
export function computeDeskAvailability(
  desks: Desk[],
  activeBookings: Booking[],
): Map<string, boolean> {
  const occupied = new Set(activeBookings.map((b) => b.deskId));
  const result = new Map<string, boolean>();
  for (const d of desks) result.set(d.id, !occupied.has(d.id));
  return result;
}
```

#### `src/app/spaces/[id]/page.tsx` (NEW)

```tsx
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getPublishedSpaceById } from '@/db/queries/spaces';
import { listActiveDesksForSpace } from '@/db/queries/desks';
import { listActiveBookingsForSpaceOnDate } from '@/db/queries/bookings';
import { computeDeskAvailability } from '@/lib/availability';
import { parseDateParam, formatCents, todayIso } from '@/lib/format';
import { DataView, type DataViewStatus } from '@/components/data-view';
import { logger } from '@/lib/logger';
import type { Booking, Desk, Space } from '@/db/schema';

export default async function SpaceDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ date?: string }>;
}) {
  const { id } = await params;
  const { date: dateParam } = await searchParams;
  const dateResult = parseDateParam(dateParam);

  let space: Space | undefined;
  let desks: Desk[] = [];
  let bookings: Booking[] = [];
  let status: DataViewStatus = 'loaded';
  try {
    space = await getPublishedSpaceById(id);
    if (!space) notFound();
    desks = await listActiveDesksForSpace(id);
    if (dateResult.valid) {
      bookings = await listActiveBookingsForSpaceOnDate(id, dateResult.iso);
    }
    if (desks.length === 0) status = 'empty';
  } catch (err) {
    if ((err as { digest?: string }).digest?.startsWith('NEXT_HTTP_ERROR_FALLBACK')) {
      throw err; // notFound() signal — let Next handle it
    }
    const msg = err instanceof Error ? err.message : String(err);
    logger.error('space_detail_page_failed', { error: msg });
    status = 'error';
  }
  if (!space) notFound();

  const availability = dateResult.valid
    ? computeDeskAvailability(desks, bookings)
    : null;

  return (
    <main className="mx-auto max-w-4xl p-8">
      <h1 className="mb-2 text-2xl font-semibold">{space.name}</h1>
      <p className="mb-4 text-sm text-gray-600">{space.city}</p>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={space.primaryImageUrl}
        alt={space.name}
        className="mb-4 aspect-video w-full rounded object-cover"
      />
      <p className="mb-6 text-sm leading-6 text-gray-700">{space.description}</p>

      <form action={`/spaces/${space.id}`} method="GET" className="mb-2 flex items-end gap-2">
        <div>
          <label htmlFor="date" className="mb-1 block text-sm font-medium">
            Pick a date
          </label>
          <input
            id="date"
            name="date"
            type="date"
            min={todayIso()}
            defaultValue={dateResult.valid ? dateResult.iso : ''}
            className="rounded border border-gray-300 px-3 py-2 text-sm"
          />
        </div>
        <button
          type="submit"
          className="rounded bg-gray-900 px-4 py-2 text-sm font-medium text-white"
        >
          Show availability
        </button>
      </form>
      {!dateResult.valid && dateResult.reason !== 'missing' && (
        <p className="mb-4 text-sm text-red-700">
          Please pick today or a future date.
        </p>
      )}
      {dateResult.reason === 'missing' && (
        <p className="mb-4 text-sm text-gray-600">Select a date to see availability.</p>
      )}

      <h2 className="mb-3 text-xl font-semibold">Desks</h2>
      <DataView status={status} emptyMessage="No desks available in this space yet.">
        <ul>
          {desks.map((d) => {
            const isAvailable = availability ? availability.get(d.id) ?? false : false;
            const enable = !!availability && isAvailable;
            return (
              <li
                key={d.id}
                className="flex items-center justify-between border-b border-gray-200 py-3 text-sm"
              >
                <span className="font-medium">{d.label}</span>
                <span className="text-gray-700">{formatCents(d.dailyPriceCents)}</span>
                {availability && (
                  <span className={isAvailable ? 'text-green-700' : 'text-red-700'}>
                    {isAvailable ? 'Available' : 'Unavailable'}
                  </span>
                )}
                <button
                  type="button"
                  disabled={!enable}
                  className="rounded bg-gray-900 px-3 py-1 text-sm font-medium text-white disabled:opacity-50"
                >
                  Book this desk
                </button>
              </li>
            );
          })}
        </ul>
      </DataView>
    </main>
  );
}
```

> **Note for Amelia:** The `notFound()` call inside the try/catch is tricky — it throws a Next-internal redirect signal that should NOT be caught and turned into an error state. The sketch above re-throws on the `NEXT_HTTP_ERROR_FALLBACK` digest. **Cleaner pattern:** call `getPublishedSpaceById` BEFORE the try/catch, do the `notFound()` check there, then wrap only the desks/bookings queries in try/catch. Refactor accordingly during implementation.

#### `src/app/api/spaces/[id]/route.ts` (NEW)

```ts
import { getPublishedSpaceById } from '@/db/queries/spaces';
import { listActiveDesksForSpace } from '@/db/queries/desks';
import { apiError, apiNotFound } from '@/lib/http';
import { logger } from '@/lib/logger';

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;
  try {
    const space = await getPublishedSpaceById(id);
    if (!space) return apiNotFound('Space not found');
    const desks = await listActiveDesksForSpace(id);
    return Response.json({ space, desks }, { status: 200 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error('space_detail_route_failed', { error: msg });
    return apiError('INTERNAL_ERROR', 'Something went wrong', 500);
  }
}
```

#### `src/app/api/spaces/[id]/availability/route.ts` (NEW)

```ts
import { getPublishedSpaceById } from '@/db/queries/spaces';
import { listActiveDesksForSpace } from '@/db/queries/desks';
import { listActiveBookingsForSpaceOnDate } from '@/db/queries/bookings';
import { computeDeskAvailability } from '@/lib/availability';
import { parseDateParam } from '@/lib/format';
import { apiError, apiNotFound } from '@/lib/http';
import { logger } from '@/lib/logger';

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;
  const url = new URL(req.url);
  const dateParam = url.searchParams.get('date') ?? undefined;
  const dateResult = parseDateParam(dateParam);
  if (!dateResult.valid) {
    return apiError(
      'VALIDATION_ERROR',
      'date query param is required, must be YYYY-MM-DD, and not in the past',
      400,
    );
  }

  try {
    const space = await getPublishedSpaceById(id);
    if (!space) return apiNotFound('Space not found');
    const [desks, bookings] = await Promise.all([
      listActiveDesksForSpace(id),
      listActiveBookingsForSpaceOnDate(id, dateResult.iso),
    ]);
    const availabilityMap = computeDeskAvailability(desks, bookings);
    const availability = desks.map((d) => ({
      deskId: d.id,
      isAvailable: availabilityMap.get(d.id) ?? false,
    }));
    return Response.json(
      { date: dateResult.iso, availability },
      { status: 200 },
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error('space_availability_route_failed', { error: msg });
    return apiError('INTERNAL_ERROR', 'Something went wrong', 500);
  }
}
```

#### `src/app/page.tsx` (modification — wrap card content in Link)

Change the existing `<li>` body so that `<img>` + heading + city are inside a `<Link href={\`/spaces/${s.id}\`} className="block hover:bg-gray-50">`. The card visually stays the same; clicking now navigates to the detail page.

### File-structure requirements

After this story:

```
deskhive/
├── src/
│   ├── app/
│   │   ├── page.tsx                                # UPDATED — cards link to /spaces/[id]
│   │   ├── spaces/                                 # NEW directory (US-3.2)
│   │   │   └── [id]/
│   │   │       └── page.tsx                        # NEW — public detail page
│   │   └── api/
│   │       └── spaces/
│   │           ├── route.ts                        # (unchanged — GET list)
│   │           └── [id]/                           # NEW directory (US-3.2)
│   │               ├── route.ts                    # NEW — GET /spaces/:id
│   │               └── availability/
│   │                   └── route.ts                # NEW — GET /spaces/:id/availability
│   ├── db/
│   │   └── queries/
│   │       ├── spaces.ts                           # UPDATED — add getPublishedSpaceById
│   │       ├── desks.ts                            # UPDATED — add listActiveDesksForSpace
│   │       └── bookings.ts                         # NEW (US-3.2)
│   └── lib/
│       ├── availability.ts                         # NEW (US-3.2)
│       ├── availability.test.ts                    # NEW (US-3.2)
│       └── format.ts                               # UPDATED — add parseDateParam
│       └── format.test.ts                          # UPDATED — add parseDateParam tests
└── tests/
    └── e2e/
        └── space-detail.spec.ts                    # NEW (US-3.2) — 4 unauthenticated tests
```

Files NOT touched:
- `deskhive/src/app/layout.tsx` — root layout unchanged.
- `deskhive/src/components/header.tsx`, `data-view.tsx`, etc. — unchanged.
- `deskhive/src/proxy.ts` — `/spaces/*` is public; matcher already excludes it.
- `deskhive/src/lib/auth/*` — unchanged.
- All admin pages, admin actions, admin queries (the public queries are siblings, not replacements).
- All Epic 1 files; all Epic 2 files except the admin queries which we add new siblings to.
- `deskhive/src/lib/validation/*` — no validation needed for the GET passthrough.

### Anti-patterns — explicit DO-NOTs

- ❌ Wiring the "Book this desk" button click. US-3.3 owns it.
- ❌ Wrapping the button in a `<form action={createBookingAction}>`. US-3.3.
- ❌ Adding a Server Action for booking. US-3.3.
- ❌ Filtering bookings on `status != 'CANCELLED'`. Whitelist `PENDING` + `CONFIRMED`.
- ❌ Using `auth.api.getSession` on the public detail page. Public route.
- ❌ Showing SUSPENDED spaces or inactive desks. Filter strictly on the public path.
- ❌ Modifying `getSpaceById`, `listDesksForSpace` (the admin variants). Add public siblings.
- ❌ Adding admin chrome (e.g., "Edit space" link) to the public page.
- ❌ Caching the page response. Dynamic rendering same as `/`.
- ❌ Catching the `notFound()` signal in try/catch and converting to error state. Re-throw if you wrap.
- ❌ Adding pagination to desks. Phase 1 inventory is small.
- ❌ Assuming the date is always present in the URL — handle missing/malformed/past gracefully.
- ❌ Using `<input type="text">` for the date. Use `type="date"` so the browser's native picker provides UX.
- ❌ Hardcoding `min={'2026-01-01'}` on the date input. Use `todayIso()`.

### Project structure notes

- `src/app/spaces/[id]/page.tsx` is the first **public** dynamic-segment route. Pattern parallel to `src/app/admin/spaces/[id]/page.tsx` (admin variant) — same async `params` shape, same `notFound()` semantics.
- `src/app/api/spaces/[id]/availability/route.ts` is the deepest nested public REST route. Pattern carries forward to `src/app/api/bookings/[id]/cancel/route.ts` (US-3.5).
- `src/db/queries/bookings.ts` is the third domain query file. Future bookings stories (US-3.3, US-3.4, US-3.5, US-4.x) will extend this single file.
- `src/lib/availability.ts` is the first cross-cutting "domain logic" helper. If more scheduling logic lands (Phase 2), it can grow into a directory.
- `parseDateParam` consolidation prevents drift between page and REST endpoint validation.

### Previous story intelligence

- **US-3.1** (`8d7bb48`): public browse page; `listPublishedSpaces`; `<DataView>` empty/error states; cards explicitly NOT clickable yet (this story makes them clickable).
- All Epic 2 stories: admin spaces + admin desks + `isPgUniqueViolation` helper.

**Patterns established (replicate, don't deviate):**
- Server Components fetch via Drizzle directly.
- `<DataView>` for list-shaped pages with empty/error states.
- Async `params` and `searchParams` (Next 16).
- Distinct query helpers per audience (admin vs public).
- URL-driven filters / pickers (no client state).
- Verbatim PRD strings (e.g. badge text "Available" / "Unavailable").
- One feature story → one `feat:` commit.

### Recent commits

```
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

US-3.2 is the ninth `feat:` commit. After it, Epic 3 has US-3.3 / 3.4 / 3.5 still in `backlog`.

### References

- [Source: docs/02-phase1-prd.md#Section 8] — US-3.2 verbatim Gherkin.
- [Source: docs/02-phase1-prd.md#Section 4.3] — FR-D3, FR-D4.
- [Source: docs/02-phase1-prd.md#Section 6.1] — `desks` (`is_active`), `bookings` schema.
- [Source: docs/02-phase1-prd.md#Section 6.2] — partial unique index `uniq_active_booking_per_desk_per_date` covers PENDING/CONFIRMED.
- [Source: docs/02-phase1-prd.md#Section 6.4] — `GET /spaces/:id`, `GET /spaces/:id/availability?date=...`.
- [Source: docs/02-phase1-prd.md#Section 7.5] — date picker required; button disabled without a date.
- [Source: docs/02-phase1-prd.md#Section 7.6] — booking date cannot be in the past.
- [Source: _bmad-output/implementation-artifacts/2-4-edit-desk.md] — `is_active = true` cross-story dependency.
- [Source: _bmad-output/implementation-artifacts/3-1-browse-spaces.md] — cards NOT clickable yet (deferred to this story).
- [Source: deskhive/AGENTS.md] — Next.js 16 caveats.

## Dev Agent Record

### Agent Model Used

Claude Opus 4.7 (1M context) — invoked via `bmad-dev-story` skill on 2026-05-06 in speed mode.

### Debug Log References

| Step | Notable output |
|---|---|
| `pnpm typecheck` | One mid-execution fix needed (TS narrowing on `dateResult.reason`); clean after |
| `pnpm lint` | Clean (inline `eslint-disable-next-line @next/next/no-img-element` for the space's primary image) |
| `pnpm test` | 90/90 pass + 1 skipped — added 5 `parseDateParam` + 4 `computeDeskAvailability` tests |
| `pnpm build` | 19 routes (added `/spaces/[id]`, `/api/spaces/[id]`, `/api/spaces/[id]/availability`); proxy still attached |
| `pnpm test:e2e` | 22/22 pass in 12.7s — added 4 new space-detail tests (404/400/400-past/404-future-bogus) |

### Completion Notes List

**Story executed end-to-end. Stop bar (`/spaces/[id]` renders for any PUBLISHED space) achieved structurally.** All 90 unit + 22 E2E tests pass. Browser-interactive verification on BA's plate.

**One mid-execution correction:**

1. **TS narrowing on `dateResult.reason`.** First typecheck failed with "Property 'reason' does not exist on type DateParamResult" because `.reason` is only on the `{ valid: false }` branch. Fixed by gating each `reason` access on `!dateResult.valid` first. The story's draft sketches missed this. **Note for future stories using discriminated unions in JSX:** always narrow on the discriminator (`!result.valid` or `result.status === 'X'`) before accessing branch-specific fields. Worth noting that the JSX-friendly pattern `{!dateResult.valid && dateResult.reason === 'missing' && ...}` works because TypeScript narrows inside the `&&` chain.

**Key implementation observations:**

2. **Cleaner `notFound()` placement** (per the story's "Note for Amelia"). Resolved space OUTSIDE the try/catch — if `getPublishedSpaceById` throws (DB hiccup), it propagates to Next's default error page (correct behavior); if it returns undefined, `notFound()` runs cleanly. The desks/bookings fetch is the only thing inside the inner try/catch; that's where transient DB errors degrade gracefully to the `<DataView>` error state. **TypeScript correctly narrows `space` to non-undefined after `if (!space) notFound()`** because `notFound()` returns `never`.

3. **`inArray(bookingsTable.status, ACTIVE_STATUSES)` works without casts.** Drizzle 0.45 accepts a typed array directly; the `as unknown as string[]` cast suggested in the story was unnecessary. Cleaner code.

4. **Cards on `/` are now clickable.** US-3.1's anti-pattern explicitly deferred this; one-line wrapper around the card content (`<Link href={\`/spaces/${s.id}\`} className="block hover:bg-gray-50">`). The image + heading + city stay visually identical.

5. **Distinct query helpers per audience pattern continues.** Three new sibling queries this story: `getPublishedSpaceById` (vs admin `getSpaceById`), `listActiveDesksForSpace` (vs admin `listDesksForSpace`), `listActiveBookingsForSpaceOnDate` (first bookings query, public-only). Admin variants remain unchanged.

6. **`computeDeskAvailability` is genuinely pure** — 4 unit tests cover all-available, partial-occupied, empty desks, and stray bookings (for desks not in the supplied list, the booking is silently ignored). Both the page and the REST handler consume it.

7. **Date validation is consolidated.** `parseDateParam` in `src/lib/format.ts` is the single source of truth. The page renders different UI for `missing` vs `malformed`/`past`; the REST endpoint returns 400 for any non-`valid` outcome. 5 unit tests cover the matrix.

8. **Click behavior is genuinely inert as planned.** The "Book this desk" button is `<button type="button">` with no handler. Disabled state correctly tied to `!availability || !isAvailable`. US-3.3 will wrap each row in a Server-Action `<form>`; this story leaves the structure as a clean canvas.

9. **`pg sslmode` warning** keeps appearing in the build/seed output. Non-blocking; will reassess on `pg` v9 upgrade.

**Browser-interactive verifications still on BA's plate (Task 12):**
- Visit `/` → cards clickable → click → `/spaces/<id>`
- Page shows: header + heading + image + description + city + date picker + active desks list (no badges yet)
- Pick today's date → "Available" badges + buttons enabled
- Click button → no-op (correct — US-3.3 wires it)
- Pick yesterday → notice + disabled buttons + no badges
- DevTools API matrix: bogus space → 404; missing date → 400; past date → 400; future date + bogus space → 404
- Real CONFIRMED booking via direct DB INSERT (since US-3.3 isn't shipped) on a desk for tomorrow → re-pick that date → desk shows "Unavailable" + button disabled

### File List

All paths relative to repo root.

**NEW (8 files):**
- `deskhive/src/db/queries/bookings.ts` — first bookings domain query (`listActiveBookingsForSpaceOnDate`)
- `deskhive/src/lib/availability.ts` — pure `computeDeskAvailability` helper
- `deskhive/src/lib/availability.test.ts` — 4 helper tests
- `deskhive/src/app/spaces/[id]/page.tsx` — public space detail page
- `deskhive/src/app/api/spaces/[id]/route.ts` — `GET /spaces/:id` REST endpoint
- `deskhive/src/app/api/spaces/[id]/availability/route.ts` — `GET /spaces/:id/availability` REST endpoint
- `deskhive/tests/e2e/space-detail.spec.ts` — 4 unauthenticated REST tests

**UPDATED (5 files):**
- `deskhive/src/lib/format.ts` — added `parseDateParam` + `DateParamResult` type
- `deskhive/src/lib/format.test.ts` — added 5 `parseDateParam` tests
- `deskhive/src/db/queries/spaces.ts` — added `getPublishedSpaceById` (admin `getSpaceById` unchanged)
- `deskhive/src/db/queries/desks.ts` — added `listActiveDesksForSpace` + `and` import (admin `listDesksForSpace` unchanged)
- `deskhive/src/app/page.tsx` — wrapped each card's content in `<Link href={\`/spaces/${s.id}\`}>` (US-3.1 deferred behavior)

**NOT TOUCHED (per story anti-patterns):**
- `deskhive/src/app/layout.tsx` — root layout unchanged
- `deskhive/src/components/header.tsx`, `data-view.tsx`, etc. — unchanged
- `deskhive/src/proxy.ts` — `/spaces/*` is public; matcher already excludes it
- `deskhive/src/lib/auth/*` — unchanged
- `deskhive/src/lib/db-errors.ts` — read paths don't have unique violations
- `deskhive/src/db/schema.ts` — no schema changes
- All admin pages, admin actions, admin queries — admin getters/listers unchanged
- All Epic 1 files; all Epic 2 files
- `deskhive/src/lib/validation/*` — no validation needed for the GET passthroughs
- `deskhive/src/actions/*` — no Server Actions in this story

### Change Log

| Date | Change | Commit |
|---|---|---|
| 2026-05-06 | Story drafted by `bmad-create-story`. | (none) |
| 2026-05-06 | US-3.2 implemented; mid-execution TS narrowing fix; cleaner `notFound()` placement; cards on `/` now clickable; all CI commands green. | `1feff2d` |
