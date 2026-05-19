'use client';

/**
 * DESIGN-INT-19 — Shared Tabs component (Client Component).
 *
 * Pattern: header bar of tab buttons with optional counts. The active
 * tab is controlled by the caller's state. The component itself is a
 * thin presentational shell — no routing, no URL sync; pages compose
 * useState + this component.
 *
 * Used by:
 *   - DESIGN-INT-6 (host bookings: 4 status tabs)
 *   - DESIGN-INT-9 (account page: Profile / Payment / Notifications)
 *
 * Styling uses the existing .admin-tab + .admin-tabs classes from
 * globals.css (Story 5-2). The component just renders the markup with
 * aria-current on the active tab.
 */

import { type ReactNode } from 'react';

export type TabDef<K extends string = string> = {
  key: K;
  label: string;
  count?: number;
};

export function Tabs<K extends string>({
  tabs,
  value,
  onChange,
  className,
  ariaLabel,
}: {
  tabs: ReadonlyArray<TabDef<K>>;
  value: K;
  onChange: (next: K) => void;
  className?: string;
  ariaLabel?: string;
}): ReactNode {
  return (
    <div
      role="tablist"
      aria-label={ariaLabel ?? 'Section tabs'}
      className={`admin-tabs${className ? ` ${className}` : ''}`}
      style={{
        borderBottom: '1px solid var(--color-border)',
        marginBottom: '1.25rem',
      }}
    >
      {tabs.map((t) => {
        const active = t.key === value;
        return (
          <button
            key={t.key}
            role="tab"
            type="button"
            aria-current={active ? 'page' : undefined}
            aria-selected={active}
            onClick={() => onChange(t.key)}
            className="admin-tab"
            data-testid={`tab-${t.key}`}
            style={{
              background: 'transparent',
              border: 0,
              cursor: 'pointer',
            }}
          >
            {t.label}
            {typeof t.count === 'number' && (
              <span className="count">{t.count}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
