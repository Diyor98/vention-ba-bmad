import { eq, asc } from 'drizzle-orm';
import { db } from '@/db/client';
import { desksTable, type Desk } from '@/db/schema';
import type { CreateDeskInput } from '@/lib/validation/desk';

export async function listDesksForSpace(spaceId: string): Promise<Desk[]> {
  return db
    .select()
    .from(desksTable)
    .where(eq(desksTable.spaceId, spaceId))
    .orderBy(asc(desksTable.createdAt));
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
