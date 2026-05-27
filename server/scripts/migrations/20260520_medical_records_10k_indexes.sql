-- OCR streaming/read-path hardening for 10k DAU.
-- MySQL has no portable CREATE INDEX IF NOT EXISTS, so use INFORMATION_SCHEMA
-- guards to keep this migration repeatable.

SET @has_idx_record_user_status_deleted_created := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = 'medical_records'
     AND INDEX_NAME = 'idx_record_user_status_deleted_created'
);
SET @sql := IF(
  @has_idx_record_user_status_deleted_created = 0,
  'CREATE INDEX idx_record_user_status_deleted_created ON medical_records (user_id, status, deleted_at, created_at)',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @has_idx_record_user_hash_deleted := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = 'medical_records'
     AND INDEX_NAME = 'idx_record_user_hash_deleted'
);
SET @sql := IF(
  @has_idx_record_user_hash_deleted = 0,
  'CREATE INDEX idx_record_user_hash_deleted ON medical_records (user_id, file_hash, deleted_at)',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- MySQL UNIQUE indexes allow multiple NULL values, so the old
-- UNIQUE(user_id, file_hash, deleted_at) pattern does not protect active
-- rows where deleted_at IS NULL. A generated live hash gives direct-upload
-- create races a real unique guard while still allowing re-upload after
-- soft delete.
SET @has_live_file_hash := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = 'medical_records'
     AND COLUMN_NAME = 'live_file_hash'
);
SET @sql := IF(
  @has_live_file_hash = 0,
  'ALTER TABLE medical_records ADD COLUMN live_file_hash VARCHAR(64) GENERATED ALWAYS AS (CASE WHEN deleted_at IS NULL THEN file_hash ELSE NULL END) STORED',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @has_uniq_record_user_live_hash := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = 'medical_records'
     AND INDEX_NAME = 'uniq_record_user_live_hash'
);
SET @sql := IF(
  @has_uniq_record_user_live_hash = 0,
  'CREATE UNIQUE INDEX uniq_record_user_live_hash ON medical_records (user_id, live_file_hash)',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
