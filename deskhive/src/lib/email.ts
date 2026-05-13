/**
 * Story 8-1: Email service module — the typed seam for all transactional
 * emails. Wraps Resend so call sites never import the SDK directly.
 *
 * Family: joins src/lib/money.ts, src/lib/toast.ts, src/lib/applications.ts
 * as a single-file pure module. No 'use server' directive — callable from
 * Server Actions, Server Components, API routes, and CLI scripts alike.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * How to add a new template (Stories 8-2 / 8-3 / 8-4):
 * ─────────────────────────────────────────────────────────────────────────
 *   1. Add the template name to the TemplateName union below (with a
 *      comment marking which story owns it).
 *   2. Add the data shape to TemplateData under the same key.
 *   3. Add the subject to Subjects.
 *   4. Implement the render branch inside renderTemplate(name, data).
 *   5. Wire the caller in the corresponding Server Action / webhook
 *      handler, following the fire-and-forget pattern from §"Caller
 *      contract" below.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * Caller contract (Phase 2 PRD NFR-5):
 * ─────────────────────────────────────────────────────────────────────────
 *   sendEmail is NON-THROWING. Every internal exception is caught and
 *   converted to { status: 'error', error }. Callers fire-and-forget:
 *
 *     // inside some Server Action
 *     await db.transaction(...);  // the actual user work
 *     sendEmail({ to, template, data })
 *       .then(r => { if (r.status === 'error') console.warn('email failed', r.error); });
 *     return { status: 'success' };  // returns regardless of email outcome
 *
 *   Email failures NEVER roll back user-facing operations.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * Environment variables (documented in deskhive/.env.example):
 * ─────────────────────────────────────────────────────────────────────────
 *   RESEND_API_KEY         Required at runtime when sending. Free-tier key
 *                          from https://resend.com works.
 *   EMAIL_FROM_ADDRESS     Optional. Default: 'onboarding@resend.dev'
 *                          (Resend's sandbox sender). Set to a verified
 *                          domain sender for production.
 *   EMAIL_TEMPLATES_DISABLED  Optional. Comma-separated template names to
 *                             kill-switch off (e.g., '__test__' or
 *                             'booking-confirmed-owner,payment-receipt').
 *                             Disabled templates return { status: 'disabled' }
 *                             immediately without calling Resend.
 *   EMAIL_LOGO_URL         Optional. Public HTTPS URL of the DeskHive logo
 *                          PNG. When set, renderBaseTemplate emits an
 *                          <img> tag in the header. When unset (local dev
 *                          default), the header renders only the
 *                          "DeskHive" wordmark text — no <img>, no
 *                          broken-image icon.
 *   TEST_EMAIL_RECIPIENT   Read only by scripts/send-test-email.ts (the
 *                          CLI test-send tool). Not read here.
 */

import { Resend } from 'resend';

// ─────────────────────────────────────────────────────────────────────────
// Template registry (typed seam — adding a template means adding here).
// ─────────────────────────────────────────────────────────────────────────

export type TemplateName =
  // Story 8-2 — replaces src/lib/applications.ts notification stubs.
  | 'application-received'
  | 'application-approved'
  | 'application-rejected'
  // Story 8-3 — booking lifecycle, both Guest- and Owner-facing variants
  // per Phase 2 PRD §4.3.
  | 'booking-requested-guest'
  | 'booking-requested-owner'
  | 'booking-confirmed-guest'
  | 'booking-confirmed-owner'
  | 'booking-rejected-guest'
  | 'booking-cancelled-guest'
  | 'booking-cancelled-owner'
  // Story 8-4 — fired from Stripe webhook handlers in Epic 9.
  | 'payment-receipt'
  | 'payment-refund'
  | 'payout-summary'
  // Story 8-1 only — for BA pipeline verification. Story 8-2 may keep
  // this for ongoing infra verification or remove it once real templates
  // exist; not an 8-1 decision.
  | '__test__';

