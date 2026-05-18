'use server';

import { eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';
import { requireSession, AuthError } from '@/lib/auth/guards';
import { auth } from '@/lib/auth/config';
import { effectiveMode } from '@/lib/mode';
import { createSpaceSchema } from '@/lib/validation/space';
import {
  createSpace,
  updateSpace,
  getSpaceById,
} from '@/db/queries/spaces';
import { getConnectAccountByUserId } from '@/db/queries/stripe-connect';
import { db } from '@/db/client';
import { spacesTable } from '@/db/schema';
import { logger } from '@/lib/logger';
import type { Role } from '@/db/schema';

// Story 7-5: replaced redirect()-on-success with success-state return.
// Both /admin and /owner forms consume this action; the Client form
// decides where to navigate (and whether to fire a toast) based on its
// `variant` prop. See AC-8 in 7-5 story file.
export type CreateSpaceActionState =
  | { status: 'idle' }
  | { status: 'success'; spaceId: string }
  | { status: 'error'; code: 'UNAUTHORIZED'; message: string }
  | { status: 'error'; code: 'FORBIDDEN'; message: string }
  | { status: 'error'; code: 'VALIDATION_ERROR'; fields: Record<string, string> }
  | { status: 'error'; code: 'INTERNAL_ERROR'; message: string };

// Story 7-5: widened to allow SUPER_ADMIN (Phase 1) OR SPACE_OWNER. The
// admin path leaves owner_id NULL; the owner path stamps owner_id with
// the caller's id. Decision §3 + §8.
export async function createSpaceAction(
  _prevState: CreateSpaceActionState,
  formData: FormData,
): Promise<CreateSpaceActionState> {
  let callerRole: Role | undefined;
  let callerId: string;
  try {
    const session = await requireSession();
    callerRole = (session.user as { role?: Role }).role;
    callerId = String(session.user.id);
    if (callerRole !== 'SUPER_ADMIN' && callerRole !== 'SPACE_OWNER') {
      return { status: 'error', code: 'FORBIDDEN', message: 'Forbidden.' };
    }
  } catch (err) {
    if (err instanceof AuthError) {
      const status = err.response.status;
      if (status === 401) {
        return { status: 'error', code: 'UNAUTHORIZED', message: 'Please log in.' };
      }
      if (status === 403) {
        return { status: 'error', code: 'FORBIDDEN', message: 'Forbidden.' };
      }
    }
    logger.error('create_space_action_auth_failed', { error: String(err) });
    return { status: 'error', code: 'INTERNAL_ERROR', message: 'Something went wrong.' };
  }

  const parsed = createSpaceSchema.safeParse({
    name: formData.get('name'),
    city: formData.get('city'),
    addressLine: formData.get('addressLine'),
    description: formData.get('description'),
    primaryImageUrl: formData.get('primaryImageUrl'),
  });

  if (!parsed.success) {
    const fields: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? '');
      if (key && !fields[key]) fields[key] = issue.message;
    }
    return { status: 'error', code: 'VALIDATION_ERROR', fields };
  }

  let created;
  try {
    // Story 9-2b: owner-side creates land in DRAFT (private until the
    // owner clicks Publish on the detail page with active Connect). Admin
    // side keeps Phase 1 auto-publish behavior. The status branch lives
    // here — NOT inside `createSpace` — per BA Decision §4 anti-pattern.
    created = await createSpace(
      parsed.data,
      callerRole === 'SPACE_OWNER' ? callerId : undefined,
      callerRole === 'SPACE_OWNER' ? 'DRAFT' : 'PUBLISHED',
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error('create_space_action_db_failed', { error: msg });
    return {
      status: 'error',
      code: 'INTERNAL_ERROR',
      message: 'Something went wrong. Please try again.',
    };
  }

  // Revalidate both admin and owner list views; revalidating an unrendered
  // path is a cheap no-op (next/cache treats it as a tag invalidation).
  revalidatePath('/admin/spaces');
  revalidatePath('/owner/spaces');
  // Public browse may also need a refresh — Phase 2 auto-publish means the
  // new space is immediately visible at `/`.
  revalidatePath('/');
  return { status: 'success', spaceId: created.id };
}

// Story 7-5: same shape change as create. Edit form's variant prop drives
// the post-success navigation; no redirect() inside the action.
export type EditSpaceActionState =
  | { status: 'idle' }
  | { status: 'success' }
  | { status: 'error'; code: 'UNAUTHORIZED'; message: string }
  | { status: 'error'; code: 'FORBIDDEN'; message: string }
  | { status: 'error'; code: 'NOT_FOUND'; message: string }
  | { status: 'error'; code: 'VALIDATION_ERROR'; fields: Record<string, string> }
  | { status: 'error'; code: 'INTERNAL_ERROR'; message: string };

