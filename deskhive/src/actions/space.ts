'use server';

import { revalidatePath } from 'next/cache';
import { requireSession, AuthError } from '@/lib/auth/guards';
import { createSpaceSchema } from '@/lib/validation/space';
import {
  createSpace,
  updateSpace,
  getSpaceById,
} from '@/db/queries/spaces';
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
    created = await createSpace(
      parsed.data,
      callerRole === 'SPACE_OWNER' ? callerId : undefined,
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
