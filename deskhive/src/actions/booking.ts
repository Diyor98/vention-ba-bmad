'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import {
  requireSession,
  requireRole,
  requireOwnership,
  AuthError,
} from '@/lib/auth/guards';
import { isPgUniqueViolation } from '@/lib/db-errors';
import { isPastDate } from '@/lib/format';
import { createBookingSchema } from '@/lib/validation/booking';
import { getActiveDeskById } from '@/db/queries/desks';
import { getPublishedSpaceById, getSpaceById } from '@/db/queries/spaces';
import {
  createBooking,
  getBookingById,
  cancelBooking,
  confirmBooking,
  rejectBooking,
} from '@/db/queries/bookings';
import { logger } from '@/lib/logger';
import type { Role } from '@/db/schema';

export type CreateBookingActionState =
  | { status: 'idle' }
  // Story 6-3 (BA revision 2026-05-12): the action returns a success state
  // instead of redirecting. The client fires the toast on /spaces/[id]
  // (the current page); the user controls navigation to /my-bookings via
  // the toast's "View in My Bookings" action button. This makes the toast
  // appear in the context where the user just clicked, and gives the
  // action button real work to do.
  | { status: 'success' }
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

  // Auth: 401 → redirect to /login with callback; 403 → state.
  let session;
  try {
    session = await requireSession();
    requireRole(session, 'GUEST');
  } catch (err) {
    if (err instanceof AuthError) {
      const status = err.response.status;
      if (status === 401) {
        // spaceId from the form lets us build the callback without a
        // pre-auth DB call. Even if a tampered spaceId leads to a bogus
        // /spaces/X URL, the user just lands on a 404 after login — no
        // security implication since callbackUrl validation is same-origin.
        const callback = `/spaces/${spaceId}?date=${bookingDate}`;
        redirect(`/login?callbackUrl=${encodeURIComponent(callback)}`);
      }
      if (status === 403) {
        return {
          status: 'error',
          code: 'FORBIDDEN',
          message: 'Only guests can book desks.',
        };
      }
    }
    logger.error('create_booking_action_auth_failed', { error: String(err) });
    return {
      status: 'error',
      code: 'INTERNAL_ERROR',
      message: 'Something went wrong.',
    };
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
    return {
      status: 'error',
      code: 'PAST_DATE',
      // Verbatim PRD message — do not paraphrase (US-3.3 AC-5).
      message: 'Booking date cannot be in the past',
    };
  }

  // Existence — collapse "desk missing/inactive" and "space not published"
  // into one user-facing code per the AC-8 design.
  const desk = await getActiveDeskById(parsed.data.deskId);
  if (!desk) {
    return {
      status: 'error',
      code: 'DESK_NOT_FOUND',
      message: 'This desk is not available.',
    };
  }
  const space = await getPublishedSpaceById(desk.spaceId);
  if (!space) {
    return {
      status: 'error',
      code: 'DESK_NOT_FOUND',
      message: 'This desk is not available.',
    };
  }

  // Insert. The partial unique index uniq_active_booking_per_desk_per_date
  // (Doc B §6.2) is the source of truth on conflicts.
  let result: CreateBookingActionState | null = null;
  try {
    await createBooking({
      guestUserId: String(session.user.id),
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
        // Verbatim PRD message — do not paraphrase (US-3.3 AC-3).
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
  // Story 6-3 (BA revision 2026-05-12): no redirect on success. Returning
  // 'success' lets <BookDeskButton> fire the toast on /spaces/[id] (the
  // current page); the user clicks the toast's action button to navigate
  // to /my-bookings if they want, or stays on Space Detail to book another
  // desk. Replaces the prior redirect('/my-bookings?booked=1') cross-nav
  // pattern — the toast lives in the action context now, action button is
  // a real link, no soft no-op.
  return { status: 'success' };
}

export type CancelBookingActionState =
  | { status: 'idle' }
  // Story 6-3: explicit 'success' variant so <CancelBookingButton> can fire
  // a confirmation toast on a successful cancel (BA Decisions §10).
  | { status: 'success' }
  | { status: 'error'; code: 'FORBIDDEN'; message: string }
  | { status: 'error'; code: 'NOT_FOUND'; message: string }
  | { status: 'error'; code: 'CANNOT_CANCEL'; message: string }
  | { status: 'error'; code: 'INTERNAL_ERROR'; message: string };

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function cancelBookingAction(
  _prevState: CancelBookingActionState,
  formData: FormData,
): Promise<CancelBookingActionState> {
  const bookingId = String(formData.get('bookingId') ?? '');
  if (!UUID_RE.test(bookingId)) {
    return { status: 'error', code: 'NOT_FOUND', message: 'Booking not found.' };
  }

  // Auth: 401 → redirect to /login with callback; 403 (Super Admin) → state.
  let session;
  try {
    session = await requireSession();
    requireRole(session, 'GUEST');
  } catch (err) {
    if (err instanceof AuthError) {
      const status = err.response.status;
      if (status === 401) {
        redirect('/login?callbackUrl=/my-bookings');
      }
      if (status === 403) {
        return {
          status: 'error',
          code: 'FORBIDDEN',
          message: 'Only guests can cancel bookings.',
        };
      }
    }
    logger.error('cancel_booking_action_auth_failed', { error: String(err) });
    return {
      status: 'error',
      code: 'INTERNAL_ERROR',
      message: 'Something went wrong.',
    };
  }

  // Pre-checks classify errors (404 / 403 / 409). The conditional UPDATE
  // below is the actual race-safety net.
  const booking = await getBookingById(bookingId);
  if (!booking) {
    return { status: 'error', code: 'NOT_FOUND', message: 'Booking not found.' };
  }

  try {
    requireOwnership(booking.guestUserId, String(session.user.id));
  } catch (err) {
    if (err instanceof AuthError) {
      // Verbatim PRD message — do not paraphrase (US-3.5 AC-3).
      return {
        status: 'error',
        code: 'FORBIDDEN',
        message: 'You can only cancel your own bookings.',
      };
    }
    return {
      status: 'error',
      code: 'INTERNAL_ERROR',
      message: 'Something went wrong.',
    };
  }

  if (booking.status !== 'PENDING') {
    // Verbatim PRD message — do not paraphrase (US-3.5 AC-2).
    return {
      status: 'error',
      code: 'CANNOT_CANCEL',
      message: 'Only pending bookings can be cancelled.',
    };
  }

  // Conditional UPDATE: race-safe against concurrent Super Admin Confirm.
  let result: CancelBookingActionState | null = null;
  try {
    const updated = await cancelBooking(bookingId, String(session.user.id));
    if (!updated) {
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
  // Story 6-3: 'success' instead of 'idle' so the client can fire a toast.
  return { status: 'success' };
}

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

  // Story 7-5: widened to SUPER_ADMIN OR SPACE_OWNER. The role check itself
  // is inline; the owner-scope check happens after we know the booking's
  // space. Decision §8.
  let callerRole: Role | undefined;
  let callerId: string;
  try {
    const session = await requireSession();
    callerRole = (session.user as { role?: Role }).role;
    callerId = String(session.user.id);
    if (callerRole !== 'SUPER_ADMIN' && callerRole !== 'SPACE_OWNER') {
      // Verbatim message (US-4.2 chosen wording — preserved for the Guest
      // path; SPACE_OWNER is now allowed at this gate so the message only
      // fires for Guests).
      return {
        status: 'error',
        code: 'FORBIDDEN',
        message: 'Only super admins can confirm bookings.',
      };
    }
  } catch (err) {
    if (err instanceof AuthError) {
      const status = err.response.status;
      if (status === 401) {
        redirect('/login?callbackUrl=/admin/bookings');
      }
    }
    logger.error('confirm_booking_action_auth_failed', { error: String(err) });
    return {
      status: 'error',
      code: 'INTERNAL_ERROR',
      message: 'Something went wrong.',
    };
  }

  // Pre-checks. Admin scope is platform-wide; owner scope is restricted
  // to bookings on their own spaces (Decision §8). NOT_FOUND for cross-
  // tenant mismatches — same code as a genuinely-missing booking, so we
  // don't leak the existence of other owners' rows.
  const booking = await getBookingById(bookingId);
  if (!booking) {
    return { status: 'error', code: 'NOT_FOUND', message: 'Booking not found.' };
  }
  if (callerRole === 'SPACE_OWNER') {
    const space = await getSpaceById(booking.spaceId);
    if (!space || space.ownerId !== callerId) {
      return {
        status: 'error',
        code: 'NOT_FOUND',
        message: 'Booking not found.',
      };
    }
  }
  if (booking.status !== 'PENDING') {
    // Verbatim message (US-4.2 AC-2).
    return {
      status: 'error',
      code: 'CANNOT_CONFIRM',
      message: 'Only pending bookings can be confirmed.',
    };
  }

  // Conditional UPDATE: race-safe against concurrent Guest cancel.
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

  // Confirm doesn't change desk availability (PENDING and CONFIRMED are
  // both in the partial unique index's covered set), so no /spaces/[id]
  // revalidation needed.
  revalidatePath('/admin/bookings');
  revalidatePath('/owner/bookings');
  revalidatePath('/owner');
  revalidatePath('/my-bookings');
  return { status: 'idle' };
}

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

  // Story 7-5: same role-branched scope check as confirmBookingAction. See
  // Decision §8 in the story file.
  let callerRole: Role | undefined;
  let callerId: string;
  try {
    const session = await requireSession();
    callerRole = (session.user as { role?: Role }).role;
    callerId = String(session.user.id);
    if (callerRole !== 'SUPER_ADMIN' && callerRole !== 'SPACE_OWNER') {
      // Verbatim message (US-4.3 chosen wording).
      return {
        status: 'error',
        code: 'FORBIDDEN',
        message: 'Only super admins can reject bookings.',
      };
    }
  } catch (err) {
    if (err instanceof AuthError) {
      const status = err.response.status;
      if (status === 401) {
        redirect('/login?callbackUrl=/admin/bookings');
      }
    }
    logger.error('reject_booking_action_auth_failed', { error: String(err) });
    return {
      status: 'error',
      code: 'INTERNAL_ERROR',
      message: 'Something went wrong.',
    };
  }

  // Pre-checks. SPACE_OWNER scope via parent space; admin platform-wide.
  const booking = await getBookingById(bookingId);
  if (!booking) {
    return { status: 'error', code: 'NOT_FOUND', message: 'Booking not found.' };
  }
  if (callerRole === 'SPACE_OWNER') {
    const space = await getSpaceById(booking.spaceId);
    if (!space || space.ownerId !== callerId) {
      return {
        status: 'error',
        code: 'NOT_FOUND',
        message: 'Booking not found.',
      };
    }
  }
  if (booking.status !== 'PENDING') {
    // Verbatim message (US-4.3 AC-2).
    return {
      status: 'error',
      code: 'CANNOT_REJECT',
      message: 'Only pending bookings can be rejected.',
    };
  }

  // Conditional UPDATE: race-safe against concurrent Guest cancel or Admin confirm.
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
  // to surface fresh availability — distinct from Confirm which keeps the
  // desk reserved.
  revalidatePath('/admin/bookings');
  revalidatePath('/owner/bookings');
  revalidatePath('/owner');
  revalidatePath('/my-bookings');
  revalidatePath(`/spaces/${booking.spaceId}`);
  return { status: 'idle' };
}
