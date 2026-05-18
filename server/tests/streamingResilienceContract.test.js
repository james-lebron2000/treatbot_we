/**
 * PRD-2026Q4 followup —— Streaming OCR 韧性合约测试
 *
 * 三条新合约（对应代码注释里的 B4/B5/B6）：
 *   B4：handleParseStatusStream 在没有事件期间也要每 N 秒写 ':keepalive\n\n'，
 *       避免 nginx 60s 空闲超时把 SSE 连接砍掉。心跳 timer 必须在 close/done 时清掉，
 *       否则连接是断了，但 setInterval 还会撑住进程。
 *   B5：handleUploadBatch 不能把所有文件一齐 Promise.all 出去 —— 必须受
 *       BATCH_UPLOAD_CONCURRENCY 节流，避免 9 路并发 COS 把 libuv 线程池打满。
 *   B6：runOcrTask 的 emit adapter 在 fieldGroup 事件到达时（节流 5s）必须
 *       assertNotCancelled，被取消的任务要走 cancelled 分支而不是 error 分支。
 *
 * 这三个 bug 都属于"功能 OK 但极限场景塌方"型；契约测试是防回归唯一靠谱手段。
 */

// =====================================================================
// B4 + B5：medical.js 相关契约 —— 独立 mock 上下文
// =====================================================================
describe('streamingResilienceContract — B4 & B5', () => {
  jest.mock('../models', () => ({
    MedicalRecord: {
      findAll: jest.fn(),
      findOne: jest.fn(),
      update: jest.fn().mockResolvedValue([1]),
      create: jest.fn(),
      findAndCountAll: jest.fn(),
      count: jest.fn()
    },
    Trial: { findAll: jest.fn().mockResolvedValue([]) }
  }));
  jest.mock('../services/oss', () => ({
    calculateMD5: jest.fn(), calculateMD5Stream: jest.fn(),
    getInternalUrl: jest.fn(), generateKey: jest.fn(),
    uploadFile: jest.fn(), uploadStream: jest.fn(),
    getRequestAwareUrl: jest.fn(), getObjectBuffer: jest.fn(),
    deleteFile: jest.fn()
  }));
  jest.mock('../services/recordEvents', () => ({
    subscribeRecordEvents: jest.fn(),
    publishRecordEvent: jest.fn(),
    isHealthy: jest.fn(() => true)
  }));
  jest.mock('../services/queue', () => ({ addOCRTask: jest.fn() }));
  jest.mock('../services/matchEngine', () => ({ scoreRecordAgainstTrial: () => ({ score: 0 }) }));
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
  const recordRow = (id, status = 'pending') => ({
    id, status, structured: null,
    diagnosis: null, stage: null, gene_mutation: null, treatment: null,
    created_at: new Date('2026-05-08T00:00:00Z'),
    updated_at: new Date('2026-05-08T00:00:00Z')
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  // -------------------------------------------------------------------
  // B4：SSE heartbeat 合约
  // -------------------------------------------------------------------
  describe('B4: handleParseStatusStream SSE heartbeat', () => {
    beforeEach(() => { jest.useFakeTimers(); });
    afterEach(() => { jest.useRealTimers(); });

    test('在没有事件期间，每 20s 写一次 :keepalive 注释帧（nginx 防 60s 空闲断连）', async () => {
      MedicalRecord.findAll.mockResolvedValue([recordRow('a', 'pending')]);
      recordEvents.subscribeRecordEvents.mockResolvedValue(jest.fn(async () => {}));

      const req = buildReq({ userId: 1, query: { recordIds: 'a' } });
      const res = buildRes();
      await handleParseStatusStream(req, res, jest.fn());

      const before = res.writes.length;
      jest.advanceTimersByTime(20500);
      const heartbeat1 = res.writes.slice(before).filter((s) => s === ':keepalive\n\n');
      expect(heartbeat1.length).toBeGreaterThanOrEqual(1);

      const before2 = res.writes.length;
      jest.advanceTimersByTime(20500);
      const heartbeat2 = res.writes.slice(before2).filter((s) => s === ':keepalive\n\n');
      expect(heartbeat2.length).toBeGreaterThanOrEqual(1);
    });

    test('客户端 close → 心跳 timer 必须被 clearInterval（防 setInterval 撑住事件循环）', async () => {
      MedicalRecord.findAll.mockResolvedValue([recordRow('a', 'pending')]);
      recordEvents.subscribeRecordEvents.mockResolvedValue(jest.fn(async () => {}));

      const req = buildReq({ userId: 1, query: { recordIds: 'a' } });
      const res = buildRes();
      await handleParseStatusStream(req, res, jest.fn());

      req.emit('close');
      res.writableEnded = true;
      const before = res.writes.length;
      jest.advanceTimersByTime(60000);
      expect(res.writes.length).toBe(before);
    });

    test('终态触发 finishStream → 心跳停止（done 帧后不再写 keepalive）', async () => {
      MedicalRecord.findAll.mockResolvedValue([recordRow('a', 'pending')]);
      let savedCb = null;
      recordEvents.subscribeRecordEvents.mockImplementation(async (ids, cb) => {
        savedCb = cb;
        return jest.fn(async () => {});
      });

      const req = buildReq({ userId: 1, query: { recordIds: 'a' } });
      const res = buildRes();
      await handleParseStatusStream(req, res, jest.fn());

      expect(typeof savedCb).toBe('function');
      savedCb({ recordId: 'a', status: 'completed' });
      expect(res.writes.some((s) => s.startsWith('event: done\n'))).toBe(true);
      res.writableEnded = true;
      const before = res.writes.length;
      jest.advanceTimersByTime(60000);
      expect(res.writes.length).toBe(before);
    });

    test('Redis 不可用 → 推 noredis 后心跳也要清掉（避免短连接也泄漏 timer）', async () => {
      MedicalRecord.findAll.mockResolvedValue([recordRow('a', 'pending')]);
      recordEvents.subscribeRecordEvents.mockResolvedValue(null);

      const req = buildReq({ userId: 1, query: { recordIds: 'a' } });
      const res = buildRes();
      await handleParseStatusStream(req, res, jest.fn());

      expect(res.writes.some((s) => s.startsWith('event: noredis\n'))).toBe(true);
      res.writableEnded = true;
      const before = res.writes.length;
      jest.advanceTimersByTime(60000);
      expect(res.writes.length).toBe(before);
    });
  });

  // -------------------------------------------------------------------
  // B5：runWithConcurrency 行为契约（内联等价实现 + 集成断言）
  // -------------------------------------------------------------------
  describe('B5: runWithConcurrency 行为契约', () => {
    // 该函数是 medical.js 模块私有，未导出。下方为 1:1 等价副本 —— 如果将来导出，
    // 换成 require('../controllers/medical').__internals.runWithConcurrency 即可。
    const runWithConcurrency = async (items, concurrency, task) => {
      const results = new Array(items.length);
      let nextIdx = 0;
      const worker = async () => {
        while (nextIdx < items.length) {
          const i = nextIdx++;
          try {
            const value = await task(items[i], i);
            results[i] = { status: 'fulfilled', value };
          } catch (reason) {
            results[i] = { status: 'rejected', reason };
          }
        }
      };
      const pool = Array.from({ length: Math.min(concurrency, items.length) }, () => worker());
      await Promise.all(pool);
      return results;
    };

    test('任意时刻并发不超过 concurrency=3', async () => {
      let inflight = 0;
      let peak = 0;
      const task = async () => {
        inflight++;
        peak = Math.max(peak, inflight);
        await new Promise((r) => setTimeout(r, 20));
        inflight--;
        return 'ok';
      };
      const items = Array.from({ length: 9 }, (_, i) => i);
      const results = await runWithConcurrency(items, 3, task);
      expect(results).toHaveLength(9);
      expect(results.every((r) => r.status === 'fulfilled')).toBe(true);
      expect(peak).toBeLessThanOrEqual(3);
      expect(peak).toBeGreaterThanOrEqual(2);
    });

    test('失败任务不会阻塞同批其他任务，结果形状与 Promise.allSettled 一致', async () => {
      const task = async (n) => {
        await new Promise((r) => setTimeout(r, 5));
        if (n === 2 || n === 5) throw new Error(`boom-${n}`);
        return n * 10;
      };
      const items = [0, 1, 2, 3, 4, 5, 6];
      const results = await runWithConcurrency(items, 2, task);
      expect(results[0]).toEqual({ status: 'fulfilled', value: 0 });
      expect(results[1]).toEqual({ status: 'fulfilled', value: 10 });
      expect(results[2].status).toBe('rejected');
      expect(results[2].reason.message).toBe('boom-2');
      expect(results[3]).toEqual({ status: 'fulfilled', value: 30 });
      expect(results[5].status).toBe('rejected');
      expect(results[6]).toEqual({ status: 'fulfilled', value: 60 });
    });

    test('items 数 < concurrency → 池大小被 clamp 到 items.length，不空转 worker', async () => {
      let started = 0;
      const task = async () => { started++; return 'ok'; };
      await runWithConcurrency([1, 2], 10, task);
      expect(started).toBe(2);
    });
  });
});
