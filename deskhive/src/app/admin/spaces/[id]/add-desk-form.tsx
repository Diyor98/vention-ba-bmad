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
        <label htmlFor="label" className="field-label">
          Label
        </label>
        <input
          id="label"
          name="label"
          type="text"
          required
          className="input"
          aria-invalid={fieldError('label') ? true : undefined}
        />
        {fieldError('label') && <p className="field-error">{fieldError('label')}</p>}
      </div>

      <div>
        <label htmlFor="dailyPriceCents" className="field-label">
          Daily price (cents)
        </label>
        <input
          id="dailyPriceCents"
          name="dailyPriceCents"
          type="number"
          step="1"
          min="0"
          required
          className="input tnum"
          aria-invalid={fieldError('dailyPriceCents') ? true : undefined}
        />
        {fieldError('dailyPriceCents') && (
          <p className="field-error">{fieldError('dailyPriceCents')}</p>
        )}
      </div>

      {topLevelError && (
        <p className="field-error" role="alert">
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
    >
      {pending ? 'Adding…' : 'Add desk'}
    </button>
  );
}
