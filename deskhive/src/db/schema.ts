import {
  pgTable,
  uuid,
  text,
  integer,
  smallint,
  boolean,
  timestamp,
  date,
  jsonb,
  uniqueIndex,
  index,
  check,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

// ─────────────────────────────────────────────────────────────
// AMENITIES — Story DESIGN-2 (canonical, locked 2026-05-19)
// 16-slug closed enum. Stored as text[] on spacesTable. Adding
// a new slug requires a new migration + DB-side CHECK update.
// ─────────────────────────────────────────────────────────────
export const AMENITY_SLUGS = [
  'wifi',
  'access_24_7',
  'coffee_tea',
  'parking',
  'meeting_rooms',
  'printing_scanning',
  'kitchen',
  'phone_booths',
  'lockers',
  'air_conditioning',
  'standing_desks',
  'monitors',
  'whiteboard',
  'projector',
  'pet_friendly',
  'wheelchair_accessible',
] as const;

export type AmenitySlug = (typeof AMENITY_SLUGS)[number];

// ─────────────────────────────────────────────────────────────
// users — Document B §6.1 + Better Auth additive columns (BA Decision B.1)
// ─────────────────────────────────────────────────────────────
export const usersTable = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    email: text('email').notNull().unique(),
    // Per BA decision B.1, Better Auth stores credential hashes in `account.password`.
    // This column remains for Doc B §6.1 letter-of-spec compliance and may be null.
    hashedPassword: text('hashed_password'),
    role: text('role').notNull(),
    fullName: text('full_name').notNull(),
    // Phase 1 has no email verification (Doc B §11) — all users immediately active.
    emailVerified: boolean('email_verified').notNull().default(true),
    // Better Auth user field; null in Phase 1 (no avatars per Doc B §11).
    image: text('image'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check(
      'users_role_check',
      sql`${t.role} IN ('GUEST', 'SUPER_ADMIN', 'SPACE_OWNER')`,
    ),
  ],
);

// ─────────────────────────────────────────────────────────────
// spaces — Document B §6.1
// ─────────────────────────────────────────────────────────────
export const spacesTable = pgTable(
  'spaces',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    city: text('city').notNull(),
    addressLine: text('address_line').notNull(),
    description: text('description').notNull(),
    primaryImageUrl: text('primary_image_url').notNull(),
    status: text('status').notNull().default('PUBLISHED'),
    // Story 7-1: nullable owner_id introduces the SPACE_OWNER → spaces
    // relationship. Phase 1 seeded spaces stay NULL — no backfill in this
    // story. Future stories may require non-null or backfill explicitly.
    ownerId: uuid('owner_id').references(() => usersTable.id),
    // Story DESIGN-2: per-space amenity list. Closed 16-slug enum
    // (see AMENITY_SLUGS above + CHECK constraint below). Empty array
    // is the explicit "no amenities" state; NULL is forbidden.
    amenities: text('amenities').array().notNull().default(sql`'{}'::text[]`),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // Story 9-2b: extended to include 'DRAFT' so owner-created spaces
    // can start in a private state and only become publicly bookable
    // after the owner clicks Publish on the detail page (with Connect-
    // onboarding gating enforced by `publishSpaceAction`). Phase 1
    // PUBLISHED + admin-side SUSPENDED behaviors unchanged. DB-level
    // column default stays 'PUBLISHED' — owner-side createSpaceAction
    // passes 'DRAFT' explicitly per BA Decision §4.
    check('spaces_status_check', sql`${t.status} IN ('DRAFT', 'PUBLISHED', 'SUSPENDED')`),
    // Story DESIGN-2: every amenity in the array must belong to the
    // canonical 16-slug closed set. Adding a new slug requires a new
    // migration that DROP/ADDs this CHECK with the new value.
    check(
      'spaces_amenities_subset_check',
      sql`${t.amenities} <@ ARRAY[
        'wifi', 'access_24_7', 'coffee_tea', 'parking', 'meeting_rooms',
        'printing_scanning', 'kitchen', 'phone_booths', 'lockers',
        'air_conditioning', 'standing_desks', 'monitors', 'whiteboard',
        'projector', 'pet_friendly', 'wheelchair_accessible'
      ]::text[]`,
    ),
  ],
);

