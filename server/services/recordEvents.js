/**
 * Plan §Phase 2.3：病历状态 Pub/Sub。
 *
 * 设计目标：
 *   - SSE handler 不轮询 DB；OCR worker 状态切换时立即推送给在线 SSE 客户端。
 *   - 单进程多 SSE 连接共享一条 Redis subscriber 连接（避免 100 个用户 = 100 条 sub conn）。
 *   - Redis 不可用时优雅降级：publish/subscribe 都返回 false / null，让上层走轮询兜底，
 *     不阻塞 OCR 主流程。
 *
 * 通道命名：`ocr:record:${recordId}`
 *   - 一条 record 一个 channel；订阅时只订自己关心的几个 recordId，避免广播放大。
 *
 * 引用计数：
 *   - 同一 recordId 有 N 个 SSE 连接 → 只订阅 1 次；最后一个连接关闭才 unsubscribe。
 *   - 这条很重要：避免 SSE 连接断开后 zombie 订阅占着 Redis 内存。
 */
const Redis = require('ioredis');
const logger = require('../utils/logger');

const CHANNEL_PREFIX = 'ocr:record:';
const channelOf = (recordId) => `${CHANNEL_PREFIX}${recordId}`;
const streamKeyOf = (recordId) => `${CHANNEL_PREFIX}${recordId}:events`;
const seqKeyOf = (recordId) => `${CHANNEL_PREFIX}${recordId}:seq`;
const STREAM_MAXLEN = Math.max(20, parseInt(process.env.OCR_EVENT_STREAM_MAXLEN || '200', 10));
const STREAM_TTL_SECONDS = Math.max(60, parseInt(process.env.OCR_EVENT_STREAM_TTL_SECONDS || '86400', 10));

const buildRedisOptions = () => ({
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379', 10),
  password: process.env.REDIS_PASSWORD || undefined,
  // SSE 主路径：撞 Redis 不可用立即失败，让客户端 10s 内回落轮询。
  // 这里用比 Bull 更宽松的设置（lazyConnect+一次重试）—— Bull 是核心写入路径不能断，
  // 这里只是 advisory 推送，断了无所谓。
  maxRetriesPerRequest: 1,
  connectTimeout: 3000,
  lazyConnect: true,
  enableOfflineQueue: false
});

let publisher = null;
let subscriber = null;
let redisHealthy = true;

// recordId → Set<callback>
const listeners = new Map();

const ensurePublisher = () => {
  if (publisher) return publisher;
  try {
    publisher = new Redis(buildRedisOptions());
    publisher.on('error', (err) => {
      redisHealthy = false;
      logger.warn('recordEvents publisher Redis 错误', { error: err.message });
    });
    publisher.on('ready', () => { redisHealthy = true; });
    publisher.connect().catch((err) => {
      redisHealthy = false;
      logger.warn('recordEvents publisher 连接失败', { error: err.message });
    });
  } catch (e) {
    publisher = null;
    redisHealthy = false;
    logger.warn('recordEvents publisher 初始化失败', { error: e.message });
  }
  return publisher;
};

const ensureSubscriber = () => {
  if (subscriber) return subscriber;
  try {
    subscriber = new Redis(buildRedisOptions());
    subscriber.on('error', (err) => {
      redisHealthy = false;
      logger.warn('recordEvents subscriber Redis 错误', { error: err.message });
    });
    subscriber.on('ready', () => { redisHealthy = true; });
    subscriber.on('message', (channel, raw) => {
      if (!channel.startsWith(CHANNEL_PREFIX)) return;
      const recordId = channel.slice(CHANNEL_PREFIX.length);
      const set = listeners.get(recordId);
      if (!set || !set.size) return;
      let payload;
      try {
        payload = JSON.parse(raw);
      } catch (e) {
        logger.warn('recordEvents: 收到非 JSON 消息，丢弃', { channel, raw: String(raw).slice(0, 200) });
        return;
      }
      // 拷贝一份避免迭代中 unsubscribe 改集合
      Array.from(set).forEach((cb) => {
        try { cb(payload); } catch (cbErr) {
          logger.warn('recordEvents listener 抛错（忽略）', { error: cbErr.message });
        }
      });
    });
    subscriber.connect().catch((err) => {
      redisHealthy = false;
      logger.warn('recordEvents subscriber 连接失败', { error: err.message });
    });
  } catch (e) {
    subscriber = null;
    redisHealthy = false;
    logger.warn('recordEvents subscriber 初始化失败', { error: e.message });
  }
  return subscriber;
};

/**
 * 发布一条状态事件。
 *   - 失败/Redis 不可用时返回 false，调用方应当继续走 DB 写入主路径，不要因此抛错。
 *   - payload 形如 { status: 'analyzing', progress: 65, partial?: {...}, errorMsg?: '...' }
 */
