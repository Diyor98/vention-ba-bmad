# Product Brief & Full Vision PRD — DeskHive

**Document A — Long-Term Vision (Architect Input)**

> **Purpose of this document.** This is a combined Product Brief (Mary's output) and Full Vision PRD (John's output) merged for orchestration efficiency, since one BA is playing both roles. It describes the **complete long-term product vision** across all anticipated phases. It is intended primarily for **Winston (System Architect)** so that data models and service boundaries chosen for Phase 1 do not block any future capability listed here. The Phase 1 implementation scope is defined separately in **Document B — Phase 1 PRD**.

| Field | Value |
|---|---|
| Document Owner | Business Analyst (orchestrating Mary + John roles) |
| Primary Audience | Winston (System Architect) |
| Secondary Audience | John (PM) for Phase 2+ planning; Sally (UX Designer) for long-term UX vision |
| Companion Document | Document B — Phase 1 PRD (authoritative for what gets built in MVP) |
| Version | 2.0 (BMad-aligned) |
| Status | Approved for Architecture handoff |
| Framework Alignment | BMAD-METHOD v6.2.2 (team-fullstack bundle) |

---

## Section 1 — Goals

### 1.1 Strategic Goals (24-Month Horizon)

- Become the most reliable inventory source for flexible coworking in target metros within 24 months.
- Achieve a verified-inventory base of 500+ spaces by end of Year 1.
- Maintain a booking-to-completion rate above 95%.
- Establish a take-rate revenue model with positive contribution margin per booking by end of Year 1.

### 1.2 Long-Term Success Metrics

- Gross Booking Value (GBV) per month.
- Active Guest cohort retention at 30, 60, and 90 days.
- Space Admin self-service activation rate (% of approved Admins who publish inventory within 7 days).
- Net Promoter Score (NPS) from Guests post-booking.
- Booking conflict / double-booking rate (must approach zero).

### 1.3 Phase 1 Goal (Bridges to Document B)

Validate end-to-end booking mechanics with a working two-week MVP demonstrating Guest discovery → booking → admin confirmation, with zero double-bookings under concurrent load.

---

## Section 2 — Background Context

### 2.1 Problem Statement

Remote and hybrid work has decoupled the worker from a fixed office. However, the supply of flexible workspace remains fragmented across hundreds of independent operators, each with their own website, booking process, and pricing model. A worker traveling between cities — or simply seeking a quiet day away from home — has no unified way to compare, select, and reserve a specific desk or room across operators.

### 2.2 Target Users

- **Guests** — Remote workers, freelancers, and business travelers seeking on-demand workspace by the day, week, or hour.
- **Space Admins** — Owners or managers of coworking spaces who need an additional channel to fill empty desks and meeting rooms.
- **Super Admins** — Internal platform staff responsible for compliance, listing quality, dispute resolution, and platform-wide configuration.

### 2.3 Business Opportunity

By aggregating supply and standardizing the booking experience, DeskHive captures take-rate revenue on each booking, builds a defensible inventory marketplace, and creates the data foundation for future products such as corporate workspace allowances, dynamic pricing optimization, and predictive availability.

### 2.4 Competitive Positioning

The closest analog in adjacent markets is Airbnb (lodging) and OpenTable (restaurants) — both of which succeeded by aggregating fragmented supply behind a unified booking layer. DeskHive applies the same playbook to workspace.

---

## Section 3 — User Roles & Permissions (Long-Term)

The platform supports three primary roles. Architecture must model these as a flexible role-based access control system to support additional roles in later phases (e.g., Corporate Account Manager).

