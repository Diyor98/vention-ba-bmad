/**
 * Story 7-PREP-1: fixture barrel — specs import { test, expect } from
 * '../fixtures' to get the extended `test` with `authenticatedPage`.
 */

export { test, expect } from './authenticated-page';
export {
  SEED_CREDENTIALS,
  ROLE_EMAIL,
  resolveEmail,
  createSessionCookies,
  type SeedEmail,
  type AuthRole,
  type PlaywrightCookie,
} from './auth-helpers';
export {
  getSeededOwnerSpaceId,
  getSeededUserId,
  getApplicationIdByEmailAndStatus,
  getSeededUserRole,
} from './seed-helpers';
export {
  readRecordedEmails,
  truncateRecordedEmails,
  deleteRecordedEmailsFile,
  type EmailRecord,
} from './email-helpers';
