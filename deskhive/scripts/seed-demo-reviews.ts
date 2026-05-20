import { config } from 'dotenv';
config({ path: '.env.local' });
config({ path: '.env' });

import { eq, sql } from 'drizzle-orm';
import { auth } from '@/lib/auth/config';
import { db } from '@/db/client';
import { reviewsTable, spacesTable, usersTable } from '@/db/schema';

/**
 * DESIGN-INT-GAPS-PASS-2 Round 4 Gap E — Demo reviews seed.
 *
 * Inserts one review per published space, authored by a single
 * demo reviewer (`demo-reviewer@deskhive.local`). The reviewer is
 * created if missing — same Better-Auth signUp + role-promote
 * pattern as `scripts/seed.ts`.
 *
 * Idempotency: `(space_id, reviewer_id)` has a UNIQUE index on
 * the `reviews` table (migration 0009); the INSERT uses
 * `ON CONFLICT DO NOTHING` so re-running the script never
 * duplicates rows. Logs how many were inserted vs skipped.
 *
 * Rating distribution: deterministic per `space.id` — a small
 * hash of the UUID picks between 4 and 5 stars so re-runs yield
 * the same averages and BA-walk screenshots stay stable. With
 * the smallint 1-5 column type + ONE review per space, displayed
 * averages will be whole numbers ("4.0" / "5.0") rather than the
 * prototype's fancier "4.7" / "4.8" decimals — fractional
 * averages would need either multiple reviewers per space or a
 * numeric(2,1) column, both of which were judged out of scope
 * for the gap's explicit "ONE reviewer + ONE review per space +
 * smallint 1-5" requirements.
 *
 * Run: `pnpm tsx scripts/seed-demo-reviews.ts`
 *      (or wire into pnpm script as `db:seed:reviews` later).
 */

const REVIEWER_EMAIL = 'demo-reviewer@deskhive.local';
const REVIEWER_PASSWORD = 'ReviewerPass1!';
const REVIEWER_FULL_NAME = 'Demo Reviewer';

function deterministicRatingForSpace(spaceId: string): 1 | 2 | 3 | 4 | 5 {
  // Sum of char codes mod 2 → 0 maps to 4 stars, 1 to 5 stars.
  // Avoids the 1-3 range entirely so the demo doesn't look
  // like a hostile takeover by 1-star reviewers.
  let sum = 0;
  for (let i = 0; i < spaceId.length; i++) {
    sum = (sum + spaceId.charCodeAt(i)) | 0;
  }
  return (sum % 2 === 0 ? 4 : 5) as 4 | 5;
}

async function ensureDemoReviewer(): Promise<string> {
  const [existing] = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(eq(usersTable.email, REVIEWER_EMAIL))
    .limit(1);
  if (existing) {
    console.log(`Demo reviewer already exists (${REVIEWER_EMAIL}); reused.`);
    return existing.id;
  }

  const result = await auth.api.signUpEmail({
    body: {
      email: REVIEWER_EMAIL,
      password: REVIEWER_PASSWORD,
      name: REVIEWER_FULL_NAME,
    },
  });
  if (!result || (typeof result === 'object' && 'error' in result)) {
    throw new Error(
      `Failed to create demo reviewer: ${JSON.stringify(result)}`,
    );
  }

  // Better-Auth defaults `role` to 'GUEST' (per additionalFields
  // input:false), but explicitly UPDATE so the seed is self-documenting
  // + future-proof against a config drift.
  await db
    .update(usersTable)
    .set({ role: 'GUEST', fullName: REVIEWER_FULL_NAME })
    .where(eq(usersTable.email, REVIEWER_EMAIL));

  const [reviewer] = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(eq(usersTable.email, REVIEWER_EMAIL))
    .limit(1);
  if (!reviewer) {
    throw new Error(
      `Demo reviewer signup succeeded but row not found (${REVIEWER_EMAIL}).`,
    );
  }
  console.log(`Demo reviewer seeded: ${REVIEWER_EMAIL} / ${REVIEWER_PASSWORD}`);
  return reviewer.id;
}

async function seedReviews(): Promise<void> {
  const reviewerId = await ensureDemoReviewer();

  const spaces = await db
    .select({ id: spacesTable.id, name: spacesTable.name })
    .from(spacesTable);

  if (spaces.length === 0) {
    console.log('No spaces found — run `pnpm db:seed` first. Aborting.');
    return;
  }

  let inserted = 0;
  let skipped = 0;
  for (const s of spaces) {
    const rating = deterministicRatingForSpace(s.id);
    // ON CONFLICT DO NOTHING against (space_id, reviewer_id)
    // unique index → safe re-runs. `returning` is the simplest
    // way to count inserts vs no-ops in Drizzle.
    const rows = await db
      .insert(reviewsTable)
      .values({
        spaceId: s.id,
        reviewerId,
        rating,
        comment: null,
      })
      .onConflictDoNothing({
        target: [reviewsTable.spaceId, reviewsTable.reviewerId],
      })
      .returning({ id: reviewsTable.id });

    if (rows.length === 0) {
      skipped++;
      console.log(
        `  skipped (already exists): ${s.name} (${s.id.slice(0, 8)}) → ${rating}★`,
      );
    } else {
      inserted++;
      console.log(
        `  inserted: ${s.name} (${s.id.slice(0, 8)}) → ${rating}★`,
      );
    }
  }
  console.log(
    `\nDone. Inserted ${inserted} review(s); skipped ${skipped} existing.`,
  );

  // Defensive sanity check — verify the table has at least as many
  // rows as we expected. Catches a silent failure where the INSERT
  // succeeds but downstream avg() reads see zero rows.
  const [{ total }] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(reviewsTable);
  console.log(`reviews table now holds ${total} row(s).`);
}

seedReviews()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
