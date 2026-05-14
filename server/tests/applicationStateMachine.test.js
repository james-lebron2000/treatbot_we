/**
 * PRD-2026Q3 T0-2：申请状态机单元测试。
 * 覆盖：
 *   - 合法转移：写 status + event
 *   - 非法转移：抛 InvalidTransitionError(422)，不写 status / event
 *   - terminal 不可再变更
 *   - from === to 幂等：noop=true，不写 event
 *   - actor 必须传合法 type
 *   - extraFields 与 status 同事务 update
 */

const mockTransaction = jest.fn();
const mockAppFindByPk = jest.fn();
const mockEventCreate = jest.fn();
const mockEventFindAll = jest.fn();

jest.mock('../models', () => ({
  sequelize: {
    transaction: (fn) => mockTransaction(fn)
  },
  TrialApplication: {
    findByPk: (...args) => mockAppFindByPk(...args)
  },
  ApplicationStatusEvent: {
    create: (...args) => mockEventCreate(...args),
    findAll: (...args) => mockEventFindAll(...args)
  }
}));

const sm = require('../services/applicationStateMachine');

const fakeApp = (status) => {
  const app = {
    id: 'app_test',
    status,
    update: jest.fn().mockImplementation(async function (fields) {
      Object.assign(this, fields);
      return this;
    })
  };
  return app;
};

const runInTxn = (impl) => {
  mockTransaction.mockImplementation(async (fn) => fn({ LOCK: { UPDATE: 'UPDATE' } }));
  return impl;
};

