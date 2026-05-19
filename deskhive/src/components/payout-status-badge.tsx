import type Stripe from 'stripe';

/**
 * Story 9-7: visual treatment for Stripe payout statuses on
 * /owner/payouts.
 *
 * DESIGN-FIX-3 (2026-05-19) — stakeholder-friendly relabeling. Two
 * notable departures from the Story 9-7 baseline:
 *
 *   • `failed` now reads "Action needed" (not "Failed") and uses the
 *     amber `.badge-pending` variant (not red `.badge-rejected`). A
 *     failed payout on the owner-facing view is almost always
 *     remediable (re-onboard, fix bank details, retry) — the original
 *     red treatment misframed it as a terminal error.
 *   • `in_transit` now uses the blue `.badge-info` variant (not amber
 *     `.badge-pending`) to distinguish "money is moving" from
 *     "scheduled but not initiated". `badge-info` is added in
 *     globals.css for this DESIGN-FIX and reuses brand-50 / brand-200
 *     / brand-700 tokens already defined in the @theme block.
 *
 * Mapping summary:
 *
 *   • `paid`        → "Paid"          (green `.badge-confirmed`)
 *   • `in_transit`  → "In transit"    (blue  `.badge-info`)
 *   • `pending`     → "Pending"       (amber `.badge-pending`)
 *   • `failed`      → "Action needed" (amber `.badge-pending`)
 *   • `canceled`    → "Canceled"      (gray  `.badge-cancelled`)
 *   • <unknown>     → titlecased raw status (gray `.badge-cancelled`)
 *
 * Architectural note (BA Decision §7 from 9-7 still holds): this is a
 * NEW component, NOT an extension of `<StatusBadge>`. The booking +
 * application + payout enums stay independent at the component layer.
 */

// Stripe's TS definitions don't expose Payout.Status as a named union;
// use indexed-access. Resolves to:
// 'paid' | 'pending' | 'in_transit' | 'canceled' | 'failed'.
type PayoutStatus = Stripe.Payout['status'];

export type PayoutStatusVariant =
  | 'badge-confirmed'
  | 'badge-info'
  | 'badge-pending'
  | 'badge-cancelled';

export type PayoutStatusDisplay = {
  label: string;
  variant: PayoutStatusVariant;
};

const STATUS_MAP: Record<PayoutStatus, PayoutStatusDisplay> = {
  paid: { label: 'Paid', variant: 'badge-confirmed' },
  in_transit: { label: 'In transit', variant: 'badge-info' },
  pending: { label: 'Pending', variant: 'badge-pending' },
  failed: { label: 'Action needed', variant: 'badge-pending' },
  canceled: { label: 'Canceled', variant: 'badge-cancelled' },
};

/**
 * DESIGN-FIX-3 — pure mapping helper. Returns the stakeholder-friendly
 * label + the CSS variant token. Unknown statuses fall back to a
 * title-cased version of the raw status with the gray cancelled
 * variant — defensive against Stripe shipping a new status code that
 * predates this app's awareness.
 */
export function getPayoutStatusDisplay(
  status: PayoutStatus | string,
): PayoutStatusDisplay {
  if (status in STATUS_MAP) {
    return STATUS_MAP[status as PayoutStatus];
  }
  const raw = String(status ?? '').trim();
  const label = raw.length === 0
    ? 'Unknown'
    : raw.charAt(0).toUpperCase() + raw.slice(1).replace(/_/g, ' ');
  return { label, variant: 'badge-cancelled' };
}

export function PayoutStatusBadge({ status }: { status: PayoutStatus | string }) {
  const { label, variant } = getPayoutStatusDisplay(status);
  return (
    <span className={`badge ${variant}`} data-testid={`payout-status-${status}`}>
      <span className="dot" aria-hidden="true" />
      {label}
    </span>
  );
}
