-- Migration: Remove `ocr_engine` column from `users` table
-- This script safely drops the column if it exists in the current database.

-- Check if the column exists in the current schema
SET @exists := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'users'
    AND COLUMN_NAME = 'ocr_engine'
);

-- Build the appropriate SQL statement
SET @sql := IF(@exists > 0,
  'ALTER TABLE `users` DROP COLUMN `ocr_engine`',
  'SELECT 1'
);

-- Execute the statement
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- End of migration