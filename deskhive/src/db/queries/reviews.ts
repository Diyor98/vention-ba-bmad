import { avg, count, inArray } from 'drizzle-orm';
import { db } from '@/db/client';
import { reviewsTable } from '@/db/schema';

/**
 * DESIGN-INT-GAPS-PASS-2 Round 4 Gap E — per-space rating aggregates.
 *
 * Returns a Map of spaceId → { avg, count } across the input ids in
 * one round-trip. Mirrors the shape of `getActiveDeskCountBySpaceIds`
 * / `getMinActiveDailyPriceCentsBySpaceIds` (aggregate + IN + GROUP
 * BY); spaces with zero reviews are absent from the map (caller
 * treats absent as "no badge").
 *
 * Drizzle's `avg()` returns the value as a SQL `numeric` string in
 * Postgres; we Number.parseFloat before returning so consumers can
 * `.toFixed(1)` without re-parsing.
 */
export async function getAverageRatingBySpaceIds(
  spaceIds: string[],
): Promise<Map<string, { avg: number; count: number }>> {
  if (spaceIds.length === 0) return new Map();
  const rows = await db
    .select({
      spaceId: reviewsTable.spaceId,
      avg: avg(reviewsTable.rating),
      n: count(),
    })
    .from(reviewsTable)
    .where(inArray(reviewsTable.spaceId, spaceIds))
    .groupBy(reviewsTable.spaceId);
  const out = new Map<string, { avg: number; count: number }>();
  for (const r of rows) {
    if (r.avg == null) continue;
    const avgN =
      typeof r.avg === 'number' ? r.avg : Number.parseFloat(String(r.avg));
    if (!Number.isFinite(avgN)) continue;
    out.set(r.spaceId, { avg: avgN, count: Number(r.n) });
  }
  return out;
}
