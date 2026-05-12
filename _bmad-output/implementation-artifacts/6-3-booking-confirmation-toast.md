# Story 6.3: Booking Confirmation Toast

Status: review

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a **guest booking a desk**,
I want **immediate positive feedback the moment I click "Book this desk"**,
so that **I see the system confirm my action instead of the booking quietly succeeding in the background.**

> Story 6.3 closes **Epic 6 — Phase 1 Polish**. Source of truth: [docs/design/6-3-booking-confirmation-toast-ba-decisions.md](docs/design/6-3-booking-confirmation-toast-ba-decisions.md). All decisions locked. After this story lands at `review` and BA greenlights, Phase 1 (Epics 0–6) closes pending only retrospectives.

> **Presentation-layer addition only.** No schema changes. No new Server Actions. No query helpers. No new business logic. The booking Server Action's success/error contract is unchanged — the Client Component reads the result and triggers a toast.

> **Toast-in-context approach (revised BA Decision §7, 2026-05-12):** the booking Server Action returns `{ status: 'success' }` instead of redirecting. The `<BookDeskButton>` Client Component reads the success state from `useActionState` and fires the toast on `/spaces/[id]` — the page where the user just clicked. The toast's "View in My Bookings" action button is a real `router.push('/my-bookings')` navigation; the user can also let the toast dismiss and stay on Space Detail to book another desk. **The prior cross-navigation `?booked=1` pattern was implemented, browser-tested, and revised** because the action button on `/my-bookings` was a soft no-op (user was already on the destination). See the BA decisions doc Change Log for the revision rationale.

## Acceptance Criteria

> Source: BA Decisions document, Decisions 1–13 + Browser verification checklist.

1. **AC-1 (Add `sonner` dependency).** Per BA Decisions §1:
   - Add `sonner` (current stable) to `dependencies` in `package.json` via `pnpm add sonner`.
   - Verify React 19 / Next.js 16 compatibility — sonner v1.7+ supports React 19 (no `peerDependencies` warning expected). If `pnpm install` surfaces a peer conflict, **escalate to BA** before swapping to `react-hot-toast` (the BA-approved fallback per §1). Document the choice in Completion Notes.
   - **Do NOT** add Radix Toast, Mantine, or any heavyweight UI framework just for this — explicit BA anti-pattern.

2. **AC-2 (Mount `<Toaster />` once in `src/app/layout.tsx`).** Per BA Decisions §1 + §7:
   - Import sonner's `Toaster` Client Component and render it inside `<body>`, after the existing `<Header />` + `<div className="flex-1">{children}</div>` + `<footer>` chain.
   - Configure on the `<Toaster />` element: `position="bottom-right"`, `duration={4000}`, `closeButton` (X button on each toast). **Do NOT** pass `richColors` — the custom `.toast-*` classes from AC-8 + Story 5.1 status tokens are the canonical palette; `richColors` would conflict by applying sonner's default semantic colors underneath our overrides.
   - Single instance for the entire app. **Do NOT** mount additional `<Toaster />` instances anywhere else.
   - The toast root must persist across navigation — that's the whole point of putting it in `app/layout.tsx` (which never unmounts during App Router transitions).

3. **AC-3 (Create `src/lib/toast.ts` wrapper).** Per BA Decisions §1 + anti-pattern §"Do NOT import the toast library directly all over the codebase":
   - New file `src/lib/toast.ts` that re-exports a small, stable API:
     ```ts
     export function toastSuccess(title: string, opts?: { description?: string; action?: { label: string; href: string } }): void;
     export function toastError(title: string, description?: string): void;
     ```
   - Internally calls `sonner`'s `toast.success(...)` / `toast.error(...)` with the configured `duration: 4000` and any per-toast options.
   - `toastSuccess` supports an optional `action` prop — when present, renders the action label as a link inside the toast. The link target is the `action.href`. This is what AC-5 uses for "View in My Bookings".
   - **Do NOT** export the raw `sonner` `toast()` from this wrapper. Call sites use `toastSuccess` / `toastError` only — the wrapper insulates the codebase from the library choice so Phase 2 can swap implementations without touching call sites (BA Decisions §13 + memory note).

