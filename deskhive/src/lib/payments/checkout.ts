/**
 * Story 9-3: Stripe Checkout service-layer wrappers for the booking-
 * with-payment flow.
 *
 * Two operations, both returning `StripeServiceResult<T>` per Story 9-1
 * Decision §6:
 *
 *   • `createCheckoutSession` — creates a hosted Stripe Checkout
 *     Session in `manual` capture mode + destination charge mode
 *     (`transfer_data.destination`) + 15% `application_fee_amount`.
 *     Called by `createBookingWithPaymentAction` AFTER the booking row
 *     is pre-claimed (BA Decision §3); returns the Session URL for the
 *     client to `window.location.assign(...)`.
 *
 *   • `retrieveCheckoutSession` — fetches a Session by ID with the
 *     associated PaymentIntent expanded. Called by the return-from-
 *     Checkout Server Component (BA Decision §5) to do the belt-and-
 *     suspenders dual-field verification (`session.status === 'complete'`
 *     AND `session.payment_intent.status === 'requires_capture'`) before
 *     marking the booking AUTHORIZED.
 *
 * Marketplace pattern: destination charge with `transfer_data.destination`
 * + `application_fee_amount` (BA Decision §4). Stripe-recommended for
 * "one space per booking, one owner per space" — single Payment Intent,
 * single Charge, cleanest accounting. Capture in Story 9-4 will route
 * funds (minus platform fee) to the connected account automatically.
 *
 * Idempotency: `createCheckoutSession` accepts an `idempotencyKey` arg.
 * Callers pass `checkout-${crypto.randomUUID()}` per BA Decision §9 —
 * per-attempt UUID (not per-booking-id) to avoid the orphan-Session-on-
 * retry trap. Different key namespace from 9-2's `connect-create-${userId}`.
 *
 * Error mapping: same shape as `src/lib/payments/connect.ts`. Stripe
 * SDK errors → `err.message` (end-user-facing, already translated by
 * Stripe). Other errors → generic `'Unexpected error'` + `console.error`
 * for ops visibility.
 *
 * Singleton-import discipline (Story 9-1): this file is the THIRD file
 * in the repo (after `src/lib/stripe.ts` itself + `src/lib/payments/
 * connect.ts`) that imports `stripe` from `@/lib/stripe`. Future
 * `src/lib/payments/*` sub-modules (refunds.ts in 9-6, payouts.ts in
 * 9-7, webhooks.ts in 9-5) follow the same pattern.
 */

import Stripe from 'stripe';
import { stripe } from '@/lib/stripe';
import type { StripeServiceResult } from '@/lib/stripe-service';

export async function createCheckoutSession(args: {
  spaceName: string;
  amountCents: number;
  platformFeeCents: number;
  ownerStripeAccountId: string;
  bookingId: string;
  guestEmail: string;
  successUrl: string;
  cancelUrl: string;
  idempotencyKey: string;
}): Promise<StripeServiceResult<{ sessionId: string; url: string }>> {
  try {
    const session = await stripe.checkout.sessions.create(
      {
        mode: 'payment',
        line_items: [
          {
            quantity: 1,
            price_data: {
              currency: 'usd',
              unit_amount: args.amountCents,
              product_data: {
                name: `Desk booking — ${args.spaceName}`,
              },
            },
          },
        ],
        payment_intent_data: {
          // BA Decision §4 — PRD FR-PAY-2 mandates manual capture so
          // funds are authorized but not charged until the Space Owner
          // clicks Confirm (Story 9-4).
          capture_method: 'manual',
          // Marketplace destination charge: funds settle on DeskHive's
          // platform account, Stripe auto-transfers payout to the
          // connected account on capture (minus application_fee_amount).
          transfer_data: { destination: args.ownerStripeAccountId },
          application_fee_amount: args.platformFeeCents,
          // Webhook backstop lookup key (BA Decision §6) — duplicates
          // the top-level `client_reference_id` for belt-and-suspenders.
          metadata: { bookingId: args.bookingId },
        },
        // Top-level lookup key for the return-URL handler (BA Decision §5).
        client_reference_id: args.bookingId,
        // Pre-fill the Stripe Checkout email field; no Stripe Customer
        // object created (BA Decision §4 — Phase 2 has no Customer model).
        customer_email: args.guestEmail,
        // `success_url` MUST contain `{CHECKOUT_SESSION_ID}` — Stripe
        // replaces it with the actual `cs_*` ID on redirect. The action
        // builder constructs this; the wrapper just passes it through.
        success_url: args.successUrl,
        cancel_url: args.cancelUrl,
      },
      {
        // BA Decision §9: per-attempt UUID. Caller generates inside the
        // Server Action so each fresh attempt gets a new Session;
        // network-retry within a single invocation reuses the same key
        // and gets the cached Session from Stripe.
        idempotencyKey: args.idempotencyKey,
      },
    );

    // Stripe returns `url` as `string | null` — null would be a Stripe
    // SDK bug for `mode: 'payment'` Sessions (the URL is always set for
    // hosted Checkout), but the type system insists. Treat the null
    // case as a failure mode rather than throwing — the action layer
    // already maps `ok: false` to a user-facing error toast.
    if (!session.url) {
      return {
        ok: false,
        error: 'Stripe Checkout returned no redirect URL',
      };
    }

    return { ok: true, data: { sessionId: session.id, url: session.url } };
  } catch (err) {
    return mapStripeError(err, 'createCheckoutSession');
  }
}

