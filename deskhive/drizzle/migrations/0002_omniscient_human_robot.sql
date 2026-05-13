-- Story 7-2: applications data model + Server Actions (Phase 2 Epic 7).
-- Adds the `applications` table for the Become-a-Space-Owner flow. Status
-- enum is TEXT + CHECK per the Phase 1 architectural decision (no pgEnum).
--
-- ── Rollback (reversibility per BA Decision §9) ──────────────────
-- DROP TABLE "applications" CASCADE;
--
-- The CASCADE is harmless here — no FK from any other table points at
-- applications (and won't in Phase 2). Safe to drop unconditionally.
-- ──────────────────────────────────────────────────────────────────
CREATE TABLE "applications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"business_name" text NOT NULL,
	"business_address" text NOT NULL,
	"tax_id" text NOT NULL,
	"motivation" text,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"rejection_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reviewed_at" timestamp with time zone,
	"reviewed_by_user_id" uuid,
	CONSTRAINT "applications_status_check" CHECK ("applications"."status" IN ('PENDING', 'APPROVED', 'REJECTED'))
);
--> statement-breakpoint
ALTER TABLE "applications" ADD CONSTRAINT "applications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "applications" ADD CONSTRAINT "applications_reviewed_by_user_id_users_id_fk" FOREIGN KEY ("reviewed_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "applications_user_id_idx" ON "applications" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "applications_status_idx" ON "applications" USING btree ("status");--> statement-breakpoint
CREATE INDEX "applications_created_at_idx" ON "applications" USING btree ("created_at" DESC NULLS LAST);