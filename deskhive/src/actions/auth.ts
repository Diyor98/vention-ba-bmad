'use server';

import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { auth } from '@/lib/auth/config';
import { registerSchema, loginSchema } from '@/lib/validation/auth';
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

export type LoginActionState =
  | { status: 'idle' }
  | { status: 'error'; code: 'VALIDATION_ERROR'; fields: Record<string, string> }
  | { status: 'error'; code: 'INVALID_CREDENTIALS'; message: string }
  | { status: 'error'; code: 'INTERNAL_ERROR'; message: string };

export async function loginAction(
  _prevState: LoginActionState,
  formData: FormData,
): Promise<LoginActionState> {
  const parsed = loginSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
  });

  if (!parsed.success) {
    const fields: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? '');
      if (key && !fields[key]) fields[key] = issue.message;
    }
    return { status: 'error', code: 'VALIDATION_ERROR', fields };
  }

  let result: LoginActionState | null = null;
  try {
    await auth.api.signInEmail({
      body: {
        email: parsed.data.email,
        password: parsed.data.password,
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // Collapse all auth-failure shapes to a single generic message
    // (anti-enumeration). Anything else → INTERNAL_ERROR.
    const isAuthFailure =
      msg.includes('Invalid email or password') ||
      msg.includes('INVALID_EMAIL_OR_PASSWORD') ||
      msg.includes('INVALID_CREDENTIALS') ||
      msg.includes('user not found') ||
      msg.includes('USER_NOT_FOUND');
    if (isAuthFailure) {
      result = {
        status: 'error',
        code: 'INVALID_CREDENTIALS',
        message: 'Invalid email or password',
      };
    } else {
      logger.error('login_action_failed', { error: msg });
      result = {
        status: 'error',
        code: 'INTERNAL_ERROR',
        message: 'Something went wrong. Please try again.',
      };
    }
  }

  if (result) return result;
  redirect('/');
}

// Logout is best-effort and always-succeeds from the user's perspective
// (AC-8). Any signOut error is logged for debuggability but never surfaced;
// we redirect to / regardless. No useActionState / no return shape — the
// page navigates and the form never sees a "result".
export async function logoutAction(): Promise<void> {
  try {
    await auth.api.signOut({ headers: await headers() });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error('logout_action_failed', { error: msg });
  }
  redirect('/');
}
