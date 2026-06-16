const { EventEmitter } = require('events');

const TERMINAL_TYPES = new Set(['completed', 'failed', 'not_found']);
const MAX_EVENTS_PER_RECORD = Math.max(20, parseInt(process.env.OCR_EVENT_HISTORY_LIMIT || '200', 10));

const emitter = new EventEmitter();
emitter.setMaxListeners(500);

const histories = new Map(); // recordId -> { seq, events[] }

const normalizeRecordId = (recordId) => `${recordId || ''}`.trim();

// ── 跨 worker 广播（PM2 cluster 安全）────────────────────────────────────────
// 处理 OCR 的 worker 与持有 SSE 连接的 worker 在 cluster 下可能不是同一个进程，进程内
// EventEmitter 无法跨进程 → 客户端收不到进度。这里用 Redis pub/sub 把事件广播给所有 worker，
// 各 worker 本地重放给自己的 SSE 订阅者。严格附加 + 可优雅降级：未配 Redis / 测试环境 /
// Redis 不可用时，行为与原纯进程内实现完全一致。
const crypto = require('crypto');
const OCR_EVENTS_CHANNEL = 'ocr:events';
const ORIGIN_ID = crypto.randomBytes(8).toString('hex'); // 本进程标识，过滤自己发的消息避免重复重放
const REDIS_ENABLED =
  process.env.NODE_ENV !== 'test' && String(process.env.OCR_EVENTS_REDIS || '').toLowerCase() !== 'false';

let pubClient = null;
let subClient = null;
let redisInitTried = false;
let testPublisher = null; // 测试注入：模拟跨 worker 发布器

// 收到来自「其它 worker」的事件 → 本地重放给本 worker 的 SSE 订阅者；自己发的（originId 相同）跳过。
const handleRemoteMessage = (raw) => {
  try {
    const msg = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!msg || msg.originId === ORIGIN_ID) return;
    const key = normalizeRecordId(msg.recordId);
    if (key && msg.event) emitter.emit(key, msg.event);
  } catch (e) {
    // 坏消息忽略，不影响本地流
  }
};

const initRedis = () => {
  if (redisInitTried || !REDIS_ENABLED) return;
  redisInitTried = true;
  try {
    const Redis = require('ioredis');
    const opts = {
      host: process.env.REDIS_HOST || 'localhost',
      port: process.env.REDIS_PORT || 6379,
      password: process.env.REDIS_PASSWORD || undefined,
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false
    };
    pubClient = new Redis(opts);
    subClient = new Redis(opts);
    pubClient.on('error', () => {}); // 降级：错误不抛，发布走 .catch 静默
    subClient.on('error', () => {});
    subClient.on('message', (_channel, raw) => handleRemoteMessage(raw));
    subClient.subscribe(OCR_EVENTS_CHANNEL).catch(() => {});
  } catch (e) {
    pubClient = null;
    subClient = null;
  }
};

// 把事件广播给其它 worker（附 originId）。测试注入优先；否则经 Redis；都没有则 no-op。
const broadcast = (key, event) => {
  const payload = JSON.stringify({ recordId: key, originId: ORIGIN_ID, event });
  if (testPublisher) {
    try {
      testPublisher(payload);
    } catch (e) {
      /* ignore */
    }
    return;
  }
  if (!REDIS_ENABLED) return;
  initRedis();
  if (pubClient) {
    pubClient.publish(OCR_EVENTS_CHANNEL, payload).catch(() => {});
  }
};

const readHistory = (recordId) => {
  const key = normalizeRecordId(recordId);
  if (!key) {
    return { seq: 0, events: [] };
  }
  if (!histories.has(key)) {
    histories.set(key, { seq: 0, events: [] });
  }
  return histories.get(key);
};