// `id` is bound at the form level via `editSpaceAction.bind(null, space.id)`;
// the resulting bound function has the standard (prevState, formData) shape
// that useActionState expects.
export async function editSpaceAction(
  id: string,
  _prevState: EditSpaceActionState,
  formData: FormData,
): Promise<EditSpaceActionState> {
  let callerRole: Role | undefined;
  let callerId: string;
  try {
    const session = await requireSession();
    callerRole = (session.user as { role?: Role }).role;
    callerId = String(session.user.id);
    if (callerRole !== 'SUPER_ADMIN' && callerRole !== 'SPACE_OWNER') {
      return { status: 'error', code: 'FORBIDDEN', message: 'Forbidden.' };
    }
  } catch (err) {
    if (err instanceof AuthError) {
      const status = err.response.status;
      if (status === 401) {
        return { status: 'error', code: 'UNAUTHORIZED', message: 'Please log in.' };
      }
      if (status === 403) {
        return { status: 'error', code: 'FORBIDDEN', message: 'Forbidden.' };
      }
    }
    logger.error('edit_space_action_auth_failed', { error: String(err) });
    return { status: 'error', code: 'INTERNAL_ERROR', message: 'Something went wrong.' };
  }

  // Story 7-5 Decision §8: owner-scope check at the action layer is
  // authoritative — the /owner/spaces/[id] route guard is first line of
  // defense, but a determined caller submitting a forged form to the
  // action with another owner's space id must be rejected here. Use the
  // same NOT_FOUND code Phase 1 uses for missing rows (leak-prevention).
  if (callerRole === 'SPACE_OWNER') {
    const existing = await getSpaceById(id);
    if (!existing || existing.ownerId !== callerId) {
      return { status: 'error', code: 'NOT_FOUND', message: 'Space not found.' };
    }
  }

  const parsed = createSpaceSchema.safeParse({
    name: formData.get('name'),
    city: formData.get('city'),
    addressLine: formData.get('addressLine'),
    description: formData.get('description'),
    primaryImageUrl: formData.get('primaryImageUrl'),
  });

  if (!parsed.success) {
    const fields: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? '');
      if (key && !fields[key]) fields[key] = issue.message;
    }
    return { status: 'error', code: 'VALIDATION_ERROR', fields };
  }

  try {
    const updated = await updateSpace(id, parsed.data);
    if (!updated) {
      return { status: 'error', code: 'NOT_FOUND', message: 'Space not found.' };
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error('edit_space_action_db_failed', { error: msg });
    return {
      status: 'error',
      code: 'INTERNAL_ERROR',
      message: 'Something went wrong. Please try again.',
    };
  }

  revalidatePath('/admin/spaces');
  revalidatePath(`/admin/spaces/${id}`);
  revalidatePath('/owner/spaces');
  revalidatePath(`/owner/spaces/${id}`);
  revalidatePath('/');
  revalidatePath(`/spaces/${id}`);
  return { status: 'success' };
}

// Story 9-2b: publish a DRAFT space. Gated on the caller owning the row
// AND their `stripe_connect_accounts` row showing both `chargesEnabled`
// and `payoutsEnabled`. The Connect check is a pure DB read — the cached
// state is kept in sync by Story 9-2's `account.updated` webhook handler
// and `refreshConnectStatusAction`. NO Stripe SDK calls from here.
//
// Error union dropped NOT_OWNER per BA Decision §2 — cross-tenant
// mismatches collapse into NOT_FOUND (Story 7-5 leak-prevention). The
// signature shape (plain object return, not the useActionState
// state-machine shape) matches the locked spec from the decisions doc;
// the caller is a Client Component button, not a useActionState form.
export type PublishSpaceResult =
  | { ok: true }
  | {
      ok: false;
      error: 'NOT_FOUND' | 'STRIPE_NOT_ACTIVE' | 'ALREADY_PUBLISHED';
    };

export async function publishSpaceAction(input: {
  spaceId: string;
}): Promise<PublishSpaceResult> {
  // Step 1: session + role + host-mode. Any failure collapses into
  // NOT_FOUND (Decision §2's broader leak-prevention philosophy — an
  // unauthorized caller probing for a real spaceId gets the same
  // response shape as a genuinely-missing row).
  let userId: string;
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session) return { ok: false, error: 'NOT_FOUND' };
    const role = (session.user as { role?: string }).role;
    if (role !== 'SPACE_OWNER') return { ok: false, error: 'NOT_FOUND' };
    const mode = await effectiveMode(session);
    if (mode !== 'host') return { ok: false, error: 'NOT_FOUND' };
    userId = String(session.user.id);
  } catch (err) {
    logger.error('publish_space_action_auth_failed', { error: String(err) });
    return { ok: false, error: 'NOT_FOUND' };
  }

  // Steps 2 + 3: space exists AND caller owns it.
  const space = await getSpaceById(input.spaceId);
  if (!space) return { ok: false, error: 'NOT_FOUND' };
  if (space.ownerId !== userId) return { ok: false, error: 'NOT_FOUND' };

  // Steps 4 + 5: current status branches.
  if (space.status === 'PUBLISHED') {
    return { ok: false, error: 'ALREADY_PUBLISHED' };
  }
  if (space.status === 'SUSPENDED') {
    return { ok: false, error: 'NOT_FOUND' };
  }

  // Step 6: Connect-active check (pure DB read).
  const connectRow = await getConnectAccountByUserId(userId);
  if (
    !connectRow ||
    connectRow.chargesEnabled !== true ||
    connectRow.payoutsEnabled !== true
  ) {
    return { ok: false, error: 'STRIPE_NOT_ACTIVE' };
  }

  // Step 7: flip to PUBLISHED. Single-table single-row update — PG
  // row-level isolation is sufficient; no transaction needed.
  try {
    await db
      .update(spacesTable)
      .set({ status: 'PUBLISHED', updatedAt: new Date() })
      .where(eq(spacesTable.id, input.spaceId));
  } catch (err) {
    logger.error('publish_space_action_db_failed', { error: String(err) });
    return { ok: false, error: 'NOT_FOUND' };
  }

  revalidatePath('/owner/spaces');
  revalidatePath(`/owner/spaces/${input.spaceId}`);
  revalidatePath('/');
  revalidatePath(`/spaces/${input.spaceId}`);
  return { ok: true };
}
