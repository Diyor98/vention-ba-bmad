'use client';

import { useMemo, useState } from 'react';
import { StatusBadge } from '@/components/status-badge';
import { formatCents } from '@/lib/format';
import { ConfirmBookingButton } from './confirm-booking-button';
import { RejectBookingButton } from './reject-booking-button';
import type { Booking, BookingStatus, Desk, Space } from '@/db/schema';

export type AdminBookingRow = {
  booking: Booking;
  desk: Desk;
  space: Space;
  guest: { id: string; email: string; fullName: string };
};

type FilterValue = 'ALL' | BookingStatus;
type SortDirection = 'asc' | 'desc';

const FILTER_OPTIONS: ReadonlyArray<{ value: FilterValue; label: string }> = [
  { value: 'ALL', label: 'All' },
  { value: 'PENDING', label: 'Pending' },
  { value: 'CONFIRMED', label: 'Confirmed' },
  { value: 'REJECTED', label: 'Rejected' },
  { value: 'CANCELLED', label: 'Cancelled' },
] as const;

// Initials from "Full Name" → "FN". Falls back to email's first two chars
// if fullName is empty (defense-in-depth — schema requires fullName).
function initialsOf(fullName: string, email: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  if (parts.length === 1 && parts[0].length >= 2)
    return parts[0].slice(0, 2).toUpperCase();
  return email.slice(0, 2).toUpperCase();
}

// "Thu, May 14" — purely presentational; the canonical ISO date stays in
// booking.bookingDate. Locale fixed to en-US for deterministic SSR vs
// client output (avoids hydration mismatch on dates).
function formatBookedDate(iso: string): string {
  // Parse as UTC noon to avoid TZ-edge cases on the formatter side. The
  // string is YYYY-MM-DD; appending T12:00:00Z keeps the calendar day
  // stable across all reasonable timezones.
  const d = new Date(`${iso}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

export function BookingsTable({ rows }: { rows: AdminBookingRow[] }) {
  const [selectedFilter, setSelectedFilter] = useState<FilterValue>('ALL');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

  // Counts reflect the full loaded array, not the filtered view — clicking
  // Pending should still tell you how many Confirmed exist.
  const counts = useMemo(() => {
    const c: Record<FilterValue, number> = {
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
    // Client-side sort by bookingDate (ISO YYYY-MM-DD string compare is
    // lexicographic and matches calendar order). createdAt is the
    // tiebreaker — mirrors the server-side `listAllBookings` ordering.
    const sorted = [...filtered].sort((a, b) => {
      const byDate = a.booking.bookingDate.localeCompare(b.booking.bookingDate);
      if (byDate !== 0)
        return sortDirection === 'asc' ? byDate : -byDate;
      const aTime = new Date(a.booking.createdAt).getTime();
      const bTime = new Date(b.booking.createdAt).getTime();
      return sortDirection === 'asc' ? aTime - bTime : bTime - aTime;
    });
    return sorted;
  }, [rows, selectedFilter, sortDirection]);

  return (
    <>
      <div className="admin-toolbar">
        <div
          className="admin-toolbar-left"
          role="group"
          aria-label="Status filter"
        >
          {FILTER_OPTIONS.map((opt) => {
            const active = opt.value === selectedFilter;
            return (
              <button
                key={opt.value}
                type="button"
                className="chip"
                aria-pressed={active}
                onClick={() => setSelectedFilter(opt.value)}
              >
                {opt.label}{' '}
                <span className="count tnum">{counts[opt.value]}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="table-wrap">
        <table className="table compact">
          <thead>
            <tr>
              <th
                style={{ width: '11rem' }}
                className="sortable"
                aria-sort={
                  sortDirection === 'asc' ? 'ascending' : 'descending'
                }
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
