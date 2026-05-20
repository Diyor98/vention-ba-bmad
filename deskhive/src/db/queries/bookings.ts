import { and, count, eq, inArray, desc } from 'drizzle-orm';
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

/**
 * DESIGN-INT-GAPS-PASS-2 Round 4 Gap F — count of desks that are
 * "actively held" today, grouped by space. Reuses ACTIVE_STATUSES
 * (PENDING + CONFIRMED) — the same set that powers the per-desk
 * availability invariant + partial unique index, so the spots-left
 * math and the booking-create gate agree on which bookings count.
 *
 * Returns Map<spaceId, count>. Spaces with zero active bookings on
 * the date are absent from the map (caller treats absent as 0).
 *
 * `isoDate` is the YYYY-MM-DD string against which `booking_date`
 * is filtered. Caller computes "today" server-side and passes it
 * here so the same date can be reused for related reads
 * (e.g. future "available now" filters).
 */
export async function getActiveBookingCountByDateAndSpaceIds(
  spaceIds: string[],
  isoDate: string,
): Promise<Map<string, number>> {
  if (spaceIds.length === 0) return new Map();
  const rows = await db
    .select({
      spaceId: bookingsTable.spaceId,
      n: count(),
    })
    .from(bookingsTable)
    .where(
      and(
        inArray(bookingsTable.spaceId, spaceIds),
        eq(bookingsTable.bookingDate, isoDate),
        inArray(bookingsTable.status, ACTIVE_STATUSES),
      ),
    )
    .groupBy(bookingsTable.spaceId);
  const out = new Map<string, number>();
  for (const r of rows) out.set(r.spaceId, Number(r.n));
  return out;
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

/**
 * Story 9-5: lookup helper for the payment_intent.* webhook handlers.
 * Returns the booking row whose `payment_intent_id` matches, or
 * undefined when no row exists.
 *
 * Used BEFORE the conditional UPDATE so the handler can distinguish
 * "no booking matches this PI" (return deferred — Stripe retries) from
 * "booking matches but already in target state" (return idempotent —
 * the 9-4 action's DB write won the race; webhook backstop is a no-op).
 *
 * The PI ID is the load-bearing join column (BA Decision §5): the PI
 * is the Stripe-side resource that changed state, and 9-3 created
 * `bookings.payment_intent_id` for exactly this lookup. Metadata-
 * `bookingId` is technically equivalent but adds a fragile dependency
 * on Stripe preserving metadata across the PI lifecycle.
 */
export async function getBookingByPaymentIntentId(
  paymentIntentId: string,
): Promise<Booking | undefined> {
  const [row] = await db
    .select()
    .from(bookingsTable)
    .where(eq(bookingsTable.paymentIntentId, paymentIntentId))
    .limit(1);
  return row;
}

/**
 * Story 9-5: webhook backstop for capture (payment_intent.succeeded
 * handler). Mirror of 9-4's `markBookingConfirmedAndCaptured` keyed on
 * `payment_intent_id` instead of booking `id`. Closes the narrow ops
 * window 9-4 documented (Stripe-capture-succeeds-but-DB-write-fails
 * leaves booking stuck in PENDING + AUTHORIZED).
 *
 * Same 2-condition conditional WHERE (`status='PENDING' AND
 * payment_status='AUTHORIZED'`) — race-safety net against the 9-4
 * action's DB write winning first OR a duplicate webhook delivery.
 *
 * On a returned row: handler reports `{ ok: true, handled: true }` →
 * route inserts `webhook_events`. On undefined: handler reports
 * `{ ok: true, idempotent: true }` → route does NOT insert (preserved
 * 9-2 / 9-3 anti-pattern).
 */
export async function markBookingConfirmedAndCapturedByPaymentIntent(
  paymentIntentId: string,
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
        eq(bookingsTable.paymentIntentId, paymentIntentId),
        eq(bookingsTable.status, 'PENDING'),
        eq(bookingsTable.paymentStatus, 'AUTHORIZED'),
      ),
    )
    .returning();
  return row;
}

/**
 * Story 9-5: webhook backstop for reject (payment_intent.canceled
 * handler). Mirror shape of `markBookingConfirmedAndCapturedByPaymentIntent`
 * with target state (REJECTED, VOIDED).
 */
export async function markBookingRejectedAndVoidedByPaymentIntent(
  paymentIntentId: string,
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
        eq(bookingsTable.paymentIntentId, paymentIntentId),
        eq(bookingsTable.status, 'PENDING'),
        eq(bookingsTable.paymentStatus, 'AUTHORIZED'),
      ),
    )
    .returning();
  return row;
}

/**
 * Story 9-6: Phase 2 PENDING Guest-cancel. Transitions
 * (PENDING, AUTHORIZED) → (CANCELLED, VOIDED). Called by
 * `cancelBookingAction`'s Phase 2 PENDING branch AFTER `cancelPaymentIntent`
 * succeeds (releasing the Stripe auth hold).
 *
 * Conditional WHERE keyed on (id, status='PENDING',
 * payment_status='AUTHORIZED', guest_user_id) — race-safety net AND
 * ownership defense-in-depth (alongside the action's `requireOwnership`
 * check). The `guest_user_id` clause distinguishes this from 9-4's
 * `markBookingRejectedAndVoided` which has no ownership clause (admin/
 * owner reject is platform-side; this Guest-cancel is user-side).
 *
 * Returns the updated row on success; `undefined` when the row is no
 * longer in (PENDING, AUTHORIZED) or doesn't belong to guestUserId.
 * The action surfaces an empty return as Phase 1's CANNOT_CANCEL code
 * (carry-forward).
 */
