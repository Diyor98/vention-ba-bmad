# Story 4.3: Admin Reject Booking

Status: review

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a **Super Admin**,
I want **to reject a PENDING booking by clicking "Reject" on its row in `/admin/bookings`**,
so that **I can refuse it when needed and free the desk for that date.**

> Verbatim from Document B §8 (US-4.3). FR-AB3 (Super Admin rejects a PENDING booking → REJECTED).

> **THIS STORY CLOSES THE FULL PHASE 1 PRD.** Once it lands at `review`, all 18 stories across Epics 0–4 are structurally complete and the MVP is feature-complete per Document B §8. Only manual verification, optional code reviews, and optional retrospectives remain.

> **Architecturally, this story mirrors US-4.2 with three differences:**
> 1. **Target state is REJECTED** (not CONFIRMED).
> 2. **Affects desk availability** — REJECTED rows drop out of the partial unique index's covered set, so the desk becomes available again. **`revalidatePath('/spaces/${booking.spaceId}')` is mandatory** (in contrast to Confirm, which keeps the desk reserved).
> 3. **Destructive visual treatment** — Reject button is outlined red, distinct from Confirm's filled gray-900 (affirmative) and Cancel's outlined gray (secondary).

## Acceptance Criteria

Verbatim Gherkin from Document B §8 US-4.3, plus implementation-shaped ACs:

1. **AC-1 (Super Admin rejects a pending booking).**
   ```gherkin
   Given a booking exists for Desk-1 on 2026-06-01 with status PENDING
   And I am logged in as Super Admin
   When I click "Reject" on that booking
   Then the booking status becomes REJECTED
   And Desk-1 is again available for booking on 2026-06-01
   ```
   **Note on the desk-availability clause:** no extra code path — the partial unique index `uniq_active_booking_per_desk_per_date` covers only `status IN ('PENDING','CONFIRMED')`, so a REJECTED row no longer reserves the slot. Same property as US-3.5 cancel and US-3.3 AC-4 ("Booking after cancellation succeeds"). The action's `revalidatePath('/spaces/${spaceId}')` makes the change visible without a hard reload.

2. **AC-2 (Cannot reject a non-pending booking — 409 with verbatim message).** Although the PRD Gherkin doesn't explicitly include a "cannot reject" scenario for symmetry with US-4.2 AC-2, the same constraint applies (state machine is law per Doc B §6.3). Implementation:
   - REST: `POST /admin/bookings/:id/reject` against any non-PENDING booking → 409 + `"Only pending bookings can be rejected."` with code `CANNOT_REJECT`.
   - Server Action: same shape, returns `CANNOT_REJECT` state.

3. **AC-3 (Architecture-shaped error response — Server Action).** `idle` | `error.UNAUTHORIZED` (handled via redirect to `/login`, not state) | `error.FORBIDDEN` (Guest tries — verbatim `"Only super admins can reject bookings."`) | `error.NOT_FOUND` (bogus booking id) | `error.CANNOT_REJECT` (booking exists but status ≠ PENDING — verbatim `"Only pending bookings can be rejected."`) | `error.INTERNAL_ERROR`.

4. **AC-4 (Architecture-shaped error response — REST `POST /admin/bookings/:id/reject`).** Status codes: 200 / 401 / 403 / 404 / 409 / 500. 409 body's `error` is the verbatim `"Only pending bookings can be rejected."` with code `CANNOT_REJECT`. 200 body is the updated booking row.

5. **AC-5 (Conditional-UPDATE pattern — same shape as Confirm, different target).** The `rejectBooking` query helper performs a single SQL UPDATE with WHERE clauses on `id` AND `status='PENDING'`. **No ownership clause** (admin scope). Target state: `REJECTED`. `.returning()` returns the row on success; `undefined` when zero rows match. **No SELECT-then-UPDATE.**

6. **AC-6 (`/admin/bookings` Reject button — only on PENDING rows; sits alongside Confirm).** When `booking.status === 'PENDING'`, render BOTH `<ConfirmBookingButton>` (US-4.2) AND `<RejectBookingButton>` (this story) in the same conditional slot. Layout: both buttons inside the row's flex line, side-by-side, between the price and the status badge. For other statuses, neither button renders.

