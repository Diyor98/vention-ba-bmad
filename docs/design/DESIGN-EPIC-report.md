# DESIGN-EPIC Final Report

Generated 2026-05-19. Multi-session epic — this report captures session 1's state and the deferred backlog for session 2+.

## Shipped this session (4 commits on origin/main)

| Hash | Commit | Phase |
|---|---|---|
| `c436ff9` | feat(design): swap to designer tokens + Phase 2 patterns (DESIGN-1) | Phase 1 |
| `c005f70` | chore(design): import designer Phase 2 design package | Phase 1 (support) |
| `dfe7247` | feat(amenities): schema + form + display (DESIGN-2) | Phase 2 |
| `9e0d651` | feat(design): reskin landing page (DESIGN-3) | Phase 3 |

## What got built

### Phase 0 — Inventory
- Wrote `docs/design/DESIGN-EPIC-inventory.md` mapping current routes/components to mockups + gap analysis for each DESIGN-N.

### Phase 1 — Token swap (DESIGN-1)
- `@theme` block in `globals.css` already matched the designer's `globals.css` from Story 5-1; no changes needed there.
- **Added** all `phase2.css` patterns to `globals.css` (~600 lines): `.owner-subnav`, `.mode-pill.mode-host`, `.menu-pill` + `.menu` + `.menu-item`, `.stat-grid` + `.stat-card`, `.section-h`, `.banner` + variants, `.connect-card` + `.connect-step`, `.modal-scrim` + `.modal` + `.refund-rows`, `.toast-stack` + `.toast`, `.cta-bar`, `.value-grid` + `.value-tile`, `.process` + `.process-step`, `.host-hero`, `.split`, `.app-grid` + `.app-field`, `.summary-card` + `.summary-rows` + `.summary-total`, `.btn-pay`, `.email-canvas` + `.email-*`, `.policy-line`, `.av-sm`.
- **Added forward-looking** `.amenities-grid` / `.amenity-check` / `.amenity-display` / `.amenity-tile` / `.amenity-empty` for DESIGN-2 to consume.
- Imported the canonical design package + 3 sibling version folders (v2/v3/v4) into repo for traceability.

### Phase 2 — Amenities (DESIGN-2)
- 16-slug closed enum `AMENITY_SLUGS` in `src/db/schema.ts`; `spaces.amenities text[] NOT NULL DEFAULT '{}'` column; subset CHECK constraint pinning the canonical set.
- Migration `0008_kind_omega_sentinel.sql` generated + applied.
- `src/components/amenities.tsx`:
  - `AMENITY_DEFINITIONS` (slug + label + Lucide icon, locked per epic spec).
  - `<AmenitiesForm>` — checkbox-pill grid, `:has(input:checked)` active state, optional `defaultSelected` + `inputName` + `disabled` props.
  - `<AmenitiesDisplay>` — read-only icon grid in canonical order; dashed-border empty state.
- 11 new unit tests in `src/components/amenities.test.tsx`.
- Wired into:
  - `src/app/admin/spaces/new/create-space-form.tsx` (used by both `/admin/spaces/new` and `/owner/spaces/new`).
  - `src/app/admin/spaces/[id]/edit-space-form.tsx` (used by both `/admin/spaces/[id]` and `/owner/spaces/[id]`).
  - `src/app/spaces/[id]/page.tsx` — public Amenities section beneath About.
- Validation, Server Action, and DB-query layers extended to pass `amenities` through.
- Seed:
  - Added 3 admin-owned demo spaces (Almaty / Bishkek / Samarkand) so all 16 amenities are covered across fixtures.
  - `backfillSeededAmenities()` runs on every seed and re-applies the locked amenity sets to all 4 fixture spaces (so the migration's `'{}'` default doesn't leak past first seed).
  - Module-load assertion verifies every canonical slug appears in at least one seed fixture.
- Added `lucide-react@1.16.0` dependency.

### Phase 3 — DESIGN-3 (landing)
- Replaced the simple H1+sub with a display-sized hero ("Find a desk. Book a day. Get to work.") + explanatory subtitle.
- Search row widened to 36rem max + taller (44px) input to match the mockup's `.search-wrap` spec.
- Card grid + `DataView` preserved — already matched `.card-link` + `.card` from shared.css.

## Deferred backlog (19 commits — next session)

