-- Story 7-1: role infrastructure + mode switching (Phase 2 Epic 7).
-- Extends users.role CHECK to include SPACE_OWNER, adds nullable
-- spaces.owner_id with FK to users.id.
--
-- ── Rollback (reversibility per BA Decision §8) ──────────────────
-- ALTER TABLE "spaces" DROP CONSTRAINT "spaces_owner_id_users_id_fk";
-- ALTER TABLE "spaces" DROP COLUMN "owner_id";
-- ALTER TABLE "users" DROP CONSTRAINT "users_role_check";
-- ALTER TABLE "users" ADD CONSTRAINT "users_role_check"
--   CHECK ("users"."role" IN ('GUEST', 'SUPER_ADMIN'));
-- ──────────────────────────────────────────────────────────────────
-- Pre-rollback prerequisite: no users have role='SPACE_OWNER' AND no
-- spaces have non-NULL owner_id (otherwise the CHECK and DROP COLUMN
-- would fail). Run the cleanup UPDATEs first if Phase 2 data exists.
ALTER TABLE "users" DROP CONSTRAINT "users_role_check";--> statement-breakpoint
ALTER TABLE "spaces" ADD COLUMN "owner_id" uuid;--> statement-breakpoint
ALTER TABLE "spaces" ADD CONSTRAINT "spaces_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_role_check" CHECK ("users"."role" IN ('GUEST', 'SUPER_ADMIN', 'SPACE_OWNER'));