| Role | Primary Capabilities | Boundary |
|---|---|---|
| **Guest** | Register, browse listings, search, view space and desk details, create bookings, view own booking history, cancel own bookings, leave reviews (post-MVP). | Cannot view other guests' bookings; cannot manage inventory. |
| **Space Admin** | Create and manage own coworking space listings; add/edit desks and meeting rooms; set availability and pricing; confirm or reject bookings for their own spaces; view bookings and revenue for their own spaces only. | Scoped strictly to spaces they own. Cannot see other Admins' data. |
| **Super Admin** | Approve/reject Space Admin applications; suspend listings or users; view platform-wide analytics; configure global parameters (commission rates, supported cities, currencies); resolve disputes. | Has full read access platform-wide; write access governed by audit log. |

> **Note for Phase 1:** Document B reduces this to two roles (Guest + Super Admin only). Space Admin is deferred. Architecture must still reserve the `SPACE_ADMIN` role enum value from day one.

---

## Section 4 — Functional Requirements (Long-Term Vision)

These FRs describe the complete product surface across all anticipated phases.

### 4.1 Account & Identity (FR-A)

- **FR-A1:** Email/password registration and login for Guests and Space Admins.
- **FR-A2:** Email verification via tokenized link.
- **FR-A3:** Password reset via emailed token.
- **FR-A4:** Social login (Google, Apple) — Phase 2.
- **FR-A5:** Profile management (display name, avatar, contact info, locale).
- **FR-A6:** Role-based permission enforcement on all routes.

### 4.2 Space & Desk Inventory Management (FR-I)

- **FR-I1:** Space Admin creates a Space (name, address, geolocation, description, amenities, photos).
- **FR-I2:** Space contains many Desks (hot desk, dedicated desk) and Meeting Rooms (capacity, hourly rate).
- **FR-I3:** Each desk/room has independent availability calendar and pricing.
- **FR-I4:** Bulk import of inventory via CSV — Phase 3.
- **FR-I5:** Photo gallery with primary image and ordered secondary images.
- **FR-I6:** Amenity tagging (Wi-Fi speed, monitor, standing desk, phone booth, kitchen, parking, etc.).

### 4.3 Search & Discovery (FR-S)

- **FR-S1:** Search by city, date range, and desk type.
- **FR-S2:** Filter by amenities, price range, capacity (for rooms), rating.
- **FR-S3:** Map-based browsing with cluster pins — Phase 2.
- **FR-S4:** Saved searches and favorites — Phase 2.
- **FR-S5:** Personalized recommendations based on booking history — Phase 3.

### 4.4 Booking Lifecycle (FR-B)

- **FR-B1:** Guest selects a specific desk or room, date(s), and time slot.
- **FR-B2:** System checks availability and prevents double-booking via atomic reservation.
- **FR-B3:** Booking moves through states: PENDING → CONFIRMED → COMPLETED (or CANCELLED / REJECTED / EXPIRED).
- **FR-B4:** Auto-cancel for unconfirmed bookings after configurable timeout.
- **FR-B5:** Modification of existing bookings (date change, desk swap) — Phase 2.
- **FR-B6:** Recurring bookings (e.g., every Tuesday for 8 weeks) — Phase 3.

### 4.5 Payments & Payouts (FR-P)

- **FR-P1:** Stripe integration for card-on-file authorization at booking time.
- **FR-P2:** Capture funds upon Confirmed status; release on Cancelled.
- **FR-P3:** Platform commission deducted; remainder paid to Space Admin via Stripe Connect.
- **FR-P4:** Refund flow with partial/full options.
- **FR-P5:** Multi-currency support — Phase 3.
- **Note:** Phase 1 uses booking status transitions only — no real money movement.

### 4.6 Reviews & Reputation (FR-R)

- **FR-R1:** Guests rate spaces 1–5 stars and leave a written review after a Completed booking.
- **FR-R2:** Space Admins can publicly respond to reviews.
- **FR-R3:** Review moderation by Super Admin.
- **FR-R4:** Aggregate ratings displayed on listings.

### 4.7 Messaging & Notifications (FR-M)

