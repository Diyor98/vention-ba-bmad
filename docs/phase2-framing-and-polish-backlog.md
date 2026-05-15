# DeskHive — Phase 2 Framing & Phase 1 Polish Backlog

**Status:** Working document
**Author:** Ikhtiyor Ziyayev, Business Analyst
**Date:** Monday, May 11, 2026
**Purpose:** Capture the next two phases of work — first the deferred Phase 1 polish items, then the Phase 2 direction — ahead of the Tuesday team call.

---

## 1. Where we stand right now

- **Phase 1 build:** complete. 18 of 18 stories shipped to `origin/main` across Epics 0-4 (project setup, auth, spaces & desks, bookings, admin booking management).
- **Epic 5 (Design Integration):** complete. Stories 5-1 (public screens) and 5-2 (admin screens) shipped. Makhbuba's design package fully applied to the live build.
- **Phase 1 = closed**, including design.
- Next: a short polish sprint to address feedback from the May 8 team call, then Phase 2 begins.

---

## 2. Phase 1 Polish Backlog

Six items collected from the May 8 call and from BA review during Story 5-2 verification + registration testing. These ship as a small consolidation sprint before Phase 2 begins.

### 6-1. Price input accepts dollars, stores cents

**Problem:** Admin desk-edit form currently asks for "Daily price (cents)" — admins must type `2500` to mean $25. Mental math is friction; the cents unit leaks the internal storage decision into the UX.

