# DESIGN-EPIC Inventory (Phase 0)

Generated 2026-05-19. Read-only pass — no code changes in this phase.

Canonical design package: `docs/design/DeskHive - Coworking Space Booking Web App/` (unversioned, dated 2026-05-19). v2/v3/v4 sibling folders ignored per epic spec.

## Design package contents

- `brief.txt` — designer's narrative (Phase 1; Phase 2 themes mostly carry forward visually)
- `globals.css` — Tailwind v4 `@theme` block (tokens only): brand indigo `#4F46E5`, neutral zinc scale, 4 status palettes, Inter font-stack, 4px spacing base, layout containers 72rem/36rem, radii 2/4/6/8/12/16px, whisper shadows
- `screens/shared.css` — base components: `.btn` / `.btn-primary` / `.btn-secondary` / `.btn-ghost` / `.input` / `.field-*` / `.badge-{pending,confirmed,rejected,cancelled}` / `.avail-yes/no` / `.card` / `.site-header` / `.site-footer` / `.logo-mark` (clip-path hexagon) / `.user-pill` / `.user-avatar` / `.page-h1` / `.page-display` / `.h2` / `.muted`
- `screens/admin.css` — admin patterns: `.mode-pill` (admin black) / `.admin-subnav` / `.admin-tab` / `.admin-page` / `.admin-toolbar` / `.search` / `.chip` / `.select` / `.table` / `.table-wrap` / `.table-footer` / `.pager-btn` / `.cell-{primary,thumb,stack,id}` / `.avatar-xs` / `.icon-btn` / `.btn-xs.btn-{confirm,reject,neutral}` / `.form-card` / `.form-grid` / `.input-row` / `.toggle` / `.save-bar` / `.desk-admin-row` / `.add-desk-row` / `.meta-strip` / `.crumbs`
- `screens/phase2.css` — Phase 2 patterns: `.mode-pill.mode-host` (indigo) / `.owner-subnav` (mirrors admin-subnav, brand accent) / `.menu-pill` + `.menu` + `.menu-item` (user dropdown) / `.stat-grid` + `.stat-card` (+ `.is-attention` amber variant) / `.section-h` / `.banner` (+ `.banner-info`/`.banner-success` variants) / `.connect-card` + `.connect-step` (Stripe steps) / `.modal-scrim` + `.modal` (cancel-with-refund, reject) / `.refund-rows` / `.toast-stack` + `.toast` + `.toast-{success,error,info}` / `.cta-bar` (sticky form) / `.value-grid` + `.value-tile` (Become-a-host hero tiles) / `.process` + `.process-step` / `.host-hero` / `.split` + `.split-aside` / `.app-grid` + `.app-field` / `.summary-card` + `.summary-rows` + `.summary-total` (payment summary) / `.btn-pay` / `.email-canvas` + `.email` + `.email-{head,body,receipt,cta,foot}` / `.policy-line` / `.av-sm`
- `screens/01-landing.html` through `screens/08-admin-bookings.html` (Phase 1 mockups)
- `screens/p2-00-overview.html` through `screens/p2-12-header-variants.html` (Phase 2 mockups, 13 files)
- `screens/tweaks-panel.jsx` — designer's preview tooling (not used in build)

## Current codebase structure

### Routes (`deskhive/src/app/`)

**Public:**
- `page.tsx` — landing (spaces grid)
- `spaces/[id]/page.tsx` — space detail (payment-flow per Story 9-3)
- `spaces/[id]/booking/return/page.tsx` — Stripe return URL handler
- `(public)/login/page.tsx`
- `(public)/register/page.tsx`
- `become-a-host/page.tsx` — Story 7-3 application form

**Guest:**
- `my-bookings/page.tsx` — Story 9-6 adds 3-branch cancel UX

**Admin (SUPER_ADMIN):**
- `admin/spaces/page.tsx`
- `admin/spaces/new/page.tsx`
- `admin/spaces/[id]/page.tsx`
- `admin/bookings/page.tsx`
- `admin/applications/page.tsx` (Story 7-4)
- `admin/applications/[id]/page.tsx` (Story 7-4)
- `admin/guests/page.tsx` (Story 6-2)

**Owner (SPACE_OWNER):**
- `(owner)/owner/page.tsx` — dashboard (Story 7-5)
- `(owner)/owner/spaces/page.tsx` + `new/` + `[id]/` (Story 7-5)
- `(owner)/owner/bookings/page.tsx` (Story 7-5)
- `(owner)/owner/settings/page.tsx` — Stripe Connect (Story 9-2)
- `(owner)/owner/settings/onboarding/return|refresh/page.tsx` (Story 9-2)
- `(owner)/owner/payouts/page.tsx` (Story 9-7)

### Components (`deskhive/src/components/`)