const sanitizeEvent = (event = {}) => {
  const type = `${event.type || 'stage'}`.trim() || 'stage';
  const status = event.status ? `${event.status}` : undefined;
  const progress = Number(event.progress);
  return {
    type,
    status,
    progress: Number.isFinite(progress) ? Math.max(0, Math.min(100, Math.round(progress))) : undefined,
    stage: event.stage ? `${event.stage}` : undefined,
    message: event.message ? `${event.message}` : undefined,
    partialResult: event.partialResult && typeof event.partialResult === 'object' ? event.partialResult : undefined,
    errorMsg: event.errorMsg ? `${event.errorMsg}`.slice(0, 1000) : undefined,
    meta: event.meta && typeof event.meta === 'object' ? event.meta : undefined
  };
};

const publish = (recordId, event = {}) => {
  const key = normalizeRecordId(recordId);
  if (!key) {
    return null;
  }
  const history = readHistory(key);
  const next = {
    recordId: key,
    seq: history.seq + 1,
    createdAt: new Date().toISOString(),
    ...sanitizeEvent(event)
  };
  history.seq = next.seq;
  history.events.push(next);
  if (history.events.length > MAX_EVENTS_PER_RECORD) {
    history.events.splice(0, history.events.length - MAX_EVENTS_PER_RECORD);
  }
  emitter.emit(key, next); // 本地立即投递（与原行为一致）
  broadcast(key, next); // 跨 worker 广播（附 originId，自身忽略），cluster 下让其它 worker 的 SSE 也能收到
  return next;
};

const getEventsAfter = (recordId, afterSeq = 0) => {
  const seq = Number(afterSeq || 0);
  return readHistory(recordId).events.filter((event) => event.seq > seq);
};

const subscribe = (recordId, listener) => {
  const key = normalizeRecordId(recordId);
  if (!key || typeof listener !== 'function') {
    return () => {};
  }
  initRedis(); // 确保本 worker 已订阅 Redis 频道，才能收到其它 worker 发布的事件
  emitter.on(key, listener);
  return () => emitter.off(key, listener);
};

const isTerminal = (event = {}) => TERMINAL_TYPES.has(event.type) || ['completed', 'error', 'not_found'].includes(event.status);

const writeSseEvent = (res, event = {}) => {
  if (!res || typeof res.write !== 'function') {
    return;
  }
  const id = event.seq != null ? `${event.seq}` : undefined;
  const type = event.type || 'message';
  if (id) {
    res.write(`id: ${id}\n`);
  }
  res.write(`event: ${type}\n`);
  res.write(`data: ${JSON.stringify(event)}\n\n`);
  if (typeof res.flush === 'function') {
    res.flush();
  }
};

const buildSnapshotEvent = (record, buildParseStatusEntry) => {
  if (!record || typeof buildParseStatusEntry !== 'function') {
    return null;
  }
  const entry = buildParseStatusEntry(record);
  if (!entry) {
    return null;
  }
  if (entry.status === 'completed') {
    return {
      type: 'completed',
      status: 'completed',
      progress: 100,
      stage: 'completed',
      message: '解析完成',
      partialResult: entry.result || null
    };
  }
  if (entry.status === 'error') {
    return {
      type: 'failed',
      status: 'error',
      progress: 0,
      stage: 'failed',
      message: '解析失败',
      errorMsg: entry.errorMsg || '解析失败'
    };
  }
  return {
    type: 'stage',
    status: entry.status,
    progress: entry.progress,
    stage: entry.status,
    message: entry.status === 'analyzing' ? '正在找关键信息' : '正在解析病历'
  };
};

const clearForTest = () => {
  histories.clear();
  emitter.removeAllListeners();
  testPublisher = null;
};

module.exports = {
  publish,
  getEventsAfter,
  subscribe,
  isTerminal,
  writeSseEvent,
  buildSnapshotEvent,
  __testables: {
    clearForTest,
    readHistory,
    sanitizeEvent,
    TERMINAL_TYPES,
    handleRemoteMessage,
    setTestPublisher: (fn) => {
      testPublisher = fn;
    },
    ORIGIN_ID
  }
};
