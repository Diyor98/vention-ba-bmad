import { describe, it, expect } from 'vitest';
import {
  dollarsToCents,
  centsToDollars,
  calculatePlatformFee,
  calculateOwnerPayout,
} from './money';

describe('dollarsToCents', () => {
  describe('happy path', () => {
    it('parses whole-dollar integer string', () => {
      expect(dollarsToCents('25')).toEqual({ ok: true, cents: 2500 });
    });

    it('parses single-decimal as tens-of-cents', () => {
      expect(dollarsToCents('25.5')).toEqual({ ok: true, cents: 2550 });
    });

    it('parses two-decimal exactly', () => {
      expect(dollarsToCents('25.50')).toEqual({ ok: true, cents: 2550 });
    });

    it('parses sub-dollar values', () => {
      expect(dollarsToCents('0.99')).toEqual({ ok: true, cents: 99 });
    });

    it('parses single dollar', () => {
      expect(dollarsToCents('1')).toEqual({ ok: true, cents: 100 });
    });

    it('parses 1.00 as 100 cents', () => {
      expect(dollarsToCents('1.00')).toEqual({ ok: true, cents: 100 });
    });

    it('parses the upper boundary 9999.99', () => {
      expect(dollarsToCents('9999.99')).toEqual({ ok: true, cents: 999999 });
    });

    it('trims surrounding whitespace', () => {
      expect(dollarsToCents('  25.50  ')).toEqual({ ok: true, cents: 2550 });
    });
  });

  describe('float-trap regressions', () => {
    // These are the load-bearing guards. If anyone refactors this helper to
    // use `parseFloat * 100`, these tests fail loudly. Across thousands of
    // bookings / Phase 2 refunds, the float trap is silent revenue drift.
    it('"25.50" produces exactly 2550, NOT 2549.999...', () => {
      const result = dollarsToCents('25.50');
      expect(result).toEqual({ ok: true, cents: 2550 });
      if (result.ok) {
        expect(Number.isInteger(result.cents)).toBe(true);
        expect(result.cents).toBe(2550);
      }
    });

    it('"0.10" produces exactly 10, NOT 9.999999...', () => {
      const result = dollarsToCents('0.10');
      expect(result).toEqual({ ok: true, cents: 10 });
      if (result.ok) expect(Number.isInteger(result.cents)).toBe(true);
    });

    it('"0.20" produces exactly 20, NOT 19.999999...', () => {
      // parseFloat("0.20") * 100 = 20.000000000000004 (round, but still float-poisoned in chains)
      expect(dollarsToCents('0.20')).toEqual({ ok: true, cents: 20 });
    });
  });

  describe('invalid input', () => {
    it('rejects too many decimal places with specific reason', () => {
      expect(dollarsToCents('25.999')).toEqual({
        ok: false,
        reason: 'too_many_decimals',
      });
    });

    it('rejects four decimal places', () => {
      expect(dollarsToCents('25.9999')).toEqual({
        ok: false,
        reason: 'too_many_decimals',
      });
    });

    it('rejects negative values as invalid', () => {
      expect(dollarsToCents('-5')).toEqual({ ok: false, reason: 'invalid' });
    });

    it('rejects negative with decimals', () => {
      expect(dollarsToCents('-25.50')).toEqual({
        ok: false,
        reason: 'invalid',
      });
    });

    it('rejects non-numeric letters', () => {
      expect(dollarsToCents('abc')).toEqual({ ok: false, reason: 'invalid' });
    });

    it('rejects empty string', () => {
      expect(dollarsToCents('')).toEqual({ ok: false, reason: 'invalid' });
    });

    it('rejects whitespace-only string', () => {
      expect(dollarsToCents('   ')).toEqual({ ok: false, reason: 'invalid' });
    });

    it('rejects trailing non-digits', () => {
      expect(dollarsToCents('25foo')).toEqual({
        ok: false,
        reason: 'invalid',
      });
    });

    it('rejects trailing dot ("25.")', () => {
      // Documented choice: trailing dot is invalid (not silently coerced to
      // 2500). Forces the admin to type something unambiguous.
      expect(dollarsToCents('25.')).toEqual({ ok: false, reason: 'invalid' });
    });

    it('rejects leading dot (".5")', () => {
      expect(dollarsToCents('.5')).toEqual({ ok: false, reason: 'invalid' });
    });

    it('rejects double dots', () => {
      expect(dollarsToCents('25.5.5')).toEqual({
        ok: false,
        reason: 'invalid',
      });
    });

    it('rejects scientific notation', () => {
      expect(dollarsToCents('1e3')).toEqual({ ok: false, reason: 'invalid' });
    });

    it('rejects values with thousands separators', () => {
      expect(dollarsToCents('1,000')).toEqual({
        ok: false,
        reason: 'invalid',
      });
    });
  });
});

