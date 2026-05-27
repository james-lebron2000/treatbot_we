/**
 * OCR record events.
 *
 * Redis Stream is the durable source for reconnect/replay. Pub/Sub is still used
 * for low-latency fanout to active SSE connections. Redis failures are advisory:
 * callers must keep the DB write path as the source of truth.
 */
const Redis = require('ioredis');
const logger = require('../utils/logger');

const CHANNEL_PREFIX = 'ocr:record:';
const STREAM_PREFIX = 'ocr:record:';
const STREAM_SUFFIX = ':events';
const SEQ_SUFFIX = ':seq';
const STREAM_MAXLEN = Math.max(100, parseInt(process.env.OCR_EVENT_STREAM_MAXLEN || '200', 10));
const channelOf = (recordId) => `${CHANNEL_PREFIX}${recordId}`;
const streamOf = (recordId) => `${STREAM_PREFIX}${recordId}${STREAM_SUFFIX}`;
const seqKeyOf = (recordId) => `${STREAM_PREFIX}${recordId}${SEQ_SUFFIX}`;

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
const pendingConnects = new WeakMap();

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
  } catch (e) {
    subscriber = null;
    redisHealthy = false;
    logger.warn('recordEvents subscriber 初始化失败', { error: e.message });
  }
  return subscriber;
};

const isRedisClientLike = (client) => (
  client
  && typeof client.connect === 'function'
  && typeof client.once === 'function'
  && typeof client.status === 'string'
);

const waitForReady = async (client, role) => {
  if (!client) return false;
  // Unit tests inject light stubs that intentionally do not look like ioredis.
  if (!isRedisClientLike(client)) return true;
  if (client.status === 'ready') return true;
  if (pendingConnects.has(client)) return pendingConnects.get(client);

  const promise = new Promise((resolve) => {
    let settled = false;
    let timer = null;
    const cleanup = () => {
      if (timer) clearTimeout(timer);
      if (typeof client.off === 'function') {
        client.off('ready', onReady);
        client.off('error', onError);
        client.off('end', onEnd);
      }
    };
    const finish = (ok, err) => {
      if (settled) return;
      settled = true;
      cleanup();
      redisHealthy = ok;
      if (!ok && err) {
        logger.warn(`recordEvents ${role} 连接失败`, { error: err.message || String(err) });
      }
      resolve(ok);
    };
    const onReady = () => finish(true);
    const onEnd = () => finish(false, new Error('redis connection ended'));
    const onError = (err) => finish(false, err);

    client.once('ready', onReady);
    client.once('error', onError);
    client.once('end', onEnd);
    timer = setTimeout(() => finish(false, new Error('redis connection timeout')), 3500);
    if (typeof timer.unref === 'function') timer.unref();

    if (client.status === 'wait' || client.status === 'close') {
      client.connect().catch(onError);
    }
  }).finally(() => {
    pendingConnects.delete(client);
  });

  pendingConnects.set(client, promise);
  return promise;
};

/**
 * 发布一条状态事件。
 *   - 先 INCR record-local seq，再 XADD 到 Redis Stream，最后 PUBLISH 给在线连接。
 *   - Redis Stream ID 不暴露给客户端；客户端只看单调递增的 numeric seq。
 *   - 中途失败返回 false，OCR 主流程不因此失败。
 */
const publishRecordEvent = async (recordId, payload) => {
  if (!recordId) return false;
  const pub = ensurePublisher();
  if (!pub) return false;
  try {
    const ready = await waitForReady(pub, 'publisher');
    if (!ready) return false;
    const seq = await pub.incr(seqKeyOf(recordId));
    const event = {
      ...payload,
      recordId,
      seq,
      ts: Date.now(),
      createdAt: new Date().toISOString()
    };
    const message = JSON.stringify(event);
    await pub.xadd(
      streamOf(recordId),
      'MAXLEN',
      '~',
      STREAM_MAXLEN,
      '*',
      'seq',
      String(seq),
      'event',
      message
    );
    await pub.publish(channelOf(recordId), message);
    return true;
  } catch (e) {
    redisHealthy = false;
    logger.warn('recordEvents.publish 失败（已忽略）', { recordId, error: e.message });
    return false;
  }
};

const parseStreamRow = (row) => {
  if (!Array.isArray(row) || row.length < 2) return null;
  const [, fields] = row;
  if (!Array.isArray(fields)) return null;
  const map = {};
  for (let i = 0; i < fields.length; i += 2) {
    map[String(fields[i])] = fields[i + 1];
  }
  const raw = map.event;
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    const seq = Number(parsed.seq ?? map.seq);
    if (Number.isFinite(seq)) parsed.seq = seq;
    return parsed;
  } catch (e) {
    logger.warn('recordEvents.replay JSON 解析失败（忽略）', { error: e.message });
    return null;
  }
};

/**
 * 读取一条 record 的历史事件。
 *
 * `afterSeq` 是业务 seq，不是 Redis Stream ID。为了保持接口简单，读取最近
 * STREAM_MAXLEN 条后在应用层过滤；OCR 单任务事件量很小，这比维护 seq→streamId
 * 映射更稳。
 */
const replayRecordEvents = async (recordId, afterSeq = 0, limit = STREAM_MAXLEN) => {
  if (!recordId) return null;
  const pub = ensurePublisher();
  if (!pub) return null;
  try {
    const ready = await waitForReady(pub, 'publisher');
    if (!ready) return null;
    const rows = await pub.xrange(streamOf(recordId), '-', '+', 'COUNT', Math.max(1, limit));
    const minSeq = Number(afterSeq) || 0;
    return rows
      .map(parseStreamRow)
      .filter(Boolean)
      .filter((evt) => Number(evt.seq || 0) > minSeq);
  } catch (e) {
    redisHealthy = false;
    logger.warn('recordEvents.replay 失败', { recordId, error: e.message });
    return null;
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
  const ready = await waitForReady(sub, 'subscriber');
  if (!ready) return null;

  const ownChannels = [];
  const addedIds = [];
  for (const rid of recordIds) {
    const id = String(rid);
    if (!listeners.has(id)) listeners.set(id, new Set());
    const set = listeners.get(id);
    const wasEmpty = set.size === 0;
    set.add(onEvent);
    addedIds.push(id);
    if (wasEmpty) ownChannels.push(id);
  }

  if (ownChannels.length) {
    try {
      await sub.subscribe(...ownChannels.map(channelOf));
    } catch (e) {
      redisHealthy = false;
      // 订阅失败 → 回滚 listeners 注册，让上层 fallback。
      // 注意：本次 callback 也可能被加到了已经订阅过的 channel 上；
      // 这些 channel 不在 ownChannels 里，也必须删除，否则后续消息会打到失败的 SSE。
      for (const id of addedIds) {
        const set = listeners.get(id);
        if (set) set.delete(onEvent);
        if (set && !set.size) listeners.delete(id);
      }
      try {
        await sub.unsubscribe(...ownChannels.map(channelOf));
      } catch (_unsubErr) { /* rollback best-effort */ }
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
    STREAM_PREFIX,
    STREAM_SUFFIX,
    SEQ_SUFFIX,
    STREAM_MAXLEN,
    channelOf,
    streamOf,
    seqKeyOf,
    listeners,
    parseStreamRow
  }
};
