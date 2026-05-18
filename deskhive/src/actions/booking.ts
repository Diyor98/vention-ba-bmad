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
} from '@/db/queries/bookings';
// Story 9-4: wrappers for stripe.paymentIntents.capture / cancel. Called
// FIRST in confirmBookingAction / rejectBookingAction (Stripe-first-then-
// DB ordering per BA Decision §2 + §3) for Phase 2 bookings; Phase 1
// bookings (payment_intent_id IS NULL) skip these entirely per
// Decision §6's backwards-compat branch.
import {
  capturePaymentIntent,
  cancelPaymentIntent,
} from '@/lib/payments/payment-intents';
import { logger } from '@/lib/logger';
import type { Role } from '@/db/schema';
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

  if (booking.status !== 'PENDING') {
    // Verbatim PRD message — do not paraphrase (US-3.5 AC-2).
    return {
      status: 'error',
      code: 'CANNOT_CANCEL',
      message: 'Only pending bookings can be cancelled.',
    };
  }

  // Story 8-3: capture previousStatus BEFORE the cancellation UPDATE.
  // notifyBookingCancelledByGuest's owner-side branch only fires when
  // previousStatus === 'CONFIRMED' (Decision §2 — PENDING cancellations
  // are noise). After the UPDATE, booking.status is 'CANCELLED' and the
  // discriminator is lost.
  // NB: Phase 1 only allows cancelling PENDING bookings (line 238 check
  // above). The previousStatus capture is forward-looking — if Phase 2/3
  // ever permits cancelling CONFIRMED bookings, the notify branch is
  // ready. For now it'll always be 'PENDING' here.
  const previousStatus = booking.status;

  // Conditional UPDATE: race-safe against concurrent Super Admin Confirm.
  let result: CancelBookingActionState | null = null;
  try {
    const updated = await cancelBooking(bookingId, String(session.user.id));
    if (!updated) {
      result = {
        status: 'error',
        code: 'CANNOT_CANCEL',
        message: 'Only pending bookings can be cancelled.',
      };
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error('cancel_booking_action_db_failed', { error: msg });
    result = {
      status: 'error',
      code: 'INTERNAL_ERROR',
      message: 'Something went wrong. Please try again.',
    };
  }
  if (result) return result;

  // Story 8-3: fire-and-forget post-commit notification.
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
