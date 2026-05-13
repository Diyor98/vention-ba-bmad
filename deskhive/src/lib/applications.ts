import { eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { usersTable } from '@/db/schema';
import type { Application, ApplicationStatus } from '@/db/schema';
import { sendEmail } from '@/lib/email';
import { logger } from '@/lib/logger';

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
// Application notifications — Story 8-2 replaces Story 7-2's stubs with
// real sendEmail calls.
//
// Signatures are LOCKED (Story 7-2 BA Decision §8) — only the bodies
// changed in Story 8-2. The Server Actions in src/actions/applications.ts
// invoke these inside try/catch so a send failure never rolls back the
// originating DB write. sendEmail itself is non-throwing (Story 8-1
// Decision §4); the try/catch at the action layer is defensive belt-
// and-suspenders against user-lookup throws.
//
// Note: each notification fetches the applicant user (FK lookup) to get
// the recipient email + full name. The application object alone doesn't
// carry the email — it lives on the users row.
//
// CRITICAL — Story 8-2 Decision §6: notifyApplicationRejected does NOT
// pass application.rejectionReason to sendEmail. The 'application-
// rejected' TemplateData shape omits the reason field, making leakage
// a compile-time error. Admin's internal note stays in the DB.
// ─────────────────────────────────────────────────────────────────────────

function getAppUrl(): string {
  const url = (process.env.BETTER_AUTH_URL ?? '').trim();
  if (url.length === 0) {
    logger.warn(
      'BETTER_AUTH_URL unset; falling back to http://localhost:3000 for email CTA links',
    );
    return 'http://localhost:3000';
  }
  return url;
}

async function fetchApplicant(
  userId: string,
): Promise<{ email: string; fullName: string } | undefined> {
  const [row] = await db
    .select({ email: usersTable.email, fullName: usersTable.fullName })
    .from(usersTable)
    .where(eq(usersTable.id, userId))
    .limit(1);
  return row;
}

export async function notifyApplicationReceived(
  application: Application,
): Promise<void> {
  const applicant = await fetchApplicant(application.userId);
  if (!applicant) {
    logger.warn(
      `notifyApplicationReceived: applicant user not found (id=${application.userId}); skipping email`,
    );
    return;
  }
  await sendEmail({
    to: applicant.email,
    template: 'application-received',
    data: {
      applicantName: applicant.fullName,
      businessName: application.businessName,
    },
  });
}

export async function notifyApplicationApproved(
  application: Application,
): Promise<void> {
  const applicant = await fetchApplicant(application.userId);
  if (!applicant) {
    logger.warn(
      `notifyApplicationApproved: applicant user not found (id=${application.userId}); skipping email`,
    );
    return;
  }
  await sendEmail({
    to: applicant.email,
    template: 'application-approved',
    data: {
      applicantName: applicant.fullName,
      businessName: application.businessName,
      appUrl: getAppUrl(),
    },
  });
}

export async function notifyApplicationRejected(
  application: Application,
): Promise<void> {
  const applicant = await fetchApplicant(application.userId);
  if (!applicant) {
    logger.warn(
      `notifyApplicationRejected: applicant user not found (id=${application.userId}); skipping email`,
    );
    return;
  }
  // NB: application.rejectionReason is intentionally NOT passed — the
  // 'application-rejected' TemplateData shape omits the field (Story 8-2
  // Decision §6 + AC-4). Admin notes stay internal.
  await sendEmail({
    to: applicant.email,
    template: 'application-rejected',
    data: {
      applicantName: applicant.fullName,
      businessName: application.businessName,
      appUrl: getAppUrl(),
    },
  });
}
