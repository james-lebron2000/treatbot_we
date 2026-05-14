const { EventEmitter } = require('events');

const TERMINAL_TYPES = new Set(['completed', 'failed', 'not_found']);
const MAX_EVENTS_PER_RECORD = Math.max(20, parseInt(process.env.OCR_EVENT_HISTORY_LIMIT || '200', 10));

const emitter = new EventEmitter();
emitter.setMaxListeners(500);

const histories = new Map(); // recordId -> { seq, events[] }

const normalizeRecordId = (recordId) => `${recordId || ''}`.trim();

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
  emitter.emit(key, next);
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
    TERMINAL_TYPES
  }
};
