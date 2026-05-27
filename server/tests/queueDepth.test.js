/**
 * Plan §Phase 3.4：getQueueDepth 单测。
 *
 * 用 jest mock 替换 bull 队列，验证：
 *   1) 正常路径 → 返回 { waiting, active, total }，total = waiting + active
 *   2) Bull 抛异常 → 返回 null（容错：不能因这点装饰拖死上传响应）
 *   3) 字段缺失（counts 没 waiting/active）→ 默认 0
 */

// 静音 logger
jest.mock('../utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn()
}));

// 替换 bull —— 不用真的 Redis
const mockGetJobCounts = jest.fn();
const mockGetJobs = jest.fn();
jest.mock('bull', () => {
  return jest.fn().mockImplementation(() => {
    const queue = {
      getJobCounts: (...args) => mockGetJobCounts(...args),
      getJobs: (...args) => mockGetJobs(...args),
      add: jest.fn().mockResolvedValue({ id: 'job_x' }),
      getJob: jest.fn().mockResolvedValue(null),
      process: jest.fn(),
      on: jest.fn(),
      setMaxListeners: jest.fn(),
      settings: {}
    };
    return queue;
  });
});

// models 层 noop —— queue.js require 它们但本测试用不到
jest.mock('../models', () => ({
  MedicalRecord: { findOne: jest.fn(), findByPk: jest.fn() },
  OcrJobFailure: { findByPk: jest.fn(), create: jest.fn() }
}));

jest.mock('../services/ocr', () => ({
  processMedicalImage: jest.fn()
}));

jest.mock('../observability/sentry', () => ({
  captureException: jest.fn()
}));

jest.mock('../services/recordEvents', () => ({
  publishRecordEvent: jest.fn().mockResolvedValue(true)
}));

const queueService = require('../services/queue');
const { getQueueDepth } = queueService;

describe('getQueueDepth §Phase 3.4', () => {
  beforeEach(() => {
    mockGetJobCounts.mockReset();
    mockGetJobs.mockReset();
  });

  test('1) 正常路径 → { waiting, active, total }', async () => {
    mockGetJobCounts.mockResolvedValue({ waiting: 3, active: 2, completed: 100 });
    const depth = await getQueueDepth();
    expect(depth).toEqual({ waiting: 3, active: 2, total: 5 });
  });

  test('2) waiting 0 + active 0 → total 0（合法非 null）', async () => {
    mockGetJobCounts.mockResolvedValue({ waiting: 0, active: 0 });
    const depth = await getQueueDepth();
    expect(depth).toEqual({ waiting: 0, active: 0, total: 0 });
  });

  test('3) 字段缺失 → 默认 0', async () => {
    mockGetJobCounts.mockResolvedValue({});
    const depth = await getQueueDepth();
    expect(depth).toEqual({ waiting: 0, active: 0, total: 0 });
  });

  test('4) Bull 抛异常 → null（容错，不阻断上传响应）', async () => {
    mockGetJobCounts.mockRejectedValue(new Error('redis is down'));
    const depth = await getQueueDepth();
    expect(depth).toBeNull();
  });

  test('5) 字符串数字 → 转 number 后求和', async () => {
    // Bull 在某些版本下以字符串返回（兼容 redis hgetall 原始值）—— 验证容错
    mockGetJobCounts.mockResolvedValue({ waiting: '4', active: '1' });
    const depth = await getQueueDepth();
    expect(depth).toEqual({ waiting: 4, active: 1, total: 5 });
  });

  test('6) 用户已有 3 个等待/活跃 OCR → 仍允许入队，用户 active 不作为 admission 拒绝', async () => {
    mockGetJobCounts.mockResolvedValue({ waiting: 3, active: 0 });
    mockGetJobs.mockResolvedValue([
      { data: { userId: 'u1' } },
      { data: { userId: 'u1' } },
      { data: { userId: 'u1' } },
      { data: { userId: 'u2' } }
    ]);

    await expect(queueService.__testables.assertQueueAdmission('u1')).resolves.toBeUndefined();
    expect(mockGetJobs).toHaveBeenCalledWith(['active'], 0, -1, false);
  });

  test('7) 全局 waiting+active 达到上限 → admission 拒绝', async () => {
    mockGetJobCounts.mockResolvedValue({ waiting: 2000, active: 0 });
    await expect(queueService.__testables.assertQueueAdmission('u1')).rejects.toMatchObject({
      code: 'OCR_QUEUE_BUSY',
      statusCode: 429
    });
    expect(mockGetJobs).not.toHaveBeenCalled();
  });
});
