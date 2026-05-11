'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import {
  rejectBookingAction,
  type RejectBookingActionState,
} from '@/actions/booking';

const initialState: RejectBookingActionState = { status: 'idle' };

// Inline action button used inside the admin Bookings table row. Story 5-2
// formalized the .btn-xs.btn-reject variant in admin.css — replaces the
// per-component inline-style approach from US-4.3.
export function RejectBookingButton({ bookingId }: { bookingId: string }) {
  const [state, formAction] = useActionState(rejectBookingAction, initialState);
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
      className="btn-xs btn-reject"
    >
      {pending ? 'Rejecting…' : 'Reject'}
    </button>
  );
}
