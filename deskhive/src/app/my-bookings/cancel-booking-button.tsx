'use client';

import { useActionState, useEffect, useRef } from 'react';
import { useFormStatus } from 'react-dom';
import {
  cancelBookingAction,
  type CancelBookingActionState,
} from '@/actions/booking';
import { toastSuccess, toastError, TOAST_COPY } from '@/lib/toast';
import { formatCents } from '@/lib/format';

const initialState: CancelBookingActionState = { status: 'idle' };

export function CancelBookingButton({ bookingId }: { bookingId: string }) {
  const [state, formAction] = useActionState(cancelBookingAction, initialState);
  // Story 9-6: REFUND_INELIGIBLE surfaces via toastError per PRD §1.2 step 21
  // + FR-REFUND-3 explicit "error toast" lock — NOT inline. Other error
  // codes (STRIPE_*_FAILED, CANNOT_CANCEL, FORBIDDEN, NOT_FOUND,
  // INTERNAL_ERROR) keep the 9-4 inline-error pattern via state.message.
  const errorMessage =
    state.status === 'error' && state.code !== 'REFUND_INELIGIBLE'
      ? state.message
      : undefined;

  // Story 6-3 (BA Decisions §10): toast on successful cancel. State-identity
  // ref guards against React 19 Strict Mode effect double-fire and against
  // re-firing on unrelated re-renders.
  //
  // Story 9-6: extended to also fire toastError on REFUND_INELIGIBLE
  // (Phase 2 within-24h refusal). Same ref-guard pattern guards against
  // double-fire.
  //
  // Story 9-6 BA-walk supplement: success path branches on
  // state.refundAmountCents to pick the right toast variant.
  //   • refundAmountCents defined → eligible-refund branch ran; fire the
  //     refund-success toast with the formatted dollar amount + 5-10
  //     business-day timing (CANCEL_REFUND_SUCCESS_TITLE + dynamic
  //     description per the APPLICATION_APPROVED_TITLE convention).
  //   • refundAmountCents undefined → Phase 1 or Phase 2 PENDING+AUTHORIZED
  //     branch ran (no money moved); fall through to the generic
  //     CANCEL_SUCCESS toast (Phase 1 carry-forward).
  const lastFiredState = useRef<CancelBookingActionState | null>(null);
  useEffect(() => {
    if (lastFiredState.current === state) return;
    if (state.status === 'success') {
      lastFiredState.current = state;
      if (state.refundAmountCents !== undefined) {
        const formatted = formatCents(state.refundAmountCents);
        toastSuccess(TOAST_COPY.CANCEL_REFUND_SUCCESS_TITLE, {
          description: `Refund of ${formatted} is being processed. It will appear on your original payment method within 5–10 business days.`,
        });
      } else {
        toastSuccess(TOAST_COPY.CANCEL_SUCCESS);
      }
    } else if (state.status === 'error' && state.code === 'REFUND_INELIGIBLE') {
      lastFiredState.current = state;
      toastError(
        TOAST_COPY.CANCEL_REFUND_INELIGIBLE.title,
        TOAST_COPY.CANCEL_REFUND_INELIGIBLE.description,
      );
    }
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
      {/* Story 9-6: label "Cancel booking" uniform across PENDING and
          CONFIRMED future-dated bookings (BA Decision §8 picks (a) — single
          label; the Phase 1 "Cancel request" framing leaked PENDING-only
          assumption). */}
      {pending ? 'Cancelling…' : 'Cancel booking'}
    </button>
  );
}
