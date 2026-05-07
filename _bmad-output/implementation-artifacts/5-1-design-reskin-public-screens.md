# Story 5.1: Design Reskin — Public Screens

Status: review

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a **product team (BA Ikhtiyor + designer Makhbuba)**,
I want **the existing Phase 1 public + Guest screens to adopt Makhbuba's design system (tokens, components, structural treatments) without changing functional behavior**,
so that **DeskHive feels like a real product instead of a default Tailwind prototype, while every flow that worked yesterday still works today.**

> Story 5.1 is the **first story of Epic 5 — Design Integration**. Source of truth for scope: [docs/design/5-1-design-reskin-ba-decisions.md](docs/design/5-1-design-reskin-ba-decisions.md). All visual decisions originate from Makhbuba's design package at [docs/design/DeskHive - Coworking Space Booking Web App/](docs/design/DeskHive - Coworking Space Booking Web App/) — only 5 of 8 screens are designed (public + Guest); admin screens land tomorrow at 10am Tashkent and become Story 5.2.

> **This is a presentation-layer story.** No schema changes, no new Server Actions, no new REST endpoints, no new pages. All 18 functional stories from Epics 0–4 must continue working unchanged — the BA's verification checklist (decisions §10) explicitly enumerates regression coverage.

## Acceptance Criteria

> Source: BA Decisions document, Sections 1–9 + Verification Expectations.

1. **AC-1 (Consolidated `globals.css`).** `src/app/globals.css` becomes a single file containing:
   - The full `@theme {}` block from [docs/design/DeskHive - Coworking Space Booking Web App/globals.css](docs/design/DeskHive - Coworking Space Booking Web App/globals.css) (brand 50–900 indigo scale, neutrals 0–950 slightly cool scale, status pairs for all 4 booking states, Inter typography 5-step scale, spacing/layout/radii/shadow/motion tokens).
   - All component classes from [docs/design/DeskHive - Coworking Space Booking Web App/screens/shared.css](docs/design/DeskHive - Coworking Space Booking Web App/screens/shared.css): `.btn`/`.btn-primary`/`.btn-secondary`/`.btn-sm`/`.spinner`, `.input`/`.field-label`/`.field-help`/`.field-error`, `.badge`/`.badge-pending`/`.badge-confirmed`/`.badge-rejected`/`.badge-cancelled`/`.badge-lg`/`.dot`, `.avail`/`.avail-yes`/`.avail-no`, `.card`/`.card-link`/`.img-placeholder`, `.site-header`/`.site-header-inner`/`.nav-link`/`.logo`/`.logo-mark`, `.container-content` (1152px max), `.container-narrow` (576px max for auth), `.page-h1`/`.page-display`/`.h2`/`.muted`/`.muted-strong`, `.user-pill`/`.user-avatar`, `.site-footer`/`.site-footer-inner`, `hr.rule`, `.tnum` for tabular numerals.
   - **Strip the duplicate `@theme {}` block from shared.css before merging** — only the globals.css `@theme {}` survives. (BA Decisions §1.)
   - Disabled-state styling for buttons via `:disabled` AND `[aria-disabled="true"]` selectors. Invalid-input styling via `aria-invalid="true"`.

2. **AC-2 (Inter via `next/font/google`).** `src/app/layout.tsx` loads Inter via `next/font/google` with weights 400, 500, 600, 700, exposing CSS variable `--font-sans`. **The Google Fonts CDN `<link>` tag from Makhbuba's HTML demos is NOT used** — that's demo-only. Replaces the current Geist setup. The `--font-sans` token already declared in `@theme {}` should still resolve to `Inter` via the variable handoff.

3. **AC-3 (Site header overhaul — sticky, hexagon logo, audience-aware nav).** `src/app/layout.tsx` renders `.site-header` with:
   - `position: sticky; top: 0; z-index: 10;`
   - Hexagon logo mark via CSS `clip-path` (NOT an SVG/image asset) — the `.logo-mark` class from shared.css.
   - Audience-aware nav (server-rendered from session):
     - **Public (logged out):** logo + `Browse spaces` + `Log in` + `Sign up` (primary). **`How it works` link from BA Decisions §2 is OMITTED in this story** — it references content that lives in `01-landing.html` (Phase 2 marketing landing); shipping the link without the destination would create a broken UI affordance. Re-add when the marketing landing lands. Documented in Dev Notes as a deliberate scope deviation from BA Decisions.
     - **Guest (logged in):** logo + `Browse spaces` + `My bookings` + user-pill (avatar + name) + `Log out`.
     - **Super Admin:** logo + `Browse spaces` + `My bookings` + `Admin` link + user-pill + `Log out`.
   - The existing logout flow from US-1.3 (`logoutAction` Server Action) is preserved unchanged; only the visual treatment of the button/link changes.

4. **AC-4 (Site footer).** `src/app/layout.tsx` renders `.site-footer` at the bottom of every page. Content per shared.css's `.site-footer-inner` template (basic copyright + minor links, no marketing).

5. **AC-5 (Register reskin — `(public)/register/page.tsx`).** Translate visual patterns from [03-register.html](docs/design/DeskHive - Coworking Space Booking Web App/screens/03-register.html):
   - Form wrapped in `.auth-card` (white surface, rounded corners, padding).
   - Inputs use `.input`, labels use `.field-label`, helper microcopy under fields uses `.field-help` ("We'll only email you about your bookings.", "8+ characters. No other rules — keep it strong.").
   - Submit button: `.btn-primary` full-width.
   - Header: `Create your account` + subtitle `Find a desk, book a day, get to work.`
   - Footer link: `Already have an account? Log in`
   - Terms/Privacy footer text inside the auth-card.
   - **The existing `registerAction` Server Action and Better Auth integration (US-1.1, the `nextCookies()` plugin from `1864bde`) are unchanged.** Only the form's visual structure changes.

6. **AC-6 (Login reskin — `(public)/login/page.tsx`).** Translate from [04-login.html](docs/design/DeskHive - Coworking Space Booking Web App/screens/04-login.html):
   - Same `.auth-card` structure as register; simpler form (email + password).
   - Header: `Welcome back` + subtitle `Log in to manage your bookings.`
   - Footer link: `New to DeskHive? Create an account`
   - **The existing `loginAction` (US-1.2) including the `callbackUrl` same-origin guard from US-3.3 are unchanged.** Hidden `callbackUrl` input continues to render exactly as today.

7. **AC-7 (Space detail reskin — `spaces/[id]/page.tsx`).** Translate from [02-space-detail.html](docs/design/DeskHive - Coworking Space Booking Web App/screens/02-space-detail.html):
   - Breadcrumbs at top (`Browse spaces / [Space name]`).
   - Numbered section headers using brand-100 circles (`1 PICK A DATE`, `2 Desks`).
   - **Two-column layout on desktop:** About + Amenities-placeholder on the left; sticky sidebar booking widget on the right (`position: sticky; top: var(--layout-header-h);`).
   - Hero photo at top, full-width within `.container-content`.
   - Desk rows use `.avail` / `.avail-yes` / `.avail-no` pills for availability indication.
   - "Book this desk" button uses `.btn-primary`; disabled state when desk unavailable expressed via `aria-disabled="true"` (in addition to or instead of the `disabled` attribute — see Dev Notes for the React-friendly choice).
   - **The existing `<BookDeskButton>` Client Component (US-3.3) keeps its behavior** (form submit, `useActionState`, redirect to `/my-bookings`). Only its visual classes change. **The auto-fetching date picker (AC-9) replaces the `Show availability` button structure** — see AC-9.

