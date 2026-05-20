'use server';

import crypto from 'node:crypto';
import { redirect } from 'next/navigation';
import {
  requireSession,
  requireRole,
  AuthError,
} from '@/lib/auth/guards';
import { isPgUniqueViolation } from '@/lib/db-errors';
import { isPastDate } from '@/lib/format';
import { createBookingSchema } from '@/lib/validation/booking';
import { getActiveDeskById } from '@/db/queries/desks';
import { getPublishedSpaceById } from '@/db/queries/spaces';
import { getConnectAccountByUserId } from '@/db/queries/stripe-connect';
import { createBooking } from '@/db/queries/bookings';
import {
  createCheckoutSession,
  createEmbeddedCheckoutSession,
} from '@/lib/payments/checkout';
import { calculatePlatformFee } from '@/lib/money';
import { logger } from '@/lib/logger';

/**
 * Story 9-3: booking-with-payment Server Action. Replaces Phase 1's
 * `createBookingAction` (deleted in this story) for the Guest booking
 * path.
 *
 * Returns a typed state. On `'success'`, the state carries a
 * `redirectUrl` to Stripe Checkout. The Client Component (`<BookDeskButton>`)
 * calls `window.location.assign(redirectUrl)` per BA Decision §7 —
 * Server Actions can't return external redirects across the form
 * boundary cleanly, so the URL hops through the action state.
 *
 * Locked 9-step behavior (BA Decision §3 pre-claim + §8 Connect gate +
 * §9 per-attempt idempotency):
 *   1. Auth: session + GUEST role.
 *   2. Validation: createBookingSchema (Phase 1 shape).
 *   3. Past-date check.
 *   4. Existence: getActiveDeskById + getPublishedSpaceById.
 *   5. Connect-state-active gate via cached DB row.
 *   6. Money math (calculatePlatformFee).
 *   7. Pre-claim booking row (PENDING + AWAITING_PAYMENT + payment_intent_id=NULL).
 *   8. Per-attempt UUID idempotency key.
 *   9. Create Stripe Checkout Session → return URL.
 *
 * Error union (deliberately wider than Phase 1's `createBookingAction`):
 *   UNAUTHORIZED — auth missing (also: redirect to /login at the action
 *                  layer, so this state is theoretically unreachable
 *                  by the form path; included for API completeness).
 *   FORBIDDEN — wrong role (non-GUEST).
 *   VALIDATION_ERROR — Zod-mapped field errors.
 *   PAST_DATE — booking date in the past (Phase 1 parity).
 *   DESK_NOT_FOUND — desk inactive OR parent space not published.
 *   STRIPE_NOT_ACTIVE — owner has no active Connect row (9-3 new — BA
 *                       Decision §8). Distinct from DESK_NOT_FOUND so
 *                       the Guest gets actionable copy.
 *   DOUBLE_BOOKING — desk+date slot already claimed.
 *   INTERNAL_ERROR — DB failure OR Stripe Checkout creation failure.
 *
 * Pre-claim leaves the slot held in the partial unique index
 * `uniq_active_booking_per_desk_per_date` so concurrent Guests get
 * DOUBLE_BOOKING at the DB step BEFORE Stripe is involved. If the
 * Guest abandons Checkout, the AWAITING_PAYMENT row persists — cleanup
 * deferred to Story 9-5 per BA Decision §3.
 */
export type CreateBookingWithPaymentActionState =
  | { status: 'idle' }
  | { status: 'success'; redirectUrl: string }
  | { status: 'error'; code: 'UNAUTHORIZED'; message: string }
  | { status: 'error'; code: 'FORBIDDEN'; message: string }
  | {
      status: 'error';
      code: 'VALIDATION_ERROR';
      fields: Record<string, string>;
    }
  | { status: 'error'; code: 'PAST_DATE'; message: string }
  | { status: 'error'; code: 'DESK_NOT_FOUND'; message: string }
  | { status: 'error'; code: 'STRIPE_NOT_ACTIVE'; message: string }
  | { status: 'error'; code: 'DOUBLE_BOOKING'; message: string }
  | { status: 'error'; code: 'INTERNAL_ERROR'; message: string };

function getAppBaseUrl(): string {
  const raw = process.env.BETTER_AUTH_URL ?? '';
  if (raw && raw.length > 0) return raw.replace(/\/$/, '');
  return 'http://localhost:3000';
}

