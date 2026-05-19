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
// Story 8-3 — booking lifecycle (8 templates).
export { renderBookingRequestedGuest } from './booking-requested-guest';
export { renderBookingRequestedOwner } from './booking-requested-owner';
export { renderBookingConfirmedGuest } from './booking-confirmed-guest';
export { renderBookingConfirmedOwner } from './booking-confirmed-owner';
export { renderBookingRejectedGuest } from './booking-rejected-guest';
export { renderBookingRejectedOwner } from './booking-rejected-owner';
export { renderBookingCancelledGuest } from './booking-cancelled-guest';
export { renderBookingCancelledOwner } from './booking-cancelled-owner';
// Story 8-4 — payment-driven emails (PRD §4.3 rows 12-14).
export { renderPaymentReceipt } from './payment-receipt';
export { renderPaymentRefund } from './payment-refund';
export { renderPayoutSummary } from './payout-summary';
export { renderTestTemplate } from './test';