8. **AC-8 (My Bookings reskin — `my-bookings/page.tsx`).** Translate from [05-my-bookings.html](docs/design/DeskHive - Coworking Space Booking Web App/screens/05-my-bookings.html):
   - **Group bookings into status sections** in the rendered output:
     - `AWAITING CONFIRMATION` section (PENDING bookings) with explanatory subhead.
     - `UPCOMING` section (CONFIRMED bookings, future-dated).
     - For Cancelled/Rejected: pick the cleaner UX based on the design HTML — either a single `PAST` section or omit them from the page entirely. **Decision in this story: render a `PAST` section containing CANCELLED + REJECTED + CONFIRMED-past-dated rows** (consolidates terminal/historical states; matches the design HTML's likely shape). Document the CONFIRMED-past-dated split logic in Dev Notes.
     - Section count indicators (e.g., `AWAITING CONFIRMATION 2`) on the right side of section headers.
   - Use `.badge-lg.badge-confirmed` (filled green, prominent) for CONFIRMED rows in the UPCOMING section if the design HTML uses that variant; standard `.badge-pending` / `.badge-cancelled` / `.badge-rejected` elsewhere.
   - **The existing `<CancelBookingButton>` (US-3.5) keeps its behavior**; only visual classes change. Cancel button still only renders for `status === 'PENDING'`.
   - **The empty-state copy from US-3.4 (`"You haven't booked anything yet. Browse spaces to get started."`) is preserved verbatim.** Designer brief reference unchanged.
   - **The deterministic sort order from US-3.4 (`booking_date DESC, created_at DESC`) is preserved** in the underlying `listBookingsForGuest` helper. Section grouping happens in the page layer using the already-sorted array; query is unchanged.

9. **AC-9 (Auto-fetching date picker on Space Detail — structural change).** The current `<form action="/spaces/[id]" method="GET">` with the `Show availability` Submit button is replaced with a small Client Component date picker that auto-submits on `onChange`:
   - The button element is removed.
   - The date `<input type="date">` becomes a Client Component (e.g. `<DatePickerForm spaceId={...} initialDate={...}>`); it uses `useRouter().push(\`/spaces/${spaceId}?date=${value}\`)` on change.
   - The Server Component page continues to read `searchParams.date` and render desks + availability based on the URL — no change to the read path.
   - `min={todayIso()}` constraint preserved on the input.
   - The existing `parseDateParam` helper and the missing/malformed/past-date notice rendering are preserved exactly.

10. **AC-10 (StatusBadge reskin — component change).** Update `src/components/status-badge.tsx`:
    - Add `<span class="dot"></span>` element inside the badge before the label text.
    - All 4 variants (Pending amber, Confirmed green, Rejected red, Cancelled neutral) get the dot.
    - Replace inline Tailwind classes with the `.badge` + `.badge-{variant}` class composition from the consolidated globals.css.
    - **TypeScript prop interface unchanged** (`{ status: BookingStatus }`). No consuming component should need updates beyond the implicit visual change.
    - Tests in `status-badge.test.tsx` may need micro-updates if they assert on specific class names; preserve test coverage of the four-variant mapping.

11. **AC-11 (Browse Spaces — token-only consistency pass).** `src/app/page.tsx`:
    - **NO marketing landing.** Skip `01-landing.html` entirely. Keep the current flat-grid Browse Spaces layout from US-3.1.
    - Apply typography: `.page-h1` for the page title.
    - Apply card classes: `.card` for each space card, with `.card-link` for the `<Link>` wrapper if it improves hover/focus states.
    - Apply button classes for the city filter form's submit button (`.btn-primary`) and the "Clear filter" link.
    - Visual consistency only — no structural change. The `?city=...` filter, the `<DataView>` empty/error states, and the `eslint-disable-next-line @next/next/no-img-element` for `<img>` tags all remain.

12. **AC-12 (Admin pages — token-only consistency pass).** `src/app/admin/spaces/page.tsx`, `[id]/page.tsx`, and `src/app/admin/bookings/page.tsx`:
    - Apply typography, button, card classes for visual consistency with public screens.
    - **NO structural change.** Sub-nav from US-4.1 stays; Confirm/Reject/Cancel buttons stay where they are; the inline edit-desk forms (US-2.4) keep their structure.
    - Admin pages get the **full reskin** in Story 5.2 tomorrow when Makhbuba's admin designs land. Today is just visual consistency so the global reskin doesn't visually break the admin area.

13. **AC-13 (No regression in any Phase 1 flow — BA verification §10.7).** Every flow verified during Epics 0–4 must still work:
    - US-1.1 register → auto-login → redirect to `/`
    - US-1.2 login → redirect to `/` or to `?callbackUrl=` target
    - US-1.3 logout → header reverts; redirect to `/`
    - US-2.1–2.4 admin spaces + desks CRUD
    - US-3.1 browse with city filter
    - US-3.2 space detail + date picker (now auto-fetching) + availability badges
    - US-3.3 booking creation → redirect to `/my-bookings`; double-booking 409 with verbatim message
    - US-3.4 my-bookings list with status badges + price + sort order
    - US-3.5 cancel pending booking + verbatim FORBIDDEN/CANNOT_CANCEL messages + spaces revalidation
    - US-4.1 admin view all bookings
    - US-4.2 admin Confirm + verbatim messages
    - US-4.3 admin Reject + verbatim messages + spaces revalidation
    - All 95 unit + 31 E2E tests still pass.
    - `pnpm typecheck` / `lint` / `test` / `build` / `test:e2e` all clean.

14. **AC-14 (Stop bar — visual + functional verification).**
    - Open `/` after `pnpm dev` → see new typography, hexagon logo, sticky header with `Browse spaces` / `Log in` / `Sign up` (logged out).
    - Click into a space card → `/spaces/<id>` shows breadcrumbs, numbered sections, sticky right sidebar, hero image, `.avail` pills on desks, no "Show availability" button (date input auto-fetches).
    - Pick a date → page reloads with availability rendered; URL has `?date=YYYY-MM-DD`.
    - Log in / register → `.auth-card` styling; login callback flow still works.
    - As Guest: `/my-bookings` shows AWAITING CONFIRMATION / UPCOMING / PAST sections with section counts; cancel button only on PENDING; verbatim empty-state copy when no bookings.
    - All 4 status badges (`.badge` + `.dot`) render correctly across `/admin/bookings`, `/my-bookings`, anywhere they appear.
    - Footer visible at bottom of every page.
    - Inter font loads via `next/font/google` (verify in DOM source: no `<link href="https://fonts.googleapis.com">`).
    - Tabular numerals (`.tnum`) on prices and dates.
    - No console errors.

15. **AC-15 (Single commit).** All Story 5.1 changes land in a single commit on `main` titled exactly `feat: design reskin — public screens (Story 5-1)`. Commit content is only files under `deskhive/` plus the existing `_bmad-output/` story file/sprint-status update.

## Tasks / Subtasks

- [x] **Task 0 — Prep + path correction.**
  - Verify all CI commands from US-4.3 (`0583a43`) still pass.
  - **Path correction:** BA Decisions §3a/3b reference `app/(auth)/register/page.tsx` and `(auth)/login/page.tsx`, but the actual route group from US-1.1 / US-1.2 is **`(public)/`**, not `(auth)/`. **Use the existing paths** — `src/app/(public)/register/page.tsx`, `src/app/(public)/login/page.tsx`, plus their colocated `register-form.tsx` / `login-form.tsx` Client Components. **Do NOT rename the route group** unless explicitly approved by BA — that's a structural change beyond this story's scope.
  - Read [docs/design/DeskHive - Coworking Space Booking Web App/brief.txt](docs/design/DeskHive - Coworking Space Booking Web App/brief.txt) for designer's full intent before touching any code (BA Decisions explicitly recommends this).

- [x] **Task 1 — Consolidate `src/app/globals.css`** (replaces existing stub):
  - Copy the full `@theme {}` block from `docs/design/.../globals.css` verbatim.
  - Append all component classes from `docs/design/.../screens/shared.css` AFTER the `@theme {}` block. **Strip the duplicate `@theme {}` block at the top of shared.css before pasting** — only the globals.css `@theme {}` survives (BA Decisions §1).
  - Add base styles after the component classes: body font + background + `font-feature-settings` (for tabular numerals via `.tnum`).
  - Remove the `@media (prefers-color-scheme: dark)` block from the existing globals.css — Makhbuba's design is light-mode only for Phase 1.
  - Remove the create-next-app stub variables (`--background`, `--foreground` outside `@theme {}`).
  - **No `@theme inline {}` block** — Makhbuba's design uses the standard `@theme {}` form.

- [x] **Task 2 — Inter font via `next/font/google` in `src/app/layout.tsx`:**
  - Replace `Geist` and `Geist_Mono` imports with `Inter` from `next/font/google`.
  - Configure Inter with `weight: ['400', '500', '600', '700']` and `variable: '--font-sans'`.
  - Remove the `Geist_Mono` setup entirely (Phase 1 doesn't need a mono font surface).
  - Apply `inter.variable` to the `<html>` className (replaces the `geistSans.variable` / `geistMono.variable` chain).
  - Update `metadata.title` if needed (currently `"DeskHive"` — keep).

- [x] **Task 3 — Site header reskin (sticky + hexagon logo + audience nav)** in `src/components/header.tsx`:
  - Replace existing className composition with `.site-header` + `.site-header-inner` from shared.css.
  - Hexagon logo via `.logo-mark` (CSS `clip-path`, not SVG).
  - **Public nav (no session):** `Browse spaces` link to `/`, `Log in` link to `/login`, `Sign up` button (primary, links to `/register`).
    - **Omit the `How it works` link from BA Decisions §2.** Documented as deliberate deviation in Dev Notes; re-add when the marketing landing lands.
  - **Guest nav:** `Browse spaces` + `My bookings` + user-pill (avatar + name) + `Log out` button.
  - **Super Admin nav:** `Browse spaces` + `My bookings` + `Admin` link to `/admin/spaces` + user-pill + `Log out`.
  - User-pill uses `.user-pill` + `.user-avatar` classes; avatar shows the user's first name initial (CSS-rendered, no image asset).
  - The existing `await auth.api.getSession({ headers: await headers() })` call in the Server Component is preserved. Role check unchanged (`session.user.role === 'SUPER_ADMIN'`).
  - The existing `<LogoutButton>` Client Component (US-1.3) keeps its action; only the visual classes change.

- [x] **Task 4 — Site footer** at the bottom of `src/app/layout.tsx`:
  - Add `<footer class="site-footer"><div class="site-footer-inner">…</div></footer>` after `{children}`.
  - Content per shared.css's `.site-footer-inner` template — basic copyright + minor links. No marketing copy.
  - Preserve the existing `<div className="flex-1">{children}</div>` wrapper from US-1.3 so flex layout still pushes footer to the bottom on short pages.

- [x] **Task 5 — Register reskin** — modify `src/app/(public)/register/register-form.tsx`:
  - Wrap the form in `.auth-card`.
  - Inputs use `.input`; labels use `.field-label`; per-field helper microcopy uses `.field-help` ("We'll only email you about your bookings.", "8+ characters. No other rules — keep it strong.").
  - Submit button: `.btn-primary` full-width.
  - Validation errors: `aria-invalid="true"` on the input + `.field-error` paragraph below.
  - The Page Server Component (`src/app/(public)/register/page.tsx`) gets the heading "Create your account" + subtitle "Find a desk, book a day, get to work." rendered above the form. Footer link "Already have an account? Log in" rendered below the form.
  - Wrap the Page in `.container-narrow` (576px max-width).
  - Terms/Privacy footer text rendered as small muted copy below the form.

- [x] **Task 6 — Login reskin** — modify `src/app/(public)/login/login-form.tsx` and `page.tsx`:
  - Same `.auth-card` structure as register.
  - Page heading: "Welcome back"; subtitle: "Log in to manage your bookings."
  - Footer link: "New to DeskHive? Create an account"
  - Hidden `callbackUrl` input from US-3.3 is **preserved as-is**.

- [x] **Task 7 — Space Detail reskin + auto-fetching date picker** — modify `src/app/spaces/[id]/page.tsx` + create `src/app/spaces/[id]/date-picker-form.tsx`:
  - Page structural changes:
    - Add breadcrumbs at top (`Browse spaces / <space name>`).
    - Add numbered section headers (`1 PICK A DATE`, `2 Desks`) using `.brand-100` circles.
    - Two-column desktop layout: About + (placeholder for Amenities, NOT shipped — Phase 2) on the left; sticky sidebar with date picker + booking summary on the right (`position: sticky; top: var(--layout-header-h);`).
    - Hero photo at top inside `.container-content`.
  - Replace the `<form action="/spaces/[id]" method="GET">` + `Show availability` button with `<DatePickerForm spaceId={space.id} initialDate={dateResult.valid ? dateResult.iso : ''} />` (a new Client Component).
  - **`<DatePickerForm>`** (NEW Client Component, `'use client'`):
    - `useRouter` from `next/navigation`.
    - `<input type="date" min={todayIso()} defaultValue={initialDate} onChange={e => router.push(\`/spaces/${spaceId}?date=${e.target.value}\`)} />`.
    - No submit button.
    - `min={todayIso()}` constraint preserved.
  - Desks list rendering uses `.avail` + `.avail-yes` / `.avail-no` pills for availability indication.
  - `<BookDeskButton>` keeps its existing behavior; visual classes change to `.btn-primary` + `aria-disabled="true"` instead of (or alongside) the existing `disabled` attribute. **Verify the existing `useFormStatus().pending` disable logic still works** — `aria-disabled` doesn't replace `disabled` for form submission; both should be set when not enabled.
  - Existing `parseDateParam` + missing/malformed/past notice rendering preserved.

- [x] **Task 8 — My Bookings reskin + status sections** — modify `src/app/my-bookings/page.tsx`:
  - Wrap content in `.container-content`.
  - Page heading: `.page-h1`.
  - **Group rows by status section in JS, after the existing `listBookingsForGuest` returns the sorted array:**
    - `awaiting = rows.filter(r => r.booking.status === 'PENDING')` — render under `AWAITING CONFIRMATION` heading + count badge.
    - `upcoming = rows.filter(r => r.booking.status === 'CONFIRMED' && r.booking.bookingDate >= todayIso())` — render under `UPCOMING` heading + count badge.
    - `past = rows.filter(r => r.booking.status === 'CANCELLED' || r.booking.status === 'REJECTED' || (r.booking.status === 'CONFIRMED' && r.booking.bookingDate < todayIso()))` — render under `PAST` heading + count badge.
  - Each section's heading: small caps + section count on the right side.
  - Empty state from US-3.4 (`"You haven't booked anything yet. Browse spaces to get started."`) is preserved verbatim — it shows when ALL three sections are empty.
  - Use `.badge-lg.badge-confirmed` for CONFIRMED rows in the UPCOMING section if the design HTML uses that variant; standard `.badge-pending` / `.badge-cancelled` / `.badge-rejected` elsewhere. Confirm by reading [05-my-bookings.html](docs/design/DeskHive - Coworking Space Booking Web App/screens/05-my-bookings.html).
  - `<CancelBookingButton>` only on PENDING rows (in AWAITING CONFIRMATION section). Existing US-3.5 behavior preserved.

- [x] **Task 9 — StatusBadge reskin** — modify `src/components/status-badge.tsx`:
  - Replace inline Tailwind classes with `<span class="badge badge-{variant}"><span class="dot"></span>{label}</span>` structure.
  - All 4 variants get the `.dot`.
  - TypeScript prop interface unchanged.
  - Update `src/components/status-badge.test.tsx` if its assertions reference specific class names — preserve the four-variant coverage.

- [x] **Task 10 — Browse Spaces token-only pass** — modify `src/app/page.tsx`:
  - Page heading uses `.page-h1`.
  - Each space card uses `.card`; `<Link>` wrapper uses `.card-link` if it improves hover/focus.
  - City filter form submit button uses `.btn-primary`; "Clear filter" link uses `.muted` or similar.
  - DataView empty/error/loaded states preserved exactly.
  - Wrap in `.container-content`.

- [x] **Task 11 — Admin pages token-only pass** — modify `src/app/admin/spaces/page.tsx`, `[id]/page.tsx`, `src/app/admin/bookings/page.tsx`:
  - Apply typography (`.page-h1`, `.h2`), button classes (`.btn-primary` for "New Space" / "Confirm" / "Reject"), card classes where applicable.
  - **No structural change.** Sub-nav from US-4.1 unchanged. Inline forms from US-2.4 keep their structure. Confirm/Reject/Cancel button positions unchanged.
  - Reject button keeps its red-outlined treatment — but verify the new `.btn` variant in shared.css doesn't conflict; if a `.btn-danger-outline` or similar class exists, use it; if not, keep the existing inline classes.

- [x] **Task 12 — Local CI parity:**
  - `pnpm typecheck` clean
  - `pnpm lint` clean
  - `pnpm test` — 95 prior pass; minor adjustments to `status-badge.test.tsx` if it asserts on specific Tailwind class names; new tests not required.
  - `pnpm build` — successful, route count unchanged (no new routes), all 27 routes still register.
  - `pnpm test:e2e` — at least 31 prior tests still pass; some E2E tests may need updates if they assert on specific text/structure that the reskin changes:
    - `tests/e2e/header.spec.ts` — asserts header brand link + "Log in" / "Register" links. May still pass if class names don't break the role-based queries (`getByRole('link', { name: /log in/i })`). Update if assertion fails.
    - `tests/e2e/login.spec.ts` / `register.spec.ts` — assert form fields by label. Should pass with new classes since `<label>` elements still have the right `htmlFor`.
    - `tests/e2e/browse.spec.ts` / `space-detail.spec.ts` — visit URLs and check status codes; should not be visually-coupled.
    - `tests/e2e/bookings.spec.ts` / `admin-bookings.spec.ts` / `admin-spaces.spec.ts` — REST endpoint tests; not visually coupled.
  - **Apply minimum-necessary E2E updates only** — don't expand E2E coverage in this story.

- [ ] **Task 13 — Manual verification (BA's eyeball — verification §10):** *(DEFERRED to BA's review pass — dev-agent ran browser-interactive smoke checks via Playwright (golden paths + edge cases) but does not own §10's eyeball acceptance.)*
  - Login + Register match `04-login.html` / `03-register.html` direction.
  - Space Detail has breadcrumbs, numbered sections, sticky sidebar, auto-fetching date picker (no button), `.avail` pills.
  - My Bookings groups by section (Awaiting / Upcoming / Past).
  - All status badges show dot + label structure.
  - Header has hexagon logo, sticky on scroll, audience-appropriate nav.
  - Footer appears at bottom of every page.
  - All Phase 1 flows still work: register → auto-login → browse → book → see in my-bookings → cancel → admin confirm/reject.
  - No console errors.
  - Inter loads via `next/font/google` (no CDN `<link>`).
  - Tabular numerals on prices ($25.00) and dates (2026-12-15).

- [x] **Task 14 — Single commit (AC-15)** — `feat: design reskin — public screens (Story 5-1)`.

## Dev Notes

### What gets built and what's deliberately out of scope

This is the **first story of Epic 5 — Design Integration** and the **first non-functional story** of the project. After it lands at `review`:

- The 5 designed screens (Browse / Space Detail / Register / Login / My Bookings) match Makhbuba's visual direction.
- Site-wide chrome (header, footer, typography, color palette, status badges) is consistent.
- One structural change ships (auto-fetching date picker on Space Detail).
- One structural reorganization ships (status sections on My Bookings).
- One layout structural change ships (sticky header + hexagon logo + footer).
- All Phase 1 functional behavior is preserved unchanged.

Feature scope (Story 5.1 only):
- ✅ Consolidated `globals.css` with `@theme {}` tokens + component classes
- ✅ Inter via `next/font/google`
- ✅ Sticky site header with hexagon logo + audience-aware nav
- ✅ Site footer
- ✅ Auth screens reskin (Register + Login) with `.auth-card`
- ✅ Space Detail reskin with breadcrumbs + numbered sections + sticky sidebar + auto-fetching date picker + `.avail` pills
- ✅ My Bookings reskin with status sections (Awaiting / Upcoming / Past)
- ✅ StatusBadge reskin with `.dot` + class composition
- ✅ Browse Spaces token-only pass (page heading + card classes + button classes)
- ✅ Admin token-only pass (typography + buttons; structural reskin lands tomorrow in Story 5-2)

Out of scope for Story 5.1 (do NOT build):
- ❌ Marketing landing page from `01-landing.html` — Phase 2 (BA Decisions §1 carry-over).
- ❌ Admin screen full reskin — Story 5-2 tomorrow when Makhbuba's admin designs land.
- ❌ Star ratings, review counts, "Spots left", amenity icons — Phase 2 (no schema changes per BA Decisions §8).
- ❌ Photo carousels (`Space.images` array replacing single `primaryImageUrl`) — Phase 2.
- ❌ Booking detail page ("View details" links from My Bookings) — Phase 2.
- ❌ "Requested X days ago" relative timestamps — Phase 2.
- ❌ Desk sub-area labels (`Desk.area`) — Phase 2.
- ❌ Forgot password / password reset — Phase 2.
- ❌ Profile / account settings — Phase 2.
- ❌ Email templates / notification UI — Phase 2.
- ❌ Photo upload UI — Phase 2.
- ❌ Modal dialogs anywhere — anti-pattern per Doc B §7.5 + brief.txt §6.
- ❌ Dark mode — Phase 2 (explicitly removing the existing `prefers-color-scheme: dark` block).
- ❌ Mobile-first layouts — desktop-first per brief.txt §11; mobile is "should work in mobile browsers" but not formally designed for Phase 1.
- ❌ Multi-language toggles — Phase 2.
- ❌ The `How it works` link in the public header — references Phase 2 marketing landing content; including the link without the destination is broken UX.

### Key decisions

1. **Path correction: `(public)/` not `(auth)/`.** BA Decisions reference `app/(auth)/register/page.tsx` and `app/(auth)/login/page.tsx`, but the actual route group from US-1.1 / US-1.2 is `app/(public)/register/` and `app/(public)/login/`. **Do not rename the route group.** That would be a structural change beyond this story's scope and break the existing route resolution.

2. **`How it works` link omitted.** BA Decisions §2 lists it in the Public header. The link's destination would be the marketing landing (`01-landing.html`), explicitly Phase 2. Shipping the link without the destination is broken UX. **Decision in this story: omit the link.** Re-add when the marketing landing lands. Documented in AC-3 as a deliberate scope deviation; resolve with BA at review if challenged.

3. **My Bookings PAST section composition.** BA Decisions §3d allows either a single PAST section or omitting Cancelled/Rejected entirely. **Decision in this story: render a `PAST` section** containing CANCELLED + REJECTED + CONFIRMED-past-dated rows (consolidates terminal/historical states; matches the design HTML's likely shape per its file structure). The "CONFIRMED-past-dated" partition lets users see their booking history without any data loss. If Makhbuba's HTML shows a different shape, reconcile during dev-story implementation.

4. **`aria-disabled` AND `disabled` for buttons.** `aria-disabled="true"` is for ARIA semantics; `disabled` actually prevents form submission. Native buttons in submit forms need both for visual + functional disabling. **Decision: keep `disabled` (existing behavior) AND add `aria-disabled` for screen-reader / styling consistency.** The shared.css selectors target both.

5. **No `@theme inline {}` — only standard `@theme {}`.** Existing globals.css uses `@theme inline {}` (which references CSS variables defined elsewhere). Makhbuba's design uses the standard `@theme {}` (variables defined directly in the block). **Replace with the standard form** — Tailwind v4 supports both, but Makhbuba's tokens are scope-complete in the standard form.

6. **Strip the duplicate `@theme {}` from shared.css before merging.** shared.css starts with its own `@theme {}` block (likely intended for self-contained demos). When merging into globals.css, only ONE `@theme {}` block can exist; keep the one from globals.css (which is the canonical source) and discard shared.css's duplicate.

7. **Auto-fetching date picker is a Client Component.** Server Components can't have event handlers. Extract the `<input type="date" onChange={...}>` into a small Client Component (`<DatePickerForm>`) that uses `useRouter().push(...)` to navigate. The Server Component page continues to read `searchParams.date`.

8. **Tabular numerals via `.tnum` (or `font-feature-settings`).** Prices and dates need tabular numerals so digits align in lists. Apply to `<span>` / `<td>` rendering money or dates. The `.tnum` utility class from shared.css is the canonical surface; alternatively, body styles can include `font-feature-settings: "tnum" 1;` globally — the design package likely intends per-element opt-in.

9. **Status section grouping in JS, not in the SQL query.** `listBookingsForGuest` already returns rows sorted by `booking_date DESC, created_at DESC` (US-3.4). The page partitions the array into three sections client-side (in the Server Component's render). No new query, no schema change, no ordering change.

10. **Hexagon logo via CSS `clip-path`, not SVG.** Faster to ship; no asset pipeline needed. The shared.css `.logo-mark` definition uses `clip-path: polygon(...)`. Falls back to a square on browsers without `clip-path` support (acceptable degradation).

11. **The `nextCookies()` plugin from `1864bde` is preserved.** Without it, `signInEmail` / `signUpEmail` / `signOut` don't actually set browser cookies. **No changes to `src/lib/auth/config.ts` in this story.**

12. **The login `callbackUrl` same-origin guard from US-3.3 is preserved.** The hidden `callbackUrl` input in the login form continues to render. The `loginAction`'s `safeCallback` validation logic is unchanged.

### Architecture compliance

- Validation: N/A (no input changes).
- Form pattern: native `<form action={serverAction}>` + `useActionState` + `useFormStatus`. **Unchanged for register/login/booking/cancel/confirm/reject.** The auto-fetching date picker is a special case — it's not a form submission, it's a `router.push()` URL update.
- State management: per-form `useActionState` only. **No new client-side state.**
- Component library: still none. Raw class composition via the new shared.css component classes.
- Authorization: layout-level guard for `/admin/*` (US-2.2) unchanged. Page-level `requireSession` for `/my-bookings` unchanged. Auth flow for register/login unchanged.
- Error response shape (REST): unchanged.
- Status codes (REST): unchanged.
- Auth API: `requireSession` + `requireRole` unchanged. `auth.api.getSession({ headers })` in the Header Server Component unchanged.
- Reskinnable frontend: this IS the reskin. Component classes from shared.css replace the inline Tailwind utility soup.
- Accessibility: `aria-invalid="true"` on invalid inputs; `aria-disabled="true"` on disabled buttons; `<label htmlFor>` linkage preserved.

### Code sketches

#### `src/app/globals.css` (consolidated — replaces existing)

```css
@import "tailwindcss";

@theme {
  /* === Full token block from docs/design/.../globals.css === */
  /* (brand 50-900, neutrals 0-950, status pairs, type scale, spacing,
     layout tokens, radii, shadows, motion easing) */
  /* ... */
}

/* === Component classes from docs/design/.../screens/shared.css ===
   (BUT: strip the duplicate @theme {} block at the top of shared.css
    before pasting; only the one above survives.) */

.site-header { /* ... */ }
.btn { /* ... */ }
.btn-primary { /* ... */ }
.input { /* ... */ }
.badge { /* ... */ }
.badge-pending { /* ... */ }
.dot { /* ... */ }
.avail { /* ... */ }
.card { /* ... */ }
/* ... etc */

body {
  font-family: var(--font-sans);
  background: var(--color-background);
  color: var(--color-foreground);
  font-feature-settings: "ss01" 1, "cv11" 1; /* Inter stylistic alternates if used */
}

.tnum {
  font-feature-settings: "tnum" 1;
  font-variant-numeric: tabular-nums;
}
```

#### `src/app/layout.tsx` (Inter + Header + Footer)

```tsx
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { Header } from "@/components/header";
import "./globals.css";

const inter = Inter({
  variable: "--font-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "DeskHive",
  description: "Discover and book coworking desks.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        <Header />
        <div className="flex-1">{children}</div>
        <footer className="site-footer">
          <div className="site-footer-inner">
            {/* shared.css template — copyright + minor links, no marketing */}
          </div>
        </footer>
      </body>
    </html>
  );
}
```

#### `src/components/header.tsx` (sticky + audience nav)

(Server Component; reads session as today via `auth.api.getSession({ headers: await headers() })`. Replaces existing className composition with `.site-header` + `.site-header-inner`. Adds hexagon `.logo-mark`. Audience-aware nav per AC-3. The existing `<LogoutButton>` Client Component (US-1.3) is reused; only its visual classes change.)

#### `src/app/spaces/[id]/date-picker-form.tsx` (NEW Client Component)

```tsx
'use client';

import { useRouter } from 'next/navigation';
import { todayIso } from '@/lib/format';

export function DatePickerForm({
  spaceId,
  initialDate,
}: {
  spaceId: string;
  initialDate: string;
}) {
  const router = useRouter();
  return (
    <input
      type="date"
      name="date"
      min={todayIso()}
      defaultValue={initialDate}
      onChange={(e) => {
        const value = e.target.value;
        if (value) router.push(`/spaces/${spaceId}?date=${value}`);
      }}
      className="input"
    />
  );
}
```

(The Server Component `page.tsx` replaces the `<form>...<button>Show availability</button></form>` block with `<DatePickerForm spaceId={space.id} initialDate={dateResult.valid ? dateResult.iso : ''} />`.)

#### `src/components/status-badge.tsx` (reskin)

```tsx
import type { BookingStatus } from '@/db/schema';

const VARIANT_CLASS: Record<BookingStatus, string> = {
  PENDING: 'badge-pending',
  CONFIRMED: 'badge-confirmed',
  REJECTED: 'badge-rejected',
  CANCELLED: 'badge-cancelled',
};

const LABEL: Record<BookingStatus, string> = {
  PENDING: 'Pending',
  CONFIRMED: 'Confirmed',
  REJECTED: 'Rejected',
  CANCELLED: 'Cancelled',
};

export function StatusBadge({ status }: { status: BookingStatus }) {
  return (
    <span className={`badge ${VARIANT_CLASS[status]}`}>
      <span className="dot" />
      {LABEL[status]}
    </span>
  );
}
```

#### My Bookings status section partitioning (sketch)

```tsx
const today = todayIso();

const awaiting = rows.filter(r => r.booking.status === 'PENDING');
const upcoming = rows.filter(
  r => r.booking.status === 'CONFIRMED' && r.booking.bookingDate >= today
);
const past = rows.filter(
  r =>
    r.booking.status === 'CANCELLED' ||
    r.booking.status === 'REJECTED' ||
    (r.booking.status === 'CONFIRMED' && r.booking.bookingDate < today)
);

// Render three <section>s only if non-empty; if all three are empty, render
// the existing empty-state copy from US-3.4 (verbatim from designer brief).
```

### File-structure requirements

After this story:

```
deskhive/
├── src/
│   ├── app/
│   │   ├── globals.css                          # UPDATED — full token block + component classes
│   │   ├── layout.tsx                           # UPDATED — Inter, sticky header, footer
│   │   ├── page.tsx                             # UPDATED — token-only pass (.page-h1, .card, .btn-primary)
│   │   ├── (public)/
│   │   │   ├── login/
│   │   │   │   ├── page.tsx                     # UPDATED — heading + subtitle + footer link
│   │   │   │   └── login-form.tsx               # UPDATED — .auth-card + .input + .field-label
│   │   │   └── register/
│   │   │       ├── page.tsx                     # UPDATED — heading + subtitle + footer link + Terms text
│   │   │       └── register-form.tsx            # UPDATED — .auth-card + .input + .field-label + .field-help
│   │   ├── spaces/[id]/
│   │   │   ├── page.tsx                         # UPDATED — breadcrumbs + numbered sections + sticky sidebar + .avail pills
│   │   │   ├── book-desk-button.tsx             # UPDATED — .btn-primary classes (behavior unchanged)
│   │   │   └── date-picker-form.tsx             # NEW — Client Component for auto-fetching date picker
│   │   ├── my-bookings/
│   │   │   ├── page.tsx                         # UPDATED — status sections + .badge-lg variant
│   │   │   └── cancel-booking-button.tsx        # UPDATED — visual classes only
│   │   └── admin/
│   │       ├── layout.tsx                       # UPDATED — token-only consistency (sub-nav unchanged)
│   │       ├── spaces/page.tsx                  # UPDATED — token-only consistency
│   │       ├── spaces/[id]/page.tsx             # UPDATED — token-only consistency
│   │       ├── spaces/new/page.tsx              # UPDATED — token-only consistency
│   │       └── bookings/
│   │           ├── page.tsx                     # UPDATED — token-only consistency
│   │           ├── confirm-booking-button.tsx   # UPDATED — visual classes only
│   │           └── reject-booking-button.tsx    # UPDATED — visual classes only
│   └── components/
│       ├── header.tsx                           # UPDATED — sticky + hexagon + audience nav
│       ├── logout-button.tsx                    # UPDATED — visual classes only
│       └── status-badge.tsx                     # UPDATED — .badge + .dot composition
└── tests/
    └── e2e/
        ├── header.spec.ts                       # UPDATED iff assertions break
        └── (other E2E specs only updated if assertions break)
```

Files NOT touched:
- `deskhive/src/db/schema.ts` — schema unchanged (BA Decisions §8 explicit).
- `deskhive/src/db/queries/*` — query helpers unchanged. Status-section grouping happens in the page render layer.
- `deskhive/src/actions/*` — Server Actions unchanged. Auto-fetching date picker doesn't introduce a Server Action.
- `deskhive/src/lib/auth/*` — auth config + guards unchanged. `nextCookies()` plugin from `1864bde` preserved.
- `deskhive/src/lib/db-errors.ts`, `format.ts`, `availability.ts`, `validation/*` — all unchanged.
- `deskhive/src/lib/http.ts` — REST helpers unchanged.
- `deskhive/src/lib/logger.ts` — unchanged.
- `deskhive/src/proxy.ts` — proxy matcher unchanged.
- `deskhive/src/app/api/**/*` — REST endpoints unchanged.
- `deskhive/src/components/data-view.tsx` — primitive unchanged (presentation lives in the consuming pages now).
- `deskhive/middleware.ts` does not exist (Next 16 uses `proxy.ts`); no change needed.

### Anti-patterns — explicit DO-NOTs

- ❌ Reproducing Makhbuba's hardcoded mock data (rating values, "spots left" numbers, sample bookings). Real data continues to come from the database.
- ❌ Applying Makhbuba's `localStorage` demo code from `<script>` blocks in her HTML files. Production uses Better Auth sessions.
- ❌ Adding new schema fields. `Space.amenities`, `Space.rating`, `Space.reviewCount`, `Space.capacity`, `Space.images` (multi-photo) — all Phase 2.
- ❌ Adding new pages. No marketing landing, no booking detail page, no profile page, no "How it works" page.
- ❌ Adding new Server Actions or REST endpoints.
- ❌ Renaming the `(public)/` route group to `(auth)/`. Path stays.
- ❌ Adding the "How it works" link to the public header. References Phase 2 marketing landing.
- ❌ Adding the Google Fonts CDN `<link>` tag. Use `next/font/google` only.
- ❌ Touching `nextCookies()` plugin or any Better Auth config.
- ❌ Touching the `callbackUrl` same-origin guard.
- ❌ Touching the conditional UPDATE state-machine queries.
- ❌ Removing the verbatim error messages from US-2.3 / US-3.3 / US-3.5 / US-4.2 / US-4.3.
- ❌ Removing the verbatim empty-state copy from US-3.4 (`"You haven't booked anything yet. Browse spaces to get started."`).
- ❌ Removing the deterministic sort order from US-3.4 (`booking_date DESC, created_at DESC`).
- ❌ Removing tabular numerals from prices/dates.
- ❌ Modal dialogs anywhere. Doc B §7.5 forbids them.
- ❌ Custom interactive widgets (custom dropdown, custom modal, custom autocomplete). Brief.txt §6 forbids; native HTML semantics only.
- ❌ Custom date picker. Brief.txt §6 + §7 explicitly require browser-native `<input type="date">`.
- ❌ Dark-mode media query (`@media (prefers-color-scheme: dark)`). Phase 2.
- ❌ Mobile-first redesign. Desktop-first per brief.txt §11.
- ❌ Multi-language toggles.

### Project structure notes

- Story 5.1 introduces **Epic 5 — Design Integration** as a synthetic epic (similar to Epic 0 — Scaffolding from US-0.x). Sprint-status.yaml needs an `epic-5` block added (see Task 14 — actually included in Task 0/14 implicitly; will need a small YAML edit during dev-story).
- After Story 5-1 + 5-2 land, Phase 1 is fully closed including design.
- The component class system in shared.css is the **first formalized component library in the project**, even though it's just CSS classes. Future stories that add new UI elements (Phase 2 features) should extend shared.css patterns rather than reverting to inline Tailwind utility classes.
- The `<DatePickerForm>` Client Component is the first time we've extracted a tiny URL-driven Client Component (no Server Action, just `useRouter().push()`). Pattern is available for any future "auto-submit on change" controls.
- The status-section grouping logic on My Bookings is the first time we've partitioned a query result into UI sections in the render layer. Pattern is available for any future grouping (e.g., admin bookings by space, by date, etc. — all Phase 2).

### Previous story intelligence

- **All 18 prior stories (Epics 0-4)** are at `review`. Phase 1 is functionally complete; this story is the design layer.
- **Patterns preserved (replicate, don't deviate):**
  - Server Components fetch via Drizzle directly.
  - `<DataView>` for list-shaped pages with empty/error states.
  - Async `params` and `searchParams` (Next 16).
  - Conditional-UPDATE for state-machine transitions.
  - Verbatim PRD error strings.
  - Layout-level guard for `/admin/*` (US-2.2).
  - Per-form `useActionState` with hidden inputs (no `.bind`).
  - One feature story → one `feat:` commit.
  - `revalidatePath` for ALL surfaces affected by writes.
  - redirect-AFTER-try-catch for Server Actions.

### Sprint status update (Task 14 also adds the Epic 5 block to YAML)

`_bmad-output/implementation-artifacts/sprint-status.yaml` needs a new block appended after `epic-4-retrospective`:

```yaml
  # ─────────────────────────────────────────────────────────────────
  # Epic 5 — Design Integration (synthetic, post-functional)
  # ─────────────────────────────────────────────────────────────────
  epic-5: in-progress
  5-1-design-reskin-public-screens: ready-for-dev
  5-2-design-reskin-admin-screens: backlog
  epic-5-retrospective: optional
```

The dev-story task should make this YAML edit alongside the code changes. Note in completion that Epic 5 is a synthetic container (like Epic 0), not part of Doc B §8.

### Recent commits

```
0583a43 feat: admin reject booking (US-4.3)              ← Last functional commit
1180df6 feat: admin confirm booking (US-4.2)
559011c feat: admin view all bookings (US-4.1)
8be46e7 feat: guest cancel pending booking (US-3.5)
6f29214 feat: GET /bookings/me + price on my-bookings (US-3.4)
db5819a feat: guest create booking + minimal my bookings (US-3.3)
1feff2d feat: public view space detail (US-3.2)
8d7bb48 feat: public browse spaces page (US-3.1)
571e8a0 feat: admin edit desk (US-2.4)
12bee8b fix: surface verbatim duplicate-label error in add-desk form (US-2.3 follow-up)
4ea877b feat: admin add desk to space (US-2.3)
3bd3906 feat: admin edit space (US-2.2)
9f79cf1 feat: admin create space (US-2.1)
1864bde fix: register nextCookies plugin so signIn/signOut actually set cookies (US-1.3 follow-up)
826bf32 feat: logout button and global header (US-1.3)
579071b feat: login page and server action (US-1.2)
b7bd9fa feat: guest registration page and server action (US-1.1)
```

Story 5.1 is the **first non-functional commit**. Subject: `feat: design reskin — public screens (Story 5-1)`.

### References

- [Source: docs/design/5-1-design-reskin-ba-decisions.md](docs/design/5-1-design-reskin-ba-decisions.md) — BA decisions document (this story's source of truth).
- [Source: docs/design/DeskHive - Coworking Space Booking Web App/brief.txt](docs/design/DeskHive - Coworking Space Booking Web App/brief.txt) — designer's full intent.
- [Source: docs/design/DeskHive - Coworking Space Booking Web App/globals.css](docs/design/DeskHive - Coworking Space Booking Web App/globals.css) — `@theme {}` token source.
- [Source: docs/design/DeskHive - Coworking Space Booking Web App/screens/shared.css](docs/design/DeskHive - Coworking Space Booking Web App/screens/shared.css) — component class definitions.
- [Source: docs/design/DeskHive - Coworking Space Booking Web App/screens/02-space-detail.html](docs/design/DeskHive - Coworking Space Booking Web App/screens/02-space-detail.html) — Space Detail visual reference.
- [Source: docs/design/DeskHive - Coworking Space Booking Web App/screens/03-register.html](docs/design/DeskHive - Coworking Space Booking Web App/screens/03-register.html) — Register visual reference.
- [Source: docs/design/DeskHive - Coworking Space Booking Web App/screens/04-login.html](docs/design/DeskHive - Coworking Space Booking Web App/screens/04-login.html) — Login visual reference.
- [Source: docs/design/DeskHive - Coworking Space Booking Web App/screens/05-my-bookings.html](docs/design/DeskHive - Coworking Space Booking Web App/screens/05-my-bookings.html) — My Bookings visual reference.
- [Source: docs/design/DeskHive - Coworking Space Booking Web App/uploads/DeskHive_Design_Brief_v2.pdf](docs/design/DeskHive - Coworking Space Booking Web App/uploads/DeskHive_Design_Brief_v2.pdf) — original brief PDF (referenced by US-3.4's empty-state copy correction).
- [Source: docs/02-phase1-prd.md] — Phase 1 PRD (functional source of truth; preserved unchanged).
- [Source: deskhive/AGENTS.md] — Next.js 16 caveats.
- All 18 Phase 1 implementation artifacts in `_bmad-output/implementation-artifacts/` — pattern source.

## Dev Agent Record

### Agent Model Used

`claude-opus-4-7[1m]` (Claude Opus 4.7, 1M-context). Same agent across the full implementation; no model swap mid-story.

### Debug Log References

| # | Phase | Symptom | Root cause | Fix |
|---|---|---|---|---|
| 1 | Bulk file rewrites | 19 files showed TS1128/TS1109 typecheck errors after batched Write calls. | `Write` tool calls embedded a literal `</content>` line at the bottom of each file. | One-shot PowerShell pass with `(?s)</content>\s*\z` regex; stripped trailer from all 19 files. |
| 2 | Bulk file rewrites | After fix #1, 15 files showed Cyrillic mojibake on em-dashes (`—`), middle-dots (`·`), ellipses (`…`). | `Set-Content -Encoding UTF8` on this user's Russian-locale Windows reinterprets UTF-8 bytes through the Windows-1251 codepage. | Recovery pass via `[System.IO.File]::ReadAllText/WriteAllText` with `New-Object System.Text.UTF8Encoding $false` and search-and-replace over known mojibake byte sequences. Pattern saved to memory for future stories. |
| 3 | E2E suite (Playwright) | `tests/e2e/header.spec.ts` matched multiple `<header>` elements after page-level `<header>` tags were introduced inside `<main>` (Space Detail, My Bookings, /). | Generic `page.locator('header')` is too broad once any page-section also uses `<header>`. | Switched to the explicit `.site-header` class. Same spec also adjusted "Register" → "Sign up" link text. |
| 4 | E2E suite | `login.spec.ts` heading regex `/log in/i` failed; `register.spec.ts` and `login.spec.ts` `.text-red-700` selector failed. | Story 5.1 changes: heading copy "Log in" → "Welcome back" (button text unchanged); validation error class `.text-red-700` → `.field-error`. | Updated regex + selectors in both specs. |
| 5 | E2E suite | `browse.spec.ts` heading regex `/^spaces$/i` failed. | Heading copy changed from "Spaces" → "Browse spaces" to match public nav label. | Updated regex. |
| 6 | Unit (Vitest) | `status-badge.test.tsx` asserted on old Tailwind utility classes (`bg-yellow-100`, `text-yellow-800`, …). | AC-10 requires `.badge` + `.badge-{variant}` composition. | Rewrote tests to assert on new class names; added two new tests for `.dot` element + `size="lg"` → `.badge-lg`. 6 tests, all green. |

### Completion Notes List

**Mid-execution corrections (vs. BA Decisions doc):**

1. **Path correction confirmed.** BA Decisions §3a/3b reference `(auth)/`; actual route group is `(public)/` from US-1.1 / US-1.2. Greenlit by BA before dispatch. No rename — kept `src/app/(public)/login/` and `src/app/(public)/register/`.
2. **`How it works` link omitted.** Public header per Makhbuba's design includes it; the destination would be the marketing landing (Phase 2). Greenlit by BA. Re-add when marketing landing ships.
3. **My Bookings PAST section composition.** BA Decisions §3d allowed either single PAST or no terminal sections. Shipped: PAST = CANCELLED ∪ REJECTED ∪ (CONFIRMED ∧ bookingDate < today). Greenlit by BA.

**Implementation observations worth carrying forward:**

1. **Auto-fetching date picker** lives in `src/app/spaces/[id]/date-picker-form.tsx` as a Client Component. Uses `useRouter().push()` + `useTransition()` for non-blocking navigation; `aria-busy` reflects pending state. The Server Component page continues to read `searchParams.date` — no behavioral change to the booking flow.
2. **Status sections** on `/my-bookings` partition `listBookingsForGuest`'s sorted array entirely in the page render — no new query, no schema change, no ordering change. Empty state ("You haven't booked anything yet…") triggers when **all three** sections are empty.
3. **`StatusBadge` size prop** added (`'sm' | 'lg'`, default unset) so the page can pass `size="lg"` for `CONFIRMED` rows in UPCOMING per the design HTML; default omits the size class.
4. **Sticky right sidebar** on Space Detail uses `top: calc(var(--layout-header-h) + 1.5rem)` so it doesn't collide with the sticky header.
5. **Disabled button styling** wires `:disabled` AND `[aria-disabled="true"]`; the existing `useFormStatus().pending` logic continues to set the native `disabled` attribute (preserving form-submission semantics).
6. **Inter loaded via `next/font/google`** with `variable: '--font-inter'`. The design's `--font-sans` token in `@theme {}` resolves through this variable; no Google Fonts CDN `<link>` tag.
7. **Hexagon logo** uses `clip-path: polygon(25% 5%, 75% 5%, 100% 50%, 75% 95%, 25% 95%, 0% 50%)` from shared.css — no SVG asset.
8. **Dark-mode block removed** from globals.css (`@media (prefers-color-scheme: dark)`); design is light-mode only for Phase 1.
9. **`@theme {}`, not `@theme inline {}`.** Standard form because Makhbuba's tokens are self-contained in the block.
10. **Footer wired to `min-h-full flex flex-col`** body + `flex-1` children wrapper from US-1.3, so the footer pushes to the bottom on short pages.
11. **Verbatim error strings preserved everywhere.** Spot-checked: duplicate-email registration, double-booking 409, FORBIDDEN/CANNOT_CANCEL, admin reject reason validation, duplicate desk label. None changed.
12. **All cross-cutting framework choices preserved:** `nextCookies()` plugin, conditional UPDATE pattern, `revalidatePath` for booking writes, redirect-after-try-catch in Server Actions, layout-level `/admin/*` guard, callbackUrl guard from US-3.3, sort order `booking_date DESC, created_at DESC`.

**Browser-interactive verification (Playwright smoke pass before E2E run):**

- Public flow: `/` → click space card → `/spaces/<id>` → date picker auto-fetches → `/my-bookings` shows empty state → `/login` and `/register` render `.auth-card`.
- Guest flow: register → auto-login → header shows user pill → book → see in My Bookings under AWAITING CONFIRMATION → cancel → status moves to PAST.
- Admin flow: login as `admin@deskhive.local` → `/admin/spaces` → confirm/reject buttons render with new classes → `/admin/bookings` paginates by status filter.
- Console: clean across all pages; no React hydration warnings; no missing-key warnings.

### File List

**New (1):**
- `deskhive/src/app/spaces/[id]/date-picker-form.tsx` — Client Component for auto-fetching date picker.

**Modified — design surface (20):**

- `deskhive/src/app/globals.css` — full design system (tokens + component classes + base styles).
- `deskhive/src/app/layout.tsx` — Inter via `next/font/google`; site footer.
- `deskhive/src/components/header.tsx` — `.site-header`, hexagon logo, audience-aware nav, user pill.
- `deskhive/src/components/logout-button.tsx` — `.btn-ghost` styling.
- `deskhive/src/components/status-badge.tsx` — `.badge` + `.badge-{variant}` + `.dot`; `size?: 'sm' | 'lg'` prop.
- `deskhive/src/components/status-badge.test.tsx` — assertions updated for new class names; +2 tests.
- `deskhive/src/app/page.tsx` — Browse Spaces token-only pass; `.page-h1`, `.card`, `.btn-primary`.
- `deskhive/src/app/spaces/[id]/page.tsx` — breadcrumbs, two-column layout, sticky sidebar, hero image, `.avail` pills, `<DatePickerForm>` integration.
- `deskhive/src/app/spaces/[id]/book-desk-button.tsx` — `.btn-primary` + `aria-disabled`.
- `deskhive/src/app/(public)/login/page.tsx` — `.container-narrow`, "Welcome back" heading + subtitle.
- `deskhive/src/app/(public)/login/login-form.tsx` — `.auth-card`, `.input`, `.field-label`, `.field-help`, `.field-error`.
- `deskhive/src/app/(public)/register/page.tsx` — `.container-narrow`, "Create your account" heading + subtitle.
- `deskhive/src/app/(public)/register/register-form.tsx` — `.auth-card` + field classes.
- `deskhive/src/app/my-bookings/page.tsx` — status sections (AWAITING / UPCOMING / PAST), section counts, BookingCard helper.
- `deskhive/src/app/my-bookings/cancel-booking-button.tsx` — `.btn` variant.
- `deskhive/src/app/admin/layout.tsx` — admin chrome token pass.
- `deskhive/src/app/admin/spaces/page.tsx` + `new/page.tsx` + `new/create-space-form.tsx` + `[id]/page.tsx` + `[id]/edit-space-form.tsx` + `[id]/add-desk-form.tsx` + `[id]/edit-desk-form.tsx` — typography + button classes.
- `deskhive/src/app/admin/bookings/page.tsx` + `confirm-booking-button.tsx` + `reject-booking-button.tsx` — typography + button classes; status badges via reskinned component.

**Modified — tests (4):**
- `deskhive/tests/e2e/header.spec.ts` — `.site-header` selector; "Sign up" link text.
- `deskhive/tests/e2e/login.spec.ts` — "Welcome back" heading; `.field-error` selector.
- `deskhive/tests/e2e/register.spec.ts` — `.field-error` selector.
- `deskhive/tests/e2e/browse.spec.ts` — "Browse spaces" heading.

**Modified — orchestration:**
- `_bmad-output/implementation-artifacts/sprint-status.yaml` — Epic 5 block; `5-1` → `review`.
- `_bmad-output/implementation-artifacts/5-1-design-reskin-public-screens.md` — Status / tasks / Dev Agent Record / Change Log (this file).

### Change Log

| Date | Change | Commit |
|---|---|---|
| 2026-05-07 | Story drafted by `bmad-create-story` from BA decisions document. | (none) |
| 2026-05-07 | Story implemented; reskin landed. Single commit per AC-15. | `adabba7` |
| 2026-05-07 | Browser-verified by BA against AC-14 10-point checklist; greenlit. Admin Confirm button accepted as `.btn-primary` (brand indigo) — design system evolution from US-4.3's gray-900; Story 5-2 may revisit. | (this follow-up) |
