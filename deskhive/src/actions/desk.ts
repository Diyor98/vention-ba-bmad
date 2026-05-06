'use server';

import { revalidatePath } from 'next/cache';
import { requireSession, requireRole, AuthError } from '@/lib/auth/guards';
import { createDeskSchema } from '@/lib/validation/desk';
import { createDesk } from '@/db/queries/desks';
import { getSpaceById } from '@/db/queries/spaces';
import { logger } from '@/lib/logger';

export type CreateDeskActionState =
  | { status: 'idle' }
  | { status: 'error'; code: 'UNAUTHORIZED'; message: string }
  | { status: 'error'; code: 'FORBIDDEN'; message: string }
  | { status: 'error'; code: 'NOT_FOUND'; message: string }
  | { status: 'error'; code: 'VALIDATION_ERROR'; fields: Record<string, string> }
  | { status: 'error'; code: 'DUPLICATE_LABEL'; message: string }
  | { status: 'error'; code: 'INTERNAL_ERROR'; message: string };

const initialIdle: CreateDeskActionState = { status: 'idle' };

export async function createDeskAction(
  spaceId: string,
  _prevState: CreateDeskActionState,
  formData: FormData,
): Promise<CreateDeskActionState> {
  // Layout already runs the guard for the page render, but the Server Action
  // is hit independently by the form post — re-check at this boundary.
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

  // Pre-existence check defends against a stale bound id (e.g. parent space
  // deleted via a future Phase 2 admin tool).
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
    const msg = err instanceof Error ? err.message : String(err);
    const code = (err as { code?: string }).code;
    // Defensive matcher across pg driver versions: SQLSTATE 23505 + the
    // constraint name + the generic violation text.
    const isUniqueViolation =
      code === '23505' ||
      msg.includes('uniq_desk_label_per_space') ||
      msg.includes('duplicate key value violates unique constraint');
    if (isUniqueViolation) {
      result = {
        status: 'error',
        code: 'DUPLICATE_LABEL',
        // Verbatim PRD message — do not paraphrase (US-2.3 AC-2).
        message: 'A desk with that label already exists in this space',
      };
    } else {
      logger.error('create_desk_action_db_failed', { error: msg });
      result = {
        status: 'error',
        code: 'INTERNAL_ERROR',
        message: 'Something went wrong. Please try again.',
      };
    }
  }

  if (result) return result;

  // No redirect — user stays on the edit screen; revalidation re-renders the
  // desks list with the new desk and resets the form to idle.
  revalidatePath(`/admin/spaces/${spaceId}`);
  return initialIdle;
}
