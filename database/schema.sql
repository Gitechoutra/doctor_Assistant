-- MediAssist AI — reference schema
--
-- GENERATED FILE. Do not hand-edit. This is a readable snapshot of the schema
-- the application builds, for anyone who wants to see its whole shape at once.
--
-- Regenerate after a schema change:
--
--   cd backend && python -c "from portal import create_app; \
--     from portal.extensions import db; app=create_app(); \
--     app.app_context().push(); db.create_all()"
--   mysqldump -h 127.0.0.1 -u root -p --no-data --skip-comments \
--     --skip-add-drop-table --compact doctor > ../database/schema.sql
--   (then re-add this header)
--
-- 19 tables. The hospital version of this application had 36: the emergency
-- board, the nursing record, the pharmacy counter with its branches and stock
-- batches, the laboratory, the shift rota, staff management and the department
-- directory are all gone, along with the surgical pathway that existed only to
-- open a nurse hand-off. What is left is what a doctor's private practice
-- actually keeps: two accounts, its patients, its appointment book, its
-- consultations and what they produced.
--
-- Tables are emitted in alphabetical order, so a foreign key can name a table
-- that appears further down. FOREIGN_KEY_CHECKS is therefore off while the
-- tables are created and back on at the end — the constraints themselves are
-- all still created, and are enforced from the moment the file finishes.

CREATE DATABASE IF NOT EXISTS doctor
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

USE doctor;

SET FOREIGN_KEY_CHECKS = 0;

