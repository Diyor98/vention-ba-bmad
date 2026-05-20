'use client';

import { useActionState, useEffect, useRef, useState } from 'react';
import { useFormStatus } from 'react-dom';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Send } from 'lucide-react';
import {
  createApplicationAction,
  type CreateApplicationActionState,
} from '@/actions/applications';
import { toastSuccess, TOAST_COPY } from '@/lib/toast';

const initialState: CreateApplicationActionState = { status: 'idle' };

/**
 * DESIGN-INT-GAPS-PASS-2 Gap 3 — Become-a-host application form,
 * rebuilt to the prototype (DeskHive_Prototype.html lines 1515-1593).
 *
 * Visible fields per prototype:
 *   - Your name           (pre-filled from session, read-only)
 *   - Email               (pre-filled from session, read-only)
 *   - Space name          → wires to `businessName`
 *   - City                → wires to `businessAddress`
 *   - Tell us about your space (textarea) → wires to `motivation`
 *
 * Backend (Story 7-2) hasn't changed — the existing schema has a
 * notNull `taxId` column + Zod min(1) check that the prototype's
 * five-input form omits. Bridge: hidden input `taxId="TBD —
 * collected during Stripe onboarding"`. Tax ID is naturally
 * collected by Stripe Connect onboarding (Story 9-2) anyway, so
 * this is a clean Phase-2.x follow-up rather than a schema change.
 *
 * On success: replace the form with an inline emerald-50 success
 * panel ("Application received" + Back-to-browse) per prototype
 * lines 1548-1555. Toast is preserved alongside (the prototype's
 * submit() also fires both setSubmitted+notify.success).
 *
 * Error-state redirects (PENDING_APPLICATION_EXISTS, etc.) are
 * preserved verbatim from Story 7-3.
 */
export function ApplicationForm({
  displayName,
  email,
}: {
  displayName: string;
  email: string;
}) {
  const [state, formAction] = useActionState(
    createApplicationAction,
    initialState,
  );
  const router = useRouter();

  const [submitted, setSubmitted] = useState(false);
  const lastHandledState = useRef<CreateApplicationActionState | null>(null);

  useEffect(() => {
    if (state.status === 'idle') return;
    if (lastHandledState.current === state) return;
    lastHandledState.current = state;

    if (state.status === 'success') {
      toastSuccess(TOAST_COPY.APPLICATION_SUBMITTED_TITLE, {
        description: TOAST_COPY.APPLICATION_SUBMITTED_DESCRIPTION,
      });
      // Legitimate set-state-in-effect: the action state is a useActionState
      // value that only changes after the Server Action resolves; this
      // setter runs exactly once per success (lastHandledState ref guards
      // re-runs). Same pattern as the embedded-checkout button at
      // src/app/spaces/[id]/book-desk-button.tsx — there's no synchronous
      // alternative because `submitted` is a Client-Component-only
      // presentation toggle (the server doesn't know whether to show the
      // form or the success panel).
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSubmitted(true);
      return;
    }

    if (state.status === 'error') {
      if (
        state.code === 'PENDING_APPLICATION_EXISTS' ||
        state.code === 'ALREADY_SPACE_OWNER' ||
        state.code === 'ADMINS_CANNOT_APPLY'
      ) {
        router.push('/become-a-host');
        return;
      }
      if (state.code === 'UNAUTHORIZED') {
        router.push('/login?callbackUrl=/become-a-host');
        return;
      }
    }
  }, [state, router]);

  const fieldError = (name: string): string | undefined => {
    if (state.status !== 'error') return undefined;
    if (state.code !== 'VALIDATION_ERROR') return undefined;
    return state.fields?.[name];
  };

  const topLevelError =
    state.status === 'error' &&
    state.code !== 'VALIDATION_ERROR' &&
    state.code !== 'PENDING_APPLICATION_EXISTS' &&
    state.code !== 'ALREADY_SPACE_OWNER' &&
    state.code !== 'ADMINS_CANNOT_APPLY' &&
    state.code !== 'UNAUTHORIZED'
      ? state.message
      : undefined;

  if (submitted) {
    return <SuccessPanel />;
  }

  return (
    <form action={formAction} noValidate data-testid="application-form">
      {/* Bridge to existing Story 7-2 backend that requires taxId;
          collected by Stripe Connect later. See file header. */}
      <input
        type="hidden"
        name="taxId"
        value="TBD — collected during Stripe onboarding"
      />

      <div
        className="grid grid-cols-1 md:grid-cols-2 gap-4"
        style={{ marginBottom: '1rem' }}
      >
        <ReadOnlyField
          label="Your name"
          value={displayName}
          testid="field-name"
        />
        <ReadOnlyField
          label="Email"
          value={email}
          type="email"
          testid="field-email"
        />

        <div>
          <label htmlFor="businessName" className="field-label">
            Space name
          </label>
          <input
            id="businessName"
            name="businessName"
            type="text"
            required
            className="input"
            placeholder="e.g. Westside Workshop"
            aria-invalid={fieldError('businessName') ? true : undefined}
            data-testid="field-space-name"
          />
          <p className="field-help">Public · how guests will find you</p>
          {fieldError('businessName') && (
            <p className="field-error">{fieldError('businessName')}</p>
          )}
        </div>

        <div>
          <label htmlFor="businessAddress" className="field-label">
            City
          </label>
          <input
            id="businessAddress"
            name="businessAddress"
            type="text"
            required
            className="input"
            placeholder="Portland, OR"
            aria-invalid={fieldError('businessAddress') ? true : undefined}
            data-testid="field-city"
          />
          {fieldError('businessAddress') && (
            <p className="field-error">{fieldError('businessAddress')}</p>
          )}
        </div>
      </div>

      <div style={{ marginBottom: '1.25rem' }}>
        <label htmlFor="motivation" className="field-label">
          Tell us about your space
        </label>
        <textarea
          id="motivation"
          name="motivation"
          rows={4}
          maxLength={1000}
          className="input"
          placeholder="Square footage, neighborhood, what makes it special…"
          aria-invalid={fieldError('motivation') ? true : undefined}
          data-testid="field-message"
        />
        <p className="field-help">
          A few lines is enough. We&apos;ll ask for photos after approval.
        </p>
        {fieldError('motivation') && (
          <p className="field-error">{fieldError('motivation')}</p>
        )}
      </div>

      {topLevelError && (
        <p
          className="field-error"
          role="alert"
          style={{ marginBottom: '0.75rem' }}
          data-testid="form-top-error"
        >
          {topLevelError}
        </p>
      )}

      <div
        style={{
          marginTop: '1.25rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'flex-end',
          gap: '0.5rem',
          paddingTop: '1rem',
          borderTop: '1px solid var(--color-neutral-100)',
        }}
      >
        {/* Prototype shows a "Save draft" ghost button that has no
            handler. Mirrored here as a no-op type=button — clicking
            it does nothing. Real draft persistence is out of scope
            for this gap. */}
        <button
          type="button"
          className="btn-ghost"
          data-testid="save-draft"
          title="Coming soon"
        >
          Save draft
        </button>
        <SubmitButton />
      </div>
    </form>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      aria-disabled={pending || undefined}
      className="btn btn-primary"
      data-testid="submit-application"
      style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}
    >
      <Send size={16} aria-hidden="true" />
      {pending ? 'Submitting…' : 'Submit application'}
    </button>
  );
}