- **FR-M1:** In-platform messaging between Guest and Space Admin tied to a booking.
- **FR-M2:** Email notifications on booking state changes.
- **FR-M3:** SMS notifications for time-sensitive reminders — Phase 2.
- **FR-M4:** Push notifications via mobile app — Phase 3.

### 4.8 Super Admin Console (FR-SA)

- **FR-SA1:** Approve/reject Space Admin onboarding applications.
- **FR-SA2:** Suspend listings or accounts; view audit trail.
- **FR-SA3:** Global configuration: commission rate, supported cities/currencies, feature flags.
- **FR-SA4:** Platform-wide dashboards: GBV, active users, conversion funnel.
- **FR-SA5:** Dispute resolution console — Phase 2.

### 4.9 Analytics & Reporting (FR-AN)

- **FR-AN1:** Space Admin: occupancy rate, revenue, booking funnel for own spaces.
- **FR-AN2:** Super Admin: platform-wide metrics, cohort analysis, revenue breakdowns.
- **FR-AN3:** Exportable reports (CSV, PDF) — Phase 2.

---

## Section 5 — Non-Functional Requirements (Long-Term)

- **NFR-1 Availability:** 99.9% uptime SLO at scale.
- **NFR-2 Performance:** Search results returned in under 500ms p95 at 10k spaces.
- **NFR-3 Security:** OWASP Top 10 compliance, encrypted PII at rest, TLS in transit, rate limiting on auth endpoints.
- **NFR-4 Privacy:** GDPR-aligned data export and deletion for Guests.
- **NFR-5 Observability:** Structured logs, request tracing, business metrics dashboard.
- **NFR-6 Scalability:** Target 100k bookings/month at maturity; design for horizontal scaling of API tier.
- **NFR-7 Data Integrity:** Booking double-booking rate must be zero at the database constraint level, not just application-level checks.

---

## Section 6 — UX Goals (Long-Term Vision)

> **Note for Sally (UX Designer):** This is a stub UX vision for the long-term product. A full UX design specification will be produced via the `bmad-create-ux-design` skill at the end of the Phase 1 experiment when you wrap up the visual design.

### 6.1 Experience Principles

- **Booking confidence:** A Guest should never feel uncertain whether their reservation is secured. Status must be unambiguous at every step.
- **Operator control:** A Space Admin should feel in command of their inventory and revenue at all times.
- **Trust signals:** Every listing should communicate authenticity (verified photos, ratings, response time) to overcome the trust gap of an aggregator marketplace.

### 6.2 Long-Term Information Architecture

- Public marketing surface (landing, about, pricing).
- Discovery surface (search, list, map, space detail).
- Guest workspace (bookings, profile, payment methods, messages).
- Admin workspace (listings, calendars, bookings, payouts, analytics).
- Super Admin console (governance, configuration).

### 6.3 Phase 1 UX Constraint

Phase 1 deliberately ships with default Tailwind styling and minimal aesthetic polish to maximize functional throughput in the 2-week window. The Designer (Sally) wraps the product after MVP validation. Architecture must not encode brittle visual choices.

---

## Section 7 — Technical Assumptions (For Winston)

> **Direct guidance to Winston:** These are the BA's recommended technical assumptions. You may push back on any of them with documented rationale. Treat anything you change as a question to escalate to the BA.

### 7.1 Architecture Style

- **Single deployable web application** (not microservices) for MVP. Microservice decomposition is a Phase 4 concern.
- **Server-rendered or SPA** — Architect's call based on team familiarity. Prefer boring, well-supported stacks.
- **REST API** between frontend and backend. GraphQL is out of scope.

### 7.2 Database

- **PostgreSQL strongly preferred.** This is critical because the long-term vision (Section 4.4 FR-B2) requires database-level booking-overlap exclusion constraints, which PostgreSQL supports natively via partial unique indexes and `EXCLUDE` constraints. Other databases would force this logic into application code, which fails under concurrency.

### 7.3 Authentication

- Session-based or token-based — Architect's choice.
- Password hashing: bcrypt or argon2.
- No OAuth providers in Phase 1.

