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
      // Override the 403's default message with our verbatim US-4.2 wording.
      if (err.response.status === 403) {
        return apiError(
          'FORBIDDEN',
          'Only super admins can confirm bookings.',
          403,
        );
      }
      return err.response;
    }
    logger.error('confirm_booking_route_auth_failed', { error: String(err) });
    return apiError('INTERNAL_ERROR', 'Something went wrong', 500);
  }

  const booking = await getBookingById(id);
  if (!booking) return apiNotFound('Booking not found');

  if (booking.status !== 'PENDING') {
    // Verbatim message (US-4.2 AC-2).
    return apiError(
      'CANNOT_CONFIRM',
      'Only pending bookings can be confirmed.',
      409,
    );
  }

  try {
    const updated = await confirmBooking(id);
    if (!updated) {
      // Concurrent Guest cancel landed between pre-check and UPDATE → same 409.
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
