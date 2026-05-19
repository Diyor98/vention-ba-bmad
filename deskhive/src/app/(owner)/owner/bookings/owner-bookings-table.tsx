'use client';

import { useMemo, useState } from 'react';
import { StatusBadge } from '@/components/status-badge';
import { Tabs, type TabDef } from '@/components/tabs';
import { formatCents } from '@/lib/format';
import { ConfirmBookingButton } from '@/app/admin/bookings/confirm-booking-button';
import { RejectBookingButton } from '@/app/admin/bookings/reject-booking-button';
import type { Booking, BookingStatus, Desk, Space } from '@/db/schema';

// Story 7-5: parallel to <BookingsTable> from /admin/bookings, scoped
// to one owner's spaces. Per BA Decisions §6 + story-file Decision #7:
// duplicated (not abstracted via variant prop) because the admin/owner
// branches would land in 3+ places — page chrome, empty-state copy,
// initial-filter URL handling — and a single component would carry more
// conditional logic than two parallel files.
//
// initialFilter honors the dashboard's "Pending bookings" card link
// (?filter=pending). After initial paint, the chips drive state in-memory
// (no router.push on chip click — admin parity).

export type OwnerBookingRow = {
  booking: Booking;
  desk: Desk;
  space: Space;
  guest: { id: string; email: string; fullName: string };
};

export type OwnerFilterValue = 'ALL' | BookingStatus;
type SortDirection = 'asc' | 'desc';

const FILTER_OPTIONS: ReadonlyArray<{
  value: OwnerFilterValue;
  label: string;
}> = [
  { value: 'ALL', label: 'All' },
  { value: 'PENDING', label: 'Pending' },
  { value: 'CONFIRMED', label: 'Confirmed' },
  { value: 'REJECTED', label: 'Rejected' },
  { value: 'CANCELLED', label: 'Cancelled' },
] as const;

function initialsOf(fullName: string, email: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  if (parts.length === 1 && parts[0].length >= 2)
    return parts[0].slice(0, 2).toUpperCase();
  return email.slice(0, 2).toUpperCase();
}

function formatBookedDate(iso: string): string {
  const d = new Date(`${iso}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

export function OwnerBookingsTable({
  rows,
  initialFilter = 'ALL',
}: {
  rows: OwnerBookingRow[];
  initialFilter?: OwnerFilterValue;
}) {
  const [selectedFilter, setSelectedFilter] =
    useState<OwnerFilterValue>(initialFilter);
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

  const counts = useMemo(() => {
    const c: Record<OwnerFilterValue, number> = {
      ALL: rows.length,
      PENDING: 0,
      CONFIRMED: 0,
      REJECTED: 0,
      CANCELLED: 0,
    };
    for (const r of rows) {
      const s = r.booking.status as BookingStatus;
      c[s] += 1;
    }
    return c;
  }, [rows]);

  const displayedRows = useMemo(() => {
    const filtered =
      selectedFilter === 'ALL'
        ? rows
        : rows.filter((r) => r.booking.status === selectedFilter);
    const sorted = [...filtered].sort((a, b) => {
      const byDate = a.booking.bookingDate.localeCompare(b.booking.bookingDate);
      if (byDate !== 0) return sortDirection === 'asc' ? byDate : -byDate;
      const aTime = new Date(a.booking.createdAt).getTime();
      const bTime = new Date(b.booking.createdAt).getTime();
      return sortDirection === 'asc' ? aTime - bTime : bTime - aTime;
    });
    return sorted;
  }, [rows, selectedFilter, sortDirection]);

  // DESIGN-INT-6 — swap the chip-style filter row for the shared Tabs
  // component matching the prototype's HostBookings shape. Counts surface
  // alongside each label; in-memory state drives the change (no router
  // push on tab click — admin parity).
  const tabDefs: ReadonlyArray<TabDef<OwnerFilterValue>> = FILTER_OPTIONS.map(
    (opt) => ({
      key: opt.value,
      label: opt.label,
      count: counts[opt.value],
    }),
  );

  return (
    <>
      <Tabs
        tabs={tabDefs}
        value={selectedFilter}
        onChange={setSelectedFilter}
        ariaLabel="Booking status filter"
      />

      <div className="table-wrap">
        <table className="table compact">
          <thead>
            <tr>
              <th
                style={{ width: '11rem' }}
                className="sortable"
                aria-sort={sortDirection === 'asc' ? 'ascending' : 'descending'}
                onClick={() =>
                  setSortDirection((d) => (d === 'asc' ? 'desc' : 'asc'))
                }
              >
                Booked{' '}
                <span className="sort-arrow" aria-hidden="true">
                  {sortDirection === 'asc' ? '↑' : '↓'}
                </span>
              </th>
              <th style={{ width: '24%' }}>Guest</th>
              <th style={{ width: '28%' }}>Space · Desk</th>
              <th className="num" style={{ width: '6rem' }}>
                Total
              </th>
              <th style={{ width: '8rem' }}>Status</th>
              <th className="action" style={{ minWidth: '12rem' }}></th>
            </tr>
          </thead>
          <tbody>
            {displayedRows.length === 0 ? (
              <tr>
                <td
                  colSpan={6}
                  className="muted"
                  style={{ padding: '1.5rem', textAlign: 'center' }}
                >
                  No bookings match this filter.
                </td>
              </tr>
            ) : (
              displayedRows.map(({ booking, desk, space, guest }) => {
                const status = booking.status as BookingStatus;
                const isPending = status === 'PENDING';
                return (
                  <tr
                    key={booking.id}
                    className={isPending ? 'row-attention' : undefined}
                  >
                    <td className="muted tnum">
                      {formatBookedDate(booking.bookingDate)}
                    </td>
                    <td>
                      <div className="cell-primary">
                        <span className="avatar-xs" aria-hidden="true">
                          {initialsOf(guest.fullName, guest.email)}
                        </span>
                        <div className="cell-stack">
                          <span className="top">{guest.fullName}</span>
                          <span className="sub">{guest.email}</span>
                        </div>
                      </div>
                    </td>
                    <td>
                      <div className="cell-stack">
                        <span className="top">{space.name}</span>
                        <span className="sub">{desk.label}</span>
                      </div>
                    </td>
                    <td className="num tnum">
                      {formatCents(booking.totalPriceCents)}
                    </td>
                    <td>
                      <StatusBadge status={status} />
                    </td>
                    <td className="action">
                      {isPending ? (
                        <div className="action-set">
                          <ConfirmBookingButton bookingId={booking.id} />
                          <RejectBookingButton bookingId={booking.id} />
                        </div>
                      ) : null}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
