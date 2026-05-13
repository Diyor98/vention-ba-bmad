/**
 * Story 8-3: booking-requested-guest transactional email render.
 *
 * Sent to a Guest immediately after they submit a booking request via
 * /spaces/[id]. Informational; the host will review and confirm soon.
 *
 * Subject is dynamic per BA Decision §6 (`'[DeskHive] Your booking at
 * {spaceName}'`) — threads with all other guest-side emails about the
 * same booking. CTA links to /my-bookings.
 *
 * Copy LOCKED VERBATIM by BA Decisions §9.
 */

import { escapeHtml, type TemplateData } from '@/lib/email';
import { formatBookingDate } from '@/lib/format';

export function renderBookingRequestedGuest(
  data: TemplateData['booking-requested-guest'],
): { bodyHtml: string; previewText: string; subject: string } {
  const guestName = escapeHtml(data.guestName);
  const spaceName = escapeHtml(data.spaceName);
  const deskLabel = escapeHtml(data.deskLabel);
  const dateLabel = escapeHtml(formatBookingDate(data.bookingDate));
  const appUrl = escapeHtml(data.appUrl);

  const bodyHtml = `<p style="font-size: 14px; line-height: 1.5; margin: 0 0 12px;">Hi ${guestName},</p>
<p style="font-size: 14px; line-height: 1.5; margin: 0 0 12px;">We've received your booking request for <strong>${deskLabel}</strong> at <strong>${spaceName}</strong> on <strong>${dateLabel}</strong>. The host will review it and confirm soon.</p>
<p style="font-size: 14px; line-height: 1.5; margin: 0 0 16px;">You'll receive another email when the booking is confirmed or if there's an issue.</p>
<p style="margin: 0 0 16px;"><a href="${appUrl}/my-bookings" style="display: inline-block; padding: 10px 20px; background: #4F46E5; color: #ffffff; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 14px;">View booking</a></p>
<p style="font-size: 14px; line-height: 1.5; margin: 0;">Thanks,<br>The DeskHive team</p>`;

  return {
    bodyHtml,
    previewText:
      "We've received your booking request and the host will review it shortly.",
    subject: `[DeskHive] Your booking at ${data.spaceName}`,
  };
}
