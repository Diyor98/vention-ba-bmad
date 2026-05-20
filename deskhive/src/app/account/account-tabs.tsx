'use client';

import {
  useActionState,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useFormStatus } from 'react-dom';
import { CreditCard, Plus } from 'lucide-react';
import { Tabs, type TabDef } from '@/components/tabs';
import {
  updateProfileAction,
  type UpdateProfileActionState,
} from '@/actions/account';
import { toastError, toastSuccess } from '@/lib/toast';

/**
 * DESIGN-INT-9 + DESIGN-INT-GAPS-PASS-2 Gap 4 — Account settings
 * tabs (Profile / Payment methods / Notifications).
 *
 * Prototype reference: DeskHive_Prototype.html lines 1436-1509.
 *
 * Profile tab:
 *   - Avatar (image OR initial fallback) + name + Member-since +
 *     Upload-photo button (disabled placeholder; real upload
 *     pipeline is a follow-up — TODO below).
 *   - 4-input grid: Full name (editable, wired to
 *     updateProfileAction), Email (readonly — tied to auth
 *     identity), Phone + City (disabled placeholders, no schema
 *     column yet — TODO below).
 *   - Cancel button reverts the controlled fullName input to the
 *     server-provided default. Save submits the form.
 *
 * Payment methods tab:
 *   - No Stripe Customer model exists in our DB (Story 9-3
 *     Decision §4 — Phase 2 explicitly skipped customer.create).
 *     So the list renders as an empty-state row + disabled Add
 *     button. Copy clarifies the prototype's "saved cards" idea
 *     is a Phase 3 follow-up.
 *
 * Notifications tab:
 *   - 4 toggles per prototype line 1491-1495 (Booking
 *     confirmations / Reminder 24h before / New space
 *     recommendations / SMS alerts). State backed by
 *     window.localStorage under `deskhive:notify-prefs` —
 *     intentionally non-critical, just matches the prototype
 *     shape so BA can flip switches during a demo.
 *
 * TODO (out of Gap 4 scope, flagged for BA backlog):
 *   - Avatar upload pipeline (file picker → object storage →
 *     usersTable.image). Currently disabled.
 *   - usersTable columns for phone + city + Server Action support.
 *     Currently disabled inputs with "Coming soon" hint.
 *   - Server-side notification preferences table (Phase 3 — the
 *     localStorage approach is per-browser only, not portable).
 */

type TabKey = 'profile' | 'payment' | 'notify';

const TABS: ReadonlyArray<TabDef<TabKey>> = [
  { key: 'profile', label: 'Profile' },
  { key: 'payment', label: 'Payment methods' },
  { key: 'notify', label: 'Notifications' },
];

const initialProfileState: UpdateProfileActionState = { status: 'idle' };

export function AccountTabs({
  fullName,
  email,
  image,
  memberSince,
}: {
  fullName: string;
  email: string;
  image: string | null;
  memberSince: string;
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
        <ProfileTab
          fullName={fullName}
          email={email}
          image={image}
          memberSince={memberSince}
        />
      )}

      {tab === 'payment' && <PaymentTab />}

      {tab === 'notify' && <NotificationsTab />}
    </>
  );
}

// ── Profile tab ────────────────────────────────────────────────

