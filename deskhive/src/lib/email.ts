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
  // Story 8-4 — payment-driven email renders.
  renderPaymentReceipt,
  renderPaymentRefund,
  renderPayoutSummary,
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
  // Story 8-4 — payment-driven emails (PRD §4.3 rows 12-14). Shapes
  // FINALIZED from the 8-1 placeholders per BA Decisions §3:
  //   • `appUrl` added to all 3 for the "View ..." CTA links.
  //   • `bookingDate` added to `payment-refund` so the body can echo the
  //     9-6 toast's "5–10 business days" timing copy with context.
  //   • `bookingCount` REMOVED from `payout-summary` — Phase 2 has no
  //     source for it (the `payout.paid` webhook payload doesn't include
  //     it; `stripe.payouts.listLineItems` is out of 9-7's scope per its
  //     Decision §1). Phase 3 if/when the local payouts cache lands.
  'payment-receipt': {
    guestName: string;
    spaceName: string;
    bookingDate: string;
    amountCents: number;
    appUrl: string;
  };
  'payment-refund': {
    guestName: string;
    spaceName: string;
    bookingDate: string;
    amountCents: number;
    appUrl: string;
  };
  'payout-summary': {
    ownerName: string;
    payoutAmountCents: number;
    appUrl: string;
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
  // Story 8-4 — PRD §4.3 verbatim subjects (corrected from 8-1
  // placeholders per BA Decision §4). `payment-receipt` + `payment-refund`
  // render functions return DYNAMIC subjects interpolating the space name
  // (8-3 pattern carry-forward) — the entries below are non-authoritative
  // fallbacks used by any future caller that bypasses the render
  // function. `payout-summary` renders the static subject (no space
  // context in payout emails per Decision §4).
  'payment-receipt': 'Receipt for your DeskHive booking',
  'payment-refund': 'Refund processed',
  'payout-summary': 'Payout sent',
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

// Story 8-POLISH-1 AC-7: retained as defensive infrastructure after the
// EMAIL_LOGO_URL caller was removed. Future templates interpolating
// untrusted strings into HTML attributes (e.g., href="${...}") should
// route through this helper.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function escapeHtmlAttr(input: string): string {
  return escapeHtml(input);
}

// ─────────────────────────────────────────────────────────────────────────
// Base HTML template — shared layout for all transactional emails.
// Story 8-POLISH-1 (Decisions §3 §5 §7 §8): visual wrapper applies
// Makhbuba's Phase 2 design. Inline-SVG hex logo (no clip-path, no
// external <img>), Inter via font-stack fallback (no <link>/@import),
// 600px white card on #FAFAFA gutter, locked footer copy (no
// link-to-nothing, no fake address, no © line).
// ─────────────────────────────────────────────────────────────────────────

const FONT_STACK = `'Inter', 'Inter Variable', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif`;

const HEX_LOGO_LARGE = `<svg width="22" height="22" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" style="vertical-align: middle; display: inline-block;"><polygon points="25,5 75,5 100,50 75,95 25,95 0,50" fill="#4F46E5" /></svg>`;
const HEX_LOGO_SMALL = `<svg width="14" height="14" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" style="vertical-align: middle; display: inline-block;"><polygon points="25,5 75,5 100,50 75,95 25,95 0,50" fill="#4F46E5" /></svg>`;

export function renderBaseTemplate(args: {
  bodyHtml: string;
  previewText: string;
}): string {
  const { bodyHtml, previewText } = args;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>DeskHive</title>
</head>
<body style="margin: 0; padding: 0; background-color: #FAFAFA; font-family: ${FONT_STACK}; color: #3F3F46;">
  <div style="display: none; max-height: 0; overflow: hidden; opacity: 0; mso-hide: all;">${escapeHtml(previewText)}</div>
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color: #FAFAFA;">
    <tr>
      <td align="center" style="padding: 32px 16px;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="max-width: 600px; background-color: #FFFFFF; border: 1px solid #E4E4E7; border-radius: 12px; overflow: hidden;">
          <tr>
            <td style="padding: 24px 32px; border-bottom: 1px solid #E4E4E7;">
              ${HEX_LOGO_LARGE}<span style="font-family: ${FONT_STACK}; font-size: 15px; font-weight: 500; color: #3F3F46; vertical-align: middle; margin-left: 8px;">DeskHive</span>
            </td>
          </tr>
          <tr>
            <td style="padding: 32px; font-family: ${FONT_STACK}; font-size: 15px; line-height: 24px; color: #3F3F46;">
              ${bodyHtml}
            </td>
          </tr>
          <tr>
            <td style="padding: 24px 32px; border-top: 1px solid #E4E4E7; font-family: ${FONT_STACK}; font-size: 13px; line-height: 20px; color: #71717A;">
              <div style="margin-bottom: 8px;">
                ${HEX_LOGO_SMALL}<span style="font-weight: 500; color: #3F3F46; vertical-align: middle; margin-left: 8px;">DeskHive</span>
              </div>
              <p style="margin: 0;">This email was sent because you have an active account on DeskHive. If you didn't expect this, you can safely ignore it.</p>
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
    // Story 8-4 — payment-driven emails. The "not implemented" default
    // throw below is now unreachable for these 3 names (Phase 2 complete).
    case 'payment-receipt':
      rendered = renderPaymentReceipt(data as TemplateData['payment-receipt']);
      break;
    case 'payment-refund':
      rendered = renderPaymentRefund(data as TemplateData['payment-refund']);
      break;
    case 'payout-summary':
      rendered = renderPayoutSummary(data as TemplateData['payout-summary']);
      break;
    default:
      throw new Error(
        `Template not implemented: '${String(name)}'. All Phase 2 templates wired by Story 8-4.`,
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
  // Story 8-4: optional idempotency key passed to Resend as the
  // `Idempotency-Key` header. Resend dedups server-side for 24h; same key
  // → returns the cached email id (HTTP 200). The 4xx error codes
  // `invalid_idempotent_request` / `concurrent_idempotent_requests` from
  // Resend are NOT dedup-success signals — they fire for malformed cases
  // (key reused with different params; two simultaneous requests). On
  // happy dedup Resend returns 200 with the cached email id; no special
  // handling needed in sendEmail per BA Decision §7 supplement.
  //
  // 8-2 / 8-3 callers (Server Actions) omit this arg — each invocation IS
  // a fresh send-intent; Story 8-4 callers (webhook handlers + action-side
  // payment paths) pass the unified resource-id key
  // (`receipt-${paymentIntentId}` / `refund-${paymentIntentId}` /
  // `payout-${payoutId}`) per BA Decision §7.
  idempotencyKey?: string;
}): Promise<SendEmailResult> {
  const { to, template, data, idempotencyKey } = args;

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

  const from = process.env.EMAIL_FROM_ADDRESS ?? 'DeskHive <onboarding@resend.dev>';
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey || apiKey.trim().length === 0) {
    console.error('[email] RESEND_API_KEY not configured', { template, to });
    return { status: 'error', error: 'RESEND_API_KEY not configured' };
  }

  try {
    const resend = new Resend(apiKey);
    // Story 8-4: pass idempotencyKey through to Resend's second
    // `RequestOptions` arg when present (omit cleanly when undefined so
    // 8-2 / 8-3 callers behave identically to pre-8-4).
    const sendOptions = idempotencyKey
      ? { idempotencyKey }
      : undefined;
    const result = await resend.emails.send(
      {
        from,
        to,
        subject: rendered.subject,
        html: rendered.html,
      },
      sendOptions,
    );
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
