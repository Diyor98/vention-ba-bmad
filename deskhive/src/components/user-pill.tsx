'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { logoutAction } from '@/actions/auth';
import {
  switchModeAction,
  type SwitchModeActionState,
} from '@/actions/mode';
import type { Mode } from '@/lib/mode';

const initialSwitchState: SwitchModeActionState = { status: 'idle' };

/**
 * Story 7-1: user-pill dropdown affordance.
 *
 * Renders the small `<details>` dropdown that hosts:
 *   - "Switch to hosting" / "Switch to traveling" (SPACE_OWNER only)
 *   - "Log out" (all authenticated roles)
 *
 * Dev-agent decision documented in Completion Notes: dropdown applies to
 * ALL authenticated roles, not just SPACE_OWNER. Keeps the affordance
 * home consistent across roles — Log out moves from the inline pattern
 * (Phase 1) into the dropdown. The BA's optional path per Decision §6.
 *
 * The component is keyed off `role` + `mode` props — both come from the
 * Server Component parent (Header), which reads them server-side via
 * `effectiveMode(session)`.
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
  const isSpaceOwner = role === 'SPACE_OWNER';
  const targetMode: Mode = mode === 'host' ? 'guest' : 'host';
  const switchLabel =
    mode === 'host' ? 'Switch to traveling' : 'Switch to hosting';

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
        <p className="user-menu-meta">
          Signed in as <span className="user-menu-email">{email}</span>
        </p>

        {isSpaceOwner && <SwitchModeForm targetMode={targetMode} label={switchLabel} />}

        <LogoutForm />
      </div>
    </details>
  );
}

function SwitchModeForm({
  targetMode,
  label,
}: {
  targetMode: Mode;
  label: string;
}) {
  const [, formAction] = useActionState(switchModeAction, initialSwitchState);
  return (
    <form action={formAction} className="user-menu-item">
      <input type="hidden" name="targetMode" value={targetMode} />
      <SwitchModeSubmit label={label} />
    </form>
  );
}

function SwitchModeSubmit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      role="menuitem"
      className="user-menu-button"
      disabled={pending}
      aria-disabled={pending || undefined}
    >
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
    >
      {pending ? 'Signing out…' : 'Log out'}
    </button>
  );
}
