-- Treatbot OCR case profile tables.
-- Keeps medical_records as the source of raw file OCR results, and adds a
-- user-level case profile/version/revision/evidence layer.

SET @has_batch_id := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'medical_records' AND COLUMN_NAME = 'batch_id'
);
SET @sql := IF(@has_batch_id = 0, 'ALTER TABLE medical_records ADD COLUMN batch_id VARCHAR(64) NULL', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @has_case_id := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'medical_records' AND COLUMN_NAME = 'case_id'
);
SET @sql := IF(@has_case_id = 0, 'ALTER TABLE medical_records ADD COLUMN case_id VARCHAR(64) NULL', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @has_idx_batch := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'medical_records' AND INDEX_NAME = 'idx_medical_records_batch_id'
);
SET @sql := IF(@has_idx_batch = 0, 'CREATE INDEX idx_medical_records_batch_id ON medical_records (batch_id)', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @has_idx_case := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'medical_records' AND INDEX_NAME = 'idx_medical_records_case_id'
);
SET @sql := IF(@has_idx_case = 0, 'CREATE INDEX idx_medical_records_case_id ON medical_records (case_id)', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

CREATE TABLE IF NOT EXISTS upload_batches (
  id VARCHAR(64) PRIMARY KEY,
  user_id VARCHAR(64) NOT NULL,
  record_ids JSON NOT NULL,
  total_count INT NOT NULL DEFAULT 0,
  processed_count INT NOT NULL DEFAULT 0,
  success_count INT NOT NULL DEFAULT 0,
  failed_count INT NOT NULL DEFAULT 0,
  status VARCHAR(24) NOT NULL DEFAULT 'pending',
  started_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at DATETIME NULL,
  metadata JSON NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_upload_batch_user_created (user_id, created_at),
  INDEX idx_upload_batch_status (status, created_at)
);

CREATE TABLE IF NOT EXISTS medical_cases (
  id VARCHAR(64) PRIMARY KEY,
  user_id VARCHAR(64) NOT NULL,
  active_version_id VARCHAR(64) NULL,
  status VARCHAR(24) NOT NULL DEFAULT 'active',
  active_user_id VARCHAR(64) GENERATED ALWAYS AS (CASE WHEN status = 'active' THEN user_id ELSE NULL END) STORED,
  entities JSON NULL,
  summary JSON NULL,
  source_record_ids JSON NOT NULL,
  completeness JSON NULL,
  validation_issues JSON NULL,
  normalized_tags JSON NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_medical_cases_one_active_user (active_user_id),
  INDEX idx_medical_case_user_status (user_id, status),
  INDEX idx_medical_case_updated (updated_at)
);

CREATE TABLE IF NOT EXISTS medical_case_versions (
  id VARCHAR(64) PRIMARY KEY,
  case_id VARCHAR(64) NOT NULL,
  user_id VARCHAR(64) NOT NULL,
  version_no INT NOT NULL,
  entities JSON NOT NULL,
  summary JSON NULL,
  source_record_ids JSON NOT NULL,
  completeness JSON NULL,
  validation_issues JSON NULL,
  normalized_tags JSON NULL,
  metadata JSON NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_case_version_case_no (case_id, version_no),
  INDEX idx_case_version_user_created (user_id, created_at)
);

CREATE TABLE IF NOT EXISTS medical_case_revisions (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  case_id VARCHAR(64) NOT NULL,
  user_id VARCHAR(64) NOT NULL,
  field_key VARCHAR(96) NOT NULL,
  old_value JSON NULL,
  new_value JSON NULL,
  reason VARCHAR(255) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_case_revision_case_field (case_id, field_key),
  INDEX idx_case_revision_user_created (user_id, created_at)
);

CREATE TABLE IF NOT EXISTS medical_field_evidence (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  case_id VARCHAR(64) NOT NULL,
  user_id VARCHAR(64) NOT NULL,
  field_key VARCHAR(96) NOT NULL,
  value JSON NULL,
  source_record_id VARCHAR(64) NOT NULL,
  confidence FLOAT NULL,
  snippet TEXT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_field_evidence_case_field (case_id, field_key),
  INDEX idx_field_evidence_record (source_record_id)
);

-- Existing installs may already have duplicate active cases from concurrent
-- first uploads. Keep the newest active row per user before adding the
-- generated-column unique guard.
UPDATE medical_cases older
JOIN medical_cases newer
  ON newer.user_id = older.user_id
 AND newer.status = 'active'
 AND older.status = 'active'
 AND (
   newer.updated_at > older.updated_at
   OR (newer.updated_at = older.updated_at AND newer.id > older.id)
 )
   SET older.status = 'superseded'
 WHERE older.status = 'active';

SET @has_active_user_id := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'medical_cases' AND COLUMN_NAME = 'active_user_id'
);
SET @sql := IF(
  @has_active_user_id = 0,
  'ALTER TABLE medical_cases ADD COLUMN active_user_id VARCHAR(64) GENERATED ALWAYS AS (CASE WHEN status = ''active'' THEN user_id ELSE NULL END) STORED',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @has_uniq_active_case := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'medical_cases' AND INDEX_NAME = 'uniq_medical_cases_one_active_user'
);
SET @sql := IF(
  @has_uniq_active_case = 0,
  'CREATE UNIQUE INDEX uniq_medical_cases_one_active_user ON medical_cases (active_user_id)',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Re-number legacy duplicate version_no values per case before the unique
-- guard is created. This preserves order and makes reruns no-op.
SET @has_uniq_case_version := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'medical_case_versions' AND INDEX_NAME = 'uniq_case_version_case_no'
);
SET @sql := IF(
  @has_uniq_case_version = 0,
  'UPDATE medical_case_versions v JOIN (SELECT ordered.id, @version_rn := IF(@version_case_id = ordered.case_id, @version_rn + 1, 1) AS next_no, @version_case_id := ordered.case_id AS assigned_case_id FROM (SELECT id, case_id FROM medical_case_versions ORDER BY case_id, version_no, created_at, id) ordered JOIN (SELECT @version_case_id := '''', @version_rn := 0) vars) ranked ON ranked.id = v.id SET v.version_no = ranked.next_no WHERE v.version_no <> ranked.next_no',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := IF(
  @has_uniq_case_version = 0,
  'CREATE UNIQUE INDEX uniq_case_version_case_no ON medical_case_versions (case_id, version_no)',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
