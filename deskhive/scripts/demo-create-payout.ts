/**
 * One-off demo helper — create a standard (bank-routed) payout via the
 * Stripe SDK against a Connect account.
 *
 * STANDARD path: the live app's payout flow inherits Stripe's standard
 * scheduled payouts; this script exercises the same path on demand by
 * (a) priming `balance.available` via a test-mode topup and then
 * (b) calling `stripe.payouts.create` WITHOUT `method: 'instant'`. The
 * resulting `payout.paid` webhook routes through `stripe listen` →
 * /api/stripe/webhook → handlePayoutPaid (Story 9-7 audit-only +
 * Story 8-4 payout email).
 *
 * History (preserved for traceability):
 *   • First DESIGN-DEMO run used `method: 'instant'` to bypass the
 *     test-mode pending→available settlement clock. That payout
 *     transitioned to "Failed" because Express test-mode accounts
 *     don't have a debit card attached for instant-rails routing.
 *     The handler integration was proven on the way through —
 *     webhook_events row landed for that event. The failed payout
 *     stays as evidence of the failure-path handler working;
 *     this script does NOT delete it.
 *
 * NEVER touches handler code. NEVER writes to the local DB.
 */

// Project convention (see scripts/seed.ts, scripts/demo-email-routing.ts):
// .env.local overrides .env. STRIPE_SECRET_KEY lives only in .env.local
// for this repo, so `import 'dotenv/config'` alone would leave the SDK
// constructor without an apiKey.
import { config } from 'dotenv';
config({ path: '.env.local' });
config({ path: '.env' });

import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

async function main() {
  // NB: capital "I" + lowercase "y" — `acct_1TYPobRuteminPIy`. An earlier
  // run used the visually-identical `acct_1TYPobRuteminPly` (lowercase
  // "l") copied from a screenshot, which 403'd as `account_invalid`.
  // The canonical source for this ID is the database, not the dashboard
  // screenshot. See scripts/demo-find-connect-account.ts.
  const connectAccountId = 'acct_1TYPobRuteminPIy';

  // Check balance first. `balance.retrieve` takes no body params — the
  // connect-account scope goes through the *second* arg (per-request
  // RequestOptions, which the SDK turns into a `Stripe-Account` header).
  // Passing it as a first-arg field yields a 400 with
  // `Received unknown parameter: stripeAccount`.
  const balance = await stripe.balance.retrieve(undefined, {
    stripeAccount: connectAccountId,
  });
  console.log('Balance:', JSON.stringify(balance, null, 2));

  // STEP 1 — Prime the available balance via a test-mode topup.
  //
  // `topups.create` adds funds directly to `balance.available` (skipping
  // the pending→available settlement window). Scoped via the
  // `Stripe-Account` request option so the topup credits the Connect
  // account, not the platform. Test-mode only — Stripe gates real-mode
  // topups behind explicit application enablement.
  const TOPUP_AMOUNT_CENTS = 8500;
  let topupOk = false;
  try {
    const topup = await stripe.topups.create(
      {
        amount: TOPUP_AMOUNT_CENTS,
        currency: 'usd',
        description: 'DESIGN-DEMO standard payout prep',
        source: 'btok_us_verified', // test-mode bank source token
      },
      { stripeAccount: connectAccountId },
    );
    console.log(`Topup created: ${topup.id} (${topup.status}, $${topup.amount / 100})`);
    topupOk = true;
  } catch (err) {
    const e = err as { type?: string; code?: string; message?: string };
    console.log(
      `Topup failed (${e.type ?? '?'}/${e.code ?? '?'}): ${e.message ?? err}`,
    );
  }

  // STEP 2 — If the topup landed, give Stripe a beat to update the
  // balance buckets, then re-read the balance.
  if (topupOk) {
    await new Promise((r) => setTimeout(r, 2000));
    const refreshed = await stripe.balance.retrieve(undefined, {
      stripeAccount: connectAccountId,
    });
    console.log('Balance (post-topup):', JSON.stringify(refreshed, null, 2));
    balance.available = refreshed.available;
  }

  // STEP 3 — Standard payout from `available`. No `method: 'instant'` —
  // Stripe defaults to the connected account's configured bank
  // destination + payout method (which is what the live app's flow uses
  // every day).
  const availableUsd = balance.available.find((b) => b.currency === 'usd');
  if (!availableUsd || availableUsd.amount === 0) {
    console.log(
      '\nNo `available` balance to pay out (post-topup). Pending:',
      JSON.stringify(balance.pending, null, 2),
    );
    console.log(
      '\nDocumented limitation: test-mode topups may not unblock the standard',
    );
    console.log(
      '`available` bucket on Express Connect accounts in this sandbox. The',
    );
    console.log(
      'previously-created instant payout (po_1TYphkRuteminPIyQvXmHzWU →',
    );
    console.log(
      'Failed) plus its `payout.paid` webhook (evt_1TYphmRuteminPIyEAsRkYQN)',
    );
    console.log(
      'remain in evidence as the demo artifact for the failure-path handler.',
    );
    return;
  }

  const payout = await stripe.payouts.create(
    {
      amount: availableUsd.amount,
      currency: 'usd',
      description: 'DESIGN-DEMO standard payout',
    },
    { stripeAccount: connectAccountId },
  );
  console.log(
    'Payout created:',
    payout.id,
    `status=${payout.status}`,
    `amount=$${payout.amount / 100}`,
    `method=${payout.method}`,
  );
  console.log(
    `\nDashboard URL: https://dashboard.stripe.com/${connectAccountId}/test/payouts/${payout.id}`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
