-- PRD-2026Q4 T0-1：试验字段变更人工复核队列
--
-- 背景（医学专家定级 Grade 4 患者安全风险）：
--   ClinicalTrials.gov 上游偶发字段 null（schema 变更 / 上游 bug / 网络截断），
--   旧 crawler 直接 trial.update({ status: null })，把库内"recruiting"刷成 null，
--   导致已关闭试验仍向晚期患者推荐，延误治疗。
--
-- 本表用途：
--   crawler.diffAndApply 检出"上游 null + 库内非 null"时，不直接覆盖，
--   而是写入本表（status='pending'）等运营手动复核：
--     - 确认上游真的关停了 → 点 approve，应用 new_value=null；
--     - 上游字段抽风 → 点 reject，库内值保持。
--
-- 字段：
--   trial_id        — 内部 trial.id
--   nct_id          — ClinicalTrials.gov NCT 号
--   field           — 待复核字段名（status / phase / enrolled_count / locations）
--   old_value       — 复核前库内值（JSON，含字符串 / 数组 / 数值通用）
--   new_value       — 上游想覆盖的新值（JSON，通常为 null）
--   null_source     — explicit=上游 JSON 显式 null；missing=字段不存在
--   change_kind     — 当前固定 'suspect_null_from_upstream'，未来可拓展
--   status          — pending / approved / rejected
--   reviewer_id     — 复核 admin username
--   reviewed_at     — 复核时刻
--   reviewer_note   — 复核备注（≤512 字）
--   created_at      — 入队时刻

CREATE TABLE IF NOT EXISTS trial_field_change_review (
  id BIGINT NOT NULL AUTO_INCREMENT,
  trial_id VARCHAR(64) NOT NULL,
  nct_id VARCHAR(32) NULL,
  field VARCHAR(64) NOT NULL,
  old_value JSON NULL,
  new_value JSON NULL,
  null_source ENUM('explicit', 'missing') NULL,
  change_kind VARCHAR(64) NOT NULL,
  status ENUM('pending', 'approved', 'rejected') NOT NULL DEFAULT 'pending',
  reviewer_id VARCHAR(64) NULL,
  reviewed_at DATETIME NULL,
  reviewer_note VARCHAR(512) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_status_created (status, created_at),
  KEY idx_trial_field (trial_id, field)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='试验字段变更人工复核队列（PRD-2026Q4 T0-1）';
