-- Plan §Phase 3.5（deferred）：微信订阅消息预埋表
--
-- 上线前置：模板 ID 由微信公众平台审批，**未通过前不调 send 接口**；
-- 该表先建好，等模板 ID 拿到后只需补 12 行 axios 调用 即可（见
-- docs/notification-subscribe.md）。
--
-- 写入触发：客户端 wx.requestSubscribeMessage 用户点"允许" → 上报
--   POST /medical/subscribe-intent { recordId, tmplId } → 服务端 upsert 一行；
--   主键拒绝 (user_id, record_id, tmpl_id) 重复写。
--
-- 消费触发：runOcrTask 完成后 server/services/queue.js:notificationQueue 消费者
--   按 record_id 反查 subscribe_intents.granted_at IS NOT NULL 的所有 (user, tmpl)，
--   逐一调微信 subscribe/send；写完置 sent_at。
--
-- 注意：微信 "一次性订阅" 语义 —— 每次用户点"允许"才能发一条；本表的 granted_at
--   表示"用户最近一次为该 record × tmpl 同意"；sent_at 后该行作废，下次发送
--   需要新一行（即使 user/record/tmpl 三元组相同 —— 因此唯一索引含 granted_at 月份）。

CREATE TABLE subscribe_intents (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id VARCHAR(64) NOT NULL,
  record_id VARCHAR(64) NOT NULL,
  tmpl_id VARCHAR(64) NOT NULL COMMENT '微信订阅消息模板 ID（审批后下发）',
  granted_at DATETIME NOT NULL COMMENT '用户在客户端点击"允许"的时间',
  sent_at DATETIME NULL COMMENT '实际发送成功时间；NULL 代表未发送',
  send_error VARCHAR(255) NULL COMMENT '发送失败时记录最近一次错误，便于回查',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_record_pending (record_id, sent_at),
  INDEX idx_user_granted (user_id, granted_at)
);
