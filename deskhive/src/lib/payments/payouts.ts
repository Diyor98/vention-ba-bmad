/**
 * Story 9-7: Stripe Connect Payouts list wrapper. 6th and FINAL Theme B
 * sub-module after `connect.ts` (9-2) / `checkout.ts` (9-3) /
 * `payment-intents.ts` (9-4) / `webhooks.ts` (9-5) / `refunds.ts` (9-6).
 *
 * **First read-only API call surfaced to a page in Theme B.** The prior 5
 * sub-modules wrapped write operations (create / capture / cancel /
 * refund / dispatch). `listPayouts` is purely read-only — no idempotency
 * keys needed, no state mutation, no audit-trail concerns.
 *
 * Locked behaviors per BA Decision §1 + §3:
 *
 *   • **Direct Stripe API read at page-load time.** No local cache.
 *     `/owner/payouts` calls this wrapper on every page render. Phase 3
 *     may add a `payouts` cache table — flagged in the memory entry +
 *     forward-looking flags but explicitly out of 9-7 scope.
 *
 *   • **`stripeAccount` in the SECOND `RequestOptions` arg.** This is
 *     the load-bearing detail: Stripe's SDK takes the connected-account
 *     header as part of `RequestOptions` (second arg), NOT inside the
 *     params object (first arg). Putting it in the wrong place returns
 *     the platform's own payouts instead of the connected account's —
 *     the wrong scope entirely. The wrapper test asserts the call shape
 *     exactly.
 *
 *   • **`limit: 25` default** (BA Decision §6). Phase 2 single-page-only
 *     — no pagination UI in 9-7. Stripe API max is 100; 25 is the locked
 *     middle ground. Phase 3 will extend args with cursor + range.
 *
 * Error mapping: identical shape to 9-2 / 9-3 / 9-4 / 9-6 wrappers.
 * Stripe SDK errors (`Stripe.errors.StripeError`) → `err.message`. Other
 * errors → `'Unexpected error'` + `console.error('[stripe-payouts] ...')`
 * for ops visibility.
 *
 * Singleton-import discipline (Story 9-1): this is the SIXTH and final
 * file in the repo to import `stripe` from `@/lib/stripe`. After 9-7,
 * Theme B's Stripe API surface is fully wrapped. Future stories that
 * need new Stripe operations (Phase 3 partial refunds, multi-currency,
 * etc.) extend the existing sub-modules.
 */

import Stripe from 'stripe';
import { stripe } from '@/lib/stripe';
import type { StripeServiceResult } from '@/lib/stripe-service';

export async function listPayouts(args: {
  stripeAccountId: string;
  limit?: number;
}): Promise<StripeServiceResult<{ payouts: Stripe.Payout[] }>> {
  try {
    const result = await stripe.payouts.list(
      {
        // BA Decision §6: Phase 2 single-page; default 25. Caller may
        // override (e.g., test fixtures); Phase 3 will add cursor +
        // date-range args here.
        limit: args.limit ?? 25,
      },
      {
        // BA Decision §3 — LOAD-BEARING: `stripeAccount` is a
        // `RequestOptions` field (second arg to the SDK call), NOT a
        // params field. Without it Stripe returns the PLATFORM's
        // payouts; with it Stripe returns the CONNECTED account's
        // payouts. The wrapper test asserts this position to catch
        // accidental refactors that flatten the call.
        stripeAccount: args.stripeAccountId,
      },
    );
    return { ok: true, data: { payouts: result.data } };
  } catch (err) {
    return mapStripeError(err, 'listPayouts');
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
  console.error(`[stripe-payouts] ${operation} unexpected error`, {
    error: msg,
  });
  return { ok: false, error: 'Unexpected error' };
}
