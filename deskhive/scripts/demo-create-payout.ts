/**
 * One-off demo helper — create a synthetic payout via Stripe SDK
 * direct call (bypasses the dashboard navigation friction in test mode).
 *
 * Uses STRIPE_SECRET_KEY from .env.local (loaded via dotenv/config) and
 * the Stripe-Account header to scope the request to the seeded Connect
 * account (acct_1TYPobRuteminPly). The resulting payout.paid webhook
 * (or payout.created → payout.paid transition once the synthetic
 * settlement clock advances in test mode) routes through `stripe listen`
 * → /api/stripe/webhook → handlePayoutPaid (Story 9-7 audit-only +
 * Story 8-4 payout email).
 *
 * Reads only the BALANCE first to confirm there's something to pay out;
 * a zero `available` balance with pending funds means test-mode
 * settlement hasn't progressed yet — surface that case and stop.
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

  // DEMO PATH — instant payout from `instant_available`.
  //
  // Test mode keeps freshly-captured charges in the `pending` bucket
  // for ~1–2 simulated days before they settle into `available`. To
  // unblock a demo without waiting on the settlement clock, we pull
  // from `instant_available` (Stripe's instant-payouts surface) and
  // pass `method: 'instant'` to `payouts.create(...)`. This fires
  // `payout.paid` immediately + bypasses the standard settlement
  // window.
  //
  // Production note: the live app's payout flow is unchanged. Stripe
  // schedules standard-method payouts on the connected account's
  // configured cadence; this script is purely a demo-prep helper and
  // is never imported by application code.
  const instantUsd = balance.instant_available?.find(
    (b) => b.currency === 'usd',
  );
  if (!instantUsd || instantUsd.amount === 0) {
    console.log(
      'No instant_available balance to pay out. instant_available:',
      JSON.stringify(balance.instant_available, null, 2),
    );
    return;
  }

  const payout = await stripe.payouts.create(
    {
      amount: instantUsd.amount,
      currency: 'usd',
      method: 'instant',
    },
    { stripeAccount: connectAccountId },
  );
  console.log(
    'Payout created:',
    payout.id,
    payout.status,
    payout.amount,
    `method=${payout.method}`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