/**
 * DESIGN-INT-CHECKOUT-EMBED Phase 2: Embedded Checkout sibling of
 * `createCheckoutSession`. Same metadata + line_items + payment_intent_data
 * shape — identical destination-charge marketplace contract, identical
 * `payment_intent_data.metadata.bookingId` round-trip, identical
 * `application_fee_amount` math. Only Stripe-side difference:
 *
 *   • `ui_mode: 'embedded'` (vs default 'hosted')
 *   • `return_url` replaces `success_url` + `cancel_url`
 *   • Stripe returns `client_secret` for the client to mount
 *     <EmbeddedCheckoutProvider> with; no `url` is set (would be null
 *     for embedded — different code path than the hosted-mode SDK).
 *
 * Webhook contract unchanged — `checkout.session.completed` emits the
 * same payload shape for both modes. `handleCheckoutSessionCompleted`
 * does not need to change.
 *
 * Return-URL handler (src/app/spaces/[id]/booking/return/page.tsx) also
 * unchanged — Stripe substitutes `{CHECKOUT_SESSION_ID}` in the embedded
 * `return_url` the same way it does in hosted's `success_url`.
 *
 * Caller passes a `returnUrl` template (with `{CHECKOUT_SESSION_ID}`
 * placeholder); we forward verbatim. The wrapper does NOT construct
 * the URL — keeps the wrapper Stripe-only.
 */
export async function createEmbeddedCheckoutSession(args: {
  spaceName: string;
  amountCents: number;
  platformFeeCents: number;
  ownerStripeAccountId: string;
  bookingId: string;
  guestEmail: string;
  returnUrl: string;
  idempotencyKey: string;
}): Promise<
  StripeServiceResult<{ sessionId: string; clientSecret: string }>
> {
  try {
    const session = await stripe.checkout.sessions.create(
      {
        // Stripe SDK 22 / API '2026-04-22.dahlia' renamed
        // ui_mode 'embedded' → 'embedded_page'. The wire-level behavior
        // is identical (client_secret returned for in-page mounting).
        ui_mode: 'embedded_page',
        mode: 'payment',
        line_items: [
          {
            quantity: 1,
            price_data: {
              currency: 'usd',
              unit_amount: args.amountCents,
              product_data: {
                name: `Desk booking — ${args.spaceName}`,
              },
            },
          },
        ],
        payment_intent_data: {
          // Identical to hosted Session — manual capture + destination
          // charge + application_fee_amount + metadata.bookingId.
          capture_method: 'manual',
          transfer_data: { destination: args.ownerStripeAccountId },
          application_fee_amount: args.platformFeeCents,
          metadata: { bookingId: args.bookingId },
        },
        client_reference_id: args.bookingId,
        customer_email: args.guestEmail,
        // Embedded uses `return_url` (single endpoint) instead of
        // `success_url` + `cancel_url`. Stripe replaces
        // {CHECKOUT_SESSION_ID} with the actual cs_* id on redirect.
        return_url: args.returnUrl,
      },
      {
        idempotencyKey: args.idempotencyKey,
      },
    );

    // For ui_mode:'embedded', Stripe returns `client_secret` (NOT `url`).
    // Belt-and-suspenders null-check matches the hosted-mode pattern.
    if (!session.client_secret) {
      return {
        ok: false,
        error: 'Stripe Embedded Checkout returned no client_secret',
      };
    }

    return {
      ok: true,
      data: { sessionId: session.id, clientSecret: session.client_secret },
    };
  } catch (err) {
    return mapStripeError(err, 'createEmbeddedCheckoutSession');
  }
}

export async function retrieveCheckoutSession(
  sessionId: string,
): Promise<
  StripeServiceResult<{
    session: Stripe.Checkout.Session;
    paymentIntent: Stripe.PaymentIntent;
  }>
> {
  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId, {
      // Expand `payment_intent` so the return-URL handler gets the PI
      // object inline (avoids a second Stripe API round-trip just to
      // read `payment_intent.status`).
      expand: ['payment_intent'],
    });

    // After `expand`, `session.payment_intent` is the full object.
    // Type-narrow: if Stripe ever returns it as a string ID anyway
    // (e.g., expand was silently dropped for an unsupported Session
    // type), treat it as a failure rather than crashing downstream.
    if (
      !session.payment_intent ||
      typeof session.payment_intent === 'string'
    ) {
      return {
        ok: false,
        error: 'Stripe Checkout Session did not include a PaymentIntent',
      };
    }

    return {
      ok: true,
      data: {
        session,
        paymentIntent: session.payment_intent,
      },
    };
  } catch (err) {
    return mapStripeError(err, 'retrieveCheckoutSession');
  }
}

function mapStripeError(
  err: unknown,
  operation: string,
): { ok: false; error: string } {
  if (err instanceof Stripe.errors.StripeError) {
    return { ok: false, error: err.message };
  }
  const msg = err instanceof Error ? err.message : String(err);
  console.error(`[stripe-checkout] ${operation} unexpected error`, {
    error: msg,
  });
  return { ok: false, error: 'Unexpected error' };
}
