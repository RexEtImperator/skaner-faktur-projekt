-- Skrypt do utworzenia bazy danych i użytkownika
CREATE DATABASE IF NOT EXISTS invoice_parser CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Opcjonalnie: utwórz dedykowanego użytkownika
-- CREATE USER 'invoice_user'@'localhost' IDENTIFIED BY 'invoice_password';
-- GRANT ALL PRIVILEGES ON invoice_parser.* TO 'invoice_user'@'localhost';
-- FLUSH PRIVILEGES;

USE invoice_parser;

-- Tutaj będą tabele z db.session.sql