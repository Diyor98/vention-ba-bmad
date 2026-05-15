# Story 4.2: Admin Confirm Booking

Status: review

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a **Super Admin**,
I want **to confirm a PENDING booking by clicking "Confirm" on its row in `/admin/bookings`**,
so that **the Guest knows their reservation is secured.**

> Verbatim from Document B §8 (US-4.2). FR-AB2 (Super Admin confirms a PENDING booking → CONFIRMED).

> **This story sets the template for US-4.3 (Reject).** Both are admin-side state transitions out of PENDING, both use the conditional-UPDATE pattern from US-3.5, both are no-ownership-check (admin acts on any booking). Once US-4.2 lands, US-4.3 is largely a copy with the target state swapped.

## Acceptance Criteria

Verbatim Gherkin from Document B §8 US-4.2, plus implementation-shaped ACs:

1. **AC-1 (Super Admin confirms a pending booking).**
   ```gherkin
   Given a booking exists with status PENDING
   And I am logged in as Super Admin
   When I click "Confirm" on that booking
   Then the booking status becomes CONFIRMED
   And when the Guest reloads /my-bookings, they see status badge "Confirmed"
   ```
   **Note on the cross-user reload clause:** `/my-bookings` is dynamic (reads `headers()` via `requireSession`) — there's no shared cache between users. The Guest's reload always queries fresh. The action's `revalidatePath('/my-bookings')` is belt-and-suspenders; the dynamic-render guarantee is the actual mechanism.

