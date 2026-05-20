'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireSession, AuthError } from '@/lib/auth/guards';
import { updateUserName } from '@/db/queries/users';
import { logger } from '@/lib/logger';

/**
 * DESIGN-INT-GAPS-PASS-2 Gap 4 — /account Profile tab Save action.
 *
 * Phase 2 scope: only `fullName` is editable. Email lives on the
 * auth identity (changing it is a credential rotation — out of
 * gap scope). Phone + City don't exist in `usersTable` and the
 * Profile tab renders them disabled with a "Coming soon" hint;
 * if a malicious caller still submits them this action silently
 * ignores them (no field-coercion attack surface).
 *
 * State shape mirrors the Story 7-2/7-3 application action: a
 * discriminated union with `idle / success / error` so the
 * client's useActionState + useEffect pattern can reuse the
 * existing state-identity ref guard.
 */

export type UpdateProfileActionState =
  | { status: 'idle' }
  | { status: 'success'; fullName: string }
  | {
      status: 'error';
      code: 'UNAUTHORIZED' | 'VALIDATION_ERROR' | 'INTERNAL_ERROR';
      message: string;
      fields?: Record<string, string>;
    };

const updateProfileSchema = z.object({
  fullName: z
    .string({
      required_error: 'Full name is required',
      invalid_type_error: 'Full name is required',
    })
    .trim()
    .min(1, 'Full name is required')
    .max(120, 'Full name must be at most 120 characters'),
});

export async function updateProfileAction(
  _prevState: UpdateProfileActionState,
  formData: FormData,
): Promise<UpdateProfileActionState> {
  let session;
  try {
    session = await requireSession();
  } catch (err) {
    if (err instanceof AuthError && err.response.status === 401) {
      return {
        status: 'error',
        code: 'UNAUTHORIZED',
        message: 'You need to be signed in to update your profile.',
      };
    }
    logger.error('update_profile_action_auth_failed', { error: String(err) });
    return {
      status: 'error',
      code: 'INTERNAL_ERROR',
      message: 'Something went wrong. Try again in a moment.',
    };
  }

  const parsed = updateProfileSchema.safeParse({
    fullName: formData.get('fullName'),
  });
  if (!parsed.success) {
    const fields: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? '');
      if (key && !fields[key]) fields[key] = issue.message;
    }
    return {
      status: 'error',
      code: 'VALIDATION_ERROR',
      message: 'Please correct the highlighted fields.',
      fields,
    };
  }

  try {
    const updated = await updateUserName(
      String(session.user.id),
      parsed.data.fullName,
    );
    if (!updated) {
      // Session existed but user row vanished — should never happen.
      return {
        status: 'error',
        code: 'INTERNAL_ERROR',
        message: 'Your account could not be located. Please sign in again.',
      };
    }
    revalidatePath('/account');
    return { status: 'success', fullName: updated.fullName };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error('update_profile_action_db_failed', { error: msg });
    return {
      status: 'error',
      code: 'INTERNAL_ERROR',
      message: 'Something went wrong saving your profile. Try again.',
    };
  }
}
