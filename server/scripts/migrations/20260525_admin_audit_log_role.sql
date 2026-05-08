-- PRD-2026Q3 T1-6：admin_audit_log 增加 role 列
-- 写入时记录操作者的角色快照，避免：
--   1) admin 离职 + username 复用导致历史审计语义错乱；
--   2) RBAC 矩阵变更后无法判断"当时的权限模型是什么样"。
-- 列允许 NULL（历史记录无法回填）；新写入由 middleware/auditLog.js 自动填充。

ALTER TABLE admin_audit_log
  ADD COLUMN role VARCHAR(32) NULL COMMENT '操作时的角色：super / ops / cro_liaison'
  AFTER admin_id;

-- 角色筛选索引，配合管理员后台「按角色筛 + 时间倒排」的常见查询。
-- 用 IF NOT EXISTS 避免重复 apply 报错（MySQL 8.0+ 才支持，旧版本失败可手动忽略）。
CREATE INDEX IF NOT EXISTS idx_role_created ON admin_audit_log (role, created_at);
