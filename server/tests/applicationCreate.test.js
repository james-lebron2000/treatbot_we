/**
 * PRD-2026Q2 §2.5：
 *  - create 在事务内完成，active 记录存在时返回 existing（duplicate=true）
 *  - UniqueConstraintError 场景下回查并返回 200，不抛 500
 *  - cancel 释放 idempotency_key，允许重新报名
 *
 * 这里 mock sequelize 与模型，专注于控制器逻辑分支（完整并发测试走 staging ab -n20 -c20）。
 */

const { UniqueConstraintError } = require('sequelize');

const mockTransaction = jest.fn();
const mockTrialFindByPk = jest.fn();
const mockAppFindOne = jest.fn();
const mockAppCreate = jest.fn();
const mockMedicalCount = jest.fn();

jest.mock('../models', () => {
  const LOCK = { SHARE: 'SHARE', UPDATE: 'UPDATE' };
  return {
    sequelize: {
      transaction: (fn) => mockTransaction(fn)
    },
    Trial: { findByPk: (...args) => mockTrialFindByPk(...args) },
    TrialApplication: {
      findOne: (...args) => mockAppFindOne(...args),
      create: (...args) => mockAppCreate(...args)
    },
    MedicalRecord: {
      findAll: jest.fn().mockResolvedValue([]),
      count: (...args) => mockMedicalCount(...args)
    }
  };
});

jest.mock('../services/matchEngine', () => ({
  STATUS_TEXT_MAP: { recruiting: '招募中', closed: '已关闭' }
}));

const controller = require('../controllers/application');

const buildRes = () => {
  const res = {};
  res.status = jest.fn(() => res);
  res.json = jest.fn(() => res);
  return res;
};

const buildReq = (overrides = {}) => ({
  userId: overrides.userId || 'user_123',
  body: {
    trialId: 'trial_ABC',
    recordIds: ['rec_1'],
    name: 'Alice',
    phone: '13800001111',
    ...(overrides.body || {})
  }
});

describe('application.create §2.5', () => {
  beforeEach(() => {
    mockTransaction.mockReset();
    mockTrialFindByPk.mockReset();
    mockAppFindOne.mockReset();
    mockAppCreate.mockReset();
    mockMedicalCount.mockReset();
    mockMedicalCount.mockResolvedValue(1);
  });

  test('happy path: 新建报名成功，idempotency_key 写入 active_u_*_t_*', async () => {
    mockTransaction.mockImplementation(async (fn) => {
      return fn({ LOCK: { SHARE: 'SHARE', UPDATE: 'UPDATE' } });
    });
    mockTrialFindByPk.mockResolvedValue({ id: 'trial_ABC', name: '某试验', status: 'recruiting' });
    mockAppFindOne.mockResolvedValue(null);
    mockAppCreate.mockResolvedValue({
      id: 'app_xyz',
      status: 'pending',
      created_at: new Date('2026-04-18T00:00:00Z')
    });

    const req = buildReq();
    const res = buildRes();
    const next = jest.fn();

    await controller.create(req, res, next);

    expect(next).not.toHaveBeenCalled();
    const createArgs = mockAppCreate.mock.calls[0][0];
    expect(createArgs.idempotency_key).toBe('active_u_user_123_t_trial_ABC');
    expect(createArgs.status).toBe('pending');

    const jsonPayload = res.json.mock.calls[0][0];
    expect(jsonPayload.code).toBe(0);
    expect(jsonPayload.data.applicationId).toBe('app_xyz');
    expect(jsonPayload.data.duplicate).toBeUndefined();
  });

  test('active application 已存在：返回 duplicate=true 而不是 409', async () => {
    mockTransaction.mockImplementation(async (fn) => {
      return fn({ LOCK: { SHARE: 'SHARE', UPDATE: 'UPDATE' } });
    });
    mockTrialFindByPk.mockResolvedValue({ id: 'trial_ABC', name: '某试验', status: 'recruiting' });
    mockAppFindOne.mockResolvedValue({
      id: 'app_existing',
      status: 'contacted',
      created_at: new Date('2026-04-10T00:00:00Z')
    });

    const req = buildReq();
    const res = buildRes();
    const next = jest.fn();

    await controller.create(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(mockAppCreate).not.toHaveBeenCalled();
    const payload = res.json.mock.calls[0][0];
    expect(payload.code).toBe(0);
    expect(payload.data.duplicate).toBe(true);
    expect(payload.data.applicationId).toBe('app_existing');
    expect(payload.data.status).toBe('contacted');
  });

  test('试验非 recruiting：抛 400', async () => {
    mockTransaction.mockImplementation(async (fn) => fn({ LOCK: { SHARE: 'SHARE', UPDATE: 'UPDATE' } }));
    mockTrialFindByPk.mockResolvedValue({ id: 'trial_ABC', name: '某试验', status: 'closed' });

    const req = buildReq();
    const res = buildRes();
    const next = jest.fn();

    await controller.create(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    const err = next.mock.calls[0][0];
    expect(err.code).toBe(400);
  });

  test('并发场景 UniqueConstraintError：回查并返回 duplicate=true', async () => {
    // 第一次 transaction 抛 Unique，catch 块再调 Trial.findByPk + TrialApplication.findOne
    const uce = new UniqueConstraintError({
      errors: [{ path: 'idempotency_key', value: 'active_u_user_123_t_trial_ABC' }]
    });

    mockTransaction.mockImplementationOnce(async () => { throw uce; });
    mockTrialFindByPk.mockResolvedValueOnce({ id: 'trial_ABC', name: '某试验', status: 'recruiting' });
    mockAppFindOne.mockResolvedValueOnce({
      id: 'app_by_race_winner',
      status: 'pending',
      created_at: new Date('2026-04-18T00:00:00Z')
    });

    const req = buildReq();
    const res = buildRes();
    const next = jest.fn();

    await controller.create(req, res, next);

    expect(next).not.toHaveBeenCalled();
    const payload = res.json.mock.calls[0][0];
    expect(payload.code).toBe(0);
    expect(payload.data.duplicate).toBe(true);
    expect(payload.data.applicationId).toBe('app_by_race_winner');
  });

  test('缺少 trialId：抛 400', async () => {
    const req = buildReq({ body: { trialId: undefined } });
    const res = buildRes();
    const next = jest.fn();

    await controller.create(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(mockTransaction).not.toHaveBeenCalled();
  });
});

describe('application.cancel §2.5', () => {
  test('cancel 把 idempotency_key 释放成 released_*', async () => {
    const updateCalls = [];
    mockAppFindOne.mockReset();
    mockAppFindOne.mockResolvedValueOnce({
      id: 'app_xyz',
      status: 'pending',
      remark: null,
      update: (fields) => {
        updateCalls.push(fields);
        return Promise.resolve();
      }
    });

    const req = {
      userId: 'user_123',
      params: { id: 'app_xyz' },
      body: { reason: '换家医院' }
    };
    const res = buildRes();
    const next = jest.fn();

    await controller.cancel(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0].status).toBe('cancelled');
    expect(updateCalls[0].idempotency_key).toMatch(/^released_app_xyz_/);
  });
});
