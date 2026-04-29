-- Q3-红线 §B.2：端到端业务漏斗埋点事件表
-- 写入触发点（白名单）：
--   landing_view         首屏访问（匿名也写）
--   upload_start         点上传按钮（pre-API）
--   upload_success       后端 200 后
--   match_view           匹配页加载完成
--   trial_apply          点报名按钮
--   application_submitted 报名成功 callback
-- 设计要点：
--   - user_id 与 anon_id 同时允许 NULL：登录前用 anon_id（浏览器 localStorage uuid）；
--     登录后用 user_id；两者并存以做漏斗 join。
--   - metadata JSON：放路径 / trialId / recordId 等可聚合字段；上限 2KB（应用层校验）。
--   - 索引 (event, created_at) 支撑 "某事件最近 24h 数量" 主查询；
--     索引 (user_id, created_at) 支撑 "某用户漏斗回放"。

CREATE TABLE user_funnel_event (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id VARCHAR(64) NULL,
  anon_id VARCHAR(64) NULL,
  event VARCHAR(32) NOT NULL,
  metadata JSON NULL,
  ip VARCHAR(64),
  user_agent VARCHAR(255),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_event_created (event, created_at),
  INDEX idx_user (user_id, created_at)
);
