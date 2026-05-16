/**
 * Story 9-2: Stripe Connect Express service-layer wrappers.
 *
 * Three operations, each returning `StripeServiceResult<T>` per Story
 * 9-1 Decision §6. These are the ONLY places in the codebase that
 * call `stripe.accounts.*` or `stripe.accountLinks.*` directly —
 * downstream callers (Server Actions, webhook handlers) consume the
 * typed results, not the raw SDK.
 *
 * Connect variant: Express + hosted Account Links (BA Decision §1).
 * NO `@stripe/connect-js` install, NO embedded components, NO
 * Standard/Custom variants.
 *
 * Country: hardcoded to 'US' for all Phase 2 test-mode accounts (BA
 * Decision §6). See the inline comment on `createConnectAccount` for
 * the Phase 3 multi-country migration trail.
 *
 * Idempotency: `createConnectAccount` passes a deterministic
 * `Idempotency-Key` of `connect-create-${userId}` (BA Decision §11).
 * Duplicate clicks within Stripe's idempotency window (24h) return
 * the same `acct_*` ID. `createConnectAccountLink` does NOT use
 * idempotency keys — each call legitimately produces a new ephemeral
 * link.
 *
 * Error mapping: Stripe SDK errors (`Stripe.errors.StripeError`) are
 * mapped to `{ ok: false, error: err.message }` — the Stripe message
 * is end-user-facing and already pre-translated. Other errors get a
 * generic `'Unexpected error'` + a `console.error` for ops visibility.
 *
 * Singleton-import discipline (Story 9-1): this file is the SECOND
 * file in the repo (after `src/lib/stripe.ts` itself and the
 * Story 9-1 `stripe-service.ts` barrel) that imports `stripe` from
 * `@/lib/stripe`. Any future files in `src/lib/payments/*` follow the
 * same pattern.
 */

import Stripe from 'stripe';
import { stripe } from '@/lib/stripe';
import type { StripeServiceResult } from '@/lib/stripe-service';

export async function createConnectAccount(args: {
  userId: string;
  email: string;
}): Promise<StripeServiceResult<{ stripeAccountId: string }>> {
  try {
    const account = await stripe.accounts.create(
      {
        type: 'express',
        // Phase 2 test-mode: hardcoded to 'US' for Stripe Express compatibility
        // (Uzbekistan not supported). Phase 3: per-owner country derived from
        // application.businessAddress (Story 7-2 data).
        country: 'US',
        email: args.email,
        capabilities: {
          card_payments: { requested: true },
          transfers: { requested: true },
        },
      },
      {
        // BA Decision §11: deterministic key so duplicate clicks within
        // Stripe's 24h idempotency window return the same `acct_*` ID
        // instead of creating duplicates.
        idempotencyKey: `connect-create-${args.userId}`,
      },
    );
    return { ok: true, data: { stripeAccountId: account.id } };
  } catch (err) {
    return mapStripeError(err, 'createConnectAccount');
  }
}

export async function createConnectAccountLink(args: {
  stripeAccountId: string;
  returnUrl: string;
  refreshUrl: string;
}): Promise<StripeServiceResult<{ url: string }>> {
  try {
    const link = await stripe.accountLinks.create({
      account: args.stripeAccountId,
      type: 'account_onboarding',
      return_url: args.returnUrl,
      refresh_url: args.refreshUrl,
    });
    return { ok: true, data: { url: link.url } };
  } catch (err) {
    return mapStripeError(err, 'createConnectAccountLink');
  }
}

export async function getConnectAccountStatus(args: {
  stripeAccountId: string;
}): Promise<
  StripeServiceResult<{
    chargesEnabled: boolean;
    payoutsEnabled: boolean;
    onboardingCompleted: boolean;
  }>
> {
  try {
    const account = await stripe.accounts.retrieve(args.stripeAccountId);
    return {
      ok: true,
      data: {
        chargesEnabled: account.charges_enabled,
        payoutsEnabled: account.payouts_enabled,
        // Stripe's `details_submitted` is the canonical "user finished
        // the Express onboarding form" flag. Stays true even if Stripe
        // later flips charges_enabled/payouts_enabled back to false due
        // to verification issues (which is what the `account.updated`
        // webhook handler is for).
        onboardingCompleted: account.details_submitted,
      },
    };
  } catch (err) {
    return mapStripeError(err, 'getConnectAccountStatus');
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
  console.error(`[stripe-connect] ${operation} unexpected error`, { error: msg });
  return { ok: false, error: 'Unexpected error' };
}
