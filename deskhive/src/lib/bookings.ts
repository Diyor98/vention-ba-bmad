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
  type BookingDispatchInfo,
} from '@/db/queries/bookings';
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
