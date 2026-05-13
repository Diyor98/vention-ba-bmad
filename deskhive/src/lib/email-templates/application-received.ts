/**
 * Story 8-2: application-received transactional email render.
 *
 * Sent to a Guest when they submit a Space Owner application via
 * /become-a-host. Informational only — no CTA button (BA Decision §3).
 *
 * Copy LOCKED VERBATIM by BA Decisions §3. Voice rule: transactional,
 * no exclamation, no emoji (BA Decisions §4 + memory
 * reference_toast_wrapper_and_voice.md).
 */

import { escapeHtml, type TemplateData } from '@/lib/email';

export function renderApplicationReceived(
  data: TemplateData['application-received'],
): { bodyHtml: string; previewText: string } {
  const applicantName = escapeHtml(data.applicantName);
  const businessName = escapeHtml(data.businessName);

  const bodyHtml = `<p style="font-size: 14px; line-height: 1.5; margin: 0 0 12px;">Hi ${applicantName},</p>
<p style="font-size: 14px; line-height: 1.5; margin: 0 0 12px;">We've received your Space Owner application for <strong>${businessName}</strong>. Our team will review it and get back to you within a few business days.</p>
<p style="font-size: 14px; line-height: 1.5; margin: 0 0 12px;">You don't need to do anything right now. We'll email you again when the review is complete.</p>
<p style="font-size: 14px; line-height: 1.5; margin: 0;">Thanks,<br>The DeskHive team</p>`;

  return {
    bodyHtml,
    previewText: "We've received your application and will review it shortly.",
  };
}