| ID | Mockup | Route | Major needs (from inventory) |
|---|---|---|---|
| DESIGN-4 | 02-space-detail | `spaces/[id]/page.tsx` | Amenities display already landed in DESIGN-2. **Hero img, date-callout, desk-row already match.** Likely a small polish-only commit verifying alignment + any minor copy/spacing tweaks. |
| DESIGN-5 | 03-register | `(public)/register/page.tsx` | `.auth-card` already in use from 5-1. Likely already aligned — polish commit. |
| DESIGN-6 | 04-login | `(public)/login/page.tsx` | `.auth-card` already in use from 5-1. Likely already aligned — polish commit. |
| DESIGN-7 | 05-my-bookings | `my-bookings/page.tsx` | `.booking` card + section-head already in use. Add `.policy-line` for the cancel-policy callout (24h cutoff messaging). |
| DESIGN-8 | 06-admin-spaces | `admin/spaces/page.tsx` | `.admin-page-head`, `.admin-toolbar`, `.search`, `.chip`, `.table` — most already from 5-2; verify + add `.search` input if missing. |
| DESIGN-9 | 07-admin-space-edit | `admin/spaces/[id]/page.tsx` | `.form-card`, `.form-grid`, `.desk-admin-row`, `.add-desk-row`, `.toggle`, `.save-bar`, `.meta-strip`, `.crumbs` — verify. Amenities form already wired in DESIGN-2. |
| DESIGN-10 | 08-admin-bookings | `admin/bookings/page.tsx` | `.table`, `.cell-primary`, `.cell-stack`, `.avatar-xs`, `.btn-xs.btn-confirm`, `.btn-xs.btn-reject` — verify. |
| DESIGN-11 | p2-01-become-a-host | `become-a-host/page.tsx` | **Substantial reskin needed:** `.host-hero` (eyebrow + display H1 + sub), `.value-grid` + `.value-tile` (4 value props), `.process` + `.process-step` timeline, `.split` + `.split-aside` two-column layout, `.cta-bar` (sticky bottom). |
| DESIGN-12 | p2-02-admin-applications | `admin/applications/page.tsx` | `.admin-toolbar`, `.chip`, `.table`, `.avatar-xs` — verify. Application status badges reuse `.badge-{pending,confirmed,rejected}`. |
| DESIGN-13 | p2-03-admin-application-detail | `admin/applications/[id]/page.tsx` | `.app-grid` + `.app-field`, `.modal` (reject modal already uses `<dialog>` from 7-4 — may need restyle to `.modal` shape). |
| DESIGN-14 | p2-04-owner-dashboard | `(owner)/owner/page.tsx` | **Substantial reskin:** `.owner-subnav`, `.stat-grid` + `.stat-card` (with `.is-attention` for Stripe-onboarding-pending state), `.banner` (Stripe onboarding pending banner), `.section-h`. |
| DESIGN-15 | p2-05-owner-spaces | `(owner)/owner/spaces/page.tsx` | `.owner-subnav`, `.admin-toolbar`, `.table` (with draft-vs-published cell variants). |
| DESIGN-16 | p2-06-owner-bookings | `(owner)/owner/bookings/page.tsx` | `.owner-subnav`, `.table`, confirm/reject inline `.btn-xs`. |
| DESIGN-17 | p2-08-owner-settings | `(owner)/owner/settings/page.tsx` | **Substantial reskin:** `.connect-card` + `.connect-step` (3-step Connect status: onboarding / charges / payouts). Active states show ✓ marks. |
| DESIGN-18 | p2-12-header-variants | `components/header.tsx` | Header variants by role: GUEST (no pill), SUPER_ADMIN (black `.mode-pill`), SPACE_OWNER-Hosting (indigo `.mode-pill.mode-host`), Guest-with-OwnerCapable (mode switch via `.menu-pill`). |
| DESIGN-19 | p2-07-owner-payouts | `(owner)/owner/payouts/page.tsx` | `.owner-subnav`, `.stat-card`, `.table`. **Preserve 9-7 logic.** |
| DESIGN-20 | p2-09-space-detail-payment | `spaces/[id]/page.tsx` (extend DESIGN-4) | `.summary-card` + `.summary-rows` + `.summary-total` + `.summary-foot` (lock icon), `.btn-pay`. **Preserve 9-3 Stripe Checkout.** |
| DESIGN-21 | p2-10-my-bookings-cancel | `my-bookings/page.tsx` (extend DESIGN-7) | `.modal-scrim` + `.modal` + `.refund-rows`, `.policy-line.warn` (24h cutoff). **Preserve 9-6 refund logic.** |
| DESIGN-22 | p2-11-email-template | `deskhive/src/lib/email-templates/*.ts` (8-1/8-2/8-3 only) | Visual restyle of email body HTML to mirror designer's `.email-{head,body,receipt,cta,foot}` patterns. **SKIP Story 8-4 templates** (paused mid-walk per sprint-status). |
| Phase 6 | — | — | Full `pnpm test:e2e` + regression sweep + `DESIGN-FIX` commit if needed + final report append. |

