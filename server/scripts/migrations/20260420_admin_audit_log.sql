-- PRD-2026Q2 §2.3：Admin 操作审计日志表
-- 记录管理员的读/查询/脱敏揭示等操作，供合规审计与泄露排查回溯使用。
CREATE TABLE IF NOT EXISTS admin_audit_log (
  id BIGINT NOT NULL AUTO_INCREMENT,
  admin_id VARCHAR(64) NOT NULL COMMENT '执行操作的管理员 user id',
  action VARCHAR(64) NOT NULL COMMENT '操作类型，如 view_users / reveal_field_phone',
  target_type VARCHAR(32) NULL COMMENT '目标资源类型：user / record / application',
  target_id VARCHAR(64) NULL COMMENT '目标资源 id',
  query_summary TEXT NULL COMMENT '查询摘要：JSON.stringify({query, params, bodyKeys}) 截 1000 字',
  ip VARCHAR(64) NULL COMMENT '来源 IP',
  user_agent VARCHAR(255) NULL COMMENT 'User-Agent 原文',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_admin_created (admin_id, created_at),
  KEY idx_target (target_type, target_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='Admin 审计日志';
