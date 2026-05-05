'use server';

import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth/config';
import { registerSchema } from '@/lib/validation/auth';
import { logger } from '@/lib/logger';

export type RegisterActionState =
  | { status: 'idle' }
  | { status: 'error'; code: 'VALIDATION_ERROR'; fields: Record<string, string> }
  | { status: 'error'; code: 'EMAIL_ALREADY_EXISTS'; message: string }
  | { status: 'error'; code: 'INTERNAL_ERROR'; message: string };

export async function registerAction(
  _prevState: RegisterActionState,
  formData: FormData,
): Promise<RegisterActionState> {
  const parsed = registerSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
    fullName: formData.get('fullName'),
  });

  if (!parsed.success) {
    const fields: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? '');
      if (key && !fields[key]) fields[key] = issue.message;
    }
    return { status: 'error', code: 'VALIDATION_ERROR', fields };
  }

  let result: RegisterActionState | null = null;
  try {
    await auth.api.signUpEmail({
      body: {
        email: parsed.data.email,
        password: parsed.data.password,
        // Better Auth's `user.fields.name = 'fullName'` config routes this
        // to our `fullName` property → DB column `full_name`.
        name: parsed.data.fullName,
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (
      msg.includes('already exists') ||
      msg.includes('USER_ALREADY_EXISTS') ||
      msg.includes('UNIQUE constraint') ||
      msg.includes('users_email_unique')
    ) {
      result = {
        status: 'error',
        code: 'EMAIL_ALREADY_EXISTS',
        message: 'An account with this email already exists',
      };
    } else {
      logger.error('register_action_failed', { error: msg });
      result = {
        status: 'error',
        code: 'INTERNAL_ERROR',
        message: 'Something went wrong. Please try again.',
      };
    }
  }

  if (result) return result;

  // redirect() throws a Next.js redirect signal; useActionState never sees a
  // success branch — the page navigates. Placed AFTER the try/catch so the
  // catch doesn't swallow the redirect signal.
  redirect('/');
}
