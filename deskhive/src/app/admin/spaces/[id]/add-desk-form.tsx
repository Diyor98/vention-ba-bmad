'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { createDeskAction, type CreateDeskActionState } from '@/actions/desk';

const initialState: CreateDeskActionState = { status: 'idle' };

export function AddDeskForm({ spaceId }: { spaceId: string }) {
  const [state, formAction] = useActionState(
    createDeskAction.bind(null, spaceId),
    initialState,
  );

  const fieldError = (name: string) =>
    state.status === 'error' && state.code === 'VALIDATION_ERROR'
      ? state.fields[name]
      : undefined;

  const topLevelError =
    state.status === 'error' &&
    state.code !== 'VALIDATION_ERROR' &&
    'message' in state
      ? state.message
      : undefined;

  return (
    <form action={formAction} className="space-y-4" noValidate>
      <div>
        <label htmlFor="label" className="mb-1 block text-sm font-medium">
          Label
        </label>
        <input
          id="label"
          name="label"
          type="text"
          required
          className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
        />
        {fieldError('label') && (
          <p className="mt-1 text-sm text-red-700">{fieldError('label')}</p>
        )}
      </div>

      <div>
        <label htmlFor="dailyPriceCents" className="mb-1 block text-sm font-medium">
          Daily price (cents)
        </label>
        <input
          id="dailyPriceCents"
          name="dailyPriceCents"
          type="number"
          step="1"
          min="0"
          required
          className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
        />
        {fieldError('dailyPriceCents') && (
          <p className="mt-1 text-sm text-red-700">{fieldError('dailyPriceCents')}</p>
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
      className="rounded bg-gray-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
    >
      {pending ? 'Adding…' : 'Add desk'}
    </button>
  );
}