- `header.tsx` — site-header (current)
- `user-pill.tsx` — Story 7-1 user dropdown
- `logout-button.tsx`
- `data-view.tsx` — 4-state wrapper (loading/empty/error/loaded)
- `status-badge.tsx` — booking status badges
- `payout-status-badge.tsx` — Story 9-7 payout-specific badges

### Email templates (`deskhive/src/lib/email-templates/`)

Story 8-1/8-2/8-3 in production:
- `application-{received,approved,rejected}.ts`
- `booking-{requested,confirmed,rejected,cancelled}-{guest,owner}.ts`

Story 8-4 (paused mid-walk per `sprint-status.yaml`):
- `payment-{receipt,refund}.ts`
- `payout-summary.ts`

### Schema (`deskhive/src/db/schema.ts`)

- `usersTable` — Better Auth + GUEST/SUPER_ADMIN/SPACE_OWNER role enum
- `spacesTable` — name + city + addressLine + description + primaryImageUrl + status (DRAFT/PUBLISHED/SUSPENDED) + ownerId (nullable for Phase 1 admin-owned)
- `desksTable` — label + dailyPriceCents + isActive + unique(spaceId, label)
- `bookingsTable` — status + paymentStatus (5-state) + Stripe linkage + refund fields
- `applicationsTable` — Story 7-2
- `stripeConnectAccountsTable` — Story 9-2
- `webhookEventsTable` — Story 9-2 idempotency
- Better Auth: `accountTable`, `sessionTable`, `verificationTable`

7 migrations on disk (`drizzle/migrations/0000_*.sql` through `0007_*.sql`).

### Current globals.css (`deskhive/src/app/globals.css`)

~1550 lines. Already contains:
- Designer's `@theme` block (Story 5-1) — tokens match canonical package
- `@import "tailwindcss"`
- Base + buttons + inputs + badges + cards + auth-card + header + footer + space-detail patterns + my-bookings patterns
- Story 5-2 admin patterns (admin-subnav, table, form-card, toolbar, etc.)
- Story 6-3 sonner toast palette
- Story 7-1 user-menu dropdown
- Story 7-4 review-dialog (native `<dialog>`)

**Missing vs canonical package (gap to close in Phase 1):**
- `phase2.css` patterns — owner-subnav, menu-pill (dropdown), stat-card, banner, connect-card, modal scrim+body, refund-rows, value-tile, process-step, host-hero, split, app-grid, summary-card, btn-pay, email-canvas+email, policy-line, av-sm
- `--font-mono` token (current globals.css uses `var(--font-inter)` only; designer adds `ui-monospace, SFMono-Regular, ...` for monospace UI bits)

## Gap analysis — what reskinning needs per page

### Phase 1 surface (DESIGN-3 through DESIGN-10)

| ID | Mockup | Route | Major needs |
|---|---|---|---|
| DESIGN-3 | 01-landing | `app/page.tsx` | Verify `.card-link` / `.card` / `.img-placeholder` usage; landing-hero copy |
| DESIGN-4 | 02-space-detail | `spaces/[id]/page.tsx` | Amenities display from Phase 2; date-callout; desk-row; payment summary card via phase2.css `.summary-card` |
| DESIGN-5 | 03-register | `(public)/register/page.tsx` | `.auth-card`; field stack |
| DESIGN-6 | 04-login | `(public)/login/page.tsx` | `.auth-card`; field stack |
| DESIGN-7 | 05-my-bookings | `my-bookings/page.tsx` | `.booking` card; section-head; policy-line (Phase 2); modal scrim for cancel (Phase 2) |
| DESIGN-8 | 06-admin-spaces | `admin/spaces/page.tsx` | `.admin-page-head`, `.admin-toolbar`, `.search`, `.chip`, `.table` |
| DESIGN-9 | 07-admin-space-edit | `admin/spaces/[id]/page.tsx` | `.form-card`, `.form-grid`, `.desk-admin-row`, `.add-desk-row`, `.toggle`, `.save-bar`, `.meta-strip`, `.crumbs` + amenities form |
| DESIGN-10 | 08-admin-bookings | `admin/bookings/page.tsx` | `.table`, `.cell-primary`, `.cell-stack`, `.avatar-xs`, `.btn-xs.btn-confirm`, `.btn-xs.btn-reject` |

### Phase 2 surface (DESIGN-11 through DESIGN-18)

