/**
 * DESIGN-INT-19 — Shared StatCard component for dashboard + payouts views.
 *
 * Mirrors the prototype's StatCard shape (label / value / trend / icon).
 * Uses the .stat-card CSS already in globals.css from DESIGN-1.
 *
 * Trend tone:
 *   - 'up'   → green
 *   - 'down' → red
 *   - 'flat' → neutral (no color override)
 *
 * The icon slot is a Lucide component (or any forwardRef'd SVG-emitting
 * component); caller passes the component as the `Icon` prop and the
 * card renders it at 16×16 inside the rounded-square plate.
 */

import type { LucideIcon } from 'lucide-react';

export type StatCardTrend = {
  dir: 'up' | 'down' | 'flat';
  text: string;
};

export function StatCard({
  label,
  value,
  unit,
  trend,
  Icon,
  attention,
  testid,
}: {
  label: string;
  value: string | number;
  unit?: string;
  trend?: StatCardTrend;
  Icon?: LucideIcon;
  attention?: boolean;
  testid?: string;
}) {
  return (
    <article
      className={`stat-card${attention ? ' is-attention' : ''}`}
      data-testid={testid}
    >
      <div className="stat-head">
        <div className="stat-label">{label}</div>
        {Icon && (
          <span className="stat-icon" aria-hidden="true">
            <Icon />
          </span>
        )}
      </div>
      <div className="stat-value">
        {value}
        {unit && <span className="unit">{unit}</span>}
      </div>
      {trend && (
        <div className="stat-foot">
          <span
            className={`stat-trend${trend.dir === 'up' ? ' up' : ''}${
              trend.dir === 'down' ? ' down' : ''
            }`}
          >
            {trend.dir === 'up' && '↑ '}
            {trend.dir === 'down' && '↓ '}
            {trend.text}
          </span>
        </div>
      )}
    </article>
  );
}