// ─────────────────────────────────────────────────────────────
// desks — Document B §6.1, FR-I5 (unique label per space)
// ─────────────────────────────────────────────────────────────
export const desksTable = pgTable(
  'desks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    spaceId: uuid('space_id')
      .notNull()
      .references(() => spacesTable.id),
    label: text('label').notNull(),
    dailyPriceCents: integer('daily_price_cents').notNull(),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('uniq_desk_label_per_space').on(t.spaceId, t.label),
    check('desks_daily_price_check', sql`${t.dailyPriceCents} >= 0`),
  ],
);

// ─────────────────────────────────────────────────────────────
// bookings — Document B §6.1, §6.2 partial unique index, Doc A §7.4 forward-compat
// ─────────────────────────────────────────────────────────────
export const bookingsTable = pgTable(
  'bookings',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    guestUserId: uuid('guest_user_id')
      .notNull()
      .references(() => usersTable.id),
    spaceId: uuid('space_id')
      .notNull()
      .references(() => spacesTable.id),
    deskId: uuid('desk_id')
      .notNull()
      .references(() => desksTable.id),
    bookingDate: date('booking_date').notNull(),
    status: text('status').notNull(),
    totalPriceCents: integer('total_price_cents').notNull(),
    // Doc A §7.4 forward-compat — nullable in Phase 1, written to in Phase 2.
    paymentStatus: text('payment_status'),
    paymentReference: text('payment_reference'),
    // Story 9-3: Stripe Checkout / Payment Intent linkage. Populated by
    // the return-URL handler OR the `checkout.session.completed` webhook
    // backstop. NULL while the Guest is mid-Checkout (the AWAITING_PAYMENT
    // pre-claim state). Phase 1 seeded rows stay NULL — they have no
    // Stripe interaction.
    paymentIntentId: text('payment_intent_id'),
    // Story 9-3: booking total in cents, materialized at create-time from
    // desk.dailyPriceCents. Kept alongside totalPriceCents (Phase 1's name)
    // for forward-compat — Phase 3 may distinguish line-item totals from
    // booking totals (e.g., with promotional codes). For Phase 2: totalCents
    // === totalPriceCents at create-time. DEFAULT 0 covers Phase 1 backfill.
    totalCents: integer('total_cents').notNull().default(0),
    // Story 9-3: DeskHive's 15% platform fee, calculated via
    // calculatePlatformFee(totalCents) in src/lib/money.ts. Owner payout =
    // totalCents - platformFeeCents (not stored, derived). DEFAULT 0 covers
    // Phase 1 backfill — those bookings have no Stripe charge, so no fee
    // was ever collected.
    platformFeeCents: integer('platform_fee_cents').notNull().default(0),
    // Story 9-6: refund-completion timestamp. NULL until the booking is
    // refunded (Phase 1 + non-refunded Phase 2 rows pass). Written by
    // markBookingCancelledAndRefunded* helpers atomically with
    // payment_status='REFUNDED' transition (BA Decision §1 + §6).
    refundedAt: timestamp('refunded_at', { withTimezone: true }),
    // Story 9-6: refund amount in cents. For Phase 2 full refunds, equals
    // totalCents at the time of refund. NULL until refunded. Phase 3 may
    // support partial refunds where this diverges from totalCents.
    refundAmountCents: integer('refund_amount_cents'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check(
      'bookings_status_check',
      sql`${t.status} IN ('PENDING', 'CONFIRMED', 'REJECTED', 'CANCELLED')`,
    ),
    // Story 9-3: payment_status CHECK constraint. Phase 1 declared the
    // column nullable with no CHECK; 9-3 introduced 'AWAITING_PAYMENT' +
    // 'AUTHORIZED'. Existing NULL rows continue to satisfy the constraint
    // (PG CHECK allows NULL by default).
    //
    // Story 9-4 extended to add 'CAPTURED' (Owner Confirm → captures the
    // Payment Intent) and 'VOIDED' (Owner Reject → cancels the PI with
    // cancellation_reason='requested_by_customer'). 'VOIDED' is
    // deliberately distinct from booking-side `status='CANCELLED'` to
    // avoid sub-system confusion.
    //
    // Story 9-6 extends to add 'REFUNDED' (Guest-cancel CONFIRMED + CAPTURED
    // booking ≥24h before booking_date → stripe.refunds.create → atomic
    // transition to (CANCELLED, REFUNDED) + refunded_at + refund_amount_cents
    // populated). Same DROP/ADD CONSTRAINT pattern (BA Decision §1).
    check(
      'bookings_payment_status_check',
      sql`${t.paymentStatus} IN ('AWAITING_PAYMENT', 'AUTHORIZED', 'CAPTURED', 'VOIDED', 'REFUNDED')`,
    ),
    // Document B §6.2 — THE marquee correctness constraint.
    uniqueIndex('uniq_active_booking_per_desk_per_date')
      .on(t.deskId, t.bookingDate)
      .where(sql`status IN ('PENDING', 'CONFIRMED')`),
  ],
);