| ID | Mockup | Route | Major needs |
|---|---|---|---|
| DESIGN-11 | p2-01-become-a-host | `become-a-host/page.tsx` | `.host-hero`, `.value-grid`, `.value-tile`, `.process`, `.process-step`, `.split`, `.split-aside`, `.cta-bar` |
| DESIGN-12 | p2-02-admin-applications | `admin/applications/page.tsx` | `.admin-toolbar`, `.chip`, `.table`, `.avatar-xs`, application-badge palette (re-use status badges) |
| DESIGN-13 | p2-03-admin-application-detail | `admin/applications/[id]/page.tsx` | `.app-grid`, `.app-field`, `.modal` (for reject) |
| DESIGN-14 | p2-04-owner-dashboard | `(owner)/owner/page.tsx` | `.owner-subnav`, `.stat-grid`, `.stat-card`, `.banner` (Stripe onboarding pending), `.section-h` |
| DESIGN-15 | p2-05-owner-spaces | `(owner)/owner/spaces/page.tsx` | `.owner-subnav`, `.admin-toolbar`, `.table`, draft-vs-published cell variants |
| DESIGN-16 | p2-06-owner-bookings | `(owner)/owner/bookings/page.tsx` | `.owner-subnav`, `.table`, confirm/reject inline `.btn-xs` |
| DESIGN-17 | p2-08-owner-settings | `(owner)/owner/settings/page.tsx` | `.connect-card`, `.connect-step` (active state shows ✓ for completed onboarding/charges/payouts) |
| DESIGN-18 | p2-12-header-variants | `components/header.tsx` | Header.mode-pill variants: GUEST (no pill), SUPER_ADMIN (black pill), SPACE_OWNER-Hosting (indigo pill), Guest+OwnerCapable (mode switch via user-menu) |

### Phase 4 surface (DESIGN-19 through DESIGN-21)

| ID | Mockup | Route | Major needs |
|---|---|---|---|
| DESIGN-19 | p2-07-owner-payouts | `(owner)/owner/payouts/page.tsx` | `.owner-subnav`, `.stat-card` (recent payouts), `.table`, payout status badges; visual restyle ONLY — preserve 9-7 logic |
| DESIGN-20 | p2-09-space-detail-payment | `spaces/[id]/page.tsx` (extend DESIGN-4) | `.summary-card`, `.summary-rows`, `.summary-total`, `.summary-foot` (lock icon), `.btn-pay`; preserve Stripe Checkout integration from 9-3 |
| DESIGN-21 | p2-10-my-bookings-cancel | `my-bookings/page.tsx` (extend DESIGN-7) | `.modal-scrim`, `.modal`, `.refund-rows`, `.policy-line.warn` (24h cutoff); preserve refund logic from 9-6 |

### Phase 5 surface (DESIGN-22)

Single commit. Email templates restyled to mirror designer's `.email` / `.email-{head,body,receipt,cta,foot}` patterns. Scope: Stories 8-1 (`__test__`), 8-2 (application-*), 8-3 (booking-*). **SKIP Story 8-4 templates** (`payment-receipt.ts` / `payment-refund.ts` / `payout-summary.ts`) — paused mid-walk per `sprint-status.yaml`.

## Amenities feature scope (DESIGN-2)

16-slug closed enum (canonical, locked):
1. `wifi` (WiFi)
2. `access_24_7` (24/7 access)
3. `coffee_tea` (Coffee / tea)
4. `parking` (Parking)
5. `meeting_rooms` (Meeting rooms)
6. `printing_scanning` (Printing / scanning)
7. `kitchen` (Kitchen)
8. `phone_booths` (Phone booths)
9. `lockers` (Lockers)
10. `air_conditioning` (Air conditioning)
11. `standing_desks` (Standing desks)
12. `monitors` (Monitors available)
13. `whiteboard` (Whiteboard)
14. `projector` (Projector)
15. `pet_friendly` (Pet-friendly)
16. `wheelchair_accessible` (Wheelchair accessible)

Schema delta: add `amenities text[] NOT NULL DEFAULT '{}'` to `spaces` table. New migration `0008_*`.

Seed delta: each space gets 4–8 random amenities; every amenity appears in seed ≥1 time.

UI delta:
- `AmenitiesForm` (checkbox grid, Lucide icons) — wired into admin space-edit + host space-edit
- `AmenitiesDisplay` (icon grid, empty state) — wired into public space-detail

Lucide icon mapping locked per epic spec.

## Hard constraints respected

- Story 8-4 sprint-status row stays `review` (paused mid-walk).
- Story 8-4 email template content NOT modified.
- Stripe SDK calls, webhook handlers, payment intents, refunds, payouts logic NOT modified (visual restyle only on payment pages).
- Email sending logic + Resend API calls NOT modified.
- `.env.local` secrets NOT modified.
- `data-testid` attributes preserved on reskinned components.
- Sequential commit + push per page (no batching).
- No `git commit --amend`.

## Forward-execution plan

22 commits across Phases 1–5 (one per DESIGN-N). Phase 6 emits a final `DESIGN-FIX` only if regressions surface.
