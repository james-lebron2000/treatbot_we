-- Plan §Phase 3.1：MedicalRecord 增加 cancelled_at 列。
-- 用途：让用户在 OCR 跑到一半时主动按"取消"键，worker 阶段切换前 check 此字段、
-- 不为 NULL 即提前 return；同时 SSE 推 'cancelled' 事件让客户端立即收线。
-- 字段语义：
--   NULL                    → 未取消（pending / running / completed / error 正常态）
--   <timestamp>             → 用户在 <timestamp> 主动取消；worker 应停止后续 LLM 调用
-- 不动 status ENUM —— 用 cancelled_at 作 sidecar 字段，避免 MySQL ENUM MODIFY 的开销。
-- 与 deleted_at 互不互斥：handleAbortRecord 对 pending 记录会同时 set 两者；
-- 对 running 只 set cancelled_at（保留记录在用户列表里，便于追溯）。

ALTER TABLE medical_records
  ADD COLUMN cancelled_at DATETIME NULL COMMENT 'Plan §Phase 3.1 用户主动取消时间戳，NULL=未取消';
