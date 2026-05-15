# Story 3.3: Create Booking

Status: review

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a **logged-in Guest**,
I want **to click "Book this desk" on `/spaces/:id` and submit a booking request for the selected date**,
so that **I reserve a workspace for that day.**

> Verbatim from Document B §8 (US-3.3). FR-B1 (Guest creates a PENDING booking), FR-B4 (DB-enforced double-booking prevention), FR-B5 (no past-date bookings).

> **This story closes the booking-creation loop.** It writes to `bookings` for the first time in production code paths, exercises the partial unique index `uniq_active_booking_per_desk_per_date` from US-0.2, and ships a minimal `/my-bookings` page (so the success redirect lands on something real). US-3.4 enriches `/my-bookings`; US-3.5 adds the cancel button.

## Acceptance Criteria

Verbatim Gherkin from Document B §8 US-3.3, plus implementation-shaped ACs:

1. **AC-1 (Successful booking creation — happy path).**
   ```gherkin
   Given I am logged in as Guest "ada@example.com"
   And a Space "Hive Central" has a desk "Desk-1" with daily price 2500
   When I select tomorrow's date on the space detail page
   And I click "Book this desk" for Desk-1
   Then a booking is created with status PENDING
   And total_price_cents = 2500
   And I am redirected to /my-bookings
   And I see the new booking in the list with status badge "Pending"
   ```

2. **AC-2 (Logged-out user gets redirected to /login with callback).**
   ```gherkin
   Given I am NOT logged in
   And I am viewing the detail page for "Hive Central" with a date selected
   When I click "Book this desk"
   Then I am redirected to /login
   And after I log in, I am returned to the space detail page
   ```
   **Implementation note:** the booking action's auth-fail path issues `redirect('/login?callbackUrl=…')` with the URL-encoded `/spaces/:id?date=…` path. The login Server Action reads `callbackUrl` from FormData; if it's a same-origin relative path (starts with `/` and not `//`), redirects there post-login; otherwise falls back to `/`. **`/` fallback prevents open-redirect abuse.**

3. **AC-3 (Double-booking prevention — verbatim PRD message).**
   ```gherkin
   Given a desk "Desk-1" already has a PENDING booking for date 2026-06-01
   When another Guest attempts to book "Desk-1" for the same date 2026-06-01
   Then the request is rejected with HTTP 409 Conflict
   And the error message reads "This desk is already booked for that date"
   And no new booking row is inserted
   ```
   **Verbatim string:** `"This desk is already booked for that date"`. No paraphrasing — same rule as US-2.3's verbatim duplicate-label message.

4. **AC-4 (Booking after cancellation succeeds).**
   ```gherkin
   Given Guest A had a booking for Desk-1 on 2026-06-01 that is now CANCELLED
   When Guest B attempts to book Desk-1 on 2026-06-01
   Then the booking is created successfully with status PENDING
   ```
   **Already true at the schema level:** the partial unique index covers only `status IN ('PENDING','CONFIRMED')`. CANCELLED rows don't conflict. Action verifies via the `isPgUniqueViolation` matcher landing only on the active set.

5. **AC-5 (Past-date rejection — verbatim PRD message).**
   ```gherkin
   Given today is 2026-06-15
   When I attempt to create a booking for date 2026-06-14
   Then the request is rejected with the error "Booking date cannot be in the past"
   And no booking is created
   ```
   **Verbatim string:** `"Booking date cannot be in the past"`. Server-side authoritative; the form's `<input type="date" min={todayIso()}>` is presentation-only.

6. **AC-6 (Guests only — Super Admins get 403).** Booking creation is a Guest action. A logged-in Super Admin who somehow submits the form (DevTools, REST direct) gets 403 with code `FORBIDDEN`. (PRD §6.4 maps `POST /bookings` access to "Guest".)

7. **AC-7 (`/my-bookings` minimal page).** Required by AC-1's "I see the new booking in the list with status badge 'Pending'". This story ships a Server-Component page at `/my-bookings` that:
   - `requireSession`. Auth-fail → redirect to `/login?callbackUrl=/my-bookings`.
   - Lists the user's own bookings (filtered by `guest_user_id = session.user.id`), enriched with desk label + space name via JOIN.
   - Each row shows: space name, desk label, booking date (ISO), status badge (`<StatusBadge>` from US-0.2 — see Doc B §7.4).
   - **No cancel button** (US-3.5).
   - Empty state: `"You don't have any bookings yet."` via `<DataView>`.
   - Ordered: most recent first (`createdAt desc`).
   - **Role gate:** Super Admins visiting `/my-bookings` redirect to `/admin/spaces` (their natural home). Or simpler — show the same page with their (empty) list. **Decision: don't role-gate.** Super Admins can view the page; they just won't have any bookings under their user id. Keeps scope tight.

8. **AC-8 (Architecture-shaped error response — Server Action).** `idle` | `error.UNAUTHORIZED` (handled via redirect, not state) | `error.FORBIDDEN` | `error.VALIDATION_ERROR` (bad UUID / bad ISO date) | `error.PAST_DATE` (verbatim message) | `error.DESK_NOT_FOUND` (desk missing or inactive, or its space not PUBLISHED — collapsed to one user-facing code) | `error.DOUBLE_BOOKING` (verbatim message) | `error.INTERNAL_ERROR`.

9. **AC-9 (Architecture-shaped error response — REST `POST /bookings`).** Status codes: 201 / 400 / 401 / 403 / 404 / 409 / 500. Body uses `apiError` helpers. The 409 response body's `error` is the verbatim PRD string `"This desk is already booked for that date"` with code `DOUBLE_BOOKING`.

10. **AC-10 (Per-desk error rendering inline).** Each "Book this desk" button is a separate form. Errors render inline below the button (small red paragraph). The Server Component page provides one `<BookDeskButton>` Client Component per desk; each has its own `useActionState`.

11. **AC-11 (`revalidatePath` after create).** After a successful booking insert, the action calls `revalidatePath(\`/spaces/${spaceId}\`)` (so re-visiting the detail page shows the desk as Unavailable for that date) AND `revalidatePath('/my-bookings')` (so the list shows the new row). **Then `redirect('/my-bookings')`.**

