import { config } from 'dotenv';
config({ path: '.env.local' });
config({ path: '.env' });

import { and, eq } from 'drizzle-orm';
import { auth } from '@/lib/auth/config';
import { db } from '@/db/client';
import { applicationsTable, usersTable } from '@/db/schema';
import type { ApplicationStatus } from '@/db/schema';

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

// Story 7-4 (Phase 2): seed four applicant GUESTs + four applications
// (2 PENDING + 1 APPROVED w/ atomic promotion + 1 REJECTED w/ reason).
// Used for BA browser verification of /admin/applications.
const SEED_APPLICANTS = [
  {
    email: 'applicant1@deskhive.local',
    password: 'Applicant1!',
    fullName: 'Anna Bergstrom',
  },
  {
    email: 'applicant2@deskhive.local',
    password: 'Applicant2!',
    fullName: 'Jordan Tan',
  },
  {
    email: 'applicant3@deskhive.local',
    password: 'Applicant3!',
    fullName: 'Priya Narayan',
  },
  {
    email: 'applicant4@deskhive.local',
    password: 'Applicant4!',
    fullName: 'Felix Kraus',
  },
] as const;

async function seedUser(opts: {
  email: string;
  password: string;
  fullName: string;
  role: 'SUPER_ADMIN' | 'SPACE_OWNER' | 'GUEST';
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
  // client-driven promotion). For GUEST seed users (Story 7-4 applicants),
  // the UPDATE is a no-op but also confirms the fullName field.
  await db
    .update(usersTable)
    .set({ role: opts.role, fullName: opts.fullName })
    .where(eq(usersTable.email, opts.email));

  console.log(`${opts.role} seeded: ${opts.email} / ${opts.password}`);
}

/**
 * Story 7-4: seed a single application for a given applicant. Idempotent
 * via a check on existing applications for this user with the same status
 * (skips if any).
 *
 * For APPROVED status: bypasses `approveApplicationAction` (which needs
 * a Next.js request context) and reproduces the atomic-promotion contract
 * via direct `db.transaction`. Mirrors Story 7-2's transaction shape —
 * source-state-guarded conditional UPDATE on users.role. Documented as
 * the seed-bypass pattern in memory `reference_admin_review_ui_pattern.md`.
 */
async function seedApplication(opts: {
  applicantEmail: string;
  businessName: string;
  businessAddress: string;
  taxId: string;
  motivation: string | null;
  status: ApplicationStatus;
  rejectionReason?: string;
}): Promise<void> {
  // Resolve applicant user.
  const [applicant] = await db
    .select({ id: usersTable.id, role: usersTable.role })
    .from(usersTable)
    .where(eq(usersTable.email, opts.applicantEmail))
    .limit(1);
  if (!applicant) {
    throw new Error(
      `Cannot seed application: applicant not found (${opts.applicantEmail}).`,
    );
  }

  // Idempotency: skip if any application already exists for this user
  // with the same status. (Allows re-seeding after a partial run.)
  const [existing] = await db
    .select({ id: applicationsTable.id })
    .from(applicationsTable)
    .where(
      and(
        eq(applicationsTable.userId, applicant.id),
        eq(applicationsTable.status, opts.status),
      ),
    )
    .limit(1);
  if (existing) {
    console.log(
      `Application already exists for ${opts.applicantEmail} (${opts.status}); seed is a no-op.`,
    );
    return;
  }

  if (opts.status === 'APPROVED') {
    // Atomic role promotion (mirrors approveApplicationAction's db.transaction
    // from Story 7-2). Server Actions can't be invoked from the seed (no
    // Next.js request context); reproducing the contract here.
    await db.transaction(async (tx) => {
      await tx.insert(applicationsTable).values({
        userId: applicant.id,
        businessName: opts.businessName,
        businessAddress: opts.businessAddress,
        taxId: opts.taxId,
        motivation: opts.motivation,
        status: 'APPROVED',
        reviewedAt: new Date(),
        reviewedByUserId: null, // No reviewer recorded for seed
      });
      // Conditional UPDATE: promote only if still GUEST (race-safety).
      // The seed runs once at startup; the WHERE clause is defense
      // against a re-seed where the applicant was already promoted.
      const updated = await tx
        .update(usersTable)
        .set({ role: 'SPACE_OWNER', updatedAt: new Date() })
        .where(
          and(eq(usersTable.id, applicant.id), eq(usersTable.role, 'GUEST')),
        )
        .returning({ id: usersTable.id });
      if (updated.length === 0 && applicant.role !== 'SPACE_OWNER') {
        throw new Error(
          `Seed approve: failed to promote ${opts.applicantEmail} (role was ${applicant.role}).`,
        );
      }
    });
    console.log(
      `APPROVED application seeded + ${opts.applicantEmail} promoted to SPACE_OWNER.`,
    );
    return;
  }

  // PENDING or REJECTED: single INSERT.
  await db.insert(applicationsTable).values({
    userId: applicant.id,
    businessName: opts.businessName,
    businessAddress: opts.businessAddress,
    taxId: opts.taxId,
    motivation: opts.motivation,
    status: opts.status,
    rejectionReason: opts.rejectionReason ?? null,
    reviewedAt: opts.status === 'REJECTED' ? new Date() : null,
    reviewedByUserId: null,
  });
  console.log(
    `${opts.status} application seeded for ${opts.applicantEmail}.`,
  );
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

  // Story 7-4: applicant Guests.
  for (const a of SEED_APPLICANTS) {
    await seedUser({
      email: a.email,
      password: a.password,
      fullName: a.fullName,
      role: 'GUEST',
    });
  }

  // Story 7-4: applications across all three statuses.
  await seedApplication({
    applicantEmail: 'applicant1@deskhive.local',
    businessName: 'Bergstrom Coworks',
    businessAddress: '14 Storgatan\nStockholm, Sweden',
    taxId: 'SE556677889900',
    motivation:
      'We run a small coworking space in central Stockholm. Looking for a way to list our spare desks during quiet weeks.',
    status: 'PENDING',
  });
  await seedApplication({
    applicantEmail: 'applicant2@deskhive.local',
    businessName: 'Mission Annex',
    businessAddress: '218 Valencia St\nSan Francisco, CA',
    taxId: 'US-EIN-12-3456789',
    motivation: null,
    status: 'PENDING',
  });
  await seedApplication({
    applicantEmail: 'applicant3@deskhive.local',
    businessName: 'Sundial Coworks',
    businessAddress: 'Av. Reforma 250\nMexico City, MX',
    taxId: 'MX-RFC-NARP800101',
    motivation:
      'Established coworking host with 18 desks across two floors. Ready to onboard immediately.',
    status: 'APPROVED',
  });
  await seedApplication({
    applicantEmail: 'applicant4@deskhive.local',
    businessName: 'Folk House',
    businessAddress: 'Rua Antonio Maria Cardoso 4\nLisbon, PT',
    taxId: 'PT-NIF-501234567',
    motivation: 'I want to host.',
    status: 'REJECTED',
    rejectionReason:
      'Insufficient business detail. Please reapply with more context about your space, capacity, and operating hours.',
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
