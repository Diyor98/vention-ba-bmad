import { requireSession, requireRole, AuthError } from '@/lib/auth/guards';
import { editDeskSchema } from '@/lib/validation/desk';
import { getDeskById, updateDesk } from '@/db/queries/desks';
import { isPgUniqueViolation } from '@/lib/db-errors';
import { apiError, apiValidationError, apiNotFound } from '@/lib/http';
import { logger } from '@/lib/logger';

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id: deskId } = await params;

  try {
    const session = await requireSession();
    requireRole(session, 'SUPER_ADMIN');
  } catch (err) {
    if (err instanceof AuthError) return err.response;
    logger.error('edit_desk_route_auth_failed', { error: String(err) });
    return apiError('INTERNAL_ERROR', 'Something went wrong', 500);
  }

  const existing = await getDeskById(deskId);
  if (!existing) return apiNotFound('Desk not found');

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return apiError('INVALID_JSON', 'Request body must be valid JSON', 400);
  }

  // REST clients send JSON, so isActive arrives as a real boolean — no
  // FormData conversion needed in this code path.
  const parsed = editDeskSchema.safeParse(body);
  if (!parsed.success) {
    const fields: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? '');
      if (key && !fields[key]) fields[key] = issue.message;
    }
    return apiValidationError(fields);
  }

  try {
    const updated = await updateDesk(deskId, parsed.data);
    if (!updated) return apiNotFound('Desk not found');
    return Response.json(updated, { status: 200 });
  } catch (err) {
    if (isPgUniqueViolation(err, 'uniq_desk_label_per_space')) {
      return apiError(
        'DUPLICATE_LABEL',
        'A desk with that label already exists in this space',
        409,
      );
    }
    const msg = err instanceof Error ? err.message : String(err);
    logger.error('edit_desk_route_db_failed', { error: msg });
    return apiError('INTERNAL_ERROR', 'Something went wrong', 500);
  }
}