12. **AC-12 (price snapshot at booking time).** `total_price_cents = desk.daily_price_cents` resolved at insert time — NOT computed from a join. Future price changes (US-2.4 edits) don't retroactively change existing bookings.

13. **AC-13 (Stop bar — booking flow works end-to-end).**
    - As a logged-in Guest, on `/spaces/<id>` with tomorrow's date selected, click "Book this desk" on an Available desk → redirected to `/my-bookings` → row visible with `Pending` badge.
    - Click "Book this desk" again on the same desk same date → inline error: `"This desk is already booked for that date"` (because the FIRST booking made it unavailable).
    - As an unauthenticated visitor, click "Book this desk" → redirected to `/login`. After successful login, returned to `/spaces/<id>?date=…`.
    - Submit `POST /bookings` from DevTools as a Super Admin session → 403.
    - Submit with a past date (DevTools tampering) → 400 + `"Booking date cannot be in the past"`.

14. **AC-14 (Single commit).** `feat: guest create booking + minimal my bookings (US-3.3)`. Commit content under `deskhive/`.

## Tasks / Subtasks

- [x] **Task 0 — Prep.** Verify all CI commands from US-3.2 (`1feff2d`) still pass. No DB migrations.

- [x] **Task 1 — `createBookingSchema`** — `src/lib/validation/booking.ts`:
  - `createBookingSchema = z.object({ deskId: z.string().uuid('Invalid desk id'), bookingDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format') })`.
  - **Past-date check NOT in the schema** — done in the action layer where `isPastDate` is more contextual (and produces the verbatim message).
  - `spaceId` NOT in the schema — derived from desk lookup.
  - Export `CreateBookingInput` type.
  - Add `src/lib/validation/booking.test.ts` with ~5 tests.

- [x] **Task 2 — Desks query (extension)** — `src/db/queries/desks.ts`:
  - `getActiveDeskById(id: string): Promise<Desk | undefined>`: selects with `eq(id) AND eq(is_active, true)`. Returns undefined for missing or inactive desks.
  - Don't modify `getDeskById` (admin variant — still resolves inactive desks).

- [x] **Task 3 — Bookings queries (extension)** — `src/db/queries/bookings.ts`:
  - `createBooking(input: { guestUserId, spaceId, deskId, bookingDate, totalPriceCents }): Promise<Booking>`: insert with `status: 'PENDING'`, return the inserted row via `.returning()`.
  - `listBookingsForGuest(guestUserId: string): Promise<Array<{ booking: Booking; desk: Desk; space: Space }>>`: JOINs `bookings → desks → spaces`, filters on `guest_user_id`, orders by `bookings.created_at desc`. **Use `db.select({ booking: bookingsTable, desk: desksTable, space: spacesTable })` with `innerJoin` clauses** (Drizzle pattern).

- [x] **Task 4 — Booking Server Action** — `src/actions/booking.ts`:
  - `'use server'`.
  - `CreateBookingActionState` discriminated union (see AC-8 codes).
  - Reads `spaceId`, `deskId`, `bookingDate` from FormData (hidden inputs from the form).
  - **Auth flow:**
    - `requireSession` → `requireRole(session, 'GUEST')`.
    - On 401 (`AuthError.response.status === 401`): construct callback URL = `\`/spaces/${spaceId}?date=${bookingDate}\`` (encode via `encodeURIComponent`), then `redirect(\`/login?callbackUrl=${encoded}\`)`. **`spaceId` MUST come from the form's hidden input** so the redirect can be built without a pre-auth DB call.
    - On 403: return `{ status: 'error', code: 'FORBIDDEN', message: 'Only guests can book desks.' }`.
  - **Validation flow:**
    - `createBookingSchema.safeParse({ deskId, bookingDate })`. On failure → `VALIDATION_ERROR`.
    - `isPastDate(bookingDate)` → `{ status: 'error', code: 'PAST_DATE', message: 'Booking date cannot be in the past' }`. **Verbatim PRD message.**
  - **Existence checks:**
    - `getActiveDeskById(deskId)`. If undefined → `DESK_NOT_FOUND` ("This desk is not available.").
    - `getPublishedSpaceById(desk.spaceId)`. If undefined → `DESK_NOT_FOUND` (same code; user-facing distinction is unnecessary).
    - **Cross-check `desk.spaceId === formData.spaceId`?** Optional defensive check; log + treat as DESK_NOT_FOUND if mismatched (a tampered hidden input). Skip for Phase 1 simplicity; the spaceId from the form is only used for the callback URL pre-auth, never as a write input.
  - **Insert:**
    - `createBooking({ guestUserId: session.user.id, spaceId: desk.spaceId, deskId: desk.id, bookingDate, totalPriceCents: desk.dailyPriceCents })`.
    - Catch unique-violation via `isPgUniqueViolation(err, 'uniq_active_booking_per_desk_per_date')` → `{ status: 'error', code: 'DOUBLE_BOOKING', message: 'This desk is already booked for that date' }`. **Verbatim PRD message.**
    - Other errors → INTERNAL_ERROR.
  - **Success:**
    - `revalidatePath(\`/spaces/${desk.spaceId}\`)` and `revalidatePath('/my-bookings')`.
    - `redirect('/my-bookings')`.

- [x] **Task 5 — `POST /bookings` REST endpoint** — `src/app/api/bookings/route.ts`:
  - Auth: `requireSession` + `requireRole('GUEST')` → `apiError('UNAUTHORIZED', ..., 401)` / `('FORBIDDEN', ..., 403)`.
  - JSON body: `{ deskId, bookingDate }`. `spaceId` not in REST body — derived from desk lookup (same as the action).
  - Validate via `createBookingSchema`.
  - Past-date check → 400 with verbatim message.
  - Existence checks → 404 if desk missing/inactive or space not published.
  - Insert. Catch unique-violation → 409 + verbatim message + code `DOUBLE_BOOKING`.
  - On success → 201 + the inserted booking row.

