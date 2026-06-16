/**
 * SECURITY 回归：bulkUpdateCroApplicationStatus 跨租户隔离 + actor 可归因
 *
 * 背景：此前批量更新用 `req.croId`（全仓从未赋值）做归属校验，恒为死代码 →
 *   任一 CRO 可改任意申请单状态，且 actor.id=undefined 不可归因。
 *   本测试锁住修复：必须用 req.croCompany.trial_ids 白名单，actor.id=croCompany.id。
 *
 * 用 jest.mock 拦掉 models / stateMachine / funnelTracker —— 不依赖 MySQL，CI 可独立跑。
 */

const mockFindByPk = jest.fn();
const mockTransition = jest.fn();

jest.mock('../models', () => ({
  CroCompany: {},
  TrialApplication: { findByPk: (...a) => mockFindByPk(...a) },
  Trial: {},
  User: {},
  MedicalRecord: {},
  CroExportLog: {},
  AdminAuditLog: {}
}));

jest.mock('../services/applicationStateMachine', () => ({
  transition: (...a) => mockTransition(...a),
  InvalidTransitionError: class InvalidTransitionError extends Error {}
}));

// funnelTracker 在 cro.js 顶层即被读取 EVENTS.*，用 Proxy 容忍任意 key。
jest.mock('../services/funnelTracker', () => ({
  track: jest.fn(),
  EVENTS: new Proxy({}, { get: (_t, k) => String(k) })
}));

const { bulkUpdateCroApplicationStatus } = require('../controllers/cro');

const buildRes = () => {
  const res = {};
  res.status = jest.fn(() => res);
  res.json = jest.fn(() => res);
  return res;
};

const buildReq = (overrides = {}) => ({
  croCompany: { id: 'cro_1', name: 'AcmeCRO', trial_ids: ['t1', 't2'] },
  body: {},
  ...overrides
});

const unwrap = (res) => {
  const payload = res.json.mock.calls[0][0];
  return payload && payload.data ? payload.data : payload;
};

beforeEach(() => {
  mockFindByPk.mockReset();
  mockTransition.mockReset().mockResolvedValue({ from: 'contacted', to: 'enrolled' });
});

describe('bulkUpdateCroApplicationStatus — 跨租户隔离', () => {
  test('不属于本 CRO 试验的申请单 → forbidden，且不触发状态机', async () => {
    // app_a 属于 t1（本 CRO 拥有）；app_b 属于 t99（他人试验）
    mockFindByPk.mockImplementation(async (id) => {
      if (id === 'app_a') return { id: 'app_a', trial_id: 't1', status: 'contacted', user_id: 'u1' };
      if (id === 'app_b') return { id: 'app_b', trial_id: 't99', status: 'contacted', user_id: 'u2' };
      return null;
    });

    const req = buildReq({ body: { ids: ['app_a', 'app_b'], status: 'enrolled' } });
    const res = buildRes();
    await bulkUpdateCroApplicationStatus(req, res, jest.fn());

    const data = unwrap(res);
    const byId = Object.fromEntries(data.results.map((r) => [r.id, r]));

    expect(byId['app_a'].ok).toBe(true);
    expect(byId['app_b'].ok).toBe(false);
    expect(byId['app_b'].reason).toBe('forbidden');

    // 关键：他人申请单绝不能进状态机
    const transitionedIds = mockTransition.mock.calls.map((c) => c[0]);
    expect(transitionedIds).toContain('app_a');
    expect(transitionedIds).not.toContain('app_b');
  });

  test('actor 必须可归因为 croCompany.id（而非 undefined）', async () => {
    mockFindByPk.mockResolvedValue({ id: 'app_a', trial_id: 't1', status: 'contacted', user_id: 'u1' });

    const req = buildReq({ body: { ids: ['app_a'], status: 'enrolled' } });
    const res = buildRes();
    await bulkUpdateCroApplicationStatus(req, res, jest.fn());

    expect(mockTransition).toHaveBeenCalledTimes(1);
    const opts = mockTransition.mock.calls[0][2];
    expect(opts.actor).toEqual({ type: 'cro', id: 'cro_1' });
    expect(opts.actor.id).not.toBeUndefined();
  });

  test('不存在的申请单 → not_found，不影响其它条目', async () => {
    mockFindByPk.mockImplementation(async (id) =>
      id === 'app_a' ? { id: 'app_a', trial_id: 't1', status: 'contacted', user_id: 'u1' } : null);

    const req = buildReq({ body: { ids: ['missing', 'app_a'], status: 'enrolled' } });
    const res = buildRes();
    await bulkUpdateCroApplicationStatus(req, res, jest.fn());

    const data = unwrap(res);
    const byId = Object.fromEntries(data.results.map((r) => [r.id, r]));
    expect(byId['missing'].reason).toBe('not_found');
    expect(byId['app_a'].ok).toBe(true);
  });
});
