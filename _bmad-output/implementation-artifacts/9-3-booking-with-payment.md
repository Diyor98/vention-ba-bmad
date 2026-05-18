# Story 9-3: Booking with Payment via Stripe Checkout

Status: ready-for-dev

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a **Guest who wants to book a desk on DeskHive**,
I want **to be redirected to Stripe Checkout to authorize payment on my card** — with my booking pre-claiming the desk/date slot before the redirect, then transitioning to PENDING + AUTHORIZED after I complete payment —
so that **my booking is recorded as PENDING with the payment held (but not captured) until the Space Owner confirms it, the desk/date slot is reserved against concurrent bookings during my checkout flow, and the Space Owner's payout (minus DeskHive's 15% platform fee) is automatically routed via Stripe Connect when the booking is later captured.**

> Story 9-3 is the **first Phase 2 story that exercises real money flow** (test mode). It composes everything Theme B has shipped so far: Story 9-1's Stripe SDK seam, Story 9-2's `stripe_connect_accounts` table + narrow webhook handler, and Story 9-2b's cached-Connect-state-active check pattern.
>
> Source of truth: [docs/design/9-3-booking-with-payment-ba-decisions.md](docs/design/9-3-booking-with-payment-ba-decisions.md) — 15 locked decisions. Locked 2026-05-18 (BA: Ikhtiyor Ziyayev), committed `7a719ed`.

> **Companion / dependency chain:** Story 9-1 (`feat(stripe): Story 9-1 — Stripe SDK wrapper`, shipped at `aff4060`) + Story 9-2 (`feat(stripe): Story 9-2 — Stripe Connect Express onboarding`, shipped at `0d384e0`) + Story 9-2b (`feat(stripe): Story 9-2b — publish gating`, shipped at `7e7251c` + fixture follow-up `2d65c54`). All three are on `main` (verify with `git log --oneline | grep "Story 9-"`).

> **After 9-3 ships, the running app behaves like this:** a Guest navigates to `/spaces/[id]`, picks a date, clicks "Book this desk" → the server pre-claims a booking row (`PENDING + AWAITING_PAYMENT + payment_intent_id=NULL`) and creates a Stripe Checkout Session in `manual` capture mode with `transfer_data.destination` set to the space owner's Connect account + `application_fee_amount` set to DeskHive's 15% cut. The Guest is redirected to `https://checkout.stripe.com/...`, enters a test card (`4242 4242 4242 4242`), and authorizes. Stripe redirects the Guest back to `/spaces/[id]/booking/return?session_id=cs_xxx`, where the server verifies both `session.status === 'complete'` AND `session.payment_intent.status === 'requires_capture'`, updates the booking with `payment_intent_id` + `payment_status='AUTHORIZED'`, and redirects to `/my-bookings?just_booked=1` (where the existing Story 6-3 toast fires). A `checkout.session.completed` webhook also fires asynchronously as a backstop in case the browser-redirect path was missed (e.g., Guest closed the tab). The booking is now PENDING + AUTHORIZED, awaiting Owner Confirm in Story 9-4 (which will trigger `stripe.paymentIntents.capture(...)`).

> **Key anti-patterns to keep in mind:**
> - **No floating-point math** — all money calculations through `src/lib/money.ts` integer-cents helpers (Decision §2; PRD CC-2).
> - **No Stripe SDK imports outside `src/lib/stripe.ts` and `src/lib/payments/*`** (Decision §4; PRD CC-3).
> - **No booking-row insert AFTER payment authorization** — pre-claim is non-negotiable (Decision §3 load-bearing lock).
> - **No new `bookings.status` enum values** — payment sub-state lives in `payment_status` (Decision §3).
> - **No `@stripe/stripe-js` install** — deferred again (Decision §7). Server returns `session.url`; client redirects via `window.location.assign(url)`.
> - **No Stripe API calls from the webhook handler** — the event payload contains everything needed (Decision §6; 9-2 carries forward).
> - **No trusting `?session_id` without re-fetching the Session from Stripe** (Decision §5).
> - **No skipping the Connect-state-active gate** at the booking-create boundary — defense in depth (Decision §8).
> - **No per-booking-id idempotency keys** for Checkout — per-attempt UUID is the locked pattern (Decision §9).
> - **No email sends from this story's webhook handler** — Story 8-4 territory (Decision §6).
> - **No widening the webhook scope beyond `checkout.session.completed`** — 9-5 generalizes (Decision §6).
> - **No abandoned-payment cleanup mechanism** — deferred to 9-5 / polish backlog (Decision §3).
> - **No entering Stripe Checkout UI from Playwright** — test the URL boundary only (Decision §12).
> - **No `LIKE 'prefix%'` cleanup in E2E afterEach** — exact-match cleanup is parallelism-safe (Decision §12; 9-2b lesson).
> - **No ad-hoc toast strings at call sites** — `TOAST_COPY` is the single source (Decision §10).

## Acceptance Criteria

> Source: locked BA Decisions document Decisions 1–15 + Browser verification checklist (8 points).

1. **AC-1 (Drizzle schema: add 3 columns to `bookings` + add `bookings_payment_status_check` constraint).** Per BA Decision §1 + §3:
   - Edit [src/db/schema.ts](deskhive/src/db/schema.ts) `bookingsTable`:
     - Add `paymentIntentId: text('payment_intent_id')` (NULLABLE; populated by return-URL handler or webhook backstop).
     - Add `totalCents: integer('total_cents').notNull().default(0)` (covers Phase 1 backfill).
     - Add `platformFeeCents: integer('platform_fee_cents').notNull().default(0)` (covers Phase 1 backfill).
   - Add a new CHECK constraint `bookings_payment_status_check` enforcing `payment_status IN ('AWAITING_PAYMENT', 'AUTHORIZED')`. Existing Phase 1 NULL rows continue to satisfy the constraint (PG CHECK allows NULL by default). Stories 9-4 + 9-6 extend the constraint via the same DROP/ADD pattern 9-2b used for `spaces.status`.
   - **Do NOT** add a new `bookings.status` enum value, **do NOT** add `refunded_at` / `refund_amount_cents` (9-6 territory), **do NOT** make `payment_intent_id` UNIQUE at the DB level (Stripe PI IDs are unique by construction; let 9-4 add an index if it needs one).
   - Run `pnpm db:generate` to produce migration `deskhive/drizzle/migrations/0005_*.sql`. Inspect the SQL — should be 3 `ALTER TABLE bookings ADD COLUMN ...` statements + 1 `ALTER TABLE bookings ADD CONSTRAINT bookings_payment_status_check ...` statement. No data changes.
   - Add a story-tag comment block at the top of the generated migration matching the Story 9-2b convention (`0004_fine_ronan.sql` shape — story description + Phase 1 backfill stance + rollback hint: `DROP CONSTRAINT` + 3 `DROP COLUMN`).

