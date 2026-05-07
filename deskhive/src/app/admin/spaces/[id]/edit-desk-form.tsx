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
    <form
      action={formAction}
      noValidate
      style={{
        borderBottom: '1px solid var(--color-border)',
        padding: '0.75rem 0',
      }}
    >
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <input
          name="label"
          type="text"
          defaultValue={desk.label}
          required
          aria-label="Label"
          aria-invalid={fieldError('label') ? true : undefined}
          className="input"
          style={{ flex: 1, minWidth: '8rem', height: '2.25rem' }}
        />
        <input
          name="dailyPriceCents"
          type="number"
          step="1"
          min="0"
          defaultValue={desk.dailyPriceCents}
          required
          aria-label="Daily price (cents)"
          aria-invalid={fieldError('dailyPriceCents') ? true : undefined}
          className="input tnum"
          style={{ width: '8rem', height: '2.25rem' }}
        />
        <label className="flex items-center gap-1" style={{ fontSize: '13px' }}>
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
            <p className="field-error">{fieldError('label')}</p>
          )}
          {fieldError('dailyPriceCents') && (
            <p className="field-error">{fieldError('dailyPriceCents')}</p>
          )}
          {fieldError('isActive') && (
            <p className="field-error">{fieldError('isActive')}</p>
          )}
        </div>
      )}

      {topLevelError && (
        <p className="field-error mt-2" role="alert">
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
      aria-disabled={pending || undefined}
      className="btn btn-secondary btn-sm"
    >
      {pending ? 'Saving…' : 'Save'}
    </button>
  );
}
