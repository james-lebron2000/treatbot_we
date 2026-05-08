/**
 * Q3-红线 §B.2：漏斗埋点接收端 POST /api/track
 *
 * 关键约束：
 *   - 不要求登录（路由放在 public 段）。匿名走 anon_id（前端 localStorage uuid）。
 *   - event 必须命中白名单 EVENTS，否则 400。
 *   - metadata JSON 序列化后 <= 2KB，超出 400。避免被前端误传整张病历。
 *   - 任意失败都是 4xx 或 5xx —— 但前端 utils/track.ts 是 best-effort，吞掉错误，
 *     不影响业务流。
 *   - 写库同时 inc Prometheus counter user_funnel_event_total{event="..."}。
 */
const { z } = require('zod');
const { UserFunnelEvent } = require('../models');
const { userFunnelEventTotal } = require('../middleware/metrics');
const logger = require('../utils/logger');

// Q3-红线 §B.2：事件白名单 —— 与前端 utils/track.ts 一一对应
const EVENTS = [
  'landing_view',
  'upload_start',
  'upload_success',
  'match_view',
  'trial_apply',
  'application_submitted',
  // Plan §Phase 3.2：客户端模糊度 advisory（用于阈值校准）
  'client_blur_advisory'
];

const METADATA_MAX_BYTES = 2048;

const trackSchema = z.object({
  event: z.string().min(1).max(32),
  anonId: z.string().max(64).optional().nullable(),
  metadata: z.union([z.record(z.any()), z.null(), z.undefined()]).optional()
});

const clientIp = (req) => {
  const raw = (req.headers['x-forwarded-for'] || req.ip || '').toString().split(',')[0].trim();
  return raw.slice(0, 64);
};

const track = async (req, res) => {
  try {
    const parsed = trackSchema.safeParse(req.body || {});
    if (!parsed.success) {
      return res.fail('参数不合法', 400);
    }
    const { event, anonId, metadata } = parsed.data;

    if (!EVENTS.includes(event)) {
      return res.fail('event 不在白名单内', 400);
    }

    let metadataObj = null;
    if (metadata && typeof metadata === 'object') {
      let serialized;
      try {
        serialized = JSON.stringify(metadata);
      } catch (e) {
        return res.fail('metadata 无法序列化', 400);
      }
      // Buffer.byteLength 给 utf-8 真实字节数，避免中文按字符数被低估
      if (Buffer.byteLength(serialized, 'utf8') > METADATA_MAX_BYTES) {
        return res.fail('metadata 超过 2KB 上限', 400);
      }
      metadataObj = metadata;
    }

    // userId 由 authMiddleware 注入；本路由放在 public 段，没装中间件，因此正常为 undefined。
    // 若上游网关已挂 token 解析，也兼容直接读 req.userId。
    const userId = req.userId || (req.user && req.user.id) || null;

    await UserFunnelEvent.create({
      user_id: userId || null,
      anon_id: anonId || null,
      event,
      metadata: metadataObj,
      ip: clientIp(req),
      user_agent: (req.headers['user-agent'] || '').toString().slice(0, 255)
    });

    try {
      userFunnelEventTotal.labels(event).inc();
    } catch (e) {
      // 指标失败不能阻断写库结果
      logger.warn('[funnel] metric inc 失败', { event, error: e.message });
    }

    return res.ok({ accepted: true });
  } catch (err) {
    logger.warn('[funnel] track 写库失败', { error: err.message });
    return res.fail('内部错误', 500);
  }
};

module.exports = {
  track,
  // 暴露给测试 / 后续聚合任务
  EVENTS,
  METADATA_MAX_BYTES
};
