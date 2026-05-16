/**
 * PRD-2026Q2 §3.2：OCR 队列 DLQ
 *
 * 覆盖三条契约：
 *  1. attempts 耗尽（attemptsMade === opts.attempts）时写入 ocr_job_failures
 *  2. transient 失败（attemptsMade < opts.attempts）不写 DLQ
 *  3. retryFailure 读一条 → ocrQueue.add → retried += 1 + last_retried_at 更新
 *
 * 与 applicationCreate.test.js 同风格：jest.mock('../models') 屏蔽 Sequelize，
 * 再用一个本地 Queue stub 替换 Bull 和 Redis。我们直接调 __testables.handleOcrJobFailed
 * 来断言 failed handler 的契约，避免依赖真实 Bull 的事件循环。
 */

const mockCreate = jest.fn();
const mockFindByPk = jest.fn();
const mockQueueAdd = jest.fn();
const mockRecordUpdate = jest.fn().mockResolvedValue([1]);
const mockPublish = jest.fn().mockResolvedValue(true);

jest.mock('../models', () => ({
  OcrJobFailure: {
    create: (...args) => mockCreate(...args),
    findByPk: (...args) => mockFindByPk(...args)
  },
  MedicalRecord: {
    update: (...args) => mockRecordUpdate(...args)
  }
}));

// Bull 在真实环境会连 Redis。单测里用一个最小 stub，
// process / add / on / setMaxListeners 保留即可，不触发任何真实 IO。
jest.mock('bull', () => {
  return jest.fn().mockImplementation(() => {
    const queue = {
      process: jest.fn(),
      add: (...args) => mockQueueAdd(...args),
      on: jest.fn(),
      setMaxListeners: jest.fn(),
      settings: {}
    };
    return queue;
  });
});

// ocr 服务真实模块会加载 axios / COS SDK，mock 掉避免副作用。
jest.mock('../services/ocr', () => ({
  processMedicalImage: jest.fn()
}));

jest.mock('../services/recordEvents', () => ({
  publishRecordEvent: (...args) => mockPublish(...args)
}));

// 引入被测模块（必须在 mock 之后 require）
const queueService = require('../services/queue');

describe('PRD-2026Q2 §3.2 OCR DLQ failed handler', () => {
  beforeEach(() => {
    mockCreate.mockReset();
    mockFindByPk.mockReset();
    mockQueueAdd.mockReset();
    mockRecordUpdate.mockReset();
    mockRecordUpdate.mockResolvedValue([1]);
    mockPublish.mockReset();
    mockPublish.mockResolvedValue(true);
  });

  test('attempts 耗尽 → 写 record error + 推送失败事件 + 写入 ocr_job_failures', async () => {
    mockCreate.mockResolvedValueOnce({ id: 1 });

    const job = {
      id: 'job_123',
      attemptsMade: 5,
      opts: { attempts: 5 },
      data: {
        recordId: 'rec_abc',
        imageUrl: 'https://bucket.cos.ap-shanghai.myqcloud.com/x.jpg',
        userId: 'user_1'
      }
    };
    const err = new Error('OCR timeout 30s');

    await queueService.__testables.handleOcrJobFailed(job, err);

    expect(mockRecordUpdate).toHaveBeenCalledWith({
      status: 'error',
      status_phase: null,
      structured: { error: 'OCR timeout 30s' }
    }, {
      where: { id: 'rec_abc' }
    });
    expect(mockPublish).toHaveBeenCalledWith('rec_abc', {
      status: 'error',
      errorMsg: 'OCR timeout 30s'
    });

    expect(mockCreate).toHaveBeenCalledTimes(1);
    const insertArgs = mockCreate.mock.calls[0][0];
    expect(insertArgs.job_id).toBe('job_123');
    expect(insertArgs.record_id).toBe('rec_abc');
    expect(insertArgs.error_type).toBe('timeout');
    expect(insertArgs.error_message).toBe('OCR timeout 30s');
    expect(insertArgs.payload).toEqual(job.data);
    expect(insertArgs.retried).toBe(0);
  });

  test('transient 失败（attemptsMade < attempts）→ 不写 DLQ', async () => {
    const job = {
      id: 'job_456',
      attemptsMade: 2,
      opts: { attempts: 5 },
      data: { recordId: 'rec_def' }
    };
    const err = new Error('network ECONNRESET');

    await queueService.__testables.handleOcrJobFailed(job, err);

    expect(mockRecordUpdate).not.toHaveBeenCalled();
    expect(mockPublish).not.toHaveBeenCalled();
    expect(mockCreate).not.toHaveBeenCalled();
  });

  test('classifyError 给出可识别的类型', () => {
    const { classifyError } = queueService.__testables;
    expect(classifyError(new Error('Request timeout'))).toBe('timeout');
    expect(classifyError(new Error('OCR未识别到有效文本'))).toBe('ocr_empty');
    expect(classifyError(new Error('fetch failed'))).toBe('network');
    expect(classifyError(new Error('something else'))).toBe('other');
  });

  test('DB 写入抛错不应把 promise 炸出去（handler 自身 swallow）', async () => {
    mockCreate.mockRejectedValueOnce(new Error('DB offline'));

    const job = {
      id: 'job_789',
      attemptsMade: 5,
      opts: { attempts: 5 },
      data: { recordId: 'rec_ghi' }
    };

    await expect(
      queueService.__testables.handleOcrJobFailed(job, new Error('boom'))
    ).resolves.not.toThrow();
  });
});

describe('PRD-2026Q2 §3.2 retryFailure', () => {
  beforeEach(() => {
    mockCreate.mockReset();
    mockFindByPk.mockReset();
    mockQueueAdd.mockReset();
    mockRecordUpdate.mockReset();
    mockRecordUpdate.mockResolvedValue([1]);
    mockPublish.mockReset();
    mockPublish.mockResolvedValue(true);
  });

  test('读一条 failure → ocrQueue.add → retried + last_retried_at 更新', async () => {
    const updateSpy = jest.fn().mockResolvedValue();
    mockFindByPk.mockResolvedValueOnce({
      id: 42,
      job_id: 'job_orig',
      record_id: 'rec_retry',
      payload: { recordId: 'rec_retry', imageUrl: 'https://bucket.cos.ap-shanghai.myqcloud.com/x.jpg', userId: 'u1' },
      retried: 1,
      update: updateSpy
    });
    mockQueueAdd.mockResolvedValueOnce({ id: 'job_new' });

    const result = await queueService.retryFailure(42);

    expect(mockFindByPk).toHaveBeenCalledWith(42);
    expect(mockQueueAdd).toHaveBeenCalledTimes(1);
    const [payload, opts] = mockQueueAdd.mock.calls[0];
    expect(payload.recordId).toBe('rec_retry');
    expect(opts.attempts).toBe(5);
    expect(opts.timeout).toBe(queueService.__testables.OCR_JOB_TIMEOUT_MS);
    expect(opts.removeOnFail).toBe(false);

    expect(updateSpy).toHaveBeenCalledTimes(1);
    const updateArgs = updateSpy.mock.calls[0][0];
    expect(updateArgs.retried).toBe(2);
    expect(updateArgs.last_retried_at).toBeInstanceOf(Date);

    expect(result).toEqual({ jobId: 'job_new', retried: 2 });
  });

  test('failureId 不存在时抛 404', async () => {
    mockFindByPk.mockResolvedValueOnce(null);

    await expect(queueService.retryFailure(999)).rejects.toMatchObject({
      message: 'failure_not_found',
      code: 404
    });
    expect(mockQueueAdd).not.toHaveBeenCalled();
  });
});
