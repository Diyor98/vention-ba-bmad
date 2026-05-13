import { describe, it, expect, vi, beforeEach } from 'vitest';

// Story 8-2: mock the email service + db client so notify* unit tests
// don't hit Resend or a live DB. Vitest hoists vi.mock() calls above
// all imports; the mock factories reference `vi.fn()`-returning closures
// declared via vi.hoisted() so they survive the hoist.
const { sendEmailMock, dbSelectMock } = vi.hoisted(() => ({
  sendEmailMock: vi.fn().mockResolvedValue({ status: 'sent' as const }),
  dbSelectMock: vi.fn(),
}));

vi.mock('@/lib/email', async () => {
  const actual = await vi.importActual<typeof import('@/lib/email')>(
    '@/lib/email',
  );
  return {
    ...actual,
    sendEmail: sendEmailMock,
  };
});

vi.mock('@/db/client', () => ({
  db: {
    select: (...args: unknown[]) => dbSelectMock(...args),
  },
}));

import {
  checkCanCreate,
  checkCanApprove,
  checkCanReject,
  notifyApplicationReceived,
  notifyApplicationApproved,
  notifyApplicationRejected,
  APPLICATION_MESSAGES,
  APPLICATION_STATUS,
} from './applications';
import type { Application, ApplicationStatus } from '@/db/schema';

// Helper to wire dbSelectMock into the drizzle select().from().where().limit()
// chain that fetchApplicant uses. Returns a chain that resolves to the
// supplied rows array.
function stubApplicantRow(row: { email: string; fullName: string } | undefined) {
  const limitFn = vi.fn().mockResolvedValue(row === undefined ? [] : [row]);
  const whereFn = vi.fn().mockReturnValue({ limit: limitFn });
  const fromFn = vi.fn().mockReturnValue({ where: whereFn });
  dbSelectMock.mockReturnValue({ from: fromFn });
}

beforeEach(() => {
  sendEmailMock.mockClear();
  dbSelectMock.mockClear();
  // Default: applicant resolves to a deterministic test row. Individual
  // tests override via stubApplicantRow(undefined) for the missing-user path.
  stubApplicantRow({
    email: 'applicant@example.com',
    fullName: 'Test Applicant',
  });
});

// Story 7-2 AC-13: 12-case service-layer test surface. The BA listed 12
// unit tests for the Server Action behaviors. Each maps cleanly to a
// pure-helper test here — the action shells delegate to these helpers,
// so a green helper test set proves the corresponding action branch is
// correct. Action-shell mocking (next/headers + cookies() + db + Better
// Auth) was deferred per Story 6-3 cost-cap precedent; BA browser walks
// in Stories 7-3 / 7-4 integration-verify the shells.

function makeApplication(status: ApplicationStatus): Application {
  return {
    id: '00000000-0000-0000-0000-000000000001',
    userId: '00000000-0000-0000-0000-000000000002',
    businessName: 'Acme Coworking',
    businessAddress: '123 Main St',
    taxId: 'TAX-1',
    motivation: null,
    status,
    rejectionReason: null,
    createdAt: new Date('2026-05-13T10:00:00Z'),
    reviewedAt: null,
    reviewedByUserId: null,
  };
}

describe('checkCanCreate (BA cases 1–4)', () => {
  it('BA case 1: Guest with no PENDING → ok', () => {
    expect(
      checkCanCreate({ userRole: 'GUEST', existingPendingCount: 0 }),
    ).toEqual({ ok: true });
  });

  it('BA case 2: unauthenticated (no role) → UNAUTHORIZED', () => {
    expect(
      checkCanCreate({ userRole: undefined, existingPendingCount: 0 }),
    ).toEqual({ ok: false, code: 'UNAUTHORIZED' });
  });

  it('BA case 3: already SPACE_OWNER → ALREADY_SPACE_OWNER', () => {
    expect(
      checkCanCreate({ userRole: 'SPACE_OWNER', existingPendingCount: 0 }),
    ).toEqual({ ok: false, code: 'ALREADY_SPACE_OWNER' });
  });

  it('SUPER_ADMIN cannot apply → ADMINS_CANNOT_APPLY', () => {
    expect(
      checkCanCreate({ userRole: 'SUPER_ADMIN', existingPendingCount: 0 }),
    ).toEqual({ ok: false, code: 'ADMINS_CANNOT_APPLY' });
  });

  it('BA case 4: Guest with existing PENDING → PENDING_APPLICATION_EXISTS', () => {
    expect(
      checkCanCreate({ userRole: 'GUEST', existingPendingCount: 1 }),
    ).toEqual({ ok: false, code: 'PENDING_APPLICATION_EXISTS' });
  });

  it('precedence: empty role wins over PENDING count', () => {
    // Defense-in-depth: the action layer always supplies userRole if a
    // session exists; this asserts the UNAUTHORIZED check runs first.
    expect(
      checkCanCreate({ userRole: undefined, existingPendingCount: 1 }),
    ).toEqual({ ok: false, code: 'UNAUTHORIZED' });
  });
});

