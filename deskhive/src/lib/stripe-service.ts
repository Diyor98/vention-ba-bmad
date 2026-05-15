/**
 * Story 9-1: Service-layer seam for Stripe operations.
 *
 * Empty by design. Stories 9-2 through 9-7 (and Story 8-4) will add
 * typed wrappers here — each wrapping a Stripe SDK call inside a
 * try/catch and returning a `StripeServiceResult<T>` discriminated
 * union. Server Actions consume those results and map them to UI
 * feedback (toast, form error, redirect).
 *
 * ─────────────────────────────────────────────────────────────────────────
 * Architectural intent (BA Decision §5, §6):
 * ─────────────────────────────────────────────────────────────────────────
 *   - `src/lib/stripe.ts` owns SDK initialization + module-load env
 *     validation. Hard-throws on misconfiguration.
 *   - `src/lib/stripe-service.ts` (this file) owns typed wrappers +
 *     result objects. Non-throwing at the boundary — every operation
 *     returns `{ ok: true, data } | { ok: false, error }`.
 *   - Server Actions / API routes import from THIS file, not from
 *     `stripe.ts` directly. Keeps the "only one place wraps Stripe"
 *     invariant explicit. The only allowed direct importer of `stripe.ts`
 *     is `scripts/stripe-ping.ts` (CLI smoke test).
 *
 * ─────────────────────────────────────────────────────────────────────────
 * How to add a new operation (Stories 9-2 / 9-3 / 9-5 / 9-6 / 9-7, 8-4):
 * ─────────────────────────────────────────────────────────────────────────
 *   1. Import the underlying `stripe` client (re-exported below).
 *   2. Define an async function that returns Promise<StripeServiceResult<T>>.
 *   3. Wrap the Stripe SDK call in try/catch; on success return
 *      { ok: true, data }; on Stripe.errors.StripeError return
 *      { ok: false, error: <user-facing message> }; on unknown error
 *      log + return { ok: false, error: 'Unexpected error' }.
 *   4. Wire the caller in the corresponding Server Action / webhook
 *      handler.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * What lives here vs. what doesn't:
 * ─────────────────────────────────────────────────────────────────────────
 *   - Stripe Connect onboarding link creation     → Story 9-2
 *   - Payment intents / checkout sessions         → Story 9-3
 *   - Payment capture / cancel on booking events  → Story 9-4
 *   - Webhook signature verification helpers      → Story 9-5
 *   - Refund creation                             → Story 9-6
 *   - Payouts listing                             → Story 9-7
 *   - Payment-event-driven email triggers         → Story 8-4 (bridges
 *                                                    this file with the
 *                                                    email service)
 */

export { stripe } from './stripe';

/**
 * Typed result for service-layer Stripe operations. Stories 9-2+
 * return this shape from every exported function. Discriminated union
 * lets call sites narrow without optional-chaining gymnastics.
 *
 * `error` is a USER-FACING string (already mapped from Stripe's typed
 * error classes — `StripeCardError.message`, etc.). Server Actions can
 * surface it directly via toast or form error.
 */
export type StripeServiceResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };
