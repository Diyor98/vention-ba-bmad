import { config } from 'dotenv';
config({ path: '.env.local' });
config({ path: '.env' });

import { and, eq } from 'drizzle-orm';
import { auth } from '@/lib/auth/config';
import { db } from '@/db/client';
import {
  AMENITY_SLUGS,
  applicationsTable,
  bookingsTable,
  desksTable,
  spacesTable,
  stripeConnectAccountsTable,
  usersTable,
} from '@/db/schema';
import type { AmenitySlug, ApplicationStatus, BookingStatus } from '@/db/schema';

// ─────────────────────────────────────────────────────────────
// Story DESIGN-2: deterministic amenity fixture across the seeded
// spaces. Each space gets 4–8 amenities; together the 4 seeded
// fixtures cover all 16 canonical slugs at least once. Distribution
// is hand-tuned + sliced for repeatable seeds.
// ─────────────────────────────────────────────────────────────
const SEEDED_SPACE_AMENITIES: Record<string, AmenitySlug[]> = {
  // Owner-seeded space — bright Tashkent coworks; 7 amenities.
  'Seeded Owner Coworks': [
    'wifi',
    'coffee_tea',
    'access_24_7',
    'meeting_rooms',
    'standing_desks',
    'monitors',
    'whiteboard',
  ],
  // Phase 1 admin-owned demo #1 — neighborhood spot in Almaty; 5 amenities.
  'Almaty Atrium Workspace': [
    'wifi',
    'coffee_tea',
    'printing_scanning',
    'kitchen',
    'phone_booths',
  ],
  // Phase 1 admin-owned demo #2 — accessible, family-friendly; 6 amenities.
  'Bishkek Bridge Studio': [
    'wifi',
    'lockers',
    'pet_friendly',
    'wheelchair_accessible',
    'parking',
    'air_conditioning',
  ],
  // Phase 1 admin-owned demo #3 — exec / media-friendly; 4 amenities.
  'Samarkand Skyline Loft': [
    'wifi',
    'projector',
    'meeting_rooms',
    'phone_booths',
  ],
};

// Coverage assertion at module-load: every canonical amenity slug
// must appear in at least one seeded space. If a future edit drops
// a slug below 1 coverage, the script fails loudly rather than
// silently letting the AmenitiesDisplay never render that slug
// against seed data.
{
  const covered = new Set(Object.values(SEEDED_SPACE_AMENITIES).flat());
  const missing = AMENITY_SLUGS.filter((s) => !covered.has(s));
  if (missing.length > 0) {
    throw new Error(
      `SEEDED_SPACE_AMENITIES is missing coverage for: ${missing.join(', ')}`,
    );
  }
}

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

// Story 7-PREP-1 (Phase 2): seed a fresh GUEST with no application for
// E2E State A coverage on /become-a-host. Bounded BA-approved exception
// to the prep story's "no seed changes" rule (Decision §10 exception
// logged in the story file). The four applicant seed users all have
// applications and therefore land in State B; State A coverage is
// otherwise unreachable through the fixture.
const SEED_GUEST_EMAIL = 'guest@deskhive.local';
// 11 chars — meets the 8-char minimum enforced by both Better Auth's
// default and our own registerSchema (src/lib/validation/auth.ts:9).
// BA pre-dispatch lock named `Guest1!`; bumped during dev-story to
// satisfy the password-length policy (documented in Dev Agent Record).
const SEED_GUEST_PASSWORD = 'GuestPass1!';
const SEED_GUEST_FULL_NAME = 'Test Guest';

// Story 9-2b (Phase 2): seed a SECOND SPACE_OWNER in a "pending
// Stripe Connect onboarding" state, so the gated-publish E2E test has
// a stable target. Mirrors the bounded-exception precedent of
// `guest@deskhive.local` from Story 7-PREP-1 (BA Decision §5).
//
// Originally seeded as `owner-no-connect@deskhive.local`, renamed
// post-9-2b BA-walk: the BA verified the gated UI by clicking through
// the Connect onboarding affordance, which left the user with an
// active `stripe_connect_accounts` row — the previous name then lied
// about the state. The renamed user is paired with a scrub step that
// DELETEs any existing Connect row on every `pnpm db:seed`, so the
// fixture is robust to manual onboarding walks. See
// `scrubPendingOnboardingConnectRow` below + Decision §5 in
// `docs/design/9-2b-publish-gating-ba-decisions.md` for full context.
//
// DO NOT seed a `stripe_connect_accounts` row OR any spaces for this
// user — the gated-path E2E exercises the full create-then-attempt-
// publish flow against a virgin owner.
const SEED_OWNER_PENDING_ONBOARDING_EMAIL =
  'owner-pending-onboarding@deskhive.local';
