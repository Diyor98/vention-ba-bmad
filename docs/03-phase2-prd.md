# Phase 2 PRD — DeskHive Multi-Tenant + Payments + Email

**Document C — Implementation-Authoritative PRD**

> **Purpose of this document.** This is the authoritative scope for what gets built in Phase 2 of DeskHive. It follows the same structure as the Phase 1 PRD (Document B) so the BMad agents have consistent reading conventions across phases. **Bob (Scrum Master)** consumes the Epics & Stories Listing in Section 8 to prepare individual story files for **Amelia (Developer Agent)**. **Quinn (QA Engineer)** uses the Acceptance Criteria attached to each story to generate API and E2E tests. **Winston (System Architect)** uses Sections 6 and 7 of this document, alongside Documents A and B, to evolve the Phase 1 architecture into Phase 2 architecture.

| Field | Value |
|---|---|
| Document Owner | Business Analyst (orchestrating John's PM role) |
| Primary Audience | Bob (SM) → Amelia (Dev) → Quinn (QA) |
| Secondary Audience | Winston (Architect) — for Phase 2 implementation scope; Makhbuba (Designer) — for design pipeline |
| Companion Documents | Document A — Full Vision PRD; Document B — Phase 1 PRD; `phase2-framing-and-polish-backlog.md` — Strategic framing |
| Version | 1.0 (Phase 2 baseline) |
| Hard Timeframe | Open-ended (no external deadline); estimated ~16–21 stories across three themes |
| Status | Authoritative Phase 2 scope. Anything not in this document is OUT OF SCOPE for Phase 2. |
| Framework Alignment | BMAD-METHOD v6.2.2 (team-fullstack bundle) |

---

## Section 0 — Critical Instructions to BMad Agents

> **Read this section first, regardless of which agent you are.**

### 0.1 Source of Truth

This document is the **only source of truth** for what to build in Phase 2. It builds on top of Phase 1 (Document B), which is now shipped to `origin/main` across 23 stories. If you encounter a feature mentioned in conversation, in Document A (Full Vision PRD), in the strategic framing doc, or in your own training data that is **NOT explicitly listed in Section 8 (Epics & Stories Listing)** of this document — **DO NOT BUILD IT.** Surface it as a question to the BA via your agent's escalation pattern.

### 0.2 Anti-Hallucination Rules

Do not invent fields, statuses, roles, screens, endpoints, or third-party integrations that are not in this document. Phase 3 features (reviews & ratings, multi-day bookings, mobile native app, corporate/team accounts, advanced search, real-time calendars, advanced analytics, multi-currency, 2FA, customer support inbox) are explicitly NOT Phase 2.

### 0.3 Phase 1 → Phase 2 Continuity Rules

Phase 2 builds on Phase 1's locked architectural decisions (see Document B, plus the deskhive handoff). The following are **preserved without modification**:

- Money in cents (integer) — `src/lib/money.ts` is the canonical seam, extended (not replaced) in Phase 2.
- Partial unique index `uniq_active_booking_per_desk_per_date` — still enforces no double-bookings.
- UUID primary keys, Better Auth, Drizzle ORM, Server Components default.
- `cancelBooking` / `confirmBooking` / `rejectBooking` named helpers — extended, not abstracted away.
- StatusBadge component — extended with new variants for application status.
- Role-specific nav variants (per Story 6-2 memory entry) — extended with a SPACE_OWNER variant.
- Toast wrapper at `src/lib/toast.ts` — extended for application-status and payment-related toasts.

Anything that requires breaking these locks must be escalated to BA first.

### 0.4 Test-Mode Build Throughout

**All Stripe integration in Phase 2 is built against Stripe test mode.** No live payments, no real money flows, no real bank accounts. Stripe provides full test infrastructure (test card numbers, test bank accounts, test Connect onboarding) that simulates every behavior. Production deployment requires a separate post-Phase-2 decision and switchover of API keys.

Email is built against the email provider's test/sandbox mode where available; otherwise low-volume real sends to BA-controlled test addresses are acceptable.

### 0.5 Per-Agent Reading Map

| Agent | Read Sections | Skip Sections |
|---|---|---|
| **Winston (Architect)** | All sections, plus Documents A & B | None |
| **Bob (SM)** | All sections, focus on Section 8 (Epics & Stories) | Section 7 details (those are Amelia's concern) |
| **Amelia (Dev)** | The story file Bob prepares for you (do NOT read this PRD directly) | This PRD — Bob will extract what you need |
| **Quinn (QA)** | Acceptance Criteria within Section 8 stories; Section 9 (cross-cutting QA checks) | Sections 1, 2 |
| **Sally (UX)** / **Makhbuba (Designer)** | Section 7 (UX Goals & Constraints) | Implementation details |

### 0.6 Pre-Flight Check Before Writing Code

Before generating any code, Amelia must confirm via the story Bob prepared:

1. The story is listed in Section 8.
2. The data fields the story writes to appear in Section 6.1 (Database Schema for Phase 2).
3. The UI state being rendered is described in Section 7.
4. The Acceptance Criteria for the story are explicit and testable.
5. The story respects test-mode-only constraints (Section 0.4) for any payment-related work.

If any of these is missing, **STOP** and ask the BA before proceeding.

---

## Section 1 — Goals (Phase 2)

### 1.1 The Phase 2 Goal

Transform DeskHive from a single-tenant operator-managed booking system (Phase 1) into a **multi-tenant marketplace** where:

1. Independent Space Owners can apply, get approved, and list their spaces on DeskHive
2. Guests can book and pay for desks through a real payment flow (test mode)
3. Space Owners receive payouts (minus platform fee) when bookings are confirmed
4. All parties receive transactional emails at the critical moments in their journey

### 1.2 The Phase 2 Demo Flow That Must Work

At Phase 2 close, the BA will demonstrate the following flow live, in order, without skipping steps:

1. Super Admin logs in (existing Phase 1 account).
2. A new Guest registers and logs in.
3. Guest sees a "Become a Space Owner" entry point in the header dropdown.
4. Guest fills the Space Owner application form (business name, address, tax ID) and submits.
5. Guest receives a confirmation email that their application is being reviewed.
6. Super Admin sees the new pending application in `/admin/applications`, reviews it, clicks Approve.
7. Now-approved Space Owner receives an approval email.
8. Newly-approved Space Owner logs in (or stays logged in), sees a new "Switch to hosting" affordance in the header dropdown, clicks it.
9. Space Owner lands on `/owner` dashboard, creates a new space with two desks (priced in dollars).
10. Space Owner completes Stripe Connect Express onboarding (test mode) to receive payouts.
11. A different Guest browses, finds the new space, picks a date, picks a desk, clicks Book this desk.
12. Booking flow now includes a Stripe payment step (test card). Guest pays.
13. Guest sees the booking confirmation toast (extended from Story 6-3) plus receives a receipt email.
14. Payment is held (authorized, not captured) on Stripe.
15. Space Owner receives a "new booking received" email.
16. Space Owner clicks Confirm on the booking → payment is captured.
17. Platform fee is deducted; Space Owner's share is queued for payout.
18. Guest receives a "booking confirmed" email.
19. Space Owner's dashboard shows the booking + the payout queued in their Stripe Connect account.
20. Guest attempts to cancel the booking more than 24h before booking date → full refund issued, refund confirmation email sent.
21. Guest attempts to cancel a different booking less than 24h before booking date → cancellation refused per policy, error toast shown.

> **If this flow works end-to-end on Stripe test mode with no live payments, Phase 2 is a success.** Production deployment is a separate decision.

### 1.3 Phase 2 Success Metrics

- Phase 2 demo flow (Section 1.2) executes successfully on staging
- Zero double-bookings, zero payment race conditions under concurrent load (verified by Quinn's test suite)
- Stripe webhook handling correctly processes all relevant events in test mode (payment_intent.succeeded, payment_intent.payment_failed, charge.refunded, account.updated for Connect)
- All transactional emails fire reliably at the documented trigger points (Section 4.3)
- All Acceptance Criteria in Section 8 stories pass automated tests
- All Phase 1 functionality continues to work unchanged

### 1.4 What Phase 2 Does NOT Do

The following are explicitly **out of Phase 2** and reserved for Phase 3 or later:

- Reviews and ratings (guest → space, guest → owner)
- Multi-day bookings (each booking is still single-day)
- Advanced search and discovery (filters beyond city, recommendations, etc.)
- Mobile native app
- Corporate or team accounts (one user = one account)
- Real-time availability calendars (still date-by-date as in Phase 1)
- Advanced analytics dashboards beyond simple counts
- Multi-currency (USD only)
- Two-factor authentication
- In-app customer support inbox or chat
- Photo galleries or carousels (single primary image per space continues from Phase 1)
- Amenity icons (Wi-Fi, coffee, etc.) — Phase 3
- Star ratings on space cards — Phase 3
- "Spots left" capacity counters — Phase 3

---

## Section 2 — Background Context

DeskHive Phase 1 shipped 23 stories across 6 epics (scaffolding, auth, inventory, discovery & booking, admin booking management, polish). The Phase 1 model conflates "platform operator" and "space provider" into a single SUPER_ADMIN role. This is a Phase 1 simplification that does not represent how a real coworking marketplace operates.

The Airbnb model is the inspiration for Phase 2: every user signs up as a Guest by default, opts into hosting (Space Ownership) via a lightweight application flow, and switches between Guest mode and Host mode post-authentication via a header affordance. The SUPER_ADMIN role becomes an internal operator role (Vention / DeskHive operations) that approves applications, monitors the platform, and intervenes in disputes — but never "owns" a space themselves.

Phase 2 also introduces the first real money flow into DeskHive. The Phase 1 booking system tracks prices in cents but no actual payment occurs. Phase 2 adds Stripe-backed payment intents (held on booking request, captured on Space Owner confirmation, refundable per policy), Stripe Connect (Express variant) for Space Owner payouts, and a platform fee model (15% placeholder).

Email is the third Phase 2 theme — every meaningful state transition in the application flow, booking flow, and payment flow generates a transactional email. Email is built using Resend as the provider, with a thin wrapper module (`src/lib/email.ts`) that mirrors the architectural pattern established by `src/lib/toast.ts` and `src/lib/money.ts`.

---

## Section 3 — Roles in Phase 2

Phase 2 introduces one new role and reframes existing ones:

| Role | Identifier | How Acquired | Capabilities |
|---|---|---|---|
| **Guest** | `GUEST` | Default role on registration | Browse spaces, book desks, pay for bookings, cancel own bookings per policy, apply to become a Space Owner |
| **Space Owner** | `SPACE_OWNER` | Application approved by Super Admin | All Guest capabilities + create/edit own spaces, manage own desks, confirm/reject bookings on own spaces, view payouts |
| **Super Admin** | `SUPER_ADMIN` | Seeded (internal Vention/DeskHive operations) | Review and approve/reject Space Owner applications, view all spaces across the platform, intervene in disputes |

**Key role rules:**

- A user starts as Guest. Applying to become a Space Owner does not lose Guest capabilities — approved Space Owners are *also* Guests (they can book desks on other people's spaces).
- "Switching to hosting" is a UI mode, not a role change. The user is always both Guest and Space Owner after approval.
- Super Admins are seeded only. There is no public "apply to become Super Admin" flow.
- A user cannot Confirm/Reject bookings on a space they themselves booked (defense against self-dealing). Enforced server-side.
- A Space Owner cannot edit a space they don't own. Enforced via `spaces.owner_id` server-side checks.

---

## Section 4 — Functional Requirements (Phase 2)

### 4.1 Authentication & Role Management

- **FR-AUTH-1:** All users continue to register and log in via Better Auth (Phase 1 mechanism unchanged).
- **FR-AUTH-2:** A new `SPACE_OWNER` role is added to the role enum (or TEXT+CHECK equivalent per Phase 1's locked decision).
- **FR-AUTH-3:** Post-authentication, the header user-pill dropdown shows a "Switch to hosting" affordance if and only if the user is an approved Space Owner. Selecting it switches the UI to "Host mode" (shows the `/owner/*` routes in the nav). A "Switch to traveling" affordance (or similar) lets the user switch back to Guest mode.
- **FR-AUTH-4:** Mode is persisted in a session cookie. Default mode on first login is Guest mode.
- **FR-AUTH-5:** Super Admin role retains its existing routing and capabilities; no mode-switching for Super Admin (they always see the `/admin/*` surface).

### 4.2 Space Owner Application Flow

- **FR-APP-1:** Guests see a "Become a Space Owner" entry point in the header user-pill dropdown.
- **FR-APP-2:** Clicking the entry point navigates to `/become-a-host` (or similar route), which renders the application form.
- **FR-APP-3:** Application form fields:
  - Full name (pre-filled from account)
  - Business name (required, text)
  - Business address (required, multi-line text)
  - Tax ID / VAT number (required, text — no validation beyond non-empty)
  - Optional "why do you want to host" free-text (1000 char max)
- **FR-APP-4:** Application submission creates an `applications` record with status `PENDING` and emails the applicant a "we received your application" message.
- **FR-APP-5:** Super Admin sees pending applications in `/admin/applications` (new admin sub-nav tab). Each application shows the form data plus the applicant's email and registration date.
- **FR-APP-6:** Super Admin can Approve or Reject an application. Both actions are state-transitions (conditional UPDATE per Phase 1 locked decisions). Approval grants the SPACE_OWNER role to the user; rejection does not.
- **FR-APP-7:** Approval triggers an approval email + an in-app toast on the applicant's next session ("You're now a Space Owner!").
- **FR-APP-8:** Rejection triggers a rejection email. The applicant can re-apply 30 days after rejection (enforced server-side via the `applications.reviewed_at` timestamp).
- **FR-APP-9:** A user cannot have two PENDING applications simultaneously (enforced via partial unique index, mirroring Phase 1's booking pattern).

### 4.3 Email Transactional Flow

All emails are sent via Resend (test mode for non-production, live keys gated behind environment variable). All emails use a shared base template (header with DeskHive logo, footer with company info, branded colors matching the design system).

Email triggers:

| Event | Recipient | Subject | Trigger |
|---|---|---|---|
| Application submitted | Applicant (Guest) | "We received your Space Owner application" | `applications` row created with status PENDING |
| Application approved | Applicant (now Space Owner) | "Welcome to DeskHive Hosting" | Super Admin clicks Approve |
| Application rejected | Applicant (Guest) | "Update on your DeskHive application" | Super Admin clicks Reject |
| Booking requested | Guest (booker) | "Booking request received" | Booking created with status PENDING |
| Booking requested | Space Owner | "New booking request on your space" | Same trigger, different recipient |
| Booking confirmed | Guest | "Your booking is confirmed" | Space Owner clicks Confirm |
| Booking rejected | Guest | "Your booking could not be accepted" | Space Owner clicks Reject |
| Booking cancelled (by guest) | Guest | "Booking cancellation confirmed" | Guest cancels |
| Booking cancelled (by guest) | Space Owner | "A guest cancelled their booking" | Same trigger, different recipient |
| Payment captured | Guest | "Receipt for your DeskHive booking" | Stripe `payment_intent.succeeded` webhook |
| Payment refunded | Guest | "Refund processed" | Stripe `charge.refunded` webhook |
| Payout sent | Space Owner | "Payout sent" | Stripe Connect `payout.paid` webhook (test mode simulated) |

### 4.4 Payment Flow (Test Mode)

- **FR-PAY-1:** Booking flow extends to include a Stripe payment step. After Guest clicks Book this desk and the application validates desk availability, the client redirects to a Stripe-hosted checkout (Stripe Checkout) or renders an inline Payment Element (Stripe Elements). **Decision: use Stripe Checkout for Phase 2** — fewer custom UI components, faster to ship.
- **FR-PAY-2:** Payment Intent is created with `capture_method: 'manual'` so the funds are authorized but not captured. This holds the money on the Guest's card without charging them yet.
- **FR-PAY-3:** On successful payment authorization, the booking is created with status PENDING and `payment_intent_id` linked. If authorization fails, the booking is not created and an error toast is shown to the Guest.
- **FR-PAY-4:** When Space Owner clicks Confirm on a PENDING booking, the server captures the Payment Intent (`stripe.paymentIntents.capture(...)`). On successful capture, booking status becomes CONFIRMED. On capture failure, the booking remains PENDING and the Space Owner sees an error.
- **FR-PAY-5:** When Space Owner clicks Reject on a PENDING booking, the server cancels the Payment Intent (`stripe.paymentIntents.cancel(...)`), releasing the hold on the Guest's card. Booking status becomes REJECTED.
- **FR-PAY-6:** When a Guest cancels their own PENDING or CONFIRMED booking and is within the refund policy window (Section 4.5), the server refunds the captured payment (or cancels the uncaptured authorization). Booking status becomes CANCELLED.
- **FR-PAY-7:** Platform fee is 15% of the booking total, calculated in cents. Stored on the booking row as `platform_fee_cents`. Owner payout amount = `booking.total_cents - booking.platform_fee_cents`.
- **FR-PAY-8:** All money math goes through `src/lib/money.ts` extensions (new helpers for fee calculation and refund partial-amount calculation).

### 4.5 Refund Policy

- **FR-REFUND-1:** Phase 2 implements a single refund policy: **Full refund if cancelled 24 hours or more before the booking date; no refund within 24 hours of the booking date.**
- **FR-REFUND-2:** The 24-hour cutoff is calculated server-side using UTC. Refund eligibility is computed on cancellation request.
- **FR-REFUND-3:** Guests can attempt to cancel any of their PENDING or CONFIRMED bookings. The server determines refund eligibility and either:
  - Issues a full refund and marks booking CANCELLED (if eligible)
  - Refuses the cancellation entirely with an error toast (if not eligible)
- **FR-REFUND-4:** Space Owners can always refund a confirmed booking unilaterally (e.g., for force majeure). This is out of scope for Phase 2 UI but the Server Action signature is built to accept it for future use.
- **FR-REFUND-5:** Refunds are processed via Stripe (`stripe.refunds.create(...)`). The Stripe `charge.refunded` webhook fires the refund confirmation email.

### 4.6 Space Owner Dashboard

- **FR-OWNER-1:** Approved Space Owners have a new route surface at `/owner/*`. Sub-routes:
  - `/owner` — dashboard (overview: active spaces count, pending bookings count, this-month payouts)
  - `/owner/spaces` — list of own spaces (extends Phase 1's space management)
  - `/owner/spaces/[id]` — edit own space (extends Phase 1's space edit)
  - `/owner/bookings` — bookings on own spaces (extends Phase 1's admin bookings, filtered to owner's spaces)
  - `/owner/payouts` — payout history from Stripe Connect
  - `/owner/settings` — Stripe Connect onboarding status, ability to re-enter Stripe onboarding if needed
- **FR-OWNER-2:** The existing `/admin/*` routes remain for Super Admin only.
- **FR-OWNER-3:** A Space Owner who has not completed Stripe Connect onboarding cannot publish a space. They can create draft spaces, but the "Publish" action is gated.
- **FR-OWNER-4:** Space Owner header nav variant: logo + Browse spaces + My bookings (Guest mode) OR My spaces + Bookings + Payouts (Host mode) + user-pill (with Switch to hosting/traveling) + Log out.

### 4.7 Existing Phase 1 Functionality

All Phase 1 functionality continues to work unchanged. Specifically:
- Guest can browse spaces, view space details, see desk availability per date
- Guest can register, log in, log out
- Guest can cancel a PENDING booking (existing flow extends to handle refund per Section 4.5)
- Super Admin can confirm/reject bookings (now only on bookings related to space owners they're administrating; Phase 1's "Super Admin owns all spaces" model retires)
- Booking confirmation toast (Story 6-3) extends to handle the new payment step's success/error states
- The "© 2026 DeskHive" footer remains on all pages

---

## Section 5 — Non-Functional Requirements (Phase 2)

- **NFR-1:** All Phase 1 NFRs continue to apply (response times, uptime expectations, accessibility baseline).
- **NFR-2:** Stripe API calls are wrapped in retry logic with exponential backoff for transient failures (timeouts, 5xx). Idempotency keys are used for all payment intent and refund operations.
- **NFR-3:** Stripe webhooks are verified using the signing secret. Unverified webhook calls are rejected with 400.
- **NFR-4:** Webhook handlers are idempotent — receiving the same event twice does not double-process. Tracked via a `webhook_events` table keyed by Stripe event ID.
- **NFR-5:** Email sends are non-blocking on the user request. If Resend is unavailable, the user request still succeeds; email is queued for retry via a simple background mechanism (TBD: in-memory queue with restart-loss tolerance is acceptable for Phase 2).
- **NFR-6:** All sensitive Stripe data (account IDs, payment intent IDs) is stored in the database. No card data is stored — Stripe Checkout / Elements handles PCI compliance.
- **NFR-7:** All financial calculations (fee, refund, payout amounts) use integer cents math via `src/lib/money.ts`. No floating-point currency operations.

---

## Section 6 — Architect Implementation Scope (Phase 2)

### 6.1 Database Schema Changes (Phase 2)

New tables:

```sql
-- Space Owner applications
applications (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id),
  business_name TEXT NOT NULL,
  business_address TEXT NOT NULL,
  tax_id TEXT NOT NULL,
  motivation TEXT, -- optional "why do you want to host"
  status TEXT NOT NULL CHECK (status IN ('PENDING','APPROVED','REJECTED')),
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewed_at TIMESTAMPTZ,
  reviewed_by UUID REFERENCES users(id),
  rejection_reason TEXT
)

-- Partial unique index: a user can have only one PENDING application at a time
CREATE UNIQUE INDEX uniq_pending_application_per_user
  ON applications(user_id) WHERE status = 'PENDING';

-- Stripe webhook event tracking (idempotency)
webhook_events (
  id UUID PRIMARY KEY,
  stripe_event_id TEXT NOT NULL UNIQUE,
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
)

-- Stripe Connect account tracking (one per Space Owner)
stripe_connect_accounts (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE REFERENCES users(id),
  stripe_account_id TEXT NOT NULL UNIQUE,
  onboarding_completed BOOLEAN NOT NULL DEFAULT FALSE,
  charges_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  payouts_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
)
```

Modified tables:

```sql
-- Add SPACE_OWNER to the role enum / CHECK constraint
ALTER TABLE users
  DROP CONSTRAINT users_role_check,
  ADD CONSTRAINT users_role_check
    CHECK (role IN ('GUEST','SPACE_OWNER','SUPER_ADMIN'));

-- Add owner_id to spaces (nullable initially for backward-compat with Phase 1 seeded spaces)
ALTER TABLE spaces ADD COLUMN owner_id UUID REFERENCES users(id);
-- Optional: a backfill migration assigns Phase 1 seeded spaces to a designated SUPER_ADMIN
--   for continuity. To be decided per ops needs.

-- Add payment tracking to bookings
ALTER TABLE bookings ADD COLUMN payment_intent_id TEXT;
ALTER TABLE bookings ADD COLUMN total_cents INTEGER NOT NULL DEFAULT 0;
ALTER TABLE bookings ADD COLUMN platform_fee_cents INTEGER NOT NULL DEFAULT 0;
ALTER TABLE bookings ADD COLUMN refunded_at TIMESTAMPTZ;
ALTER TABLE bookings ADD COLUMN refund_amount_cents INTEGER;
```

### 6.2 New Library Seams

Following the Phase 1 pattern (`src/lib/money.ts`, `src/lib/toast.ts`, `src/lib/db-errors.ts`):

- **`src/lib/stripe.ts`** — Stripe SDK wrapper. Server-only. Exposes `createPaymentIntent`, `capturePaymentIntent`, `cancelPaymentIntent`, `refundPaymentIntent`, `createConnectAccount`, `createConnectAccountLink`, `getConnectAccountStatus`, `verifyWebhookSignature`. Phase 2 cannot import `stripe` directly anywhere outside this seam.
- **`src/lib/email.ts`** — Resend SDK wrapper. Server-only. Exposes `sendEmail(template, recipient, data)` where `template` is a typed enum of all email types (Section 4.3). Internal mapping handles template hydration and Resend API call.
- **`src/lib/money.ts` extensions:** add `calculatePlatformFee(amountCents, feePercent)`, `calculateOwnerPayout(amountCents, feeCents)`, `formatCurrencyCents(amountCents)` if not already present.
- **`src/lib/applications.ts`** — query/mutation helpers for applications. `listPendingApplications`, `getApplicationById`, `submitApplication`, `approveApplication`, `rejectApplication`.

### 6.3 New Server Actions

Following the Phase 1 pattern (`createBookingAction`, `cancelBookingAction`, etc.):

- `submitApplicationAction` — Guest submits Space Owner application
- `approveApplicationAction` — Super Admin approves
- `rejectApplicationAction` — Super Admin rejects (optional reason)
- `createBookingWithPaymentAction` — extends `createBookingAction` to include Payment Intent creation
- `cancelBookingWithRefundAction` — extends `cancelBookingAction` to compute refund eligibility and process refund
- `confirmBookingAction` — extends Phase 1's helper to also capture Payment Intent
- `rejectBookingAction` — extends Phase 1's helper to also cancel Payment Intent
- `initiateConnectOnboardingAction` — generates Stripe Connect account link
- `switchModeAction` — toggles Guest mode ↔ Host mode in the session cookie

### 6.4 Stripe Webhook Endpoint

New route: `app/api/stripe/webhook/route.ts`

Handles these event types:
- `payment_intent.succeeded` — fires payment-captured email
- `payment_intent.payment_failed` — logs failure, surfaces to user via toast/email
- `charge.refunded` — fires refund-confirmation email
- `account.updated` (Connect) — updates `stripe_connect_accounts.charges_enabled` / `payouts_enabled`
- `payout.paid` (Connect, test-mode-simulated) — fires payout email

All webhook handlers verify signature, look up by `stripe_event_id` in `webhook_events` for idempotency, process, then record in `webhook_events`.

### 6.5 Architectural Anti-Patterns Forbidden

- **Do NOT** import the `stripe` package outside `src/lib/stripe.ts`.
- **Do NOT** import `resend` (or any email SDK) outside `src/lib/email.ts`.
- **Do NOT** introduce floating-point currency math anywhere.
- **Do NOT** make Stripe API calls in client components. Server Actions or API routes only.
- **Do NOT** store payment card data in the database. Stripe handles all card information.
- **Do NOT** abstract `confirmBooking` / `cancelBooking` / `rejectBooking` into a single helper. Keep them named per Phase 1 locked decision #9.
- **Do NOT** trigger email sends from within database transactions. Send after commit succeeds.
- **Do NOT** trust webhook payloads without signature verification.
- **Do NOT** assume webhook events arrive in order. Use the database state as source of truth, not webhook timing.
- **Do NOT** create new top-level routes that don't fit the existing `/`, `/admin/*`, `/owner/*`, `/api/*` structure.

---

## Section 7 — UX Goals & Constraints (Phase 2)

### 7.1 Design Continuity

Phase 2 design extends Phase 1's design language (locked in Stories 5-1 and 5-2). New screens follow:

- Indigo brand color, neutral cool-gray surfaces
- Inter typography, 5-step scale
- Card-based layouts where appropriate
- StatusBadge component for all status displays (extended with `PENDING`, `APPROVED`, `REJECTED` for applications)
- Toast wrapper for ephemeral confirmations (extended with payment-related variants)

### 7.2 New Screens

Designer (Makhbuba) will deliver designs for the following new screens before each story's dispatch:

1. **`/become-a-host` — Application landing + form**
   - Value proposition (why host on DeskHive)
   - Application form (Section 4.2 FR-APP-3)
   - "What happens next" explainer

2. **`/admin/applications` — Super Admin application review list**
   - Same admin sub-nav as Phase 1 (Spaces / Bookings / Guests, now adds Applications as a new tab)
   - Table of pending applications with filter chips (Pending / Approved / Rejected)
   - Per-row Approve / Reject buttons

3. **`/admin/applications/[id]` — Application detail / review screen**
   - Full application data
   - Approve / Reject actions with optional rejection-reason text area

4. **`/owner` — Space Owner dashboard**
   - Stat cards: active spaces, pending bookings, this-month payouts
   - Quick-access to Spaces, Bookings, Payouts tabs

5. **`/owner/payouts` — Payout history**
   - Table of Stripe Connect payouts
   - Per-row date, amount, status

6. **`/owner/settings` — Stripe Connect onboarding status**
   - "Complete onboarding" CTA if incomplete
   - Status indicators if complete
   - Re-onboarding link if Stripe requires updates

7. **Booking flow with payment step** — extends `/spaces/[id]` Book this desk action to redirect to Stripe Checkout, then return to a success page or back to Space Detail with the toast.

8. **Email templates** — 13 email templates per Section 4.3.

### 7.3 Header / Nav Variants

| User State | Nav Variant |
|---|---|
| Public (logged out) | Logo + Browse spaces + Log in + Sign up (unchanged from Phase 1) |
| Guest (default) | Logo + Browse spaces + My bookings + user-pill (with "Become a Space Owner" dropdown item) + Log out |
| Space Owner in Guest mode | Logo + Browse spaces + My bookings + user-pill (with "Switch to hosting" dropdown item) + Log out |
| Space Owner in Host mode | Logo + Dashboard + My spaces + Bookings + Payouts + user-pill (with "Switch to traveling" dropdown item) + Log out |
| Super Admin | Logo + Browse spaces + Admin + user-pill + Log out (unchanged from Phase 1 / Story 6-2) |

### 7.4 Email Visual Style

All transactional emails share a base template:
- DeskHive logo header
- Plain typography (web-safe sans-serif fallback chain)
- Brand-indigo CTA buttons
- Footer with company info and unsubscribe link (where required)
- Plain-text fallback version for every email

---

## Section 8 — Epics & Stories Listing (For Bob)

Phase 2 is organized into three themes (Epics) sequenced by dependency.

### Epic 7 — Multi-Tenant (Space Owner Role)

**Ships first. Foundation for everything else in Phase 2.**

**Story 7-1: Role infrastructure — add SPACE_OWNER role**
- Migration: extend role CHECK constraint to include `SPACE_OWNER`
- Migration: add `spaces.owner_id` column (nullable)
- Update role-based access control helpers to understand the new role
- Add Space Owner header nav variant skeleton (functional later in 7-3)
- Seed update: a designated SUPER_ADMIN can optionally be re-seeded as a SPACE_OWNER for testing
- AC: schema changes apply cleanly, existing Phase 1 flows continue working, new role can be assigned manually via seed/direct DB write

**Story 7-2: Applications data model + Super Admin review backend**
- Migration: create `applications` table + partial unique index
- New query helpers: `listPendingApplications`, `getApplicationById`
- New Server Actions: `submitApplicationAction`, `approveApplicationAction`, `rejectApplicationAction`
- AC: Server Actions correctly transition application state, approval grants SPACE_OWNER role atomically, partial unique index prevents double-PENDING applications

**Story 7-3: Guest-facing application form + entry point**
- New route `/become-a-host` with the application form (FR-APP-3 fields)
- Header user-pill dropdown gets "Become a Space Owner" item (Guest variant only)
- Form submission calls `submitApplicationAction`, redirects to a confirmation page with toast
- AC: Guest can navigate to and submit form, application persists to DB, Guest cannot submit a second application while one is pending

**Story 7-4: Super Admin applications review UI**
- New admin sub-nav tab `Applications` alongside Spaces / Bookings / Guests
- `/admin/applications` lists pending applications with filter chips and Approve / Reject buttons
- `/admin/applications/[id]` shows full application detail with action buttons
- Reuses existing admin layout, StatusBadge, filter-chip pattern from Story 5-2
- AC: Super Admin can view, approve, reject applications; status changes reflect in UI; approved user gets SPACE_OWNER role

**Story 7-5: Space Owner mode-switching infrastructure**
- New `switchModeAction` server action that toggles a session cookie (`mode=guest` or `mode=host`)
- Header user-pill dropdown shows "Switch to hosting" (when SPACE_OWNER in guest mode) or "Switch to traveling" (when SPACE_OWNER in host mode)
- Mode-dependent nav rendering in `app/layout.tsx`
- AC: Space Owner can switch modes, header updates correctly, mode persists across page refreshes

**Story 7-6: Space Owner dashboard + space management**
- New routes `/owner`, `/owner/spaces`, `/owner/spaces/[id]`, `/owner/bookings`
- `/owner` dashboard with stat cards
- Owner space management mirrors Phase 1 admin space management but scoped to `spaces.owner_id = current user`
- Owner bookings view mirrors Phase 1 admin bookings but scoped to owner's spaces
- Existing `/admin/spaces` and `/admin/bookings` retain platform-wide views (Super Admin only)
- AC: Space Owner can create/edit own spaces, see only their own bookings, cannot see or edit other owners' data

### Epic 8 — Email Infrastructure

**Ships in parallel with Epic 9 (Payments). Many emails are dependencies for Epic 9 user-facing flows.**

**Story 8-1: Email wrapper + Resend integration + base template**
- Add `resend` dependency
- New file `src/lib/email.ts` with typed template enum, send function, error handling
- Base email HTML template (header, footer, branded styling)
- Test send to BA-controlled email
- AC: `src/lib/email.ts` exports a typed API, test email send succeeds, error handling does not break user requests

**Story 8-2: Application-flow emails (submitted, approved, rejected)**
- Implement 3 email templates (Section 4.3 rows 1–3)
- Wire to Server Actions from Story 7-2 (`submitApplicationAction`, `approveApplicationAction`, `rejectApplicationAction`)
- AC: each Server Action triggers the correct email post-commit, email content matches design

**Story 8-3: Booking-flow emails (requested, confirmed, rejected, cancelled — both recipient types)**
- Implement 8 email templates (Section 4.3 rows 4–11) — both Guest-facing and Space-Owner-facing variants
- Wire to existing booking Server Actions
- AC: each booking transition fires the correct emails to the correct recipients

**Story 8-4: Payment-flow emails (receipt, refund, payout)**
- Implement 3 email templates (Section 4.3 rows 12–14)
- Wire to Stripe webhook handlers (Story 9-5)
- AC: each Stripe webhook event fires the correct email, idempotent on duplicate webhooks

### Epic 9 — Payments

**Ships second. Depends on Epic 7 (Space Owner role exists, has Stripe Connect account) and partially on Epic 8 (payment-flow emails).**

**Story 9-1: Stripe SDK wrapper + Connect account model**
- Add `stripe` dependency
- New file `src/lib/stripe.ts` with all Stripe operations wrapped
- Migration: create `stripe_connect_accounts` table
- Helper queries for Connect account state
- AC: `src/lib/stripe.ts` exports the documented API, no other code imports `stripe` directly

**Story 9-2: Space Owner Stripe Connect onboarding**
- `/owner/settings` page with Stripe Connect status
- `initiateConnectOnboardingAction` generates Account Link, redirects Space Owner to Stripe-hosted onboarding (test mode)
- On Stripe redirect-back, status is checked and saved
- Webhook handler for `account.updated` keeps status synced
- "Publish space" action gated on `charges_enabled && payouts_enabled`
- AC: Space Owner can complete Stripe Connect Express onboarding in test mode, status persists, gated publishing works

**Story 9-3: Booking flow with payment**
- `createBookingWithPaymentAction` creates Payment Intent with `capture_method: 'manual'`
- Guest is redirected to Stripe Checkout (test mode), pays with test card
- On successful authorization, booking is created with status PENDING and `payment_intent_id` linked
- On failed authorization, booking is not created, error toast shown
- Migration: add `payment_intent_id`, `total_cents`, `platform_fee_cents` columns to bookings
- AC: Guest can book and pay with test card, payment is authorized but not captured, booking record reflects payment

**Story 9-4: Confirm/Reject with capture/cancel**
- `confirmBookingAction` extends to capture the Payment Intent (now CONFIRMED + payment captured)
- `rejectBookingAction` extends to cancel the Payment Intent (now REJECTED + funds released)
- Owner UI surfaces capture/cancel errors gracefully
- AC: capture and cancel work in test mode, errors are recoverable, booking state and payment state stay consistent

**Story 9-5: Stripe webhook endpoint + event handlers**
- New route `app/api/stripe/webhook/route.ts`
- Webhook signature verification using `STRIPE_WEBHOOK_SECRET`
- Migration: create `webhook_events` table for idempotency
- Handlers for `payment_intent.succeeded`, `payment_intent.payment_failed`, `charge.refunded`, `account.updated`, `payout.paid`
- AC: webhooks verified, idempotent, fire correct downstream effects (emails, status updates)

**Story 9-6: Cancellation + refund per policy**
- `cancelBookingWithRefundAction` extends Phase 1's cancel: computes refund eligibility (24-hour rule), processes refund via Stripe, updates booking state
- UI surfaces refund eligibility on the cancel button (e.g., disabled with reason if within 24h)
- Migration: add `refunded_at`, `refund_amount_cents` to bookings
- AC: full refund issued for eligible cancellations, refund refused for ineligible ones, both paths emit correct emails

**Story 9-7: Space Owner payouts view**
- `/owner/payouts` page with list of Stripe Connect payouts (test-mode simulated)
- Stripe Connect API to fetch payout history
- AC: payout list displays correctly, includes status and amounts

---

## Section 9 — Cross-Cutting Acceptance Criteria

These apply to every Phase 2 story:

- **CC-1:** All Phase 1 functionality (23 shipped stories) continues to work without regression.
- **CC-2:** All financial calculations use `src/lib/money.ts` helpers. No `parseFloat * 100` patterns.
- **CC-3:** All Stripe operations go through `src/lib/stripe.ts`. No direct `stripe` imports elsewhere.
- **CC-4:** All email sends go through `src/lib/email.ts`. No direct `resend` imports elsewhere.
- **CC-5:** All Server Actions return typed `ActionState` with success/error variants, matching Phase 1 pattern.
- **CC-6:** All new state transitions use conditional UPDATE + pre-check, matching Phase 1 locked decision.
- **CC-7:** All Stripe webhooks verify signature before processing.
- **CC-8:** All UI uses existing brand tokens. No new colors, no new typography scales.
- **CC-9:** Footer continues to read `© 2026 DeskHive` on every page.
- **CC-10:** No console errors during the Phase 2 demo flow (Section 1.2).

---

## Section 10 — Definition of Done

A Phase 2 story is DONE when:

1. All Acceptance Criteria pass
2. All automated tests pass (unit + E2E)
3. BA browser-walk verification (per story's verification checklist) is complete
4. Code is committed and pushed to `origin/main`
5. Sprint-status YAML reflects the story as `review` → BA verifies → committed feature commit lands
6. Memory entries (where applicable) are codified per BMad pattern
7. No Phase 1 regressions

Phase 2 as a whole is DONE when:

1. All 16–21 stories (final count after refinement) are DONE individually
2. The Phase 2 demo flow (Section 1.2) executes end-to-end on staging
3. All transactional emails fire correctly in test mode
4. All Stripe operations work correctly in test mode
5. Phase 2 retrospective is held (optional per BMad workflow)
6. Phase 2 is formally closed in `sprint-status.yaml`

---

## Section 11 — Out of Scope for Phase 2

The following are NOT part of Phase 2. Any work involving them is escalated to BA for Phase 3 scoping:

- Reviews & ratings system (guest→owner, guest→space)
- Multi-day bookings (single-day continues)
- Advanced search & discovery (filters beyond city, recommendations, autocomplete)
- Mobile native app
- Corporate / team accounts (one user = one account)
- Real-time availability calendars (date-by-date continues)
- Advanced analytics dashboards (only simple counts on Space Owner dashboard)
- Multi-currency (USD only)
- Two-factor authentication
- Customer support inbox / live chat
- Photo galleries / carousels (single primary image continues)
- Amenity icons (Wi-Fi, coffee, etc.)
- Star ratings on space cards
- "Spots left" capacity counters
- Forgot password flow (if needed, separate scope decision)
- Profile photo upload
- Social login (Google / Apple / Facebook)
- Subscriptions / recurring bookings
- Promotional codes / discounts
- Tax calculation beyond storing the owner's tax ID
- Internationalization / multi-language UI
- Production live-mode Stripe deployment (separate post-Phase-2 decision)

---

## Section 12 — Open Questions for the BA (Escalation Pattern)

If any BMad agent encounters one of the following situations, escalate to BA:

- A story's scope expands beyond the AC defined in Section 8
- Stripe test mode does not simulate a needed behavior (escalate before mocking)
- A webhook event fires but the database state is inconsistent (escalate before trying to "fix" it in code)
- A Phase 1 file requires significant modification (more than a clearly-bounded addition)
- An email template requires complex conditional content the wrapper can't easily express
- The 15% platform fee or 24h refund window produces user-visible math that "feels wrong"
- A test card or test Connect account does not behave as Stripe documentation describes

---

## Section 13 — Implementation Readiness Checklist

Before dispatching the first Phase 2 story:

- [ ] Phase 2 PRD reviewed by BA
- [ ] Designer (Makhbuba) briefed on Phase 2 scope
- [ ] Stripe test account created
- [ ] Resend account created with test mode
- [ ] Environment variables documented (`STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET`, `RESEND_API_KEY`, `EMAIL_FROM_ADDRESS`)
- [ ] Stripe webhook endpoint URL configured in Stripe dashboard (or via Stripe CLI for local dev)
- [ ] First Theme A story (7-1) BA decisions doc drafted
- [ ] BMad agents (Winston, Bob, Amelia, Quinn) refreshed on the Phase 2 PRD
- [ ] Authenticated E2E test infrastructure scoped (deferred from Phase 1, may bundle as a Phase 2 prep story)

---

**End of Phase 2 PRD.**
