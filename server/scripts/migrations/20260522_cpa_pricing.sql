-- PRD-2026Q3 T1-4：CRO CPA 计费配置
--
-- cro_companies 增补两列：
--   cpa_price             — 每条合格线索单价（元，DECIMAL(10,2)）
--   cpa_qualified_status  — 哪个 status 触发计费（'screened' 或 'enrolled'）
--
-- 计费链路：
--   1) applicationStateMachine.transition() 写 application_status_event
--   2) billing.computeMonthly(month) 按 (cro_id, trial_id) 聚合 to_status === cpa_qualified_status 的事件
--   3) GET /api/admin/billing/summary 返回月度账单，与人工 SQL 对账
--
-- 默认 cpa_price=0 → 老 CRO 不被自动计费，运营按合同手动写入。
-- 默认 cpa_qualified_status='screened' → 当前主流商务模式（CRO 沟通成功即结算）。

ALTER TABLE cro_companies
  ADD COLUMN cpa_price DECIMAL(10,2) NOT NULL DEFAULT 0 COMMENT '每条合格线索单价（元）',
  ADD COLUMN cpa_qualified_status ENUM('screened','enrolled') NOT NULL DEFAULT 'screened' COMMENT 'CPA 计费触发的合格状态';