const SEED_OWNER_PENDING_ONBOARDING_PASSWORD = 'PendingOnboard1!';
const SEED_OWNER_PENDING_ONBOARDING_FULL_NAME = 'Owner Pending Onboarding';

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

/**
 * Story 7-5: seed a single space owned by `owner@deskhive.local` plus 2-3
 * desks. Idempotent via a name marker (`'Seeded Owner Coworks'`) — if a
 * space with that name and the right owner_id already exists, skip both
 * the space and the desks. Other Phase 1 seeded spaces stay with
 * owner_id = NULL (Decision §10 — no backfill).
 */
async function seedOwnerSpace(): Promise<string | null> {
  const [owner] = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(eq(usersTable.email, SEED_OWNER_EMAIL))
    .limit(1);
  if (!owner) {
    console.warn(
      `Seed owner not found (${SEED_OWNER_EMAIL}); skipping space seed.`,
    );
    return null;
  }

  const SPACE_NAME = 'Seeded Owner Coworks';
  const [existingSpace] = await db
    .select({ id: spacesTable.id })
    .from(spacesTable)
    .where(
      and(eq(spacesTable.name, SPACE_NAME), eq(spacesTable.ownerId, owner.id)),
    )
    .limit(1);

  if (existingSpace) {
    console.log(
      `Owner space already exists (${SPACE_NAME}); skipping seed of space + desks.`,
    );
    return existingSpace.id;
  }

  const [space] = await db
    .insert(spacesTable)
    .values({
      name: SPACE_NAME,
      city: 'Tashkent',
      addressLine: 'Amir Temur Avenue 23',
      description:
        'A bright open-plan workspace in central Tashkent with espresso, fast wifi, and a south-facing balcony. Run by the seeded SPACE_OWNER for Story 7-5 verification.',
      primaryImageUrl:
        'https://images.unsplash.com/photo-1497366216548-37526070297c?auto=format&fit=crop&w=1600&q=80',
      status: 'PUBLISHED',
      ownerId: owner.id,
      amenities: SEEDED_SPACE_AMENITIES[SPACE_NAME] ?? [],
    })
    .returning({ id: spacesTable.id });

  await db.insert(desksTable).values([
    {
      spaceId: space.id,
      label: 'Desk 1',
      dailyPriceCents: 2500,
      isActive: true,
    },
    {
      spaceId: space.id,
      label: 'Desk 2',
      dailyPriceCents: 3500,
      isActive: true,
    },
    {
      spaceId: space.id,
      label: 'Desk 3',
      dailyPriceCents: 4000,
      isActive: true,
    },
  ]);

  console.log(
    `Owner space seeded (${SPACE_NAME}) for ${SEED_OWNER_EMAIL} with 3 desks.`,
  );
  return space.id;
}

// ─────────────────────────────────────────────────────────────
// Story DESIGN-2: 3 additional Phase 1 admin-owned demo spaces so
// the canonical 16-slug amenity set is covered across the seeded
// fixtures. Idempotent via space-name marker.
// ─────────────────────────────────────────────────────────────
type SeededAdminSpace = {
  name: string;
  city: string;
  addressLine: string;
  description: string;
  primaryImageUrl: string;
  desks: Array<{ label: string; dailyPriceCents: number }>;
};

