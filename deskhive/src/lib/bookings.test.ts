import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { BookingDispatchInfo } from '@/db/queries/bookings';

// Story 8-3: mocks at hoist time. `sendEmail` is the side-effect we
// assert against; `getBookingDispatchInfo` is mocked per-test to feed
// the decision-branch matrix.
//
// The getBookingDispatchInfo function lives in @/db/queries/bookings
// (not src/lib/bookings.ts where the notify* functions live) — vi.mock
// of the same module can't intercept intra-module function calls, so
// the query was lifted to a separate module specifically to be mockable
// here.
const {
  sendEmailMock,
  dispatchInfoMock,
  // Story 8-4: payment-driven email sender helper mocks.
  getBookingByPaymentIntentIdMock,
  getConnectAccountByStripeAccountIdMock,
  getUserByIdMock,
} = vi.hoisted(() => ({
  sendEmailMock: vi.fn().mockResolvedValue({ status: 'sent' as const }),
  dispatchInfoMock: vi.fn(),
  getBookingByPaymentIntentIdMock: vi.fn(),
  getConnectAccountByStripeAccountIdMock: vi.fn(),
  getUserByIdMock: vi.fn(),
}));

vi.mock('@/lib/email', async () => {
  const actual = await vi.importActual<typeof import('@/lib/email')>(
    '@/lib/email',
  );
  return {
    ...actual,
    sendEmail: sendEmailMock,
  };
});

vi.mock('@/db/queries/bookings', async () => {
  const actual = await vi.importActual<
    typeof import('@/db/queries/bookings')
  >('@/db/queries/bookings');
  return {
    ...actual,
    getBookingDispatchInfo: dispatchInfoMock,
    // Story 8-4: payment-receipt + payment-refund sender helpers use
    // this to look up the booking from a Stripe paymentIntent id, then
    // pass booking.id to getBookingDispatchInfo for the recipient bundle.
    getBookingByPaymentIntentId: getBookingByPaymentIntentIdMock,
  };
});

// Story 8-4: payout-summary sender helper uses these.
vi.mock('@/db/queries/stripe-connect', () => ({
  getConnectAccountByStripeAccountId: getConnectAccountByStripeAccountIdMock,
}));

vi.mock('@/db/queries/users', () => ({
  getUserById: getUserByIdMock,
}));

import {
  notifyBookingRequested,
  notifyBookingConfirmed,
  notifyBookingRejected,
  notifyBookingCancelledByGuest,
  // Story 8-4 — payment-driven email senders.
  sendPaymentReceiptEmail,
  sendRefundConfirmationEmail,
  sendPayoutNotificationEmail,
} from './bookings';

const OWNER_ID = '00000000-0000-0000-0000-0000000000a1';
const ADMIN_ID = '00000000-0000-0000-0000-0000000000a2';

function makeInfo(opts: {
  hasOwner: boolean;
  ownerId?: string;
}): BookingDispatchInfo {
  return {
    booking: {
      id: '00000000-0000-0000-0000-0000000000b1',
      guestUserId: '00000000-0000-0000-0000-0000000000c1',
      spaceId: '00000000-0000-0000-0000-0000000000d1',
      deskId: '00000000-0000-0000-0000-0000000000e1',
      bookingDate: '2026-08-26',
      status: 'PENDING',
      totalPriceCents: 2500,
      paymentStatus: null,
      paymentReference: null,
      // Story 9-3 fields — Phase 1 fixtures use the column defaults.
      paymentIntentId: null,
      totalCents: 0,
      platformFeeCents: 0,
      // Story 9-6 fields — NULL until/unless refunded.
      refundedAt: null,
      refundAmountCents: null,
      createdAt: new Date('2026-05-13T10:00:00Z'),
      updatedAt: new Date('2026-05-13T10:00:00Z'),
    },
    space: {
      id: '00000000-0000-0000-0000-0000000000d1',
      name: 'Sundial Coworks',
      city: 'Tashkent',
      addressLine: '23 Amir Temur',
      description: 'Test space',
      primaryImageUrl: 'https://example.com/img.jpg',
      status: 'PUBLISHED',
      ownerId: opts.hasOwner ? (opts.ownerId ?? OWNER_ID) : null,
      createdAt: new Date('2026-05-13T10:00:00Z'),
      updatedAt: new Date('2026-05-13T10:00:00Z'),
    },
    desk: {
      id: '00000000-0000-0000-0000-0000000000e1',
      spaceId: '00000000-0000-0000-0000-0000000000d1',
      label: 'Desk 1',
      dailyPriceCents: 2500,
      isActive: true,
      createdAt: new Date('2026-05-13T10:00:00Z'),
      updatedAt: new Date('2026-05-13T10:00:00Z'),
    },
    guest: { email: 'guest@example.com', fullName: 'Guest User' },
    owner: opts.hasOwner
      ? { email: 'owner@example.com', fullName: 'Owner User' }
      : null,
  };
}

beforeEach(() => {
  sendEmailMock.mockClear();
  dispatchInfoMock.mockReset();
});

