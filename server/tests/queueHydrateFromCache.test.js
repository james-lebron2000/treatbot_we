/**
 * Wave 3 §1 测试：upload-time 缓存同步水合。
 *
 * 契约：
 *  1) ocrCache.get miss → 返回 false，不写 DB、不发 SSE
 *  2) ocrCache.get throw → 返回 false（吞错），不写 DB
 *  3) ocrCache.get hit + buildUpdateArgsFromPayload 返回 args → MedicalRecord.update 被调
 *     用，SSE publish 收到 status='completed' + fromCache=true，notificationQueue.add 在
 *     setImmediate 内被排上
 *  4) recordId / fileHash 任一缺失 → 立即返回 false
 *  5) MedicalRecord.update 抛错 → 返回 false（不抛），调用方仍可走 enqueue 兜底
 */

const mockOcrCacheGet = jest.fn();
const mockBuildUpdateArgs = jest.fn();
const mockMedicalUpdate = jest.fn();
const mockPublishRecordEvent = jest.fn();
const mockNotifyAdd = jest.fn();

jest.mock('../utils/logger', () => ({
  info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn()
}));

jest.mock('../services/ocrCache', () => ({
  get: (...args) => mockOcrCacheGet(...args),
  buildUpdateArgsFromPayload: (...args) => mockBuildUpdateArgs(...args)
}));

jest.mock('../models', () => ({
  MedicalRecord: {
    update: (...args) => mockMedicalUpdate(...args),
    findOne: jest.fn()
  },
  OcrJobFailure: {}
}));

jest.mock('../services/recordEvents', () => ({
  publishRecordEvent: (...args) => mockPublishRecordEvent(...args)
}));

// Bull mock —— 只需要 notificationQueue.add 可以拍。ocrQueue 在本测试里不被调用。
jest.mock('bull', () => {
  return jest.fn().mockImplementation(() => ({
    process: jest.fn(),
    on: jest.fn(),
    add: (...args) => mockNotifyAdd(...args),
    setMaxListeners: jest.fn(),
    settings: {}
  }));
});

const flushSetImmediate = () => new Promise((resolve) => setImmediate(resolve));

describe('queue.tryHydrateOcrFromCache (Wave 3 §1)', () => {
  let tryHydrateOcrFromCache;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetModules();
    // require 在每个 test 内执行，确保前一个 test 的 mock state 不漏过来
    ({ tryHydrateOcrFromCache } = require('../services/queue'));
  });

  test('miss → 返回 false', async () => {
    mockOcrCacheGet.mockResolvedValueOnce(null);
    const hit = await tryHydrateOcrFromCache('rec-1', 'hash-a', 'u-1');
    expect(hit).toBe(false);
    expect(mockMedicalUpdate).not.toHaveBeenCalled();
    expect(mockPublishRecordEvent).not.toHaveBeenCalled();
  });

  test('get 抛错 → 返回 false，不抛错', async () => {
    mockOcrCacheGet.mockRejectedValueOnce(new Error('redis down'));
    const hit = await tryHydrateOcrFromCache('rec-1', 'hash-a', 'u-1');
    expect(hit).toBe(false);
    expect(mockMedicalUpdate).not.toHaveBeenCalled();
  });

  test('命中 → update 被调用 + SSE completed + notify 在 setImmediate 内排队', async () => {
    mockOcrCacheGet.mockResolvedValueOnce({ schemaVersion: 1, fields: {}, structured: {} });
    mockBuildUpdateArgs.mockReturnValueOnce({
      status: 'completed',
      status_phase: null,
      diagnosis: '肺腺癌',
      structured: { entities: { diagnosis: '肺腺癌' } }
    });
    mockMedicalUpdate.mockResolvedValueOnce([1]);
    mockPublishRecordEvent.mockResolvedValueOnce(undefined);
    mockNotifyAdd.mockResolvedValueOnce({ id: 'notif-1' });

    const hit = await tryHydrateOcrFromCache('rec-1', 'hash-a', 'u-1');
    expect(hit).toBe(true);
    expect(mockMedicalUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'completed', diagnosis: '肺腺癌' }),
      { where: { id: 'rec-1' } }
    );
    expect(mockPublishRecordEvent).toHaveBeenCalledWith(
      'rec-1',
      expect.objectContaining({ status: 'completed', progress: 100, fromCache: true })
    );

    await flushSetImmediate();
    expect(mockNotifyAdd).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'ocr_completed', recordId: 'rec-1', userId: 'u-1', fromCache: true })
    );
  });

  test('recordId 缺失 → 立即 false', async () => {
    const hit = await tryHydrateOcrFromCache(null, 'hash-a', 'u-1');
    expect(hit).toBe(false);
    expect(mockOcrCacheGet).not.toHaveBeenCalled();
  });

  test('fileHash 缺失 → 立即 false', async () => {
    const hit = await tryHydrateOcrFromCache('rec-1', '', 'u-1');
    expect(hit).toBe(false);
    expect(mockOcrCacheGet).not.toHaveBeenCalled();
  });

  test('MedicalRecord.update 抛错 → 返回 false，不发 SSE', async () => {
    mockOcrCacheGet.mockResolvedValueOnce({ schemaVersion: 1, fields: {}, structured: {} });
    mockBuildUpdateArgs.mockReturnValueOnce({ status: 'completed' });
    mockMedicalUpdate.mockRejectedValueOnce(new Error('DB conn lost'));

    const hit = await tryHydrateOcrFromCache('rec-1', 'hash-a', 'u-1');
    expect(hit).toBe(false);
    expect(mockPublishRecordEvent).not.toHaveBeenCalled();
  });
});
