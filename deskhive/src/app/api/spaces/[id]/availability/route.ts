import { getPublishedSpaceById } from '@/db/queries/spaces';
import { listActiveDesksForSpace } from '@/db/queries/desks';
import { listActiveBookingsForSpaceOnDate } from '@/db/queries/bookings';
import { computeDeskAvailability } from '@/lib/availability';
import { parseDateParam } from '@/lib/format';
import { apiError, apiNotFound } from '@/lib/http';
import { logger } from '@/lib/logger';

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;
  const url = new URL(req.url);
  const dateParam = url.searchParams.get('date');
  const dateResult = parseDateParam(dateParam);
  if (!dateResult.valid) {
    return apiError(
      'VALIDATION_ERROR',
      'date query param is required, must be YYYY-MM-DD, and not in the past',
      400,
    );
  }

  try {
    const space = await getPublishedSpaceById(id);
    if (!space) return apiNotFound('Space not found');
    const [desks, bookings] = await Promise.all([
      listActiveDesksForSpace(id),
      listActiveBookingsForSpaceOnDate(id, dateResult.iso),
    ]);
    const availabilityMap = computeDeskAvailability(desks, bookings);
    const availability = desks.map((d) => ({
      deskId: d.id,
      isAvailable: availabilityMap.get(d.id) ?? false,
    }));
    return Response.json(
      { date: dateResult.iso, availability },
      { status: 200 },
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error('space_availability_route_failed', { error: msg });
    return apiError('INTERNAL_ERROR', 'Something went wrong', 500);
  }
}
