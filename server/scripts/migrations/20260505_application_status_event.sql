-- PRD-2026Q3 T0-2：申请状态机事件表
-- 每次 transition() 写一行，作为 CPA 计费 (T1-4)、转化漏斗、SLA 时长统计的唯一事实源。
-- 同时把 trial_applications.status 的合法集合扩到包含 'screened' 与 'withdrawn'。

CREATE TABLE IF NOT EXISTS application_status_event (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  application_id VARCHAR(64) NOT NULL,
  from_status VARCHAR(32) NOT NULL,
  to_status VARCHAR(32) NOT NULL,
  actor_type ENUM('user', 'cro', 'admin', 'system') NOT NULL,
  actor_id VARCHAR(64) NULL,
  reason TEXT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_app_created (application_id, created_at),
  KEY idx_to_status_created (to_status, created_at),
  KEY idx_actor (actor_type, actor_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='申请状态变更事件流，是 CPA 计费的唯一事实源';

-- 扩展 trial_applications.status 枚举：加 'screened' 与 'withdrawn'
-- （历史已存在 'cancelled' 表示用户取消，这里语义上等价于 'withdrawn'，
--  保留 'cancelled' 不破坏存量数据；新流转应优先使用 'withdrawn'）。
-- 注意：MySQL 改 ENUM 需要用 MODIFY COLUMN，整列重写。
-- 应用层兼容：cancelled 与 withdrawn 在状态机里同义。
ALTER TABLE trial_applications
  MODIFY COLUMN status ENUM('pending', 'contacted', 'screened', 'enrolled', 'rejected', 'cancelled', 'withdrawn')
  NOT NULL DEFAULT 'pending';
