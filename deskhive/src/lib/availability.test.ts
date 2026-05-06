import { describe, it, expect } from 'vitest';
import { computeDeskAvailability } from './availability';
import type { Booking, Desk } from '@/db/schema';

function mkDesk(id: string): Desk {
  return {
    id,
    spaceId: 'space-1',
    label: `Desk-${id}`,
    dailyPriceCents: 2500,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

function mkBooking(deskId: string): Booking {
  return {
    id: `b-${deskId}`,
    guestUserId: 'user-1',
    spaceId: 'space-1',
    deskId,
    bookingDate: '2099-12-31',
    status: 'CONFIRMED',
    totalPriceCents: 2500,
    paymentStatus: null,
    paymentReference: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

describe('computeDeskAvailability', () => {
  it('marks all desks available when no active bookings exist', () => {
    const desks = [mkDesk('a'), mkDesk('b')];
    const result = computeDeskAvailability(desks, []);
    expect(result.get('a')).toBe(true);
    expect(result.get('b')).toBe(true);
  });

  it('marks only the booked desk as unavailable', () => {
    const desks = [mkDesk('a'), mkDesk('b')];
    const result = computeDeskAvailability(desks, [mkBooking('a')]);
    expect(result.get('a')).toBe(false);
    expect(result.get('b')).toBe(true);
  });

  it('returns an empty map for no desks', () => {
    const result = computeDeskAvailability([], [mkBooking('a')]);
    expect(result.size).toBe(0);
  });

  it('ignores bookings for desks that are not in the supplied list', () => {
    const desks = [mkDesk('a')];
    const result = computeDeskAvailability(desks, [mkBooking('z')]);
    expect(result.get('a')).toBe(true);
    expect(result.has('z')).toBe(false);
  });
});
