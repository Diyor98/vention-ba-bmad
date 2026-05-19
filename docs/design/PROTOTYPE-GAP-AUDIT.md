# Prototype gap audit — DESIGN-INTEGRATION-FULL

Generated 2026-05-19. Inventory of all 20 screens in the canonical clickable prototype, mapped to the current live codebase routes, with concrete gaps + priorities.

**Source of truth:** `docs/design/DeskHive - Coworking Space Booking Web App/DeskHive Prototype.html` (2,905 lines).

**Prior reskin work already on `main`:** DESIGN-1 (token swap + Phase 2 patterns), DESIGN-2 (amenities), DESIGN-3 (landing hero), DESIGN-FIX-2 (landing-card price + amenity preview), DESIGN-FIX-3 (payout status labels), plus prior Story 5-1/5-2/6-3/7-1/7-4 reskins from Phase 1.

## Routing model (from prototype `ROUTES` const at line 435)

The prototype uses a 4-role nav matrix. Live codebase mirrors this with auth-gated route groups:

| Prototype role | Live equivalent |
|---|---|
| `public` | unauthenticated visitors (anyone can see) |
| `guest` | role `GUEST` |
| `host` | role `SPACE_OWNER` (the original "Space Owner" naming kept) |
| `admin` | role `SUPER_ADMIN` |

## Screen-by-screen audit

