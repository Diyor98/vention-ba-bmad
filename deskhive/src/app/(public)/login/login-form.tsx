'use client';

import { useActionState, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { loginAction, type LoginActionState } from '@/actions/auth';

const initialState: LoginActionState = { status: 'idle' };

// Story 5-2 design (04-login.html v2) adds a Guest/Admin role-selector
// segmented control above the email field. **The selection is COSMETIC ONLY**
// — it lives in component-local state and is NOT submitted with the form.
// Better Auth continues to determine the user's role from the user record
// server-side. Selecting "Admin" then logging in with a Guest credential
// still logs the user in as Guest (Phase 1 verification §9). If product
// decides it should become functional (e.g. separate admin login URL), revisit
// in a follow-up story per BA Decisions §8 (open question pending Makhbuba).
type Role = 'guest' | 'admin';

export function LoginForm({ callbackUrl }: { callbackUrl?: string }) {
  const [state, formAction] = useActionState(loginAction, initialState);
  const [role, setRole] = useState<Role>('guest');

  const fieldError = (name: string) =>
    state.status === 'error' && state.code === 'VALIDATION_ERROR'
      ? state.fields[name]
      : undefined;

  const topLevelError =
    state.status === 'error' && 'message' in state ? state.message : undefined;

  return (
    <form action={formAction} noValidate>
      <input type="hidden" name="callbackUrl" value={callbackUrl ?? ''} />

      {/* Role selector — purely visual, not in form payload. */}
      <div className="role-seg" role="group" aria-label="Sign in as">
        <button
          type="button"
          data-role="guest"
          aria-pressed={role === 'guest'}
          onClick={() => setRole('guest')}
        >
          <span className="role-icon" aria-hidden="true">
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="12" cy="8" r="4" />
              <path d="M4 21a8 8 0 0 1 16 0" />
            </svg>
          </span>
          <span className="role-text">
            <span>Guest</span>
            <span className="sub">Book a desk</span>
          </span>
        </button>
        <button
          type="button"
          data-role="admin"
          aria-pressed={role === 'admin'}
          onClick={() => setRole('admin')}
        >
          <span className="role-icon" aria-hidden="true">
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M12 2 4 5v7c0 5 3.5 8.5 8 10 4.5-1.5 8-5 8-10V5l-8-3Z" />
            </svg>
          </span>
          <span className="role-text">
            <span>Admin</span>
            <span className="sub">Manage spaces</span>
          </span>
        </button>
      </div>

      <div className="mb-4">
        <label htmlFor="login-email" className="field-label">
          Email
        </label>
        <input
          id="login-email"
          name="email"
          type="email"
          autoComplete="email"
          required
          className="input"
          placeholder="you@company.com"
          aria-invalid={fieldError('email') ? true : undefined}
        />
        {fieldError('email') && (
          <p className="field-error">{fieldError('email')}</p>
        )}
      </div>

      <div className="mb-6">
        <label htmlFor="login-password" className="field-label">
          Password
        </label>
        <input
          id="login-password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className="input"
          placeholder="Your password"
          aria-invalid={fieldError('password') ? true : undefined}
        />
        {fieldError('password') && (
          <p className="field-error">{fieldError('password')}</p>
        )}
      </div>

      {topLevelError && (
        <p className="field-error mb-4" role="alert">
          {topLevelError}
        </p>
      )}

      <SubmitButton />
    </form>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      aria-disabled={pending || undefined}
      className="btn btn-primary"
      style={{ width: '100%' }}
    >
      {pending ? 'Signing in…' : 'Log in'}
    </button>
  );
}