describe('applicationStateMachine.transition', () => {
  beforeEach(() => {
    mockTransaction.mockReset();
    mockAppFindByPk.mockReset();
    mockEventCreate.mockReset();
    mockEventFindAll.mockReset();
  });

  test('合法转移 pending → contacted：更新 status，写一条事件', async () => {
    runInTxn();
    const app = fakeApp('pending');
    mockAppFindByPk.mockResolvedValue(app);
    mockEventCreate.mockResolvedValue({ id: 1 });

    const result = await sm.transition('app_test', 'contacted', {
      actor: { type: 'cro', id: 'cro_1' },
      reason: '电话已拨通'
    });

    expect(result.from).toBe('pending');
    expect(result.to).toBe('contacted');
    expect(result.noop).toBe(false);
    expect(app.update).toHaveBeenCalledWith({ status: 'contacted' }, expect.any(Object));
    expect(mockEventCreate).toHaveBeenCalledWith({
      application_id: 'app_test',
      from_status: 'pending',
      to_status: 'contacted',
      actor_type: 'cro',
      actor_id: 'cro_1',
      reason: '电话已拨通'
    }, expect.any(Object));
  });

  test('合法链路 contacted → screened → enrolled：每跳都写事件', async () => {
    runInTxn();
    let app = fakeApp('contacted');
    mockAppFindByPk.mockResolvedValueOnce(app);
    mockEventCreate.mockResolvedValueOnce({ id: 2 });
    await sm.transition('app_test', 'screened', { actor: { type: 'cro', id: 'cro_1' } });

    app = fakeApp('screened');
    mockAppFindByPk.mockResolvedValueOnce(app);
    mockEventCreate.mockResolvedValueOnce({ id: 3 });
    const r = await sm.transition('app_test', 'enrolled', { actor: { type: 'cro', id: 'cro_1' } });

    expect(r.from).toBe('screened');
    expect(r.to).toBe('enrolled');
    expect(mockEventCreate).toHaveBeenCalledTimes(2);
  });

  test('非法转移 pending → enrolled：抛 InvalidTransitionError(422)，不写 status / event', async () => {
    runInTxn();
    const app = fakeApp('pending');
    mockAppFindByPk.mockResolvedValue(app);

    await expect(sm.transition('app_test', 'enrolled', {
      actor: { type: 'admin', id: 'admin_1' }
    })).rejects.toMatchObject({
      name: 'InvalidTransitionError',
      code: 422,
      from: 'pending',
      to: 'enrolled'
    });

    expect(app.update).not.toHaveBeenCalled();
    expect(mockEventCreate).not.toHaveBeenCalled();
  });

  test('terminal rejected → contacted：拒绝转移', async () => {
    runInTxn();
    const app = fakeApp('rejected');
    mockAppFindByPk.mockResolvedValue(app);

    await expect(sm.transition('app_test', 'contacted', {
      actor: { type: 'admin', id: 'admin_1' }
    })).rejects.toMatchObject({
      name: 'InvalidTransitionError',
      code: 422
    });
  });

  test('legacy cancelled 视为 terminal：cancelled → withdrawn 也被拒', async () => {
    runInTxn();
    const app = fakeApp('cancelled');
    mockAppFindByPk.mockResolvedValue(app);

    await expect(sm.transition('app_test', 'withdrawn', {
      actor: { type: 'user', id: 'user_1' }
    })).rejects.toMatchObject({ name: 'InvalidTransitionError' });
  });

  test('幂等 from === to：返回 noop=true，不写事件', async () => {
    runInTxn();
    const app = fakeApp('contacted');
    mockAppFindByPk.mockResolvedValue(app);

    const r = await sm.transition('app_test', 'contacted', {
      actor: { type: 'cro', id: 'cro_1' }
    });

    expect(r.noop).toBe(true);
    expect(app.update).not.toHaveBeenCalled();
    expect(mockEventCreate).not.toHaveBeenCalled();
  });

  test('app 不存在：抛 ApplicationNotFoundError(404)', async () => {
    runInTxn();
    mockAppFindByPk.mockResolvedValue(null);

    await expect(sm.transition('app_missing', 'contacted', {
      actor: { type: 'cro', id: 'cro_1' }
    })).rejects.toMatchObject({
      name: 'ApplicationNotFoundError',
      code: 404
    });
  });

  test('actor.type 非法：直接抛错，不进事务', async () => {
    await expect(sm.transition('app_test', 'contacted', {
      actor: { type: 'unknown' }
    })).rejects.toThrow(/合法 actor.type/);
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  test('extraFields 与 status 同次 update（remark / idempotency_key 释放）', async () => {
    runInTxn();
    const app = fakeApp('pending');
    mockAppFindByPk.mockResolvedValue(app);
    mockEventCreate.mockResolvedValue({ id: 4 });

    await sm.transition('app_test', 'withdrawn', {
      actor: { type: 'user', id: 'user_1' },
      reason: 'changed mind',
      extraFields: { remark: 'changed mind', idempotency_key: 'released_app_test_xxx' }
    });

    expect(app.update).toHaveBeenCalledWith({
      remark: 'changed mind',
      idempotency_key: 'released_app_test_xxx',
      status: 'withdrawn'
    }, expect.any(Object));
  });

  test('user / admin 也能直接走 pending → withdrawn（用户取消最常见路径）', async () => {
    runInTxn();
    const app = fakeApp('pending');
    mockAppFindByPk.mockResolvedValue(app);
    mockEventCreate.mockResolvedValue({ id: 5 });

    const r = await sm.transition('app_test', 'withdrawn', {
      actor: { type: 'user', id: 'user_1' }
    });

    expect(r.from).toBe('pending');
    expect(r.to).toBe('withdrawn');
    expect(mockEventCreate).toHaveBeenCalled();
  });

  test('enrolled → withdrawn 唯一允许的 enrolled 出度', async () => {
    runInTxn();
    let app = fakeApp('enrolled');
    mockAppFindByPk.mockResolvedValue(app);
    mockEventCreate.mockResolvedValue({ id: 6 });

    const r = await sm.transition('app_test', 'withdrawn', {
      actor: { type: 'admin', id: 'admin_1' }
    });
    expect(r.to).toBe('withdrawn');

    // enrolled → rejected 应被拒
    app = fakeApp('enrolled');
    mockAppFindByPk.mockResolvedValue(app);
    await expect(sm.transition('app_test', 'rejected', {
      actor: { type: 'admin', id: 'admin_1' }
    })).rejects.toMatchObject({ name: 'InvalidTransitionError' });
  });
});

describe('applicationStateMachine.isAllowed / isTerminal / TRANSITIONS', () => {
  test('isAllowed 真值表覆盖关键边', () => {
    expect(sm.isAllowed('pending', 'contacted')).toBe(true);
    expect(sm.isAllowed('pending', 'screened')).toBe(false);
    expect(sm.isAllowed('contacted', 'screened')).toBe(true);
    expect(sm.isAllowed('screened', 'enrolled')).toBe(true);
    expect(sm.isAllowed('enrolled', 'withdrawn')).toBe(true);
    expect(sm.isAllowed('rejected', 'contacted')).toBe(false);
    expect(sm.isAllowed('withdrawn', 'pending')).toBe(false);
  });

  test('isTerminal 包含 rejected / withdrawn / cancelled', () => {
    expect(sm.isTerminal('rejected')).toBe(true);
    expect(sm.isTerminal('withdrawn')).toBe(true);
    expect(sm.isTerminal('cancelled')).toBe(true);
    expect(sm.isTerminal('pending')).toBe(false);
    expect(sm.isTerminal('contacted')).toBe(false);
  });
});

describe('applicationStateMachine.getTimeline', () => {
  beforeEach(() => mockEventFindAll.mockReset());

  test('按 created_at + id 升序返回事件', async () => {
    mockEventFindAll.mockResolvedValue([
      { id: 1, from_status: 'pending', to_status: 'contacted' },
      { id: 2, from_status: 'contacted', to_status: 'screened' }
    ]);

    const events = await sm.getTimeline('app_test');
    expect(events).toHaveLength(2);
    expect(mockEventFindAll).toHaveBeenCalledWith({
      where: { application_id: 'app_test' },
      order: [['created_at', 'ASC'], ['id', 'ASC']]
    });
  });
});
