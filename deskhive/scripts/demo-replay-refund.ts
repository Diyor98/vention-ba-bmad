/**
 * Phase C — Replay sendRefundConfirmationEmail end-to-end against an
 * existing CANCELLED+REFUNDED booking.
 *
 * Same rationale as the receipt replay (Phase B): existing refunded
 * booking 92bd9829-...  has guestUserId = f18ca0c0-... (the GUEST,
 * now at marketadteam@gmail.com after the Phase A2 swap). Replay
 * exercises the exact same code path that cancelBookingAction's
 * eligible-refund branch fires + that handleChargeRefunded's
 * rescue path fires. Earlier 8-4 testing didn't store dedup records
 * because Resend rejected the recipient — fresh call goes through.
 *
 * Target booking: 92bd9829-92ed-4360-b317-367122ffbe0e
 *   status        = CANCELLED
 *   paymentStatus = REFUNDED
 *   PI            = pi_3TYWSJRvIpZbtPbe1cXXP5hT
 *   refundAmount  = 2500 cents
 *   bookingDate   = 2026-06-23
 */

import { config } from 'dotenv';
config({ path: '.env.local' });
config({ path: '.env' });

import { sendRefundConfirmationEmail } from '@/lib/bookings';

const TARGET_PAYMENT_INTENT_ID = 'pi_3TYWSJRvIpZbtPbe1cXXP5hT';
const TARGET_AMOUNT_CENTS = 2500;

async function main() {
  console.log('=== Phase C — refund email replay ===');
  console.log(`paymentIntentId  = ${TARGET_PAYMENT_INTENT_ID}`);
  console.log(`amountCents      = ${TARGET_AMOUNT_CENTS}`);
  console.log(`idempotencyKey   = refund-${TARGET_PAYMENT_INTENT_ID}`);
  console.log(
    '(watch stdout below — any logger.warn line is the result of the send)\n',
  );
  await sendRefundConfirmationEmail({
    paymentIntentId: TARGET_PAYMENT_INTENT_ID,
    amountCents: TARGET_AMOUNT_CENTS,
    idempotencyKey: `refund-${TARGET_PAYMENT_INTENT_ID}`,
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
