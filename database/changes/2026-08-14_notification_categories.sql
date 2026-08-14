-- Narrow notifications.category to the categories MediAssist AI actually
-- writes.
--
-- The hospital build could raise a notification about a nursing event, a
-- pharmacy request or a shift assignment. None of those exist here: there is
-- no ward, no counter and no rota, so those three enum values could never be
-- written again and only made the column lie about what it holds.
--
-- Safe to apply to a database that has rows. Removing a value an existing row
-- does not use changes nothing; MySQL reads back every remaining row exactly
-- as before. Any row that *did* hold one of the dropped values is rewritten to
-- 'system' first, below, so the ALTER cannot silently truncate it to ''.
--
--   mysql -h 127.0.0.1 -u root -p doctor < 2026-08-14_notification_categories.sql

UPDATE `notifications`
   SET `category` = 'system'
 WHERE `category` IN ('nursing', 'pharmacy', 'shift');

ALTER TABLE `notifications`
  MODIFY `category` ENUM(
    'appointment',
    'consultation',
    'report',
    'patient_assignment',
    'system'
  ) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'system';
