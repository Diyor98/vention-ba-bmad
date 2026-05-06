import { auth } from '@/lib/auth/config';
import { loginSchema } from '@/lib/validation/auth';
import { apiError, apiValidationError } from '@/lib/http';
import { logger } from '@/lib/logger';

export async function POST(req: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return apiError('INVALID_JSON', 'Request body must be valid JSON', 400);
  }

  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) {
    const fields: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? '');
      if (key && !fields[key]) fields[key] = issue.message;
    }
    return apiValidationError(fields);
  }

  try {
    const result = await auth.api.signInEmail({
      body: {
        email: parsed.data.email,
        password: parsed.data.password,
      },
      asResponse: false,
    });
    return Response.json(result, { status: 200 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const isAuthFailure =
      msg.includes('Invalid email or password') ||
      msg.includes('INVALID_EMAIL_OR_PASSWORD') ||
      msg.includes('INVALID_CREDENTIALS') ||
      msg.includes('user not found') ||
      msg.includes('USER_NOT_FOUND');
    if (isAuthFailure) {
      return apiError('INVALID_CREDENTIALS', 'Invalid email or password', 401);
    }
    logger.error('login_route_failed', { error: msg });
    return apiError('INTERNAL_ERROR', 'Something went wrong', 500);
  }
}
