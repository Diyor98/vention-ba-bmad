/**
 * Story 8-2: per-template render barrel. email.ts::renderTemplate
 * dispatches to these by template name. Each render function returns
 * { bodyHtml, previewText } — the subject lives in email.ts::Subjects,
 * and the wrapping in renderBaseTemplate happens inside sendEmail.
 *
 * Stories 8-3 / 8-4 add new render functions alongside these and extend
 * the barrel.
 */

export { renderApplicationReceived } from './application-received';
export { renderApplicationApproved } from './application-approved';
export { renderApplicationRejected } from './application-rejected';
export { renderTestTemplate } from './test';
