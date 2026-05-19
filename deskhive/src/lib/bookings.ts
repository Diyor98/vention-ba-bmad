/**
 * Story 8-3: booking-lifecycle notification service module.
 *
 * Family: joins src/lib/applications.ts (Story 7-2/8-2), src/lib/email.ts
 * (Story 8-1), etc. Pure module — no 'use server', no Next.js context.
 * Callable from Server Actions, Server Components, scripts.
 *
 * Public surface:
 *   - notifyBookingRequested(bookingId)
 *   - notifyBookingConfirmed(bookingId, actorUserId)
 *   - notifyBookingRejected(bookingId, actorUserId)
 *   - notifyBookingCancelledByGuest(bookingId, previousStatus)
 *
 * Each function fetches the canonical DB state at send-time via
 * getBookingDispatchInfo (the joined view of booking + space + desk +
 * guest + maybe-owner). Guest-side emails always fire. Owner-side
 * emails fire based on the per-action decision rules:
 *
 *   Decision §1 (NULL-owner skip): owner-side skipped when
 *       space.owner_id IS NULL.
 *   Decision §2 (cancel-CONFIRMED only): owner-side cancel email
 *       fires only when previousStatus === 'CONFIRMED'.
 *   Decision §3 (self-action skip): owner-side confirm/reject email
 *       fires only when actorUserId !== space.owner_id.
 *
 * Failure semantics: sendEmail is non-throwing (Story 8-1 contract),
 * but the DB lookup or template render can throw. Server-Action
 * callers wrap notify* calls in .catch() — never block on the result.
 */

import type { BookingStatus } from '@/db/schema';
import {
  getBookingDispatchInfo,
  getBookingByPaymentIntentId,
  type BookingDispatchInfo,
} from '@/db/queries/bookings';
import { getConnectAccountByStripeAccountId } from '@/db/queries/stripe-connect';
import { getUserById } from '@/db/queries/users';
import { sendEmail } from '@/lib/email';
import { logger } from '@/lib/logger';

// Re-export for callers that want the type without a deep import.
export type { BookingDispatchInfo };

// ─────────────────────────────────────────────────────────────────────────
// appUrl helper — env-driven CTA base URL. Defaults to localhost for
// dev. Duplicates the Story 8-2 helper in src/lib/applications.ts
// rather than extracting prematurely — re-evaluate when Story 8-4
// adds a third caller.
// ─────────────────────────────────────────────────────────────────────────

function getAppUrl(): string {
  const url = (process.env.BETTER_AUTH_URL ?? '').trim();
  if (url.length === 0) {
    logger.warn(
      'BETTER_AUTH_URL unset; falling back to http://localhost:3000 for booking email CTA links',
    );
    return 'http://localhost:3000';
  }
  return url;
}

// ─────────────────────────────────────────────────────────────────────────
// notify* — one function per Server-Action-triggered booking state
// transition. Each fires guest-side always; owner-side per Decision
// §1/§2/§3 rules.
// ─────────────────────────────────────────────────────────────────────────

export async function notifyBookingRequested(bookingId: string): Promise<void> {
  const info = await getBookingDispatchInfo(bookingId);
  if (!info) {
    logger.warn(
      `notifyBookingRequested: dispatch info not found (bookingId=${bookingId}); skipping email`,
    );
    return;
  }
  const appUrl = getAppUrl();
  const dateIso = info.booking.bookingDate;

  // Guest always.
  await sendEmail({
    to: info.guest.email,
    template: 'booking-requested-guest',
    data: {
      guestName: info.guest.fullName,
      spaceName: info.space.name,
      deskLabel: info.desk.label,
      bookingDate: dateIso,
      appUrl,
    },
  });

  // Owner only when space has an owner (Decision §1).
  if (info.owner) {
    await sendEmail({
      to: info.owner.email,
      template: 'booking-requested-owner',
      data: {
        ownerName: info.owner.fullName,
        spaceName: info.space.name,
        deskLabel: info.desk.label,
        bookingDate: dateIso,
        appUrl,
      },
    });
  }
}

