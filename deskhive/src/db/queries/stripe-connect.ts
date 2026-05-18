import { eq } from 'drizzle-orm';
import { db } from '@/db/client';
import {
  stripeConnectAccountsTable,
  type StripeConnectAccount,
  type NewStripeConnectAccount,
} from '@/db/schema';

/**
 * Story 9-2: query helpers for `stripe_connect_accounts`.
 *
 * Consumed by Server Actions (`src/actions/connect.ts`) and the webhook
 * route (`src/app/api/stripe/webhook/route.ts`). No Stripe API calls
 * happen here — that's the service-layer's job
 * (`src/lib/payments/connect.ts`).
 */

export async function getConnectAccountByUserId(
  userId: string,
): Promise<StripeConnectAccount | null> {
  const [row] = await db
    .select()
    .from(stripeConnectAccountsTable)
    .where(eq(stripeConnectAccountsTable.userId, userId))
    .limit(1);
  return row ?? null;
}

export async function getConnectAccountByStripeAccountId(
  stripeAccountId: string,
): Promise<StripeConnectAccount | null> {
  const [row] = await db
    .select()
    .from(stripeConnectAccountsTable)
    .where(eq(stripeConnectAccountsTable.stripeAccountId, stripeAccountId))
    .limit(1);
  return row ?? null;
}

/**
 * Upsert keyed on `userId` (the table's unique constraint). Used for
 * both the first-onboarding-click insert and the subsequent status
 * refreshes (both from `refreshConnectStatusAction` and from the
 * `account.updated` webhook handler).
 *
 * The three boolean flags are optional on update so callers can do
 * partial updates without re-supplying values they don't have.
 */
export async function upsertConnectAccount(args: {
  userId: string;
  stripeAccountId: string;
  onboardingCompleted?: boolean;
  chargesEnabled?: boolean;
  payoutsEnabled?: boolean;
}): Promise<StripeConnectAccount> {
  // Strict typing per Story 9-2 follow-up: Drizzle's `set:` parameter
  // for onConflictDoUpdate expects Partial<table.$inferInsert>. The
  // earlier `Record<string, unknown>` form was lax enough for TS to
  // accept invalid keys at compile time and surface them as opaque
  // "Failed query" runtime errors with no underlying message.
  const updateSet: Partial<NewStripeConnectAccount> = {
    stripeAccountId: args.stripeAccountId,
    updatedAt: new Date(),
  };
  if (args.onboardingCompleted !== undefined) {
    updateSet.onboardingCompleted = args.onboardingCompleted;
  }
  if (args.chargesEnabled !== undefined) {
    updateSet.chargesEnabled = args.chargesEnabled;
  }
  if (args.payoutsEnabled !== undefined) {
    updateSet.payoutsEnabled = args.payoutsEnabled;
  }

  const [row] = await db
    .insert(stripeConnectAccountsTable)
    .values({
      userId: args.userId,
      stripeAccountId: args.stripeAccountId,
      onboardingCompleted: args.onboardingCompleted ?? false,
      chargesEnabled: args.chargesEnabled ?? false,
      payoutsEnabled: args.payoutsEnabled ?? false,
    })
    .onConflictDoUpdate({
      target: stripeConnectAccountsTable.userId,
      set: updateSet,
    })
    .returning();

  if (!row) {
    throw new Error(
      `upsertConnectAccount returned no row for userId=${args.userId}`,
    );
  }
  return row;
}
