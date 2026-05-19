/**
 * One-off demo helper — read recent webhook_events rows for the
 * `payout.paid` event type. Used to capture before/after snapshots
 * around a `stripe trigger payout.paid` run during demo prep.
 *
 * Usage: pnpm tsx scripts/demo-payout-check.ts
 *
 * Reads only — no writes. Does NOT touch handler code. Does NOT call
 * Stripe.
 */

import { config } from 'dotenv';
config({ path: '.env.local' });
config({ path: '.env' });

import { and, desc, eq, gte, sql } from 'drizzle-orm';
import { db } from '@/db/client';
import { webhookEventsTable } from '@/db/schema';

async function main() {
  // 5-minute window from now. Matches the user's reseed query
  // window so before/after are apples to apples.
  const cutoff = new Date(Date.now() - 5 * 60 * 1000);

  const rows = await db
    .select({
      id: webhookEventsTable.id,
      eventType: webhookEventsTable.eventType,
      stripeEventId: webhookEventsTable.stripeEventId,
      processedAt: webhookEventsTable.processedAt,
      connectAccount: sql<string>`${webhookEventsTable.payload}->>'account'`,
    })
    .from(webhookEventsTable)
    .where(
      and(
        eq(webhookEventsTable.eventType, 'payout.paid'),
        gte(webhookEventsTable.processedAt, cutoff),
      ),
    )
    .orderBy(desc(webhookEventsTable.processedAt))
    .limit(5);

  console.log(
    `payout.paid rows in last 5 minutes (count = ${rows.length}):`,
  );
  console.log(JSON.stringify(rows, null, 2));

  // Lifetime total — broader sanity check.
  const allTime = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(webhookEventsTable)
    .where(eq(webhookEventsTable.eventType, 'payout.paid'));
  console.log(`\nlifetime payout.paid count: ${allTime[0]?.n ?? 0}`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
