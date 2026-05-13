import { and, desc, eq } from 'drizzle-orm';
import { db } from '@/db/client';
import {
  applicationsTable,
  usersTable,
  type Application,
  type NewApplication,
} from '@/db/schema';

/**
 * Story 7-2: applications query helpers.
 *
 * Phase 1 conditional-UPDATE pattern (architecture.md "Booking state-machine
 * race safety"): every state transition's UPDATE includes the source state
 * in WHERE. 0 rows affected → race detected, caller treats as failure.
 *
 * approveApplicationAction's atomic role promotion inlines the two
 * conditional UPDATEs inside db.transaction(...) directly (it needs both
 * the applications.status flip AND the users.role promotion in one tx).
 * That's the codebase's first transaction use; documented in memory entry
 * reference_applications_service_and_actions.md.
 */

/**
 * Story 7-4: admin list page. Returns all applications joined with their
 * applicant's safe user fields, newest first. Mirrors `listAllBookings`'s
 * defense-in-depth pattern: explicit projection of safe columns only
 * (id + email + fullName) — never hashedPassword etc.
 */
export async function listAllApplications(): Promise<
  Array<{
    application: Application;
    applicant: { id: string; email: string; fullName: string };
  }>
> {
  return db
    .select({
      application: applicationsTable,
      applicant: {
        id: usersTable.id,
        email: usersTable.email,
        fullName: usersTable.fullName,
      },
    })
    .from(applicationsTable)
    .innerJoin(usersTable, eq(applicationsTable.userId, usersTable.id))
    .orderBy(desc(applicationsTable.createdAt));
}

/**
 * Story 7-4: detail page. Returns application + applicant + (optional)
 * reviewer in a single round-trip when possible. The reviewer join uses
 * a self-join on users via reviewedByUserId; null when status === PENDING.
 *
 * Returns undefined if the application doesn't exist. Mirrors
 * getApplicationById's API but with the joined user rows.
 */
export async function getApplicationWithUsers(
  id: string,
): Promise<
  | {
      application: Application;
      applicant: { id: string; email: string; fullName: string };
      reviewer: { id: string; email: string; fullName: string } | null;
    }
  | undefined
> {
  const app = await getApplicationById(id);
  if (!app) return undefined;

  const [applicantRow] = await db
    .select({
      id: usersTable.id,
      email: usersTable.email,
      fullName: usersTable.fullName,
    })
    .from(usersTable)
    .where(eq(usersTable.id, app.userId))
    .limit(1);
  if (!applicantRow) return undefined;

  let reviewer: { id: string; email: string; fullName: string } | null = null;
  if (app.reviewedByUserId) {
    const [reviewerRow] = await db
      .select({
        id: usersTable.id,
        email: usersTable.email,
        fullName: usersTable.fullName,
      })
      .from(usersTable)
      .where(eq(usersTable.id, app.reviewedByUserId))
      .limit(1);
    if (reviewerRow) reviewer = reviewerRow;
  }

  return { application: app, applicant: applicantRow, reviewer };
}

export async function getApplicationById(
  id: string,
): Promise<Application | undefined> {
  const [row] = await db
    .select()
    .from(applicationsTable)
    .where(eq(applicationsTable.id, id))
    .limit(1);
  return row;
}

/**
 * Returns the user's PENDING application, or undefined. Used by
 * createApplicationAction to enforce the one-PENDING-per-user invariant
 * (BA Decision §5).
 *
 * Concurrency note: this is a SELECT-then-INSERT pattern, NOT a DB-level
 * unique index. Two near-simultaneous PENDING inserts could race and both
 * succeed. Acceptable Phase 2 limitation per BA — see story 7-2 AC-11.
 */
export async function findPendingForUser(
  userId: string,
): Promise<Application | undefined> {
  const [row] = await db
    .select()
    .from(applicationsTable)
    .where(
      and(
        eq(applicationsTable.userId, userId),
        eq(applicationsTable.status, 'PENDING'),
      ),
    )
    .limit(1);
  return row;
}

export async function createApplication(
  input: NewApplication,
): Promise<Application> {
  const [row] = await db.insert(applicationsTable).values(input).returning();
  return row;
}

/**
 * Conditional UPDATE: reject a PENDING application. Single-table — no
 * transaction needed (approve, in contrast, needs an atomic flip of both
 * applications.status AND users.role; that lives in the Server Action's
 * db.transaction callback, not here).
 *
 * Returns the updated row or undefined if status was no longer PENDING
 * (race against a concurrent admin approve/reject).
 */
export async function rejectApplicationConditional(
  applicationId: string,
  reviewerId: string,
  rejectionReason: string | null,
): Promise<Application | undefined> {
  const [row] = await db
    .update(applicationsTable)
    .set({
      status: 'REJECTED',
      reviewedAt: new Date(),
      reviewedByUserId: reviewerId,
      rejectionReason,
    })
    .where(
      and(
        eq(applicationsTable.id, applicationId),
        eq(applicationsTable.status, 'PENDING'),
      ),
    )
    .returning();
  return row;
}
