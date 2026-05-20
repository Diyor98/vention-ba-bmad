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

/**
 * DESIGN-INT-GAPS-PASS-2 Gap 4: extended user-profile read for the
 * /account Profile tab — adds the `image` (avatar URL) and
 * `createdAt` (drives the "Member since {month year}" subtitle)
 * that `getUserById` deliberately omits.
 *
 * Returns null when no user matches the id. Callers should treat
 * that as "log out and bounce to /login" (the session existed but
 * the underlying row vanished — should never happen in practice
 * but is a safer-than-throw failure mode for the account page).
 */
export async function getUserProfileById(userId: string): Promise<{
  id: string;
  email: string;
  fullName: string;
  image: string | null;
  createdAt: Date;
} | null> {
  const [row] = await db
    .select({
      id: usersTable.id,
      email: usersTable.email,
      fullName: usersTable.fullName,
      image: usersTable.image,
      createdAt: usersTable.createdAt,
    })
    .from(usersTable)
    .where(eq(usersTable.id, userId))
    .limit(1);
  return row ?? null;
}

/**
 * DESIGN-INT-GAPS-PASS-2 Gap 4: update the user's `fullName` and
 * bump `updatedAt`. Returns the new row, or null if no user
 * matched (defensive — the caller already had a session).
 *
 * Better Auth maps `user.name` ↔ `usersTable.fullName` (see
 * src/lib/auth/config.ts user.fields.name remap), so a direct
 * Drizzle UPDATE here is picked up by the next `getSession()`
 * read. No Better Auth session-cache invalidation needed because
 * `auth.api.getSession` refetches the user row per request.
 */
export async function updateUserName(
  userId: string,
  fullName: string,
): Promise<{ id: string; fullName: string } | null> {
  const [row] = await db
    .update(usersTable)
    .set({ fullName, updatedAt: new Date() })
    .where(eq(usersTable.id, userId))
    .returning({
      id: usersTable.id,
      fullName: usersTable.fullName,
    });
  return row ?? null;
}
