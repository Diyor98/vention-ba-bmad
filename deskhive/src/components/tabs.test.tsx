import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Tabs } from './tabs';

const TABS = [
  { key: 'pending', label: 'Pending', count: 3 },
  { key: 'confirmed', label: 'Confirmed', count: 12 },
  { key: 'rejected', label: 'Rejected' },
] as const;

describe('<Tabs> (DESIGN-INT-19)', () => {
  it('renders one button per tab with the label', () => {
    render(<Tabs tabs={TABS} value="pending" onChange={() => {}} />);
    expect(screen.getByText('Pending')).toBeTruthy();
    expect(screen.getByText('Confirmed')).toBeTruthy();
    expect(screen.getByText('Rejected')).toBeTruthy();
  });

  it('renders counts when provided, omits when not', () => {
    render(<Tabs tabs={TABS} value="pending" onChange={() => {}} />);
    expect(screen.getByText('3')).toBeTruthy();
    expect(screen.getByText('12')).toBeTruthy();
    // Rejected has no count
    expect(screen.queryByText('0')).toBeNull();
  });

  it('marks the active tab with aria-current and aria-selected', () => {
    render(<Tabs tabs={TABS} value="confirmed" onChange={() => {}} />);
    const active = screen.getByTestId('tab-confirmed');
    expect(active.getAttribute('aria-current')).toBe('page');
    expect(active.getAttribute('aria-selected')).toBe('true');
    const inactive = screen.getByTestId('tab-pending');
    expect(inactive.getAttribute('aria-current')).toBeNull();
    expect(inactive.getAttribute('aria-selected')).toBe('false');
  });

  it('calls onChange with the new key on click', () => {
    const onChange = vi.fn();
    render(<Tabs tabs={TABS} value="pending" onChange={onChange} />);
    fireEvent.click(screen.getByTestId('tab-rejected'));
    expect(onChange).toHaveBeenCalledWith('rejected');
  });

  it('uses the provided ariaLabel on the tablist', () => {
    render(
      <Tabs
        tabs={TABS}
        value="pending"
        onChange={() => {}}
        ariaLabel="Booking filters"
      />,
    );
    const tablist = screen.getByRole('tablist');
    expect(tablist.getAttribute('aria-label')).toBe('Booking filters');
  });
});
