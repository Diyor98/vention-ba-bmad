# syntax=docker/dockerfile:1.7

# ─── deps ─────────────────────────────────────────────────────────────────
# Install all (incl. dev) dependencies. Native deps (argon2) need build tools.
FROM node:20-bookworm-slim AS deps
WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ ca-certificates \
  && rm -rf /var/lib/apt/lists/*

RUN corepack enable && corepack prepare pnpm@10.10.0 --activate

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile


# ─── builder ──────────────────────────────────────────────────────────────
# Run `next build`. Pulls in node_modules from deps. NEXT_PUBLIC_* values are
# inlined here, so they must be present (use safe placeholders if unknown).
FROM node:20-bookworm-slim AS builder
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@10.10.0 --activate

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Build-time env. STRIPE_SECRET_KEY is read at module load by src/lib/stripe.ts
# (hard-throws on missing/invalid). A dummy sk_test_ value is safe — no Stripe
# API call happens at build, only format validation.
ARG NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_placeholder
ARG NEXT_PUBLIC_CHECKOUT_EMBED_ENABLED=false
ENV NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=$NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY \
    NEXT_PUBLIC_CHECKOUT_EMBED_ENABLED=$NEXT_PUBLIC_CHECKOUT_EMBED_ENABLED \
    STRIPE_SECRET_KEY=sk_test_build_placeholder_not_used_at_runtime \
    NEXT_TELEMETRY_DISABLED=1

RUN pnpm build


# ─── runner ───────────────────────────────────────────────────────────────
# Minimal runtime image. Uses Next.js standalone output, which ships only the
# files needed to run the server (much smaller than copying node_modules).
FROM node:20-bookworm-slim AS runner
WORKDIR /app

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates wget \
  && rm -rf /var/lib/apt/lists/* \
  && groupadd --system --gid 1001 nodejs \
  && useradd --system --uid 1001 --gid nodejs nextjs

COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/ >/dev/null 2>&1 || exit 1

CMD ["node", "server.js"]
