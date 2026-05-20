import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

// DESIGN-INT-CHECKOUT-EMBED Phase 2 — Component smoke tests.
//
// `<EmbeddedCheckoutProvider>` and `<EmbeddedCheckout>` from
// @stripe/react-stripe-js try to mount a real iframe at runtime. In
// jsdom we stub them as pass-through divs so we can verify the
// surrounding chrome (Stripe-S badge, summary card amounts, error
// state) without instantiating Stripe.js.
//
// `loadStripe` from @stripe/stripe-js is similarly stubbed — the
// component holds it in a useMemo'd promise, but never resolves it
// to anything our tests depend on.

vi.mock('@stripe/stripe-js', () => ({
  loadStripe: vi.fn().mockResolvedValue({ __mock: 'stripe-instance' }),
}));

vi.mock('@stripe/react-stripe-js', () => ({
  EmbeddedCheckoutProvider: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="ecp-stub">{children}</div>
  ),
  EmbeddedCheckout: () => <div data-testid="embedded-checkout-stub" />,
}));

import { BookingCheckoutEmbed } from './booking-checkout-embed';

const SUMMARY_PROPS = {
  spaceId: 'abc',
  spaceName: 'Seeded Owner Coworks',
  spaceImageUrl: 'https://example.com/img.jpg',
  deskLabel: 'Desk 1',
  bookingDate: '2026-06-01',
  amountCents: 2500,
  platformFeeCents: 375,
};

describe('<BookingCheckoutEmbed> (DESIGN-INT-CHECKOUT-EMBED Phase 2)', () => {
  it('renders the embedded iframe mount + summary card amounts', () => {
    render(
      <BookingCheckoutEmbed
        clientSecret="cs_test_secret_xyz"
        {...SUMMARY_PROPS}
      />,
    );
    expect(screen.getByTestId('embedded-checkout-stub')).toBeTruthy();
    expect(screen.getByTestId('booking-summary-card')).toBeTruthy();
    expect(screen.getAllByText(/\$25\.00/).length).toBeGreaterThan(0);
    // Day rate = total - fee = $25.00 - $3.75 = $21.25
    expect(screen.getByText('$21.25')).toBeTruthy();
    expect(screen.getByText('$3.75')).toBeTruthy();
    expect(screen.getByText('Seeded Owner Coworks')).toBeTruthy();
    expect(screen.getByText(/Desk 1 · 2026-06-01/)).toBeTruthy();
  });

  it('renders the Stripe-S chrome badge', () => {
    render(
      <BookingCheckoutEmbed
        clientSecret="cs_test_secret_xyz"
        {...SUMMARY_PROPS}
      />,
    );
    expect(screen.getByText(/checkout\.stripe\.com.*Test mode/)).toBeTruthy();
  });

  it('back-to-space link points at /spaces/[id]?booking_cancelled=1', () => {
    render(
      <BookingCheckoutEmbed
        clientSecret="cs_test_secret_xyz"
        {...SUMMARY_PROPS}
      />,
    );
    const back = screen.getByText(/Back to Seeded Owner Coworks/);
    expect(back.closest('a')?.getAttribute('href')).toBe(
      '/spaces/abc?booking_cancelled=1',
    );
  });

  it('renders the error-card fallback when clientSecret is empty', () => {
    render(<BookingCheckoutEmbed clientSecret="" {...SUMMARY_PROPS} />);
    expect(screen.getByTestId('booking-checkout-embed-error')).toBeTruthy();
    expect(screen.queryByTestId('embedded-checkout-stub')).toBeNull();
    expect(screen.getByText('Booking unavailable')).toBeTruthy();
  });
});