// Data shapes per template. 8-1 only consumes '__test__'; the other
// entries are placeholders that downstream stories will confirm or
// refine when they implement their render branches. The shapes here are
// the BA decision doc's plausible guesses (Decision §1).
export type TemplateData = {
  // Story 8-2
  'application-received': { applicantName: string; businessName: string };
  'application-approved': { applicantName: string };
  'application-rejected': { applicantName: string; reason: string | null };
  // Story 8-3
  'booking-requested-guest': {
    guestName: string;
    spaceName: string;
    deskLabel: string;
    bookingDate: string;
  };
  'booking-requested-owner': {
    ownerName: string;
    guestName: string;
    spaceName: string;
    deskLabel: string;
    bookingDate: string;
  };
  'booking-confirmed-guest': {
    guestName: string;
    spaceName: string;
    deskLabel: string;
    bookingDate: string;
  };
  'booking-confirmed-owner': {
    ownerName: string;
    guestName: string;
    spaceName: string;
    bookingDate: string;
  };
  'booking-rejected-guest': {
    guestName: string;
    spaceName: string;
    bookingDate: string;
  };
  'booking-cancelled-guest': {
    guestName: string;
    spaceName: string;
    bookingDate: string;
  };
  'booking-cancelled-owner': {
    ownerName: string;
    guestName: string;
    spaceName: string;
    bookingDate: string;
  };
  // Story 8-4
  'payment-receipt': {
    guestName: string;
    amountCents: number;
    spaceName: string;
    bookingDate: string;
  };
  'payment-refund': {
    guestName: string;
    amountCents: number;
    spaceName: string;
  };
  'payout-summary': {
    ownerName: string;
    payoutAmountCents: number;
    bookingCount: number;
  };
  // Story 8-1 verification
  '__test__': { message: string };
};

// Per-template subject lines. The '__test__' subject is locked verbatim
// by Story 8-1 BA Decision §9. Future template subjects are placeholders
// (Stories 8-2/8-3/8-4 finalize them at content time).
export const Subjects: Record<TemplateName, string> = {
  'application-received': 'Your DeskHive Space Owner application has been received',
  'application-approved': 'Welcome to DeskHive Hosting',
  'application-rejected': 'Update on your DeskHive Space Owner application',
  'booking-requested-guest': 'Your booking request is in',
  'booking-requested-owner': 'New booking request',
  'booking-confirmed-guest': 'Your booking is confirmed',
  'booking-confirmed-owner': 'Booking confirmed',
  'booking-rejected-guest': 'Your booking was declined',
  'booking-cancelled-guest': 'Your booking has been cancelled',
  'booking-cancelled-owner': 'Booking cancelled',
  'payment-receipt': 'Your DeskHive receipt',
  'payment-refund': 'Refund processed',
  'payout-summary': 'Your DeskHive payout',
  '__test__': '[DeskHive] Test email from Story 8-1',
};

// ─────────────────────────────────────────────────────────────────────────
// HTML escaping — defensive, even though 8-1 only renders controlled data.
// Downstream stories will interpolate user-supplied content (names,
// addresses) and inherit these helpers.
// ─────────────────────────────────────────────────────────────────────────

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeHtmlAttr(input: string): string {
  // Same escapes as body content; attributes are equally vulnerable to
  // injection if an env value happens to contain quotes.
  return escapeHtml(input);
}

// ─────────────────────────────────────────────────────────────────────────
// Base HTML template — shared layout for all transactional emails.
// Header + body slot + footer. Inline CSS only (email-client compatibility).
// Logo: hosted-PNG via EMAIL_LOGO_URL env, with wordmark-only fallback
// when unset (BA-revised 2026-05-13 pre-dispatch — see story file
// §"Email rendering quirks" for the rationale).
// ─────────────────────────────────────────────────────────────────────────

