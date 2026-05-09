/**
 * Plan §Phase 1.2 测试：OCR 结果缓存。
 *
 * 覆盖契约：
 *  1) buildKey 包含 PROMPT_VERSION 和 fileHash
 *  2) get → Redis 不可用时返回 null（不抛错）
 *  3) get → key 不存在 → null + miss 计数
 *  4) get → key 存在但 JSON 损坏 → null + error 计数
 *  5) get → 命中 → 返回 payload + hit 计数
 *  6) set → 序列化失败 → 返回 false
 *  7) set → Redis 写入失败 → 返回 false（不抛错）
 *  8) set → 成功 → setex 被调用且 TTL = 30 天
 *  9) buildPayloadFromResult / buildUpdateArgsFromPayload 是可逆的字段映射
 */

// Mock metrics 与 rateLimit（Redis）。
// jest.mock 工厂里只能引用 mock 前缀变量；mockXxx 变量声明 hoist 后仍然安全。
jest.mock('../middleware/metrics', () => {
  const mockInc = jest.fn();
  const mockLabels = jest.fn(() => ({ inc: mockInc }));
  return {
    __esModule: false,
    ocrCacheTotal: { labels: mockLabels },
    __mockInc: mockInc,
    __mockLabels: mockLabels
  };
});

jest.mock('../middleware/rateLimit', () => {
  const mockGet = jest.fn();
  const mockSetex = jest.fn();
  return {
    __esModule: false,
    redisClient: { get: mockGet, setex: mockSetex },
    __mockGet: mockGet,
    __mockSetex: mockSetex
  };
});

