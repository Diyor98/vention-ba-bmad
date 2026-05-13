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
 *   EMAIL_TEST_RECORD_FILE Story 8-2: when set to a writable file path,
 *                          sendEmail appends a JSONL record per call and
 *                          skips the Resend call entirely. Used by
 *                          Playwright E2E tests to assert "the right
 *                          email was sent" without burning Resend quota.
 *                          Production: LEAVE UNSET (no-op when empty).
 */

import { Resend } from 'resend';
import {
  renderApplicationReceived,
  renderApplicationApproved,
  renderApplicationRejected,
  renderBookingRequestedGuest,
  renderBookingRequestedOwner,
  renderBookingConfirmedGuest,
  renderBookingConfirmedOwner,
  renderBookingRejectedGuest,
  renderBookingRejectedOwner,
  renderBookingCancelledGuest,
  renderBookingCancelledOwner,
  renderTestTemplate,
} from '@/lib/email-templates';

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
  | 'booking-rejected-owner'
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
  // Story 8-2 — application emails. Locked verbatim by BA Decisions §3.
  // NB: 'application-rejected' deliberately OMITS rejectionReason — making
  // accidental leakage a compile-time error (Story 8-2 Decision §6). The
  // admin's internal note stays in the DB; the user-facing email is generic.
  'application-received': { applicantName: string; businessName: string };
  'application-approved': { applicantName: string; businessName: string; appUrl: string };
  'application-rejected': { applicantName: string; businessName: string; appUrl: string };
  // Story 8-3 — booking lifecycle. Locked verbatim by BA Decisions §9.
  // Owner-side shapes deliberately OMIT `guestName` (Decision §9 privacy-
  // light minimalism: owner emails describe what to act on, not who the
  // guest is). Same type-level anti-leakage pattern as Story 8-2's
  // 'application-rejected' omission of rejectionReason. `bookingDate` is
  // a YYYY-MM-DD ISO string; render functions format it with
  // formatBookingDate from src/lib/format.ts.
  'booking-requested-guest': {
    guestName: string;
    spaceName: string;
    deskLabel: string;
    bookingDate: string;
    appUrl: string;
  };
  'booking-requested-owner': {
    ownerName: string;
    spaceName: string;
    deskLabel: string;
    bookingDate: string;
    appUrl: string;
  };
  'booking-confirmed-guest': {
    guestName: string;
    spaceName: string;
    deskLabel: string;
    bookingDate: string;
    appUrl: string;
  };
  'booking-confirmed-owner': {
    ownerName: string;
    spaceName: string;
    deskLabel: string;
    bookingDate: string;
    appUrl: string;
  };
  'booking-rejected-guest': {
    guestName: string;
    spaceName: string;
    deskLabel: string;
    bookingDate: string;
    appUrl: string;
  };
  'booking-rejected-owner': {
    ownerName: string;
    spaceName: string;
    deskLabel: string;
    bookingDate: string;
    appUrl: string;
  };
  'booking-cancelled-guest': {
    guestName: string;
    spaceName: string;
    deskLabel: string;
    bookingDate: string;
    appUrl: string;
  };
  'booking-cancelled-owner': {
    ownerName: string;
    spaceName: string;
    deskLabel: string;
    bookingDate: string;
    appUrl: string;
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
  // Story 8-2 — locked verbatim by BA Decisions §3. Received + rejected
  // intentionally share a subject so the user's inbox threads their
  // application lifecycle together.
  'application-received': 'Your DeskHive Space Owner application',
  'application-approved': "You're approved as a DeskHive Space Owner",
  'application-rejected': 'Your DeskHive Space Owner application',
  // Story 8-3 — booking subjects are DYNAMIC (interpolated with spaceName
  // and bookingDate per BA Decision §6). The render functions return their
  // own subject string at render time; the entries below are non-
  // authoritative fallbacks for any future caller that bypasses the render
  // function. renderTemplate dispatches via `rendered.subject ?? Subjects[name]`.
  'booking-requested-guest': '[DeskHive] Your booking',
  'booking-requested-owner': '[DeskHive] Booking on your space',
  'booking-confirmed-guest': '[DeskHive] Your booking',
  'booking-confirmed-owner': '[DeskHive] Booking on your space',
  'booking-rejected-guest': '[DeskHive] Your booking',
  'booking-rejected-owner': '[DeskHive] Booking on your space',
  'booking-cancelled-guest': '[DeskHive] Your booking',
  'booking-cancelled-owner': '[DeskHive] Booking on your space',
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

// Story 8-2: promoted from private to exported so template renderers in
// src/lib/email-templates/ can use it. The matching escapeHtmlAttr stays
// private — only renderBaseTemplate needs it (for the logo URL).
export function escapeHtml(input: string): string {
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

// Story 8-3: render functions may optionally return their own `subject`
// for templates with interpolated subjects (e.g., '[DeskHive] Your
// booking at {spaceName}'). When omitted, renderTemplate falls back to
// the static Subjects[name] registry. Story 8-2 templates + '__test__'
// continue to use the static path; only Story 8-3 booking templates
// return rendered.subject.
type TemplateRenderResult = {
  bodyHtml: string;
  previewText: string;
  subject?: string;
};

function renderTemplate<T extends TemplateName>(
  name: T,
  data: TemplateData[T],
): RenderedTemplate {
  let rendered: TemplateRenderResult;
  switch (name) {
    case '__test__':
      rendered = renderTestTemplate(data as TemplateData['__test__']);
      break;
    case 'application-received':
      rendered = renderApplicationReceived(
        data as TemplateData['application-received'],
      );
      break;
    case 'application-approved':
      rendered = renderApplicationApproved(
        data as TemplateData['application-approved'],
      );
      break;
    case 'application-rejected':
      rendered = renderApplicationRejected(
        data as TemplateData['application-rejected'],
      );
      break;
    case 'booking-requested-guest':
      rendered = renderBookingRequestedGuest(
        data as TemplateData['booking-requested-guest'],
      );
      break;
    case 'booking-requested-owner':
      rendered = renderBookingRequestedOwner(
        data as TemplateData['booking-requested-owner'],
      );
      break;
    case 'booking-confirmed-guest':
      rendered = renderBookingConfirmedGuest(
        data as TemplateData['booking-confirmed-guest'],
      );
      break;
    case 'booking-confirmed-owner':
      rendered = renderBookingConfirmedOwner(
        data as TemplateData['booking-confirmed-owner'],
      );
      break;
    case 'booking-rejected-guest':
      rendered = renderBookingRejectedGuest(
        data as TemplateData['booking-rejected-guest'],
      );
      break;
    case 'booking-rejected-owner':
      rendered = renderBookingRejectedOwner(
        data as TemplateData['booking-rejected-owner'],
      );
      break;
    case 'booking-cancelled-guest':
      rendered = renderBookingCancelledGuest(
        data as TemplateData['booking-cancelled-guest'],
      );
      break;
    case 'booking-cancelled-owner':
      rendered = renderBookingCancelledOwner(
        data as TemplateData['booking-cancelled-owner'],
      );
      break;
    default:
      throw new Error(
        `Template not implemented: '${String(name)}'. Implemented in Story 8-4 (payment-*).`,
      );
  }
  return {
    html: renderBaseTemplate({
      bodyHtml: rendered.bodyHtml,
      previewText: rendered.previewText,
    }),
    subject: rendered.subject ?? Subjects[name],
    previewText: rendered.previewText,
  };
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

  // Story 8-2 AC-6: E2E test recording sink. When EMAIL_TEST_RECORD_FILE
  // is set, write a JSON record and skip the Resend call entirely. This
  // is how Playwright workers verify "the right email would have been
  // sent" without depending on Resend's uptime or burning the free-tier
  // quota. Production-safe: unset = no recording, Story 8-1 behavior.
  // Set in playwright.config.ts via webServer.env for E2E runs.
  const recordPath = (process.env.EMAIL_TEST_RECORD_FILE ?? '').trim();
  if (recordPath.length > 0) {
    try {
      const fs = await import('node:fs/promises');
      const record = {
        template,
        to,
        subject: rendered.subject,
        dataJson: JSON.stringify(data),
        timestamp: new Date().toISOString(),
      };
      await fs.appendFile(recordPath, JSON.stringify(record) + '\n', 'utf8');
      return { status: 'sent' };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[email] recording failed', { template, to, error: msg });
      return { status: 'error', error: msg };
    }
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
