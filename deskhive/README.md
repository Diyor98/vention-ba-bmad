This is the DeskHive Phase 1 MVP — a Next.js 16 application bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app) and extended with the data, auth, and primitive layers per the project architecture document at `../_bmad-output/planning-artifacts/architecture.md`.

## Getting Started

```bash
pnpm install
cp .env.example .env.local
# edit .env.local with real values (see "Database setup" below)
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

## Database setup

DeskHive uses **PostgreSQL 16** via [Drizzle ORM](https://orm.drizzle.team).

Local development is currently scaffolded against [Neon](https://neon.tech) free serverless Postgres (Docker is intentionally not used — see project memory for rationale). Setup:

1. Create a free Neon project at https://neon.tech and copy the connection string.
2. Paste it as `DATABASE_URL` in `.env.local` (which is gitignored).
3. Generate a 32-byte secret for `BETTER_AUTH_SECRET`:
   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```
4. Apply the schema and seed the Super Admin (deferred until US-1.1's prep step):
   ```bash
   pnpm db:migrate
   pnpm db:seed
   ```

### Seeded accounts

After running `pnpm db:seed`, the following test accounts are created:

- **Super Admin** — `admin@deskhive.local` / `SuperAdmin1!`
- **Space Owner** — `owner@deskhive.local` / `SpaceOwner1!` (Story 7-1, Phase 2 Epic 7)
- **Plain Guest** — `guest@deskhive.local` / `GuestPass1!` (Story 7-PREP-1; no application — for E2E State A coverage on `/become-a-host`)

Story 7-4 additionally seeds **4 applicant Guests** with applications across all statuses, for verifying the admin review flow at `/admin/applications`:

- `applicant1@deskhive.local` / `Applicant1!` — PENDING application (Bergstrom Coworks)
- `applicant2@deskhive.local` / `Applicant2!` — PENDING application (Mission Annex)
- `applicant3@deskhive.local` / `Applicant3!` — APPROVED application (Sundial Coworks; user is promoted to SPACE_OWNER atomically during seed)
- `applicant4@deskhive.local` / `Applicant4!` — REJECTED application (Folk House, with rejection reason)

Story 7-5 additionally seeds **one space + 3 desks + 2-3 bookings** owned by `owner@deskhive.local` so the `/owner/*` surfaces have real verification data:

- Space: `Seeded Owner Coworks` in Tashkent (auto-published per Phase 2 Decision §4)
- Desks: 3 active desks ($25 / $35 / $40 per day)
- Bookings: one PENDING (applicant1, 7 days out), one CONFIRMED (applicant2, 14 days out), one REJECTED (applicant4, 7 days past)

Use `owner@deskhive.local` for "owner with data" verification; use any newly-approved applicant for "owner without data" (empty-state) verification.

These credentials are for development only. Rotate before any deployment.

## Scripts

| Script | Purpose |
|---|---|
| `pnpm dev` | Start the Next.js dev server (Turbopack) |
| `pnpm build` | Production build |
| `pnpm start` | Start the production server |
| `pnpm lint` | Run ESLint |
| `pnpm typecheck` | Run TypeScript type-checking (no emit) |
| `pnpm test` | Run Vitest unit and integration tests |
| `pnpm test:watch` | Vitest watch mode |
| `pnpm db:generate` | Generate a Drizzle migration from the schema |
| `pnpm db:migrate` | Apply pending Drizzle migrations |
| `pnpm db:push` | Dev-only: push schema directly without migration |
| `pnpm db:seed` | Seed the Super Admin + Space Owner test users |

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
