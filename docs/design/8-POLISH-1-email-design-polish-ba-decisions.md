# Story 8-POLISH-1: Email Design Polish — BA Decisions

**Story:** 8-POLISH-1
**Epic:** 8 — Email Infrastructure (Theme C)
**Phase:** 2
**Type:** Polish — visual wrapper refinement to shipped email templates
**Author:** Ikhtiyor Ziyayev, Business Analyst
**Date:** Thursday, May 14, 2026
**Status:** Locked, ready for dispatch
**Source:** Designer (Makhbuba Komilova) Phase 2 design package delivered May 14, file `screens/p2-11-email-template.html`

---

## Context

Stories 8-1, 8-2, and 8-3 shipped Epic 8 email infrastructure with a generic Phase 1-style inline-CSS base template (`renderBaseTemplate` in `src/lib/email-templates/base.ts` or equivalent). The base wrapper renders a centered 600px container with a "DeskHive" wordmark header, body content, a CTA button, and a `© 2026 DeskHive` footer.

On May 14, designer Makhbuba delivered her Phase 2 design package which includes `p2-11-email-template.html` — a single-page design spec showing:

- The shared email wrapper anatomy (header, body, CTA, footer)
- One fully-styled example (booking-confirmed template)
- Plain-text fallback structure
- Catalog of 13 transactional email types she expects Phase 2 to ship

Her design is a meaningful visual upgrade over the current generic wrapper. **Note: she designed this with the assumption Phase 2 would also ship payments (Theme B Epic 9) — her example email shows payment receipt content ("Your card was charged $27.60", "Paid to card ••4242"). That content is out of scope for 8-POLISH-1 because the payment data doesn't exist yet** (Story 8-4 + Theme B dependency).

**Scope rule for this story:** apply ONLY the visual wrapper improvements that work with the current shipped templates' data shapes. Defer payment-data-dependent additions (receipt table, payment confirmation text) to Story 8-4 when Theme B's data exists.

**Bob's diagnostic during dispatch is expected to surface 2-3 implementation choices around the hex logo rendering, font fallback chain, and the From-header display name. All locked in this doc — see Decisions §3, §4, §6.**

---

## Scope

**In scope (MEDIUM polish — Decision §1):**

- Update `renderBaseTemplate({ bodyHtml, previewText })` to apply Makhbuba's visual wrapper:
  - Hex-shaped logo mark + "DeskHive" wordmark in header (inline SVG, not CSS `clip-path` — Decision §3)
  - Refined CTA button styling (indigo `#4F46E5` background, 6px radius, 14px 24px padding, semibold white text — Decision §6)
  - Honest, simple one-line footer (Decision §7)
  - Adjusted body typography (Inter 15px / 24px line-height / `#3F3F46` foreground — Decision §5)
  - 600px max-width centered container with `#FAFAFA` gutter background (Decision §8)
- Change From-header display name from `onboarding@resend.dev` (raw) to `DeskHive <onboarding@resend.dev>` (branded) — Decision §4
- No changes to template body content (voice rules, copy, CTA labels, subjects all preserved)
- No changes to template data shapes (`{ guestName, spaceName, ... }`)
- No changes to `notify*` function signatures
- No changes to E2E test assertions (existing assertions remain valid)
- Unit tests update: snapshot regeneration for any test that snapshots the wrapper HTML
- New unit test: verify hex SVG renders correctly in baseTemplate output
- Memory file update: `reference_email_service_pattern.md` documenting the wrapper conventions

**Out of scope (deferred to polish backlog or 8-4):**

