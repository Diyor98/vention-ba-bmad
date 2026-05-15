/**
 * Story 9-1: Stripe SDK wrapper — the typed seam for all server-side
 * payment operations. Wraps the `stripe` Node.js SDK so call sites
 * never instantiate `new Stripe(...)` directly.
 *
 * Family: joins src/lib/email.ts, src/lib/money.ts, src/lib/toast.ts,
 * src/lib/applications.ts as a single-file pure module. No 'use server'
 * directive — callable from Server Actions, Server Components, API
 * routes, and CLI scripts alike.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * Module-load contract (BA Decision §3):
 * ─────────────────────────────────────────────────────────────────────────
 *   This module HARD-THROWS at import time if STRIPE_SECRET_KEY is
 *   misconfigured. Failure modes:
 *     - missing/empty                          → throw
 *     - wrong prefix (not sk_test_* / sk_live_*) → throw
 *     - sk_live_*  AND  NODE_ENV !== 'production' → throw
 *   The intent is fail-fast on misconfiguration: developers see the
 *   error at dev-server startup, not when the first payment is
 *   attempted. Same posture as src/db/client.ts (Story 0-2).
 *
 *   This is intentionally DIFFERENT from src/lib/email.ts (Story 8-1)'s
 *   "non-throwing fire-and-forget" pattern. Email failures shouldn't
 *   roll back user work, so sendEmail catches and returns a structured
 *   result. Stripe MISCONFIGURATION must crash early — wrong key in
 *   production would silently route real money to the wrong place.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * Caller contract:
 * ─────────────────────────────────────────────────────────────────────────
 *   The `stripe` client itself preserves the SDK's native throwing
 *   behavior — Stripe errors are often actionable (card declined,
 *   insufficient funds, etc.) and the SDK's typed error classes
 *   (Stripe.errors.StripeCardError, StripeAuthenticationError, etc.)
 *   are the canonical signal.
 *
 *   Service-layer wrappers (added by Stories 9-3+) catch Stripe errors
 *   and return typed `StripeServiceResult<T>` discriminated unions
 *   (see src/lib/stripe-service.ts). Server Actions consume those.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * Environment variables (documented in deskhive/.env.example):
 * ─────────────────────────────────────────────────────────────────────────
 *   STRIPE_SECRET_KEY        Required at module load.  sk_test_* for
 *                            non-production environments (Phase 2 PRD
 *                            §3.3 locks test-mode-only for Phase 2);
 *                            sk_live_* permitted ONLY when NODE_ENV is
 *                            'production'.
 *   STRIPE_PUBLISHABLE_KEY   Reserved for Story 9-3 (client-side
 *                            Stripe.js init). Not read here.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * API version pinning (BA Decision §2):
 * ─────────────────────────────────────────────────────────────────────────
 *   Pinned to the SDK's LatestApiVersion ('2026-04-22.dahlia' as of
 *   stripe@22.1.1 — the version that shipped with this SDK release).
 *   BA Decision §2 originally locked '2024-06-20' but the stripe@22.1.1
 *   SDK types `apiVersion` as `LatestApiVersion` (a string literal of
 *   '2026-04-22.dahlia'); using anything older requires bypassing the
 *   type check. The BA's intent ("latest stable as of SDK release") is
 *   preserved; future polish stories will bump this alongside SDK upgrades.
 */

import Stripe from 'stripe';

const key = process.env.STRIPE_SECRET_KEY;

if (!key || key.trim().length === 0) {
  throw new Error('STRIPE_SECRET_KEY is not set in environment');
}

if (!key.startsWith('sk_test_') && !key.startsWith('sk_live_')) {
  throw new Error(
    'STRIPE_SECRET_KEY format is invalid (expected sk_test_* or sk_live_*)',
  );
}

if (key.startsWith('sk_live_') && process.env.NODE_ENV !== 'production') {
  throw new Error(
    'Refusing to use a live Stripe key outside of production. ' +
      'Use a test-mode key (sk_test_*) for local development.',
  );
}

export const stripe = new Stripe(key, {
  apiVersion: '2026-04-22.dahlia',
  typescript: true,
});