const SEEDED_ADMIN_SPACES: SeededAdminSpace[] = [
  {
    name: 'Almaty Atrium Workspace',
    city: 'Almaty',
    addressLine: 'Dostyk Avenue 113',
    description:
      'A neighborhood coworks in the Atrium business cluster — quiet bays, a kitchenette, and a print room for late-day deadlines.',
    primaryImageUrl:
      'https://images.unsplash.com/photo-1521737711867-e3b97375f902?auto=format&fit=crop&w=1600&q=80',
    desks: [
      { label: 'Desk 1', dailyPriceCents: 2200 },
      { label: 'Desk 2', dailyPriceCents: 2200 },
      { label: 'Desk 3', dailyPriceCents: 2800 },
    ],
  },
  {
    name: 'Bishkek Bridge Studio',
    city: 'Bishkek',
    addressLine: 'Chuy Avenue 154',
    description:
      'An accessible, family-friendly studio with covered parking and air-conditioned bays. Lockers available at the front desk.',
    primaryImageUrl:
      'https://images.unsplash.com/photo-1497366754035-f200968a6e72?auto=format&fit=crop&w=1600&q=80',
    desks: [
      { label: 'Desk A', dailyPriceCents: 1800 },
      { label: 'Desk B', dailyPriceCents: 2400 },
    ],
  },
  {
    name: 'Samarkand Skyline Loft',
    city: 'Samarkand',
    addressLine: 'Registan Square 7',
    description:
      'A high-ceilinged loft overlooking the Registan. Projector + private meeting room available; phone booths for client calls.',
    primaryImageUrl:
      'https://images.unsplash.com/photo-1572025442646-866d16c84a54?auto=format&fit=crop&w=1600&q=80',
    desks: [
      { label: 'Loft Desk 1', dailyPriceCents: 3200 },
      { label: 'Loft Desk 2', dailyPriceCents: 3200 },
      { label: 'Loft Desk 3', dailyPriceCents: 3800 },
    ],
  },
];

async function seedAdminDemoSpaces(): Promise<void> {
  for (const fixture of SEEDED_ADMIN_SPACES) {
    const [existing] = await db
      .select({ id: spacesTable.id })
      .from(spacesTable)
      .where(eq(spacesTable.name, fixture.name))
      .limit(1);
    if (existing) {
      console.log(`Admin demo space already exists (${fixture.name}); skipping.`);
      continue;
    }

    const [space] = await db
      .insert(spacesTable)
      .values({
        name: fixture.name,
        city: fixture.city,
        addressLine: fixture.addressLine,
        description: fixture.description,
        primaryImageUrl: fixture.primaryImageUrl,
        status: 'PUBLISHED',
        // Phase 1 admin-owned: ownerId stays NULL (no SPACE_OWNER attached).
        ownerId: null,
        amenities: SEEDED_SPACE_AMENITIES[fixture.name] ?? [],
      })
      .returning({ id: spacesTable.id });

    await db.insert(desksTable).values(
      fixture.desks.map((d) => ({
        spaceId: space.id,
        label: d.label,
        dailyPriceCents: d.dailyPriceCents,
        isActive: true,
      })),
    );

    console.log(
      `Admin demo space seeded (${fixture.name}) in ${fixture.city} with ${fixture.desks.length} desk(s).`,
    );
  }
}

/**
 * Story DESIGN-2: ensure the 4 fixture spaces always carry the locked
 * amenity sets, even if the row pre-dates the amenities column (the
 * migration applied DEFAULT '{}' to existing rows). Idempotent — runs
 * the same UPDATE on every seed.
 */
async function backfillSeededAmenities(): Promise<void> {
  for (const [spaceName, amenities] of Object.entries(SEEDED_SPACE_AMENITIES)) {
    const result = await db
      .update(spacesTable)
      .set({ amenities, updatedAt: new Date() })
      .where(eq(spacesTable.name, spaceName))
      .returning({ id: spacesTable.id });
    if (result.length > 0) {
      console.log(
        `Backfilled amenities on ${spaceName} (${amenities.length} slug(s)).`,
      );
    }
  }
}

/**
 * Story 9-2 BA Decision §8: seed a synthetic `stripe_connect_accounts`
 * row for the seeded owner. Idempotent — no-op if a row already exists
 * for this user.
 *
 * Why synthetic: real Stripe API calls from the seed script would add
 * an external dependency to a script that runs in CI and on every dev
 * setup. The synthetic ID `acct_seed_for_e2e_only` deliberately fails
 * Stripe's real-account-id pattern so any production code path that
 * mistakenly calls Stripe with this ID gets a clear 404 (signaling
 * the test boundary needs to mock at that seam).
 */
const SEED_OWNER_CONNECT_ACCOUNT_ID = 'acct_seed_for_e2e_only';

