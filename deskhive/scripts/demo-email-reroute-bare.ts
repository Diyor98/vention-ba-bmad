/**
 * Phase A — Consolidate demo email routing to bare marketadteam.
 *
 * Sequence (idempotent + collision-aware):
 *   0. Move the orphaned "Martin" self-signup aside FIRST. Martin
 *      currently holds `marketadteam@gmail.com` from a May 14
 *      self-signup that never completed Connect onboarding and has
 *      no spaces. Renamed to `martin-placeholder@deskhive.local` so
 *      the bare address is freed for the SPACE_OWNER demo row. Row
 *      stays in the table for forensics.
 *   1. Report current state of the demo rows (by user id).
 *   2. Collision sentinel — bail if any OTHER row still holds the
 *      target email after the Martin move (should not happen).
 *   3. UPDATE the SPACE_OWNER demo user → marketadteam@gmail.com.
 *   4. UPDATE the GUEST demo user → guest-demo-placeholder@deskhive.local
 *      (frees the +1test alias).
 *   5. Re-report all three touched rows.
 *
 * Targeting by user.id (not email LIKE) — emails were last rewritten in
 * commit a1c7179, so the IDs are the stable key.
 */

import { config } from 'dotenv';
config({ path: '.env.local' });
config({ path: '.env' });

import { eq, inArray, ne, and } from 'drizzle-orm';
import { db } from '@/db/client';
import { usersTable } from '@/db/schema';

const MARTIN_ID = '95feadca-52b5-419b-8490-0cac7ea5708d';
const SPACE_OWNER_ID = '6926057b-7913-4f21-b385-1407d45262c0';
const GUEST_ID = 'f18ca0c0-ae30-40b0-9828-ccf57dd6ec1f';

const MARTIN_NEW_EMAIL = 'martin-placeholder@deskhive.local';
const NEW_OWNER_EMAIL = 'marketadteam@gmail.com';
const NEW_GUEST_EMAIL = 'guest-demo-placeholder@deskhive.local';

const TARGET_IDS = [MARTIN_ID, SPACE_OWNER_ID, GUEST_ID];

async function main() {
  console.log('=== STEP 0: move "Martin" aside (frees marketadteam@gmail.com) ===');
  const martinResult = await db
    .update(usersTable)
    .set({ email: MARTIN_NEW_EMAIL, updatedAt: new Date() })
    .where(eq(usersTable.id, MARTIN_ID))
    .returning({ id: usersTable.id, email: usersTable.email });
  console.log(JSON.stringify(martinResult, null, 2));

  console.log('\n=== STEP 1: current state of the demo rows ===');
  const before = await db
    .select({
      id: usersTable.id,
      email: usersTable.email,
      role: usersTable.role,
      fullName: usersTable.fullName,
    })
    .from(usersTable)
    .where(inArray(usersTable.id, [SPACE_OWNER_ID, GUEST_ID]));
  console.log(JSON.stringify(before, null, 2));

  console.log(
    `\n=== STEP 2: collision sentinel — confirm "${NEW_OWNER_EMAIL}" is now free ===`,
  );
  const collision = await db
    .select({ id: usersTable.id, email: usersTable.email, role: usersTable.role })
    .from(usersTable)
    .where(
      and(
        eq(usersTable.email, NEW_OWNER_EMAIL),
        ne(usersTable.id, SPACE_OWNER_ID),
      ),
    );
  if (collision.length > 0) {
    console.log(
      `  ✗ unexpected collision after Martin move — ${collision.length} other row(s) hold "${NEW_OWNER_EMAIL}":`,
    );
    console.log(JSON.stringify(collision, null, 2));
    console.log('\n  Bailing. Investigate before re-running.');
    return;
  }
  console.log(`  ✓ "${NEW_OWNER_EMAIL}" is free.`);

  console.log('\n=== STEP 3: UPDATE SPACE_OWNER row ===');
  const ownerResult = await db
    .update(usersTable)
    .set({ email: NEW_OWNER_EMAIL, updatedAt: new Date() })
    .where(eq(usersTable.id, SPACE_OWNER_ID))
    .returning({ id: usersTable.id, email: usersTable.email });
  console.log(JSON.stringify(ownerResult, null, 2));

  console.log('\n=== STEP 4: UPDATE GUEST row ===');
  const guestResult = await db
    .update(usersTable)
    .set({ email: NEW_GUEST_EMAIL, updatedAt: new Date() })
    .where(eq(usersTable.id, GUEST_ID))
    .returning({ id: usersTable.id, email: usersTable.email });
  console.log(JSON.stringify(guestResult, null, 2));

  console.log('\n=== STEP 5: post-update state for all 3 touched rows ===');
  const after = await db
    .select({
      id: usersTable.id,
      email: usersTable.email,
      role: usersTable.role,
      fullName: usersTable.fullName,
    })
    .from(usersTable)
    .where(inArray(usersTable.id, TARGET_IDS));
  console.log(JSON.stringify(after, null, 2));
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