- [x] **Task 6 — `<BookDeskButton>` Client Component** — `src/app/spaces/[id]/book-desk-button.tsx`:
  - `'use client'`.
  - Props: `{ spaceId, deskId, bookingDate: string | undefined, enabled: boolean }`.
  - Always renders a `<form action={createBookingAction}>` with three hidden inputs (`spaceId`, `deskId`, `bookingDate` — empty string when undefined). Submit button label "Book this desk"; pending label "Booking…".
  - **Stable hook reference:** `useActionState(createBookingAction, initialState)` — no `.bind`, no conditional action. The action itself early-returns on missing/invalid inputs.
  - Inline error rendering below the button:
    - `state.code === 'PAST_DATE'` → `state.message` ("Booking date cannot be in the past")
    - `state.code === 'DOUBLE_BOOKING'` → `state.message`
    - `state.code === 'DESK_NOT_FOUND'` / `'FORBIDDEN'` / `'INTERNAL_ERROR'` → `state.message`
    - `state.code === 'VALIDATION_ERROR'` → render the first field's error (or a generic "Invalid input" fallback)
  - Button is `disabled` when `!enabled` OR `pending`.

- [x] **Task 7 — Update `/spaces/[id]/page.tsx`** — replace the inert `<button type="button">` with `<BookDeskButton spaceId={space.id} deskId={d.id} bookingDate={dateResult.valid ? dateResult.iso : undefined} enabled={!!availability && (availability.get(d.id) ?? false)} />`. Everything else on the page (heading, image, desks list rendering, badges) stays the same.

- [x] **Task 8 — Minimal `/my-bookings` page** — `src/app/my-bookings/page.tsx`:
  - Server Component.
  - `requireSession` → on `AuthError` (no session), `redirect('/login?callbackUrl=/my-bookings')`. Don't role-gate.
  - Fetch via `listBookingsForGuest(session.user.id)`.
  - Render: `<h1>My bookings</h1>` + a `<DataView>` with empty message `"You don't have any bookings yet."` and a list. Each row: `<StatusBadge status={booking.status} />` (verifying the component supports the four enum values from US-0.2), space name, desk label, formatted date.
  - Use existing `<StatusBadge>` from `src/components/status-badge.tsx`. **Reading the component first** is important — its prop API may be `status` or something else.
  - **No cancel button** — that's US-3.5.

- [x] **Task 9 — Login callback support** — modify the login flow:
  - **`src/app/(public)/login/page.tsx`**: read `searchParams: Promise<{ callbackUrl?: string }>`, pass to `<LoginForm callbackUrl={callbackUrl} />` as a prop.
  - **`src/app/(public)/login/login-form.tsx`**: accept the prop. Render a hidden `<input type="hidden" name="callbackUrl" value={callbackUrl ?? ''}>`.
  - **`src/actions/auth.ts::loginAction`**: read `formData.get('callbackUrl')` after successful sign-in. **Validate same-origin:** must be a non-empty string starting with `/` and NOT starting with `//` (defense against open-redirect). On valid → `redirect(callbackUrl)`. Otherwise default `redirect('/')`.
  - **No new test required** for the action change; the existing `/login` E2E tests verify the form still renders and empty-submit still validates. Manual verification covers the redirect behavior.

- [x] **Task 10 — E2E tests** — extend or add `tests/e2e/bookings.spec.ts`:
  - `unauthenticated POST /api/bookings returns 401` — `request.post('/api/bookings', { data: { deskId: bogus, bookingDate: future } })`, expect 401.
  - `POST /api/bookings without body returns 400` — empty body or missing fields.
  - `unauthenticated GET /my-bookings redirects to /login` — `page.goto('/my-bookings')`, expect URL `/login*`.
  - **DB-dependent happy-path E2E (login → submit → /my-bookings list updates) DEFERRED** to the future Postgres-in-CI story.

- [x] **Task 11 — Local CI parity:**
  - `pnpm typecheck` clean
  - `pnpm lint` clean
  - `pnpm test` — 90 prior + ~5 booking-schema tests = ~95 passing + 1 skipped
  - `pnpm build` — successful, +2 routes (`/api/bookings`, `/my-bookings`)
  - `pnpm test:e2e` — at least 25 tests pass (existing 22 + 3 new)

- [ ] **Task 12 — Manual verification (BA's eyeball — DEFERRED to BA's review of `review`-state story):**
  - As Guest (use a fresh registered Guest), open `/spaces/<id>?date=<future-iso>` → desks show Available. Click "Book this desk" on Desk-1 → redirected to `/my-bookings` → see row with desk label + date + Pending badge.
  - Click "Book this desk" on the same desk + date → inline error `"This desk is already booked for that date"`.
  - Pick a different date → click "Book this desk" → success.
  - Open `/spaces/<id>` while NOT logged in, pick a date, click "Book this desk" → redirected to `/login?callbackUrl=…`. Log in → land back on the space detail page with the date pre-selected.
  - DevTools: `POST /api/bookings` from no-session → 401; from Super Admin session → 403; with `bookingDate` = yesterday → 400 + verbatim past-date message; with already-booked desk+date → 409 + verbatim double-booking message.
  - Cancel a booking via direct DB UPDATE (`UPDATE bookings SET status='CANCELLED' WHERE id=X`) → re-book the same desk+date → success (validates AC-4 partial-index-skips-CANCELLED).

- [x] **Task 13 — Single commit (AC-14)** — `feat: guest create booking + minimal my bookings (US-3.3)`.

## Dev Notes

### What gets built and what's deliberately out of scope

This is the **third story of Epic 3**. After it lands:
- Guests can submit bookings end-to-end through the UI.
- The `bookings` table gets its first production write.
- `/my-bookings` exists as a minimal Server Component page (US-3.4 enriches; US-3.5 adds cancel).
- The login flow honors `callbackUrl` for return-to-origin UX.

