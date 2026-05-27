/**
 * Plan §Phase 2.1：handleStsIssue + handleFinalize 单测。
 *
 * handleStsIssue 覆盖：
 *   1) 正常请求返回 STS + 预生成 fileKey（带 userId 前缀）
 *   2) count > BATCH_UPLOAD_MAX → 400
 *   3) count 非法 / 缺失 → 400
 *   4) 未登录 → 401
 *
 * handleFinalize 覆盖：
 *   5) 正常 finalize → headObject 验证 + 创建 record + 入队
 *   6) fileKey 不在用户前缀 → 403 (该单文件 error，其他不阻塞)
 *   7) fileHash 非法 → 400
 *   8) size 不匹配 COS 实际 → 400
 *   9) COS 上没有此对象 → 404
 *  10) dedup：已存在同 hash 的 record → 复用 + isDuplicate=true
 *  11) 同批 dedup：同一批内重复 hash 仅入队一次
 *  12) 队列入队失败：record 写 status=error，但响应仍 200
 */

// mock services & models —— 不打 DB，不打 COS。
jest.mock('../services/oss', () => ({
  getDirectUploadInfo: jest.fn(),
  headObject: jest.fn(),
  generateKey: jest.fn((userId, name) => `uploads/${userId}/${Date.now()}_${Math.random().toString(36).slice(2, 6)}_${name}`),
  getInternalUrl: jest.fn(async () => 'https://test.example/internal/url')
}));
jest.mock('../services/queue', () => ({
  addOCRTask: jest.fn(async () => ({ id: 'job-1' }))
}));
jest.mock('../models', () => {
  const findOneMock = jest.fn();
  const createMock = jest.fn();
  return {
    MedicalRecord: {
      findOne: findOneMock,
      create: createMock
    },
    Trial: {}
  };
});

const ossService = require('../services/oss');
const queueService = require('../services/queue');
const { MedicalRecord } = require('../models');
const { handleStsIssue, handleFinalize } = require('../controllers/medical');

const buildReq = (opts = {}) => ({
  // 注意：解构默认值会吞 `undefined`，所以这里手写 `?? 1` 让显式传 null 走未登录分支。
  userId: Object.prototype.hasOwnProperty.call(opts, 'userId') ? opts.userId : 1,
  query: opts.query || {},
  body: opts.body || {}
});

const buildRes = () => {
  const res = {};
  res.status = jest.fn(() => res);
  res.json = jest.fn(() => res);
  return res;
};