CREATE TABLE `appointments` (
  `id` int NOT NULL AUTO_INCREMENT,
  `patient_id` int NOT NULL,
  `doctor_id` int DEFAULT NULL,
  `consultation_id` int DEFAULT NULL,
  `status` enum('scheduled','waiting','in_progress','completed','cancelled') COLLATE utf8mb4_unicode_ci NOT NULL,
  `scheduled_at` datetime DEFAULT NULL,
  `arrived_at` datetime DEFAULT NULL,
  `reason` text COLLATE utf8mb4_unicode_ci,
  `cancelled_reason` text COLLATE utf8mb4_unicode_ci,
  `notes` text COLLATE utf8mb4_unicode_ci,
  `created_at` timestamp NULL DEFAULT (now()),
  PRIMARY KEY (`id`),
  KEY `patient_id` (`patient_id`),
  KEY `doctor_id` (`doctor_id`),
  KEY `consultation_id` (`consultation_id`),
  CONSTRAINT `appointments_ibfk_1` FOREIGN KEY (`patient_id`) REFERENCES `patients` (`id`),
  CONSTRAINT `appointments_ibfk_2` FOREIGN KEY (`doctor_id`) REFERENCES `doctors` (`id`),
  CONSTRAINT `appointments_ibfk_3` FOREIGN KEY (`consultation_id`) REFERENCES `consultations` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE `audit_logs` (
  `id` int NOT NULL AUTO_INCREMENT,
  `user_id` int DEFAULT NULL,
  `action` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `entity` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `entity_id` int DEFAULT NULL,
  `actor_role` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `detail` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT (now()),
  PRIMARY KEY (`id`),
  KEY `idx_audit_user_created` (`user_id`,`created_at`),
  KEY `idx_audit_entity` (`entity`,`entity_id`,`created_at`),
  CONSTRAINT `audit_logs_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE `case_prescriptions` (
  `id` int NOT NULL AUTO_INCREMENT,
  `case_id` int NOT NULL,
  `medicine_id` int DEFAULT NULL,
  `brand_id` int DEFAULT NULL,
  `medicine_name` varchar(150) COLLATE utf8mb4_unicode_ci NOT NULL,
  `dose` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `frequency` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `duration` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `quantity` varchar(80) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `route` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `instructions` text COLLATE utf8mb4_unicode_ci,
  `notes` text COLLATE utf8mb4_unicode_ci,
  `is_custom` tinyint(1) NOT NULL,
  `source_session_number` int DEFAULT NULL,
  `note` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT (now()),
  PRIMARY KEY (`id`),
  KEY `case_id` (`case_id`),
  KEY `medicine_id` (`medicine_id`),
  KEY `brand_id` (`brand_id`),
  CONSTRAINT `case_prescriptions_ibfk_1` FOREIGN KEY (`case_id`) REFERENCES `patient_cases` (`id`),
  CONSTRAINT `case_prescriptions_ibfk_2` FOREIGN KEY (`medicine_id`) REFERENCES `medicines` (`id`),
  CONSTRAINT `case_prescriptions_ibfk_3` FOREIGN KEY (`brand_id`) REFERENCES `medicine_brands` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE `clinical_precedents` (
  `id` int NOT NULL AUTO_INCREMENT,
  `source_consultation_id` int NOT NULL,
  `doctor_id` int NOT NULL,
  `symptoms` text COLLATE utf8mb4_unicode_ci,
  `diagnosis` text COLLATE utf8mb4_unicode_ci,
  `medicines` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `age_band` varchar(16) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `gender` varchar(10) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `embedding` blob,
  `embedding_model` varchar(80) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `embedding_text` text COLLATE utf8mb4_unicode_ci,
  `times_suggested` int NOT NULL,
  `times_accepted` int NOT NULL,
  `approved_at` datetime DEFAULT NULL,
  `retired_at` datetime DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT (now()),
  `updated_at` timestamp NULL DEFAULT (now()),
  PRIMARY KEY (`id`),
  UNIQUE KEY `source_consultation_id` (`source_consultation_id`),
  KEY `doctor_id` (`doctor_id`),
  KEY `ix_clinical_precedents_retired_at` (`retired_at`),
  CONSTRAINT `clinical_precedents_ibfk_1` FOREIGN KEY (`source_consultation_id`) REFERENCES `consultations` (`id`),
  CONSTRAINT `clinical_precedents_ibfk_2` FOREIGN KEY (`doctor_id`) REFERENCES `doctors` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE `consultation_summaries` (
  `id` int NOT NULL AUTO_INCREMENT,
  `consultation_id` int NOT NULL,
  `summary` text COLLATE utf8mb4_unicode_ci,
  `symptoms` text COLLATE utf8mb4_unicode_ci,
  `possible_diagnosis` text COLLATE utf8mb4_unicode_ci,
  `follow_up_advice` text COLLATE utf8mb4_unicode_ci,
  `lifestyle_advice` text COLLATE utf8mb4_unicode_ci,
  `labeled_transcript` text COLLATE utf8mb4_unicode_ci,
  `matched_precedents` text COLLATE utf8mb4_unicode_ci,
  `created_at` timestamp NULL DEFAULT (now()),
  PRIMARY KEY (`id`),
  UNIQUE KEY `consultation_id` (`consultation_id`),
  CONSTRAINT `consultation_summaries_ibfk_1` FOREIGN KEY (`consultation_id`) REFERENCES `consultations` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE `consultations` (
  `id` int NOT NULL AUTO_INCREMENT,
  `doctor_id` int NOT NULL,
  `patient_id` int NOT NULL,
  `case_id` int DEFAULT NULL,
  `session_number` int DEFAULT NULL,
  `status` enum('scheduled','in_progress','completed') COLLATE utf8mb4_unicode_ci NOT NULL,
  `started_at` datetime DEFAULT NULL,
  `ended_at` datetime DEFAULT NULL,
  `prescription_verified_at` datetime DEFAULT NULL,
  `prescription_verified_by` int DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT (now()),
  PRIMARY KEY (`id`),
  KEY `doctor_id` (`doctor_id`),
  KEY `patient_id` (`patient_id`),
  KEY `case_id` (`case_id`),
  KEY `prescription_verified_by` (`prescription_verified_by`),
  CONSTRAINT `consultations_ibfk_1` FOREIGN KEY (`doctor_id`) REFERENCES `doctors` (`id`),
  CONSTRAINT `consultations_ibfk_2` FOREIGN KEY (`patient_id`) REFERENCES `patients` (`id`),
  CONSTRAINT `consultations_ibfk_3` FOREIGN KEY (`case_id`) REFERENCES `patient_cases` (`id`),
  CONSTRAINT `consultations_ibfk_4` FOREIGN KEY (`prescription_verified_by`) REFERENCES `users` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE `conversation_messages` (
  `id` int NOT NULL AUTO_INCREMENT,
  `consultation_id` int NOT NULL,
  `speaker` enum('doctor','patient','unknown') COLLATE utf8mb4_unicode_ci NOT NULL,
  `message` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `speaker_turns` text COLLATE utf8mb4_unicode_ci,
  `created_at` timestamp NULL DEFAULT (now()),
  PRIMARY KEY (`id`),
  KEY `consultation_id` (`consultation_id`),
  CONSTRAINT `conversation_messages_ibfk_1` FOREIGN KEY (`consultation_id`) REFERENCES `consultations` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE `custom_medicine_requests` (
  `id` int NOT NULL AUTO_INCREMENT,
  `normalized_name` varchar(150) COLLATE utf8mb4_unicode_ci NOT NULL,
  `medicine_name` varchar(150) COLLATE utf8mb4_unicode_ci NOT NULL,
  `strength` varchar(80) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `route` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `dose` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `frequency` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `instructions` text COLLATE utf8mb4_unicode_ci,
  `notes` text COLLATE utf8mb4_unicode_ci,
  `times_prescribed` int NOT NULL,
  `first_requested_at` datetime DEFAULT NULL,
  `last_requested_at` datetime DEFAULT NULL,
  `requested_by_doctor_id` int DEFAULT NULL,
  `status` enum('pending','added','dismissed') COLLATE utf8mb4_unicode_ci NOT NULL,
  `reviewed_by` int DEFAULT NULL,
  `reviewed_at` datetime DEFAULT NULL,
  `review_note` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_brand_id` int DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT (now()),
  PRIMARY KEY (`id`),
  UNIQUE KEY `normalized_name` (`normalized_name`),
  KEY `requested_by_doctor_id` (`requested_by_doctor_id`),
  KEY `reviewed_by` (`reviewed_by`),
  KEY `created_brand_id` (`created_brand_id`),
  KEY `ix_custom_medicine_requests_status` (`status`),
  CONSTRAINT `custom_medicine_requests_ibfk_1` FOREIGN KEY (`requested_by_doctor_id`) REFERENCES `doctors` (`id`),
  CONSTRAINT `custom_medicine_requests_ibfk_2` FOREIGN KEY (`reviewed_by`) REFERENCES `users` (`id`),
  CONSTRAINT `custom_medicine_requests_ibfk_3` FOREIGN KEY (`created_brand_id`) REFERENCES `medicine_brands` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE `doctors` (
  `id` int NOT NULL AUTO_INCREMENT,
  `user_id` int NOT NULL,
  `specialization` varchar(150) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `registration_no` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `qualification` varchar(200) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `practice_name` varchar(200) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `experience_years` int DEFAULT NULL,
  `created_by_user_id` int DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT (now()),
  PRIMARY KEY (`id`),
  UNIQUE KEY `user_id` (`user_id`),
  KEY `doctors_created_by_fk` (`created_by_user_id`),
  CONSTRAINT `doctors_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `doctors_created_by_fk` FOREIGN KEY (`created_by_user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE `generated_prescriptions` (
  `id` int NOT NULL AUTO_INCREMENT,
  `consultation_id` int NOT NULL,
  `medicine_id` int DEFAULT NULL,
  `brand_id` int DEFAULT NULL,
  `medicine_name` varchar(150) COLLATE utf8mb4_unicode_ci NOT NULL,
  `dose` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `frequency` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `duration` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `quantity` varchar(80) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `route` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `is_custom` tinyint(1) NOT NULL,
  `instructions` text COLLATE utf8mb4_unicode_ci,
  `notes` text COLLATE utf8mb4_unicode_ci,
  `source_precedent_id` int DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT (now()),
  PRIMARY KEY (`id`),
  KEY `consultation_id` (`consultation_id`),
  KEY `medicine_id` (`medicine_id`),
  KEY `brand_id` (`brand_id`),
  KEY `source_precedent_id` (`source_precedent_id`),
  CONSTRAINT `generated_prescriptions_ibfk_1` FOREIGN KEY (`consultation_id`) REFERENCES `consultations` (`id`),
  CONSTRAINT `generated_prescriptions_ibfk_2` FOREIGN KEY (`medicine_id`) REFERENCES `medicines` (`id`),
  CONSTRAINT `generated_prescriptions_ibfk_3` FOREIGN KEY (`brand_id`) REFERENCES `medicine_brands` (`id`),
  CONSTRAINT `generated_prescriptions_ibfk_4` FOREIGN KEY (`source_precedent_id`) REFERENCES `clinical_precedents` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE `medicine_brands` (
  `id` int NOT NULL AUTO_INCREMENT,
  `brand_name` varchar(150) COLLATE utf8mb4_unicode_ci NOT NULL,
  `generic_name` varchar(150) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `used_for` text COLLATE utf8mb4_unicode_ci,
  `category` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `manufacturer` varchar(150) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `form` enum('tablet','capsule','syrup','injection','iv_fluid','ointment','drops','inhaler','sachet','other') COLLATE utf8mb4_unicode_ci NOT NULL,
  `strength` varchar(80) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `usage_instructions` text COLLATE utf8mb4_unicode_ci,
  `unit_price` decimal(10,2) DEFAULT NULL,
  `added_by_doctor` tinyint(1) NOT NULL,
  `medicine_id` int DEFAULT NULL,
  `is_active` tinyint(1) NOT NULL,
  `created_at` timestamp NULL DEFAULT (now()),
  `updated_at` timestamp NULL DEFAULT (now()),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_brand_strength` (`brand_name`,`strength`),
  KEY `medicine_id` (`medicine_id`),
  KEY `idx_brand_name` (`brand_name`),
  CONSTRAINT `medicine_brands_ibfk_1` FOREIGN KEY (`medicine_id`) REFERENCES `medicines` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=43 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE `medicines` (
  `id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(150) COLLATE utf8mb4_unicode_ci NOT NULL,
  `category` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `default_dose` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `default_frequency` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT (now()),
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=10 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE `notifications` (
  `id` int NOT NULL AUTO_INCREMENT,
  `user_id` int NOT NULL,
  `category` enum('appointment','consultation','report','patient_assignment','system') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'system',
  `title` varchar(150) COLLATE utf8mb4_unicode_ci NOT NULL,
  `body` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `link` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `is_read` tinyint(1) NOT NULL,
  `created_at` timestamp NULL DEFAULT (now()),
  PRIMARY KEY (`id`),
  KEY `idx_notifications_user_read_created` (`user_id`,`is_read`,`created_at`),
  CONSTRAINT `notifications_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE `password_reset_tokens` (
  `id` int NOT NULL AUTO_INCREMENT,
  `user_id` int NOT NULL,
  `token_hash` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `purpose` enum('invite','reset') COLLATE utf8mb4_unicode_ci NOT NULL,
  `expires_at` datetime NOT NULL,
  `used_at` datetime DEFAULT NULL,
  `issued_by_id` int DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT (now()),
  PRIMARY KEY (`id`),
  UNIQUE KEY `ix_password_reset_tokens_token_hash` (`token_hash`),
  KEY `issued_by_id` (`issued_by_id`),
  KEY `idx_reset_token_user` (`user_id`,`used_at`),
  CONSTRAINT `password_reset_tokens_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `password_reset_tokens_ibfk_2` FOREIGN KEY (`issued_by_id`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE `patient_cases` (
  `id` int NOT NULL AUTO_INCREMENT,
  `patient_id` int NOT NULL,
  `doctor_id` int NOT NULL,
  `status` enum('open','closed') COLLATE utf8mb4_unicode_ci NOT NULL,
  `reason` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `opened_at` datetime DEFAULT NULL,
  `closed_at` datetime DEFAULT NULL,
  `closed_by` int DEFAULT NULL,
  `final_summary` text COLLATE utf8mb4_unicode_ci,
  `final_diagnosis` text COLLATE utf8mb4_unicode_ci,
  `progression` text COLLATE utf8mb4_unicode_ci,
  `final_follow_up_advice` text COLLATE utf8mb4_unicode_ci,
  `final_lifestyle_advice` text COLLATE utf8mb4_unicode_ci,
  `consolidated_at` datetime DEFAULT NULL,
  `final_verified_at` datetime DEFAULT NULL,
  `final_verified_by` int DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT (now()),
  PRIMARY KEY (`id`),
  KEY `doctor_id` (`doctor_id`),
  KEY `closed_by` (`closed_by`),
  KEY `final_verified_by` (`final_verified_by`),
  KEY `ix_patient_cases_patient_status` (`patient_id`,`status`),
  CONSTRAINT `patient_cases_ibfk_1` FOREIGN KEY (`patient_id`) REFERENCES `patients` (`id`),
  CONSTRAINT `patient_cases_ibfk_2` FOREIGN KEY (`doctor_id`) REFERENCES `doctors` (`id`),
  CONSTRAINT `patient_cases_ibfk_3` FOREIGN KEY (`closed_by`) REFERENCES `users` (`id`),
  CONSTRAINT `patient_cases_ibfk_4` FOREIGN KEY (`final_verified_by`) REFERENCES `users` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE `patients` (
  `id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(150) COLLATE utf8mb4_unicode_ci NOT NULL,
  `gender` enum('male','female','other') COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `dob` date DEFAULT NULL,
  `age_years` int DEFAULT NULL,
  `photo_path` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `assigned_doctor_id` int DEFAULT NULL,
  `phone` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `email` varchar(150) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `address` text COLLATE utf8mb4_unicode_ci,
  `blood_group` varchar(5) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `emergency_contact_name` varchar(150) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `emergency_contact_phone` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `allergies` text COLLATE utf8mb4_unicode_ci,
  `medical_history` text COLLATE utf8mb4_unicode_ci,
  `existing_conditions` text COLLATE utf8mb4_unicode_ci,
  `notes` text COLLATE utf8mb4_unicode_ci,
  `last_registered_at` datetime DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT (now()),
  `updated_at` timestamp NULL DEFAULT (now()),
  PRIMARY KEY (`id`),
  KEY `assigned_doctor_id` (`assigned_doctor_id`),
  CONSTRAINT `patients_ibfk_1` FOREIGN KEY (`assigned_doctor_id`) REFERENCES `doctors` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE `reports` (
  `id` int NOT NULL AUTO_INCREMENT,
  `consultation_id` int DEFAULT NULL,
  `case_id` int DEFAULT NULL,
  `file_path` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `generated_at` timestamp NULL DEFAULT (now()),
  PRIMARY KEY (`id`),
  UNIQUE KEY `consultation_id` (`consultation_id`),
  UNIQUE KEY `case_id` (`case_id`),
  CONSTRAINT `reports_ibfk_1` FOREIGN KEY (`consultation_id`) REFERENCES `consultations` (`id`),
  CONSTRAINT `reports_ibfk_2` FOREIGN KEY (`case_id`) REFERENCES `patient_cases` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE `roles` (
  `id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT (now()),
  PRIMARY KEY (`id`),
  UNIQUE KEY `name` (`name`)
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE `users` (
  `id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(150) COLLATE utf8mb4_unicode_ci NOT NULL,
  `username` varchar(150) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `email` varchar(150) COLLATE utf8mb4_unicode_ci NOT NULL,
  `password_hash` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `role_id` int NOT NULL,
  `avatar_path` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `is_active` tinyint(1) NOT NULL,
  `notifications_enabled` tinyint(1) NOT NULL DEFAULT '1',
  `last_login_at` datetime DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT (now()),
  `updated_at` timestamp NULL DEFAULT (now()),
  PRIMARY KEY (`id`),
  UNIQUE KEY `email` (`email`),
  UNIQUE KEY `ix_users_username` (`username`),
  KEY `role_id` (`role_id`),
  CONSTRAINT `users_ibfk_1` FOREIGN KEY (`role_id`) REFERENCES `roles` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS = 1;
