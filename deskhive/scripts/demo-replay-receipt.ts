/**
 * Phase B — Replay sendPaymentReceiptEmail end-to-end against an
 * existing CONFIRMED+CAPTURED booking.
 *
 * Why a replay instead of a fresh booking: the existing 6 Phase 2
 * bookings all have guestUserId = f18ca0c0-... (the demo GUEST).
 * After Phase A2's swap, that user holds the Resend-verified address
 * (marketadteam@gmail.com). Replaying the helper for one of those
 * existing bookings exercises the EXACT same email-send code path
 * that confirmBookingAction.ts fires — same helper, same idempotency
 * key, same Resend transport. Earlier replay attempts at the +owner
 * alias all returned `{ status: 'error' }` from Resend's recipient
 * gate, so no dedup record was stored — the call goes through fresh
 * now that the recipient is the verified address.
 *
 * Target booking: 509543f6-41be-400f-aa32-1ffdda0c0207 (most-recent
 * CONFIRMED+CAPTURED row, PI pi_3TYm1ARvIpZbtPbe0b7TiHaa, $25.00,
 * booking_date 2026-06-01).
 */

import { config } from 'dotenv';
config({ path: '.env.local' });
config({ path: '.env' });

import { sendPaymentReceiptEmail } from '@/lib/bookings';

const TARGET_PAYMENT_INTENT_ID = 'pi_3TYm1ARvIpZbtPbe0b7TiHaa';
const TARGET_AMOUNT_CENTS = 2500;

async function main() {
  console.log('=== Phase B — receipt email replay ===');
  console.log(`paymentIntentId  = ${TARGET_PAYMENT_INTENT_ID}`);
  console.log(`amountCents      = ${TARGET_AMOUNT_CENTS}`);
  console.log(`idempotencyKey   = receipt-${TARGET_PAYMENT_INTENT_ID}`);
  console.log(
    '(watch stdout below — any logger.warn line is the result of the send)\n',
  );
  await sendPaymentReceiptEmail({
    paymentIntentId: TARGET_PAYMENT_INTENT_ID,
    amountCents: TARGET_AMOUNT_CENTS,
    idempotencyKey: `receipt-${TARGET_PAYMENT_INTENT_ID}`,
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
