-- Record which PA created a doctor.
--
-- The practice's doctor used to arrive at boot, seeded from a name in the
-- repository. It no longer does: there is no default doctor, and the PA
-- creates one through "Add doctor" using the details the doctor gives them
-- (see `portal/routes/doctor_routes.create_doctor`). That makes "who set this
-- account up?" a real question with a real answer, and this column holds it.
--
-- ON DELETE SET NULL, not CASCADE. The PA's account and the doctor's are
-- separate people: removing the PA must not take the doctor with them, and the
-- consultations, prescriptions and reports hanging off that doctor with it.
-- The link going null is the correct outcome -- the doctor still exists, the
-- person who created them no longer has an account.
--
-- NULL for any doctor already on file, which is accurate: nobody created them
-- through this flow.
--
-- Safe to apply to a database that has rows. Adding a nullable column rewrites
-- no existing value.
--
--   mysql -h 127.0.0.1 -u root -p doctor < 2026-08-14_doctors_created_by.sql

ALTER TABLE `doctors`
  ADD COLUMN `created_by_user_id` int DEFAULT NULL AFTER `practice_name`,
  ADD CONSTRAINT `doctors_created_by_fk`
    FOREIGN KEY (`created_by_user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL;
