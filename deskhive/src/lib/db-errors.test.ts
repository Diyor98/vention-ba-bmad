import { describe, it, expect } from 'vitest';
import { isPgUniqueViolation } from './db-errors';

describe('isPgUniqueViolation', () => {
  it('matches a top-level pg error with SQLSTATE 23505', () => {
    const err = Object.assign(new Error('whatever'), { code: '23505' });
    expect(isPgUniqueViolation(err)).toBe(true);
  });

  it('matches the generic violation message at the top level', () => {
    const err = new Error(
      'duplicate key value violates unique constraint "some_index"',
    );
    expect(isPgUniqueViolation(err)).toBe(true);
  });

  it('matches a Drizzle-wrapped error via err.cause (depth 1)', () => {
    // Mirrors DrizzleQueryError shape: outer message has no constraint info,
    // pg error lives on `cause`.
    const inner = Object.assign(new Error('inner'), { code: '23505' });
    const outer = Object.assign(new Error('Failed query: ...'), { cause: inner });
    expect(isPgUniqueViolation(outer)).toBe(true);
  });

  it('matches at depth 2 (defense-in-depth)', () => {
    const innermost = Object.assign(new Error('x'), { code: '23505' });
    const middle = Object.assign(new Error('mid'), { cause: innermost });
    const outer = Object.assign(new Error('outer'), { cause: middle });
    expect(isPgUniqueViolation(outer)).toBe(true);
  });

  it('matches by constraint name when code/message do not', () => {
    const err = new Error(
      'something went wrong: uniq_desk_label_per_space tripped',
    );
    expect(isPgUniqueViolation(err, 'uniq_desk_label_per_space')).toBe(true);
  });

  it('returns false for unrelated errors', () => {
    expect(isPgUniqueViolation(new Error('boom'))).toBe(false);
    expect(isPgUniqueViolation(null)).toBe(false);
    expect(isPgUniqueViolation(undefined)).toBe(false);
    expect(isPgUniqueViolation('a string')).toBe(false);
  });

  it('terminates on circular cause chains via depth limit', () => {
    const a: { cause?: unknown } = {};
    const b: { cause?: unknown } = { cause: a };
    a.cause = b; // circular
    // No SQLSTATE / matching message anywhere → must return false without
    // exploding the call stack.
    expect(isPgUniqueViolation(a)).toBe(false);
  });
});
