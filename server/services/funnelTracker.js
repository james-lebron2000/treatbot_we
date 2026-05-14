/**
 * PRD-2026Q4 T0-10：转化漏斗埋点基础设施。
 *
 * 这是 P0 前置任务 —— 量化所有其它 P0 修复效果（增加上传成功率 / 提升匹配-申请转化等）
 * 都依赖本模块的事件流。
 *
 * ## 8 个事件枚举（EVENTS）
 *   MEDICAL_UPLOADED       病历上传完成（OCR 解析阶段才埋，目前在 controller 层 best-effort 触发）
 *   MATCH_SHOWN            匹配结果首次返回给客户端
 *   APPLICATION_SUBMITTED  用户提交报名（去重后真正写入数据库的那一刻）
 *   CRO_CONTACTED          CRO/Admin 把状态推进为 contacted
 *   SCREENED               进入筛选阶段（status=screened，扩展状态机后启用）
 *   ENROLLED               入组成功
 *   REJECTED               不符合 / 排除
 *   WITHDRAWN              用户主动退出（status=withdrawn）
 *
 * ## dedupe_key 设计
 *   `${event_name}:${user_id}:${entity_id}:${minute_truncated}`
 *
 *   语义：同一个用户在同一分钟内对同一实体的同一事件视为单次。
 *   - 防 Bull 重试导致重复入库（attempts > 1 时 worker 可能写两遍）
 *   - 防业务侧手抖触发（双击提交 / 客户端轮询触发埋点）
 *   - DB 端 UNIQUE(dedupe_key) 是终极兜底：即使应用层逻辑漏了，DB 也不会写入两条。
 *
 * ## 异步队列设计
 *   track() → enqueue Bull → worker → FunnelEvent.create({ ignoreDuplicates: true })
 *   - Bull repeatable cron 不需要：本队列纯粹是异步落库管道，不做调度
 *   - attempts=3，指数退避；最终失败计入 funnel_event_drop_total{reason=dlq}
 *   - 异步埋点失败 100% 不能影响主业务流程：所有 enqueue 都包在 try/catch 里，
 *     失败仅 logger.warn + drop counter，绝不抛错给上游
 *
 * ## 测试钩子 _setQueue
 *   单测里直接注入 mock 队列，避免依赖 Redis；参考 clinicalTrialsClient._setHttpClient 的写法。
 */

const logger = require('../utils/logger');

// 8 个事件枚举常量（事件名也是 funnel_event.event_name 的取值集合）
const EVENTS = Object.freeze({
  MEDICAL_UPLOADED: 'medical_uploaded',
  MATCH_SHOWN: 'match_shown',
  APPLICATION_SUBMITTED: 'application_submitted',
  CRO_CONTACTED: 'cro_contacted',
  SCREENED: 'screened',
  ENROLLED: 'enrolled',
  REJECTED: 'rejected',
  WITHDRAWN: 'withdrawn'
});

// 模块级状态：可被 _setQueue 替换，便于单测注入
let _queue = null;
let _queueInitTried = false;

const QUEUE_NAME = 'funnel_event_queue';
const JOB_ATTEMPTS = 3;
const JOB_BACKOFF_DELAY = 2000; // 2s 起步指数退避，4s / 8s

/**
 * 懒初始化 Bull 队列。撞 Redis 不可用时立即降级为 null，调用方走 drop 路径。
 *
 * 与 services/queue.js / jobs/trialFreshnessJob.js 保持同样的 Redis 配置策略：
 *   maxRetriesPerRequest:1 + connectTimeout:3000，避免 ioredis 内部死循环重连
 *   把进程拖死。本模块的失败语义：宁可丢埋点，绝不阻塞业务。
 */
const initQueue = () => {
  if (_queue || _queueInitTried) return _queue;
  _queueInitTried = true;
  try {
    const Queue = require('bull');
    const redisConfig = {
      host: process.env.REDIS_HOST || 'localhost',
      port: process.env.REDIS_PORT || 6379,
      password: process.env.REDIS_PASSWORD || undefined,
      maxRetriesPerRequest: 1,
      connectTimeout: 3000
    };
    _queue = new Queue(QUEUE_NAME, { redis: redisConfig });
    _queue.on('error', (err) => {
      logger.warn('[funnelTracker] queue error', { error: err.message });
    });
    // 注册 worker：失败重试由 Bull attempts 机制处理；最终失败由下方 'failed' 事件兜底落 DLQ 计数。
    _queue.process(processJob);
    _queue.on('failed', handleJobFailed);
    return _queue;
  } catch (err) {
    logger.warn('[funnelTracker] Bull 初始化失败，埋点改走 drop 计数', { error: err.message });
    _queue = null;
    return null;
  }
};

/**
 * worker 处理函数（导出供单测直接调用，验证 ignoreDuplicates 行为）。
 */
const processJob = async (job) => {
  const data = job.data || {};
  // 懒 require 避免循环依赖（models/index 在启动时也会 require 本模块的兄弟）
  const { FunnelEvent } = require('../models');
  const metrics = require('../middleware/metrics');

  try {
    await FunnelEvent.create(data, { ignoreDuplicates: true });

    // 指标：成功落库 + 入库延迟（occurred_at → 现在）
    if (metrics.funnelEventTotal && metrics.funnelEventTotal.labels) {
      metrics.funnelEventTotal.labels(data.event_name).inc();
    }
    if (metrics.funnelEventLagSeconds && data.occurred_at) {
      const lagMs = Date.now() - new Date(data.occurred_at).getTime();
      if (Number.isFinite(lagMs) && lagMs >= 0) {
        metrics.funnelEventLagSeconds.observe(lagMs / 1000);
      }
    }
    return { ok: true };
  } catch (err) {
    if (metrics.funnelEventDropTotal && metrics.funnelEventDropTotal.labels) {
      metrics.funnelEventDropTotal.labels('persist_failed').inc();
    }
    logger.warn('[funnelTracker] persist failed', {
      event: data.event_name,
      error: err.message
    });
    throw err; // 让 Bull attempts 重试
  }
};

