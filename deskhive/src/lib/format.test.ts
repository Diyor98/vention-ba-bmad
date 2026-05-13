import { describe, it, expect } from 'vitest';
import {
  formatBookingDate,
  formatCents,
  todayIso,
  isPastDate,
  parseDateParam,
} from './format';

describe('formatBookingDate (Story 8-3)', () => {
  it('formats a YYYY-MM-DD date as short weekday + month + day (no year)', () => {
    // 2026-08-26 is a Wednesday in UTC. The locale formatter renders
    // 'Wed, Aug 26' for en-US.
    expect(formatBookingDate('2026-08-26')).toBe('Wed, Aug 26');
  });

  it('returns the raw string when input is not a valid ISO date', () => {
    expect(formatBookingDate('not-a-date')).toBe('not-a-date');
    expect(formatBookingDate('')).toBe('');
  });
});

describe('formatCents', () => {
  it('formats $25.00', () => {
    expect(formatCents(2500)).toBe('$25.00');
  });

  it('formats $0.00', () => {
    expect(formatCents(0)).toBe('$0.00');
  });

  it('formats $0.99', () => {
    expect(formatCents(99)).toBe('$0.99');
  });

  it('formats $0.05 (single-digit cents pad)', () => {
    expect(formatCents(5)).toBe('$0.05');
  });

  it('formats large amount $1234.56', () => {
    expect(formatCents(123456)).toBe('$1234.56');
  });

  it('throws on negative cents', () => {
    expect(() => formatCents(-1)).toThrow();
  });

  it('throws on non-integer cents', () => {
    expect(() => formatCents(1.5)).toThrow();
  });
});

describe('todayIso', () => {
  it('returns YYYY-MM-DD format', () => {
    expect(todayIso()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('matches the UTC date of new Date()', () => {
    const expected = new Date().toISOString().slice(0, 10);
    expect(todayIso()).toBe(expected);
  });
});

describe('isPastDate', () => {
  it('returns true for clearly past date', () => {
    expect(isPastDate('2020-01-01')).toBe(true);
  });

  it('returns false for clearly future date', () => {
    expect(isPastDate('2099-12-31')).toBe(false);
  });

  it('returns false for today', () => {
    expect(isPastDate(todayIso())).toBe(false);
  });

  it('throws on malformed input', () => {
    expect(() => isPastDate('2026/05/06')).toThrow();
    expect(() => isPastDate('not-a-date')).toThrow();
    expect(() => isPastDate('')).toThrow();
  });
});

describe('parseDateParam', () => {
  it('returns valid for today', () => {
    const result = parseDateParam(todayIso());
    expect(result.valid).toBe(true);
    if (result.valid) expect(result.iso).toBe(todayIso());
  });

  it('returns valid for a clearly future date', () => {
    const result = parseDateParam('2099-12-31');
    expect(result.valid).toBe(true);
  });

  it('returns missing for undefined / null / empty / whitespace', () => {
    expect(parseDateParam(undefined)).toEqual({ valid: false, reason: 'missing' });
    expect(parseDateParam(null)).toEqual({ valid: false, reason: 'missing' });
    expect(parseDateParam('')).toEqual({ valid: false, reason: 'missing' });
    expect(parseDateParam('   ')).toEqual({ valid: false, reason: 'missing' });
  });

  it('returns malformed for non-ISO strings', () => {
    expect(parseDateParam('not-a-date')).toEqual({ valid: false, reason: 'malformed' });
    expect(parseDateParam('2026/05/06')).toEqual({ valid: false, reason: 'malformed' });
    expect(parseDateParam('2026-5-6')).toEqual({ valid: false, reason: 'malformed' });
  });

  it('returns past for clearly past dates', () => {
    expect(parseDateParam('2020-01-01')).toEqual({ valid: false, reason: 'past' });
  });
});
