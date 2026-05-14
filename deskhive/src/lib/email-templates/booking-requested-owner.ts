/**
 * Story 8-3: booking-requested-owner transactional email render.
 *
 * Sent to a Space Owner when a Guest requests one of their desks. Fires
 * IFF space.owner_id !== null (Decision §1). The owner can review and
 * confirm/reject via /owner/bookings.
 *
 * No guest name interpolation (Decision §9 privacy-light minimalism):
 * the owner needs to know WHAT to act on, not WHO the guest is. The
 * TemplateData shape for this template omits `guestName` — leakage is
 * a compile-time error.
 *
 * Subject is dynamic per Decision §6 (`'[DeskHive] Booking on {spaceName}
 * — {bookingDate}'`) — includes date so owners managing multiple
 * bookings on the same space can distinguish inbox threads.
 *
 * Copy LOCKED VERBATIM by BA Decisions §9.
 */

import { escapeHtml, type TemplateData } from '@/lib/email';
import { formatBookingDate } from '@/lib/format';

export function renderBookingRequestedOwner(
  data: TemplateData['booking-requested-owner'],
): { bodyHtml: string; previewText: string; subject: string } {
  const ownerName = escapeHtml(data.ownerName);
  const spaceName = escapeHtml(data.spaceName);
  const deskLabel = escapeHtml(data.deskLabel);
  const dateLabel = escapeHtml(formatBookingDate(data.bookingDate));
  const appUrl = escapeHtml(data.appUrl);

  const bodyHtml = `<p style="font-size: 14px; line-height: 1.5; margin: 0 0 12px;">Hi ${ownerName},</p>
<p style="font-size: 14px; line-height: 1.5; margin: 0 0 16px;">A guest has requested to book <strong>${deskLabel}</strong> at <strong>${spaceName}</strong> on <strong>${dateLabel}</strong>. Please review and confirm or reject the request from your bookings page.</p>
<div style="margin: 24px 0; text-align: left;"><a href="${appUrl}/owner/bookings" style="display: inline-block; padding: 14px 24px; background: #4F46E5; color: #ffffff; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 14px; line-height: 1; letter-spacing: 0.005em; mso-padding-alt: 0;">View bookings</a></div>
<p style="font-size: 14px; line-height: 1.5; margin: 0;">Thanks,<br>The DeskHive team</p>`;

  return {
    bodyHtml,
    previewText: `A guest has requested to book ${data.deskLabel} on ${formatBookingDate(data.bookingDate)}.`,
    subject: `[DeskHive] Booking on ${data.spaceName} — ${formatBookingDate(data.bookingDate)}`,
  };
}
