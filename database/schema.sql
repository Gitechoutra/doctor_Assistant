-- Yasodha AI Medical Assistant — reference schema
--
-- GENERATED FILE. Do not hand-edit: the migrations in
-- backend/migrations/versions are the source of truth for the schema, and
-- `flask db upgrade` is what actually builds a database. This file is a
-- readable snapshot of what that produces, for anyone who wants to see the
-- whole shape at once without replaying forty migrations.
--
-- Regenerate after a schema change:
--
--   cd backend && flask db upgrade
--   mysqldump -h 127.0.0.1 -u root -p --no-data --skip-comments \
--     --skip-add-drop-table hospital > ../database/schema.sql
--   (then re-add this header)
--
-- The previous version of this file was the Milestone 1 schema and had drifted
-- to 8 tables against the application's 36, with several column lists that no
-- longer matched — following it produced a database the app could not run on.
-- Regenerating is what keeps it honest; that is why it is generated rather
-- than maintained.
--
-- `alembic_version` is included deliberately: it is what tells `flask db
-- upgrade` which migrations a database has already seen. A database built from
-- this file is already at the current head and needs no upgrade; one built by
-- `flask db upgrade` from empty ends up here.
--
-- Tables are emitted in alphabetical order, so a foreign key can name a table
-- that appears further down. FOREIGN_KEY_CHECKS is therefore off while the
-- tables are created and back on at the end — the constraints themselves are
-- all still created, and are enforced from the moment the file finishes.

CREATE DATABASE IF NOT EXISTS hospital
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

USE hospital;

SET FOREIGN_KEY_CHECKS = 0;


