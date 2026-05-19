/**
 * Story 8-4: payout-summary transactional email render.
 *
 * Sent to a Space Owner after Stripe's test-mode-simulated daily payout
 * settles to their connected bank account. PRD §4.3 row 14. Fires
 * SOLELY from Story 9-7's `handlePayoutPaid` webhook handler — no
 * action-side caller (payouts are Stripe-initiated, not user-initiated).
 *
 * Subject is STATIC (`'Payout sent'`) per BA Decision §4 — payout
 * emails have no space context to interpolate. The render function
 * deliberately OMITS `subject` from its return so the dispatcher falls
 * back to the static `Subjects['payout-summary']` entry.
 *
 * **Body MUST NOT mention a booking count** (BA Decision §3 + §10
 * LOAD-BEARING regression assertion). Phase 2 has no source for the
 * count — the `payout.paid` webhook payload doesn't include it, and
 * `stripe.payouts.listLineItems` is out of 9-7's scope (Phase 3). The
 * render-function test asserts the body does NOT contain "booking" near
 * a count phrase.
 *
 * CTA links to /owner/payouts (Story 9-7's payouts view) — the Owner
 * can drill into their payout history from there.
 */

import { escapeHtml, type TemplateData } from '@/lib/email';
import { formatCents } from '@/lib/format';

export function renderPayoutSummary(
  data: TemplateData['payout-summary'],
): { bodyHtml: string; previewText: string } {
  const ownerName = escapeHtml(data.ownerName);
  const amount = escapeHtml(formatCents(data.payoutAmountCents));
  const appUrl = escapeHtml(data.appUrl);

  const bodyHtml = `<p style="font-size: 14px; line-height: 1.5; margin: 0 0 12px;">Hi ${ownerName},</p>
<p style="font-size: 14px; line-height: 1.5; margin: 0 0 12px;">A payout of <strong>${amount}</strong> has been sent to your bank account on Stripe's schedule.</p>
<p style="font-size: 14px; line-height: 1.5; margin: 0 0 16px;">You can view your payout history at any time.</p>
<div style="margin: 24px 0; text-align: left;"><a href="${appUrl}/owner/payouts" style="display: inline-block; padding: 14px 24px; background: #4F46E5; color: #ffffff; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 14px; line-height: 1; letter-spacing: 0.005em; mso-padding-alt: 0;">View payouts</a></div>
<p style="font-size: 14px; line-height: 1.5; margin: 0;">Thanks,<br>The DeskHive team</p>`;

  return {
    bodyHtml,
    previewText: `A payout of ${formatCents(data.payoutAmountCents)} was sent to your bank account.`,
    // Subject deliberately omitted — falls back to static
    // `Subjects['payout-summary']` ("Payout sent") per BA Decision §4.
  };
}