function ProfileTab({
  fullName,
  email,
  image,
  memberSince,
}: {
  fullName: string;
  email: string;
  image: string | null;
  memberSince: string;
}) {
  const [state, formAction] = useActionState(
    updateProfileAction,
    initialProfileState,
  );
  // Controlled input so Cancel can revert to the server-default
  // without re-fetching.
  const [nameDraft, setNameDraft] = useState(fullName);
  const lastHandledState = useRef<UpdateProfileActionState | null>(null);

  useEffect(() => {
    if (state.status === 'idle') return;
    if (lastHandledState.current === state) return;
    lastHandledState.current = state;

    if (state.status === 'success') {
      // Sync the draft to the saved value so Cancel after Save
      // doesn't snap back to the stale original.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setNameDraft(state.fullName);
      toastSuccess('Profile updated', {
        description: 'Your changes have been saved.',
      });
    } else if (state.status === 'error') {
      // Field-level errors render inline; surface anything else as
      // a toast so the user doesn't miss it.
      if (state.code !== 'VALIDATION_ERROR') {
        toastError("Couldn't save profile", state.message);
      }
    }
  }, [state]);

  const fieldError = (name: string): string | undefined => {
    if (state.status !== 'error') return undefined;
    if (state.code !== 'VALIDATION_ERROR') return undefined;
    return state.fields?.[name];
  };

  const initial = (nameDraft || email).trim().charAt(0).toUpperCase() || '·';

  return (
    <section
      className="form-card"
      data-testid="tab-panel-profile"
    >
      <form action={formAction} noValidate>
        <div className="form-card-body">
          {/* Avatar row */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '1rem',
              marginBottom: '1.5rem',
            }}
          >
            {image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={image}
                alt={fullName}
                style={{
                  width: '3.5rem',
                  height: '3.5rem',
                  borderRadius: '999px',
                  objectFit: 'cover',
                  boxShadow: '0 0 0 2px #ffffff, 0 1px 2px rgba(0,0,0,0.1)',
                }}
                data-testid="profile-avatar"
              />
            ) : (
              <div
                aria-hidden="true"
                data-testid="profile-avatar-initial"
                style={{
                  width: '3.5rem',
                  height: '3.5rem',
                  borderRadius: '999px',
                  background: 'var(--color-brand-50)',
                  color: 'var(--color-brand-700)',
                  display: 'grid',
                  placeItems: 'center',
                  fontWeight: 600,
                  fontSize: '1.25rem',
                  boxShadow: '0 0 0 2px #ffffff, 0 1px 2px rgba(0,0,0,0.1)',
                }}
              >
                {initial}
              </div>
            )}
            <div style={{ minWidth: 0 }}>
              <div
                style={{
                  fontWeight: 500,
                  color: 'var(--color-neutral-900)',
                  fontSize: 15,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
                data-testid="profile-display-name"
              >
                {nameDraft || email}
              </div>
              <div
                style={{
                  fontSize: 12,
                  color: 'var(--color-neutral-500)',
                  marginTop: 2,
                }}
              >
                Member since {memberSince}
              </div>
            </div>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              disabled
              aria-disabled="true"
              title="Coming soon — photo upload pipeline not wired"
              data-testid="upload-photo"
              style={{ marginLeft: 'auto' }}
            >
              Upload photo
            </button>
          </div>

          <div className="form-grid">
            {/* Full name — editable + wired to action */}
            <div>
              <label className="field-label" htmlFor="account-name">
                Full name
              </label>
              <input
                id="account-name"
                name="fullName"
                className="input"
                value={nameDraft}
                onChange={(e) => setNameDraft(e.target.value)}
                aria-invalid={fieldError('fullName') ? true : undefined}
                maxLength={120}
                required
                data-testid="profile-fullname"
              />
              {fieldError('fullName') && (
                <p className="field-error">{fieldError('fullName')}</p>
              )}
            </div>

            {/* Email — read-only (tied to auth identity) */}
            <div>
              <label className="field-label" htmlFor="account-email">
                Email
              </label>
              <input
                id="account-email"
                className="input"
                defaultValue={email}
                readOnly
                aria-readonly="true"
                data-testid="profile-email"
                style={{
                  background: 'var(--color-neutral-100)',
                  color: 'var(--color-neutral-700)',
                  cursor: 'not-allowed',
                }}
              />
              <p className="field-help">
                Email is also your login — contact support to change it.
              </p>
            </div>

            {/* Phone — placeholder (no schema column yet) */}
            <div>
              <label className="field-label" htmlFor="account-phone">
                Phone
              </label>
              <input
                id="account-phone"
                className="input"
                placeholder="Coming soon"
                disabled
                aria-disabled="true"
                data-testid="profile-phone"
                style={{
                  background: 'var(--color-neutral-100)',
                  color: 'var(--color-neutral-500)',
                  cursor: 'not-allowed',
                }}
              />
              <p className="field-help">
                Phone numbers aren&apos;t stored yet — a future update
                will add this.
              </p>
            </div>

            {/* City — placeholder (no schema column yet) */}
            <div>
              <label className="field-label" htmlFor="account-city">
                City
              </label>
              <input
                id="account-city"
                className="input"
                placeholder="Coming soon"
                disabled
                aria-disabled="true"
                data-testid="profile-city"
                style={{
                  background: 'var(--color-neutral-100)',
                  color: 'var(--color-neutral-500)',
                  cursor: 'not-allowed',
                }}
              />
              <p className="field-help">
                City coming soon — useful for default search and host
                recommendations.
              </p>
            </div>
          </div>

          {/* Top-level error fallback (auth + DB failures) */}
          {state.status === 'error' &&
            state.code !== 'VALIDATION_ERROR' && (
              <p
                className="field-error"
                role="alert"
                style={{ marginTop: '0.75rem' }}
                data-testid="profile-top-error"
              >
                {state.message}
              </p>
            )}

          <div
            style={{
              marginTop: '1.25rem',
              display: 'flex',
              justifyContent: 'flex-end',
              gap: '0.5rem',
            }}
          >
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              data-testid="profile-cancel"
              onClick={() => setNameDraft(fullName)}
              disabled={nameDraft === fullName}
              aria-disabled={nameDraft === fullName || undefined}
            >
              Cancel
            </button>
            <ProfileSaveButton dirty={nameDraft !== fullName} />
          </div>
        </div>
      </form>
    </section>
  );
}

function ProfileSaveButton({ dirty }: { dirty: boolean }) {
  const { pending } = useFormStatus();
  const disabled = pending || !dirty;
  return (
    <button
      type="submit"
      className="btn btn-primary btn-sm"
      disabled={disabled}
      aria-disabled={disabled || undefined}
      data-testid="profile-save"
    >
      {pending ? 'Saving…' : 'Save changes'}
    </button>
  );
}

// ── Payment methods tab ─────────────────────────────────────────

