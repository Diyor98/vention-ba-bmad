import type { BookingStatus } from '@/db/schema';

const STATUS_CLASS: Record<BookingStatus, string> = {
  PENDING: 'badge-pending',
  CONFIRMED: 'badge-confirmed',
  REJECTED: 'badge-rejected',
  CANCELLED: 'badge-cancelled',
};

const STATUS_LABEL: Record<BookingStatus, string> = {
  PENDING: 'Pending',
  CONFIRMED: 'Confirmed',
  REJECTED: 'Rejected',
  CANCELLED: 'Cancelled',
};

export function StatusBadge({
  status,
  size = 'sm',
}: {
  status: BookingStatus;
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
