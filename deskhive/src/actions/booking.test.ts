import { describe, it, expect, vi, beforeEach } from 'vitest';

// Story 9-4 unit tests for the extended confirmBookingAction + rejectBookingAction
// (BA Decision §11).
//
// Five locked cases per AC-11:
//   1. Confirm happy path (Phase 2) — booking with paymentIntentId set +
//      paymentStatus='AUTHORIZED' → action calls capturePaymentIntent →
//      markBookingConfirmedAndCaptured → state success. Asserts Stripe
//      wrapper called with `capture-${bookingId}` key.
//   2. Confirm Phase 1 backwards-compat — booking with paymentIntentId IS NULL
//      → action skips Stripe → uses existing confirmBooking helper unchanged.
//      Asserts capturePaymentIntent NOT called.
//   3. Confirm STRIPE_CAPTURE_FAILED — Stripe wrapper returns { ok: false }
//      → action returns STRIPE_CAPTURE_FAILED with Stripe's message;
//      markBookingConfirmedAndCaptured NOT called.
//   4. Reject happy path (Phase 2) — mirrors confirm happy path with
//      cancelPaymentIntent + markBookingRejectedAndVoided. Asserts
//      `cancel-${bookingId}` key.
//   5. Reject Phase 1 backwards-compat — mirrors confirm Phase 1 backwards-compat.
//
// Mock surface (split-by-mock-boundary per 9-2 / 9-3 lesson — mock at the
// boundary BELOW the action, not at the Stripe SDK boundary):
//   • @/lib/auth/guards — control session + role
//   • @/db/queries/spaces — getSpaceById (owner-scope check)
//   • @/db/queries/bookings — all helpers (getBookingById + the 4
//     PENDING-transition helpers)
//   • @/lib/payments/payment-intents — capturePaymentIntent + cancelPaymentIntent
//   • @/lib/bookings — notify* (fire-and-forget; stubs no-op)
//
// We do NOT mock cancelBooking because cancelBookingAction is not under
// test in 9-4 (it'll be extended in 9-6 with the refund flow).

const {
  requireSessionMock,
  requireRoleMock,
  requireOwnershipMock,
  getSpaceByIdMock,
  getBookingByIdMock,
  confirmBookingMock,
  rejectBookingMock,
  markBookingConfirmedAndCapturedMock,
  markBookingRejectedAndVoidedMock,
  capturePaymentIntentMock,
  cancelPaymentIntentMock,
  notifyBookingConfirmedMock,
  notifyBookingRejectedMock,
  notifyBookingCancelledByGuestMock,
} = vi.hoisted(() => ({
  requireSessionMock: vi.fn(),
  requireRoleMock: vi.fn(),
  requireOwnershipMock: vi.fn(),
  getSpaceByIdMock: vi.fn(),
  getBookingByIdMock: vi.fn(),
  confirmBookingMock: vi.fn(),
  rejectBookingMock: vi.fn(),
  markBookingConfirmedAndCapturedMock: vi.fn(),
  markBookingRejectedAndVoidedMock: vi.fn(),
  capturePaymentIntentMock: vi.fn(),
  cancelPaymentIntentMock: vi.fn(),
  notifyBookingConfirmedMock: vi.fn(),
  notifyBookingRejectedMock: vi.fn(),
  notifyBookingCancelledByGuestMock: vi.fn(),
}));

vi.mock('@/lib/auth/guards', () => ({
  requireSession: requireSessionMock,
  requireRole: requireRoleMock,
  requireOwnership: requireOwnershipMock,
  AuthError: class AuthError extends Error {
    constructor(public response: Response) {
      super('AuthError');
    }
  },
}));
vi.mock('@/db/queries/spaces', () => ({
  getSpaceById: getSpaceByIdMock,
}));
vi.mock('@/db/queries/bookings', () => ({
  getBookingById: getBookingByIdMock,
  cancelBooking: vi.fn(),
  confirmBooking: confirmBookingMock,
  rejectBooking: rejectBookingMock,
  markBookingConfirmedAndCaptured: markBookingConfirmedAndCapturedMock,
  markBookingRejectedAndVoided: markBookingRejectedAndVoidedMock,
}));
vi.mock('@/lib/payments/payment-intents', () => ({
  capturePaymentIntent: capturePaymentIntentMock,
  cancelPaymentIntent: cancelPaymentIntentMock,
}));
vi.mock('@/lib/bookings', () => ({
  notifyBookingConfirmed: notifyBookingConfirmedMock,
  notifyBookingRejected: notifyBookingRejectedMock,
  notifyBookingCancelledByGuest: notifyBookingCancelledByGuestMock,
}));
// next/cache revalidatePath is called post-success; stub to no-op.
vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

import {
  confirmBookingAction,
  rejectBookingAction,
} from './booking';

const BOOKING_ID = '11111111-1111-1111-1111-111111111111';
const SPACE_ID = '22222222-2222-2222-2222-222222222222';
const OWNER_ID = '33333333-3333-3333-3333-333333333333';
const PI_ID = 'pi_test_authorized_abc';

