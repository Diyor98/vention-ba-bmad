import {
  pgTable,
  uuid,
  text,
  integer,
  boolean,
  timestamp,
  date,
  uniqueIndex,
  index,
  check,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

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
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [check('spaces_status_check', sql`${t.status} IN ('PUBLISHED', 'SUSPENDED')`)],
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
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check(
      'bookings_status_check',
      sql`${t.status} IN ('PENDING', 'CONFIRMED', 'REJECTED', 'CANCELLED')`,
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
