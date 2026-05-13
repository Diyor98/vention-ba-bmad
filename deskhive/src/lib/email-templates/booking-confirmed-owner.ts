/**
 * Story 8-3: booking-confirmed-owner transactional email render.
 *
 * Fires ONLY when an admin confirms a booking on the owner's behalf
 * (Decision §3 self-action skip rule). The owner's own confirmation
 * action does NOT fire this template — they just clicked Confirm and
 * know what happened.
 *
 * Also subject to Decision §1: skipped entirely if space.owner_id is
 * NULL.
 *
 * Body deliberately omits guest name (Decision §9 privacy-light).
 *
 * Copy LOCKED VERBATIM by BA Decisions §9.
 */

import { escapeHtml, type TemplateData } from '@/lib/email';
import { formatBookingDate } from '@/lib/format';

export function renderBookingConfirmedOwner(
  data: TemplateData['booking-confirmed-owner'],
): { bodyHtml: string; previewText: string; subject: string } {
  const ownerName = escapeHtml(data.ownerName);
  const spaceName = escapeHtml(data.spaceName);
  const deskLabel = escapeHtml(data.deskLabel);
  const dateLabel = escapeHtml(formatBookingDate(data.bookingDate));
  const appUrl = escapeHtml(data.appUrl);

  const bodyHtml = `<p style="font-size: 14px; line-height: 1.5; margin: 0 0 12px;">Hi ${ownerName},</p>
<p style="font-size: 14px; line-height: 1.5; margin: 0 0 16px;">An admin confirmed a booking on <strong>${spaceName}</strong> for <strong>${deskLabel}</strong> on <strong>${dateLabel}</strong>. No action needed from you.</p>
<p style="margin: 0 0 16px;"><a href="${appUrl}/owner/bookings" style="display: inline-block; padding: 10px 20px; background: #4F46E5; color: #ffffff; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 14px;">View bookings</a></p>
<p style="font-size: 14px; line-height: 1.5; margin: 0;">Thanks,<br>The DeskHive team</p>`;

  return {
    bodyHtml,
    previewText: 'An admin confirmed a booking on your behalf.',
    subject: `[DeskHive] Booking on ${data.spaceName} — ${formatBookingDate(data.bookingDate)}`,
  };
}