export async function notifyBookingConfirmed(
  bookingId: string,
  actorUserId: string,
): Promise<void> {
  const info = await getBookingDispatchInfo(bookingId);
  if (!info) {
    logger.warn(
      `notifyBookingConfirmed: dispatch info not found (bookingId=${bookingId}); skipping email`,
    );
    return;
  }
  const appUrl = getAppUrl();
  const dateIso = info.booking.bookingDate;

  await sendEmail({
    to: info.guest.email,
    template: 'booking-confirmed-guest',
    data: {
      guestName: info.guest.fullName,
      spaceName: info.space.name,
      deskLabel: info.desk.label,
      bookingDate: dateIso,
      appUrl,
    },
  });

  // Owner only when (a) space has an owner AND (b) the owner is not
  // the actor (Decisions §1 + §3 combined).
  if (info.owner && info.space.ownerId !== actorUserId) {
    await sendEmail({
      to: info.owner.email,
      template: 'booking-confirmed-owner',
      data: {
        ownerName: info.owner.fullName,
        spaceName: info.space.name,
        deskLabel: info.desk.label,
        bookingDate: dateIso,
        appUrl,
      },
    });
  }
}

export async function notifyBookingRejected(
  bookingId: string,
  actorUserId: string,
): Promise<void> {
  const info = await getBookingDispatchInfo(bookingId);
  if (!info) {
    logger.warn(
      `notifyBookingRejected: dispatch info not found (bookingId=${bookingId}); skipping email`,
    );
    return;
  }
  const appUrl = getAppUrl();
  const dateIso = info.booking.bookingDate;

  await sendEmail({
    to: info.guest.email,
    template: 'booking-rejected-guest',
    data: {
      guestName: info.guest.fullName,
      spaceName: info.space.name,
      deskLabel: info.desk.label,
      bookingDate: dateIso,
      appUrl,
    },
  });

  if (info.owner && info.space.ownerId !== actorUserId) {
    await sendEmail({
      to: info.owner.email,
      template: 'booking-rejected-owner',
      data: {
        ownerName: info.owner.fullName,
        spaceName: info.space.name,
        deskLabel: info.desk.label,
        bookingDate: dateIso,
        appUrl,
      },
    });
  }
}

