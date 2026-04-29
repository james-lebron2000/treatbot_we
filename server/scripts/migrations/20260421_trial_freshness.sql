-- PRD-2026Q2 §2.4：试验新鲜度（freshness）支持
-- 幂等说明：MySQL 8 的 ALTER TABLE ADD COLUMN 不支持 IF NOT EXISTS；
-- 本脚本已跑过请跳过（通过 ensureTrialFreshnessColumns 也能幂等补齐）。
-- 字段含义：
--   last_verified_at  最后一次被 crawler / CRO 确认仍在招募的时间（用于衰减）
--   freshness_score   0-100 软分值；30 以下视为过期
-- 索引 (status,last_verified_at) 加速每日巡检查询"招募中 + 过期"。

ALTER TABLE trials
  ADD COLUMN last_verified_at DATETIME NULL COMMENT '最后确认在招时间',
  ADD COLUMN freshness_score TINYINT DEFAULT 100 COMMENT '新鲜度 0-100';

CREATE INDEX idx_trials_status_verified
  ON trials (status, last_verified_at);
