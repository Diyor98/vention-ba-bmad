/**
 * Story 8-4: payment-refund transactional email render.
 *
 * Sent to a Guest after `stripe.refunds.create` succeeds via Story 9-6's
 * `cancelBookingAction` eligible-refund branch OR `handleChargeRefunded`
 * rescue path. PRD §4.3 row 13.
 *
 * Subject is DYNAMIC per BA Decision §4 — interpolates the space name
 * (`Refund processed for {spaceName}`) so inbox threading matches the
 * payment-receipt + booking-confirmed sibling emails for the same
 * booking.
 *
 * **Body MUST include the "5–10 business days" timing copy** (BA
 * Decision §10 LOAD-BEARING regression assertion) — consistency with
 * the 9-6 refund-success toast lock. The render-function test asserts
 * this literal substring is present in `bodyHtml`.
 *
 * CTA links to /my-bookings. The body does NOT link to a Stripe-hosted
 * refund detail page — same anti-pattern as the receipt template.
 *
 * Copy locked by BA Decision §4 (PRD §4.3 verbatim subject base) +
 * Decision §1 (calm-transactional voice).
 */

import { escapeHtml, type TemplateData } from '@/lib/email';
import { formatBookingDate, formatCents } from '@/lib/format';

export function renderPaymentRefund(
  data: TemplateData['payment-refund'],
): { bodyHtml: string; previewText: string; subject: string } {
  const guestName = escapeHtml(data.guestName);
  const spaceName = escapeHtml(data.spaceName);
  const dateLabel = escapeHtml(formatBookingDate(data.bookingDate));
  const amount = escapeHtml(formatCents(data.amountCents));
  const appUrl = escapeHtml(data.appUrl);

  const bodyHtml = `<p style="font-size: 14px; line-height: 1.5; margin: 0 0 12px;">Hi ${guestName},</p>
<p style="font-size: 14px; line-height: 1.5; margin: 0 0 12px;">We've processed a refund of <strong>${amount}</strong> for your booking at <strong>${spaceName}</strong> on <strong>${dateLabel}</strong>.</p>
<p style="font-size: 14px; line-height: 1.5; margin: 0 0 16px;">It will appear on your original payment method within 5&ndash;10 business days.</p>
<div style="margin: 24px 0; text-align: left;"><a href="${appUrl}/my-bookings" style="display: inline-block; padding: 14px 24px; background: #4F46E5; color: #ffffff; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 14px; line-height: 1; letter-spacing: 0.005em; mso-padding-alt: 0;">View my bookings</a></div>
<p style="font-size: 14px; line-height: 1.5; margin: 0;">Thanks,<br>The DeskHive team</p>`;

  return {
    bodyHtml,
    previewText: `Refund of ${formatCents(data.amountCents)} processed for your booking at ${data.spaceName}.`,
    subject: `Refund processed for ${data.spaceName}`,
  };
}
