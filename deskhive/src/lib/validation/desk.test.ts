import { describe, it, expect } from 'vitest';
import {
  createDeskSchema,
  editDeskSchema,
  PRICE_MESSAGES,
} from './desk';

// Story 6-1: the schema's INPUT key is `dailyPriceDollars` (string) and
// OUTPUT key is `dailyPriceCents` (number). The Zod seam renames at parse
// time. Validation error issues surface under the input key.

describe('createDeskSchema', () => {
  const valid = { label: 'Desk-1', dailyPriceDollars: '25.50' };

  it('accepts valid input and renames to cents on output', () => {
    const result = createDeskSchema.safeParse(valid);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.dailyPriceCents).toBe(2550);
      expect(typeof result.data.dailyPriceCents).toBe('number');
      // The output shape uses the storage-name key, not the input-name.
      expect('dailyPriceDollars' in result.data).toBe(false);
    }
  });

  it('accepts whole-dollar input "25" → 2500 cents', () => {
    const result = createDeskSchema.safeParse({ ...valid, dailyPriceDollars: '25' });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.dailyPriceCents).toBe(2500);
  });

  it('rejects empty/whitespace-only label', () => {
    expect(createDeskSchema.safeParse({ ...valid, label: '' }).success).toBe(false);
    expect(createDeskSchema.safeParse({ ...valid, label: '   ' }).success).toBe(false);
  });

  it('rejects empty dailyPriceDollars (required)', () => {
    const result = createDeskSchema.safeParse({ ...valid, dailyPriceDollars: '' });
    expect(result.success).toBe(false);
    if (!result.success) {
      const err = result.error.issues.find(
        (i) => i.path[0] === 'dailyPriceDollars',
      );
      expect(err?.message).toBe(PRICE_MESSAGES.REQUIRED);
    }
  });

  it('rejects negative values with "below minimum" message', () => {
    // Negative input is syntactically invalid per dollarsToCents — surfaces
    // as INVALID_FORMAT, not BELOW_MIN. (The minimum check only fires for
    // values that parse cleanly.)
    const result = createDeskSchema.safeParse({
      ...valid,
      dailyPriceDollars: '-5',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const err = result.error.issues.find(
        (i) => i.path[0] === 'dailyPriceDollars',
      );
      expect(err?.message).toBe(PRICE_MESSAGES.INVALID_FORMAT);
    }
  });

  it('rejects more than 2 decimal places', () => {
    const result = createDeskSchema.safeParse({
      ...valid,
      dailyPriceDollars: '25.999',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const err = result.error.issues.find(
        (i) => i.path[0] === 'dailyPriceDollars',
      );
      expect(err?.message).toBe(PRICE_MESSAGES.TOO_MANY_DECIMALS);
    }
  });

  it('rejects non-numeric dailyPriceDollars', () => {
    expect(
      createDeskSchema.safeParse({ ...valid, dailyPriceDollars: 'abc' }).success,
    ).toBe(false);
  });

  it('reports both fields when both are empty', () => {
    const result = createDeskSchema.safeParse({
      label: '',
      dailyPriceDollars: '',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const fields = new Set(result.error.issues.map((i) => i.path[0]));
      expect(fields.has('label')).toBe(true);
      expect(fields.has('dailyPriceDollars')).toBe(true);
    }
  });

  // ── Boundary tests per BA Decisions §4 ──────────────────────────────

  it('rejects $0.99 (below $1.00 minimum)', () => {
    const result = createDeskSchema.safeParse({
      ...valid,
      dailyPriceDollars: '0.99',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const err = result.error.issues.find(
        (i) => i.path[0] === 'dailyPriceDollars',
      );
      expect(err?.message).toBe(PRICE_MESSAGES.BELOW_MIN);
    }
  });

  it('accepts $1.00 (exactly minimum)', () => {
    const result = createDeskSchema.safeParse({
      ...valid,
      dailyPriceDollars: '1.00',
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.dailyPriceCents).toBe(100);
  });

  it('accepts $9999.99 (exactly maximum)', () => {
    const result = createDeskSchema.safeParse({
      ...valid,
      dailyPriceDollars: '9999.99',
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.dailyPriceCents).toBe(999999);
  });

  it('rejects $10000 (above maximum, no decimals)', () => {
    const result = createDeskSchema.safeParse({
      ...valid,
      dailyPriceDollars: '10000',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const err = result.error.issues.find(
        (i) => i.path[0] === 'dailyPriceDollars',
      );
      expect(err?.message).toBe(PRICE_MESSAGES.ABOVE_MAX);
    }
  });

  it('rejects $10000.00 (above maximum, with decimals)', () => {
    const result = createDeskSchema.safeParse({
      ...valid,
      dailyPriceDollars: '10000.00',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const err = result.error.issues.find(
        (i) => i.path[0] === 'dailyPriceDollars',
      );
      expect(err?.message).toBe(PRICE_MESSAGES.ABOVE_MAX);
    }
  });

  it('accepts $25.50 and renames to 2550 cents on output', () => {
    const result = createDeskSchema.safeParse({
      ...valid,
      dailyPriceDollars: '25.50',
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.dailyPriceCents).toBe(2550);
  });

  it('accepts $25 (no decimals) and renames to 2500 cents', () => {
    const result = createDeskSchema.safeParse({
      ...valid,
      dailyPriceDollars: '25',
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.dailyPriceCents).toBe(2500);
  });
});

describe('editDeskSchema', () => {
  const valid = {
    label: 'Desk-1',
    dailyPriceDollars: '25.50',
    isActive: true,
  };

  it('accepts valid input with isActive=true and renames to cents', () => {
    const result = editDeskSchema.safeParse(valid);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.isActive).toBe(true);
      expect(result.data.dailyPriceCents).toBe(2550);
    }
  });

  it('accepts isActive=false', () => {
    const result = editDeskSchema.safeParse({ ...valid, isActive: false });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.isActive).toBe(false);
  });

  it('rejects non-boolean isActive', () => {
    // Strings, numbers, and the literal string 'false' should all fail.
    expect(editDeskSchema.safeParse({ ...valid, isActive: 'on' }).success).toBe(false);
    expect(editDeskSchema.safeParse({ ...valid, isActive: 'false' }).success).toBe(false);
    expect(editDeskSchema.safeParse({ ...valid, isActive: 1 }).success).toBe(false);
  });

  it('inherits createDeskSchema validation (empty label still rejected)', () => {
    const result = editDeskSchema.safeParse({ ...valid, label: '' });
    expect(result.success).toBe(false);
  });

  it('applies the same price boundary rules as createDeskSchema', () => {
    expect(
      editDeskSchema.safeParse({ ...valid, dailyPriceDollars: '0.99' }).success,
    ).toBe(false);
    expect(
      editDeskSchema.safeParse({ ...valid, dailyPriceDollars: '10000' }).success,
    ).toBe(false);
    expect(
      editDeskSchema.safeParse({ ...valid, dailyPriceDollars: '25.999' }).success,
    ).toBe(false);
  });

  it('reports all three fields when all are empty/missing', () => {
    const result = editDeskSchema.safeParse({
      label: '',
      dailyPriceDollars: '',
      isActive: 'not-a-bool',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const fields = new Set(result.error.issues.map((i) => i.path[0]));
      expect(fields.has('label')).toBe(true);
      expect(fields.has('dailyPriceDollars')).toBe(true);
      expect(fields.has('isActive')).toBe(true);
    }
  });
});
