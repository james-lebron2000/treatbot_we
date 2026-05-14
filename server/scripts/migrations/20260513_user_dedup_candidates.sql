-- PRD-2026Q4 T0-7: 用户重复候选表
-- 由 scan-duplicate-users.js 写入；运营人工 review 后置 status=merged|rejected。
CREATE TABLE IF NOT EXISTS user_dedup_candidates (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  user_a_id VARCHAR(64) NOT NULL,
  user_b_id VARCHAR(64) NOT NULL,
  matched_field ENUM('phone','id_card') NOT NULL,
  normalized_value VARCHAR(64) NOT NULL,
  similarity_score DECIMAL(3,2) DEFAULT 1.00,
  status ENUM('pending','merged','rejected') DEFAULT 'pending',
  reviewed_by VARCHAR(64),
  reviewed_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_pair (user_a_id, user_b_id, matched_field),
  INDEX idx_status (status, created_at)
);
