-- PRD-2026Q3 T1-1：试验抓取 DLQ
--
-- trialCrawler 单条 trial 抓取失败（HTTP 5xx / parse 异常 / 超时）时入此表，
-- 单独再跑一遍小批 retry。运维在 admin 后台看 "需要人工" 列即知。
--
-- 与 ocr_job_failures 同样模式：每次失败累加 attempt_count；resolved_at
-- 写入则视为已修复（可被运维手工 SQL 标记）。

CREATE TABLE IF NOT EXISTS trial_crawl_failures (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  trial_id VARCHAR(64) NULL,
  nct_id VARCHAR(32) NULL,
  reason VARCHAR(256) NOT NULL,
  payload JSON NULL,
  attempt_count INT UNSIGNED NOT NULL DEFAULT 1,
  last_attempt_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  resolved_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_resolved (resolved_at),
  KEY idx_nct (nct_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='试验抓取失败 DLQ（PRD-2026Q3 T1-1）';
