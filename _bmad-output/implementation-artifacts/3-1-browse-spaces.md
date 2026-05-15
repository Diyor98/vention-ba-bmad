# Story 3.1: Browse Spaces

Status: review

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a **Guest or visitor (logged-in or not)**,
I want **to see a list of all published spaces on `/`, optionally filtered by city via `?city=X`**,
so that **I can find a place to work.**

> Verbatim from Document B §8 (US-3.1). FR-D1 (browse all published spaces) and FR-D2 (optional city filter).

> **This story replaces the create-next-app welcome page.** US-1.1's anti-pattern explicitly reserved this story as the moment to replace `src/app/page.tsx`. After it lands, `/` is a real public landing page.

## Acceptance Criteria

Verbatim Gherkin from Document B §8 US-3.1, plus implementation-shaped ACs:

1. **AC-1 (Public visitor browses spaces — happy path).**
   ```gherkin
   Given two Spaces exist with status PUBLISHED in cities "Berlin" and "Lisbon"
   And I am NOT logged in
   When I visit "/"
   Then I see both spaces listed
   And each card shows the space name, city, and primary image
   When I type "Berlin" into the city filter
   Then only the Berlin space is shown
   ```

2. **AC-2 (Empty state on `/`).**
   ```gherkin
   Given there are zero Spaces with status PUBLISHED
   When I visit "/"
   Then I see the message "No spaces available yet."
   ```

3. **AC-3 (Public route — no auth required).** `/` is accessible without a session. Header still renders (unauthenticated state with "Log in" / "Register" links per US-1.3). Logged-in Guests and Super Admins see the same `/` content (no role-specific cards or filtering).

4. **AC-4 (Only PUBLISHED spaces are listed).** Spaces with `status = 'SUSPENDED'` are NOT shown. (Admin-only suspension lands in Phase 2; the schema permits SUSPENDED but no UI writes it. The browse query enforces the filter regardless.)

5. **AC-5 (City filter via URL query param).** The filter is URL-driven via `?city=...`. The query helper does case-insensitive equality matching (`ILIKE`), so `?city=berlin`, `?city=Berlin`, and `?city=BERLIN` all match the city stored as `'Berlin'`. **No partial match / prefix match** for Phase 1 simplicity — exact match only.

6. **AC-6 (City filter UX).** A small `<form action="/" method="GET">` at the top of `/` with a single text input named `city` and a "Search" button. Submitting the form navigates to `/?city=<value>`. **No client-side JS, no debounced auto-submit.** A "Clear filter" link (only visible when a filter is active) navigates back to `/`.

7. **AC-7 (Card layout, minimalist).** Each card shows:
   - The space's `primaryImageUrl` rendered as a plain `<img>` (no Next.js `<Image>` optimization in Phase 1 — see Dev Notes for rationale).
   - The space's `name` (heading-level emphasis, e.g., `<h2>` or styled `<p>`).
   - The space's `city`.
   - **No clickable wrapping in this story.** Cards are NOT links to `/spaces/:id` — that route lands in US-3.2, which will wrap each card in `<Link>`. Wrapping cards now would land them on a 404 during US-3.1's `review` state.
   - **No description text on cards.** The description is a Space-detail-page surface (US-3.2). Browse cards stay minimal.

8. **AC-8 (REST endpoint `GET /spaces?city=X`).** Public endpoint, no auth, no rate limit. Returns 200 with a JSON array of `Space` rows (filtered by city if provided). Empty array when no matches. Doc B §6.4 contract path.

9. **AC-9 (Doc B §7.3 four UI states — minimum viable handling).**
   - **Loaded:** spaces array > 0 → render cards.
   - **Empty:** spaces array = 0 → render `"No spaces available yet."` via `<DataView>`.
   - **Loading:** N/A — Server Component renders synchronously after server-side data fetch; no client-side loading state to manage.
   - **Error:** if `listPublishedSpaces` throws (DB down, etc.), the page falls back to a try/catch that renders the `<DataView>` error state ("Something went wrong. Please try again."). **No tech details / stack traces visible to the user** (Doc B §7.3 mandate).

