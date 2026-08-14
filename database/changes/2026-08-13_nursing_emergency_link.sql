-- Links a nursing assignment back to the emergency case it came out of.
--
-- An emergency patient never gets a Consultation (see the EmergencyCase model
-- docstring), so `consultation_id` is always NULL for them and the nurse's
-- record had no way to say the patient came in through the emergency door,
-- what they came in with, or that the medicines on the schedule are emergency
-- orders rather than a routine post-op course. NULL still means "not an
-- emergency admission".
--
-- The live `hospital` database on 2026-08-13 already carried this column, its
-- index and its foreign key -- it was `database/schema.sql` that had drifted
-- (that dump predates the emergency module and has no `emergency_cases` table
-- at all). The DDL below is therefore guarded: it is a no-op there, and
-- brings up any database that does not have it yet. The backfill re-runs
-- safely either way.

-- -- column ------------------------------------------------------------------
SET @ddl := (
  SELECT IF(
    COUNT(*) > 0,
    'SELECT ''nursing_assignments.emergency_case_id already present''',
    'ALTER TABLE `nursing_assignments`
       ADD COLUMN `emergency_case_id` int DEFAULT NULL AFTER `consultation_id`'
  )
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'nursing_assignments'
    AND COLUMN_NAME = 'emergency_case_id'
);
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- -- index -------------------------------------------------------------------
SET @ddl := (
  SELECT IF(
    COUNT(*) > 0,
    'SELECT ''idx_nursing_assignments_emergency already present''',
    'ALTER TABLE `nursing_assignments`
       ADD KEY `idx_nursing_assignments_emergency` (`emergency_case_id`)'
  )
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'nursing_assignments'
    AND INDEX_NAME = 'idx_nursing_assignments_emergency'
);
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- -- foreign key -------------------------------------------------------------
SET @ddl := (
  SELECT IF(
    COUNT(*) > 0,
    'SELECT ''emergency_case_id foreign key already present''',
    'ALTER TABLE `nursing_assignments`
       ADD CONSTRAINT `nursing_assignments_ibfk_5`
       FOREIGN KEY (`emergency_case_id`) REFERENCES `emergency_cases` (`id`)'
  )
  FROM information_schema.KEY_COLUMN_USAGE
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'nursing_assignments'
    AND COLUMN_NAME = 'emergency_case_id'
    AND REFERENCED_TABLE_NAME = 'emergency_cases'
);
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- -- care_type enum ----------------------------------------------------------
-- `icu` has been in the model's CARE_TYPES since the emergency hand-off was
-- added (AssignNurseModal offers it, and EmergencyCaseDetail defaults to it
-- for an ICU decision). Present on the live column already; stated here so a
-- database rebuilt from the tracked dump, whose enum stops at `recovery`,
-- does not fail the first ICU hand-off with a 1265.
ALTER TABLE `nursing_assignments`
  MODIFY COLUMN `care_type`
    enum('observation','post_surgery','post_procedure','recovery','icu')
    COLLATE utf8mb4_unicode_ci NOT NULL;

-- -- backfill ----------------------------------------------------------------
-- The assignments already created off an emergency case: the most recent
-- non-cancelled case for that patient that had already arrived when the nurse
-- was assigned. Restricted to assignments with no consultation, which is the
-- only shape the emergency hand-off produces -- a post-consultation
-- assignment is a normal admission even if the patient was in casualty last
-- month.
UPDATE `nursing_assignments` a
JOIN `emergency_cases` e
  ON e.`patient_id` = a.`patient_id`
 AND e.`status` <> 'cancelled'
 AND e.`arrived_at` <= a.`starts_at`
SET a.`emergency_case_id` = e.`id`
WHERE a.`consultation_id` IS NULL
  AND a.`emergency_case_id` IS NULL
  AND e.`id` = (
    SELECT MAX(e2.`id`)
    FROM `emergency_cases` e2
    WHERE e2.`patient_id` = a.`patient_id`
      AND e2.`status` <> 'cancelled'
      AND e2.`arrived_at` <= a.`starts_at`
  );