2. **AC-2 (Money helpers: `calculatePlatformFee` + `calculateOwnerPayout`).** Per BA Decision §2:
   - Edit [src/lib/money.ts](deskhive/src/lib/money.ts) — add a `PLATFORM_FEE_BPS` constant (`1500` for 15%) + an inline Phase 3 migration comment (mirroring 9-2's `country: 'US'` hardcoded pattern).
   - Add `calculatePlatformFee(amountCents: number, feeBps: number = PLATFORM_FEE_BPS): number` — integer-only via `Math.floor(amountCents * feeBps / 10000)`. **Rounding direction: `Math.floor`** (toward zero; platform never collects more than the nominal 15%).
   - Add `calculateOwnerPayout(amountCents: number, feeCents: number): number` — returns `amountCents - feeCents`. Same integer-only guarantee.
   - **Anti-pattern enforced:** do NOT use floating-point math anywhere (`*0.15`, `parseFloat`, etc. — CC-2). Do NOT round at intermediate steps — calculate `feeCents` once, derive payout from it. Do NOT read `PLATFORM_FEE_BPS` from env in Phase 2 (Phase 3 seam, documented in the inline comment).

3. **AC-3 (Stripe Checkout sub-module `src/lib/payments/checkout.ts`).** Per BA Decision §4:
   - Create new sub-module [src/lib/payments/checkout.ts](deskhive/src/lib/payments/checkout.ts) following the same pattern as 9-2's `connect.ts`:
     ```typescript
     export async function createCheckoutSession(args: {
       spaceName: string;
       amountCents: number;
       platformFeeCents: number;
       ownerStripeAccountId: string;
       bookingId: string;
       guestEmail: string;
       successUrl: string;  // absolute URL with {CHECKOUT_SESSION_ID}
       cancelUrl: string;
       idempotencyKey: string;
     }): Promise<StripeServiceResult<{ sessionId: string; url: string }>>;
     ```
   - The body calls `stripe.checkout.sessions.create({ mode: 'payment', line_items: [...], payment_intent_data: { capture_method: 'manual', transfer_data: { destination: ownerStripeAccountId }, application_fee_amount: platformFeeCents, metadata: { bookingId } }, client_reference_id: bookingId, customer_email: guestEmail, success_url, cancel_url }, { idempotencyKey })` — see Decision §4 for the verbatim API body.
   - Errors caught + returned as `{ ok: false, error: '...' }` per the `StripeServiceResult<T>` discriminated-union pattern from 9-1.
   - **Anti-pattern enforced:** do NOT use `mode: 'subscription'`, do NOT use `payment_method_types: ['card']` (let Stripe pick the default set), do NOT set `customer` on the Session (use `customer_email` for pre-fill only), do NOT skip `idempotencyKey`, do NOT call `stripe.checkout.sessions.create` from outside `src/lib/payments/checkout.ts`.

4. **AC-4 (New Server Action `createBookingWithPaymentAction` with locked behavior).** Per BA Decision §3 + §8 + §9:
   - Create [src/actions/booking-with-payment.ts](deskhive/src/actions/booking-with-payment.ts) (new file).
   - Action signature: `(prevState, formData) => Promise<CreateBookingWithPaymentActionState>` with a discriminated-union state:
     ```typescript
     export type CreateBookingWithPaymentActionState =
       | { status: 'idle' }
       | { status: 'success'; redirectUrl: string }
       | { status: 'error'; code: 'UNAUTHORIZED'; message: string }
       | { status: 'error'; code: 'FORBIDDEN'; message: string }
       | { status: 'error'; code: 'VALIDATION_ERROR'; fields: Record<string, string> }
       | { status: 'error'; code: 'PAST_DATE'; message: string }
       | { status: 'error'; code: 'DESK_NOT_FOUND'; message: string }
       | { status: 'error'; code: 'STRIPE_NOT_ACTIVE'; message: string }
       | { status: 'error'; code: 'DOUBLE_BOOKING'; message: string }
       | { status: 'error'; code: 'INTERNAL_ERROR'; message: string };
     ```
   - **Locked 9-step behavior** (Decision §3 pre-claim + §8 Connect gate + §9 idempotency):
     1. Auth: `requireSession()` + `requireRole(session, 'GUEST')`. On 401 → redirect to `/login?callbackUrl=/spaces/${spaceId}?date=${bookingDate}` (Phase 1 parity). On 403 → `FORBIDDEN`.
     2. Validation: `createBookingSchema.safeParse({ deskId, bookingDate })`. On failure → `VALIDATION_ERROR` with `fields`.
     3. Past-date check: `isPastDate(parsed.data.bookingDate)` → `PAST_DATE` (verbatim PRD message "Booking date cannot be in the past").
     4. Existence: `getActiveDeskById(deskId)` + `getPublishedSpaceById(desk.spaceId)`. Either missing → `DESK_NOT_FOUND` (Phase 1 parity: collapse desk-missing/space-not-published into one user-facing code).
     5. **Connect-state-active gate** (Decision §8): `getConnectAccountByUserId(space.ownerId)`. If row missing OR `chargesEnabled !== true` OR `payoutsEnabled !== true` → `STRIPE_NOT_ACTIVE` (verbatim copy from Decision §10's `BOOKING_FAILED_STRIPE_NOT_ACTIVE`).
     6. **Money math**: `totalCents = desk.dailyPriceCents`; `platformFeeCents = calculatePlatformFee(totalCents)`; `payoutCents = calculateOwnerPayout(totalCents, platformFeeCents)` (Decision §2). Payout amount is NOT stored — derive on the fly from `total - fee` when needed.
     7. **Pre-claim booking row** (Decision §3 load-bearing): `db.insert(bookingsTable).values({ guestUserId, spaceId, deskId, bookingDate, status: 'PENDING', paymentStatus: 'AWAITING_PAYMENT', paymentIntentId: null, totalPriceCents: desk.dailyPriceCents, totalCents, platformFeeCents })`. Catch unique violations on `uniq_active_booking_per_desk_per_date` → `DOUBLE_BOOKING` (Phase 1 parity; verbatim message "This desk is already booked for that date"). Other DB errors → `INTERNAL_ERROR`.
     8. **Idempotency key** (Decision §9): `const idempotencyKey = \`checkout-${crypto.randomUUID()}\`;`.
     9. **Create Checkout Session** (Decision §4): `createCheckoutSession({ ... })` from `src/lib/payments/checkout.ts`. On `{ ok: false }` → `BOOKING_FAILED_PAYMENT_INIT` error code (the action returns `INTERNAL_ERROR` with the stripe error message; the client's toast picks the `BOOKING_FAILED_PAYMENT_INIT` copy by code mapping). On `{ ok: true }` → return `{ status: 'success', redirectUrl: result.data.url }`. Client redirects via `window.location.assign(url)` (Decision §7).
   - **Anti-pattern enforced:** the action consults the cached DB row for Connect state — **NO calls to Stripe API for the Connect-active gate** (Decision §8 pure-DB-read). Story 9-2's `account.updated` webhook keeps the cache fresh.
   - **No new error code "NOT_OWNER"** — there's no cross-tenant concern at the booking-create gate (the Guest is allowed to book any published space; the gate is Connect-active, not ownership). All error codes listed above are reachable.
   - **No `revalidatePath` on success** — the client redirects to Stripe (an external URL), so revalidation happens after the return-URL handler updates the booking (AC-6).

5. **AC-5 (Delete legacy `createBookingAction` + rewrite `<BookDeskButton>` Client Component).** Per BA Decision §3 + §7:
   - **Delete** the `createBookingAction` function + its `CreateBookingActionState` type from [src/actions/booking.ts](deskhive/src/actions/booking.ts). Single source of truth. The other exports (`cancelBookingAction`, `confirmBookingAction`, `rejectBookingAction`) stay.
   - Edit [src/app/spaces/[id]/book-desk-button.tsx](deskhive/src/app/spaces/[id]/book-desk-button.tsx) — rewrite to use `createBookingWithPaymentAction`:
     - `useActionState(createBookingWithPaymentAction, initialState)`.
     - On `state.status === 'success'`: `window.location.assign(state.redirectUrl)` (Decision §7 — Stripe Checkout URL is external; can't use Next's `redirect()` from a Server Action across the form boundary cleanly).
     - On `state.status === 'error'`: fire `toastError` with the code-to-copy mapping (Decision §10). Map `STRIPE_NOT_ACTIVE` → `BOOKING_FAILED_STRIPE_NOT_ACTIVE`. Map `INTERNAL_ERROR` (when the action's underlying failure was a Stripe error) → `BOOKING_FAILED_PAYMENT_INIT`. Map `DOUBLE_BOOKING` / `PAST_DATE` / `DESK_NOT_FOUND` / `VALIDATION_ERROR` → existing Story 6-3 copy (carry-forward).
     - On `state.status === 'success'` — do NOT fire the success toast from here. The toast fires on `/my-bookings?just_booked=1` after the return-URL handler (AC-6 / AC-8).
   - **Anti-pattern enforced:** do NOT keep the legacy `createBookingAction` as a dead export. Do NOT call `<BookDeskButton>` from any other route — it's `/spaces/[id]` only. Do NOT redirect to `/my-bookings` from this Client Component — the Stripe Checkout flow owns the post-success navigation.

6. **AC-6 (Return-from-Checkout Server Component).** Per BA Decision §5:
   - Create [src/app/spaces/[id]/booking/return/page.tsx](deskhive/src/app/spaces/[id]/booking/return/page.tsx) as a Server Component (NOT a Server Action — Decision §5).
   - **Locked 7-step flow:**
     1. Read `?session_id=cs_xxx` query param. If missing or malformed (regex: starts with `cs_`) → `redirect('/spaces/[id]?booking_error=invalid_session')`.
     2. `stripe.checkout.sessions.retrieve(sessionId, { expand: ['payment_intent'] })`. If lookup fails → `redirect('/spaces/[id]?booking_error=lookup_failed')`. (Note: `stripe.checkout.sessions.retrieve` is the FIRST direct Stripe API call from a Server Component path — wrap it in a thin helper in `src/lib/payments/checkout.ts` to stay consistent with the seam discipline from Decision §4. Helper signature: `retrieveCheckoutSession(sessionId): Promise<StripeServiceResult<{ session: Stripe.Checkout.Session; paymentIntent: Stripe.PaymentIntent }>>`.)
     3. **Belt-and-suspenders verification** (Decision §5 locked): verify BOTH `session.status === 'complete'` AND `session.payment_intent.status === 'requires_capture'`. Either check failing → `redirect('/spaces/[id]?booking_error=verification_failed')`.
     4. Look up the booking by `session.metadata.bookingId` (preferred) OR `session.client_reference_id` (belt-and-suspenders). Verify `booking.guest_user_id === session.user.id` (cross-tenant defense). Mismatch → `redirect('/spaces/[id]?booking_error=ownership_mismatch')`.
     5. `db.update(bookingsTable).set({ paymentIntentId: session.payment_intent.id, paymentStatus: 'AUTHORIZED' }).where(eq(bookingsTable.id, bookingId))`. Idempotent — running twice with the same `payment_intent.id` is a no-op (or technically a same-row UPDATE; the WHERE matches the same row, the SET values are the same; PG returns ROW updated but the effective state is unchanged).
     6. `revalidatePath('/my-bookings')` + `revalidatePath('/spaces/[id]')`.
     7. `redirect('/my-bookings?just_booked=1')` — the existing `/my-bookings` page fires the toast (AC-8).
   - **Anti-pattern enforced:** do NOT create the booking from this handler (pre-claim already happened in AC-4). Do NOT trust `session.client_reference_id` as the only lookup key — verify `session.metadata.bookingId` too. Do NOT skip the user-ownership check. Do NOT do anything financial here (capture is 9-4 territory).

7. **AC-7 (Webhook handler extension — narrow `checkout.session.completed` branch).** Per BA Decision §6:
   - Edit [src/app/api/stripe/webhook/route.ts](deskhive/src/app/api/stripe/webhook/route.ts) — add a new branch after the existing `account.updated` branch:
     ```typescript
     if (event.type === 'checkout.session.completed') {
       const session = event.data.object as Stripe.Checkout.Session;
       const bookingId = session.metadata?.bookingId;
       if (!bookingId) {
         logger.warn('stripe_webhook_checkout_no_booking_id', { eventId: event.id });
         return Response.json({ received: true, deferred: true }, { status: 200 });
       }
       // Lookup booking → if paymentIntentId already populated, idempotent no-op
       //   (do NOT insert into webhook_events — return-URL handler won the race)
       // Else → UPDATE booking with paymentIntentId + paymentStatus='AUTHORIZED'
       //   + INSERT webhook_events row (only on first real handle, mirrors 9-2)
       // ...
     }
     ```
   - Lookup `payment_intent.id` from `session.payment_intent` (expand) or call `stripe.paymentIntents.retrieve(session.payment_intent as string)` — **🟠 NOTE FOR DEV:** webhooks deliver Sessions with `payment_intent` as a string ID by default. The handler may need to fetch the PI to get its details. BUT — Decision §6's anti-pattern bans Stripe API calls from inside the handler. Two options for the dev-agent: (a) the webhook payload contains the PI ID as a string; we just write that string to `paymentIntentId` without fetching the PI object. (b) Fetch the PI to verify `requires_capture` status before writing. **Strawman recommends (a)** — the webhook event is signed (verified upstream), so the PI ID is trustworthy; we don't need the PI object to update the booking. Decision §6's anti-pattern stands.
   - Idempotency check + insert pattern mirrors the existing `account.updated` branch (use the same `errMessage` / `errCause` helpers; same 3-stage try/catch around DB ops; same "insert webhook_events only on first successful handle" anti-pattern from 9-2's Decision §7).
   - Other event types stay unhandled (acknowledged with `200 OK`, NOT inserted into `webhook_events`).
   - **Anti-pattern enforced:** do NOT add handlers for `payment_intent.succeeded`, `payment_intent.payment_failed`, `charge.refunded`, `payout.paid`, or `checkout.session.expired` — all 9-5 territory. Do NOT trigger email sends from this handler — 8-4 territory. Do NOT call any Stripe API from inside the handler (Decision §6).

8. **AC-8 (`/my-bookings?just_booked=1` toast handling).** Per BA Decision §5 + extends Story 6-3 pattern:
   - Edit [src/app/my-bookings/page.tsx](deskhive/src/app/my-bookings/page.tsx) — read the `?just_booked=1` query param. If present, render a small Client Component (or inline `useEffect` in an existing Client Component) that fires `toastSuccess(TOAST_COPY.BOOKING_SUCCESS_TITLE, { description: TOAST_COPY.BOOKING_SUCCESS_DESCRIPTION, action: { label: TOAST_COPY.BOOKING_SUCCESS_ACTION_LABEL, onClick: () => router.push('/my-bookings') } })`.
   - Copy is unchanged from Story 6-3 — only the firing context changes (was on `/spaces/[id]` after the inline `createBookingAction` succeeded; now on `/my-bookings` after the return-URL redirect).
   - **The action button** ("View in My Bookings") is now a no-op-from-current-page since the user is already on `/my-bookings`. Keep the action button (consistent UX) — or strip the action and use the description-only variant. **🟠 DEV-AGENT JUDGMENT CALL:** strawman recommends keeping the action button as a soft-no-op (router refresh) for visual consistency; dev-agent may strip it if it feels off. Document in DAR either way.
   - **Anti-pattern enforced:** do NOT introduce ad-hoc toast strings (Decision §10). Do NOT fire the toast from the return-URL Server Component (Decision §5 — transient page, redirect away before render).

9. **AC-9 (Toast copy extensions in `src/lib/toast.ts`).** Per BA Decision §10:
   - Edit [src/lib/toast.ts](deskhive/src/lib/toast.ts) — add 3 new `TOAST_COPY` entries:
     ```typescript
     BOOKING_FAILED_STRIPE_NOT_ACTIVE: 'This space can\'t accept bookings right now.',
     BOOKING_FAILED_PAYMENT_INIT: 'Payment couldn\'t start. Please try again.',
     BOOKING_CANCELLED_PAYMENT: 'Payment cancelled — your card was not charged.',
     ```
   - `BOOKING_SUCCESS_*` from Story 6-3 stay unchanged.
   - **Anti-pattern enforced:** do NOT introduce ad-hoc strings at call sites (Decision §10).

10. **AC-10 (Unit tests — 9 new).** Per BA Decision §11:
    - **`src/actions/booking-with-payment.test.ts`** (NEW — 5 tests):
      1. **Happy path:** valid inputs + Connect-active owner → booking pre-claimed + Checkout Session URL returned in state.
      2. **DOUBLE_BOOKING:** unique-violation surfaces as `DOUBLE_BOOKING` code (Phase 1 parity).
      3. **STRIPE_NOT_ACTIVE:** owner without Connect row → action returns `STRIPE_NOT_ACTIVE`; booking NOT inserted; Stripe Checkout NOT called.
      4. **Carry-forward errors:** one combined test (or split per code at dev-agent discretion) verifying `PAST_DATE` / `VALIDATION_ERROR` / `DESK_NOT_FOUND` codes carry forward correctly.
      5. **Stripe API failure** (Checkout Session creation throws AFTER pre-claim insert) → action returns `INTERNAL_ERROR`. **Cleanup is deferred per Decision §3** — the AWAITING_PAYMENT row stays in the DB; the test asserts the action's return shape, not row cleanup.
    - **`src/lib/money.test.ts`** extensions (3 tests):
      1. `calculatePlatformFee(2500)` → 375 (15% of $25 = $3.75).
      2. Parameterized: `calculatePlatformFee(amountCents, feeBps)` with various bps values + edge cases (`calculatePlatformFee(0)` → 0; `calculatePlatformFee(1)` → 0 since `Math.floor(150/10000) = 0`).
      3. `calculateOwnerPayout(2500, 375)` → 2125.
    - **`src/lib/payments/checkout.test.ts`** (NEW — 2 tests):
      1. Wrapper happy path: Stripe SDK called with correct args (mocked); result wrapped as `StripeServiceResult<{ sessionId, url }>`.
      2. Wrapper error path: Stripe throws → result wrapped as `{ ok: false, error: '...' }`.
    - **`src/app/api/stripe/webhook/route.test.ts`** extension (2 new tests):
      1. `checkout.session.completed` happy path: booking updated with `payment_intent_id` + `payment_status='AUTHORIZED'`; `webhook_events` row inserted.
      2. `checkout.session.completed` idempotent: booking already has `payment_intent_id` (return-URL handler won the race) → handler is a no-op; `webhook_events` row NOT inserted (mirrors 9-2's "only insert on first real handle" anti-pattern).
    - **Target unit test count after this story:** 334 (baseline at end of Story 9-2b post-BA-walk follow-up) + 9 = **343**.
    - **Mock pattern reminder:** split-by-mock-boundary (memorized from 9-2). Action tests mock `@/lib/payments/checkout`; wrapper tests mock `@/lib/stripe`. Do NOT cross the mock boundary.

11. **AC-11 (E2E tests — 2 new, with test-owns-Connect-state pattern).** Per BA Decision §12:
    - Create [tests/e2e/booking-with-payment.spec.ts](deskhive/tests/e2e/booking-with-payment.spec.ts). Add `test.describe.configure({ mode: 'serial' })` since both tests mutate the same `owner@deskhive.local` Connect row.
    - **Test 1 — happy path up to Checkout boundary:**
      - `beforeEach`: ensure `owner@deskhive.local`'s `stripe_connect_accounts` row is in the seeded synthetic-active state (`chargesEnabled: true`, `payoutsEnabled: true`).
      - Sign in as `guest@deskhive.local` via `authenticatedPage('guest')`. Navigate to `/spaces/[seeded-space-id]` (the seeded `Seeded Owner Coworks` space).
      - Pick a future date via the date picker. Click "Book this desk".
      - Assert that the redirect target starts with `https://checkout.stripe.com/` (the URL boundary — do NOT enter Stripe Checkout).
      - Assert that a `bookings` row exists in the DB with `status='PENDING'` + `payment_status='AWAITING_PAYMENT'` + `payment_intent_id IS NULL` + `total_cents > 0` + `platform_fee_cents > 0`.
      - `afterEach`: delete the test's specific booking row by exact-match `(guestUserId, deskId, bookingDate)` cleanup.
    - **Test 2 — gated path:**
      - `beforeEach`: mutate the seeded `owner@deskhive.local`'s Connect row to set `chargesEnabled: false` (simulates a Connect-inactive owner).
      - Sign in as `guest@deskhive.local`. Navigate to `/spaces/[seeded-space-id]`. Pick a date. Click "Book this desk".
      - Assert the error toast surfaces with text matching `BOOKING_FAILED_STRIPE_NOT_ACTIVE` ("This space can't accept bookings right now.").
      - Assert that NO `bookings` row was created.
      - `afterEach`: restore the seeded synthetic-active Connect state.
    - **`afterAll`** (or end of `afterEach` on the last test): restore `owner@deskhive.local`'s synthetic Connect row to the seeded active state to leave the DB clean for downstream specs (the same defensive-restore pattern from 9-2b).
    - **Target E2E test count after this story:** 58 (baseline at end of 9-2b follow-up) + 2 = **60**.
    - **Operational reminder:** the Story 8-POLISH-1 dev-server-reuse hazard + Story 7-PREP-1 mutation-discipline cascade are still alive. Restart `pnpm dev` after pulling 9-3 + re-run `pnpm db:seed`. Cross-file race awareness: `connect-onboarding.spec.ts` also mutates `owner@deskhive.local`'s Connect row; serial mode within the describe + test-owns-state pattern make `booking-with-payment.spec.ts` resilient. If full-suite parallel exposes a race, mitigation is the defensive re-restore pattern from 9-2b (immediately before the assertion).

12. **AC-12 (Memory file extension).** Per BA Decision §13:
    - Extend out-of-tree `~/.claude/.../memory/reference_stripe_service_pattern.md` with a new section "Story 9-3 additions — Booking with Payment via Stripe Checkout" covering:
      - Sub-module pattern: `src/lib/payments/checkout.ts` as the second example after 9-2's `connect.ts`.
      - Checkout Session config: destination charge + manual capture + `application_fee_amount` — the marketplace-payment template for Stories 9-4 / 9-6.
      - Pre-claim booking row before Checkout Session — the slot-claim-race pattern. Cross-reference Phase 1's `uniq_active_booking_per_desk_per_date`.
      - `payment_status` column + CHECK constraint pattern (mirrors 9-2b's enum-extension).
      - Per-attempt UUID idempotency key (distinct from 9-2's per-user key).
      - Return-URL Server Component + narrow webhook backstop pattern.
      - Connect-state-active gate at the booking-create boundary — third instance of the pattern.
      - Test-owns-Connect-state pattern carry-forward from 9-2b.
      - Forward-looking notes: 9-4 (capture), 9-5 (webhook generalization), 9-6 (refunds), 8-4 (payment emails).
    - Update `~/.claude/.../memory/MEMORY.md` one-liner.
    - **No new memory file** — extend the existing reference.

13. **AC-13 (`git diff` scope — bounded per Decision §14).**
    - All changes confined to:
      - `deskhive/src/db/schema.ts` — 3 columns + CHECK constraint
      - `deskhive/drizzle/migrations/0005_*.sql` (new, auto-generated + story-tag comment)
      - `deskhive/drizzle/migrations/meta/0005_snapshot.json` + `_journal.json` (auto)
      - `deskhive/src/lib/money.ts` — `calculatePlatformFee` + `calculateOwnerPayout` + `PLATFORM_FEE_BPS` constant
      - `deskhive/src/lib/money.test.ts` — 3 new tests
      - `deskhive/src/lib/payments/checkout.ts` (new) — Stripe Checkout wrapper(s)
      - `deskhive/src/lib/payments/checkout.test.ts` (new) — 2 unit tests
      - `deskhive/src/actions/booking-with-payment.ts` (new) — `createBookingWithPaymentAction`
      - `deskhive/src/actions/booking-with-payment.test.ts` (new) — 5 unit tests
      - `deskhive/src/actions/booking.ts` — **DELETE** `createBookingAction` + `CreateBookingActionState` (other exports stay)
      - `deskhive/src/app/spaces/[id]/book-desk-button.tsx` — rewrite to use new action + `window.location.assign(url)`
      - `deskhive/src/app/spaces/[id]/booking/return/page.tsx` (new) — return-URL Server Component
      - `deskhive/src/app/api/stripe/webhook/route.ts` — add `checkout.session.completed` branch
      - `deskhive/src/app/api/stripe/webhook/route.test.ts` — 2 new tests
      - `deskhive/src/app/my-bookings/page.tsx` — read `?just_booked=1` + fire toast
      - `deskhive/src/lib/toast.ts` — 3 new `TOAST_COPY` entries
      - `deskhive/tests/e2e/booking-with-payment.spec.ts` (new) — 2 E2E tests
      - `_bmad-output/implementation-artifacts/sprint-status.yaml`
      - `_bmad-output/implementation-artifacts/9-3-booking-with-payment.md` (this file)
      - Memory files in `~/.claude/.../memory/` (out-of-tree)
    - **Zero changes to:**
      - `deskhive/src/lib/stripe.ts` (Story 9-1's singleton)
      - `deskhive/src/lib/stripe-service.ts` (Story 9-1's barrel)
      - `deskhive/src/lib/payments/connect.ts` (Story 9-2's wrappers)
      - `deskhive/src/lib/email*` / `deskhive/src/lib/email-templates/`
      - `deskhive/src/app/(owner)/owner/settings/*` (Story 9-2's UI)
      - `deskhive/src/app/(owner)/owner/spaces/*` (Story 9-2b's UI)
      - The booking Confirm / Reject Server Actions (Story 9-4 extends them with capture / cancel)
      - `scripts/seed.ts` (no new seed users — `owner-pending-onboarding` from 9-2b stays; the gated-path E2E mutates `owner@`'s Connect row in `beforeEach` per Decision §12)
      - Better Auth config / Tailwind / proxy.ts / playwright.config.ts

14. **AC-14 (Single commit + memory + docs follow-up after BA greenlight).** Per the Story 9-1 / 9-2 / 9-2b established pattern:
    - All Story 9-3 changes land in a single commit on `main` titled `feat(stripe): Story 9-3 — booking with payment`.
    - A small follow-up `docs:` commit fills in the Change Log hash + records BA greenlight + flips sprint-status from `review` → `done` after push.
    - Memory entry lives in `~/.claude/.../memory/` (out-of-tree, NOT staged).

15. **AC-15 (Stop bar — BA browser verification checklist).** All points must pass before greenlight. Highlights:
    1. All unit tests pass — target **343** (334 baseline + 9 new). Note any divergence in DAR.
    2. All E2E tests pass — target **60** (58 baseline + 2 new). Restart `pnpm dev` first + re-run `pnpm db:seed`. The 5 pre-existing hazards from prior stories may still appear — flag if anything new joins them.
    3. `pnpm typecheck` + `pnpm lint` clean.
    4. `pnpm build` — **41 routes** (40 baseline at end of 9-2b + 1 new: `/spaces/[id]/booking/return`).
    5. `git diff --stat` shows ONLY files in AC-13. Zero entries in `src/lib/stripe*`, `src/lib/payments/connect.ts`, `src/app/(owner)/owner/settings/*`, `src/app/(owner)/owner/spaces/*`, email infrastructure.
    6. **Happy publish path (real walk):** sign in as `guest@deskhive.local` → `/spaces/[seeded-space-id]` → pick a future date → click "Book this desk" → land on Stripe Checkout test page → enter `4242 4242 4242 4242` + any future expiry + any CVC → click Pay → redirected back to `/my-bookings?just_booked=1` → success toast fires ("Booking requested" with "View in My Bookings" action) → booking appears in My Bookings list with PENDING status. Verify in DB: `bookings.payment_intent_id` populated, `bookings.payment_status='AUTHORIZED'`, `bookings.total_cents > 0`, `bookings.platform_fee_cents = floor(total_cents * 0.15)`.
    7. **Gated path (real walk):** in Stripe dashboard, manually toggle `owner@deskhive.local`'s Connect account to disable `charges_enabled` (or simulate via `stripe accounts update`). Sign in as `guest@deskhive.local` → navigate to the seeded space → attempt to book → error toast surfaces ("This space can't accept bookings right now."). Verify no booking row was created in the DB. Restore Connect-active state when done.
    8. **Phase 1 regression:** Phase 1 seeded bookings (PENDING / CONFIRMED / REJECTED / CANCELLED) still display correctly in `/my-bookings` + `/admin/bookings` + `/owner/bookings`. The CHECK constraint extension does NOT reject existing NULL `payment_status` rows. Phase 1 confirm/reject flows still work for the Phase 1 seeded bookings (which have `payment_intent_id IS NULL` — no Stripe capture happens for them).
    9. **Webhook backstop verification:** start `stripe listen --forward-to localhost:3000/api/stripe/webhook`. Do the happy path BUT close the browser tab immediately after clicking Pay on the Stripe page (before the return-URL fires). Verify the `checkout.session.completed` webhook arrives, the handler updates the booking with `payment_intent_id` + `payment_status='AUTHORIZED'`, and the booking appears correctly in `/my-bookings` when the Guest navigates back. Document in DAR.

## Tasks / Subtasks

- [ ] **Task 0 — Prep + 9-2b audit + operator state check.**
  - Verify baseline CI clean: `pnpm typecheck` / `lint` / `test` (334 expected) / `build` (40 routes expected) / `test:e2e` (58 expected, modulo the documented hazards).
  - Confirm Story 9-2b + its fixture follow-up are at `done` on `main` (`git log --oneline` shows `7e7251c` + `2d65c54` + `080198e`).
  - Re-read [docs/design/9-3-booking-with-payment-ba-decisions.md](docs/design/9-3-booking-with-payment-ba-decisions.md) end-to-end.
  - Inspect [src/actions/booking.ts](deskhive/src/actions/booking.ts) — confirm `createBookingAction` exists for deletion (AC-5); other exports (`cancelBookingAction`, `confirmBookingAction`, `rejectBookingAction`) stay.
  - Inspect [src/app/spaces/[id]/book-desk-button.tsx](deskhive/src/app/spaces/[id]/book-desk-button.tsx) — current shape for the rewrite.
  - Inspect [src/db/queries/stripe-connect.ts](deskhive/src/db/queries/stripe-connect.ts) — confirm `getConnectAccountByUserId` is available (Story 9-2's helper).
  - Inspect [src/app/api/stripe/webhook/route.ts](deskhive/src/app/api/stripe/webhook/route.ts) — confirm the `account.updated` branch + the `errMessage` / `errCause` helpers + the 3-stage try/catch pattern (for mirroring in the new `checkout.session.completed` branch).
  - Confirm `owner@deskhive.local`'s synthetic Connect row is in place. If not, run `pnpm db:seed`.
  - Start `stripe listen --forward-to localhost:3000/api/stripe/webhook` in a separate terminal for the BA-walk verification (AC-15 §9).

- [ ] **Task 1 — Schema + migration** (AC-1):
  - Edit [src/db/schema.ts](deskhive/src/db/schema.ts) `bookingsTable`: add 3 columns + new `bookings_payment_status_check` constraint enforcing `payment_status IN ('AWAITING_PAYMENT', 'AUTHORIZED')`.
  - Run `pnpm db:generate` → produces `drizzle/migrations/0005_<random_name>.sql`.
  - Inspect the generated SQL: should be 3 `ALTER TABLE bookings ADD COLUMN ...` + 1 `ALTER TABLE bookings ADD CONSTRAINT ...`. No data changes.
  - Add the story-tag comment block at the top of `0005_*.sql` matching the `0004_fine_ronan.sql` convention.
  - Apply locally: `pnpm db:migrate`.

- [ ] **Task 2 — Money helper extensions** (AC-2):
  - Edit [src/lib/money.ts](deskhive/src/lib/money.ts): add `PLATFORM_FEE_BPS = 1500` constant with Phase 3 migration comment; add `calculatePlatformFee` + `calculateOwnerPayout` functions per the locked signatures.

- [ ] **Task 3 — Stripe Checkout sub-module** (AC-3):
  - Create [src/lib/payments/checkout.ts](deskhive/src/lib/payments/checkout.ts) with `createCheckoutSession` (Decision §4 verbatim API body) + `retrieveCheckoutSession` (for AC-6 step 2; expands `payment_intent`).
  - Both functions return `StripeServiceResult<T>` per the 9-1 pattern.

- [ ] **Task 4 — Server Action `createBookingWithPaymentAction`** (AC-4):
  - Create [src/actions/booking-with-payment.ts](deskhive/src/actions/booking-with-payment.ts) implementing the 9-step locked behavior.
  - Includes Connect-state-active gate (Decision §8), pre-claim booking insert (Decision §3), per-attempt UUID idempotency key (Decision §9), Checkout Session creation (Decision §4).

- [ ] **Task 5 — Delete legacy `createBookingAction` + rewrite `<BookDeskButton>`** (AC-5):
  - Edit [src/actions/booking.ts](deskhive/src/actions/booking.ts): delete `createBookingAction` + `CreateBookingActionState`. Other exports stay.
  - Edit [src/app/spaces/[id]/book-desk-button.tsx](deskhive/src/app/spaces/[id]/book-desk-button.tsx): rewrite to use `createBookingWithPaymentAction` + `window.location.assign(url)` on success + code-to-copy toast mapping on error.
  - Verify nothing else in the codebase imports `createBookingAction` (grep + tsc both flag dangling references).

- [ ] **Task 6 — Return-from-Checkout Server Component** (AC-6):
  - Create [src/app/spaces/[id]/booking/return/page.tsx](deskhive/src/app/spaces/[id]/booking/return/page.tsx) implementing the 7-step locked flow.
  - Uses `retrieveCheckoutSession` from Task 3; performs the dual-field verification (Decision §5).
  - Idempotent UPDATE; redirects to `/my-bookings?just_booked=1` on success.

- [ ] **Task 7 — Webhook handler extension + `/my-bookings` toast handling** (AC-7 + AC-8):
  - Edit [src/app/api/stripe/webhook/route.ts](deskhive/src/app/api/stripe/webhook/route.ts): add the `checkout.session.completed` branch mirroring the `account.updated` branch's shape (3-stage try/catch, idempotency-via-existing-row-check, `webhook_events` insert only on first real handle).
  - Edit [src/app/my-bookings/page.tsx](deskhive/src/app/my-bookings/page.tsx): add `?just_booked=1` query-param toast (extends Story 6-3 pattern). Decide on the action-button stance (strawman: keep as soft-no-op; document in DAR).

- [ ] **Task 8 — Toast copy extensions** (AC-9):
  - Edit [src/lib/toast.ts](deskhive/src/lib/toast.ts): add 3 new `TOAST_COPY` entries verbatim per Decision §10.

- [ ] **Task 9 — Unit tests** (AC-10):
  - Create [src/actions/booking-with-payment.test.ts](deskhive/src/actions/booking-with-payment.test.ts) with 5 cases per Decision §11.
  - Extend [src/lib/money.test.ts](deskhive/src/lib/money.test.ts) with 3 new tests for `calculatePlatformFee` + `calculateOwnerPayout`.
  - Create [src/lib/payments/checkout.test.ts](deskhive/src/lib/payments/checkout.test.ts) with 2 wrapper tests.
  - Extend [src/app/api/stripe/webhook/route.test.ts](deskhive/src/app/api/stripe/webhook/route.test.ts) with 2 new tests for the `checkout.session.completed` branch.
  - Run `pnpm test` → target 343 (334 baseline + 9 new). Document any divergence in DAR.

- [ ] **Task 10 — E2E tests for booking-with-payment** (AC-11):
  - Create [tests/e2e/booking-with-payment.spec.ts](deskhive/tests/e2e/booking-with-payment.spec.ts) with the 2 cases from Decision §12.
  - `test.describe.configure({ mode: 'serial' })` for intra-file safety on the shared `owner@deskhive.local` Connect row.
  - `beforeEach` / `afterEach` mutate-and-restore the Connect row (test-owns-state pattern from 9-2b).
  - `afterAll` defensive restore of the seeded synthetic-active state.
  - Booking-row cleanup by exact match `(guestUserId, deskId, bookingDate)` — not `LIKE` (parallelism-safe; 9-2b lesson).
  - Run isolated: `pnpm test:e2e tests/e2e/booking-with-payment.spec.ts` → 2/2 green.

- [ ] **Task 11 — Local CI parity** (AC-15):
  - `pnpm typecheck` clean.
  - `pnpm lint` clean.
  - `pnpm test` — 343 expected.
  - `pnpm build` — 41 routes (1 new: `/spaces/[id]/booking/return`).
  - `pnpm test:e2e` — 60 expected (modulo the 5 documented hazards from prior stories).

- [ ] **Task 12 — `git diff` verification + manual smoke test** (AC-13 + AC-15):
  - `git diff --stat` matches AC-13 file list. Zero entries in `src/lib/stripe*`, `src/lib/payments/connect.ts`, `src/app/(owner)/owner/settings/*`, `src/app/(owner)/owner/spaces/*`, email infrastructure, the booking Confirm / Reject Server Actions, `scripts/seed.ts`.
  - Quick smoke test: `pnpm dev` running + `stripe listen` running, sign in as `guest@deskhive.local`, navigate to the seeded space, book + complete Stripe Checkout with test card `4242 4242 4242 4242`. Verify the full happy path: redirect to Stripe → return URL → `/my-bookings?just_booked=1` → toast fires → booking shows PENDING + AUTHORIZED in DB.
  - **AC-15 §6–§9 (full BA browser walk including the gated path with Connect-disabled simulation, Phase 1 regression check, and webhook backstop verification)** is DEFERRED to BA's review pass per the precedent.

- [ ] **Task 13 — Memory + sprint-status + Dev Agent Record + single commit (no push)** (AC-12 + AC-14):
  - Extend `~/.claude/.../memory/reference_stripe_service_pattern.md` with the Story 9-3 section per AC-12.
  - Update `~/.claude/.../memory/MEMORY.md` index entry's one-liner.
  - Update `_bmad-output/implementation-artifacts/sprint-status.yaml`: `9-3-booking-with-payment: review`; update `last_updated` parenthetical.
  - Update this story file: `Status: ready-for-dev` → `Status: review`; mark Tasks 0–12 `[x]` (Task 12's BA-walk DEFERRED note stays); fill in Dev Agent Record.
  - Stage all files per AC-13.
  - Commit: `feat(stripe): Story 9-3 — booking with payment`.
  - **Do NOT push.** Wait for BA browser-verification per Task 12 + AC-15 §6–§9 before pushing.
  - After BA greenlight: push, then add a small `docs:` follow-up commit to flip sprint-status to `done` (same pattern as 9-1 / 9-2 / 9-2b / 9-2b-follow-up).

## Dev Notes

### What gets built and what's deliberately out of scope

Story 9-3 composes Theme B's prior infrastructure (9-1 SDK, 9-2 Connect, 9-2b cached-Connect-state pattern) into the first real money flow: Stripe Checkout for desk bookings. The story is intentionally narrow — capture + refund + payouts each get their own story.

After 9-3 lands at `review` and BA greenlights:

- Guests can book desks via Stripe Checkout (test mode); their card is authorized but not charged.
- Bookings appear with `status='PENDING'` + `payment_status='AUTHORIZED'` + `payment_intent_id` populated.
- Phase 2's marketplace cut (15%) is calculated at booking-create time + sent to Stripe as `application_fee_amount`.
- The Space Owner sees the booking in their `/owner/bookings` dashboard. Confirming it (capture) is Story 9-4.
- Phase 1 admin-side booking-management UI (`/admin/bookings`) continues to work unchanged on Phase 1 seeded bookings (which have `payment_intent_id IS NULL`).
- The `payment_status` CHECK constraint exists with two values (`AWAITING_PAYMENT`, `AUTHORIZED`); 9-4 extends to `CAPTURED`, 9-6 extends to `REFUNDED`.

Feature scope (Story 9-3 only):
- ✅ `payment_intent_id`, `total_cents`, `platform_fee_cents` added to bookings via migration `0005_*.sql`.
- ✅ `bookings_payment_status_check` CHECK constraint added (2 values; extensible via DROP/ADD).
- ✅ `calculatePlatformFee` + `calculateOwnerPayout` + `PLATFORM_FEE_BPS = 1500` constant in `src/lib/money.ts`.
- ✅ New sub-module `src/lib/payments/checkout.ts` — `createCheckoutSession` + `retrieveCheckoutSession`.
- ✅ New Server Action `createBookingWithPaymentAction` with 9-step behavior + Connect-state gate + per-attempt UUID idempotency.
- ✅ Legacy `createBookingAction` deleted; `<BookDeskButton>` rewritten to use the new action + redirect to Stripe via `window.location.assign(url)`.
- ✅ Return-from-Checkout Server Component at `/spaces/[id]/booking/return` with belt-and-suspenders dual-field verification.
- ✅ Narrow webhook extension for `checkout.session.completed` (mirrors 9-2's `account.updated` shape).
- ✅ `/my-bookings?just_booked=1` toast handling (extends Story 6-3 pattern).
- ✅ 3 new `TOAST_COPY` entries.
- ✅ 9 new unit tests + 2 new E2E tests.
- ✅ Memory entry extension.

Out of scope (do NOT build):
- ❌ Payment capture (Owner Confirm) — Story 9-4.
- ❌ Payment cancel (Owner Reject) — Story 9-4.
- ❌ Full webhook dispatch generalization (`payment_intent.succeeded`, `payment_intent.payment_failed`, `charge.refunded`, `payout.paid`, `checkout.session.expired`) — Story 9-5.
- ❌ Cleanup of abandoned-payment bookings — deferred to Story 9-5 / polish backlog (Decision §3).
- ❌ Refund flow + 24-hour policy — Story 9-6.
- ❌ `/owner/payouts` view — Story 9-7.
- ❌ Payment-driven emails (receipt, payment-failed) — Story 8-4.
- ❌ `@stripe/stripe-js` install — deferred (Decision §7).
- ❌ Admin-side booking creation flow (no UI; Phase 1 doesn't have one either).
- ❌ Phase 2 PRD §4.5 cancel-interpretation — Story 9-4 / 9-6 territory.

### Key decisions baked into the spec

1. **Pre-claim booking row before Checkout Session.** Decision §3 load-bearing. Phase 1's `uniq_active_booking_per_desk_per_date` partial unique index becomes the slot-claim race solver — Guest B's parallel attempt fails at the booking-insert step BEFORE Stripe is involved. Diverges in spirit from PRD FR-PAY-3's literal "booking is created on successful payment authorization" wording; rationale documented in the BA decisions doc Context section.

2. **`payment_status` CHECK constraint with extensible enum.** Decision §3. 9-3 adds `('AWAITING_PAYMENT', 'AUTHORIZED')`. 9-4 will extend to add `'CAPTURED'`; 9-6 will extend to add `'REFUNDED'`. Same DROP/ADD migration pattern 9-2b used for `spaces.status`.

3. **Delete legacy `createBookingAction`.** Decision §3. Single source of truth — the Guest booking path is `createBookingWithPaymentAction`. Other exports in `src/actions/booking.ts` (`cancelBookingAction`, `confirmBookingAction`, `rejectBookingAction`) stay; 9-4 + 9-6 extend them.

4. **Destination charges + manual capture + `application_fee_amount`.** Decision §4. The Stripe-recommended marketplace pattern. Single Payment Intent, single Charge, cleanest accounting. Stripe handles the platform-fee-vs-owner-payout split automatically when 9-4's capture fires.

5. **Belt-and-suspenders verification in return-URL handler.** Decision §5. Verify BOTH `session.status === 'complete'` AND `session.payment_intent.status === 'requires_capture'`. Either alone could leave subtle gaps.

6. **Narrow webhook extension — `checkout.session.completed` only.** Decision §6. 9-5 generalizes. The handler is written in the same shape as 9-2's `account.updated` branch so 9-5 can absorb cleanly.

7. **`@stripe/stripe-js` deferred again.** Decision §7. Modern Stripe pattern uses `session.url` + `window.location.assign` — no client SDK needed for hosted Checkout. Install when Elements or embedded Checkout actually become requirements.

8. **Connect-state-active gate at booking-create.** Decision §8. Third instance of the cached-DB-read pattern (after 9-2b's `publishSpaceAction` + that action's step 6). Defense in depth — the window between an owner losing Connect activation and an admin manually suspending their spaces is non-zero in prod.

9. **Per-attempt UUID idempotency key.** Decision §9. Avoids the orphan-Session-on-retry trap that per-booking-id keys would create.

10. **Test owns the Connect-row lifecycle.** Decision §12. Both E2E tests sign in as `guest@deskhive.local`; the gated test mutates `owner@deskhive.local`'s Connect row in `beforeEach` and restores in `afterEach`. Mirrors 9-2b's post-BA-walk pattern. Serial-within-describe required to prevent intra-file race; cross-file race against `connect-onboarding.spec.ts` is acknowledged + mitigatable via defensive re-restore if it surfaces.

### Test-count baseline alignment

Decision §11 cites "334 baseline + 9 = 343 unit tests". This is precise: the 334 baseline is the post-9-2b-follow-up actual (commit `2d65c54`'s `pnpm test` output: `334 passed | 1 skipped`). 9 new tests is the locked target. Dev-agent may ship +1-3 bonus tests per the 9-1 / 9-2 / 9-2b pattern; document any divergence in DAR.

E2E baseline: 58 (post-9-2b actual: 47 passed + 5 pre-existing hazards + 5 cascading = 58 total; my 2 publish-gating tests pass cleanly). +2 → 60 target. The 5 pre-existing hazards (admin-applications + application-emails + become-a-host × 2 + booking-emails) remain unchanged.

Build route count: 40 baseline (post-9-2b actual). +1 new (`/spaces/[id]/booking/return`) → 41 target.

### Sprint status update

`_bmad-output/implementation-artifacts/sprint-status.yaml` — add `9-3-booking-with-payment: ready-for-dev` to Epic 9's section (after `9-2b-publish-gating: done`). On move-to-review (Task 13), flip to `review`. On BA greenlight (post-push), flip to `done`.

### Recent commits (Epic 9 chain)

```
080198e chore: mark Story 9-2b done in sprint status
2d65c54 refactor(test): adapt gated-path fixture to survive BA-walk onboarding
7e7251c feat(stripe): Story 9-2b — publish gating
1f08150 docs: lock Story 9-2b BA decisions (publish gating)
8f230b2 chore: mark Story 9-2 done in sprint status
0d384e0 fix(stripe): wrap account.updated webhook handler in defensive try-catch
ee3ab20 feat(stripe): Story 9-2 — Stripe Connect Express onboarding     ← Story 9-2 ship
e6d4c0f docs: lock Story 9-2 BA decisions (Stripe Connect Express onboarding)
7a719ed docs: lock Story 9-3 BA decisions (booking with payment)         ← THIS STORY'S source-of-truth lock
```

Story 9-3 is the **fifth Epic 9 feature commit** (after 9-1, 9-2, 9-2's BA-walk fix, and 9-2b). Subject: `feat(stripe): Story 9-3 — booking with payment`.

### Forward-looking notes preserved

- **Story 9-4 captures the Payment Intent.** `confirmBookingAction` extends with `stripe.paymentIntents.capture(paymentIntentId)`. 9-3 leaves `payment_intent_id` populated for that call. `payment_status` transitions AUTHORIZED → CAPTURED in 9-4. CHECK constraint extended.
- **Story 9-5 generalizes the webhook dispatch.** Absorbs 9-3's narrow `checkout.session.completed` branch alongside `payment_intent.*` / `charge.refunded` / `payout.paid` / `checkout.session.expired`. 9-3's branch is written in the same shape as 9-2's `account.updated` branch to minimize the surface 9-5 has to absorb.
- **Story 9-5 also handles abandoned-payment cleanup.** Via `checkout.session.expired` or a dedicated mechanism. 9-3's deferred orphan rows wait for 9-5.
- **Story 9-6 adds the refund flow.** `cancelBookingWithRefundAction` reads `payment_intent_id`, calls `stripe.refunds.create`, transitions `payment_status` to REFUNDED, adds `refunded_at` + `refund_amount_cents` columns. Re-flags Phase 2 PRD §4.5 cancel-interpretation (memory `project_phase2_prd_4_5_cancel_interpretation.md`).
- **Story 9-7 builds the payouts view.** Reads from Stripe Connect API, not from local DB. Owner-side dashboard view.
- **Story 8-4 wires up payment-driven emails.** Receipt on capture (9-4 + 9-5 + 8-4); refund email on refund (9-6 + 9-5 + 8-4). 9-3 ships zero payment-driven emails.

### References

- [Source: docs/design/9-3-booking-with-payment-ba-decisions.md](docs/design/9-3-booking-with-payment-ba-decisions.md) — locked 2026-05-18 (BA: Ikhtiyor Ziyayev), committed `7a719ed`. 15 decisions + anti-pattern rollup + operator prereqs.
- [Source: docs/03-phase2-prd.md §4.4 FR-PAY 1-8] — PRD origin for booking-with-payment.
- [Source: docs/03-phase2-prd.md §6.1 — bookings schema additions] — schema columns.
- [Source: docs/03-phase2-prd.md §6.3 — `createBookingWithPaymentAction`] — action shape.
- [Source: docs/03-phase2-prd.md §6.4 — webhook events] — event types (9-3 ships only `checkout.session.completed`).
- [Source: deskhive/src/db/schema.ts](deskhive/src/db/schema.ts) — extend `bookingsTable`; add CHECK constraint.
- [Source: deskhive/src/db/queries/stripe-connect.ts](deskhive/src/db/queries/stripe-connect.ts) — `getConnectAccountByUserId` (Story 9-2 helper).
- [Source: deskhive/src/lib/money.ts](deskhive/src/lib/money.ts) — extend with platform-fee + owner-payout helpers.
- [Source: deskhive/src/actions/booking.ts](deskhive/src/actions/booking.ts) — delete `createBookingAction` + `CreateBookingActionState`.
- [Source: deskhive/src/app/spaces/[id]/book-desk-button.tsx](deskhive/src/app/spaces/[id]/book-desk-button.tsx) — rewrite.
- [Source: deskhive/src/app/api/stripe/webhook/route.ts](deskhive/src/app/api/stripe/webhook/route.ts) — extend with `checkout.session.completed` branch.
- [Source: deskhive/src/lib/toast.ts](deskhive/src/lib/toast.ts) — 3 new `TOAST_COPY` entries.
- [Source: deskhive/src/lib/stripe.ts](deskhive/src/lib/stripe.ts) — Story 9-1's SDK singleton. ZERO changes in 9-3.
- [Source: deskhive/src/lib/payments/connect.ts](deskhive/src/lib/payments/connect.ts) — Story 9-2's wrappers. ZERO changes in 9-3.
- Story 7-PREP-1 `authenticatedPage(role)` fixture — used for the E2E tests.
- Dev-agent memory `reference_stripe_service_pattern.md` — extend with the Story 9-3 section per AC-12.
- Dev-agent memory `project_phase2_prd_4_5_cancel_interpretation.md` — unchanged; forward-looking flag for 9-4 / 9-6.

## Dev Agent Record

### Agent Model

_To be filled in by dev-agent during the dev-story phase._

### Debug Log References

_To be filled in by dev-agent during the dev-story phase._

### Completion Notes

_To be filled in by dev-agent during the dev-story phase. Expected highlights:_
- Migration file name (`0005_<random_name>.sql`) and whether Drizzle's auto-generation produced clean SQL (3 ADD COLUMN + 1 ADD CONSTRAINT, no data changes).
- Net unit-test count change (+9 → 343). If actual differs from target, surface why (e.g., bonus tests on the new action's error-path coverage).
- Net E2E-test count change (+2 → 60).
- `pnpm build` route count change (+1 → 41 — the new `/spaces/[id]/booking/return` route).
- Whether the dual-field verification in the return-URL handler (Decision §5: `session.status === 'complete'` AND `payment_intent.status === 'requires_capture'`) matched Stripe's actual test-mode behavior. If Stripe returns different field values for manual-capture mode than expected, document the divergence.
- Whether `stripe listen` correctly delivered the `checkout.session.completed` event during the manual smoke test. If the event payload's `session.metadata.bookingId` was missing or malformed, document.
- Whether the legacy `createBookingAction` delete caused any dangling imports (grep + tsc should both flag). The other `booking.ts` exports stay — confirm none of them were accidentally touched.
- Whether the `/my-bookings?just_booked=1` toast firing context felt right, or if the action-button (Story 6-3's "View in My Bookings") needs adjustment when the user is already on `/my-bookings`.
- Any test-owns-Connect-state surprises in the E2E (Decision §12 option b) — the cross-file race with `connect-onboarding.spec.ts` is theoretical; if it materializes, mitigation is the defensive-re-restore pattern from 9-2b.
- Whether the lazy-cleanup deferral (Decision §3) caused any practical pain during dev (e.g., a stale AWAITING_PAYMENT row from an abandoned manual test blocking a re-attempt). Document if so; surfaces priority for 9-5 / polish backlog.

### File List

_To be filled in by dev-agent during the dev-story phase._

### Change Log

| Date | Change | Commit |
|---|---|---|
| 2026-05-18 | Story drafted by `bmad-create-story` from locked BA decisions document (commit `7a719ed`). | (none) |
| _TBD_ | Story implemented; `bookings` table extended with 3 columns + `bookings_payment_status_check` CHECK constraint via migration `0005_<name>.sql`; `src/lib/money.ts` gets `calculatePlatformFee` + `calculateOwnerPayout` + `PLATFORM_FEE_BPS = 1500` constant; new sub-module `src/lib/payments/checkout.ts` for Stripe Checkout wrappers; new Server Action `createBookingWithPaymentAction` with 9-step locked behavior (pre-claim + Connect gate + per-attempt UUID idempotency); legacy `createBookingAction` deleted; `<BookDeskButton>` rewritten to redirect to Stripe via `window.location.assign(url)`; new return-from-Checkout Server Component at `/spaces/[id]/booking/return`; webhook handler extended with `checkout.session.completed` branch; `/my-bookings` reads `?just_booked=1` query param and fires the extended Story 6-3 toast; 3 new `TOAST_COPY` entries; 9 new unit tests + 2 new E2E tests (test-owns-Connect-state pattern); memory entry extended. Single commit per AC-14 — awaiting BA browser walk before push. | _TBD (filled by `docs:` follow-up after BA greenlight + push, same pattern as Stories 9-1 + 9-2 + 9-2b)_ |
