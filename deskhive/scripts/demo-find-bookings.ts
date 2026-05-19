/**
 * Phase B prep — find bookings that can drive the receipt email path
 * to the Resend-verified recipient.
 *
 * Receipt email recipient = info.guest.email (NOT owner.email). After
 * Phase A, only `marketadteam@gmail.com` (user 6926057b-...) is
 * Resend-verified. So a booking that exercises the receipt email path
 * AND delivers to a real inbox must have guestUserId = 6926057b-...
 *
 * Reports:
 *   1. All bookings owned by guestUserId = 6926057b-... (SPACE_OWNER
 *      user at marketadteam@gmail.com)
 *   2. All bookings with non-null paymentIntentId across the whole
 *      table — useful to know how many Phase 2 bookings exist
 *
 * Read-only.
 */

import { config } from 'dotenv';
config({ path: '.env.local' });
config({ path: '.env' });

import { desc, eq, isNotNull, sql } from 'drizzle-orm';
import { db } from '@/db/client';
import { bookingsTable, usersTable, spacesTable } from '@/db/schema';

const SPACE_OWNER_USER_ID = '6926057b-7913-4f21-b385-1407d45262c0';

async function main() {
  console.log('=== STEP 1: bookings WHERE guest_user_id = SPACE_OWNER demo user ===');
  const ownerBookings = await db
    .select({
      id: bookingsTable.id,
      status: bookingsTable.status,
      paymentStatus: bookingsTable.paymentStatus,
      paymentIntentId: bookingsTable.paymentIntentId,
      bookingDate: bookingsTable.bookingDate,
      totalCents: bookingsTable.totalCents,
      spaceId: bookingsTable.spaceId,
      spaceName: spacesTable.name,
      guestEmail: usersTable.email,
      createdAt: bookingsTable.createdAt,
    })
    .from(bookingsTable)
    .leftJoin(spacesTable, eq(bookingsTable.spaceId, spacesTable.id))
    .leftJoin(usersTable, eq(bookingsTable.guestUserId, usersTable.id))
    .where(eq(bookingsTable.guestUserId, SPACE_OWNER_USER_ID))
    .orderBy(desc(bookingsTable.createdAt));
  console.log(`  count = ${ownerBookings.length}`);
  console.log(JSON.stringify(ownerBookings, null, 2));

  console.log('\n=== STEP 2: counts by (status, payment_status) across all Phase 2 bookings ===');
  const phase2Counts = await db
    .select({
      status: bookingsTable.status,
      paymentStatus: bookingsTable.paymentStatus,
      n: sql<number>`count(*)::int`,
    })
    .from(bookingsTable)
    .where(isNotNull(bookingsTable.paymentIntentId))
    .groupBy(bookingsTable.status, bookingsTable.paymentStatus);
  console.log(JSON.stringify(phase2Counts, null, 2));

  console.log('\n=== STEP 3: most-recent 10 Phase 2 bookings (with guest emails) ===');
  const recent = await db
    .select({
      id: bookingsTable.id,
      status: bookingsTable.status,
      paymentStatus: bookingsTable.paymentStatus,
      paymentIntentId: bookingsTable.paymentIntentId,
      totalCents: bookingsTable.totalCents,
      bookingDate: bookingsTable.bookingDate,
      guestEmail: usersTable.email,
      guestUserId: bookingsTable.guestUserId,
      createdAt: bookingsTable.createdAt,
    })
    .from(bookingsTable)
    .leftJoin(usersTable, eq(bookingsTable.guestUserId, usersTable.id))
    .where(isNotNull(bookingsTable.paymentIntentId))
    .orderBy(desc(bookingsTable.createdAt))
    .limit(10);
  console.log(JSON.stringify(recent, null, 2));
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
