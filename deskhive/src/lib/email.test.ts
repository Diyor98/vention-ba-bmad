import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock the Resend SDK before importing the wrapper. Pattern mirrors
// src/lib/toast.test.ts's vi.mock('sonner', ...) — the wrapper must see
// the mock at module-load time.
const sendMock = vi.fn();
vi.mock('resend', () => {
  return {
    Resend: vi.fn().mockImplementation(() => ({
      emails: { send: sendMock },
    })),
  };
});

import { sendEmail, renderBaseTemplate, Subjects } from './email';

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  sendMock.mockReset();
  // Provide a baseline API key + clear From-header override + kill-switch
  // so each test starts from a known state. Story 8-POLISH-1: the From
  // default flows from sendEmail's '?? "DeskHive <onboarding@resend.dev>"'
  // fallback when EMAIL_FROM_ADDRESS is unset; tests that need to assert
  // an override set it explicitly.
  process.env.RESEND_API_KEY = 'test-key';
  delete process.env.EMAIL_FROM_ADDRESS;
  delete process.env.EMAIL_TEMPLATES_DISABLED;
});

afterEach(() => {
  // Restore env to baseline between tests.
  process.env = { ...ORIGINAL_ENV };
});

describe('sendEmail (Story 8-1)', () => {
  it('happy path: __test__ template sends via Resend with correct from/to/subject/html', async () => {
    sendMock.mockResolvedValueOnce({ data: { id: 'msg_123' }, error: null });

    const result = await sendEmail({
      to: 'recipient@example.com',
      template: '__test__',
      data: { message: 'hi' },
    });

    expect(result).toEqual({ status: 'sent' });
    expect(sendMock).toHaveBeenCalledTimes(1);
    const call = sendMock.mock.calls[0]?.[0] as {
      from: string;
      to: string;
      subject: string;
      html: string;
    };
    expect(call.from).toBe('DeskHive <onboarding@resend.dev>');
    expect(call.to).toBe('recipient@example.com');
    expect(call.subject).toBe('[DeskHive] Test email from Story 8-1');
    expect(call.html).toContain('hi');
    expect(call.html).toContain(
      'This email was sent because you have an active account on DeskHive',
    );
  });

  it('error path: Resend throw is caught and surfaced as { status: error }', async () => {
    sendMock.mockRejectedValueOnce(new Error('Resend API down'));

    // No try/catch here — sendEmail MUST NOT throw.
    const result = await sendEmail({
      to: 'r@example.com',
      template: '__test__',
      data: { message: 'x' },
    });

    expect(result.status).toBe('error');
    if (result.status === 'error') {
      expect(result.error).toContain('Resend API down');
    }
  });

  it('error path: Resend { error } response is surfaced as { status: error }', async () => {
    // Resend SDK returns { data: null, error: {...} } on validation failures
    // (e.g., unverified sender domain). The wrapper should NOT throw and
    // should map the error into the structured result.
    sendMock.mockResolvedValueOnce({
      data: null,
      error: { name: 'validation_error', message: 'Invalid sender domain' },
    });

    const result = await sendEmail({
      to: 'r@example.com',
      template: '__test__',
      data: { message: 'x' },
    });

    expect(result.status).toBe('error');
    if (result.status === 'error') {
      expect(result.error).toContain('Invalid sender domain');
    }
  });

  it('kill-switch: disabled template returns { status: disabled } without calling Resend', async () => {
    process.env.EMAIL_TEMPLATES_DISABLED = '__test__';

    const result = await sendEmail({
      to: 'r@example.com',
      template: '__test__',
      data: { message: 'x' },
    });

    expect(result).toEqual({ status: 'disabled' });
    expect(sendMock).not.toHaveBeenCalled();
  });

  it('kill-switch: disabling unrelated templates does not affect __test__', async () => {
    process.env.EMAIL_TEMPLATES_DISABLED = 'booking-confirmed-owner,payment-receipt';
    sendMock.mockResolvedValueOnce({ data: { id: 'msg_x' }, error: null });

    const result = await sendEmail({
      to: 'r@example.com',
      template: '__test__',
      data: { message: 'x' },
    });

    expect(result).toEqual({ status: 'sent' });
    expect(sendMock).toHaveBeenCalledTimes(1);
  });

  it('missing RESEND_API_KEY returns { status: error } without calling Resend', async () => {
    delete process.env.RESEND_API_KEY;

    const result = await sendEmail({
      to: 'r@example.com',
      template: '__test__',
      data: { message: 'x' },
    });

    expect(result.status).toBe('error');
    if (result.status === 'error') {
      expect(result.error).toContain('RESEND_API_KEY');
    }
    expect(sendMock).not.toHaveBeenCalled();
  });

  it('payment-receipt template (8-4 now wired) renders successfully via the dispatcher', async () => {
    // Story 8-3 implemented all 8 booking-* templates; this probe
    // previously verified the 'not implemented' default throw using
    // 'payment-receipt' as the canary. After Story 8-4 wires all 3
    // payment-driven templates (payment-receipt / payment-refund /
    // payout-summary), the renderTemplate switch's default branch is
    // STRUCTURALLY UNREACHABLE for any TemplateName entry — Phase 2 is
    // complete. The test now asserts the previously-placeholder template
    // renders successfully end-to-end (sendEmail returns { status:
    // 'sent' } and Resend.emails.send was called).
    sendMock.mockResolvedValueOnce({ data: { id: 'res-payment-receipt' }, error: null });
    const result = await sendEmail({
      to: 'r@example.com',
      template: 'payment-receipt',
      data: {
        guestName: 'Test',
        spaceName: 'Acme',
        bookingDate: '2026-06-01',
        amountCents: 2500,
        appUrl: 'http://localhost:3000',
      },
    });

    expect(result.status).toBe('sent');
    expect(sendMock).toHaveBeenCalledTimes(1);
  });

  it('compile-time type safety: wrong data shape for a template is a TS error', async () => {
    // This test's PRIMARY assertion is the `// @ts-expect-error` directive
    // below: if TS stops flagging the shape mismatch, the directive
    // becomes an "unused @ts-expect-error" build error and the test file
    // fails to compile. `pnpm typecheck` passing is the contract.
    //
    // Secondary runtime check: sendEmail is documented as non-throwing
    // (Decision §4). Even with a malformed data shape (where the
    // template renderer hits an undefined field), the call returns a
    // structured result rather than throwing.
    const result = await sendEmail({
      to: 'r@example.com',
      template: '__test__',
      // @ts-expect-error: data shape mismatch — '__test__' expects { message: string }, not { wrongField }
      data: { wrongField: 'x' },
    });

    // Whatever the runtime path produces, it must be a SendEmailResult.
    expect(['sent', 'disabled', 'error']).toContain(result.status);
  });
});

