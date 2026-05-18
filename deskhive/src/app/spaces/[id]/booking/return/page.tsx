import { redirect } from 'next/navigation';
import { requireSession } from '@/lib/auth/guards';
import { getBookingById, markBookingAuthorized } from '@/db/queries/bookings';
import { retrieveCheckoutSession } from '@/lib/payments/checkout';
import { logger } from '@/lib/logger';

/**
 * Story 9-3: return-from-Stripe-Checkout handler (BA Decision §5).
 *
 * Stripe redirects the Guest's browser to this page after they
 * authorize payment on the hosted Checkout flow. The query string
 * carries `?session_id=cs_xxx` (Stripe expanded the
 * `{CHECKOUT_SESSION_ID}` placeholder in our `success_url`).
 *
 * Locked 6-step flow (originally 7 — Step 6 `revalidatePath` dropped
 * per the 9-3 BA-walk follow-up; see "BA-walk follow-up" note below):
 *   1. Read `session_id`. Missing / malformed → redirect with error.
 *   2. Retrieve Session + expanded PaymentIntent via
 *      `retrieveCheckoutSession` (the sub-module wrapper).
 *   3. Belt-and-suspenders verify BOTH `session.status === 'complete'`
 *      AND `paymentIntent.status === 'requires_capture'`.
 *   4. Look up booking by `session.metadata.bookingId` (preferred) OR
 *      `session.client_reference_id`. Verify
 *      `booking.guestUserId === session.user.id` (cross-tenant defense).
 *   5. `markBookingAuthorized({ bookingId, paymentIntentId })` —
 *      conditional UPDATE that's a no-op if the webhook already won.
 *   6. redirect('/my-bookings?just_booked=1') — existing /my-bookings
 *      page fires the Story 6-3 success toast.
 *
 * A Server Component (not a Server Action) — Stripe's redirect is a
 * GET navigation, not a form submission. `redirect(...)` thrown from
 * a Server Component is consumed by the rendering layer for both
 * internal and external URLs; this works in 9-3 because we only
 * redirect internally.
 *
 * ── BA-walk follow-up (Next.js 16 render-time `revalidatePath` ban) ──
 * The original Step 6 called `revalidatePath('/my-bookings')` +
 * `revalidatePath('/spaces/[id]')`. Next.js 16 rejects this at runtime:
 *   "Route used 'revalidatePath' during render which is unsupported.
 *    To ensure revalidation is performed consistently it must always
 *    happen outside of renders and cached functions."
 *
 * Both calls are dropped (not wrapped in a Server Action) because they
 * were redundant: the immediate `redirect('/my-bookings?just_booked=1')`
 * below triggers a fresh top-level navigation. `/my-bookings`'s Server
 * Component re-runs against the DB with no router-cache hit to
 * invalidate; `/spaces/[id]` similarly re-runs on next visit. The
 * `markBookingAuthorized` UPDATE already happened at Step 5 — the DB
 * is the source of truth the next render reads from.
 *
 * Same shape as Story 9-2's BA-walk-found defensive fix
 * (commit `0d384e0`): discover a Next.js 16 strictness issue in a real
 * walk, document the cause, ship a narrow fix that preserves the
 * behavioral contract.
 */

type SearchParams = { session_id?: string };

