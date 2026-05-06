/**
 * Detects Postgres unique-constraint violations across driver wrappers.
 *
 * Drizzle 0.45+ wraps pg errors in `DrizzleQueryError`, hiding the SQLSTATE
 * and the original message on `err.cause`. This helper walks the cause chain
 * up to `depth` levels and matches at each level via three patterns:
 *   1. SQLSTATE 23505 (the canonical pg unique-violation code)
 *   2. The generic Postgres text "duplicate key value violates unique constraint"
 *   3. The optional `constraintName` substring (caller-specific defense)
 *
 * Extracted in US-2.4 from the inline matchers added during US-2.3's hotfix
 * once the call-site count crossed four.
 *
 * @param err - The thrown error to inspect (typically caught from a Drizzle insert/update)
 * @param constraintName - Optional constraint name to match against the message
 * @param depth - Recursion depth limit (default 3, prevents loops on circular causes)
 *
 * @example
 *   try { await createDesk(...) } catch (err) {
 *     if (isPgUniqueViolation(err, 'uniq_desk_label_per_space')) {
 *       return { status: 'error', code: 'DUPLICATE_LABEL', ... };
 *     }
 *     throw err;
 *   }
 */
export function isPgUniqueViolation(
  err: unknown,
  constraintName?: string,
  depth = 3,
): boolean {
  if (depth === 0 || !err || typeof err !== 'object') return false;
  const code = (err as { code?: string }).code;
  const msg = (err as { message?: string }).message ?? '';
  if (code === '23505') return true;
  if (msg.includes('duplicate key value violates unique constraint')) return true;
  if (constraintName && msg.includes(constraintName)) return true;
  return isPgUniqueViolation(
    (err as { cause?: unknown }).cause,
    constraintName,
    depth - 1,
  );
}