## Judgment calls captured (so far)

1. **`:has(input:checked)` CSS in amenity form** — accepted per brief's "browser native" precedent (Chrome/Safari/FF support since late 2023).
2. **`--font-sans` keeps the `var(--font-inter)` prefix** rather than reverting to designer's bare `"Inter"` string — preserves the Phase 1 next/font/google loading optimization. Designer's fallback chain is identical after the prefix.
3. **AmenitiesDisplay renders in canonical order** regardless of caller order — keeps UI stable since the `text[]` column is unordered.
4. **3 admin-owned seed spaces** added beyond the existing single owner-seeded space — required to cover all 16 amenity slugs ≥1 time per spec. Cities chosen (Almaty/Bishkek/Samarkand) match the seeded owner's Tashkent regional theme.
5. **Amenities CSS landed in DESIGN-1** (token swap) rather than DESIGN-2 (feature commit) — keeps the schema/component/wiring commit focused; the design-token surface is the more natural home for the styling.
6. **Landing page deferred per-card amenity preview + rating + spots-left** — those data points don't exist in the schema today; out-of-scope for "reskin only." Marketing-flair "mood themes" from the mockup also dropped (designer's preview tooling, not production app).
7. **Designer v1 folder deleted from disk** — stale; v2/v3/v4 + canonical kept for traceability. Deletion staged into DESIGN-2 as housekeeping.

## Hard constraints honored

- Story 8-4 sprint-status row untouched (still `review`, with the paused-mid-walk note from commit `8359970`).
- Story 8-4 email template content untouched.
- No Stripe SDK / webhook / payment / refund / payout LOGIC modified (those pages haven't been touched yet — DESIGN-19/20/21 will be visual-only when reached).
- No email sending logic / Resend API modified.
- No `.env.local` writes.
- `data-testid` attributes preserved on amenity components + added new testids per new test surface.
- Sequential commit + push per phase. No `--amend`.

## Verification snapshot (post-DESIGN-3)

- `pnpm typecheck` — clean.
- `pnpm lint` — clean.
- `pnpm build` — 42 routes (unchanged from pre-epic baseline; amenities feature adds no new pages).
- `pnpm test --run` — **437 passing + 1 skipped = 438** (was 425; +12 from DESIGN-2 amenity tests + bookings.test.ts type fixup).
- `pnpm test:e2e` — **not run this session** (pending in Phase 6).
- `pnpm db:seed` — idempotent + applies amenity backfill on every run.

## Open BA questions

1. **Hero copy on landing** — committed copy is "Find a desk. Book a day. Get to work." which echoes the brief but is slightly heroified beyond the original. Worth a BA pass to confirm voice.
2. **DESIGN-22 email restyle scope** — should the restyle re-render via the existing `renderBaseTemplate` wrapper (changing the wrapper itself), or per-template HTML edits, or both? Recommend wrapper-rewrite (Story 8-POLISH-1 precedent) — single point of change.
3. **Amenity icon ambiguities** — `standing_desks` and `monitors` both map to Lucide's `Monitor` icon per spec. Acceptable for MVP but worth noting for designer review (might want `ChevronUp` for standing desks).
4. **Per-amenity translations / localization** — labels are English-only per brief; out of scope for this epic.

## Resume notes for session 2

- Resume at DESIGN-4 (space-detail polish) — page is largely aligned; quick verification commit is the right scope.
- Pages with substantial visual work ahead: DESIGN-11 (become-a-host), DESIGN-14 (owner dashboard), DESIGN-17 (owner settings).
- DESIGN-19/20/21 require the "visual only — preserve logic" discipline; the underlying actions/handlers must not change.
- DESIGN-22 must skip the 3 paused 8-4 template files (`payment-receipt.ts`, `payment-refund.ts`, `payout-summary.ts`).
- Phase 6 = full E2E run + regression sweep + optional `DESIGN-FIX` commit + report append.
