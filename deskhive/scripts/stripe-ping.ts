/**
 * Story 9-1: CLI smoke test for the Stripe wrapper. Calls Stripe's
 * read-only `/balance` endpoint to verify authentication + connectivity.
 * Internal-only tooling — same posture as scripts/send-test-email.ts
 * and scripts/seed.ts (CLI, not a route).
 *
 * Decision §9: read-only probe. The balance endpoint returns
 * immediately, has no side effects, and proves the secret key works
 * end-to-end. Test-mode balance is always $0.00 — that's correct, not
 * an error.
 *
 * Usage:
 *   pnpm stripe-ping
 *
 * Requires (in .env.local or environment):
 *   - STRIPE_SECRET_KEY (your sk_test_* key from the Stripe dashboard)
 *
 * Exit codes:
 *   0 — ping succeeded, balance retrieved
 *   1 — any failure (missing key, invalid key, network error, API error)
 *
 * ─────────────────────────────────────────────────────────────────────────
 * dotenv-vs-ES-module-hoisting note:
 * ─────────────────────────────────────────────────────────────────────────
 *   A top-level `import { stripe } from '@/lib/stripe'` would be hoisted
 *   ABOVE the `config({ path: '.env.local' })` call below, causing
 *   stripe.ts's module-load env validation to fire BEFORE dotenv sets
 *   the env vars. We use a dynamic `await import('@/lib/stripe')`
 *   inside main() to defer the import until after dotenv has run.
 *
 *   The Next.js app doesn't have this problem because Next.js loads
 *   .env.local before any user module evaluates. tsx (which runs this
 *   script via `pnpm stripe-ping`) doesn't auto-load .env*.
 *
 *   scripts/send-test-email.ts uses a top-level static import and works
 *   fine — but only because src/lib/email.ts validates env INSIDE
 *   sendEmail(), not at module load. Stripe's stricter contract (hard-
 *   throw at module load, BA Decision §3) is what forces the dynamic
 *   import pattern here.
 */

import { config } from 'dotenv';
config({ path: '.env.local' });
config({ path: '.env' });

function formatBalance(
  parts: ReadonlyArray<{ amount: number; currency: string }>,
): string {
  if (parts.length === 0) return '0.00';
  return parts
    .map((b) => `${(b.amount / 100).toFixed(2)} ${b.currency.toUpperCase()}`)
    .join(', ');
}

async function main(): Promise<void> {
  console.log('Pinging Stripe API...');
  // Dynamic import — must happen AFTER the dotenv preload above. See
  // the hoisting note in the file header.
  const { stripe } = await import('@/lib/stripe');
  const balance = await stripe.balance.retrieve();
  console.log('✓ Stripe API connection works');
  console.log(`  Available balance: ${formatBalance(balance.available)}`);
  console.log(`  Pending balance:   ${formatBalance(balance.pending)}`);
}

main()
  .then(() => process.exit(0))
  .catch((err: unknown) => {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`✗ Stripe API ping failed: ${msg}`);
    process.exit(1);
  });