describe('checkCanApprove (BA cases 6 + 8)', () => {
  it('BA case 6: PENDING application + GUEST applicant → ok', () => {
    expect(
      checkCanApprove({
        application: makeApplication('PENDING'),
        targetUserRole: 'GUEST',
      }),
    ).toEqual({ ok: true });
  });

  it('BA case 8: APPROVED application → APPLICATION_NOT_PENDING', () => {
    expect(
      checkCanApprove({
        application: makeApplication('APPROVED'),
        targetUserRole: 'GUEST',
      }),
    ).toEqual({ ok: false, code: 'APPLICATION_NOT_PENDING' });
  });

  it('REJECTED application → APPLICATION_NOT_PENDING', () => {
    expect(
      checkCanApprove({
        application: makeApplication('REJECTED'),
        targetUserRole: 'GUEST',
      }),
    ).toEqual({ ok: false, code: 'APPLICATION_NOT_PENDING' });
  });

  it('application missing (deleted/never existed) → APPLICATION_NOT_FOUND', () => {
    expect(
      checkCanApprove({ application: undefined, targetUserRole: 'GUEST' }),
    ).toEqual({ ok: false, code: 'APPLICATION_NOT_FOUND' });
  });

  it('applicant no longer GUEST (race against manual promotion) → USER_NOT_GUEST', () => {
    expect(
      checkCanApprove({
        application: makeApplication('PENDING'),
        targetUserRole: 'SPACE_OWNER',
      }),
    ).toEqual({ ok: false, code: 'USER_NOT_GUEST' });
  });

  it('applicant role missing (e.g., user deleted between SELECT and check) → USER_NOT_GUEST', () => {
    expect(
      checkCanApprove({
        application: makeApplication('PENDING'),
        targetUserRole: undefined,
      }),
    ).toEqual({ ok: false, code: 'USER_NOT_GUEST' });
  });
});

describe('checkCanReject (BA case 9)', () => {
  it('BA case 9: PENDING application → ok', () => {
    expect(checkCanReject({ application: makeApplication('PENDING') })).toEqual({
      ok: true,
    });
  });

  it('APPROVED application → APPLICATION_NOT_PENDING', () => {
    expect(checkCanReject({ application: makeApplication('APPROVED') })).toEqual({
      ok: false,
      code: 'APPLICATION_NOT_PENDING',
    });
  });

  it('missing application → APPLICATION_NOT_FOUND', () => {
    expect(checkCanReject({ application: undefined })).toEqual({
      ok: false,
      code: 'APPLICATION_NOT_FOUND',
    });
  });
});

