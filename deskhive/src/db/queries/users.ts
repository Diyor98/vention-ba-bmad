import { desc, eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { usersTable, type Role } from '@/db/schema';

/**
 * DESIGN-INT-15 — Admin-only directory listing. Returns every user with
 * their core profile + role + createdAt for the admin users table.
 * Ordered newest first by createdAt DESC so recent signups surface at
 * the top.
 */
export async function listAllUsers(): Promise<
  Array<{
    id: string;
    email: string;
    fullName: string;
    role: Role;
    createdAt: Date;
  }>
> {
  const rows = await db
    .select({
      id: usersTable.id,
      email: usersTable.email,
      fullName: usersTable.fullName,
      role: usersTable.role,
      createdAt: usersTable.createdAt,
    })
    .from(usersTable)
    .orderBy(desc(usersTable.createdAt));
  return rows.map((r) => ({ ...r, role: r.role as Role }));
}

/**
 * Story 8-4: tiny user-by-id query helper. Returns the recipient-shape
 * subset (`id`, `email`, `fullName`) consumed by
 * `sendPayoutNotificationEmail` for the payout-recipient lookup (the
 * Owner whose connected account just received a payout).
 *
 * Pre-8-4 audit: this file did not exist; user-by-id lookups were done
 * inline in `src/db/queries/applications.ts` via an explicit
 * `db.select(...).from(usersTable).where(eq(usersTable.id, ...))` chain.
 * 8-4 extracts the single-purpose helper for reuse in
 * `src/lib/bookings.ts::sendPayoutNotificationEmail`. Other call sites
 * (better-auth session reads, etc.) keep their existing inline form —
 * this helper is opt-in.
 *
 * Returns `null` when no user matches the id (the consumer logs `warn`
 * and skips the email gracefully).
 */
export async function getUserById(
  userId: string,
): Promise<{ id: string; email: string; fullName: string } | null> {
  const [row] = await db
    .select({
      id: usersTable.id,
      email: usersTable.email,
      fullName: usersTable.fullName,
    })
    .from(usersTable)
    .where(eq(usersTable.id, userId))
    .limit(1);
  return row ?? null;
}
