import type { ApplicationStatus, BookingStatus } from '@/db/schema';

// Story 7-4: the badge component now accepts both BookingStatus and
// ApplicationStatus. The overlap on 'PENDING' + 'REJECTED' is intentional
// — same color + same human label across contexts (a pending booking
// reads identically to a pending application). 'APPROVED' is the only
// new variant; it maps to badge-confirmed (green) to reuse the Story 5-1
// status token. No new CSS classes added.
type Status = BookingStatus | ApplicationStatus;

const STATUS_CLASS: Record<Status, string> = {
  PENDING: 'badge-pending',
  CONFIRMED: 'badge-confirmed',
  APPROVED: 'badge-confirmed',
  REJECTED: 'badge-rejected',
  CANCELLED: 'badge-cancelled',
};

const STATUS_LABEL: Record<Status, string> = {
  PENDING: 'Pending',
  CONFIRMED: 'Confirmed',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
  CANCELLED: 'Cancelled',
};

export function StatusBadge({
  status,
  size = 'sm',
}: {
  status: Status;
  // 'lg' renders the prominent confirmed-card variant + larger dot per
  // Doc B §7.4 / Story 5-1's `.badge-lg` design.
  size?: 'sm' | 'lg';
}) {
  const sizeClass = size === 'lg' ? ' badge-lg' : '';
  return (
    <span className={`badge ${STATUS_CLASS[status]}${sizeClass}`}>
      <span className="dot" aria-hidden="true" />
      {STATUS_LABEL[status]}
    </span>
  );
}
