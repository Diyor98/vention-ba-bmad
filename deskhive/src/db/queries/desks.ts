import { eq, asc } from 'drizzle-orm';
import { db } from '@/db/client';
import { desksTable, type Desk } from '@/db/schema';
import type { CreateDeskInput, EditDeskInput } from '@/lib/validation/desk';

export async function listDesksForSpace(spaceId: string): Promise<Desk[]> {
  return db
    .select()
    .from(desksTable)
    .where(eq(desksTable.spaceId, spaceId))
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