10. **AC-10 (Header continues to work unchanged).** Global header from US-1.3 / US-2.1 renders on `/` exactly as it does on every other page. No new header changes.

11. **AC-11 (Smoke test still passes).** The existing `tests/e2e/smoke.spec.ts` asserts `page.toHaveTitle(/DeskHive/)` — that's a layout-level assertion and remains true. **The welcome-page-specific assertions (the create-next-app H1, the vercel.svg image, etc.) NEVER existed in our smoke test** (US-1.3 already updated it to a title check). So the smoke test passes with the new page content out of the box.

12. **AC-12 (Stop bar — page renders).** Opening `http://localhost:3000/` shows the header + a heading like "Spaces" + the city filter form + either the spaces list (with image, name, city per card) or the empty-state message. No console errors.

13. **AC-13 (Single commit).** `feat: public browse spaces page (US-3.1)`. Commit content under `deskhive/`.

## Tasks / Subtasks

- [x] **Task 0 — Prep.** Verify all CI commands from US-2.4 (`571e8a0`) still pass. No DB schema changes.

- [x] **Task 1 — `listPublishedSpaces` query helper** — extend `src/db/queries/spaces.ts`:
  - `listPublishedSpaces(opts?: { city?: string }): Promise<Space[]>`.
  - Filter: `WHERE status = 'PUBLISHED' AND (city IS NULL or city ILIKE :city)` (Drizzle: `and(eq(status, 'PUBLISHED'), opts?.city ? ilike(spacesTable.city, opts.city) : undefined)` — `and()` ignores `undefined` clauses).
  - Order: `desc(createdAt)` (newest first).
  - **Important:** the existing `listAllSpaces` query (admin) does NOT filter on status — admin sees both PUBLISHED and SUSPENDED. Don't change `listAllSpaces`; add `listPublishedSpaces` alongside.

- [x] **Task 2 — Replace `src/app/page.tsx`** with a real public landing:
  - Server Component (no `'use client'`).
  - Read `searchParams: Promise<{ city?: string }>` (Next 16 async params).
  - `await searchParams` → `cityParam`. Trim and treat empty as undefined.
  - Wrap `listPublishedSpaces` in try/catch → set `status` to `'loaded'` / `'empty'` / `'error'` accordingly.
  - Render: heading + filter form + spaces list (each card shows image / name / city) OR empty state OR error state via `<DataView>`.
  - When a filter is active, show a small "Clear filter" link to `/`.
  - **Use a plain `<img>` tag** (NOT Next.js `<Image>`) for the primary image. Add `<!-- eslint-disable-next-line @next/next/no-img-element -->` if Next's lint rule flags it. Designer / Phase 2 can swap for `<Image>` once the allowed-domains configuration is decided.
  - Tailwind: minimal grid of cards (e.g., `grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4`).

- [x] **Task 3 — `GET /spaces` REST endpoint** — `src/app/api/spaces/route.ts`:
  - No auth. Read `URL(req.url).searchParams.get('city')` → trim → coerce empty to undefined.
  - Call `listPublishedSpaces({ city })`.
  - Return 200 + the array. On error, log and return 500 via `apiError`.
  - **Do NOT pre-validate the `city` param** — any string is acceptable (returns 0 rows when no match).

- [x] **Task 4 — E2E test** — extend `tests/e2e/smoke.spec.ts` (or NEW `tests/e2e/browse.spec.ts`):
  - Test: `home page renders the spaces heading and filter form`. Visit `/`, assert the heading text and the city input + Search button are visible.
  - Test: `GET /api/spaces returns 200 with an array`. Use `request.get('/api/spaces')`, assert status 200 and `Array.isArray(body)`.
  - **DB-dependent assertions (specific spaces visible, city filter narrows results) DEFERRED** to the future Postgres-in-CI story. Same posture as Epic 2.

- [x] **Task 5 — Local CI parity:**
  - `pnpm typecheck` clean
  - `pnpm lint` clean
  - `pnpm test` — 81 prior pass; no new unit tests required (Server Component conditional render is hard to unit-test; query helper is straightforward Drizzle and covered by smoke + the future DB-in-CI happy-path test)
  - `pnpm build` — successful, +1 route (`/api/spaces`); `/` remains dynamic (it reads searchParams + cookies via the global header)
  - `pnpm test:e2e` — at least 17 tests pass (existing 15 + 2 new browse tests)

