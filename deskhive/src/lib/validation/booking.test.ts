import { describe, it, expect } from 'vitest';
import { createBookingSchema } from './booking';

describe('createBookingSchema', () => {
  const valid = {
    deskId: '11111111-1111-1111-1111-111111111111',
    bookingDate: '2099-12-31',
  };

  it('accepts a valid UUID + ISO date', () => {
    const result = createBookingSchema.safeParse(valid);
    expect(result.success).toBe(true);
  });

  it('rejects a non-UUID deskId', () => {
    const result = createBookingSchema.safeParse({ ...valid, deskId: 'not-a-uuid' });
    expect(result.success).toBe(false);
    if (!result.success) {
      const err = result.error.issues.find((i) => i.path[0] === 'deskId');
      expect(err?.message).toBe('Invalid desk id');
    }
  });

  it('rejects an empty deskId', () => {
    expect(createBookingSchema.safeParse({ ...valid, deskId: '' }).success).toBe(false);
  });

  it('rejects malformed dates', () => {
    expect(createBookingSchema.safeParse({ ...valid, bookingDate: 'not-a-date' }).success).toBe(false);
    expect(createBookingSchema.safeParse({ ...valid, bookingDate: '2026/06/01' }).success).toBe(false);
    expect(createBookingSchema.safeParse({ ...valid, bookingDate: '2026-6-1' }).success).toBe(false);
  });

  it('reports both fields when both are invalid', () => {
    const result = createBookingSchema.safeParse({ deskId: 'x', bookingDate: 'y' });
    expect(result.success).toBe(false);
    if (!result.success) {
      const fields = new Set(result.error.issues.map((i) => i.path[0]));
      expect(fields.has('deskId')).toBe(true);
      expect(fields.has('bookingDate')).toBe(true);
    }
  });
});
