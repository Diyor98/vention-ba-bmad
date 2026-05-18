'use client';

import { useActionState, useEffect, useRef } from 'react';
import { useFormStatus } from 'react-dom';
import {
  createBookingWithPaymentAction,
  type CreateBookingWithPaymentActionState,
} from '@/actions/booking-with-payment';
import { toastError, TOAST_COPY } from '@/lib/toast';

const initialState: CreateBookingWithPaymentActionState = { status: 'idle' };

/**
 * Story 9-3: Client Component for the "Book this desk" CTA on
 * /spaces/[id]. Replaces the Phase 1 inline-booking + toast-on-success
 * pattern with a Stripe Checkout redirect.
 *
 * On `state.status === 'success'`: action returns a Stripe Checkout URL
 * → `window.location.assign(url)` (BA Decision §7 — Server Actions
 * can't return external redirects across the form boundary cleanly).
 *
 * On `state.status === 'error'`: code-to-toast-copy mapping (BA
 * Decision §10). The success toast does NOT fire here — it fires on
 * `/my-bookings?just_booked=1` after the return-from-Checkout handler
 * redirects (AC-8).
 *
 * The useRef state-identity guard handles React 19 Strict Mode's
 * effect double-invocation in dev AND re-render stability.
 */
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
  const [state, formAction] = useActionState(
    createBookingWithPaymentAction,
    initialState,
  );

  const lastHandledState = useRef<CreateBookingWithPaymentActionState | null>(
    null,
  );
  useEffect(() => {
    if (state.status === 'idle') return;
    if (lastHandledState.current === state) return;
    lastHandledState.current = state;

    if (state.status === 'success') {
      // External URL — Next's redirect() can't cross the Server Action
      // boundary cleanly. The action returned the URL via state, the
      // client navigates here.
      window.location.assign(state.redirectUrl);
      return;
    }

    // state.status === 'error' — map code to a specific toast description.
    toastError(TOAST_COPY.BOOKING_FAILED_TITLE, errorDescription(state));
  }, [state]);

  return (
    <form action={formAction}>
      <input type="hidden" name="spaceId" value={spaceId} />
      <input type="hidden" name="deskId" value={deskId} />
      <input type="hidden" name="bookingDate" value={bookingDate ?? ''} />
      <SubmitButton disabled={!enabled} />
    </form>
  );
}

// Maps each error code to its specific toast description per BA Decision §10
// + carry-forward from Story 6-3. INTERNAL_ERROR maps to
// BOOKING_FAILED_PAYMENT_INIT when the underlying failure was the Stripe
// Checkout creation step (the action logs the Stripe error); the client
// shows the user-facing PAYMENT_INIT copy regardless. Generic-internal
// failures (DB errors before Stripe) also collapse into the same copy
// since the user-actionable next step is identical: try again.
function errorDescription(
  state: CreateBookingWithPaymentActionState,
): string {
  if (state.status !== 'error') return TOAST_COPY.BOOKING_FAILED_GENERIC;
  switch (state.code) {
    case 'DOUBLE_BOOKING':
      return TOAST_COPY.BOOKING_FAILED_DOUBLE_BOOKING;
    case 'PAST_DATE':
      return TOAST_COPY.BOOKING_FAILED_PAST_DATE;
    case 'DESK_NOT_FOUND':
      return TOAST_COPY.BOOKING_FAILED_DESK_NOT_FOUND;
    case 'STRIPE_NOT_ACTIVE':
      return TOAST_COPY.BOOKING_FAILED_STRIPE_NOT_ACTIVE;
    case 'VALIDATION_ERROR':
      return Object.values(state.fields)[0] ?? TOAST_COPY.BOOKING_FAILED_GENERIC;
    case 'FORBIDDEN':
    case 'UNAUTHORIZED':
      return state.message;
    case 'INTERNAL_ERROR':
    default:
      return TOAST_COPY.BOOKING_FAILED_PAYMENT_INIT;
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