/**
 * Story 9-2b (post-BA-walk hardening): keep the `owner-pending-
 * onboarding@deskhive.local` user in a "no Connect row" state regardless
 * of what manual onboarding walks may have done in the browser. Runs on
 * every `pnpm db:seed`; idempotent whether or not a row exists.
 *
 * Why this exists: the BA browser walk for 9-2b verified the gated UI by
 * clicking the disabled-Publish affordance → following the Settings link
 * → completing real Stripe Express onboarding (test mode). That left the
 * user with an active Connect row, which would silently break the
 * gated-path E2E test on the next CI run. The fixture now scrubs on
 * seed so re-running `pnpm db:seed` always returns the user to the
 * pending state — same idempotency contract as the other seed steps.
 */
async function scrubPendingOnboardingConnectRow(): Promise<void> {
  const [owner] = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(eq(usersTable.email, SEED_OWNER_PENDING_ONBOARDING_EMAIL))
    .limit(1);
  if (!owner) {
    console.warn(
      `Pending-onboarding owner not found (${SEED_OWNER_PENDING_ONBOARDING_EMAIL}); skipping Connect scrub.`,
    );
    return;
  }
  const result = await db
    .delete(stripeConnectAccountsTable)
    .where(eq(stripeConnectAccountsTable.userId, owner.id))
    .returning({ id: stripeConnectAccountsTable.id });
  if (result.length > 0) {
    console.log(
      `Scrubbed ${result.length} stripe_connect_accounts row(s) for ${SEED_OWNER_PENDING_ONBOARDING_EMAIL} (returning to pending state).`,
    );
  }
}

async function seedOwnerConnectAccount(): Promise<void> {
  const [owner] = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(eq(usersTable.email, SEED_OWNER_EMAIL))
    .limit(1);
  if (!owner) {
    console.warn(
      `Seed owner not found (${SEED_OWNER_EMAIL}); skipping Connect account seed.`,
    );
    return;
  }

  const [existing] = await db
    .select({ id: stripeConnectAccountsTable.id })
    .from(stripeConnectAccountsTable)
    .where(eq(stripeConnectAccountsTable.userId, owner.id))
    .limit(1);
  if (existing) {
    console.log(
      `Stripe Connect row already exists for ${SEED_OWNER_EMAIL}; seed is a no-op.`,
    );
    return;
  }

  await db.insert(stripeConnectAccountsTable).values({
    userId: owner.id,
    stripeAccountId: SEED_OWNER_CONNECT_ACCOUNT_ID,
    onboardingCompleted: true,
    chargesEnabled: true,
    payoutsEnabled: true,
  });
  console.log(
    `Seeded Stripe Connect row for ${SEED_OWNER_EMAIL} (synthetic ID; for E2E state only).`,
  );
}

/**
 * Story 7-5: seed 2-3 bookings from existing applicant guests on the
 * owner's seeded space. Idempotent: skip if any booking by these guests
 * on this space already exists. Mix of statuses across past + future
 * dates so the BA can verify Confirm/Reject flows end-to-end.
 */
