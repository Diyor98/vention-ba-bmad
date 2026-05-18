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
  // Story 7-4: admin review outcomes. The approve toast's description is
  // built dynamically at the call site (`${applicantName} is now a Space
  // Owner.`) because it interpolates the applicant name — only the title
  // is a frozen constant. The reject toast is a short single sentence
  // (matches CANCEL_SUCCESS pattern from Story 6-3).
  APPLICATION_APPROVED_TITLE: 'Application approved',
  APPLICATION_REJECTED_TITLE: 'Application rejected.',
  // Story 7-5: owner creates a space. The title is calm transactional; the
  // description nudges the owner to the natural next step (a freshly-
  // created space with zero desks is unbookable). BA Decision §3.
  SPACE_CREATED_TITLE: 'Space created',
  SPACE_CREATED_DESCRIPTION: 'Now add a desk to make it bookable.',
  // Story 9-3: booking-with-payment surfaces. Three new strings for the
  // distinct failure modes the new flow introduces; BOOKING_SUCCESS_*
  // above stay unchanged (Decision §10).
  // - STRIPE_NOT_ACTIVE fires when the space's owner has no active
  //   Connect row (charges_enabled / payouts_enabled false). The
  //   message is intentionally vague — guests don't need to know
  //   about Stripe; they just need to know to try a different space.
  // - PAYMENT_INIT fires when the action couldn't create the Stripe
  //   Checkout Session (Stripe API failure, network error, etc.).
  // - CANCELLED_PAYMENT fires when the Guest clicks Cancel on the
  //   Stripe-hosted Checkout page and is redirected back to
  //   /spaces/[id]?booking_cancelled=1 (handled by the space-detail
  //   page in a future polish; the copy lives here for completeness).
  BOOKING_FAILED_STRIPE_NOT_ACTIVE: "This space can't accept bookings right now.",
  BOOKING_FAILED_PAYMENT_INIT: "Payment couldn't start. Please try again.",
  BOOKING_CANCELLED_PAYMENT: 'Payment cancelled — your card was not charged.',
  // Story 9-6: surfaces the within-24h refusal per PRD §1.2 step 21 +
  // FR-REFUND-3's explicit "refuses the cancellation entirely with an
  // error toast" lock. Action returns code `REFUND_INELIGIBLE`; the
  // <CancelBookingButton>'s useEffect-toast dispatch reads this entry
  // and fires toastError(title, description). Inline rendering of
  // state.message is NOT used for this error code (9-4 pattern only
  // applies to Stripe-failed codes per BA Decision §9).
  //
  // Nested-object shape (vs the flat-string entries above) because the
  // toast wrapper takes (title, description?) and this error wants both
  // a short title + an explanatory description. Same shape future Phase
  // 3 toasts may adopt for richer error UX.
  CANCEL_REFUND_INELIGIBLE: {
    title: 'Cancellation not eligible',
    description:
      'Cancellations within 24 hours of the booking date are non-refundable.',
  },
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
