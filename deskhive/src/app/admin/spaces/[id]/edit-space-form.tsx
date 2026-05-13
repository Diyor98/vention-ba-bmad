'use client';

import { useActionState, useEffect, useRef } from 'react';
import { useFormStatus } from 'react-dom';
import { useRouter } from 'next/navigation';
import { editSpaceAction, type EditSpaceActionState } from '@/actions/space';
import type { Space } from '@/db/schema';

const initialState: EditSpaceActionState = { status: 'idle' };

// Story 7-5: same `variant` prop pattern as <CreateSpaceForm>. Action
// returns success state; the form decides where to navigate. No toast on
// edit success in either variant — Phase 1 parity.
export function EditSpaceForm({
  space,
  variant = 'admin',
}: {
  space: Space;
  variant?: 'admin' | 'owner';
}) {
  const [state, formAction] = useActionState(
    editSpaceAction.bind(null, space.id),
    initialState,
  );
  const router = useRouter();
  const lastHandledRef = useRef<EditSpaceActionState | null>(null);

  useEffect(() => {
    if (state.status !== 'success') return;
    if (lastHandledRef.current === state) return;
    lastHandledRef.current = state;
    router.push(variant === 'owner' ? '/owner/spaces' : '/admin/spaces');
  }, [state, router, variant]);

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
          defaultValue={space.name}
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
          defaultValue={space.city}
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
          defaultValue={space.addressLine}
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
          defaultValue={space.description}
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
          defaultValue={space.primaryImageUrl}
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
