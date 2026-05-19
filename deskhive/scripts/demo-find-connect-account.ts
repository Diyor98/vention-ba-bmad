/**
 * One-off demo helper — find a real Connect account that:
 *   1) belongs to a SPACE_OWNER in our DB,
 *   2) is NOT the synthetic seed stub (`acct_seed_for_e2e_only`),
 *   3) returns successfully under our current platform STRIPE_SECRET_KEY
 *      via `stripe.accounts.retrieve(...)` (= our platform has access),
 *   4) has charges_enabled = true AND payouts_enabled = true (= ready
 *      for `stripe.payouts.create`).
 *
 * Reads-only. No DB writes, no Stripe writes. Never modifies handler code.
 *
 * Schema note: `stripe_account_id` lives on `stripe_connect_accounts`,
 * not on `users` — the user's SQL hint had it on `users`; we INNER JOIN.
 */

import { config } from 'dotenv';
config({ path: '.env.local' });
config({ path: '.env' });

import { and, desc, eq, ne } from 'drizzle-orm';
import Stripe from 'stripe';
import { db } from '@/db/client';
import { usersTable, stripeConnectAccountsTable } from '@/db/schema';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

const SEED_STUB = 'acct_seed_for_e2e_only';

type CandidateRow = {
  userId: string;
  email: string;
  role: string;
  stripeAccountId: string;
  dbChargesEnabled: boolean;
  dbPayoutsEnabled: boolean;
  dbOnboardingCompleted: boolean;
  dbUpdatedAt: Date;
};

async function loadCandidates(): Promise<CandidateRow[]> {
  return db
    .select({
      userId: usersTable.id,
      email: usersTable.email,
      role: usersTable.role,
      stripeAccountId: stripeConnectAccountsTable.stripeAccountId,
      dbChargesEnabled: stripeConnectAccountsTable.chargesEnabled,
      dbPayoutsEnabled: stripeConnectAccountsTable.payoutsEnabled,
      dbOnboardingCompleted: stripeConnectAccountsTable.onboardingCompleted,
      dbUpdatedAt: stripeConnectAccountsTable.updatedAt,
    })
    .from(stripeConnectAccountsTable)
    .innerJoin(
      usersTable,
      eq(usersTable.id, stripeConnectAccountsTable.userId),
    )
    .where(ne(stripeConnectAccountsTable.stripeAccountId, SEED_STUB))
    .orderBy(desc(stripeConnectAccountsTable.updatedAt));
}

type StripeProbeResult =
  | {
      ok: true;
      stripeChargesEnabled: boolean | undefined;
      stripePayoutsEnabled: boolean | undefined;
      stripeDetailsSubmitted: boolean | undefined;
    }
  | { ok: false; type: string; code: string | undefined; message: string };

async function probeStripe(accountId: string): Promise<StripeProbeResult> {
  try {
    const acct = await stripe.accounts.retrieve(accountId);
    return {
      ok: true,
      stripeChargesEnabled: acct.charges_enabled,
      stripePayoutsEnabled: acct.payouts_enabled,
      stripeDetailsSubmitted: acct.details_submitted,
    };
  } catch (err) {
    const e = err as {
      type?: string;
      code?: string;
      message?: string;
      rawType?: string;
    };
    return {
      ok: false,
      type: String(e.type ?? e.rawType ?? 'unknown'),
      code: e.code,
      message: String(e.message ?? err),
    };
  }
}

async function main() {
  console.log('=== STEP 1: candidate Connect rows from our DB ===\n');
  const candidates = await loadCandidates();
  if (candidates.length === 0) {
    console.log(
      'No Connect rows found (after excluding the synthetic seed stub).',
    );
    return;
  }
  console.log(
    JSON.stringify(
      candidates.map((c) => ({
        email: c.email,
        role: c.role,
        stripeAccountId: c.stripeAccountId,
        dbChargesEnabled: c.dbChargesEnabled,
        dbPayoutsEnabled: c.dbPayoutsEnabled,
        dbOnboardingCompleted: c.dbOnboardingCompleted,
        dbUpdatedAt: c.dbUpdatedAt.toISOString(),
      })),
      null,
      2,
    ),
  );

  console.log(
    `\n=== STEP 2: probing each candidate via stripe.accounts.retrieve() ===\n`,
  );
  type EnrichedRow = CandidateRow & { probe: StripeProbeResult };
  const enriched: EnrichedRow[] = [];
  for (const c of candidates) {
    const probe = await probeStripe(c.stripeAccountId);
    enriched.push({ ...c, probe });
    if (probe.ok) {
      console.log(
        `  ✓ ${c.stripeAccountId}  (${c.email})  charges=${probe.stripeChargesEnabled}  payouts=${probe.stripePayoutsEnabled}  details_submitted=${probe.stripeDetailsSubmitted}`,
      );
    } else {
      console.log(
        `  ✗ ${c.stripeAccountId}  (${c.email})  ${probe.type}/${probe.code ?? '-'}  "${probe.message}"`,
      );
    }
  }

  console.log(
    '\n=== STEP 3: payout-ready candidates (SPACE_OWNER + charges + payouts + accessible) ===\n',
  );
  const payoutReady = enriched.filter(
    (r) =>
      r.role === 'SPACE_OWNER' &&
      r.probe.ok &&
      r.probe.stripeChargesEnabled === true &&
      r.probe.stripePayoutsEnabled === true,
  );
  if (payoutReady.length === 0) {
    console.log(
      'No candidate satisfies all 4 conditions. Nothing to pay out from this platform key.',
    );
    return;
  }
  for (const r of payoutReady) {
    console.log(
      `  → ${r.stripeAccountId}  (${r.email}, role ${r.role}, db updated ${r.dbUpdatedAt.toISOString()})`,
    );
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
