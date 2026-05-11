'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import {
  confirmBookingAction,
  type ConfirmBookingActionState,
} from '@/actions/booking';

const initialState: ConfirmBookingActionState = { status: 'idle' };

// Inline action button used inside the admin Bookings table row. The
// underlying Server Action (US-4.2) is unchanged — only the visual
// treatment switched to .btn-xs.btn-confirm per Story 5-2 design.
export function ConfirmBookingButton({ bookingId }: { bookingId: string }) {
  const [state, formAction] = useActionState(confirmBookingAction, initialState);
  const errorMessage = state.status === 'error' ? state.message : undefined;

  return (
    <form action={formAction} style={{ display: 'inline-flex' }}>
      <input type="hidden" name="bookingId" value={bookingId} />
      <SubmitButton />
      {errorMessage && (
        <span className="field-error" role="alert" style={{ marginLeft: '0.5rem' }}>
          {errorMessage}
        </span>
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
      className="btn-xs btn-confirm"
    >
      {pending ? 'Confirming…' : 'Confirm'}
    </button>
  );
}