### 7.4 Forward-Compatibility Constraints (Critical)

These are the design choices that protect Phase 2+ from costly migrations:

- The `bookings` table must include `payment_status` and `payment_reference` columns as nullable from day one, even though Phase 1 does not write to them.
- The `users.role` enum must include `SPACE_ADMIN` as a defined value, even though no users will hold that role in Phase 1.
- Booking entity must support a polymorphic `bookable` reference (Desk now, MeetingRoom later) — model this as a `bookable_type` + `bookable_id` pair OR as a clean Desk-only schema in Phase 1 with a documented migration path.
- All monetary values stored as integer cents. Never floats.
- All timestamps stored in UTC.

### 7.5 Stubbed Infrastructure (Build Interfaces, Not Implementations)

- Email/SMS providers: stub behind an interface so Phase 2 can plug in SendGrid, Twilio, etc. without refactoring core booking logic.
- Payment provider: stub behind an interface. Phase 2 plugs in Stripe.
- Storage provider: not needed in Phase 1 (image URLs are plain strings).

### 7.6 Deployment

- Single staging environment is sufficient for Phase 1. Production deployment is a Phase 2 concern.
- Containerization (Docker) recommended but not required.

---

## Section 8 — Long-Term Conceptual Data Model

This section gives Winston the long-term entity picture so the Phase 1 schema decisions don't trap us later. Phase 1 implementations are defined in Document B Section 6.

### 8.1 Entities

- **User** — id, email, hashed_password, role, full_name, phone (nullable), avatar_url (nullable), email_verified_at (nullable), timestamps.
- **Space** — id, owner_user_id, name, slug, description, address fields, latitude, longitude, status (DRAFT/PUBLISHED/SUSPENDED), primary_image_url, timestamps.
- **Desk** — id, space_id, label, desk_type (HOT_DESK/DEDICATED_DESK), daily_price_cents, currency_code, is_active, timestamps.
- **MeetingRoom (Phase 2+)** — id, space_id, name, capacity, hourly_price_cents, currency_code, is_active, timestamps.
- **Booking** — id, guest_user_id, space_id, bookable_type, bookable_id, start_at, end_at, status (PENDING/CONFIRMED/REJECTED/CANCELLED/COMPLETED/EXPIRED), total_price_cents, currency_code, payment_status (nullable), payment_reference (nullable), timestamps.
- **Amenity (Phase 2+)** — id, code, label.
- **SpaceAmenity (Phase 2+)** — space_id, amenity_id.
- **Review (Phase 2+)** — id, booking_id (unique FK), guest_user_id, space_id, rating, comment, timestamp.
- **Thread / Message (Phase 2+)** — for in-platform messaging tied to bookings.
- **AuditLog (Phase 2+)** — id, actor_user_id, action, target_entity, target_id, metadata_json, timestamp.

### 8.2 Critical Long-Term Constraints

- A booking must reference exactly one bookable (Desk or MeetingRoom). Enforce via application invariants or polymorphic association.
- No two CONFIRMED or PENDING bookings may overlap in time for the same bookable. Enforce at database level (partial unique index for date-grain bookings; EXCLUDE constraint for time-range bookings).
- A Space cannot be hard-deleted while it has any non-terminal bookings. Use status=SUSPENDED (soft-delete).
- Money in cents (integer). Time in UTC.

---

## Section 9 — Long-Term Epic List

> **Phase 1 cuts this list dramatically.** See Document B Section 4 for what John (PM) has prepared as the Phase 1 Epics & Stories Listing for Bob (Scrum Master) to break down.

