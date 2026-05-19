import { eq, and, asc, inArray, min, sql } from 'drizzle-orm';
import { db } from '@/db/client';
import { desksTable, type Desk } from '@/db/schema';
import type { CreateDeskInput, EditDeskInput } from '@/lib/validation/desk';

/**
 * DESIGN-FIX-2 — Map of spaceId → minimum active daily_price_cents.
 * One SQL round-trip via aggregate + IN, scales to the public landing
 * page's space list. Spaces with no active desks are absent from the
 * returned map (caller treats absent as "no min price").
 */
export async function getMinActiveDailyPriceCentsBySpaceIds(
  spaceIds: string[],
): Promise<Map<string, number>> {
  if (spaceIds.length === 0) return new Map();
  const rows = await db
    .select({
      spaceId: desksTable.spaceId,
      min: min(desksTable.dailyPriceCents),
    })
    .from(desksTable)
    .where(and(inArray(desksTable.spaceId, spaceIds), eq(desksTable.isActive, true)))
    .groupBy(desksTable.spaceId);
  const out = new Map<string, number>();
  for (const r of rows) {
    if (r.min != null) {
      // drizzle-orm `min()` over an integer column returns a string in pg.
      // Force to integer for downstream formatCents.
      const n = typeof r.min === 'number' ? r.min : Number.parseInt(String(r.min), 10);
      if (Number.isFinite(n)) out.set(r.spaceId, n);
    }
  }
  return out;
}

// Silences the import-but-unused lint warning when only the helper above
// uses `sql`. (Drizzle's typed builder doesn't expose a typed `MIN` cast,
// so the helper is written without raw sql today; keep the import here in
// case a future variant needs it.)
void sql;

export async function listDesksForSpace(spaceId: string): Promise<Desk[]> {
  return db
    .select()
    .from(desksTable)
    .where(eq(desksTable.spaceId, spaceId))
    .orderBy(asc(desksTable.createdAt));
}

// Public-facing variant: filters out is_active=false desks. Admin uses
// listDesksForSpace (above) so inactive desks remain visible/editable in
// the admin UI per US-2.4 deactivation flow.
export async function listActiveDesksForSpace(
  spaceId: string,
): Promise<Desk[]> {
  return db
    .select()
    .from(desksTable)
    .where(and(eq(desksTable.spaceId, spaceId), eq(desksTable.isActive, true)))
    .orderBy(asc(desksTable.createdAt));
}

export async function getDeskById(id: string): Promise<Desk | undefined> {
  const [row] = await db
    .select()
    .from(desksTable)
    .where(eq(desksTable.id, id))
    .limit(1);
  return row;
}

// Public-facing: collapses "missing" and "inactive" into the same undefined
// return. Booking action treats both as DESK_NOT_FOUND — the user just needs
// to know the desk isn't bookable; the distinction (deleted vs deactivated)
// is admin-only context.
export async function getActiveDeskById(
  id: string,
): Promise<Desk | undefined> {
  const [row] = await db
    .select()
    .from(desksTable)
    .where(and(eq(desksTable.id, id), eq(desksTable.isActive, true)))
    .limit(1);
  return row;
}

// Lets the unique-violation error bubble; the action layer maps it to
// DUPLICATE_LABEL with the verbatim PRD message.
export async function createDesk(
  spaceId: string,
  input: CreateDeskInput,
): Promise<Desk> {
  const [row] = await db
    .insert(desksTable)
    .values({
      spaceId,
      label: input.label,
      dailyPriceCents: input.dailyPriceCents,
      isActive: true,
    })
    .returning();
  return row;
}

// Same Postgres semantics as updateSpace: DEFAULT now() only fires on INSERT.
// Set updatedAt explicitly. Lets the unique-violation bubble (rename collision).
export async function updateDesk(
  id: string,
  input: EditDeskInput,
): Promise<Desk | undefined> {
  const [row] = await db
    .update(desksTable)
    .set({
      label: input.label,
      dailyPriceCents: input.dailyPriceCents,
      isActive: input.isActive,
      updatedAt: new Date(),
    })
    .where(eq(desksTable.id, id))
    .returning();
  return row;
}
