'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { loginAction, type LoginActionState } from '@/actions/auth';

const initialState: LoginActionState = { status: 'idle' };

export function LoginForm() {
  const [state, formAction] = useActionState(loginAction, initialState);

  const fieldError = (name: string) =>
    state.status === 'error' && state.code === 'VALIDATION_ERROR'
      ? state.fields[name]
      : undefined;

  const topLevelError =
    state.status === 'error' && 'message' in state ? state.message : undefined;

  return (
    <form action={formAction} className="space-y-4" noValidate>
      <div>
        <label htmlFor="email" className="block text-sm font-medium mb-1">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
        />
        {fieldError('email') && (
          <p className="mt-1 text-sm text-red-700">{fieldError('email')}</p>
        )}
      </div>

      <div>
        <label htmlFor="password" className="block text-sm font-medium mb-1">
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
        />
        {fieldError('password') && (
          <p className="mt-1 text-sm text-red-700">{fieldError('password')}</p>
        )}
      </div>

      {topLevelError && (
        <p className="text-sm text-red-700" role="alert">
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
      className="w-full rounded bg-gray-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
    >
      {pending ? 'Signing in…' : 'Log in'}
    </button>
  );
}
