'use client';

import { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import type { Role } from '@/db/schema';

type UserRow = {
  id: string;
  email: string;
  fullName: string;
  role: Role;
  createdAt: Date;
};

type RoleFilter = 'ALL' | Role;

const ROLE_OPTIONS: ReadonlyArray<{ value: RoleFilter; label: string }> = [
  { value: 'ALL', label: 'All' },
  { value: 'GUEST', label: 'Guest' },
  { value: 'SPACE_OWNER', label: 'Owner' },
  { value: 'SUPER_ADMIN', label: 'Admin' },
] as const;

const ROLE_PILL_CLASS: Record<Role, string> = {
  GUEST: 'badge-cancelled',
  SPACE_OWNER: 'badge-info',
  SUPER_ADMIN: 'badge-rejected',
};

const ROLE_LABEL: Record<Role, string> = {
  GUEST: 'Guest',
  SPACE_OWNER: 'Owner',
  SUPER_ADMIN: 'Admin',
};

function initialsOf(name: string, email: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  if (parts.length === 1 && parts[0].length >= 2)
    return parts[0].slice(0, 2).toUpperCase();
  return email.slice(0, 2).toUpperCase();
}

export function AdminUsersTable({ rows }: { rows: UserRow[] }) {
  const [filter, setFilter] = useState<RoleFilter>('ALL');
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows
      .filter((u) => filter === 'ALL' || u.role === filter)
      .filter(
        (u) =>
          !q ||
          u.fullName.toLowerCase().includes(q) ||
          u.email.toLowerCase().includes(q),
      );
  }, [rows, filter, query]);

  return (
    <>
      <div className="admin-toolbar">
        <div
          className="admin-toolbar-left"
          role="group"
          aria-label="Role filter"
        >
          {ROLE_OPTIONS.map((opt) => {
            const active = opt.value === filter;
            return (
              <button
                key={opt.value}
                type="button"
                className="chip"
                aria-pressed={active}
                onClick={() => setFilter(opt.value)}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
        <div className="admin-toolbar-right">
          <div className="search">
            <Search aria-hidden="true" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by name or email…"
              aria-label="Search users"
            />
          </div>
        </div>
      </div>

      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th style={{ width: '36%' }}>User</th>
              <th style={{ width: '14%' }}>Role</th>
              <th style={{ width: '16%' }}>Joined</th>
              <th className="action"></th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td
                  colSpan={4}
                  className="muted"
                  style={{ padding: '1.5rem', textAlign: 'center' }}
                >
                  No users match the current filters.
                </td>
              </tr>
            ) : (
              filtered.map((u) => (
                <tr key={u.id}>
                  <td>
                    <div className="cell-primary">
                      <span className="avatar-xs" aria-hidden="true">
                        {initialsOf(u.fullName, u.email)}
                      </span>
                      <div className="cell-stack">
                        <span className="top">{u.fullName}</span>
                        <span className="sub">{u.email}</span>
                      </div>
                    </div>
                  </td>
                  <td>
                    <span className={`badge ${ROLE_PILL_CLASS[u.role]}`}>
                      <span className="dot" aria-hidden="true" />
                      {ROLE_LABEL[u.role]}
                    </span>
                  </td>
                  <td className="muted tnum">
                    {new Date(u.createdAt).toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                      timeZone: 'UTC',
                    })}
                  </td>
                  <td className="action">
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      disabled
                      title="Phase 3 — destructive admin actions are not wired yet"
                      aria-disabled="true"
                    >
                      Manage
                    </button>
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
