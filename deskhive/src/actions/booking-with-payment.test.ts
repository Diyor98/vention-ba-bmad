import { describe, it, expect, vi, beforeEach } from 'vitest';

// Story 9-3 unit tests for createBookingWithPaymentAction (BA Decision §11).
//
// Five locked cases:
//   1. Happy path — Connect-active owner → pre-claimed booking + Stripe
//      Checkout URL returned.
//   2. DOUBLE_BOOKING — unique-violation on uniq_active_booking_per_desk_per_date.
//   3. STRIPE_NOT_ACTIVE — owner without an active Connect row.
//   4. Carry-forward errors — PAST_DATE / VALIDATION_ERROR / DESK_NOT_FOUND
//      (Phase 1 parity).
//   5. Stripe API failure — createCheckoutSession returns { ok: false }
//      AFTER the pre-claim insert → INTERNAL_ERROR with the Stripe error
//      message. Cleanup is deferred per Decision §3 — the AWAITING_PAYMENT
//      row stays in the DB; the test asserts the action's return shape.
//
// Mock surface (split-by-mock-boundary per 9-2 lesson — mock at the
// boundary BELOW the action, not at the Stripe SDK boundary):
//   • @/lib/auth/guards — control session + role
//   • @/lib/format — isPastDate (PAST_DATE branch)
//   • @/db/queries/desks — getActiveDeskById
//   • @/db/queries/spaces — getPublishedSpaceById
//   • @/db/queries/stripe-connect — getConnectAccountByUserId
//   • @/db/queries/bookings — createBooking (with unique-violation throw)
//   • @/lib/payments/checkout — createCheckoutSession
//   • @/lib/db-errors — isPgUniqueViolation (real impl is fine; we throw
//     a fake error with the right shape and let the real classifier match)

const {
  requireSessionMock,
  requireRoleMock,
  isPastDateMock,
  getActiveDeskByIdMock,
  getPublishedSpaceByIdMock,
  getConnectAccountByUserIdMock,
  createBookingMock,
  createCheckoutSessionMock,
} = vi.hoisted(() => ({
  requireSessionMock: vi.fn(),
  requireRoleMock: vi.fn(),
  isPastDateMock: vi.fn(),
  getActiveDeskByIdMock: vi.fn(),
  getPublishedSpaceByIdMock: vi.fn(),
  getConnectAccountByUserIdMock: vi.fn(),
  createBookingMock: vi.fn(),
  createCheckoutSessionMock: vi.fn(),
}));

vi.mock('@/lib/auth/guards', () => ({
  requireSession: requireSessionMock,
  requireRole: requireRoleMock,
  AuthError: class AuthError extends Error {
    constructor(public response: Response) {
      super('AuthError');
    }
  },
}));
vi.mock('@/lib/format', () => ({
  isPastDate: isPastDateMock,
}));
vi.mock('@/db/queries/desks', () => ({
  getActiveDeskById: getActiveDeskByIdMock,
}));
vi.mock('@/db/queries/spaces', () => ({
  getPublishedSpaceById: getPublishedSpaceByIdMock,
}));
vi.mock('@/db/queries/stripe-connect', () => ({
  getConnectAccountByUserId: getConnectAccountByUserIdMock,
}));
vi.mock('@/db/queries/bookings', () => ({
  createBooking: createBookingMock,
}));
vi.mock('@/lib/payments/checkout', () => ({
  createCheckoutSession: createCheckoutSessionMock,
}));

import { createBookingWithPaymentAction } from './booking-with-payment';

const VALID_DESK_ID = '11111111-1111-1111-1111-111111111111';
const VALID_SPACE_ID = '22222222-2222-2222-2222-222222222222';
const VALID_OWNER_ID = '33333333-3333-3333-3333-333333333333';
const VALID_BOOKING_ID = '44444444-4444-4444-4444-444444444444';
const VALID_GUEST_ID = '55555555-5555-5555-5555-555555555555';
const FUTURE_DATE = '2099-12-31';

function makeFormData(overrides: Record<string, string> = {}): FormData {
  const fd = new FormData();
  fd.set('spaceId', overrides.spaceId ?? VALID_SPACE_ID);
  fd.set('deskId', overrides.deskId ?? VALID_DESK_ID);
  fd.set('bookingDate', overrides.bookingDate ?? FUTURE_DATE);
  return fd;
}

function stubAuthedGuest(userId = VALID_GUEST_ID) {
  requireSessionMock.mockResolvedValue({
    user: { id: userId, email: 'guest@deskhive.local', role: 'GUEST' },
  });
  requireRoleMock.mockReturnValue(undefined);
}

