/**
 * Story 8-3: booking-cancelled-guest transactional email render.
 *
 * Sent to a Guest after they cancel their own booking via /my-bookings.
 * Fires regardless of previous status (PENDING or CONFIRMED).
 *
 * Refund mention is DELIBERATELY VAGUE per Decision §7 — the refund
 * outcome belongs to Story 8-4's `payment-refund` template (or the
 * conditional "no refund applies" variant). Saying "if a refund applies,
 * you'll receive a separate email" sets expectation without making a
 * promise this story can't deliver.
 *
 * Soft "Browse spaces" CTA for re-engagement (mirrors rejected pattern).
 *
 * Copy LOCKED VERBATIM by BA Decisions §9.
 */

import { escapeHtml, type TemplateData } from '@/lib/email';
import { formatBookingDate } from '@/lib/format';

export function renderBookingCancelledGuest(
  data: TemplateData['booking-cancelled-guest'],
): { bodyHtml: string; previewText: string; subject: string } {
  const guestName = escapeHtml(data.guestName);
  const spaceName = escapeHtml(data.spaceName);
  const deskLabel = escapeHtml(data.deskLabel);
  const dateLabel = escapeHtml(formatBookingDate(data.bookingDate));
  const appUrl = escapeHtml(data.appUrl);

  const bodyHtml = `<p style="font-size: 14px; line-height: 1.5; margin: 0 0 12px;">Hi ${guestName},</p>
<p style="font-size: 14px; line-height: 1.5; margin: 0 0 12px;">Your booking for <strong>${deskLabel}</strong> at <strong>${spaceName}</strong> on <strong>${dateLabel}</strong> has been cancelled.</p>
<p style="font-size: 14px; line-height: 1.5; margin: 0 0 16px;">If a refund applies, you'll receive a separate email when it's processed.</p>
<div style="margin: 24px 0; text-align: left;"><a href="${appUrl}" style="display: inline-block; padding: 14px 24px; background: #4F46E5; color: #ffffff; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 14px; line-height: 1; letter-spacing: 0.005em; mso-padding-alt: 0;">Browse spaces</a></div>
<p style="font-size: 14px; line-height: 1.5; margin: 0;">Thanks,<br>The DeskHive team</p>`;

  return {
    bodyHtml,
    previewText: 'Your booking has been cancelled.',
    subject: `[DeskHive] Your booking at ${data.spaceName}`,
  };
}
