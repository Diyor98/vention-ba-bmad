import { describe, it, expect } from 'vitest';
import { renderPayoutSummary } from './payout-summary';

describe('renderPayoutSummary (Story 8-4)', () => {
  it('renders amount + ownerName + appUrl CTA → /owner/payouts; omits subject (static fallback)', () => {
    const result = renderPayoutSummary({
      ownerName: 'Bobur Tashkentov',
      payoutAmountCents: 21250,
      appUrl: 'https://deskhive.test',
    });

    expect(result.bodyHtml).toContain('Bobur Tashkentov');
    expect(result.bodyHtml).toContain('$212.50');
    expect(result.bodyHtml).toContain('https://deskhive.test/owner/payouts');
    expect(result.bodyHtml).toContain('View payouts');

    expect(result.previewText).toContain('$212.50');
    expect(result.previewText.toLowerCase()).toContain('payout');

    // BA Decision §4: payout-summary deliberately OMITS dynamic subject
    // (no space context) — dispatcher falls back to the static
    // Subjects['payout-summary'] = 'Payout sent'.
    expect('subject' in result).toBe(false);
  });

  it('LOAD-BEARING regression: body MUST NOT mention a booking count', () => {
    // BA Decision §3 + AC-3 + AC-10 explicit regression assertion:
    // Phase 2 has no source for the count (the payout.paid webhook
    // payload doesn't include it; stripe.payouts.listLineItems is out
    // of 9-7's locked scope). Phase 3 if/when the local payouts cache
    // table lands. The template MUST NOT mention any per-booking
    // breakdown in the body.
    const result = renderPayoutSummary({
      ownerName: 'Test Owner',
      payoutAmountCents: 10000,
      appUrl: 'https://deskhive.test',
    });

    const lower = result.bodyHtml.toLowerCase();
    // Defensive: look for common phrasings that would imply a count.
    // The template's actual copy is "A payout of $X was sent..." with
    // no booking-count framing.
    expect(lower).not.toMatch(/\d+\s+bookings?/);
    expect(lower).not.toContain('for the following bookings');
    expect(lower).not.toContain('booking count');
    // The word "booking" SHOULD not appear at all in the payout body
    // (Phase 3 forward-flag — partial-refund / drill-down territory).
    expect(lower).not.toContain('booking');
  });

  it('escapes HTML-unsafe content in ownerName', () => {
    const result = renderPayoutSummary({
      ownerName: '<img src=x>',
      payoutAmountCents: 5000,
      appUrl: 'https://deskhive.test',
    });

    expect(result.bodyHtml).not.toContain('<img src=x>');
    expect(result.bodyHtml).toContain('&lt;img src=x&gt;');
  });
});
