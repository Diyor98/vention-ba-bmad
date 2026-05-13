/**
 * Story 8-3: booking-confirmed-guest transactional email render.
 *
 * Sent to a Guest after the owner (or admin) confirms their PENDING
 * booking via /owner/bookings or /admin/bookings. Includes the
 * cancellation policy disclosure (full refund 24+ hours before; no
 * refund within 24h) per Phase 2 PRD §4.5 — informational, not a
 * refund promise.
 *
 * Subject threads with other guest-side booking emails per Decision §6.
 * CTA links to /my-bookings.
 *
 * Copy LOCKED VERBATIM by BA Decisions §9.
 */

import { escapeHtml, type TemplateData } from '@/lib/email';
import { formatBookingDate } from '@/lib/format';

export function renderBookingConfirmedGuest(
  data: TemplateData['booking-confirmed-guest'],
): { bodyHtml: string; previewText: string; subject: string } {
  const guestName = escapeHtml(data.guestName);
  const spaceName = escapeHtml(data.spaceName);
  const deskLabel = escapeHtml(data.deskLabel);
  const dateLabel = escapeHtml(formatBookingDate(data.bookingDate));
  const appUrl = escapeHtml(data.appUrl);

  const bodyHtml = `<p style="font-size: 14px; line-height: 1.5; margin: 0 0 12px;">Hi ${guestName},</p>
<p style="font-size: 14px; line-height: 1.5; margin: 0 0 12px;">Your booking is confirmed. You're set for <strong>${deskLabel}</strong> at <strong>${spaceName}</strong> on <strong>${dateLabel}</strong>.</p>
<p style="font-size: 14px; line-height: 1.5; margin: 0 0 16px;">If you need to cancel, you can do so from your bookings page. Please note our cancellation policy: full refund 24+ hours before the booking date, no refund within 24 hours.</p>
<p style="margin: 0 0 16px;"><a href="${appUrl}/my-bookings" style="display: inline-block; padding: 10px 20px; background: #4F46E5; color: #ffffff; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 14px;">View booking</a></p>
<p style="font-size: 14px; line-height: 1.5; margin: 0;">Thanks,<br>The DeskHive team</p>`;

  return {
    bodyHtml,
    previewText: `Your booking is confirmed. See you on ${formatBookingDate(data.bookingDate)}.`,
    subject: `[DeskHive] Your booking at ${data.spaceName}`,
  };
}
