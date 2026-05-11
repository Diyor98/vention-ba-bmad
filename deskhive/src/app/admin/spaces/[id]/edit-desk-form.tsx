'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { editDeskAction, type EditDeskActionState } from '@/actions/desk';
import { centsToDollars } from '@/lib/money';
import type { Desk } from '@/db/schema';

const initialState: EditDeskActionState = { status: 'idle' };

// Story 5-2 reskin: .desk-admin-row grid (admin.css).
// Story 6-1: price input accepts dollars; existing cents value populated
// via centsToDollars(desk.dailyPriceCents) so an existing 2500-cent desk
// shows "25.00" in the input. The "cents · $X.XX" preview from prior
// versions is removed (BA Decisions §3).
//
// `index` is presentational (the "01", "02" sequence from the design);
// canonical id is desk.id.
export function EditDeskForm({ desk, index }: { desk: Desk; index: number }) {
  const [state, formAction] = useActionState(
    editDeskAction.bind(null, desk.id),
    initialState,
  );

  const fieldError = (name: string) =>
    state.status === 'error' && state.code === 'VALIDATION_ERROR'
      ? state.fields[name]
      : undefined;

  const topLevelError =
    state.status === 'error' &&
    state.code !== 'VALIDATION_ERROR' &&
    'message' in state
      ? state.message
      : undefined;

  const hasError =
    fieldError('label') ||
    fieldError('dailyPriceDollars') ||
    fieldError('isActive') ||
    topLevelError;

  return (
    <form action={formAction} noValidate>
      <div
        className="desk-admin-row"
        style={!desk.isActive ? { opacity: 0.7 } : undefined}
      >
        <span className="num">{String(index + 1).padStart(2, '0')}</span>
        <input
          name="label"
          type="text"
          defaultValue={desk.label}
          required
          aria-label="Label"
          aria-invalid={fieldError('label') ? true : undefined}
          className="input"
          style={{ height: '2rem' }}
        />
        <input
          name="dailyPriceDollars"
          type="text"
          inputMode="decimal"
          pattern="^\d{1,5}(?:\.\d{1,2})?$"
          defaultValue={centsToDollars(desk.dailyPriceCents)}
          required
          aria-label="Daily price"
          aria-invalid={fieldError('dailyPriceDollars') ? true : undefined}
          className="input tnum"
          style={{ width: '6rem', height: '2rem' }}
        />
        <span>
          {desk.isActive ? (
            <span className="badge badge-confirmed">
              <span className="dot"></span>Active
            </span>
          ) : (
            <span className="badge badge-cancelled">
              <span className="dot"></span>Inactive
            </span>
          )}
        </span>
        <label
          className="flex items-center gap-1"
          style={{ fontSize: '12px', whiteSpace: 'nowrap' }}
        >
          <input
            name="isActive"
            type="checkbox"
            defaultChecked={desk.isActive}
          />
          Active
        </label>
        <span className="actions">
          <SubmitButton />
        </span>
      </div>

      {hasError && (
        <div
          style={{
            padding: '0.5rem 1rem 0.75rem',
            background: 'var(--color-status-rejected-bg)',
            borderBottom: '1px solid var(--color-border)',
          }}
        >
          {fieldError('label') && (
            <p className="field-error">{fieldError('label')}</p>
          )}
          {fieldError('dailyPriceDollars') && (
            <p className="field-error">{fieldError('dailyPriceDollars')}</p>
          )}
          {fieldError('isActive') && (
            <p className="field-error">{fieldError('isActive')}</p>
          )}
          {topLevelError && (
            <p className="field-error" role="alert">
              {topLevelError}
            </p>
          )}
        </div>
      )}
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
      className="btn-xs btn-neutral"
    >
      {pending ? 'Saving…' : 'Save'}
    </button>
  );
}
