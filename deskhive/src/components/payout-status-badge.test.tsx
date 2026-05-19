import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import {
  PayoutStatusBadge,
  getPayoutStatusDisplay,
} from './payout-status-badge';

// DESIGN-FIX-3 — stakeholder-friendly Stripe payout status mapping.

describe('getPayoutStatusDisplay (DESIGN-FIX-3)', () => {
  it('maps `paid` to "Paid" with green badge-confirmed variant', () => {
    expect(getPayoutStatusDisplay('paid')).toEqual({
      label: 'Paid',
      variant: 'badge-confirmed',
    });
  });

  it('maps `in_transit` to "In transit" with blue badge-info variant', () => {
    expect(getPayoutStatusDisplay('in_transit')).toEqual({
      label: 'In transit',
      variant: 'badge-info',
    });
  });

  it('maps `pending` to "Pending" with amber badge-pending variant', () => {
    expect(getPayoutStatusDisplay('pending')).toEqual({
      label: 'Pending',
      variant: 'badge-pending',
    });
  });

  it('maps `failed` to "Action needed" with amber badge-pending variant (NOT red)', () => {
    // DESIGN-FIX-3 lock: a failed payout is remediable from the
    // owner-facing perspective; the original red badge-rejected
    // treatment misframed it as terminal. Amber + "Action needed"
    // surface the right next-step affordance.
    expect(getPayoutStatusDisplay('failed')).toEqual({
      label: 'Action needed',
      variant: 'badge-pending',
    });
  });

  it('maps `canceled` to "Canceled" with gray badge-cancelled variant', () => {
    expect(getPayoutStatusDisplay('canceled')).toEqual({
      label: 'Canceled',
      variant: 'badge-cancelled',
    });
  });

  it('falls back to titlecased raw status + gray for unknown values', () => {
    expect(getPayoutStatusDisplay('mysterious_new_status')).toEqual({
      label: 'Mysterious new status',
      variant: 'badge-cancelled',
    });
  });

  it('falls back to "Unknown" + gray for empty/whitespace status', () => {
    expect(getPayoutStatusDisplay('')).toEqual({
      label: 'Unknown',
      variant: 'badge-cancelled',
    });
    expect(getPayoutStatusDisplay('   ')).toEqual({
      label: 'Unknown',
      variant: 'badge-cancelled',
    });
  });
});

describe('<PayoutStatusBadge>', () => {
  it('renders "Paid" + badge-confirmed class for status=paid', () => {
    render(<PayoutStatusBadge status="paid" />);
    const el = screen.getByText('Paid');
    expect(el.className).toContain('badge');
    expect(el.className).toContain('badge-confirmed');
  });

  it('renders "In transit" + badge-info class for status=in_transit', () => {
    render(<PayoutStatusBadge status="in_transit" />);
    const el = screen.getByText('In transit');
    expect(el.className).toContain('badge-info');
  });

  it('renders "Pending" + badge-pending class for status=pending', () => {
    render(<PayoutStatusBadge status="pending" />);
    const el = screen.getByText('Pending');
    expect(el.className).toContain('badge-pending');
  });

  it('renders "Action needed" + badge-pending class for status=failed (not red)', () => {
    render(<PayoutStatusBadge status="failed" />);
    const el = screen.getByText('Action needed');
    expect(el.className).toContain('badge-pending');
    // Load-bearing negative assertion — DESIGN-FIX-3 explicitly moves
    // failed off badge-rejected.
    expect(el.className).not.toContain('badge-rejected');
  });

  it('renders "Canceled" + badge-cancelled class for status=canceled', () => {
    render(<PayoutStatusBadge status="canceled" />);
    const el = screen.getByText('Canceled');
    expect(el.className).toContain('badge-cancelled');
  });
});