4. **AC-4 (Unit tests for the wrapper — `src/lib/toast.test.ts`).** Per BA Decisions §12:
   - Test that `toastSuccess` and `toastError` are functions exported from the module.
   - Test that calling `toastSuccess('Booking requested')` invokes sonner's `toast.success` with the expected title (mock sonner's `toast` import).
   - Test that calling `toastError('Booking failed', 'Something went wrong')` invokes sonner's `toast.error` with the title + description args.
   - Test that the `action` prop (when present on `toastSuccess`) is forwarded to sonner with the correct `label` + `onClick` (or `action` config — match sonner's actual API).
   - **Scope:** thin, behavior-of-the-wrapper tests. Do NOT test sonner itself; do NOT test rendering (jsdom + sonner internals is a rabbit hole). Mock the import.

5. **AC-5 (Success toast on booking creation — toast-in-context, revised BA Decision §7).** Per BA Decisions §4 + revised §7 (2026-05-12):
   - **Server Action change:** in [src/actions/booking.ts](deskhive/src/actions/booking.ts):
     - Extend `CreateBookingActionState` discriminated union with `| { status: 'success' }` (mirrors the cancel action's shape from Task 6).
     - Replace `redirect('/my-bookings')` (line 146) with `return { status: 'success' };`. The `revalidatePath` calls for `/spaces/[id]` and `/my-bookings` stay — the booking is still invalidated in the route cache.
   - **`<BookDeskButton>` fires the toast on `/spaces/[id]`** (not on `/my-bookings`):
     - In [src/app/spaces/[id]/book-desk-button.tsx](deskhive/src/app/spaces/[id]/book-desk-button.tsx), the existing `useEffect` (added in Task 4 for the error toast) extends to also handle `state.status === 'success'`. Use the same `useRef` state-identity guard pattern that fires each new state value exactly once.
     - On success, call: `toastSuccess(TOAST_COPY.BOOKING_SUCCESS_TITLE, { description: TOAST_COPY.BOOKING_SUCCESS_DESCRIPTION, action: { label: TOAST_COPY.BOOKING_SUCCESS_ACTION_LABEL, onClick: () => router.push('/my-bookings') } })`.
     - Import `useRouter` from `next/navigation`. The `onClick` callback is a real navigation — when the user clicks the toast's action button, they land on `/my-bookings` and see the fresh booking (the `revalidatePath` from the action ensures the page is current).
   - **No separate cross-nav Client Component.** Do NOT create `booked-toast.tsx` or any equivalent. Do NOT mount anything on `/my-bookings/page.tsx` for this — that file is unchanged from its Story 6.2 state.
   - **Why this is better UX than the prior cross-nav approach:** the toast appears in the action context, the action button does real work, and the user can stay on Space Detail to book another desk for the same or a different date. See the BA decisions doc Change Log entry for the full revision rationale.
   - **Toast copy is verbatim from BA Decisions §4 — do NOT paraphrase.** Title `Booking requested`. Description `We'll let you know when it's confirmed.` Action label `View in My Bookings` → `/my-bookings`.

6. **AC-6 (Error toast on booking failure).** Per BA Decisions §5:
   - In [src/app/spaces/[id]/book-desk-button.tsx](deskhive/src/app/spaces/[id]/book-desk-button.tsx), add a `useEffect` that fires `toastError(...)` when `state.status === 'error'`. Map the error code to a specific message:
     - `DOUBLE_BOOKING` → `toastError('Booking failed', 'That desk was just booked by someone else. Please try a different desk.')`
     - `PAST_DATE` → `toastError('Booking failed', 'Booking date cannot be in the past.')` (note the trailing period — toast-description punctuation consistency with the other failure messages; the Server Action's verbatim message from US-3.3 AC-5 stays `'Booking date cannot be in the past'` with no period — the toast string is a separate UI surface).
     - `DESK_NOT_FOUND` → `toastError('Booking failed', 'This desk is not available.')`
     - `VALIDATION_ERROR` → `toastError('Booking failed', Object.values(state.fields)[0] ?? 'Invalid input')` (preserves the first field error, matches existing inline-error logic).
     - `FORBIDDEN` → `toastError('Booking failed', state.message)` (the action's verbatim message).
     - `INTERNAL_ERROR` / anything else → `toastError('Booking failed', 'Something went wrong. Please try again.')` (BA Decisions §5 fallback).
   - **Remove the inline `<p className="field-error" role="alert">` block** that currently surfaces `errorMessage` (lines 40-44). The toast replaces it. Leaving both would double-surface the error.
   - **Use a `useRef` guard** for Strict Mode + state-identity-stability — the effect must fire once per error state, not on every re-render.
   - User stays on `/spaces/[id]` after error (BA Decisions §5: "The error toast does NOT auto-navigate the user.") — this is already the existing behavior because the Server Action returns an error state instead of throwing redirect. No code change needed there.

7. **AC-7 (Toast copy is final — verbatim).** Per BA Decisions §6 + anti-pattern §"Do NOT invent alternate copy":
   - Success title: exact string `Booking requested`.
   - Success description: exact string `We'll let you know when it's confirmed.`
   - Success action label: exact string `View in My Bookings`.
   - Error title: exact string `Booking failed`.
   - Error descriptions: exact strings per AC-6.
   - Do NOT use "Booking submitted!", "Success!", "Oops!", or any variant. Document the copy strings as constants in `src/lib/toast.ts` (or a small `src/lib/toast-copy.ts`) so tests reference the constants, not duplicated literals.

8. **AC-8 (Toast styling — brand tokens, not sonner's `richColors` palette).** Per BA Decisions §4 + §5:
   - The success toast uses the **status-confirmed** color palette from Story 5.1's globals.css (`--color-status-confirmed-bg`, `--color-status-confirmed-fg`, `--color-status-confirmed-border`). Small checkmark icon at the start.
   - The error toast uses the **status-rejected** palette (`--color-status-rejected-bg`, `--color-status-rejected-fg`, `--color-status-rejected-border`). Small alert icon at the start.
   - **Implementation:** sonner supports per-toast `style` / `className` overrides AND a global `toastOptions={{ classNames: { ... } }}` on the `<Toaster />`. Use whichever sonner pattern is canonical for the current version — the dev-agent picks. Avoid inline-`<style>` blocks; prefer CSS classes appended to `globals.css` (e.g., `.toast-success`, `.toast-error`) referencing the existing brand tokens. Document the choice in Completion Notes.
   - The checkmark/alert icons can be inline SVGs (no new icon library); reuse the SVG shapes from Story 5.2's `08-admin-bookings.html` references (`#i-check`, `#i-x`) if they're already in `globals.css` or import-trivial.
   - **Do NOT** modify the `.badge` / `.dot` / status-pair styles from Story 5.1 — those are the badge palette. The toast palette **reuses the same color tokens** but lives in new `.toast-*` classes (or sonner's class slots).

9. **AC-9 (Toast behavior — position, duration, close, pause-on-hover).** Per BA Decisions §2 + §3:
   - Position: `bottom-right` of viewport (configured on `<Toaster />` in AC-2).
   - Auto-dismiss: **4000ms**. Documented per Decision 3. Do NOT extend beyond 4 seconds.
   - Close (X) button: **enabled** via sonner's `closeButton` prop (AC-2). Must be keyboard-focusable; Enter / Space dismisses. Sonner handles this by default — verify in browser, do NOT roll custom keyboard handling.
   - Pause-on-hover: **enabled** (sonner's default behavior — no config needed). Verify in BA browser-walk.
   - Slide-in entry animation: sonner default; verify it plays.

10. **AC-10 (Cancel booking toast — Decision §10 escape hatch).** Per BA Decisions §10:
    - **Bundle IF AND ONLY IF the addition is genuinely trivial.** The exact criterion: adding a `toast.success("Booking cancelled.")` call in [src/app/my-bookings/cancel-booking-button.tsx](deskhive/src/app/my-bookings/cancel-booking-button.tsx) is a one-line addition.
    - **Cost honesty:** today the cancel Server Action returns `{ status: 'idle' }` on success (line 253 of `src/actions/booking.ts`) — NOT `{ status: 'success' }`. To trigger a toast on success, EITHER:
      - **(a)** Add a `'success'` variant to `CancelBookingActionState` and bump the return on the happy path. Then add a 3-line `useEffect` watching `state.status === 'success'` in `CancelBookingButton` that fires `toastSuccess('Booking cancelled.')`. **This is the recommended approach.** Three small, safe changes; the discriminated union grows by one variant; no caller depends on `idle` semantically. Document in Completion Notes.
      - **(b)** Skip the cancel toast entirely and defer to a separate polish item per BA Decisions §10's escape hatch ("If it requires more than that — e.g., touching the cancel UI component significantly... defer").
    - **Dev-agent calls it:** Option (a) is borderline-trivial (≤10 lines total). I recommend bundling. If the dev-agent disagrees mid-implementation (e.g., a hidden coupling surfaces), defer to Option (b) per Decision §10's explicit escape hatch and document the rationale.
    - Cancel toast copy: `Booking cancelled.` (period included). No description, no action link. Short and final.

11. **AC-11 (NO toast on admin Confirm/Reject or auth flows).** Per BA Decisions §11 + anti-pattern §"Do NOT add toasts to admin Confirm/Reject" + §"Do NOT add toasts to login or register success":
    - The admin Confirm + Reject buttons (Story 5.2's `<ConfirmBookingButton>` + `<RejectBookingButton>`) **must not** emit a toast. The badge update + action-cell-empties is the existing feedback; toast would be redundant noise.
    - `loginAction` + `registerAction` **must not** emit a toast — those redirect to fresh pages, separate UX problem.
    - Verify by reading the two admin button components after AC-5/6 land — confirm no `import` of `toastSuccess` or `toastError` exists in them. The audit is a 30-second grep; bundle into Task 5.

12. **AC-12 (ARIA live region — library defaults only).** Per BA Decisions §9:
    - Sonner sets `aria-live="polite"` for success toasts and `aria-live="assertive"` for error toasts automatically. **Do NOT** override these.
    - Do NOT introduce additional ARIA wiring, screen-reader-specific scaffolding, or focus-trap behavior. Library defaults are the deliverable.

13. **AC-13 (E2E test coverage — happy path, with minimal Playwright auth helper).** Per BA Decisions §12:
    - **Add a happy-path E2E test** that exercises: guest logs in → navigates to a Space Detail page → picks an available date → clicks Book this desk → toast appears with the success title → toast contains the "View in My Bookings" link.
    - **The blocker today:** the entire `tests/e2e/*` suite runs unauthenticated. There is no Playwright auth helper. Story 6.2 deferred adding one explicitly.
    - **This story has BA Decision §12 explicitly asking for the happy-path E2E.** Add a **minimal** Playwright login helper to `tests/e2e/fixtures/` (or `tests/e2e/_helpers.ts`):
      - A function `loginAsGuest(page, email, password)` that hits the existing `/api/auth/sign-in/email` Better Auth endpoint via `page.request.post(...)`, captures the response's `Set-Cookie` for the session cookie, and `page.context().addCookies([...])` to attach it. Subsequent `page.goto(...)` calls run as the guest.
      - A seed fixture: rely on the existing `scripts/seed.ts` to ensure `guest@deskhive.local` (or whichever guest seed exists) is present. If no guest seed exists, add ONE — the smallest possible insert — to `scripts/seed.ts`. Verify with the BA expected seed accounts before adding.
    - **Cost cap:** if the helper grows beyond ~100 lines or requires a Playwright global-setup file or Better Auth test-mode infrastructure, **escalate to BA** before continuing. Decision §12's error-path E2E is already marked "nice to have, not required" — the happy-path is the focus. If the auth-helper infrastructure surprises us, escalate to BA and consider falling back to BA browser-checklist verification for the happy path too, matching Stories 5.1 / 5.2 / 6.1 / 6.2 precedent.
    - **Error-path E2E (Decision §12 "nice to have"):** SKIP for this story. Simulating the double-booking race in test infrastructure (two concurrent Playwright contexts both racing on the same desk + date) is meaningful test infrastructure and explicitly marked optional. Document the skip in Completion Notes.

14. **AC-14 (No regression in any Epic 0–6.2 flow).** Every flow verified during prior stories must still work:
    - US-1.1–1.3 auth flows unchanged.
    - US-2.x admin spaces + desks CRUD unchanged. Story 6.1's dollar input unchanged.
    - US-3.1–3.5 guest browse / book / cancel — the booking creation flow now fires a toast on success and on error; the underlying Server Action contract is unchanged; the navigation target is `/my-bookings?booked=1` (vs. `/my-bookings` before) — same page, harmless query param.
    - US-4.1–4.3 admin view / confirm / reject — **no toasts** added per AC-11. Confirm/Reject flows render exactly as Story 5.2 shipped.
    - Story 5.1 + 5.2 reskins preserved. Story 6.2 admin redirect preserved.
    - Footer reads `© 2026 DeskHive` everywhere.
    - 148 unit tests + 31 E2E baseline still pass. Unit count grows by `src/lib/toast.test.ts` count (≥4 cases per AC-4). E2E count grows by 1 (the happy-path test per AC-13) IF the auth helper lands cleanly; otherwise stays at 31 + the BA-checklist deferral note.
    - `pnpm typecheck` / `lint` / `test` / `build` / `test:e2e` all clean.

15. **AC-15 (Stop bar — BA browser verification checklist).** All 18 points from BA Decisions §"Browser verification checklist" verified in browser by BA before greenlight. Highlights:
    1. Happy path: bottom-right green toast with `Booking requested` + `We'll let you know when it's confirmed.` + `View in My Bookings` link.
    2. Auto-dismiss after ~4s.
    3. Pause-on-hover.
    4. Manual close via X.
    5. Toast survives navigation from `/spaces/[id]` to `/my-bookings`.
    6. "View in My Bookings" link works.
    7. Booking actually created.
    8. Error path: race condition (two concurrent guests) → red toast with conflict message.
    9. Error toast styling correct.
    10. Error toast does not navigate.
    11. Single toast at a time.
    12. NO toast on admin Confirm/Reject.
    13. NO toast on register/login.
    14. Keyboard accessibility (Tab → Enter dismisses).
    15. Phase 1 regressions: all flows still work.
    16. No console errors.
    17. All unit + E2E tests pass.
    18. Footer `© 2026 DeskHive`.

16. **AC-16 (Single commit + memory entry).** Per BA Decisions §13:
    - All Story 6.3 changes land in a single commit on `main` titled exactly `feat: booking confirmation toast (Story 6-3)`. Commit content is only files under `deskhive/` plus the `_bmad-output/` story file + sprint-status update.
    - A small follow-up `docs:` commit may fill in the Change Log hash + BA greenlight after browser-verification + push (Story 5.1 / 5.2 / 6.1 / 6.2 precedent).
    - **Add a memory entry** flagging `src/lib/toast.ts` as the canonical UI feedback seam + the toast copy as the source of truth for transactional voice. Phase 2's Email infrastructure theme reuses the same voice. Suggested type: `reference`. Suggested name: `Toast wrapper + transactional voice template`. Update `MEMORY.md` index.

## Tasks / Subtasks

- [x] **Task 0 — Prep.**
  - Verify all CI commands on a clean `main` checkout still pass: `pnpm typecheck` / `lint` / `test` / `build` / `test:e2e`. Baseline is 148 unit + 31 E2E from Story 6.2.
  - Read [docs/design/6-3-booking-confirmation-toast-ba-decisions.md](docs/design/6-3-booking-confirmation-toast-ba-decisions.md) end-to-end, **especially the Change Log at the bottom**. BA Decision §7 was revised on 2026-05-12 (post-implementation browser review) — the toast-in-context approach (no redirect on success; toast on `/spaces/[id]`) is the locked behavior.
  - Re-read [src/actions/booking.ts:140-147](deskhive/src/actions/booking.ts) — the `createBookingAction` end-of-success-path. **Two changes land here per revised Decision §7:** extending `CreateBookingActionState` with a `'success'` variant AND replacing the `redirect('/my-bookings')` call with `return { status: 'success' };`. This mirrors the shape of `cancelBookingAction`'s success return (line 253) — same pattern, two parallel actions now.
  - Re-read [src/app/spaces/[id]/book-desk-button.tsx](deskhive/src/app/spaces/[id]/book-desk-button.tsx) — this single Client Component handles BOTH the success toast (Task 3) and the error toast (Task 4) via one `useEffect` with a `useRef` state-identity guard.
  - Re-read [src/app/my-bookings/cancel-booking-button.tsx](deskhive/src/app/my-bookings/cancel-booking-button.tsx) + the `cancelBookingAction` success return at `src/actions/booking.ts:253` — the existing pattern there is the template for both the toast-in-context success flow AND the cancel toast in Task 6.

- [x] **Task 1 — Install + mount sonner** (AC-1, AC-2):
  - `pnpm add sonner` in `deskhive/`. Verify no peer-dep warnings on React 19 / Next 16. If conflict → escalate to BA before swapping to `react-hot-toast`.
  - Modify `src/app/layout.tsx`: import `Toaster` from `sonner`, render it inside `<body>` after the footer. Configure: `position="bottom-right" duration={4000} closeButton`. **Do NOT** pass `richColors` — the custom palette from AC-8 owns the colors.
  - **Note for the dev-agent:** the `Toaster` component is a Client Component (`'use client'` from sonner). Rendering it inside `app/layout.tsx` (a Server Component) works because React allows Server Components to render Client Components as children. No `'use client'` directive is needed on the layout itself.

- [x] **Task 2 — Create `src/lib/toast.ts` wrapper + tests** (AC-3, AC-4, AC-7):
  - New file `src/lib/toast.ts`:
    ```ts
    import { toast } from 'sonner';

    export const TOAST_COPY = {
      BOOKING_SUCCESS_TITLE: 'Booking requested',
      BOOKING_SUCCESS_DESCRIPTION: "We'll let you know when it's confirmed.",
      BOOKING_SUCCESS_ACTION_LABEL: 'View in My Bookings',
      BOOKING_FAILED_TITLE: 'Booking failed',
      BOOKING_FAILED_DOUBLE_BOOKING: 'That desk was just booked by someone else. Please try a different desk.',
      BOOKING_FAILED_PAST_DATE: 'Booking date cannot be in the past.',
      BOOKING_FAILED_DESK_NOT_FOUND: 'This desk is not available.',
      BOOKING_FAILED_GENERIC: 'Something went wrong. Please try again.',
      CANCEL_SUCCESS: 'Booking cancelled.',
    } as const;

    export function toastSuccess(title: string, opts?: { description?: string; action?: { label: string; href: string } }): void {
      // ... call sonner with the right shape
    }

    export function toastError(title: string, description?: string): void {
      // ... call sonner with the right shape
    }
    ```
  - New file `src/lib/toast.test.ts`. Mock `sonner` via `vi.mock('sonner', ...)` and assert that `toast.success` / `toast.error` are invoked with the expected args. Verify the `action` prop forwarding for `toastSuccess`. **Do NOT** test rendering — just the wrapper's call shape.
  - Document `TOAST_COPY` so test code references the constants (not literal duplicates).

- [x] **Task 3 — Success toast in action context (revised BA Decision §7)** (AC-5, AC-7):
  - In `src/actions/booking.ts`:
    - Extend the `CreateBookingActionState` discriminated union with `| { status: 'success' }` (mirrors `CancelBookingActionState` from Task 6).
    - At the end of `createBookingAction`'s happy path (line 146 area), replace `redirect('/my-bookings')` with `return { status: 'success' };`. The `revalidatePath` calls for `/spaces/${desk.spaceId}` and `/my-bookings` stay in place — the booking is still invalidated in the route cache, so the user lands on a fresh `/my-bookings` if they click the toast's action button.
  - In `src/app/spaces/[id]/book-desk-button.tsx`:
    - Import `useRouter` from `next/navigation` and `toastSuccess` from `@/lib/toast` alongside the existing `toastError`.
    - The Task 4 `useEffect` already handles `state.status === 'error'`. **Extend it** to also handle `state.status === 'success'`: fire `toastSuccess(TOAST_COPY.BOOKING_SUCCESS_TITLE, { description: TOAST_COPY.BOOKING_SUCCESS_DESCRIPTION, action: { label: TOAST_COPY.BOOKING_SUCCESS_ACTION_LABEL, onClick: () => router.push('/my-bookings') } })`.
    - The same `useRef` state-identity guard handles both success and error — each new state value fires its toast exactly once. The effect's early-return for `state.status === 'idle'` skips the initial render.
  - **Do NOT create `src/app/my-bookings/booked-toast.tsx`** — the cross-nav pattern was revised away. There is no `<BookedToast />` component in this story.
  - **Do NOT import `<BookedToast />` in `src/app/my-bookings/page.tsx`** — the page is unchanged from its Story 6.2 state. If the prior implementation attempt added an import or render, delete it.
  - **The `useRef` state-identity guard is load-bearing for React 19 Strict Mode** — without it the effect's double-invocation in dev fires the toast twice. Don't remove it. The guard pattern is `if (lastFiredState.current === state) return; lastFiredState.current = state;` — keyed off state identity so a new error or success state fires its toast, but re-renders with the same state are no-ops.

- [x] **Task 4 — Error toast on booking failure** (AC-6, AC-7):
  - In `src/app/spaces/[id]/book-desk-button.tsx`:
    - Add `useEffect` + `useRef` guard that fires `toastError(...)` when `state.status === 'error'`. Map each error code to the matching `TOAST_COPY.BOOKING_FAILED_*` constant per AC-6.
    - **Delete the inline `<p className="field-error" role="alert">{errorMessage}</p>` block** (lines 40-44). The toast replaces it. Also delete the `errorMessage` const since it becomes unused.
  - Verify the existing button-disable behavior via `useFormStatus` is preserved (defense-in-depth for double-click per BA Decisions §8).

- [x] **Task 5 — Toast styling + audit no-toast-on-admin** (AC-8, AC-11):
  - Append `.toast-success` / `.toast-error` rules to `src/app/globals.css` (or sonner's `toastOptions.classNames` slots — dev-agent picks; use `[System.IO.File]::WriteAllText` + `UTF8Encoding(false)` if writing to `globals.css` via PowerShell to avoid the mojibake regression per memory `feedback_powershell_utf8_set_content_corrupts.md`).
  - Reuse the existing brand tokens: `--color-status-confirmed-*` for success, `--color-status-rejected-*` for error. Inline SVG checkmark + alert icons.
  - **Audit no-toast-on-admin (AC-11):** grep `deskhive/src/app/admin/**` + `deskhive/src/actions/auth.ts` for any `toastSuccess` / `toastError` / `toast` imports. Expected: 0 hits. If found, remove.

- [x] **Task 6 — Cancel toast bundle** (AC-10):
  - In `src/actions/booking.ts`, extend `CancelBookingActionState` with a `'success'` variant: `| { status: 'success' }`. On the happy path (line 253), return `{ status: 'success' }` instead of `{ status: 'idle' }`.
  - In `src/app/my-bookings/cancel-booking-button.tsx`:
    - Add `useEffect` + `useRef` guard watching `state.status === 'success'` that fires `toastSuccess(TOAST_COPY.CANCEL_SUCCESS)`.
  - **If mid-implementation any unforeseen coupling surfaces** (e.g., another caller relies on `state.status === 'idle'` to differentiate "never submitted" from "submitted successfully"), per BA Decisions §10's explicit escape hatch: **defer the cancel toast to a separate polish item.** Document the rationale + cost-evidence in Completion Notes; revert the cancel-side changes; leave the booking-creation toast (Tasks 1–5) untouched.

- [x] **Task 7 — E2E happy-path test + minimal Playwright auth helper** (AC-13):
  - Create `tests/e2e/_helpers/login.ts` (or `fixtures/login.ts`). Implements `loginAsGuest(page)` (or `loginAsGuest({ page, request, context })`) that:
    - Hits `/api/auth/sign-in/email` via `request.post(...)` with seeded guest credentials (probably `guest@deskhive.local` + the seed password — verify with `scripts/seed.ts`).
    - Captures the `Set-Cookie` header from the response.
    - Adds the session cookie to the test's Playwright context.
  - Create `tests/e2e/booking-toast.spec.ts`. A single test:
    - `await loginAsGuest(...)`
    - `await page.goto('/spaces/[some-seeded-space-id]?date=YYYY-MM-DD')` (use a seeded space + a date that's at least one PUBLISHED desk available)
    - Click "Book this desk"
    - `expect(page.getByText('Booking requested')).toBeVisible()` (the toast)
    - `expect(page.getByRole('link', { name: 'View in My Bookings' })).toBeVisible()`
    - Optionally: click the link, verify `/my-bookings` page renders.
  - **Cost cap reminder:** if the helper grows beyond ~100 lines OR requires Playwright `globalSetup` OR Better Auth test-mode rigging — **escalate to BA before continuing**. Per AC-13 fallback, BA's browser checklist owns happy-path verification if the helper costs grow.
  - **Error-path test skipped** per AC-13. Document in Completion Notes.

- [x] **Task 8 — Local CI parity:**
  - `pnpm typecheck` clean.
  - `pnpm lint` clean.
  - `pnpm test` — baseline 148 + new wrapper tests (≥4 per AC-4). Expected: ~152.
  - `pnpm build` — clean, route count unchanged at 28.
  - `pnpm test:e2e` — 31 prior + 1 new happy-path test (Task 7) = 32 IF the helper landed; 31 + Completion Note if escalated.

- [ ] **Task 9 — Manual verification (BA's eyeball — AC-15 / Verification §1–18).** *(DEFERRED to BA's review pass per Stories 5.1 / 5.2 / 6.1 / 6.2 precedent — dev-agent runs automated suite (typecheck/lint/test/build/test:e2e all green); BA owns the 18-point eyeball checklist incl. the race-condition error path. Note: Task 7 also escalated the full happy-path booking E2E per AC-13 — BA browser-checklist is the verification mechanism for the booking flow toast.)*

- [x] **Task 10 — Memory + sprint status + single commit** (AC-16):
  - Add memory entry `reference_toast_wrapper_and_voice.md`:
    - `src/lib/toast.ts` is the canonical UI feedback seam — wrap once, call sites import the wrapper, not sonner directly.
    - `TOAST_COPY` constants are the source of truth for transactional voice. Phase 2's Email infrastructure theme should reuse the same strings (e.g., "Your booking request was received. We'll email you when the space owner confirms." mirrors "Booking requested. We'll let you know when it's confirmed.").
    - Type: `reference`. Update `MEMORY.md` index.
  - Update `_bmad-output/implementation-artifacts/sprint-status.yaml`:
    - `6-3-booking-confirmation-toast: backlog` → `review`.
    - Update `last_updated` parenthetical.
  - Update this story file's metadata: `Status: ready-for-dev` → `Status: review`; mark all Tasks `[x]` except Task 9 (BA's eyeball deferral); fill in Dev Agent Record (Agent Model, Debug Log References table, Completion Notes incl. AC-10 cancel-toast bundle decision, File List, Change Log with placeholder hash).
  - Stage `deskhive/...` (incl. `package.json` + `pnpm-lock.yaml` from `pnpm add sonner`) + the two `_bmad-output/...` files only.
  - Commit: `feat: booking confirmation toast (Story 6-3)`.
  - **Do NOT push.** Wait for BA browser-verification per Task 9 before pushing.
  - After BA greenlight: push, then add a small `docs:` follow-up commit to fill in the Change Log hash (same pattern as Stories 5.1 / 5.2 / 6.1 / 6.2).

## Dev Notes

### What gets built and what's deliberately out of scope

This is the **third and final story of Epic 6 — Phase 1 Polish**. After it lands at `review` and BA greenlights:

- Guests get bottom-right toast feedback when they book a desk (success + error).
- Optional: guests also get a toast when they cancel (Decision §10 escape hatch).
- The toast wrapper `src/lib/toast.ts` becomes the canonical UI feedback seam.
- The toast copy becomes the voice template for Phase 2's transactional emails.
- Phase 1 (Epics 0–6) closes pending only retrospectives.

Feature scope (Story 6.3 only):
- ✅ Install + mount sonner.
- ✅ `src/lib/toast.ts` wrapper with `toastSuccess` / `toastError` + locked copy constants.
- ✅ Success toast on booking creation (cross-navigation via `?booked=1` query param).
- ✅ Error toast on booking creation failure (5 specific error codes + generic fallback).
- ✅ Brand-styled (`status-confirmed` / `status-rejected` tokens) — not sonner's default `richColors` palette.
- ✅ Bottom-right, 4s auto-dismiss, manual close, pause-on-hover, slide-in.
- ✅ Cancel toast IF AC-10 stays trivial (recommended approach: bump action state with `'success'` variant).
- ✅ Happy-path E2E test + minimal Playwright auth helper IF cost cap holds.
- ✅ Memory entry: toast wrapper + transactional voice template for Phase 2.

Out of scope for Story 6.3 (do NOT build):
- ❌ Toasts on admin Confirm/Reject — explicit BA anti-pattern (BA Decisions §11).
- ❌ Toasts on auth flows (register, login) — those redirect to fresh pages, separate UX problem.
- ❌ Hand-rolled toast component — explicit BA anti-pattern §1.
- ❌ Direct `sonner` imports anywhere outside `src/lib/toast.ts` — the wrapper insulates call sites.
- ❌ Toast stacking — one at a time, new replaces old (BA Decisions §8).
- ❌ Center-of-screen toast position — bottom-right per Decision §2.
- ❌ Auto-dismiss longer than 4s — pause-on-hover covers the "needed more time" case.
- ❌ Global notification center / inbox / toast persistence — ephemeral by design.
- ❌ Mobile-optimized toast layout — desktop-first per Decision §2. Phase 2 if needed.
- ❌ Toast accessibility deep-dive — library defaults only (Decision §9).
- ❌ Changes to the booking Server Action's success/error contract — toasts read from `useActionState` and the redirect query param. The action stays the same.
- ❌ Error-path E2E test — Decision §12 "nice to have" + concurrent-race infra is meaningful. Skipped.
- ❌ Phase 2 transactional emails — only Phase 1 toasts here. Phase 2 reuses the copy voice (memory entry).

### Key decisions

1. **Toast-in-context (revised BA Decision §7 — 2026-05-12).** The booking Server Action returns `{ status: 'success' }` instead of redirecting. The `<BookDeskButton>` Client Component on `/spaces/[id]` reads the success state from `useActionState` and fires the toast in-place. The toast's action button (`onClick: () => router.push('/my-bookings')`) is the user's path to My Bookings — a real navigation, not a soft no-op. **Prior approach (rejected during browser review):** server-side redirect to `/my-bookings?booked=1` + a `<BookedToast />` Client Component on the destination that read the query param and fired the toast. Worked technically but put the toast on the destination page, making the "View in My Bookings" action button a soft no-op. The revision moves the toast into the action context where it's more responsive and the action button has real work. **Alternative considered + rejected:** flash cookie. Adds set/clear lifecycle complexity without benefit over a state-return.

2. **React 19 Strict Mode requires `useRef` effect guards.** Both the success-toast Client Component (Task 3) and the error-toast effect (Task 4) and the cancel-toast effect (Task 6) MUST gate the `toast(...)` call behind `fired.current = true` to prevent double-invocation in development. Without it: dev sees the toast fire twice. Production is single-fire (Strict Mode only double-invokes in dev), but the guard is the canonical pattern.

3. **Wrapper insulates the codebase from library choice.** `src/lib/toast.ts` re-exports `toastSuccess` / `toastError`. Phase 2 can swap sonner for anything (Radix Toast, a custom Notification Center, etc.) without touching call sites. This is BA Decisions §13's load-bearing rationale.

4. **Copy is verbatim and lives as constants.** `TOAST_COPY` is exported from `src/lib/toast.ts`. Tests reference the constants. Anyone tempted to write "Booking submitted!" hits the constant first and either uses it or has a conversation with the BA. Locks the voice.

5. **Cancel toast is borderline-trivial — Option (a) recommended.** Cancel action state grows by one variant (`'success'`); cancel button gets a 3-line effect. Total cost: ~10 lines + 1 variant. Within Decision §10's "trivial" envelope. If the dev-agent surfaces a hidden coupling (some other caller depends on `idle` semantically), Decision §10's explicit escape hatch is to defer cleanly — revert cancel-side changes only, leave the booking-creation toast intact.

6. **E2E auth helper cost cap.** Adding even a minimal Playwright login helper is meaningful infrastructure compared to Stories 5.1 / 5.2 / 6.1 / 6.2 (which all deferred authenticated E2E to BA's browser-walk). BA Decisions §12 explicitly asks for it this time. **Cost cap: ~100 lines.** If the helper grows beyond that (Playwright globalSetup, Better Auth test-mode rigging, multi-tenant seed gymnastics), **escalate to BA** before continuing. Fallback: BA browser-checklist owns happy-path verification, matching prior precedent.

7. **Error-path E2E is intentionally skipped.** Simulating the double-booking race requires either two concurrent Playwright contexts both racing on the same desk + date, or Better Auth two-session test infrastructure, or DB direct-write to seed a pre-existing conflict — all meaningful. BA Decisions §12 marks it "nice to have, not required." Document the skip in Completion Notes; BA verifies the race manually via two browser windows in browser-walk point §8.

8. **Toast palette reuses status tokens, doesn't reinvent them.** The `--color-status-confirmed-*` and `--color-status-rejected-*` tokens from Story 5.1 are the source of truth for the green/red status palette. Toast styling references these tokens via new `.toast-*` classes — **does NOT** modify the badge / dot / status-pair styles. One palette, two consumers.

9. **Sonner's `<Toaster />` is a Client Component.** Rendering it inside `app/layout.tsx` (a Server Component) is fine — React Server Components can render Client Components as children. The layout doesn't need `'use client'`.

10. **All cross-cutting framework choices preserved:** `nextCookies()` plugin, conditional UPDATE pattern, `revalidatePath` for booking writes (still fires; redirect target's query param doesn't affect cache invalidation), redirect-after-try-catch in Server Actions, layout-level `/admin/*` guard, `callbackUrl` same-origin guard. Story 6.2 admin-redirect on `/my-bookings` runs BEFORE `<BookedToast />` mounts — admins never see the success toast, even if they somehow trigger one (which they can't, because they don't book desks).

### Sprint status update

`_bmad-output/implementation-artifacts/sprint-status.yaml` updates:

```yaml
  # Epic 6 — Phase 1 Polish (synthetic, post-Epic-5)
  epic-6: in-progress
  6-1-price-input-dollars: review                    # unchanged
  6-2-hide-my-bookings-from-admin: review            # unchanged
  6-3-booking-confirmation-toast: review             # was: backlog
  epic-6-retrospective: optional
```

Update the `last_updated` parenthetical at top of file.

### Recent commits

```
6a4c741 docs: fill commit hash in Story 6-2 Change Log + record BA greenlight
be3e16a feat: hide My Bookings from admin nav + redirect direct nav (Story 6-2)    ← Last feature commit
9471224 docs: fill commit hash in Story 6-1 Change Log + record BA greenlight
6e256f6 feat: desk price input accepts dollars, stores cents (Story 6-1)
552c05d docs: fill commit hash in Story 5-2 Change Log + record BA greenlight
c5d830a feat: design reskin — admin screens (Story 5-2)
...
```

Story 6.3 is the **third and final Phase 1 polish commit**. Subject: `feat: booking confirmation toast (Story 6-3)`. After it lands + BA greenlight, Phase 1 closes pending retrospectives.

### References

- [Source: docs/design/6-3-booking-confirmation-toast-ba-decisions.md](docs/design/6-3-booking-confirmation-toast-ba-decisions.md) — BA decisions document (this story's source of truth).
- [Source: docs/phase2-framing-and-polish-backlog.md §6-3](docs/phase2-framing-and-polish-backlog.md) — original polish item framing.
- [Source: deskhive/src/actions/booking.ts:146](deskhive/src/actions/booking.ts) — the one-character redirect change (Task 3).
- [Source: deskhive/src/actions/booking.ts:253](deskhive/src/actions/booking.ts) — cancel action success return (AC-10 / Task 6).
- [Source: deskhive/src/app/spaces/[id]/book-desk-button.tsx](deskhive/src/app/spaces/[id]/book-desk-button.tsx) — where the error `useEffect` lands (Task 4).
- [Source: deskhive/src/app/my-bookings/page.tsx](deskhive/src/app/my-bookings/page.tsx) — where the success-toast Client Component mounts (Task 3).
- [Source: deskhive/src/app/my-bookings/cancel-booking-button.tsx](deskhive/src/app/my-bookings/cancel-booking-button.tsx) — cancel toast wiring (Task 6).
- [Source: deskhive/src/app/layout.tsx](deskhive/src/app/layout.tsx) — `<Toaster />` mount (Task 1).
- [Source: deskhive/src/app/globals.css](deskhive/src/app/globals.css) — status-color tokens for AC-8 styling.
- [Source: deskhive/AGENTS.md] — Next.js 16 caveats.
- [Source: deskhive/scripts/seed.ts] — seeded guest credentials for AC-13 Playwright helper.
- [_bmad-output/implementation-artifacts/6-2-hide-my-bookings-from-admin.md] — Story 6.2 implementation artifact (commit pattern + memory entry source).
- Dev-agent memory `feedback_powershell_utf8_set_content_corrupts.md` — required reading if any PowerShell file rewrites happen (AC-8 globals.css append).
- Dev-agent memory `reference_role_specific_nav_pattern.md` — Story 6.2's pattern (admin redirect runs before `<BookedToast />` mounts).

## Dev Agent Record

### Agent Model Used

`claude-opus-4-7[1m]` (Claude Opus 4.7, 1M-context). Same agent across the full implementation; no model swap mid-story.

### Debug Log References

| # | Phase | Symptom | Root cause | Fix |
|---|---|---|---|---|
| 1 | E2E smoke test | `expect(page.locator('[data-sonner-toaster]')).toHaveCount(1)` failed — locator resolved to 0 elements. | Sonner 2.0 lazy-mounts the `[data-sonner-toaster]` container only when the first toast fires — not on `<Toaster />` mount. The smoke test assumed eager mount. | Deleted the broken smoke test. Documented the lazy-mount finding in completion notes. BA browser-checklist owns runtime verification of Toaster presence. |

### Completion Notes List

**BA-required decision-point answers:**

1. **AC-1 sonner peer-dep verification:** ✅ Installed `sonner@2.0.7` via `pnpm add sonner`. **Zero peer-dep warnings** on React 19.2.4 / Next 16.2.4. No fallback to `react-hot-toast` needed.

2. **AC-8 toast styling implementation choice:** Used **CSS rules in `globals.css` targeting sonner's attribute selectors** (`[data-sonner-toaster] [data-sonner-toast].toast-success { ... }`), with the `.toast-success` / `.toast-error` class names attached via the wrapper's `className` option on each `toast.success(...)` / `toast.error(...)` call. **Not** `toastOptions.classNames` on the `<Toaster />` element — that's global default styling, whereas per-toast `className` lets the wrapper apply variant-specific palettes cleanly. Reuses Story 5.1's `--color-status-confirmed-*` / `--color-status-rejected-*` tokens; no new palette values.

3. **AC-10 cancel-toast outcome:** ✅ **Option (a) bundled cleanly.** Three changes total:
   - `CancelBookingActionState` discriminated union grew one variant: `| { status: 'success' }`.
   - `cancelBookingAction`'s happy-path return: `{ status: 'idle' }` → `{ status: 'success' }`.
   - `<CancelBookingButton>` added a 6-line `useEffect` (incl. the `useRef` Strict-Mode + state-identity guard) firing `toastSuccess(TOAST_COPY.CANCEL_SUCCESS)` on `state.status === 'success'`.
   - No callers depended on `idle` semantically (verified via grep — only `useActionState`'s initial state reference). Bundled within scope per Decision §10's "trivial" envelope.

4. **AC-13 E2E auth-helper outcome:** ⚠️ **Escalated to BA browser-checklist via the AC-13 explicit escape hatch.** Rationale:
   - The minimal Playwright auth helper alone (sign up via `/api/auth/sign-up/email`, capture `Set-Cookie`) is ~30 lines.
   - The full happy-path booking E2E also needs a seeded space + at least one bookable desk + a known future-date with availability. The current `scripts/seed.ts` only seeds the admin user — no spaces, no desks. Extending it to also seed a space + desks (via direct DB insert or via the admin Server Action chain) plus a teardown / cleanup helper would push total infrastructure well past the AC-13 ~100-line cost cap.
   - I attempted a smaller smoke test (verify `[data-sonner-toaster]` is in the DOM on a public page) but sonner 2.0 lazy-mounts the container — the smoke test failed. Deleted it.
   - Per AC-13 explicit escape hatch ("Cost cap... escalate to BA before continuing... fallback: BA browser-checklist owns happy-path verification, matching Stories 5.1 / 5.2 / 6.1 / 6.2 precedent"): BA's browser-walk checklist (AC-15 §1–18) is the verification mechanism for the booking-flow toast.
   - **Documented for Phase 2:** establishing authenticated E2E infrastructure (Playwright auth helper + seed extensions + cleanup) is a 1-2 day side quest. Likely worth it before Theme C's email-infrastructure work in Phase 2.

**BA revision applied (2026-05-12):**

5. **Decision §7 revised — toast-in-context replaces cross-navigation.** The first implementation followed the original Decision §7 (redirect to `/my-bookings?booked=1`, fire toast on destination via `<BookedToast />` Client Component). BA browser review flagged the action button as a soft no-op — the user was already on `/my-bookings` when the toast appeared. Revised approach: Server Action returns `{ status: 'success' }`; `<BookDeskButton>` fires the toast on `/spaces/[id]`; action button becomes a real `router.push('/my-bookings')`. Files reverted: `src/app/my-bookings/booked-toast.tsx` deleted; `src/app/my-bookings/page.tsx` restored to its Story 6.2 state. BA decisions doc Change Log updated with the revision rationale.

**Implementation observations worth carrying forward:**

1. **Toast-in-context pattern (revised Decision §7).** The Server Action returns a success state instead of redirecting. The Client Component reads it via `useActionState`, fires the toast on the current page, and exposes a real `router.push(...)` callback through the toast's action button. Simpler than the cross-nav approach: no query-param hand-off, no `useSearchParams()`, no `<Suspense>` considerations, no separate Client Component on the destination. The action context is where the user expects the confirmation; the action button has real work to do. **Phase 2 should follow this pattern** for any new success-toast flows.

2. **React 19 Strict Mode + `useEffect` double-fire is a real concern.** Both toast-triggering effects (`<BookDeskButton>` success/error and `<CancelBookingButton>` success) use a state-identity `useRef` guard. The single `useEffect` in `<BookDeskButton>` branches on `state.status === 'success'` vs `'error'` after the guard so each new state value fires exactly one toast.

3. **`BookDeskButton` deleted the inline `field-error` block.** Per AC-6, the toast replaces it. The old `<p className="field-error" role="alert">` block also surrounded the form in a `<div>` wrapper for layout — that wrapper is also gone now since the form is the only child. The button-disabled-via-`useFormStatus` defense remains in place for double-click protection.

4. **`toastSuccess`'s action prop takes `onClick`, not `href`.** The story-locked signature in AC-3 was `{ label: string; href: string }`. I changed it to `{ label: string; onClick: () => void }` because the wrapper must remain framework-agnostic (can't import `next/navigation` hooks); the call site in `<BookDeskButton>` provides `onClick: () => router.push('/my-bookings')`. This is a wrapper-API deviation from AC-3's signature — documented here for review. The user-observable behavior (clickable "View in My Bookings" label that navigates to `/my-bookings`) is unchanged.

6. **Toaster mount placement:** inside `<body>` after `<footer>`, NOT inside `<Header />` or `<main>`. Keeps it free of the page tree, so it persists cleanly across navigations.

7. **No regression** in any cross-cutting framework choice: `nextCookies()`, conditional UPDATE pattern, `revalidatePath` (still fires before the new success-return — the booking is invalidated in both `/spaces/[id]` and `/my-bookings` route caches), redirect-after-try-catch in Server Actions where applicable, layout-level `/admin/*` guard, Story 6.2's admin-redirect on `/my-bookings` (admins still server-side-redirect to `/admin/bookings` if they hit `/my-bookings`; unrelated to the toast revision). Story 6.1's dollar-input behavior unchanged.

**Local CI parity (all green):**

- `pnpm typecheck` — clean.
- `pnpm lint` — clean.
- `pnpm test` — **166 passed + 1 skipped** (was 148; +18 from `toast.test.ts`).
- `pnpm build` — clean. Route count unchanged at 28. No `useSearchParams()` Suspense warnings.
- `pnpm test:e2e` — 31/31 passed in 12.8s. The unauthenticated `/my-bookings` → `/login` redirect test is unchanged. The auth-helper-based happy-path booking E2E was escalated per AC-13.

### File List

**New (2):**
- `deskhive/src/lib/toast.ts` — wrapper exposing `toastSuccess` / `toastError` + frozen `TOAST_COPY` constants.
- `deskhive/src/lib/toast.test.ts` — 18 wrapper-behavior tests (mocks sonner via `vi.mock`).

*(Originally also created `deskhive/src/app/my-bookings/booked-toast.tsx` for the cross-navigation pattern; deleted during the BA revision when Decision §7 was revised to use toast-in-context. The page on `/my-bookings` no longer needs any client-side toast-trigger component.)*

**Modified (5):**
- `deskhive/package.json` + `deskhive/pnpm-lock.yaml` — `sonner@2.0.7` added.
- `deskhive/src/app/layout.tsx` — `<Toaster position="bottom-right" duration={4000} closeButton />` mounted after footer. No `richColors`.
- `deskhive/src/app/globals.css` — Appended `.toast-success` / `.toast-error` rules targeting sonner's attribute selectors. Reuses Story 5.1 status tokens.
- `deskhive/src/actions/booking.ts`:
  - **Revised:** `CreateBookingActionState` discriminated union extended with `| { status: 'success' }` (parallels the cancel action shape).
  - **Revised:** The happy-path `redirect('/my-bookings')` (line 146) replaced with `return { status: 'success' };`. The `revalidatePath` calls for both `/spaces/[id]` and `/my-bookings` stay in place.
  - `CancelBookingActionState` discriminated union extended with `| { status: 'success' }`.
  - Cancel happy-path return: `{ status: 'idle' }` → `{ status: 'success' }`.
- `deskhive/src/app/spaces/[id]/book-desk-button.tsx` — Single `useEffect` with `useRef` state-identity guard handles BOTH success AND error: on `state.status === 'success'` fires `toastSuccess(...)` with `onClick: () => router.push('/my-bookings')`; on `state.status === 'error'` fires `toastError(...)` with the per-code description from `errorDescription(state)`. Imports `useRouter` from `next/navigation`. Inline `<p className="field-error">` block deleted (toast replaces it).
- `deskhive/src/app/my-bookings/cancel-booking-button.tsx` — `useEffect` + `useRef` state-identity guard firing `toastSuccess(TOAST_COPY.CANCEL_SUCCESS)` on `state.status === 'success'`. Unchanged by the BA revision.

*(`src/app/my-bookings/page.tsx` was touched during the prior implementation attempt — `<BookedToast />` import + render added — and reverted during the revision. The file now matches its Story 6.2 state byte-for-byte.)*

**Modified — orchestration:**
- `_bmad-output/implementation-artifacts/sprint-status.yaml` — `6-3-booking-confirmation-toast: ready-for-dev` → `review`; `last_updated` parenthetical updated.
- `_bmad-output/implementation-artifacts/6-3-booking-confirmation-toast.md` — Status / tasks / Dev Agent Record / Change Log (this file).

**Memory (out-of-tree, in `~/.claude/projects/.../memory/`):**
- `reference_toast_wrapper_and_voice.md` — Codifies `src/lib/toast.ts` as the canonical UI feedback seam + `TOAST_COPY` as the voice template for Phase 2 transactional emails (per AC-16 + BA Decisions §13).
- `MEMORY.md` — Index updated.

### Change Log

| Date | Change | Commit |
|---|---|---|
| 2026-05-12 | Story drafted by `bmad-create-story` from BA decisions document. | (none) |
| 2026-05-12 | BA pre-implementation tweaks locked: `richColors` removed from Toaster props; trailing period on `BOOKING_FAILED_PAST_DATE` toast string. | (none) |
| 2026-05-12 | Story implemented; sonner installed, wrapper + cross-nav success toast + error toast + cancel toast landed. AC-13 happy-path E2E escalated to BA browser-checklist per cost cap. | (superseded — see next row) |
| 2026-05-12 (revision) | **BA revision during pre-commit browser review.** Decision §7 revised: the booking flow no longer redirects on success. Server Action now returns `{ status: 'success' }`; `<BookDeskButton>` fires the toast on `/spaces/[id]`; the action button is a real `router.push('/my-bookings')`. Deleted `booked-toast.tsx` and reverted `my-bookings/page.tsx` to its Story 6.2 state. Updated BA decisions doc Decision §4 + §7 + anti-patterns + Change Log accordingly. Single commit per AC-16. | `71ab26c` |
| 2026-05-12 | Browser-verified by BA post-revision: toast appears on `/spaces/[id]` with URL unchanged, "View in My Bookings" navigates correctly, all other behaviors (cancel toast, no-toast-on-admin/auth, race-condition error path, footer) unchanged. Phase 1 closes pending only retrospectives. | (this follow-up) |
