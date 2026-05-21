# Stripe Environment Setup

Step-by-step guide for populating the Stripe block in `.env.example`
(lines 54–104). All Phase 2 work runs against Stripe **test mode** —
`src/lib/stripe.ts` hard-throws at module load if you point it at a
live key while `NODE_ENV !== 'production'`.

## Prerequisites

1. A Stripe account — sign up at https://dashboard.stripe.com/register
   (free; no card required for test mode).
2. The Stripe CLI for local webhook forwarding:
   ```bash
   brew install stripe/stripe-cli/stripe
   stripe login   # opens browser, links CLI to your account
   ```
3. Your local `.env.local` (copy from `.env.example` if you haven't):
   ```bash
   cp .env.example .env.local
   ```

> **Always toggle the dashboard to "Test mode"** (top-right switch)
> before copying any key. Test keys are prefixed `sk_test_` /
> `pk_test_` / `whsec_` — live keys (`sk_live_`, `pk_live_`) will
> trip the guard in `src/lib/stripe.ts`.

---

## 1. `STRIPE_SECRET_KEY`

Server-side authentication. Used by every server action and webhook
handler that talks to Stripe.

**How to get it**

1. Dashboard → **Developers** → **API keys**
   (https://dashboard.stripe.com/test/apikeys).
2. Confirm "Test mode" is on.
3. Under **Standard keys**, copy the **Secret key** (`sk_test_...`).
   Click **Reveal test key** if hidden.
4. Paste into `.env.local`:
   ```
   STRIPE_SECRET_KEY=sk_test_51Abc...
   ```

**Validation rules** (enforced by `src/lib/stripe.ts`):
- `sk_test_*` → allowed in any environment
- `sk_live_*` → allowed **only** when `NODE_ENV=production`
- anything else → throws at module load (dev server won't start)

---

## 2. `STRIPE_PUBLISHABLE_KEY`

Client-side (browser) key. Safe to expose. Used by Stripe.js when the
booking-with-payment UI initializes.

**How to get it**

1. Same page as above: Dashboard → **Developers** → **API keys**.
2. Copy the **Publishable key** (`pk_test_...`).
3. Paste into `.env.local`:
   ```
   STRIPE_PUBLISHABLE_KEY=pk_test_51Abc...
   ```

Must start with `pk_test_*` outside production.

---

## 3. `STRIPE_WEBHOOK_SECRET`

Verifies that webhook payloads delivered to
`POST /api/stripe/webhook` actually came from Stripe (HMAC signature
over the raw body).

### Local development

Run the Stripe CLI in a dedicated terminal — leave it running for
the whole dev session:

```bash
stripe listen --forward-to localhost:3000/api/stripe/webhook
```

First line of output:
```
> Ready! Your webhook signing secret is whsec_abc123...  (^C to quit)
```

Copy that `whsec_...` value into `.env.local`:
```
STRIPE_WEBHOOK_SECRET=whsec_abc123...
```

Restart `pnpm dev` so the new value is picked up.

> The signing secret printed by `stripe listen` is **specific to that
> CLI session and your machine** — it is not the same as the
> dashboard endpoint secret. Re-running `stripe listen` may print a
> new one; if webhooks start failing with `signature verification
> failed`, that's the first thing to check.

To trigger an event without actually checking out:
```bash
stripe trigger checkout.session.completed
```

### Production (Railway / etc.)

1. Deploy the app; note its public URL (e.g.
   `https://deskhive.up.railway.app`).
2. Dashboard → **Developers** → **Webhooks** → **Add endpoint**.
3. Endpoint URL: `https://<your-domain>/api/stripe/webhook`.
4. Events to send — at minimum (Story 9-2):
   - `checkout.session.completed`
   - `checkout.session.async_payment_succeeded`
   - `checkout.session.async_payment_failed`
   (Story 9-5 will broaden this list.)
5. After creating, click the endpoint → **Signing secret** →
   **Reveal**. Copy `whsec_...` and set it on the deployment env
   (Railway → Variables).

---

## 4. `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`

**Same value as `STRIPE_PUBLISHABLE_KEY`**, just re-exported under
the `NEXT_PUBLIC_*` prefix so Next.js inlines it into the client
bundle. Required by `<BookingCheckoutEmbed>` (Stripe Embedded
Checkout, DESIGN-INT-CHECKOUT-EMBED Phase 2).

```
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_51Abc...
```

Keep the two values in sync — if you rotate the publishable key in
Stripe, update both lines.

> `NEXT_PUBLIC_*` vars are read at **build time**. After changing
> this in production you must redeploy; in dev just restart
> `pnpm dev`.

---

## 5. `NEXT_PUBLIC_CHECKOUT_EMBED_ENABLED`

Feature flag that switches `/spaces/[id]` between two checkout paths:

| Value | Behavior |
| --- | --- |
| `false` (or unset) | Legacy hosted-Checkout redirect (Story 9-3). |
| `true` | Inline `<BookingCheckoutEmbed>` via `createBookingWithPaymentEmbeddedAction`. |

Phase 2 default is `false`. Flip to `true` only when you want to
exercise the embedded flow locally:
```
NEXT_PUBLIC_CHECKOUT_EMBED_ENABLED=true
```

Phase 3 flips the default to `true`; Phase 4 removes the flag
entirely.

---

## Verifying the setup

After all five values are set:

1. **Module-load validation** — start the dev server:
   ```bash
   pnpm dev
   ```
   If a key is malformed, `src/lib/stripe.ts` throws immediately
   with a message naming the offending var.

2. **Connectivity ping** — round-trip a request to Stripe's API:
   ```bash
   pnpm tsx scripts/stripe-ping.ts
   ```

3. **Webhook signature** — with `stripe listen` running, fire:
   ```bash
   stripe trigger checkout.session.completed
   ```
   The dev server should log a `200` from
   `POST /api/stripe/webhook` (not `400 signature verification
   failed`).

## Test cards

Use Stripe's test card numbers in test mode — real cards are
rejected. Most-used:

| Card | Result |
| --- | --- |
| `4242 4242 4242 4242` | Success |
| `4000 0000 0000 9995` | Decline (insufficient funds) |
| `4000 0027 6000 3184` | Requires 3DS authentication |

Any future expiry date and any 3-digit CVC. Full list:
https://stripe.com/docs/testing#cards

## Troubleshooting

- **`STRIPE_SECRET_KEY is not configured`** at startup — variable is
  empty or missing from `.env.local`. Restart `pnpm dev` after
  adding it.
- **`signature verification failed`** in the webhook route — the
  `STRIPE_WEBHOOK_SECRET` doesn't match the secret the request was
  signed with. Re-copy the value from your active `stripe listen`
  session (or from the dashboard endpoint for production).
- **`live key in non-production environment`** — you copied
  `sk_live_*`. Toggle the dashboard back to test mode and copy the
  `sk_test_*` key.
- **Embedded checkout not loading** — confirm both
  `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` is set **and**
  `NEXT_PUBLIC_CHECKOUT_EMBED_ENABLED=true`, then restart the dev
  server (NEXT_PUBLIC_* are baked in at build).
