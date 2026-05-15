import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Story 9-1: tests the module-load contract of src/lib/stripe.ts —
// hard-throws on missing / wrong-prefix / live-key-outside-production,
// pins apiVersion at construction, exports a singleton.
//
// Module-load tests require fresh module evaluation per test, so each
// test does `vi.resetModules()` then dynamic `await import('./stripe')`.
// Env is mutated via `vi.stubEnv` / `vi.unstubAllEnvs` so NODE_ENV (a
// read-only-typed property in @types/node) can be set without ts-ignore.

// Constructor capture — vi.hoisted runs before vi.mock so the mock
// factory can close over it.
const constructorCalls = vi.hoisted(
  () => [] as Array<{ key: string; config: unknown }>,
);

vi.mock('stripe', () => {
  const StripeMock = vi
    .fn()
    .mockImplementation(function (this: object, key: string, config: unknown) {
      constructorCalls.push({ key, config });
      return this;
    });
  return { default: StripeMock };
});

beforeEach(() => {
  vi.resetModules();
  vi.unstubAllEnvs();
  constructorCalls.length = 0;
  // Explicit clean slate — stubbing to '' so the module's
  // `!key || key.trim().length === 0` guard treats the env as missing
  // regardless of whatever the parent process set.
  vi.stubEnv('STRIPE_SECRET_KEY', '');
  vi.stubEnv('NODE_ENV', '');
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('src/lib/stripe (Story 9-1) — module-load contract', () => {
  it('initializes cleanly with a sk_test_* key', async () => {
    vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_examplekey123');

    const mod = await import('./stripe');

    expect(mod.stripe).toBeDefined();
    expect(constructorCalls).toHaveLength(1);
    expect(constructorCalls[0]?.key).toBe('sk_test_examplekey123');
  });

  it('throws if STRIPE_SECRET_KEY is missing', async () => {
    // beforeEach already stubbed it to empty string — the module's
    // empty-string guard treats this as missing.
    await expect(import('./stripe')).rejects.toThrow(/STRIPE_SECRET_KEY is not set/);
    expect(constructorCalls).toHaveLength(0);
  });

  it('throws if STRIPE_SECRET_KEY has an invalid prefix', async () => {
    vi.stubEnv('STRIPE_SECRET_KEY', 'xyz_123_not_a_real_prefix');

    await expect(import('./stripe')).rejects.toThrow(
      /STRIPE_SECRET_KEY format is invalid/,
    );
    expect(constructorCalls).toHaveLength(0);
  });

  it('throws on sk_live_* outside production', async () => {
    vi.stubEnv('STRIPE_SECRET_KEY', 'sk_live_fakefake123');
    vi.stubEnv('NODE_ENV', 'development');

    await expect(import('./stripe')).rejects.toThrow(
      /Refusing to use a live Stripe key outside of production/,
    );
    expect(constructorCalls).toHaveLength(0);
  });

  it('proceeds without throwing when sk_live_* is paired with NODE_ENV=production', async () => {
    vi.stubEnv('STRIPE_SECRET_KEY', 'sk_live_prodkey456');
    vi.stubEnv('NODE_ENV', 'production');

    const mod = await import('./stripe');

    expect(mod.stripe).toBeDefined();
    expect(constructorCalls).toHaveLength(1);
    expect(constructorCalls[0]?.key).toBe('sk_live_prodkey456');
  });

  it('pins apiVersion to the SDK LatestApiVersion at construction', async () => {
    vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_pinned');

    await import('./stripe');

    expect(constructorCalls).toHaveLength(1);
    const config = constructorCalls[0]?.config as {
      apiVersion?: string;
      typescript?: boolean;
    };
    // BA Decision §2 locks the pin. Value below matches the SDK's
    // exported `LatestApiVersion` constant for stripe@22.1.1 — keep
    // these in lockstep when bumping the SDK.
    expect(config.apiVersion).toBe('2026-04-22.dahlia');
    expect(config.typescript).toBe(true);
  });

  it('exports a singleton — repeated imports return the same instance', async () => {
    vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_singleton');

    const first = await import('./stripe');
    const second = await import('./stripe');

    // Without vi.resetModules() between imports, Vitest's module cache
    // returns the SAME module record — `stripe` is the same instance.
    // The constructor must NOT have been called twice.
    expect(first.stripe).toBe(second.stripe);
    expect(constructorCalls).toHaveLength(1);
  });
});
