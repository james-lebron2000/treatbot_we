/**
 * guideline 控制器层测试（补齐复审发现的覆盖缺口）。
 *
 * 策略（同 billing.test.js 惯例）：只 mock DB 模型 MedicalRecord 与 logger；
 * buildProfile / guidelineMatcher / redFlags 都是纯函数，放真，端到端验证控制器接线：
 *   - getGuidelines：recordId 不存在→404、无病历→空骨架+safety、有病历→匹配结果+safety、红旗
 *   - getCancerList：公开列表
 *   - getCancerEducationHandler：已知 key→科普、未知 key→兜底骨架
 */

const mockFindOne = jest.fn();
const mockFindAll = jest.fn();

jest.mock('../models', () => ({
  sequelize: {},
  MedicalRecord: {
    findOne: (...a) => mockFindOne(...a),
    findAll: (...a) => mockFindAll(...a)
  }
}));

jest.mock('../utils/logger', () => ({
  info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn()
}));

const { getGuidelines, getCancerList, getCancerEducationHandler } = require('../controllers/guideline');
const { BusinessError } = require('../middleware/errorHandler');

// 构造一条 MedicalRecord 行（buildProfile 读 structured.entities + 顶层标量字段）。
const mkRecord = (over = {}) => ({
  id: 'r1',
  diagnosis: '右肺腺癌',
  stage: 'IV期',
  gene_mutation: '',
  treatment_line: 0,
  pdl1: '',
  updated_at: '2026-05-01',
  created_at: '2026-05-01',
  structured: { entities: {} },
  ...over
});

const mkRes = () => ({ json: jest.fn() });
const lastJson = (res) => res.json.mock.calls[0][0];

beforeEach(() => {
  mockFindOne.mockReset();
  mockFindAll.mockReset();
});

describe('getGuidelines', () => {
  test('recordId 不存在 → 透传 404 BusinessError，不返回 body', async () => {
    mockFindOne.mockResolvedValue(null);
    const res = mkRes();
    const next = jest.fn();
    await getGuidelines({ userId: 1, query: { recordId: 'nope' } }, res, next);

    expect(res.json).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledTimes(1);
    const err = next.mock.calls[0][0];
    expect(err).toBeInstanceOf(BusinessError);
    expect(err.code).toBe(404);
  });

  test('无病历 → matched=false 空骨架 + safety.redFlag=false', async () => {
    mockFindAll.mockResolvedValue([]);
    const res = mkRes();
    await getGuidelines({ userId: 1, query: {} }, res, jest.fn());

    const body = lastJson(res);
    expect(body.code).toBe(0);
    expect(body.data.matched).toBe(false);
    expect(body.data.accessGuidance.length).toBeGreaterThan(0); // 兜底也带可及性
    expect(body.safety.redFlag).toBe(false);
  });

  test('有病历（EGFR 晚期肺腺癌）→ 命中 nsclc 一线 EGFR 方案 + safety', async () => {
    mockFindAll.mockResolvedValue([
      mkRecord({ structured: { entities: { molecular: { drivers: [{ gene: 'EGFR' }] } } } })
    ]);
    const res = mkRes();
    await getGuidelines({ userId: 1, query: {} }, res, jest.fn());

    const body = lastJson(res);
    expect(body.data.matched).toBe(true);
    expect(body.data.cancer.key).toBe('nsclc');
    expect(body.data.regimens.map((r) => r.id)).toContain('nsclc-iv-egfr-1l');
    expect(body.data.flags.drivers).toContain('EGFR');
    expect(body.safety.redFlag).toBe(false);
  });

  test('recordId 命中单条病历 → 走 findOne 分支并返回匹配', async () => {
    mockFindOne.mockResolvedValue(mkRecord({ diagnosis: '小细胞肺癌', stage: '广泛期' }));
    const res = mkRes();
    await getGuidelines({ userId: 1, query: { recordId: 'r1' } }, res, jest.fn());

    expect(mockFindOne).toHaveBeenCalledTimes(1);
    const body = lastJson(res);
    expect(body.data.cancer.key).toBe('sclc');
    expect(body.data.regimens.map((r) => r.id)).toContain('sclc-extensive');
  });

  test('病历含急症词 → safety.redFlag=true 且带类别', async () => {
    mockFindAll.mockResolvedValue([mkRecord({ diagnosis: '右肺腺癌 伴脊髓压迫' })]);
    const res = mkRes();
    await getGuidelines({ userId: 1, query: {} }, res, jest.fn());

    const body = lastJson(res);
    expect(body.safety.redFlag).toBe(true);
    expect(body.safety.categories.map((c) => c.key)).toContain('spinal_cord_compression');
  });

  test('DB 异常 → 透传给 next（不抛未捕获）', async () => {
    mockFindAll.mockRejectedValue(new Error('db down'));
    const res = mkRes();
    const next = jest.fn();
    await getGuidelines({ userId: 1, query: {} }, res, next);

    expect(res.json).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledTimes(1);
    expect(next.mock.calls[0][0]).toBeInstanceOf(Error);
  });
});

describe('getCancerList (公开)', () => {
  test('返回覆盖癌种列表', () => {
    const res = mkRes();
    getCancerList({}, res);
    const body = lastJson(res);
    expect(body.code).toBe(0);
    expect(body.data.map((c) => c.key)).toEqual(expect.arrayContaining(['nsclc', 'sclc']));
  });
});

describe('getCancerEducationHandler (公开)', () => {
  test('已知 key → education 概览（全部方案）', () => {
    const res = mkRes();
    getCancerEducationHandler({ params: { key: 'nsclc' } }, res);
    const body = lastJson(res);
    expect(body.data.matched).toBe(true);
    expect(body.data.mode).toBe('education');
    expect(body.data.regimens.length).toBeGreaterThanOrEqual(5);
  });

  test('未知 key → matched=false 兜底骨架（仍带可及性/免责）', () => {
    const res = mkRes();
    getCancerEducationHandler({ params: { key: '不存在xyz' } }, res);
    const body = lastJson(res);
    expect(body.data.matched).toBe(false);
    expect(body.data.disclaimer).toBeTruthy();
  });
});
