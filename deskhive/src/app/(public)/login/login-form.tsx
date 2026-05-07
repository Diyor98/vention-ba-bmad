'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { loginAction, type LoginActionState } from '@/actions/auth';

const initialState: LoginActionState = { status: 'idle' };

export function LoginForm({ callbackUrl }: { callbackUrl?: string }) {
  const [state, formAction] = useActionState(loginAction, initialState);

  const fieldError = (name: string) =>
    state.status === 'error' && state.code === 'VALIDATION_ERROR'
      ? state.fields[name]
      : undefined;

  const topLevelError =
    state.status === 'error' && 'message' in state ? state.message : undefined;

  return (
    <form action={formAction} noValidate>
      <input type="hidden" name="callbackUrl" value={callbackUrl ?? ''} />

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