describe('notifyBookingRequested (Story 8-3 Decision §1)', () => {
  it('fires guest + owner emails when space has an owner', async () => {
    dispatchInfoMock.mockResolvedValueOnce(makeInfo({ hasOwner: true }));
    await notifyBookingRequested('bookingId');
    expect(sendEmailMock).toHaveBeenCalledTimes(2);
    const templates = sendEmailMock.mock.calls.map((c) => c[0].template);
    expect(templates).toContain('booking-requested-guest');
    expect(templates).toContain('booking-requested-owner');
  });

  it('Decision §1: skips owner email when space.owner_id is NULL', async () => {
    dispatchInfoMock.mockResolvedValueOnce(makeInfo({ hasOwner: false }));
    await notifyBookingRequested('bookingId');
    expect(sendEmailMock).toHaveBeenCalledTimes(1);
    expect(sendEmailMock.mock.calls[0][0].template).toBe('booking-requested-guest');
  });

  it('early-returns when dispatch info is missing (defensive)', async () => {
    dispatchInfoMock.mockResolvedValueOnce(null);
    await notifyBookingRequested('bookingId');
    expect(sendEmailMock).not.toHaveBeenCalled();
  });
});

describe('notifyBookingConfirmed (Story 8-3 Decision §3 self-action skip)', () => {
  it('fires guest + owner emails when actor is admin (different from owner)', async () => {
    dispatchInfoMock.mockResolvedValueOnce(
      makeInfo({ hasOwner: true, ownerId: OWNER_ID }),
    );
    await notifyBookingConfirmed('bookingId', ADMIN_ID);
    expect(sendEmailMock).toHaveBeenCalledTimes(2);
    const templates = sendEmailMock.mock.calls.map((c) => c[0].template);
    expect(templates).toContain('booking-confirmed-guest');
    expect(templates).toContain('booking-confirmed-owner');
  });

  it('Decision §3: skips owner email when actor IS the owner (self-action)', async () => {
    dispatchInfoMock.mockResolvedValueOnce(
      makeInfo({ hasOwner: true, ownerId: OWNER_ID }),
    );
    await notifyBookingConfirmed('bookingId', OWNER_ID);
    expect(sendEmailMock).toHaveBeenCalledTimes(1);
    expect(sendEmailMock.mock.calls[0][0].template).toBe('booking-confirmed-guest');
  });

  it('Decision §1 + §3 combined: skips owner email on NULL-owner space regardless of actor', async () => {
    dispatchInfoMock.mockResolvedValueOnce(makeInfo({ hasOwner: false }));
    await notifyBookingConfirmed('bookingId', ADMIN_ID);
    expect(sendEmailMock).toHaveBeenCalledTimes(1);
    expect(sendEmailMock.mock.calls[0][0].template).toBe('booking-confirmed-guest');
  });
});

describe('notifyBookingRejected (Story 8-3 Decision §3 self-action skip)', () => {
  it('fires guest + owner emails when actor is admin', async () => {
    dispatchInfoMock.mockResolvedValueOnce(
      makeInfo({ hasOwner: true, ownerId: OWNER_ID }),
    );
    await notifyBookingRejected('bookingId', ADMIN_ID);
    expect(sendEmailMock).toHaveBeenCalledTimes(2);
    const templates = sendEmailMock.mock.calls.map((c) => c[0].template);
    expect(templates).toContain('booking-rejected-guest');
    expect(templates).toContain('booking-rejected-owner');
  });

  it('Decision §3: skips owner email when actor IS the owner', async () => {
    dispatchInfoMock.mockResolvedValueOnce(
      makeInfo({ hasOwner: true, ownerId: OWNER_ID }),
    );
    await notifyBookingRejected('bookingId', OWNER_ID);
    expect(sendEmailMock).toHaveBeenCalledTimes(1);
    expect(sendEmailMock.mock.calls[0][0].template).toBe('booking-rejected-guest');
  });
});

describe('notifyBookingCancelledByGuest (Story 8-3 Decision §2 previous-status)', () => {
  it('fires both emails when previousStatus is CONFIRMED', async () => {
    dispatchInfoMock.mockResolvedValueOnce(makeInfo({ hasOwner: true }));
    await notifyBookingCancelledByGuest('bookingId', 'CONFIRMED');
    expect(sendEmailMock).toHaveBeenCalledTimes(2);
    const templates = sendEmailMock.mock.calls.map((c) => c[0].template);
    expect(templates).toContain('booking-cancelled-guest');
    expect(templates).toContain('booking-cancelled-owner');
  });

  it('Decision §2: skips owner email when previousStatus is PENDING (noise, not signal)', async () => {
    dispatchInfoMock.mockResolvedValueOnce(makeInfo({ hasOwner: true }));
    await notifyBookingCancelledByGuest('bookingId', 'PENDING');
    expect(sendEmailMock).toHaveBeenCalledTimes(1);
    expect(sendEmailMock.mock.calls[0][0].template).toBe('booking-cancelled-guest');
  });

  it('Decision §1 + §2 combined: skips owner email on NULL-owner regardless of previousStatus', async () => {
    dispatchInfoMock.mockResolvedValueOnce(makeInfo({ hasOwner: false }));
    await notifyBookingCancelledByGuest('bookingId', 'CONFIRMED');
    expect(sendEmailMock).toHaveBeenCalledTimes(1);
    expect(sendEmailMock.mock.calls[0][0].template).toBe('booking-cancelled-guest');
  });
});

