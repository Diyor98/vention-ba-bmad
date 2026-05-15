# Phase 1 PRD — DeskHive MVP

**Document B — Implementation-Authoritative PRD**

> **Purpose of this document.** This is the authoritative scope for what gets built in the 2-week Phase 1 MVP. It contains the PRD (John's output) and the Epics & Stories Listing (also John's output via `bmad-create-epics-and-stories`) merged into one deliverable for orchestration efficiency. **Bob (Scrum Master)** consumes the Epics & Stories Listing in Section 8 to prepare individual story files for **Amelia (Developer Agent)**. **Quinn (QA Engineer)** uses the Acceptance Criteria attached to each story to generate API and E2E tests. **Winston (System Architect)** uses Sections 6 and 7 of this document, alongside Document A, to produce the architecture.

| Field | Value |
|---|---|
| Document Owner | Business Analyst (orchestrating John's PM role) |
| Primary Audience | Bob (SM) → Amelia (Dev) → Quinn (QA) |
| Secondary Audience | Winston (Architect) — for Phase 1 implementation scope |
| Companion Document | Document A — Full Vision PRD (long-term context for Winston) |
| Version | 2.0 (BMad-aligned) |
| Hard Timeframe | 2 weeks (10 working days) |
| Status | Authoritative MVP scope. Anything not in this document is OUT OF SCOPE. |
| Framework Alignment | BMAD-METHOD v6.2.2 (team-fullstack bundle) |

---

## Section 0 — Critical Instructions to BMad Agents

> **Read this section first, regardless of which agent you are.**

### 0.1 Source of Truth

This document is the **only source of truth** for what to build in Phase 1. It has been deliberately stripped down. If you encounter a feature mentioned in conversation, in Document A (Full Vision PRD), in Winston's architecture document, or in your own training data that is **NOT explicitly listed in Section 8 (Epics & Stories Listing)** of this document — **DO NOT BUILD IT.** Surface it as a question to the BA via your agent's escalation pattern.

### 0.2 Anti-Hallucination Rules

Do not invent fields, statuses, roles, screens, or endpoints that are not in this document. Do not add "helpful extras" such as forgot-password flows, profile photo uploads, search autocomplete, or social login. These are explicitly Phase 2.

### 0.3 Per-Agent Reading Map

| Agent | Read Sections | Skip Sections |
|---|---|---|
| **Winston (Architect)** | All sections, plus Document A | None |
| **Bob (SM)** | All sections, focus on Section 8 (Epics & Stories) | Section 7 details (those are Amelia's concern) |
| **Amelia (Dev)** | The story file Bob prepares for you (do NOT read this PRD directly) | This PRD — Bob will extract what you need |
| **Quinn (QA)** | Acceptance Criteria within Section 8 stories; Section 9 (cross-cutting QA checks) | Sections 1, 2 |
| **Sally (UX)** | Section 7 (UX Goals & Constraints) | Implementation details |

### 0.4 Pre-Flight Check Before Writing Code

Before generating any code, Amelia must confirm via the story Bob prepared:

1. The story is listed in Section 8.
2. The data fields the story writes to appear in Section 6.1 (Database Schema for Phase 1).
3. The UI state being rendered is described in Section 7.
4. The Acceptance Criteria for the story are explicit and testable.

If any of these is missing, **STOP** and ask the BA before proceeding.

---

## Section 1 — Goals (Phase 1)

### 1.1 The Two-Week Goal

Deliver a functional, end-to-end web application demonstrating that a Guest can discover and reserve a specific desk in a coworking space, and that a Super Admin can manage the inventory and approve the booking. The application must be deployable to a staging environment and complete the demo flow described in Section 1.2 without manual intervention.

### 1.2 The One Demo Flow That Must Work

At the end of Week 2, the BA will demonstrate the following flow live, in order, without skipping steps:

1. Super Admin logs in and creates one Coworking Space with three desks.
2. Guest registers a new account and logs in.
3. Guest browses the list of available spaces, opens the space detail page, and sees the three desks with their availability for a chosen date.
4. Guest selects one desk, picks a date, and submits a booking request.
5. Guest sees the booking in their bookings list with status PENDING.
6. Super Admin logs into an admin view, sees the new pending booking, and clicks Confirm.
7. Guest refreshes their bookings page and sees the booking status is now CONFIRMED.
8. Guest attempts to book the same desk on the same date — the system prevents the double booking with a clear error message.

> **If this flow works end-to-end, the experiment is a success.** If anything else also works, that is a bonus but not the bar.

### 1.3 Phase 1 Success Metrics

- Demo flow (Section 1.2) executes successfully on staging.
- Zero double-bookings under concurrent load (verified by Quinn's test suite).
- All Acceptance Criteria in Section 8 stories pass automated tests.
- All four UI states (loading, empty, error, loaded) verifiable on every data screen.

---

## Section 2 — Background Context

> **Brief recap for agent context.** Full background is in Document A.

DeskHive is a marketplace connecting remote workers (Guests) with coworking spaces. The 2-week MVP validates the core booking mechanic — discovery, reservation, status confirmation — without payment processing or any Phase 2+ features. The Designer will reskin the product after MVP. Architecture must support the long-term vision in Document A without implementing it.

---

## Section 3 — Roles in Phase 1

Only TWO roles exist in Phase 1. The Space Admin role described in Document A is intentionally deferred. Super Admin performs the Space Admin functions in MVP.

| Role | Phase 1 Capabilities |
|---|---|
| **Guest** | Register, log in, browse spaces, view space detail, create a booking, view their own bookings, cancel their own pending bookings. |
| **Super Admin** | Log in (seeded credentials), create/edit a Space, create/edit Desks within a Space, view ALL bookings on the platform, confirm or reject pending bookings. |

---

## Section 4 — Functional Requirements (Phase 1)

These FRs are the implementation-scope subset of Document A. Each FR maps to one or more user stories in Section 8.

### 4.1 Authentication (FR-A)

- **FR-A1:** Email/password registration creates a Guest account; user is logged in immediately.
- **FR-A2:** Email/password login authenticates an existing user (Guest or Super Admin).
- **FR-A3:** Logout terminates the session.
- **FR-A4:** Authorization is enforced on every protected route by role.

### 4.2 Inventory Management (FR-I)

- **FR-I1:** Super Admin creates a Space with name, city, address, description, single image URL.
- **FR-I2:** Super Admin edits an existing Space.
- **FR-I3:** Super Admin adds a Desk to a Space with label and daily price.
- **FR-I4:** Super Admin edits a Desk (label, price, active status).
- **FR-I5:** Desk labels must be unique within a Space.

### 4.3 Discovery (FR-D)

- **FR-D1:** Public visitors and Guests can browse all PUBLISHED Spaces.
- **FR-D2:** Public visitors and Guests can filter the Spaces list by city (case-insensitive substring match).
- **FR-D3:** Public visitors and Guests can view a Space detail page showing Space info and a list of Desks.
- **FR-D4:** When a date is selected on a Space detail page, each Desk shows availability for that date.

### 4.4 Booking (FR-B)

- **FR-B1:** A logged-in Guest can create a booking for a specific Desk on a specific date. Result: PENDING booking.
- **FR-B2:** A Guest can view their own bookings with current status.
- **FR-B3:** A Guest can cancel their own PENDING booking. Result: CANCELLED.
- **FR-B4:** Two PENDING or CONFIRMED bookings cannot exist for the same Desk on the same date. Enforced at database level.
- **FR-B5:** Bookings cannot be created for past dates.

### 4.5 Admin Booking Management (FR-AB)

- **FR-AB1:** Super Admin can view all bookings across the platform.
- **FR-AB2:** Super Admin can confirm a PENDING booking. Result: CONFIRMED.
- **FR-AB3:** Super Admin can reject a PENDING booking. Result: REJECTED.

---

## Section 5 — Non-Functional Requirements (Phase 1)

- **NFR-1:** All authentication endpoints use a secure password hashing algorithm (bcrypt or argon2).
- **NFR-2:** Sessions/tokens are HTTP-only and not exposed to client-side JavaScript.
- **NFR-3:** Booking double-booking prevention is enforced at the database level (NFR-7 from Document A).
- **NFR-4:** All money values stored as integer cents.
- **NFR-5:** All dates handled as plain ISO date strings (YYYY-MM-DD); no timezone arithmetic in Phase 1.
- **NFR-6:** No hardcoded secrets in source code.
- **NFR-7:** All API endpoints return appropriate HTTP status codes (200/201/204 success; 400/401/403/404/409 errors).

---

## Section 6 — Architect Implementation Scope (Phase 1)

> **Winston:** This is the cut-down version of Document A's data model — only what gets implemented in Phase 1.

### 6.1 Tables to Create in Phase 1

> **Only these four tables.** Tables for Review, Message, Thread, MeetingRoom, Amenity, AuditLog described in Document A are NOT to be created in Phase 1.

#### users

```sql
id              UUID PRIMARY KEY
email           TEXT UNIQUE NOT NULL
hashed_password TEXT NOT NULL
role            TEXT NOT NULL CHECK (role IN ('GUEST','SUPER_ADMIN'))
full_name       TEXT NOT NULL
created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
```

#### spaces

```sql
id                 UUID PRIMARY KEY
name               TEXT NOT NULL
city               TEXT NOT NULL
address_line       TEXT NOT NULL
description        TEXT NOT NULL
primary_image_url  TEXT NOT NULL
status             TEXT NOT NULL DEFAULT 'PUBLISHED'
                   CHECK (status IN ('PUBLISHED','SUSPENDED'))
created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
```

#### desks

```sql
id                UUID PRIMARY KEY
space_id          UUID NOT NULL REFERENCES spaces(id)
label             TEXT NOT NULL
daily_price_cents INTEGER NOT NULL CHECK (daily_price_cents >= 0)
is_active         BOOLEAN NOT NULL DEFAULT TRUE
created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
UNIQUE (space_id, label)
```

#### bookings

```sql
id                  UUID PRIMARY KEY
guest_user_id       UUID NOT NULL REFERENCES users(id)
space_id            UUID NOT NULL REFERENCES spaces(id)
desk_id             UUID NOT NULL REFERENCES desks(id)
booking_date        DATE NOT NULL
status              TEXT NOT NULL
                    CHECK (status IN ('PENDING','CONFIRMED',
                                      'REJECTED','CANCELLED'))
total_price_cents   INTEGER NOT NULL
payment_status      TEXT NULL    -- reserved for Phase 2; leave NULL
payment_reference   TEXT NULL    -- reserved for Phase 2; leave NULL
created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
```

> **Forward-compatibility note:** `payment_status` and `payment_reference` columns must exist now (nullable) so that adding Stripe in Phase 2 does not require a destructive migration. Do NOT write any logic against them in Phase 1.

### 6.2 Critical Database Constraint — Double-Booking Prevention

> **This is the single most important technical requirement of the MVP.** It must be enforced at the database level, not just in application code, because race conditions in application checks will cause double bookings under any concurrent load.

Add the following partial unique index on the `bookings` table:

```sql
CREATE UNIQUE INDEX uniq_active_booking_per_desk_per_date
  ON bookings (desk_id, booking_date)
  WHERE status IN ('PENDING','CONFIRMED');
```

This guarantees that for any given desk on any given date, at most one PENDING or CONFIRMED booking can exist. REJECTED and CANCELLED bookings are excluded so the desk becomes available again after cancellation.

### 6.3 Booking State Machine

> **This state machine is law.** Do not introduce additional states. Do not allow transitions other than those listed.

| From | Event / Trigger | To | Allowed Actor |
|---|---|---|---|
| (none) | Guest submits booking via US-3.3 | PENDING | Guest |
| PENDING | Super Admin clicks Confirm (US-4.2) | CONFIRMED | Super Admin |
| PENDING | Super Admin clicks Reject (US-4.3) | REJECTED | Super Admin |
| PENDING | Guest clicks Cancel (US-3.5) | CANCELLED | Guest (own booking only) |
| CONFIRMED | (no transitions in MVP) | — | — |
| REJECTED | (terminal) | — | — |
| CANCELLED | (terminal) | — | — |

> **CRITICAL:** Once a booking is CONFIRMED, it cannot be cancelled or modified in Phase 1. This is intentional. Do not add a cancel-after-confirm flow.

### 6.4 API Surface (REST)

All endpoints return JSON. All endpoints except those marked PUBLIC require a valid session.

| Method & Path | Purpose | Access |
|---|---|---|
| `POST /auth/register` | Create a Guest account | PUBLIC |
| `POST /auth/login` | Authenticate | PUBLIC |
| `POST /auth/logout` | End session | Authenticated |
| `GET /me` | Return current user info | Authenticated |
| `GET /spaces?city=X` | List published spaces (optional city filter) | PUBLIC |
| `GET /spaces/:id` | Space detail with desks | PUBLIC |
| `GET /spaces/:id/availability?date=YYYY-MM-DD` | Per-desk availability flag for a date | PUBLIC |
| `POST /bookings` | Create a booking (PENDING) | Guest |
| `GET /bookings/me` | Current Guest's bookings | Guest |
| `POST /bookings/:id/cancel` | Cancel own PENDING booking | Guest |
| `GET /admin/bookings` | All bookings | Super Admin |
| `POST /admin/bookings/:id/confirm` | Confirm PENDING booking | Super Admin |
| `POST /admin/bookings/:id/reject` | Reject PENDING booking | Super Admin |
| `POST /admin/spaces` | Create space | Super Admin |
| `PUT /admin/spaces/:id` | Edit space | Super Admin |
| `POST /admin/spaces/:id/desks` | Add desk | Super Admin |
| `PUT /admin/desks/:id` | Edit desk | Super Admin |

### 6.5 Seed Data Required for Demo

- One Super Admin user with seeded credentials documented in the project README.
- No other seeded data — the demo flow itself creates spaces, desks, guests, and bookings live.

---

## Section 7 — UX Goals & Constraints (Phase 1)

> **Sally:** Phase 1 ships with default Tailwind. You wrap up the visual design at the end of the experiment. This section describes structural and state requirements only.

### 7.1 Design Philosophy

Minimalistic. Default Tailwind utility classes. No custom illustrations, no animations beyond default browser behavior, no marketing pages. The Designer will reskin at the end of the experiment.

UX directives describe **STRUCTURE and STATE**, not aesthetics. Aesthetic choices (exact colors, typography, spacing values) are explicitly deferred to the Designer.

### 7.2 Screen Inventory (Complete List)

| Screen | Route | Access |
|---|---|---|
| Landing / Browse Spaces | `/` | PUBLIC |
| Space Detail | `/spaces/:id` | PUBLIC |
| Register | `/register` | PUBLIC |
| Login | `/login` | PUBLIC |
| My Bookings | `/my-bookings` | Guest |
| Admin Spaces List | `/admin/spaces` | Super Admin |
| Admin Space Edit | `/admin/spaces/:id` | Super Admin |
| Admin Bookings List | `/admin/bookings` | Super Admin |

> **Do not create any other screen.** No homepage marketing, no about page, no pricing page, no profile page.

### 7.3 Required UI States per Screen

Every screen that loads data MUST handle the four states below. Quinn will verify each state.

- **Loading state** — a simple text or spinner indicating data is being fetched.
- **Empty state** — when the data set is empty (e.g., no spaces yet), display a clear message: "No spaces available yet."
- **Error state** — when the API call fails, display: "Something went wrong. Please try again." with no technical stack trace shown to the user.
- **Loaded / data state** — the normal happy path.

### 7.4 Booking Status Visual Rules

On both the Guest's My Bookings screen and the Admin Bookings List, each booking row MUST display a status badge with the following structural mapping. The Designer will choose final colors; for MVP, use the basic Tailwind colors below as placeholders.

| Status | Placeholder Color (Tailwind) | Badge Label |
|---|---|---|
| PENDING | `yellow-100 / yellow-800` | Pending |
| CONFIRMED | `green-100 / green-800` | Confirmed |
| REJECTED | `red-100 / red-800` | Rejected |
| CANCELLED | `gray-100 / gray-800` | Cancelled |

### 7.5 Critical Interaction Rules

- On the Space Detail screen, a date picker is REQUIRED. Without a selected date, the booking button on each desk is DISABLED.
- When a date is selected, each desk shows an availability badge: "Available" or "Unavailable". Unavailable desks have their booking button disabled.
- After a Guest submits a booking, redirect them to `/my-bookings`. Do not show a modal.
- Cancel buttons are visible only on bookings with status PENDING.
- Confirm and Reject buttons (admin) are visible only on bookings with status PENDING.
- On submit, all form buttons must enter a disabled state until the request resolves, to prevent double-submission.

### 7.6 Form Validation Rules

- **Email:** must match a basic email regex; show inline error if not.
- **Password:** minimum 8 characters; show inline error if not.
- **Full name:** required, non-empty.
- **Space name, city, address, description, image URL:** all required, non-empty.
- **Desk label:** required. Daily price: required, integer >= 0.
- **Booking date:** required; cannot be a past date.

---

## Section 8 — Epics & Stories Listing (For Bob)

> **Bob (Scrum Master):** This is the prepared Epics & Stories Listing that you consume via the `bmad-create-story` skill. Each story below is structured for direct conversion to a story file for Amelia. The Acceptance Criteria for each story are written in Gherkin so Quinn can convert them directly to E2E and API tests.

> **Story file format expected by Amelia:** Bob, when you prepare each story, ensure the story file contains: (1) the story statement, (2) the linked FRs from Section 4, (3) the Acceptance Criteria from this listing, (4) any relevant database/API references from Section 6, and (5) a Definition of Done from Section 10.

---

### Epic 1 — Authentication

#### Story US-1.1 — Guest Registration

**As a** first-time visitor, **I want** to register with my email and a password, **so that** I can become a Guest and book desks.

**Linked FRs:** FR-A1
**Linked API:** `POST /auth/register`
**Linked Tables:** users

**Acceptance Criteria (Gherkin):**

```gherkin
Scenario: Successful Guest registration
  Given I am on the /register page
  And no account exists with email "ada@example.com"
  When I enter "ada@example.com" as email
  And I enter "Ada Lovelace" as full name
  And I enter "Sup3rSecret!" as password
  And I click "Create account"
  Then a new user is created with role GUEST
  And I am logged in
  And I am redirected to "/"

Scenario: Registration with existing email is rejected
  Given a user already exists with email "ada@example.com"
  When I submit the registration form with email "ada@example.com"
  Then I see the error "An account with this email already exists"
  And no new user is created
  And I remain on the /register page

Scenario: Registration with invalid email format is rejected
  When I submit the registration form with email "not-an-email"
  Then I see an inline validation error on the email field
  And the form is not submitted
```

#### Story US-1.2 — Login

**As a** registered user, **I want** to log in with my email and password, **so that** I can access role-appropriate features.

**Linked FRs:** FR-A2, FR-A4
**Linked API:** `POST /auth/login`
**Linked Tables:** users

**Acceptance Criteria (Gherkin):**

```gherkin
Scenario: Login with valid credentials
  Given a Guest exists with email "ada@example.com" and password "Sup3rSecret!"
  When I submit the login form with those credentials
  Then I am authenticated as that Guest
  And I am redirected to "/"

Scenario: Login with wrong password is rejected
  Given a Guest exists with email "ada@example.com"
  When I submit the login form with email "ada@example.com" and password "wrong"
  Then I see the error "Invalid email or password"
  And I am not authenticated

Scenario: Super Admin login routes to admin area
  Given a Super Admin exists
  When the Super Admin logs in
  Then they have access to /admin/* routes
```

#### Story US-1.3 — Logout

**As a** logged-in user, **I want** to log out, **so that** my session ends and I return to the public landing page.

**Linked FRs:** FR-A3
**Linked API:** `POST /auth/logout`

**Acceptance Criteria (Gherkin):**

```gherkin
Scenario: Logout
  Given I am logged in as a Guest
  When I click "Log out"
  Then my session is terminated
  And I am redirected to "/"
  And I see "Log in" and "Register" links in the header
```

---

### Epic 2 — Inventory Management

#### Story US-2.1 — Create Space

**As a** Super Admin, **I want** to create a new coworking space with name, city, address, description, and a single image URL, **so that** Guests can discover it.

**Linked FRs:** FR-I1
**Linked API:** `POST /admin/spaces`
**Linked Tables:** spaces

**Acceptance Criteria (Gherkin):**

```gherkin
Scenario: Super Admin creates a Space
  Given I am logged in as Super Admin
  When I navigate to /admin/spaces
  And I click "New Space"
  And I fill in name "Hive Central", city "Berlin", address "Friedrichstr 1",
    description "Bright modern workspace", image URL "https://example.com/x.jpg"
  And I click "Save"
  Then a Space is created with status PUBLISHED
  And I see "Hive Central" in the admin spaces list

Scenario: Guest cannot access admin routes
  Given I am logged in as a Guest
  When I send POST /admin/spaces
  Then I receive 403 Forbidden
```

#### Story US-2.2 — Edit Space

**As a** Super Admin, **I want** to edit the fields of an existing space, **so that** I can correct mistakes.

**Linked FRs:** FR-I2
**Linked API:** `PUT /admin/spaces/:id`

**Acceptance Criteria (Gherkin):**

```gherkin
Scenario: Edit existing Space
  Given a Space "Hive Central" exists
  And I am logged in as Super Admin
  When I open its edit page and change the description to "Updated description"
  And I click "Save"
  Then the Space's description is updated
  And the change is visible on the public space detail page after refresh
```

#### Story US-2.3 — Add Desk to Space

**As a** Super Admin, **I want** to add a desk to a space with a label and a daily price, **so that** Guests can book it.

**Linked FRs:** FR-I3, FR-I5
**Linked API:** `POST /admin/spaces/:id/desks`
**Linked Tables:** desks

**Acceptance Criteria (Gherkin):**

```gherkin
Scenario: Add a desk to a Space
  Given a Space "Hive Central" exists with no desks
  And I am logged in as Super Admin
  When I navigate to that space's edit screen
  And I add a desk with label "Desk-1" and daily price 2500 cents ($25.00)
  Then the desk is created and visible in the desks list
  And the desk is is_active = true by default

Scenario: Desk label must be unique within a Space
  Given a Space "Hive Central" already has a desk labelled "Desk-1"
  When I attempt to add another desk to the same Space with label "Desk-1"
  Then the request is rejected with the error "A desk with that label already exists in this space"
  And no second desk is created
```

#### Story US-2.4 — Edit Desk

**As a** Super Admin, **I want** to edit a desk's label or price, or deactivate it, **so that** I can manage inventory accurately.

**Linked FRs:** FR-I4
**Linked API:** `PUT /admin/desks/:id`

**Acceptance Criteria (Gherkin):**

```gherkin
Scenario: Edit a desk's price
  Given a desk "Desk-1" exists with price 2500
  And I am logged in as Super Admin
  When I update its price to 3000
  Then the desk's daily_price_cents = 3000
  And future bookings use the new price

Scenario: Deactivate a desk hides it from booking
  Given a desk "Desk-1" exists with is_active = true
  When I set is_active = false
  Then on the public space detail page, Desk-1 no longer appears as bookable
```

---

### Epic 3 — Discovery & Booking

#### Story US-3.1 — Browse Spaces

**As a** Guest or visitor, **I want** to see a list of all published spaces, optionally filtered by city, **so that** I can find a place to work.

**Linked FRs:** FR-D1, FR-D2
**Linked API:** `GET /spaces?city=X`

**Acceptance Criteria (Gherkin):**

```gherkin
Scenario: Public visitor browses spaces
  Given two Spaces exist with status PUBLISHED in cities "Berlin" and "Lisbon"
  And I am NOT logged in
  When I visit "/"
  Then I see both spaces listed
  And each card shows the space name, city, and primary image
  When I type "Berlin" into the city filter
  Then only the Berlin space is shown

Scenario: Empty state on /
  Given there are zero Spaces with status PUBLISHED
  When I visit "/"
  Then I see the message "No spaces available yet."
```

#### Story US-3.2 — View Space Detail

**As a** Guest or visitor, **I want** to view a space's full details and the list of its desks with their availability for a chosen date, **so that** I can decide what to book.

**Linked FRs:** FR-D3, FR-D4
**Linked API:** `GET /spaces/:id`, `GET /spaces/:id/availability?date=YYYY-MM-DD`

**Acceptance Criteria (Gherkin):**

```gherkin
Scenario: Viewing space detail and availability
  Given a Space "Hive Central" exists with desks "Desk-1" and "Desk-2"
  And no bookings exist
  When I open the space detail page
  And I select tomorrow's date in the date picker
  Then both desks display the badge "Available"
  And both "Book this desk" buttons are enabled

Scenario: Booked desks show as unavailable
  Given Desk-1 has a CONFIRMED booking for 2026-06-01
  When I open the space detail page and select 2026-06-01
  Then Desk-1 shows the badge "Unavailable"
  And the "Book this desk" button for Desk-1 is disabled
```

#### Story US-3.3 — Create Booking

**As a** logged-in Guest, **I want** to select a desk and a date and submit a booking request, **so that** I reserve a workspace for that day.

**Linked FRs:** FR-B1, FR-B4, FR-B5
**Linked API:** `POST /bookings`
**Linked Tables:** bookings (with double-booking constraint from Section 6.2)

**Acceptance Criteria (Gherkin):**

```gherkin
Scenario: Successful booking creation
  Given I am logged in as Guest "ada@example.com"
  And a Space "Hive Central" has a desk "Desk-1" with daily price 2500
  When I select tomorrow's date on the space detail page
  And I click "Book this desk" for Desk-1
  Then a booking is created with status PENDING
  And total_price_cents = 2500
  And I am redirected to /my-bookings
  And I see the new booking in the list with status badge "Pending"

Scenario: Logged-out user cannot book
  Given I am NOT logged in
  And I am viewing the detail page for "Hive Central" with a date selected
  When I click "Book this desk"
  Then I am redirected to /login
  And after I log in, I am returned to the space detail page

Scenario: Double-booking prevention
  Given a desk "Desk-1" already has a PENDING booking for date 2026-06-01
  When another Guest attempts to book "Desk-1" for the same date 2026-06-01
  Then the request is rejected with HTTP 409 Conflict
  And the error message reads "This desk is already booked for that date"
  And no new booking row is inserted

Scenario: Booking after cancellation succeeds
  Given Guest A had a booking for Desk-1 on 2026-06-01 that is now CANCELLED
  When Guest B attempts to book Desk-1 on 2026-06-01
  Then the booking is created successfully with status PENDING

Scenario: Cannot book a past date
  Given today is 2026-06-15
  When I attempt to create a booking for date 2026-06-14
  Then the request is rejected with the error "Booking date cannot be in the past"
  And no booking is created
```

#### Story US-3.4 — View My Bookings

**As a** logged-in Guest, **I want** to see a list of my bookings with their current status, **so that** I know what I have reserved.

**Linked FRs:** FR-B2
**Linked API:** `GET /bookings/me`

**Acceptance Criteria (Gherkin):**

```gherkin
Scenario: Guest views their own bookings only
  Given Guest A and Guest B both have bookings
  When Guest A visits /my-bookings
  Then Guest A sees only their own bookings
  And Guest A does not see any of Guest B's bookings

Scenario: Booking status badges display correctly
  Given Guest A has bookings in statuses PENDING, CONFIRMED, REJECTED, CANCELLED
  When Guest A visits /my-bookings
  Then each booking displays the correct status badge per Section 7.4
```

#### Story US-3.5 — Cancel My Pending Booking

**As a** logged-in Guest, **I want** to cancel a booking I made while it is still PENDING, **so that** I can change my mind before it is confirmed.

**Linked FRs:** FR-B3
**Linked API:** `POST /bookings/:id/cancel`

**Acceptance Criteria (Gherkin):**

```gherkin
Scenario: Guest cancels their own pending booking
  Given I am logged in as Guest with a booking in status PENDING
  When I click "Cancel" on that booking
  Then the booking status becomes CANCELLED
  And the desk for that date becomes available again

Scenario: Guest cannot cancel a CONFIRMED booking
  Given I am logged in as Guest with a booking in status CONFIRMED
  When I view that booking on /my-bookings
  Then no "Cancel" button is shown for that booking
  And calling POST /bookings/:id/cancel directly returns HTTP 409

Scenario: Guest cannot cancel another guest's booking
  Given Guest A owns a PENDING booking with id X
  And I am logged in as Guest B
  When I send POST /bookings/X/cancel
  Then I receive HTTP 403 Forbidden
  And Guest A's booking remains in status PENDING
```

---

### Epic 4 — Admin Booking Management

#### Story US-4.1 — View All Bookings

**As a** Super Admin, **I want** to see all bookings on the platform with their status, guest, space, desk, and date, **so that** I can manage them.

**Linked FRs:** FR-AB1
**Linked API:** `GET /admin/bookings`

**Acceptance Criteria (Gherkin):**

```gherkin
Scenario: Super Admin sees all bookings
  Given three bookings exist across two different guests
  And I am logged in as Super Admin
  When I visit /admin/bookings
  Then I see all three bookings
  And each row shows guest name, space name, desk label, date, and status

Scenario: Guest cannot access admin bookings list
  Given I am logged in as a Guest
  When I send GET /admin/bookings
  Then I receive HTTP 403 Forbidden
```

#### Story US-4.2 — Confirm Booking

**As a** Super Admin, **I want** to confirm a PENDING booking, **so that** the Guest knows their reservation is secured.

**Linked FRs:** FR-AB2
**Linked API:** `POST /admin/bookings/:id/confirm`

**Acceptance Criteria (Gherkin):**

```gherkin
Scenario: Super Admin confirms a pending booking
  Given a booking exists with status PENDING
  And I am logged in as Super Admin
  When I click "Confirm" on that booking
  Then the booking status becomes CONFIRMED
  And when the Guest reloads /my-bookings, they see status badge "Confirmed"

Scenario: Cannot confirm a non-pending booking
  Given a booking is in status CANCELLED
  When the Super Admin sends POST /admin/bookings/:id/confirm
  Then the request is rejected with HTTP 409
  And the status remains CANCELLED
```

#### Story US-4.3 — Reject Booking

**As a** Super Admin, **I want** to reject a PENDING booking, **so that** I can refuse it when needed and free the desk for that date.

**Linked FRs:** FR-AB3
**Linked API:** `POST /admin/bookings/:id/reject`

**Acceptance Criteria (Gherkin):**

```gherkin
Scenario: Super Admin rejects a pending booking
  Given a booking exists for Desk-1 on 2026-06-01 with status PENDING
  And I am logged in as Super Admin
  When I click "Reject" on that booking
  Then the booking status becomes REJECTED
  And Desk-1 is again available for booking on 2026-06-01
```

---

## Section 9 — Cross-Cutting Acceptance Criteria

> **Quinn:** These checks apply to ALL stories. Generate generic test suites that verify these across the whole API surface.

- Every API endpoint that requires authentication must return 401 when called without credentials.
- Every API endpoint scoped to a specific role must return 403 when called by the wrong role.
- All four UI states (loading, empty, error, loaded) are visible and verifiable on every data-loading screen (per Section 7.3).
- Money is stored and returned as integer cents. The UI formats it as $XX.XX. No floating-point math anywhere.
- All dates are handled as plain ISO date strings (YYYY-MM-DD). No timezone arithmetic in Phase 1.
- Form submission buttons disable on submit and re-enable on response.
- All error responses use consistent JSON shape: `{ "error": "human-readable message", "code": "MACHINE_CODE" }`.

---

## Section 10 — Definition of Done

A story is Done when ALL of the following are true:

- Code is written and merged to the main branch.
- Every Acceptance Criterion in the story passes Quinn's automated test suite.
- The relevant screen handles all four UI states from Section 7.3.
- Authorization is verified — non-permitted roles receive 401 or 403 as appropriate.
- No hardcoded secrets, URLs, or test data leak into production builds.
- Story file is updated with implementation notes, files changed, and test results (per Amelia's `critical_actions`).

---

## Section 11 — Out of Scope for Phase 1

> **Anything in this list MUST NOT be built.** These are reserved for later phases. Surface as a question if any of these come up during implementation.

- Payment processing of any kind (Stripe, PayPal, invoices). Bookings are status-only.
- Email or SMS notifications. Status changes are visible only when the user refreshes their bookings page.
- Password reset / forgot password flow.
- Email verification. Newly registered users are immediately active.
- Social login (Google, Apple, etc.).
- Photo uploads. Spaces have a single `primary_image_url` field that stores a plain URL string entered by the Super Admin (we will use Unsplash URLs for the demo).
- Meeting rooms. Phase 1 supports DESKS ONLY. The MeetingRoom entity exists in the long-term vision (Document A) but is not implemented now.
- Reviews and ratings.
- Messaging between Guest and Admin.
- Map view, geolocation search, advanced filters. Search is a single text input that filters by city name only.
- Multi-currency. All prices are USD.
- Multi-language UI. English only.
- Time-slot bookings within a day. A desk booking is for ONE FULL CALENDAR DAY, identified by a single date (YYYY-MM-DD).
- Recurring bookings, modifications to bookings, partial cancellations.
- Profile editing, avatars, account deletion.
- Mobile app, responsive polish beyond basic Tailwind defaults.
- Analytics dashboards.
- Audit logs.

---

## Section 12 — Open Questions for the BA (Escalation Pattern)

If any agent encounters any of the following, **STOP and ask the BA** before proceeding:

- A field, status, or role appears in your work that is not in this document.
- An Acceptance Criterion in Section 8 contradicts a directive in Section 6 or 7.
- A story in Section 8 cannot be implemented within the constraints of Sections 6 and 7.
- Winston's architecture document conflicts with anything in this PRD.
- You believe a non-functional concern (security, performance) requires a feature not listed here.

---

## Section 13 — Implementation Readiness Checklist

> For John (PM) to verify before handing off to Bob (SM), using `bmad-validate-prd` and `bmad-check-implementation-readiness` skills.

- [ ] Goals defined (Section 1).
- [ ] Demo flow defined (Section 1.2).
- [ ] All Phase 1 roles and permissions defined (Section 3).
- [ ] All FRs enumerated and mapped to stories (Sections 4 and 8).
- [ ] All NFRs enumerated (Section 5).
- [ ] Database schema defined for Phase 1 only (Section 6.1).
- [ ] Critical double-booking constraint specified at DB level (Section 6.2).
- [ ] Booking state machine defined as authoritative law (Section 6.3).
- [ ] Complete API surface enumerated (Section 6.4).
- [ ] All screens enumerated with required UI states (Sections 7.2 and 7.3).
- [ ] Status badge visual mapping provided (Section 7.4).
- [ ] All stories have linked FRs, APIs, tables, and Gherkin Acceptance Criteria (Section 8).
- [ ] Cross-cutting QA criteria listed (Section 9).
- [ ] Definition of Done explicit (Section 10).
- [ ] Out-of-scope list comprehensive (Section 11).
- [ ] Escalation pattern defined (Section 12).

---

## Appendix A — Recommended BMad Workflow

> **For the BA orchestrating this experiment, this is the recommended sequence of skill invocations across the 2 weeks.**

| Day | Agent | Skill | Output |
|---|---|---|---|
| Day 1 | Winston (Architect) | `bmad-create-architecture` (CA) | Architecture document |
| Day 1 | Winston | `bmad-check-implementation-readiness` (IR) | Confirmed alignment of PRD + Architecture |
| Day 2 | Bob (SM) | `bmad-sprint-planning` (SP) | Sprint plan sequencing the 15 stories |
| Day 2–10 | Bob | `bmad-create-story` (CS) per story | Individual story files for Amelia |
| Day 2–10 | Amelia (Dev) | `bmad-dev-story` (DS) per story | Implemented story with tests |
| Day 2–10 | Quinn (QA) | `bmad-qa-generate-e2e-tests` (QA) per story or epic | Automated API/E2E test suites |
| Day 5, 10 | Bob | `bmad-sprint-status` (SS) | Mid- and end-of-sprint status |
| Day 10 | Bob | `bmad-retrospective` (ER) | Epic retrospective |
| Day 10 | Sally (UX) | `bmad-create-ux-design` (CU) | Final UX/visual design wrap-up |
