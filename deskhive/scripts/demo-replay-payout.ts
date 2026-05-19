/**
 * Phase E — Replay sendPayoutNotificationEmail end-to-end against
 * today's actual payout event payload, now that the SPACE_OWNER demo
 * row holds the Resend-verified address.
 *
 * Same payout id + same idempotency key as today's webhook run
 * (po_1TYphkRuteminPIyQvXmHzWU / evt_1TYphmRuteminPIyEAsRkYQN). The
 * earlier attempt at 15:37:16 UTC failed at Resend's recipient gate
 * (recipient was marketadteam+owner@gmail.com at the time, before
 * Phase D's swap). Resend doesn't store dedup records for gating
 * rejections, so the replay goes through fresh — same helper, same
 * key, same event payload.
 *
 * If Stripe's instant rails ultimately marked po_1TYphkRuteminPIy...
 * as Failed (which happened earlier), the email send is still
 * historically correct — the payout.paid webhook fired at creation
 * time, the handler ran, the audit row exists. Replaying the email
 * now exercises the SAME code path; what changed is only the
 * recipient resolution post-swap.
 */

import { config } from 'dotenv';
config({ path: '.env.local' });
config({ path: '.env' });

import { sendPayoutNotificationEmail } from '@/lib/bookings';

const TARGET_STRIPE_ACCOUNT_ID = 'acct_1TYPobRuteminPIy';
const TARGET_PAYOUT_AMOUNT_CENTS = 8500;
const TARGET_PAYOUT_ID = 'po_1TYphkRuteminPIyQvXmHzWU';

async function main() {
  console.log('=== Phase E — payout email replay ===');
  console.log(`stripeAccountId  = ${TARGET_STRIPE_ACCOUNT_ID}`);
  console.log(`payoutAmountCents = ${TARGET_PAYOUT_AMOUNT_CENTS}`);
  console.log(`idempotencyKey   = payout-${TARGET_PAYOUT_ID}`);
  console.log(
    '(watch stdout below — any logger.warn line is the result of the send)\n',
  );
  await sendPayoutNotificationEmail({
    stripeAccountId: TARGET_STRIPE_ACCOUNT_ID,
    payoutAmountCents: TARGET_PAYOUT_AMOUNT_CENTS,
    idempotencyKey: `payout-${TARGET_PAYOUT_ID}`,
  });
  console.log(
    '\nHelper returned without throwing. No warn line = sendEmail returned { status: "sent" }.',
  );
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