CREATE TABLE `alembic_version` (
  `version_num` varchar(32) COLLATE utf8mb4_unicode_ci NOT NULL,
  PRIMARY KEY (`version_num`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE `appointments` (
  `id` int NOT NULL AUTO_INCREMENT,
  `patient_id` int NOT NULL,
  `department_id` int NOT NULL,
  `doctor_id` int DEFAULT NULL,
  `consultation_id` int DEFAULT NULL,
  `status` enum('waiting','in_progress','completed','cancelled') COLLATE utf8mb4_unicode_ci NOT NULL,
  `reason` text COLLATE utf8mb4_unicode_ci,
  `payment_type` enum('cash','upi','card') COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT (now()),
  PRIMARY KEY (`id`),
  KEY `consultation_id` (`consultation_id`),
  KEY `department_id` (`department_id`),
  KEY `doctor_id` (`doctor_id`),
  KEY `patient_id` (`patient_id`),
  CONSTRAINT `appointments_ibfk_1` FOREIGN KEY (`consultation_id`) REFERENCES `consultations` (`id`),
  CONSTRAINT `appointments_ibfk_2` FOREIGN KEY (`department_id`) REFERENCES `departments` (`id`),
  CONSTRAINT `appointments_ibfk_3` FOREIGN KEY (`doctor_id`) REFERENCES `doctors` (`id`),
  CONSTRAINT `appointments_ibfk_4` FOREIGN KEY (`patient_id`) REFERENCES `patients` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=256 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE `audit_logs` (
  `id` int NOT NULL AUTO_INCREMENT,
  `user_id` int DEFAULT NULL,
  `action` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `entity` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `entity_id` int DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT (now()),
  `actor_role` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `detail` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_audit_entity` (`entity`,`entity_id`,`created_at`),
  KEY `idx_audit_user_created` (`user_id`,`created_at`),
  CONSTRAINT `audit_logs_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB AUTO_INCREMENT=1814 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE `branches` (
  `id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(120) COLLATE utf8mb4_unicode_ci NOT NULL,
  `code` varchar(12) COLLATE utf8mb4_unicode_ci NOT NULL,
  `city` varchar(120) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `address` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `phone` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `is_active` tinyint(1) NOT NULL,
  `created_at` timestamp NULL DEFAULT (now()),
  PRIMARY KEY (`id`),
  UNIQUE KEY `code` (`code`),
  UNIQUE KEY `name` (`name`)
) ENGINE=InnoDB AUTO_INCREMENT=4 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE `care_messages` (
  `id` int NOT NULL AUTO_INCREMENT,
  `assignment_id` int NOT NULL,
  `sender_id` int NOT NULL,
  `sender_role` enum('doctor','nurse','admin') COLLATE utf8mb4_unicode_ci NOT NULL,
  `body` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `read_at` datetime(6) DEFAULT NULL,
  `created_at` datetime(6) DEFAULT (now()),
  PRIMARY KEY (`id`),
  KEY `sender_id` (`sender_id`),
  KEY `idx_care_messages_assignment_created` (`assignment_id`,`created_at`),
  CONSTRAINT `care_messages_ibfk_1` FOREIGN KEY (`assignment_id`) REFERENCES `nursing_assignments` (`id`) ON DELETE CASCADE,
  CONSTRAINT `care_messages_ibfk_2` FOREIGN KEY (`sender_id`) REFERENCES `users` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=46 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE `case_prescriptions` (
  `id` int NOT NULL AUTO_INCREMENT,
  `case_id` int NOT NULL,
  `medicine_id` int DEFAULT NULL,
  `medicine_name` varchar(150) COLLATE utf8mb4_unicode_ci NOT NULL,
  `dose` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `frequency` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `duration` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `source_session_number` int DEFAULT NULL,
  `note` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT (now()),
  `brand_id` int DEFAULT NULL,
  `quantity` varchar(80) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `instructions` text COLLATE utf8mb4_unicode_ci,
  `notes` text COLLATE utf8mb4_unicode_ci,
  `route` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `is_custom` tinyint(1) NOT NULL DEFAULT '0',
  PRIMARY KEY (`id`),
  KEY `case_id` (`case_id`),
  KEY `medicine_id` (`medicine_id`),
  KEY `fk_case_prescriptions_brand` (`brand_id`),
  CONSTRAINT `case_prescriptions_ibfk_1` FOREIGN KEY (`case_id`) REFERENCES `patient_cases` (`id`),
  CONSTRAINT `case_prescriptions_ibfk_2` FOREIGN KEY (`medicine_id`) REFERENCES `medicines` (`id`),
  CONSTRAINT `fk_case_prescriptions_brand` FOREIGN KEY (`brand_id`) REFERENCES `medicine_brands` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=55 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE `clinical_alerts` (
  `id` int NOT NULL AUTO_INCREMENT,
  `assignment_id` int NOT NULL,
  `nurse_id` int NOT NULL,
  `doctor_id` int NOT NULL,
  `category` enum('emergency','missed_medication','abnormal_observation','critical_change','other') COLLATE utf8mb4_unicode_ci NOT NULL,
  `severity` enum('info','warning','critical') COLLATE utf8mb4_unicode_ci NOT NULL,
  `message` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `status` enum('open','acknowledged','resolved') COLLATE utf8mb4_unicode_ci NOT NULL,
  `acknowledged_at` datetime(6) DEFAULT NULL,
  `acknowledged_by` int DEFAULT NULL,
  `doctor_response` text COLLATE utf8mb4_unicode_ci,
  `created_at` datetime(6) DEFAULT (now()),
  PRIMARY KEY (`id`),
  KEY `acknowledged_by` (`acknowledged_by`),
  KEY `assignment_id` (`assignment_id`),
  KEY `nurse_id` (`nurse_id`),
  KEY `idx_clinical_alerts_doctor_status` (`doctor_id`,`status`,`created_at`),
  CONSTRAINT `clinical_alerts_ibfk_1` FOREIGN KEY (`acknowledged_by`) REFERENCES `users` (`id`),
  CONSTRAINT `clinical_alerts_ibfk_2` FOREIGN KEY (`assignment_id`) REFERENCES `nursing_assignments` (`id`) ON DELETE CASCADE,
  CONSTRAINT `clinical_alerts_ibfk_3` FOREIGN KEY (`doctor_id`) REFERENCES `doctors` (`id`),
  CONSTRAINT `clinical_alerts_ibfk_4` FOREIGN KEY (`nurse_id`) REFERENCES `nurses` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=98 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE `clinical_precedents` (
  `id` int NOT NULL AUTO_INCREMENT,
  `source_consultation_id` int NOT NULL,
  `doctor_id` int NOT NULL,
  `department_id` int DEFAULT NULL,
  `symptoms` text COLLATE utf8mb4_unicode_ci,
  `diagnosis` text COLLATE utf8mb4_unicode_ci,
  `medicines` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `age_band` varchar(16) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `gender` varchar(10) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `embedding` blob,
  `embedding_model` varchar(80) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `embedding_text` text COLLATE utf8mb4_unicode_ci,
  `times_suggested` int NOT NULL DEFAULT '0',
  `times_accepted` int NOT NULL DEFAULT '0',
  `approved_at` datetime DEFAULT NULL,
  `retired_at` datetime DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT (now()),
  `updated_at` timestamp NULL DEFAULT (now()),
  PRIMARY KEY (`id`),
  UNIQUE KEY `source_consultation_id` (`source_consultation_id`),
  KEY `doctor_id` (`doctor_id`),
  KEY `department_id` (`department_id`),
  KEY `ix_clinical_precedents_retired_at` (`retired_at`),
  CONSTRAINT `clinical_precedents_ibfk_1` FOREIGN KEY (`source_consultation_id`) REFERENCES `consultations` (`id`),
  CONSTRAINT `clinical_precedents_ibfk_2` FOREIGN KEY (`doctor_id`) REFERENCES `doctors` (`id`),
  CONSTRAINT `clinical_precedents_ibfk_3` FOREIGN KEY (`department_id`) REFERENCES `departments` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=78 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE `consultation_summaries` (
  `id` int NOT NULL AUTO_INCREMENT,
  `consultation_id` int NOT NULL,
  `summary` text COLLATE utf8mb4_unicode_ci,
  `symptoms` text COLLATE utf8mb4_unicode_ci,
  `possible_diagnosis` text COLLATE utf8mb4_unicode_ci,
  `follow_up_advice` text COLLATE utf8mb4_unicode_ci,
  `lifestyle_advice` text COLLATE utf8mb4_unicode_ci,
  `created_at` timestamp NULL DEFAULT (now()),
  `labeled_transcript` text COLLATE utf8mb4_unicode_ci,
  `matched_precedents` text COLLATE utf8mb4_unicode_ci,
  PRIMARY KEY (`id`),
  UNIQUE KEY `consultation_id` (`consultation_id`),
  CONSTRAINT `consultation_summaries_ibfk_1` FOREIGN KEY (`consultation_id`) REFERENCES `consultations` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=212 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE `consultations` (
  `id` int NOT NULL AUTO_INCREMENT,
  `doctor_id` int NOT NULL,
  `patient_id` int NOT NULL,
  `status` enum('scheduled','in_progress','completed') COLLATE utf8mb4_unicode_ci NOT NULL,
  `started_at` datetime DEFAULT NULL,
  `ended_at` datetime DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT (now()),
  `prescription_verified_at` datetime DEFAULT NULL,
  `prescription_verified_by` int DEFAULT NULL,
  `case_id` int DEFAULT NULL,
  `session_number` int DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `doctor_id` (`doctor_id`),
  KEY `patient_id` (`patient_id`),
  KEY `prescription_verified_by` (`prescription_verified_by`),
  KEY `fk_consultations_case_id` (`case_id`),
  CONSTRAINT `consultations_ibfk_1` FOREIGN KEY (`doctor_id`) REFERENCES `doctors` (`id`),
  CONSTRAINT `consultations_ibfk_2` FOREIGN KEY (`patient_id`) REFERENCES `patients` (`id`),
  CONSTRAINT `consultations_ibfk_3` FOREIGN KEY (`prescription_verified_by`) REFERENCES `users` (`id`),
  CONSTRAINT `fk_consultations_case_id` FOREIGN KEY (`case_id`) REFERENCES `patient_cases` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=258 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE `conversation_messages` (
  `id` int NOT NULL AUTO_INCREMENT,
  `consultation_id` int NOT NULL,
  `speaker` enum('doctor','patient','unknown') COLLATE utf8mb4_unicode_ci NOT NULL,
  `message` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `created_at` timestamp NULL DEFAULT (now()),
  PRIMARY KEY (`id`),
  KEY `consultation_id` (`consultation_id`),
  CONSTRAINT `conversation_messages_ibfk_1` FOREIGN KEY (`consultation_id`) REFERENCES `consultations` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=339 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
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
  `times_prescribed` int NOT NULL DEFAULT '0',
  `first_requested_at` datetime DEFAULT NULL,
  `last_requested_at` datetime DEFAULT NULL,
  `requested_by_doctor_id` int DEFAULT NULL,
  `department_id` int DEFAULT NULL,
  `status` enum('pending','added','dismissed') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'pending',
  `reviewed_by` int DEFAULT NULL,
  `reviewed_at` datetime DEFAULT NULL,
  `review_note` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_brand_id` int DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT (now()),
  PRIMARY KEY (`id`),
  UNIQUE KEY `normalized_name` (`normalized_name`),
  KEY `requested_by_doctor_id` (`requested_by_doctor_id`),
  KEY `department_id` (`department_id`),
  KEY `reviewed_by` (`reviewed_by`),
  KEY `created_brand_id` (`created_brand_id`),
  KEY `ix_custom_medicine_requests_status` (`status`),
  CONSTRAINT `custom_medicine_requests_ibfk_1` FOREIGN KEY (`requested_by_doctor_id`) REFERENCES `doctors` (`id`),
  CONSTRAINT `custom_medicine_requests_ibfk_2` FOREIGN KEY (`department_id`) REFERENCES `departments` (`id`),
  CONSTRAINT `custom_medicine_requests_ibfk_3` FOREIGN KEY (`reviewed_by`) REFERENCES `users` (`id`),
  CONSTRAINT `custom_medicine_requests_ibfk_4` FOREIGN KEY (`created_brand_id`) REFERENCES `medicine_brands` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=29 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE `departments` (
  `id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `created_at` timestamp NULL DEFAULT (now()),
  PRIMARY KEY (`id`),
  UNIQUE KEY `name` (`name`)
) ENGINE=InnoDB AUTO_INCREMENT=17 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE `doctors` (
  `id` int NOT NULL AUTO_INCREMENT,
  `user_id` int NOT NULL,
  `department_id` int DEFAULT NULL,
  `specialization` varchar(150) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `registration_no` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT (now()),
  PRIMARY KEY (`id`),
  UNIQUE KEY `user_id` (`user_id`),
  KEY `department_id` (`department_id`),
  CONSTRAINT `doctors_ibfk_1` FOREIGN KEY (`department_id`) REFERENCES `departments` (`id`),
  CONSTRAINT `doctors_ibfk_2` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=21 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE `generated_prescriptions` (
  `id` int NOT NULL AUTO_INCREMENT,
  `consultation_id` int NOT NULL,
  `medicine_id` int DEFAULT NULL,
  `medicine_name` varchar(150) COLLATE utf8mb4_unicode_ci NOT NULL,
  `dose` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `frequency` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `duration` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT (now()),
  `source_precedent_id` int DEFAULT NULL,
  `brand_id` int DEFAULT NULL,
  `quantity` varchar(80) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `instructions` text COLLATE utf8mb4_unicode_ci,
  `notes` text COLLATE utf8mb4_unicode_ci,
  `route` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `is_custom` tinyint(1) NOT NULL DEFAULT '0',
  PRIMARY KEY (`id`),
  KEY `consultation_id` (`consultation_id`),
  KEY `medicine_id` (`medicine_id`),
  KEY `fk_generated_prescriptions_precedent` (`source_precedent_id`),
  KEY `fk_generated_prescriptions_brand` (`brand_id`),
  CONSTRAINT `fk_generated_prescriptions_brand` FOREIGN KEY (`brand_id`) REFERENCES `medicine_brands` (`id`),
  CONSTRAINT `fk_generated_prescriptions_precedent` FOREIGN KEY (`source_precedent_id`) REFERENCES `clinical_precedents` (`id`),
  CONSTRAINT `generated_prescriptions_ibfk_1` FOREIGN KEY (`consultation_id`) REFERENCES `consultations` (`id`),
  CONSTRAINT `generated_prescriptions_ibfk_2` FOREIGN KEY (`medicine_id`) REFERENCES `medicines` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=390 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE `lab_messages` (
  `id` int NOT NULL AUTO_INCREMENT,
  `lab_request_id` int NOT NULL,
  `author_id` int DEFAULT NULL,
  `kind` enum('message','system') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'message',
  `body` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `created_at` timestamp NULL DEFAULT (now()),
  PRIMARY KEY (`id`),
  KEY `author_id` (`author_id`),
  KEY `ix_lab_messages_lab_request_id` (`lab_request_id`),
  CONSTRAINT `lab_messages_ibfk_1` FOREIGN KEY (`author_id`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `lab_messages_ibfk_2` FOREIGN KEY (`lab_request_id`) REFERENCES `lab_requests` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=21 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE `lab_requests` (
  `id` int NOT NULL AUTO_INCREMENT,
  `patient_id` int NOT NULL,
  `consultation_id` int DEFAULT NULL,
  `case_id` int DEFAULT NULL,
  `test_name` varchar(200) COLLATE utf8mb4_unicode_ci NOT NULL,
  `test_category` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `specimen` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `priority` enum('routine','urgent') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'routine',
  `clinical_notes` text COLLATE utf8mb4_unicode_ci,
  `doctor_id` int DEFAULT NULL,
  `technician_id` int DEFAULT NULL,
  `department_id` int DEFAULT NULL,
  `status` enum('ordered','sample_collected','processing','completed','verified','cancelled') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'ordered',
  `recollection_requested` tinyint(1) NOT NULL DEFAULT '0',
  `recollection_reason` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `recollection_at` timestamp NULL DEFAULT NULL,
  `report_file` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `report_original_name` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `report_uploaded_at` timestamp NULL DEFAULT NULL,
  `result_summary` text COLLATE utf8mb4_unicode_ci,
  `verified_by_id` int DEFAULT NULL,
  `verified_at` timestamp NULL DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT (now()),
  `updated_at` timestamp NULL DEFAULT (now()),
  PRIMARY KEY (`id`),
  KEY `case_id` (`case_id`),
  KEY `department_id` (`department_id`),
  KEY `verified_by_id` (`verified_by_id`),
  KEY `idx_lab_doctor_status` (`doctor_id`,`status`),
  KEY `idx_lab_patient_created` (`patient_id`,`created_at`),
  KEY `idx_lab_technician_status` (`technician_id`,`status`),
  KEY `ix_lab_requests_consultation_id` (`consultation_id`),
  KEY `ix_lab_requests_doctor_id` (`doctor_id`),
  KEY `ix_lab_requests_patient_id` (`patient_id`),
  KEY `ix_lab_requests_technician_id` (`technician_id`),
  CONSTRAINT `lab_requests_ibfk_1` FOREIGN KEY (`case_id`) REFERENCES `patient_cases` (`id`),
  CONSTRAINT `lab_requests_ibfk_2` FOREIGN KEY (`consultation_id`) REFERENCES `consultations` (`id`),
  CONSTRAINT `lab_requests_ibfk_3` FOREIGN KEY (`department_id`) REFERENCES `departments` (`id`),
  CONSTRAINT `lab_requests_ibfk_4` FOREIGN KEY (`doctor_id`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `lab_requests_ibfk_5` FOREIGN KEY (`patient_id`) REFERENCES `patients` (`id`) ON DELETE CASCADE,
  CONSTRAINT `lab_requests_ibfk_6` FOREIGN KEY (`technician_id`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `lab_requests_ibfk_7` FOREIGN KEY (`verified_by_id`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE `medication_administrations` (
  `id` int NOT NULL AUTO_INCREMENT,
  `assignment_id` int NOT NULL,
  `order_id` int DEFAULT NULL,
  `nurse_id` int NOT NULL,
  `medicine_name` varchar(150) COLLATE utf8mb4_unicode_ci NOT NULL,
  `route` enum('oral','injection','iv','topical','inhalation','other') COLLATE utf8mb4_unicode_ci NOT NULL,
  `dose` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `scheduled_at` datetime(6) DEFAULT NULL,
  `administered_at` datetime(6) DEFAULT NULL,
  `status` enum('completed','delayed','missed','skipped') COLLATE utf8mb4_unicode_ci NOT NULL,
  `notes` text COLLATE utf8mb4_unicode_ci,
  `created_at` datetime(6) DEFAULT (now()),
  PRIMARY KEY (`id`),
  KEY `nurse_id` (`nurse_id`),
  KEY `order_id` (`order_id`),
  KEY `idx_med_admin_assignment_created` (`assignment_id`,`created_at`),
  CONSTRAINT `medication_administrations_ibfk_1` FOREIGN KEY (`assignment_id`) REFERENCES `nursing_assignments` (`id`) ON DELETE CASCADE,
  CONSTRAINT `medication_administrations_ibfk_2` FOREIGN KEY (`nurse_id`) REFERENCES `nurses` (`id`),
  CONSTRAINT `medication_administrations_ibfk_3` FOREIGN KEY (`order_id`) REFERENCES `medication_orders` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB AUTO_INCREMENT=133 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE `medication_orders` (
  `id` int NOT NULL AUTO_INCREMENT,
  `assignment_id` int NOT NULL,
  `medicine_id` int DEFAULT NULL,
  `medicine_name` varchar(150) COLLATE utf8mb4_unicode_ci NOT NULL,
  `route` enum('oral','injection','iv','topical','inhalation','other') COLLATE utf8mb4_unicode_ci NOT NULL,
  `dose` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `frequency` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `duration` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `instructions` text COLLATE utf8mb4_unicode_ci,
  `times_per_day` int DEFAULT NULL,
  `is_active` tinyint(1) NOT NULL,
  `created_at` datetime(6) DEFAULT (now()),
  PRIMARY KEY (`id`),
  KEY `assignment_id` (`assignment_id`),
  KEY `medicine_id` (`medicine_id`),
  CONSTRAINT `medication_orders_ibfk_1` FOREIGN KEY (`assignment_id`) REFERENCES `nursing_assignments` (`id`) ON DELETE CASCADE,
  CONSTRAINT `medication_orders_ibfk_2` FOREIGN KEY (`medicine_id`) REFERENCES `medicines` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=162 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE `medicine_brands` (
  `id` int NOT NULL AUTO_INCREMENT,
  `brand_name` varchar(150) COLLATE utf8mb4_unicode_ci NOT NULL,
  `generic_name` varchar(150) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `used_for` text COLLATE utf8mb4_unicode_ci,
  `category` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `manufacturer` varchar(150) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `form` enum('tablet','capsule','syrup','injection','iv_fluid','ointment','drops','inhaler','sachet','other') COLLATE utf8mb4_unicode_ci NOT NULL,
  `strength` varchar(80) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `reorder_level` int NOT NULL,
  `medicine_id` int DEFAULT NULL,
  `is_active` tinyint(1) NOT NULL,
  `created_at` timestamp NULL DEFAULT (now()),
  `usage_instructions` text COLLATE utf8mb4_unicode_ci,
  `unit_price` decimal(10,2) DEFAULT NULL,
  `for_all_departments` tinyint(1) NOT NULL DEFAULT '0',
  `updated_at` timestamp NULL DEFAULT (now()),
  `added_by_doctor` tinyint(1) NOT NULL DEFAULT '0',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_brand_strength` (`brand_name`,`strength`),
  KEY `medicine_id` (`medicine_id`),
  KEY `idx_brand_name` (`brand_name`),
  CONSTRAINT `medicine_brands_ibfk_1` FOREIGN KEY (`medicine_id`) REFERENCES `medicines` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=114 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE `medicine_departments` (
  `brand_id` int NOT NULL,
  `department_id` int NOT NULL,
  PRIMARY KEY (`brand_id`,`department_id`),
  KEY `ix_medicine_departments_department` (`department_id`),
  CONSTRAINT `medicine_departments_ibfk_1` FOREIGN KEY (`brand_id`) REFERENCES `medicine_brands` (`id`) ON DELETE CASCADE,
  CONSTRAINT `medicine_departments_ibfk_2` FOREIGN KEY (`department_id`) REFERENCES `departments` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
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
  `category` enum('appointment','consultation','report','nursing','patient_assignment','pharmacy','shift','system') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'system',
  `title` varchar(150) COLLATE utf8mb4_unicode_ci NOT NULL,
  `body` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `link` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `is_read` tinyint(1) NOT NULL,
  `created_at` timestamp NULL DEFAULT (now()),
  PRIMARY KEY (`id`),
  KEY `idx_notifications_user_read_created` (`user_id`,`is_read`,`created_at`),
  CONSTRAINT `notifications_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=953 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE `nurses` (
  `id` int NOT NULL AUTO_INCREMENT,
  `user_id` int NOT NULL,
  `department_id` int DEFAULT NULL,
  `employee_no` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `shift` enum('morning','evening','night') COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT (now()),
  PRIMARY KEY (`id`),
  UNIQUE KEY `user_id` (`user_id`),
  KEY `department_id` (`department_id`),
  CONSTRAINT `nurses_ibfk_1` FOREIGN KEY (`department_id`) REFERENCES `departments` (`id`),
  CONSTRAINT `nurses_ibfk_2` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=14 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE `nursing_assignments` (
  `id` int NOT NULL AUTO_INCREMENT,
  `patient_id` int NOT NULL,
  `nurse_id` int NOT NULL,
  `doctor_id` int NOT NULL,
  `consultation_id` int DEFAULT NULL,
  `emergency_case_id` int DEFAULT NULL,
  `care_type` enum('observation','post_surgery','post_procedure','recovery','icu') COLLATE utf8mb4_unicode_ci NOT NULL,
  `treatment_plan` text COLLATE utf8mb4_unicode_ci,
  `care_instructions` text COLLATE utf8mb4_unicode_ci,
  `starts_at` datetime NOT NULL,
  `ends_at` datetime DEFAULT NULL,
  `status` enum('active','completed','cancelled') COLLATE utf8mb4_unicode_ci NOT NULL,
  `completed_at` datetime DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT (now()),
  `updated_at` timestamp NULL DEFAULT (now()),
  `doctor_seen_at` datetime(6) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `consultation_id` (`consultation_id`),
  KEY `patient_id` (`patient_id`),
  KEY `idx_nursing_assignments_doctor_status` (`doctor_id`,`status`),
  KEY `idx_nursing_assignments_nurse_status` (`nurse_id`,`status`),
  -- No FOREIGN KEY here, unlike the live schema: this dump predates the
  -- emergency module and has no `emergency_cases` table to point at, so the
  -- constraint would fail when FOREIGN_KEY_CHECKS comes back on at the end.
  -- The live database does carry it (see
  -- database/changes/2026-08-13_nursing_emergency_link.sql).
  KEY `idx_nursing_assignments_emergency` (`emergency_case_id`),
  CONSTRAINT `nursing_assignments_ibfk_1` FOREIGN KEY (`consultation_id`) REFERENCES `consultations` (`id`),
  CONSTRAINT `nursing_assignments_ibfk_2` FOREIGN KEY (`doctor_id`) REFERENCES `doctors` (`id`),
  CONSTRAINT `nursing_assignments_ibfk_3` FOREIGN KEY (`nurse_id`) REFERENCES `nurses` (`id`),
  CONSTRAINT `nursing_assignments_ibfk_4` FOREIGN KEY (`patient_id`) REFERENCES `patients` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=76 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE `nursing_notes` (
  `id` int NOT NULL AUTO_INCREMENT,
  `assignment_id` int NOT NULL,
  `nurse_id` int NOT NULL,
  `note_type` enum('note','handover') COLLATE utf8mb4_unicode_ci NOT NULL,
  `shift` enum('morning','evening','night') COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `content` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `handover_to_nurse_id` int DEFAULT NULL,
  `created_at` datetime(6) DEFAULT (now()),
  PRIMARY KEY (`id`),
  KEY `handover_to_nurse_id` (`handover_to_nurse_id`),
  KEY `nurse_id` (`nurse_id`),
  KEY `idx_nursing_notes_assignment_created` (`assignment_id`,`created_at`),
  CONSTRAINT `nursing_notes_ibfk_1` FOREIGN KEY (`assignment_id`) REFERENCES `nursing_assignments` (`id`) ON DELETE CASCADE,
  CONSTRAINT `nursing_notes_ibfk_2` FOREIGN KEY (`handover_to_nurse_id`) REFERENCES `nurses` (`id`),
  CONSTRAINT `nursing_notes_ibfk_3` FOREIGN KEY (`nurse_id`) REFERENCES `nurses` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=75 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE `password_reset_tokens` (
  `id` int NOT NULL AUTO_INCREMENT,
  `user_id` int NOT NULL,
  `token_hash` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `purpose` enum('invite','reset') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'reset',
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
) ENGINE=InnoDB AUTO_INCREMENT=48 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
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
) ENGINE=InnoDB AUTO_INCREMENT=112 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE `patient_observations` (
  `id` int NOT NULL AUTO_INCREMENT,
  `assignment_id` int NOT NULL,
  `nurse_id` int NOT NULL,
  `recorded_at` datetime(6) NOT NULL,
  `temperature_c` decimal(4,1) DEFAULT NULL,
  `pulse_bpm` int DEFAULT NULL,
  `systolic_bp` int DEFAULT NULL,
  `diastolic_bp` int DEFAULT NULL,
  `respiratory_rate` int DEFAULT NULL,
  `spo2` int DEFAULT NULL,
  `blood_sugar` decimal(6,1) DEFAULT NULL,
  `pain_score` int DEFAULT NULL,
  `symptoms` text COLLATE utf8mb4_unicode_ci,
  `recovery_progress` text COLLATE utf8mb4_unicode_ci,
  `complications` text COLLATE utf8mb4_unicode_ci,
  `is_abnormal` tinyint(1) NOT NULL,
  `created_at` datetime(6) DEFAULT (now()),
  PRIMARY KEY (`id`),
  KEY `nurse_id` (`nurse_id`),
  KEY `idx_observations_assignment_recorded` (`assignment_id`,`recorded_at`),
  CONSTRAINT `patient_observations_ibfk_1` FOREIGN KEY (`assignment_id`) REFERENCES `nursing_assignments` (`id`) ON DELETE CASCADE,
  CONSTRAINT `patient_observations_ibfk_2` FOREIGN KEY (`nurse_id`) REFERENCES `nurses` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=84 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE `patients` (
  `id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(150) COLLATE utf8mb4_unicode_ci NOT NULL,
  `gender` enum('male','female','other') COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `dob` date DEFAULT NULL,
  `phone` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `email` varchar(150) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `blood_group` varchar(5) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `allergies` text COLLATE utf8mb4_unicode_ci,
  `medical_history` text COLLATE utf8mb4_unicode_ci,
  `created_at` timestamp NULL DEFAULT (now()),
  `updated_at` timestamp NULL DEFAULT (now()),
  `photo_path` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `assigned_doctor_id` int DEFAULT NULL,
  `op_status` enum('free','paid') COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `last_registered_at` datetime DEFAULT NULL,
  `surgery_stage` enum('required','post_op','ready_for_discharge') COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `surgery_marked_at` datetime DEFAULT NULL,
  `surgery_completed_at` datetime DEFAULT NULL,
  `observation_days` int DEFAULT NULL,
  `observation_ends_at` datetime DEFAULT NULL,
  `surgery_notes` text COLLATE utf8mb4_unicode_ci,
  PRIMARY KEY (`id`),
  KEY `assigned_doctor_id` (`assigned_doctor_id`),
  CONSTRAINT `patients_ibfk_1` FOREIGN KEY (`assigned_doctor_id`) REFERENCES `doctors` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=84 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE `pharmacists` (
  `id` int NOT NULL AUTO_INCREMENT,
  `user_id` int NOT NULL,
  `branch_id` int NOT NULL,
  `license_no` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT (now()),
  PRIMARY KEY (`id`),
  UNIQUE KEY `user_id` (`user_id`),
  KEY `branch_id` (`branch_id`),
  CONSTRAINT `pharmacists_ibfk_1` FOREIGN KEY (`branch_id`) REFERENCES `branches` (`id`),
  CONSTRAINT `pharmacists_ibfk_2` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=10 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE `reports` (
  `id` int NOT NULL AUTO_INCREMENT,
  `consultation_id` int DEFAULT NULL,
  `file_path` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `generated_at` timestamp NULL DEFAULT (now()),
  `case_id` int DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `consultation_id` (`consultation_id`),
  UNIQUE KEY `uq_reports_case_id` (`case_id`),
  CONSTRAINT `fk_reports_case_id` FOREIGN KEY (`case_id`) REFERENCES `patient_cases` (`id`),
  CONSTRAINT `reports_ibfk_1` FOREIGN KEY (`consultation_id`) REFERENCES `consultations` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=40 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE `roles` (
  `id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT (now()),
  PRIMARY KEY (`id`),
  UNIQUE KEY `name` (`name`)
) ENGINE=InnoDB AUTO_INCREMENT=11 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE `staff_profiles` (
  `id` int NOT NULL AUTO_INCREMENT,
  `user_id` int NOT NULL,
  `phone` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `gender` enum('male','female','other') COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `date_of_birth` date DEFAULT NULL,
  `department_id` int DEFAULT NULL,
  `branch_id` int DEFAULT NULL,
  `designation` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `employee_code` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `joined_on` date DEFAULT NULL,
  `registration_no` varchar(60) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `specialization` varchar(150) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `years_experience` int DEFAULT NULL,
  `shift` enum('morning','evening','night') COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `lab_department` varchar(120) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `qualification` varchar(150) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `notes` text COLLATE utf8mb4_unicode_ci,
  `extra` json DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT (now()),
  `updated_at` timestamp NULL DEFAULT (now()),
  PRIMARY KEY (`id`),
  UNIQUE KEY `user_id` (`user_id`),
  UNIQUE KEY `employee_code` (`employee_code`),
  KEY `branch_id` (`branch_id`),
  KEY `department_id` (`department_id`),
  KEY `idx_staff_employee_code` (`employee_code`),
  CONSTRAINT `staff_profiles_ibfk_1` FOREIGN KEY (`branch_id`) REFERENCES `branches` (`id`),
  CONSTRAINT `staff_profiles_ibfk_2` FOREIGN KEY (`department_id`) REFERENCES `departments` (`id`),
  CONSTRAINT `staff_profiles_ibfk_3` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=88 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE `staff_shifts` (
  `id` int NOT NULL AUTO_INCREMENT,
  `user_id` int DEFAULT NULL,
  `shift_date` date NOT NULL,
  `slot` enum('morning','evening','night','custom') COLLATE utf8mb4_unicode_ci NOT NULL,
  `starts_at` time NOT NULL,
  `ends_at` time NOT NULL,
  `department_id` int DEFAULT NULL,
  `branch_id` int DEFAULT NULL,
  `status` enum('scheduled','cancelled') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'scheduled',
  `notes` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_by_id` int DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT (now()),
  `updated_at` timestamp NULL DEFAULT (now()),
  PRIMARY KEY (`id`),
  KEY `branch_id` (`branch_id`),
  KEY `created_by_id` (`created_by_id`),
  KEY `department_id` (`department_id`),
  KEY `idx_staff_shift_date_status` (`shift_date`,`status`),
  KEY `idx_staff_shift_user_date` (`user_id`,`shift_date`),
  KEY `ix_staff_shifts_shift_date` (`shift_date`),
  KEY `ix_staff_shifts_user_id` (`user_id`),
  CONSTRAINT `staff_shifts_ibfk_1` FOREIGN KEY (`branch_id`) REFERENCES `branches` (`id`),
  CONSTRAINT `staff_shifts_ibfk_2` FOREIGN KEY (`created_by_id`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `staff_shifts_ibfk_3` FOREIGN KEY (`department_id`) REFERENCES `departments` (`id`),
  CONSTRAINT `staff_shifts_ibfk_4` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB AUTO_INCREMENT=248 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE `stock_batches` (
  `id` int NOT NULL AUTO_INCREMENT,
  `branch_id` int NOT NULL,
  `brand_id` int NOT NULL,
  `batch_no` varchar(60) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `expiry_date` date DEFAULT NULL,
  `quantity` int NOT NULL,
  `mrp` decimal(10,2) DEFAULT NULL,
  `cost_price` decimal(10,2) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT (now()),
  `updated_at` timestamp NULL DEFAULT (now()),
  PRIMARY KEY (`id`),
  KEY `brand_id` (`brand_id`),
  KEY `idx_stock_branch_brand` (`branch_id`,`brand_id`),
  KEY `idx_stock_expiry` (`expiry_date`),
  CONSTRAINT `stock_batches_ibfk_1` FOREIGN KEY (`branch_id`) REFERENCES `branches` (`id`),
  CONSTRAINT `stock_batches_ibfk_2` FOREIGN KEY (`brand_id`) REFERENCES `medicine_brands` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=82 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE `users` (
  `id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(150) COLLATE utf8mb4_unicode_ci NOT NULL,
  `email` varchar(150) COLLATE utf8mb4_unicode_ci NOT NULL,
  `password_hash` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `role_id` int NOT NULL,
  `is_active` tinyint(1) NOT NULL,
  `last_login_at` datetime DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT (now()),
  `updated_at` timestamp NULL DEFAULT (now()),
  `avatar_path` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `username` varchar(150) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `email` (`email`),
  UNIQUE KEY `ix_users_username` (`username`),
  KEY `role_id` (`role_id`),
  CONSTRAINT `users_ibfk_1` FOREIGN KEY (`role_id`) REFERENCES `roles` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=146 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


SET FOREIGN_KEY_CHECKS = 1;
