/**
 * Story 7-PREP-1: seed-state helpers for E2E tests. Reads from the same
 * Neon DB the seed script populates; cross-tenant test (AC-5) needs the
 * seeded owner's space id at runtime since UUIDs aren't predictable.
 */

import { and, eq } from 'drizzle-orm';
import { db } from '@/db/client';
import {
  applicationsTable,
  spacesTable,
  usersTable,
  type ApplicationStatus,
} from '@/db/schema';

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

/**
 * Story 8-2: returns the id of an application owned by the user with the
 * given email + matching status. Used by the E2E specs to navigate
 * directly to /admin/applications/[id] without scraping the list page.
 *
 * Throws if no matching application exists — typically a sign that a
 * prior test mutated state and the seed needs to be re-run.
 */
export async function getApplicationIdByEmailAndStatus(
  email: string,
  status: ApplicationStatus,
): Promise<string> {
  const userId = await getSeededUserId(email);
  const [row] = await db
    .select({ id: applicationsTable.id })
    .from(applicationsTable)
    .where(
      and(
        eq(applicationsTable.userId, userId),
        eq(applicationsTable.status, status),
      ),
    )
    .limit(1);
  if (!row) {
    throw new Error(
      `No ${status} application found for ${email}. Did a prior test mutate state? Run \`pnpm db:seed\` to reset.`,
    );
  }
  return row.id;
}

/**
 * Story 8-2: returns the current role of a seeded user. Used by the
 * Story 8-2 E2E spec to assert atomic role promotion still works after
 * the approval flow (Story 7-2 regression check).
 */
export async function getSeededUserRole(email: string): Promise<string> {
  const [row] = await db
    .select({ role: usersTable.role })
    .from(usersTable)
    .where(eq(usersTable.email, email))
    .limit(1);
  if (!row) {
    throw new Error(`Seeded user not found: ${email}`);
  }
  return row.role;
}
