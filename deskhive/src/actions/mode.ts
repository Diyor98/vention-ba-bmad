'use server';

import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { requireSession, AuthError } from '@/lib/auth/guards';
import {
  MODE_COOKIE_NAME,
  MODE_VALUES,
  SWITCH_MODE_MESSAGES,
  type Mode,
} from '@/lib/mode';
import { logger } from '@/lib/logger';

/**
 * Story 7-1: switchModeAction toggles the deskhive_mode session cookie.
 *
 * Role gate: only SPACE_OWNER may switch to Host mode. SUPER_ADMIN is
 * intentionally NOT allowed (BA Decision §3 — admins use the existing
 * /admin/* chrome; Host mode would be a parallel and confusing surface).
 * Switching TO Guest mode is always allowed for any authenticated user.
 *
 * Cookie attributes match BA Decision §2 + §4:
 *   HttpOnly + SameSite=Lax + Secure-in-prod, path='/', no maxAge
 *   (session-scoped — cleared on browser close).
 *
 * Surfaced via a small form in the user-pill dropdown (Header). Form has
 * a hidden `targetMode` input whose value is 'guest' or 'host'.
 */

export type SwitchModeActionState =
  | { status: 'idle' }
  | { status: 'success' }
  | {
      status: 'error';
      code: 'UNAUTHORIZED' | 'FORBIDDEN' | 'INVALID_TARGET' | 'INTERNAL_ERROR';
      message: string;
    };

function isMode(value: unknown): value is Mode {
  return (
    typeof value === 'string' && (MODE_VALUES as readonly string[]).includes(value)
  );
}

export async function switchModeAction(
  _prevState: SwitchModeActionState,
  formData: FormData,
): Promise<SwitchModeActionState> {
  // 1. Auth: must be logged in. Server Action returns error state — the
  //    parent form lives in the Header dropdown which is only rendered
  //    for logged-in users; the redirect-to-login case shouldn't fire in
  //    practice, but defense-in-depth.
  let session;
  try {
    session = await requireSession();
  } catch (err) {
    if (err instanceof AuthError) {
      return {
        status: 'error',
        code: 'UNAUTHORIZED',
        message: SWITCH_MODE_MESSAGES.UNAUTHORIZED,
      };
    }
    logger.error('switch_mode_action_auth_failed', { error: String(err) });
    return {
      status: 'error',
      code: 'INTERNAL_ERROR',
      message: SWITCH_MODE_MESSAGES.INTERNAL_ERROR,
    };
  }

  // 2. Validate targetMode is one of MODE_VALUES.
  const rawTarget = formData.get('targetMode');
  if (!isMode(rawTarget)) {
    return {
      status: 'error',
      code: 'INVALID_TARGET',
      message: SWITCH_MODE_MESSAGES.INVALID_TARGET,
    };
  }

  // 3. Role gate: only SPACE_OWNER may switch TO host. Guest direction is
  //    always allowed (any user can be "in guest mode" — that's the default).
  if (rawTarget === 'host') {
    const role = (session.user as { role?: string }).role;
    if (role !== 'SPACE_OWNER') {
      return {
        status: 'error',
        code: 'FORBIDDEN',
        message: SWITCH_MODE_MESSAGES.FORBIDDEN,
      };
    }
  }

  // 4. Set the cookie. No maxAge — session cookie.
  const store = await cookies();
  store.set(MODE_COOKIE_NAME, rawTarget, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
  });

  // 5. Revalidate the layout so the Header re-renders with the new mode.
  revalidatePath('/', 'layout');

  return { status: 'success' };
}
