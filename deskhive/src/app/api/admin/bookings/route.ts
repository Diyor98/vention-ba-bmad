import { requireSession, requireRole, AuthError } from '@/lib/auth/guards';
import { listAllBookings } from '@/db/queries/bookings';
import { apiError } from '@/lib/http';
import { logger } from '@/lib/logger';

export async function GET(): Promise<Response> {
  try {
    const session = await requireSession();
    requireRole(session, 'SUPER_ADMIN');
  } catch (err) {
    if (err instanceof AuthError) return err.response;
    logger.error('admin_bookings_route_auth_failed', { error: String(err) });
    return apiError('INTERNAL_ERROR', 'Something went wrong', 500);
  }

  try {
    const rows = await listAllBookings();
    return Response.json(rows, { status: 200 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error('admin_bookings_route_db_failed', { error: msg });
    return apiError('INTERNAL_ERROR', 'Something went wrong', 500);
  }
}
