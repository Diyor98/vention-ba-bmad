import {
  requireSession,
  requireRole,
  requireOwnership,
  AuthError,
} from '@/lib/auth/guards';
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
    logger.error('cancel_booking_route_auth_failed', { error: String(err) });
    return apiError('INTERNAL_ERROR', 'Something went wrong', 500);
  }

  const booking = await getBookingById(id);
  if (!booking) return apiNotFound('Booking not found');

  try {
    requireOwnership(booking.guestUserId, String(session.user.id));
  } catch (err) {
    if (err instanceof AuthError) {
      // Verbatim PRD message (US-3.5 AC-3).
      return apiError(
        'FORBIDDEN',
        'You can only cancel your own bookings.',
        403,
      );
    }
    return apiError('INTERNAL_ERROR', 'Something went wrong', 500);
  }

  if (booking.status !== 'PENDING') {
    // Verbatim PRD message (US-3.5 AC-2).
    return apiError(
      'CANNOT_CANCEL',
      'Only pending bookings can be cancelled.',
      409,
    );
  }

  try {
    const updated = await cancelBooking(id, String(session.user.id));
    if (!updated) {
      // Concurrent Confirm landed between pre-check and UPDATE → same 409.
      return apiError(
        'CANNOT_CANCEL',
        'Only pending bookings can be cancelled.',
        409,
      );
    }
    return Response.json(updated, { status: 200 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error('cancel_booking_route_db_failed', { error: msg });
    return apiError('INTERNAL_ERROR', 'Something went wrong', 500);
  }
}
