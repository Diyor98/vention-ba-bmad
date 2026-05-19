/**
 * Diagnostic — 8-4 BA-walk pre-flight probe.
 *
 * Two independent checks, both read-only against application code:
 *
 *   A. Replay the handler-side payout email path offline. Same stripe
 *      account id + same idempotency key as today's actual webhook run
 *      (evt_1TYphmRuteminPIyEAsRkYQN → po_1TYphkRuteminPIyQvXmHzWU), so
 *      Resend dedups if today's send had silently succeeded, OR returns
 *      the same error it returned at 15:37:16 UTC if today's send had
 *      silently failed.
 *
 *   B. Send a clean Resend probe directly via the SDK to the BARE
 *      address `marketadteam@gmail.com` (no plus-variant) to confirm
 *      the Resend API key + the default sandbox sender combo is
 *      functional + that mailbox is the verified-recipient for the
 *      sandbox.
 *
 * Both checks read RESEND_API_KEY + EMAIL_FROM_ADDRESS from .env.local
 * via the standard project loader. Never writes the DB. Never modifies
 * handler code.
 */

import { config } from 'dotenv';
config({ path: '.env.local' });
config({ path: '.env' });

import { Resend } from 'resend';
import { sendPayoutNotificationEmail } from '@/lib/bookings';

const PAYOUT_TARGET_ACCOUNT_ID = 'acct_1TYPobRuteminPIy';
const PAYOUT_TODAY_AMOUNT_CENTS = 8500;
const PAYOUT_TODAY_PAYOUT_ID = 'po_1TYphkRuteminPIyQvXmHzWU';
const PAYOUT_TODAY_IDEMPOTENCY_KEY = `payout-${PAYOUT_TODAY_PAYOUT_ID}`;

const PROBE_TO = 'marketadteam@gmail.com';

async function checkA_replayHandler() {
  console.log('=== CHECK A: replay handler-side payout email chain ===');
  console.log(
    `   stripeAccountId  = ${PAYOUT_TARGET_ACCOUNT_ID}`,
  );
  console.log(
    `   payoutAmountCents = ${PAYOUT_TODAY_AMOUNT_CENTS}`,
  );
  console.log(
    `   idempotencyKey   = ${PAYOUT_TODAY_IDEMPOTENCY_KEY}`,
  );
  console.log(
    '   (any warn/error logged below comes from the same code path the webhook ran today)\n',
  );
  await sendPayoutNotificationEmail({
    stripeAccountId: PAYOUT_TARGET_ACCOUNT_ID,
    payoutAmountCents: PAYOUT_TODAY_AMOUNT_CENTS,
    idempotencyKey: PAYOUT_TODAY_IDEMPOTENCY_KEY,
  });
  console.log(
    '   helper returned without throwing — check stdout above for any warn lines.',
  );
}

async function checkB_freshResendProbe() {
  console.log('\n=== CHECK B: fresh Resend SDK probe ===');
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey || !apiKey.trim()) {
    console.log('   ✗ RESEND_API_KEY missing — probe skipped.');
    return;
  }
  const from = process.env.EMAIL_FROM_ADDRESS ?? 'DeskHive <onboarding@resend.dev>';
  console.log(`   from = ${from}`);
  console.log(`   to   = ${PROBE_TO}`);
  console.log(`   key  = re_*** (length=${apiKey.length})`);
  try {
    const resend = new Resend(apiKey);
    const result = await resend.emails.send({
      from,
      to: PROBE_TO,
      subject: '8-4 walk pre-flight probe',
      html: '<p>If this arrives, Resend key + sandbox sender combo are healthy.</p>',
      text: 'If this arrives, Resend key + sandbox sender combo are healthy.',
    });
    if (result.error) {
      console.log(
        `   ✗ Resend returned an error object:\n${JSON.stringify(result.error, null, 2)}`,
      );
    } else if (result.data?.id) {
      console.log(`   ✓ Resend accepted: id = ${result.data.id}`);
    } else {
      console.log(
        `   ? Resend returned no id + no error: ${JSON.stringify(result, null, 2)}`,
      );
    }
  } catch (err) {
    const e = err as { name?: string; message?: string };
    console.log(
      `   ✗ Resend SDK threw: ${e.name ?? 'Error'}: ${e.message ?? err}`,
    );
  }
}

async function main() {
  await checkA_replayHandler();
  await checkB_freshResendProbe();
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
