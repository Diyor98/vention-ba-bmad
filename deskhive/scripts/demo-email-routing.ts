/**
 * One-off script — Demo email routing.
 *
 * Routes the two demo accounts (`owner-no-connect@deskhive.local` and
 * `1test@mail.com`) to plus-addressed variants of the demo inbox
 * (`marketadteam@gmail.com`) so the demo session can observe all
 * transactional emails landing in one Gmail folder.
 *
 * Plus-addressing is required because users.email has a UNIQUE
 * constraint and another row (likely the BA's actual account) already
 * owns the bare `marketadteam@gmail.com` address. Gmail collapses
 * `marketadteam+anything@gmail.com` into the same inbox.
 *
 * Routing map:
 *   owner-no-connect@deskhive.local  →  marketadteam+owner@gmail.com
 *   1test@mail.com                   →  marketadteam+1test@gmail.com
 *
 * Only updates `users.email`. Does NOT touch passwords, roles, names,
 * or the `account` table. Better Auth's credential lookup uses
 * `account.accountId` which stays at the original value — so logging
 * in with the original email continues to work.
 *
 * Reversion SQL is documented in docs/design/DEMO-EMAIL-ROUTING-NOTE.md.
 */

import { config } from 'dotenv';
config({ path: '.env.local' });
config({ path: '.env' });

import { eq, inArray } from 'drizzle-orm';
import { db } from '@/db/client';
import { usersTable } from '@/db/schema';

const ROUTING_MAP: Record<string, string> = {
  'owner-no-connect@deskhive.local': 'marketadteam+owner@gmail.com',
  '1test@mail.com': 'marketadteam+1test@gmail.com',
};

const SOURCE_EMAILS = Object.keys(ROUTING_MAP);

async function main() {
  console.log('=== STEP 1: current rows (pre-update) ===');
  const before = await db
    .select({
      id: usersTable.id,
      email: usersTable.email,
      fullName: usersTable.fullName,
      role: usersTable.role,
    })
    .from(usersTable)
    .where(inArray(usersTable.email, SOURCE_EMAILS));
  console.log(JSON.stringify(before, null, 2));
  if (before.length === 0) {
    console.warn(
      'No matching rows for the requested demo emails — nothing to update.',
    );
    process.exit(0);
  }

  console.log('\n=== STEP 2: applying updates (plus-addressed) ===');
  for (const row of before) {
    const target = ROUTING_MAP[row.email];
    if (!target) continue;
    const result = await db
      .update(usersTable)
      .set({ email: target, updatedAt: new Date() })
      .where(eq(usersTable.id, row.id))
      .returning({ id: usersTable.id, email: usersTable.email });
    console.log(
      `  ${row.email}  →  ${result[0]?.email}  (id=${row.id})`,
    );
  }

  console.log('\n=== STEP 3: post-update verification ===');
  const after = await db
    .select({
      id: usersTable.id,
      email: usersTable.email,
      fullName: usersTable.fullName,
      role: usersTable.role,
    })
    .from(usersTable)
    .where(
      inArray(
        usersTable.id,
        before.map((r) => r.id),
      ),
    );
  console.log(JSON.stringify(after, null, 2));
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