**Fix:** Input accepts dollars (e.g., `25` or `25.00` or `25.50`). Convert to cents server-side before storing. **Money stays stored as integer cents** per the locked Phase 1 architectural decision (#6, money in cents) — only the input form changes.

**Scope:** Single Server Action change + label/placeholder update + small client-side validator. No schema change.

---

### 6-2. Hide "My bookings" from admin nav (strict role separation)

**Problem:** Super Admin sees a "My bookings" link in the header nav and can navigate to `/my-bookings`, which renders an empty state. This blurs the role boundary — admins manage spaces, they don't book desks.

**Fix:** Conditional render the "My bookings" link based on `user.role`. Guests see it; admins do not. Also redirect `/my-bookings` away from admin users (e.g., to `/admin/bookings`) if they navigate there directly.

**Scope:** Layout component change + small route-level role guard. No schema change. No new pages.

**Decision locked:** Option A (strict separation) — admins cannot book desks. Admin role = admin only.

---

### 6-3. Booking confirmation toast/popup

**Problem:** From May 8 call: when a guest books a desk, there is no visible confirmation of the action. The booking appears in "My bookings → Awaiting confirmation" but the moment-of-action feedback is missing.

**Fix:** Small toast or inline notification on successful booking submission: *"Booking request sent. We'll notify you when the space confirms — usually within a few hours."*

**Scope:** Client-side toast component + integration with the existing booking Server Action's success state. No schema change.

**Note:** This is presentation-layer only. Real notifications (email, in-app) are Phase 2 work, not this fix.

---

### 6-4. Registration bug — could not reproduce

**Original report:** From May 8 call, a manager attempted to register as a new user and the form failed.

**BA investigation (May 11):** Reproduced the registration flow with two fresh test accounts (`testbug001@example.com` and `regtest002@example.com`, both using 8+ character passwords). Registration succeeded in both cases — new guest user created, redirected to home page, logged in cleanly. Could not reproduce a failure.

**Possible causes for original report:**
- Manager attempted to register with an email already in the database
- Manager used a password under 8 characters (form rejects this by design)
- Transient issue during the call (dev server restart, network blip)
- Real bug specific to the input data the manager used

**Action:** Surface in the Tuesday call. Ask the manager what email and password pattern they used, and what error message they saw. Cannot scope a fix without that information.

**Status:** Open. Needs manager input.

---

### 6-5. Price-in-dollars display clarification

**Problem:** From May 8 call: a manager asked about "making the price in dollars." Current production already displays prices as `$25.00` (dollar formatting, USD assumed). It is unclear what change the manager wanted.

**Possible interpretations:**
- The manager wants prices stored in dollars (rejected — cents storage stays per Decision #6; only input changes per polish item 6-1)
- The manager wants a different currency display format
- The manager wants explicit currency labeling (e.g., `$25.00 USD`)
- The manager saw a display somewhere that didn't have the dollar formatting and wants it normalized

**Action:** BA to confirm intent with the manager directly (in the Tuesday call) before scoping. Likely a 1-line change once intent is clear, possibly already addressed by the existing `$25.00` display.

**Status:** Open. Needs manager input.

---

### 6-6. Cosmetic role selector on login — keep or remove

**Background:** Phase 1 Story 5-2 introduced a Guest/Admin role-selector toggle on `/login` as cosmetic UI only — the actual role is determined by the user's database record, not the toggle. This was a locked BA decision (Decision #8) at the time.

**Open question:** Now that Phase 2 will introduce real role differentiation (Space Owners vs. Guests vs. Super Admin), the cosmetic toggle may become more confusing than helpful. Two options:

- **Keep it** — remove confusion by labeling it more clearly (e.g., "I'm a guest" / "I'm a space owner") and making it actually route to the correct landing page on successful login.
- **Remove it** — single-form login, role-based routing happens server-side on auth success.

**Action:** Tie this decision to the Phase 2 multi-tenant work. Likely resolved as part of the Space Owner role epic, not as a standalone polish story.

**Status:** Deferred to Phase 2 scope discussion.

---

## 3. Phase 2 Direction

### 3.1 Framing

Phase 2 is **not a fixed-length sprint with a deadline.** It is the next continuous phase of product work, executed under one PRD, one design pipeline with Makhbuba, and one architectural pass. Managers see results delivered phase-by-phase via demos; the timeline is determined by what gets shipped, not by a clock.

Rationale for the single-umbrella approach:
- Splitting work across multiple smaller phases doubles the process overhead (new PRD each time, new design cycle each time, new architectural pass each time)
- No external deadline is forcing a phase boundary
- The themes within Phase 2 are interdependent — splitting them would force re-architecture mid-stream
- Demos during Phase 2 will let managers evaluate progress without artificial phase cuts

### 3.2 What Phase 2 accomplishes

Phase 2 transforms DeskHive from a single-operator MVP (one Super Admin manages every space, no money flows) into a **real multi-sided marketplace** (multiple Space Owners list their own spaces, guests pay for bookings, owners receive payouts, all parties communicate via email).

This is the Airbnb-style role model the product was always conceptually pointing toward, applied for the first time at the system level.

### 3.3 Themes (sequenced by dependency)

Phase 2 contains three interlocking themes, sequenced because each depends on the one before it.

---

#### Theme A: Multi-tenant (Space Owner role) — ships first

**Why first:** Payments don't make sense without a payee. Today every space belongs to a single Super Admin (seeded in the database). Real marketplaces have many owners. This theme creates that structure.

**What it includes:**

1. **New `SPACE_OWNER` role** in the auth schema, alongside existing `GUEST` and `SUPER_ADMIN`
2. **Space ownership in the database** — `spaces.owner_id` foreign key tying each space to a specific user (existing seeded spaces migrate to be owned by the Super Admin, then can be reassigned)
3. **"Become a space owner" application flow:**
   - A guest sees a "List your space" CTA on `/browse` or in their account
   - Opens a multi-step form: space details (name, city, address, description, photo), desks (label, daily price), agreement to terms
   - Submits → creates a pending space + flags the user for role upgrade
4. **Super Admin review and approval flow:**
   - Super Admin sees pending space applications in a new admin section
   - Approves or rejects each application
   - On approval: user role flips from GUEST to SPACE_OWNER, space is published, owner is notified by email
   - On rejection: notification email, application closes, user can re-apply
5. **Space Owner dashboard:**
   - New `/owner/*` routes (parallel structure to `/admin/*`)
   - Sees only their own spaces, their own bookings, their own earnings
   - Can edit their spaces, manage their desks, confirm/reject their bookings
6. **Role-based access control rework across the app:**
   - All existing `/admin/*` routes restricted to `SUPER_ADMIN` only
   - All space-owner-relevant actions accessible by both `SPACE_OWNER` (own scope) and `SUPER_ADMIN` (all scopes)
   - Header navigation adapts to role (Guest sees "Browse / My bookings"; Owner sees "Browse / My bookings / My space"; Super Admin sees "Browse / Admin")
7. **Login routing by role** — on successful auth, redirect to the role-appropriate landing page (resolves polish item 6-6)

**Estimated stories:** 6-8 stories. Touches almost every existing page because of permission checks and data filtering changes.

---

#### Theme B: Payments-with-meaning — ships second

**Why second:** Now that Space Owners exist, payments have a clear destination. Money flows from Guest → Platform → Space Owner (minus platform fee). Without Theme A, payments would just be "Guest pays platform" with no payout — a less honest demo.

**What it includes:**

1. **Stripe integration setup** — account creation, API keys, webhook endpoint, test/live mode handling
2. **Payment method capture at booking time:**
   - Guest enters card details on the booking form (Stripe Elements)
   - Payment intent created in `requires_capture` state (card held, not charged)
   - Booking saved as PENDING with payment_intent_id reference
3. **Payment capture on owner confirm:**
   - When Space Owner (or Super Admin) confirms a pending booking, the payment intent is captured
   - Booking state extends: PENDING → CONFIRMED (and CAPTURED) → COMPLETED (after booking date)
4. **Refund flow on cancel or reject:**
   - Owner rejects pending booking → payment intent cancelled (no charge)
   - Guest cancels pending booking before capture → payment intent cancelled
   - Guest cancels confirmed booking → refund flow with policy (full / partial / none, business decision pending)
   - Owner cancels confirmed booking → refund flow (likely always full refund + flag to owner)
5. **Space Owner payouts (Stripe Connect):**
   - Space Owner onboards a Stripe Connect account during space approval or first booking
   - Platform takes a fee (e.g., 10%) on each confirmed booking
   - Remainder is automatically transferred to the owner's Connect account
   - Owner sees earnings dashboard with payout history
6. **Payment failure handling:**
   - Card declined at capture → booking state becomes `CONFIRMED_PAYMENT_FAILED`
   - Notifications to both parties
   - Retry mechanism or manual cancellation path
7. **Money state machine in the database:**
   - Extend booking schema: `amount_held`, `amount_captured`, `amount_refunded`, `platform_fee`, `owner_payout`
   - All as integer cents per Decision #6

**Estimated stories:** 7-9 stories. External API integration adds complexity per story relative to Phase 1 work.

---

#### Theme C: Email infrastructure & notifications — ships third (in parallel with B)

**Why third:** Email infra is needed by both Theme A (space owner application approval/rejection emails) and Theme B (payment receipts, payout confirmations). Setting it up once serves both. In practice, Theme C work happens in parallel with the second half of Theme A and most of Theme B — the infrastructure ships when first needed, then is reused.

**What it includes:**

1. **Email provider selection and setup** — Resend is the leading candidate for Next.js projects; SendGrid and Postmark are alternatives. Decision needed in Tuesday call or early Phase 2.
2. **Sender domain configuration** — DNS records, sender authentication (SPF, DKIM, DMARC)
3. **Email template system** — reusable templates for transactional emails, simple variables, basic styling
4. **Transactional emails:**
   - Space Owner application submitted (to Super Admin: "new application")
   - Application approved (to applicant: "you're now a space owner")
   - Application rejected (to applicant: "your application was not approved")
   - New booking received (to Space Owner: "guest booked your desk")
   - Booking confirmed (to Guest: "your booking is confirmed, $X charged")
   - Booking rejected (to Guest: "your booking was declined, no charge")
   - Booking cancelled (to other party)
   - Payment receipt (to Guest, on successful capture)
   - Payout summary (to Space Owner, monthly or per-booking)
5. **Email delivery logging** — store sent emails for debugging and audit

**Estimated stories:** 3-4 stories (one for infra, one for templates, one for the integration into Themes A and B, one for the receipt/payout emails specifically).

---

### 3.4 Phase 2 total scope (estimated)

Approximately **16-21 stories** across the three themes. Larger and more complex than Phase 1, both per-story and in aggregate. The single-PRD/single-design/single-architecture approach reduces process overhead but doesn't reduce engineering complexity — that's set by the features themselves.

### 3.5 What Phase 2 deliberately does NOT include

Captured explicitly so scope doesn't drift:

- **Reviews and ratings** — Phase 3 candidate
- **Multi-day bookings** — Phase 3 candidate
- **Search and discovery beyond city filter** — Phase 3 candidate
- **Mobile native app** — out of scope indefinitely; web responsive only
- **Corporate / team accounts** — Phase 3 candidate
- **Real-time availability calendars** — Phase 3 candidate
- **Advanced analytics for Space Owners** (charts, trends, occupancy heatmaps) — Phase 3 candidate
- **Multi-currency** — out of scope, USD only
- **Two-factor authentication** — Phase 3 candidate
- **Customer support inbox / dispute handling** — Phase 3 candidate

### 3.6 Architectural decisions to lock before dispatch

To be drafted in `architecture.md` early in Phase 2, before story dispatch begins:

- Role hierarchy and permission model (GUEST / SPACE_OWNER / SUPER_ADMIN)
- Stripe integration pattern (payment intent flow with capture, Stripe Connect for payouts)
- Webhook security and idempotency for Stripe events
- Money math extensions (amount_held, captured, refunded, platform_fee, owner_payout)
- Email provider choice (Resend / SendGrid / Postmark)
- Email delivery logging schema
- Refund and cancellation policy logic (business rule, then code)
- Space ownership data migration (existing seeded spaces → Super Admin ownership initially)

---

## 4. Open questions for the Tuesday call

Items that need team input before Phase 2 PRD drafting begins in earnest.

1. **Phase 1 polish first, then Phase 2 — agreed?** Or should any polish item be cut, deferred, or folded into Phase 2?
2. **Polish item 6-4** — registration bug. Could not reproduce. What email and password did the manager use, and what error appeared?
3. **Polish item 6-5** — price-in-dollars display. What specifically did the manager want changed (display already shows `$25.00`)?
4. **Phase 2 single-umbrella scope — confirmed?** Multi-tenant + Payments + Email infra under one Phase 2, no hard deadline, demos as progress checkpoints. Or do managers want a tighter Phase 2 (multi-tenant only, then Phase 3 for payments)?
5. **Refund / cancellation policy** — business decision needed before Theme B build. Full refund, partial, none? Different rules for guest-cancel vs. owner-cancel?
6. **Platform fee for Space Owner payouts** — what percentage does the platform take from each booking? (Industry comparables: Airbnb takes ~14-16% combined host + guest fees, but this is DeskHive's call.)
7. **Email provider preference** — Resend, SendGrid, Postmark, or BA picks during architecture phase?
8. **Stripe Connect onboarding flow** — full Stripe-hosted onboarding (fastest) or custom in-app onboarding (more design work, more polish)?
9. **Design pipeline for Phase 2** — same as Phase 1 (BA drafts requirements → designer creates screens → BA dispatches stories to BMad). Confirming this sequence stays.

---

## 5. Next steps after Tuesday call

1. **This week:** Begin Phase 1 polish stories (6-1 through 6-3 are well-scoped and dispatchable). Items 6-4 and 6-5 unblock after manager input. Item 6-6 folds into Phase 2 Theme A.
2. **Next week:** Draft full Phase 2 PRD (`docs/03-phase2-prd.md`) based on Tuesday confirmations. Structured around the three themes with epics and user stories per theme.
3. **In parallel:** Update `architecture.md` with Phase 2 architectural decisions.
4. **After PRD complete:** Send full Phase 2 PRD + theme breakdown to Makhbuba with a request for design coverage across all new screens (Space Owner application flow, owner dashboard, payment forms, receipts, email templates if she handles those).
5. **During Phase 2 build:** Demos to managers at natural milestones (end of Theme A, end of Theme B, end of Theme C). No fixed cadence beyond that.

---

**End of working document.**