2. **AC-2 (Cannot confirm a non-pending booking — 409 with verbatim message).**
   ```gherkin
   Given a booking is in status CANCELLED
   When the Super Admin sends POST /admin/bookings/:id/confirm
   Then the request is rejected with HTTP 409
   And the status remains CANCELLED
   ```
   **Verbatim message** for both the Server Action's `state.message` AND the REST 409 body's `error`: `"Only pending bookings can be confirmed."` (mirrors US-3.5's `"Only pending bookings can be cancelled."`; consistent pattern across admin transitions).

3. **AC-3 (Architecture-shaped error response — Server Action).** `idle` | `error.UNAUTHORIZED` (handled via redirect to `/login`, not state) | `error.FORBIDDEN` (Guest tries — verbatim `"Only super admins can confirm bookings."`) | `error.NOT_FOUND` (bogus booking id) | `error.CANNOT_CONFIRM` (booking exists but status ≠ PENDING — verbatim `"Only pending bookings can be confirmed."`) | `error.INTERNAL_ERROR`.

4. **AC-4 (Architecture-shaped error response — REST `POST /admin/bookings/:id/confirm`).** Status codes: 200 / 401 / 403 / 404 / 409 / 500. 409 body's `error` is the verbatim `"Only pending bookings can be confirmed."` with code `CANNOT_CONFIRM`. 200 body is the updated booking row.

5. **AC-5 (Conditional-UPDATE pattern — same architecture mandate as US-3.5).** The `confirmBooking` query helper performs a single SQL UPDATE with WHERE clauses on `id` AND `status='PENDING'`. **No ownership clause** (admin acts on any booking; that's the difference from `cancelBooking`'s three-clause WHERE). `.returning()` returns the row on success; `undefined` when zero rows match (concurrent transition or pre-flight mismatch). **No SELECT-then-UPDATE.**

6. **AC-6 (`/admin/bookings` Confirm button — only on PENDING rows).** When `booking.status === 'PENDING'`, render a `<ConfirmBookingButton bookingId={booking.id} />` Client Component on the right side of the row, between the price and the status badge. For other statuses, render nothing in that slot. The button:
   - Submits a `<form action={confirmBookingAction}>` with a hidden `bookingId` input.
   - Disabled-on-submit via `useFormStatus().pending` (label: `Confirm` / `Confirming…`).
   - Inline error rendering BELOW the button (small red paragraph) — same shape as US-3.5's `<CancelBookingButton>`.

7. **AC-7 (`revalidatePath` after confirm).** Action calls `revalidatePath('/admin/bookings')` AND `revalidatePath('/my-bookings')`. **No `revalidatePath('/spaces/${spaceId}')`** because confirming a PENDING booking doesn't change desk availability — the partial unique index covers `IN ('PENDING','CONFIRMED')`, so the desk was already reserved. (Contrast with cancel/reject, which DO need spaces revalidation because they free the desk.)

8. **AC-8 (Submit-button disable-on-submit).** (Doc B §7.5.) `useFormStatus().pending` → `Confirm` / `Confirming…`.

9. **AC-9 (Stop bar — confirm flow works end-to-end).**
   - Logged-in Super Admin on `/admin/bookings` sees Confirm buttons on PENDING rows. Click → row's status badge flips to `Confirmed`; the button disappears.
   - Same row at any other status (CONFIRMED, REJECTED, CANCELLED) shows NO Confirm button. DevTools `POST /api/admin/bookings/<id>/confirm` against any of those → 409 + verbatim message.
   - Logged-in as Guest, DevTools `POST /api/admin/bookings/<any-id>/confirm` → 403 + `"Only super admins can confirm bookings."` (FORBIDDEN). Booking remains in its current state.
   - Guest reloads `/my-bookings` after their PENDING was confirmed → row's badge now shows `Confirmed`.

10. **AC-10 (Single commit).** `feat: admin confirm booking (US-4.2)`. Commit content under `deskhive/`.

## Tasks / Subtasks

- [x] **Task 0 — Prep.** Verify all CI commands from US-4.1 (`559011c`) still pass. No DB migrations.

- [x] **Task 1 — Bookings query (extension)** — `src/db/queries/bookings.ts`:
  - **`confirmBooking(id: string): Promise<Booking | undefined>`** — conditional UPDATE:
    - SQL: `UPDATE bookings SET status='CONFIRMED', updated_at=NOW() WHERE id=:id AND status='PENDING' RETURNING *`
    - Drizzle: `db.update(bookingsTable).set({ status: 'CONFIRMED', updatedAt: new Date() }).where(and(eq(id), eq(status, 'PENDING'))).returning()`
    - Returns the row on success; `undefined` when zero rows match.
  - **No ownership clause** (admin acts on any booking — that's the difference from `cancelBooking`).

- [x] **Task 2 — Confirm Booking Server Action** — extend `src/actions/booking.ts`:
  - `ConfirmBookingActionState` discriminated union (see AC-3).
  - Reads `bookingId` from FormData hidden input; UUID-format check inline (mirror cancel's `UUID_RE`).
  - **Auth flow:**
    - `requireSession()` + `requireRole('SUPER_ADMIN')`. (Distinct from cancel's GUEST role.)
    - On 401: `redirect('/login?callbackUrl=/admin/bookings')`.
    - On 403 (Guest tries via tampered DevTools): `{ status: 'error', code: 'FORBIDDEN', message: 'Only super admins can confirm bookings.' }`.
  - **Pre-checks:**
    - `getBookingById(bookingId)` → undefined → `NOT_FOUND` (`"Booking not found."`).
    - **No `requireOwnership`** — admin acts on any booking.
    - If `booking.status !== 'PENDING'` → `{ status: 'error', code: 'CANNOT_CONFIRM', message: 'Only pending bookings can be confirmed.' }`.
  - **Conditional UPDATE:**
    - `confirmBooking(bookingId)`. If `undefined` (race — Guest cancel landed concurrently between pre-check and UPDATE): same `CANNOT_CONFIRM` response.
  - **Success:**
    - `revalidatePath('/admin/bookings')` AND `revalidatePath('/my-bookings')`.
    - Return `{ status: 'idle' }` (no redirect — Super Admin stays on the admin bookings list).

- [x] **Task 3 — `POST /admin/bookings/:id/confirm` REST endpoint** — `src/app/api/admin/bookings/[id]/confirm/route.ts`:
  - Mirror the action's contract.
  - Auth: `requireSession()` + `requireRole('SUPER_ADMIN')` → `apiError('UNAUTHORIZED', ..., 401)` / `('FORBIDDEN', 'Only super admins can confirm bookings.', 403)`.
  - Pre-checks: `getBookingById` → 404. Status check → 409 with verbatim message.
  - Conditional UPDATE → on `undefined`, return same 409 + verbatim message.
  - On success: 200 + the updated booking row.

- [x] **Task 4 — `<ConfirmBookingButton>` Client Component** — `src/app/admin/bookings/confirm-booking-button.tsx`:
  - `'use client'`.
  - Props: `{ bookingId: string }`.
  - `useActionState(confirmBookingAction, initialState)`.
  - Hidden `bookingId` input + small button. **Visual style:** primary button (gray-900 background, white text) — distinct from US-3.5's outlined Cancel button. Submit label: `Confirm` / `Confirming…`.
  - Inline error rendering: `<div className="flex flex-col items-end gap-1">…</div>` — same shape as `<CancelBookingButton>`.

- [x] **Task 5 — Integrate Confirm button on `/admin/bookings`** — modify `src/app/admin/bookings/page.tsx`:
  - Conditionally render `<ConfirmBookingButton bookingId={booking.id} />` between the price and the status badge ONLY when `booking.status === 'PENDING'`.
  - Other statuses: render nothing in that slot.
  - **Note for US-4.3:** US-4.3's Reject button will render in the same conditional slot (alongside Confirm — both available on PENDING). Layout will need a small flex wrapper to accommodate both. For US-4.2, just the Confirm button.

- [x] **Task 6 — E2E tests** — extend `tests/e2e/admin-bookings.spec.ts`:
  - `unauthenticated POST /api/admin/bookings/<bogus>/confirm returns 401` — standard pattern.
  - **DB-dependent happy-path E2E (login as SA, confirm a PENDING, verify status flip; attempt to confirm a CANCELLED → expect 409; Guest attempt → expect 403) DEFERRED** to the Postgres-in-CI story.

- [x] **Task 7 — Local CI parity:**
  - `pnpm typecheck` clean
  - `pnpm lint` clean
  - `pnpm test` — 95 prior pass; no new unit tests (no new schemas / pure helpers; behavior is DB-dependent).
  - `pnpm build` — successful, +1 route (`/api/admin/bookings/[id]/confirm`)
  - `pnpm test:e2e` — at least 30 tests pass (existing 29 + 1 new)

- [ ] **Task 8 — Manual verification (BA's eyeball — DEFERRED to BA's review of `review`-state story):**
  - As Super Admin, navigate to `/admin/bookings`. Confirm rows with PENDING status show the `Confirm` button (in addition to the existing badges).
  - Click Confirm on a PENDING row → row's badge flips to `Confirmed`; Confirm button disappears (US-4.3 will add Reject in the same slot).
  - Reload as the same Guest who owns that booking → on `/my-bookings`, the row's badge is now `Confirmed`.
  - DevTools matrix:
    - `POST /api/admin/bookings/<CONFIRMED-id>/confirm` from SA → 409 + `"Only pending bookings can be confirmed."`.
    - `POST /api/admin/bookings/<CANCELLED-id>/confirm` from SA → 409 + same message.
    - `POST /api/admin/bookings/<PENDING-id>/confirm` from no-session → 401.
    - Same as Guest → 403 + `"Only super admins can confirm bookings."`.
    - Bogus id → 404.
  - Race scenario (optional): with two terminals, simultaneously: Guest cancels their own booking (clicks Cancel) AND Super Admin confirms (clicks Confirm). The first transaction wins; the second sees its conditional UPDATE return 0 rows and surfaces 409.

- [x] **Task 9 — Single commit (AC-10)** — `feat: admin confirm booking (US-4.2)`.

## Dev Notes

### What gets built and what's deliberately out of scope

This is the **second story of Epic 4**. After it lands:
- Super Admins can confirm PENDING bookings end-to-end.
- The `POST /admin/bookings/:id/confirm` REST endpoint exists per Doc B §6.4.
- The conditional-UPDATE pattern is now wired up for the second admin transition (after US-3.5's cancel). US-4.3 uses the same shape for Reject.

Feature scope (US-4.2 only):
- ✅ `confirmBookingAction` Server Action
- ✅ `POST /admin/bookings/:id/confirm` REST endpoint
- ✅ `<ConfirmBookingButton>` Client Component on `/admin/bookings` PENDING rows
- ✅ Conditional-UPDATE `confirmBooking` query helper
- ✅ Verbatim error messages: FORBIDDEN (`"Only super admins can confirm bookings."`) and CANNOT_CONFIRM (`"Only pending bookings can be confirmed."`)

Out of scope for US-4.2 (do NOT build):
- ❌ Reject button (US-4.3 owns it).
- ❌ Email notification to Guest. Phase 2.
- ❌ Audit log of who-confirmed-what / when. Phase 2.
- ❌ Confirmation modal ("Are you sure?"). Doc B §7.5 forbids modals; same principle.
- ❌ Bulk confirm. Phase 2.
- ❌ Undo confirmation. Doc B §6.3 state machine: CONFIRMED is a terminal-ish state (only Phase 2 may add CONFIRMED → REFUNDED via Stripe).
- ❌ Reverting from CONFIRMED back to PENDING. Not in §6.3.
- ❌ Filters / search / sort on `/admin/bookings`. Phase 2.
- ❌ Touching `payment_status` / `payment_reference`. Stay NULL.

### Key decisions

1. **Conditional-UPDATE pattern, no ownership clause.** Admin acts on ANY booking — that's the architectural difference from `cancelBooking`. The WHERE has only `id` and `status='PENDING'`. Same race-safety property: two concurrent transitions can't both succeed; the loser sees its UPDATE return 0 rows and the caller maps that to 409.

2. **Pre-check + conditional UPDATE both run.** Same justification as US-3.5: pre-check classifies errors (404 vs 409); conditional UPDATE protects against races. The action's pre-check fires first and returns 409 if the row's status is already CONFIRMED/REJECTED/CANCELLED. The UPDATE catches the race window where a concurrent Guest cancel landed between the pre-check and the UPDATE.

3. **Verbatim PRD-style error messages.** Both surfaced in Server Action `state.message` AND REST 403/409 body's `error`:
   - `"Only super admins can confirm bookings."` (FORBIDDEN, Guest tries via tampered DevTools)
   - `"Only pending bookings can be confirmed."` (CANNOT_CONFIRM, wrong source state)
   The PRD Gherkin doesn't specify these exact strings, so they're our chosen wording — but **once chosen, they're verbatim across action + REST**. US-4.3 will use the analogous `"Only pending bookings can be rejected."` and `"Only super admins can reject bookings."`.

4. **No spaces revalidation on confirm.** Confirming PENDING → CONFIRMED keeps the row in the partial unique index's covered set, so the desk's availability for that date is unchanged. Skipping `revalidatePath('/spaces/${spaceId}')` saves cost. Cancel and Reject DO need it (they remove the row from the active set, freeing the desk).

5. **No redirect after success.** Same as US-3.5 — admin stays on `/admin/bookings`; revalidation re-renders the list with the new badge and the Confirm button gone.

6. **Confirm button only renders for PENDING.** Conditional render. Anti-pattern: rendering a disabled button for non-PENDING (would be misleading; the action would 409 if clicked anyway).

7. **`<ConfirmBookingButton>` styled as primary button** (gray-900 background, white text — same as the original "Book this desk" button). **`<CancelBookingButton>` from US-3.5 is outlined** (border-only, no fill). Visual hierarchy: Confirm is the affirmative action (heavy weight); Cancel is the negative action (lighter weight). Designer can refine in reskin; for Phase 1 this is a sensible default.

8. **Three named state-transition helpers, not one generic.** `cancelBooking`, `confirmBooking`, `rejectBooking` (the last lands in US-4.3). Each is ~10 lines of Drizzle. A generic `transitionPendingBooking(id, target, options)` helper would compress 30 lines into 15, but at the cost of clarity at call sites. Anti-pattern: don't extract preemptively. If a 4th transition lands in Phase 2, revisit.

9. **No new validation file.** UUID check is a one-line regex at the top of the action — same as US-3.5's cancel.

10. **Race-condition: Guest cancels at the same moment SA confirms.** The Guest's `cancelBooking` and the admin's `confirmBooking` both have `WHERE status='PENDING'`. Whichever transaction commits first wins. The loser's UPDATE returns 0 rows. If the Guest's cancel wins, the SA's action returns CANNOT_CONFIRM (the booking is now CANCELLED, not PENDING). If the SA's confirm wins, the Guest's cancel returns CANNOT_CANCEL. Both errors surface verbatim and accurate. Documented in Task 8's optional race scenario.

### Architecture compliance

- Validation: minimal (UUID check at boundary). No Zod schema file.
- Form pattern: native `<form action={serverAction}>` + `useActionState` + `useFormStatus`.
- State management: per-form `useActionState` only.
- Component library: none. Raw Tailwind.
- Authorization: layout-level guard for the page; per-action `requireSession`+`requireRole('SUPER_ADMIN')`. **No `requireOwnership`** (admin scope).
- Error response shape (action): `{ status: 'error', code, message }`.
- Status codes (REST): 200 / 401 / 403 / 404 / 409 / 500.
- Auth API: `requireSession` + `requireRole` only.
- Reskinnable frontend: literal Tailwind utilities only.

### Code sketches

#### `src/db/queries/bookings.ts` (extension)

```ts
/**
 * Conditional UPDATE: confirms a PENDING booking. Admin scope — no ownership
 * clause. Returns the updated row on success; `undefined` when the row is no
 * longer PENDING (race against Guest cancel) or doesn't exist.
 *
 * Architecture §"Booking state-machine race safety": same conditional-UPDATE
 * shape as cancelBooking, minus the guest_user_id clause. US-4.3's
 * rejectBooking will be identical with target state REJECTED.
 */
export async function confirmBooking(
  id: string,
): Promise<Booking | undefined> {
  const [row] = await db
    .update(bookingsTable)
    .set({ status: 'CONFIRMED', updatedAt: new Date() })
    .where(
      and(
        eq(bookingsTable.id, id),
        eq(bookingsTable.status, 'PENDING'),
      ),
    )
    .returning();
  return row;
}
```

#### `src/actions/booking.ts` (extension)

```ts
import { confirmBooking } from '@/db/queries/bookings';

export type ConfirmBookingActionState =
  | { status: 'idle' }
  | { status: 'error'; code: 'FORBIDDEN'; message: string }
  | { status: 'error'; code: 'NOT_FOUND'; message: string }
  | { status: 'error'; code: 'CANNOT_CONFIRM'; message: string }
  | { status: 'error'; code: 'INTERNAL_ERROR'; message: string };

export async function confirmBookingAction(
  _prevState: ConfirmBookingActionState,
  formData: FormData,
): Promise<ConfirmBookingActionState> {
  const bookingId = String(formData.get('bookingId') ?? '');
  if (!UUID_RE.test(bookingId)) {
    return { status: 'error', code: 'NOT_FOUND', message: 'Booking not found.' };
  }

  // Auth: 401 → /login redirect; 403 (Guest tries) → state.
  try {
    const session = await requireSession();
    requireRole(session, 'SUPER_ADMIN');
  } catch (err) {
    if (err instanceof AuthError) {
      const status = err.response.status;
      if (status === 401) redirect('/login?callbackUrl=/admin/bookings');
      if (status === 403) {
        return {
          status: 'error',
          code: 'FORBIDDEN',
          message: 'Only super admins can confirm bookings.',
        };
      }
    }
    logger.error('confirm_booking_action_auth_failed', { error: String(err) });
    return { status: 'error', code: 'INTERNAL_ERROR', message: 'Something went wrong.' };
  }

  // Pre-checks (no ownership — admin scope)
  const booking = await getBookingById(bookingId);
  if (!booking) {
    return { status: 'error', code: 'NOT_FOUND', message: 'Booking not found.' };
  }
  if (booking.status !== 'PENDING') {
    return {
      status: 'error',
      code: 'CANNOT_CONFIRM',
      message: 'Only pending bookings can be confirmed.',
    };
  }

  // Conditional UPDATE — race-safe against concurrent Guest cancel
  let result: ConfirmBookingActionState | null = null;
  try {
    const updated = await confirmBooking(bookingId);
    if (!updated) {
      result = {
        status: 'error',
        code: 'CANNOT_CONFIRM',
        message: 'Only pending bookings can be confirmed.',
      };
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error('confirm_booking_action_db_failed', { error: msg });
    result = {
      status: 'error',
      code: 'INTERNAL_ERROR',
      message: 'Something went wrong. Please try again.',
    };
  }
  if (result) return result;

  revalidatePath('/admin/bookings');
  revalidatePath('/my-bookings');
  return { status: 'idle' };
}
```

#### `src/app/api/admin/bookings/[id]/confirm/route.ts` (NEW)

```ts
import { requireSession, requireRole, AuthError } from '@/lib/auth/guards';
import { getBookingById, confirmBooking } from '@/db/queries/bookings';
import { apiError, apiNotFound } from '@/lib/http';
import { logger } from '@/lib/logger';

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;

  try {
    const session = await requireSession();
    requireRole(session, 'SUPER_ADMIN');
  } catch (err) {
    if (err instanceof AuthError) {
      // requireRole's apiForbidden default message — override with our verbatim:
      if (err.response.status === 403) {
        return apiError(
          'FORBIDDEN',
          'Only super admins can confirm bookings.',
          403,
        );
      }
      return err.response;
    }
    return apiError('INTERNAL_ERROR', 'Something went wrong', 500);
  }

  const booking = await getBookingById(id);
  if (!booking) return apiNotFound('Booking not found');

  if (booking.status !== 'PENDING') {
    return apiError(
      'CANNOT_CONFIRM',
      'Only pending bookings can be confirmed.',
      409,
    );
  }

  try {
    const updated = await confirmBooking(id);
    if (!updated) {
      return apiError(
        'CANNOT_CONFIRM',
        'Only pending bookings can be confirmed.',
        409,
      );
    }
    return Response.json(updated, { status: 200 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error('confirm_booking_route_db_failed', { error: msg });
    return apiError('INTERNAL_ERROR', 'Something went wrong', 500);
  }
}
```

#### `src/app/admin/bookings/confirm-booking-button.tsx` (NEW)

```tsx
'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import {
  confirmBookingAction,
  type ConfirmBookingActionState,
} from '@/actions/booking';

const initialState: ConfirmBookingActionState = { status: 'idle' };

export function ConfirmBookingButton({ bookingId }: { bookingId: string }) {
  const [state, formAction] = useActionState(confirmBookingAction, initialState);
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
      className="rounded bg-gray-900 px-3 py-1 text-xs font-medium text-white disabled:opacity-50"
    >
      {pending ? 'Confirming…' : 'Confirm'}
    </button>
  );
}
```

#### `src/app/admin/bookings/page.tsx` (modification)

Inside the `<li>`'s flex row, between the price and the `<StatusBadge>`:

```tsx
{(booking.status as BookingStatus) === 'PENDING' && (
  <ConfirmBookingButton bookingId={booking.id} />
)}
```

Import `<ConfirmBookingButton>` from `./confirm-booking-button`. **Note for US-4.3:** the slot will accommodate two buttons (Confirm + Reject) once that story lands.

### File-structure requirements

After this story:

```
deskhive/
├── src/
│   ├── actions/
│   │   └── booking.ts                         # UPDATED — add confirmBookingAction
│   ├── app/
│   │   ├── admin/
│   │   │   └── bookings/
│   │   │       ├── page.tsx                   # UPDATED — render ConfirmBookingButton on PENDING rows
│   │   │       └── confirm-booking-button.tsx # NEW
│   │   └── api/
│   │       └── admin/
│   │           └── bookings/
│   │               ├── route.ts               # (US-4.1 — GET; unchanged)
│   │               └── [id]/                  # NEW directory
│   │                   └── confirm/
│   │                       └── route.ts       # NEW
│   └── db/
│       └── queries/
│           └── bookings.ts                    # UPDATED — add confirmBooking
└── tests/
    └── e2e/
        └── admin-bookings.spec.ts             # UPDATED — add 1 new 401 test
```

Files NOT touched:
- `deskhive/src/db/schema.ts` — schema unchanged.
- `deskhive/src/lib/auth/guards.ts` — `requireSession` + `requireRole` consumed.
- `deskhive/src/proxy.ts` — `/api/admin/bookings/[id]/confirm` covered by existing matcher.
- `deskhive/src/app/admin/layout.tsx` — sub-nav from US-4.1 unchanged.
- `deskhive/src/components/status-badge.tsx`, `data-view.tsx` — unchanged.
- `deskhive/src/lib/format.ts`, `db-errors.ts` — unchanged.
- All Epic 1 / 2 / 3 files except `src/db/queries/bookings.ts` and `src/actions/booking.ts`.

### Anti-patterns — explicit DO-NOTs

- ❌ Unconditional UPDATE. State-machine clause required.
- ❌ SELECT-then-UPDATE without conditional clause. Pre-check classifies; UPDATE protects races.
- ❌ Adding `requireOwnership`. Admin acts on any booking — ownership doesn't apply.
- ❌ Allowing Guests to confirm. Confirm is a Super Admin-only state transition.
- ❌ Paraphrasing the verbatim error messages.
- ❌ Showing a Confirm button on non-PENDING rows. Conditional render only.
- ❌ Adding `revalidatePath('/spaces/${spaceId}')`. Confirm doesn't change desk availability.
- ❌ Adding a confirmation modal.
- ❌ Reverting CONFIRMED back to PENDING. Not in Doc B §6.3.
- ❌ Touching `payment_status` / `payment_reference`.
- ❌ Catching `redirect()` inside try/catch.
- ❌ Pre-extracting a generic `transitionPendingBooking` helper. Three named helpers (cancel + confirm + reject) is clearer; revisit if a 4th transition lands.

### Project structure notes

- `src/app/api/admin/bookings/[id]/confirm/route.ts` is the second admin-resource action endpoint (after `/api/admin/desks/[id]` PUT from US-2.4). Pattern: `[id]/<verb>/route.ts` for state-transition verbs.
- `confirmBookingAction` joins `cancelBookingAction` and `createBookingAction` in `src/actions/booking.ts`. Three actions in one domain file; each ~70 lines; total still manageable.
- `confirmBooking` joins `cancelBooking` in `src/db/queries/bookings.ts`. US-4.3 adds the third (`rejectBooking`).
- `src/app/admin/bookings/confirm-booking-button.tsx` parallels `src/app/my-bookings/cancel-booking-button.tsx`. **Future opportunity:** if Reject (US-4.3) introduces a third near-identical button, consider extracting a generic `<BookingActionButton>`. For US-4.2, keep the standalone component.

### Previous story intelligence

- **US-3.5** (`8be46e7`): introduced the conditional-UPDATE state-machine pattern + first `requireOwnership` use. `cancelBooking` is the template this story copies-and-adapts (drop ownership; flip target state).
- **US-4.1** (`559011c`): `/admin/bookings` list page + `GET /admin/bookings` REST + admin sub-nav. This story layers Confirm onto the existing list page.

**Patterns established (replicate, don't deviate):**
- Conditional UPDATE for state-machine transitions (architecture mandate).
- Pre-check + conditional UPDATE both run.
- Verbatim PRD-aligned error strings.
- Layout-level guard handles auth on `/admin/*` pages.
- Per-form `useActionState` with hidden inputs (no `.bind`).
- One feature story → one `feat:` commit.
- `revalidatePath` for ALL surfaces affected by the write (here: `/admin/bookings` + `/my-bookings`; NOT `/spaces/[id]` because availability doesn't change).

### Recent commits

```
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

US-4.2 is the fourteenth `feat:` commit. After it, only US-4.3 remains in Epic 4.

### References

- [Source: docs/02-phase1-prd.md#Section 8] — US-4.2 verbatim Gherkin.
- [Source: docs/02-phase1-prd.md#Section 4.4] — FR-AB2.
- [Source: docs/02-phase1-prd.md#Section 6.1] — `bookings` schema.
- [Source: docs/02-phase1-prd.md#Section 6.3] — booking state machine (PENDING → CONFIRMED valid for Super Admin).
- [Source: docs/02-phase1-prd.md#Section 6.4] — `POST /admin/bookings/:id/confirm` endpoint.
- [Source: _bmad-output/planning-artifacts/architecture.md#Booking state-machine race safety] — conditional-UPDATE pattern is mandatory for all transitions.
- [Source: _bmad-output/implementation-artifacts/3-5-cancel-pending-booking.md] — analog template (cancel pattern); this story copies-and-adapts.
- [Source: _bmad-output/implementation-artifacts/4-1-admin-view-all-bookings.md] — `/admin/bookings` list page consumed; layout pattern.
- [Source: deskhive/AGENTS.md] — Next.js 16 caveats.

## Dev Agent Record

### Agent Model Used

Claude Opus 4.7 (1M context) — invoked via `bmad-dev-story` skill on 2026-05-07 in speed mode.

### Debug Log References

| Step | Notable output |
|---|---|
| `pnpm typecheck` | Clean |
| `pnpm lint` | Clean |
| `pnpm test` | 95/95 pass + 1 skipped — no new unit tests |
| `pnpm build` | 26 routes (added `/api/admin/bookings/[id]/confirm`) |
| `pnpm test:e2e` | 30/30 pass in 14.8s — added 1 new `POST /api/admin/bookings/:id/confirm` 401 test |

### Completion Notes List

**Story executed end-to-end. Stop bar (admin Confirm flow + button on PENDING rows) achieved structurally.** All 95 unit + 30 E2E tests pass. Browser-interactive verification on BA's plate.

**No mid-execution corrections.** US-3.5 was the template; US-4.2 copied-and-adapted (drop ownership clause, flip target state, change role gate). Patterns landed cleanly first try.

**Key implementation observations:**

1. **`confirmBooking` is `cancelBooking` minus the third WHERE clause.** The architectural difference between Guest-scoped and admin-scoped state transitions: admin doesn't have an ownership column. US-4.3's `rejectBooking` will be the third sibling, identical to `confirmBooking` with target REJECTED.

2. **Verbatim error messages aligned with cancel's pattern.** `"Only super admins can confirm bookings."` and `"Only pending bookings can be confirmed."` — chosen wording, then locked across action and REST. US-4.3 will use the analogous reject strings.

3. **`apiError` 403 message override.** REST handler's auth catch block has a special case for 403: override `apiForbidden`'s default message with our verbatim US-4.2 wording. 401 falls through with the default `"Authentication required"`. Same pattern repeats in US-4.3.

4. **No `/spaces/[id]` revalidation on confirm.** PENDING → CONFIRMED keeps the row in the partial unique index's covered set; desk availability is unchanged. Cancel and Reject DO need spaces revalidation; Confirm doesn't. Documented in anti-patterns.

5. **Visual treatment: filled gray-900 button.** Distinct from US-3.5's outlined Cancel button. US-4.3's Reject will need a third visual variant.

6. **Conditional render slot now holds Confirm.** US-4.3 will add Reject in the same slot; layout adjustment may be needed.

7. **Race scenario validated by code review.** Two `WHERE status='PENDING'` clauses (one in cancel, one in confirm) collide on the actual row; whichever transaction commits first wins; the loser's UPDATE returns 0 rows; both error responses surface correct verbatim messages.

**Browser-interactive verifications still on BA's plate (Task 8):**
- Click Confirm on a PENDING row → badge flips to `Confirmed`, button disappears
- Reload as the Guest who owned that booking → `/my-bookings` shows `Confirmed`
- DevTools matrix: 401 / 403 (Guest with verbatim) / 404 / 409 (CANCELLED-id) / 409 (CONFIRMED-id)
- Optional race scenario with two terminals

### File List

All paths relative to repo root.

**NEW (2 files):**
- `deskhive/src/app/api/admin/bookings/[id]/confirm/route.ts` — `POST /admin/bookings/:id/confirm` REST endpoint
- `deskhive/src/app/admin/bookings/confirm-booking-button.tsx` — Client Component (filled gray-900 style)

**UPDATED (4 files):**
- `deskhive/src/db/queries/bookings.ts` — added `confirmBooking` (conditional UPDATE, no ownership clause)
- `deskhive/src/actions/booking.ts` — added `confirmBookingAction` + state type + import
- `deskhive/src/app/admin/bookings/page.tsx` — conditional `<ConfirmBookingButton>` render on PENDING rows
- `deskhive/tests/e2e/admin-bookings.spec.ts` — added `POST /api/admin/bookings/:id/confirm returns 401` test

**NOT TOUCHED:**
- Schema, guards, proxy, layout, primitives — all unchanged
- All Epic 1 / 2 / 3 files (except booking action and queries that this story extends)
- US-4.1 files unchanged

### Change Log

| Date | Change | Commit |
|---|---|---|
| 2026-05-07 | Story drafted by `bmad-create-story`. | (none) |
| 2026-05-07 | US-4.2 implemented; admin Confirm + conditional UPDATE without ownership; verbatim error messages; all CI commands green. | `1180df6` |
