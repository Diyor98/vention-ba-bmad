import { listPublishedSpaces } from '@/db/queries/spaces';
import { apiError } from '@/lib/http';
import { logger } from '@/lib/logger';

export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const cityRaw = url.searchParams.get('city')?.trim();
  const city = cityRaw && cityRaw.length > 0 ? cityRaw : undefined;

  try {
    const rows = await listPublishedSpaces({ city });
    return Response.json(rows, { status: 200 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error('list_spaces_route_failed', { error: msg });
    return apiError('INTERNAL_ERROR', 'Something went wrong', 500);
  }
}
