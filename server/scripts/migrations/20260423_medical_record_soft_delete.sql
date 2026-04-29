-- PRD-2026Q2 §3.5：多病历管理页 —— 软删除支持
-- 幂等说明：MySQL 8 的 ALTER TABLE ADD COLUMN 不支持 IF NOT EXISTS；
-- 本脚本已跑过请跳过（migrate.js 的 ensureMrCol 也能幂等补齐）。
-- 字段含义：
--   deleted_at  软删除时间戳；所有面向用户的 list / find 都过滤 IS NULL。
-- 索引 (user_id, deleted_at) 加速"某用户的未删除病历"主路径查询。

ALTER TABLE medical_records
  ADD COLUMN deleted_at DATETIME NULL COMMENT '软删除时间戳，NULL=有效';

CREATE INDEX idx_user_deleted
  ON medical_records (user_id, deleted_at);
