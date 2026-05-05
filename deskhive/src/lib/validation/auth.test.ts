import { describe, it, expect } from 'vitest';
import { registerSchema } from './auth';

describe('registerSchema', () => {
  const validInput = {
    email: 'ada@example.com',
    password: 'Sup3rSecret!',
    fullName: 'Ada Lovelace',
  };

  it('accepts valid input', () => {
    const result = registerSchema.safeParse(validInput);
    expect(result.success).toBe(true);
  });

  it('rejects malformed email', () => {
    const result = registerSchema.safeParse({ ...validInput, email: 'not-an-email' });
    expect(result.success).toBe(false);
    if (!result.success) {
      const emailError = result.error.issues.find((i) => i.path[0] === 'email');
      expect(emailError?.message).toBe('Must be a valid email address');
    }
  });

  it('rejects empty email', () => {
    const result = registerSchema.safeParse({ ...validInput, email: '' });
    expect(result.success).toBe(false);
  });

  it('rejects whitespace-only email (trim)', () => {
    const result = registerSchema.safeParse({ ...validInput, email: '   ' });
    expect(result.success).toBe(false);
  });

  it('rejects password shorter than 8 characters', () => {
    const result = registerSchema.safeParse({ ...validInput, password: '1234567' });
    expect(result.success).toBe(false);
    if (!result.success) {
      const pwError = result.error.issues.find((i) => i.path[0] === 'password');
      expect(pwError?.message).toBe('Password must be at least 8 characters');
    }
  });

  it('accepts exactly 8-character password', () => {
    const result = registerSchema.safeParse({ ...validInput, password: '12345678' });
    expect(result.success).toBe(true);
  });

  it('rejects empty fullName', () => {
    const result = registerSchema.safeParse({ ...validInput, fullName: '' });
    expect(result.success).toBe(false);
  });

  it('rejects whitespace-only fullName (trim)', () => {
    const result = registerSchema.safeParse({ ...validInput, fullName: '   ' });
    expect(result.success).toBe(false);
  });

  it('reports multiple errors at once', () => {
    const result = registerSchema.safeParse({
      email: 'bad',
      password: 'short',
      fullName: '',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const fields = new Set(result.error.issues.map((i) => i.path[0]));
      expect(fields.has('email')).toBe(true);
      expect(fields.has('password')).toBe(true);
      expect(fields.has('fullName')).toBe(true);
    }
  });
});
