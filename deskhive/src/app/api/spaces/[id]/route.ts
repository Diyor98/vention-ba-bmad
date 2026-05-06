import { getPublishedSpaceById } from '@/db/queries/spaces';
import { listActiveDesksForSpace } from '@/db/queries/desks';
import { apiError, apiNotFound } from '@/lib/http';
import { logger } from '@/lib/logger';

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;
  try {
    const space = await getPublishedSpaceById(id);
    if (!space) return apiNotFound('Space not found');
    const desks = await listActiveDesksForSpace(id);
    return Response.json({ space, desks }, { status: 200 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error('space_detail_route_failed', { error: msg });
    return apiError('INTERNAL_ERROR', 'Something went wrong', 500);
  }
}