describe('centsToDollars', () => {
  describe('happy path', () => {
    it('formats 2500 as "25.00"', () => {
      expect(centsToDollars(2500)).toBe('25.00');
    });

    it('formats 3050 as "30.50"', () => {
      expect(centsToDollars(3050)).toBe('30.50');
    });

    it('formats 100 as "1.00"', () => {
      expect(centsToDollars(100)).toBe('1.00');
    });

    it('formats 99 as "0.99"', () => {
      expect(centsToDollars(99)).toBe('0.99');
    });

    it('formats 999999 as "9999.99"', () => {
      expect(centsToDollars(999999)).toBe('9999.99');
    });

    it('formats 1 as "0.01" (single cent)', () => {
      expect(centsToDollars(1)).toBe('0.01');
    });

    it('formats 0 as "0.00"', () => {
      // Defensive: business rules reject $0, but the formatter should still
      // handle the value cleanly if called.
      expect(centsToDollars(0)).toBe('0.00');
    });

    it('pads tens place ("0.05" not "0.5")', () => {
      expect(centsToDollars(5)).toBe('0.05');
    });
  });

  describe('defensive throws', () => {
    it('throws on negative cents', () => {
      expect(() => centsToDollars(-1)).toThrow(/Invalid cents value/);
    });

    it('throws on non-integer cents', () => {
      expect(() => centsToDollars(2.5)).toThrow(/Invalid cents value/);
    });

    it('throws on NaN', () => {
      expect(() => centsToDollars(NaN)).toThrow(/Invalid cents value/);
    });

    it('throws on Infinity', () => {
      expect(() => centsToDollars(Infinity)).toThrow(/Invalid cents value/);
    });
  });
});

describe('round-trip invariants', () => {
  // For any valid stored cents, formatting then re-parsing must produce the
  // same cents back. This is what makes the edit form's load → save flow
  // idempotent when the admin doesn't change the price.
  const cases = [100, 2500, 2550, 3050, 99, 999999, 12345];

  for (const cents of cases) {
    it(`centsToDollars(${cents}) round-trips through dollarsToCents`, () => {
      const dollars = centsToDollars(cents);
      const reparsed = dollarsToCents(dollars);
      expect(reparsed).toEqual({ ok: true, cents });
    });
  }
});

// ─────────────────────────────────────────────────────────────────────
// Story 9-3 — platform fee + owner payout helpers
// ─────────────────────────────────────────────────────────────────────

describe('calculatePlatformFee', () => {
  it('computes 15% of a typical booking total ($25.00 → $3.75)', () => {
    // BA Decision §2 happy path: 1500 bps default, Math.floor rounding.
    expect(calculatePlatformFee(2500)).toBe(375);
  });

  it('respects custom feeBps + edge cases (parameterized)', () => {
    // Custom rates
    expect(calculatePlatformFee(2500, 1000)).toBe(250); // 10%
    expect(calculatePlatformFee(2500, 500)).toBe(125); // 5%
    expect(calculatePlatformFee(10000, 1500)).toBe(1500); // 15% of $100 = $15
    // Edge cases
    expect(calculatePlatformFee(0)).toBe(0);
    // Math.floor truncates sub-cent fees toward zero — the platform
    // doesn't collect fractional cents. $0.01 * 15% = 0.0015¢ → 0.
    expect(calculatePlatformFee(1)).toBe(0);
    // $0.07 * 15% = 1.05¢ → 1¢ (Math.floor)
    expect(calculatePlatformFee(7)).toBe(1);
    // Defensive throws
    expect(() => calculatePlatformFee(-100)).toThrow(/Invalid amount/);
    expect(() => calculatePlatformFee(100.5)).toThrow(/Invalid amount/);
    expect(() => calculatePlatformFee(100, -10)).toThrow(/Invalid fee bps/);
    expect(() => calculatePlatformFee(100, 1.5)).toThrow(/Invalid fee bps/);
  });
});

describe('calculateOwnerPayout', () => {
  it('returns amount minus fee + throws on bad inputs', () => {
    // BA Decision §2: payout is integer subtraction, no rounding step.
    // Floor-rounding of the fee means the owner gets sub-cent remainders.
    expect(calculateOwnerPayout(2500, 375)).toBe(2125);
    expect(calculateOwnerPayout(10000, 1500)).toBe(8500);
    expect(calculateOwnerPayout(7, 1)).toBe(6); // pair with calculatePlatformFee(7)
    expect(calculateOwnerPayout(0, 0)).toBe(0);
    // Defensive throws
    expect(() => calculateOwnerPayout(-100, 0)).toThrow(/Invalid amount/);
    expect(() => calculateOwnerPayout(100, -10)).toThrow(/Invalid fee cents/);
    expect(() => calculateOwnerPayout(100.5, 0)).toThrow(/Invalid amount/);
    // Fee cannot exceed amount (defensive against caller bugs)
    expect(() => calculateOwnerPayout(100, 200)).toThrow(/cannot exceed/);
  });
});