// ─────────────────────────────────────────────────────────────────────
// Story 8-4 — payment-driven email sender helper tests. 3 happy-path
// tests verifying the lookup + sendEmail call shape, including the
// unified resource-id idempotency-key shape (BA Decision §7).
// ─────────────────────────────────────────────────────────────────────

describe('sendPaymentReceiptEmail (Story 8-4)', () => {
  it('happy path — looks up booking by PI + dispatch info + calls sendEmail with payment-receipt template + receipt-${piId} key', async () => {
    getBookingByPaymentIntentIdMock.mockResolvedValueOnce({
      id: 'booking-uuid-1',
      paymentIntentId: 'pi_test_captured',
      totalCents: 2500,
    });
    dispatchInfoMock.mockResolvedValueOnce(makeInfo({ hasOwner: true }));

    await sendPaymentReceiptEmail({
      paymentIntentId: 'pi_test_captured',
      amountCents: 2500,
      idempotencyKey: 'receipt-pi_test_captured',
    });

    expect(getBookingByPaymentIntentIdMock).toHaveBeenCalledWith(
      'pi_test_captured',
    );
    expect(dispatchInfoMock).toHaveBeenCalledWith('booking-uuid-1');
    expect(sendEmailMock).toHaveBeenCalledTimes(1);
    const call = sendEmailMock.mock.calls[0][0];
    expect(call.template).toBe('payment-receipt');
    expect(call.to).toBe('guest@example.com'); // from makeInfo()'s default guest email
    expect(call.data).toMatchObject({
      spaceName: 'Sundial Coworks',
      bookingDate: '2026-08-26',
      amountCents: 2500,
    });
    // BA Decision §7 LOAD-BEARING: unified resource-id idempotency key.
    expect(call.idempotencyKey).toBe('receipt-pi_test_captured');
  });
});

describe('sendRefundConfirmationEmail (Story 8-4)', () => {
  it('happy path — calls sendEmail with payment-refund template + refund-${piId} key', async () => {
    getBookingByPaymentIntentIdMock.mockResolvedValueOnce({
      id: 'booking-uuid-2',
      paymentIntentId: 'pi_test_refunded',
      totalCents: 2500,
    });
    dispatchInfoMock.mockResolvedValueOnce(makeInfo({ hasOwner: true }));

    await sendRefundConfirmationEmail({
      paymentIntentId: 'pi_test_refunded',
      amountCents: 2500,
      idempotencyKey: 'refund-pi_test_refunded',
    });

    expect(sendEmailMock).toHaveBeenCalledTimes(1);
    const call = sendEmailMock.mock.calls[0][0];
    expect(call.template).toBe('payment-refund');
    expect(call.idempotencyKey).toBe('refund-pi_test_refunded');
    expect(call.data).toMatchObject({
      spaceName: 'Sundial Coworks',
      bookingDate: '2026-08-26',
      amountCents: 2500,
    });
  });
});

describe('sendPayoutNotificationEmail (Story 8-4)', () => {
  it('happy path — looks up Connect account + owner + calls sendEmail with payout-summary template + payout-${id} key', async () => {
    getConnectAccountByStripeAccountIdMock.mockResolvedValueOnce({
      id: 'connect-row-1',
      userId: '00000000-0000-0000-0000-0000000000aa',
      stripeAccountId: 'acct_test_owner_connect',
      chargesEnabled: true,
      payoutsEnabled: true,
      onboardingCompleted: true,
    });
    getUserByIdMock.mockResolvedValueOnce({
      id: '00000000-0000-0000-0000-0000000000aa',
      email: 'owner@deskhive.local',
      fullName: 'Bobur Tashkentov',
    });

    await sendPayoutNotificationEmail({
      stripeAccountId: 'acct_test_owner_connect',
      payoutAmountCents: 21250,
      idempotencyKey: 'payout-po_test_123',
    });

    expect(getConnectAccountByStripeAccountIdMock).toHaveBeenCalledWith(
      'acct_test_owner_connect',
    );
    expect(getUserByIdMock).toHaveBeenCalledWith(
      '00000000-0000-0000-0000-0000000000aa',
    );
    expect(sendEmailMock).toHaveBeenCalledTimes(1);
    const call = sendEmailMock.mock.calls[0][0];
    expect(call.template).toBe('payout-summary');
    expect(call.to).toBe('owner@deskhive.local');
    expect(call.idempotencyKey).toBe('payout-po_test_123');
    expect(call.data).toMatchObject({
      ownerName: 'Bobur Tashkentov',
      payoutAmountCents: 21250,
    });
  });
});
