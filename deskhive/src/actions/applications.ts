'use server';

import { revalidatePath } from 'next/cache';
import { and, eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { applicationsTable, usersTable } from '@/db/schema';
import { requireSession, requireRole, AuthError } from '@/lib/auth/guards';
import { createApplicationSchema } from '@/lib/validation/application';
import {
  checkCanCreate,
  checkCanApprove,
  checkCanReject,
  notifyApplicationReceived,
  notifyApplicationApproved,
  notifyApplicationRejected,
  APPLICATION_MESSAGES,
} from '@/lib/applications';
import {
  getApplicationById,
  findPendingForUser,
  createApplication,
  rejectApplicationConditional,
} from '@/db/queries/applications';
import { logger } from '@/lib/logger';
import type { Application } from '@/db/schema';

/**
 * Story 7-2: applications Server Actions.
 *
 * THIS FILE EXPORTS ONLY ASYNC FUNCTIONS + TYPE UNIONS. Per Story 7-1's
 * Debug Log #1 + memory `reference_role_and_mode_switching.md`: 'use
 * server' files reject const-object exports with `invalid-use-server-
 * value`, breaking every page that transitively imports the action
 * bundle. All const objects + pure helpers live in src/lib/applications.ts.
 *
 * The three actions follow Phase 1's shape: useActionState-compatible
 * (_prevState, formData) signature, discriminated-union state, no
 * redirects on success (the Story 7-3 form Client Component handles
 * post-submit UX).
 */

// ─────────────────────────────────────────────────────────────────────────
// createApplicationAction
// ─────────────────────────────────────────────────────────────────────────

export type CreateApplicationActionState =
  | { status: 'idle' }
  | { status: 'success'; applicationId: string }
  | {
      status: 'error';
      code:
        | 'UNAUTHORIZED'
        | 'ALREADY_SPACE_OWNER'
        | 'ADMINS_CANNOT_APPLY'
        | 'PENDING_APPLICATION_EXISTS'
        | 'VALIDATION_ERROR'
        | 'INTERNAL_ERROR';
      message: string;
      fields?: Record<string, string>;
    };

export async function createApplicationAction(
  _prevState: CreateApplicationActionState,
  formData: FormData,
): Promise<CreateApplicationActionState> {
  // 1. Auth.
  let session;
  try {
    session = await requireSession();
  } catch (err) {
    if (err instanceof AuthError && err.response.status === 401) {
      return {
        status: 'error',
        code: 'UNAUTHORIZED',
        message: APPLICATION_MESSAGES.UNAUTHORIZED,
      };
    }
    logger.error('create_application_action_auth_failed', {
      error: String(err),
    });
    return {
      status: 'error',
      code: 'INTERNAL_ERROR',
      message: APPLICATION_MESSAGES.INTERNAL_ERROR,
    };
  }

  // 2. Validate form input.
  const parsed = createApplicationSchema.safeParse({
    businessName: formData.get('businessName'),
    businessAddress: formData.get('businessAddress'),
    taxId: formData.get('taxId'),
    motivation: formData.get('motivation'),
  });
  if (!parsed.success) {
    const fields: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? '');
      if (key && !fields[key]) fields[key] = issue.message;
    }
    return {
      status: 'error',
      code: 'VALIDATION_ERROR',
      message: APPLICATION_MESSAGES.VALIDATION_ERROR,
      fields,
    };
  }

  // 3. Precondition check (role + PENDING uniqueness).
  const userId = String(session.user.id);
  const userRole = (session.user as { role?: string }).role;
  const existingPending = await findPendingForUser(userId);
  const can = checkCanCreate({
    userRole,
    existingPendingCount: existingPending ? 1 : 0,
  });
  if (!can.ok) {
    return {
      status: 'error',
      code: can.code,
      message: APPLICATION_MESSAGES[can.code],
    };
  }

  // 4. Insert. Empty/whitespace motivation normalizes to null.
  const motivation = parsed.data.motivation?.trim();
  let application: Application;
  try {
    application = await createApplication({
      userId,
      businessName: parsed.data.businessName,
      businessAddress: parsed.data.businessAddress,
      taxId: parsed.data.taxId,
      motivation: motivation && motivation.length > 0 ? motivation : null,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error('create_application_action_db_failed', { error: msg });
    return {
      status: 'error',
      code: 'INTERNAL_ERROR',
      message: APPLICATION_MESSAGES.INTERNAL_ERROR,
    };
  }

  // 5. Notification stub — non-critical, never roll back data on
  //    notification failure (BA Decision §8). Epic 8 Story 8-2 fills in.
  try {
    await notifyApplicationReceived(application);
  } catch (err) {
    logger.error('notify_application_received_failed', { error: String(err) });
  }

  // 6. Forward-looking revalidate. Route doesn't exist until Story 7-4;
  //    harmless until then.
  revalidatePath('/admin/applications');

  return { status: 'success', applicationId: application.id };
}

// ─────────────────────────────────────────────────────────────────────────
// approveApplicationAction (atomic role promotion via db.transaction)
// rejectApplicationAction (single conditional UPDATE)
// ─────────────────────────────────────────────────────────────────────────

export type ReviewApplicationActionState =
  | { status: 'idle' }
  | { status: 'success' }
  | {
      status: 'error';
      code:
        | 'UNAUTHORIZED'
        | 'FORBIDDEN'
        | 'INVALID_ID'
        | 'APPLICATION_NOT_FOUND'
        | 'APPLICATION_NOT_PENDING'
        | 'USER_NOT_GUEST'
        | 'INTERNAL_ERROR';
      message: string;
    };

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Tagged errors thrown inside db.transaction so the wrapper rolls back.
// Caught immediately outside and mapped to the typed state.
const TX_NOT_PENDING = Symbol('TX_NOT_PENDING');
const TX_NOT_GUEST = Symbol('TX_NOT_GUEST');
class TransactionAbort extends Error {
  constructor(public tag: typeof TX_NOT_PENDING | typeof TX_NOT_GUEST) {
    super('TransactionAbort');
    this.name = 'TransactionAbort';
  }
}

async function requireSuperAdmin(): Promise<
  | { ok: true; session: Awaited<ReturnType<typeof requireSession>> }
  | {
      ok: false;
      state: Extract<
        ReviewApplicationActionState,
        { status: 'error' }
      >;
    }
> {
  let session;
  try {
    session = await requireSession();
    requireRole(session, 'SUPER_ADMIN');
  } catch (err) {
    if (err instanceof AuthError) {
      if (err.response.status === 401) {
        return {
          ok: false,
          state: {
            status: 'error',
            code: 'UNAUTHORIZED',
            message: APPLICATION_MESSAGES.UNAUTHORIZED,
          },
        };
      }
      if (err.response.status === 403) {
        return {
          ok: false,
          state: {
            status: 'error',
            code: 'FORBIDDEN',
            message: APPLICATION_MESSAGES.FORBIDDEN,
          },
        };
      }
    }
    logger.error('review_application_auth_failed', { error: String(err) });
    return {
      ok: false,
      state: {
        status: 'error',
        code: 'INTERNAL_ERROR',
        message: APPLICATION_MESSAGES.INTERNAL_ERROR,
      },
    };
  }
  return { ok: true, session };
}

export async function approveApplicationAction(
  _prevState: ReviewApplicationActionState,
  formData: FormData,
): Promise<ReviewApplicationActionState> {
  // 1. Auth.
  const auth = await requireSuperAdmin();
  if (!auth.ok) return auth.state;
  const reviewerId = String(auth.session.user.id);

  // 2. Validate applicationId.
  const applicationId = String(formData.get('applicationId') ?? '');
  if (!UUID_RE.test(applicationId)) {
    return {
      status: 'error',
      code: 'INVALID_ID',
      message: APPLICATION_MESSAGES.INVALID_ID,
    };
  }

  // 3. Lookup + pre-check (the conditional UPDATEs inside the transaction
  //    are the actual race-safety net; this pre-check just classifies the
  //    common failure modes with clearer error codes).
  const application = await getApplicationById(applicationId);
  const pre = checkCanApprove({
    application,
    // Pre-check uses the applicant's role at lookup time. The transaction
    // re-verifies via the conditional WHERE clause; if the role changed
    // between SELECT and UPDATE, the conditional UPDATE returns 0 rows
    // and the transaction rolls back.
    targetUserRole: application
      ? await fetchUserRole(application.userId)
      : undefined,
  });
  if (!pre.ok) {
    return {
      status: 'error',
      code: pre.code,
      message: APPLICATION_MESSAGES[pre.code],
    };
  }

  // 4. Atomic transaction — flip applications.status AND users.role in
  //    one tx. Either fails → both roll back. This is the codebase's first
  //    use of db.transaction(); documented in memory entry
  //    reference_applications_service_and_actions.md.
  //
  //    Race safety: both UPDATEs include source state in WHERE
  //    (architecture.md "Booking state-machine race safety"). 0 rows
  //    affected → throw tagged error → transaction wrapper rolls back.
  try {
    await db.transaction(async (tx) => {
      const [updatedApp] = await tx
        .update(applicationsTable)
        .set({
          status: 'APPROVED',
          reviewedAt: new Date(),
          reviewedByUserId: reviewerId,
        })
        .where(
          and(
            eq(applicationsTable.id, applicationId),
            eq(applicationsTable.status, 'PENDING'),
          ),
        )
        .returning();
      if (!updatedApp) throw new TransactionAbort(TX_NOT_PENDING);

      const [updatedUser] = await tx
        .update(usersTable)
        .set({ role: 'SPACE_OWNER', updatedAt: new Date() })
        .where(
          and(
            eq(usersTable.id, updatedApp.userId),
            eq(usersTable.role, 'GUEST'),
          ),
        )
        .returning({ id: usersTable.id });
      if (!updatedUser) throw new TransactionAbort(TX_NOT_GUEST);
    });
  } catch (err) {
    if (err instanceof TransactionAbort) {
      if (err.tag === TX_NOT_PENDING) {
        return {
          status: 'error',
          code: 'APPLICATION_NOT_PENDING',
          message: APPLICATION_MESSAGES.APPLICATION_NOT_PENDING,
        };
      }
      if (err.tag === TX_NOT_GUEST) {
        return {
          status: 'error',
          code: 'USER_NOT_GUEST',
          message: APPLICATION_MESSAGES.USER_NOT_GUEST,
        };
      }
    }
    const msg = err instanceof Error ? err.message : String(err);
    logger.error('approve_application_action_db_failed', { error: msg });
    return {
      status: 'error',
      code: 'INTERNAL_ERROR',
      message: APPLICATION_MESSAGES.INTERNAL_ERROR,
    };
  }

  // 5. Re-fetch the now-approved application for the notification stub.
  //    Returning from inside the transaction would also work; this is
  //    slightly clearer at the cost of one extra round-trip.
  const approved = await getApplicationById(applicationId);
  if (approved) {
    try {
      await notifyApplicationApproved(approved);
    } catch (err) {
      logger.error('notify_application_approved_failed', { error: String(err) });
    }
  }

  revalidatePath('/admin/applications');
  return { status: 'success' };
}

export async function rejectApplicationAction(
  _prevState: ReviewApplicationActionState,
  formData: FormData,
): Promise<ReviewApplicationActionState> {
  // 1. Auth.
  const auth = await requireSuperAdmin();
  if (!auth.ok) return auth.state;
  const reviewerId = String(auth.session.user.id);

  // 2. Validate applicationId + normalize reason.
  const applicationId = String(formData.get('applicationId') ?? '');
  if (!UUID_RE.test(applicationId)) {
    return {
      status: 'error',
      code: 'INVALID_ID',
      message: APPLICATION_MESSAGES.INVALID_ID,
    };
  }
  const rawReason = formData.get('reason');
  const reasonStr = typeof rawReason === 'string' ? rawReason.trim() : '';
  const reason = reasonStr.length > 0 ? reasonStr.slice(0, 500) : null;

  // 3. Lookup + pre-check.
  const application = await getApplicationById(applicationId);
  const pre = checkCanReject({ application });
  if (!pre.ok) {
    return {
      status: 'error',
      code: pre.code,
      message: APPLICATION_MESSAGES[pre.code],
    };
  }

  // 4. Conditional UPDATE.
  let updated: Application | undefined;
  try {
    updated = await rejectApplicationConditional(
      applicationId,
      reviewerId,
      reason,
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error('reject_application_action_db_failed', { error: msg });
    return {
      status: 'error',
      code: 'INTERNAL_ERROR',
      message: APPLICATION_MESSAGES.INTERNAL_ERROR,
    };
  }
  if (!updated) {
    return {
      status: 'error',
      code: 'APPLICATION_NOT_PENDING',
      message: APPLICATION_MESSAGES.APPLICATION_NOT_PENDING,
    };
  }

  // 5. Notification stub. No role change per BA Decision §4 — user stays GUEST.
  try {
    await notifyApplicationRejected(updated);
  } catch (err) {
    logger.error('notify_application_rejected_failed', { error: String(err) });
  }

  revalidatePath('/admin/applications');
  return { status: 'success' };
}

// Local helper — lightweight role lookup for the pre-check in approve.
// Not exported (a non-async export would trip the 'use server' bundler
// trap from Story 7-1's Debug Log #1).
async function fetchUserRole(userId: string): Promise<string | undefined> {
  const [row] = await db
    .select({ role: usersTable.role })
    .from(usersTable)
    .where(eq(usersTable.id, userId))
    .limit(1);
  return row?.role;
}
