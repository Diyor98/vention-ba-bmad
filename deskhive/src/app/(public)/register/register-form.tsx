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
        <label htmlFor="fullName" className="block text-sm font-medium mb-1">
          Full name
        </label>
        <input
          id="fullName"
          name="fullName"
          type="text"
          autoComplete="name"
          required
          className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
        />
        {fieldError('fullName') && (
          <p className="mt-1 text-sm text-red-700">{fieldError('fullName')}</p>
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
          autoComplete="new-password"
          minLength={8}
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
      {pending ? 'Creating account…' : 'Create account'}
    </button>
  );
}
