-- Adds the `patient_assignment` notification category.
--
-- Registering a patient (ADD OP) notifies the assigned doctor with
-- category='patient_assignment' -- see patient_routes.create_patient. The
-- value was added to the model's enum but never to the live column, so MySQL
-- rejected the INSERT with 1265 "Data truncated for column 'category'". That
-- INSERT is inside the same transaction as the patient and the OP, so the
-- whole registration rolled back: the front desk saw "Could not create this
-- OP" and no patient, no appointment and no notification were written.
--
-- Additive only -- every existing value keeps its position, so no stored row
-- is reinterpreted. NOT NULL DEFAULT 'system' and the collation are restated
-- because MySQL's MODIFY COLUMN replaces the whole definition.
ALTER TABLE `notifications`
  MODIFY COLUMN `category` enum(
    'appointment',
    'consultation',
    'report',
    'nursing',
    'patient_assignment',
    'pharmacy',
    'shift',
    'system'
  ) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'system';
