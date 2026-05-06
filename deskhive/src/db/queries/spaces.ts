import { eq, ilike, and, desc } from 'drizzle-orm';
import { db } from '@/db/client';
import { spacesTable, type Space } from '@/db/schema';
import type { CreateSpaceInput } from '@/lib/validation/space';

export async function listAllSpaces(): Promise<Space[]> {
  return db.select().from(spacesTable).orderBy(desc(spacesTable.createdAt));
}

// Public-facing query: only PUBLISHED rows are visible to unauthenticated
// visitors and Guests. SUSPENDED rows still exist in the table (admin-only
// state) and remain visible via listAllSpaces. Optional `city` filter uses
// `ilike` for case-insensitive equality (no wildcards — exact match by spec).
export async function listPublishedSpaces(opts?: {
  city?: string;
}): Promise<Space[]> {
  const where = opts?.city
    ? and(
        eq(spacesTable.status, 'PUBLISHED'),
        ilike(spacesTable.city, opts.city),
      )
    : eq(spacesTable.status, 'PUBLISHED');
  return db
    .select()
    .from(spacesTable)
    .where(where)
    .orderBy(desc(spacesTable.createdAt));
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