Feature scope (US-3.3 only):
- ✅ `<BookDeskButton>` Client Component (form + useActionState)
- ✅ `createBookingAction` Server Action
- ✅ `POST /bookings` REST endpoint
- ✅ Minimal `/my-bookings` page (list with status badges; no cancel)
- ✅ Login flow: callbackUrl support
- ✅ Verbatim PRD error messages (`"This desk is already booked for that date"`, `"Booking date cannot be in the past"`)
- ✅ DB unique-violation handler exercising the `uniq_active_booking_per_desk_per_date` index for the first time

Out of scope for US-3.3 (do NOT build):
- ❌ Cancel a booking (US-3.5).
- ❌ Polish on `/my-bookings` (US-3.4 verifies AC + adds visual richness).
- ❌ Admin booking list (`/admin/bookings` — US-4.1).
- ❌ Confirm/Reject by admin (US-4.2 / US-4.3).
- ❌ Email notifications (Phase 2).
- ❌ Payment flow / Stripe (Phase 2 — `payment_status` and `payment_reference` columns stay NULL).
- ❌ Booking detail page — not in Doc B §7.2's screen inventory.
- ❌ Multi-day / range bookings (Phase 2).
- ❌ Time-of-day booking slots (Phase 2 — Phase 1 is whole-day).
- ❌ Capacity per desk > 1 (Phase 2 — each desk is single-occupancy).
- ❌ Waitlist when desk is unavailable (Phase 2).
- ❌ Booking confirmation modal — Doc B §7.5 explicitly forbids: "After a Guest submits a booking, redirect them to /my-bookings. Do not show a modal."

### Key decisions

1. **Hidden inputs over `.bind` for the booking form.** The `<BookDeskButton>` form has three hidden inputs (`spaceId`, `deskId`, `bookingDate`). The action reads them from FormData. **Why not `.bind`:** binding three args means the bound action has a stable identity per (deskId, date) pair, which causes `useActionState`'s hook to receive a different action across renders if the date changes — risky for hook-rules invariants. Hidden inputs keep the action reference stable and let the action re-read fresh values on every submit.

2. **Per-desk forms (one per row).** Each desk's button is its own `<form>` element with its own `useActionState`. Errors render inline per row. **Anti-pattern: a single page-level form that submits multiple desks**.

3. **`spaceId` in the form for the callback URL.** Without `spaceId`, the auth-fail redirect can't construct a useful callback URL without a pre-auth DB lookup. Including `spaceId` as a hidden input is cheap and deterministic.

4. **Login callback URL: same-origin guard.** The callback must start with `/` and NOT `//` (which would be a protocol-relative URL pointing to another origin). Without this guard, an attacker could craft `/login?callbackUrl=//evil.com` to redirect users post-login. **Defense:** `if (callbackUrl.startsWith('/') && !callbackUrl.startsWith('//')) { redirect(callbackUrl) }`. Otherwise default to `/`.

5. **Verbatim PRD error strings.**
   - `"This desk is already booked for that date"` (AC-3, double-booking)
   - `"Booking date cannot be in the past"` (AC-5, past-date)
   - Both are surfaced verbatim in the Server Action's `state.message`, the REST 400/409 body's `error`, and the inline UI rendering. **Same anti-paraphrasing rule as US-2.3 / US-2.4.**

6. **`/my-bookings` is shipped here, not in US-3.4.** US-3.3 AC-1 explicitly verifies content on `/my-bookings` ("I see the new booking in the list with status badge 'Pending'"). Without `/my-bookings`, the redirect from the booking action lands on a 404, blocking the AC. **US-3.4's scope:** verify Doc B §7.4 status-badge correctness (all four enum values), confirm Guest A doesn't see Guest B's bookings — tests against a live DB. Possibly minor UI polish. Most plumbing is shipped here.

7. **`<StatusBadge>` from US-0.2 used directly.** No new component. **Note for Amelia:** read `src/components/status-badge.tsx` first — the prop API (`status` vs other names) drives the call site. Doc B §7.4 specifies the visual mapping (colors + labels); if the existing component doesn't already match, refine in this story (it's listed as scaffolded primitives in US-0.2).

8. **Price snapshot at booking time** — `total_price_cents = desk.daily_price_cents` resolved during the action's flow (after the `getActiveDeskById` call). Subsequent edits to `desk.daily_price_cents` (US-2.4) don't retroactively change the booking. PRD AC-1 explicit: "total_price_cents = 2500" matches the desk's price at booking time.

9. **Defensive `getActiveDeskById` collapses missing-or-inactive into one return**. `undefined` covers both "row doesn't exist" and "row exists but is_active = false". User-facing `DESK_NOT_FOUND` reflects that ambiguity; the user just needs to know "this desk isn't bookable" — they don't need to know whether it never existed or was deactivated.

10. **No `payment_status` / `payment_reference` writes.** Per Doc B §6.1 forward-compatibility note, those columns stay NULL in Phase 1. Drizzle's insert defaults to NULL when fields are omitted. **Anti-pattern: do not write to those columns even with NULL explicitly** — keeps the migration path to Phase 2 (Stripe) cleaner.

11. **`isPgUniqueViolation` reused** with constraint name `'uniq_active_booking_per_desk_per_date'`. Third caller of the helper (after createDeskAction, editDeskAction, and the desks REST endpoints). The extraction in US-2.4 pays off again.

### Architecture compliance

- Validation: Zod for booking form / REST body. Past-date check at the action layer (verbatim message owned there).
- Form pattern: native `<form action={serverAction}>` + `useActionState` + `useFormStatus`.
- State management: per-form `useActionState` only.
- Component library: none. Raw Tailwind.
- Authorization: three-layer (proxy + page-level requireSession on `/my-bookings` + per-action guard).
- Error response shape: `{ status: 'error', code, message?, fields? }`.
- Status codes (REST): 201 / 400 / 401 / 403 / 404 / 409 / 500.
- Auth API: never raw Drizzle; always `requireSession` + `requireRole`.
- Reskinnable frontend: literal Tailwind utilities only.

### Code sketches (concise — fill in the rest from US-2.x patterns)

#### `src/lib/validation/booking.ts`

```ts
import { z } from 'zod';

export const createBookingSchema = z.object({
  deskId: z.string().uuid('Invalid desk id'),
  bookingDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD'),
});

export type CreateBookingInput = z.infer<typeof createBookingSchema>;
```