async function seedOwnerBookings(spaceId: string): Promise<void> {
  const [existing] = await db
    .select({ id: bookingsTable.id })
    .from(bookingsTable)
    .where(eq(bookingsTable.spaceId, spaceId))
    .limit(1);
  if (existing) {
    console.log(`Owner space already has bookings; skipping booking seed.`);
    return;
  }

  // Need a desk on this space.
  const [desk] = await db
    .select({ id: desksTable.id, price: desksTable.dailyPriceCents })
    .from(desksTable)
    .where(eq(desksTable.spaceId, spaceId))
    .limit(1);
  if (!desk) {
    console.warn('No desks on owner space; skipping booking seed.');
    return;
  }

  // Resolve three applicant Guests by email. applicant3 was promoted to
  // SPACE_OWNER via the Story 7-4 APPROVED-application seed; skip them as
  // a booking source.
  const guestEmails = [
    'applicant1@deskhive.local',
    'applicant2@deskhive.local',
    'applicant4@deskhive.local',
  ];
  const guests = await Promise.all(
    guestEmails.map(async (email) => {
      const [row] = await db
        .select({ id: usersTable.id })
        .from(usersTable)
        .where(eq(usersTable.email, email))
        .limit(1);
      return row ? { email, id: row.id } : null;
    }),
  );
  const validGuests = guests.filter((g): g is { email: string; id: string } => g !== null);
  if (validGuests.length < 2) {
    console.warn(
      'Not enough applicant guests in DB to seed owner bookings; skipping.',
    );
    return;
  }

  // ISO date helpers (UTC).
  const today = new Date();
  const future = (days: number): string => {
    const d = new Date(today);
    d.setUTCDate(today.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
  };
  const past = (days: number): string => future(-days);

  type SeedBooking = {
    guestId: string;
    bookingDate: string;
    status: BookingStatus;
  };
  const bookingsToSeed: SeedBooking[] = [
    { guestId: validGuests[0].id, bookingDate: future(7), status: 'PENDING' },
    { guestId: validGuests[1].id, bookingDate: future(14), status: 'CONFIRMED' },
  ];
  if (validGuests.length >= 3) {
    bookingsToSeed.push({
      guestId: validGuests[2].id,
      bookingDate: past(7),
      status: 'REJECTED',
    });
  }

  await db.insert(bookingsTable).values(
    bookingsToSeed.map((b) => ({
      guestUserId: b.guestId,
      spaceId,
      deskId: desk.id,
      bookingDate: b.bookingDate,
      status: b.status,
      totalPriceCents: desk.price,
      paymentStatus: null,
      paymentReference: null,
    })),
  );

  console.log(
    `Owner bookings seeded: ${bookingsToSeed.length} bookings (${bookingsToSeed.map((b) => b.status).join(', ')}).`,
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

  // Story 9-2b (post-BA-walk hardening): the legacy
  // `owner-no-connect@deskhive.local` user stays in the DB as a
  // harmless orphan — automatic deletion would have to cascade-orphan
  // any spaces the BA published during their verification walk
  // (`spaces.ownerId` has no `onDelete: cascade`). Cleanup is left as a
  // manual operation if the BA wants to clear it; the new fixture
  // doesn't reference the legacy user at all.

  // Story 9-2b: second SPACE_OWNER in "pending Connect onboarding" state.
  // Used by the gated-publish E2E test. seedUser is idempotent on email;
  // we never call `seedOwnerConnectAccount` or `seedOwnerSpace` for this
  // user. The scrub step below explicitly removes any Connect row a BA
  // walk may have created — see `scrubPendingOnboardingConnectRow`.
  await seedUser({
    email: SEED_OWNER_PENDING_ONBOARDING_EMAIL,
    password: SEED_OWNER_PENDING_ONBOARDING_PASSWORD,
    fullName: SEED_OWNER_PENDING_ONBOARDING_FULL_NAME,
    role: 'SPACE_OWNER',
  });
  await scrubPendingOnboardingConnectRow();

  // Story 7-PREP-1: fresh GUEST with no application — for E2E State A
  // coverage. No `seedApplication` call follows this user; they remain
  // a fresh Guest. Idempotent via seedUser's email-exists check.
  await seedUser({
    email: SEED_GUEST_EMAIL,
    password: SEED_GUEST_PASSWORD,
    fullName: SEED_GUEST_FULL_NAME,
    role: 'GUEST',
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

  // Story 7-5: owner space + bookings for verification of /owner/* surfaces.
  const ownerSpaceId = await seedOwnerSpace();
  if (ownerSpaceId) {
    await seedOwnerBookings(ownerSpaceId);
  }

  // Story DESIGN-2: 3 admin-owned demo spaces with amenities so the
  // public landing + space-detail pages have non-empty browse data
  // covering every canonical amenity slug.
  await seedAdminDemoSpaces();

  // Story DESIGN-2: backfill amenities on any seeded space whose name
  // is in SEEDED_SPACE_AMENITIES. Idempotent — overrides whatever's
  // in the row with the locked fixture set on every seed run.
  await backfillSeededAmenities();

  // Story 9-2 BA Decision §8: synthetic Stripe Connect row for the
  // seeded owner so the /owner/settings "onboarding complete" path
  // has a stable E2E target. The synthetic ID deliberately does NOT
  // match Stripe's real `acct_<base32>` format — any code path that
  // makes a real Stripe call against it will 404, which is the
  // correct signal to mock at the test boundary instead. Adding a
  // SECOND seed owner without a Connect row (for gated-publish E2E
  // testing) is deferred to Story 9-2b.
  await seedOwnerConnectAccount();

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
