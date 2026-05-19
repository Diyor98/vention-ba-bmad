/**
 * Story 8-4: payment-receipt transactional email render.
 *
 * Sent to a Guest after their Payment Intent captures (Owner clicked
 * Confirm on the booking). Money has moved; this is the canonical
 * receipt confirmation. PRD §4.3 row 12.
 *
 * Subject is DYNAMIC per BA Decision §4 — interpolates the space name
 * so the Guest's inbox can thread payment-related emails about the same
 * booking together (`Receipt for your DeskHive booking at {spaceName}`).
 *
 * CTA links to /my-bookings. The body does NOT link to a Stripe-hosted
 * receipt PDF — anti-pattern per BA Decisions §3 (would require a
 * Stripe API call from inside the email-build path, which is out of
 * scope per the 9-3/9-5/9-6/9-7 "no Stripe API calls from handlers"
 * carry-forward).
 *
 * Copy locked by BA Decision §4 (PRD §4.3 verbatim subject base) +
 * §1 (calm-transactional 8-2 / 8-3 voice carry-forward — no exclamation
 * points, no emoji, no celebratory framing).
 */

import { escapeHtml, type TemplateData } from '@/lib/email';
import { formatBookingDate, formatCents } from '@/lib/format';

export function renderPaymentReceipt(
  data: TemplateData['payment-receipt'],
): { bodyHtml: string; previewText: string; subject: string } {
  const guestName = escapeHtml(data.guestName);
  const spaceName = escapeHtml(data.spaceName);
  const dateLabel = escapeHtml(formatBookingDate(data.bookingDate));
  const amount = escapeHtml(formatCents(data.amountCents));
  const appUrl = escapeHtml(data.appUrl);

  const bodyHtml = `<p style="font-size: 14px; line-height: 1.5; margin: 0 0 12px;">Hi ${guestName},</p>
<p style="font-size: 14px; line-height: 1.5; margin: 0 0 12px;">We've received your payment of <strong>${amount}</strong> for your booking at <strong>${spaceName}</strong> on <strong>${dateLabel}</strong>.</p>
<p style="font-size: 14px; line-height: 1.5; margin: 0 0 16px;">Your booking is confirmed.</p>
<div style="margin: 24px 0; text-align: left;"><a href="${appUrl}/my-bookings" style="display: inline-block; padding: 14px 24px; background: #4F46E5; color: #ffffff; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 14px; line-height: 1; letter-spacing: 0.005em; mso-padding-alt: 0;">View booking</a></div>
<p style="font-size: 14px; line-height: 1.5; margin: 0;">Thanks,<br>The DeskHive team</p>`;

  return {
    bodyHtml,
    previewText: `Payment of ${formatCents(data.amountCents)} received for your booking at ${data.spaceName}.`,
    subject: `Receipt for your DeskHive booking at ${data.spaceName}`,
  };
}