- **Receipt table layout** (Decision §2) — defer to 8-4 when payment data exists; Phase 2 booking emails don't currently include amount/payment-method/address fields in their data shapes
- **Plain-text fallback generation** (Decision §9) — meaningful work, doubles per-template maintenance; polish backlog
- **"Above-the-headline" tagline pattern** (e.g., "BOOKING CONFIRMED" small green caps above H1) — restructures every template body, out of MEDIUM scope; polish backlog
- **Email preferences / Help center / Terms footer links** — those pages don't exist in Phase 2; would be link-to-nothing scaffolding; polish backlog
- **Custom sender domain** (`notifications@deskhive.app`) — we don't own `deskhive.app`; Resend's domain verification is Phase 3 territory; Decision §4 keeps Resend sandbox
- **Inter Variable font from Google Fonts via `<link>`** — most email clients strip `<link>` tags; font stack with sensible fallback chain is the correct approach (Decision §5)
- **Identity verification email** (her template #13, "Identity needs re-verification") — not in Phase 2 PRD scope; potentially Epic 9 / Story 9-2 territory; defer
- Changes to `booking-confirmed-owner` / `booking-rejected-owner` / `booking-cancelled-owner` template content — these are the "self-action skip" / "admin-on-behalf" templates from 8-3 Decision §3; Makhbuba's catalog doesn't include them but they're correct as-shipped
- Plain-text body of any email
- Email accessibility audit (alt text, ARIA — defer to dedicated a11y polish story)
- A/B testing infrastructure
- Email tracking / open rates
- Resend domain verification
- New dependencies (no react-email, no MJML, no Handlebars — same as 8-1 Decision §5)
- New seed data
- Schema changes
- Modifying `EMAIL_TEMPLATES_DISABLED` kill switch behavior
- Modifying `EMAIL_TEST_RECORD_FILE` JSONL recording sink
- Modifying CLI test-send (`pnpm send-test-email`)

---

## Decisions

### Decision 1: MEDIUM polish scope — visual wrapper only

**Locked scope:** apply visual wrapper improvements to `renderBaseTemplate`; defer everything that depends on data Phase 2 doesn't yet produce.

**Rationale:** Makhbuba's design is a single-page spec showing the *target state* of Phase 2 emails. Some of her design assumes Phase 2 has shipped payments (Theme B Epic 9). Since Theme B hasn't shipped, applying her full design means either (a) fabricating payment data in the emails (dishonest), or (b) showing empty/placeholder receipt fields (worse than current). MEDIUM scope applies what works with current data and defers the rest.

**Anti-pattern explicitly forbidden:** do NOT add fabricated payment information ("Your card was charged $X.XX") in 8-3 templates as part of POLISH-1. Payment content is 8-4's territory.

### Decision 2: NO receipt table for now — defer to Story 8-4

Makhbuba's design includes a clean receipt-style table in the booking-confirmed email body:

```
Space          Northgate Studios
Desk           Desk 3 · Hot desk
Date           Thursday, May 14
Hours          8:00 AM – 8:00 PM
Address        1421 E Olive Way, Seattle, WA 98122
Paid to ••4242                                  $27.60
```

**Decision:** do NOT add this table in 8-POLISH-1. Reasons:

- "Hours" field doesn't exist in Phase 1 schema (full-day bookings only — Phase 1 PRD §11)
- "Paid to / amount" requires Stripe data (Theme B, not shipped)
- Address IS in the Phase 1 schema (`spaces.address`) but adding it alone makes a sparse 2-row table that doesn't justify its visual weight
- A receipt table that's 80% empty looks worse than no receipt table

**When Story 8-4 ships,** revisit this: add the receipt table to `booking-confirmed-guest` once payment-receipt data flows in. The table becomes the centerpiece, not an afterthought.

**For 8-POLISH-1:** keep current inline paragraph format ("your booking for **Desk 3** at **Northgate Studios** on **Thursday, May 14**"). Visual upgrade comes from typography + header + footer + CTA refinement only.

### Decision 3: Hex logo — inline SVG, not CSS clip-path

Makhbuba's HTML uses CSS `clip-path: polygon(...)` to render the hex shape:

```css
clip-path: polygon(25% 5%, 75% 5%, 100% 50%, 75% 95%, 25% 95%, 0% 50%);
```

**This works in browsers but is unreliable in email clients.** Gmail Web, Outlook Desktop, and most mobile email clients either strip or ignore `clip-path`.

**Decision:** render the hex as inline SVG:

```html
<svg width="22" height="22" viewBox="0 0 100 100"
     xmlns="http://www.w3.org/2000/svg"
     style="vertical-align: middle; display: inline-block;">
  <polygon points="25,5 75,5 100,50 75,95 25,95 0,50"
           fill="#4F46E5" />
</svg>
```

Properties:
- 22×22 px rendered size (matches her 14×14 spec, slightly larger for header presence)
- Same hex points she used (cosmetically identical)
- `#4F46E5` matches `--color-brand-600` from our existing `globals.css`
- Inline SVG works in all major email clients (Gmail, Outlook Web, Outlook Desktop 2019+, Apple Mail, Yahoo Mail)
- Falls back to nothing rendered in clients that strip SVG (rare; mostly only old Outlook 2003)

**Where to use it:**
- **Header** — left of "DeskHive" wordmark, with `8px` gap (Decision §6)
- **Footer** — same inline SVG, smaller (e.g., 14×14) before company footer line (Decision §7)

**Anti-pattern explicitly forbidden:** do NOT use CSS `clip-path`. Do NOT reference an external image asset (CDN URL) — keeps emails self-contained, no external dependencies.

### Decision 4: From-header — `DeskHive <onboarding@resend.dev>`

Makhbuba's design shows `From: DeskHive <notifications@deskhive.app>` as the sender. **We don't own `deskhive.app` domain.** Resend requires domain verification before allowing a custom sender; that's Phase 3 work.

**Decision:** keep `onboarding@resend.dev` infrastructure (8-1 Decision §3) but update the From-header to include a display name:

```
From: DeskHive <onboarding@resend.dev>
```

This means in `sendEmail` Resend SDK call:

```typescript
await resend.emails.send({
  from: 'DeskHive <onboarding@resend.dev>',  // ← was just 'onboarding@resend.dev'
  to: emailAddress,
  subject: ...,
  html: ...,
  text: ...,  // if Decision §9 ever activates
})
```

**Effect:**
- Recipient's inbox shows "DeskHive" as sender (matches design intent)
- Underlying email address remains real and delivers via Resend
- No domain verification needed
- When Phase 3 ships custom domain (`deskhive.app`), only the `from` string changes; everything else stays

**Anti-pattern explicitly forbidden:** do NOT change to `notifications@deskhive.app` without first verifying the domain in Resend. That would silently break email delivery (Resend rejects unverified sender domains).

### Decision 5: Typography — Inter with sensible fallback

Makhbuba's design uses Inter loaded from Google Fonts via `<link>`. **Email clients strip `<link>` tags** — Inter won't load in Gmail Web, Outlook Web, Outlook Desktop, or most mobile clients.

**Decision:** use Inter in the font stack as intent, fall back to system sans-serif:

```css
font-family: "Inter", "Inter Variable", -apple-system, BlinkMacSystemFont,
             "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
```

**Effect:**
- Clients that load Inter (Apple Mail with Inter installed, web-based clients that render `<style>` blocks) → Inter
- Most other clients → falls to system sans-serif (San Francisco on macOS/iOS, Segoe UI on Windows, Roboto on Android, Arial elsewhere)
- All fallbacks are sensible — no client renders Times New Roman as final fallback

**Body typography specifications:**
- Font size: **15px** (Makhbuba's spec)
- Line height: **24px** (1.6 ratio — Makhbuba's spec)
- Foreground color: **#3F3F46** (zinc-700, matches `--color-neutral-700`)
- Font weight: 400 (regular) for body, 600 (semibold) for emphasis

**Headings inside email (if templates have them — none currently do):**
- H1: 24px / 32px line-height / 600 weight / `#18181B`
- H2: 18px / 28px line-height / 600 weight / `#27272A`

**Anti-pattern explicitly forbidden:**
- Do NOT add `<link rel="stylesheet" href="https://fonts.googleapis.com/...">` to base template — most email clients strip it, the rest cache headers cause CSP issues
- Do NOT load fonts via `@import` for the same reason
- Do NOT use only "Inter" without fallback chain

### Decision 6: CTA button — locked styling

Makhbuba's spec:
- Background: `#4F46E5`
- Text: white
- Border-radius: 6px
- Display: inline-block

**Locked CTA inline styles** (must be inline, NOT class-based — email clients strip `<style>` blocks more often than they strip inline):

```html
<a href="{{ctaUrl}}" style="
  display: inline-block;
  background-color: #4F46E5;
  color: #FFFFFF;
  text-decoration: none;
  padding: 14px 24px;
  border-radius: 6px;
  font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
  font-size: 15px;
  font-weight: 600;
  line-height: 1;
  mso-padding-alt: 0;
  letter-spacing: 0.005em;
">{{ctaLabel}}</a>
```

**Why these specific values:**
- `padding: 14px 24px` — larger than Makhbuba's preview (her preview shows tight padding for the swatch demo only); a real CTA button needs comfortable click target
- `mso-padding-alt: 0` — Outlook 2007-2019 padding fix
- `letter-spacing: 0.005em` — matches caption letter-spacing from `globals.css` for consistency

**Container around CTA** — wrap in `<div style="margin: 24px 0; text-align: left;">` (left-aligned, NOT centered — consistent with body left-alignment).

**Anti-pattern explicitly forbidden:**
- Do NOT use `class="cta"` and a `<style>` block — Outlook Desktop frequently strips `<style>`
- Do NOT center the CTA — left-aligns with body text (Makhbuba's design shows left-aligned)
- Do NOT add `transition`, `:hover` pseudo-class, or any motion — most email clients don't render them

### Decision 7: Footer — honest one-liner, no link-to-nothing

Makhbuba's footer:
- Hex logo + "DeskHive · 218 W Hastings, Vancouver BC"
- "You're receiving this because you have a booking on DeskHive."
- Links: Email preferences · Help center · Terms

**Problem with applying as-is:**
- We don't have a Vancouver address (or any registered business address yet)
- `/email-preferences` page doesn't exist (Phase 3 feature)
- `/help` page doesn't exist
- `/terms` page doesn't exist

**Linking to non-existent pages is dishonest.** Don't do it.

**Locked footer structure:**

```html
<footer style="
  border-top: 1px solid #E4E4E7;
  padding: 24px 32px;
  text-align: left;
  font-family: [font stack];
  font-size: 13px;
  line-height: 20px;
  color: #71717A;
">
  <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
    [Hex SVG, 14x14, inline]
    <span style="font-weight: 500; color: #3F3F46;">DeskHive</span>
  </div>
  <p style="margin: 0;">
    This email was sent because you have an active account on DeskHive.
    If you didn't expect this, you can safely ignore it.
  </p>
</footer>
```

**Why this exact copy:**
- "This email was sent because you have an active account on DeskHive" — explains why they received it (light CAN-SPAM compliance even without unsubscribe link)
- "you can safely ignore it" — gives recipient an out without promising functionality we don't have
- NO unsubscribe link, NO preference link, NO Help/Terms links — those pages don't exist
- NO physical address — we don't have one to give

**When Phase 3 ships email preferences:** revise footer to include unsubscribe link. Polish backlog: `footer-add-unsubscribe-once-preferences-page-exists.md`.

**Anti-pattern explicitly forbidden:**
- Do NOT link to `/email-preferences`, `/help`, `/terms` — they don't exist
- Do NOT include a fake physical address
- Do NOT add a "DeskHive · 218 W Hastings, Vancouver BC" line — that's Makhbuba's placeholder

### Decision 8: Container layout

Makhbuba's spec:
- 600px max-width, centered
- `#FAFAFA` background gutter (the area around the email card)
- White card with the email content inside

**Locked structure:**

```html
<body style="margin: 0; padding: 0; background-color: #FAFAFA;
             font-family: [font stack]; color: #3F3F46;">
  <table role="presentation" cellpadding="0" cellspacing="0" width="100%"
         style="background-color: #FAFAFA;">
    <tr>
      <td align="center" style="padding: 32px 16px;">

        <table role="presentation" cellpadding="0" cellspacing="0" width="600"
               style="max-width: 600px; background-color: #FFFFFF;
                      border: 1px solid #E4E4E7; border-radius: 12px;
                      overflow: hidden;">

          <!-- Header row -->
          <tr><td style="padding: 24px 32px; border-bottom: 1px solid #E4E4E7;">
            [Hex SVG + DeskHive wordmark — Decision §3/§6]
          </td></tr>

          <!-- Body row -->
          <tr><td style="padding: 32px;">
            {{bodyHtml}}
          </td></tr>

          <!-- Footer row — Decision §7 -->
          <tr><td>
            [Footer content]
          </td></tr>

        </table>

      </td>
    </tr>
  </table>
</body>
```

**Why table-based layout:**
- `<table>` is the most-compatible email layout primitive — Outlook 2007-2019 still rely on tables for any complex layout
- Flexbox/Grid don't work in Outlook Desktop
- `role="presentation"` keeps screen readers from announcing as data table
- Inline styles only — no `<style>` block dependency

**Why 12px border-radius on the card:**
- Matches `--radius-xl` from `globals.css`
- Modern, calm — matches Linear/Stripe aesthetic from Phase 1 design brief
- Outlook Desktop 2007-2019 ignore border-radius (renders square corners — acceptable degradation)

**Why `#FAFAFA` page background:**
- Matches `--color-neutral-50` from `globals.css`
- Gives the white card visual lift without harsh contrast
- Matches Makhbuba's design

### Decision 9: NO plain-text fallback in this story

Makhbuba's design includes a plain-text version of every email. This is good email practice (some clients render text by default; some users prefer it; deliverability filters favor having both).

**Decision:** do NOT add plain-text fallback in 8-POLISH-1. Add to polish backlog.

**Rationale:**
- Generating plain-text from HTML is non-trivial (need to strip tags, preserve line breaks, format receipt-style content)
- Maintaining two versions of each of 11 templates (8-1/8-2/8-3 templates) doubles per-template maintenance cost
- Resend supports `text` parameter but it's optional; if omitted, Resend will accept HTML-only emails
- 99% of email clients DO render HTML (text-only clients are extreme edge cases)
- Not a deliverability requirement at our volume

**When to add:** if deliverability becomes a real concern (spam folder issues, enterprise clients), or if Phase 3 adds an email-preferences UI where users can opt for plain-text.

**Polish backlog entry:** `email-add-plain-text-fallback.md`

### Decision 10: Voice rules unchanged

8-2 and 8-3 locked transactional voice rules (no exclamation, no emoji, "Thanks," sign-off, "The DeskHive team"). Regex unit tests enforce these per-template.

**8-POLISH-1 changes the wrapper, not the body.** Voice rules remain intact. Existing regex unit tests continue to pass without modification.

**Anti-pattern explicitly forbidden:**
- Do NOT loosen voice rules
- Do NOT add exclamation/emoji in the new footer copy
- Do NOT change template body copy locked in 8-2 / 8-3

### Decision 11: Subject lines unchanged

Threading rules from 8-2 / 8-3 remain in force:

- Application emails: separate subjects per template (received/approved/rejected with intentional collision per 8-2 Decision §5)
- Booking emails: guest-side subjects thread (`[DeskHive] Your booking at {{spaceName}}`); owner-side subjects thread (`[DeskHive] Booking on {{spaceName}} — {{bookingDate}}`)

**8-POLISH-1 does NOT touch subjects.** No subject changes in this story.

### Decision 12: E2E and unit test impact

**E2E tests (53 currently):**
- All existing E2E assertions continue to work (they assert template-was-recorded, recipient correctness, no-internal-notes leak, etc. — none assert wrapper visual content)
- **NO new E2E tests needed** in this story

**Unit tests (305 currently):**
- Existing tests that snapshot the rendered HTML output of `renderBaseTemplate` need snapshots regenerated. Amelia: run `pnpm test -u` for affected snapshots after wrapper change
- Existing tests asserting body content (e.g., "renders guestName") continue to work — body content unchanged
- Existing voice-rule regex tests continue to work — body copy unchanged
- **3 new unit tests:**
  1. `renderBaseTemplate` output contains inline SVG hex logo (assert presence of `<svg>` with hex `<polygon>`)
  2. `renderBaseTemplate` output contains the new footer copy (assert "active account on DeskHive" phrase)
  3. `renderBaseTemplate` output does NOT contain Phase 1 generic `© 2026 DeskHive` footer (regression guard)

**Target unit test count after this story:** ~308 (305 baseline + 3 new).
**Target E2E test count after this story:** 53 (unchanged).

### Decision 13: Memory file update

Extend `reference_email_service_pattern.md` with:

- The hex SVG inline rendering convention (Decision §3)
- The Resend From-header display-name pattern (Decision §4)
- The "no link-to-nothing footer" principle (Decision §7) — when adding new links, verify destination pages exist
- The table-based layout primitive choice (Decision §8) — for any future Phase 3 email work
- Notes on font fallback chain (Decision §5)
- Notes on which design patterns from Makhbuba's spec were DEFERRED and why (receipt table, plain-text fallback, tagline pattern, unsubscribe links)

### Decision 14: Files likely touched

Estimate, not directive.

- `src/lib/email-templates/base.ts` (or wherever `renderBaseTemplate` lives) — main wrapper rewrite
- `src/lib/email.ts` — `from` field in Resend SDK call updated to include display name
- `src/lib/email-templates/base.test.ts` — 3 new unit tests, snapshot regeneration
- Any per-template snapshot files (if tests use snapshots)
- Memory file `reference_email_service_pattern.md`

**No changes to:**
- Individual template files (`application-received.ts`, `booking-confirmed-guest.ts`, etc.) — their body content is unchanged
- `EMAIL_TEMPLATES_DISABLED` kill switch
- `EMAIL_TEST_RECORD_FILE` JSONL recording
- CLI test-send script
- E2E test specs
- Any Server Action
- Schema or seed
- `globals.css` (already at desired state)

---

## Architectural anti-patterns forbidden

- **Do NOT** use CSS `clip-path` for the hex logo — use inline SVG (Decision §3)
- **Do NOT** load Inter via `<link>` or `@import` — keep font fallback chain only (Decision §5)
- **Do NOT** change sender to `notifications@deskhive.app` without domain verification (Decision §4)
- **Do NOT** add receipt table content that depends on payment data (Decision §2)
- **Do NOT** link to `/email-preferences`, `/help`, `/terms` in footer (Decision §7)
- **Do NOT** fabricate physical company address in footer (Decision §7)
- **Do NOT** add plain-text fallback in this story (Decision §9)
- **Do NOT** modify body copy of any template (Decision §10)
- **Do NOT** modify subject lines (Decision §11)
- **Do NOT** modify template data shapes (`TemplateData<T>` types stay the same)
- **Do NOT** modify `notify*` function signatures
- **Do NOT** add new dependencies (no react-email, no MJML)
- **Do NOT** use class-based CSS for CTA — inline only (Decision §6)
- **Do NOT** center the CTA button — left-aligns with body (Decision §6)
- **Do NOT** add hover/transition/animation CSS — email clients don't render reliably
- **Do NOT** add an unsubscribe link (no unsubscribe infrastructure exists)
- **Do NOT** add tagline pattern ("BOOKING CONFIRMED" caps above H1) — restructures template bodies
- **Do NOT** modify `EMAIL_TEMPLATES_DISABLED` or `EMAIL_TEST_RECORD_FILE` mechanics
- **Do NOT** add a `from` env var separate from Resend — keep hardcoded with display name (Decision §4)
- **Do NOT** introduce a logo asset file in `public/` — inline SVG keeps emails self-contained

---

## Browser verification checklist

After Amelia completes the dev story:

### Setup

- Dev server running on `localhost:3000`
- `RESEND_API_KEY` set in `.env.local`
- `TEST_EMAIL_RECIPIENT` set to BA's real email
- `EMAIL_TEST_RECORD_FILE` left **unset** for real delivery
- Re-run `pnpm db:seed` if needed (no schema changes; reseed not strictly required)
- Multiple email clients open for testing (Gmail Web, optionally Outlook Web, Apple Mail)

### Checks

1. **All unit tests pass** — `pnpm test` runs clean. Target ~308 (was 305, +3 new).

2. **All E2E tests pass** — `pnpm test:e2e` runs clean. Target 53 (unchanged).

3. **Typecheck + lint clean**.

4. **Build 36 routes unchanged**.

5. **`git diff --stat`** shows zero entries under `src/app/`, `drizzle/`, `scripts/seed.ts`. Only base template, email.ts From-header, unit tests, snapshot files (if any), memory file.

6. **CLI test-send** — `pnpm send-test-email` works. Email arrives in BA's inbox.

7. **Visual checks on test-send email:**
   - From: shows "DeskHive" (display name from Decision §4)
   - Header: indigo hex logo SVG + "DeskHive" wordmark
   - Body: Inter (or fallback) at 15px, line-height 24px
   - CTA button: indigo `#4F46E5`, 6px radius, white text, 14px 24px padding, left-aligned
   - Footer: hex SVG + "DeskHive" + the locked footer copy ("active account on DeskHive...")
   - No "© 2026 DeskHive" generic footer (the old one)
   - No emoji, no exclamation marks
   - No Vancouver address
   - No Email preferences / Help / Terms links

8. **Flow A — Guest creates a booking on owner's space.** Receive booking-requested-guest email. Inspect: same wrapper structure as test-send. Body copy is 8-3's locked copy ("We've received your booking request..."). Threading subject `[DeskHive] Your booking at Seeded Owner Coworks`.

9. **Flow B — Owner confirms.** Receive booking-confirmed-guest. Same wrapper, threaded subject, locked body.

10. **Flow C — Application emails regression.** Submit a `/become-a-host` application. Receive `application-received`. Wrapper has new design, body content unchanged.

11. **Cross-client rendering checks:**
    - Open the test-send email in **Gmail Web** — hex SVG renders, table layout intact, CTA button styled correctly
    - Open in **Apple Mail** (if available) — same checks
    - Open in **Outlook Web** (if accessible) — table layout intact, CTA button styled (border-radius may appear square — acceptable per Decision §8), SVG hex renders

12. **Snapshot tests** — `pnpm test -u` regenerates affected snapshots cleanly; no semantic regressions on review

13. **Email failure does NOT break user flow** — set `RESEND_API_KEY=invalid`, restart, try Flow A. Booking creation succeeds, toast appears, DB row exists. Console logs email failure. (8-1 regression preserved.)

14. **Kill switch works** — set `EMAIL_TEMPLATES_DISABLED=booking-confirmed-guest`, restart, try confirming a booking. The email does NOT fire. (8-1 regression preserved.)

15. **No console errors during all flows**

16. **Regression — All 11 shipped templates** look consistent after the wrapper change. Send one of each via real flows; spot-check that each renders correctly with the new wrapper. (Templates from 8-2: application-received/approved/rejected. Templates from 8-3: 8 booking templates.)

17. **`EMAIL_TEST_RECORD_FILE`** sink still works — set the env var, trigger Flow A, verify JSONL row appears with the new wrapper HTML in the body.

---

## Files likely touched

(Same as Decision §14, re-listed for emphasis:)

- `src/lib/email-templates/base.ts` — main wrapper rewrite
- `src/lib/email.ts` — `from` field display name update
- `src/lib/email-templates/base.test.ts` — 3 new unit tests
- Any snapshot files (`__snapshots__/`) — regenerated with `pnpm test -u`
- Memory file `reference_email_service_pattern.md` — extended notes

---

## CI baseline target after this story

Current baseline (end of 8-3):
- Unit tests: 305
- E2E tests: 53
- Build routes: 36

After Story 8-POLISH-1:
- Unit tests: **~308** (+3 new from Decision §12)
- E2E tests: **53** (unchanged)
- Build routes: 36 (unchanged)

---

## Memory note for Phase 2 continuation

This story:

- Closes the visible "Makhbuba designed an email wrapper; we shipped generic" gap from 8-1/8-2/8-3
- Establishes the precedent for "apply designer work to shipped surfaces" polish stories
- Defers ALL design content that depends on data we haven't shipped yet (receipt table → 8-4)
- Locks the "no link-to-nothing footer" principle (Decision §7) — useful guidance for any future email or marketing surface

**After 8-POLISH-1 ships:**
- Epic 8 visual identity is complete for current code paths
- 8-4 (payment emails) inherits the new wrapper automatically when it eventually ships
- The receipt-table design is then naturally added to 8-4 templates where payment data flows
- **Next dispatch should be Story 9-1** (Stripe SDK wrapper) — Theme B kickoff

**Per-surface design polish for already-shipped web surfaces** (p2-01 / p2-02 / p2-03 / p2-04 / p2-05 / p2-06 / p2-12) is logged in the polish backlog at `docs/phase2-design-polish-backlog.md` (to be created during dev-story) — ships opportunistically between Epic 9 stories or as a dedicated 9-POLISH-1 story later.

**Designer follow-up needed (not blocking 8-POLISH-1):**
- Reply to Makhbuba in Russian acknowledging her design was received, what's being applied (this story), what's deferred to 8-4 (receipt table), and what's logged in polish backlog (per-surface refinements). Draft message in chat history from prior session.

---

**End of BA decisions document.**
