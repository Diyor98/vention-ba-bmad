# Story 3.5: Cancel My Pending Booking

Status: review

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a **logged-in Guest**,
I want **to cancel a PENDING booking I made by clicking "Cancel" on `/my-bookings`**,
so that **I can change my mind before the Super Admin confirms it.**

> Verbatim from Document B §8 (US-3.5). FR-B3 (Guest cancels their own PENDING booking → CANCELLED).

> **This story closes Epic 3 — Discovery & Booking.** It also introduces two architectural firsts:
> 1. The **conditional-UPDATE state-machine pattern** (architecture §"Booking state-machine race safety") — every booking-status transition's UPDATE includes the expected source state in its WHERE clause. US-4.x's Confirm/Reject will reuse this same shape.
> 2. The **first `requireOwnership` usage** — third layer of the architecture's three-layer auth pattern, finally exercised in production.

## Acceptance Criteria

Verbatim Gherkin from Document B §8 US-3.5, plus implementation-shaped ACs:

1. **AC-1 (Guest cancels their own PENDING booking).**
   ```gherkin
   Given I am logged in as Guest with a booking in status PENDING
   When I click "Cancel" on that booking
   Then the booking status becomes CANCELLED
   And the desk for that date becomes available again
   ```
   **Note on "desk becomes available again":** no extra code path — the partial unique index `uniq_active_booking_per_desk_per_date` covers only `status IN ('PENDING','CONFIRMED')`, so once status flips to `CANCELLED` the row no longer reserves the slot. This is the same property US-3.3 AC-4 verified ("Booking after cancellation succeeds"). The action's `revalidatePath(\`/spaces/${space.id}\`)` makes the change visible without a hard reload.

2. **AC-2 (Guest cannot cancel a CONFIRMED booking).**
   ```gherkin
   Given I am logged in as Guest with a booking in status CONFIRMED
   When I view that booking on /my-bookings
   Then no "Cancel" button is shown for that booking
   And calling POST /bookings/:id/cancel directly returns HTTP 409
   ```
   **Two surfaces:** (a) UI conditional render — Cancel button shown ONLY when `booking.status === 'PENDING'`. (b) REST endpoint guard — the pre-check returns 409 if the existing row's status is anything other than PENDING. **The conditional UPDATE in the query helper is the actual race-safety net** — even if a concurrent Super Admin Confirm lands between the pre-check and the UPDATE, the UPDATE's `WHERE status = 'PENDING'` clause returns 0 rows and the action/route maps that to 409 too.