export async function createBookingWithPaymentAction(
  _prevState: CreateBookingWithPaymentActionState,
  formData: FormData,
): Promise<CreateBookingWithPaymentActionState> {
  const spaceId = String(formData.get('spaceId') ?? '');
  const deskId = String(formData.get('deskId') ?? '');
  const bookingDate = String(formData.get('bookingDate') ?? '');

  // ─── Step 1: Auth ───────────────────────────────────────────────
  let session;
  try {
    session = await requireSession();
    requireRole(session, 'GUEST');
  } catch (err) {
    if (err instanceof AuthError) {
      const httpStatus = err.response.status;
      if (httpStatus === 401) {
        // Phase 1 parity: redirect to /login with a callback that preserves
        // the booking attempt. Same shape as `createBookingAction`.
        const callback = `/spaces/${spaceId}?date=${bookingDate}`;
        redirect(`/login?callbackUrl=${encodeURIComponent(callback)}`);
      }
      if (httpStatus === 403) {
        return {
          status: 'error',
          code: 'FORBIDDEN',
          message: 'Only guests can book desks.',
        };
      }
    }
    logger.error('create_booking_with_payment_auth_failed', {
      error: String(err),
    });
    return {
      status: 'error',
      code: 'INTERNAL_ERROR',
      message: 'Something went wrong.',
    };
  }

  // ─── Step 2: Validation ─────────────────────────────────────────
  const parsed = createBookingSchema.safeParse({ deskId, bookingDate });
  if (!parsed.success) {
    const fields: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? '');
      if (key && !fields[key]) fields[key] = issue.message;
    }
    return { status: 'error', code: 'VALIDATION_ERROR', fields };
  }

  // ─── Step 3: Past-date check ────────────────────────────────────
  if (isPastDate(parsed.data.bookingDate)) {
    return {
      status: 'error',
      code: 'PAST_DATE',
      message: 'Booking date cannot be in the past',
    };
  }

  // ─── Step 4: Existence (desk + space) ───────────────────────────
  const desk = await getActiveDeskById(parsed.data.deskId);
  if (!desk) {
    return {
      status: 'error',
      code: 'DESK_NOT_FOUND',
      message: 'This desk is not available.',
    };
  }
  const space = await getPublishedSpaceById(desk.spaceId);
  if (!space) {
    return {
      status: 'error',
      code: 'DESK_NOT_FOUND',
      message: 'This desk is not available.',
    };
  }

  // ─── Step 5: Connect-state-active gate (BA Decision §8) ─────────
  // The space MUST have an owner with an active Connect account. Phase
  // 1 admin-seeded spaces have `ownerId IS NULL` — they pre-date the
  // payment flow and can't be booked under Phase 2. Treat as
  // STRIPE_NOT_ACTIVE rather than DESK_NOT_FOUND so the Guest gets
  // actionable copy (and so test diagnostics distinguish the two
  // failure modes).
  if (!space.ownerId) {
    return {
      status: 'error',
      code: 'STRIPE_NOT_ACTIVE',
      message: "This space can't accept bookings right now.",
    };
  }
  const connectRow = await getConnectAccountByUserId(space.ownerId);
  if (
    !connectRow ||
    connectRow.chargesEnabled !== true ||
    connectRow.payoutsEnabled !== true
  ) {
    return {
      status: 'error',
      code: 'STRIPE_NOT_ACTIVE',
      message: "This space can't accept bookings right now.",
    };
  }

  // ─── Step 6: Money math (BA Decision §2) ────────────────────────
  const totalCents = desk.dailyPriceCents;
  const platformFeeCents = calculatePlatformFee(totalCents);
  // Owner payout is derived in 9-4 (capture) from total - fee; no need
  // to materialize here. Stripe will route the funds automatically when
  // the Payment Intent is captured.

  // ─── Step 7: Pre-claim booking row (BA Decision §3 — load-bearing) ──
  // Phase 1's `uniq_active_booking_per_desk_per_date` partial unique
  // index is the source of truth on conflicts. A concurrent Guest racing
  // for the same desk/date will fail HERE, before any Stripe interaction.
  let created;
  try {
    created = await createBooking({
      guestUserId: String(session.user.id),
      spaceId: desk.spaceId,
      deskId: desk.id,
      bookingDate: parsed.data.bookingDate,
      totalPriceCents: desk.dailyPriceCents,
      paymentStatus: 'AWAITING_PAYMENT',
      totalCents,
      platformFeeCents,
    });
  } catch (err) {
    if (isPgUniqueViolation(err, 'uniq_active_booking_per_desk_per_date')) {
      return {
        status: 'error',
        code: 'DOUBLE_BOOKING',
        message: 'This desk is already booked for that date',
      };
    }
    const msg = err instanceof Error ? err.message : String(err);
    logger.error('create_booking_with_payment_db_failed', { error: msg });
    return {
      status: 'error',
      code: 'INTERNAL_ERROR',
      message: 'Something went wrong. Please try again.',
    };
  }

  // ─── Step 8: Idempotency key (BA Decision §9) ───────────────────
  // Per-attempt UUID. A user clicking Book twice (after a prior
  // abandoned attempt) gets a fresh key + a fresh Session. Network-
  // retry within a single invocation reuses this same key and Stripe
  // returns the cached Session.
  const idempotencyKey = `checkout-${crypto.randomUUID()}`;

  // ─── Step 9: Create Stripe Checkout Session ─────────────────────
  const baseUrl = getAppBaseUrl();
  const successUrl = `${baseUrl}/spaces/${desk.spaceId}/booking/return?session_id={CHECKOUT_SESSION_ID}`;
  const cancelUrl = `${baseUrl}/spaces/${desk.spaceId}?booking_cancelled=1`;

  const checkoutResult = await createCheckoutSession({
    spaceName: space.name,
    amountCents: totalCents,
    platformFeeCents,
    ownerStripeAccountId: connectRow.stripeAccountId,
    bookingId: created.id,
    guestEmail: String(session.user.email),
    successUrl,
    cancelUrl,
    idempotencyKey,
  });

  if (!checkoutResult.ok) {
    // The booking row stays in AWAITING_PAYMENT — cleanup deferred to
    // Story 9-5 per BA Decision §3. Logging the failure helps the BA
    // / dev-agent reproduce the Stripe-side error.
    logger.error('create_booking_with_payment_stripe_failed', {
      bookingId: created.id,
      error: checkoutResult.error,
    });
    return {
      status: 'error',
      code: 'INTERNAL_ERROR',
      message: checkoutResult.error,
    };
  }

  return { status: 'success', redirectUrl: checkoutResult.data.url };
}

