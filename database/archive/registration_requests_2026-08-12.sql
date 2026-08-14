-- MySQL dump 10.13  Distrib 8.0.39, for Win64 (x86_64)
--
-- Host: 127.0.0.1    Database: hospital
-- ------------------------------------------------------
-- Server version	8.0.39

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!50503 SET NAMES utf8mb4 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;

--
-- Table structure for table `registration_requests`
--

/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `registration_requests` (
  `id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(150) COLLATE utf8mb4_unicode_ci NOT NULL,
  `email` varchar(150) COLLATE utf8mb4_unicode_ci NOT NULL,
  `password_hash` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `phone` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `requested_role` enum('doctor','nurse','receptionist','pharmacist') COLLATE utf8mb4_unicode_ci NOT NULL,
  `department_id` int DEFAULT NULL,
  `branch_id` int DEFAULT NULL,
  `license_no` varchar(60) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `specialization` varchar(150) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `note` text COLLATE utf8mb4_unicode_ci,
  `status` enum('pending','approved','rejected') COLLATE utf8mb4_unicode_ci NOT NULL,
  `reviewed_by` int DEFAULT NULL,
  `reviewed_at` datetime DEFAULT NULL,
  `review_note` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_user_id` int DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT (now()),
  PRIMARY KEY (`id`),
  KEY `branch_id` (`branch_id`),
  KEY `created_user_id` (`created_user_id`),
  KEY `department_id` (`department_id`),
  KEY `reviewed_by` (`reviewed_by`),
  KEY `idx_registration_email` (`email`),
  KEY `idx_registration_status_created` (`status`,`created_at`),
  CONSTRAINT `registration_requests_ibfk_1` FOREIGN KEY (`branch_id`) REFERENCES `branches` (`id`),
  CONSTRAINT `registration_requests_ibfk_2` FOREIGN KEY (`created_user_id`) REFERENCES `users` (`id`),
  CONSTRAINT `registration_requests_ibfk_3` FOREIGN KEY (`department_id`) REFERENCES `departments` (`id`),
  CONSTRAINT `registration_requests_ibfk_4` FOREIGN KEY (`reviewed_by`) REFERENCES `users` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=19 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `registration_requests`
--

LOCK TABLES `registration_requests` WRITE;
/*!40000 ALTER TABLE `registration_requests` DISABLE KEYS */;
INSERT INTO `registration_requests` (`id`, `name`, `email`, `password_hash`, `phone`, `requested_role`, `department_id`, `branch_id`, `license_no`, `specialization`, `note`, `status`, `reviewed_by`, `reviewed_at`, `review_note`, `created_user_id`, `created_at`) VALUES (11,'Dr. Applicant','newdoc820989@yasodhahospitals.com','scrypt:32768:8:1$W3itL7999XCjKDo2$1c8fd8ca111e13dbc34e22c20bea32cc705d27b5b511de00464ab8547fbb7cee4d3cd422407c9d13fd9debbdc5b542c84af597a2f0a173153c3f3ced0720fce7','+91 90000 00000','doctor',3,NULL,'MC-99881','Cardiologist','Joining next month.','approved',1,'2026-08-04 05:23:10','Verified.',16,'2026-08-03 23:53:10'),(12,'Someone','totallyfree820989@x.com','scrypt:32768:8:1$wuZR3HIIYjR8u6a3$68bf974e35f6f66fa39ff1fc9c77434e272f794ad415ba1cb1876644a6e49d171c80ee502d84165a2b451d6b6709a543e5ed1d987e15fcddd4e28d890e28da48',NULL,'nurse',NULL,NULL,NULL,NULL,NULL,'pending',NULL,NULL,NULL,NULL,'2026-08-03 23:53:10'),(13,'No Department','bare820989@x.com','scrypt:32768:8:1$gtjwyUYfx78DX30C$809eb06e5e43f49386c8f4a61d274e8798d1e95c749cb861f62e0dbad5a6d1cb64efa9280bb2068db73d0b0f4176f852c3928c304813e49d52522cb35bc09a3b',NULL,'doctor',NULL,NULL,NULL,NULL,NULL,'pending',NULL,NULL,NULL,NULL,'2026-08-03 23:53:10'),(14,'Rejected Person','reject820989@x.com','scrypt:32768:8:1$4e6P8KXRmnGR2hbO$3a7f6aa0829f41e47b063ffe7dd81b6b05e24e5c70b626885e15db8aaa41a8e3c408354da05c20c7961cc51ec0fcf18f5432169a4864563eaa1d3b01d86f001d',NULL,'receptionist',NULL,NULL,NULL,NULL,NULL,'rejected',1,'2026-08-04 05:23:11','Not a current employee.',NULL,'2026-08-03 23:53:11'),(15,'Dr. Applicant','newdoc821545@yasodhahospitals.com','scrypt:32768:8:1$2iOkrt4GjfOvyeFK$fa42d0eb2da5199afc23cbe4e5d4a19cfbbcce355cc685b2d6392351ad5a741e1e68e6c77edd46239b8aaed3bb1fdb829d4f9685447c247dfc4e99da0a2ab522','+91 90000 00000','doctor',3,NULL,'MC-99881','Cardiologist','Joining next month.','approved',1,'2026-08-04 05:32:26','Verified.',17,'2026-08-04 00:02:26'),(16,'Someone','totallyfree821545@x.com','scrypt:32768:8:1$feKMIEx6opss8r9s$2db0c7f939fbe1e0c58014ee4abb601a58d8c4913f5e05fb073cebc7f1ae44bd6aa9585de28b02373d6ff34b4426b625dea1dd54193f0a61463172740332203b',NULL,'nurse',NULL,NULL,NULL,NULL,NULL,'pending',NULL,NULL,NULL,NULL,'2026-08-04 00:02:26'),(17,'No Department','bare821545@x.com','scrypt:32768:8:1$ycd9bYoaomdU26oU$776d4d5830256d9d550e28676f8d31e6a2c8359e10280ef5d4b7e5f7088921c49be9301687107ccc2006a739f4b299a45d0b20dbf6e1e1dddb3fa5d2496c42b9',NULL,'doctor',NULL,NULL,NULL,NULL,NULL,'pending',NULL,NULL,NULL,NULL,'2026-08-04 00:02:26'),(18,'Rejected Person','reject821545@x.com','scrypt:32768:8:1$FV5bDjGYPiN8fuL4$844b21380cb8eeafec84e9a97e8a3388a29072b1d74af7146488dea7d5e604d0e2d599e83794724f5ef0e0ade3704b9dc12a60540bf6d5f07160b40a43fd0aae',NULL,'receptionist',NULL,NULL,NULL,NULL,NULL,'rejected',1,'2026-08-04 05:32:27','Not a current employee.',NULL,'2026-08-04 00:02:27');
/*!40000 ALTER TABLE `registration_requests` ENABLE KEYS */;
UNLOCK TABLES;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2026-08-12 13:14:36
