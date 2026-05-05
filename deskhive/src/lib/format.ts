/**
 * Formats integer cents as USD with two decimals.
 * @example formatCents(2500) === '$25.00'
 */
export function formatCents(cents: number): string {
  if (!Number.isInteger(cents) || cents < 0) {
    throw new Error(`Invalid cents value: ${cents}`);
  }
  const dollars = Math.floor(cents / 100);
  const remainder = cents % 100;
  return `$${dollars}.${remainder.toString().padStart(2, '0')}`;
}

/**
 * Returns today's date in UTC as a YYYY-MM-DD string.
 * Server runs in UTC, so "today" is unambiguous.
 */
export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Returns true iff the given YYYY-MM-DD date is strictly before today (UTC).
 * Compares ISO strings lexicographically — sound because YYYY-MM-DD strings sort correctly.
 */
export function isPastDate(iso: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
    throw new Error(`Invalid ISO date: ${iso}`);
  }
  return iso < todayIso();
}
