'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { createDeskAction, type CreateDeskActionState } from '@/actions/desk';

const initialState: CreateDeskActionState = { status: 'idle' };

// Story 5-2 reskin: .add-desk-row layout from admin.css.
// Story 6-1: price input accepts dollars (e.g. "25" or "25.50"). The
// schema renames `dailyPriceDollars` → `dailyPriceCents` at the seam.
// Server-side behavior preserved (verbatim duplicate-label error from
// US-2.3 follow-up commit 12bee8b is unchanged).
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
    <form action={formAction} noValidate>
      <div className="add-desk-row">
        <input
          name="label"
          type="text"
          required
          placeholder="Label (e.g. Desk 8)"
          aria-label="Label"
          aria-invalid={fieldError('label') ? true : undefined}
          className="input"
        />
        <div>
          <input
            name="dailyPriceDollars"
            type="text"
            inputMode="decimal"
            pattern="^\d{1,5}(?:\.\d{1,2})?$"
            required
            placeholder="25.00"
            aria-label="Daily price"
            aria-invalid={fieldError('dailyPriceDollars') ? true : undefined}
            className="input tnum"
          />
          <p className="field-help" style={{ marginTop: '0.25rem' }}>
            In USD. Example: 25 or 25.50
          </p>
        </div>
        <SubmitButton />
      </div>

      {(fieldError('label') ||
        fieldError('dailyPriceDollars') ||
        topLevelError) && (
        <div style={{ padding: '0.5rem 1rem' }}>
          {fieldError('label') && (
            <p className="field-error">{fieldError('label')}</p>
          )}
          {fieldError('dailyPriceDollars') && (
            <p className="field-error">{fieldError('dailyPriceDollars')}</p>
          )}
          {topLevelError && (
            <p className="field-error" role="alert">
              {topLevelError}
            </p>
          )}
        </div>
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
      className="btn btn-primary btn-sm"
      style={{ height: '2rem' }}
    >
      {pending ? 'Adding…' : 'Add desk'}
    </button>
  );
}