function stubActiveDesk() {
  getActiveDeskByIdMock.mockResolvedValue({
    id: VALID_DESK_ID,
    spaceId: VALID_SPACE_ID,
    label: 'Desk 1',
    dailyPriceCents: 2500,
    isActive: true,
  });
}

function stubPublishedSpace(ownerId: string | null = VALID_OWNER_ID) {
  getPublishedSpaceByIdMock.mockResolvedValue({
    id: VALID_SPACE_ID,
    name: 'Seeded Owner Coworks',
    ownerId,
    status: 'PUBLISHED',
  });
}

function stubActiveConnect() {
  getConnectAccountByUserIdMock.mockResolvedValue({
    userId: VALID_OWNER_ID,
    stripeAccountId: 'acct_test_xyz',
    chargesEnabled: true,
    payoutsEnabled: true,
    onboardingCompleted: true,
  });
}

beforeEach(() => {
  requireSessionMock.mockReset();
  requireRoleMock.mockReset();
  isPastDateMock.mockReset();
  isPastDateMock.mockReturnValue(false);
  getActiveDeskByIdMock.mockReset();
  getPublishedSpaceByIdMock.mockReset();
  getConnectAccountByUserIdMock.mockReset();
  createBookingMock.mockReset();
  createCheckoutSessionMock.mockReset();
});

