# BA Decisions — Story 5-1: Design Reskin (Public Screens)

**Story title:** `5-1-design-reskin-public-screens`

**Context:** Designer Makhbuba delivered partial design package today (5 of 8 screens). Public/guest screens are designed; admin screens will be delivered tomorrow at 10am Tashkent time when her Claude Design weekly limit resets. This story applies the public-screen designs. Story 5-2 will follow tomorrow for admin screens.

---

## Source artifacts (Amelia reads from these)

- `docs/design/DeskHive - Coworking Space Booking Web App/globals.css` — design tokens v2 (8 KB)
- `docs/design/DeskHive - Coworking Space Booking Web App/screens/shared.css` — component class definitions (16 KB)
- `docs/design/DeskHive - Coworking Space Booking Web App/screens/02-space-detail.html` — Space Detail design reference
- `docs/design/DeskHive - Coworking Space Booking Web App/screens/03-register.html` — Register design reference
- `docs/design/DeskHive - Coworking Space Booking Web App/screens/04-login.html` — Login design reference
- `docs/design/DeskHive - Coworking Space Booking Web App/screens/05-my-bookings.html` — My Bookings design reference
- `docs/design/DeskHive - Coworking Space Booking Web App/brief.txt` — designer's full intent (read first for context)

**Files Amelia should NOT use this story:**
- `01-landing.html` and variants — marketing landing page deferred to Phase 2
- `admin.css` — admin design language for Story 5-2 tomorrow
- `tweaks-panel.js` — Claude Design tooling artifact, ignore

---

## Scope

Visual reskin + 3 small structural changes. **No schema changes, no new Server Actions, no new REST endpoints, no new pages.**

---

## Decisions

### 1. Consolidated `src/app/globals.css` (single file)

Replace existing `globals.css` with:

- `@theme {}` block from Makhbuba's `globals.css` (full token set: brand 50-900 indigo scale, neutrals 0-950 slightly cool scale, status pairs for all 4 booking states, Inter typography 5-step scale, spacing tokens, layout tokens, radii, shadows, motion easing)
- Base styles (body font, background, font-feature-settings, `.tnum` for tabular numerals)
- All component classes from Makhbuba's `shared.css`:
  - Buttons: `.btn`, `.btn-primary`, `.btn-secondary`, `.btn-sm`, disabled state via `:disabled` and `[aria-disabled="true"]`, `.spinner`
  - Inputs: `.input`, `.field-label`, `.field-help`, `.field-error`, `aria-invalid="true"` styling
  - Status badges: `.badge`, `.badge-pending`, `.badge-confirmed`, `.badge-rejected`, `.badge-cancelled`, `.badge-lg` variant, `.dot` element inside badge
  - Availability: `.avail`, `.avail-yes`, `.avail-no` (for desk availability pills)
  - Cards: `.card`, `.card-link`, `.img-placeholder`
  - Header: `.site-header`, `.site-header-inner`, `.nav-link`, `.logo`, `.logo-mark` (CSS clip-path hexagon)
  - Layout: `.container-content` (1152px max), `.container-narrow` (576px max for auth)
  - Typography: `.page-h1`, `.page-display`, `.h2`, `.muted`, `.muted-strong`
  - User chrome: `.user-pill`, `.user-avatar`
  - Footer: `.site-footer`, `.site-footer-inner`
  - Misc: `hr.rule`

**Strip the duplicate `:root {}` block from shared.css** — not needed in Tailwind v4 production. Only `@theme {}` is required for the token system to compile through Tailwind.

### 2. Update `src/app/layout.tsx`

- Use `next/font/google` to load Inter (weights 400, 500, 600, 700) with CSS variable `--font-sans`. **Do NOT** use the Google Fonts CDN `<link>` tag from Makhbuba's HTML demos — that's demo-only.
- Apply `.site-header` structure with hexagon logo mark (CSS clip-path, not SVG/image asset)
- Sticky header (`position: sticky; top: 0; z-index: 10;`)
- Add `.site-footer` at the bottom of the layout
- Header content varies by audience:
  - **Public (logged out):** logo + "Browse spaces" + "How it works" + "Log in" + "Sign up" (primary)
  - **Guest (logged in):** logo + "Browse spaces" + "My bookings" + user-pill (avatar + name) + "Log out"
  - **Super Admin:** logo + "Browse spaces" + "My bookings" + "Admin" link + user-pill + "Log out"

### 3. Reskin 4 screens using component classes

**a. `app/(auth)/register/page.tsx`** — translate patterns from `03-register.html`:
- Wrap form in `.auth-card` (white surface, large rounded corners, padding)
- Use `.input`, `.field-label`, `.field-help` for form fields
- Submit button: `.btn-primary` full-width
- Helper microcopy under fields ("We'll only email you about your bookings.", "8+ characters. No other rules — keep it strong.")
- Header: "Create your account" + subtitle "Find a desk, book a day, get to work."
- Footer link: "Already have an account? Log in"
- Terms/Privacy footer text

**b. `app/(auth)/login/page.tsx`** — translate patterns from `04-login.html`:
- Same `.auth-card` structure as register, simpler form (email + password only)
- Header: "Welcome back" + subtitle "Log in to manage your bookings."
- Footer link: "New to DeskHive? Create an account"

**c. `app/spaces/[id]/page.tsx`** — translate patterns from `02-space-detail.html`:
- Add breadcrumbs at top ("Browse spaces / [Space name]")
- Numbered section headers using brand-100 circles ("1 PICK A DATE", "2 Desks")
- **Two-column layout** on desktop: About + Amenities on left, sticky sidebar booking widget on right (`position: sticky; top: var(--layout-header-h);`)
- Desk rows use `.avail-yes` / `.avail-no` pills for availability indication
- "Book this desk" button uses `.btn-primary`; disabled state when desk unavailable (`aria-disabled="true"`)
- Hero photo at top, full-width within `.container-content`

