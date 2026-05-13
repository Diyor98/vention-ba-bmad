import type { Application, ApplicationStatus } from '@/db/schema';

/**
 * Story 7-2: applications service module (pure logic + types + stubs).
 *
 * NO `'use server'` directive. NO `cookies()` / `headers()` calls. NO DB
 * client imports. Per Story 7-1's Debug Log #1 + memory
 * `reference_role_and_mode_switching.md`: 'use server' files can only
 * export async functions; const objects + type unions + pure helpers
 * MUST live in a sibling non-server module to avoid breaking unrelated
 * pages that transitively import the action bundle.
 *
 * The three checkCanX functions are the testable seam — the Server
 * Actions in src/actions/applications.ts read session + DB state, then
 * call these pure helpers, then call db queries to persist. Tests target
 * these pure functions; the action shells are integration-verified via
 * Stories 7-3 / 7-4 BA browser walks (per Story 6-3 cost-cap precedent
 * for action-shell mocking).
 */

// Verbatim error/copy strings — single source of truth so tests
// reference constants, not duplicated literals.
export const APPLICATION_MESSAGES = {
  UNAUTHORIZED: 'Please log in.',
  ALREADY_SPACE_OWNER: 'You are already a Space Owner.',
  ADMINS_CANNOT_APPLY: 'Super admins cannot apply to be Space Owners.',
  PENDING_APPLICATION_EXISTS:
    'You already have a pending application under review.',
  APPLICATION_NOT_FOUND: 'Application not found.',
  APPLICATION_NOT_PENDING:
    'Only pending applications can be approved or rejected.',
  USER_NOT_GUEST:
    'The applicant is no longer eligible for promotion (role changed).',
  FORBIDDEN: 'You don’t have permission to review applications.',
  INVALID_ID: 'Application ID is invalid.',
  VALIDATION_ERROR: 'Please correct the highlighted fields.',
  INTERNAL_ERROR: 'Something went wrong. Please try again.',
} as const;

export const APPLICATION_STATUS = {
  PENDING: 'PENDING' as const,
  APPROVED: 'APPROVED' as const,
  REJECTED: 'REJECTED' as const,
} satisfies Record<ApplicationStatus, ApplicationStatus>;

// ─────────────────────────────────────────────────────────────────────────
// Pure precondition helpers — the 12-case BA test surface (Story 7-2 AC-13).
// Each returns a discriminated union; the action layer maps the .code into
// its typed error state and the matching APPLICATION_MESSAGES string.
// ─────────────────────────────────────────────────────────────────────────

export type CheckCanCreateInput = {
  userRole: string | undefined;
  existingPendingCount: number;
};

export type CheckCanCreateResult =
  | { ok: true }
  | {
      ok: false;
      code:
        | 'UNAUTHORIZED'
        | 'ALREADY_SPACE_OWNER'
        | 'ADMINS_CANNOT_APPLY'
        | 'PENDING_APPLICATION_EXISTS';
    };

export function checkCanCreate(
  opts: CheckCanCreateInput,
): CheckCanCreateResult {
  if (!opts.userRole) return { ok: false, code: 'UNAUTHORIZED' };
  if (opts.userRole === 'SPACE_OWNER')
    return { ok: false, code: 'ALREADY_SPACE_OWNER' };
  if (opts.userRole === 'SUPER_ADMIN')
    return { ok: false, code: 'ADMINS_CANNOT_APPLY' };
  if (opts.existingPendingCount > 0)
    return { ok: false, code: 'PENDING_APPLICATION_EXISTS' };
  return { ok: true };
}

export type CheckCanApproveInput = {
  application: Application | undefined;
  targetUserRole: string | undefined;
};

export type CheckCanApproveResult =
  | { ok: true }
  | {
      ok: false;
      code: 'APPLICATION_NOT_FOUND' | 'APPLICATION_NOT_PENDING' | 'USER_NOT_GUEST';
    };

export function checkCanApprove(
  opts: CheckCanApproveInput,
): CheckCanApproveResult {
  if (!opts.application) return { ok: false, code: 'APPLICATION_NOT_FOUND' };
  if (opts.application.status !== 'PENDING')
    return { ok: false, code: 'APPLICATION_NOT_PENDING' };
  if (opts.targetUserRole !== 'GUEST')
    return { ok: false, code: 'USER_NOT_GUEST' };
  return { ok: true };
}

export type CheckCanRejectInput = {
  application: Application | undefined;
};

export type CheckCanRejectResult =
  | { ok: true }
  | { ok: false; code: 'APPLICATION_NOT_FOUND' | 'APPLICATION_NOT_PENDING' };

export function checkCanReject(
  opts: CheckCanRejectInput,
): CheckCanRejectResult {
  if (!opts.application) return { ok: false, code: 'APPLICATION_NOT_FOUND' };
  if (opts.application.status !== 'PENDING')
    return { ok: false, code: 'APPLICATION_NOT_PENDING' };
  return { ok: true };
}

// ─────────────────────────────────────────────────────────────────────────
// Notification stubs — Epic 8 Story 8-2 fills in real Resend bodies.
// Signatures are LOCKED (BA Decision §8): Epic 8 swaps the body only.
// The Server Actions invoke these inside try/catch so a notification
// failure never rolls back a data write — log + carry on.
// ─────────────────────────────────────────────────────────────────────────

export async function notifyApplicationReceived(
  application: Application,
): Promise<void> {
  // TODO Epic 8 Story 8-2: send "application received" email via Resend.
  // Recipient: application.user.email (joined at the action layer).
  // Template: application-received.
  console.log(`[stub] notifyApplicationReceived: ${application.id}`);
}

export async function notifyApplicationApproved(
  application: Application,
): Promise<void> {
  // TODO Epic 8 Story 8-2: send "Welcome to DeskHive Hosting" email.
  console.log(`[stub] notifyApplicationApproved: ${application.id}`);
}

export async function notifyApplicationRejected(
  application: Application,
): Promise<void> {
  // TODO Epic 8 Story 8-2: send rejection email; include
  // application.rejectionReason when set.
  console.log(`[stub] notifyApplicationRejected: ${application.id}`);
}
