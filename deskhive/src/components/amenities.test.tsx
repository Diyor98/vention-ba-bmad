import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import {
  AMENITY_DEFINITIONS,
  AmenitiesDisplay,
  AmenitiesForm,
} from './amenities';
import { AMENITY_SLUGS } from '@/db/schema';

// Story DESIGN-2 — AmenitiesForm + AmenitiesDisplay coverage.

describe('AMENITY_DEFINITIONS lock', () => {
  it('matches the canonical schema enum 1:1 (no missing/extra slugs)', () => {
    const defSlugs = AMENITY_DEFINITIONS.map((d) => d.slug).sort();
    const schemaSlugs = [...AMENITY_SLUGS].sort();
    expect(defSlugs).toEqual(schemaSlugs);
  });

  it('every slug carries a label + icon', () => {
    for (const { slug, label, Icon } of AMENITY_DEFINITIONS) {
      expect(slug.length).toBeGreaterThan(0);
      expect(label.length).toBeGreaterThan(0);
      // Lucide icons are forwardRef components — render as an object.
      expect(Icon).toBeTruthy();
    }
  });

  it('exposes all 16 canonical amenities', () => {
    expect(AMENITY_DEFINITIONS).toHaveLength(16);
  });
});

describe('<AmenitiesForm>', () => {
  it('renders 16 checkboxes — one per canonical amenity', () => {
    render(<AmenitiesForm />);
    const boxes = screen
      .getByTestId('amenities-form')
      .querySelectorAll('input[type="checkbox"]');
    expect(boxes).toHaveLength(16);
  });

  it('marks defaultSelected slugs as checked', () => {
    render(<AmenitiesForm defaultSelected={['wifi', 'parking']} />);
    const wifi = screen
      .getByTestId('amenity-check-wifi')
      .querySelector('input[type="checkbox"]') as HTMLInputElement;
    const parking = screen
      .getByTestId('amenity-check-parking')
      .querySelector('input[type="checkbox"]') as HTMLInputElement;
    const kitchen = screen
      .getByTestId('amenity-check-kitchen')
      .querySelector('input[type="checkbox"]') as HTMLInputElement;
    expect(wifi.defaultChecked).toBe(true);
    expect(parking.defaultChecked).toBe(true);
    expect(kitchen.defaultChecked).toBe(false);
  });

  it('uses the configured inputName for the multi-valued field', () => {
    render(<AmenitiesForm inputName="space_amenities" />);
    const boxes = screen
      .getByTestId('amenities-form')
      .querySelectorAll('input[type="checkbox"]');
    boxes.forEach((b) => {
      expect((b as HTMLInputElement).name).toBe('space_amenities');
    });
  });

  it('defaults inputName to "amenities"', () => {
    render(<AmenitiesForm />);
    const wifi = screen
      .getByTestId('amenity-check-wifi')
      .querySelector('input[type="checkbox"]') as HTMLInputElement;
    expect(wifi.name).toBe('amenities');
  });

  it('passes the disabled flag through to inputs', () => {
    render(<AmenitiesForm disabled />);
    const boxes = screen
      .getByTestId('amenities-form')
      .querySelectorAll('input[type="checkbox"]');
    boxes.forEach((b) => {
      expect((b as HTMLInputElement).disabled).toBe(true);
    });
  });
});

describe('<AmenitiesDisplay>', () => {
  it('renders only the selected slugs as tiles', () => {
    render(<AmenitiesDisplay slugs={['wifi', 'coffee_tea']} />);
    expect(screen.getByTestId('amenity-tile-wifi')).toBeTruthy();
    expect(screen.getByTestId('amenity-tile-coffee_tea')).toBeTruthy();
    expect(screen.queryByTestId('amenity-tile-parking')).toBeNull();
  });

  it('preserves canonical display order regardless of input order', () => {
    // Canonical order: wifi(0), coffee_tea(2), parking(3), kitchen(6).
    // Caller passes them out of order — display should still render
    // wifi → coffee_tea → parking → kitchen.
    render(<AmenitiesDisplay slugs={['kitchen', 'wifi', 'parking', 'coffee_tea']} />);
    const tiles = screen
      .getByTestId('amenities-display')
      .querySelectorAll('[data-testid^="amenity-tile-"]');
    const order = Array.from(tiles).map((t) =>
      (t as HTMLElement).getAttribute('data-testid'),
    );
    expect(order).toEqual([
      'amenity-tile-wifi',
      'amenity-tile-coffee_tea',
      'amenity-tile-parking',
      'amenity-tile-kitchen',
    ]);
  });

  it('renders the empty state when slugs is []', () => {
    render(<AmenitiesDisplay slugs={[]} />);
    expect(screen.getByTestId('amenities-empty')).toBeTruthy();
    expect(screen.queryByTestId('amenities-display')).toBeNull();
  });

  it('ignores unknown slugs without throwing', () => {
    render(<AmenitiesDisplay slugs={['wifi', 'not_a_real_slug']} />);
    expect(screen.getByTestId('amenity-tile-wifi')).toBeTruthy();
    // 'not_a_real_slug' filtered out — no tile + no throw.
    expect(
      screen.getByTestId('amenities-display').querySelectorAll('li'),
    ).toHaveLength(1);
  });
});
