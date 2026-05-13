'use client';

import { useActionState, useEffect, useRef } from 'react';
import { useFormStatus } from 'react-dom';
import { useRouter } from 'next/navigation';
import {
  createApplicationAction,
  type CreateApplicationActionState,
} from '@/actions/applications';
import { toastSuccess, TOAST_COPY } from '@/lib/toast';

const initialState: CreateApplicationActionState = { status: 'idle' };

/**
 * Story 7-3: Become-a-Space-Owner form (State A).
 *
 * Phase 2 "confirm + navigate" toast pattern: on success, fire the toast
 * THEN router.push('/my-bookings'). The global <Toaster /> mount keeps the
 * toast visible across the navigation. Diverges from Story 6-3's
 * toast-in-context pattern (which didn't navigate) — both are documented
 * as sibling patterns in `reference_guest_application_form_ui.md`.
 *
 * Concurrency redirects: if the server returns PENDING_APPLICATION_EXISTS,
 * ALREADY_SPACE_OWNER, or ADMINS_CANNOT_APPLY (the user had two tabs open
 * and the state changed in another tab), redirect back to /become-a-host
 * silently. The page re-renders into State B / C / D accordingly.
 *
 * State-identity useRef guard pattern (Story 6-3) — each new state value
 * fires its effect exactly once; re-renders with the same state are no-ops;
 * React 19 Strict Mode dev double-invocations are also caught.
 *
 * Props: displayName + email come from the Server Component parent (read
 * from session). Client Component never touches headers()/cookies()/session.
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

  const lastHandledState = useRef<CreateApplicationActionState | null>(null);

  useEffect(() => {
    if (state.status === 'idle') return;
    if (lastHandledState.current === state) return;
    lastHandledState.current = state;

    if (state.status === 'success') {
      toastSuccess(TOAST_COPY.APPLICATION_SUBMITTED_TITLE, {
        description: TOAST_COPY.APPLICATION_SUBMITTED_DESCRIPTION,
      });
      router.push('/my-bookings');
      return;
    }

    // Error states with concurrency-redirect semantics. The destination
    // page re-renders the matching state (B / C / unauthenticated).
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
      // VALIDATION_ERROR + INTERNAL_ERROR are rendered inline (below) —
      // no router action needed.
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

  return (
    <form action={formAction} noValidate>
      {/* "Your details" read-only block — pulled from session at the page
          level (Server Component) and passed down as props. */}
      <section aria-labelledby="sec-your-details" className="mb-6">
        <h3
          id="sec-your-details"
          style={{
            fontSize: '12px',
            fontWeight: 600,
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
            color: 'var(--color-neutral-500)',
            marginBottom: '0.75rem',
          }}
        >
          Your details
        </h3>
        <dl style={{ display: 'grid', gap: '0.5rem' }}>
          <ReadOnlyRow label="Full name" value={displayName} />
          <ReadOnlyRow label="Email" value={email} />
        </dl>
      </section>

      <div className="mb-4">
        <label htmlFor="businessName" className="field-label">
          Business name
        </label>
        <input
          id="businessName"
          name="businessName"
          type="text"
          required
          className="input"
          placeholder="Acme Coworking"
          aria-invalid={fieldError('businessName') ? true : undefined}
        />
        {fieldError('businessName') && (
          <p className="field-error">{fieldError('businessName')}</p>
        )}
      </div>

      <div className="mb-4">
        <label htmlFor="businessAddress" className="field-label">
          Business address
        </label>
        <textarea
          id="businessAddress"
          name="businessAddress"
          rows={3}
          required
          className="input"
          placeholder={'123 Main St\nBerlin, Germany'}
          aria-invalid={fieldError('businessAddress') ? true : undefined}
        />
        {fieldError('businessAddress') && (
          <p className="field-error">{fieldError('businessAddress')}</p>
        )}
      </div>

      <div className="mb-4">
        <label htmlFor="taxId" className="field-label">
          Tax ID
        </label>
        <input
          id="taxId"
          name="taxId"
          type="text"
          required
          className="input"
          placeholder="VAT / EIN / equivalent"
          aria-invalid={fieldError('taxId') ? true : undefined}
        />
        <p className="field-help">
          Free text — varies by country. We don&apos;t validate format.
        </p>
        {fieldError('taxId') && (
          <p className="field-error">{fieldError('taxId')}</p>
        )}
      </div>

      <div className="mb-6">
        <label htmlFor="motivation" className="field-label">
          Why do you want to host?{' '}
          <span className="muted" style={{ fontWeight: 400 }}>
            (optional)
          </span>
        </label>
        <textarea
          id="motivation"
          name="motivation"
          rows={5}
          maxLength={1000}
          className="input"
          placeholder="Tell us a bit about your space and your goals as a host."
          aria-invalid={fieldError('motivation') ? true : undefined}
        />
        <p className="field-help">Up to 1000 characters.</p>
        {fieldError('motivation') && (
          <p className="field-error">{fieldError('motivation')}</p>
        )}
      </div>

      {topLevelError && (
        <p className="field-error mb-4" role="alert">
          {topLevelError}
        </p>
      )}

      <SubmitButton />
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
      style={{ width: '100%' }}
    >
      {pending ? 'Submitting…' : 'Submit application'}
    </button>
  );
}

function ReadOnlyRow({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{ display: 'grid', gridTemplateColumns: '8rem 1fr', gap: '0.5rem' }}
    >
      <dt
        style={{ fontSize: '13px', color: 'var(--color-neutral-500)' }}
      >
        {label}
      </dt>
      <dd
        style={{
          fontSize: '13px',
          color: 'var(--color-neutral-800)',
          fontWeight: 500,
          margin: 0,
        }}
      >
        {value}
      </dd>
    </div>
  );
}
