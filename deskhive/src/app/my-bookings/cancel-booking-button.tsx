'use client';

import { useActionState, useEffect, useRef } from 'react';
import { useFormStatus } from 'react-dom';
import {
  cancelBookingAction,
  type CancelBookingActionState,
} from '@/actions/booking';
import { toastSuccess, TOAST_COPY } from '@/lib/toast';

const initialState: CancelBookingActionState = { status: 'idle' };

export function CancelBookingButton({ bookingId }: { bookingId: string }) {
  const [state, formAction] = useActionState(cancelBookingAction, initialState);
  const errorMessage = state.status === 'error' ? state.message : undefined;

  // Story 6-3 (BA Decisions §10): toast on successful cancel. State-identity
  // ref guards against React 19 Strict Mode effect double-fire and against
  // re-firing on unrelated re-renders.
  const lastFiredState = useRef<CancelBookingActionState | null>(null);
  useEffect(() => {
    if (state.status !== 'success') return;
    if (lastFiredState.current === state) return;
    lastFiredState.current = state;
    toastSuccess(TOAST_COPY.CANCEL_SUCCESS);
  }, [state]);

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