- [ ] **Task 6 — Manual verification (BA's eyeball — DEFERRED to BA's review of `review`-state story):**
  - With at least 2 PUBLISHED spaces in the DB (created via US-2.1's admin form), visit `localhost:3000/`. See header + heading + city filter form + 2 cards (each with image / name / city).
  - Type a real city name into the filter, press Search → URL becomes `/?city=<value>`, only matching cards shown.
  - Type a fake city → "No spaces available yet."
  - Click "Clear filter" → back to `/` showing all spaces.
  - Visit `/?city=BERLIN` directly (uppercase) — same Berlin spaces matched (case-insensitive).
  - DevTools: visit `/api/spaces` → 200 with JSON array. Visit `/api/spaces?city=Berlin` → filtered array.
  - Edge: temporarily make a space SUSPENDED via direct DB update (e.g. `UPDATE spaces SET status='SUSPENDED' WHERE name='X'`) → it disappears from `/`, still visible in admin list. (Optional, time-permitting.)

- [x] **Task 7 — Single commit (AC-13)** — `feat: public browse spaces page (US-3.1)`.

## Dev Notes

### What gets built and what's deliberately out of scope

This is the **first story of Epic 3 — Discovery & Booking**. After it lands:
- `/` is a real public landing page that lists PUBLISHED spaces.
- The first public REST endpoint (`GET /spaces`) goes live.
- The create-next-app welcome page is gone for good.

Feature scope (US-3.1 only):
- ✅ `/` Server Component renders the spaces list
- ✅ City filter (URL-driven, case-insensitive exact match)
- ✅ `GET /spaces?city=X` REST endpoint
- ✅ Empty/error/loaded states via `<DataView>`
- ✅ Plain `<img>` for primary images

Out of scope for US-3.1 (do NOT build):
- ❌ Clickable cards / `<Link>` to `/spaces/:id` — US-3.2 wraps the cards.
- ❌ View Space Detail (`/spaces/:id`) — US-3.2.
- ❌ Per-desk availability, booking buttons — US-3.2 / US-3.3.
- ❌ Description text or amenities on cards — Phase 2 visual richness.
- ❌ Sort options (price / popularity / etc.) — Phase 2.
- ❌ Multi-criteria filters (price range, capacity) — Phase 2.
- ❌ Pagination — Phase 1 inventory is small.
- ❌ Search-as-you-type / autocomplete — Phase 2 (also requires JS).
- ❌ Map view / geo filter — Phase 2.
- ❌ Image optimization via Next.js `<Image>` — see "Image rendering decision" below.
- ❌ Modifying `src/app/layout.tsx`, `src/components/header.tsx` — header unchanged.
- ❌ Modifying admin pages or admin queries — `listAllSpaces` stays untouched; `listPublishedSpaces` is a new sibling.

### Key decisions

1. **Replacing the welcome page.** `src/app/page.tsx` becomes the spaces browse page. The smoke test (currently asserts page title is `"DeskHive"`) keeps passing because the title is a layout concern (US-1.3's metadata change). The H1 / page content is changing.

2. **Plain `<img>` over Next.js `<Image>`.** `<Image>` requires the `images.remotePatterns` config in `next.config.ts` to whitelist external domains. Super Admins enter arbitrary URLs (any cloud bucket, any CDN, etc.) — there's no closed set to whitelist in Phase 1. Two options were rejected:
   - Whitelist `**` (defeats the security purpose of remotePatterns).
   - Use `unoptimized` prop on `<Image>` (loses the layout-shift-protection benefit anyway, and visually identical to `<img>`).
   Plain `<img>` with width/height styling is the pragmatic Phase 1 choice. Designer / Phase 2 can revisit.

3. **Case-insensitive exact match for city filter.** Drizzle's `ilike(city, value)` does case-insensitive equality. Substring/prefix matching (e.g., `ilike(city, '%' + value + '%')`) is more user-friendly but adds the always-fun "don't forget to escape `%` and `_` in user input" gotcha. Phase 1 minimalism — exact match. Designer / Phase 2 may add fuzzy search.

4. **No new unit tests for the new query helper.** `listPublishedSpaces` is a thin Drizzle wrapper (10 lines). Unit-testing a Drizzle wrapper requires either a real DB or a mocked Drizzle client — the former is the deferred Postgres-in-CI work, the latter is brittle and tests the mock more than the helper. Skip unit-testing this helper; the E2E smoke covers the page render path, and the deferred DB-in-CI happy-path will exercise the filter logic end-to-end.

5. **searchParams in Next 16.** Like `params`, `searchParams` is a `Promise` that must be awaited. `searchParams: Promise<{ city?: string }>`. Type the prop accordingly.

6. **`<DataView>` for the four UI states.** Same primitive used in admin pages from Epic 2. Empty message: `"No spaces available yet."` (verbatim PRD AC-2). Error message: `"Something went wrong. Please try again."` (default `<DataView>` error message; PRD §7.3 mandate).

7. **No "Clear filter" via JS.** A small `<Link href="/">Clear filter</Link>` (rendered only when `?city=` is present) is sufficient. Stays inside the no-client-state principle.

8. **`/spaces/:id` will be wrapped around cards in US-3.2.** Anti-pattern explicitly forbids adding the link in this story to keep scope tight. Anyone manual-testing US-3.1 should not click cards (they'd 404).

### Architecture compliance

- Validation: N/A for the page (no form inputs beyond the GET filter, which Postgres handles defensively via parameterized queries). The REST endpoint accepts any string for `city` (no Zod schema).
- Form pattern: native `<form action="/" method="GET">` for the filter. No Server Action; standard browser GET.
- State management: none (URL is the source of truth for the filter).
- Component library: none. Raw Tailwind.
- DataView: used for the loaded / empty / error states.
- Authorization: none — public route.
- Error response shape (REST): standard `apiError` for the 500 case.
- Status codes (REST): 200 always (empty array is success). 500 on internal error.
- Auth API: not used — no session reads on `/api/spaces`.
- Reskinnable frontend: literal Tailwind utilities; no design tokens.

### Code sketches

#### `src/db/queries/spaces.ts` (extension)

```ts
import { eq, ilike, and, desc, type SQL } from 'drizzle-orm';
// existing imports + listAllSpaces / getSpaceById / createSpace / updateSpace unchanged

export async function listPublishedSpaces(opts?: {
  city?: string;
}): Promise<Space[]> {
  const conditions: (SQL | undefined)[] = [eq(spacesTable.status, 'PUBLISHED')];
  if (opts?.city) {
    conditions.push(ilike(spacesTable.city, opts.city));
  }
  return db
    .select()
    .from(spacesTable)
    .where(and(...conditions))
    .orderBy(desc(spacesTable.createdAt));
}
```

> **Note for Amelia:** `and(...conditions)` accepts `SQL | undefined` and skips undefined clauses. If TS complains about the `SQL | undefined` array, simplify to:
> ```ts
> const where = opts?.city
>   ? and(eq(spacesTable.status, 'PUBLISHED'), ilike(spacesTable.city, opts.city))
>   : eq(spacesTable.status, 'PUBLISHED');
> return db.select().from(spacesTable).where(where).orderBy(desc(spacesTable.createdAt));
> ```

#### `src/app/page.tsx` (rewrite)

```tsx
import Link from 'next/link';
import { listPublishedSpaces } from '@/db/queries/spaces';
import { DataView, type DataViewStatus } from '@/components/data-view';
import type { Space } from '@/db/schema';

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ city?: string }>;
}) {
  const { city } = await searchParams;
  const cityFilter = city?.trim() ? city.trim() : undefined;

  let spaces: Space[] = [];
  let status: DataViewStatus = 'loaded';
  try {
    spaces = await listPublishedSpaces({ city: cityFilter });
    if (spaces.length === 0) status = 'empty';
  } catch {
    status = 'error';
  }

  return (
    <main className="mx-auto max-w-6xl p-8">
      <h1 className="mb-6 text-2xl font-semibold">Spaces</h1>

      <form action="/" method="GET" className="mb-6 flex items-end gap-2">
        <div className="flex-1">
          <label htmlFor="city" className="mb-1 block text-sm font-medium">
            Filter by city
          </label>
          <input
            id="city"
            name="city"
            type="text"
            defaultValue={cityFilter ?? ''}
            placeholder="e.g. Berlin"
            className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
          />
        </div>
        <button
          type="submit"
          className="rounded bg-gray-900 px-4 py-2 text-sm font-medium text-white"
        >
          Search
        </button>
        {cityFilter && (
          <Link
            href="/"
            className="self-end px-2 py-2 text-sm text-gray-700 hover:underline"
          >
            Clear filter
          </Link>
        )}
      </form>

      <DataView
        status={status}
        emptyMessage="No spaces available yet."
      >
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {spaces.map((s) => (
            <li
              key={s.id}
              className="overflow-hidden rounded border border-gray-200"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={s.primaryImageUrl}
                alt={s.name}
                className="aspect-video w-full object-cover"
              />
              <div className="p-3">
                <h2 className="font-semibold">{s.name}</h2>
                <p className="text-sm text-gray-600">{s.city}</p>
              </div>
            </li>
          ))}
        </ul>
      </DataView>
    </main>
  );
}
```

#### `src/app/api/spaces/route.ts` (NEW)

```ts
import { listPublishedSpaces } from '@/db/queries/spaces';
import { apiError } from '@/lib/http';
import { logger } from '@/lib/logger';

export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const cityRaw = url.searchParams.get('city')?.trim();
  const city = cityRaw && cityRaw.length > 0 ? cityRaw : undefined;

  try {
    const rows = await listPublishedSpaces({ city });
    return Response.json(rows, { status: 200 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error('list_spaces_route_failed', { error: msg });
    return apiError('INTERNAL_ERROR', 'Something went wrong', 500);
  }
}
```

### File-structure requirements

After this story:

```
deskhive/
├── src/
│   ├── app/
│   │   ├── page.tsx                         # UPDATED — REPLACES create-next-app welcome
│   │   └── api/
│   │       └── spaces/                      # NEW directory (US-3.1)
│   │           └── route.ts                 # NEW — GET /spaces
│   └── db/
│       └── queries/
│           └── spaces.ts                    # UPDATED — add listPublishedSpaces
└── tests/
    └── e2e/
        └── smoke.spec.ts                    # UPDATED — add 2 browse tests (or NEW browse.spec.ts)
```

Files NOT touched:
- `deskhive/src/app/layout.tsx` — root layout unchanged.
- `deskhive/src/components/header.tsx`, `logout-button.tsx` — header unchanged.
- `deskhive/src/proxy.ts` — `/spaces` and `/api/spaces` are public (not in the proxy matcher).
- `deskhive/src/lib/auth/*` — unchanged.
- `deskhive/src/lib/db-errors.ts` — not used here (no unique violations on read paths).
- All admin pages, admin actions, admin queries — unchanged.
- `deskhive/src/lib/validation/*` — no validation needed for the GET filter.
- All Epic 1 files; all Epic 2 files.

### Anti-patterns — explicit DO-NOTs

- ❌ Wrapping cards in `<Link href={\`/spaces/${s.id}\`}>`. That's US-3.2's job.
- ❌ Adding a `/spaces` static page or `/spaces/[id]` page. US-3.2.
- ❌ Adding Next.js `<Image>` with image-domain whitelist config. Phase 2.
- ❌ Adding a Zod schema for the city query param. Pure passthrough.
- ❌ Adding pagination, sort, multi-criteria filters. Phase 2.
- ❌ Adding client-side state for the filter. URL is the source of truth.
- ❌ Using `auth.api.getSession` in the page or REST handler. Public route.
- ❌ Querying `listAllSpaces` (the admin variant). Use `listPublishedSpaces` so SUSPENDED rows are filtered.
- ❌ Hardcoding `'http://localhost:3000/'`. Use `<Link href="/">`.
- ❌ Catching `redirect()` in try/catch. (No redirects in this story, but the rule still applies.)
- ❌ Modifying admin pages, admin queries, or `listAllSpaces`.
- ❌ Adding a `(public)/layout.tsx` route group layout. Header is global; no public-only chrome.

### Project structure notes

- `src/app/api/spaces/` is the first public REST directory under `/api/`. No proxy matcher needed (proxy only intercepts `/admin/*` and `/api/admin/*`).
- The DB error path on `/` uses `<DataView status="error">`'s default error message — no per-page customization. If users need richer error UI later, customize via `errorMessage` prop.
- Distinct query helpers per audience: `listAllSpaces` (admin, returns all statuses) vs `listPublishedSpaces` (public, PUBLISHED only). Pattern repeats for desks/bookings in future stories.

### Previous story intelligence

- **Epic 0** (`a32ff6e`, `1cb840b`, `22625f8`, `ce903a7`, `a015793`): scaffolding.
- **Epic 1** (`b7bd9fa`, `579071b`, `826bf32`, `1864bde`): auth + global header.
- **Epic 2** (`9f79cf1`, `3bd3906`, `4ea877b`, `12bee8b`, `571e8a0`): admin spaces + admin desks + isPgUniqueViolation helper.

**Patterns established (replicate, don't deviate):**
- Server Components fetch data directly via Drizzle; no client-side fetch.
- Use `<DataView>` for list-shaped pages.
- Async `params` and `searchParams` (Next 16).
- camelCase TS field names ↔ snake_case DB columns.
- One feature story → one `feat:` commit.

### Recent commits

```
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

US-3.1 is the eighth `feat:` commit. It opens Epic 3.

### References

- [Source: docs/02-phase1-prd.md#Section 8] — US-3.1 verbatim Gherkin.
- [Source: docs/02-phase1-prd.md#Section 4.3] — FR-D1, FR-D2.
- [Source: docs/02-phase1-prd.md#Section 6.1] — `spaces` table (status, primary_image_url).
- [Source: docs/02-phase1-prd.md#Section 6.4] — `GET /spaces?city=X` endpoint.
- [Source: docs/02-phase1-prd.md#Section 7.2] — `Landing / Browse Spaces` screen at `/`.
- [Source: docs/02-phase1-prd.md#Section 7.3] — required loading/empty/error/loaded states.
- [Source: _bmad-output/implementation-artifacts/2-4-edit-desk.md] — `is_active` filter cross-story dependency for US-3.2 (not US-3.1).
- [Source: deskhive/AGENTS.md] — Next.js 16 caveats (async `params`/`searchParams`).

## Dev Agent Record

### Agent Model Used

Claude Opus 4.7 (1M context) — invoked via `bmad-dev-story` skill on 2026-05-06 in speed mode.

### Debug Log References

| Step | Notable output |
|---|---|
| `pnpm typecheck` | Clean across all new + modified files |
| `pnpm lint` | Clean (the inline `eslint-disable-next-line @next/next/no-img-element` comment suppresses the expected `<img>` warning) |
| `pnpm test` | 81/81 pass + 1 skipped — no new unit tests (Server Component conditional render covered by E2E + DB-deferred happy-path) |
| `pnpm build` | 16 routes (added `/api/spaces`); `/` correctly marked dynamic (server-renders on demand because of `searchParams` + the global header's `headers()` call) |
| `pnpm test:e2e` | 18/18 pass in 12.0s — added 3 new browse tests (heading + filter form, REST 200 + array, filter form submits to `/?city=...`) |

### Completion Notes List

**Story executed end-to-end. Stop bar (`/` is now a real public landing page) achieved.** All 81 unit + 18 E2E tests pass. Browser-interactive verification on BA's plate.

**No mid-execution corrections.** The story's draft sketches matched 1:1 with what shipped.

**Key implementation observations:**

1. **Welcome page is gone for good.** `src/app/page.tsx` was 65 lines of create-next-app marketing chrome — replaced with the new spaces browse Server Component. The smoke test (`tests/e2e/smoke.spec.ts`) still passes because it asserts on the page title (`/DeskHive/`), which is a layout concern from US-1.3.

2. **Drizzle conditional `where` clause**: used the simpler ternary form sketched in the story's "Note for Amelia": `opts?.city ? and(eq(...), ilike(...)) : eq(...)`. Clean type-checks; no `SQL | undefined` array juggling.

3. **`<DataView>` four-state coverage:** loaded (cards rendered), empty (`"No spaces available yet."`), error (default error message). Loading state is N/A for Server Components — confirmed by reviewing `src/components/data-view.tsx`. The try/catch + status-variable pattern is the canonical shape going forward for read-pages with the `<DataView>`.

4. **Plain `<img>` works fine.** ESLint's `@next/next/no-img-element` warning was suppressed inline with a single comment. Build still completes cleanly. Designer / Phase 2 can swap to Next.js `<Image>` once the allowed-domains policy is decided (current Super Admin can enter URLs from any host).

5. **Public route confirmed.** `proxy.ts`'s matcher is `['/admin/:path*', '/api/admin/:path*']` — `/` and `/api/spaces` are not intercepted. Authenticated and unauthenticated users hit the same code path; the only difference is the global header's content (Log in / Register vs email + Admin + Log out).

6. **City filter is case-insensitive equality** via Drizzle's `ilike(spacesTable.city, opts.city)` (no wildcards). Works for `?city=Berlin`, `?city=berlin`, `?city=BERLIN`. Does NOT match prefix or substring (deliberately — Phase 1 simplicity per AC-5).

7. **`searchParams: Promise<{ city?: string }>`** verified working. Same Next 16 async pattern as `params` in dynamic-segment routes.

8. **`/` is now dynamic.** Build output marks all routes as `ƒ` (server-rendered on demand). Expected — the page reads `searchParams` AND the global header reads `headers()`. PPR (Partial Prerendering) is the optimization tool if static-where-possible matters in Phase 2.

**Browser-interactive verifications still on BA's plate (Task 6):**
- With ≥2 PUBLISHED spaces in the DB (created via US-2.1's admin form), open `/` → see header + heading + filter + cards (image / name / city).
- Type a real city → URL becomes `/?city=…` → only matching cards.
- Type a fake city → "No spaces available yet."
- "Clear filter" link returns to `/`.
- Direct visit `/?city=BERLIN` (uppercase) — same Berlin spaces matched.
- DevTools `/api/spaces` → 200 with JSON array; `/api/spaces?city=Berlin` → filtered array.
- Edge case (optional): `UPDATE spaces SET status='SUSPENDED' WHERE name='X'` via DB — disappears from `/`, still visible in admin list.

### File List

All paths relative to repo root.

**NEW (2 files):**
- `deskhive/src/app/api/spaces/route.ts` — first public REST endpoint (GET only)
- `deskhive/tests/e2e/browse.spec.ts` — 3 Playwright tests (heading + filter, REST 200, filter submission)

**UPDATED (2 files):**
- `deskhive/src/app/page.tsx` — REPLACED the create-next-app welcome page with the spaces browse Server Component (65 lines deleted, 80 added)
- `deskhive/src/db/queries/spaces.ts` — added `listPublishedSpaces({ city? })`; `listAllSpaces` (admin-facing) unchanged

**NOT TOUCHED (per story anti-patterns):**
- `deskhive/src/app/layout.tsx` — root layout unchanged
- `deskhive/src/components/header.tsx`, `logout-button.tsx` — header unchanged
- `deskhive/src/proxy.ts` — `/api/spaces` is public; matcher already excludes it
- `deskhive/src/lib/auth/*` — unchanged
- `deskhive/src/lib/db-errors.ts` — read paths don't have unique violations
- All admin pages, admin actions, admin queries
- All Epic 1 files
- All Epic 2 files (admin-side spaces/desks code)
- `deskhive/src/lib/validation/*` — no validation needed for the GET passthrough
- `deskhive/tests/e2e/smoke.spec.ts` — title test still passes; new tests live in `browse.spec.ts`

### Change Log

| Date | Change | Commit |
|---|---|---|
| 2026-05-06 | Story drafted by `bmad-create-story`. | (none) |
| 2026-05-06 | US-3.1 implemented; create-next-app welcome page replaced with public spaces browse + filter; first public REST endpoint live; all CI commands green. | `8d7bb48` |
