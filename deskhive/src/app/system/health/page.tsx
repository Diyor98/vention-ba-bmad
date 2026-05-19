import { redirect } from 'next/navigation';
import { Activity, GitBranch, Server } from 'lucide-react';
import { requireSession, requireRole, AuthError } from '@/lib/auth/guards';
import { StatCard } from '@/components/stat-card';

/**
 * DESIGN-INT-16 — System health scaffold (Phase 3 wiring deferred).
 *
 * SUPER_ADMIN-only. Displays a placeholder operational view per the
 * prototype's SystemHealth shape:
 *   - 3 stat cards (Uptime / Avg response / Deploys this week)
 *   - Services list with uptime + status pill
 *   - Recent deploys list with commit-id chip + author/time
 *
 * All values are placeholders. No real status data exists in Phase 2;
 * a future Phase 3 story would wire this to a real ops backend (Vercel
 * + Neon + Resend + Stripe Connect status APIs, plus a deploys log).
 * The scaffold gives the BA a stakeholder-review surface without
 * blocking on backend infrastructure.
 */
export default async function SystemHealthPage() {
  // SUPER_ADMIN-only — matches /admin layout pattern (session first,
  // then role check; redirect to /login on no-session per Phase 1
  // convention).
  let session;
  try {
    session = await requireSession();
  } catch (err) {
    if (err instanceof AuthError) {
      redirect('/login?callbackUrl=/system/health');
    }
    throw err;
  }
  try {
    requireRole(session, 'SUPER_ADMIN');
  } catch (err) {
    if (err instanceof AuthError) {
      redirect('/');
    }
    throw err;
  }

  const services = [
    { name: 'API', uptime: '99.99%' },
    { name: 'Web app', uptime: '99.97%' },
    { name: 'Stripe webhook', uptime: '99.95%' },
    { name: 'Resend (email)', uptime: '99.92%' },
    { name: 'Background jobs', uptime: '99.96%' },
  ] as const;

  const deploys = [
    {
      id: '#1842',
      when: '2h ago',
      who: 'Ada Hollander',
      msg: 'feat(payouts): held-for-refund display',
    },
    {
      id: '#1841',
      when: '6h ago',
      who: 'Mira Yu',
      msg: 'fix(email): plain-text fallback on cancellation',
    },
    {
      id: '#1840',
      when: '1d ago',
      who: 'Ada Hollander',
      msg: 'chore(deps): bump stripe to 16.2',
    },
    {
      id: '#1839',
      when: '2d ago',
      who: 'Sam Vidal',
      msg: 'refactor(host-bookings): unify status pills',
    },
  ];

  return (
    <main className="container-content admin-page">
      <div className="admin-page-head">
        <div>
          <h1 className="page-h1">System status</h1>
          <p className="sub muted">
            Phase 3 scaffold — values are placeholders pending real
            ops-backend wiring.
          </p>
        </div>
        <div className="admin-actions">
          <span className="badge badge-confirmed">
            <span className="dot" aria-hidden="true" />
            All systems operational
          </span>
        </div>
      </div>

      <div
        className="stat-grid"
        style={{ marginBottom: '1.5rem' }}
        data-testid="system-stat-grid"
      >
        <StatCard label="Uptime · 90 days" value="99.96%" Icon={Activity} />
        <StatCard label="Avg response" value="148 ms" Icon={Server} />
        <StatCard
          label="Deploys · week"
          value="14"
          Icon={GitBranch}
          trend={{ dir: 'up', text: '+3 vs. prev' }}
        />
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)',
          gap: '1.5rem',
        }}
      >
        <section
          className="form-card"
          style={{ padding: '1.25rem' }}
          aria-labelledby="services-h"
        >
          <h2
            id="services-h"
            style={{
              fontSize: '14px',
              fontWeight: 600,
              marginBottom: '0.75rem',
              color: 'var(--color-neutral-900)',
            }}
          >
            Services
          </h2>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {services.map((s) => (
              <li
                key={s.name}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '0.625rem 0',
                  borderTop: '1px solid var(--color-border)',
                }}
              >
                <span
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}
                >
                  <span
                    aria-hidden="true"
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: 9999,
                      background: '#10B981',
                    }}
                  />
                  <span
                    style={{
                      fontSize: 14,
                      color: 'var(--color-neutral-900)',
                    }}
                  >
                    {s.name}
                  </span>
                </span>
                <span
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '0.75rem' }}
                >
                  <span
                    className="tnum"
                    style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: 11,
                      color: 'var(--color-neutral-500)',
                    }}
                  >
                    {s.uptime}
                  </span>
                  <span className="badge badge-confirmed">
                    <span className="dot" aria-hidden="true" />
                    Operational
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </section>

        <section
          className="form-card"
          style={{ padding: '1.25rem' }}
          aria-labelledby="deploys-h"
        >
          <h2
            id="deploys-h"
            style={{
              fontSize: '14px',
              fontWeight: 600,
              marginBottom: '0.75rem',
              color: 'var(--color-neutral-900)',
            }}
          >
            Recent deploys
          </h2>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {deploys.map((d) => (
              <li
                key={d.id}
                style={{
                  padding: '0.625rem 0',
                  borderTop: '1px solid var(--color-border)',
                }}
              >
                <div
                  style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
                >
                  <code
                    style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: 11,
                      color: 'var(--color-brand-700)',
                      background: 'var(--color-brand-50)',
                      padding: '0.125rem 0.375rem',
                      borderRadius: 'var(--radius-sm)',
                    }}
                  >
                    {d.id}
                  </code>
                  <span
                    style={{
                      fontSize: 14,
                      color: 'var(--color-neutral-900)',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {d.msg}
                  </span>
                </div>
                <div
                  style={{
                    fontSize: 12,
                    color: 'var(--color-neutral-500)',
                    marginTop: '0.25rem',
                    marginLeft: '0.25rem',
                  }}
                >
                  {d.who} · {d.when}
                </div>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </main>
  );
}
