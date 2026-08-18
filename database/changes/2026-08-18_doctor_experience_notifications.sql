-- Doctor's years of experience, and a per-user notification on/off switch.
--
-- Both are self-service settings: experience_years is edited from the
-- doctor's own profile screen alongside specialization and qualification,
-- and notifications_enabled is a plain toggle on the Settings page. Neither
-- needed a table of its own -- one doctor has one experience figure, one
-- user has one on/off preference.
--
-- notifications_enabled is NOT NULL DEFAULT 1: every existing account keeps
-- notifications on, which is the behavior they already had before this
-- column existed.
--
-- Safe to apply to a database that has rows. Both are new columns; the
-- default backfills existing users and doctors without touching anything
-- else.
--
--   mysql -h 127.0.0.1 -u root -p ai < 2026-08-18_doctor_experience_notifications.sql

ALTER TABLE `doctors`
  ADD COLUMN `experience_years` int DEFAULT NULL AFTER `practice_name`;

ALTER TABLE `users`
  ADD COLUMN `notifications_enabled` tinyint(1) NOT NULL DEFAULT 1 AFTER `is_active`;