#### `src/db/queries/desks.ts` (extension)

```ts
export async function getActiveDeskById(id: string): Promise<Desk | undefined> {
  const [row] = await db
    .select()
    .from(desksTable)
    .where(and(eq(desksTable.id, id), eq(desksTable.isActive, true)))
    .limit(1);
  return row;
}
```

#### `src/db/queries/bookings.ts` (extension)

```ts
import { desc } from 'drizzle-orm';
import { spacesTable, desksTable, type Desk, type Space } from '@/db/schema';

export async function createBooking(input: {
  guestUserId: string;
  spaceId: string;
  deskId: string;
  bookingDate: string;
  totalPriceCents: number;
}): Promise<Booking> {
  const [row] = await db
    .insert(bookingsTable)
    .values({ ...input, status: 'PENDING' })
    .returning();
  return row;
}

export async function listBookingsForGuest(
  guestUserId: string,
): Promise<Array<{ booking: Booking; desk: Desk; space: Space }>> {
  return db
    .select({ booking: bookingsTable, desk: desksTable, space: spacesTable })
    .from(bookingsTable)
    .innerJoin(desksTable, eq(bookingsTable.deskId, desksTable.id))
    .innerJoin(spacesTable, eq(bookingsTable.spaceId, spacesTable.id))
    .where(eq(bookingsTable.guestUserId, guestUserId))
    .orderBy(desc(bookingsTable.createdAt));
}
```

#### `src/actions/booking.ts`

```ts
'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { requireSession, requireRole, AuthError } from '@/lib/auth/guards';
import { isPgUniqueViolation } from '@/lib/db-errors';
import { isPastDate } from '@/lib/format';
import { createBookingSchema } from '@/lib/validation/booking';
import { getActiveDeskById } from '@/db/queries/desks';
import { getPublishedSpaceById } from '@/db/queries/spaces';
import { createBooking } from '@/db/queries/bookings';
import { logger } from '@/lib/logger';

export type CreateBookingActionState =
  | { status: 'idle' }
  | { status: 'error'; code: 'FORBIDDEN'; message: string }
  | { status: 'error'; code: 'VALIDATION_ERROR'; fields: Record<string, string> }
  | { status: 'error'; code: 'PAST_DATE'; message: string }
  | { status: 'error'; code: 'DESK_NOT_FOUND'; message: string }
  | { status: 'error'; code: 'DOUBLE_BOOKING'; message: string }
  | { status: 'error'; code: 'INTERNAL_ERROR'; message: string };

export async function createBookingAction(
  _prevState: CreateBookingActionState,
  formData: FormData,
): Promise<CreateBookingActionState> {
  const spaceId = String(formData.get('spaceId') ?? '');
  const deskId = String(formData.get('deskId') ?? '');
  const bookingDate = String(formData.get('bookingDate') ?? '');

  // Auth (401 → redirect, 403 → state)
  let session;
  try {
    session = await requireSession();
    requireRole(session, 'GUEST');
  } catch (err) {
    if (err instanceof AuthError) {
      const status = err.response.status;
      if (status === 401) {
        const callback = `/spaces/${spaceId}?date=${bookingDate}`;
        redirect(`/login?callbackUrl=${encodeURIComponent(callback)}`);
      }
      if (status === 403) {
        return { status: 'error', code: 'FORBIDDEN', message: 'Only guests can book desks.' };
      }
    }
    logger.error('create_booking_action_auth_failed', { error: String(err) });
    return { status: 'error', code: 'INTERNAL_ERROR', message: 'Something went wrong.' };
  }

  // Validation
  const parsed = createBookingSchema.safeParse({ deskId, bookingDate });
  if (!parsed.success) {
    const fields: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? '');
      if (key && !fields[key]) fields[key] = issue.message;
    }
    return { status: 'error', code: 'VALIDATION_ERROR', fields };
  }

  if (isPastDate(parsed.data.bookingDate)) {
    return { status: 'error', code: 'PAST_DATE', message: 'Booking date cannot be in the past' };
  }

  // Existence
  const desk = await getActiveDeskById(parsed.data.deskId);
  if (!desk) {
    return { status: 'error', code: 'DESK_NOT_FOUND', message: 'This desk is not available.' };
  }
  const space = await getPublishedSpaceById(desk.spaceId);
  if (!space) {
    return { status: 'error', code: 'DESK_NOT_FOUND', message: 'This desk is not available.' };
  }

  // Insert
  let result: CreateBookingActionState | null = null;
  try {
    await createBooking({
      guestUserId: session.user.id,
      spaceId: desk.spaceId,
      deskId: desk.id,
      bookingDate: parsed.data.bookingDate,
      totalPriceCents: desk.dailyPriceCents,
    });
  } catch (err) {
    if (isPgUniqueViolation(err, 'uniq_active_booking_per_desk_per_date')) {
      result = {
        status: 'error',
        code: 'DOUBLE_BOOKING',
        message: 'This desk is already booked for that date',
      };
    } else {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error('create_booking_action_db_failed', { error: msg });
      result = {
        status: 'error',
        code: 'INTERNAL_ERROR',
        message: 'Something went wrong. Please try again.',
      };
    }
  }
  if (result) return result;

  revalidatePath(`/spaces/${desk.spaceId}`);
  revalidatePath('/my-bookings');
  redirect('/my-bookings');
}
```

> **Note on session.user.id typing:** Better Auth's session may type `user.id` as `string`. If `session.user.id` shows as `unknown` or otherwise, cast to string at the boundary: `String(session.user.id)`. Confirm during implementation.

#### `src/app/spaces/[id]/book-desk-button.tsx`

