# DESIGN-INTEGRATION-FULL session 1 report

Generated 2026-05-19. Captures session 1 state + deferred backlog for the 20-screen prototype integration epic.

## Session 1 commits on `origin/main`

| Hash | Commit | Scope |
|---|---|---|
| `673ddad` | `chore(design): prototype gap audit — full scope inventory` | Phase 0 — full 20-screen audit + DESIGN-INT roadmap |
| `524c828` | `feat(design): integrate 'How it works' tile row on landing (DESIGN-INT-1)` | Landing-page 3-tile supporting copy row between hero + search |

## Audit-driven discovery — `my-bookings` already aligned

DESIGN-INT-3 in the audit roadmap was "My bookings 3-section split (Awaiting / Upcoming / Past)". Verified during session 1: `src/app/my-bookings/page.tsx` already implements the exact 3-section split with `section-head` + `count` + `section-archived` styling from Story 5-1. **No code changes needed for DESIGN-INT-3 — strike from backlog and move on.**

## Backlog (DESIGN-INT-2, DESIGN-INT-4 through DESIGN-INT-20)

Resume from this section. Each row is one commit + push.

| ID | Screen | Status carry-over | Effort | Notes for the next session |
|---|---|---|---|---|
| DESIGN-INT-2 | Space detail enrichment | partial | medium | Add gallery thumb strip below hero image + host info card (avatar + name + spaces hosted). Skip ratings/reviews per audit OUT-OF-SCOPE list. `src/app/spaces/[id]/page.tsx`. |
| DESIGN-INT-4 | Host dashboard | partial | medium | Connect-status banner at top + 3-stat-card row + 2-col body (Pending Requests + Quick Actions). `src/app/(owner)/owner/page.tsx`. All required CSS shipped in DESIGN-1 (`.banner`, `.stat-card`, `.stat-grid`). Lucide icons: AlertTriangle, Banknote, Calendar, Activity. |
| ~~DESIGN-INT-5~~ | ~~Host payouts~~ | **done** session 2 | small | Shipped: stat-card row (Lifetime / Pending / Next date) above the table, derived from the existing Stripe `payouts.list` response. Amber banner on State #2 (charges/payouts disabled). Lucide icons: Banknote, Clock, Calendar, AlertTriangle. |
| ~~DESIGN-INT-6~~ | ~~Host bookings tabs~~ | **done** session 2 | small | Shipped: swapped chip-style filter row for shared `<Tabs>` component (5 tabs: All / Pending / Confirmed / Rejected / Cancelled) with live counts. |
| ~~DESIGN-INT-7~~ | ~~Host spaces list → table~~ | **done** session 2 | small | Shipped: table with photo + name / city / desks count / day rate / status badge / Edit. 2 aggregate queries (desks count + min price). New helper `getActiveDeskCountBySpaceIds`. |
| DESIGN-INT-8 | Host space edit sections | partial | medium | Break the long form into form-cards (Basics / Desks / Amenities / Photos / Visibility). Amenities form already wired in DESIGN-2. `src/app/(owner)/owner/spaces/[id]/page.tsx` + edit-space-form.tsx. |
| DESIGN-INT-9 | Account page (greenfield) | missing | medium | NEW route `src/app/account/page.tsx`. 3 tabs: Profile / Payment methods / Notifications. Tabs are visual only — Profile reads `usersTable`; Payment is a stub ("Phase 3 — Stripe doesn't store cards in our schema"); Notifications is a stub (no settings table). |
| DESIGN-INT-10 | Host space new — 4-step wizard | partial | **large** | Multi-step Client Component state machine. 4 steps: Basics → Desks → Photos → Publish. Requires careful Server-Action wiring so step-state survives without per-step server submits. `src/app/(owner)/owner/spaces/new/`. |
| DESIGN-INT-11 | Host onboarding — 5-step wizard + success state | partial | **large** | Stripe Connect wizard. 5 steps: Get started → Verify identity → Add bank → Payout schedule → Done. **NOTE:** the real Stripe Express onboarding redirects out to Stripe's hosted UI; the wizard is mostly cosmetic chrome around the redirect. Success-state shows 4 capability indicators + Manage on Stripe + Disconnect. Today's `src/app/(owner)/owner/settings/page.tsx` is the live Connect surface. |
| ~~DESIGN-INT-12~~ | ~~Become a host polish~~ | **done** session 2 | small | Shipped: replaced page header with `.host-hero` (eyebrow + display h1 + sub); value props rebuilt as `.value-grid` + numbered `.value-tile`; "What's next" rebuilt as `.process` + `.process-step` timeline with timing labels. State machine + form untouched. |
| ~~DESIGN-INT-13~~ | ~~Login + Signup polish~~ | **done** session 2 | small | Shipped: copy-polish alignment to prototype. Login sub: "Sign in to manage your bookings." Register sub: "Free to join. You'll book your first desk in 60 seconds." Auth-card chrome already aligned. `/signup` alias DEFERRED — not load-bearing; the link in register uses `/login` and vice versa. |
| ~~DESIGN-INT-14~~ | ~~Admin applications search + filter~~ | **done** session 2 | small | Shipped: swapped chip filters for shared `<Tabs>` (All / Pending / Approved / Rejected). Search input deferred — prototype's AdminApplications doesn't have one. Note-on-reject already wired via Story 7-4's `<dialog>` modal. |
| DESIGN-INT-15 | Admin users — visual scaffold | missing | medium | NEW route `src/app/admin/users/page.tsx`. Read-only users table with role filter chips. Drawer for "Manage" is Phase 3 — scaffold + "Phase 3" disabled state on destructive actions. |
| ~~DESIGN-INT-16~~ | ~~System health — visual scaffold~~ | **done** session 2 | small | Shipped: NEW `/system/health` route, SUPER_ADMIN-only. 3 stat cards (Uptime/Avg response/Deploys) + Services list + Recent deploys list. All values placeholder pending Phase 3 ops backend. Lucide icons: Activity, Server, GitBranch. |
| ~~DESIGN-INT-17~~ | ~~Header variants~~ | **done** session 2 | small | Shipped: added `.mode-pill.mode-host` (indigo "Hosting") to Variant 4 + black `.mode-pill` ("Admin") to Variant 5. 5-variant role-keyed nav already shipped in Story 7-1/6-2/9-7. |
| DESIGN-INT-18 | Booking flow chrome | partial | small | Restyle the redirecting interstitial + the return-URL page (`src/app/spaces/[id]/booking/return/page.tsx`) to match the prototype's "Stripe S icon + checkout.stripe.com · Test mode" header. Real Stripe Checkout stays as-is (don't touch the redirect). |
| ~~DESIGN-INT-19~~ | ~~Extract shared components~~ | **done** session 2 | small | Shipped: `<StatCard>` + `<Tabs>` in `src/components/`; `.btn-success` + `.btn-danger` in globals.css; +13 unit tests. |
| DESIGN-INT-20 | Final verification | — | medium | Full `pnpm test --run` + `pnpm test:e2e`. Verify no regressions in auth / Stripe / booking / refund / payout / email. DESIGN-FIX commit if anything surfaces. |