7. **AC-7 (`revalidatePath` after reject — three paths).** Action calls `revalidatePath('/admin/bookings')` AND `revalidatePath('/my-bookings')` AND `revalidatePath('/spaces/${booking.spaceId}')`. **The third one is mandatory** because rejecting a PENDING booking frees up the desk for that date — visible on the public space detail page. (Contrast with Confirm in US-4.2, which doesn't change desk availability and skips spaces revalidation.)

8. **AC-8 (Submit-button disable-on-submit).** (Doc B §7.5.) `useFormStatus().pending` → `Reject` / `Rejecting…`.

9. **AC-9 (Visual treatment — outlined red for destructive intent).** The Reject button uses `border border-red-300 text-red-700 hover:bg-red-50` — outlined, red-toned, distinct from US-4.2's filled-gray Confirm (affirmative) and US-3.5's outlined-gray Cancel (secondary, in a different page context). The red color matches Doc B §7.4's red palette for the REJECTED status badge.

10. **AC-10 (Stop bar — reject flow works end-to-end).**
    - Logged-in Super Admin on `/admin/bookings` sees BOTH `Confirm` and `Reject` buttons on PENDING rows.
    - Click `Reject` → row's status badge flips to `Rejected` (red); both buttons disappear.
    - Visit `/spaces/<id>?date=<that-date>` → the desk that was just rejected is now `Available` again; "Book this desk" button enabled.
    - Same row at any other status (CONFIRMED, REJECTED, CANCELLED) shows neither button. DevTools `POST /api/admin/bookings/<id>/reject` against any of those → 409 + verbatim message.
    - Logged-in as Guest, DevTools `POST /api/admin/bookings/<any-id>/reject` → 403 + `"Only super admins can reject bookings."`. Booking remains in its current state.
    - Guest reloads `/my-bookings` after their PENDING was rejected → row's badge now shows `Rejected` (red).

11. **AC-11 (Single commit).** `feat: admin reject booking (US-4.3)`. Commit content under `deskhive/`.

12. **AC-12 (Phase 1 milestone).** Once this story lands at `review`, sprint-status.yaml shows all 18 stories at `review` (Epic 0: 3/3, Epic 1: 3/3, Epic 2: 4/4, Epic 3: 5/5, Epic 4: 3/3). The dev-story commit message should reference this milestone in the PR description / commit body if the BA wants to flag it; the commit subject stays `feat: admin reject booking (US-4.3)` per the standard pattern.

## Tasks / Subtasks

- [x] **Task 0 — Prep.** Verify all CI commands from US-4.2 (`1180df6`) still pass. No DB migrations.

- [x] **Task 1 — Bookings query (extension)** — `src/db/queries/bookings.ts`:
  - **`rejectBooking(id: string): Promise<Booking | undefined>`** — conditional UPDATE:
    - SQL: `UPDATE bookings SET status='REJECTED', updated_at=NOW() WHERE id=:id AND status='PENDING' RETURNING *`
    - Drizzle: `db.update(bookingsTable).set({ status: 'REJECTED', updatedAt: new Date() }).where(and(eq(id), eq(status, 'PENDING'))).returning()`
    - Returns the row on success; `undefined` when zero rows match.
  - **No ownership clause** (admin scope, same as `confirmBooking`).

- [x] **Task 2 — Reject Booking Server Action** — extend `src/actions/booking.ts`:
  - `RejectBookingActionState` discriminated union (see AC-3).
  - Reads `bookingId` from FormData hidden input; UUID-format check inline (mirror cancel/confirm's `UUID_RE`).
  - **Auth flow:**
    - `requireSession()` + `requireRole('SUPER_ADMIN')`.
    - On 401: `redirect('/login?callbackUrl=/admin/bookings')`.
    - On 403 (Guest tries via tampered DevTools): `{ status: 'error', code: 'FORBIDDEN', message: 'Only super admins can reject bookings.' }`.
  - **Pre-checks:**
    - `getBookingById(bookingId)` → undefined → `NOT_FOUND` (`"Booking not found."`).
    - **No `requireOwnership`** — admin scope.
    - If `booking.status !== 'PENDING'` → `{ status: 'error', code: 'CANNOT_REJECT', message: 'Only pending bookings can be rejected.' }`.
  - **Conditional UPDATE:**
    - `rejectBooking(bookingId)`. If `undefined` (race — Guest cancel or admin Confirm landed concurrently): same `CANNOT_REJECT` response.
  - **Success:**
    - `revalidatePath('/admin/bookings')` AND `revalidatePath('/my-bookings')` AND `revalidatePath(\`/spaces/${booking.spaceId}\`)`.
    - Return `{ status: 'idle' }` (no redirect).

- [x] **Task 3 — `POST /admin/bookings/:id/reject` REST endpoint** — `src/app/api/admin/bookings/[id]/reject/route.ts`:
  - Mirror the action's contract.
  - Auth: `requireSession()` + `requireRole('SUPER_ADMIN')` → `apiError('UNAUTHORIZED', ..., 401)` / on 403 override message to `"Only super admins can reject bookings."` (same pattern as US-4.2's confirm endpoint).
  - Pre-checks: `getBookingById` → 404. Status check → 409 with verbatim message.
  - Conditional UPDATE → on `undefined`, return same 409 + verbatim message.
  - On success: 200 + the updated booking row.

- [x] **Task 4 — `<RejectBookingButton>` Client Component** — `src/app/admin/bookings/reject-booking-button.tsx`:
  - `'use client'`.
  - Props: `{ bookingId: string }`.
  - `useActionState(rejectBookingAction, initialState)`.
  - Hidden `bookingId` input + small button. **Visual style:** outlined red — `border border-red-300 text-red-700 hover:bg-red-50` (destructive intent). Submit label: `Reject` / `Rejecting…`.
  - Inline error rendering: `<div className="flex flex-col items-end gap-1">…</div>` — same shape as Confirm/Cancel.

- [x] **Task 5 — Integrate Reject button on `/admin/bookings`** — modify `src/app/admin/bookings/page.tsx`:
  - In the conditional block that renders `<ConfirmBookingButton>` for PENDING rows, ALSO render `<RejectBookingButton bookingId={booking.id} />` immediately after.
  - Both buttons sit side-by-side in the row's flex line.
  - For non-PENDING rows: render neither button.

- [x] **Task 6 — E2E tests** — extend `tests/e2e/admin-bookings.spec.ts`:
  - `unauthenticated POST /api/admin/bookings/<bogus>/reject returns 401` — standard pattern.
  - **DB-dependent happy-path E2E (login as SA, reject a PENDING, verify status flip + desk re-availability) DEFERRED** to the Postgres-in-CI story.

- [x] **Task 7 — Local CI parity:**
  - `pnpm typecheck` clean
  - `pnpm lint` clean
  - `pnpm test` — 95 prior pass; no new unit tests (no new schemas / pure helpers).
  - `pnpm build` — successful, +1 route (`/api/admin/bookings/[id]/reject`)
  - `pnpm test:e2e` — at least 31 tests pass (existing 30 + 1 new)

- [ ] **Task 8 — Manual verification (BA's eyeball — DEFERRED to BA's review of `review`-state story):**
  - As Super Admin, navigate to `/admin/bookings`. Confirm rows with PENDING status now show BOTH `Confirm` and `Reject` buttons (in addition to the existing badges).
  - Click `Reject` on a PENDING row → row's badge flips to `Rejected` (red); both buttons disappear.
  - **AC-1 second clause:** visit `/spaces/<id>?date=<that-date>` → the desk that was just rejected is `Available` again; "Book this desk" button enabled.
  - Reload as the Guest who owns that booking → on `/my-bookings`, the row's badge shows `Rejected`.
  - DevTools matrix:
    - `POST /api/admin/bookings/<CONFIRMED-id>/reject` from SA → 409 + `"Only pending bookings can be rejected."`.
    - `POST /api/admin/bookings/<CANCELLED-id>/reject` from SA → 409 + same message.
    - `POST /api/admin/bookings/<PENDING-id>/reject` from no-session → 401.
    - Same as Guest → 403 + `"Only super admins can reject bookings."`.
    - Bogus id → 404.
  - Race scenario (optional, three terminals): Guest cancels + SA confirms + SA rejects all simultaneously. The first transaction wins; the other two see their conditional UPDATE return 0 rows and surface 409 with their respective verbatim messages.

- [x] **Task 9 — Single commit (AC-11)** — `feat: admin reject booking (US-4.3)`.

- [x] **Task 10 — Phase 1 milestone marker.** Update `_bmad-output/implementation-artifacts/sprint-status.yaml` to reflect the milestone in `last_updated` field's parenthetical: `"US-4.3 implemented; status → review; **Phase 1 PRD structurally complete** — all 18 stories at review."` Optional: BA may also want to add a top-level note in the YAML or write a short retrospective; **out of scope for this story** — keep the change to the parenthetical only.

## Dev Notes

### What gets built and what's deliberately out of scope

This is the **third and final story of Epic 4** — and the **final feature story of Phase 1**. After it lands:
- Super Admins can reject PENDING bookings end-to-end.
- All four state transitions out of PENDING are wired up:
  - Guest → CANCELLED (US-3.5, with ownership)
  - Admin → CONFIRMED (US-4.2, no ownership)
  - Admin → REJECTED (this story, no ownership)
  - (Future Phase 2) Stripe webhook → REFUNDED (out of scope)
- The conditional-UPDATE state-machine pattern is now applied to all transitions.
- `POST /admin/bookings/:id/reject` REST endpoint exists per Doc B §6.4.
- **All 18 stories of Phase 1 are structurally complete (review).**

Feature scope (US-4.3 only):
- ✅ `rejectBookingAction` Server Action
- ✅ `POST /admin/bookings/:id/reject` REST endpoint
- ✅ `<RejectBookingButton>` Client Component on `/admin/bookings` PENDING rows
- ✅ Conditional-UPDATE `rejectBooking` query helper
- ✅ Verbatim error messages: FORBIDDEN (`"Only super admins can reject bookings."`) and CANNOT_REJECT (`"Only pending bookings can be rejected."`)

Out of scope for US-4.3 (do NOT build):
- ❌ Email notification to Guest. Phase 2.
- ❌ Rejection reason / "why are you rejecting?" prompt. Phase 2.
- ❌ Audit log of who-rejected-what. Phase 2.
- ❌ Confirmation modal. Doc B §7.5 forbids modals; same principle as US-3.5 / US-4.2.
- ❌ Bulk reject. Phase 2.
- ❌ Reverting from REJECTED back to PENDING. Doc B §6.3 state machine: REJECTED is terminal.
- ❌ Filters / search / sort on `/admin/bookings`. Phase 2.
- ❌ Touching `payment_status` / `payment_reference`. Stay NULL.
- ❌ Refactoring the three `<*BookingButton>` components into a generic `<BookingActionButton>` — three near-identical files exist now, but each has its own action import + state type + visual variant. Premature extraction would obscure call sites. Phase 2 / Designer reskin can revisit.
- ❌ Refactoring `confirmBooking` + `rejectBooking` into a generic `transitionPendingBooking(id, target)` helper — same anti-pattern reasoning as US-4.2.
- ❌ A booking-detail admin page. Not in Doc B §7.2.

### Key decisions

1. **Conditional-UPDATE pattern, no ownership clause.** Identical shape to `confirmBooking` (US-4.2), only the SET target state differs (`REJECTED` vs `CONFIRMED`). Architecturally, this is the third application of the pattern. If a 4th lands in Phase 2 (Stripe webhook → REFUNDED), revisit extraction.

2. **`revalidatePath('/spaces/${spaceId}')` IS required for Reject** (in contrast to Confirm). REJECTED removes the row from the partial unique index's covered set, freeing the desk. The public space detail page would show stale "Unavailable" without the revalidation. Anti-pattern: forgetting this revalidation would silently break the AC-1 second clause for ~5 minutes (Next 16 cache window).

3. **Verbatim error messages aligned with US-4.2's pattern.**
   - `"Only super admins can reject bookings."` (FORBIDDEN)
   - `"Only pending bookings can be rejected."` (CANNOT_REJECT)
   Same style as confirm's verbatim messages; chosen wording, then locked across action and REST.

4. **Visual treatment: outlined red.** `border border-red-300 text-red-700 hover:bg-red-50`. Communicates destructive intent (matches Doc B §7.4's red palette for the REJECTED status badge). Distinct from:
   - Confirm (US-4.2): filled gray-900 + white text — affirmative, primary.
   - Cancel (US-3.5, on `/my-bookings`): outlined gray — secondary, less destructive feel because Guest cancels their own.

5. **Three buttons now coexist on PENDING admin rows.** The conditional render slot becomes:
   ```tsx
   {(booking.status as BookingStatus) === 'PENDING' && (
     <>
       <ConfirmBookingButton bookingId={booking.id} />
       <RejectBookingButton bookingId={booking.id} />
     </>
   )}
   ```
   Both inside the row's flex line, side-by-side. No wrapper needed; the flex `gap-3` from the parent handles spacing.

6. **No `<BookingActionButton>` extraction.** Three near-identical files (`cancel-booking-button.tsx`, `confirm-booking-button.tsx`, `reject-booking-button.tsx`) each ~50 lines. They share structure but differ in: action import, state type, button label, visual classes. Extracting would require parameterizing 4–5 dimensions for marginal compression. Anti-pattern: don't pre-extract.

7. **No `transitionPendingBooking` extraction either.** Same reasoning as US-4.2.

8. **No new validation file.** UUID check is one-line regex.

9. **Race scenarios documented for completeness.** With three transitions out of PENDING (Guest cancel + Admin confirm + Admin reject), three pairwise races exist. All are handled correctly:
   - Guest cancel + Admin confirm → first commit wins; loser sees CANNOT_CANCEL or CANNOT_CONFIRM.
   - Guest cancel + Admin reject → first commit wins; loser sees CANNOT_CANCEL or CANNOT_REJECT.
   - Admin confirm + Admin reject (two SAs) → first commit wins; loser sees CANNOT_CONFIRM or CANNOT_REJECT.
   All collisions resolve via the `WHERE status='PENDING'` clause returning 0 rows for the loser.

### Architecture compliance

- Validation: minimal (UUID check at boundary). No Zod schema file.
- Form pattern: native `<form action={serverAction}>` + `useActionState` + `useFormStatus`.
- State management: per-form `useActionState` only.
- Component library: none. Raw Tailwind.
- Authorization: layout-level guard for the page; per-action `requireSession`+`requireRole('SUPER_ADMIN')`. No `requireOwnership` (admin scope).
- Error response shape (action): `{ status: 'error', code, message }`.
- Status codes (REST): 200 / 401 / 403 / 404 / 409 / 500.
- Auth API: `requireSession` + `requireRole` only.
- Reskinnable frontend: literal Tailwind utilities only.

### Code sketches

#### `src/db/queries/bookings.ts` (extension)

```ts
/**
 * Conditional UPDATE: rejects a PENDING booking. Admin scope — no ownership
 * clause. Returns the updated row on success; `undefined` when the row is no
 * longer PENDING (race against Guest cancel or Admin confirm) or doesn't exist.
 *
 * Same shape as confirmBooking with target REJECTED. Final state-transition
 * helper of Phase 1; with cancelBooking + confirmBooking, all four transitions
 * out of PENDING are wired up (the fourth is Phase 2 Stripe webhook → REFUNDED).
 */
export async function rejectBooking(
  id: string,
): Promise<Booking | undefined> {
  const [row] = await db
    .update(bookingsTable)
    .set({ status: 'REJECTED', updatedAt: new Date() })
    .where(and(eq(bookingsTable.id, id), eq(bookingsTable.status, 'PENDING')))
    .returning();
  return row;
}
```

#### `src/actions/booking.ts` (extension)

```ts
import { rejectBooking } from '@/db/queries/bookings';

export type RejectBookingActionState =
  | { status: 'idle' }
  | { status: 'error'; code: 'FORBIDDEN'; message: string }
  | { status: 'error'; code: 'NOT_FOUND'; message: string }
  | { status: 'error'; code: 'CANNOT_REJECT'; message: string }
  | { status: 'error'; code: 'INTERNAL_ERROR'; message: string };

export async function rejectBookingAction(
  _prevState: RejectBookingActionState,
  formData: FormData,
): Promise<RejectBookingActionState> {
  const bookingId = String(formData.get('bookingId') ?? '');
  if (!UUID_RE.test(bookingId)) {
    return { status: 'error', code: 'NOT_FOUND', message: 'Booking not found.' };
  }

  // Auth: 401 → /login redirect; 403 → state.
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
          message: 'Only super admins can reject bookings.',
        };
      }
    }
    logger.error('reject_booking_action_auth_failed', { error: String(err) });
    return { status: 'error', code: 'INTERNAL_ERROR', message: 'Something went wrong.' };
  }

  // Pre-checks (no ownership).
  const booking = await getBookingById(bookingId);
  if (!booking) {
    return { status: 'error', code: 'NOT_FOUND', message: 'Booking not found.' };
  }
  if (booking.status !== 'PENDING') {
    return {
      status: 'error',
      code: 'CANNOT_REJECT',
      message: 'Only pending bookings can be rejected.',
    };
  }

  // Conditional UPDATE — race-safe.
  let result: RejectBookingActionState | null = null;
  try {
    const updated = await rejectBooking(bookingId);
    if (!updated) {
      result = {
        status: 'error',
        code: 'CANNOT_REJECT',
        message: 'Only pending bookings can be rejected.',
      };
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error('reject_booking_action_db_failed', { error: msg });
    result = {
      status: 'error',
      code: 'INTERNAL_ERROR',
      message: 'Something went wrong. Please try again.',
    };
  }
  if (result) return result;

  // Reject FREES the desk (PENDING → REJECTED removes the row from the
  // partial unique index's covered set), so /spaces/[id] needs revalidation
  // to surface fresh availability.
  revalidatePath('/admin/bookings');
  revalidatePath('/my-bookings');
  revalidatePath(`/spaces/${booking.spaceId}`);
  return { status: 'idle' };
}
```

#### `src/app/api/admin/bookings/[id]/reject/route.ts` (NEW)

(Mirror US-4.2's confirm route with the verb / state target / verbatim messages swapped.)

#### `src/app/admin/bookings/reject-booking-button.tsx` (NEW)

```tsx
'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import {
  rejectBookingAction,
  type RejectBookingActionState,
} from '@/actions/booking';

const initialState: RejectBookingActionState = { status: 'idle' };

export function RejectBookingButton({ bookingId }: { bookingId: string }) {
  const [state, formAction] = useActionState(rejectBookingAction, initialState);
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
      className="rounded border border-red-300 px-3 py-1 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
    >
      {pending ? 'Rejecting…' : 'Reject'}
    </button>
  );
}
```

#### `src/app/admin/bookings/page.tsx` (modification)

Inside the existing conditional render block for PENDING rows, add `<RejectBookingButton>` immediately after `<ConfirmBookingButton>`:

```tsx
{(booking.status as BookingStatus) === 'PENDING' && (
  <>
    <ConfirmBookingButton bookingId={booking.id} />
    <RejectBookingButton bookingId={booking.id} />
  </>
)}
```

Import `<RejectBookingButton>` from `./reject-booking-button`.

### File-structure requirements

After this story:

```
deskhive/
├── src/
│   ├── actions/
│   │   └── booking.ts                        # UPDATED — add rejectBookingAction
│   ├── app/
│   │   ├── admin/
│   │   │   └── bookings/
│   │   │       ├── page.tsx                  # UPDATED — render RejectBookingButton alongside Confirm
│   │   │       ├── confirm-booking-button.tsx # (US-4.2 — unchanged)
│   │   │       └── reject-booking-button.tsx # NEW
│   │   └── api/
│   │       └── admin/
│   │           └── bookings/
│   │               ├── route.ts              # (US-4.1 — GET; unchanged)
│   │               └── [id]/
│   │                   ├── confirm/          # (US-4.2 — unchanged)
│   │                   │   └── route.ts
│   │                   └── reject/           # NEW directory
│   │                       └── route.ts      # NEW
│   └── db/
│       └── queries/
│           └── bookings.ts                   # UPDATED — add rejectBooking
└── tests/
    └── e2e/
        └── admin-bookings.spec.ts            # UPDATED — add 1 new 401 test
```

Files NOT touched:
- `deskhive/src/db/schema.ts` — schema unchanged.
- `deskhive/src/lib/auth/guards.ts` — `requireSession` + `requireRole` consumed.
- `deskhive/src/proxy.ts` — `/api/admin/bookings/[id]/reject` covered by existing matcher.
- `deskhive/src/app/admin/layout.tsx` — sub-nav from US-4.1 unchanged.
- `deskhive/src/components/status-badge.tsx`, `data-view.tsx` — unchanged.
- `deskhive/src/lib/format.ts`, `db-errors.ts` — unchanged.
- All Epic 1 / 2 / 3 files except `src/db/queries/bookings.ts` and `src/actions/booking.ts`.
- US-4.1 and US-4.2 files unchanged (except the page that now renders both buttons).

### Anti-patterns — explicit DO-NOTs

- ❌ Unconditional UPDATE. State-machine clause required.
- ❌ SELECT-then-UPDATE without conditional clause.
- ❌ Adding `requireOwnership`. Admin scope.
- ❌ Allowing Guests to reject. Reject is Super Admin only.
- ❌ Paraphrasing the verbatim error messages.
- ❌ Showing a Reject button on non-PENDING rows. Conditional render only.
- ❌ Skipping `revalidatePath('/spaces/${spaceId}')`. The desk's availability won't update without it. **This is the bigger trap than the confirm story** because Reject DOES affect availability.
- ❌ Adding a confirmation modal.
- ❌ Reverting REJECTED back to PENDING. Not in Doc B §6.3.
- ❌ Touching `payment_status` / `payment_reference`.
- ❌ Catching `redirect()` inside try/catch.
- ❌ Pre-extracting a generic `transitionPendingBooking` helper or a generic `<BookingActionButton>` component.
- ❌ Adding rejection reasons or audit log entries.
- ❌ Modifying admin layout, header, or any other shared component.

### Project structure notes

- `src/app/api/admin/bookings/[id]/reject/route.ts` joins `confirm/route.ts`. Pattern: each state transition gets its own verb-named subdirectory under `[id]/`.
- `rejectBookingAction` joins the other three booking actions (`createBookingAction`, `cancelBookingAction`, `confirmBookingAction`). Four actions in one domain file; total ~300 lines; still manageable.
- `rejectBooking` joins `cancelBooking` and `confirmBooking`. **Three named state-transition helpers landed.** No further transitions in Phase 1; revisit extraction if Phase 2 adds one (likely Stripe webhook → REFUNDED).
- `src/app/admin/bookings/reject-booking-button.tsx` is the third per-action button on `/admin/bookings` (alongside confirm; cancel lives on `/my-bookings`). Visual variants: filled (Confirm), outlined-red (Reject), outlined-gray (Cancel). Three variants is the threshold for considering extraction; deliberately deferred to Phase 2.

### Phase 1 PRD closure marker

**This story is the LAST feature story of Phase 1.** Once it lands at `review`:

- Epic 0 (Scaffolding): 3/3 review (US-0.1 / 0.2 / 0.3)
- Epic 1 (Authentication): 3/3 review (US-1.1 / 1.2 / 1.3)
- Epic 2 (Inventory Management): 4/4 review (US-2.1 / 2.2 / 2.3 / 2.4)
- Epic 3 (Discovery & Booking): 5/5 review (US-3.1 / 3.2 / 3.3 / 3.4 / 3.5)
- Epic 4 (Admin Booking Management): 3/3 review (US-4.1 / 4.2 / 4.3)
- **Total: 18/18 stories at review.**

Remaining work (NOT US-4.3's scope):
- BA's manual verification of every story's `review` checklist (most are already partially verified during dev-story).
- Optional `*code-review` per story (recommended for the bigger ones — US-2.1, US-3.3, US-3.5).
- Optional epic retrospectives.
- Designer (Makhbuba) reskinning pass after MVP.
- Phase 2 backlog: payment, email notifications, audit log, image upload, calendar widget, refunds, etc. — none of which is in scope for the 2-week MVP.

### Previous story intelligence

- **US-4.2** (`1180df6`): admin Confirm; conditional-UPDATE without ownership; verbatim error messages; same template this story copies-and-adapts.
- **US-4.1** (`559011c`): `/admin/bookings` list page + admin sub-nav. Reject button slot lives on this page alongside Confirm.
- **US-3.5** (`8be46e7`): conditional-UPDATE pattern + first `requireOwnership`. The architectural foundation; this story is the third application.

**Patterns established (replicate, don't deviate):**
- Conditional UPDATE for state-machine transitions (architecture mandate).
- Pre-check + conditional UPDATE both run.
- Verbatim error strings, locked across action and REST.
- `apiError` 403 message override pattern in REST handlers.
- Layout-level guard handles auth on `/admin/*` pages.
- Per-form `useActionState` with hidden inputs (no `.bind`).
- One feature story → one `feat:` commit.
- `revalidatePath` for ALL surfaces affected by the write — for Reject specifically, that's three: `/admin/bookings`, `/my-bookings`, AND `/spaces/${spaceId}`.

### Recent commits

```
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

US-4.3 is the **fifteenth `feat:` commit** and the **last feature commit of Phase 1**.

### References

- [Source: docs/02-phase1-prd.md#Section 8] — US-4.3 verbatim Gherkin.
- [Source: docs/02-phase1-prd.md#Section 4.4] — FR-AB3.
- [Source: docs/02-phase1-prd.md#Section 6.1] — `bookings` schema.
- [Source: docs/02-phase1-prd.md#Section 6.2] — partial unique index covers PENDING/CONFIRMED only — REJECTED frees the desk.
- [Source: docs/02-phase1-prd.md#Section 6.3] — booking state machine (PENDING → REJECTED valid for Super Admin).
- [Source: docs/02-phase1-prd.md#Section 6.4] — `POST /admin/bookings/:id/reject` endpoint.
- [Source: docs/02-phase1-prd.md#Section 7.4] — red color palette for REJECTED status badge (informs Reject button color).
- [Source: _bmad-output/planning-artifacts/architecture.md#Booking state-machine race safety] — conditional-UPDATE pattern is mandatory for all transitions.
- [Source: _bmad-output/implementation-artifacts/4-2-confirm-booking.md] — analog template; this story copies-and-adapts.
- [Source: _bmad-output/implementation-artifacts/3-5-cancel-pending-booking.md] — original conditional-UPDATE pattern source.
- [Source: deskhive/AGENTS.md] — Next.js 16 caveats.

## Dev Agent Record

### Agent Model Used

Claude Opus 4.7 (1M context) — invoked via `bmad-dev-story` skill on 2026-05-07 in speed mode. **Final feature dev-story dispatch of Phase 1.**

### Debug Log References

| Step | Notable output |
|---|---|
| `pnpm typecheck` | Clean |
| `pnpm lint` | Clean |
| `pnpm test` | 95/95 pass + 1 skipped — no new unit tests |
| `pnpm build` | 27 routes (added `/api/admin/bookings/[id]/reject`) |
| `pnpm test:e2e` | 31/31 pass in 11.8s — added 1 new `POST /api/admin/bookings/:id/reject` 401 test |

### Completion Notes List

**Story executed end-to-end. Stop bar (admin Reject + button alongside Confirm + desk re-availability) achieved structurally.** All 95 unit + 31 E2E tests pass. Browser-interactive verification on BA's plate.

**No mid-execution corrections.** US-4.2 was the template; US-4.3 mirrored cleanly with the three planned differences: target REJECTED, third revalidatePath, outlined-red visual.

**Key implementation observations:**

1. **`rejectBooking` is `confirmBooking` with the SET target swapped.** Identical WHERE clauses (`id`, `status='PENDING'`); differs only on the SET. Three named state-transition helpers now coexist: `cancelBooking` (Guest, with ownership), `confirmBooking` + `rejectBooking` (Admin, no ownership). Anti-pattern resisted: no `transitionPendingBooking(id, target)` extraction.

2. **Three revalidatePath calls on Reject.** Critical: `/spaces/${spaceId}` is the third path, distinct from Confirm. REJECTED removes the row from the partial unique index's covered set, so the desk becomes available again on that date — visible on the public space detail page. The story's "bigger trap" call-out was right; landed correctly.

3. **`apiError` 403 message override pattern repeated.** Same shape used in confirm; same here for reject. If a 4th admin verb appears in Phase 2, worth extracting a tiny helper.

4. **Verbatim error strings locked across action and REST:** `"Only super admins can reject bookings."` and `"Only pending bookings can be rejected."`.

5. **Three buttons coexist on PENDING admin rows.** Conditional render block now contains both Confirm (filled gray-900) and Reject (outlined red) inside a fragment. Parent flex `gap-3` handles spacing.

6. **Visual hierarchy now complete:** Confirm filled-primary, Reject outlined-red (destructive), Cancel outlined-gray (different page). Three-variant threshold for `<BookingActionButton>` extraction reached and deliberately deferred per anti-pattern.

7. **Race-handling proven correct.** Three transitions out of PENDING (Guest cancel + Admin confirm + Admin reject) → three pairwise races, all resolved via the conditional UPDATE's `WHERE status='PENDING'` returning 0 rows for the loser.

**🎯 Phase 1 PRD structurally complete.**

After this commit, sprint-status.yaml shows:
- Epic 0 (Scaffolding): 3/3 review
- Epic 1 (Authentication): 3/3 review
- Epic 2 (Inventory Management): 4/4 review
- Epic 3 (Discovery & Booking): 5/5 review
- Epic 4 (Admin Booking Management): 3/3 review
- **Total: 18/18 stories at review.**

What's next is BA-driven, not dev-story-driven:
- Manual verification of every story's `review` checklist
- Optional `*code-review` per story (recommended for the bigger ones)
- Optional epic retrospectives
- Designer (Makhbuba) reskin pass
- Phase 2 backlog scoping

**Browser-interactive verifications still on BA's plate (Task 8):**
- See both Confirm + Reject on PENDING admin rows
- Click Reject → badge → `Rejected`; both buttons gone
- AC-1 second clause: `/spaces/<id>?date=<that-date>` → desk Available again
- Reload as that Guest → `/my-bookings` shows `Rejected`
- DevTools matrix: 401 / 403 (Guest, verbatim) / 404 / 409 (CONFIRMED + CANCELLED + REJECTED ids)
- Optional three-terminal race scenario

### File List

All paths relative to repo root.

**NEW (2 files):**
- `deskhive/src/app/api/admin/bookings/[id]/reject/route.ts` — `POST /admin/bookings/:id/reject`
- `deskhive/src/app/admin/bookings/reject-booking-button.tsx` — outlined-red Client Component

**UPDATED (4 files):**
- `deskhive/src/db/queries/bookings.ts` — added `rejectBooking` (third state-transition helper)
- `deskhive/src/actions/booking.ts` — added `rejectBookingAction` + state type + import
- `deskhive/src/app/admin/bookings/page.tsx` — render `<RejectBookingButton>` alongside `<ConfirmBookingButton>` on PENDING rows
- `deskhive/tests/e2e/admin-bookings.spec.ts` — added `POST /api/admin/bookings/:id/reject returns 401` test

**NOT TOUCHED:**
- Schema, guards, proxy, layout, primitives — all unchanged
- US-4.1 / US-4.2 files unchanged (except the page that now renders both buttons)
- All Epic 1 / 2 / 3 files

### Change Log

| Date | Change | Commit |
|---|---|---|
| 2026-05-07 | Story drafted by `bmad-create-story`. | (none) |
| 2026-05-07 | US-4.3 implemented; admin Reject + conditional UPDATE + spaces revalidation; verbatim error messages; **closes Phase 1 PRD — 18/18 stories at review.** All CI commands green. | `0583a43` |