function makeFormData(bookingId = BOOKING_ID): FormData {
  const fd = new FormData();
  fd.set('bookingId', bookingId);
  return fd;
}

function stubAuthedOwner(userId = OWNER_ID) {
  requireSessionMock.mockResolvedValue({
    user: { id: userId, email: 'owner@deskhive.local', role: 'SPACE_OWNER' },
  });
  getSpaceByIdMock.mockResolvedValue({ id: SPACE_ID, ownerId: userId });
}

function phase2Booking() {
  return {
    id: BOOKING_ID,
    spaceId: SPACE_ID,
    status: 'PENDING',
    paymentIntentId: PI_ID,
    paymentStatus: 'AUTHORIZED',
  };
}

function phase1Booking() {
  return {
    id: BOOKING_ID,
    spaceId: SPACE_ID,
    status: 'PENDING',
    paymentIntentId: null,
    paymentStatus: null,
  };
}

beforeEach(() => {
  requireSessionMock.mockReset();
  requireRoleMock.mockReset();
  requireOwnershipMock.mockReset();
  getSpaceByIdMock.mockReset();
  getBookingByIdMock.mockReset();
  confirmBookingMock.mockReset();
  rejectBookingMock.mockReset();
  markBookingConfirmedAndCapturedMock.mockReset();
  markBookingRejectedAndVoidedMock.mockReset();
  capturePaymentIntentMock.mockReset();
  cancelPaymentIntentMock.mockReset();
  // notify* are awaited via .catch(...) post-success — return resolved
  // promises so the action's fire-and-forget pattern doesn't throw.
  notifyBookingConfirmedMock.mockReset();
  notifyBookingConfirmedMock.mockResolvedValue(undefined);
  notifyBookingRejectedMock.mockReset();
  notifyBookingRejectedMock.mockResolvedValue(undefined);
  notifyBookingCancelledByGuestMock.mockReset();
  notifyBookingCancelledByGuestMock.mockResolvedValue(undefined);
});

describe('confirmBookingAction (Story 9-4 — Decision §11 tests)', () => {
  it('test 1 — Phase 2 happy path: captures Stripe + markBookingConfirmedAndCaptured', async () => {
    stubAuthedOwner();
    getBookingByIdMock.mockResolvedValueOnce(phase2Booking());
    capturePaymentIntentMock.mockResolvedValueOnce({
      ok: true,
      data: { paymentIntentId: PI_ID, status: 'succeeded' },
    });
    markBookingConfirmedAndCapturedMock.mockResolvedValueOnce({
      id: BOOKING_ID,
      status: 'CONFIRMED',
      paymentStatus: 'CAPTURED',
    });

    const result = await confirmBookingAction(
      { status: 'idle' },
      makeFormData(),
    );

    expect(result).toEqual({ status: 'idle' });
    // Stripe capture called with per-booking-id key (BA Decision §7).
    expect(capturePaymentIntentMock).toHaveBeenCalledTimes(1);
    expect(capturePaymentIntentMock.mock.calls[0]?.[0]).toEqual({
      paymentIntentId: PI_ID,
      idempotencyKey: `capture-${BOOKING_ID}`,
    });
    // Phase 2 DB helper used (NOT the Phase 1 confirmBooking).
    expect(markBookingConfirmedAndCapturedMock).toHaveBeenCalledTimes(1);
    expect(confirmBookingMock).not.toHaveBeenCalled();
  });

  it('test 2 — Phase 1 backwards-compat: paymentIntentId IS NULL skips Stripe', async () => {
    stubAuthedOwner();
    getBookingByIdMock.mockResolvedValueOnce(phase1Booking());
    confirmBookingMock.mockResolvedValueOnce({
      id: BOOKING_ID,
      status: 'CONFIRMED',
      paymentStatus: null,
    });

    const result = await confirmBookingAction(
      { status: 'idle' },
      makeFormData(),
    );

    expect(result).toEqual({ status: 'idle' });
    // CRITICAL: Stripe wrapper NOT called for Phase 1 backwards-compat path.
    expect(capturePaymentIntentMock).not.toHaveBeenCalled();
    // Phase 1 DB helper used (NOT the new Phase 2 helper).
    expect(confirmBookingMock).toHaveBeenCalledTimes(1);
    expect(markBookingConfirmedAndCapturedMock).not.toHaveBeenCalled();
  });

  it('test 3 — STRIPE_CAPTURE_FAILED: Stripe error → no DB write, surface verbatim message', async () => {
    stubAuthedOwner();
    getBookingByIdMock.mockResolvedValueOnce(phase2Booking());
    capturePaymentIntentMock.mockResolvedValueOnce({
      ok: false,
      error: 'Your card was declined.',
    });

    const result = await confirmBookingAction(
      { status: 'idle' },
      makeFormData(),
    );

    expect(result).toEqual({
      status: 'error',
      code: 'STRIPE_CAPTURE_FAILED',
      message: 'Your card was declined.',
    });
    // Stripe wrapper was called but DB UPDATE was NOT — booking stays
    // in PENDING + AUTHORIZED.
    expect(capturePaymentIntentMock).toHaveBeenCalledTimes(1);
    expect(markBookingConfirmedAndCapturedMock).not.toHaveBeenCalled();
    expect(confirmBookingMock).not.toHaveBeenCalled();
    // Post-success notify NOT fired.
    expect(notifyBookingConfirmedMock).not.toHaveBeenCalled();
  });
});

