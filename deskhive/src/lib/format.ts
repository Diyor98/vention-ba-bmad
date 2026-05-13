/**
 * Story 8-3: formats a YYYY-MM-DD booking date as a short human-readable
 * label suitable for emails and listings — `'Wed, Aug 27'` (short weekday
 * + month + day, no year).
 *
 * Mirrors the existing client-side helper in
 * `src/app/admin/bookings/bookings-table.tsx`. Lifted to the shared module
 * so server-side render code (email templates) reuses the exact same
 * formatting without duplicating the locale/timezone choices.
 *
 * Locale fixed to en-US + timezone UTC for deterministic output across
 * server + client + email-client rendering. Invalid input falls back to
 * returning the raw string (defensive — matches the existing helper's
 * pre-Story-8-3 behavior).
 */
export function formatBookingDate(iso: string): string {
  // Parse as UTC noon to avoid TZ edge-cases on the formatter side.
  // YYYY-MM-DD + T12:00:00Z keeps the calendar day stable across all
  // reasonable timezones.
  const d = new Date(`${iso}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

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

export type DateParamResult =
  | { valid: true; iso: string }
  | { valid: false; reason: 'missing' | 'malformed' | 'past' };

/**
 * Validates a YYYY-MM-DD date param from URL query strings. Single source of
 * truth for the page's date picker and the availability REST endpoint so the
 * two stay in lockstep on missing/malformed/past semantics.
 *
 * Today (UTC) is valid. Strictly-past dates are rejected.
 */
export function parseDateParam(s: string | undefined | null): DateParamResult {
  if (s === undefined || s === null) return { valid: false, reason: 'missing' };
  const trimmed = s.trim();
  if (trimmed === '') return { valid: false, reason: 'missing' };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return { valid: false, reason: 'malformed' };
  }
  if (isPastDate(trimmed)) return { valid: false, reason: 'past' };
  return { valid: true, iso: trimmed };
}
