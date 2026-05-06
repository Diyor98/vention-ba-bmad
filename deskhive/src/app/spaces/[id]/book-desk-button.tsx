'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import {
  createBookingAction,
  type CreateBookingActionState,
} from '@/actions/booking';

const initialState: CreateBookingActionState = { status: 'idle' };

export function BookDeskButton({
  spaceId,
  deskId,
  bookingDate,
  enabled,
}: {
  spaceId: string;
  deskId: string;
  bookingDate: string | undefined;
  enabled: boolean;
}) {
  const [state, formAction] = useActionState(createBookingAction, initialState);

  const errorMessage =
    state.status === 'error'
      ? state.code === 'VALIDATION_ERROR'
        ? Object.values(state.fields)[0] ?? 'Invalid input'
        : state.message
      : undefined;

  return (
    <div>
      <form action={formAction}>
        <input type="hidden" name="spaceId" value={spaceId} />
        <input type="hidden" name="deskId" value={deskId} />
        <input type="hidden" name="bookingDate" value={bookingDate ?? ''} />
        <SubmitButton disabled={!enabled} />
      </form>
      {errorMessage && (
        <p className="mt-1 text-sm text-red-700" role="alert">
          {errorMessage}
        </p>
      )}
    </div>
  );
}

function SubmitButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={disabled || pending}
      className="rounded bg-gray-900 px-3 py-1 text-sm font-medium text-white disabled:opacity-50"
    >
      {pending ? 'Booking…' : 'Book this desk'}
    </button>
  );
}
