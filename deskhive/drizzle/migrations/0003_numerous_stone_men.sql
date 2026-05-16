-- Story 9-2: Stripe Connect Express onboarding + webhook idempotency log
-- (Phase 2 Epic 9). Adds two new tables per Phase 2 PRD §6.1:
--   • stripe_connect_accounts — one row per SPACE_OWNER who has begun
--     Stripe Connect onboarding. user_id is UNIQUE.
--   • webhook_events — idempotency log keyed on stripe_event_id (UNIQUE).
--     Story 9-2 inserts only for `account.updated`; Story 9-5 generalizes.
--
-- ── Rollback (reversibility per established convention) ──────────
-- DROP TABLE "webhook_events";
-- DROP TABLE "stripe_connect_accounts" CASCADE;
--
-- CASCADE on stripe_connect_accounts is harmless — no FK from any other
-- table points at it (and won't until Story 9-3+ extends bookings with
-- payment_intent_id, which doesn't reference this table directly).
-- ──────────────────────────────────────────────────────────────────
CREATE TABLE "stripe_connect_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"stripe_account_id" text NOT NULL,
	"onboarding_completed" boolean DEFAULT false NOT NULL,
	"charges_enabled" boolean DEFAULT false NOT NULL,
	"payouts_enabled" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "stripe_connect_accounts_user_id_unique" UNIQUE("user_id"),
	CONSTRAINT "stripe_connect_accounts_stripe_account_id_unique" UNIQUE("stripe_account_id")
);
--> statement-breakpoint
CREATE TABLE "webhook_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"stripe_event_id" text NOT NULL,
	"event_type" text NOT NULL,
	"payload" jsonb NOT NULL,
	"processed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "webhook_events_stripe_event_id_unique" UNIQUE("stripe_event_id")
);
--> statement-breakpoint
ALTER TABLE "stripe_connect_accounts" ADD CONSTRAINT "stripe_connect_accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;