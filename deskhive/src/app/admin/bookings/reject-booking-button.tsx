'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import {
  rejectBookingAction,
  type RejectBookingActionState,
} from '@/actions/booking';

const initialState: RejectBookingActionState = { status: 'idle' };

export function RejectBookingButton({ bookingId }: { bookingId: string }) {
  const [state, formAction] = useActionState(rejectBookingAction, initialState);
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
      className="rounded border border-red-300 px-3 py-1 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
    >
      {pending ? 'Rejecting…' : 'Reject'}
    </button>
  );
}
