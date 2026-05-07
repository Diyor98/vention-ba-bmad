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
        <p className="field-error" role="alert">
          {errorMessage}
        </p>
      )}
    </div>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();
  // Outlined-red variant for destructive intent — kept inline (no .btn class)
  // because shared.css doesn't ship a `.btn-danger` variant. The `.btn-ghost`
  // base would lose the red palette. Phase 2 / Story 5-2 admin reskin can
  // formalize a `.btn-danger-outline` if needed.
  return (
    <button
      type="submit"
      disabled={pending}
      aria-disabled={pending || undefined}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '2.25rem',
        padding: '0 0.875rem',
        fontSize: '14px',
        fontWeight: 500,
        borderRadius: 'var(--radius-md)',
        border: '1px solid #FCA5A5',
        color: '#B91C1C',
        background: 'transparent',
        cursor: pending ? 'not-allowed' : 'pointer',
        opacity: pending ? 0.5 : 1,
        whiteSpace: 'nowrap',
      }}
    >
      {pending ? 'Rejecting…' : 'Reject'}
    </button>
  );
}
