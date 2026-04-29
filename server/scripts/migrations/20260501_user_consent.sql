-- Q3-红线 §A.2：用户合规 —— 同意记录表（consent log）
-- 一行一次"用户在某 policy_version 下同意了某 scope"，幂等去重在
-- 应用层做（POST /api/me/consent 同 user+version+scope 已存在则 noop）。
-- 设计要点：
--   - policy_version 字符串：方便后续策略文案改版后 force re-prompt（值如 'v2026Q3-1'）
--   - scope ENUM：upload（病历上传 + AI 解析）/ match（匹配引擎）/ share_with_cro（联络 CRO）
--   - ip + user_agent 用于法务追溯，长度截断
-- 幂等说明：MySQL 8 的 CREATE TABLE 不支持 IF NOT EXISTS 的幂等列；
-- 本脚本已跑过请跳过（migrate.js 的 ensureUserConsentTable 也能幂等补齐）。

CREATE TABLE user_consent (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id VARCHAR(64) NOT NULL,
  policy_version VARCHAR(32) NOT NULL,
  scope ENUM('upload','match','share_with_cro') NOT NULL,
  agreed_at DATETIME NOT NULL,
  ip VARCHAR(64),
  user_agent VARCHAR(255),
  INDEX idx_user_scope (user_id, scope),
  INDEX idx_user_version (user_id, policy_version)
);
