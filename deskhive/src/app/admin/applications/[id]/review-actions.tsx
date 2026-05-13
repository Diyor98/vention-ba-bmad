'use client';

import { useActionState, useEffect, useRef, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { useRouter } from 'next/navigation';
import {
  approveApplicationAction,
  rejectApplicationAction,
  type ReviewApplicationActionState,
} from '@/actions/applications';
import { toastSuccess, TOAST_COPY } from '@/lib/toast';

const initialState: ReviewApplicationActionState = { status: 'idle' };

/**
 * Story 7-4: admin Approve + Reject affordance for a PENDING application.
 *
 * Asymmetric UX per BA Decisions §4 + §5:
 *   - Approve: one-click form submit (positive path, no modal).
 *   - Reject:  click opens a native <dialog> with an optional reason
 *              textarea. The form submission happens inside the dialog.
 *
 * Both flows use the Story 7-3 confirm-and-navigate toast pattern:
 *   - On success, fire the toast then router.push('/admin/applications').
 *   - The global <Toaster /> mount keeps the toast visible across the nav.
 *
 * State-identity useRef guards (Story 6-3 pattern) — each new state value
 * fires its effect exactly once; React 19 Strict Mode dev double-
 * invocations are caught.
 *
 * Native <dialog> element (no library): showModal() opens with backdrop +
 * focus trap + ESC dismissal. Backdrop click handled via a small onClick
 * checking event.target === event.currentTarget.
 */
export function ReviewActions({
  applicationId,
  applicantName,
}: {
  applicationId: string;
  applicantName: string;
}) {
  const router = useRouter();

  // ── Approve form ─────────────────────────────────────────────────────
  const [approveState, approveAction] = useActionState(
    approveApplicationAction,
    initialState,
  );
  const lastApproveState = useRef<ReviewApplicationActionState | null>(null);

  useEffect(() => {
    if (approveState.status === 'idle') return;
    if (lastApproveState.current === approveState) return;
    lastApproveState.current = approveState;

    if (approveState.status === 'success') {
      toastSuccess(TOAST_COPY.APPLICATION_APPROVED_TITLE, {
        description: `${applicantName} is now a Space Owner.`,
      });
      router.push('/admin/applications');
    }
    // Error states render inline below the Approve button (no redirect).
  }, [approveState, router, applicantName]);

  const approveError =
    approveState.status === 'error' ? approveState.message : undefined;

  // ── Reject form (modal) ──────────────────────────────────────────────
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const [rejectState, rejectAction] = useActionState(
    rejectApplicationAction,
    initialState,
  );
  const lastRejectState = useRef<ReviewApplicationActionState | null>(null);

  useEffect(() => {
    if (rejectState.status === 'idle') return;
    if (lastRejectState.current === rejectState) return;
    lastRejectState.current = rejectState;

    if (rejectState.status === 'success') {
      // .close() emits the native 'close' event, which fires onClose
      // below and updates dialogOpen. No setState needed in the effect.
      dialogRef.current?.close();
      toastSuccess(TOAST_COPY.APPLICATION_REJECTED_TITLE);
      router.push('/admin/applications');
    }
    // Error states render inline inside the dialog (no redirect).
  }, [rejectState, router]);

  const rejectError =
    rejectState.status === 'error' ? rejectState.message : undefined;

  function openRejectDialog(): void {
    dialogRef.current?.showModal();
    setDialogOpen(true);
  }

  function closeRejectDialog(): void {
    dialogRef.current?.close();
    setDialogOpen(false);
  }

  function onDialogClick(event: React.MouseEvent<HTMLDialogElement>): void {
    // Backdrop click dismissal — the click target is the <dialog> itself
    // (not any inner content) when the user clicks the backdrop area.
    if (event.target === event.currentTarget) {
      closeRejectDialog();
    }
  }

  return (
    <div className="review-actions" style={{ marginTop: '2rem' }}>
      <h2 className="h2 mb-4">Decision</h2>

      <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
        <form action={approveAction}>
          <input type="hidden" name="applicationId" value={applicationId} />
          <ApproveSubmit />
        </form>

        <button
          type="button"
          className="btn btn-secondary"
          onClick={openRejectDialog}
          style={{
            color: 'var(--color-status-rejected-fg)',
            borderColor: 'var(--color-status-rejected-border)',
          }}
        >
          Reject
        </button>
      </div>

      {approveError && (
        <p
          className="field-error"
          role="alert"
          style={{ marginTop: '0.75rem' }}
        >
          {approveError}
        </p>
      )}

      <dialog
        ref={dialogRef}
        className="review-dialog"
        onClick={onDialogClick}
        onClose={() => setDialogOpen(false)}
        aria-labelledby="reject-dialog-title"
      >
        {dialogOpen && (
          <form action={rejectAction} className="review-dialog-inner">
            <input type="hidden" name="applicationId" value={applicationId} />

            <h3 id="reject-dialog-title" className="h2 mb-4">
              Reject application
            </h3>

            <p
              className="muted-strong"
              style={{ fontSize: '14px', marginBottom: '1rem' }}
            >
              This will reject {applicantName}&apos;s application. They can
              apply again later.
            </p>

            <div className="mb-4">
              <label htmlFor="reject-reason" className="field-label">
                Reason{' '}
                <span className="muted" style={{ fontWeight: 400 }}>
                  (optional)
                </span>
              </label>
              <textarea
                id="reject-reason"
                name="reason"
                rows={4}
                maxLength={500}
                className="input"
                placeholder="Why are you rejecting this application?"
              />
              <p className="field-help">
                The reason is for your records. The applicant won&apos;t see it
                directly in the app (they&apos;ll receive a notification email
                in a future release).
              </p>
            </div>

            {rejectError && (
              <p
                className="field-error"
                role="alert"
                style={{ marginBottom: '0.75rem' }}
              >
                {rejectError}
              </p>
            )}

            <div
              style={{
                display: 'flex',
                justifyContent: 'flex-end',
                gap: '0.5rem',
                marginTop: '0.5rem',
              }}
            >
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={closeRejectDialog}
              >
                Cancel
              </button>
              <RejectSubmit />
            </div>
          </form>
        )}
      </dialog>
    </div>
  );
}

function ApproveSubmit() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      aria-disabled={pending || undefined}
      className="btn btn-primary"
    >
      {pending ? 'Approving…' : 'Approve'}
    </button>
  );
}

function RejectSubmit() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      aria-disabled={pending || undefined}
      className="btn btn-primary btn-sm"
      style={{
        background: 'var(--color-status-rejected-fg)',
        borderColor: 'var(--color-status-rejected-fg)',
      }}
    >
      {pending ? 'Rejecting…' : 'Reject application'}
    </button>
  );
}
