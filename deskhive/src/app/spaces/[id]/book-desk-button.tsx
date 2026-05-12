'use client';

import { useActionState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useFormStatus } from 'react-dom';
import {
  createBookingAction,
  type CreateBookingActionState,
} from '@/actions/booking';
import { toastSuccess, toastError, TOAST_COPY } from '@/lib/toast';

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
  const router = useRouter();

  // Story 6-3 (BA revision 2026-05-12): success + error toasts fire here
  // on /spaces/[id]. The Server Action returns a success state instead of
  // redirecting, so the toast appears in the action context. The "View in
  // My Bookings" action button is a real navigation, not a soft no-op.
  //
  // The useRef state-identity guard handles both React 19 Strict Mode
  // (effect double-invocation in dev) and re-render stability — each new
  // state value fires its toast exactly once.
  const lastFiredState = useRef<CreateBookingActionState | null>(null);
  useEffect(() => {
    if (state.status === 'idle') return;
    if (lastFiredState.current === state) return;
    lastFiredState.current = state;

    if (state.status === 'success') {
      toastSuccess(TOAST_COPY.BOOKING_SUCCESS_TITLE, {
        description: TOAST_COPY.BOOKING_SUCCESS_DESCRIPTION,
        action: {
          label: TOAST_COPY.BOOKING_SUCCESS_ACTION_LABEL,
          onClick: () => router.push('/my-bookings'),
        },
      });
      return;
    }

    // state.status === 'error' — map code to a specific description.
    toastError(TOAST_COPY.BOOKING_FAILED_TITLE, errorDescription(state));
  }, [state, router]);

  return (
    <form action={formAction}>
      <input type="hidden" name="spaceId" value={spaceId} />
      <input type="hidden" name="deskId" value={deskId} />
      <input type="hidden" name="bookingDate" value={bookingDate ?? ''} />
      <SubmitButton disabled={!enabled} />
    </form>
  );
}

// Maps each error code to its specific toast description per BA Decisions §5.
// VALIDATION_ERROR surfaces the first field error string from the action's
// `fields` record (matches the prior inline-error logic).
function errorDescription(state: CreateBookingActionState): string {
  if (state.status !== 'error') return TOAST_COPY.BOOKING_FAILED_GENERIC;
  switch (state.code) {
    case 'DOUBLE_BOOKING':
      return TOAST_COPY.BOOKING_FAILED_DOUBLE_BOOKING;
    case 'PAST_DATE':
      return TOAST_COPY.BOOKING_FAILED_PAST_DATE;
    case 'DESK_NOT_FOUND':
      return TOAST_COPY.BOOKING_FAILED_DESK_NOT_FOUND;
    case 'VALIDATION_ERROR':
      return Object.values(state.fields)[0] ?? TOAST_COPY.BOOKING_FAILED_GENERIC;
    case 'FORBIDDEN':
      return state.message;
    case 'INTERNAL_ERROR':
    default:
      return TOAST_COPY.BOOKING_FAILED_GENERIC;
  }
}

function SubmitButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  const isDisabled = disabled || pending;
  return (
    <button
      type="submit"
      disabled={isDisabled}
      aria-disabled={isDisabled || undefined}
      className="btn btn-primary"
    >
      {pending ? 'Booking…' : 'Book this desk'}
    </button>
  );
}
