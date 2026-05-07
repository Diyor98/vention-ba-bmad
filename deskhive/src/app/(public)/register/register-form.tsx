'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { registerAction, type RegisterActionState } from '@/actions/auth';

const initialState: RegisterActionState = { status: 'idle' };

export function RegisterForm() {
  const [state, formAction] = useActionState(registerAction, initialState);

  const fieldError = (name: string) =>
    state.status === 'error' && state.code === 'VALIDATION_ERROR'
      ? state.fields[name]
      : undefined;

  const topLevelError =
    state.status === 'error' && 'message' in state ? state.message : undefined;

  return (
    <form action={formAction} noValidate>
      <div className="mb-4">
        <label htmlFor="reg-name" className="field-label">
          Full name
        </label>
        <input
          id="reg-name"
          name="fullName"
          type="text"
          autoComplete="name"
          required
          className="input"
          placeholder="Ada Lovelace"
          aria-invalid={fieldError('fullName') ? true : undefined}
        />
        {fieldError('fullName') && (
          <p className="field-error">{fieldError('fullName')}</p>
        )}
      </div>

      <div className="mb-4">
        <label htmlFor="reg-email" className="field-label">
          Email
        </label>
        <input
          id="reg-email"
          name="email"
          type="email"
          autoComplete="email"
          required
          className="input"
          placeholder="you@company.com"
          aria-describedby="reg-email-help"
          aria-invalid={fieldError('email') ? true : undefined}
        />
        <p id="reg-email-help" className="field-help">
          We&apos;ll only email you about your bookings.
        </p>
        {fieldError('email') && (
          <p className="field-error">{fieldError('email')}</p>
        )}
      </div>

      <div className="mb-6">
        <label htmlFor="reg-password" className="field-label">
          Password
        </label>
        <input
          id="reg-password"
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={8}
          required
          className="input"
          placeholder="At least 8 characters"
          aria-describedby="reg-password-help"
          aria-invalid={fieldError('password') ? true : undefined}
        />
        <p id="reg-password-help" className="field-help">
          8+ characters. No other rules — keep it strong.
        </p>
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
      {pending ? 'Creating account…' : 'Create account'}
    </button>
  );
}
