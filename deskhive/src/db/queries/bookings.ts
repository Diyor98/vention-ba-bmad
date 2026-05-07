import { and, eq, inArray, desc } from 'drizzle-orm';
import { db } from '@/db/client';
import {
  bookingsTable,
  desksTable,
  spacesTable,
  type Booking,
  type BookingStatus,
  type Desk,
  type Space,
} from '@/db/schema';

// Whitelisted "active" booking statuses. A desk on a date is unavailable iff
// at least one booking with one of these statuses exists. Mirrors the partial
// unique index `uniq_active_booking_per_desk_per_date` (Doc B §6.2).
const ACTIVE_STATUSES: BookingStatus[] = ['PENDING', 'CONFIRMED'];

export async function listActiveBookingsForSpaceOnDate(
  spaceId: string,
  isoDate: string,
): Promise<Booking[]> {
  return db
    .select()
    .from(bookingsTable)
    .where(
      and(
        eq(bookingsTable.spaceId, spaceId),
        eq(bookingsTable.bookingDate, isoDate),
        inArray(bookingsTable.status, ACTIVE_STATUSES),
      ),
    );
}

// payment_status / payment_reference stay NULL — Doc B §6.1 forward-compat
// note reserves them for Phase 2 (Stripe). Drizzle defaults omitted columns
// to NULL.
export async function createBooking(input: {
  guestUserId: string;
  spaceId: string;
  deskId: string;
  bookingDate: string;
  totalPriceCents: number;
}): Promise<Booking> {
  const [row] = await db
    .insert(bookingsTable)
    .values({ ...input, status: 'PENDING' })
    .returning();
  return row;
}

// Enriches the booking row with desk + space (single round-trip via JOIN).
// `/my-bookings` consumes this directly; admin views (US-4.x) will add a
// sibling helper that doesn't filter on guest_user_id.
//
// Order: booking_date DESC primary, created_at DESC tiebreaker (US-3.4 AC-8).
// Same-date bookings fall back to insertion recency.
export async function listBookingsForGuest(
  guestUserId: string,
): Promise<Array<{ booking: Booking; desk: Desk; space: Space }>> {
  return db
    .select({
      booking: bookingsTable,
      desk: desksTable,
      space: spacesTable,
    })
    .from(bookingsTable)
    .innerJoin(desksTable, eq(bookingsTable.deskId, desksTable.id))
    .innerJoin(spacesTable, eq(bookingsTable.spaceId, spacesTable.id))
    .where(eq(bookingsTable.guestUserId, guestUserId))
    .orderBy(desc(bookingsTable.bookingDate), desc(bookingsTable.createdAt));
}
