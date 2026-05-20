'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import {
  Banknote,
  Briefcase,
  Calendar,
  LayoutDashboard,
  LogOut,
  Settings,
  Sparkles,
} from 'lucide-react';
import { logoutAction } from '@/actions/auth';
import {
  switchModeAction,
  type SwitchModeActionState,
} from '@/actions/mode';
import type { Mode } from '@/lib/mode';

const initialSwitchState: SwitchModeActionState = { status: 'idle' };

/**
 * Story 7-1 + DESIGN-INT-GAPS-PASS-2 Round 3 — user-pill dropdown.
 *
 * Prototype DeskHive_Prototype.html lines 583-606 spec a per-role
 * icon-row menu rooted at a two-line user header (name + email).
 * This file is the React port of that menu, refactored from the
 * pre-pass-2 minimal "Signed in as / Log out" shell.
 *
 * Per-role menu shape (Round 3):
 *
 *   GUEST (role === 'GUEST'):
 *     Header / My bookings / Become a host / Account / Sign out
 *
 *   SPACE_OWNER in Guest mode (role === 'SPACE_OWNER' && mode === 'guest'):
 *     Header / My bookings / Switch to hosting / Account / Sign out
 *
 *   SPACE_OWNER in Host mode (role === 'SPACE_OWNER' && mode === 'host'):
 *     Header / Host dashboard / Payouts / Account / Switch to traveling / Sign out
 *
 *     NB: the prototype host menu (line 592-596) omits Switch-to-traveling
 *     because the prototype has a separate role-switcher pill in the
 *     header. Round 3 explicitly forbids adding that role-switcher pill,
 *     so Switch-to-traveling stays in the host dropdown as a 5th item
 *     between Account and Sign out — without it, a SPACE_OWNER stuck in
 *     Host mode would have no path back to traveling.
 *
 *   SUPER_ADMIN (role === 'SUPER_ADMIN'):
 *     Header / Account / Sign out  (pre-pass-2 admin menu is minimal
 *     by design — Round 3 scope didn't touch admin).
 *
 * Icon choices vs prototype:
 *   - Become a host: Sparkles (prototype `Icon.Sparkle` — lucide-react
 *     ships the plural `Sparkles`).
 *   - Switch to hosting: Briefcase (prototype doesn't specify; Round 3
 *     Gap A suggests "Briefcase or similar").
 *   - Switch to traveling: Briefcase too (consistent affordance,
 *     orientation reversed via label).
 *   - Payouts: Banknote (prototype `Icon.Banknote`).
 *   - Account: Settings (prototype `Icon.Settings`).
 *   - Host dashboard: LayoutDashboard (prototype `Icon.LayoutDashboard`).
 *   - My bookings: Calendar (prototype `Icon.Calendar`).
 *   - Sign out: LogOut (prototype `Icon.LogOut`).
 *
 * Size 15 for the icons matches the prototype's `<Ic size={15}/>`.
 */
export function UserPill({
  displayName,
  email,
  initial,
  role,
  mode,
}: {
  displayName: string;
  email: string;
  initial: string;
  role: string;
  mode: Mode;
}) {
  return (
    <details className="user-menu">
      <summary
        className="user-pill"
        aria-label={`Logged in as ${displayName}`}
      >
        <span className="user-avatar" aria-hidden="true">
          {initial}
        </span>
        <span className="hidden sm:inline">{displayName}</span>
      </summary>

      <div className="user-menu-panel" role="menu">
        <UserMenuHeader displayName={displayName} email={email} />

        {role === 'SUPER_ADMIN' ? (
          <AdminMenuItems />
        ) : role === 'SPACE_OWNER' && mode === 'host' ? (
          <HostMenuItems />
        ) : role === 'SPACE_OWNER' && mode === 'guest' ? (
          <SpaceOwnerInGuestMenuItems />
        ) : (
          <GuestMenuItems />
        )}
      </div>
    </details>
  );
}

// ── Shared header block ──────────────────────────────────────────

function UserMenuHeader({
  displayName,
  email,
}: {
  displayName: string;
  email: string;
}) {
  return (
    <div className="user-menu-header" data-testid="user-menu-header">
      <div className="user-menu-header-name">{displayName}</div>
      <div className="user-menu-header-email">{email}</div>
    </div>
  );
}

// ── GUEST (pure) ─────────────────────────────────────────────────

