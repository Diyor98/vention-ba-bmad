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
import { getPublishedSpaceById } from '@/db/queries/spaces';
import {
  createBooking,
  getBookingById,
  cancelBooking,
  confirmBooking,
} from '@/db/queries/bookings';
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
  redirect('/my-bookings');
}

export type CancelBookingActionState =
  | { status: 'idle' }
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
  return { status: 'idle' };
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

  // Auth: 401 → /login redirect; 403 (Guest tries via tampered DevTools) → state.
  try {
    const session = await requireSession();
    requireRole(session, 'SUPER_ADMIN');
  } catch (err) {
    if (err instanceof AuthError) {
      const status = err.response.status;
      if (status === 401) {
        redirect('/login?callbackUrl=/admin/bookings');
      }
      if (status === 403) {
        // Verbatim message (US-4.2 chosen wording).
        return {
          status: 'error',
          code: 'FORBIDDEN',
          message: 'Only super admins can confirm bookings.',
        };
      }
    }
    logger.error('confirm_booking_action_auth_failed', { error: String(err) });
    return {
      status: 'error',
      code: 'INTERNAL_ERROR',
      message: 'Something went wrong.',
    };
  }

  // Pre-checks (no ownership — admin scope).
  const booking = await getBookingById(bookingId);
  if (!booking) {
    return { status: 'error', code: 'NOT_FOUND', message: 'Booking not found.' };
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
  revalidatePath('/my-bookings');
  return { status: 'idle' };
}
