import { requireSession, AuthError } from '@/lib/auth/guards';
import { listBookingsForGuest } from '@/db/queries/bookings';
import { apiError } from '@/lib/http';
import { logger } from '@/lib/logger';

// No role gate — Super Admins may legitimately have bookings under their
// user id and should see them. The query already filters on guest_user_id =
// session.user.id, so the result naturally scopes to the caller.
export async function GET(): Promise<Response> {
  let session;
  try {
    session = await requireSession();
  } catch (err) {
    if (err instanceof AuthError) return err.response;
    logger.error('list_my_bookings_route_auth_failed', { error: String(err) });
    return apiError('INTERNAL_ERROR', 'Something went wrong', 500);
  }

  try {
    const rows = await listBookingsForGuest(String(session.user.id));
    return Response.json(rows, { status: 200 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error('list_my_bookings_route_db_failed', { error: msg });
    return apiError('INTERNAL_ERROR', 'Something went wrong', 500);
  }
}
