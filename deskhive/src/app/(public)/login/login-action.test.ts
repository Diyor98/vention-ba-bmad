import { describe, it, expect } from 'vitest';

// AC-3(b) verification (env-gated): after the US-1.1 seed run, the seeded
// Super Admin row at admin@deskhive.local must carry role='SUPER_ADMIN'.
// Better Auth's signInEmail uses the same users.role column to populate the
// session, so a correct DB row implies a correct session role at login.
//
// Skipped when DATABASE_URL is unset so unit-only `pnpm test` runs (CI without
// Postgres) still pass. Run locally after `pnpm db:seed` to exercise.

const hasDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDb)('seeded Super Admin (AC-3 partial)', () => {
  it('has role SUPER_ADMIN in users table', async () => {
    const { db } = await import('@/db/client');
    const { usersTable } = await import('@/db/schema');
    const { eq } = await import('drizzle-orm');

    const rows = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.email, 'admin@deskhive.local'));

    expect(rows.length).toBe(1);
    expect(rows[0].role).toBe('SUPER_ADMIN');
  });
});
