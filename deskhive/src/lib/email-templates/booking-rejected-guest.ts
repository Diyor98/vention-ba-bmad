/**
 * Story 8-3: booking-rejected-guest transactional email render.
 *
 * Sent to a Guest after the owner (or admin) rejects their PENDING
 * booking. Soft "Browse spaces" CTA links to the homepage (NOT
 * /my-bookings — soft re-engagement per Decision §8, mirrors Story 8-2's
 * application-rejected pattern).
 *
 * Subject threads with other guest-side booking emails per Decision §6.
 *
 * Copy LOCKED VERBATIM by BA Decisions §9.
 */

import { escapeHtml, type TemplateData } from '@/lib/email';
import { formatBookingDate } from '@/lib/format';

export function renderBookingRejectedGuest(
  data: TemplateData['booking-rejected-guest'],
): { bodyHtml: string; previewText: string; subject: string } {
  const guestName = escapeHtml(data.guestName);
  const spaceName = escapeHtml(data.spaceName);
  const deskLabel = escapeHtml(data.deskLabel);
  const dateLabel = escapeHtml(formatBookingDate(data.bookingDate));
  const appUrl = escapeHtml(data.appUrl);

  const bodyHtml = `<p style="font-size: 14px; line-height: 1.5; margin: 0 0 12px;">Hi ${guestName},</p>
<p style="font-size: 14px; line-height: 1.5; margin: 0 0 12px;">We're sorry — the host wasn't able to confirm your booking for <strong>${deskLabel}</strong> at <strong>${spaceName}</strong> on <strong>${dateLabel}</strong>.</p>
<p style="font-size: 14px; line-height: 1.5; margin: 0 0 16px;">You're welcome to browse other spaces or try a different date.</p>
<p style="margin: 0 0 16px;"><a href="${appUrl}" style="display: inline-block; padding: 10px 20px; background: #4F46E5; color: #ffffff; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 14px;">Browse spaces</a></p>
<p style="font-size: 14px; line-height: 1.5; margin: 0;">Thanks,<br>The DeskHive team</p>`;

  return {
    bodyHtml,
    previewText: "Unfortunately, the host wasn't able to confirm your booking.",
    subject: `[DeskHive] Your booking at ${data.spaceName}`,
  };
}
