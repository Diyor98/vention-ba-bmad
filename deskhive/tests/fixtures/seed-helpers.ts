/**
 * Story 7-PREP-1: seed-state helpers for E2E tests. Reads from the same
 * Neon DB the seed script populates; cross-tenant test (AC-5) needs the
 * seeded owner's space id at runtime since UUIDs aren't predictable.
 */

import { eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { spacesTable, usersTable } from '@/db/schema';

/**
 * Returns the id of the space owned by `owner@deskhive.local` that the
 * Story 7-5 seed inserts (name marker: 'Seeded Owner Coworks'). Throws
 * with a clear error if the seed hasn't run.
 *
 * The query goes by name marker rather than by id literal because UUIDs
 * are non-deterministic across seed runs and across machines.
 */
export async function getSeededOwnerSpaceId(): Promise<string> {
  const [row] = await db
    .select({ id: spacesTable.id })
    .from(spacesTable)
    .where(eq(spacesTable.name, 'Seeded Owner Coworks'))
    .limit(1);
  if (!row) {
    throw new Error(
      'Seeded owner space not found in DB. Run `pnpm db:seed` before E2E tests.',
    );
  }
  return row.id;
}

/**
 * Returns the user id for a seeded email. Used by tests that need to
 * compare ownership ids or verify role state in the DB.
 */
export async function getSeededUserId(email: string): Promise<string> {
  const [row] = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(eq(usersTable.email, email))
    .limit(1);
  if (!row) {
    throw new Error(
      `Seeded user not found in DB: ${email}. Run \`pnpm db:seed\` before E2E tests.`,
    );
  }
  return row.id;
}
