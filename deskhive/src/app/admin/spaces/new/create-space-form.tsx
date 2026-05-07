'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { createSpaceAction, type CreateSpaceActionState } from '@/actions/space';

const initialState: CreateSpaceActionState = { status: 'idle' };

export function CreateSpaceForm() {
  const [state, formAction] = useActionState(createSpaceAction, initialState);

  const fieldError = (name: string) =>
    state.status === 'error' && state.code === 'VALIDATION_ERROR'
      ? state.fields[name]
      : undefined;

  const topLevelError =
    state.status === 'error' && 'message' in state ? state.message : undefined;

  return (
    <form action={formAction} className="space-y-4" noValidate>
      <div>
        <label htmlFor="name" className="field-label">
          Name
        </label>
        <input
          id="name"
          name="name"
          type="text"
          required
          className="input"
          aria-invalid={fieldError('name') ? true : undefined}
        />
        {fieldError('name') && <p className="field-error">{fieldError('name')}</p>}
      </div>

      <div>
        <label htmlFor="city" className="field-label">
          City
        </label>
        <input
          id="city"
          name="city"
          type="text"
          required
          className="input"
          aria-invalid={fieldError('city') ? true : undefined}
        />
        {fieldError('city') && <p className="field-error">{fieldError('city')}</p>}
      </div>

      <div>
        <label htmlFor="addressLine" className="field-label">
          Address
        </label>
        <input
          id="addressLine"
          name="addressLine"
          type="text"
          required
          className="input"
          aria-invalid={fieldError('addressLine') ? true : undefined}
        />
        {fieldError('addressLine') && (
          <p className="field-error">{fieldError('addressLine')}</p>
        )}
      </div>

      <div>
        <label htmlFor="description" className="field-label">
          Description
        </label>
        <textarea
          id="description"
          name="description"
          rows={4}
          required
          className="input"
          aria-invalid={fieldError('description') ? true : undefined}
        />
        {fieldError('description') && (
          <p className="field-error">{fieldError('description')}</p>
        )}
      </div>

      <div>
        <label htmlFor="primaryImageUrl" className="field-label">
          Image URL
        </label>
        <input
          id="primaryImageUrl"
          name="primaryImageUrl"
          type="url"
          required
          className="input"
          aria-invalid={fieldError('primaryImageUrl') ? true : undefined}
        />
        {fieldError('primaryImageUrl') && (
          <p className="field-error">{fieldError('primaryImageUrl')}</p>
        )}
      </div>

      {topLevelError && state.status === 'error' && state.code !== 'VALIDATION_ERROR' && (
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
      style={{ width: '100%' }}
    >
      {pending ? 'Saving…' : 'Save'}
    </button>
  );
}