/**
 * Bull 'failed' 事件：attempts 耗尽后调用，递增 DLQ 计数器。
 * 与 services/queue.js handleOcrJobFailed 同模式，但本模块没有持久化 DLQ 表 ——
 * 漏斗事件丢一两条比 OCR 失败的影响小得多，纯指标足够。
 */
const handleJobFailed = (job, err) => {
  const attemptsMade = (job && job.attemptsMade) || 0;
  const maxAttempts = (job && job.opts && job.opts.attempts) || 0;
  if (!maxAttempts || attemptsMade < maxAttempts) return; // 中途失败：交给 Bull 继续重试
  try {
    const metrics = require('../middleware/metrics');
    if (metrics.funnelEventDropTotal && metrics.funnelEventDropTotal.labels) {
      metrics.funnelEventDropTotal.labels('dlq').inc();
    }
  } catch (_e) { /* metrics 也挂掉就没办法了 */ }
  logger.warn('[funnelTracker] event 入 DLQ', {
    event: job && job.data && job.data.event_name,
    error: err && err.message
  });
};

/**
 * 计算 dedupe_key。
 * 时间戳粒度=分钟：把秒/毫秒抹零再 toISOString，确保同分钟内多次 track 命中同一 key。
 */
const buildDedupeKey = (eventName, userId, entityId, occurredAt) => {
  const dt = occurredAt instanceof Date ? occurredAt : new Date(occurredAt);
  const minute = new Date(dt.getTime());
  minute.setSeconds(0, 0);
  // 形如 'medical_uploaded:user_1:rec_1:2026-05-04T10:23:00.000Z'，再截到 128 字符以内
  const raw = `${eventName}:${userId || '_'}:${entityId || '_'}:${minute.toISOString()}`;
  return raw.length <= 128 ? raw : raw.slice(0, 128);
};

/**
 * 主入口：track 一个事件。
 *
 * 设计契约：
 *  - 永不抛错。任何异常都被 try/catch 兜住 + drop 计数。
 *  - 同步开销极低：仅同步构造 dedupe_key + 一次 queue.add（Bull add 是异步但不阻塞）。
 *  - 真正的写库在 worker 里，不影响调用方延迟。
 *
 * @param {string} eventName  EVENTS 中的某个值
 * @param {object} ctx        { user_id, entity_id, payload, occurred_at }
 *                            occurred_at 缺省 = 现在
 */
const track = (eventName, ctx = {}) => {
  try {
    if (!eventName || !Object.values(EVENTS).includes(eventName)) {
      logger.warn('[funnelTracker] 非法事件名，已丢弃', { eventName });
      return;
    }
    const occurredAt = ctx.occurred_at instanceof Date
      ? ctx.occurred_at
      : (ctx.occurred_at ? new Date(ctx.occurred_at) : new Date());
    const userId = ctx.user_id || null;
    const entityId = ctx.entity_id || null;
    const payload = ctx.payload || null;
    const dedupeKey = buildDedupeKey(eventName, userId, entityId, occurredAt);

    const data = {
      event_name: eventName,
      user_id: userId,
      entity_id: entityId,
      payload,
      occurred_at: occurredAt,
      dedupe_key: dedupeKey
    };

    const q = _queue || initQueue();
    if (!q) {
      // 队列不可用 —— 直接 drop。指标 inc 防止业务漏斗看板出现"零事件"误判。
      try {
        const metrics = require('../middleware/metrics');
        if (metrics.funnelEventDropTotal && metrics.funnelEventDropTotal.labels) {
          metrics.funnelEventDropTotal.labels('enqueue_failed').inc();
        }
      } catch (_e) { /* noop */ }
      return;
    }

    // Bull add 返回 Promise；不等待，避免拖累调用方。
    q.add(data, {
      attempts: JOB_ATTEMPTS,
      backoff: { type: 'exponential', delay: JOB_BACKOFF_DELAY },
      removeOnComplete: 50,
      removeOnFail: 20
    }).catch((err) => {
      try {
        const metrics = require('../middleware/metrics');
        if (metrics.funnelEventDropTotal && metrics.funnelEventDropTotal.labels) {
          metrics.funnelEventDropTotal.labels('enqueue_failed').inc();
        }
      } catch (_e) { /* noop */ }
      logger.warn('[funnelTracker] enqueue 失败（不影响主流程）', {
        event: eventName,
        error: err && err.message
      });
    });
  } catch (err) {
    // 兜底：任何同步异常都吞掉，调用方完全无感
    try {
      const metrics = require('../middleware/metrics');
      if (metrics.funnelEventDropTotal && metrics.funnelEventDropTotal.labels) {
        metrics.funnelEventDropTotal.labels('enqueue_failed').inc();
      }
    } catch (_e) { /* noop */ }
    logger.warn('[funnelTracker] track() 同步异常已吞', {
      eventName,
      error: err && err.message
    });
  }
};

/**
 * 测试钩子：单测里注入 mock 队列，避开 Bull / Redis。
 * 与 clinicalTrialsClient._setHttpClient 同思路。
 */
const _setQueue = (q) => {
  _queue = q;
  _queueInitTried = true;
};

const _resetForTests = () => {
  _queue = null;
  _queueInitTried = false;
};

module.exports = {
  EVENTS,
  track,
  buildDedupeKey,
  // 给单测调用 worker 主体
  __testables: { processJob, handleJobFailed, initQueue },
  _setQueue,
  _resetForTests
};
