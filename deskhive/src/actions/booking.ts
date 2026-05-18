'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import {
  requireSession,
  requireRole,
  requireOwnership,
  AuthError,
} from '@/lib/auth/guards';
import { getSpaceById } from '@/db/queries/spaces';
import {
  getBookingById,
  cancelBooking,
  confirmBooking,
  rejectBooking,
  // Story 9-4: new query helpers for the Phase 2 Stripe-first-then-DB
  // ordering. The conditional WHERE on (status='PENDING',
  // payment_status='AUTHORIZED') is the race-safety net against
  // concurrent Guest-side cancel + future 9-5 webhook backstop.
  markBookingConfirmedAndCaptured,
  markBookingRejectedAndVoided,
  // Story 9-6: new query helpers for the 3-branch cancelBookingAction
  // extension. The PENDING+AUTHORIZED Phase 2 path uses
  // markBookingCancelledAndVoided; the CONFIRMED+CAPTURED Phase 2 path
  // uses markBookingCancelledAndRefunded (atomic transition writing
  // refunded_at + refund_amount_cents alongside status). Both have a
  // guest_user_id clause for ownership defense-in-depth.
  markBookingCancelledAndVoided,
  markBookingCancelledAndRefunded,
} from '@/db/queries/bookings';
// Story 9-4: wrappers for stripe.paymentIntents.capture / cancel. Called
// FIRST in confirmBookingAction / rejectBookingAction (Stripe-first-then-
// DB ordering per BA Decision §2 + §3) for Phase 2 bookings; Phase 1
// bookings (payment_intent_id IS NULL) skip these entirely per
// Decision §6's backwards-compat branch.
//
// Story 9-6: cancelPaymentIntent is REUSED unchanged for the Phase 2
// PENDING+AUTHORIZED Guest-cancel branch. Idempotency key
// `cancel-${bookingId}` is INTENTIONALLY shared with 9-4's reject path
// (BA Decision §5) — same Stripe operation; Stripe's idempotency cache
// resolves correctly if both paths run on the same booking.
import {
  capturePaymentIntent,
  cancelPaymentIntent,
} from '@/lib/payments/payment-intents';
// Story 9-6: wrapper for stripe.refunds.create. Called FIRST in the
// Phase 2 CONFIRMED+CAPTURED branch (Stripe-first-then-DB ordering per
// BA Decision §5 + §11). Idempotency key `refund-${bookingId}` is the
// 9-4 per-resource pattern carry-forward.
import { createRefund } from '@/lib/payments/refunds';
// Story 9-6: refund-eligibility helper. UTC-only 24h cutoff per
// FR-REFUND-2; integer-ms math (no floating-point). The action calls
// this BEFORE the Stripe API to short-circuit refused cancellations
// without any side effect (PRD §4.5 / FR-REFUND-3 "refuses entirely").
import { isRefundEligible } from '@/lib/refund-policy';
import { logger } from '@/lib/logger';
import type { BookingStatus, Role } from '@/db/schema';
// Story 8-3: post-commit fire-and-forget notification calls. Email send
// failures must NEVER roll back the booking transaction; the actions
// call notify* with `.catch(...)` rather than `await ... try { } catch`.
import {
  notifyBookingConfirmed,
  notifyBookingRejected,
  notifyBookingCancelledByGuest,
} from '@/lib/bookings';

// Story 9-3: Phase 1's `createBookingAction` + `CreateBookingActionState`
// were DELETED here (BA Decision §3 + AC-5). The Guest booking path is
// now `createBookingWithPaymentAction` in
// `src/actions/booking-with-payment.ts` — single source of truth.
// `cancelBookingAction` / `confirmBookingAction` / `rejectBookingAction`
// below stay; Stories 9-4 + 9-6 extend them with Stripe capture /
// cancel / refund.