| # | Prototype screen | Prototype route | Live route | Status | Gaps to close | Priority |
|---|---|---|---|---|---|---|
| 1 | `Public` (landing hero + featured rail) | `/` | `src/app/page.tsx` | **partial** | Hero is DESIGN-3 aligned. Featured-rail (3-space preview) missing — prototype shows hero → "How it works" 3-tile grid → 3 featured spaces → Browse-all CTA. Currently the page shows hero + full grid. Need: 3-tile "How it works" + featured rail. | **high** |
| 2 | `Browse` (full searchable grid) | `/browse` | `src/app/page.tsx` (shares route with #1) | **partial** | Live `/` already renders the searchable grid. Prototype splits to `/browse`. Either keep merged (live status) and document, or split. Cards already enriched with price + amenity preview (DESIGN-FIX-2). Prototype adds: ★ rating, neighborhood, spots-left dot, inset rounded photo, decorative pagination dots overlay. **Schema lacks `rating`, `reviews`, `neighborhood`, `blurb`, `spotsLeft`** — those are prototype-fake data and would need real implementation. | **high** |
| 3 | `SpaceDetail` (gallery + reviews + host card) | `/space/[id]` | `src/app/spaces/[id]/page.tsx` | **partial** | Live has: hero img, breadcrumb, About, Amenities (DESIGN-2), date-callout, desks list. Prototype adds: photo gallery (4-thumb strip below hero), star rating + review count, host info card (avatar + name + space count), neighborhood + blurb, "Reviews" section with 2-3 review cards, full-bleed sticky booking summary panel. Schema lacks reviews, ratings, host avatars. | **high** |
| 4 | `BookingFlow` (branded Stripe Checkout) | `/booking/new?space=…&desk=…&date=…` | `src/app/spaces/[id]/booking/return/page.tsx` + real Stripe Checkout redirect from `confirmBookingAction` | **partial** | Live uses real Stripe Checkout (Story 9-3); the prototype simulates a Stripe-Checkout-shaped page inline. **Live is correct for production** — visual restyle ONLY applies to (a) the "redirecting" interstitial, (b) the return-URL handler page. The fake checkout form in the prototype is design fiction; we ship the real Stripe Checkout. Document this and skin the interstitial + return page to match prototype's chrome (Stripe `S` icon + "checkout.stripe.com · Test mode" header). | **med** |
| 5 | `MyBookings` (3-section card layout) | `/bookings` | `src/app/my-bookings/page.tsx` | **partial** | Live uses `.booking` card from globals.css. Prototype sections: "Awaiting confirmation" (Pending), "Upcoming" (Confirmed + upcoming-phase), "Past & archived". Currently the live page may not split into 3 sections — verify and add. Cancel + Book again actions already exist. | **med** |
| 6 | `Login` | `/login` | `src/app/(public)/login/page.tsx` | **matched** | `.auth-card` already in use. Prototype is simpler than the live — no major gap. Quick polish pass. | **low** |
| 7 | `Signup` | `/signup` | `src/app/(public)/register/page.tsx` | **matched** | Same as Login — auth-card pattern aligned. Live route is `/register` not `/signup`; alias may be useful. | **low** |
| 8 | `Account` (3-tab settings) | `/account` | **MISSING** | **missing** | Greenfield. Prototype has tabs Profile / Payment methods / Notifications. Currently no `/account` route exists. **Schema would need:** notification preferences (boolean cols on users or a settings table), payment_methods (Phase 3 — out of scope for visual integration). | **med** |
| 9 | `BecomeAHost` (application form with submitted state) | `/become-a-host` | `src/app/become-a-host/page.tsx` | **partial** | Live has the form (Story 7-3). Prototype's form is similar but has tighter hero + state-A/B/C branching. Inventory of state-machine: Phase 2 already locked A-E states in 7-3 BA decisions. Likely only polish needed; verify alignment. | **med** |
| 10 | `AdminApplications` (queue + filters) | `/admin/applications` | `src/app/admin/applications/page.tsx` | **matched** | Story 7-4 reskin already aligned. Prototype adds search + status filter chips. Verify and add if missing. | **low** |
| 11 | `AdminApplicationDetail` (modal-gated reject) | `/admin/applications/[id]` | `src/app/admin/applications/[id]/page.tsx` | **matched** | Story 7-4 reject-dialog already aligned (`<dialog>` element with backdrop). Prototype uses confirm-bus pattern for the destructive action with note. Verify the note-on-reject mechanic. | **low** |
| 12 | `HostDashboard` (banner + stat cards + pending requests + quick actions) | `/host` | `src/app/(owner)/owner/page.tsx` | **partial** | Live has the dashboard (Story 7-5). Prototype additions: **(a) Connect-status banner at top** ("Connect Stripe to receive payouts" amber or "Finish your Stripe setup" indigo with step counter); **(b) 3-stat-card row** (Earnings 30d, Bookings 30d, Occupancy); **(c) 2-column layout below** (Pending Requests table + Quick Actions sidebar). `.stat-card` + `.banner` CSS already shipped in DESIGN-1; just need to compose them in the page. | **high** |
| 13 | `HostSpaces` (table with row-click to edit) | `/host/spaces` | `src/app/(owner)/owner/spaces/page.tsx` | **partial** | Live is a list. Prototype is a table (Space photo + name / City / Desks / Day rate / Status / Edit). Reskin to table layout. | **med** |
| 14 | `HostSpaceNew` (4-step wizard: Basics → Desks → Photos → Publish) | `/host/spaces/new` | `src/app/(owner)/owner/spaces/new/page.tsx` | **partial** | Live is a single-form page. Prototype is a 4-step wizard with step-rail + progress + per-step form. **High-effort reskin** — requires multi-step state machine in the Client Component. | **med** |
| 15 | `HostSpaceEdit` (sectioned edit + desks + amenities + photos) | `/host/spaces/[id]` | `src/app/(owner)/owner/spaces/[id]/page.tsx` | **partial** | Live has the form + amenities (DESIGN-2). Prototype adds: form-card sections (Basics / Desks / Amenities / Photos / Visibility), inline desk add-row with toggle for active/inactive, photos placeholder. | **med** |
| 16 | `HostBookings` (4-tab table) | `/host/bookings` | `src/app/(owner)/owner/bookings/page.tsx` | **partial** | Live is a single table. Prototype tabs: Pending / Confirmed / Rejected / Cancelled with counts. Reskin to add tab strip + counts. | **med** |
| 17 | `HostPayouts` (stat cards + payouts table + Connect banner) | `/host/payouts` | `src/app/(owner)/owner/payouts/page.tsx` | **partial** | Live has the payouts table + DESIGN-FIX-3 status mapping. Prototype additions: **(a) stat-card row** (Lifetime earnings / Pending payout / Next payout date); **(b) Connect-status banner if `payouts_enabled = false`**. | **med** |
| 18 | `HostOnboarding` (5-step Stripe Connect wizard + connected-state success card) | `/host/onboarding` | `src/app/(owner)/owner/settings/page.tsx` (current Connect page) | **partial** | Live has Connect setup (Story 9-2 + 9-2b). Prototype is **a 5-step wizard with step-rail** (Get started → Verify identity → Add bank → Payout schedule → Done) + a separate success-state card when already connected (4 capability indicators + Manage on Stripe + Disconnect). Live shipped a much simpler form. **High-effort reskin** if the wizard shape is required. Production wiring goes through real Stripe Connect Express via `connect.ts` and the `account.updated` webhook — the wizard is mostly cosmetic since Stripe handles the actual KYC. | **high** |
| 19 | `AdminUsers` (table + role filter chips + Manage drawer) | `/admin/users` | **MISSING** | **missing** | Greenfield. Prototype has a users table with role filter chips (All/Guest/Host/Admin), search, and a right-side drawer for role-change/reset/suspend/delete. **Phase 3 territory** — most actions are destructive admin ops; not Phase 2 PRD scope. Recommend visual scaffold + read-only "Manage" affordance pointing to "Phase 3" for now. | **low** |
| 20 | `SystemHealth` (services + uptime) | `/system/health` | **MISSING** | **missing** | Greenfield. Prototype shows API / Web app / Stripe webhook / Resend / Background jobs status + uptime %. **Phase 3+ ops surface** — no real status data exists. Recommend visual scaffold with placeholder data + flag in code as "Phase 3 wiring pending". | **low** |

## Cross-cutting components surfaced by the prototype

These appear in multiple screens; worth extracting into shared Client Components if they're new to the live codebase:

| Component | Live equivalent | Status |
|---|---|---|
| `StatCard` (label / value / trend / icon) | `.stat-card` CSS exists from DESIGN-1; **no React component yet** | needs component |
| `Pill` (status pills: Active/Approved/Pending/etc.) | `<StatusBadge>` + `<PayoutStatusBadge>` exist; prototype uses uniform `Pill` | overlapping; keep current 2-component split |
| `Tabs` (header + count) | none | needs component |
| `Field` (label + input + helper) | `<FormField>` from globals.css `.field-label`/`.field-help` exists | matched |
| `Btn` variants (primary/secondary/ghost/success/danger) | `.btn`/`.btn-secondary`/`.btn-ghost` exist; prototype adds `kind="success"` (green) + `kind="danger"` (red text) | needs 2 new variants in globals.css |
| `Toast` (notify success/warn/error/info) | sonner via `src/lib/toast.ts` from Story 6-3 | matched |
| `ConfirmDialog` (destructive confirms + optional note input) | one-off `<dialog>` for Story 7-4 reject; no shared component | needs extraction |
| `UserMenu` (avatar + role pill + items) | `src/components/user-pill.tsx` Story 7-1 | matched |
| `RoleSwitcher` (top-bar role pill dropdown) | mode-cookie from Story 7-1 | partial — live has 1-direction (Guest↔Host); prototype shows 4-role selector for prototyping (NOT a production feature) |
| `Banner` (Connect status callout) | `.banner` + `.banner-info`/`.banner-success` from DESIGN-1 | matched |

## What is OUT of scope for integration

The prototype is a single-page React app with fake data + mutable in-memory stores. Several features are design fiction that production should not chase:

- **Star ratings + review counts.** No reviews/ratings table in production schema. Visually skipped.
- **Spots-left indicator per card on landing.** Production reads availability per-date on Space Detail; we don't surface daily-availability roll-ups on Browse. Visually skipped.
- **Per-card neighborhood + blurb.** No `neighborhood` or `blurb` column on `spaces`. Could add later — out of this integration's scope.
- **`/account` payment-methods tab.** Stripe doesn't store guest cards in our schema; checkout is per-booking. Visually scaffolded only.
- **Prototype's mutable in-memory stores.** Production uses Drizzle + Server Actions. Keep all existing data flows.
- **`/admin/users` destructive actions.** Phase 3.
- **`/system/health`.** Phase 3.

## Audit-driven roadmap (integration order)

Priority is stakeholder-visible-on-landing impact descending. Each row maps to one DESIGN-INT-N commit. Each commit is its own push.

| DESIGN-INT-N | Screen | Effort |
|---|---|---|
| DESIGN-INT-1 | Public landing — add "How it works" 3-tile + featured rail | small |
| DESIGN-INT-2 | Space detail — gallery thumbs + host info card | medium |
| DESIGN-INT-3 | My bookings — 3-section split (Awaiting / Upcoming / Past) | small |
| DESIGN-INT-4 | Host dashboard — Connect banner + stat-card row + 2-col body | medium |
| DESIGN-INT-5 | Host payouts — stat-card row + Connect banner | small |
| DESIGN-INT-6 | Host bookings — 4-tab strip with counts | small |
| DESIGN-INT-7 | Host spaces — list → table | small |
| DESIGN-INT-8 | Host space edit — sectioned form-cards | medium |
| DESIGN-INT-9 | Account page (3-tab settings, scaffold only) | medium (greenfield) |
| DESIGN-INT-10 | Host space new — 4-step wizard | large |
| DESIGN-INT-11 | Host onboarding — 5-step wizard with success state | large |
| DESIGN-INT-12 | Become a host — polish to prototype's tighter hero | small |
| DESIGN-INT-13 | Login + Signup — polish auth cards | small |
| DESIGN-INT-14 | Admin applications + detail — search/filter chips, note-on-reject | small |
| DESIGN-INT-15 | Admin users — scaffold (Phase 3 wiring deferred) | medium |
| DESIGN-INT-16 | System health — scaffold (Phase 3 wiring deferred) | small |
| DESIGN-INT-17 | Header variants — verify per-role pills (DESIGN-2 work) | small |
| DESIGN-INT-18 | Booking flow — restyle interstitial + return-URL page to Stripe Checkout chrome | small |
| DESIGN-INT-19 | Cross-cutting: extract shared `<StatCard>` + `<Tabs>` components + add `.btn-success` `.btn-danger` to globals.css | small |
| DESIGN-INT-20 | Final verification — full pnpm test + pnpm test:e2e + DESIGN-FIX commit if regressions surface | medium |

## Estimated scope vs single-session context

This is approximately the same scope as DESIGN-EPIC (the prior 22-commit epic that took session 1's full budget for Phase 0-2 + DESIGN-3 only). Realistically session 1 of DESIGN-INTEGRATION-FULL will land Phase 0 audit + 2-3 DESIGN-INT-N commits. Subsequent sessions resume from this audit + `DESIGN-INTEGRATION-FULL-report.md` (to be written at stop time).

## Honored constraints

- No Stripe SDK logic, webhook handler, payment intent, refund, or payout LOGIC changes.
- No email sending logic changes (template HTML restyle in DESIGN-INT-N where applicable is acceptable, but the helpers + Resend transport stay).
- Story 8-4 sprint-status row stays `done`.
- No `.env.local` writes.
- `data-testid` attributes preserved on reskinned components.
- Sequential commit + push per DESIGN-INT-N. No `--amend`.
