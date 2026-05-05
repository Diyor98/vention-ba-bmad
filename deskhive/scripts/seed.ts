import 'dotenv/config';
import { eq } from 'drizzle-orm';
import { auth } from '@/lib/auth/config';
import { db } from '@/db/client';
import { usersTable } from '@/db/schema';

const SEED_EMAIL = 'admin@deskhive.local';
const SEED_PASSWORD = 'SuperAdmin1!';
const SEED_FULL_NAME = 'DeskHive Super Admin';

async function main() {
  // Idempotent: skip if a Super Admin with this email already exists.
  const existing = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(eq(usersTable.email, SEED_EMAIL))
    .limit(1);

  if (existing.length > 0) {
    console.log(`Super Admin already exists (${SEED_EMAIL}); seed is a no-op.`);
    return;
  }

  // Use Better Auth's signUp so the password hash is produced by the configured argon2id hasher.
  // `fullName` is required because additionalFields.fullName has no `input: false` (real users
  // supply it on registration per Doc B §7.6 — Full name required, non-empty).
  const result = await auth.api.signUpEmail({
    body: {
      email: SEED_EMAIL,
      password: SEED_PASSWORD,
      name: SEED_FULL_NAME,
      fullName: SEED_FULL_NAME,
    },
  });

  if (!result || (typeof result === 'object' && 'error' in result)) {
    throw new Error(`Failed to create Super Admin: ${JSON.stringify(result)}`);
  }

  // Better Auth created the user with default role 'GUEST' (per additionalFields config).
  // Promote to SUPER_ADMIN via direct UPDATE.
  await db
    .update(usersTable)
    .set({ role: 'SUPER_ADMIN', fullName: SEED_FULL_NAME })
    .where(eq(usersTable.email, SEED_EMAIL));

  console.log(`Super Admin seeded: ${SEED_EMAIL} / ${SEED_PASSWORD}`);
  console.log(
    'These credentials are documented in deskhive/README.md → "Database setup".',
  );
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
