import { and, eq, inArray, desc } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { db } from '@/db/client';
import {
  bookingsTable,
  desksTable,
  spacesTable,
  usersTable,
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

// Story 9-3: signature extended with three optional fields populated by
// the booking-with-payment flow (`createBookingWithPaymentAction`):
//
//   • paymentStatus — 'AWAITING_PAYMENT' on pre-claim, transitions to
//     'AUTHORIZED' via return-URL handler / webhook backstop.
//   • totalCents — Stripe Checkout line-item total (cents).
//   • platformFeeCents — DeskHive's 15% cut (cents); Stripe routes the
//     remainder to the connected account on capture.
//
// Phase 1 callers (REST API `/api/bookings`) omit these — Drizzle
// defaults `payment_intent_id` + `payment_status` to NULL,
// `total_cents` + `platform_fee_cents` to 0 (PG column defaults).
// The Phase 1 `payment_reference` column stays NULL too (Doc B §6.1
// forward-compat reserves it for an unrelated future use).
export async function createBooking(input: {
  guestUserId: string;
  spaceId: string;
  deskId: string;
  bookingDate: string;
  totalPriceCents: number;
  paymentStatus?: 'AWAITING_PAYMENT' | 'AUTHORIZED';
  totalCents?: number;
  platformFeeCents?: number;
}): Promise<Booking> {
  const [row] = await db
    .insert(bookingsTable)
    .values({ ...input, status: 'PENDING' })
    .returning();
  return row;
}

export async function getBookingById(
  id: string,
): Promise<Booking | undefined> {
  const [row] = await db
    .select()
    .from(bookingsTable)
    .where(eq(bookingsTable.id, id))
    .limit(1);
  return row;
}

// Admin-facing variant: returns ALL bookings (no guest_user_id filter)
// enriched with desk + space + a redacted guest record. Field selection on
// the users JOIN is explicit (id, email, fullName) — never include
// hashedPassword / emailVerified / etc., even for admin consumers.
export async function listAllBookings(): Promise<
  Array<{
    booking: Booking;
    desk: Desk;
    space: Space;
    guest: { id: string; email: string; fullName: string };
  }>
> {
  return db
    .select({
      booking: bookingsTable,
      desk: desksTable,
      space: spacesTable,
      guest: {
        id: usersTable.id,
        email: usersTable.email,
        fullName: usersTable.fullName,
      },
    })
    .from(bookingsTable)
    .innerJoin(desksTable, eq(bookingsTable.deskId, desksTable.id))
    .innerJoin(spacesTable, eq(bookingsTable.spaceId, spacesTable.id))
    .innerJoin(usersTable, eq(bookingsTable.guestUserId, usersTable.id))
    .orderBy(desc(bookingsTable.bookingDate), desc(bookingsTable.createdAt));
}

/**
 * Conditional UPDATE: cancels a PENDING booking owned by `guestUserId`.
 * Returns the updated row on success; `undefined` if the row's status was
 * no longer PENDING by the time the UPDATE ran (race), if the row doesn't
 * exist, or if `guestUserId` doesn't match the row's owner.
 *
 * Architecture §"Booking state-machine race safety": every transition's
 * UPDATE includes the source state in WHERE — no unconditional UPDATEs.
 * The owner clause is defense-in-depth alongside `requireOwnership` at the
 * action layer.
 */
export async function cancelBooking(
  id: string,
  guestUserId: string,
): Promise<Booking | undefined> {
  const [row] = await db
    .update(bookingsTable)
    .set({ status: 'CANCELLED', updatedAt: new Date() })
    .where(
      and(
        eq(bookingsTable.id, id),
        eq(bookingsTable.status, 'PENDING'),
        eq(bookingsTable.guestUserId, guestUserId),
      ),
    )
    .returning();
  return row;
}

/**
 * Conditional UPDATE: confirms a PENDING booking. Admin scope — no ownership
 * clause (admin acts on any booking). Returns the updated row on success;
 * `undefined` when the row is no longer PENDING (race against Guest cancel)
 * or doesn't exist.
 *
 * Same conditional-UPDATE shape as cancelBooking, minus the guest_user_id
 * clause. US-4.3's rejectBooking will be identical with target REJECTED.
 */
export async function confirmBooking(
  id: string,
): Promise<Booking | undefined> {
  const [row] = await db
    .update(bookingsTable)
    .set({ status: 'CONFIRMED', updatedAt: new Date() })
    .where(and(eq(bookingsTable.id, id), eq(bookingsTable.status, 'PENDING')))
    .returning();
  return row;
}

/**
 * Conditional UPDATE: rejects a PENDING booking. Admin scope — no ownership
 * clause. Returns the updated row on success; `undefined` when the row is no
 * longer PENDING (race against Guest cancel or Admin confirm) or doesn't exist.
 *
 * Same shape as confirmBooking with target REJECTED. Final state-transition
 * helper of Phase 1; with cancelBooking + confirmBooking, all three Phase 1
 * transitions out of PENDING are wired up. (Phase 2 may add a fourth via the
 * Stripe webhook → REFUNDED path.)
 */
export async function rejectBooking(
  id: string,
): Promise<Booking | undefined> {
  const [row] = await db
    .update(bookingsTable)
    .set({ status: 'REJECTED', updatedAt: new Date() })
    .where(and(eq(bookingsTable.id, id), eq(bookingsTable.status, 'PENDING')))
    .returning();
  return row;
}

/**
 * Story 9-3: mark a pre-claimed booking as AUTHORIZED after the Guest
 * completes Stripe Checkout. Called by the return-from-Checkout Server
 * Component AND the `checkout.session.completed` webhook backstop —
 * idempotent UPDATE (running twice with the same paymentIntentId is a
 * no-op transition).
 *
 * The conditional WHERE clause restricts the update to rows still in
 * the pre-claim state (`payment_status = 'AWAITING_PAYMENT'`) so a
 * webhook arriving AFTER the return-URL handler already wrote
 * `AUTHORIZED` becomes a no-op (`returning()` is empty). The handler
 * detects the no-op and skips inserting into `webhook_events` —
 * mirrors 9-2's "only insert on first real handle" anti-pattern.
 */
export async function markBookingAuthorized(args: {
  bookingId: string;
  paymentIntentId: string;
}): Promise<Booking | undefined> {
  const [row] = await db
    .update(bookingsTable)
    .set({
      paymentIntentId: args.paymentIntentId,
      paymentStatus: 'AUTHORIZED',
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(bookingsTable.id, args.bookingId),
        eq(bookingsTable.paymentStatus, 'AWAITING_PAYMENT'),
      ),
    )
    .returning();
  return row;
}

/**
 * Story 9-4: mark a PENDING + AUTHORIZED booking as CONFIRMED + CAPTURED
 * after `stripe.paymentIntents.capture` succeeds. Called by
 * `confirmBookingAction` AFTER the Stripe call returns ok (Stripe-first-
 * then-DB ordering per BA Decision §2).
 *
 * The conditional WHERE restricts to rows currently in (PENDING,
 * AUTHORIZED) — same race-safety net as `markBookingAuthorized`. A
 * concurrent Guest cancel (Phase 1's cancelBookingAction; will be
 * extended in 9-6), a future Story 9-5 webhook backstop racing the
 * action's DB write, or a stale-retry would leave the row outside
 * that window, and `.returning()` is empty. Caller treats the empty
 * return as the Phase 1 `CANNOT_CONFIRM` error code (carry-forward).
 *
 * NB: Stripe has already captured the funds when we get here (the
 * action calls Stripe FIRST). If this UPDATE no-ops because of the
 * race, the booking is in an inconsistent state — Stripe has funds,
 * DB still says AUTHORIZED. Story 9-5's webhook backstop
 * (`payment_intent.succeeded`) will reconcile via the same conditional
 * UPDATE. Until 9-5 lands, the rare-but-real ops risk is acknowledged
 * per BA Decision §8.
 */
export async function markBookingConfirmedAndCaptured(
  id: string,
): Promise<Booking | undefined> {
  const [row] = await db
    .update(bookingsTable)
    .set({
      status: 'CONFIRMED',
      paymentStatus: 'CAPTURED',
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(bookingsTable.id, id),
        eq(bookingsTable.status, 'PENDING'),
        eq(bookingsTable.paymentStatus, 'AUTHORIZED'),
      ),
    )
    .returning();
  return row;
}

/**
 * Story 9-4: mark a PENDING + AUTHORIZED booking as REJECTED + VOIDED
 * after `stripe.paymentIntents.cancel` succeeds. Mirror shape of
 * `markBookingConfirmedAndCaptured`. Conditional WHERE provides the
 * same race-safety net.
 */
export async function markBookingRejectedAndVoided(
  id: string,
): Promise<Booking | undefined> {
  const [row] = await db
    .update(bookingsTable)
    .set({
      status: 'REJECTED',
      paymentStatus: 'VOIDED',
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(bookingsTable.id, id),
        eq(bookingsTable.status, 'PENDING'),
        eq(bookingsTable.paymentStatus, 'AUTHORIZED'),
      ),
    )
    .returning();
  return row;
}

// Story 8-3: dispatch-info join for booking notification emails. Returns
// booking + space + desk + guest (inner-join, FK NOT NULL) + owner (left-
// join via space.owner_id, nullable). The owner field is null when the
// space has no owner (Decision §1 path).
//
// Lives in this file (rather than in src/lib/bookings.ts where the
// notify* functions live) because Story 8-3 unit tests mock this import
// via vi.mock('@/db/queries/bookings', ...) — intra-module function calls
// in src/lib/bookings.ts can't be intercepted by vi.mock of the same
// module.

export type BookingDispatchInfo = {
  booking: Booking;
  space: Space;
  desk: Desk;
  guest: { email: string; fullName: string };
  owner: { email: string; fullName: string } | null;
};

const ownerUsers = alias(usersTable, 'owner_users');

export async function getBookingDispatchInfo(
  bookingId: string,
): Promise<BookingDispatchInfo | null> {
  const [row] = await db
    .select({
      booking: bookingsTable,
      space: spacesTable,
      desk: desksTable,
      guest: {
        email: usersTable.email,
        fullName: usersTable.fullName,
      },
      owner: {
        email: ownerUsers.email,
        fullName: ownerUsers.fullName,
      },
    })
    .from(bookingsTable)
    .innerJoin(spacesTable, eq(bookingsTable.spaceId, spacesTable.id))
    .innerJoin(desksTable, eq(bookingsTable.deskId, desksTable.id))
    .innerJoin(usersTable, eq(bookingsTable.guestUserId, usersTable.id))
    .leftJoin(ownerUsers, eq(spacesTable.ownerId, ownerUsers.id))
    .where(eq(bookingsTable.id, bookingId))
    .limit(1);

  if (!row) return null;

  // Drizzle's leftJoin returns owner.email/fullName as null when the
  // join misses. Normalize to a typed `{ email; fullName } | null` so
  // callers branch cleanly on `info.owner !== null`.
  const owner =
    row.owner && row.owner.email !== null && row.owner.fullName !== null
      ? { email: row.owner.email, fullName: row.owner.fullName }
      : null;

  return {
    booking: row.booking,
    space: row.space,
    desk: row.desk,
    guest: row.guest,
    owner,
  };
}

// Story 7-5: owner-scoped variant of listAllBookings. Same JOIN shape and
// safe-field-projection rules; filters on spaces.owner_id at the SQL layer
// (authoritative seam). SUPER_ADMIN still uses listAllBookings for the
// platform-wide /admin/bookings view (Decision §7).
export async function listBookingsForOwner(
  ownerId: string,
): Promise<
  Array<{
    booking: Booking;
    desk: Desk;
    space: Space;
    guest: { id: string; email: string; fullName: string };
  }>
> {
  return db
    .select({
      booking: bookingsTable,
      desk: desksTable,
      space: spacesTable,
      guest: {
        id: usersTable.id,
        email: usersTable.email,
        fullName: usersTable.fullName,
      },
    })
    .from(bookingsTable)
    .innerJoin(desksTable, eq(bookingsTable.deskId, desksTable.id))
    .innerJoin(spacesTable, eq(bookingsTable.spaceId, spacesTable.id))
    .innerJoin(usersTable, eq(bookingsTable.guestUserId, usersTable.id))
    .where(eq(spacesTable.ownerId, ownerId))
    .orderBy(desc(bookingsTable.bookingDate), desc(bookingsTable.createdAt));
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
