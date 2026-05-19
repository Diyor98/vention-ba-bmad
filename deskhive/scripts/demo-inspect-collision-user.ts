import { config } from 'dotenv';
config({ path: '.env.local' });
config({ path: '.env' });

import { eq } from 'drizzle-orm';
import { db } from '@/db/client';
import {
  usersTable,
  stripeConnectAccountsTable,
  spacesTable,
} from '@/db/schema';

const COLLIDING_USER_ID = '95feadca-52b5-419b-8490-0cac7ea5708d';

async function main() {
  console.log('=== users row ===');
  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, COLLIDING_USER_ID));
  console.log(JSON.stringify(user, null, 2));

  console.log('\n=== stripe_connect_accounts row (if any) ===');
  const [connect] = await db
    .select()
    .from(stripeConnectAccountsTable)
    .where(eq(stripeConnectAccountsTable.userId, COLLIDING_USER_ID));
  console.log(JSON.stringify(connect ?? null, null, 2));

  console.log('\n=== spaces owned (if any) ===');
  const spaces = await db
    .select({
      id: spacesTable.id,
      name: spacesTable.name,
      city: spacesTable.city,
      status: spacesTable.status,
      createdAt: spacesTable.createdAt,
    })
    .from(spacesTable)
    .where(eq(spacesTable.ownerId, COLLIDING_USER_ID));
  console.log(JSON.stringify(spaces, null, 2));
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