function PaymentTab() {
  // No Stripe Customer model in Phase 2 (Story 9-3 Decision §4),
  // so there are no saved cards to enumerate. Render the empty
  // state list + disabled Add button per the gap's
  // "otherwise empty state" branch.
  return (
    <section
      className="form-card"
      data-testid="tab-panel-payment"
    >
      <div className="form-card-body">
        <p
          className="muted"
          style={{ fontSize: 14, lineHeight: 1.55, maxWidth: '60ch' }}
        >
          DeskHive doesn&apos;t store payment methods yet — Stripe
          Checkout collects your card at booking time. Saved cards
          are on the Phase 3 roadmap.
        </p>
        <ul
          data-testid="payment-methods-list"
          style={{
            listStyle: 'none',
            padding: 0,
            margin: '1rem 0 0',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-lg)',
            overflow: 'hidden',
          }}
        >
          <li
            data-testid="payment-empty-state"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.75rem',
              padding: '1rem 1rem',
              background: 'var(--color-neutral-50)',
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
                No saved payment methods yet
              </div>
              <div
                style={{
                  fontSize: 12,
                  color: 'var(--color-neutral-500)',
                  marginTop: 2,
                }}
              >
                We&apos;ll add saved-card support in a future release.
              </div>
            </div>
          </li>
        </ul>
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          disabled
          aria-disabled="true"
          title="Coming soon — Stripe customer + payment-method flow not wired"
          data-testid="add-payment-method"
          style={{
            marginTop: '1rem',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.375rem',
          }}
        >
          <Plus size={14} aria-hidden="true" />
          Add payment method
        </button>
      </div>
    </section>
  );
}

// ── Notifications tab ───────────────────────────────────────────

type NotifKey =
  | 'booking_confirmations'
  | 'reminder_24h'
  | 'new_space_recommendations'
  | 'sms_alerts';

type NotifDef = {
  key: NotifKey;
  label: string;
  subtitle: string;
  defaultOn: boolean;
};

const NOTIF_PREFS: ReadonlyArray<NotifDef> = [
  {
    key: 'booking_confirmations',
    label: 'Booking confirmations',
    subtitle: 'Always on',
    defaultOn: true,
  },
  {
    key: 'reminder_24h',
    label: 'Reminder 24h before',
    subtitle: 'Email',
    defaultOn: true,
  },
  {
    key: 'new_space_recommendations',
    label: 'New space recommendations',
    subtitle: 'Weekly digest',
    defaultOn: true,
  },
  {
    key: 'sms_alerts',
    label: 'SMS alerts',
    subtitle: 'Off',
    defaultOn: false,
  },
];

const NOTIF_STORAGE_KEY = 'deskhive:notify-prefs';

function NotificationsTab() {
  const defaults = useMemo<Record<NotifKey, boolean>>(
    () =>
      Object.fromEntries(
        NOTIF_PREFS.map((p) => [p.key, p.defaultOn]),
      ) as Record<NotifKey, boolean>,
    [],
  );
  const [prefs, setPrefs] = useState<Record<NotifKey, boolean>>(defaults);
  const [hydrated, setHydrated] = useState(false);

  // Read localStorage once after mount (SSR-safe). Same set-state-
  // in-effect rationale as src/app/booking/new/page.tsx — the value
  // is browser-only and there's no synchronous alternative.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setHydrated(true);
    try {
      const raw = window.localStorage.getItem(NOTIF_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Partial<Record<NotifKey, boolean>>;
      if (parsed && typeof parsed === 'object') {
        setPrefs((prev) => ({ ...prev, ...parsed }));
      }
    } catch {
      // Malformed JSON → use defaults silently. Don't blow up the tab.
    }
  }, []);

  const togglePref = (key: NotifKey) => {
    setPrefs((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      try {
        window.localStorage.setItem(NOTIF_STORAGE_KEY, JSON.stringify(next));
      } catch {
        // Quota / private browsing — silently swallow. Persistence
        // is best-effort; runtime toggle still works in-tab.
      }
      return next;
    });
  };

  return (
    <section
      className="form-card"
      data-testid="tab-panel-notify"
    >
      <div className="form-card-body">
        <p
          className="muted"
          style={{ fontSize: 14, lineHeight: 1.55, maxWidth: '60ch' }}
        >
          Toggle which updates you want to receive. Preferences are
          saved in this browser only — a future update will sync
          across devices.
        </p>
        <ul
          data-testid="notification-prefs-list"
          style={{
            listStyle: 'none',
            padding: 0,
            margin: '1rem 0 0',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-lg)',
            overflow: 'hidden',
          }}
        >
          {NOTIF_PREFS.map((pref, idx) => {
            const on = prefs[pref.key];
            return (
              <li
                key={pref.key}
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
                    {pref.label}
                  </div>
                  <div
                    style={{
                      fontSize: 12,
                      color: 'var(--color-neutral-500)',
                    }}
                  >
                    {pref.subtitle}
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={hydrated ? on : pref.defaultOn}
                  onChange={() => togglePref(pref.key)}
                  aria-label={`${pref.label} toggle`}
                  data-testid={`notify-toggle-${pref.key}`}
                  style={{ accentColor: 'var(--color-primary)' }}
                />
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
