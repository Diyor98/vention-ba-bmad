/**
 * Approach C — Try Test Clocks to fast-forward pending → available
 * settlement on acct_1TYPobRuteminPIy, then create a standard payout.
 *
 * Caveat: test clocks are attached to Customers/Subscriptions at
 * resource-creation time. Stripe does NOT support attaching a test
 * clock to an existing Connect account retroactively, so this may
 * be a non-starter. Trying the user-supplied sequence regardless;
 * if balance doesn't move after the advance, this approach fails.
 */

import { config } from 'dotenv';
config({ path: '.env.local' });
config({ path: '.env' });

import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

const ACCOUNT_ID = 'acct_1TYPobRuteminPIy';

async function balance(label: string) {
  const b = await stripe.balance.retrieve(undefined, { stripeAccount: ACCOUNT_ID });
  console.log(`\nbalance.${label}:`);
  console.log('  available:', JSON.stringify(b.available));
  console.log('  pending:', JSON.stringify(b.pending));
  console.log('  instant_available:', JSON.stringify(b.instant_available));
  return b;
}

async function main() {
  console.log('=== STEP 1: capture pre-clock balance ===');
  await balance('pre');

  console.log('\n=== STEP 2: create test clock (frozen at now) ===');
  let clockId: string;
  try {
    const clock = await stripe.testHelpers.testClocks.create({
      frozen_time: Math.floor(Date.now() / 1000),
    });
    clockId = clock.id;
    console.log(`  clock id: ${clock.id}  status: ${clock.status}`);
  } catch (err) {
    const e = err as { type?: string; code?: string; message?: string };
    console.log(
      `  ✗ create failed (${e.type ?? '?'}/${e.code ?? '?'}): ${e.message ?? err}`,
    );
    process.exit(1);
  }

  console.log('\n=== STEP 3: advance clock 2 days ===');
  try {
    const advanced = await stripe.testHelpers.testClocks.advance(clockId, {
      frozen_time: Math.floor(Date.now() / 1000) + 2 * 24 * 60 * 60,
    });
    console.log(`  advanced status: ${advanced.status}  frozen_time: ${advanced.frozen_time}`);
  } catch (err) {
    const e = err as { type?: string; code?: string; message?: string };
    console.log(
      `  ✗ advance failed (${e.type ?? '?'}/${e.code ?? '?'}): ${e.message ?? err}`,
    );
    process.exit(1);
  }

  console.log('\n=== STEP 4: poll clock until status=ready (max 60s) ===');
  let ready = false;
  for (let i = 0; i < 30; i++) {
    const c = await stripe.testHelpers.testClocks.retrieve(clockId);
    process.stdout.write(`  attempt ${i + 1}: status=${c.status}\r`);
    if (c.status === 'ready') {
      ready = true;
      console.log('');
      break;
    }
    if (c.status === 'internal_failure') {
      console.log('\n  ✗ clock internal_failure');
      break;
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
  if (!ready) console.log('\n  ⚠ clock never reached ready; continuing anyway to inspect balance');

  console.log('\n=== STEP 5: capture post-advance balance ===');
  const post = await balance('post');

  console.log('\n=== STEP 6: standard payout if available > 0 ===');
  const availableUsd = post.available.find((b) => b.currency === 'usd');
  if (!availableUsd || availableUsd.amount === 0) {
    console.log('  ✗ available stays at 0 — test clock did not affect this Connect account.');
    console.log('  Expected: Stripe test clocks attach at Customer/Subscription create-time;');
    console.log('  existing Connect accounts created without a test_clock param do NOT inherit one.');
    return;
  }
  const payout = await stripe.payouts.create(
    {
      amount: availableUsd.amount,
      currency: 'usd',
      description: 'DESIGN-DEMO standard payout post test-clock advance',
    },
    { stripeAccount: ACCOUNT_ID },
  );
  console.log(
    'Payout:',
    JSON.stringify(
      {
        id: payout.id,
        status: payout.status,
        amount: payout.amount,
        method: payout.method,
      },
      null,
      2,
    ),
  );
  console.log(
    `Dashboard: https://dashboard.stripe.com/${ACCOUNT_ID}/test/payouts/${payout.id}`,
  );
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
