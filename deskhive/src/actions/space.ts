'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { requireSession, requireRole, AuthError } from '@/lib/auth/guards';
import { createSpaceSchema } from '@/lib/validation/space';
import { createSpace } from '@/db/queries/spaces';
import { logger } from '@/lib/logger';

export type CreateSpaceActionState =
  | { status: 'idle' }
  | { status: 'error'; code: 'UNAUTHORIZED'; message: string }
  | { status: 'error'; code: 'FORBIDDEN'; message: string }
  | { status: 'error'; code: 'VALIDATION_ERROR'; fields: Record<string, string> }
  | { status: 'error'; code: 'INTERNAL_ERROR'; message: string };

export async function createSpaceAction(
  _prevState: CreateSpaceActionState,
  formData: FormData,
): Promise<CreateSpaceActionState> {
  // Layer 2: route-level auth check (middleware does Layer 1 cookie presence).
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

  let result: CreateSpaceActionState | null = null;
  try {
    await createSpace(parsed.data);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error('create_space_action_db_failed', { error: msg });
    result = {
      status: 'error',
      code: 'INTERNAL_ERROR',
      message: 'Something went wrong. Please try again.',
    };
  }

  if (result) return result;

  // Without revalidatePath the redirect lands on a stale list page.
  revalidatePath('/admin/spaces');
  redirect('/admin/spaces');
}