export async function markBookingCancelledAndVoided(
  id: string,
  guestUserId: string,
): Promise<Booking | undefined> {
  const [row] = await db
    .update(bookingsTable)
    .set({
      status: 'CANCELLED',
      paymentStatus: 'VOIDED',
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(bookingsTable.id, id),
        eq(bookingsTable.status, 'PENDING'),
        eq(bookingsTable.paymentStatus, 'AUTHORIZED'),
        eq(bookingsTable.guestUserId, guestUserId),
      ),
    )
    .returning();
  return row;
}

/**
 * Story 9-6: Phase 2 CONFIRMED Guest-cancel with full refund. Transitions
 * (CONFIRMED, CAPTURED) → (CANCELLED, REFUNDED) and writes refunded_at
 * + refund_amount_cents atomically. Called by `cancelBookingAction`'s
 * Phase 2 CONFIRMED branch AFTER `createRefund` succeeds.
 *
 * Conditional WHERE keyed on (id, status='CONFIRMED',
 * payment_status='CAPTURED', guest_user_id) — same race-safety + ownership
 * defense as `markBookingCancelledAndVoided`.
 *
 * `refundAmountCents` argument is the caller's authoritative value
 * (booking.totalCents for Phase 2 full-refund-only). Phase 3 partial
 * refunds may pass a smaller value.
 *
 * Returns the updated row on success; `undefined` when the row is no
 * longer in (CONFIRMED, CAPTURED) (e.g., already refunded by a prior
 * delivery of the charge.refunded webhook) or doesn't belong to
 * guestUserId. Caller surfaces empty return as CANNOT_CANCEL.
 */
export async function markBookingCancelledAndRefunded(
  id: string,
  guestUserId: string,
  refundAmountCents: number,
): Promise<Booking | undefined> {
  const [row] = await db
    .update(bookingsTable)
    .set({
      status: 'CANCELLED',
      paymentStatus: 'REFUNDED',
      refundedAt: new Date(),
      refundAmountCents,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(bookingsTable.id, id),
        eq(bookingsTable.status, 'CONFIRMED'),
        eq(bookingsTable.paymentStatus, 'CAPTURED'),
        eq(bookingsTable.guestUserId, guestUserId),
      ),
    )
    .returning();
  return row;
}

/**
 * Story 9-6: webhook backstop for the `charge.refunded` handler. Same
 * state transition as `markBookingCancelledAndRefunded` but keyed on
 * `payment_intent_id` (no guest_user_id clause — the webhook doesn't
 * know who initiated; the PI uniqueness is the join key per the BA
 * Decision §5 lookup-by-PI pattern from 9-5).
 *
 * Used by `handleChargeRefunded` as the Stripe-side-truth-syncing
 * backstop for the narrow window where the action's DB write fails
 * AFTER `stripe.refunds.create` succeeds. Mirrors 9-5's
 * `markBookingConfirmedAndCapturedByPaymentIntent` /
 * `markBookingRejectedAndVoidedByPaymentIntent` pattern.
 *
 * BA Decision §11: 9-5's audit-gap-on-retry pattern is accepted for
 * this handler. The bookings row IS the financial audit trail
 * (refunded_at + refund_amount_cents + payment_status); webhook_events
 * is operational, not financial. No transactional write-with-rollback.
 */
export async function markBookingCancelledAndRefundedByPaymentIntent(
  paymentIntentId: string,
  refundAmountCents: number,
): Promise<Booking | undefined> {
  const [row] = await db
    .update(bookingsTable)
    .set({
      status: 'CANCELLED',
      paymentStatus: 'REFUNDED',
      refundedAt: new Date(),
      refundAmountCents,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(bookingsTable.paymentIntentId, paymentIntentId),
        eq(bookingsTable.status, 'CONFIRMED'),
        eq(bookingsTable.paymentStatus, 'CAPTURED'),
      ),
    )
    .returning();
  return row;
}

/**
 * Story 9-5: orphan-booking cleanup for the checkout.session.expired
 * handler. Deletes the booking row IFF it matches the pre-claimed-but-
 * abandoned shape: `status='PENDING' AND payment_status='AWAITING_PAYMENT'
 * AND id=$bookingId`.
 *
 * The 3-condition WHERE is the load-bearing safety net (BA Decision
 * §5 + §11). Any one condition missing opens a path to deleting the
 * wrong row:
 *   • A CONFIRMED row mismatches on `status` (Guest came back and
 *     completed; 9-4 captured).
 *   • A CAPTURED row mismatches on `payment_status` (9-4 captured).
 *   • Without `id`, a misfired event with a stale metadata.bookingId
 *     could match an unrelated abandoned attempt — but the bookingId
 *     equality clause narrows to the specific row.
 *
 * Returns `true` when exactly 1 row was deleted (real orphan removed);
 * `false` when no rows matched (idempotent — either a different path
 * won OR a prior delivery already cleaned). Never returns true on
 * more than 1 (the bookingId equality clause is on the PK).
 *
 * DELETE rather than UPDATE-to-CANCELLED (BA Decision §5): the booking
 * was never visible to the Guest (never confirmed, never appeared in
 * /my-bookings as a real booking). A CANCELLED row would clutter the
 * Guest's history with a non-event. DELETE returns the slot to the
 * partial unique index `uniq_active_booking_per_desk_per_date` so the
 * Guest can re-book the same desk/date without DOUBLE_BOOKING from
 * their own orphan.
 */
export async function deleteAbandonedBookingByCheckoutSession(
  bookingId: string,
): Promise<boolean> {
  const rows = await db
    .delete(bookingsTable)
    .where(
      and(
        eq(bookingsTable.id, bookingId),
        eq(bookingsTable.status, 'PENDING'),
        eq(bookingsTable.paymentStatus, 'AWAITING_PAYMENT'),
      ),
    )
    .returning({ id: bookingsTable.id });
  return rows.length > 0;
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
