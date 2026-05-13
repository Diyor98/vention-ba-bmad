# DeskHive E2E tests

Playwright E2E suite for DeskHive. Most assertions are unit-tested in `src/`; this folder covers cross-cutting flows where multiple layers (route guards, Server Actions, DB, browser) need to compose correctly.

## Running

```bash
pnpm test:e2e            # full Chromium run
pnpm test:e2e --grep "X" # filter
```

The Playwright config (`../playwright.config.ts`) auto-starts `pnpm dev` and waits for `http://localhost:3000`. Re-runs reuse the running dev server.

## When to use the `authenticatedPage` fixture (Story 7-PREP-1)

Any test that needs a logged-in user. The fixture mints a Better Auth session server-side (no `/login` form fill, no backdoor route) and returns a pre-authenticated `Page`.

```ts
import { test, expect } from '../fixtures';

test('owner sees their own seeded space', async ({ authenticatedPage }) => {
  const page = await authenticatedPage('owner');
  await page.goto('/owner/spaces');
  await expect(page.getByText('Seeded Owner Coworks')).toBeVisible();
});
```

**Unauthenticated redirect tests stay vanilla** — import `test` from `@playwright/test` and assert the `/login` redirect. No fixture needed.

## Role shorthands

| Role | Seed user | Credentials | State |
|---|---|---|---|
| `'guest'` | `guest@deskhive.local` | `GuestPass1!` | GUEST, no application (Story 7-PREP-1 — for State A coverage) |
| `'owner'` | `owner@deskhive.local` | `SpaceOwner1!` | SPACE_OWNER, owns `Seeded Owner Coworks` (Story 7-5 seed) |
| `'admin'` | `admin@deskhive.local` | `SuperAdmin1!` | SUPER_ADMIN |
| `'fresh-owner'` | `applicant3@deskhive.local` | `Applicant3!` | SPACE_OWNER via APPROVED application (Story 7-4 seed), owns zero spaces |

**`'fresh-owner'` alignment note:** the Story 7-PREP-1 BA decisions doc named `ihtiyor@mail.com` as the "fresh-approved owner, zero spaces" subject. That user was created manually during Story 7-4's BA browser walk and is NOT in the seed. `applicant3@deskhive.local` is the canonical seeded equivalent.

## Arbitrary-email variant

For seeded users without a role shorthand (e.g., the four applicants in their non-shorthand state), pass `{ email }`:

```ts
const page = await authenticatedPage({ email: 'applicant1@deskhive.local' });
```

The email must be in `tests/fixtures/auth-helpers.ts::SEED_CREDENTIALS`. Passing a non-seed email throws — by design, to prevent silent reliance on seed expansion.

## Mutation discipline

Most migrated tests **read** from seeded state. If a test must **mutate** (e.g., approve a PENDING application), it must:

1. Clean up after itself (e.g., `afterAll` resets the row), OR
2. Be carefully ordered so the mutation is acceptable as setup for the next test, OR
3. Use a seeded resource no other test touches.

**No DB reset infrastructure exists yet.** Per-test rollback / DB snapshots are a future story. Until then, lean read-heavy.

## What the fixture does NOT do

- **No `/login` form fill.** Slow and brittle — login is tested explicitly in `login.spec.ts`.
- **No backdoor route.** No `/api/test/login` or any test-only auth bypass in production code.
- **No DB reset.** Tests share the seeded state; mutations follow the rules above.
- **No password parameter at call sites.** Credentials live in `auth-helpers.ts::SEED_CREDENTIALS`.

## Where to find examples

| Spec | Authenticated cases |
|---|---|
| `owner-routes.spec.ts` | Cross-tenant ownership rejection (load-bearing security test) + owner-sees-own-spaces |
| `admin-applications.spec.ts` | Admin sees seeded applications |
| `become-a-host.spec.ts` | State A (fresh Guest) + State B (PENDING applicant1) |
| `bookings.spec.ts` | Guest sees their own seeded booking at `/my-bookings` |

Migration is **bounded** — Phase 1 specs that don't have an authenticated gap stay unauthenticated-only. Opportunistic migration happens as future stories touch those files.

## Adding a new fixture

The fixture lives in `tests/fixtures/`:

- `auth-helpers.ts` — `SEED_CREDENTIALS`, `ROLE_EMAIL`, `createSessionCookies` (calls `auth.api.signInEmail` server-side).
- `seed-helpers.ts` — `getSeededOwnerSpaceId`, `getSeededUserId` (DB lookups for runtime IDs).
- `authenticated-page.ts` — Playwright `test.extend` registration.
- `index.ts` — barrel; specs import `{ test, expect }` from here.

When adding new helpers (e.g., a `getSeededBookingId` for a future story), follow the same shape and export from `index.ts`.