export type CancelBookingActionState =
  | { status: 'idle' }
  // Story 6-3: explicit 'success' variant so <CancelBookingButton> can fire
  // a confirmation toast on a successful cancel (BA Decisions §10).
  | { status: 'success' }
  | { status: 'error'; code: 'FORBIDDEN'; message: string }
  | { status: 'error'; code: 'NOT_FOUND'; message: string }
  | { status: 'error'; code: 'CANNOT_CANCEL'; message: string }
  // Story 9-6: Phase 2 PRD §4.5 within-24h refusal. Surfaced inline AND
  // (per BA Decision §9 + PRD §1.2 step 21 "error toast" mandate) via
  // toastError(TOAST_COPY.CANCEL_REFUND_INELIGIBLE) at the button.
  | { status: 'error'; code: 'REFUND_INELIGIBLE'; message: string }
  // Story 9-6: Stripe-side failures on the Phase 2 CONFIRMED+CAPTURED
  // refund path. Inline error rendering per the 9-4 carry-forward
  // pattern (Stripe's verbatim error message is end-user-readable in
  // test mode).
  | { status: 'error'; code: 'STRIPE_REFUND_FAILED'; message: string }
  // Story 9-6: Stripe-side failures on the Phase 2 PENDING+AUTHORIZED
  // path (paymentIntents.cancel — releases auth hold). Inline error
  // rendering. Distinct from the same-named code on
  // RejectBookingActionState — different state types even though the
  // code name is shared.
  | { status: 'error'; code: 'STRIPE_CANCEL_FAILED'; message: string }
  | { status: 'error'; code: 'INTERNAL_ERROR'; message: string };

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function cancelBookingAction(
  _prevState: CancelBookingActionState,
  formData: FormData,
): Promise<CancelBookingActionState> {
  const bookingId = String(formData.get('bookingId') ?? '');
  if (!UUID_RE.test(bookingId)) {
    return { status: 'error', code: 'NOT_FOUND', message: 'Booking not found.' };
  }

  // Auth: 401 → redirect to /login with callback; 403 (Super Admin) → state.
  let session;
  try {
    session = await requireSession();
    requireRole(session, 'GUEST');
  } catch (err) {
    if (err instanceof AuthError) {
      const status = err.response.status;
      if (status === 401) {
        redirect('/login?callbackUrl=/my-bookings');
      }
      if (status === 403) {
        return {
          status: 'error',
          code: 'FORBIDDEN',
          message: 'Only guests can cancel bookings.',
        };
      }
    }
    logger.error('cancel_booking_action_auth_failed', { error: String(err) });
    return {
      status: 'error',
      code: 'INTERNAL_ERROR',
      message: 'Something went wrong.',
    };
  }

  // Pre-checks classify errors (404 / 403 / 409). The conditional UPDATE
  // below is the actual race-safety net.
  const booking = await getBookingById(bookingId);
  if (!booking) {
    return { status: 'error', code: 'NOT_FOUND', message: 'Booking not found.' };
  }

  try {
    requireOwnership(booking.guestUserId, String(session.user.id));
  } catch (err) {
    if (err instanceof AuthError) {
      // Verbatim PRD message — do not paraphrase (US-3.5 AC-3).
      return {
        status: 'error',
        code: 'FORBIDDEN',
        message: 'You can only cancel your own bookings.',
      };
    }
    return {
      status: 'error',
      code: 'INTERNAL_ERROR',
      message: 'Something went wrong.',
    };
  }

  // Story 9-6: classify the booking into one of three cancellable shapes
  // OR a terminal/unexpected state. The Phase 1 verbatim message
  // ("Only pending bookings can be cancelled.") is SUPERSEDED — Phase 2
  // PRD §4.5 explicitly enables CONFIRMED cancel (BA Decision §2 + AC-2;
  // memory `project_phase2_prd_4_5_cancel_interpretation.md` RESOLVED).
  const isPhase1Pending =
    booking.status === 'PENDING' && booking.paymentIntentId === null;
  const isPhase2PendingAuth =
    booking.status === 'PENDING' &&
    booking.paymentStatus === 'AUTHORIZED' &&
    booking.paymentIntentId !== null;
  const isPhase2ConfirmedCaptured =
    booking.status === 'CONFIRMED' &&
    booking.paymentStatus === 'CAPTURED' &&
    booking.paymentIntentId !== null;

  // Story 8-3: capture previousStatus BEFORE the cancellation UPDATE.
  // notifyBookingCancelledByGuest's owner-side branch only fires when
  // previousStatus === 'CONFIRMED' (Decision §2 — PENDING cancellations
  // are noise). After the UPDATE, booking.status is 'CANCELLED' and the
  // discriminator is lost. Story 9-6 RESOLVES the deferred CONFIRMED-
  // cancel path; this capture now matters for the CONFIRMED+CAPTURED
  // branch (previousStatus === 'CONFIRMED' fires both notification emails).
  // Cast: schema column is `text` (string), but the CHECK constraint
  // enforces the BookingStatus union — safe narrow.
  const previousStatus = booking.status as BookingStatus;

  if (isPhase1Pending) {
    // Phase 1 path: pure DB cancel, no Stripe involvement. Existing
    // cancelBooking helper unchanged (Phase 1 backwards-compat).
    let updated;
    try {
      updated = await cancelBooking(bookingId, String(session.user.id));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error('cancel_booking_action_db_failed', { error: msg });
      return {
        status: 'error',
        code: 'INTERNAL_ERROR',
        message: 'Something went wrong. Please try again.',
      };
    }
    if (!updated) {
      return {
        status: 'error',
        code: 'CANNOT_CANCEL',
        message: 'This booking has already been cancelled or rejected.',
      };
    }
  } else if (isPhase2PendingAuth) {
    // Phase 2 PENDING path: cancel Stripe PI auth first (no refund — funds
    // were never captured), then DB UPDATE. Idempotency key INTENTIONALLY
    // shared with 9-4's reject path (BA Decision §5) — same Stripe
    // operation; Stripe's cache resolves correctly if both ran.
    const cancelResult = await cancelPaymentIntent({
      paymentIntentId: booking.paymentIntentId!,
      idempotencyKey: `cancel-${bookingId}`,
    });
    if (!cancelResult.ok) {
      logger.error('cancel_booking_action_stripe_cancel_failed', {
        bookingId,
        paymentIntentId: booking.paymentIntentId,
        error: cancelResult.error,
      });
      return {
        status: 'error',
        code: 'STRIPE_CANCEL_FAILED',
        message: cancelResult.error,
      };
    }
    let updated;
    try {
      updated = await markBookingCancelledAndVoided(
        bookingId,
        String(session.user.id),
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error('cancel_booking_action_db_failed', { error: msg });
      return {
        status: 'error',
        code: 'INTERNAL_ERROR',
        message: 'Something went wrong. Please try again.',
      };
    }
    if (!updated) {
      return {
        status: 'error',
        code: 'CANNOT_CANCEL',
        message: 'This booking has already been cancelled or rejected.',
      };
    }
  } else if (isPhase2ConfirmedCaptured) {
    // Phase 2 CONFIRMED path: check eligibility FIRST. No Stripe call
    // happens if ineligible (PRD §4.5 / FR-REFUND-3 explicit "refuses
    // entirely" lock). Application-layer logic — the toast surfaces
    // the message at the button via state.code === 'REFUND_INELIGIBLE'.
    if (!isRefundEligible(booking.bookingDate)) {
      return {
        status: 'error',
        code: 'REFUND_INELIGIBLE',
        message:
          'Cancellations within 24 hours of the booking date are non-refundable.',
      };
    }
    // Stripe-first-then-DB ordering (9-4 carry-forward).
    const refundResult = await createRefund({
      paymentIntentId: booking.paymentIntentId!,
      idempotencyKey: `refund-${bookingId}`,
    });
    if (!refundResult.ok) {
      logger.error('cancel_booking_action_stripe_refund_failed', {
        bookingId,
        paymentIntentId: booking.paymentIntentId,
        error: refundResult.error,
      });
      return {
        status: 'error',
        code: 'STRIPE_REFUND_FAILED',
        message: refundResult.error,
      };
    }
    let updated;
    try {
      // Phase 2 full-refund-only: refund_amount_cents = booking.totalCents.
      // Phase 3 partial refunds would pass a smaller value computed from
      // a multi-policy helper.
      updated = await markBookingCancelledAndRefunded(
        bookingId,
        String(session.user.id),
        booking.totalCents,
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error('cancel_booking_action_db_failed', { error: msg });
      return {
        status: 'error',
        code: 'INTERNAL_ERROR',
        message: 'Something went wrong. Please try again.',
      };
    }
    if (!updated) {
      // Conditional WHERE no-op — booking moved out of (CONFIRMED, CAPTURED)
      // between the pre-check and the UPDATE. Stripe has already refunded
      // the funds; surface CANNOT_CANCEL. The charge.refunded webhook
      // backstop (handleChargeRefunded) will reconcile via
      // markBookingCancelledAndRefundedByPaymentIntent.
      return {
        status: 'error',
        code: 'CANNOT_CANCEL',
        message: 'This booking has already been cancelled or rejected.',
      };
    }
  } else {
    // Terminal state (CANCELLED / REJECTED / already-REFUNDED) OR an
    // unexpected edge case (paymentIntentId set but payment_status not
    // in the expected 9-3/9-4 progression — could indicate state
    // corruption). Phase 1 verbatim message SUPERSEDED per BA Decision §2.
    return {
      status: 'error',
      code: 'CANNOT_CANCEL',
      message: 'This booking has already been cancelled or rejected.',
    };
  }

  // Story 8-3: fire-and-forget post-commit notification. previousStatus
  // is now meaningful (CONFIRMED for Story 9-6 CONFIRMED-cancel path —
  // both Guest + Owner emails fire) vs PENDING (Guest-only email).
  notifyBookingCancelledByGuest(bookingId, previousStatus).catch((err) => {
    logger.warn('notify_booking_cancelled_failed', { error: String(err) });
  });

  revalidatePath('/my-bookings');
  revalidatePath(`/spaces/${booking.spaceId}`);
  // Story 6-3: 'success' instead of 'idle' so the client can fire a toast.
  return { status: 'success' };
}

export type ConfirmBookingActionState =
  | { status: 'idle' }
  | { status: 'error'; code: 'FORBIDDEN'; message: string }
  | { status: 'error'; code: 'NOT_FOUND'; message: string }
  | { status: 'error'; code: 'CANNOT_CONFIRM'; message: string }
  // Story 9-4: surfaces Stripe's verbatim error message (end-user-readable
  // in test mode) inline next to the button via the existing
  // <ConfirmBookingButton> `state.message` render path. No new toast
  // strings — Phase 1 / Story 5-2 inline-error pattern preserved per
  // BA Decision §9 + §11.
  | { status: 'error'; code: 'STRIPE_CAPTURE_FAILED'; message: string }
  | { status: 'error'; code: 'INTERNAL_ERROR'; message: string };

export async function confirmBookingAction(
  _prevState: ConfirmBookingActionState,
  formData: FormData,
): Promise<ConfirmBookingActionState> {
  const bookingId = String(formData.get('bookingId') ?? '');
  if (!UUID_RE.test(bookingId)) {
    return { status: 'error', code: 'NOT_FOUND', message: 'Booking not found.' };
  }

  // Story 7-5: widened to SUPER_ADMIN OR SPACE_OWNER. The role check itself
  // is inline; the owner-scope check happens after we know the booking's
  // space. Decision §8.
  let callerRole: Role | undefined;
  let callerId: string;
  try {
    const session = await requireSession();
    callerRole = (session.user as { role?: Role }).role;
    callerId = String(session.user.id);
    if (callerRole !== 'SUPER_ADMIN' && callerRole !== 'SPACE_OWNER') {
      // Verbatim message (US-4.2 chosen wording — preserved for the Guest
      // path; SPACE_OWNER is now allowed at this gate so the message only
      // fires for Guests).
      return {
        status: 'error',
        code: 'FORBIDDEN',
        message: 'Only super admins can confirm bookings.',
      };
    }
  } catch (err) {
    if (err instanceof AuthError) {
      const status = err.response.status;
      if (status === 401) {
        redirect('/login?callbackUrl=/admin/bookings');
      }
    }
    logger.error('confirm_booking_action_auth_failed', { error: String(err) });
    return {
      status: 'error',
      code: 'INTERNAL_ERROR',
      message: 'Something went wrong.',
    };
  }

  // Pre-checks. Admin scope is platform-wide; owner scope is restricted
  // to bookings on their own spaces (Decision §8). NOT_FOUND for cross-
  // tenant mismatches — same code as a genuinely-missing booking, so we
  // don't leak the existence of other owners' rows.
  const booking = await getBookingById(bookingId);
  if (!booking) {
    return { status: 'error', code: 'NOT_FOUND', message: 'Booking not found.' };
  }
  if (callerRole === 'SPACE_OWNER') {
    const space = await getSpaceById(booking.spaceId);
    if (!space || space.ownerId !== callerId) {
      return {
        status: 'error',
        code: 'NOT_FOUND',
        message: 'Booking not found.',
      };
    }
  }
  if (booking.status !== 'PENDING') {
    // Verbatim message (US-4.2 AC-2).
    return {
      status: 'error',
      code: 'CANNOT_CONFIRM',
      message: 'Only pending bookings can be confirmed.',
    };
  }

  // Story 9-4: branch on Phase 1 vs Phase 2 booking (BA Decision §6).
  // Phase 2 bookings have `payment_intent_id` populated AND
  // `payment_status='AUTHORIZED'` (Story 9-3 invariant). Phase 1
  // bookings have `payment_intent_id IS NULL` — these come from Phase
  // 1 seeded data + the still-active /api/bookings REST endpoint.
  const isPaymentBooking =
    booking.paymentIntentId !== null &&
    booking.paymentStatus === 'AUTHORIZED';

  let result: ConfirmBookingActionState | null = null;

  if (isPaymentBooking) {
    // ─── Phase 2 path: Stripe first, then DB (BA Decision §2) ────
    // booking.paymentIntentId is guaranteed non-null by the isPaymentBooking
    // check above; the `!` narrows for TS.
    const captureResult = await capturePaymentIntent({
      paymentIntentId: booking.paymentIntentId!,
      // BA Decision §7: per-booking-id key — retries hit Stripe's
      // 24h idempotency cache and return the same `succeeded` PI.
      idempotencyKey: `capture-${bookingId}`,
    });
    if (!captureResult.ok) {
      logger.error('confirm_booking_action_capture_failed', {
        bookingId,
        paymentIntentId: booking.paymentIntentId,
        error: captureResult.error,
      });
      return {
        status: 'error',
        code: 'STRIPE_CAPTURE_FAILED',
        message: captureResult.error,
      };
    }
    // Stripe captured successfully — now do the conditional DB UPDATE.
    // The conditional WHERE on (status='PENDING', payment_status='AUTHORIZED')
    // in markBookingConfirmedAndCaptured catches the race window where
    // a concurrent Guest cancel OR a future 9-5 webhook backstop wrote
    // first. If that fires, the booking is in an inconsistent state
    // (Stripe captured, DB still AUTHORIZED) — Story 9-5's webhook
    // backstop reconciles. Surface CANNOT_CONFIRM for the Owner.
    try {
      const updated = await markBookingConfirmedAndCaptured(bookingId);
      if (!updated) {
        result = {
          status: 'error',
          code: 'CANNOT_CONFIRM',
          message: 'Only pending bookings can be confirmed.',
        };
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error('confirm_booking_action_db_failed', {
        error: msg,
        paymentIntentId: booking.paymentIntentId,
        bookingId,
      });
      result = {
        status: 'error',
        code: 'INTERNAL_ERROR',
        message: 'Something went wrong. Please try again.',
      };
    }
  } else if (booking.paymentIntentId === null) {
    // ─── Phase 1 path: no Stripe involvement (BA Decision §6) ───
    // Preserves admin-side workflow continuity for seeded rows + any
    // bookings created via the still-active /api/bookings REST route.
    // Uses the existing confirmBooking helper unchanged.
    try {
      const updated = await confirmBooking(bookingId);
      if (!updated) {
        result = {
          status: 'error',
          code: 'CANNOT_CONFIRM',
          message: 'Only pending bookings can be confirmed.',
        };
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error('confirm_booking_action_db_failed', { error: msg });
      result = {
        status: 'error',
        code: 'INTERNAL_ERROR',
        message: 'Something went wrong. Please try again.',
      };
    }
  } else {
    // ─── Edge case: PI set but payment_status not AUTHORIZED ────
    // Shouldn't happen under normal flow (9-3's pre-claim sets
    // AWAITING_PAYMENT; return-URL/webhook sets AUTHORIZED; 9-4
    // transitions to CAPTURED/VOIDED). Decision §6 surfaces
    // INTERNAL_ERROR for ops cleanup — automatic recovery would
    // invite Stripe API errors on already-mutated PIs.
    logger.error('confirm_booking_action_unexpected_payment_state', {
      bookingId,
      paymentIntentId: booking.paymentIntentId,
      paymentStatus: booking.paymentStatus,
    });
    result = {
      status: 'error',
      code: 'INTERNAL_ERROR',
      message: 'Something went wrong. Please try again.',
    };
  }

  if (result) return result;

  // Story 8-3: fire-and-forget post-commit notification. actorUserId
  // tells notifyBookingConfirmed whether to skip the owner-side email
  // (when owner === actor — Decision §3 self-action skip rule).
  notifyBookingConfirmed(bookingId, callerId).catch((err) => {
    logger.warn('notify_booking_confirmed_failed', { error: String(err) });
  });

  // Confirm doesn't change desk availability (PENDING and CONFIRMED are
  // both in the partial unique index's covered set), so no /spaces/[id]
  // revalidation needed.
  revalidatePath('/admin/bookings');
  revalidatePath('/owner/bookings');
  revalidatePath('/owner');
  revalidatePath('/my-bookings');
  return { status: 'idle' };
}

export type RejectBookingActionState =
  | { status: 'idle' }
  | { status: 'error'; code: 'FORBIDDEN'; message: string }
  | { status: 'error'; code: 'NOT_FOUND'; message: string }
  | { status: 'error'; code: 'CANNOT_REJECT'; message: string }
  // Story 9-4: mirror of STRIPE_CAPTURE_FAILED. Surfaces inline via the
  // existing <RejectBookingButton> `state.message` render path.
  | { status: 'error'; code: 'STRIPE_CANCEL_FAILED'; message: string }
  | { status: 'error'; code: 'INTERNAL_ERROR'; message: string };

export async function rejectBookingAction(
  _prevState: RejectBookingActionState,
  formData: FormData,
): Promise<RejectBookingActionState> {
  const bookingId = String(formData.get('bookingId') ?? '');
  if (!UUID_RE.test(bookingId)) {
    return { status: 'error', code: 'NOT_FOUND', message: 'Booking not found.' };
  }

  // Story 7-5: same role-branched scope check as confirmBookingAction. See
  // Decision §8 in the story file.
  let callerRole: Role | undefined;
  let callerId: string;
  try {
    const session = await requireSession();
    callerRole = (session.user as { role?: Role }).role;
    callerId = String(session.user.id);
    if (callerRole !== 'SUPER_ADMIN' && callerRole !== 'SPACE_OWNER') {
      // Verbatim message (US-4.3 chosen wording).
      return {
        status: 'error',
        code: 'FORBIDDEN',
        message: 'Only super admins can reject bookings.',
      };
    }
  } catch (err) {
    if (err instanceof AuthError) {
      const status = err.response.status;
      if (status === 401) {
        redirect('/login?callbackUrl=/admin/bookings');
      }
    }
    logger.error('reject_booking_action_auth_failed', { error: String(err) });
    return {
      status: 'error',
      code: 'INTERNAL_ERROR',
      message: 'Something went wrong.',
    };
  }

  // Pre-checks. SPACE_OWNER scope via parent space; admin platform-wide.
  const booking = await getBookingById(bookingId);
  if (!booking) {
    return { status: 'error', code: 'NOT_FOUND', message: 'Booking not found.' };
  }
  if (callerRole === 'SPACE_OWNER') {
    const space = await getSpaceById(booking.spaceId);
    if (!space || space.ownerId !== callerId) {
      return {
        status: 'error',
        code: 'NOT_FOUND',
        message: 'Booking not found.',
      };
    }
  }
  if (booking.status !== 'PENDING') {
    // Verbatim message (US-4.3 AC-2).
    return {
      status: 'error',
      code: 'CANNOT_REJECT',
      message: 'Only pending bookings can be rejected.',
    };
  }

  // Story 9-4: mirror of confirmBookingAction's branching logic.
  // Phase 2 bookings: cancel Payment Intent first, then DB UPDATE.
  // Phase 1 bookings (paymentIntentId IS NULL): existing rejectBooking
  // helper unchanged. See confirmBookingAction comments for full
  // rationale + Decision §3 + §6 references.
  const isPaymentBooking =
    booking.paymentIntentId !== null &&
    booking.paymentStatus === 'AUTHORIZED';

  let result: RejectBookingActionState | null = null;

  if (isPaymentBooking) {
    // ─── Phase 2 path: Stripe cancel first, then DB ──────────────
    const cancelResult = await cancelPaymentIntent({
      paymentIntentId: booking.paymentIntentId!,
      idempotencyKey: `cancel-${bookingId}`,
    });
    if (!cancelResult.ok) {
      logger.error('reject_booking_action_cancel_failed', {
        bookingId,
        paymentIntentId: booking.paymentIntentId,
        error: cancelResult.error,
      });
      return {
        status: 'error',
        code: 'STRIPE_CANCEL_FAILED',
        message: cancelResult.error,
      };
    }
    try {
      const updated = await markBookingRejectedAndVoided(bookingId);
      if (!updated) {
        result = {
          status: 'error',
          code: 'CANNOT_REJECT',
          message: 'Only pending bookings can be rejected.',
        };
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error('reject_booking_action_db_failed', {
        error: msg,
        paymentIntentId: booking.paymentIntentId,
        bookingId,
      });
      result = {
        status: 'error',
        code: 'INTERNAL_ERROR',
        message: 'Something went wrong. Please try again.',
      };
    }
  } else if (booking.paymentIntentId === null) {
    // ─── Phase 1 path: no Stripe involvement ─────────────────────
    try {
      const updated = await rejectBooking(bookingId);
      if (!updated) {
        result = {
          status: 'error',
          code: 'CANNOT_REJECT',
          message: 'Only pending bookings can be rejected.',
        };
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error('reject_booking_action_db_failed', { error: msg });
      result = {
        status: 'error',
        code: 'INTERNAL_ERROR',
        message: 'Something went wrong. Please try again.',
      };
    }
  } else {
    // ─── Edge case: PI set but payment_status not AUTHORIZED ────
    logger.error('reject_booking_action_unexpected_payment_state', {
      bookingId,
      paymentIntentId: booking.paymentIntentId,
      paymentStatus: booking.paymentStatus,
    });
    result = {
      status: 'error',
      code: 'INTERNAL_ERROR',
      message: 'Something went wrong. Please try again.',
    };
  }

  if (result) return result;

  // Story 8-3: fire-and-forget post-commit notification. Same actor-
  // check pattern as confirm — owner-side email skipped when the owner
  // is themselves the rejecting party (Decision §3).
  notifyBookingRejected(bookingId, callerId).catch((err) => {
    logger.warn('notify_booking_rejected_failed', { error: String(err) });
  });

  // Reject FREES the desk (PENDING → REJECTED removes the row from the
  // partial unique index's covered set), so /spaces/[id] needs revalidation
  // to surface fresh availability — distinct from Confirm which keeps the
  // desk reserved.
  revalidatePath('/admin/bookings');
  revalidatePath('/owner/bookings');
  revalidatePath('/owner');
  revalidatePath('/my-bookings');
  revalidatePath(`/spaces/${booking.spaceId}`);
  return { status: 'idle' };
}
