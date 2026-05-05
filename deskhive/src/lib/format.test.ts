import { describe, it, expect } from 'vitest';
import { formatCents, todayIso, isPastDate } from './format';

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
