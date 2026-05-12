import { config } from 'dotenv';
config({ path: '.env.local' });
config({ path: '.env' });

import { eq } from 'drizzle-orm';
import { auth } from '@/lib/auth/config';
import { db } from '@/db/client';
import { usersTable } from '@/db/schema';

const SEED_ADMIN_EMAIL = 'admin@deskhive.local';
const SEED_ADMIN_PASSWORD = 'SuperAdmin1!';
const SEED_ADMIN_FULL_NAME = 'DeskHive Super Admin';

// Story 7-1 (Phase 2): seed a SPACE_OWNER alongside the Phase 1 admin.
// Same idempotent sign-up + promote-via-UPDATE pattern. BA + developers
// use this account to exercise mode-switching during verification before
// the application flow (Stories 7-2/7-3/7-4) ships.
const SEED_OWNER_EMAIL = 'owner@deskhive.local';
const SEED_OWNER_PASSWORD = 'SpaceOwner1!';
const SEED_OWNER_FULL_NAME = 'DeskHive Space Owner';

async function seedUser(opts: {
  email: string;
  password: string;
  fullName: string;
  role: 'SUPER_ADMIN' | 'SPACE_OWNER';
}): Promise<void> {
  // Idempotent: skip if a user with this email already exists.
  const existing = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(eq(usersTable.email, opts.email))
    .limit(1);

  if (existing.length > 0) {
    console.log(`${opts.role} already exists (${opts.email}); seed is a no-op.`);
    return;
  }

  // Better Auth's signUp produces the argon2id-hashed password via the
  // configured hasher. Only `name` is needed — additionalFields config
  // maps it to our `fullName` property (DB column `full_name`).
  const result = await auth.api.signUpEmail({
    body: {
      email: opts.email,
      password: opts.password,
      name: opts.fullName,
    },
  });

  if (!result || (typeof result === 'object' && 'error' in result)) {
    throw new Error(
      `Failed to create ${opts.role} (${opts.email}): ${JSON.stringify(result)}`,
    );
  }

  // Better Auth defaults the user's role to 'GUEST' (per additionalFields
  // config + input:false). Promote via direct UPDATE — the only path to a
  // non-GUEST role in DeskHive (Better Auth's input:false blocks
  // client-driven promotion).
  await db
    .update(usersTable)
    .set({ role: opts.role, fullName: opts.fullName })
    .where(eq(usersTable.email, opts.email));

  console.log(`${opts.role} seeded: ${opts.email} / ${opts.password}`);
}

async function main() {
  await seedUser({
    email: SEED_ADMIN_EMAIL,
    password: SEED_ADMIN_PASSWORD,
    fullName: SEED_ADMIN_FULL_NAME,
    role: 'SUPER_ADMIN',
  });

  await seedUser({
    email: SEED_OWNER_EMAIL,
    password: SEED_OWNER_PASSWORD,
    fullName: SEED_OWNER_FULL_NAME,
    role: 'SPACE_OWNER',
  });

  console.log(
    'Seed credentials are documented in deskhive/README.md → "Database setup".',
  );
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