// ──────────────────────────────────────────────────────────────────────
// DESIGN-INT-CHECKOUT-EMBED Phase 2 — Embedded Checkout sibling action.
//
// Same 9-step flow as `createBookingWithPaymentAction` above. Only step
// 9 differs:
//   • Calls `createEmbeddedCheckoutSession` (ui_mode:'embedded',
//     return_url replaces success_url + cancel_url).
//   • Returns `{ status: 'success', clientSecret, sessionId, bookingId }`
//     for the client to mount <EmbeddedCheckoutProvider>.
//
// Lives next to the legacy action through Phase 2 + Phase 3 — the
// legacy is the rollback target. Phase 4 removes the legacy.
//
// Webhook handler is unchanged; same `checkout.session.completed` event
// payload reaches `handleCheckoutSessionCompleted`. Return-URL handler
// is unchanged; Stripe substitutes `{CHECKOUT_SESSION_ID}` in
// `return_url` the same way as hosted `success_url`.
// ──────────────────────────────────────────────────────────────────────

export type CreateBookingWithPaymentEmbeddedActionState =
  | { status: 'idle' }
  | {
      status: 'success';
      clientSecret: string;
      sessionId: string;
      bookingId: string;
    }
  | { status: 'error'; code: 'UNAUTHORIZED'; message: string }
  | { status: 'error'; code: 'FORBIDDEN'; message: string }
  | {
      status: 'error';
      code: 'VALIDATION_ERROR';
      fields: Record<string, string>;
    }
  | { status: 'error'; code: 'PAST_DATE'; message: string }
  | { status: 'error'; code: 'DESK_NOT_FOUND'; message: string }
  | { status: 'error'; code: 'STRIPE_NOT_ACTIVE'; message: string }
  | { status: 'error'; code: 'DOUBLE_BOOKING'; message: string }
  | { status: 'error'; code: 'INTERNAL_ERROR'; message: string };

