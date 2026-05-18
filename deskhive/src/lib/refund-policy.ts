/**
 * Story 9-6: Phase 2 single-policy refund-eligibility check
 * (FR-REFUND-1 + FR-REFUND-2).
 *
 * Phase 2 implements a single refund policy: full refund if cancelled
 * 24 hours or more before the booking date; no refund within 24 hours.
 * The cutoff is computed server-side in UTC (FR-REFUND-2 explicit lock).
 *
 * Locked interpretation (BA Decision §3):
 *   • Reference point — 00:00:00 UTC of the booking date. A booking on
 *     2026-06-15 has refund-eligibility cutoff at 2026-06-14 00:00:00
 *     UTC (i.e., 24h before the start of the booking day in UTC).
 *   • Timezone — UTC-only. No Guest-TZ conversion, no timezone library.
 *   • Boundary — `now === cutoff` is INELIGIBLE (strict-less-than for
 *     eligible). Favors the platform / Owner (the slot has been blocked).
 *   • Past-date bookings — cutoff is in the past → `now > cutoff` →
 *     INELIGIBLE (you can't refund a booking after the slot has passed).
 *
 * Phase 2 PRD §4.5 / FR-REFUND-3 lock — ineligible cancellations are
 * REFUSED entirely with an error toast (no DB write happens on the
 * ineligible path). PRD §1.2 step 21 confirms.
 *
 * Phase 3 may add multi-policy support (different windows per space
 * type, owner-overridable, etc.) — this file is the seam.
 *
 * No floating-point math (CC-2 carry-forward) — integer-ms arithmetic
 * only via Date.getTime().
 */

const MS_PER_HOUR = 60 * 60 * 1000;
const REFUND_CUTOFF_HOURS = 24;
const REFUND_CUTOFF_MS = REFUND_CUTOFF_HOURS * MS_PER_HOUR;

/**
 * Returns true iff the booking is eligible for a full refund per Phase 2
 * single-policy (24+ hours before booking date in UTC).
 *
 * @param bookingDate  The `bookings.booking_date` value. Drizzle's
 *                     `date('booking_date')` returns a YYYY-MM-DD string;
 *                     callers may pass a Date too (interpreted as the
 *                     UTC instant the Date represents, not its local-date
 *                     components — the Date constructor is locale-naive
 *                     for YYYY-MM-DD strings, treating them as UTC).
 * @param now          Optional override for `new Date()`. Tests inject
 *                     deterministic values; production calls omit it.
 *
 * Examples (assuming `now` is 2026-06-14 00:00:00 UTC):
 *   isRefundEligible('2026-06-15')  // false — cutoff equals now (boundary ineligible)
 *   isRefundEligible('2026-06-16')  // true  — cutoff is 2026-06-15 00:00 > now
 *   isRefundEligible('2026-06-14')  // false — cutoff was 2026-06-13 00:00 < now
 *   isRefundEligible('2025-12-01')  // false — past date
 */
export function isRefundEligible(
  bookingDate: string | Date,
  now: Date = new Date(),
): boolean {
  // Construct the UTC anchor at 00:00:00 of the booking date.
  // - For a YYYY-MM-DD string, appending T00:00:00Z forces UTC interpretation
  //   (the bare string parses as local time in some JS engines — explicit Z
  //   is the safe form).
  // - For a Date input, take its YYYY-MM-DD via toISOString() and reconstruct
  //   the same UTC anchor. This normalizes any caller that passes a Date with
  //   nonzero time component down to the start-of-day UTC anchor.
  const dateString =
    typeof bookingDate === 'string'
      ? bookingDate
      : bookingDate.toISOString().slice(0, 10);
  const bookingDateUtcAnchor = new Date(`${dateString}T00:00:00Z`).getTime();

  // 24-hour cutoff = bookingDateUtcAnchor - 24h (in ms).
  const cutoffMs = bookingDateUtcAnchor - REFUND_CUTOFF_MS;

  // Strict-less-than: now AT the cutoff is INELIGIBLE.
  return now.getTime() < cutoffMs;
}
