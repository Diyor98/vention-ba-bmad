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
  // Provide a baseline API key + clear logo/kill-switch so each test
  // starts from a known state. Individual tests override as needed.
  process.env.RESEND_API_KEY = 'test-key';
  process.env.EMAIL_FROM_ADDRESS = 'onboarding@resend.dev';
  delete process.env.EMAIL_TEMPLATES_DISABLED;
  delete process.env.EMAIL_LOGO_URL;
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
    expect(call.from).toBe('onboarding@resend.dev');
    expect(call.to).toBe('recipient@example.com');
    expect(call.subject).toBe('[DeskHive] Test email from Story 8-1');
    expect(call.html).toContain('hi');
    expect(call.html).toContain('© 2026 DeskHive');
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

  it('not-implemented template (8-4 placeholder) returns { status: error } without calling Resend', async () => {
    // Story 8-3 implemented all 8 booking-* templates; this probe now
    // uses a Story 8-4 placeholder ('payment-receipt') that still throws
    // 'not implemented' in the renderTemplate switch.
    const result = await sendEmail({
      to: 'r@example.com',
      template: 'payment-receipt',
      data: {
        guestName: 'Test',
        amountCents: 2500,
        spaceName: 'Acme',
        bookingDate: '2026-06-01',
      },
    });

    expect(result.status).toBe('error');
    if (result.status === 'error') {
      expect(result.error).toContain('not implemented');
    }
    expect(sendMock).not.toHaveBeenCalled();
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

describe('renderBaseTemplate (Story 8-1)', () => {
  it('renders header + body + footer, no <img> when EMAIL_LOGO_URL is unset', () => {
    // EMAIL_LOGO_URL deleted in beforeEach.
    const html = renderBaseTemplate({
      bodyHtml: '<p>hi body</p>',
      previewText: 'preview line',
    });

    expect(html).toContain('<p>hi body</p>');
    expect(html).toContain('DeskHive');
    expect(html).toContain('© 2026 DeskHive');
    expect(html).toContain('preview line');
    // No img tag when the URL is unset — wordmark-only fallback.
    expect(html).not.toContain('<img');
  });

  it('renders <img> with logo URL + alt text when EMAIL_LOGO_URL is set', () => {
    process.env.EMAIL_LOGO_URL = 'https://example.com/logo.png';
    const html = renderBaseTemplate({
      bodyHtml: '<p>body</p>',
      previewText: 'p',
    });

    expect(html).toContain('<img');
    expect(html).toContain('https://example.com/logo.png');
    expect(html).toContain('alt="DeskHive"');
    expect(html).toContain('width="22"');
    expect(html).toContain('height="22"');
  });

  it('treats empty/whitespace EMAIL_LOGO_URL as unset (no <img>)', () => {
    process.env.EMAIL_LOGO_URL = '   ';
    const html = renderBaseTemplate({
      bodyHtml: '<p>x</p>',
      previewText: 'p',
    });
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

  it('escapes HTML attribute injection in EMAIL_LOGO_URL', () => {
    // Defensive: env values are operator-controlled, but the attribute
    // escape is the right pattern regardless.
    process.env.EMAIL_LOGO_URL = 'https://x.com/a.png" onerror="alert(1)';
    const html = renderBaseTemplate({
      bodyHtml: '<p>x</p>',
      previewText: 'p',
    });
    // The bare onerror attribute should not appear unescaped.
    expect(html).not.toMatch(/" onerror="alert/);
    // The quotes inside the URL should be entity-encoded.
    expect(html).toContain('&quot;');
  });
});

describe('Subjects (Story 8-1 — verbatim pin per BA Decision §9)', () => {
  it('__test__ subject is verbatim from BA Decision §9', () => {
    expect(Subjects['__test__']).toBe('[DeskHive] Test email from Story 8-1');
  });
});
