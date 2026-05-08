/**
 * Plan §Phase 2.3 测试：SSE 解析状态推送
 *
 * 覆盖：
 *   1) 头部正确（text/event-stream + X-Accel-Buffering: no）
 *   2) ownership 校验：他人 record 不被订阅、不返回 state
 *   3) 初始 state 帧立刻 flush（建立 SSE 之前已 completed 的 record 也能看到）
 *   4) 全部 record 已终态 → 立即 done + end，不订阅 Redis
 *   5) Redis 不可用（subscribeRecordEvents 返回 null）→ 推送 noredis 后 end，让客户端走轮询
 *   6) 正常流：subscribe 注册回调；触发 publish 后客户端立刻收到 state；终态后自动 end
 *   7) 客户端 close → unsubscribe 被调用（防 zombie 订阅）
 */

jest.mock('../models', () => {
  const findAllMock = jest.fn();
  return {
    MedicalRecord: { findAll: findAllMock, findOne: jest.fn(), create: jest.fn(), findAndCountAll: jest.fn(), count: jest.fn() },
    Trial: { findAll: jest.fn().mockResolvedValue([]) }
  };
});
jest.mock('../services/oss', () => ({
  calculateMD5: jest.fn(), getInternalUrl: jest.fn(), generateKey: jest.fn(),
  uploadFile: jest.fn(), getRequestAwareUrl: jest.fn(), getObjectBuffer: jest.fn(),
  deleteFile: jest.fn()
}));
jest.mock('../services/queue', () => ({ addOCRTask: jest.fn() }));
jest.mock('../services/matchEngine', () => ({ scoreRecordAgainstTrial: () => ({ score: 0 }) }));
jest.mock('../services/recordEvents', () => ({
  subscribeRecordEvents: jest.fn(),
  publishRecordEvent: jest.fn(),
  isHealthy: jest.fn(() => true)
}));
jest.mock('../utils/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }));

const { MedicalRecord } = require('../models');
const recordEvents = require('../services/recordEvents');
const { handleParseStatusStream } = require('../controllers/medical');
const { EventEmitter } = require('events');

const buildReq = (opts = {}) => {
  const req = new EventEmitter();
  req.userId = opts.userId || 1;
  req.query = opts.query || {};
  return req;
};

const buildRes = () => {
  const res = new EventEmitter();
  res.headers = {};
  res.statusCode = 200;
  res.writableEnded = false;
  res.writes = [];
  res.flushHeaders = jest.fn();
  res.setHeader = jest.fn((k, v) => { res.headers[k.toLowerCase()] = v; });
  res.status = jest.fn((c) => { res.statusCode = c; return res; });
  res.write = jest.fn((chunk) => { res.writes.push(chunk); return true; });
  res.end = jest.fn(() => { res.writableEnded = true; });
  res.json = jest.fn(() => res);
  return res;
};

const recordRow = (id, status = 'pending', extra = {}) => ({
  id, status, structured: extra.structured || null,
  diagnosis: extra.diagnosis || null,
  stage: extra.stage || null,
  gene_mutation: extra.gene_mutation || null,
  treatment: extra.treatment || null,
  created_at: new Date('2026-05-08T00:00:00Z'),
  updated_at: new Date('2026-05-08T00:00:00Z')
});

beforeEach(() => {
  jest.clearAllMocks();
});

describe('Phase 2.3: handleParseStatusStream', () => {
  test('400：缺少 recordIds', async () => {
    const req = buildReq({ query: {} });
    const res = buildRes();
    const next = jest.fn();
    await handleParseStatusStream(req, res, next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(next.mock.calls[0][0].code).toBe(400);
  });

  test('400：超过 20 个 recordId', async () => {
    const ids = Array.from({ length: 21 }, (_, i) => `r${i}`).join(',');
    const req = buildReq({ query: { recordIds: ids } });
    const res = buildRes();
    const next = jest.fn();
    await handleParseStatusStream(req, res, next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(next.mock.calls[0][0].code).toBe(400);
  });

  test('404：所有 recordId 都不属于本人', async () => {
    MedicalRecord.findAll.mockResolvedValue([]);
    const req = buildReq({ userId: 1, query: { recordIds: 'a,b' } });
    const res = buildRes();
    const next = jest.fn();
    await handleParseStatusStream(req, res, next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(next.mock.calls[0][0].code).toBe(404);
    expect(recordEvents.subscribeRecordEvents).not.toHaveBeenCalled();
  });

  test('SSE 头部正确 + 初始 state 立即推送', async () => {
    MedicalRecord.findAll.mockResolvedValue([recordRow('a', 'pending'), recordRow('b', 'running')]);
    recordEvents.subscribeRecordEvents.mockResolvedValue(async () => {});

    const req = buildReq({ userId: 1, query: { recordIds: 'a,b' } });
    const res = buildRes();
    const next = jest.fn();
    await handleParseStatusStream(req, res, next);

    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/event-stream/);
    expect(res.headers['cache-control']).toMatch(/no-cache/);
    expect(res.headers['x-accel-buffering']).toBe('no');
    expect(res.flushHeaders).toHaveBeenCalled();

    // 初始两条 state（每个 record 一帧）
    const stateFrames = res.writes.filter((s) => s.startsWith('event: state\n'));
    expect(stateFrames).toHaveLength(2);
    expect(stateFrames[0]).toMatch(/"fileId":"a"/);
    expect(stateFrames[1]).toMatch(/"fileId":"b"/);
    expect(recordEvents.subscribeRecordEvents).toHaveBeenCalledTimes(1);
  });

  test('全部已终态 → 不订阅 Redis，立即 done + end', async () => {
    MedicalRecord.findAll.mockResolvedValue([
      recordRow('a', 'completed', {
        structured: { text: 'X', confidence: 0.9 },
        diagnosis: '肺腺癌', stage: 'IV'
      }),
      recordRow('b', 'error', { structured: { error: 'OCR 失败' } })
    ]);

    const req = buildReq({ userId: 1, query: { recordIds: 'a,b' } });
    const res = buildRes();
    const next = jest.fn();
    await handleParseStatusStream(req, res, next);

    expect(recordEvents.subscribeRecordEvents).not.toHaveBeenCalled();
    expect(res.writes.some((s) => s.startsWith('event: done\n'))).toBe(true);
    expect(res.end).toHaveBeenCalled();
  });

  test('Redis 不可用 → 推 noredis + end，让客户端走轮询', async () => {
    MedicalRecord.findAll.mockResolvedValue([recordRow('a', 'pending')]);
    recordEvents.subscribeRecordEvents.mockResolvedValue(null); // Redis 挂

    const req = buildReq({ userId: 1, query: { recordIds: 'a' } });
    const res = buildRes();
    const next = jest.fn();
    await handleParseStatusStream(req, res, next);

    expect(res.writes.some((s) => s.startsWith('event: noredis\n'))).toBe(true);
    expect(res.end).toHaveBeenCalled();
  });

  test('subscribe 后：触发 publish 回调 → 客户端立刻收到 state；终态触发 end', async () => {
    MedicalRecord.findAll.mockResolvedValue([recordRow('a', 'pending')]);

    let savedCb = null;
    const unsubscribe = jest.fn(async () => {});
    recordEvents.subscribeRecordEvents.mockImplementation(async (ids, cb) => {
      savedCb = cb;
      return unsubscribe;
    });

    const req = buildReq({ userId: 1, query: { recordIds: 'a' } });
    const res = buildRes();
    const next = jest.fn();
    await handleParseStatusStream(req, res, next);

    expect(typeof savedCb).toBe('function');
    expect(unsubscribe).not.toHaveBeenCalled();

    // 模拟 OCR worker 推一条 'analyzing' 中间态
    savedCb({ recordId: 'a', status: 'analyzing', progress: 65 });
    const analyzingFrames = res.writes.filter((s) => s.includes('"status":"analyzing"'));
    expect(analyzingFrames.length).toBeGreaterThanOrEqual(1);
    expect(res.end).not.toHaveBeenCalled();

    // 终态
    savedCb({ recordId: 'a', status: 'completed', progress: 100, result: { diagnosis: 'X' } });
    expect(res.writes.some((s) => s.startsWith('event: done\n'))).toBe(true);
    expect(res.end).toHaveBeenCalled();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });

  test('客户端 close → unsubscribe + heartbeat 清理', async () => {
    MedicalRecord.findAll.mockResolvedValue([recordRow('a', 'pending')]);
    const unsubscribe = jest.fn(async () => {});
    recordEvents.subscribeRecordEvents.mockResolvedValue(unsubscribe);

    const req = buildReq({ userId: 1, query: { recordIds: 'a' } });
    const res = buildRes();
    const next = jest.fn();
    await handleParseStatusStream(req, res, next);

    // 客户端断开
    req.emit('close');
    // 给 promise 一个 microtask 让 unsubscribe 跑完
    await new Promise((r) => setImmediate(r));

    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });
});