```tsx
'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { createBookingAction, type CreateBookingActionState } from '@/actions/booking';

const initialState: CreateBookingActionState = { status: 'idle' };

export function BookDeskButton({
  spaceId,
  deskId,
  bookingDate,
  enabled,
}: {
  spaceId: string;
  deskId: string;
  bookingDate: string | undefined;
  enabled: boolean;
}) {
  const [state, formAction] = useActionState(createBookingAction, initialState);

  const errorMessage =
    state.status === 'error'
      ? state.code === 'VALIDATION_ERROR'
        ? Object.values(state.fields)[0] ?? 'Invalid input'
        : state.message
      : undefined;

  return (
    <div>
      <form action={formAction}>
        <input type="hidden" name="spaceId" value={spaceId} />
        <input type="hidden" name="deskId" value={deskId} />
        <input type="hidden" name="bookingDate" value={bookingDate ?? ''} />
        <SubmitButton disabled={!enabled} />
      </form>
      {errorMessage && (
        <p className="mt-1 text-sm text-red-700" role="alert">
          {errorMessage}
        </p>
      )}
    </div>
  );
}

function SubmitButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={disabled || pending}
      className="rounded bg-gray-900 px-3 py-1 text-sm font-medium text-white disabled:opacity-50"
    >
      {pending ? 'Booking…' : 'Book this desk'}
    </button>
  );
}
```

#### `src/app/spaces/[id]/page.tsx` (one-line swap)

Replace the existing inert `<button type="button" disabled={!enable}>Book this desk</button>` with `<BookDeskButton spaceId={space.id} deskId={d.id} bookingDate={dateResult.valid ? dateResult.iso : undefined} enabled={enable} />`. Import the component at the top.

#### `src/app/my-bookings/page.tsx`

```tsx
import { redirect } from 'next/navigation';
import { requireSession, AuthError } from '@/lib/auth/guards';
import { listBookingsForGuest } from '@/db/queries/bookings';
import { DataView, type DataViewStatus } from '@/components/data-view';
import { StatusBadge } from '@/components/status-badge'; // or whatever the export name is
import { logger } from '@/lib/logger';

export default async function MyBookingsPage() {
  let session;
  try {
    session = await requireSession();
  } catch (err) {
    if (err instanceof AuthError) redirect('/login?callbackUrl=/my-bookings');
    throw err;
  }

  let rows: Awaited<ReturnType<typeof listBookingsForGuest>> = [];
  let dataStatus: DataViewStatus = 'loaded';
  try {
    rows = await listBookingsForGuest(String(session.user.id));
    if (rows.length === 0) dataStatus = 'empty';
  } catch (err) {
    logger.error('my_bookings_page_failed', { error: String(err) });
    dataStatus = 'error';
  }

  return (
    <main className="mx-auto max-w-3xl p-8">
      <h1 className="mb-6 text-2xl font-semibold">My bookings</h1>
      <DataView status={dataStatus} emptyMessage="You don't have any bookings yet.">
        <ul>
          {rows.map(({ booking, desk, space }) => (
            <li key={booking.id} className="flex items-center justify-between border-b border-gray-200 py-3 text-sm">
              <div>
                <div className="font-medium">{space.name}</div>
                <div className="text-gray-700">{desk.label} · {booking.bookingDate}</div>
              </div>
              <StatusBadge status={booking.status} />
            </li>
          ))}
        </ul>
      </DataView>
    </main>
  );
}
```

> **Note for Amelia:** `<StatusBadge>` props/API may differ from this sketch; read the existing component first and adapt. If it doesn't already render the four-enum mapping per Doc B §7.4 (PENDING/CONFIRMED/REJECTED/CANCELLED with the right colors and capitalized label), add the missing mapping in this story (one-line addition; existing tests cover regression).

#### `src/actions/auth.ts::loginAction` (small extension)

Read `callbackUrl` from formData after successful sign-in. Same-origin guard, then redirect.

```ts
// Replace the trailing redirect('/') with:
const callbackUrl = formData.get('callbackUrl');
const safeCallback =
  typeof callbackUrl === 'string' &&
  callbackUrl.startsWith('/') &&
  !callbackUrl.startsWith('//')
    ? callbackUrl
    : '/';
redirect(safeCallback);
```

Then in `src/app/(public)/login/login-form.tsx` add `<input type="hidden" name="callbackUrl" value={callbackUrl ?? ''} />` and accept the `callbackUrl?: string` prop. In `src/app/(public)/login/page.tsx`, read `searchParams: Promise<{ callbackUrl?: string }>` and pass through.

### File-structure requirements

After this story:

```
deskhive/
├── src/
│   ├── actions/
│   │   ├── auth.ts                              # UPDATED — loginAction reads callbackUrl
│   │   ├── space.ts
│   │   ├── desk.ts
│   │   └── booking.ts                           # NEW
│   ├── app/
│   │   ├── (public)/
│   │   │   ├── login/
│   │   │   │   ├── page.tsx                     # UPDATED — pass callbackUrl
│   │   │   │   └── login-form.tsx               # UPDATED — hidden callbackUrl input
│   │   │   └── register/                        # (unchanged)
│   │   ├── my-bookings/                         # NEW directory
│   │   │   └── page.tsx                         # NEW
│   │   ├── spaces/
│   │   │   └── [id]/
│   │   │       ├── page.tsx                     # UPDATED — render <BookDeskButton>
│   │   │       └── book-desk-button.tsx         # NEW
│   │   └── api/
│   │       └── bookings/                        # NEW directory
│   │           └── route.ts                     # NEW — POST /bookings
│   ├── db/
│   │   └── queries/
│   │       ├── desks.ts                         # UPDATED — add getActiveDeskById
│   │       └── bookings.ts                      # UPDATED — add createBooking + listBookingsForGuest
│   └── lib/
│       └── validation/
│           ├── booking.ts                       # NEW
│           └── booking.test.ts                  # NEW
└── tests/
    └── e2e/
        └── bookings.spec.ts                     # NEW — 3 unauthenticated REST/page tests
```

Files NOT touched:
- `deskhive/src/app/layout.tsx`, `proxy.ts`, header, etc. — unchanged.
- `deskhive/src/db/schema.ts` — schema unchanged.
- All admin pages, admin actions — unchanged.
- All Epic 1 files except `loginAction` (small extension).
- `deskhive/src/lib/db-errors.ts` — unchanged; just consumed.
- `deskhive/src/lib/format.ts` — unchanged; `isPastDate` consumed.
- `deskhive/src/lib/availability.ts` — unchanged; consumed only by US-3.2's read paths.
- `deskhive/src/components/*` — `<StatusBadge>` consumed; if Doc B §7.4 mapping is missing, add inline (no schema change).

