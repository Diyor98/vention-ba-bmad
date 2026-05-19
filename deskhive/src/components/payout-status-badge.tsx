import type Stripe from 'stripe';

/**
 * Story 9-7: visual treatment for Stripe payout statuses on
 * /owner/payouts (BA Decision §7 Option b — new component, NOT an
 * extension of `<StatusBadge>`).
 *
 * Rationale (BA Decision §7): `<StatusBadge>` is scoped to
 * BookingStatus + ApplicationStatus. Adding payout-status branching
 * would type-couple three independent enums into one component (booking
 * + application + payout) and create a fragile prop interface. The
 * payout status enum lives entirely in Stripe's domain — Phase 3 may
 * add `payout.failed` / `payout.canceled` lifecycle events here without
 * touching the booking-status component.
 *
 * Reuses the existing `.badge` + `.badge-*` CSS tokens from Story 5-1's
 * design system. No new colors, no new design tokens (CC-8 carry-
 * forward). Maps Stripe's 5 payout statuses to the closest semantic
 * status-color from the existing palette:
 *
 *   • `paid`        → badge-confirmed (green)    — funds settled in owner's bank
 *   • `in_transit`  → badge-pending   (amber)    — en route 1-2 business days
 *   • `pending`     → badge-pending   (amber)    — scheduled but not initiated
 *   • `failed`      → badge-rejected  (red)      — transfer failed; owner action needed
 *   • `canceled`    → badge-cancelled (gray)     — canceled before transfer; rare in test mode
 *
 * The `pending` and `in_transit` Stripe statuses both map to
 * `badge-pending` (amber) because both convey "in flight, not yet
 * settled" — distinguishing them at the badge level would require new
 * design tokens (out of CC-8 scope). The status LABEL distinguishes
 * them ("In transit" vs "Pending"), which is enough fidelity.
 */

// Stripe's TS definitions don't expose Payout.Status as a named union;
// use the indexed-access type instead. Resolves to:
// 'paid' | 'pending' | 'in_transit' | 'canceled' | 'failed'.
type PayoutStatus = Stripe.Payout['status'];

const STATUS_CLASS: Record<PayoutStatus, string> = {
  paid: 'badge-confirmed',
  in_transit: 'badge-pending',
  pending: 'badge-pending',
  failed: 'badge-rejected',
  canceled: 'badge-cancelled',
};

const STATUS_LABEL: Record<PayoutStatus, string> = {
  paid: 'Paid',
  in_transit: 'In transit',
  pending: 'Pending',
  failed: 'Failed',
  canceled: 'Canceled',
};

export function PayoutStatusBadge({ status }: { status: PayoutStatus }) {
  return (
    <span className={`badge ${STATUS_CLASS[status]}`}>
      <span className="dot" aria-hidden="true" />
      {STATUS_LABEL[status]}
    </span>
  );
}
