-- Usuwa istniejące tabele, jeśli istnieją, w odpowiedniej kolejności (zależności).
DROP TABLE IF EXISTS `invoice_items`;
DROP TABLE IF EXISTS `invoices`;
DROP TABLE IF EXISTS `categories`;
DROP TABLE IF EXISTS `users`;

-- Tabela `users` przechowuje dane użytkowników i ich konfigurację.
CREATE TABLE `users` (
  `id` int NOT NULL AUTO_INCREMENT,
  `email` varchar(255) NOT NULL,
  `password_hash` varchar(255) NOT NULL,
  `ocr_engine` varchar(50) DEFAULT 'tesseract',
  `imap_settings` text,
  `ksef_nip` varchar(20) DEFAULT NULL,
  `ksef_token_encrypted` text,
  `cert_storage_path` varchar(255) DEFAULT NULL,
  `cert_password_encrypted` text,
  PRIMARY KEY (`id`),
  UNIQUE KEY `email` (`email`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Tabela `categories` przechowuje niestandardowe kategorie wydatków zdefiniowane przez użytkowników.
CREATE TABLE `categories` (
  `id` int NOT NULL AUTO_INCREMENT,
  `user_id` int NOT NULL,
  `name` varchar(255) NOT NULL,
  PRIMARY KEY (`id`),
  KEY `user_id` (`user_id`),
  CONSTRAINT `categories_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Tabela `invoices` przechowuje główne dane odczytane z faktur.
CREATE TABLE `invoices` (
  `id` int NOT NULL AUTO_INCREMENT,
  `user_id` int NOT NULL,
  `category_id` int DEFAULT NULL,
  `invoice_number` varchar(255) DEFAULT NULL,
  `issue_date` date DEFAULT NULL,
  `seller_nip` varchar(20) DEFAULT NULL,
  `buyer_nip` varchar(20) DEFAULT NULL,
  `total_net_amount` decimal(10,2) DEFAULT NULL,
  `total_vat_amount` decimal(10,2) DEFAULT NULL,
  `total_gross_amount` decimal(10,2) DEFAULT NULL,
  `month_year` varchar(7) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `user_id` (`user_id`),
  KEY `category_id` (`category_id`),
  CONSTRAINT `invoices_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `invoices_ibfk_2` FOREIGN KEY (`category_id`) REFERENCES `categories` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Tabela `invoice_items` przechowuje poszczególne pozycje z faktury.
CREATE TABLE `invoice_items` (
    `id` INT NOT NULL AUTO_INCREMENT,
    `invoice_id` INT NOT NULL,
    `description` VARCHAR(255) NOT NULL,
    `quantity` DECIMAL(10, 2) DEFAULT 1.00,
    `unit_price_net` DECIMAL(10, 2) NOT NULL,
    `vat_rate` VARCHAR(10) NOT NULL,
    `total_net_amount` DECIMAL(10, 2) NOT NULL,
    `total_vat_amount` DECIMAL(10, 2) NOT NULL,
    `total_gross_amount` DECIMAL(10, 2) NOT NULL,
    PRIMARY KEY (`id`),
    FOREIGN KEY (`invoice_id`) REFERENCES `invoices`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
