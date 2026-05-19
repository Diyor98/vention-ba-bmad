'use client';

import { useActionState, useEffect, useRef } from 'react';
import { useFormStatus } from 'react-dom';
import { useRouter } from 'next/navigation';
import { editSpaceAction, type EditSpaceActionState } from '@/actions/space';
import { AmenitiesForm } from '@/components/amenities';
import type { Space } from '@/db/schema';

const initialState: EditSpaceActionState = { status: 'idle' };

/**
 * Story 7-5 + DESIGN-INT-8: edit-space form refactored into prototype-
 * style `.form-card` sections — Basics / Description & photos /
 * Amenities. Same shared component for /admin/spaces/[id] +
 * /owner/spaces/[id]; only the post-success navigation branches by
 * variant.
 *
 * Sticky save bar replaces the trailing inline submit button —
 * matches prototype's `.save-bar` pattern (Story 5-2 admin.css).
 */
export function EditSpaceForm({
  space,
  variant = 'admin',
}: {
  space: Space;
  variant?: 'admin' | 'owner';
}) {
  const [state, formAction] = useActionState(
    editSpaceAction.bind(null, space.id),
    initialState,
  );
  const router = useRouter();
  const lastHandledRef = useRef<EditSpaceActionState | null>(null);

  useEffect(() => {
    if (state.status !== 'success') return;
    if (lastHandledRef.current === state) return;
    lastHandledRef.current = state;
    router.push(variant === 'owner' ? '/owner/spaces' : '/admin/spaces');
  }, [state, router, variant]);

  const fieldError = (name: string) =>
    state.status === 'error' && state.code === 'VALIDATION_ERROR'
      ? state.fields[name]
      : undefined;

  const topLevelError =
    state.status === 'error' && 'message' in state ? state.message : undefined;

  return (
    <form action={formAction} noValidate>
      {/* Section 1 — Basics */}
      <section className="form-card">
        <div className="form-card-head">
          <h2>Basics</h2>
          <p className="sub">Name, city, address — what appears on the public listing.</p>
        </div>
        <div className="form-card-body">
          <div className="form-grid">
            <div className="span-2">
              <label htmlFor="name" className="field-label">
                Space name
              </label>
              <input
                id="name"
                name="name"
                type="text"
                required
                defaultValue={space.name}
                className="input"
                aria-invalid={fieldError('name') ? true : undefined}
              />
              {fieldError('name') && (
                <p className="field-error">{fieldError('name')}</p>
              )}
            </div>
            <div>
              <label htmlFor="city" className="field-label">
                City
              </label>
              <input
                id="city"
                name="city"
                type="text"
                required
                defaultValue={space.city}
                className="input"
                aria-invalid={fieldError('city') ? true : undefined}
              />
              {fieldError('city') && (
                <p className="field-error">{fieldError('city')}</p>
              )}
            </div>
            <div>
              <label htmlFor="addressLine" className="field-label">
                Street address
              </label>
              <input
                id="addressLine"
                name="addressLine"
                type="text"
                required
                defaultValue={space.addressLine}
                className="input"
                aria-invalid={fieldError('addressLine') ? true : undefined}
              />
              {fieldError('addressLine') && (
                <p className="field-error">{fieldError('addressLine')}</p>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Section 2 — Description + photo */}
      <section className="form-card">
        <div className="form-card-head">
          <h2>Description &amp; photo</h2>
          <p className="sub">Long-form pitch + the hero image guests see first.</p>
        </div>
        <div className="form-card-body">
          <div className="form-grid">
            <div className="span-2">
              <label htmlFor="description" className="field-label">
                Description
              </label>
              <textarea
                id="description"
                name="description"
                rows={4}
                required
                defaultValue={space.description}
                className="input"
                aria-invalid={fieldError('description') ? true : undefined}
              />
              {fieldError('description') && (
                <p className="field-error">{fieldError('description')}</p>
              )}
            </div>
            <div className="span-2">
              <label htmlFor="primaryImageUrl" className="field-label">
                Hero image URL
              </label>
              <input
                id="primaryImageUrl"
                name="primaryImageUrl"
                type="url"
                required
                defaultValue={space.primaryImageUrl}
                className="input"
                aria-invalid={fieldError('primaryImageUrl') ? true : undefined}
              />
              <p className="field-help">
                Public image URL. Phase 3 will replace this with an
                upload widget; for now, paste a Cloudinary / Unsplash
                link.
              </p>
              {fieldError('primaryImageUrl') && (
                <p className="field-error">{fieldError('primaryImageUrl')}</p>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Section 3 — Amenities */}
      <section className="form-card">
        <div className="form-card-head">
          <h2>Amenities</h2>
          <p className="sub">Pick what guests can rely on at this space.</p>
        </div>
        <div className="form-card-body">
          <AmenitiesForm defaultSelected={space.amenities} />
        </div>
      </section>

      {topLevelError &&
        state.status === 'error' &&
        state.code !== 'VALIDATION_ERROR' && (
          <p className="field-error" role="alert" style={{ marginTop: '1rem' }}>
            {topLevelError}
          </p>
        )}

      {/* Sticky save bar — admin.css .save-bar */}
      <div className="save-bar">
        <div className="status">
          <span className="pulse" aria-hidden="true" />
          <span>Edits save when you click Save.</span>
        </div>
        <div className="actions">
          <SubmitButton />
        </div>
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
    >
      {pending ? 'Saving…' : 'Save changes'}
    </button>
  );
}
