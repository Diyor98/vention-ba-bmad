import type { Booking, Desk } from '@/db/schema';

/**
 * Maps each desk's id → isAvailable for the supplied "active" bookings
 * (caller must pre-filter to status PENDING|CONFIRMED on the target date).
 *
 * A desk is unavailable iff at least one active booking references it.
 *
 * Pure function — no DB, no I/O. Used by both the space-detail page and
 * the availability REST endpoint so they stay in lockstep.
 */
export function computeDeskAvailability(
  desks: Desk[],
  activeBookings: Booking[],
): Map<string, boolean> {
  const occupied = new Set(activeBookings.map((b) => b.deskId));
  const result = new Map<string, boolean>();
  for (const d of desks) result.set(d.id, !occupied.has(d.id));
  return result;
}