### Anti-patterns — explicit DO-NOTs

- ❌ Adding a confirmation modal after submit. Doc B §7.5: "Do not show a modal."
- ❌ Paraphrasing `"This desk is already booked for that date"` or `"Booking date cannot be in the past"`. Verbatim.
- ❌ `.bind(null, deskId, date)` in the form. Use hidden inputs (stable hook identity).
- ❌ Computing `total_price_cents` via JOIN at read time. Snapshot at insert.
- ❌ Writing `payment_status` / `payment_reference`. Stay NULL for Phase 2 forward-compat.
- ❌ Skipping the `isPastDate` check because `<input type="date" min={...}>` "already prevents it". Server-side authoritative; client-side is presentation only.
- ❌ Using `auth.api.getSession` inside the action. Use `requireSession`.
- ❌ Catching the `redirect()` signal in a try/catch. Same redirect-after-try-catch rule from US-1.x.
- ❌ Allowing `callbackUrl` to start with `//` (protocol-relative). Open-redirect risk; same-origin guard required.
- ❌ Rendering Guest B's bookings to Guest A on `/my-bookings`. Filter strictly on `guest_user_id = session.user.id`.
- ❌ Querying with `INNER JOIN` and forgetting to select the joined columns — Drizzle requires `.select({ booking, desk, space })` shape.
- ❌ Pre-DB-call before auth. The auth-fail callback URL is constructed from form-supplied `spaceId` (defended by server-side validation if the user proceeds). No DB query before auth.
- ❌ Adding cancel buttons. US-3.5.
- ❌ Adding admin-side booking views. US-4.x.

### Project structure notes

- `src/actions/booking.ts` joins `auth.ts`, `space.ts`, `desk.ts`. One file per domain.
- `src/app/api/bookings/route.ts` is the first public-Guest-only REST endpoint (US-3.5 / US-3.4 will add more bookings routes).
- `src/app/my-bookings/page.tsx` is the first non-admin authenticated route under the **proxy's matcher**. Wait — the proxy's matcher is `['/admin/:path*', '/api/admin/:path*']`. `/my-bookings` is NOT in the matcher; the page-level `requireSession` is the only gate. **To extend the proxy:** add `/my-bookings` to the matcher in this story. **Decision:** keep the proxy unchanged for now. Page-level `requireSession` already redirects to `/login` for unauthenticated visitors. Adding a proxy entry is purely a fast-path optimization; defer until a clear performance need surfaces.

### Previous story intelligence

- **US-3.1** (`8d7bb48`): public browse + first public REST + first welcome-page replacement.
- **US-3.2** (`1feff2d`): public space detail + first bookings query (read-only) + cards on `/` clickable + cleaner `notFound()` placement + TS narrowing on discriminated unions.
- **`isPgUniqueViolation`** (extracted in US-2.4): consumed for the third time here, this time with constraint `'uniq_active_booking_per_desk_per_date'`.

