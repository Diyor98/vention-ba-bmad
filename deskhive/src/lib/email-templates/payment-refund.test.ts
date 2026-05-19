import { describe, it, expect } from 'vitest';
import { renderPaymentRefund } from './payment-refund';

describe('renderPaymentRefund (Story 8-4)', () => {
  it('renders refund amount + space + date + appUrl CTA + dynamic subject', () => {
    const result = renderPaymentRefund({
      guestName: 'Aisha Karimova',
      spaceName: 'Sundial Coworks',
      bookingDate: '2026-06-15',
      amountCents: 2500,
      appUrl: 'https://deskhive.test',
    });

    expect(result.bodyHtml).toContain('Aisha Karimova');
    expect(result.bodyHtml).toContain('Sundial Coworks');
    expect(result.bodyHtml).toContain('$25.00');
    expect(result.bodyHtml).toMatch(/Jun 15/);
    expect(result.bodyHtml).toContain('https://deskhive.test/my-bookings');
    expect(result.bodyHtml).toContain('View my bookings');

    expect(result.subject).toBe('Refund processed for Sundial Coworks');
  });

  it('LOAD-BEARING regression: body MUST include the "5–10 business days" timing copy', () => {
    // BA Decision §10 + AC-10 explicit regression assertion: the
    // 9-6 refund-success toast lock specifies the 5-10 business-day
    // settlement-window copy; the 8-4 refund email body MUST echo it.
    const result = renderPaymentRefund({
      guestName: 'Test',
      spaceName: 'Test Space',
      bookingDate: '2026-06-15',
      amountCents: 1000,
      appUrl: 'https://deskhive.test',
    });

    // The render uses an en-dash entity (&ndash;) for the 5-10 range
    // typographically. Either the literal "5–10" or the entity form
    // "5&ndash;10" is acceptable; both render as "5–10" in email
    // clients. We accept either form here to keep the test resilient
    // to typography refinements.
    const hasRange =
      result.bodyHtml.includes('5–10') || result.bodyHtml.includes('5&ndash;10');
    expect(hasRange).toBe(true);
    expect(result.bodyHtml.toLowerCase()).toContain('business days');
  });

  it('escapes HTML-unsafe content', () => {
    const result = renderPaymentRefund({
      guestName: '<b>bold</b>',
      spaceName: 'A & B',
      bookingDate: '2026-06-15',
      amountCents: 1000,
      appUrl: 'https://deskhive.test',
    });

    expect(result.bodyHtml).not.toContain('<b>bold</b>');
    expect(result.bodyHtml).toContain('&lt;b&gt;bold&lt;/b&gt;');
    expect(result.bodyHtml).toContain('A &amp; B');
  });
});
