const mockUpdate = jest.fn().mockResolvedValue([1]);
const mockFindOne = jest.fn().mockResolvedValue({ id: 'rec_retry', file_hash: null, cancelled_at: null });
const mockRunStreamingPipeline = jest.fn();
const mockPublish = jest.fn().mockResolvedValue(true);
const mockCaptureException = jest.fn();

jest.mock('bull', () => {
  return jest.fn().mockImplementation(() => ({
    process: jest.fn(),
    add: jest.fn().mockResolvedValue({ id: 'job_x' }),
    on: jest.fn(),
    setMaxListeners: jest.fn(),
    settings: {}
  }));
});

jest.mock('../models', () => ({
  OcrJobFailure: { create: jest.fn(), findByPk: jest.fn() },
  MedicalRecord: {
    findOne: (...args) => mockFindOne(...args),
    update: (...args) => mockUpdate(...args)
  }
}));

jest.mock('../services/ocrPipeline', () => ({
  runStreamingPipeline: (...args) => mockRunStreamingPipeline(...args)
}));

jest.mock('../services/ocrCache', () => ({
  get: jest.fn().mockResolvedValue(null),
  set: jest.fn().mockResolvedValue(undefined),
  buildUpdateArgsFromPayload: jest.fn(() => null),
  buildPayloadFromResult: jest.fn(() => ({})),
  PROMPT_VERSION: 'test'
}));

jest.mock('../services/recordEvents', () => ({
  publishRecordEvent: (...args) => mockPublish(...args)
}));

jest.mock('../observability/sentry', () => ({
  captureException: (...args) => mockCaptureException(...args)
}));

jest.mock('../utils/logger', () => ({
  info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn()
}));

const queueService = require('../services/queue');
const { runOcrTask } = queueService.__testables;

describe('OCR queue retry semantics', () => {
  beforeEach(() => {
    mockUpdate.mockClear();
    mockFindOne.mockClear();
    mockFindOne.mockResolvedValue({ id: 'rec_retry', file_hash: null, cancelled_at: null });
    mockRunStreamingPipeline.mockReset();
    mockPublish.mockClear();
    mockCaptureException.mockClear();
  });

  test('Bull 中间失败不写 DB/SSE 终态 error，保留 pending queued 等待重试', async () => {
    mockRunStreamingPipeline.mockRejectedValueOnce(new Error('provider temporary timeout'));

    await expect(runOcrTask({
      recordId: 'rec_retry',
      imageUrl: 'https://x/y.jpg',
      mimeType: 'image/jpeg',
      fileKey: 'uploads/u1/y.jpg',
      userId: 'u1'
    }, { jobId: 'job_retry', finalAttempt: false })).rejects.toThrow('provider temporary timeout');

    const updates = mockUpdate.mock.calls.map((call) => call[0]);
    expect(updates).toContainEqual({ status: 'running', status_phase: 'analyzing' });
    expect(updates).toContainEqual({ status: 'pending', status_phase: 'queued' });
    expect(updates.find((u) => u.status === 'error')).toBeUndefined();

    const publishedStatuses = mockPublish.mock.calls.map((call) => call[1]);
    expect(publishedStatuses.find((payload) => payload.status === 'error')).toBeUndefined();
    expect(publishedStatuses).toContainEqual(expect.objectContaining({
      status: 'pending',
      statusPhase: 'queued',
      retrying: true
    }));
    expect(mockCaptureException).not.toHaveBeenCalled();
  });

  test('Bull 最后一次失败才写 DB/SSE 终态 error', async () => {
    mockRunStreamingPipeline.mockRejectedValueOnce(new Error('final provider failure'));

    await expect(runOcrTask({
      recordId: 'rec_final',
      imageUrl: 'https://x/y.jpg',
      mimeType: 'image/jpeg',
      fileKey: 'uploads/u1/y.jpg',
      userId: 'u1'
    }, { jobId: 'job_final', finalAttempt: true })).rejects.toThrow('final provider failure');

    const updates = mockUpdate.mock.calls.map((call) => call[0]);
    expect(updates.find((u) => u.status === 'error')).toEqual(expect.objectContaining({
      status: 'error',
      status_phase: null
    }));
    expect(mockPublish.mock.calls.map((call) => call[1])).toContainEqual(expect.objectContaining({
      status: 'error',
      errorMsg: 'final provider failure'
    }));
    expect(mockCaptureException).toHaveBeenCalledTimes(1);
  });
});