function ReadOnlyField({
  label,
  value,
  type,
  testid,
}: {
  label: string;
  value: string;
  type?: 'email' | 'text';
  testid: string;
}) {
  // Pre-filled from session — read-only because the application
  // backend doesn't store name/email separately (they're already on
  // the auth user record). Users update these in Account settings.
  return (
    <div>
      <label
        className="field-label"
        style={{ display: 'block' }}
      >
        {label}
      </label>
      <input
        type={type ?? 'text'}
        defaultValue={value}
        readOnly
        aria-readonly="true"
        className="input"
        data-testid={testid}
        style={{
          background: 'var(--color-neutral-100)',
          color: 'var(--color-neutral-700)',
          cursor: 'not-allowed',
        }}
      />
    </div>
  );
}

function SuccessPanel() {
  return (
    <div
      role="status"
      data-testid="application-success"
      style={{
        padding: '1.25rem',
        background: '#ECFDF5',
        border: '1px solid #D1FAE5',
        borderRadius: 'var(--radius-lg)',
      }}
    >
      <div
        style={{
          fontWeight: 500,
          color: '#064E3B',
          fontSize: '15px',
        }}
      >
        Application received
      </div>
      <div
        style={{
          fontSize: 14,
          color: '#065F46',
          marginTop: '0.25rem',
          lineHeight: 1.5,
        }}
      >
        We&apos;ll email you within 2 business days. Until then, your
        account stays in Guest mode.
      </div>
      <div
        style={{
          marginTop: '0.875rem',
          display: 'flex',
          gap: '0.5rem',
          flexWrap: 'wrap',
        }}
      >
        <Link
          href="/browse"
          className="btn btn-secondary btn-sm"
          data-testid="success-back-to-browse"
        >
          Back to browse
        </Link>
      </div>
    </div>
  );
}
