import { describe, it, expect } from 'vitest';
import { createSpaceSchema } from './space';

describe('createSpaceSchema', () => {
  const validInput = {
    name: 'Hive Central',
    city: 'Berlin',
    addressLine: 'Friedrichstr 1',
    description: 'Bright modern workspace',
    primaryImageUrl: 'https://example.com/x.jpg',
  };

  it('accepts valid input', () => {
    const result = createSpaceSchema.safeParse(validInput);
    expect(result.success).toBe(true);
  });

  it('rejects empty name', () => {
    const result = createSpaceSchema.safeParse({ ...validInput, name: '' });
    expect(result.success).toBe(false);
    if (!result.success) {
      const err = result.error.issues.find((i) => i.path[0] === 'name');
      expect(err?.message).toBe('Name is required');
    }
  });

  it('rejects whitespace-only city (trim)', () => {
    const result = createSpaceSchema.safeParse({ ...validInput, city: '   ' });
    expect(result.success).toBe(false);
  });

  it('rejects empty addressLine', () => {
    const result = createSpaceSchema.safeParse({ ...validInput, addressLine: '' });
    expect(result.success).toBe(false);
  });

  it('rejects empty description', () => {
    const result = createSpaceSchema.safeParse({ ...validInput, description: '' });
    expect(result.success).toBe(false);
  });

  it('rejects empty primaryImageUrl', () => {
    const result = createSpaceSchema.safeParse({ ...validInput, primaryImageUrl: '' });
    expect(result.success).toBe(false);
  });

  it('rejects malformed primaryImageUrl', () => {
    const result = createSpaceSchema.safeParse({ ...validInput, primaryImageUrl: 'not-a-url' });
    expect(result.success).toBe(false);
    if (!result.success) {
      const err = result.error.issues.find((i) => i.path[0] === 'primaryImageUrl');
      expect(err?.message).toBe('Must be a valid URL');
    }
  });

  it('reports all five fields when all are empty', () => {
    const result = createSpaceSchema.safeParse({
      name: '',
      city: '',
      addressLine: '',
      description: '',
      primaryImageUrl: '',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const fields = new Set(result.error.issues.map((i) => i.path[0]));
      expect(fields.has('name')).toBe(true);
      expect(fields.has('city')).toBe(true);
      expect(fields.has('addressLine')).toBe(true);
      expect(fields.has('description')).toBe(true);
      expect(fields.has('primaryImageUrl')).toBe(true);
    }
  });
});