**d. `app/my-bookings/page.tsx`** — translate patterns from `05-my-bookings.html`:
- **Adopt status sections** — group bookings by status:
  - "AWAITING CONFIRMATION" section (PENDING bookings) with explanatory subhead
  - "UPCOMING" section (CONFIRMED bookings, future-dated)
  - For Cancelled/Rejected: pick the cleaner UX based on the design HTML — either a "PAST" section or hide them
- Use `.badge-lg.badge-confirmed` (filled green, prominent) for confirmed-card variant if used in design HTML
- Standard `.badge-pending`, `.badge-cancelled`, `.badge-rejected` elsewhere
- Section count indicators (e.g., "AWAITING CONFIRMATION 2") on right side of section header

### 4. Reskin StatusBadge component

- Add `<span class="dot"></span>` element inside the badge before the label text
- All 4 variants (Pending amber, Confirmed green, Rejected red, Cancelled neutral) get the dot
- Use the `.badge` + `.badge-{variant}` class composition pattern from shared.css
- Replace any inline Tailwind classes with the new component class structure
- Keep the existing TypeScript prop interface — don't break consuming components

### 5. Browse Spaces (`/`) — token-only consistency pass

- **NO marketing landing page.** Skip `01-landing.html` entirely. Keep current flat-grid Browse Spaces layout.
- Apply typography tokens: `.page-h1` for the page title
- Apply card classes: `.card` for each space card, with hover/focus states
- Apply button classes for any primary actions
- Visual consistency only, no structural change

### 6. Admin pages — token-only consistency pass

- Apply typography, button, card classes for visual consistency with public screens
- No structural change to `/admin/spaces`, `/admin/spaces/[id]`, `/admin/bookings`
- Sub-nav stays as-is (added in US-4.1 by Amelia)
- Makhbuba's admin designs land tomorrow; full admin reskin happens in Story 5-2

### 7. Structural changes (the 3 small ones)

**a. Auto-fetch on date change in Space Detail**
Remove the "Show availability" button. The date picker becomes a small Client Component that auto-submits on `onChange`. Server Component continues to render desk availability based on URL `?date=` param. The button element is removed; the date input does the work.

**b. Status sections on My Bookings**
As described in 3d above — group by booking status using existing `status` field on the bookings table. No schema change.

**c. Hexagon logo mark + sticky header + footer**
As described in 2 above — `app/layout.tsx` change.

### 8. Architectural respect (anti-patterns explicitly forbidden)

- **No new schema fields.** Don't add `amenities`, `rating`, `reviewCount`, `capacity`, multi-photo arrays. All Phase 2.
- **No new pages.** No marketing landing, no booking detail page.
- **No new Server Actions or REST endpoints.** Reskin only touches presentation layer.
- **All existing Phase 1 functionality must continue working unchanged.** Login, register, browse, book, cancel (US-3.5), confirm (US-4.2), reject (US-4.3) — every flow verified yesterday must still work after reskin.
- **Don't apply Makhbuba's localStorage demo code.** The `<script>` blocks at the bottom of her HTML files are demo-only; production uses Better Auth sessions.
- **Don't reproduce Makhbuba's mock data.** Her HTML demos have hardcoded mock data (rating values, "spots left" numbers, sample bookings). Real data continues to come from the database.

### 9. Phase 2 backlog (Amelia documents in Dev Notes section, does NOT implement)

- Marketing landing page at `/` (from `01-landing.html`)
- Admin screen reskin (Story 5-2 tomorrow when Makhbuba finishes)
- Star ratings + reviews system (`Space.rating`, `Space.reviewCount`)
- "Spots left" capacity calculation
- Amenity icons (`Space.amenities` field — Wi-Fi, 24/7, Coffee, Monitor, Print, etc.)
- Photo carousels (`Space.images` array replacing single `primaryImageUrl`)
- Booking detail page ("View details" links from My Bookings)
- "Requested X days ago" relative timestamps
- Desk sub-area labels (`Desk.area` — e.g., "Desk-1 · Atrium · South-facing, lots of light")

### 10. Sprint status

This is Story 5-1 of a Phase 1 design integration epic. After 5-1 lands at review, Story 5-2 (admin screens) follows tomorrow when Makhbuba finishes the remaining 3 admin screen designs. After 5-2, Phase 1 is fully closed including design.

---

## Verification expectations (BA's checklist post dev-story)

When Amelia completes dev-story, BA will verify:

1. **Login + Register pages** match `04-login.html` / `03-register.html` visual direction
2. **Space Detail** has breadcrumbs, numbered sections, sticky sidebar, auto-fetching date picker (no button), `.avail` pills on desks
3. **My Bookings** groups by status section (Awaiting / Upcoming / Past)
4. **All status badges** show the dot + label structure (Pending yellow, Confirmed green, Rejected red, Cancelled neutral)
5. **Header** has hexagon logo, sticky on scroll, audience-appropriate nav links
6. **Footer** appears at bottom of every page
7. **All Phase 1 flows** still work unchanged: register, login, logout, browse, book, cancel, admin confirm, admin reject
8. **No console errors** in browser DevTools after navigating through all reskinned screens
9. **Inter font** loads via `next/font/google` (check page source — no CDN `<link>` to fonts.googleapis.com)
10. **Tabular numerals** appear correctly on prices ($25.00) and dates (2026-12-15)

---

**End of BA decisions block.**