describe('rejectBookingAction (Story 9-4 — Decision §11 tests)', () => {
  it('test 4 — Phase 2 happy path: cancels Stripe + markBookingRejectedAndVoided', async () => {
    stubAuthedOwner();
    getBookingByIdMock.mockResolvedValueOnce(phase2Booking());
    cancelPaymentIntentMock.mockResolvedValueOnce({
      ok: true,
      data: { paymentIntentId: PI_ID, status: 'canceled' },
    });
    markBookingRejectedAndVoidedMock.mockResolvedValueOnce({
      id: BOOKING_ID,
      status: 'REJECTED',
      paymentStatus: 'VOIDED',
    });

    const result = await rejectBookingAction(
      { status: 'idle' },
      makeFormData(),
    );

    expect(result).toEqual({ status: 'idle' });
    // Stripe cancel called with per-booking-id key (BA Decision §7).
    expect(cancelPaymentIntentMock).toHaveBeenCalledTimes(1);
    expect(cancelPaymentIntentMock.mock.calls[0]?.[0]).toEqual({
      paymentIntentId: PI_ID,
      idempotencyKey: `cancel-${BOOKING_ID}`,
    });
    // Phase 2 DB helper used.
    expect(markBookingRejectedAndVoidedMock).toHaveBeenCalledTimes(1);
    expect(rejectBookingMock).not.toHaveBeenCalled();
  });

  it('test 5 — Phase 1 backwards-compat: paymentIntentId IS NULL skips Stripe', async () => {
    stubAuthedOwner();
    getBookingByIdMock.mockResolvedValueOnce(phase1Booking());
    rejectBookingMock.mockResolvedValueOnce({
      id: BOOKING_ID,
      status: 'REJECTED',
      paymentStatus: null,
    });

    const result = await rejectBookingAction(
      { status: 'idle' },
      makeFormData(),
    );

    expect(result).toEqual({ status: 'idle' });
    expect(cancelPaymentIntentMock).not.toHaveBeenCalled();
    expect(rejectBookingMock).toHaveBeenCalledTimes(1);
    expect(markBookingRejectedAndVoidedMock).not.toHaveBeenCalled();
  });

  it('test 5c — markBookingRejectedAndVoided conditional-WHERE no-op surfaces CANNOT_REJECT', async () => {
    // Race-safety coverage for AC-11's "query helper" test target — the
    // conditional WHERE on (status='PENDING', payment_status='AUTHORIZED')
    // filters out a concurrent Guest cancel / future 9-5 webhook backstop
    // / stale retry. Wrapper returns undefined; action surfaces the Phase
    // 1 carry-forward CANNOT_REJECT code. NB: Stripe ALREADY canceled the
    // PI (we're past the cancelPaymentIntent call) — caller treats this
    // as an inconsistency to surface via the Phase 1 error code; Story
    // 9-5's webhook backstop will reconcile.
    stubAuthedOwner();
    getBookingByIdMock.mockResolvedValueOnce(phase2Booking());
    cancelPaymentIntentMock.mockResolvedValueOnce({
      ok: true,
      data: { paymentIntentId: PI_ID, status: 'canceled' },
    });
    markBookingRejectedAndVoidedMock.mockResolvedValueOnce(undefined);

    const result = await rejectBookingAction(
      { status: 'idle' },
      makeFormData(),
    );

    expect(result).toEqual({
      status: 'error',
      code: 'CANNOT_REJECT',
      message: 'Only pending bookings can be rejected.',
    });
  });

  it('test 5b — STRIPE_CANCEL_FAILED: Stripe error → no DB write, surface verbatim message', async () => {
    // Bonus test on the reject Stripe-failure path (mirrors test 3
    // for confirm). +1 over the BA-stated +5; same +N-bonus pattern as
    // 9-1 / 9-2 / 9-2b / 9-3.
    stubAuthedOwner();
    getBookingByIdMock.mockResolvedValueOnce(phase2Booking());
    cancelPaymentIntentMock.mockResolvedValueOnce({
      ok: false,
      error: 'You cannot cancel this PaymentIntent because it has a status of succeeded.',
    });

    const result = await rejectBookingAction(
      { status: 'idle' },
      makeFormData(),
    );

    expect(result).toEqual({
      status: 'error',
      code: 'STRIPE_CANCEL_FAILED',
      message: 'You cannot cancel this PaymentIntent because it has a status of succeeded.',
    });
    expect(cancelPaymentIntentMock).toHaveBeenCalledTimes(1);
    expect(markBookingRejectedAndVoidedMock).not.toHaveBeenCalled();
    expect(rejectBookingMock).not.toHaveBeenCalled();
    expect(notifyBookingRejectedMock).not.toHaveBeenCalled();
  });
});
