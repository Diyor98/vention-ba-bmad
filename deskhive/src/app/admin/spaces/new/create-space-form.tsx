'use client';

import { useActionState, useEffect, useRef } from 'react';
import { useFormStatus } from 'react-dom';
import { useRouter } from 'next/navigation';
import { createSpaceAction, type CreateSpaceActionState } from '@/actions/space';
import { AmenitiesForm } from '@/components/amenities';
import { TOAST_COPY, toastSuccess } from '@/lib/toast';

const initialState: CreateSpaceActionState = { status: 'idle' };

// Story 7-5: the same form Client Component is reused at
// `/admin/spaces/new` (variant 'admin', default) and `/owner/spaces/new`
// (variant 'owner'). The action returns success state with the new
// space's id; the variant decides where to navigate and whether to fire
// a toast.
//
//   - admin: router.push('/admin/spaces'); no toast (Phase 1 parity).
//   - owner: toastSuccess(SPACE_CREATED) + router.push(`/owner/spaces/${id}`)
//            so the owner lands on the edit page and adds desks next
//            (BA Decision §3).
//
// The success-effect uses the state-identity useRef guard from Stories
// 6-3 / 7-3 / 7-4 so navigation only fires once per state transition.
export function CreateSpaceForm({
  variant = 'admin',
}: {
  variant?: 'admin' | 'owner';
}) {
  const [state, formAction] = useActionState(createSpaceAction, initialState);
  const router = useRouter();
  const lastHandledRef = useRef<CreateSpaceActionState | null>(null);

  useEffect(() => {
    if (state.status !== 'success') return;
    if (lastHandledRef.current === state) return;
    lastHandledRef.current = state;
    if (variant === 'owner') {
      toastSuccess(TOAST_COPY.SPACE_CREATED_TITLE, {
        description: TOAST_COPY.SPACE_CREATED_DESCRIPTION,
      });
      router.push(`/owner/spaces/${state.spaceId}`);
    } else {
      router.push('/admin/spaces');
    }
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

      <div>
        <label className="field-label" htmlFor="amenities-fieldset">
          Amenities
        </label>
        <p className="field-help">Pick the amenities guests can rely on at this space.</p>
        <div id="amenities-fieldset" style={{ marginTop: '0.5rem' }}>
          <AmenitiesForm />
        </div>
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
