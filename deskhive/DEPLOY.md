# Deploying DeskHive to Railway

The app ships as a Docker image (multi-stage build using Next.js standalone
output). Railway is the primary target — it picks up the `Dockerfile` in
the repo root automatically. Any other OCI host (Fly.io, Render, Cloud Run,
ECS, plain VM) works the same way; see [§9 Other hosts](#9-other-hosts) for
brief notes.

This guide is written for the **Railway web dashboard**
(<https://railway.app/dashboard>). CLI alternatives are shown inline for
each step but are optional — you can ship the whole deploy from the
dashboard.

1. [Prerequisites](#1-prerequisites)
2. [Create the Railway project](#2-create-the-railway-project)
3. [Provision Postgres](#3-provision-postgres)
4. [Set environment variables](#4-set-environment-variables)
5. [Apply database migrations](#5-apply-database-migrations)
6. [Deploy and assign a domain](#6-deploy-and-assign-a-domain)
7. [Wire up the Stripe webhook](#7-wire-up-the-stripe-webhook)
8. [Smoke-test the deploy](#8-smoke-test-the-deploy)
9. [Updating the deploy](#9-updating-the-deploy)
10. [Other hosts](#10-other-hosts)

---

## 1. Prerequisites

| What | Why |
|---|---|
| [Railway account](https://railway.app) | Hosting target |
| GitHub repo containing this code | Railway deploys from a connected GitHub repo (the dashboard flow) |
| Stripe account | Payments — `sk_test_*` / `pk_test_*` keys + a webhook signing secret. See `STRIPE_SETUP.md` |
| Resend account (optional for first deploy) | Transactional email |
| Docker 20.10+ (optional) | Local image smoke-test before pushing |

## 2. Create the Railway project

In the dashboard:

1. **New Project** → **Deploy from GitHub repo**.
2. Authorize Railway to access the repo if it's the first time.
3. Pick this repository. Railway detects the `Dockerfile` at the root and
   uses it (no nixpacks fallback needed).
4. Railway starts the first build immediately. It will fail until you set
   env vars in §4 — that's expected; the module-load Stripe check trips
   before HTTP starts.

> **CLI alternative:** `railway login` → `railway init` (link to a new
> project) or `railway link` (link to an existing one).

## 3. Provision Postgres

In the dashboard:

1. Inside the project, click **+ New** → **Database** → **Add PostgreSQL**.
2. Wait for it to provision (~30s).
3. Open the Postgres service → **Variables** tab → copy `DATABASE_URL`.
4. Switch to the **app** service → **Variables** tab → paste it as
   `DATABASE_URL` (or use Railway's reference syntax:
   `${{Postgres.DATABASE_URL}}` so it auto-updates if the DB rotates
   credentials).

> Alternative: use external Postgres (Neon, Supabase, RDS). Just paste
> its connection string as `DATABASE_URL`. Make sure it includes
> `?sslmode=require` for managed providers.

> **CLI alternative:** `railway add --plugin postgresql`.

## 4. Set environment variables

`.env.production` (gitignored) is pre-filled with safe placeholders for
everything that doesn't block boot. You only need to fill in the
`[MUST SET]` lines:

- `DATABASE_URL` — from §3
- `BETTER_AUTH_SECRET` — generate with:
  ```bash
  node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
  ```
- `BETTER_AUTH_URL` — set in §6 once you have the Railway domain
- `STRIPE_SECRET_KEY` — your real `sk_test_*` from Stripe dashboard
  (test mode)

**Dashboard flow** — paste all values at once:

1. App service → **Variables** tab → click **Raw Editor**.
2. Paste the contents of your filled-in `.env.production`. Railway
   parses `KEY=VALUE` lines, ignores `#` comments and blank lines.
3. Save. Railway triggers a redeploy automatically.

> **CLI alternative:**
> `railway variables set --from-file .env.production`

Two things to know about how envs are consumed:

- **`NEXT_PUBLIC_*` vars are inlined at build time.** They live inside
  the compiled JS bundle. Changing them requires a Railway redeploy —
  you cannot just restart the container with a new value.
- **`STRIPE_SECRET_KEY` is validated at module load.** `src/lib/stripe.ts`
  throws if it is missing or has the wrong prefix, and refuses
  `sk_live_*` unless `NODE_ENV=production`. The Dockerfile passes a
  placeholder during build so this check passes; the real key must be
  set at run time.

Already pre-set as placeholders in `.env.production` — safe to defer:

- `STRIPE_WEBHOOK_SECRET` — webhook calls fail signature check until set
  (see §7).
- `STRIPE_PUBLISHABLE_KEY` / `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` —
  checkout UI fails when first exercised. Set before users book.
- `RESEND_API_KEY` — emails log an error and skip; the app keeps
  working.

## 5. Apply database migrations

Drizzle migrations live in `drizzle/migrations/`. Run them once against
the target database before the first deploy (and on every deploy that
adds new migrations). **The container does not auto-migrate** — that's
intentional, so a bad migration cannot take down the fleet on rollout.

**Dashboard flow:** open the Postgres service → **Data** tab → copy the
public connection string (or use the Railway proxy URL). Then from your
laptop:

```bash
DATABASE_URL='postgres://…copied-from-dashboard…' pnpm db:migrate
```

> **CLI alternative:** `railway run pnpm db:migrate` — pulls the linked
> service's env vars into your shell so you don't have to copy-paste the
> connection string.

> Seeding (`pnpm db:seed`) is **only** for staging — it inserts dev
> accounts with hard-coded passwords. Never run it against production.

## 6. Deploy and assign a domain

If you set the env vars in §4, Railway has already redeployed and the
build should now succeed. Check the **Deployments** tab — the latest
deployment should be **Success** (green).

Assign a public URL:

1. App service → **Settings** tab → **Networking** section →
   **Generate Domain**. Railway creates a `*.up.railway.app` URL.
2. (Optional) **Custom Domain** → add your own, follow the CNAME
   instructions.
3. Copy the assigned URL.
4. Back to **Variables** tab → set
   `BETTER_AUTH_URL=https://<your-app>.up.railway.app`. Railway
   redeploys automatically.

The image runs `node server.js` listening on `$PORT` (Railway injects
`PORT=3000`), as a non-root user (`nextjs:nodejs`, uid 1001), with a
built-in healthcheck on `GET /`.

> **CLI alternative:** `railway up` (manual deploy) and `railway domain`
> (generate domain).

### Local pre-flight (optional but recommended)

Before connecting Railway, smoke-test the image locally:

```bash
docker build -t deskhive:local .
docker run --rm -p 3000:3000 --env-file .env.production deskhive:local
# Open http://localhost:3000 in a browser
```

For a production build with the real publishable key baked into the
bundle (only matters if you flip `NEXT_PUBLIC_CHECKOUT_EMBED_ENABLED` to
`true`):

```bash
docker build \
  --build-arg NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_... \
  --build-arg NEXT_PUBLIC_CHECKOUT_EMBED_ENABLED=true \
  -t deskhive:prod .
```

## 7. Wire up the Stripe webhook

`src/app/api/stripe/webhook/route.ts` verifies signatures against
`STRIPE_WEBHOOK_SECRET`. In the Stripe dashboard (test mode for staging,
live mode for prod):

1. Developers → Webhooks → **Add endpoint**.
2. URL: `https://<your-railway-domain>/api/stripe/webhook`.
3. Listen to events used by the app (at minimum):
   - `checkout.session.completed`
   - `payment_intent.succeeded`
   - `payment_intent.payment_failed`
   - `account.updated` (Connect onboarding)
   - `payout.paid` / `payout.failed`
   - `charge.refunded`
4. Copy the signing secret (`whsec_*`).
5. Back in the Railway dashboard → app service → **Variables** tab →
   update `STRIPE_WEBHOOK_SECRET=whsec_...`. Railway redeploys.

For local dev against `pnpm dev`:

```bash
stripe listen --forward-to localhost:3000/api/stripe/webhook
```

See `STRIPE_SETUP.md` for the full Stripe walkthrough (test cards,
signature troubleshooting, etc.).

## 8. Smoke-test the deploy

```bash
URL=https://<your-railway-domain>
curl -I $URL/                       # 200, HTML
curl -I $URL/login                  # 200
curl -I $URL/api/auth/session       # 200 with set-cookie or 401
```

Then in a browser:

- Register a new user → email verification arrives via Resend (skip if
  `RESEND_API_KEY` is still a placeholder).
- `/become-a-host` → submit an application; an admin can approve from
  `/admin/applications`.
- As an owner, create a space and a desk.
- As a guest, book the desk and complete checkout with Stripe test card
  `4242 4242 4242 4242`.
- In the Stripe dashboard, confirm the webhook event delivered without
  signature errors.

Tail logs in the Railway dashboard → app service → **Deployments** →
click the active deployment → **Logs** tab. (CLI: `railway logs`.)

## 9. Updating the deploy

| Change | What to do |
|---|---|
| Code only | Push to the connected GitHub branch — Railway auto-deploys. (Or click **Deploy** in the dashboard to redeploy the current commit.) |
| Server env var (e.g. `STRIPE_WEBHOOK_SECRET`) | Update in the **Variables** tab — Railway auto-redeploys |
| `NEXT_PUBLIC_*` (e.g. publishable key, embed flag) | Update the var, then trigger a **Redeploy** — the value must be re-baked into the image |
| New DB migration | Run `pnpm db:migrate` against the production DB *before* the new image rolls out |

## 10. Other hosts

The Dockerfile is portable. Quick notes for other targets:

**Fly.io:**

```bash
fly launch --dockerfile Dockerfile --no-deploy
fly secrets set DATABASE_URL=... BETTER_AUTH_SECRET=... ...
fly deploy
```

**Cloud Run / ECS / generic Docker host:** push the image to a registry,
then deploy with the env vars from §4. The container needs egress to your
Postgres, Stripe API, and Resend API.

**Multi-arch image** (needed when building on Apple Silicon for
`linux/amd64` hosts — Railway builders are amd64 so this is unnecessary
for Railway):

```bash
docker buildx build --platform linux/amd64,linux/arm64 \
  -t registry.example.com/deskhive:prod --push .
```

## Notes & caveats

- **Image base.** The Dockerfile uses `node:20-bookworm-slim`. Rebuild
  regularly so security patches in the base image are picked up — the
  IDE flags ~22 high CVEs that ride along with whatever the current
  Debian point release ships. A fresh Railway deploy picks up the latest
  base automatically.
- **NEXT_PUBLIC envs are immutable per image.** If you change a
  publishable key or a public feature flag, redeploy — restarting the
  container will not pick up the new value.
- **No auto-migrate on boot.** That is intentional: a bad migration would
  take the whole fleet down on rollout. Run migrations as a one-shot
  step before swapping traffic to the new image.
- **Don't commit `.env.production`.** `.gitignore` covers `.env*`
  already; store secrets in Railway's Variables tab (or your host's
  secret manager), not the repo.
