'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import {
  cancelBookingAction,
  type CancelBookingActionState,
} from '@/actions/booking';

const initialState: CancelBookingActionState = { status: 'idle' };

export function CancelBookingButton({ bookingId }: { bookingId: string }) {
  const [state, formAction] = useActionState(cancelBookingAction, initialState);
  const errorMessage = state.status === 'error' ? state.message : undefined;

  return (
    <div className="flex flex-col items-end gap-1">
      <form action={formAction}>
        <input type="hidden" name="bookingId" value={bookingId} />
        <SubmitButton />
      </form>
      {errorMessage && (
        <p className="field-error" role="alert">
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
      aria-disabled={pending || undefined}
      className="btn-ghost"
    >
      {pending ? 'Cancelling…' : 'Cancel request'}
    </button>
  );
}
