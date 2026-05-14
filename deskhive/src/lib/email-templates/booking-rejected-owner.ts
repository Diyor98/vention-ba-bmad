/**
 * Story 8-3: booking-rejected-owner transactional email render.
 *
 * Fires ONLY when an admin rejects a booking on the owner's behalf
 * (Decision §3 self-action skip rule). The owner's own rejection
 * does NOT fire this template — they just clicked Reject and know.
 *
 * Also subject to Decision §1: skipped entirely if space.owner_id is
 * NULL.
 *
 * This is the 8th booking template — added to the registry in Story 8-3
 * (Story 8-1's registry shipped with only 7 booking template names).
 *
 * Copy LOCKED VERBATIM by BA Decisions §9.
 */

import { escapeHtml, type TemplateData } from '@/lib/email';
import { formatBookingDate } from '@/lib/format';

export function renderBookingRejectedOwner(
  data: TemplateData['booking-rejected-owner'],
): { bodyHtml: string; previewText: string; subject: string } {
  const ownerName = escapeHtml(data.ownerName);
  const spaceName = escapeHtml(data.spaceName);
  const deskLabel = escapeHtml(data.deskLabel);
  const dateLabel = escapeHtml(formatBookingDate(data.bookingDate));
  const appUrl = escapeHtml(data.appUrl);

  const bodyHtml = `<p style="font-size: 14px; line-height: 1.5; margin: 0 0 12px;">Hi ${ownerName},</p>
<p style="font-size: 14px; line-height: 1.5; margin: 0 0 16px;">An admin rejected a booking on <strong>${spaceName}</strong> for <strong>${deskLabel}</strong> on <strong>${dateLabel}</strong>. No action needed from you.</p>
<div style="margin: 24px 0; text-align: left;"><a href="${appUrl}/owner/bookings" style="display: inline-block; padding: 14px 24px; background: #4F46E5; color: #ffffff; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 14px; line-height: 1; letter-spacing: 0.005em; mso-padding-alt: 0;">View bookings</a></div>
<p style="font-size: 14px; line-height: 1.5; margin: 0;">Thanks,<br>The DeskHive team</p>`;

  return {
    bodyHtml,
    previewText: 'An admin rejected a booking on your behalf.',
    subject: `[DeskHive] Booking on ${data.spaceName} — ${formatBookingDate(data.bookingDate)}`,
  };
}