export async function createBookingWithPaymentEmbeddedAction(
  _prevState: CreateBookingWithPaymentEmbeddedActionState,
  formData: FormData,
): Promise<CreateBookingWithPaymentEmbeddedActionState> {
  const spaceId = String(formData.get('spaceId') ?? '');
  const deskId = String(formData.get('deskId') ?? '');
  const bookingDate = String(formData.get('bookingDate') ?? '');

  // Step 1: Auth
  let session;
  try {
    session = await requireSession();
    requireRole(session, 'GUEST');
  } catch (err) {
    if (err instanceof AuthError) {
      const httpStatus = err.response.status;
      if (httpStatus === 401) {
        const callback = `/spaces/${spaceId}?date=${bookingDate}`;
        redirect(`/login?callbackUrl=${encodeURIComponent(callback)}`);
      }
      if (httpStatus === 403) {
        return {
          status: 'error',
          code: 'FORBIDDEN',
          message: 'Only guests can book desks.',
        };
      }
    }
    logger.error('create_booking_with_payment_embed_auth_failed', {
      error: String(err),
    });
    return {
      status: 'error',
      code: 'INTERNAL_ERROR',
      message: 'Something went wrong.',
    };
  }

  // Step 2: Validation
  const parsed = createBookingSchema.safeParse({ deskId, bookingDate });
  if (!parsed.success) {
    const fields: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? '');
      if (key && !fields[key]) fields[key] = issue.message;
    }
    return { status: 'error', code: 'VALIDATION_ERROR', fields };
  }

  // Step 3: Past-date check
  if (isPastDate(parsed.data.bookingDate)) {
    return {
      status: 'error',
      code: 'PAST_DATE',
      message: 'Booking date cannot be in the past',
    };
  }

  // Step 4: Existence (desk + space)
  const desk = await getActiveDeskById(parsed.data.deskId);
  if (!desk) {
    return {
      status: 'error',
      code: 'DESK_NOT_FOUND',
      message: 'This desk is not available.',
    };
  }
  const space = await getPublishedSpaceById(desk.spaceId);
  if (!space) {
    return {
      status: 'error',
      code: 'DESK_NOT_FOUND',
      message: 'This desk is not available.',
    };
  }

  // Step 5: Connect-state-active gate
  if (!space.ownerId) {
    return {
      status: 'error',
      code: 'STRIPE_NOT_ACTIVE',
      message: "This space can't accept bookings right now.",
    };
  }
  const connectRow = await getConnectAccountByUserId(space.ownerId);
  if (
    !connectRow ||
    connectRow.chargesEnabled !== true ||
    connectRow.payoutsEnabled !== true
  ) {
    return {
      status: 'error',
      code: 'STRIPE_NOT_ACTIVE',
      message: "This space can't accept bookings right now.",
    };
  }

  // Step 6: Money math
  const totalCents = desk.dailyPriceCents;
  const platformFeeCents = calculatePlatformFee(totalCents);

  // Step 7: Pre-claim booking row
  let created;
  try {
    created = await createBooking({
      guestUserId: String(session.user.id),
      spaceId: desk.spaceId,
      deskId: desk.id,
      bookingDate: parsed.data.bookingDate,
      totalPriceCents: desk.dailyPriceCents,
      paymentStatus: 'AWAITING_PAYMENT',
      totalCents,
      platformFeeCents,
    });
  } catch (err) {
    if (isPgUniqueViolation(err, 'uniq_active_booking_per_desk_per_date')) {
      return {
        status: 'error',
        code: 'DOUBLE_BOOKING',
        message: 'This desk is already booked for that date',
      };
    }
    const msg = err instanceof Error ? err.message : String(err);
    logger.error('create_booking_with_payment_embed_db_failed', {
      error: msg,
    });
    return {
      status: 'error',
      code: 'INTERNAL_ERROR',
      message: 'Something went wrong. Please try again.',
    };
  }

  // Step 8: Idempotency key
  const idempotencyKey = `checkout-embed-${crypto.randomUUID()}`;

  // Step 9: Create Stripe Embedded Checkout Session
  const baseUrl = getAppBaseUrl();
  // Same return URL shape as hosted-mode `success_url`. Stripe's
  // {CHECKOUT_SESSION_ID} substitution is identical between modes.
  const returnUrl = `${baseUrl}/spaces/${desk.spaceId}/booking/return?session_id={CHECKOUT_SESSION_ID}`;

  const result = await createEmbeddedCheckoutSession({
    spaceName: space.name,
    amountCents: totalCents,
    platformFeeCents,
    ownerStripeAccountId: connectRow.stripeAccountId,
    bookingId: created.id,
    guestEmail: String(session.user.email),
    returnUrl,
    idempotencyKey,
  });

  if (!result.ok) {
    logger.error('create_booking_with_payment_embed_stripe_failed', {
      bookingId: created.id,
      error: result.error,
    });
    return {
      status: 'error',
      code: 'INTERNAL_ERROR',
      message: result.error,
    };
  }

  return {
    status: 'success',
    clientSecret: result.data.clientSecret,
    sessionId: result.data.sessionId,
    bookingId: created.id,
  };
}
