-- PRD-2026Q3 T1-1：试验抓取变更日志
--
-- 每次 trialCrawler.run() 发现 trials 字段差异时写一行：
--   trial_id        — 内部 trial.id
--   nct_id          — ClinicalTrials.gov 的 NCT 号（来源标识）
--   field           — 变更字段（status / phase / enrolled_count / locations 等）
--   old_value       — 变更前（截短到 1024）
--   new_value       — 变更后
--   source          — 数据源（默认 'clinicaltrials_v2'，将来可拓展 chictr）
--   created_at      — 变更检出时刻
--
-- 用途：
--   1) admin /admin/trials/health 拉最近 30 条做"变更日志"
--   2) 申诉留痕："你这 trial 上周还在招，今天怎么 closed 了？" → 直接给 changelog
--   3) 计费防扯皮：trial 中途 status 变化导致计费截止日的取证

CREATE TABLE IF NOT EXISTS trial_change_log (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  trial_id VARCHAR(64) NOT NULL,
  nct_id VARCHAR(32) NULL,
  field VARCHAR(64) NOT NULL,
  old_value VARCHAR(1024) NULL,
  new_value VARCHAR(1024) NULL,
  source VARCHAR(32) NOT NULL DEFAULT 'clinicaltrials_v2',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_trial_created (trial_id, created_at),
  KEY idx_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='试验数据抓取变更日志（PRD-2026Q3 T1-1）';

-- trials 表补 nct_id 列（来源标识，crawler 通过此列回查上游）
ALTER TABLE trials
  ADD COLUMN IF NOT EXISTS nct_id VARCHAR(32) NULL COMMENT 'ClinicalTrials.gov 注册号',
  ADD INDEX IF NOT EXISTS idx_nct_id (nct_id);
