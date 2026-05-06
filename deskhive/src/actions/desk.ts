'use server';

import { revalidatePath } from 'next/cache';
import { requireSession, requireRole, AuthError } from '@/lib/auth/guards';
import { createDeskSchema, editDeskSchema } from '@/lib/validation/desk';
import { createDesk, getDeskById, updateDesk } from '@/db/queries/desks';
import { getSpaceById } from '@/db/queries/spaces';
import { isPgUniqueViolation } from '@/lib/db-errors';
import { logger } from '@/lib/logger';

export type CreateDeskActionState =
  | { status: 'idle' }
  | { status: 'error'; code: 'UNAUTHORIZED'; message: string }
  | { status: 'error'; code: 'FORBIDDEN'; message: string }
  | { status: 'error'; code: 'NOT_FOUND'; message: string }
  | { status: 'error'; code: 'VALIDATION_ERROR'; fields: Record<string, string> }
  | { status: 'error'; code: 'DUPLICATE_LABEL'; message: string }
  | { status: 'error'; code: 'INTERNAL_ERROR'; message: string };

const createIdle: CreateDeskActionState = { status: 'idle' };

export async function createDeskAction(
  spaceId: string,
  _prevState: CreateDeskActionState,
  formData: FormData,
): Promise<CreateDeskActionState> {
  try {
    const session = await requireSession();
    requireRole(session, 'SUPER_ADMIN');
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
    logger.error('create_desk_action_auth_failed', { error: String(err) });
    return { status: 'error', code: 'INTERNAL_ERROR', message: 'Something went wrong.' };
  }

  const space = await getSpaceById(spaceId);
  if (!space) {
    return { status: 'error', code: 'NOT_FOUND', message: 'Space not found.' };
  }

  const parsed = createDeskSchema.safeParse({
    label: formData.get('label'),
    dailyPriceCents: formData.get('dailyPriceCents'),
  });

  if (!parsed.success) {
    const fields: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? '');
      if (key && !fields[key]) fields[key] = issue.message;
    }
    return { status: 'error', code: 'VALIDATION_ERROR', fields };
  }

  let result: CreateDeskActionState | null = null;
  try {
    await createDesk(spaceId, parsed.data);
  } catch (err) {
    if (isPgUniqueViolation(err, 'uniq_desk_label_per_space')) {
      result = {
        status: 'error',
        code: 'DUPLICATE_LABEL',
        // Verbatim PRD message — do not paraphrase (US-2.3 AC-2).
        message: 'A desk with that label already exists in this space',
      };
    } else {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error('create_desk_action_db_failed', { error: msg });
      result = {
        status: 'error',
        code: 'INTERNAL_ERROR',
        message: 'Something went wrong. Please try again.',
      };
    }
  }

  if (result) return result;

  revalidatePath(`/admin/spaces/${spaceId}`);
  return createIdle;
}

export type EditDeskActionState =
  | { status: 'idle' }
  | { status: 'error'; code: 'UNAUTHORIZED'; message: string }
  | { status: 'error'; code: 'FORBIDDEN'; message: string }
  | { status: 'error'; code: 'NOT_FOUND'; message: string }
  | { status: 'error'; code: 'VALIDATION_ERROR'; fields: Record<string, string> }
  | { status: 'error'; code: 'DUPLICATE_LABEL'; message: string }
  | { status: 'error'; code: 'INTERNAL_ERROR'; message: string };

const editIdle: EditDeskActionState = { status: 'idle' };

export async function editDeskAction(
  deskId: string,
  _prevState: EditDeskActionState,
  formData: FormData,
): Promise<EditDeskActionState> {
  try {
    const session = await requireSession();
    requireRole(session, 'SUPER_ADMIN');
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
    logger.error('edit_desk_action_auth_failed', { error: String(err) });
    return { status: 'error', code: 'INTERNAL_ERROR', message: 'Something went wrong.' };
  }

  // Pre-existence check + spaceId lookup. We need spaceId for revalidatePath
  // and the row's existence check guards against stale ids in concurrent-
  // delete edge cases.
  const desk = await getDeskById(deskId);
  if (!desk) {
    return { status: 'error', code: 'NOT_FOUND', message: 'Desk not found.' };
  }

  // HTML checkboxes submit 'on' when checked, nothing when unchecked. Convert
  // to a real boolean before Zod sees it; z.coerce.boolean would treat the
  // string 'false' as truthy, which is not what we want.
  const parsed = editDeskSchema.safeParse({
    label: formData.get('label'),
    dailyPriceCents: formData.get('dailyPriceCents'),
    isActive: formData.get('isActive') === 'on',
  });

  if (!parsed.success) {
    const fields: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? '');
      if (key && !fields[key]) fields[key] = issue.message;
    }
    return { status: 'error', code: 'VALIDATION_ERROR', fields };
  }

  let result: EditDeskActionState | null = null;
  try {
    await updateDesk(deskId, parsed.data);
  } catch (err) {
    if (isPgUniqueViolation(err, 'uniq_desk_label_per_space')) {
      result = {
        status: 'error',
        code: 'DUPLICATE_LABEL',
        message: 'A desk with that label already exists in this space',
      };
    } else {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error('edit_desk_action_db_failed', { error: msg });
      result = {
        status: 'error',
        code: 'INTERNAL_ERROR',
        message: 'Something went wrong. Please try again.',
      };
    }
  }

  if (result) return result;

  // spaceId comes from the desk row we already fetched; the form doesn't
  // submit it, and editing never moves a desk between spaces in Phase 1.
  revalidatePath(`/admin/spaces/${desk.spaceId}`);
  return editIdle;
}