const STRIPE_SESSION_ID_REGEX = /^cs_[a-zA-Z0-9_]+$/;
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function BookingReturnPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const { id: spaceId } = await params;
  const { session_id: sessionId } = await searchParams;

  // ─── Step 1: Validate session_id presence + shape ───────────────
  if (!sessionId || !STRIPE_SESSION_ID_REGEX.test(sessionId)) {
    logger.warn('booking_return_invalid_session_id', { sessionId });
    redirect(`/spaces/${spaceId}?booking_error=invalid_session`);
  }

  // ─── Step 2: Retrieve Session + PaymentIntent from Stripe ───────
  const sessionResult = await retrieveCheckoutSession(sessionId);
  if (!sessionResult.ok) {
    logger.error('booking_return_session_lookup_failed', {
      sessionId,
      error: sessionResult.error,
    });
    redirect(`/spaces/${spaceId}?booking_error=lookup_failed`);
  }
  const { session, paymentIntent } = sessionResult.data;

  // ─── Step 3: Dual-field verification (BA Decision §5) ───────────
  // `session.status` reflects Checkout-Session lifecycle; `payment_intent.
  // status === 'requires_capture'` confirms manual-capture authorization
  // succeeded but hasn't captured yet (the expected post-9-3 / pre-9-4
  // state). Either field alone could leave a subtle gap.
  if (
    session.status !== 'complete' ||
    paymentIntent.status !== 'requires_capture'
  ) {
    logger.warn('booking_return_verification_failed', {
      sessionId,
      sessionStatus: session.status,
      paymentIntentStatus: paymentIntent.status,
    });
    redirect(`/spaces/${spaceId}?booking_error=verification_failed`);
  }

  // ─── Step 4: Look up pre-claimed booking + cross-tenant check ───
  // Prefer `metadata.bookingId` (the redundant key we set on the
  // PaymentIntent's metadata). Fall back to `client_reference_id`
  // (set at the Session level) for belt-and-suspenders. Both should
  // match a UUID; rejection of malformed values prevents downstream
  // DB lookup errors.
  const bookingIdFromMetadata = session.metadata?.bookingId;
  const bookingIdFromRef = session.client_reference_id;
  const bookingId =
    bookingIdFromMetadata && UUID_RE.test(bookingIdFromMetadata)
      ? bookingIdFromMetadata
      : bookingIdFromRef && UUID_RE.test(bookingIdFromRef)
        ? bookingIdFromRef
        : null;

  if (!bookingId) {
    logger.warn('booking_return_no_booking_id_in_session', {
      sessionId,
      metadataBookingId: bookingIdFromMetadata,
      clientReferenceId: bookingIdFromRef,
    });
    redirect(`/spaces/${spaceId}?booking_error=lookup_failed`);
  }

  // Verify the caller is the booking owner. Decision §5 anti-pattern:
  // do NOT skip this check — a malicious actor could craft a URL with
  // someone else's session_id and try to confirm their booking.
  const authSession = await requireSession();
  const booking = await getBookingById(bookingId);
  if (!booking || booking.guestUserId !== String(authSession.user.id)) {
    logger.warn('booking_return_ownership_mismatch', {
      sessionId,
      bookingId,
      hasBooking: Boolean(booking),
      sessionUserId: String(authSession.user.id),
      bookingGuestUserId: booking?.guestUserId,
    });
    redirect(`/spaces/${spaceId}?booking_error=ownership_mismatch`);
  }

  // ─── Step 5: Mark booking AUTHORIZED (conditional UPDATE) ───────
  // Idempotent — `markBookingAuthorized` only transitions rows still
  // in AWAITING_PAYMENT. If the webhook backstop already won the race
  // and wrote AUTHORIZED, the WHERE clause filters this row out and
  // `markBookingAuthorized` returns undefined. The downstream
  // revalidate + redirect still fires (the booking IS authorized; the
  // user shouldn't be redirected back to /spaces/[id] just because the
  // webhook beat us).
  try {
    await markBookingAuthorized({
      bookingId,
      paymentIntentId: paymentIntent.id,
    });
  } catch (err) {
    logger.error('booking_return_mark_authorized_failed', {
      bookingId,
      paymentIntentId: paymentIntent.id,
      error: String(err),
    });
    redirect(`/spaces/${spaceId}?booking_error=update_failed`);
  }

  // ─── Step 6: Redirect to /my-bookings with toast signal ─────────
  // Original Step 6 was `revalidatePath('/my-bookings')` +
  // `revalidatePath('/spaces/[id]')` — dropped per the BA-walk follow-
  // up (Next.js 16 forbids `revalidatePath` during render; both calls
  // were redundant given the `redirect()` triggers a fresh top-level
  // navigation, see the header comment for rationale).
  redirect('/my-bookings?just_booked=1');
}
