/**
 * Story 7-PREP-1: seed-state helpers for E2E tests. Reads from the same
 * Neon DB the seed script populates; cross-tenant test (AC-5) needs the
 * seeded owner's space id at runtime since UUIDs aren't predictable.
 */

import { and, eq } from 'drizzle-orm';
import { db } from '@/db/client';
import {
  applicationsTable,
  bookingsTable,
  desksTable,
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

/**
 * Story 8-3: inserts a PENDING booking directly via the db client,
 * bypassing the Server Action. Used by E2E specs that need a fresh
 * PENDING booking to test cancellation/confirmation flows without
 * triggering notifyBookingRequested (which would pollute the recording
 * file mid-test).
 *
 * Resolves space + desk by space name (the seed marker `'Seeded Owner
 * Coworks'`). bookingDate defaults to 14 days out — well clear of the
 * past-date validation.
 *
 * Returns the new booking's id.
 */
export async function createPendingBookingViaDb(opts: {
  guestEmail: string;
  spaceName: string;
  bookingDate?: string; // YYYY-MM-DD, default = 14 days out
  deskLabel?: string; // default = first desk on the space (typically 'Desk 1')
}): Promise<string> {
  const [guest] = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(eq(usersTable.email, opts.guestEmail))
    .limit(1);
  if (!guest) {
    throw new Error(`Guest not found: ${opts.guestEmail}`);
  }

  const [space] = await db
    .select({ id: spacesTable.id })
    .from(spacesTable)
    .where(eq(spacesTable.name, opts.spaceName))
    .limit(1);
  if (!space) {
    throw new Error(`Space not found: ${opts.spaceName}`);
  }

  const [desk] = opts.deskLabel
    ? await db
        .select({ id: desksTable.id, price: desksTable.dailyPriceCents })
        .from(desksTable)
        .where(
          and(
            eq(desksTable.spaceId, space.id),
            eq(desksTable.label, opts.deskLabel),
          ),
        )
        .limit(1)
    : await db
        .select({ id: desksTable.id, price: desksTable.dailyPriceCents })
        .from(desksTable)
        .where(eq(desksTable.spaceId, space.id))
        .limit(1);
  if (!desk) {
    throw new Error(
      `No desk found on ${opts.spaceName}` +
        (opts.deskLabel ? ` with label '${opts.deskLabel}'` : ''),
    );
  }

  // Default booking date = today + 14 days (UTC) to avoid past-date
  // rejection in any UI re-validation.
  const bookingDate =
    opts.bookingDate ??
    (() => {
      const d = new Date();
      d.setUTCDate(d.getUTCDate() + 14);
      return d.toISOString().slice(0, 10);
    })();

  // Defensive: clear any existing PENDING/CONFIRMED booking on this
  // (desk, date) slot to avoid the partial-unique-index violation. Test
  // detritus from prior failed runs can leave stale bookings; this
  // makes the helper idempotent across runs.
  await db
    .delete(bookingsTable)
    .where(
      and(
        eq(bookingsTable.deskId, desk.id),
        eq(bookingsTable.bookingDate, bookingDate),
      ),
    );

  const [row] = await db
    .insert(bookingsTable)
    .values({
      guestUserId: guest.id,
      spaceId: space.id,
      deskId: desk.id,
      bookingDate,
      status: 'PENDING',
      totalPriceCents: desk.price,
    })
    .returning({ id: bookingsTable.id });

  return row.id;
}
