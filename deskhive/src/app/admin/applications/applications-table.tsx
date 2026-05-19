'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { StatusBadge } from '@/components/status-badge';
import { Tabs, type TabDef } from '@/components/tabs';
import type { Application, ApplicationStatus } from '@/db/schema';

export type AdminApplicationRow = {
  application: Application;
  applicant: { id: string; email: string; fullName: string };
};

type FilterValue = 'ALL' | ApplicationStatus;
type SortColumn = 'submitted' | 'applicant' | 'status';
type SortDirection = 'asc' | 'desc';

const FILTER_OPTIONS: ReadonlyArray<{ value: FilterValue; label: string }> = [
  { value: 'ALL', label: 'All' },
  { value: 'PENDING', label: 'Pending' },
  { value: 'APPROVED', label: 'Approved' },
  { value: 'REJECTED', label: 'Rejected' },
] as const;

const STATUS_ORDER: Record<ApplicationStatus, number> = {
  PENDING: 0,
  APPROVED: 1,
  REJECTED: 2,
};

function formatSubmitted(date: Date): string {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date);
}

function formatReviewed(date: Date | null): string {
  if (!date) return '—';
  return formatSubmitted(date);
}

function emptyLabelFor(filter: FilterValue): string {
  if (filter === 'ALL') return 'No applications.';
  if (filter === 'PENDING') return 'No pending applications.';
  if (filter === 'APPROVED') return 'No approved applications.';
  return 'No rejected applications.';
}

/**
 * Story 7-4: filter-chip + sortable-table client component for admin
 * applications. Mirrors /admin/bookings/bookings-table.tsx structure.
 *
 * Sort columns per BA Decisions §11: Submitted (default, newest first),
 * Applicant (alphabetical by fullName), Status (enum order PENDING →
 * APPROVED → REJECTED). All sort logic is client-side; the server-side
 * default order is already `created_at DESC` from listAllApplications.
 */
export function ApplicationsTable({ rows }: { rows: AdminApplicationRow[] }) {
  const [selectedFilter, setSelectedFilter] = useState<FilterValue>('ALL');
  const [sortColumn, setSortColumn] = useState<SortColumn>('submitted');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

  // Counts from full rows (not filtered view) so chip badges reflect
  // total population.
  const counts = useMemo(() => {
    const c: Record<FilterValue, number> = {
      ALL: rows.length,
      PENDING: 0,
      APPROVED: 0,
      REJECTED: 0,
    };
    for (const r of rows) {
      const s = r.application.status as ApplicationStatus;
      c[s] += 1;
    }
    return c;
  }, [rows]);

  const displayedRows = useMemo(() => {
    const filtered =
      selectedFilter === 'ALL'
        ? rows
        : rows.filter((r) => r.application.status === selectedFilter);

    const sorted = [...filtered].sort((a, b) => {
      let cmp: number;
      if (sortColumn === 'submitted') {
        cmp = a.application.createdAt.getTime() - b.application.createdAt.getTime();
      } else if (sortColumn === 'applicant') {
        cmp = a.applicant.fullName.localeCompare(b.applicant.fullName);
      } else {
        // status
        cmp =
          STATUS_ORDER[a.application.status as ApplicationStatus] -
          STATUS_ORDER[b.application.status as ApplicationStatus];
      }
      return sortDirection === 'asc' ? cmp : -cmp;
    });
    return sorted;
  }, [rows, selectedFilter, sortColumn, sortDirection]);

  function toggleSort(col: SortColumn): void {
    if (sortColumn === col) {
      setSortDirection((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortColumn(col);
      // Sensible default direction per column:
      // Submitted → desc (newest first), Applicant → asc, Status → asc.
      setSortDirection(col === 'submitted' ? 'desc' : 'asc');
    }
  }

  function sortArrow(col: SortColumn): string {
    if (sortColumn !== col) return '';
    return sortDirection === 'asc' ? '↑' : '↓';
  }

  // DESIGN-INT-14 — swap chip filter for shared <Tabs>; matches the
  // prototype's AdminApplications shape (and is consistent with the host
  // bookings table after DESIGN-INT-6).
  const tabDefs: ReadonlyArray<TabDef<FilterValue>> = FILTER_OPTIONS.map(
    (opt) => ({ key: opt.value, label: opt.label, count: counts[opt.value] }),
  );

  return (
    <>
      <Tabs
        tabs={tabDefs}
        value={selectedFilter}
        onChange={setSelectedFilter}
        ariaLabel="Application status filter"
      />

      <div className="table-wrap">
        <table className="table compact">
          <thead>
            <tr>
              <th
                style={{ width: '11rem' }}
                className="sortable"
                aria-sort={
                  sortColumn === 'submitted'
                    ? sortDirection === 'asc'
                      ? 'ascending'
                      : 'descending'
                    : 'none'
                }
                onClick={() => toggleSort('submitted')}
              >
                Submitted{' '}
                <span className="sort-arrow" aria-hidden="true">
                  {sortArrow('submitted')}
                </span>
              </th>
              <th
                style={{ width: '24%' }}
                className="sortable"
                aria-sort={
                  sortColumn === 'applicant'
                    ? sortDirection === 'asc'
                      ? 'ascending'
                      : 'descending'
                    : 'none'
                }
                onClick={() => toggleSort('applicant')}
              >
                Applicant{' '}
                <span className="sort-arrow" aria-hidden="true">
                  {sortArrow('applicant')}
                </span>
              </th>
              <th style={{ width: '22%' }}>Business</th>
              <th
                style={{ width: '8rem' }}
                className="sortable"
                aria-sort={
                  sortColumn === 'status'
                    ? sortDirection === 'asc'
                      ? 'ascending'
                      : 'descending'
                    : 'none'
                }
                onClick={() => toggleSort('status')}
              >
                Status{' '}
                <span className="sort-arrow" aria-hidden="true">
                  {sortArrow('status')}
                </span>
              </th>
              <th style={{ width: '8rem' }}>Reviewed</th>
              <th className="action" style={{ width: '7rem' }}></th>
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
                  {emptyLabelFor(selectedFilter)}
                </td>
              </tr>
            ) : (
              displayedRows.map(({ application, applicant }) => (
                <tr
                  key={application.id}
                  className={
                    application.status === 'PENDING' ? 'row-attention' : undefined
                  }
                >
                  <td className="muted tnum">
                    {formatSubmitted(application.createdAt)}
                  </td>
                  <td>
                    <div className="cell-stack">
                      <span className="top">{applicant.fullName}</span>
                      <span className="sub">{applicant.email}</span>
                    </div>
                  </td>
                  <td>{application.businessName}</td>
                  <td>
                    <StatusBadge
                      status={application.status as ApplicationStatus}
                    />
                  </td>
                  <td className="muted tnum">
                    {formatReviewed(application.reviewedAt)}
                  </td>
                  <td className="action">
                    <Link
                      href={`/admin/applications/${application.id}`}
                      className="btn btn-secondary btn-sm"
                    >
                      Review
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
