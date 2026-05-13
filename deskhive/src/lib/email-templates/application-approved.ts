/**
 * Story 8-2: application-approved transactional email render.
 *
 * Sent to a Guest after a SUPER_ADMIN approves their application via
 * /admin/applications/[id]. Includes a CTA button linking to the app
 * homepage; user clicks "Switch to hosting" from the account menu to
 * land in /owner/* (BA Decision §3 — direct /owner link is unsafe
 * because mode cookie may not be set yet).
 *
 * Copy LOCKED VERBATIM by BA Decisions §3. Voice rule: transactional,
 * no exclamation, no emoji.
 */

import { escapeHtml, type TemplateData } from '@/lib/email';

export function renderApplicationApproved(
  data: TemplateData['application-approved'],
): { bodyHtml: string; previewText: string } {
  const applicantName = escapeHtml(data.applicantName);
  const businessName = escapeHtml(data.businessName);
  // appUrl flows into an href attribute — same escape (entity-encodes quotes).
  const appUrl = escapeHtml(data.appUrl);

  const bodyHtml = `<p style="font-size: 14px; line-height: 1.5; margin: 0 0 12px;">Hi ${applicantName},</p>
<p style="font-size: 14px; line-height: 1.5; margin: 0 0 12px;">Your Space Owner application for <strong>${businessName}</strong> has been approved. You can now list spaces and accept bookings on DeskHive.</p>
<p style="font-size: 14px; line-height: 1.5; margin: 0 0 16px;">To start hosting, sign in and click the account menu in the top right of any page. You'll see a new option: <strong>Switch to hosting</strong>. That's where your Space Owner dashboard lives.</p>
<p style="margin: 0 0 16px;"><a href="${appUrl}" style="display: inline-block; padding: 10px 20px; background: #4F46E5; color: #ffffff; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 14px;">Go to DeskHive</a></p>
<p style="font-size: 14px; line-height: 1.5; margin: 0 0 12px;">If you have any questions, just reply to this email.</p>
<p style="font-size: 14px; line-height: 1.5; margin: 0;">Thanks,<br>The DeskHive team</p>`;

  return {
    bodyHtml,
    previewText:
      'Welcome aboard. Switch to hosting from your account menu to get started.',
  };
}
