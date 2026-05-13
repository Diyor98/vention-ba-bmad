/**
 * Story 8-1 verification template — extracted to email-templates/ during
 * Story 8-2 to set the per-template-per-file convention. Body content
 * identical to Story 8-1's inline branch; only the location moved.
 *
 * Story 8-2 keeps this for ongoing infra verification via
 * `pnpm send-test-email`. A future story may remove it once Theme C is
 * complete and the infra confidence no longer needs a dedicated probe.
 */

import { escapeHtml, type TemplateData } from '@/lib/email';

export function renderTestTemplate(
  data: TemplateData['__test__'],
): { bodyHtml: string; previewText: string } {
  const bodyHtml = `<p style="font-size: 14px; line-height: 1.5; margin: 0 0 12px;">This is a test email from the DeskHive email service. If you're seeing this, the email pipeline works.</p>
<p style="font-size: 14px; line-height: 1.5; margin: 0 0 12px;">Message: <strong>${escapeHtml(data.message)}</strong></p>
<p style="font-size: 12px; line-height: 1.5; margin: 0; color: #71717a;">Sent at ${new Date().toISOString()}.</p>`;

  return {
    bodyHtml,
    previewText: 'Test email from DeskHive — pipeline verification',
  };
}
