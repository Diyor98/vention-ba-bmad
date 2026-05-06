'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { editDeskAction, type EditDeskActionState } from '@/actions/desk';
import type { Desk } from '@/db/schema';

const initialState: EditDeskActionState = { status: 'idle' };

export function EditDeskForm({ desk }: { desk: Desk }) {
  const [state, formAction] = useActionState(
    editDeskAction.bind(null, desk.id),
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
    <form action={formAction} className="border-b border-gray-200 py-3" noValidate>
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <input
          name="label"
          type="text"
          defaultValue={desk.label}
          required
          aria-label="Label"
          className="flex-1 min-w-[8rem] rounded border border-gray-300 px-2 py-1"
        />
        <input
          name="dailyPriceCents"
          type="number"
          step="1"
          min="0"
          defaultValue={desk.dailyPriceCents}
          required
          aria-label="Daily price (cents)"
          className="w-32 rounded border border-gray-300 px-2 py-1"
        />
        <label className="flex items-center gap-1">
          <input
            name="isActive"
            type="checkbox"
            defaultChecked={desk.isActive}
          />
          Active
        </label>
        <SubmitButton />
      </div>

      {(fieldError('label') ||
        fieldError('dailyPriceCents') ||
        fieldError('isActive')) && (
        <div className="mt-2 space-y-1">
          {fieldError('label') && (
            <p className="text-sm text-red-700">{fieldError('label')}</p>
          )}
          {fieldError('dailyPriceCents') && (
            <p className="text-sm text-red-700">{fieldError('dailyPriceCents')}</p>
          )}
          {fieldError('isActive') && (
            <p className="text-sm text-red-700">{fieldError('isActive')}</p>
          )}
        </div>
      )}

      {topLevelError && (
        <p className="mt-2 text-sm text-red-700" role="alert">
          {topLevelError}
        </p>
      )}
    </form>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded bg-gray-900 px-3 py-1 text-sm font-medium text-white disabled:opacity-50"
    >
      {pending ? 'Saving…' : 'Save'}
    </button>
  );
}
