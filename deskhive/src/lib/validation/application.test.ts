import { describe, it, expect } from 'vitest';
import { createApplicationSchema } from './application';

describe('createApplicationSchema', () => {
  const valid = {
    businessName: 'Acme Coworking',
    businessAddress: '123 Main St\nBerlin, Germany',
    taxId: 'DE123456789',
    motivation: 'We want to join DeskHive to expand our reach.',
  };

  it('accepts a fully-populated valid input', () => {
    const result = createApplicationSchema.safeParse(valid);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.businessName).toBe('Acme Coworking');
      expect(result.data.taxId).toBe('DE123456789');
    }
  });

  it('accepts input without motivation (optional field)', () => {
    const { motivation, ...withoutMotivation } = valid;
    void motivation;
    const result = createApplicationSchema.safeParse(withoutMotivation);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.motivation).toBeUndefined();
  });

  it('rejects empty businessName', () => {
    const result = createApplicationSchema.safeParse({ ...valid, businessName: '' });
    expect(result.success).toBe(false);
    if (!result.success) {
      const err = result.error.issues.find((i) => i.path[0] === 'businessName');
      expect(err?.message).toBe('Business name is required');
    }
  });

  it('rejects whitespace-only businessName', () => {
    const result = createApplicationSchema.safeParse({ ...valid, businessName: '   ' });
    expect(result.success).toBe(false);
  });

  it('rejects empty businessAddress', () => {
    const result = createApplicationSchema.safeParse({ ...valid, businessAddress: '' });
    expect(result.success).toBe(false);
    if (!result.success) {
      const err = result.error.issues.find((i) => i.path[0] === 'businessAddress');
      expect(err?.message).toBe('Business address is required');
    }
  });

  it('rejects empty taxId', () => {
    const result = createApplicationSchema.safeParse({ ...valid, taxId: '' });
    expect(result.success).toBe(false);
    if (!result.success) {
      const err = result.error.issues.find((i) => i.path[0] === 'taxId');
      expect(err?.message).toBe('Tax ID is required');
    }
  });

  it('rejects motivation longer than 1000 characters', () => {
    const result = createApplicationSchema.safeParse({
      ...valid,
      motivation: 'a'.repeat(1001),
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const err = result.error.issues.find((i) => i.path[0] === 'motivation');
      expect(err?.message).toBe('Motivation must be at most 1000 characters');
    }
  });

  it('accepts motivation of exactly 1000 characters', () => {
    const result = createApplicationSchema.safeParse({
      ...valid,
      motivation: 'a'.repeat(1000),
    });
    expect(result.success).toBe(true);
  });

  it('reports all required fields when all are missing', () => {
    const result = createApplicationSchema.safeParse({});
    expect(result.success).toBe(false);
    if (!result.success) {
      const fields = new Set(result.error.issues.map((i) => i.path[0]));
      expect(fields.has('businessName')).toBe(true);
      expect(fields.has('businessAddress')).toBe(true);
      expect(fields.has('taxId')).toBe(true);
    }
  });
});