function GuestMenuItems() {
  return (
    <>
      <Link
        href="/my-bookings"
        role="menuitem"
        className="user-menu-link"
        data-testid="user-menu-bookings"
      >
        <Calendar size={15} aria-hidden="true" />
        My bookings
      </Link>
      <Link
        href="/become-a-host"
        role="menuitem"
        className="user-menu-link"
        data-testid="user-menu-become-host"
      >
        <Sparkles size={15} aria-hidden="true" />
        Become a host
      </Link>
      <Link
        href="/account"
        role="menuitem"
        className="user-menu-link"
        data-testid="user-menu-account"
      >
        <Settings size={15} aria-hidden="true" />
        Account
      </Link>
      <LogoutForm />
    </>
  );
}

// ── SPACE_OWNER in Guest mode ────────────────────────────────────
// Replaces "Become a host" with "Switch to hosting" per Round 3 Gap A.

function SpaceOwnerInGuestMenuItems() {
  return (
    <>
      <Link
        href="/my-bookings"
        role="menuitem"
        className="user-menu-link"
        data-testid="user-menu-bookings"
      >
        <Calendar size={15} aria-hidden="true" />
        My bookings
      </Link>
      <SwitchModeForm
        targetMode="host"
        label="Switch to hosting"
        Icon={Briefcase}
        testid="user-menu-switch-hosting"
      />
      <Link
        href="/account"
        role="menuitem"
        className="user-menu-link"
        data-testid="user-menu-account"
      >
        <Settings size={15} aria-hidden="true" />
        Account
      </Link>
      <LogoutForm />
    </>
  );
}

// ── SPACE_OWNER in Host mode ─────────────────────────────────────
// Prototype DeskHive_Prototype.html lines 592-596 spec the host
// menu as Host dashboard / Payouts / Account / Sign out. The
// prototype omits switch-to-traveling because it has a separate
// role-switcher pill in the header; Round 3 explicitly forbids
// adding that pill (hard constraint), so Switch-to-traveling stays
// in the dropdown as a 5th item — without it, a SPACE_OWNER stuck
// in Host mode would have no path back to traveling.

function HostMenuItems() {
  return (
    <>
      <Link
        href="/owner"
        role="menuitem"
        className="user-menu-link"
        data-testid="user-menu-host-dashboard"
      >
        <LayoutDashboard size={15} aria-hidden="true" />
        Host dashboard
      </Link>
      <Link
        href="/owner/payouts"
        role="menuitem"
        className="user-menu-link"
        data-testid="user-menu-payouts"
      >
        <Banknote size={15} aria-hidden="true" />
        Payouts
      </Link>
      <Link
        href="/account"
        role="menuitem"
        className="user-menu-link"
        data-testid="user-menu-account"
      >
        <Settings size={15} aria-hidden="true" />
        Account
      </Link>
      <SwitchModeForm
        targetMode="guest"
        label="Switch to traveling"
        Icon={Briefcase}
        testid="user-menu-switch-traveling"
      />
      <LogoutForm />
    </>
  );
}

// ── SUPER_ADMIN ──────────────────────────────────────────────────
// Pre-Round-3 minimal — Round 3 scope did not call for admin
// dropdown changes, so this stays at the smaller surface.

function AdminMenuItems() {
  return (
    <>
      <Link
        href="/account"
        role="menuitem"
        className="user-menu-link"
        data-testid="user-menu-account"
      >
        <Settings size={15} aria-hidden="true" />
        Account
      </Link>
      <LogoutForm />
    </>
  );
}

// ── Form-submit menu items ───────────────────────────────────────

function SwitchModeForm({
  targetMode,
  label,
  Icon,
  testid,
}: {
  targetMode: Mode;
  label: string;
  Icon: typeof Briefcase;
  testid: string;
}) {
  const [, formAction] = useActionState(switchModeAction, initialSwitchState);
  return (
    <form action={formAction} className="user-menu-item">
      <input type="hidden" name="targetMode" value={targetMode} />
      <SwitchModeSubmit label={label} Icon={Icon} testid={testid} />
    </form>
  );
}

function SwitchModeSubmit({
  label,
  Icon,
  testid,
}: {
  label: string;
  Icon: typeof Briefcase;
  testid: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      role="menuitem"
      className="user-menu-button"
      disabled={pending}
      aria-disabled={pending || undefined}
      data-testid={testid}
    >
      <Icon size={15} aria-hidden="true" />
      {pending ? 'Switching…' : label}
    </button>
  );
}

function LogoutForm() {
  return (
    <form action={logoutAction} className="user-menu-item">
      <LogoutSubmit />
    </form>
  );
}

function LogoutSubmit() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      role="menuitem"
      className="user-menu-button"
      disabled={pending}
      aria-disabled={pending || undefined}
      data-testid="user-menu-signout"
    >
      <LogOut size={15} aria-hidden="true" />
      {pending ? 'Signing out…' : 'Sign out'}
    </button>
  );
}

