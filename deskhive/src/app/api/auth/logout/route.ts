import { auth } from '@/lib/auth/config';
import { apiError } from '@/lib/http';
import { logger } from '@/lib/logger';

export async function POST(req: Request): Promise<Response> {
  try {
    await auth.api.signOut({ headers: req.headers });
    return Response.json({ success: true }, { status: 200 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error('logout_route_failed', { error: msg });
    return apiError('INTERNAL_ERROR', 'Something went wrong', 500);
  }
}
