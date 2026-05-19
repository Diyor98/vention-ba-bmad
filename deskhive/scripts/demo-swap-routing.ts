/**
 * Phase A2 / Phase D — Atomic swap of which demo user holds
 * `marketadteam@gmail.com` (the Resend-verified address).
 *
 * Usage:
 *   pnpm tsx scripts/demo-swap-routing.ts to-guest   # Phase A2 — guest verifies receipt + refund
 *   pnpm tsx scripts/demo-swap-routing.ts to-owner   # Phase D — owner verifies payout
 *
 * Sequence (UNIQUE-constraint-safe):
 *   1. Move whichever row currently holds marketadteam@gmail.com aside
 *      to a placeholder address.
 *   2. Move the target row INTO marketadteam@gmail.com.
 *
 * Targeting by user.id (not email LIKE) so future renames don't break
 * the script. Idempotent on re-runs of the same direction.
 */

import { config } from 'dotenv';
config({ path: '.env.local' });
config({ path: '.env' });

import { eq, inArray } from 'drizzle-orm';
import { db } from '@/db/client';
import { usersTable } from '@/db/schema';

const SPACE_OWNER_ID = '6926057b-7913-4f21-b385-1407d45262c0';
const GUEST_ID = 'f18ca0c0-ae30-40b0-9828-ccf57dd6ec1f';

const VERIFIED_EMAIL = 'marketadteam@gmail.com';
const OWNER_PLACEHOLDER = 'owner-placeholder@deskhive.local';
const GUEST_PLACEHOLDER = 'guest-demo-placeholder@deskhive.local';

type Direction = 'to-guest' | 'to-owner';

function parseDirection(): Direction {
  const arg = (process.argv[2] ?? '').toLowerCase();
  if (arg === 'to-guest' || arg === 'to-owner') return arg;
  console.error(
    'Usage: pnpm tsx scripts/demo-swap-routing.ts <to-guest|to-owner>',
  );
  process.exit(2);
}

async function main() {
  const direction = parseDirection();
  console.log(`=== Swap direction: ${direction} ===\n`);

  // Step 1 — move whichever role currently holds marketadteam aside,
  // then move the target role in. Two-step to respect UNIQUE.
  if (direction === 'to-guest') {
    // OWNER → placeholder, then GUEST → verified.
    await db
      .update(usersTable)
      .set({ email: OWNER_PLACEHOLDER, updatedAt: new Date() })
      .where(eq(usersTable.id, SPACE_OWNER_ID));
    await db
      .update(usersTable)
      .set({ email: VERIFIED_EMAIL, updatedAt: new Date() })
      .where(eq(usersTable.id, GUEST_ID));
  } else {
    // GUEST → placeholder, then OWNER → verified.
    await db
      .update(usersTable)
      .set({ email: GUEST_PLACEHOLDER, updatedAt: new Date() })
      .where(eq(usersTable.id, GUEST_ID));
    await db
      .update(usersTable)
      .set({ email: VERIFIED_EMAIL, updatedAt: new Date() })
      .where(eq(usersTable.id, SPACE_OWNER_ID));
  }

  console.log('=== post-swap state ===');
  const rows = await db
    .select({
      id: usersTable.id,
      email: usersTable.email,
      role: usersTable.role,
      fullName: usersTable.fullName,
    })
    .from(usersTable)
    .where(inArray(usersTable.id, [SPACE_OWNER_ID, GUEST_ID]));
  console.log(JSON.stringify(rows, null, 2));
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