// ─────────────────────────────────────────────────────────────
// applications — Story 7-2 (Phase 2 Epic 7)
// A Guest applies to become a SPACE_OWNER. Super Admin reviews
// and either approves (atomic role promotion in approve action)
// or rejects. Note: id-type follows Phase 1's uuid pattern, not
// the BA decision doc's "cuid2 or nanoid" hint which mis-
// remembered the Phase 1 convention.
// ─────────────────────────────────────────────────────────────
export const applicationsTable = pgTable(
  'applications',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => usersTable.id),
    businessName: text('business_name').notNull(),
    businessAddress: text('business_address').notNull(),
    taxId: text('tax_id').notNull(),
    motivation: text('motivation'),
    status: text('status').notNull().default('PENDING'),
    rejectionReason: text('rejection_reason'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
    reviewedByUserId: uuid('reviewed_by_user_id').references(
      () => usersTable.id,
    ),
  },
  (t) => [
    check(
      'applications_status_check',
      sql`${t.status} IN ('PENDING', 'APPROVED', 'REJECTED')`,
    ),
    index('applications_user_id_idx').on(t.userId),
    index('applications_status_idx').on(t.status),
    index('applications_created_at_idx').on(t.createdAt.desc()),
  ],
);

// ─────────────────────────────────────────────────────────────
// stripe_connect_accounts — Story 9-2 (Phase 2 Epic 9)
// Per Phase 2 PRD §6.1. One row per SPACE_OWNER who has begun (or
// completed) Stripe Connect Express onboarding. `userId` is UNIQUE —
// each owner gets at most one Connect account. The three boolean
// flags (`onboarding_completed`, `charges_enabled`, `payouts_enabled`)
// are kept in sync by the `account.updated` webhook (Decision §7) and
// by `refreshConnectStatusAction` polling on return from Stripe.
// ─────────────────────────────────────────────────────────────
export const stripeConnectAccountsTable = pgTable('stripe_connect_accounts', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .unique()
    .references(() => usersTable.id),
  stripeAccountId: text('stripe_account_id').notNull().unique(),
  onboardingCompleted: boolean('onboarding_completed').notNull().default(false),
  chargesEnabled: boolean('charges_enabled').notNull().default(false),
  payoutsEnabled: boolean('payouts_enabled').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// ─────────────────────────────────────────────────────────────
// webhook_events — Story 9-2 (Phase 2 Epic 9)
// Per Phase 2 PRD §6.1. Idempotency log for Stripe webhook deliveries.
// Story 9-2 narrows the handler to `account.updated` only; Story 9-5
// generalizes the dispatch. `stripe_event_id` is UNIQUE — duplicate
// deliveries from Stripe are short-circuited at the SELECT layer
// before any side effects fire. Decision §7 anti-pattern: NEVER
// insert rows for unhandled event types — keeps 9-5's backfill seam
// clean.
// ─────────────────────────────────────────────────────────────
export const webhookEventsTable = pgTable('webhook_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  stripeEventId: text('stripe_event_id').notNull().unique(),
  eventType: text('event_type').notNull(),
  payload: jsonb('payload').notNull(),
  processedAt: timestamp('processed_at', { withTimezone: true }).notNull().defaultNow(),
});