**Patterns established (replicate, don't deviate):**
- Server Actions for writes; Server Components for reads.
- `useActionState` for per-form error feedback.
- Verbatim PRD strings for user-facing errors.
- camelCase TS field names ↔ snake_case DB columns.
- One feature story → one `feat:` commit.
- `revalidatePath` after every write.
- redirect-AFTER-try-catch.

### Recent commits

```
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

US-3.3 is the tenth `feat:` commit. After it, Epic 3 has US-3.4 / 3.5 still in `backlog`.

### References

- [Source: docs/02-phase1-prd.md#Section 8] — US-3.3 verbatim Gherkin.
- [Source: docs/02-phase1-prd.md#Section 4.3] — FR-B1, FR-B4, FR-B5.
- [Source: docs/02-phase1-prd.md#Section 6.1] — `bookings` schema (incl. payment_* nullable forward-compat).
- [Source: docs/02-phase1-prd.md#Section 6.2] — partial unique index `uniq_active_booking_per_desk_per_date`.
- [Source: docs/02-phase1-prd.md#Section 6.3] — booking state machine (PENDING → CONFIRMED/REJECTED/CANCELLED).
- [Source: docs/02-phase1-prd.md#Section 6.4] — `POST /bookings` endpoint (Guest access).
- [Source: docs/02-phase1-prd.md#Section 7.4] — status badge visual rules.
- [Source: docs/02-phase1-prd.md#Section 7.5] — redirect-to-/my-bookings + no-modal rule.
- [Source: docs/02-phase1-prd.md#Section 7.6] — booking date cannot be in the past.
- [Source: _bmad-output/implementation-artifacts/2-4-edit-desk.md] — `isPgUniqueViolation` helper available.
- [Source: _bmad-output/implementation-artifacts/3-2-view-space-detail.md] — `<BookDeskButton>` replaces the inert button; `parseDateParam`/`isPastDate` consumed.
- [Source: deskhive/AGENTS.md] — Next.js 16 caveats.

## Dev Agent Record

### Agent Model Used

Claude Opus 4.7 (1M context) — invoked via `bmad-dev-story` skill on 2026-05-06 in speed mode.

### Debug Log References

| Step | Notable output |
|---|---|
| `pnpm typecheck` | One mid-execution fix needed (see Completion Notes #1); clean after |
| `pnpm lint` | Clean |
| `pnpm test` | 95/95 pass + 1 skipped — added 5 new `createBookingSchema` tests |
| `pnpm build` | 21 routes (added `/api/bookings`, `/my-bookings`); proxy still attached |
| `pnpm test:e2e` | 25/25 pass in 8.5s — added 3 new bookings tests (REST 401, /my-bookings redirect, malformed body) |

### Completion Notes List

**Story executed end-to-end. Stop bar (booking creation flow + minimal /my-bookings + login callback) achieved structurally.** All 95 unit + 25 E2E tests pass. Browser-interactive verification on BA's plate.

**One mid-execution correction:**

1. **`booking.status` typed as `string`, not `BookingStatus`.** Drizzle infers `text(...)` columns as plain `string`; the `CHECK (status IN ('PENDING','CONFIRMED','REJECTED','CANCELLED'))` constraint guarantees the enum at runtime, but TS doesn't know. `<StatusBadge>` expects `BookingStatus`. Fixed with a boundary cast (`booking.status as BookingStatus`) in `/my-bookings/page.tsx`. Anti-pattern note for future stories: the same cast applies wherever a Drizzle-inferred `text` column with a CHECK enum gets passed to a strongly-typed prop. **Architectural alternative for Phase 2:** swap `text(...)` for Drizzle's `pgEnum(...)` at the schema layer so the type narrows automatically. Out of scope for US-3.3.

**Key implementation observations:**

2. **`<StatusBadge>` already matched Doc B §7.4 perfectly** — the four-enum mapping with the right colors and capitalized labels was scaffolded in US-0.2. No component changes needed.

3. **Hidden inputs over `.bind()`** — all three hidden inputs (`spaceId`, `deskId`, `bookingDate`) work cleanly with `useActionState`. The action reference stays stable across re-renders (different desks / different selected dates all use the same bound action). Per-form `useActionState` per desk row gives clean error scoping.

4. **`spaceId` from form for callback URL** worked exactly as planned. Even if the hidden input is tampered, the worst case is a 404 on the callback redirect — security-equivalent to a wrong manual URL.

5. **Login callbackUrl with same-origin guard.** `startsWith('/') && !startsWith('//')` covers protocol-relative attacks (`//evil.com`) AND absolute URLs (`https://evil.com`) AND empty strings. Three lines in `loginAction`; one hidden input in `LoginForm`; one searchParams read in the login page. Self-contained.

6. **`isPgUniqueViolation` consumed for the third time** with constraint name `'uniq_active_booking_per_desk_per_date'`. The extraction in US-2.4 is paying off.

7. **`payment_status` / `payment_reference` stay NULL** — Drizzle defaults omitted columns to NULL, so just not including them in the insert values is enough. Doc B §6.1 forward-compat preserved.

8. **`/my-bookings` empty state matches the planned verbatim string** (`"You don't have any bookings yet."`). Empty state + loaded state + error state all wired through `<DataView>`. No cancel button (US-3.5).

9. **Booking action's pre-existence checks use `getActiveDeskById` and `getPublishedSpaceById`** — both filter to "live" rows only. A deactivated desk OR a suspended space → user-facing `DESK_NOT_FOUND` ("This desk is not available."). The user doesn't need the distinction.

10. **`session.user.id`** — Better Auth typed it as `string`; explicit `String(session.user.id)` cast applied for safety in case future Better Auth versions change the typing. No runtime difference in the happy path.

**Browser-interactive verifications still on BA's plate (Task 12):**
- Register / login a Guest, open `/spaces/<id>?date=<future-iso>` → Available badges + enabled buttons.
- Click Book → redirected to `/my-bookings` → row visible + Pending badge.
- Click Book on same desk+date → inline `"This desk is already booked for that date"`.
- Click Book on a different desk → success.
- Logged out: open `/spaces/<id>` with date selected, click Book → `/login?callbackUrl=...`. Log in → returned to space detail.
- DevTools: `POST /api/bookings` matrix (no-session 401, Super Admin 403, past date 400 + verbatim, double-booked 409 + verbatim).
- Cancel a booking via direct DB UPDATE (`status='CANCELLED'`) → re-book same desk+date → success (validates AC-4).

### File List

All paths relative to repo root.

**NEW (8 files):**
- `deskhive/src/lib/validation/booking.ts` — `createBookingSchema`
- `deskhive/src/lib/validation/booking.test.ts` — 5 schema tests
- `deskhive/src/actions/booking.ts` — `createBookingAction` Server Action
- `deskhive/src/app/api/bookings/route.ts` — `POST /bookings` REST endpoint
- `deskhive/src/app/spaces/[id]/book-desk-button.tsx` — Client Component (form + useActionState)
- `deskhive/src/app/my-bookings/page.tsx` — minimal `/my-bookings` Server Component
- `deskhive/tests/e2e/bookings.spec.ts` — 3 unauthenticated tests

**UPDATED (6 files):**
- `deskhive/src/db/queries/desks.ts` — added `getActiveDeskById`
- `deskhive/src/db/queries/bookings.ts` — added `createBooking` and `listBookingsForGuest` (3-table JOIN)
- `deskhive/src/app/spaces/[id]/page.tsx` — replaced inert button with `<BookDeskButton>`
- `deskhive/src/actions/auth.ts` — `loginAction` reads `callbackUrl` with same-origin guard
- `deskhive/src/app/(public)/login/page.tsx` — async `searchParams`; passes `callbackUrl` to form
- `deskhive/src/app/(public)/login/login-form.tsx` — accepts `callbackUrl` prop; renders hidden input

**NOT TOUCHED (per story anti-patterns):**
- `deskhive/src/db/schema.ts` — schema unchanged
- `deskhive/src/components/status-badge.tsx` — already matched Doc B §7.4
- `deskhive/src/proxy.ts` — `/my-bookings` and `/api/bookings` not in matcher (per-page/per-route guards handle auth)
- `deskhive/src/lib/auth/config.ts`, `guards.ts` — unchanged
- `deskhive/src/lib/db-errors.ts` — consumed; not modified
- `deskhive/src/lib/format.ts`, `availability.ts` — consumed; not modified
- All admin pages, admin actions, admin queries — unchanged
- Other Epic 1 files (register flow) — unchanged

### Change Log

| Date | Change | Commit |
|---|---|---|
| 2026-05-06 | Story drafted by `bmad-create-story`. | (none) |
| 2026-05-06 | US-3.3 implemented; mid-execution `BookingStatus` cast for `<StatusBadge>`; verbatim PRD double-booking + past-date messages; login callbackUrl with same-origin guard; all CI commands green. | `db5819a` |
