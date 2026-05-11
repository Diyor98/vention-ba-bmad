'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { createDeskAction, type CreateDeskActionState } from '@/actions/desk';

const initialState: CreateDeskActionState = { status: 'idle' };

// Story 5-2 reskin: .add-desk-row layout from admin.css. Server-side
// behavior unchanged from US-2.3 (incl. verbatim duplicate-label error
// from the 12bee8b follow-up commit, surfaced via .field-error below).
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
        <input
          name="dailyPriceCents"
          type="number"
          step="1"
          min="0"
          required
          placeholder="Daily price (cents)"
          aria-label="Daily price (cents)"
          aria-invalid={fieldError('dailyPriceCents') ? true : undefined}
          className="input tnum"
        />
        <SubmitButton />
      </div>

      {(fieldError('label') ||
        fieldError('dailyPriceCents') ||
        topLevelError) && (
        <div style={{ padding: '0.5rem 1rem' }}>
          {fieldError('label') && (
            <p className="field-error">{fieldError('label')}</p>
          )}
          {fieldError('dailyPriceCents') && (
            <p className="field-error">{fieldError('dailyPriceCents')}</p>
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
