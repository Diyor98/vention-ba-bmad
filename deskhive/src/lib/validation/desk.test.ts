import { describe, it, expect } from 'vitest';
import { createDeskSchema } from './desk';

describe('createDeskSchema', () => {
  const valid = { label: 'Desk-1', dailyPriceCents: '2500' };

  it('accepts valid input and coerces dailyPriceCents to number', () => {
    const result = createDeskSchema.safeParse(valid);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.dailyPriceCents).toBe(2500);
      expect(typeof result.data.dailyPriceCents).toBe('number');
    }
  });

  it('accepts 0 as a valid daily price (free desks allowed)', () => {
    const result = createDeskSchema.safeParse({ ...valid, dailyPriceCents: '0' });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.dailyPriceCents).toBe(0);
  });

  it('rejects empty/whitespace-only label', () => {
    expect(createDeskSchema.safeParse({ ...valid, label: '' }).success).toBe(false);
    expect(createDeskSchema.safeParse({ ...valid, label: '   ' }).success).toBe(false);
  });

  it('rejects empty dailyPriceCents (required)', () => {
    const result = createDeskSchema.safeParse({ ...valid, dailyPriceCents: '' });
    expect(result.success).toBe(false);
    if (!result.success) {
      const err = result.error.issues.find((i) => i.path[0] === 'dailyPriceCents');
      expect(err?.message).toBe('Daily price is required');
    }
  });

  it('rejects negative dailyPriceCents', () => {
    const result = createDeskSchema.safeParse({ ...valid, dailyPriceCents: '-100' });
    expect(result.success).toBe(false);
    if (!result.success) {
      const err = result.error.issues.find((i) => i.path[0] === 'dailyPriceCents');
      expect(err?.message).toBe('Daily price must be ≥ 0');
    }
  });

  it('rejects non-integer dailyPriceCents', () => {
    const result = createDeskSchema.safeParse({ ...valid, dailyPriceCents: '2500.5' });
    expect(result.success).toBe(false);
    if (!result.success) {
      const err = result.error.issues.find((i) => i.path[0] === 'dailyPriceCents');
      expect(err?.message).toBe('Daily price must be an integer');
    }
  });

  it('rejects non-numeric dailyPriceCents', () => {
    expect(createDeskSchema.safeParse({ ...valid, dailyPriceCents: 'abc' }).success).toBe(false);
  });

  it('reports both fields when both are empty', () => {
    const result = createDeskSchema.safeParse({ label: '', dailyPriceCents: '' });
    expect(result.success).toBe(false);
    if (!result.success) {
      const fields = new Set(result.error.issues.map((i) => i.path[0]));
      expect(fields.has('label')).toBe(true);
      expect(fields.has('dailyPriceCents')).toBe(true);
    }
  });
});
