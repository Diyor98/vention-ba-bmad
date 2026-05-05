export type ApiErrorBody = {
  error: string;
  code: string;
  fields?: Record<string, string | string[]>;
};

export function apiError(
  code: string,
  message: string,
  status: number,
  extras?: { fields?: Record<string, string | string[]> },
): Response {
  const body: ApiErrorBody = { error: message, code };
  if (extras?.fields) body.fields = extras.fields;
  return Response.json(body, { status });
}

export const apiUnauthorized = () =>
  apiError('UNAUTHORIZED', 'Authentication required', 401);

export const apiForbidden = (message = 'Forbidden') =>
  apiError('FORBIDDEN', message, 403);

export const apiNotFound = (message = 'Not found') =>
  apiError('NOT_FOUND', message, 404);

export const apiValidationError = (
  fields: Record<string, string | string[]>,
) => apiError('VALIDATION_ERROR', 'Validation failed', 400, { fields });

export const apiConflict = (code: string, message: string) =>
  apiError(code, message, 409);

export const apiInternalError = () =>
  apiError('INTERNAL_ERROR', 'Something went wrong', 500);
