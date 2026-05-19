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
  cancelBookingMock,
  confirmBookingMock,
  rejectBookingMock,
  markBookingConfirmedAndCapturedMock,
  markBookingRejectedAndVoidedMock,
  // Story 9-6: cancelBookingAction's new query helpers + refund wrapper +
  // refund-eligibility helper.
  markBookingCancelledAndVoidedMock,
  markBookingCancelledAndRefundedMock,
  createRefundMock,
  isRefundEligibleMock,
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
  cancelBookingMock: vi.fn(),
  confirmBookingMock: vi.fn(),
  rejectBookingMock: vi.fn(),
  markBookingConfirmedAndCapturedMock: vi.fn(),
  markBookingRejectedAndVoidedMock: vi.fn(),
  markBookingCancelledAndVoidedMock: vi.fn(),
  markBookingCancelledAndRefundedMock: vi.fn(),
  createRefundMock: vi.fn(),
  isRefundEligibleMock: vi.fn(),
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
  cancelBooking: cancelBookingMock,
  confirmBooking: confirmBookingMock,
  rejectBooking: rejectBookingMock,
  markBookingConfirmedAndCaptured: markBookingConfirmedAndCapturedMock,
  markBookingRejectedAndVoided: markBookingRejectedAndVoidedMock,
  // Story 9-6: new query helpers for cancelBookingAction's 3-branch logic.
  markBookingCancelledAndVoided: markBookingCancelledAndVoidedMock,
  markBookingCancelledAndRefunded: markBookingCancelledAndRefundedMock,
}));
vi.mock('@/lib/payments/payment-intents', () => ({
  capturePaymentIntent: capturePaymentIntentMock,
  cancelPaymentIntent: cancelPaymentIntentMock,
}));
// Story 9-6: refund wrapper + refund-policy helper.
vi.mock('@/lib/payments/refunds', () => ({
  createRefund: createRefundMock,
}));
vi.mock('@/lib/refund-policy', () => ({
  isRefundEligible: isRefundEligibleMock,
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
  cancelBookingAction,
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
  cancelBookingMock.mockReset();
  confirmBookingMock.mockReset();
  rejectBookingMock.mockReset();
  markBookingConfirmedAndCapturedMock.mockReset();
  markBookingRejectedAndVoidedMock.mockReset();
  // Story 9-6 mocks
  markBookingCancelledAndVoidedMock.mockReset();
  markBookingCancelledAndRefundedMock.mockReset();
  createRefundMock.mockReset();
  isRefundEligibleMock.mockReset();
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

// ────────────────────────────────────────────────────────────────────────
// Story 9-6 — cancelBookingAction 3-branch tests (BA Decision §12).
//
// Resolves the long-standing PRD §4.5 cancel-interpretation open question
// (Option (a) extend-in-place — see BA Decision §2). 5 locked cases per
// AC-12:
//   1. Phase 2 PENDING happy: PI auth release via cancelPaymentIntent →
//      markBookingCancelledAndVoided → success. Idempotency key shared
//      with 9-4 reject path (BA Decision §5).
//   2. Phase 2 CONFIRMED eligible refund: createRefund → markBookingCancelledAndRefunded
//      → success. Refund amount = booking.totalCents.
//   3. Phase 2 CONFIRMED ineligible refusal: isRefundEligible returns false →
//      REFUND_INELIGIBLE; no Stripe call; no DB UPDATE.
//   4. Phase 2 CONFIRMED + Stripe refund failure: createRefund returns
//      { ok: false } → STRIPE_REFUND_FAILED with Stripe's message; no DB UPDATE.
//   5. Phase 1 backwards-compat: paymentIntentId IS NULL → cancelBooking
//      (existing helper) unchanged; Stripe wrappers NOT called.
//   6. CANNOT_CANCEL on terminal state: booking already CANCELLED/REJECTED →
//      action returns CANNOT_CANCEL with new "already cancelled or rejected"
//      message (Phase 1 verbatim message SUPERSEDED per Decision §2).
// ────────────────────────────────────────────────────────────────────────

const GUEST_ID = '44444444-4444-4444-4444-444444444444';

function stubAuthedGuest(userId = GUEST_ID) {
  requireSessionMock.mockResolvedValue({
    user: { id: userId, email: 'guest@deskhive.local', role: 'GUEST' },
  });
}

// totalCents is read by the CONFIRMED-refund branch to pass refund_amount_cents.
function phase2ConfirmedCapturedBooking(
  overrides: Partial<{ bookingDate: string; totalCents: number }> = {},
) {
  return {
    id: BOOKING_ID,
    spaceId: SPACE_ID,
    guestUserId: GUEST_ID,
    status: 'CONFIRMED',
    paymentIntentId: PI_ID,
    paymentStatus: 'CAPTURED',
    bookingDate: overrides.bookingDate ?? '2026-12-31',
    totalCents: overrides.totalCents ?? 2500,
  };
}

function phase2PendingAuthorizedBooking() {
  return {
    id: BOOKING_ID,
    spaceId: SPACE_ID,
    guestUserId: GUEST_ID,
    status: 'PENDING',
    paymentIntentId: PI_ID,
    paymentStatus: 'AUTHORIZED',
    bookingDate: '2026-12-31',
    totalCents: 2500,
  };
}

function phase1PendingBooking() {
  return {
    id: BOOKING_ID,
    spaceId: SPACE_ID,
    guestUserId: GUEST_ID,
    status: 'PENDING',
    paymentIntentId: null,
    paymentStatus: null,
    bookingDate: '2026-12-31',
    totalCents: 0,
  };
}

describe('cancelBookingAction (Story 9-6 — Decision §12 tests)', () => {
  it('test 1 — Phase 2 PENDING happy: cancelPaymentIntent + markBookingCancelledAndVoided → success', async () => {
    stubAuthedGuest();
    getBookingByIdMock.mockResolvedValueOnce(phase2PendingAuthorizedBooking());
    cancelPaymentIntentMock.mockResolvedValueOnce({
      ok: true,
      data: { paymentIntentId: PI_ID, status: 'canceled' },
    });
    markBookingCancelledAndVoidedMock.mockResolvedValueOnce({
      id: BOOKING_ID,
      status: 'CANCELLED',
      paymentStatus: 'VOIDED',
    });

    const result = await cancelBookingAction({ status: 'idle' }, makeFormData());

    expect(result).toEqual({ status: 'success' });
    // Idempotency key INTENTIONALLY shared with 9-4 reject path (BA Decision §5).
    expect(cancelPaymentIntentMock).toHaveBeenCalledTimes(1);
    expect(cancelPaymentIntentMock.mock.calls[0]?.[0]).toEqual({
      paymentIntentId: PI_ID,
      idempotencyKey: `cancel-${BOOKING_ID}`,
    });
    // New Phase 2 helper used (NOT cancelBooking or createRefund).
    expect(markBookingCancelledAndVoidedMock).toHaveBeenCalledTimes(1);
    expect(markBookingCancelledAndVoidedMock.mock.calls[0]?.[0]).toBe(
      BOOKING_ID,
    );
    expect(markBookingCancelledAndVoidedMock.mock.calls[0]?.[1]).toBe(
      GUEST_ID,
    );
    expect(cancelBookingMock).not.toHaveBeenCalled();
    expect(createRefundMock).not.toHaveBeenCalled();
    expect(markBookingCancelledAndRefundedMock).not.toHaveBeenCalled();
  });

  it('test 2 — Phase 2 CONFIRMED eligible refund: createRefund + markBookingCancelledAndRefunded → success', async () => {
    stubAuthedGuest();
    getBookingByIdMock.mockResolvedValueOnce(
      phase2ConfirmedCapturedBooking({ bookingDate: '2026-12-31', totalCents: 2500 }),
    );
    isRefundEligibleMock.mockReturnValueOnce(true);
    createRefundMock.mockResolvedValueOnce({
      ok: true,
      data: {
        refundId: 're_test_succeeded',
        paymentIntentId: PI_ID,
        status: 'succeeded',
        amountCents: 2500,
      },
    });
    markBookingCancelledAndRefundedMock.mockResolvedValueOnce({
      id: BOOKING_ID,
      status: 'CANCELLED',
      paymentStatus: 'REFUNDED',
      refundedAt: new Date(),
      refundAmountCents: 2500,
    });

    const result = await cancelBookingAction({ status: 'idle' }, makeFormData());

    // BA-walk supplement: success state carries refundAmountCents so the
    // button can dispatch the refund-success toast (with formatted amount
    // + 5-10 business-day timing). Phase 2 full-refund-only: equals
    // booking.totalCents.
    expect(result).toEqual({ status: 'success', refundAmountCents: 2500 });
    // Eligibility check fired with booking_date.
    expect(isRefundEligibleMock).toHaveBeenCalledWith('2026-12-31');
    // Refund called with the locked per-booking-id key.
    expect(createRefundMock).toHaveBeenCalledTimes(1);
    expect(createRefundMock.mock.calls[0]?.[0]).toEqual({
      paymentIntentId: PI_ID,
      idempotencyKey: `refund-${BOOKING_ID}`,
    });
    // markBookingCancelledAndRefunded called with refundAmountCents === totalCents
    // (Phase 2 full-refund-only).
    expect(markBookingCancelledAndRefundedMock).toHaveBeenCalledTimes(1);
    expect(markBookingCancelledAndRefundedMock.mock.calls[0]).toEqual([
      BOOKING_ID,
      GUEST_ID,
      2500,
    ]);
    // Other paths NOT called.
    expect(cancelPaymentIntentMock).not.toHaveBeenCalled();
    expect(markBookingCancelledAndVoidedMock).not.toHaveBeenCalled();
    expect(cancelBookingMock).not.toHaveBeenCalled();
  });

  it('test 3 — Phase 2 CONFIRMED ineligible refusal: REFUND_INELIGIBLE; no Stripe, no DB UPDATE', async () => {
    stubAuthedGuest();
    getBookingByIdMock.mockResolvedValueOnce(phase2ConfirmedCapturedBooking());
    isRefundEligibleMock.mockReturnValueOnce(false);

    const result = await cancelBookingAction({ status: 'idle' }, makeFormData());

    expect(result).toEqual({
      status: 'error',
      code: 'REFUND_INELIGIBLE',
      message:
        'Cancellations within 24 hours of the booking date are non-refundable.',
    });
    // PRD §4.5 / FR-REFUND-3 explicit "refuses entirely" — NO Stripe call.
    expect(createRefundMock).not.toHaveBeenCalled();
    expect(markBookingCancelledAndRefundedMock).not.toHaveBeenCalled();
    // notify also NOT called (no successful cancel happened).
    expect(notifyBookingCancelledByGuestMock).not.toHaveBeenCalled();
  });

  it('test 4 — Phase 2 CONFIRMED + Stripe refund failure: STRIPE_REFUND_FAILED; no DB UPDATE', async () => {
    stubAuthedGuest();
    getBookingByIdMock.mockResolvedValueOnce(phase2ConfirmedCapturedBooking());
    isRefundEligibleMock.mockReturnValueOnce(true);
    createRefundMock.mockResolvedValueOnce({
      ok: false,
      error: 'The charge has already been refunded',
    });

    const result = await cancelBookingAction({ status: 'idle' }, makeFormData());

    expect(result).toEqual({
      status: 'error',
      code: 'STRIPE_REFUND_FAILED',
      message: 'The charge has already been refunded',
    });
    expect(createRefundMock).toHaveBeenCalledTimes(1);
    // DB write NOT attempted on Stripe failure (Stripe-first-then-DB).
    expect(markBookingCancelledAndRefundedMock).not.toHaveBeenCalled();
  });

  it('test 5 — Phase 1 backwards-compat: paymentIntentId IS NULL → cancelBooking; Stripe NOT called', async () => {
    stubAuthedGuest();
    getBookingByIdMock.mockResolvedValueOnce(phase1PendingBooking());
    cancelBookingMock.mockResolvedValueOnce({
      id: BOOKING_ID,
      status: 'CANCELLED',
    });

    const result = await cancelBookingAction({ status: 'idle' }, makeFormData());

    expect(result).toEqual({ status: 'success' });
    // Phase 1 helper called with (bookingId, guestUserId).
    expect(cancelBookingMock).toHaveBeenCalledTimes(1);
    expect(cancelBookingMock.mock.calls[0]).toEqual([BOOKING_ID, GUEST_ID]);
    // Stripe wrappers NOT called.
    expect(cancelPaymentIntentMock).not.toHaveBeenCalled();
    expect(createRefundMock).not.toHaveBeenCalled();
    // Phase 2 helpers NOT called.
    expect(markBookingCancelledAndVoidedMock).not.toHaveBeenCalled();
    expect(markBookingCancelledAndRefundedMock).not.toHaveBeenCalled();
  });

  it('test 6 — CANNOT_CANCEL on terminal state (already CANCELLED): no Stripe, no DB write, supersedes Phase 1 message', async () => {
    stubAuthedGuest();
    getBookingByIdMock.mockResolvedValueOnce({
      id: BOOKING_ID,
      spaceId: SPACE_ID,
      guestUserId: GUEST_ID,
      status: 'CANCELLED',
      paymentIntentId: PI_ID,
      paymentStatus: 'VOIDED',
      bookingDate: '2026-12-31',
      totalCents: 2500,
    });

    const result = await cancelBookingAction({ status: 'idle' }, makeFormData());

    expect(result).toEqual({
      status: 'error',
      code: 'CANNOT_CANCEL',
      message: 'This booking has already been cancelled or rejected.',
    });
    // Phase 1 verbatim "Only pending bookings can be cancelled." message
    // SUPERSEDED per BA Decision §2 — must NOT appear.
    if (result.status === 'error') {
      expect(result.message).not.toBe('Only pending bookings can be cancelled.');
    }
    // No Stripe / no DB writes.
    expect(cancelPaymentIntentMock).not.toHaveBeenCalled();
    expect(createRefundMock).not.toHaveBeenCalled();
    expect(cancelBookingMock).not.toHaveBeenCalled();
    expect(markBookingCancelledAndVoidedMock).not.toHaveBeenCalled();
    expect(markBookingCancelledAndRefundedMock).not.toHaveBeenCalled();
  });

  // ──────────────────────────────────────────────────────────────────
  // Story 9-6 BA-walk supplement — non-refund cancel paths return
  // success WITHOUT refundAmountCents. The button reads the absence
  // and falls through to the generic CANCEL_SUCCESS toast (Phase 1
  // carry-forward); the refund-success toast (with the formatted
  // dollar amount + 5-10 business-day timing) MUST NOT fire on paths
  // where no money moved.
  // ──────────────────────────────────────────────────────────────────
  it('BA-walk supplement — Phase 1 + Phase 2 PENDING cancel paths return success WITHOUT refundAmountCents', async () => {
    // Sub-case 1: Phase 1 PENDING (no PI). Existing cancelBooking helper
    // runs; no refund concept; success state must omit refundAmountCents.
    stubAuthedGuest();
    getBookingByIdMock.mockResolvedValueOnce(phase1PendingBooking());
    cancelBookingMock.mockResolvedValueOnce({
      id: BOOKING_ID,
      status: 'CANCELLED',
    });

    const phase1Result = await cancelBookingAction(
      { status: 'idle' },
      makeFormData(),
    );

    expect(phase1Result).toEqual({ status: 'success' });
    expect(phase1Result).not.toHaveProperty('refundAmountCents');

    // Sub-case 2: Phase 2 PENDING+AUTHORIZED. Stripe auth release fires
    // but no funds move; success state must omit refundAmountCents.
    stubAuthedGuest();
    getBookingByIdMock.mockResolvedValueOnce(phase2PendingAuthorizedBooking());
    cancelPaymentIntentMock.mockResolvedValueOnce({
      ok: true,
      data: { paymentIntentId: PI_ID, status: 'canceled' },
    });
    markBookingCancelledAndVoidedMock.mockResolvedValueOnce({
      id: BOOKING_ID,
      status: 'CANCELLED',
      paymentStatus: 'VOIDED',
    });

    const phase2Result = await cancelBookingAction(
      { status: 'idle' },
      makeFormData(),
    );

    expect(phase2Result).toEqual({ status: 'success' });
    expect(phase2Result).not.toHaveProperty('refundAmountCents');
  });
});
