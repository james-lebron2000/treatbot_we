/**
 * Plan §Phase 2.2 测试：
 *   1) handleUploadBatch 把 N 份文件**并发**喂给 processSingleUpload —— 用"所有 OCR 入队都在
 *      同一 tick 完成"反推（旧版串行下 t=0 时刻只会出现 1 次 addOCRTask 调用）。
 *   2) 同 batch 同 fileKey 的 leader/follower：create 只被调用一次，第 2 份带 isDuplicate=true。
 *   3) processSingleUpload 内部：MedicalRecord.create 抛 SequelizeUniqueConstraintError 时，
 *      回查并按 isDuplicate=true 返回，不重复入队。
 */

jest.mock('../services/oss', () => ({
  calculateMD5: jest.fn((buf) => `hash-${buf.toString()}`),
  generateKey: jest.fn((userId, name) => `uploads/${userId}/${Date.now()}_${name}`),
  uploadFile: jest.fn(async () => ({ success: true })),
  getInternalUrl: jest.fn(async () => 'https://test.example/internal/url'),
  getRequestAwareUrl: jest.fn(async () => 'https://test.example/url'),
  getObjectBuffer: jest.fn(),
  deleteFile: jest.fn()
}));
jest.mock('../services/queue', () => ({
  addOCRTask: jest.fn(async () => ({ id: 'job-1' }))
}));
jest.mock('../services/matchEngine', () => ({ scoreRecordAgainstTrial: () => ({ score: 0 }) }));
jest.mock('../models', () => {
  const findOneMock = jest.fn();
  const createMock = jest.fn();
  return {
    MedicalRecord: { findOne: findOneMock, create: createMock, findAndCountAll: jest.fn(), count: jest.fn() },
    Trial: { findAll: jest.fn().mockResolvedValue([]) }
  };
});
jest.mock('../utils/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }));

const ossService = require('../services/oss');
const queueService = require('../services/queue');
const { MedicalRecord } = require('../models');
const { handleUploadBatch } = require('../controllers/medical');

const mkFile = (name, content = name) => ({
  originalname: name,
  buffer: Buffer.from(content),
  size: content.length,
  mimetype: 'image/jpeg'
});

const buildReq = (opts = {}) => ({
  userId: opts.userId || 1,
  body: opts.body || {},
  files: opts.files || []
});
const buildRes = () => {
  const res = {};
  res.status = jest.fn(() => res);
  res.json = jest.fn(() => res);
  return res;
};

beforeEach(() => {
  jest.clearAllMocks();
  ossService.calculateMD5.mockImplementation((buf) => `hash-${buf.toString()}`);
  ossService.generateKey.mockImplementation((userId, name) => `uploads/${userId}/${name}`);
  ossService.uploadFile.mockResolvedValue({ success: true });
});

describe('Phase 2.2: handleUploadBatch parallelization', () => {
  test('3 个 unique 文件并发处理 —— uploadFile 在第一份完成前就被并发调用', async () => {
    // 让 uploadFile 走"先排队再一起完成"模式，验证并发性
    let resolveBarrier;
    const barrier = new Promise((r) => { resolveBarrier = r; });
    let inflight = 0;
    let maxInflight = 0;
    ossService.uploadFile.mockImplementation(async () => {
      inflight += 1;
      if (inflight > maxInflight) maxInflight = inflight;
      await barrier;
      inflight -= 1;
      return { success: true };
    });

    MedicalRecord.findOne.mockResolvedValue(null);
    let createCount = 0;
    MedicalRecord.create.mockImplementation(async (vals) => ({
      id: `rec-${++createCount}`,
      created_at: new Date(),
      file_key: vals.file_key,
      update: jest.fn()
    }));

    const req = buildReq({
      userId: 1,
      files: [mkFile('a.jpg', 'A'), mkFile('b.jpg', 'B'), mkFile('c.jpg', 'C')]
    });
    const res = buildRes();
    const next = jest.fn();
    const done = handleUploadBatch(req, res, next);

    // 跑两轮 microtask 让所有 uploadFile 都进入 inflight
    await new Promise((r) => setImmediate(r));
    await new Promise((r) => setImmediate(r));
    expect(maxInflight).toBeGreaterThanOrEqual(2); // 至少有 2 份在并发跑

    resolveBarrier();
    await done;

    expect(next).not.toHaveBeenCalled();
    const payload = res.json.mock.calls[0][0];
    expect(payload.data.records).toHaveLength(3);
    expect(payload.data.successCount).toBe(3);
    expect(MedicalRecord.create).toHaveBeenCalledTimes(3);
    expect(queueService.addOCRTask).toHaveBeenCalledTimes(3);
  });

  test('同 hash 同批：create 只调一次，第 2 份 isDuplicate=true', async () => {
    MedicalRecord.findOne.mockResolvedValue(null);
    MedicalRecord.create.mockResolvedValue({
      id: 'rec-1', created_at: new Date(), update: jest.fn()
    });

    const req = buildReq({
      userId: 1,
      files: [mkFile('a.jpg', 'SAME'), mkFile('b.jpg', 'SAME')]
    });
    const res = buildRes();
    const next = jest.fn();
    await handleUploadBatch(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(MedicalRecord.create).toHaveBeenCalledTimes(1);
    expect(queueService.addOCRTask).toHaveBeenCalledTimes(1);
    const payload = res.json.mock.calls[0][0];
    expect(payload.data.records).toHaveLength(2);
    expect(payload.data.records[0].isDuplicate).toBe(false);
    expect(payload.data.records[1].isDuplicate).toBe(true);
    expect(payload.data.records[1].message).toMatch(/同一批内重复/);
  });

  test('SequelizeUniqueConstraintError 兜底：跨请求竞态时回查 winner', async () => {
    // 模拟竞态：findOne 第一次说没有；create 抛唯一索引冲突；followup findOne 拿到 winner
    MedicalRecord.findOne
      .mockResolvedValueOnce(null) // initial findOne
      .mockResolvedValueOnce({ // recovery findOne
        id: 'rec-winner',
        status: 'pending',
        created_at: new Date(),
        update: jest.fn()
      });
    const uniqErr = new Error('Validation error');
    uniqErr.name = 'SequelizeUniqueConstraintError';
    MedicalRecord.create.mockRejectedValue(uniqErr);

    const req = buildReq({
      userId: 1,
      files: [mkFile('a.jpg', 'racy')]
    });
    const res = buildRes();
    const next = jest.fn();
    await handleUploadBatch(req, res, next);

    expect(next).not.toHaveBeenCalled();
    const payload = res.json.mock.calls[0][0];
    expect(payload.data.records[0].fileId).toBe('rec-winner');
    expect(payload.data.records[0].isDuplicate).toBe(true);
    expect(payload.data.records[0].message).toMatch(/同时上传相同文件/);
    expect(queueService.addOCRTask).not.toHaveBeenCalled();
  });

  test('其中一份失败不阻塞其他 —— uploadFile 仅对第二份抛错', async () => {
    let calls = 0;
    ossService.uploadFile.mockImplementation(async () => {
      calls += 1;
      if (calls === 2) throw new Error('COS down');
      return { success: true };
    });
    MedicalRecord.findOne.mockResolvedValue(null);
    let createCount = 0;
    MedicalRecord.create.mockImplementation(async () => ({
      id: `rec-${++createCount}`, created_at: new Date(), update: jest.fn()
    }));

    const req = buildReq({
      userId: 1,
      files: [mkFile('a.jpg', 'A'), mkFile('b.jpg', 'B'), mkFile('c.jpg', 'C')]
    });
    const res = buildRes();
    const next = jest.fn();
    await handleUploadBatch(req, res, next);

    expect(next).not.toHaveBeenCalled();
    const payload = res.json.mock.calls[0][0];
    expect(payload.data.records).toHaveLength(3);
    expect(payload.data.records.filter((r) => r.status === 'error')).toHaveLength(1);
    expect(payload.data.successCount).toBe(2);
  });
});
