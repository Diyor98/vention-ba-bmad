'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import {
  confirmBookingAction,
  type ConfirmBookingActionState,
} from '@/actions/booking';

const initialState: ConfirmBookingActionState = { status: 'idle' };

export function ConfirmBookingButton({ bookingId }: { bookingId: string }) {
  const [state, formAction] = useActionState(confirmBookingAction, initialState);
  const errorMessage = state.status === 'error' ? state.message : undefined;

  return (
    <div className="flex flex-col items-end gap-1">
      <form action={formAction}>
        <input type="hidden" name="bookingId" value={bookingId} />
        <SubmitButton />
      </form>
      {errorMessage && (
        <p className="text-xs text-red-700" role="alert">
          {errorMessage}
        </p>
      )}
    </div>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded bg-gray-900 px-3 py-1 text-xs font-medium text-white disabled:opacity-50"
    >
      {pending ? 'Confirming…' : 'Confirm'}
    </button>
  );
}
