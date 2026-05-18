-- Story 9-6: Guest Cancellation with Refund — schema migration.
--
-- Locked at: docs/design/9-6-cancellation-with-refund-ba-decisions.md
-- (commit f4766f7, BA Ikhtiyor Ziyayev, 2026-05-19).
--
-- Two NULL-able columns and a CHECK constraint extension:
--
--   1. `refunded_at timestamp with time zone` — populated by the
--      mark*Refunded query helpers atomically with payment_status
--      transition to 'REFUNDED'. NULL for Phase 1 rows + non-refunded
--      Phase 2 rows.
--   2. `refund_amount_cents integer` — Phase 2 ships full-refund-only
--      (equals booking.total_cents at refund time). Phase 3 may support
--      partial refunds where this column diverges. NULL until refunded.
--   3. CHECK constraint `bookings_payment_status_check` extends from
--      4 values (AWAITING_PAYMENT, AUTHORIZED, CAPTURED, VOIDED — locked
--      in 0006_cold_rictor.sql by Story 9-4) to 5 values, adding
--      'REFUNDED'. Same DROP/ADD pattern as 0004_fine_ronan.sql (spaces.
--      status DRAFT addition by 9-2b), 0005_soft_wither.sql (initial
--      payment_status constraint by 9-3), and 0006_cold_rictor.sql
--      (CAPTURED + VOIDED additions by 9-4).
--
-- State-machine transitions enabled:
--   (CONFIRMED, CAPTURED) → (CANCELLED, REFUNDED)
--     — when Guest cancels their own CONFIRMED + CAPTURED booking 24+
--       hours before booking_date in UTC (refund eligible per FR-REFUND-1).
--       The transition is atomic: status flips to CANCELLED AND payment_status
--       flips to REFUNDED AND refunded_at = NOW() AND refund_amount_cents
--       = booking.total_cents, all in a single UPDATE.
--
-- Rollback hint:
--   ALTER TABLE bookings DROP CONSTRAINT bookings_payment_status_check;
--   ALTER TABLE bookings ADD CONSTRAINT bookings_payment_status_check
--     CHECK (payment_status IN ('AWAITING_PAYMENT', 'AUTHORIZED', 'CAPTURED', 'VOIDED'));
--   ALTER TABLE bookings DROP COLUMN refund_amount_cents;
--   ALTER TABLE bookings DROP COLUMN refunded_at;
-- Safe IFF no rows are currently in payment_status='REFUNDED' state at
-- rollback time. Run a SELECT count(*) FROM bookings WHERE
-- payment_status = 'REFUNDED' first.
--
-- No data migrations: the two new columns default to NULL; existing
-- rows continue to satisfy the extended CHECK constraint unchanged.

ALTER TABLE "bookings" DROP CONSTRAINT "bookings_payment_status_check";--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "refunded_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "refund_amount_cents" integer;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_payment_status_check" CHECK ("bookings"."payment_status" IN ('AWAITING_PAYMENT', 'AUTHORIZED', 'CAPTURED', 'VOIDED', 'REFUNDED'));