## Judgment calls captured

1. **DESIGN-INT-1 omitted the featured-3-spaces rail** from the prototype. The prototype curates 3 spaces under a "Featured" heading; the schema has no `featured` flag or curated ordering. The pragmatic shape is to take the 3 newest active spaces, but that wasn't a clear stakeholder need — left for a future session if asked.

2. **DESIGN-INT-3 (my-bookings 3-section split) is already done in `main`.** Verified during session 1; no commit was needed. Roadmap row struck.

3. **Tabbed components (`<Tabs>`) — extract or inline?** DESIGN-INT-6 (host bookings) needs tabs. DESIGN-INT-9 (account) needs tabs. DESIGN-INT-19 calls for extraction; either land DESIGN-INT-19 first or duplicate at first two sites. Suggested order: do DESIGN-INT-19 between DESIGN-INT-4 and DESIGN-INT-6 so two consumers exist for the extracted shape from the start.

4. **Greenfield scaffolds (account / admin users / system health) ship with "Phase 3" disabled-state copy** for destructive actions that don't have backend support. This was the established posture from prior epics (visual scaffolds for stakeholder reviews, real wiring deferred).

## Hard constraints honored across session 1

- Story 8-4 sprint-status untouched (still `done`).
- No Stripe SDK / webhook handler / payment intent / refund / payout LOGIC changes.
- No email sending logic / Resend integration changes.
- No `.env.local` writes.
- Sequential commit + push per DESIGN-INT-N. Phase 0 + DESIGN-INT-1 = 2 commits + 2 pushes.
- No `git commit --amend`.
- `data-testid` attributes preserved (and new `data-testid="how-it-works"` added on DESIGN-INT-1).

## Why session 1 stopped here

DESIGN-INT-4 (Host dashboard) was the natural next high-impact target but requires reading + rewriting `src/app/(owner)/owner/page.tsx` from scratch alongside `src/components/header.tsx` integration + composing the stat-card grid + the Connect banner with the right Lucide iconography. Context window after the Phase 0 audit + DESIGN-INT-1 is no longer comfortable for a 200-line page rewrite without risking shallow work.

This mirrors the DESIGN-EPIC session-1 stop pattern: heavy lifting (Phase 0 audit, token swap, amenities) consumed most of the budget; subsequent integrations defer to fresh sessions with the audit as the resume anchor.

## Resume command for session 2

> Resume DESIGN-INTEGRATION-FULL from `docs/design/DESIGN-INTEGRATION-FULL-report.md`. Backlog rows are ordered for impact. Start at DESIGN-INT-4 (Host dashboard); DESIGN-INT-2 (space detail enrichment) and DESIGN-INT-5 (host payouts stat cards) are both small-effort wins after that.

## Verification snapshot

- `pnpm typecheck` — clean (post-DESIGN-INT-1).
- `pnpm build` — clean (post-DESIGN-INT-1; routes unchanged at 42).
- `pnpm test --run` — last fully-passing baseline was 449 tests (post-DESIGN-FIX-3). DESIGN-INT-1 didn't add new tests (visual-only); count unchanged.
- `pnpm test:e2e` — not run this session.