const wrapNext = () => {
  const fn = jest.fn();
  return fn;
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe('handleStsIssue', () => {
  test('正常请求 → 返回 STS + N 个 fileKey', async () => {
    ossService.getDirectUploadInfo.mockResolvedValue({
      mode: 'cos',
      credentials: { tmpSecretId: 'X', tmpSecretKey: 'Y', sessionToken: 'Z' },
      region: 'ap-shanghai',
      bucket: 'my-bucket-12345',
      appId: '12345',
      expiredAt: Date.now() + 1800000,
      startTime: Math.floor(Date.now() / 1000),
      files: [
        { fileKey: 'uploads/1/abc.jpg', putUrl: 'https://...', host: 'h', originalName: 'a.jpg', mimeType: 'image/jpeg' },
        { fileKey: 'uploads/1/def.jpg', putUrl: 'https://...', host: 'h', originalName: 'b.jpg', mimeType: 'image/jpeg' }
      ]
    });
    const req = buildReq({
      userId: 1,
      query: { count: '2', originalNames: 'a.jpg,b.jpg', types: 'image/jpeg,image/jpeg' }
    });
    const res = buildRes();
    const next = wrapNext();
    await handleStsIssue(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(ossService.getDirectUploadInfo).toHaveBeenCalledWith(1, [
      { originalName: 'a.jpg', mimeType: 'image/jpeg' },
      { originalName: 'b.jpg', mimeType: 'image/jpeg' }
    ]);
    expect(res.json).toHaveBeenCalled();
    const payload = res.json.mock.calls[0][0];
    expect(payload.code).toBe(0);
    expect(payload.data.files).toHaveLength(2);
  });

  test('count 缺失 → 默认为 1', async () => {
    ossService.getDirectUploadInfo.mockResolvedValue({
      mode: 'cos',
      credentials: null,
      region: '', bucket: '', appId: '', expiredAt: 0, startTime: 0,
      files: [{ fileKey: 'uploads/1/x.bin', putUrl: 'h', host: '', originalName: 'file_1.bin', mimeType: null }]
    });
    const req = buildReq({ userId: 1, query: {} });
    const res = buildRes();
    const next = wrapNext();
    await handleStsIssue(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(ossService.getDirectUploadInfo).toHaveBeenCalledWith(1, [
      { originalName: 'file_1.bin', mimeType: null }
    ]);
  });

  test('count > BATCH_UPLOAD_MAX → next(BusinessError 400)', async () => {
    const req = buildReq({ userId: 1, query: { count: '99' } });
    const res = buildRes();
    const next = wrapNext();
    await handleStsIssue(req, res, next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(next.mock.calls[0][0].code).toBe(400);
    expect(next.mock.calls[0][0].message).toMatch(/最多/);
  });

  test('count 非整数 → 400', async () => {
    const req = buildReq({ userId: 1, query: { count: 'abc' } });
    const res = buildRes();
    const next = wrapNext();
    await handleStsIssue(req, res, next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(next.mock.calls[0][0].code).toBe(400);
  });

  test('未登录 → 401', async () => {
    const req = buildReq({ userId: null, query: { count: '1' } });
    const res = buildRes();
    const next = wrapNext();
    await handleStsIssue(req, res, next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(next.mock.calls[0][0].code).toBe(401);
  });
});

describe('handleFinalize', () => {
  const buildFile = (overrides = {}) => ({
    fileKey: 'uploads/1/abc.jpg',
    fileHash: 'a'.repeat(32),
    mimeType: 'image/jpeg',
    size: 1024,
    originalName: 'a.jpg',
    ...overrides
  });

  test('正常 → headObject 验证 + create record + addOCRTask', async () => {
    ossService.headObject.mockResolvedValue({ exists: true, size: 1024 });
    MedicalRecord.findOne.mockResolvedValue(null);
    MedicalRecord.create.mockResolvedValue({
      id: 'rec-1', created_at: new Date(), update: jest.fn()
    });
    const req = buildReq({ userId: 1, body: { files: [buildFile()] } });
    const res = buildRes();
    const next = wrapNext();
    await handleFinalize(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(ossService.headObject).toHaveBeenCalledWith('uploads/1/abc.jpg');
    expect(MedicalRecord.create).toHaveBeenCalled();
    expect(queueService.addOCRTask).toHaveBeenCalledWith(
      'rec-1',
      'https://test.example/internal/url',
      1,
      expect.objectContaining({ fileKey: 'uploads/1/abc.jpg', fileHash: 'a'.repeat(32) })
    );
    const payload = res.json.mock.calls[0][0];
    expect(payload.code).toBe(0);
    expect(payload.data.successCount).toBe(1);
    expect(payload.data.records[0].status).toBe('pending');
  });

  test('fileKey 不在用户前缀 → 该文件 error，不阻塞其他', async () => {
    ossService.headObject.mockResolvedValue({ exists: true, size: 1024 });
    MedicalRecord.findOne.mockResolvedValue(null);
    MedicalRecord.create.mockResolvedValue({ id: 'rec-2', created_at: new Date(), update: jest.fn() });

    const req = buildReq({
      userId: 1,
      body: {
        files: [
          buildFile({ fileKey: 'uploads/999/evil.jpg' }), // 越权
          buildFile({ fileKey: 'uploads/1/ok.jpg' })
        ]
      }
    });
    const res = buildRes();
    const next = wrapNext();
    await handleFinalize(req, res, next);

    expect(next).not.toHaveBeenCalled();
    const payload = res.json.mock.calls[0][0];
    expect(payload.data.records).toHaveLength(2);
    expect(payload.data.records[0].status).toBe('error');
    expect(payload.data.records[0].message).toMatch(/uploads\/1\//);
    expect(payload.data.records[1].status).toBe('pending');
    expect(payload.data.successCount).toBe(1);
  });

  test('fileHash 非 md5 hex → 400 (该文件 error)', async () => {
    const req = buildReq({
      userId: 1,
      body: { files: [buildFile({ fileHash: 'not-an-md5' })] }
    });
    const res = buildRes();
    const next = wrapNext();
    await handleFinalize(req, res, next);
    const payload = res.json.mock.calls[0][0];
    expect(payload.data.records[0].status).toBe('error');
    expect(payload.data.records[0].message).toMatch(/fileHash/);
  });

  test('size 与 COS 实际不一致 → error', async () => {
    ossService.headObject.mockResolvedValue({ exists: true, size: 9999 });
    const req = buildReq({ userId: 1, body: { files: [buildFile({ size: 1024 })] } });
    const res = buildRes();
    const next = wrapNext();
    await handleFinalize(req, res, next);
    const payload = res.json.mock.calls[0][0];
    expect(payload.data.records[0].status).toBe('error');
    expect(payload.data.records[0].message).toMatch(/size/);
  });

  test('COS 上没有此对象 → error', async () => {
    ossService.headObject.mockResolvedValue({ exists: false });
    const req = buildReq({ userId: 1, body: { files: [buildFile()] } });
    const res = buildRes();
    const next = wrapNext();
    await handleFinalize(req, res, next);
    const payload = res.json.mock.calls[0][0];
    expect(payload.data.records[0].status).toBe('error');
    expect(payload.data.records[0].message).toMatch(/未找到|COS/);
  });

  test('dedup 命中（已有 record，且有结果）→ 不入队，返回 isDuplicate', async () => {
    ossService.headObject.mockResolvedValue({ exists: true, size: 1024 });
    MedicalRecord.findOne.mockResolvedValue({
      id: 'rec-existing',
      status: 'completed',
      created_at: new Date(),
      diagnosis: '肺腺癌',
      stage: 'IV期',
      structured: { ok: true },
      file_key: 'uploads/1/abc.jpg',
      file_hash: 'a'.repeat(32),
      update: jest.fn()
    });
    const req = buildReq({ userId: 1, body: { files: [buildFile()] } });
    const res = buildRes();
    const next = wrapNext();
    await handleFinalize(req, res, next);

    expect(MedicalRecord.create).not.toHaveBeenCalled();
    expect(queueService.addOCRTask).not.toHaveBeenCalled();
    const payload = res.json.mock.calls[0][0];
    expect(payload.data.records[0].isDuplicate).toBe(true);
    expect(payload.data.records[0].status).toBe('completed');
  });

  test('dedup 命中但无结果 → 触发 reparse，入队', async () => {
    ossService.headObject.mockResolvedValue({ exists: true, size: 1024 });
    const updateMock = jest.fn();
    MedicalRecord.findOne.mockResolvedValue({
      id: 'rec-existing',
      status: 'pending',
      created_at: new Date(),
      diagnosis: null,
      stage: null,
      structured: null,
      file_key: 'uploads/1/abc.jpg',
      file_hash: 'a'.repeat(32),
      update: updateMock
    });
    const req = buildReq({ userId: 1, body: { files: [buildFile()] } });
    const res = buildRes();
    const next = wrapNext();
    await handleFinalize(req, res, next);

    expect(updateMock).toHaveBeenCalled();
    expect(queueService.addOCRTask).toHaveBeenCalled();
    const payload = res.json.mock.calls[0][0];
    expect(payload.data.records[0].isDuplicate).toBe(true);
    expect(payload.data.records[0].reparseTriggered).toBe(true);
  });

  test('同批 dedup：同一批内同 hash 只入队一次', async () => {
    ossService.headObject.mockResolvedValue({ exists: true, size: 1024 });
    MedicalRecord.findOne.mockResolvedValue(null);
    MedicalRecord.create.mockResolvedValue({ id: 'rec-1', created_at: new Date(), update: jest.fn() });

    const req = buildReq({
      userId: 1,
      body: {
        files: [
          buildFile({ originalName: 'a.jpg' }),
          buildFile({ originalName: 'b.jpg' }) // 同 hash, 同 fileKey
        ]
      }
    });
    const res = buildRes();
    const next = wrapNext();
    await handleFinalize(req, res, next);

    // create 应只调一次（第二份命中 batchHashCache）
    expect(MedicalRecord.create).toHaveBeenCalledTimes(1);
    expect(queueService.addOCRTask).toHaveBeenCalledTimes(1);
    const payload = res.json.mock.calls[0][0];
    expect(payload.data.records).toHaveLength(2);
    expect(payload.data.records[0].isDuplicate).toBe(false);
    expect(payload.data.records[1].isDuplicate).toBe(true);
    expect(payload.data.records[1].message).toMatch(/同一批内重复/);
  });

  test('并发同 hash create 唯一冲突 → 回查 winner 按 duplicate 成功返回', async () => {
    ossService.headObject.mockResolvedValue({ exists: true, size: 1024 });
    const winner = {
      id: 'rec-winner',
      status: 'error',
      created_at: new Date('2026-05-25T10:00:00Z'),
      file_key: 'uploads/1/abc.jpg',
      file_hash: 'a'.repeat(32)
    };
    MedicalRecord.findOne
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(winner);
    MedicalRecord.create.mockRejectedValueOnce({
      name: 'SequelizeUniqueConstraintError',
      message: 'Duplicate entry'
    });

    const req = buildReq({ userId: 1, body: { files: [buildFile()] } });
    const res = buildRes();
    const next = wrapNext();
    await handleFinalize(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(queueService.addOCRTask).not.toHaveBeenCalled();
    const payload = res.json.mock.calls[0][0];
    expect(payload.data.records[0]).toMatchObject({
      fileId: 'rec-winner',
      recordId: 'rec-winner',
      status: 'pending',
      isDuplicate: true
    });
    expect(payload.data.successCount).toBe(1);
    expect(payload.data.failedCount).toBe(0);
  });

  test('队列入队失败 → record 标 error，响应仍 200', async () => {
    ossService.headObject.mockResolvedValue({ exists: true, size: 1024 });
    MedicalRecord.findOne.mockResolvedValue(null);
    const recordUpdate = jest.fn();
    MedicalRecord.create.mockResolvedValue({ id: 'rec-3', created_at: new Date(), update: recordUpdate });
    queueService.addOCRTask.mockRejectedValueOnce(new Error('redis down'));

    const req = buildReq({ userId: 1, body: { files: [buildFile()] } });
    const res = buildRes();
    const next = wrapNext();
    await handleFinalize(req, res, next);

    expect(next).not.toHaveBeenCalled();
    const payload = res.json.mock.calls[0][0];
    // ocrQueued=false 且响应状态要与 DB error 保持一致，避免客户端先显示 pending。
    expect(payload.data.records[0].ocrQueued).toBe(false);
    expect(payload.data.records[0].status).toBe('error');
    expect(payload.data.successCount).toBe(0);
    expect(payload.data.failedCount).toBe(1);
  });

  test('直传部分 PUT 失败时 finalize 保留原始 total 和 failedCount', async () => {
    ossService.headObject.mockResolvedValue({ exists: true, size: 1024 });
    MedicalRecord.findOne.mockResolvedValue(null);
    MedicalRecord.create.mockResolvedValue({
      id: 'rec-ok', created_at: new Date(), update: jest.fn()
    });

    const req = buildReq({
      userId: 1,
      body: {
        totalCount: 2,
        uploadErrors: [{ index: 1, originalName: 'bad.jpg', message: 'COS PUT 失败' }],
        files: [buildFile({ originalName: 'ok.jpg' })]
      }
    });
    const res = buildRes();
    const next = wrapNext();
    await handleFinalize(req, res, next);

    expect(next).not.toHaveBeenCalled();
    const payload = res.json.mock.calls[0][0];
    expect(payload.data.total).toBe(2);
    expect(payload.data.successCount).toBe(1);
    expect(payload.data.failedCount).toBe(1);
    expect(payload.data.uploadErrors).toHaveLength(1);
  });

  test('files 为空数组 → 400', async () => {
    const req = buildReq({ userId: 1, body: { files: [] } });
    const res = buildRes();
    const next = wrapNext();
    await handleFinalize(req, res, next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(next.mock.calls[0][0].code).toBe(400);
  });

  test('未登录 → 401', async () => {
    const req = buildReq({ userId: null, body: { files: [buildFile()] } });
    const res = buildRes();
    const next = wrapNext();
    await handleFinalize(req, res, next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(next.mock.calls[0][0].code).toBe(401);
  });
});
