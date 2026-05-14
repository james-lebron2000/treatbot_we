-- PRD-2026Q3 T1-3：多病历 active 切换
-- 加列；回填每个用户最新一条 completed 记录为 active=1。
-- 单一 active 由应用层 activateRecord 在事务内保证（MySQL 部分唯一索引不直接支持，
-- 模拟方案 = 事务串行 + UPDATE WHERE is_active=1 → INSERT new active）。

ALTER TABLE medical_records
  ADD COLUMN is_active TINYINT(1) NOT NULL DEFAULT 0
  COMMENT 'PRD-2026Q3 T1-3：当前用作匹配基线的 active 病历，每用户唯一 1 条';

-- 回填：每个用户的最新一条非删除 completed 记录设为 active
UPDATE medical_records mr
JOIN (
  SELECT user_id, MAX(created_at) AS max_created
  FROM medical_records
  WHERE deleted_at IS NULL AND status = 'completed'
  GROUP BY user_id
) latest
  ON latest.user_id = mr.user_id AND latest.max_created = mr.created_at
SET mr.is_active = 1
WHERE mr.deleted_at IS NULL AND mr.status = 'completed';

-- 索引：matches 主路径 WHERE user_id=? AND is_active=1 → 走联合索引能避免回表
CREATE INDEX idx_user_active ON medical_records (user_id, is_active);
