-- Plan §Phase 1.3：MedicalRecord 增加 status_phase 列。
-- 用途：把 status='running' 这一段 90s 的窗口细化成 4 个子阶段（queued / analyzing / streaming / structuring），
-- 让客户端进度条能从"卡 1% 静默 10-20s"的体感漏洞里走出来，看到分阶段推进。
-- 字段语义：
--   NULL          → 不在处理或处于终态（pending/completed/error），不展示子阶段
--   'queued'      → 已入 Bull 队列，等待 worker 拉起（≤ 25%）
--   'analyzing'   → 进入 LLM 调用主流程（55%）
--   'streaming'   → 流式返回 partial JSON（75%）
--   'structuring' → 抽取完成、最终 schema 校验+ entities 合并（90%）
-- 不动现有 status ENUM；mapParseStatus 优先取 status_phase，缺失则按 status 兜底。
-- 幂等：MySQL 8 的 ADD COLUMN 不支持 IF NOT EXISTS；migrate.js 的 ensureMrCol 已能幂等补齐。

ALTER TABLE medical_records
  ADD COLUMN status_phase VARCHAR(24) DEFAULT NULL COMMENT 'Plan §Phase 1.3 子阶段细化：queued/analyzing/streaming/structuring';
