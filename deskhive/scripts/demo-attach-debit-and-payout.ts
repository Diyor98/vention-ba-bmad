/**
 * Approach A — Attach a test debit card to the demo Connect account
 * as an external_account, then retry the instant payout.
 *
 * Goal: surface a successful payout on /owner/payouts. Today's earlier
 * instant payout (po_1TYphkRuteminPIyQvXmHzWU) transitioned to "Failed"
 * because no debit card was attached for instant-rails routing.
 * Attaching `tok_visa_debit_us` should give the rails a valid
 * destination + let a fresh instant payout settle as `paid`.
 *
 * Does NOT delete the existing failed payout row — it stays as
 * historical evidence in Stripe + in webhook_events.
 */

import { config } from 'dotenv';
config({ path: '.env.local' });
config({ path: '.env' });

import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

const ACCOUNT_ID = 'acct_1TYPobRuteminPIy';

async function main() {
  console.log('=== STEP 1: attach test debit card as external_account ===');
  try {
    const card = await stripe.accounts.createExternalAccount(ACCOUNT_ID, {
      external_account: 'tok_visa_debit_us',
      default_for_currency: true,
    });
    // The discriminated union: cards have id/last4/brand; bank accounts have account_holder_name.
    const cardSummary: Record<string, unknown> = { id: card.id };
    if ('last4' in card) cardSummary.last4 = card.last4;
    if ('brand' in card) cardSummary.brand = card.brand;
    if ('object' in card) cardSummary.object = card.object;
    console.log(JSON.stringify(cardSummary, null, 2));
  } catch (err) {
    const e = err as { type?: string; code?: string; message?: string };
    console.log(
      `Attach failed (${e.type ?? '?'}/${e.code ?? '?'}): ${e.message ?? err}`,
    );
    process.exit(1);
  }

  console.log('\n=== STEP 2: re-read balance (sanity) ===');
  const balance = await stripe.balance.retrieve(undefined, {
    stripeAccount: ACCOUNT_ID,
  });
  console.log('available:', JSON.stringify(balance.available, null, 2));
  console.log('instant_available:', JSON.stringify(balance.instant_available, null, 2));

  console.log('\n=== STEP 3: create instant payout (amount = instant_available.usd) ===');
  const instantUsd = balance.instant_available?.find((b) => b.currency === 'usd');
  if (!instantUsd || instantUsd.amount === 0) {
    console.log('No instant_available USD balance to pay out; stopping.');
    return;
  }
  try {
    const payout = await stripe.payouts.create(
      {
        amount: instantUsd.amount,
        currency: 'usd',
        method: 'instant',
        description: 'DESIGN-DEMO retry with attached debit card',
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
          destination: payout.destination,
          arrival_date: payout.arrival_date,
        },
        null,
        2,
      ),
    );
    console.log(
      `Dashboard: https://dashboard.stripe.com/${ACCOUNT_ID}/test/payouts/${payout.id}`,
    );
  } catch (err) {
    const e = err as { type?: string; code?: string; message?: string };
    console.log(
      `payouts.create failed (${e.type ?? '?'}/${e.code ?? '?'}): ${e.message ?? err}`,
    );
    process.exit(1);
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
