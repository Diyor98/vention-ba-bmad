import { eq, desc } from 'drizzle-orm';
import { db } from '@/db/client';
import { spacesTable, type Space } from '@/db/schema';
import type { CreateSpaceInput } from '@/lib/validation/space';

export async function listAllSpaces(): Promise<Space[]> {
  return db.select().from(spacesTable).orderBy(desc(spacesTable.createdAt));
}

export async function getSpaceById(id: string): Promise<Space | undefined> {
  const [row] = await db
    .select()
    .from(spacesTable)
    .where(eq(spacesTable.id, id))
    .limit(1);
  return row;
}

export async function createSpace(input: CreateSpaceInput): Promise<Space> {
  const [row] = await db
    .insert(spacesTable)
    .values({
      name: input.name,
      city: input.city,
      addressLine: input.addressLine,
      description: input.description,
      primaryImageUrl: input.primaryImageUrl,
      // status defaults to 'PUBLISHED' at the DB level; explicit for clarity.
      status: 'PUBLISHED',
    })
    .returning();
  return row;
}

// Postgres' DEFAULT now() fires on INSERT only; Drizzle doesn't auto-bump
// updatedAt either. Set it explicitly on every UPDATE.
export async function updateSpace(
  id: string,
  input: CreateSpaceInput,
): Promise<Space | undefined> {
  const [row] = await db
    .update(spacesTable)
    .set({
      name: input.name,
      city: input.city,
      addressLine: input.addressLine,
      description: input.description,
      primaryImageUrl: input.primaryImageUrl,
      updatedAt: new Date(),
    })
    .where(eq(spacesTable.id, id))
    .returning();
  return row;
}
