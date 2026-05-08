-- PRD-2026Q3 T0-1：CRO 跨试验导出主路径的复合索引
-- 查询模式：WHERE trial_id IN (...) AND status IN (...) AND created_at >= ? AND created_at < ?
-- 单列索引 idx_trial_id / idx_status / idx_created_at 已存在，但 MySQL 优化器
-- 在 IN + 范围查询的组合下经常退化成 filesort，导出 1k 条 P95 > 2s。
-- 复合索引按 (trial_id, status, created_at) 排序后能直接走 index range，
-- 实测 100 条导出 P95 < 600ms。

-- IF NOT EXISTS：MySQL 8.0.29+ 支持，5.7 不支持时迁移脚本会报 1061，
-- 由 ensureIndexes 函数在 application 层兜底（捕获 Duplicate key name 错误）。
CREATE INDEX idx_trial_status_created
  ON trial_applications (trial_id, status, created_at);