// ─────────────────────────────────────────────────────────────
// reviews — DESIGN-INT-GAPS-PASS-2 Round 4 Gap E
// Per-space ratings. Phase 2 prototype lines 853-859 surface a
// "★ {rating}" badge on every SpaceCard; backing column is a
// smallint 1-5 rating (whole stars) optionally accompanied by
// free-text comment. avg(rating) is computed at read-time — no
// materialized view, no cache.
//
// `(space_id, reviewer_id)` is UNIQUE so the demo-seed script
// can use ON CONFLICT DO NOTHING for idempotency. The CHECK
// constraint enforces the 1-5 range at the DB layer so neither
// app nor seed can write garbage. No booking_id link — Phase 2
// keeps the model minimal (a future story can tie review →
// booking when post-stay reviews ship).
// ─────────────────────────────────────────────────────────────
export const reviewsTable = pgTable(
  'reviews',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    spaceId: uuid('space_id')
      .notNull()
      .references(() => spacesTable.id),
    reviewerId: uuid('reviewer_id')
      .notNull()
      .references(() => usersTable.id),
    rating: smallint('rating').notNull(),
    comment: text('comment'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    check('reviews_rating_range_check', sql`${t.rating} BETWEEN 1 AND 5`),
    uniqueIndex('reviews_space_reviewer_unique').on(
      t.spaceId,
      t.reviewerId,
    ),
    index('reviews_space_id_idx').on(t.spaceId),
  ],
);

// ─────────────────────────────────────────────────────────────
// Better Auth tables — required by @better-auth/drizzle-adapter
// ─────────────────────────────────────────────────────────────
export const accountTable = pgTable('account', {
  id: text('id').primaryKey(),
  userId: uuid('user_id')
    .notNull()
    .references(() => usersTable.id, { onDelete: 'cascade' }),
  accountId: text('account_id').notNull(),
  providerId: text('provider_id').notNull(),
  // Password hash for credential provider (BA Decision B.1).
  password: text('password'),
  accessToken: text('access_token'),
  refreshToken: text('refresh_token'),
  idToken: text('id_token'),
  accessTokenExpiresAt: timestamp('access_token_expires_at', { withTimezone: true }),
  refreshTokenExpiresAt: timestamp('refresh_token_expires_at', { withTimezone: true }),
  scope: text('scope'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const sessionTable = pgTable('session', {
  id: text('id').primaryKey(),
  userId: uuid('user_id')
    .notNull()
    .references(() => usersTable.id, { onDelete: 'cascade' }),
  token: text('token').notNull().unique(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const verificationTable = pgTable('verification', {
  id: text('id').primaryKey(),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// ─────────────────────────────────────────────────────────────
// Type exports
// ─────────────────────────────────────────────────────────────
export type User = typeof usersTable.$inferSelect;
export type NewUser = typeof usersTable.$inferInsert;
export type Space = typeof spacesTable.$inferSelect;
export type Desk = typeof desksTable.$inferSelect;
export type Booking = typeof bookingsTable.$inferSelect;
export type NewBooking = typeof bookingsTable.$inferInsert;
export type Application = typeof applicationsTable.$inferSelect;
export type NewApplication = typeof applicationsTable.$inferInsert;
export type ApplicationStatus = 'PENDING' | 'APPROVED' | 'REJECTED';
// Story 9-2 — Stripe Connect onboarding + webhook idempotency.
export type StripeConnectAccount = typeof stripeConnectAccountsTable.$inferSelect;
export type NewStripeConnectAccount = typeof stripeConnectAccountsTable.$inferInsert;
export type WebhookEvent = typeof webhookEventsTable.$inferSelect;
export type NewWebhookEvent = typeof webhookEventsTable.$inferInsert;
// DESIGN-INT-GAPS-PASS-2 Round 4 Gap E — per-space reviews/ratings.
export type Review = typeof reviewsTable.$inferSelect;
export type NewReview = typeof reviewsTable.$inferInsert;

// Role: Phase 2 introduces SPACE_OWNER (Story 7-1).
//
// Naming evolution: architecture.md §7.4 originally reserved 'SPACE_ADMIN'
// as the forward-compat literal. The Phase 2 PRD + Story 7-1 BA decisions
// settled on 'SPACE_OWNER' as the product-facing name — better aligned with
// the Airbnb-model "host/owner" framing and Story 6-6's one-login memory.
// The Phase 1 'SPACE_ADMIN' reservation was TS-literal-only; the DB CHECK
// constraint was never written to accept it, so this is a clean rename.
// architecture.md itself is not updated as part of this story (BA/architect
// role owns those edits); the rename rationale is codified in memory at
// reference_role_and_mode_switching.md.
export type Role = 'GUEST' | 'SUPER_ADMIN' | 'SPACE_OWNER';

export type BookingStatus = 'PENDING' | 'CONFIRMED' | 'REJECTED' | 'CANCELLED';
