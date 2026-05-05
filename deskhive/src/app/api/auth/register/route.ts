import { auth } from '@/lib/auth/config';
import { registerSchema } from '@/lib/validation/auth';
import { apiError, apiValidationError, apiConflict } from '@/lib/http';
import { logger } from '@/lib/logger';

export async function POST(req: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return apiError('INVALID_JSON', 'Request body must be valid JSON', 400);
  }

  const parsed = registerSchema.safeParse(body);
  if (!parsed.success) {
    const fields: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? '');
      if (key && !fields[key]) fields[key] = issue.message;
    }
    return apiValidationError(fields);
  }

  try {
    const result = await auth.api.signUpEmail({
      body: {
        email: parsed.data.email,
        password: parsed.data.password,
        // Better Auth's `user.fields.name = 'fullName'` config routes this
        // to our `fullName` property → DB column `full_name`.
        name: parsed.data.fullName,
      },
      asResponse: false,
    });
    return Response.json(result, { status: 201 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (
      msg.includes('already exists') ||
      msg.includes('USER_ALREADY_EXISTS') ||
      msg.includes('UNIQUE constraint') ||
      msg.includes('users_email_unique')
    ) {
      return apiConflict(
        'EMAIL_ALREADY_EXISTS',
        'An account with this email already exists',
      );
    }
    logger.error('register_route_failed', { error: msg });
    return apiError('INTERNAL_ERROR', 'Something went wrong', 500);
  }
}
