import { describe, it, expect } from 'vitest';
import { renderPaymentReceipt } from './payment-receipt';

describe('renderPaymentReceipt (Story 8-4)', () => {
  it('renders amount + space name + booking date + appUrl CTA + dynamic subject', () => {
    const result = renderPaymentReceipt({
      guestName: 'Aisha Karimova',
      spaceName: 'Sundial Coworks',
      bookingDate: '2026-06-15',
      amountCents: 2500,
      appUrl: 'https://deskhive.test',
    });

    expect(result.bodyHtml).toContain('Aisha Karimova');
    expect(result.bodyHtml).toContain('Sundial Coworks');
    expect(result.bodyHtml).toContain('$25.00');
    // formatBookingDate produces "Mon, Jun 15" shape for 2026-06-15.
    expect(result.bodyHtml).toMatch(/Jun 15/);
    // CTA link to /my-bookings.
    expect(result.bodyHtml).toContain('https://deskhive.test/my-bookings');
    expect(result.bodyHtml).toContain('View booking');

    expect(result.previewText).toContain('$25.00');
    expect(result.previewText).toContain('Sundial Coworks');

    // BA Decision §4: dynamic subject interpolates space name.
    expect(result.subject).toBe(
      'Receipt for your DeskHive booking at Sundial Coworks',
    );
  });

  it('escapes HTML-unsafe content in guestName + spaceName', () => {
    const result = renderPaymentReceipt({
      guestName: '<script>alert("xss")</script>',
      spaceName: 'Café & Co',
      bookingDate: '2026-06-15',
      amountCents: 5000,
      appUrl: 'https://deskhive.test',
    });

    // Raw < and > should not survive into the rendered HTML body.
    expect(result.bodyHtml).not.toContain('<script>');
    expect(result.bodyHtml).toContain('&lt;script&gt;');
    expect(result.bodyHtml).toContain('Café &amp; Co');
  });
});