describe('ocrCache §Phase 1.2', () => {
  let ocrCache;
  let metricsMock;
  let redisMock;

  beforeEach(() => {
    jest.resetModules();
    delete process.env.OCR_PROMPT_VERSION;
    ocrCache = require('../services/ocrCache');
    metricsMock = require('../middleware/metrics');
    redisMock = require('../middleware/rateLimit');
    metricsMock.__mockInc.mockClear();
    metricsMock.__mockLabels.mockClear();
    redisMock.__mockGet.mockReset();
    redisMock.__mockSetex.mockReset();
  });

  test('1) buildKey 包含 prompt 版本和 hash', () => {
    const key = ocrCache.buildKey('abc123');
    expect(key).toBe('ocr:v1:abc123');
    expect(ocrCache.PROMPT_VERSION).toBe('v1');
  });

  test('1b) buildKey 支持显式版本覆盖', () => {
    expect(ocrCache.buildKey('hash', 'v9')).toBe('ocr:v9:hash');
  });

  test('2) get：fileHash 缺失 → null + miss', async () => {
    const r = await ocrCache.get('');
    expect(r).toBeNull();
    expect(metricsMock.__mockLabels).toHaveBeenCalledWith('miss');
  });

  test('3) get：Redis 返回 null → null + miss', async () => {
    redisMock.__mockGet.mockResolvedValueOnce(null);
    const r = await ocrCache.get('hash1');
    expect(r).toBeNull();
    expect(redisMock.__mockGet).toHaveBeenCalledWith('ocr:v1:hash1');
    expect(metricsMock.__mockLabels).toHaveBeenCalledWith('miss');
  });

  test('4) get：Redis 抛错 → null + error', async () => {
    redisMock.__mockGet.mockRejectedValueOnce(new Error('ECONNREFUSED'));
    const r = await ocrCache.get('hash2');
    expect(r).toBeNull();
    expect(metricsMock.__mockLabels).toHaveBeenCalledWith('error');
  });

  test('5) get：JSON 损坏 → null + error', async () => {
    redisMock.__mockGet.mockResolvedValueOnce('{not-json');
    const r = await ocrCache.get('hash3');
    expect(r).toBeNull();
    expect(metricsMock.__mockLabels).toHaveBeenCalledWith('error');
  });

  test('6) get：命中 → 返回 payload + hit 计数', async () => {
    const payload = { schemaVersion: 1, fields: { diagnosis: '肺腺癌' } };
    redisMock.__mockGet.mockResolvedValueOnce(JSON.stringify(payload));
    const r = await ocrCache.get('hash4');
    expect(r).toEqual(payload);
    expect(metricsMock.__mockLabels).toHaveBeenCalledWith('hit');
  });

  test('7) set：成功 → setex 被调用，默认 TTL 30 天', async () => {
    redisMock.__mockSetex.mockResolvedValueOnce('OK');
    const ok = await ocrCache.set('hash5', { foo: 'bar' });
    expect(ok).toBe(true);
    expect(redisMock.__mockSetex).toHaveBeenCalledTimes(1);
    const [key, ttl, body] = redisMock.__mockSetex.mock.calls[0];
    expect(key).toBe('ocr:v1:hash5');
    expect(ttl).toBe(30 * 24 * 60 * 60);
    expect(JSON.parse(body)).toEqual({ foo: 'bar' });
  });

  test('8) set：Redis 写入失败 → false（不抛错）', async () => {
    redisMock.__mockSetex.mockRejectedValueOnce(new Error('READONLY'));
    const ok = await ocrCache.set('hash6', { foo: 1 });
    expect(ok).toBe(false);
  });

  test('9) set：自定义 TTL 覆盖默认值', async () => {
    redisMock.__mockSetex.mockResolvedValueOnce('OK');
    await ocrCache.set('hash7', { x: 1 }, { ttlSeconds: 60 });
    const [, ttl] = redisMock.__mockSetex.mock.calls[0];
    expect(ttl).toBe(60);
  });

  test('10) set：缺 fileHash 或 payload → false（短路）', async () => {
    expect(await ocrCache.set(null, { x: 1 })).toBe(false);
    expect(await ocrCache.set('h', null)).toBe(false);
    expect(redisMock.__mockSetex).not.toHaveBeenCalled();
  });

  test('11) buildPayloadFromResult ↔ buildUpdateArgsFromPayload 字段映射闭环', () => {
    const result = {
      text: '原始 OCR 文本',
      provider: 'doubao',
      pageCount: 1,
      confidence: 0.92,
      detections: [{ box: [0, 0, 1, 1] }],
      entities: {
        diagnosis: '肺腺癌',
        stage: 'IV 期',
        geneMutation: 'EGFR L858R',
        treatment: 'Osimertinib',
        treatmentLine: '一线',
        pdl1: '50%'
      }
    };
    const payload = ocrCache.buildPayloadFromResult(result);
    expect(payload.schemaVersion).toBe(1);
    expect(payload.promptVersion).toBe('v1');
    expect(payload.fields.diagnosis).toBe('肺腺癌');
    expect(payload.fields.gene_mutation).toBe('EGFR L858R');
    expect(payload.fields.treatment_line).toBe('一线');
    expect(payload.structured.text).toBe('原始 OCR 文本');
    expect(payload.structured.ocrMeta.provider).toBe('doubao');

    const args = ocrCache.buildUpdateArgsFromPayload(payload);
    expect(args.status).toBe('completed');
    expect(args.diagnosis).toBe('肺腺癌');
    expect(args.gene_mutation).toBe('EGFR L858R');
    expect(args.treatment_line).toBe('一线');
    expect(args.pdl1).toBe('50%');
    expect(args.structured.ocrMeta.cacheHit).toBe(true);
    expect(args.structured.ocrMeta.provider).toBe('doubao');
    expect(args.structured.text).toBe('原始 OCR 文本');
  });

  test('12) buildUpdateArgsFromPayload：缺字段 → null', () => {
    expect(ocrCache.buildUpdateArgsFromPayload(null)).toBeNull();
    expect(ocrCache.buildUpdateArgsFromPayload({})).toBeNull();
    expect(ocrCache.buildUpdateArgsFromPayload({ fields: {} })).toBeNull();
  });

  test('13) PROMPT_VERSION 通过 env 可覆盖', () => {
    process.env.OCR_PROMPT_VERSION = 'v3';
    jest.resetModules();
    const fresh = require('../services/ocrCache');
    expect(fresh.PROMPT_VERSION).toBe('v3');
    expect(fresh.buildKey('h')).toBe('ocr:v3:h');
  });
});