const publishRecordEvent = async (recordId, payload) => {
  if (!recordId) return false;
  const pub = ensurePublisher();
  if (!pub) return false;
  try {
    const seq = typeof pub.incr === 'function'
      ? await pub.incr(seqKeyOf(recordId))
      : Date.now();
    const event = {
      ...payload,
      recordId,
      seq,
      ts: payload && payload.ts ? payload.ts : Date.now()
    };
    const message = JSON.stringify(event);
    if (typeof pub.xadd === 'function') {
      await pub.xadd(streamKeyOf(recordId), 'MAXLEN', '~', STREAM_MAXLEN, '*', 'payload', message);
    }
    if (typeof pub.expire === 'function') {
      await pub.expire(streamKeyOf(recordId), STREAM_TTL_SECONDS);
      await pub.expire(seqKeyOf(recordId), STREAM_TTL_SECONDS);
    }
    await pub.publish(channelOf(recordId), message);
    return true;
  } catch (e) {
    redisHealthy = false;
    logger.warn('recordEvents.publish 失败（已忽略）', { recordId, error: e.message });
    return false;
  }
};

const parseStreamPayload = (entry) => {
  if (!Array.isArray(entry) || entry.length < 2) return null;
  const fields = entry[1] || [];
  let raw = null;
  for (let i = 0; i < fields.length; i += 2) {
    if (fields[i] === 'payload') {
      raw = fields[i + 1];
      break;
    }
  }
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch (e) {
    logger.warn('recordEvents.replay: payload JSON 解析失败，丢弃', {
      streamId: entry[0],
      error: e.message
    });
    return null;
  }
};

/**
 * 按业务 seq 补发历史事件。
 * afterSeq 是 publishRecordEvent 写入 payload.seq 的单调整数，而不是 Redis Stream ID。
 */
const replayRecordEvents = async (recordId, afterSeq = 0, limit = STREAM_MAXLEN) => {
  if (!recordId) return [];
  const pub = ensurePublisher();
  if (!pub || typeof pub.xrange !== 'function') return [];
  try {
    const count = Math.max(1, Math.min(Number(limit) || STREAM_MAXLEN, STREAM_MAXLEN));
    const rows = await pub.xrange(streamKeyOf(recordId), '-', '+', 'COUNT', count);
    const minSeq = Number(afterSeq) || 0;
    return (rows || [])
      .map(parseStreamPayload)
      .filter((event) => event && Number(event.seq || 0) > minSeq);
  } catch (e) {
    redisHealthy = false;
    logger.warn('recordEvents.replay 失败（已忽略）', { recordId, error: e.message });
    return [];
  }
};

/**
 * 订阅一组 recordId 的状态事件。
 *   - 返回一个 unsubscribe 函数；调用方应当在 SSE 连接关闭时调用。
 *   - Redis 不可用时返回 null，调用方据此立刻走轮询兜底。
 */
const subscribeRecordEvents = async (recordIds, onEvent) => {
  if (!Array.isArray(recordIds) || !recordIds.length) return null;
  const sub = ensureSubscriber();
  if (!sub) return null;

  const ownChannels = [];
  for (const rid of recordIds) {
    const id = String(rid);
    if (!listeners.has(id)) listeners.set(id, new Set());
    const set = listeners.get(id);
    const wasEmpty = set.size === 0;
    set.add(onEvent);
    if (wasEmpty) ownChannels.push(id);
  }

  if (ownChannels.length) {
    try {
      await sub.subscribe(...ownChannels.map(channelOf));
    } catch (e) {
      redisHealthy = false;
      // 订阅失败 → 回滚 listeners 注册，让上层 fallback。
      for (const id of ownChannels) {
        const set = listeners.get(id);
        if (set) set.delete(onEvent);
        if (set && !set.size) listeners.delete(id);
      }
      logger.warn('recordEvents.subscribe 失败', { recordIds: ownChannels, error: e.message });
      return null;
    }
  }

  return async () => {
    const channelsToUnsub = [];
    for (const rid of recordIds) {
      const id = String(rid);
      const set = listeners.get(id);
      if (!set) continue;
      set.delete(onEvent);
      if (!set.size) {
        listeners.delete(id);
        channelsToUnsub.push(id);
      }
    }
    if (channelsToUnsub.length && subscriber) {
      try {
        await subscriber.unsubscribe(...channelsToUnsub.map(channelOf));
      } catch (e) {
        logger.warn('recordEvents.unsubscribe 失败（忽略）', { error: e.message });
      }
    }
  };
};

const isHealthy = () => redisHealthy;

// 测试钩子：让单测能注入假 publisher/subscriber（避免真连 Redis）。
const __setTestables = ({ publisher: p, subscriber: s } = {}) => {
  if (p !== undefined) publisher = p;
  if (s !== undefined) subscriber = s;
  redisHealthy = true;
};
const __reset = () => {
  if (publisher && publisher.disconnect) try { publisher.disconnect(); } catch (e) { /* noop */ }
  if (subscriber && subscriber.disconnect) try { subscriber.disconnect(); } catch (e) { /* noop */ }
  publisher = null;
  subscriber = null;
  redisHealthy = true;
  listeners.clear();
};

module.exports = {
  publishRecordEvent,
  replayRecordEvents,
  subscribeRecordEvents,
  isHealthy,
  __setTestables,
  __reset,
  __testables: {
    CHANNEL_PREFIX,
    STREAM_MAXLEN,
    STREAM_TTL_SECONDS,
    channelOf,
    streamKeyOf,
    seqKeyOf,
    listeners,
    parseStreamPayload
  }
};
