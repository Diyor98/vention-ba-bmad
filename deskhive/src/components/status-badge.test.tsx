import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { StatusBadge } from './status-badge';

describe('<StatusBadge>', () => {
  it('renders PENDING with yellow Tailwind classes', () => {
    render(<StatusBadge status="PENDING" />);
    const el = screen.getByText('Pending');
    expect(el.className).toContain('bg-yellow-100');
    expect(el.className).toContain('text-yellow-800');
  });

  it('renders CONFIRMED with green Tailwind classes', () => {
    render(<StatusBadge status="CONFIRMED" />);
    const el = screen.getByText('Confirmed');
    expect(el.className).toContain('bg-green-100');
    expect(el.className).toContain('text-green-800');
  });

  it('renders REJECTED with red Tailwind classes', () => {
    render(<StatusBadge status="REJECTED" />);
    const el = screen.getByText('Rejected');
    expect(el.className).toContain('bg-red-100');
    expect(el.className).toContain('text-red-800');
  });

  it('renders CANCELLED with gray Tailwind classes', () => {
    render(<StatusBadge status="CANCELLED" />);
    const el = screen.getByText('Cancelled');
    expect(el.className).toContain('bg-gray-100');
    expect(el.className).toContain('text-gray-800');
  });
});
