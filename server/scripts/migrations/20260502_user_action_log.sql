-- Q3-红线 §A.2：用户操作审计日志（与 admin_audit_log 分表，避免污染 admin 视图）
-- 写入触发点：
--   - export_my_data：GET /api/me/export 成功一次写一行
--   - delete_account_request：POST /api/me/delete-account 第一步发短信
--   - delete_account_executed：POST /api/me/delete-account 第二步事务完成
--   - change_password：POST /api/me/change-password 成功
-- metadata 用 JSON：放 recordCount / applicationCount 等可聚合的统计字段；
-- 不要落明文敏感字段（手机号、密码 hash 等都禁止）。

CREATE TABLE user_action_log (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id VARCHAR(64) NOT NULL,
  action VARCHAR(64) NOT NULL,
  metadata JSON,
  ip VARCHAR(64),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_user_action (user_id, action),
  INDEX idx_action_created (action, created_at)
);
