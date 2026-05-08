-- PRD-2026Q4 T0-10：转化漏斗埋点基础设施
-- 与 user_funnel_event（Q3-红线 §B.2，前端 /api/track 写入）解耦：
--   - user_funnel_event：前端浏览/匿名行为埋点，允许 user_id NULL
--   - funnel_event（本表）：后端业务事件埋点（病历上传、申请、CRO 推进），
--     主要供漏斗指标计算与 Grafana 仪表盘使用
-- dedupe_key 在 services/funnelTracker.js 内按分钟粒度生成，UNIQUE 约束兜底
-- 防止 Bull 重试或队列双投递造成重复入库。
CREATE TABLE IF NOT EXISTS funnel_event (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  event_name VARCHAR(64) NOT NULL,
  user_id VARCHAR(64),
  entity_id VARCHAR(64),
  payload JSON,
  occurred_at DATETIME(6) NOT NULL,
  dedupe_key VARCHAR(128) NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_dedupe (dedupe_key),
  INDEX idx_event_occurred (event_name, occurred_at),
  INDEX idx_user_event (user_id, event_name)
);