describe('createBookingWithPaymentAction (Story 9-3 — Decision §11 tests)', () => {
  it('test 1 — happy path: pre-claims booking + returns Stripe Checkout URL', async () => {
    stubAuthedGuest();
    stubActiveDesk();
    stubPublishedSpace();
    stubActiveConnect();
    createBookingMock.mockResolvedValueOnce({
      id: VALID_BOOKING_ID,
      guestUserId: VALID_GUEST_ID,
      spaceId: VALID_SPACE_ID,
      deskId: VALID_DESK_ID,
      bookingDate: FUTURE_DATE,
      status: 'PENDING',
    });
    createCheckoutSessionMock.mockResolvedValueOnce({
      ok: true,
      data: {
        sessionId: 'cs_test_abc',
        url: 'https://checkout.stripe.com/c/pay/cs_test_abc',
      },
    });

    const result = await createBookingWithPaymentAction(
      { status: 'idle' },
      makeFormData(),
    );

    expect(result).toEqual({
      status: 'success',
      redirectUrl: 'https://checkout.stripe.com/c/pay/cs_test_abc',
    });
    // Pre-claim shape — Decision §3: AWAITING_PAYMENT + totalCents +
    // platformFeeCents (15% of 2500 = 375).
    expect(createBookingMock).toHaveBeenCalledTimes(1);
    const insertArgs = createBookingMock.mock.calls[0]?.[0] as {
      paymentStatus: string;
      totalCents: number;
      platformFeeCents: number;
      totalPriceCents: number;
    };
    expect(insertArgs.paymentStatus).toBe('AWAITING_PAYMENT');
    expect(insertArgs.totalCents).toBe(2500);
    expect(insertArgs.platformFeeCents).toBe(375);
    expect(insertArgs.totalPriceCents).toBe(2500);
    // Checkout Session called with the right destination + fee.
    const checkoutArgs = createCheckoutSessionMock.mock.calls[0]?.[0] as {
      ownerStripeAccountId: string;
      platformFeeCents: number;
      bookingId: string;
      amountCents: number;
      idempotencyKey: string;
    };
    expect(checkoutArgs.ownerStripeAccountId).toBe('acct_test_xyz');
    expect(checkoutArgs.platformFeeCents).toBe(375);
    expect(checkoutArgs.amountCents).toBe(2500);
    expect(checkoutArgs.bookingId).toBe(VALID_BOOKING_ID);
    // Idempotency key is a per-attempt UUID prefixed with `checkout-`.
    expect(checkoutArgs.idempotencyKey).toMatch(/^checkout-/);
  });

  it('test 2 — DOUBLE_BOOKING: unique violation surfaces with the locked code', async () => {
    stubAuthedGuest();
    stubActiveDesk();
    stubPublishedSpace();
    stubActiveConnect();
    // Fake a PG unique-violation. The action's `isPgUniqueViolation`
    // classifier (real impl) checks `err.code === '23505'` +
    // `err.constraint === <name>`. Construct an error with that shape.
    const pgUniqueErr = Object.assign(new Error('unique violation'), {
      code: '23505',
      constraint: 'uniq_active_booking_per_desk_per_date',
    });
    createBookingMock.mockRejectedValueOnce(pgUniqueErr);

    const result = await createBookingWithPaymentAction(
      { status: 'idle' },
      makeFormData(),
    );

    expect(result).toEqual({
      status: 'error',
      code: 'DOUBLE_BOOKING',
      message: 'This desk is already booked for that date',
    });
    // Stripe Checkout MUST NOT be called — the slot-claim race was
    // resolved at the DB step (BA Decision §3 load-bearing).
    expect(createCheckoutSessionMock).not.toHaveBeenCalled();
  });

  it('test 3 — STRIPE_NOT_ACTIVE: owner without active Connect row blocks at the gate', async () => {
    stubAuthedGuest();
    stubActiveDesk();
    stubPublishedSpace();
    // Owner has a Connect row but charges/payouts are disabled — could
    // happen via the account.updated webhook flipping them to false.
    getConnectAccountByUserIdMock.mockResolvedValueOnce({
      userId: VALID_OWNER_ID,
      stripeAccountId: 'acct_inactive',
      chargesEnabled: false,
      payoutsEnabled: true,
      onboardingCompleted: false,
    });

    const result = await createBookingWithPaymentAction(
      { status: 'idle' },
      makeFormData(),
    );

    expect(result).toEqual({
      status: 'error',
      code: 'STRIPE_NOT_ACTIVE',
      message: "This space can't accept bookings right now.",
    });
    // Neither pre-claim nor Stripe Checkout fires (defense-in-depth
    // pure-DB-read at step 5 — BA Decision §8).
    expect(createBookingMock).not.toHaveBeenCalled();
    expect(createCheckoutSessionMock).not.toHaveBeenCalled();
  });

  it('test 4 — carry-forward errors: PAST_DATE / VALIDATION_ERROR / DESK_NOT_FOUND', async () => {
    stubAuthedGuest();

    // PAST_DATE — isPastDate returns true.
    isPastDateMock.mockReturnValueOnce(true);
    const pastDateResult = await createBookingWithPaymentAction(
      { status: 'idle' },
      makeFormData(),
    );
    expect(pastDateResult).toEqual({
      status: 'error',
      code: 'PAST_DATE',
      message: 'Booking date cannot be in the past',
    });

    // VALIDATION_ERROR — malformed UUID in deskId. isPastDate reset
    // to false (the default beforeEach state).
    isPastDateMock.mockReturnValue(false);
    const validationResult = await createBookingWithPaymentAction(
      { status: 'idle' },
      makeFormData({ deskId: 'not-a-uuid' }),
    );
    expect(validationResult.status).toBe('error');
    if (validationResult.status === 'error') {
      expect(validationResult.code).toBe('VALIDATION_ERROR');
    }

    // DESK_NOT_FOUND — desk lookup returns undefined.
    getActiveDeskByIdMock.mockResolvedValueOnce(undefined);
    const deskNotFoundResult = await createBookingWithPaymentAction(
      { status: 'idle' },
      makeFormData(),
    );
    expect(deskNotFoundResult).toEqual({
      status: 'error',
      code: 'DESK_NOT_FOUND',
      message: 'This desk is not available.',
    });
    // None of those error paths should touch the DB / Stripe.
    expect(createBookingMock).not.toHaveBeenCalled();
    expect(createCheckoutSessionMock).not.toHaveBeenCalled();
  });

  it('test 5 — Stripe Checkout failure AFTER pre-claim: INTERNAL_ERROR (no cleanup per Decision §3)', async () => {
    stubAuthedGuest();
    stubActiveDesk();
    stubPublishedSpace();
    stubActiveConnect();
    createBookingMock.mockResolvedValueOnce({
      id: VALID_BOOKING_ID,
      guestUserId: VALID_GUEST_ID,
      spaceId: VALID_SPACE_ID,
      deskId: VALID_DESK_ID,
      bookingDate: FUTURE_DATE,
      status: 'PENDING',
    });
    createCheckoutSessionMock.mockResolvedValueOnce({
      ok: false,
      error: 'Stripe API unavailable',
    });

    const result = await createBookingWithPaymentAction(
      { status: 'idle' },
      makeFormData(),
    );

    expect(result).toEqual({
      status: 'error',
      code: 'INTERNAL_ERROR',
      message: 'Stripe API unavailable',
    });
    // Pre-claim DID happen — the booking row is orphaned in
    // AWAITING_PAYMENT state. Cleanup deferred to Story 9-5 per
    // Decision §3; the test asserts the action's return shape, NOT
    // any cleanup behavior.
    expect(createBookingMock).toHaveBeenCalledTimes(1);
  });
});
