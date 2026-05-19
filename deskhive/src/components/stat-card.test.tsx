import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Banknote } from 'lucide-react';
import { StatCard } from './stat-card';

describe('<StatCard> (DESIGN-INT-19)', () => {
  it('renders label + value', () => {
    render(<StatCard label="Earnings" value="$2,148.50" />);
    expect(screen.getByText('Earnings')).toBeTruthy();
    expect(screen.getByText('$2,148.50')).toBeTruthy();
  });

  it('renders unit alongside value', () => {
    render(<StatCard label="Occupancy" value="62" unit="%" />);
    expect(screen.getByText('%')).toBeTruthy();
  });

  it('renders an up trend with green tone', () => {
    render(
      <StatCard
        label="Bookings"
        value="74"
        trend={{ dir: 'up', text: '+9 vs. previous' }}
      />,
    );
    const trend = screen.getByText(/\+9 vs\. previous/);
    expect(trend.className).toContain('up');
  });

  it('renders a down trend with red tone', () => {
    render(
      <StatCard
        label="Occupancy"
        value="44"
        unit="%"
        trend={{ dir: 'down', text: '-3% vs. previous' }}
      />,
    );
    const trend = screen.getByText(/-3% vs\. previous/);
    expect(trend.className).toContain('down');
  });

  it('renders an icon when provided', () => {
    render(<StatCard label="Earnings" value="$0" Icon={Banknote} />);
    // Icon renders inside the .stat-icon plate; lucide emits an <svg>.
    const card = screen.getByText('Earnings').closest('.stat-card');
    expect(card?.querySelector('svg')).toBeTruthy();
  });

  it('applies the is-attention modifier when attention=true', () => {
    render(<StatCard label="Pending payout" value="$85.00" attention />);
    const card = screen.getByText('Pending payout').closest('.stat-card');
    expect(card?.className).toContain('is-attention');
  });

  it('forwards testid when provided', () => {
    render(<StatCard label="x" value="y" testid="my-card" />);
    expect(screen.getByTestId('my-card')).toBeTruthy();
  });
});
