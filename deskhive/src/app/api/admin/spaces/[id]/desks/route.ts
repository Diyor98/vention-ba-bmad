import { requireSession, requireRole, AuthError } from '@/lib/auth/guards';
import { createDeskSchema } from '@/lib/validation/desk';
import { createDesk } from '@/db/queries/desks';
import { getSpaceById } from '@/db/queries/spaces';
import { apiError, apiValidationError, apiNotFound } from '@/lib/http';
import { logger } from '@/lib/logger';

// See action's note: Drizzle 0.45 wraps pg errors; walk `err.cause` to find
// the SQLSTATE and the real violation text. Kept identical to the action's
// matcher so behaviour is symmetric across the two callers.
function matchUniqueViolation(err: unknown, depth = 3): boolean {
  if (depth === 0 || !err || typeof err !== 'object') return false;
  const code = (err as { code?: string }).code;
  const msg = (err as { message?: string }).message ?? '';
  if (
    code === '23505' ||
    msg.includes('uniq_desk_label_per_space') ||
    msg.includes('duplicate key value violates unique constraint')
  ) {
    return true;
  }
  return matchUniqueViolation((err as { cause?: unknown }).cause, depth - 1);
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id: spaceId } = await params;

  try {
    const session = await requireSession();
    requireRole(session, 'SUPER_ADMIN');
  } catch (err) {
    if (err instanceof AuthError) return err.response;
    logger.error('create_desk_route_auth_failed', { error: String(err) });
    return apiError('INTERNAL_ERROR', 'Something went wrong', 500);
  }

  const space = await getSpaceById(spaceId);
  if (!space) return apiNotFound('Space not found');

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return apiError('INVALID_JSON', 'Request body must be valid JSON', 400);
  }

  const parsed = createDeskSchema.safeParse(body);
  if (!parsed.success) {
    const fields: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? '');
      if (key && !fields[key]) fields[key] = issue.message;
    }
    return apiValidationError(fields);
  }

  try {
    const row = await createDesk(spaceId, parsed.data);
    return Response.json(row, { status: 201 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (matchUniqueViolation(err)) {
      return apiError(
        'DUPLICATE_LABEL',
        'A desk with that label already exists in this space',
        409,
      );
    }
    logger.error('create_desk_route_db_failed', { error: msg });
    return apiError('INTERNAL_ERROR', 'Something went wrong', 500);
  }
}