describe('renderBaseTemplate (Story 8-POLISH-1)', () => {
  it('renders header + body + footer with hex SVG', () => {
    const html = renderBaseTemplate({
      bodyHtml: '<p>hi body</p>',
      previewText: 'preview line',
    });

    expect(html).toContain('<p>hi body</p>');
    expect(html).toContain('DeskHive');
    expect(html).toContain('preview line');
    // Locked footer copy from BA Decision §7 — no link-to-nothing, no
    // fake address, no copyright line.
    expect(html).toContain(
      'This email was sent because you have an active account on DeskHive',
    );
    // Inline SVG hex replaces the Story 8-1 EMAIL_LOGO_URL <img> branch.
    expect(html).toContain('<svg');
    expect(html).not.toContain('<img');
  });

  it('escapes HTML in previewText to prevent injection', () => {
    const html = renderBaseTemplate({
      bodyHtml: '<p>safe</p>',
      previewText: '<script>alert(1)</script>',
    });
    // Body content (bodyHtml) is trusted by the caller; previewText is
    // template-data territory and gets escaped defensively.
    expect(html).toContain('&lt;script&gt;');
    expect(html).not.toMatch(/<script[^>]*>alert/);
  });

  // ─────────────────────────────────────────────────────────────────────
  // BA Decision §12 — three new wrapper tests pinning the polish.
  // ─────────────────────────────────────────────────────────────────────

  it('renders inline SVG hex logo with #4F46E5 fill (no clip-path, no <img>)', () => {
    const html = renderBaseTemplate({
      bodyHtml: '<p>x</p>',
      previewText: 'p',
    });
    expect(html).toContain('<svg');
    expect(html).toContain(
      '<polygon points="25,5 75,5 100,50 75,95 25,95 0,50"',
    );
    expect(html).toContain('fill="#4F46E5"');
    // Anti-pattern guards: external image refs and clip-path are out.
    expect(html).not.toContain('<img');
    expect(html).not.toContain('clip-path');
  });

  it('renders the new locked footer copy (BA Decision §7)', () => {
    const html = renderBaseTemplate({
      bodyHtml: '<p>x</p>',
      previewText: 'p',
    });
    expect(html).toContain(
      'This email was sent because you have an active account on DeskHive',
    );
    expect(html).toContain('you can safely ignore it');
  });

  it('does NOT contain the old Story 8-1 © 2026 footer (regression guard)', () => {
    const html = renderBaseTemplate({
      bodyHtml: '<p>x</p>',
      previewText: 'p',
    });
    // Decision §7: copyright line removed; this test pins against
    // accidental re-add when future templates copy from old examples.
    expect(html).not.toContain('© 2026 DeskHive');
  });
});

describe('Subjects (Story 8-1 — verbatim pin per BA Decision §9)', () => {
  it('__test__ subject is verbatim from BA Decision §9', () => {
    expect(Subjects['__test__']).toBe('[DeskHive] Test email from Story 8-1');
  });
});