| # | Epic | Earliest Phase |
|---|---|---|
| E1 | Account & Identity | Phase 1 (subset) |
| E2 | Space & Desk Inventory Management | Phase 1 (subset) |
| E3 | Search & Discovery | Phase 1 (subset: city filter only) |
| E4 | Booking Lifecycle | Phase 1 (subset: status-only, daily grain) |
| E5 | Payments & Payouts | Phase 2 |
| E6 | Reviews & Reputation | Phase 2 |
| E7 | Messaging & Notifications | Phase 2 |
| E8 | Super Admin Console | Phase 1 (minimal, expanded in Phase 2) |
| E9 | Analytics & Reporting | Phase 3 |

---

## Section 10 — Out of Scope (Permanently or Far Future)

- Long-term residential leases — DeskHive is short-stay coworking only.
- Event ticketing or conference registration.
- Coliving / overnight accommodation.
- Hardware provisioning (laptops, monitors).
- White-label deployments for individual operators.

---

## Section 11 — Phased Roadmap

| Phase | Scope Summary | Timeframe |
|---|---|---|
| **Phase 1 (MVP)** | Guest browse + book; minimal Super Admin tools; status-only booking lifecycle. No payments. See Document B for the strict cut. | 2 weeks (current experiment) |
| **Phase 2** | Space Admin self-service onboarding; Stripe payments + payouts; reviews; email notifications; basic messaging. | Months 2–4 |
| **Phase 3** | Map browsing, advanced search, recurring bookings, mobile app, multi-currency, dispute resolution. | Months 5–9 |
| **Phase 4** | Corporate accounts, dynamic pricing, predictive availability, public API. | Months 10+ |

---

## Section 12 — Direct Handoff Notes for Winston (System Architect)

> Winston, this section is written specifically for you. Read it before producing the architecture document.

### 12.1 What You Are Designing

You are designing the architecture for the **full product vision** described in Sections 4 and 8 of this document, but you will only **implement** the Phase 1 subset described in Document B.

The reason for this split: Phase 1 must ship in 2 weeks, but cannot make schema or boundary decisions that will require destructive migrations in Phase 2+.

### 12.2 The Three Decisions That Matter Most

1. **Database choice.** Section 7.2 strongly recommends PostgreSQL. The booking-overlap constraint (Section 4.4 FR-B2 and Section 8.2) is the reason. If you propose a different database, you must demonstrate how booking overlap is prevented at the data layer with the same correctness guarantees.

2. **Forward-compatible Booking schema.** Section 7.4 lists the specific columns and enum values that must exist from day one even though Phase 1 won't use them. This is non-negotiable.

3. **Stubbed infrastructure interfaces.** Section 7.5 — payment, email, SMS, storage. Build the interfaces in Phase 1 even though only no-op or basic implementations exist behind them. This protects Phase 2 velocity.

### 12.3 What to Produce

Run the `bmad-create-architecture` skill (capability `CA`) to produce the architecture document. When that document is complete, run `bmad-check-implementation-readiness` (capability `IR`) to verify alignment between this PRD, the Phase 1 PRD (Document B), and your architecture.

### 12.4 When to Escalate

Stop and ask the BA before proceeding if:

- You believe a Phase 1 design choice would block any Phase 2/3/4 capability listed in Section 4.
- You believe the recommended technical assumptions in Section 7 are wrong for any specific reason.
- You discover that the Phase 1 PRD (Document B) contradicts a constraint in this document.

---

## Section 13 — Implementation Readiness Checklist

> For John (PM) to verify before handing off to Winston, using `bmad-validate-prd`.

- [ ] All long-term roles (Guest, Space Admin, Super Admin) defined with bounded permissions.
- [ ] All long-term epics enumerated with phase assignment.
- [ ] All long-term entities listed with fields.
- [ ] Critical data integrity constraints documented (booking overlap, money in cents, UTC timestamps).
- [ ] Forward-compatibility constraints explicitly called out for Phase 1 (Section 7.4).
- [ ] Out-of-scope list documented.
- [ ] Companion Phase 1 PRD (Document B) referenced for the authoritative implementation scope.
- [ ] Direct handoff section to Winston (Section 12) included.