describe('notification functions (Story 7-2 contract + Story 8-2 real bodies)', () => {
  // Story 7-2 BA case 12: verify the three functions exist, are async, and
  // run without throwing on a valid Application input. Story 8-2 extended
  // these with assertions on sendEmail call shape.

  it('notifyApplicationReceived is an async function', () => {
    expect(typeof notifyApplicationReceived).toBe('function');
    const result = notifyApplicationReceived(makeApplication('PENDING'));
    expect(result).toBeInstanceOf(Promise);
  });

  it('notifyApplicationApproved is an async function', () => {
    expect(typeof notifyApplicationApproved).toBe('function');
    const result = notifyApplicationApproved(makeApplication('APPROVED'));
    expect(result).toBeInstanceOf(Promise);
  });

  it('notifyApplicationRejected is an async function', () => {
    expect(typeof notifyApplicationRejected).toBe('function');
    const result = notifyApplicationRejected(makeApplication('REJECTED'));
    expect(result).toBeInstanceOf(Promise);
  });

  it('all three notification functions resolve without throwing', async () => {
    await expect(
      notifyApplicationReceived(makeApplication('PENDING')),
    ).resolves.toBeUndefined();
    await expect(
      notifyApplicationApproved(makeApplication('APPROVED')),
    ).resolves.toBeUndefined();
    await expect(
      notifyApplicationRejected(makeApplication('REJECTED')),
    ).resolves.toBeUndefined();
  });

  it("notifyApplicationReceived calls sendEmail with template 'application-received' and applicant email", async () => {
    await notifyApplicationReceived(makeApplication('PENDING'));
    expect(sendEmailMock).toHaveBeenCalledTimes(1);
    const call = sendEmailMock.mock.calls[0][0] as {
      to: string;
      template: string;
      data: { applicantName: string; businessName: string };
    };
    expect(call.template).toBe('application-received');
    expect(call.to).toBe('applicant@example.com');
    expect(call.data.applicantName).toBe('Test Applicant');
    expect(call.data.businessName).toBe('Acme Coworking');
  });

  it("notifyApplicationApproved calls sendEmail with template 'application-approved' + appUrl", async () => {
    await notifyApplicationApproved(makeApplication('APPROVED'));
    expect(sendEmailMock).toHaveBeenCalledTimes(1);
    const call = sendEmailMock.mock.calls[0][0] as {
      template: string;
      data: { applicantName: string; businessName: string; appUrl: string };
    };
    expect(call.template).toBe('application-approved');
    expect(call.data.appUrl).toMatch(/^https?:\/\//);
  });

  it("notifyApplicationRejected calls sendEmail with template 'application-rejected' WITHOUT rejection reason (Story 8-2 Decision §6)", async () => {
    const app = makeApplication('REJECTED');
    // Synthesize a rejection-reason value to confirm it does NOT leak.
    const appWithReason: Application = {
      ...app,
      rejectionReason: 'Internal note: tax ID looks incomplete',
    };
    await notifyApplicationRejected(appWithReason);
    expect(sendEmailMock).toHaveBeenCalledTimes(1);
    const call = sendEmailMock.mock.calls[0][0] as {
      template: string;
      data: Record<string, unknown>;
    };
    expect(call.template).toBe('application-rejected');
    // Critical: the data object passed to sendEmail must NOT contain any
    // field that carries the rejectionReason value. Type system enforces
    // this at compile time; this test is defense-in-depth at runtime.
    expect(JSON.stringify(call.data)).not.toContain('tax ID looks incomplete');
    expect(call.data).not.toHaveProperty('reason');
    expect(call.data).not.toHaveProperty('rejectionReason');
  });

  it('returns early without calling sendEmail when applicant user is missing (orphan FK defensive path)', async () => {
    stubApplicantRow(undefined);
    await notifyApplicationReceived(makeApplication('PENDING'));
    expect(sendEmailMock).not.toHaveBeenCalled();
  });
});

describe('APPLICATION_MESSAGES + APPLICATION_STATUS constants', () => {
  // Frozen-string verification — anyone tempted to paraphrase hits the
  // constant first and either uses it or has a conversation with the BA.

  it('exposes a verbatim message for every checkCanX failure code', () => {
    expect(APPLICATION_MESSAGES.UNAUTHORIZED).toBe('Please log in.');
    expect(APPLICATION_MESSAGES.ALREADY_SPACE_OWNER).toBe(
      'You are already a Space Owner.',
    );
    expect(APPLICATION_MESSAGES.ADMINS_CANNOT_APPLY).toBe(
      'Super admins cannot apply to be Space Owners.',
    );
    expect(APPLICATION_MESSAGES.PENDING_APPLICATION_EXISTS).toBe(
      'You already have a pending application under review.',
    );
    expect(APPLICATION_MESSAGES.APPLICATION_NOT_FOUND).toBe(
      'Application not found.',
    );
    expect(APPLICATION_MESSAGES.APPLICATION_NOT_PENDING).toBe(
      'Only pending applications can be approved or rejected.',
    );
    expect(APPLICATION_MESSAGES.USER_NOT_GUEST).toBe(
      'The applicant is no longer eligible for promotion (role changed).',
    );
  });

  it('APPLICATION_STATUS pins the three valid CHECK-constraint values', () => {
    expect(APPLICATION_STATUS.PENDING).toBe('PENDING');
    expect(APPLICATION_STATUS.APPROVED).toBe('APPROVED');
    expect(APPLICATION_STATUS.REJECTED).toBe('REJECTED');
  });
});
