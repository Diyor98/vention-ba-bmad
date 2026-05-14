/**
 * Story 8-2: application-rejected transactional email render.
 *
 * Sent to a Guest after a SUPER_ADMIN rejects their application. Generic
 * "we're unable to approve" copy with a soft "Browse spaces" CTA to
 * keep the user engaged as a Guest.
 *
 * Critical: NO rejection_reason interpolation. BA Decisions §6 + AC-4:
 * the admin's internal note stays in the DB (Story 7-4's reject-modal
 * helper text promised admins "the reason is for your records"). The
 * TemplateData shape itself omits the reason field, making accidental
 * leakage a compile-time error.
 *
 * Copy LOCKED VERBATIM by BA Decisions §3. Voice rule: transactional,
 * no exclamation, no emoji.
 */

import { escapeHtml, type TemplateData } from '@/lib/email';

export function renderApplicationRejected(
  data: TemplateData['application-rejected'],
): { bodyHtml: string; previewText: string } {
  const applicantName = escapeHtml(data.applicantName);
  const businessName = escapeHtml(data.businessName);
  const appUrl = escapeHtml(data.appUrl);

  const bodyHtml = `<p style="font-size: 14px; line-height: 1.5; margin: 0 0 12px;">Hi ${applicantName},</p>
<p style="font-size: 14px; line-height: 1.5; margin: 0 0 12px;">Thanks for your interest in becoming a Space Owner on DeskHive. After reviewing your application for <strong>${businessName}</strong>, we're unable to approve it at this time.</p>
<p style="font-size: 14px; line-height: 1.5; margin: 0 0 16px;">You're welcome to apply again in the future if your circumstances change. In the meantime, you can continue using DeskHive to book spaces as a guest.</p>
<div style="margin: 24px 0; text-align: left;"><a href="${appUrl}" style="display: inline-block; padding: 14px 24px; background: #4F46E5; color: #ffffff; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 14px; line-height: 1; letter-spacing: 0.005em; mso-padding-alt: 0;">Browse spaces</a></div>
<p style="font-size: 14px; line-height: 1.5; margin: 0;">Thanks,<br>The DeskHive team</p>`;

  return {
    bodyHtml,
    previewText:
      "Thanks for applying. Unfortunately, we weren't able to approve your application at this time.",
  };
}
