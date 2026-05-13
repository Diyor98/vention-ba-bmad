import { toast } from 'sonner';

/**
 * Toast UI feedback seam. Wraps sonner so call sites import this module
 * instead of sonner directly — Phase 2 can swap implementations without
 * touching call sites (Story 6-3 BA Decisions §13).
 *
 * The Toaster root is mounted once in `src/app/layout.tsx`; this module
 * just emits toasts.
 *
 * IMPORTANT — copy locks. The strings in TOAST_COPY below are verbatim
 * from BA Decisions §4 + §5. Do NOT paraphrase, do NOT introduce
 * "Booking submitted!", "Success!", "Oops!", etc. Phase 2's transactional
 * emails should reuse the same voice (Decisions §13 memory note).
 */

export const TOAST_COPY = {
  BOOKING_SUCCESS_TITLE: 'Booking requested',
  BOOKING_SUCCESS_DESCRIPTION: "We'll let you know when it's confirmed.",
  BOOKING_SUCCESS_ACTION_LABEL: 'View in My Bookings',
  BOOKING_FAILED_TITLE: 'Booking failed',
  // Note: the Server Action's verbatim message is 'Booking date cannot be
  // in the past' (no period, locked by US-3.3 AC-5). The toast description
  // adds a trailing period for visual consistency with the other toast
  // descriptions — toast strings are a separate UI surface from action
  // error messages.
  BOOKING_FAILED_PAST_DATE: 'Booking date cannot be in the past.',
  BOOKING_FAILED_DOUBLE_BOOKING:
    'That desk was just booked by someone else. Please try a different desk.',
  BOOKING_FAILED_DESK_NOT_FOUND: 'This desk is not available.',
  BOOKING_FAILED_GENERIC: 'Something went wrong. Please try again.',
  CANCEL_SUCCESS: 'Booking cancelled.',
  // Story 7-3: Become-a-Space-Owner application submitted. Non-celebratory
  // tone — calm transactional voice (no exclamation, no emoji), matches the
  // Story 6-3 pattern. The email-channel deferral is in the description.
  APPLICATION_SUBMITTED_TITLE: 'Application submitted',
  APPLICATION_SUBMITTED_DESCRIPTION: "We'll email you when it's reviewed.",
} as const;

type ToastAction = { label: string; onClick: () => void };

/**
 * Success toast. Auto-dismisses after 4s (Toaster default). Pause-on-hover
 * and manual close (X) come for free from sonner.
 *
 * The action prop's onClick — not href — keeps this wrapper framework-free
 * (no `next/navigation` import). Call sites that need to navigate pass
 * `onClick: () => router.push('/...')` from a Client Component context.
 */
export function toastSuccess(
  title: string,
  opts?: { description?: string; action?: ToastAction },
): void {
  toast.success(title, {
    description: opts?.description,
    action: opts?.action,
    className: 'toast-success',
  });
}

/**
 * Error toast. Same auto-dismiss / pause / close behavior. Sonner sets
 * `aria-live="assertive"` automatically for error variants.
 */
export function toastError(title: string, description?: string): void {
  toast.error(title, {
    description,
    className: 'toast-error',
  });
}