export function renderBaseTemplate(args: {
  bodyHtml: string;
  previewText: string;
}): string {
  const { bodyHtml, previewText } = args;
  const logoUrl = (process.env.EMAIL_LOGO_URL ?? '').trim();
  const logoHtml =
    logoUrl.length > 0
      ? `<img src="${escapeHtmlAttr(logoUrl)}" alt="DeskHive" width="22" height="22" style="vertical-align: middle; margin-right: 8px; border: 0;" />`
      : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>DeskHive</title>
</head>
<body style="margin: 0; padding: 0; background: #f5f5f7; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #18181b;">
  <div style="display: none; max-height: 0; overflow: hidden; opacity: 0; mso-hide: all;">${escapeHtml(previewText)}</div>
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background: #f5f5f7;">
    <tr>
      <td align="center" style="padding: 24px 12px;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="max-width: 600px; background: #ffffff; border-radius: 12px; box-shadow: 0 1px 3px rgba(0,0,0,0.06);">
          <tr>
            <td style="padding: 20px 24px; border-bottom: 1px solid #e4e4e7;">
              ${logoHtml}<span style="font-size: 16px; font-weight: 600; color: #4F46E5; vertical-align: middle;">DeskHive</span>
            </td>
          </tr>
          <tr>
            <td style="padding: 24px;">
              ${bodyHtml}
            </td>
          </tr>
          <tr>
            <td style="padding: 16px 24px; border-top: 1px solid #e4e4e7; font-size: 12px; color: #71717a; text-align: center;">
              © 2026 DeskHive
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

// ─────────────────────────────────────────────────────────────────────────
// Per-template render — Story 8-1 only implements '__test__'. All other
// branches throw a "not implemented" Error which the outer sendEmail
// try/catch converts to { status: 'error' }. Stories 8-2/8-3/8-4 add real
// branches here.
// ─────────────────────────────────────────────────────────────────────────

type RenderedTemplate = {
  html: string;
  subject: string;
  previewText: string;
};

function renderTemplate<T extends TemplateName>(
  name: T,
  data: TemplateData[T],
): RenderedTemplate {
  switch (name) {
    case '__test__': {
      const testData = data as TemplateData['__test__'];
      const previewText = 'Test email from DeskHive — pipeline verification';
      const bodyHtml = `<p style="font-size: 14px; line-height: 1.5; margin: 0 0 12px;">This is a test email from the DeskHive email service. If you're seeing this, the email pipeline works.</p>
<p style="font-size: 14px; line-height: 1.5; margin: 0 0 12px;">Message: <strong>${escapeHtml(testData.message)}</strong></p>
<p style="font-size: 12px; line-height: 1.5; margin: 0; color: #71717a;">Sent at ${new Date().toISOString()}.</p>`;
      return {
        html: renderBaseTemplate({ bodyHtml, previewText }),
        subject: Subjects['__test__'],
        previewText,
      };
    }
    default:
      throw new Error(
        `Template not implemented in Story 8-1: '${String(name)}'. Implemented in Story 8-2 (application-*), Story 8-3 (booking-*), or Story 8-4 (payment-*).`,
      );
  }
}

// ─────────────────────────────────────────────────────────────────────────
// sendEmail — the public surface. Non-throwing, kill-switch-aware,
// returns a structured result for caller observability.
// ─────────────────────────────────────────────────────────────────────────

export type SendEmailResult =
  | { status: 'sent' }
  | { status: 'disabled' }
  | { status: 'error'; error: string };

function getDisabledTemplates(): Set<string> {
  const raw = process.env.EMAIL_TEMPLATES_DISABLED ?? '';
  return new Set(
    raw
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s.length > 0),
  );
}

export async function sendEmail<T extends TemplateName>(args: {
  to: string;
  template: T;
  data: TemplateData[T];
}): Promise<SendEmailResult> {
  const { to, template, data } = args;

  // Kill-switch first — never call Resend if disabled.
  if (getDisabledTemplates().has(template)) {
    return { status: 'disabled' };
  }

  let rendered: RenderedTemplate;
  try {
    rendered = renderTemplate(template, data);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[email] render failed', { template, to, error: msg });
    return { status: 'error', error: msg };
  }

  const from = process.env.EMAIL_FROM_ADDRESS ?? 'onboarding@resend.dev';
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey || apiKey.trim().length === 0) {
    console.error('[email] RESEND_API_KEY not configured', { template, to });
    return { status: 'error', error: 'RESEND_API_KEY not configured' };
  }

  try {
    const resend = new Resend(apiKey);
    const result = await resend.emails.send({
      from,
      to,
      subject: rendered.subject,
      html: rendered.html,
    });
    // Resend's SDK returns { data, error } — surface the error if present.
    if (result.error) {
      const errMsg =
        typeof result.error === 'object' && result.error !== null && 'message' in result.error
          ? String((result.error as { message: unknown }).message)
          : JSON.stringify(result.error);
      console.error('[email] send failed', { template, to, error: errMsg });
      return { status: 'error', error: errMsg };
    }
    return { status: 'sent' };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[email] send failed', { template, to, error: msg });
    return { status: 'error', error: msg };
  }
}
