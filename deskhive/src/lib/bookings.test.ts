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
const { sendEmailMock, dispatchInfoMock } = vi.hoisted(() => ({
  sendEmailMock: vi.fn().mockResolvedValue({ status: 'sent' as const }),
  dispatchInfoMock: vi.fn(),
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
  };
});

import {
  notifyBookingRequested,
  notifyBookingConfirmed,
  notifyBookingRejected,
  notifyBookingCancelledByGuest,
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