export async function notifyBookingCancelledByGuest(
  bookingId: string,
  previousStatus: BookingStatus,
): Promise<void> {
  const info = await getBookingDispatchInfo(bookingId);
  if (!info) {
    logger.warn(
      `notifyBookingCancelledByGuest: dispatch info not found (bookingId=${bookingId}); skipping email`,
    );
    return;
  }
  const appUrl = getAppUrl();
  const dateIso = info.booking.bookingDate;

  await sendEmail({
    to: info.guest.email,
    template: 'booking-cancelled-guest',
    data: {
      guestName: info.guest.fullName,
      spaceName: info.space.name,
      deskLabel: info.desk.label,
      bookingDate: dateIso,
      appUrl,
    },
  });

  // Owner only when (a) the cancelled booking was previously CONFIRMED
  // (Decision §2 — PENDING cancellations are noise) AND (b) space has
  // an owner (Decision §1).
  if (previousStatus === 'CONFIRMED' && info.owner) {
    await sendEmail({
      to: info.owner.email,
      template: 'booking-cancelled-owner',
      data: {
        ownerName: info.owner.fullName,
        spaceName: info.space.name,
        deskLabel: info.desk.label,
        bookingDate: dateIso,
        appUrl,
      },
    });
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Story 8-4 — payment-driven email sender helpers (3 new functions).
//
// All 3 mirror the `notify*` shape above: look up canonical DB state at
// send-time → call sendEmail with the right recipient + data. The new
// helpers take a unified resource-id-shaped `idempotencyKey` arg
// (`receipt-${paymentIntentId}` / `refund-${paymentIntentId}` /
// `payout-${payoutId}`) passed through to Resend's `Idempotency-Key`
// header per BA Decision §6 + §7 — so the dual-path design (action-side
// normal happy path + webhook-side rescue path) dedups whichever fires
// first.
//
// Failure semantics: sendEmail is non-throwing (Story 8-1 contract).
// The DB lookup or template render can throw — callers (Server Actions
// + webhook handlers) wrap these in `.catch(...)` and log `warn`. Match
// the 8-3 `notify*` failure shape. PRD NFR-5 lock: email failures
// NEVER affect the action / handler return.
//
// Resend `Idempotency-Key` dedup-response handling: per Story 8-4 BA
// Decision §7 supplement + Resend SDK 6.12.3 docs, a second call with
// the same key returns 200 with the cached email id (no special
// detection logic needed in sendEmail; the existing happy-path code
// returns { status: 'sent' }). The Resend 4xx error codes
// `invalid_idempotent_request` + `concurrent_idempotent_requests` fire
// only for malformed/conflicting cases (key reused with different
// params; two simultaneous calls) — surfaced as { status: 'error' }
// and logged `warn` like any other Resend failure.
// ─────────────────────────────────────────────────────────────────────────

/**
 * Story 8-4: fires the payment-receipt email to the Guest after a
 * Payment Intent captures. Called by `confirmBookingAction` (action-side
 * normal happy path) AND `handlePaymentIntentSucceeded` (webhook-side
 * rescue path). Same unified idempotency key from both callers; Resend
 * dedups whichever fires first.
 */
export async function sendPaymentReceiptEmail(args: {
  paymentIntentId: string;
  amountCents: number;
  idempotencyKey: string;
}): Promise<void> {
  const booking = await getBookingByPaymentIntentId(args.paymentIntentId);
  if (!booking) {
    logger.warn(
      `sendPaymentReceiptEmail: booking not found for paymentIntentId=${args.paymentIntentId}; skipping email`,
    );
    return;
  }
  const info = await getBookingDispatchInfo(booking.id);
  if (!info) {
    logger.warn(
      `sendPaymentReceiptEmail: dispatch info not found (bookingId=${booking.id}); skipping email`,
    );
    return;
  }
  const result = await sendEmail({
    to: info.guest.email,
    template: 'payment-receipt',
    data: {
      guestName: info.guest.fullName,
      spaceName: info.space.name,
      bookingDate: info.booking.bookingDate,
      amountCents: args.amountCents,
      appUrl: getAppUrl(),
    },
    idempotencyKey: args.idempotencyKey,
  });
  if (result.status === 'error') {
    logger.warn('payment_receipt_email_send_failed', {
      paymentIntentId: args.paymentIntentId,
      bookingId: booking.id,
      error: result.error,
    });
  }
}

/**
 * Story 8-4: fires the refund-confirmation email to the Guest after a
 * refund processes via `stripe.refunds.create`. Mirrors
 * `sendPaymentReceiptEmail` shape; called by `cancelBookingAction`'s
 * eligible-refund branch AND `handleChargeRefunded` rescue path.
 */
export async function sendRefundConfirmationEmail(args: {
  paymentIntentId: string;
  amountCents: number;
  idempotencyKey: string;
}): Promise<void> {
  const booking = await getBookingByPaymentIntentId(args.paymentIntentId);
  if (!booking) {
    logger.warn(
      `sendRefundConfirmationEmail: booking not found for paymentIntentId=${args.paymentIntentId}; skipping email`,
    );
    return;
  }
  const info = await getBookingDispatchInfo(booking.id);
  if (!info) {
    logger.warn(
      `sendRefundConfirmationEmail: dispatch info not found (bookingId=${booking.id}); skipping email`,
    );
    return;
  }
  const result = await sendEmail({
    to: info.guest.email,
    template: 'payment-refund',
    data: {
      guestName: info.guest.fullName,
      spaceName: info.space.name,
      bookingDate: info.booking.bookingDate,
      amountCents: args.amountCents,
      appUrl: getAppUrl(),
    },
    idempotencyKey: args.idempotencyKey,
  });
  if (result.status === 'error') {
    logger.warn('refund_email_send_failed', {
      paymentIntentId: args.paymentIntentId,
      bookingId: booking.id,
      error: result.error,
    });
  }
}

/**
 * Story 8-4: fires the payout-summary email to the Space Owner after a
 * Stripe Connect payout settles. Called SOLELY by `handlePayoutPaid` —
 * no action-side analog (payouts are Stripe-initiated, not user-
 * initiated). Idempotency key = `'payout-' + payoutId`.
 *
 * Recipient lookup: `getConnectAccountByStripeAccountId` (Story 9-2
 * helper) returns the Connect row + `userId`; `getUserById` (Story 8-4
 * helper) returns the Owner's email + name.
 */
export async function sendPayoutNotificationEmail(args: {
  stripeAccountId: string;
  payoutAmountCents: number;
  idempotencyKey: string;
}): Promise<void> {
  const connectAccount = await getConnectAccountByStripeAccountId(
    args.stripeAccountId,
  );
  if (!connectAccount) {
    logger.warn(
      `sendPayoutNotificationEmail: Connect account not found for stripeAccountId=${args.stripeAccountId}; skipping email`,
    );
    return;
  }
  const owner = await getUserById(connectAccount.userId);
  if (!owner) {
    logger.warn(
      `sendPayoutNotificationEmail: owner user not found for userId=${connectAccount.userId}; skipping email`,
    );
    return;
  }
  const result = await sendEmail({
    to: owner.email,
    template: 'payout-summary',
    data: {
      ownerName: owner.fullName,
      payoutAmountCents: args.payoutAmountCents,
      appUrl: getAppUrl(),
    },
    idempotencyKey: args.idempotencyKey,
  });
  if (result.status === 'error') {
    logger.warn('payout_email_send_failed', {
      stripeAccountId: args.stripeAccountId,
      ownerId: owner.id,
      error: result.error,
    });
  }
}
