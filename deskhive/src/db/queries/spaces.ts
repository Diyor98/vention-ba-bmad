import { eq, ilike, and, desc } from 'drizzle-orm';
import { db } from '@/db/client';
import { spacesTable, type Space } from '@/db/schema';
import type { CreateSpaceInput } from '@/lib/validation/space';

export async function listAllSpaces(): Promise<Space[]> {
  return db.select().from(spacesTable).orderBy(desc(spacesTable.createdAt));
}

// Story 7-5: owner-scoped list — returns only spaces where owner_id matches.
// Same ordering as listAllSpaces (createdAt DESC). Defense-in-depth seam:
// the SQL WHERE is the authoritative filter; route guards are the first
// line. See memory `reference_owner_scoped_crud_pattern.md`.
export async function listSpacesForOwner(
  ownerId: string,
): Promise<Space[]> {
  return db
    .select()
    .from(spacesTable)
    .where(eq(spacesTable.ownerId, ownerId))
    .orderBy(desc(spacesTable.createdAt));
}

// Story 7-5: returns the row only if owner_id matches the caller. NOT_FOUND
// not FORBIDDEN for cross-tenant mismatches — Decision §8 leak-prevention
// principle (an owner asking about another owner's space gets the same
// response as a genuinely-missing row).
export async function getSpaceByIdForOwner(
  id: string,
  ownerId: string,
): Promise<Space | undefined> {
  const [row] = await db
    .select()
    .from(spacesTable)
    .where(and(eq(spacesTable.id, id), eq(spacesTable.ownerId, ownerId)))
    .limit(1);
  return row;
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

// Public-facing variant: only returns the row when status='PUBLISHED'.
// Admin uses getSpaceById (no status filter) so SUSPENDED spaces remain
// editable from the admin UI.
export async function getPublishedSpaceById(
  id: string,
): Promise<Space | undefined> {
  const [row] = await db
    .select()
    .from(spacesTable)
    .where(and(eq(spacesTable.id, id), eq(spacesTable.status, 'PUBLISHED')))
    .limit(1);
  return row;
}

// Story 7-5: optional `ownerId` parameter. SPACE_OWNER callers (via
// createSpaceAction) pass their own id; SUPER_ADMIN callers omit it,
// preserving the Phase 1 owner_id = NULL behavior. The column itself
// remains nullable per the Story 7-1 schema (architecture.md §7.4).
export async function createSpace(
  input: CreateSpaceInput,
  ownerId?: string,
): Promise<Space> {
  const [row] = await db
    .insert(spacesTable)
    .values({
      name: input.name,
      city: input.city,
      addressLine: input.addressLine,
      description: input.description,
      primaryImageUrl: input.primaryImageUrl,
      ownerId: ownerId ?? null,
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