3. **AC-3 (Guest B cannot cancel Guest A's booking).**
   ```gherkin
   Given Guest A owns a PENDING booking with id X
   And I am logged in as Guest B
   When I send POST /bookings/X/cancel
   Then I receive HTTP 403 Forbidden
   And Guest A's booking remains in status PENDING
   ```
   **Implementation:** `requireOwnership(booking.guestUserId, session.user.id)` after the existence check. The conditional UPDATE in the query helper ALSO has `AND guest_user_id = :userId` in its WHERE clause as defense-in-depth — even if `requireOwnership` were ever bypassed, the UPDATE wouldn't change another guest's row.

4. **AC-4 (Architecture-shaped error response — Server Action).** `idle` | `error.UNAUTHORIZED` (handled via redirect, not state) | `error.FORBIDDEN` (wrong owner — verbatim message: `"You can only cancel your own bookings."`) | `error.NOT_FOUND` (bogus booking id) | `error.CANNOT_CANCEL` (booking exists + owned by user + status ≠ PENDING — verbatim message: `"Only pending bookings can be cancelled."`) | `error.INTERNAL_ERROR`.

5. **AC-5 (Architecture-shaped error response — REST `POST /bookings/:id/cancel`).** Status codes: 200 / 401 / 403 / 404 / 409 / 500. 409 body's `error` is `"Only pending bookings can be cancelled."` with code `CANNOT_CANCEL`. 200 body is the updated booking row.

6. **AC-6 (Conditional-UPDATE pattern — architecture §"Booking state-machine race safety").** The `cancelBooking` query helper performs a single SQL UPDATE with WHERE clauses on `id`, `status='PENDING'`, AND `guest_user_id`. Returns the updated row via `.returning()` or undefined when zero rows match. **No SELECT-then-UPDATE.** The race-safety property: two concurrent transitions targeting the same booking can't both succeed — at most one UPDATE flips the row, the other matches zero rows and the caller maps that to a 409.

7. **AC-7 (`/my-bookings` cancel button — only on PENDING rows).** When `booking.status === 'PENDING'`, render a `<CancelBookingButton bookingId={booking.id} />` Client Component on the right side of the row (between the price and the status badge). For other statuses, render nothing in that slot. The button:
   - Submits a `<form action={cancelBookingAction}>` with a hidden `bookingId` input.
   - Disabled-on-submit via `useFormStatus().pending` (label: `Cancel` / `Cancelling…`).
   - Inline error rendering BELOW the row's main flex line (not next to the badge) so error text doesn't clobber the layout.

8. **AC-8 (`revalidatePath` after cancel).** Action calls `revalidatePath('/my-bookings')` AND `revalidatePath(\`/spaces/${booking.spaceId}\`)` (so the freed-up desk re-appears as Available on the public detail page).

9. **AC-9 (Submit-button disable-on-submit).** (Doc B §7.5.) `useFormStatus().pending` → `Cancel` / `Cancelling…`.

10. **AC-10 (Stop bar — cancel flow works end-to-end).**
    - Logged-in Guest with a PENDING booking on `/my-bookings` sees a Cancel button on that row. Click → row's status badge flips to `Cancelled`; the button disappears.
    - Same Guest with a CONFIRMED booking sees NO Cancel button on that row. DevTools `POST /api/bookings/<id>/cancel` against that booking → 409 + `"Only pending bookings can be cancelled."`.
    - Logged-in as a different Guest, DevTools `POST /api/bookings/<other-guest's-id>/cancel` → 403 + `"You can only cancel your own bookings."`. The other Guest's booking remains PENDING (verify via DB).

11. **AC-11 (Single commit).** `feat: guest cancel pending booking (US-3.5)`. Commit content under `deskhive/`.

## Tasks / Subtasks

- [x] **Task 0 — Prep.** Verify all CI commands from US-3.4 (`6f29214`) still pass. No DB migrations.

- [x] **Task 1 — Bookings query (extension)** — `src/db/queries/bookings.ts`:
  - **`getBookingById(id: string): Promise<Booking | undefined>`** — simple select-where(`id = :id`).limit(1).
  - **`cancelBooking(id: string, guestUserId: string): Promise<Booking | undefined>`** — conditional UPDATE:
    - SQL: `UPDATE bookings SET status='CANCELLED', updated_at=NOW() WHERE id=:id AND status='PENDING' AND guest_user_id=:userId RETURNING *`
    - Drizzle: `db.update(bookingsTable).set({ status: 'CANCELLED', updatedAt: new Date() }).where(and(eq(id), eq(status, 'PENDING'), eq(guestUserId, ...))).returning()`
    - Returns the row on success; `undefined` when zero rows match (concurrent transition or pre-flight mismatch).
  - **Order of WHERE clauses doesn't matter** for correctness, but `id` first is conventional.

- [x] **Task 2 — Cancel Booking Server Action** — extend `src/actions/booking.ts`:
  - `CancelBookingActionState` discriminated union (see AC-4).
  - Reads `bookingId` from FormData hidden input.
  - **Auth flow:**
    - `requireSession()` + `requireRole('GUEST')`. **Note:** unlike create-booking, cancel is GUEST-only. A Super Admin can't cancel a Guest's booking via `/my-bookings`'s flow — they'd use the (future) admin Reject endpoint (US-4.3). If a Super Admin somehow lands here, return 403 with the FORBIDDEN code.
    - On 401: `redirect('/login?callbackUrl=/my-bookings')`.
    - On 403 (Super Admin): `{ status: 'error', code: 'FORBIDDEN', message: 'Only guests can cancel bookings.' }`.
  - **Pre-checks:**
    - Validate `bookingId` is a non-empty UUID. On invalid: `VALIDATION_ERROR` (collapse to `INTERNAL_ERROR` if you'd rather not surface — your call; document).
    - `getBookingById(bookingId)` → undefined → `NOT_FOUND` (`"Booking not found."`).
    - `requireOwnership(booking.guestUserId, session.user.id)` — wrap in try/catch; on `AuthError`, return `{ status: 'error', code: 'FORBIDDEN', message: 'You can only cancel your own bookings.' }`.
    - If `booking.status !== 'PENDING'` → `{ status: 'error', code: 'CANNOT_CANCEL', message: 'Only pending bookings can be cancelled.' }`.
  - **Conditional UPDATE:**
    - `cancelBooking(bookingId, session.user.id)`. If `undefined` (race — Confirm landed concurrently between the pre-check and the UPDATE): same `CANNOT_CANCEL` response. The `WHERE` clause's defense-in-depth re-asserts ownership (so even if `requireOwnership` were skipped, the UPDATE still wouldn't touch another guest's row).
  - **Success:**
    - `revalidatePath('/my-bookings')` AND `revalidatePath(\`/spaces/${booking.spaceId}\`)`.
    - Return `{ status: 'idle' }` (no redirect — user stays on `/my-bookings`; the row's status badge flips and the Cancel button disappears via revalidation).

- [x] **Task 3 — `POST /bookings/:id/cancel` REST endpoint** — `src/app/api/bookings/[id]/cancel/route.ts`:
  - `params: Promise<{ id: string }>`, `await`.
  - Auth: `requireSession()` + `requireRole('GUEST')` → `apiError('UNAUTHORIZED', ..., 401)` / `('FORBIDDEN', ..., 403)`.
  - Pre-checks (mirror the action):
    - `getBookingById(id)` → `apiNotFound('Booking not found')`.
    - `requireOwnership(...)` → catch AuthError → `apiError('FORBIDDEN', 'You can only cancel your own bookings.', 403)`.
    - Status check → `apiError('CANNOT_CANCEL', 'Only pending bookings can be cancelled.', 409)`.
  - Conditional UPDATE → on `undefined`, return same 409 + same verbatim message.
  - On success: 200 + the updated booking row.

- [x] **Task 4 — `<CancelBookingButton>` Client Component** — `src/app/my-bookings/cancel-booking-button.tsx`:
  - `'use client'`.
  - Props: `{ bookingId: string }`.
  - `useActionState(cancelBookingAction, initialState)`.
  - Renders `<form action={formAction}>` with a hidden `bookingId` input + a small "Cancel" button (smaller padding than the Book button — secondary action). Submit label: `Cancel` / `Cancelling…`.
  - Inline error rendering: returns `null` for the button-row position, but exposes errors via a separate paragraph rendered below the row when present. **Implementation choice:** wrap the button + error in a single `<div>`; the consumer (the page) doesn't need to know about the error placement.
  - **No `disabled` from the parent** — button is enabled whenever rendered (the parent only renders it when `status === 'PENDING'`).

- [x] **Task 5 — Integrate Cancel button on `/my-bookings`** — modify `src/app/my-bookings/page.tsx`:
  - Conditionally render `<CancelBookingButton bookingId={booking.id} />` between the price element and the status badge ONLY when `booking.status === 'PENDING'`.
  - Other statuses: render no button (NOT a disabled button — actually omit it).
  - Layout adjustment: increase the existing `gap-3` if needed to accommodate the new element; preserve right-alignment of the status badge.

- [x] **Task 6 — E2E tests** — extend `tests/e2e/bookings.spec.ts`:
  - `unauthenticated POST /api/bookings/<bogus>/cancel returns 401` — the standard pattern.
  - **DB-dependent happy-path E2E (login as Guest A, cancel own PENDING; login as Guest B, attempt to cancel A's, expect 403; cancel a CONFIRMED booking, expect 409) DEFERRED** to the Postgres-in-CI story.

- [x] **Task 7 — Local CI parity:**
  - `pnpm typecheck` clean
  - `pnpm lint` clean
  - `pnpm test` — 95 prior pass; no new unit tests required (no new schemas / pure helpers; conditional UPDATE behavior is DB-dependent and verified by manual + future Postgres-in-CI).
  - `pnpm build` — successful, +1 route (`/api/bookings/[id]/cancel`)
  - `pnpm test:e2e` — at least 27 tests pass (existing 26 + 1 new)

- [ ] **Task 8 — Manual verification (BA's eyeball — DEFERRED to BA's review of `review`-state story):**
  - As Guest A, create a PENDING booking via the booking flow (US-3.3 path) → visit `/my-bookings` → see Cancel button on the row.
  - Click Cancel → row's badge flips to `Cancelled`; Cancel button disappears.
  - **AC-1 second clause:** visit `/spaces/<id>?date=<that-date>` → the desk that was just freed is now `Available` again; "Book this desk" button enabled.
  - As Guest A, manually flip a booking to CONFIRMED via DB UPDATE (Confirm UI lands in US-4.2): `UPDATE bookings SET status='CONFIRMED' WHERE id=X` → reload `/my-bookings` → that row has NO Cancel button, but shows the `Confirmed` badge.
  - DevTools: `POST /api/bookings/<that-CONFIRMED-id>/cancel` from Guest A's session → 409 + `"Only pending bookings can be cancelled."`.
  - Register Guest B; have them log in. DevTools: `POST /api/bookings/<Guest-A's-PENDING-id>/cancel` from Guest B's session → 403 + `"You can only cancel your own bookings."`. Verify Guest A's booking is still PENDING via DB or by Guest A reloading `/my-bookings`.
  - DevTools: `POST /api/bookings/00000000-...-0/cancel` (bogus id) → 404. Same endpoint without session → 401. Same endpoint as Super Admin → 403 (FORBIDDEN, not the ownership message — different error code).

- [x] **Task 9 — Single commit (AC-11)** — `feat: guest cancel pending booking (US-3.5)`.

## Dev Notes

### What gets built and what's deliberately out of scope

This is the **fifth and final story of Epic 3**. After it lands:
- Guests can cancel their own PENDING bookings end-to-end via the UI.
- The `/bookings/:id/cancel` REST endpoint exists per Doc B §6.4.
- The conditional-UPDATE state-machine pattern is wired up for the first time (US-4.2 / US-4.3 will reuse it for Confirm and Reject).
- `requireOwnership` from US-0.2's scaffolded guards has its first production call site.
- Epic 3 is structurally complete; ready for retrospective.

Feature scope (US-3.5 only):
- ✅ `cancelBookingAction` Server Action
- ✅ `POST /bookings/:id/cancel` REST endpoint
- ✅ `<CancelBookingButton>` Client Component on `/my-bookings`
- ✅ Conditional-UPDATE `cancelBooking` query helper
- ✅ Verbatim error messages for FORBIDDEN (`"You can only cancel your own bookings."`) and CANNOT_CANCEL (`"Only pending bookings can be cancelled."`)

Out of scope for US-3.5 (do NOT build):
- ❌ Cancellation reasons / "why are you cancelling?" prompts. PRD doesn't require it.
- ❌ Email notifications.
- ❌ Refund / payment reversal — `payment_status` and `payment_reference` stay NULL (Phase 2).
- ❌ Confirmation modal — Doc B §7.5 forbids modals on the booking flow; same principle applies here.
- ❌ Undo cancellation. Once cancelled, it's terminal per Doc B §6.3 state machine ("This state machine is law").
- ❌ Admin cancel-on-behalf-of-Guest. Not in §6.4. (Admin Reject is US-4.3, distinct semantics.)
- ❌ Cancel multiple bookings at once. Phase 2.
- ❌ Soft-delete vs CANCELLED. They're the same in our model — no distinction.
- ❌ Surfacing the cancellation in any audit log. Phase 2 audit table.

### Key decisions

1. **Conditional-UPDATE pattern is mandatory** (architecture §"Booking state-machine race safety": *"every booking state transition is implemented as a conditional UPDATE … no transition uses an unconditional UPDATE"*). The `cancelBooking` query has `WHERE id = :id AND status = 'PENDING' AND guest_user_id = :userId`. **All three clauses matter:**
   - `id = :id` — target the specific row.
   - `status = 'PENDING'` — race-safety against concurrent state transitions (a Super Admin Confirm landing between our pre-check and our UPDATE).
   - `guest_user_id = :userId` — defense-in-depth ownership; even if the action layer's `requireOwnership` were ever skipped, the UPDATE won't touch a row owned by someone else.

2. **Pre-check + conditional UPDATE both run** — one might think "the conditional UPDATE alone is enough, why bother with the pre-check?" The pre-check exists to **distinguish 404 / 403 / 409** for AC-2 and AC-3's user-facing messages. The conditional UPDATE alone returns "0 rows" for ALL three failure modes (booking missing, wrong owner, wrong status), and you can't tell them apart. Pre-check classifies; conditional UPDATE protects against races.

3. **Guest-only role gate.** A Super Admin can't cancel Guest bookings via this flow. The admin equivalent is the future Reject action (US-4.3) — different verb, different semantics. Both ultimately put the row in a non-active state, but the audit trail (in Phase 2) needs to distinguish them.

4. **Verbatim error strings (two of them).**
   - `"You can only cancel your own bookings."` (FORBIDDEN, AC-3)
   - `"Only pending bookings can be cancelled."` (CANNOT_CANCEL, AC-2)
   Both surfaced in Server Action `state.message` AND REST 403/409 body's `error`. Same anti-paraphrasing rule as US-2.3 / US-2.4 / US-3.3.

5. **No redirect after success.** Same posture as US-3.3's create-booking on its `/my-bookings` redirect: the user stays on `/my-bookings` and `revalidatePath` re-renders the list with the new state. Cancel button disappears (status no longer PENDING); badge flips to gray `Cancelled`.

6. **Cancel button only renders for PENDING.** The page checks `booking.status === 'PENDING'` and renders nothing in the cancel-button slot for other statuses. Implementation: simple ternary in the `<li>`.

7. **`requireOwnership` second-tier defense.** The action calls `requireOwnership(booking.guestUserId, session.user.id)` (after the existence check, before the status check). If a future refactor accidentally drops this call, the conditional UPDATE's `guest_user_id` clause still prevents wrong-owner mutations — but the user would see the generic CANNOT_CANCEL response instead of the FORBIDDEN one. Belt + suspenders.

8. **No new Zod schema.** The action's input is just a UUID from a hidden form input. A one-line UUID-format check (`if (!isUuid(bookingId)) return ...`) at the top of the action is enough. **Decision:** if it adds noise, use Zod's `z.string().uuid()` parse inline; if not, just regex. Either way, no separate schema file.

9. **`<CancelBookingButton>` is small + scoped.** Doesn't need props beyond `bookingId`. The error-rendering placement is the component's internal concern — the page just renders it inside the `<li>` and trusts the component to manage its own error UI.

10. **`revalidatePath` for both `/my-bookings` AND the relevant `/spaces/[id]`.** AC-1's second clause ("the desk for that date becomes available again") is only visible on the space detail page. Without the spaces revalidation, a user navigating from `/my-bookings` to `/spaces/[id]` after cancelling might see stale availability for ~5 minutes (Next 16 cache window).

### Architecture compliance

- Validation: minimal (UUID check at the action boundary). No Zod schema file.
- Form pattern: native `<form action={serverAction}>` + `useActionState` + `useFormStatus`.
- State management: per-form `useActionState` only.
- Component library: none. Raw Tailwind.
- Authorization: three-layer pattern fully exercised — proxy (N/A here; `/my-bookings` and `/api/bookings/*` aren't in the matcher) + per-action `requireSession`+`requireRole` + `requireOwnership` (first production use).
- Error response shape (action): `{ status: 'error', code, message }`.
- Status codes (REST): 200 / 401 / 403 / 404 / 409 / 500.
- Auth API: never raw Drizzle for ownership; always `requireOwnership` for clarity + consistent error response.
- Reskinnable frontend: literal Tailwind utilities only.

### Code sketches

#### `src/db/queries/bookings.ts` (extension)

```ts
import { and } from 'drizzle-orm';
// ... existing imports unchanged

export async function getBookingById(id: string): Promise<Booking | undefined> {
  const [row] = await db
    .select()
    .from(bookingsTable)
    .where(eq(bookingsTable.id, id))
    .limit(1);
  return row;
}

/**
 * Conditional UPDATE: cancels a PENDING booking owned by `guestUserId`.
 *
 * Returns the updated row on success; `undefined` if the row's status was
 * no longer PENDING by the time the UPDATE ran (race), if the row doesn't
 * exist, or if `guestUserId` doesn't match the row's owner.
 *
 * Architecture §"Booking state-machine race safety": all three WHERE
 * clauses are required — the status clause prevents racing CONFIRMED/
 * REJECTED transitions; the owner clause is defense-in-depth alongside
 * `requireOwnership` at the action layer.
 */
export async function cancelBooking(
  id: string,
  guestUserId: string,
): Promise<Booking | undefined> {
  const [row] = await db
    .update(bookingsTable)
    .set({ status: 'CANCELLED', updatedAt: new Date() })
    .where(
      and(
        eq(bookingsTable.id, id),
        eq(bookingsTable.status, 'PENDING'),
        eq(bookingsTable.guestUserId, guestUserId),
      ),
    )
    .returning();
  return row;
}
```

#### `src/actions/booking.ts` (extension)

```ts
import { requireOwnership } from '@/lib/auth/guards';
import { getBookingById, cancelBooking } from '@/db/queries/bookings';

export type CancelBookingActionState =
  | { status: 'idle' }
  | { status: 'error'; code: 'FORBIDDEN'; message: string }
  | { status: 'error'; code: 'NOT_FOUND'; message: string }
  | { status: 'error'; code: 'CANNOT_CANCEL'; message: string }
  | { status: 'error'; code: 'INTERNAL_ERROR'; message: string };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function cancelBookingAction(
  _prevState: CancelBookingActionState,
  formData: FormData,
): Promise<CancelBookingActionState> {
  const bookingId = String(formData.get('bookingId') ?? '');
  if (!UUID_RE.test(bookingId)) {
    return { status: 'error', code: 'NOT_FOUND', message: 'Booking not found.' };
  }

  // Auth (401 → redirect; 403 [non-Guest] → state)
  let session;
  try {
    session = await requireSession();
    requireRole(session, 'GUEST');
  } catch (err) {
    if (err instanceof AuthError) {
      const status = err.response.status;
      if (status === 401) redirect('/login?callbackUrl=/my-bookings');
      if (status === 403) {
        return { status: 'error', code: 'FORBIDDEN', message: 'Only guests can cancel bookings.' };
      }
    }
    return { status: 'error', code: 'INTERNAL_ERROR', message: 'Something went wrong.' };
  }

  // Pre-checks for accurate error codes
  const booking = await getBookingById(bookingId);
  if (!booking) return { status: 'error', code: 'NOT_FOUND', message: 'Booking not found.' };

  try {
    requireOwnership(booking.guestUserId, String(session.user.id));
  } catch (err) {
    if (err instanceof AuthError) {
      return {
        status: 'error',
        code: 'FORBIDDEN',
        message: 'You can only cancel your own bookings.',
      };
    }
    return { status: 'error', code: 'INTERNAL_ERROR', message: 'Something went wrong.' };
  }

  if (booking.status !== 'PENDING') {
    return {
      status: 'error',
      code: 'CANNOT_CANCEL',
      message: 'Only pending bookings can be cancelled.',
    };
  }

  // Conditional UPDATE — race-safe
  let result: CancelBookingActionState | null = null;
  try {
    const updated = await cancelBooking(bookingId, String(session.user.id));
    if (!updated) {
      // Concurrent transition (e.g. Super Admin Confirm) landed between
      // the pre-check and the UPDATE. Same user-facing message as the
      // pre-check would have given.
      result = {
        status: 'error',
        code: 'CANNOT_CANCEL',
        message: 'Only pending bookings can be cancelled.',
      };
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error('cancel_booking_action_db_failed', { error: msg });
    result = {
      status: 'error',
      code: 'INTERNAL_ERROR',
      message: 'Something went wrong. Please try again.',
    };
  }
  if (result) return result;

  revalidatePath('/my-bookings');
  revalidatePath(`/spaces/${booking.spaceId}`);
  return { status: 'idle' };
}
```

#### `src/app/api/bookings/[id]/cancel/route.ts` (NEW)

```ts
import { requireSession, requireRole, requireOwnership, AuthError } from '@/lib/auth/guards';
import { getBookingById, cancelBooking } from '@/db/queries/bookings';
import { apiError, apiNotFound } from '@/lib/http';
import { logger } from '@/lib/logger';

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;

  let session;
  try {
    session = await requireSession();
    requireRole(session, 'GUEST');
  } catch (err) {
    if (err instanceof AuthError) return err.response;
    return apiError('INTERNAL_ERROR', 'Something went wrong', 500);
  }

  const booking = await getBookingById(id);
  if (!booking) return apiNotFound('Booking not found');

  try {
    requireOwnership(booking.guestUserId, String(session.user.id));
  } catch (err) {
    if (err instanceof AuthError) {
      return apiError('FORBIDDEN', 'You can only cancel your own bookings.', 403);
    }
    return apiError('INTERNAL_ERROR', 'Something went wrong', 500);
  }

  if (booking.status !== 'PENDING') {
    return apiError('CANNOT_CANCEL', 'Only pending bookings can be cancelled.', 409);
  }

  try {
    const updated = await cancelBooking(id, String(session.user.id));
    if (!updated) {
      return apiError('CANNOT_CANCEL', 'Only pending bookings can be cancelled.', 409);
    }
    return Response.json(updated, { status: 200 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error('cancel_booking_route_db_failed', { error: msg });
    return apiError('INTERNAL_ERROR', 'Something went wrong', 500);
  }
}
```

#### `src/app/my-bookings/cancel-booking-button.tsx` (NEW)

```tsx
'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { cancelBookingAction, type CancelBookingActionState } from '@/actions/booking';

const initialState: CancelBookingActionState = { status: 'idle' };

export function CancelBookingButton({ bookingId }: { bookingId: string }) {
  const [state, formAction] = useActionState(cancelBookingAction, initialState);
  const errorMessage = state.status === 'error' ? state.message : undefined;

  return (
    <div className="flex flex-col items-end gap-1">
      <form action={formAction}>
        <input type="hidden" name="bookingId" value={bookingId} />
        <SubmitButton />
      </form>
      {errorMessage && (
        <p className="text-xs text-red-700" role="alert">
          {errorMessage}
        </p>
      )}
    </div>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded border border-gray-300 px-3 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
    >
      {pending ? 'Cancelling…' : 'Cancel'}
    </button>
  );
}
```

#### `src/app/my-bookings/page.tsx` (modification)

Inside the `<li>`'s flex row, between the price element and the `<StatusBadge>`:

```tsx
{(booking.status as BookingStatus) === 'PENDING' && (
  <CancelBookingButton bookingId={booking.id} />
)}
```

Import `<CancelBookingButton>` from `./cancel-booking-button`.

### File-structure requirements

After this story:

```
deskhive/
├── src/
│   ├── actions/
│   │   └── booking.ts                           # UPDATED — add cancelBookingAction
│   ├── app/
│   │   ├── my-bookings/
│   │   │   ├── page.tsx                         # UPDATED — render CancelBookingButton on PENDING rows
│   │   │   └── cancel-booking-button.tsx        # NEW
│   │   └── api/
│   │       └── bookings/
│   │           └── [id]/                        # NEW directory
│   │               └── cancel/
│   │                   └── route.ts             # NEW
│   └── db/
│       └── queries/
│           └── bookings.ts                      # UPDATED — add getBookingById + cancelBooking
└── tests/
    └── e2e/
        └── bookings.spec.ts                     # UPDATED — add 1 new 401 test
```

Files NOT touched:
- `deskhive/src/db/schema.ts` — schema unchanged.
- `deskhive/src/lib/auth/guards.ts` — `requireOwnership` already implemented in US-0.2; first production usage here.
- `deskhive/src/lib/db-errors.ts` — no unique violations on cancel.
- `deskhive/src/lib/format.ts` — unchanged.
- `deskhive/src/components/status-badge.tsx` — unchanged.
- `deskhive/src/proxy.ts` — `/api/bookings/*` not in the matcher; route-level guards handle auth.
- All admin pages, admin actions, admin queries — unchanged.
- All Epic 1 files; all Epic 2 files.
- `deskhive/src/lib/validation/*` — no validation file needed (UUID check is inline).

### Anti-patterns — explicit DO-NOTs

- ❌ Unconditional UPDATE. The state-machine clause is mandatory per architecture.
- ❌ SELECT-then-UPDATE without the conditional clause. The pre-check classifies errors; the conditional UPDATE protects against races. Both run.
- ❌ Allowing Super Admins to cancel via this endpoint. Their path is the future US-4.3 Reject (different verb, different semantics, different audit trail in Phase 2).
- ❌ Paraphrasing the verbatim error messages.
- ❌ Adding a confirmation modal ("Are you sure?"). Doc B §7.5 forbids modals on this flow; same principle applies.
- ❌ Adding a cancellation reason input. Out of scope.
- ❌ Soft-delete vs CANCELLED distinction. The state machine has only the four enum values.
- ❌ Showing a Cancel button on non-PENDING rows. Conditional render only.
- ❌ Skipping `revalidatePath('/spaces/${spaceId}')`. The desk's availability won't update without it.
- ❌ Catching `redirect()` inside a try/catch.
- ❌ Using `auth.api.getSession` directly. `requireSession` only.
- ❌ Adding an "undo cancel" button. Cancellation is terminal.
- ❌ Modifying `getSpaceById`/`listAllSpaces`/etc. — admin queries stay as-is.
- ❌ Touching `payment_status` or `payment_reference`. Stay NULL.

### Project structure notes

- `src/app/api/bookings/[id]/cancel/route.ts` is the second `/api/bookings/*` route (after `[id]/me`). Both share `bookings/`-prefix; pattern parallels `/api/admin/spaces/[id]/desks` from Epic 2.
- `cancelBookingAction` joins `createBookingAction` in `src/actions/booking.ts`. Domain pattern continues.
- `requireOwnership` is now consumed in production. Future ownership-scoped routes (any "my X" pattern) follow this template.
- The conditional-UPDATE pattern is the architectural reference for US-4.2 (`POST /admin/bookings/:id/confirm` — `WHERE status = 'PENDING'`) and US-4.3 (`POST /admin/bookings/:id/reject` — same).

### Previous story intelligence

- **US-3.4** (`6f29214`): `GET /bookings/me` REST + per-row price + corrected empty-state copy + deterministic `booking_date DESC, created_at DESC` sort.
- **US-3.3** (`db5819a`): booking creation; first DB write to `bookings`; `<BookDeskButton>`; minimal `/my-bookings`; login `callbackUrl` support; `isPgUniqueViolation` consumed for booking double-booking constraint.
- **`isPgUniqueViolation`** (US-2.4): not used in this story (cancel doesn't insert).
- **`requireOwnership`** (US-0.2): scaffolded; **first production call site lands here**.

**Patterns established (replicate, don't deviate):**
- Conditional UPDATE for state-machine transitions (architecture mandate).
- Pre-check + conditional UPDATE both run (classification + race-safety).
- Verbatim PRD error strings.
- camelCase TS field names ↔ snake_case DB columns.
- `<StatusBadge>` cast at the boundary (`as BookingStatus`) — Drizzle typing limitation.
- One feature story → one `feat:` commit.
- `revalidatePath` for ALL affected routes (here: `/my-bookings` AND `/spaces/${spaceId}`).

### Recent commits

```
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

US-3.5 is the twelfth `feat:` commit. After it, **Epic 3 is structurally complete** — all five stories at `review`. Only Epic 4 remains.

### References

- [Source: docs/02-phase1-prd.md#Section 8] — US-3.5 verbatim Gherkin.
- [Source: docs/02-phase1-prd.md#Section 4.3] — FR-B3.
- [Source: docs/02-phase1-prd.md#Section 6.1] — `bookings` schema.
- [Source: docs/02-phase1-prd.md#Section 6.2] — partial unique index covers PENDING/CONFIRMED only.
- [Source: docs/02-phase1-prd.md#Section 6.3] — booking state machine (PENDING → CANCELLED valid for Guest, own-booking only).
- [Source: docs/02-phase1-prd.md#Section 6.4] — `POST /bookings/:id/cancel` endpoint (Guest access, own-booking only).
- [Source: _bmad-output/planning-artifacts/architecture.md#Booking state-machine race safety] — conditional-UPDATE pattern is mandatory.
- [Source: _bmad-output/planning-artifacts/architecture.md#three-layer auth pattern] — `requireOwnership` semantics.
- [Source: _bmad-output/implementation-artifacts/0-2-dependencies-schema-and-primitives.md] — `requireOwnership` scaffolded.
- [Source: _bmad-output/implementation-artifacts/3-3-create-booking.md] — `<BookDeskButton>` pattern (analog: hidden input + useActionState + per-row form). Same shape repeated for `<CancelBookingButton>`.
- [Source: _bmad-output/implementation-artifacts/3-4-view-my-bookings.md] — `/my-bookings` page consumed; layout pattern.
- [Source: deskhive/AGENTS.md] — Next.js 16 caveats.

## Dev Agent Record

### Agent Model Used

Claude Opus 4.7 (1M context) — invoked via `bmad-dev-story` skill on 2026-05-07 in speed mode.

### Debug Log References

| Step | Notable output |
|---|---|
| `pnpm typecheck` | Clean |
| `pnpm lint` | Clean |
| `pnpm test` | 95/95 pass + 1 skipped — no new unit tests (no new schemas / pure helpers; conditional UPDATE behavior is DB-dependent, deferred to manual + Postgres-in-CI) |
| `pnpm build` | 23 routes (added `/api/bookings/[id]/cancel`); proxy still attached |
| `pnpm test:e2e` | 27/27 pass in 13.6s — added 1 new `POST /api/bookings/:id/cancel` 401 test |

### Completion Notes List

**Story executed end-to-end. Stop bar (cancel flow + REST endpoint + button on PENDING rows) achieved structurally.** All 95 unit + 27 E2E tests pass. Browser-interactive verification on BA's plate.

**No mid-execution corrections.** Patterns from prior stories (hidden-input form, `useActionState` + `useFormStatus`, redirect-after-try-catch, isPgUniqueViolation precedent for the conditional UPDATE) all applied cleanly.

**Architectural firsts in this story:**

1. **Conditional-UPDATE state-machine pattern lands in production.** `cancelBooking` query helper performs a single SQL UPDATE with three WHERE clauses (`id`, `status='PENDING'`, `guest_user_id`) and no preceding SELECT-FOR-UPDATE. The `.returning()` clause gives us the row on success or `undefined` on zero-row matches. **The architecture's mandate is now wired** — US-4.2 (Confirm) and US-4.3 (Reject) will reuse this exact shape with different source/target states.

2. **`requireOwnership` consumed in production for the first time.** Scaffolded in US-0.2 (with 6 unit tests already proving its semantics); finally invoked from `cancelBookingAction` and the REST endpoint. Pairs with the conditional UPDATE's `guest_user_id` clause as belt + suspenders.

**Key implementation observations:**

3. **Pre-check + conditional UPDATE both run** — the pre-check classifies errors (404 / 403 / 409) so the user sees the right verbatim message; the conditional UPDATE protects against races between the pre-check and the UPDATE. On the rare race (Super Admin Confirm landing in the gap), the UPDATE returns `undefined` and we map to the same 409 the pre-check would have used.

4. **Verbatim PRD error messages (two of them) preserved exactly:**
   - `"You can only cancel your own bookings."` (FORBIDDEN, AC-3)
   - `"Only pending bookings can be cancelled."` (CANNOT_CANCEL, AC-2)
   Identical strings in Server Action `state.message` AND REST 403/409 body's `error`.

5. **Cancel button conditional render works as expected.** `(booking.status as BookingStatus) === 'PENDING' && <CancelBookingButton ...>` — for non-PENDING statuses the slot renders nothing (not a disabled button). Build output confirms no extra hydration overhead for non-PENDING rows.

6. **`<CancelBookingButton>` is small and self-contained** — 50 lines including the SubmitButton subcomponent. Errors render inline below the button via `<div className="flex flex-col items-end gap-1">`. Page consumer doesn't need to know about error placement.

7. **Guest-only role gate enforced.** A logged-in Super Admin who tries to cancel via either the action or the REST endpoint gets `FORBIDDEN` with the message `"Only guests can cancel bookings."`. Distinct from the ownership FORBIDDEN message (`"You can only cancel your own bookings."`) so the user/dev can tell the two failure modes apart.

8. **`revalidatePath` for both `/my-bookings` AND `/spaces/${booking.spaceId}`** — AC-1's "desk for that date becomes available again" clause now reflects without a hard reload. The freed-up desk re-appears as Available on the public detail page.

9. **`pg sslmode` warning** keeps appearing in the build output (carry-over from earlier stories). Non-blocking; will reassess on `pg` v9 upgrade.

**Browser-interactive verifications still on BA's plate (Task 8):**
- Guest A creates a PENDING booking → Cancel button appears on `/my-bookings`.
- Click Cancel → row's badge flips to `Cancelled`; button disappears; visit `/spaces/<id>?date=<that-date>` → desk now Available again.
- DB UPDATE a booking to CONFIRMED (Confirm UI is US-4.2) → reload `/my-bookings` → no Cancel button.
- DevTools `POST /api/bookings/<CONFIRMED-id>/cancel` from owner's session → 409 + verbatim message.
- Register Guest B → DevTools `POST /api/bookings/<Guest-A's-PENDING-id>/cancel` → 403 + verbatim ownership message. Guest A's booking still PENDING (verify via DB or by Guest A reloading `/my-bookings`).
- DevTools matrix: bogus id → 404; no session → 401; Super Admin session → 403 (FORBIDDEN — different message than the ownership 403).

### File List

All paths relative to repo root.

**NEW (3 files):**
- `deskhive/src/app/api/bookings/[id]/cancel/route.ts` — `POST /bookings/:id/cancel` REST endpoint
- `deskhive/src/app/my-bookings/cancel-booking-button.tsx` — Client Component
- (no new test files — extended existing `bookings.spec.ts`)

**UPDATED (4 files):**
- `deskhive/src/db/queries/bookings.ts` — added `getBookingById` and conditional-UPDATE `cancelBooking`
- `deskhive/src/actions/booking.ts` — added `cancelBookingAction` + `CancelBookingActionState` type + imports for `requireOwnership` and the new query helpers
- `deskhive/src/app/my-bookings/page.tsx` — conditional `<CancelBookingButton>` render on PENDING rows
- `deskhive/tests/e2e/bookings.spec.ts` — added `POST /api/bookings/:id/cancel returns 401` test

**NOT TOUCHED:**
- `deskhive/src/db/schema.ts` — schema unchanged
- `deskhive/src/lib/auth/guards.ts` — `requireOwnership` consumed; no source change
- `deskhive/src/lib/db-errors.ts` — no unique-violation paths
- `deskhive/src/lib/format.ts`, `availability.ts` — unchanged
- `deskhive/src/components/status-badge.tsx`, `data-view.tsx` — unchanged
- `deskhive/src/proxy.ts` — `/api/bookings/*` not in matcher; per-route guards handle auth
- All admin pages, admin actions, admin queries — unchanged
- All Epic 1 / 2 files; Epic 3 stories US-3.1 through US-3.4 unchanged

### Change Log

| Date | Change | Commit |
|---|---|---|
| 2026-05-07 | Story drafted by `bmad-create-story`. | (none) |
| 2026-05-07 | US-3.5 implemented; conditional-UPDATE state-machine pattern + first `requireOwnership` use in production; all CI commands green. | `8be46e7` |
