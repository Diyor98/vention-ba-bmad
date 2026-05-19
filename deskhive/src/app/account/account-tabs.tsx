'use client';

import { useState } from 'react';
import { CreditCard, Plus } from 'lucide-react';
import { Tabs, type TabDef } from '@/components/tabs';

type TabKey = 'profile' | 'payment' | 'notify';

const TABS: ReadonlyArray<TabDef<TabKey>> = [
  { key: 'profile', label: 'Profile' },
  { key: 'payment', label: 'Payment methods' },
  { key: 'notify', label: 'Notifications' },
];

export function AccountTabs({
  fullName,
  email,
}: {
  fullName: string;
  email: string;
}) {
  const [tab, setTab] = useState<TabKey>('profile');
  return (
    <>
      <Tabs
        tabs={TABS}
        value={tab}
        onChange={setTab}
        ariaLabel="Account settings sections"
      />

      {tab === 'profile' && (
        <section className="form-card" data-testid="tab-panel-profile">
          <div className="form-card-body">
            <div className="form-grid">
              <div className="span-2">
                <label className="field-label" htmlFor="account-name">
                  Full name
                </label>
                <input
                  id="account-name"
                  className="input"
                  defaultValue={fullName}
                  readOnly
                  aria-readonly="true"
                />
                <p className="field-help">
                  Phase 3 will wire profile editing. The name shown here is
                  the one you signed up with.
                </p>
              </div>
              <div className="span-2">
                <label className="field-label" htmlFor="account-email">
                  Email
                </label>
                <input
                  id="account-email"
                  className="input"
                  defaultValue={email}
                  readOnly
                  aria-readonly="true"
                />
                <p className="field-help">
                  Email is also your login. Reach out to support if it needs
                  to change.
                </p>
              </div>
            </div>
          </div>
        </section>
      )}

      {tab === 'payment' && (
        <section className="form-card" data-testid="tab-panel-payment">
          <div className="form-card-body">
            <p
              className="muted"
              style={{ fontSize: 14, lineHeight: 1.55, maxWidth: '60ch' }}
            >
              DeskHive doesn&apos;t store payment methods directly — Stripe
              Checkout collects card details at booking time and the card is
              authorized + captured through Stripe&apos;s vault.
            </p>
            <div
              style={{
                marginTop: '1rem',
                border: '1px dashed var(--color-border-strong)',
                borderRadius: 'var(--radius-lg)',
                padding: '1.25rem',
                background: 'var(--color-neutral-50)',
                display: 'flex',
                alignItems: 'center',
                gap: '0.75rem',
              }}
            >
              <CreditCard
                size={18}
                aria-hidden="true"
                style={{ color: 'var(--color-neutral-500)' }}
              />
              <div style={{ flex: 1 }}>
                <div
                  style={{
                    fontSize: 14,
                    fontWeight: 500,
                    color: 'var(--color-neutral-900)',
                  }}
                >
                  Saved cards · Phase 3
                </div>
                <div
                  style={{
                    fontSize: 12,
                    color: 'var(--color-neutral-500)',
                  }}
                >
                  Save cards across bookings without re-entering. Coming
                  later this year.
                </div>
              </div>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                disabled
                aria-disabled="true"
                title="Phase 3 — saved cards not wired yet"
              >
                <Plus size={14} aria-hidden="true" /> Add card
              </button>
            </div>
          </div>
        </section>
      )}

      {tab === 'notify' && (
        <section className="form-card" data-testid="tab-panel-notify">
          <div className="form-card-body">
            <p
              className="muted"
              style={{ fontSize: 14, lineHeight: 1.55, maxWidth: '60ch' }}
            >
              Email notifications are always on for booking-lifecycle
              events. Phase 3 will add granular toggles for digests + SMS.
            </p>
            <ul
              style={{
                listStyle: 'none',
                padding: 0,
                margin: '1rem 0 0',
                border: '1px solid var(--color-border)',
                borderRadius: 'var(--radius-lg)',
                overflow: 'hidden',
              }}
            >
              {[
                {
                  k: 'Booking confirmations',
                  v: 'Always on',
                  channel: 'email',
                  on: true,
                  disabled: true,
                },
                {
                  k: 'Refund processed',
                  v: 'Always on',
                  channel: 'email',
                  on: true,
                  disabled: true,
                },
                {
                  k: 'Weekly digest',
                  v: 'Off — Phase 3',
                  channel: 'email',
                  on: false,
                  disabled: true,
                },
                {
                  k: 'SMS alerts',
                  v: 'Off — Phase 3',
                  channel: 'sms',
                  on: false,
                  disabled: true,
                },
              ].map((row, idx) => (
                <li
                  key={row.k}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '0.875rem 1rem',
                    borderTop:
                      idx === 0 ? undefined : '1px solid var(--color-border)',
                  }}
                >
                  <div>
                    <div
                      style={{
                        fontSize: 14,
                        fontWeight: 500,
                        color: 'var(--color-neutral-900)',
                      }}
                    >
                      {row.k}
                    </div>
                    <div
                      style={{ fontSize: 12, color: 'var(--color-neutral-500)' }}
                    >
                      {row.v}
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    defaultChecked={row.on}
                    disabled={row.disabled}
                    aria-label={`${row.k} toggle`}
                  />
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}
    </>
  );
}
