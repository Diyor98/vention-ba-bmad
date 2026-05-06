import { requireSession, requireRole, AuthError } from '@/lib/auth/guards';
import { isPgUniqueViolation } from '@/lib/db-errors';
import { isPastDate } from '@/lib/format';
import { createBookingSchema } from '@/lib/validation/booking';
import { getActiveDeskById } from '@/db/queries/desks';
import { getPublishedSpaceById } from '@/db/queries/spaces';
import { createBooking } from '@/db/queries/bookings';
import { apiError, apiValidationError, apiNotFound } from '@/lib/http';
import { logger } from '@/lib/logger';

export async function POST(req: Request): Promise<Response> {
  let session;
  try {
    session = await requireSession();
    requireRole(session, 'GUEST');
  } catch (err) {
    if (err instanceof AuthError) return err.response;
    logger.error('create_booking_route_auth_failed', { error: String(err) });
    return apiError('INTERNAL_ERROR', 'Something went wrong', 500);
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return apiError('INVALID_JSON', 'Request body must be valid JSON', 400);
  }

  const parsed = createBookingSchema.safeParse(body);
  if (!parsed.success) {
    const fields: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? '');
      if (key && !fields[key]) fields[key] = issue.message;
    }
    return apiValidationError(fields);
  }

  if (isPastDate(parsed.data.bookingDate)) {
    return apiError('PAST_DATE', 'Booking date cannot be in the past', 400);
  }

  const desk = await getActiveDeskById(parsed.data.deskId);
  if (!desk) return apiNotFound('This desk is not available.');
  const space = await getPublishedSpaceById(desk.spaceId);
  if (!space) return apiNotFound('This desk is not available.');

  try {
    const row = await createBooking({
      guestUserId: String(session.user.id),
      spaceId: desk.spaceId,
      deskId: desk.id,
      bookingDate: parsed.data.bookingDate,
      totalPriceCents: desk.dailyPriceCents,
    });
    return Response.json(row, { status: 201 });
  } catch (err) {
    if (isPgUniqueViolation(err, 'uniq_active_booking_per_desk_per_date')) {
      return apiError(
        'DOUBLE_BOOKING',
        'This desk is already booked for that date',
        409,
      );
    }
    const msg = err instanceof Error ? err.message : String(err);
    logger.error('create_booking_route_db_failed', { error: msg });
    return apiError('INTERNAL_ERROR', 'Something went wrong', 500);
  }
}
