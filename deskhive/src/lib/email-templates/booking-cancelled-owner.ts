/**
 * Story 8-3: booking-cancelled-owner transactional email render.
 *
 * Fires ONLY when (a) the cancelled booking was previously CONFIRMED
 * (Decision §2) AND (b) space.owner_id is non-null (Decision §1).
 * PENDING-cancellations are noise (the desk was never promised);
 * CONFIRMED-cancellations are signal (the owner planned around the
 * booking and deserves notification).
 *
 * Body deliberately omits guest name per Decision §9. Body notes the
 * desk is "available again" — purely informational, no money mention
 * (refund outcome is Story 8-4's territory per Decision §7).
 *
 * Copy LOCKED VERBATIM by BA Decisions §9.
 */

import { escapeHtml, type TemplateData } from '@/lib/email';
import { formatBookingDate } from '@/lib/format';

export function renderBookingCancelledOwner(
  data: TemplateData['booking-cancelled-owner'],
): { bodyHtml: string; previewText: string; subject: string } {
  const ownerName = escapeHtml(data.ownerName);
  const spaceName = escapeHtml(data.spaceName);
  const deskLabel = escapeHtml(data.deskLabel);
  const dateLabel = escapeHtml(formatBookingDate(data.bookingDate));
  const appUrl = escapeHtml(data.appUrl);

  const bodyHtml = `<p style="font-size: 14px; line-height: 1.5; margin: 0 0 12px;">Hi ${ownerName},</p>
<p style="font-size: 14px; line-height: 1.5; margin: 0 0 16px;">A guest has cancelled their confirmed booking for <strong>${deskLabel}</strong> at <strong>${spaceName}</strong> on <strong>${dateLabel}</strong>. The desk is available for that date again.</p>
<p style="margin: 0 0 16px;"><a href="${appUrl}/owner/bookings" style="display: inline-block; padding: 10px 20px; background: #4F46E5; color: #ffffff; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 14px;">View bookings</a></p>
<p style="font-size: 14px; line-height: 1.5; margin: 0;">Thanks,<br>The DeskHive team</p>`;

  return {
    bodyHtml,
    previewText: 'A guest cancelled their booking. The desk is available again.',
    subject: `[DeskHive] Booking on ${data.spaceName} — ${formatBookingDate(data.bookingDate)}`,
  };
}
