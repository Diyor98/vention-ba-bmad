import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { StatusBadge } from './status-badge';

// Story 5-1 reskinned the StatusBadge from inline Tailwind utilities to the
// `.badge` + `.badge-{variant}` class composition from globals.css. Tests
// preserve the four-variant coverage; assertions now target the new class
// names. The `.dot` element is a presentational child rendered for every
// variant (Story 5-1 AC-10).

describe('<StatusBadge>', () => {
  it('renders PENDING with badge-pending class', () => {
    render(<StatusBadge status="PENDING" />);
    const el = screen.getByText('Pending');
    expect(el.className).toContain('badge');
    expect(el.className).toContain('badge-pending');
  });

  it('renders CONFIRMED with badge-confirmed class', () => {
    render(<StatusBadge status="CONFIRMED" />);
    const el = screen.getByText('Confirmed');
    expect(el.className).toContain('badge');
    expect(el.className).toContain('badge-confirmed');
  });

  it('renders REJECTED with badge-rejected class', () => {
    render(<StatusBadge status="REJECTED" />);
    const el = screen.getByText('Rejected');
    expect(el.className).toContain('badge');
    expect(el.className).toContain('badge-rejected');
  });

  it('renders CANCELLED with badge-cancelled class', () => {
    render(<StatusBadge status="CANCELLED" />);
    const el = screen.getByText('Cancelled');
    expect(el.className).toContain('badge');
    expect(el.className).toContain('badge-cancelled');
  });

  it('renders the dot element for visual cue', () => {
    const { container } = render(<StatusBadge status="PENDING" />);
    const dot = container.querySelector('.dot');
    expect(dot).not.toBeNull();
  });

  it('applies badge-lg class when size="lg"', () => {
    render(<StatusBadge status="CONFIRMED" size="lg" />);
    const el = screen.getByText('Confirmed');
    expect(el.className).toContain('badge-lg');
  });
});
