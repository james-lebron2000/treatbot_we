/**
 * croBulkAuth.test.js — CRO 批量改状态的跨租户鉴权（Iter 10 修复回归守卫）。
 *
 * 修复前：bulk 路径依赖不存在的 req.croId / trial.cro_company_id 与 as:'trial' 别名，
 * 鉴权是死代码（他家申请也能改），且 include 别名会让每条都抛错失败。
 * 修复后：与单条更新同源，用 req.croCompany.trial_ids 校验归属、req.croCompany.id 作 actor。
 * 本测试锁定：只有本 CRO 拥有的试验申请会进状态机；他家申请返回 forbidden 且绝不调用状态机。
 */
const mockFindByPk = jest.fn();
const mockTransition = jest.fn();

jest.mock('../models', () => ({
  TrialApplication: { findByPk: (...a) => mockFindByPk(...a) },
  Trial: {},
  CroCompany: {},
  User: {},
  ApplicationStatusEvent: {},
  sequelize: {}
}));
jest.mock('../services/applicationStateMachine', () => ({
  transition: (...a) => mockTransition(...a),
  InvalidTransitionError: class InvalidTransitionError extends Error {}
}));
jest.mock('../services/funnelTracker', () => ({ track: jest.fn(), EVENTS: {} }));

const croController = require('../controllers/cro');

const makeRes = () => ({
  statusCode: 200,
  body: null,
  status(c) {
    this.statusCode = c;
    return this;
  },
  json(b) {
    this.body = b;
    return this;
  }
});

describe('CRO 批量改状态 — 跨租户鉴权', () => {
  beforeEach(() => {
    mockFindByPk.mockReset();
    mockTransition.mockReset();
  });

  test('只推进本 CRO 拥有(trial_ids)的申请；他家申请 forbidden 且不进状态机', async () => {
    // a1 属于 t1（本 CRO 拥有），a2 属于 t2（他家）
    mockFindByPk.mockImplementation((id) => {
      if (id === 'a1') return Promise.resolve({ id: 'a1', trial_id: 't1', status: 'pending', user_id: 'u1' });
      if (id === 'a2') return Promise.resolve({ id: 'a2', trial_id: 't2', status: 'pending', user_id: 'u2' });
      return Promise.resolve(null);
    });
    mockTransition.mockResolvedValue({ from: 'pending', to: 'contacted' });

    const req = {
      body: { ids: ['a1', 'a2'], status: 'contacted' },
      croCompany: { id: 'cro-1', trial_ids: ['t1'] }
    };
    const res = makeRes();
    await croController.bulkUpdateCroApplicationStatus(req, res, (e) => {
      throw e;
    });

    const results = res.body.data.results;
    const r1 = results.find((r) => r.id === 'a1');
    const r2 = results.find((r) => r.id === 'a2');

    expect(r1.ok).toBe(true);
    expect(r2.ok).toBe(false);
    expect(r2.reason).toBe('forbidden');

    // 状态机只为本家 a1 调用一次，绝不为他家 a2 调用 —— 这是跨租户隔离的核心断言
    expect(mockTransition).toHaveBeenCalledTimes(1);
    expect(mockTransition).toHaveBeenCalledWith(
      'a1',
      'contacted',
      expect.objectContaining({ actor: { type: 'cro', id: 'cro-1' } })
    );
  });

  test('不存在的申请返回 not_found，同样不进状态机', async () => {
    mockFindByPk.mockResolvedValue(null);
    const req = { body: { ids: ['missing'], status: 'contacted' }, croCompany: { id: 'cro-1', trial_ids: ['t1'] } };
    const res = makeRes();
    await croController.bulkUpdateCroApplicationStatus(req, res, (e) => {
      throw e;
    });
    expect(res.body.data.results[0]).toMatchObject({ id: 'missing', ok: false, reason: 'not_found' });
    expect(mockTransition).not.toHaveBeenCalled();
  });
});
