'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { editSpaceAction, type EditSpaceActionState } from '@/actions/space';
import type { Space } from '@/db/schema';

const initialState: EditSpaceActionState = { status: 'idle' };

export function EditSpaceForm({ space }: { space: Space }) {
  // .bind(null, space.id) curries the id into the action; the bound function
  // has the (prevState, formData) shape useActionState expects.
  const [state, formAction] = useActionState(
    editSpaceAction.bind(null, space.id),
    initialState,
  );

  const fieldError = (name: string) =>
    state.status === 'error' && state.code === 'VALIDATION_ERROR'
      ? state.fields[name]
      : undefined;

  const topLevelError =
    state.status === 'error' && 'message' in state ? state.message : undefined;

  return (
    <form action={formAction} className="space-y-4" noValidate>
      <div>
        <label htmlFor="name" className="mb-1 block text-sm font-medium">
          Name
        </label>
        <input
          id="name"
          name="name"
          type="text"
          required
          defaultValue={space.name}
          className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
        />
        {fieldError('name') && (
          <p className="mt-1 text-sm text-red-700">{fieldError('name')}</p>
        )}
      </div>

      <div>
        <label htmlFor="city" className="mb-1 block text-sm font-medium">
          City
        </label>
        <input
          id="city"
          name="city"
          type="text"
          required
          defaultValue={space.city}
          className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
        />
        {fieldError('city') && (
          <p className="mt-1 text-sm text-red-700">{fieldError('city')}</p>
        )}
      </div>

      <div>
        <label htmlFor="addressLine" className="mb-1 block text-sm font-medium">
          Address
        </label>
        <input
          id="addressLine"
          name="addressLine"
          type="text"
          required
          defaultValue={space.addressLine}
          className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
        />
        {fieldError('addressLine') && (
          <p className="mt-1 text-sm text-red-700">{fieldError('addressLine')}</p>
        )}
      </div>

      <div>
        <label htmlFor="description" className="mb-1 block text-sm font-medium">
          Description
        </label>
        <textarea
          id="description"
          name="description"
          rows={4}
          required
          defaultValue={space.description}
          className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
        />
        {fieldError('description') && (
          <p className="mt-1 text-sm text-red-700">{fieldError('description')}</p>
        )}
      </div>

      <div>
        <label htmlFor="primaryImageUrl" className="mb-1 block text-sm font-medium">
          Image URL
        </label>
        <input
          id="primaryImageUrl"
          name="primaryImageUrl"
          type="url"
          required
          defaultValue={space.primaryImageUrl}
          className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
        />
        {fieldError('primaryImageUrl') && (
          <p className="mt-1 text-sm text-red-700">{fieldError('primaryImageUrl')}</p>
        )}
      </div>

      {topLevelError && state.status === 'error' && state.code !== 'VALIDATION_ERROR' && (
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
      {pending ? 'Saving…' : 'Save'}
    </button>
  );
}
