/**
 * PRD-2026Q3 T1-3：多病历 active 切换
 *
 * 覆盖：
 *   1. activateRecord：未找到 → 404
 *   2. activateRecord：已 active → noop=true
 *   3. activateRecord：从 A active → B active 时，A 被 reset 为 0；事务串行
 *   4. 跨用户隔离：操作他人 record 视为 404
 */

const mockFindOne = jest.fn();
const mockUpdate = jest.fn();
const mockTransaction = jest.fn();
const txContext = { LOCK: { UPDATE: 'UPDATE' } };

jest.mock('../models', () => ({
  MedicalRecord: {
    findOne: (...a) => mockFindOne(...a),
    update: (...a) => mockUpdate(...a)
  },
  Trial: {},
  sequelize: {
    transaction: (fn) => mockTransaction(fn)
  }
}));

jest.mock('../services/oss', () => ({}));
jest.mock('../services/queue', () => ({}));
jest.mock('../services/matchEngine', () => ({ scoreRecordAgainstTrial: jest.fn() }));

const controller = require('../controllers/medical');

const buildRes = () => {
  const res = {};
  res.status = jest.fn(() => res);
  res.json = jest.fn(() => res);
  res.fail = jest.fn((msg, code) => { res.statusCode = code; res.body = { msg, code }; return res; });
  res.ok = jest.fn((data) => { res.body = data; return res; });
  return res;
};

beforeEach(() => {
  mockFindOne.mockReset();
  mockUpdate.mockReset();
  mockTransaction.mockReset();
  mockTransaction.mockImplementation((fn) => fn(txContext));
});

describe('activateRecord — T1-3', () => {
  test('1) record 不存在 → 404', async () => {
    mockFindOne.mockResolvedValue(null);
    const req = { userId: 'u_1', params: { id: 'rec_404' } };
    const res = buildRes();
    await controller.activateRecord(req, res, jest.fn());
    expect(res.fail).toHaveBeenCalledWith('记录不存在', 404);
  });

  test('2) 已 active → noop=true，不做 update', async () => {
    const fakeRec = { id: 'rec_1', is_active: true, update: jest.fn() };
    mockFindOne.mockResolvedValue(fakeRec);
    const req = { userId: 'u_1', params: { id: 'rec_1' } };
    const res = buildRes();
    await controller.activateRecord(req, res, jest.fn());
    expect(res.ok).toHaveBeenCalledWith({ id: 'rec_1', isActive: true, noop: true });
    expect(mockUpdate).not.toHaveBeenCalled();
    expect(fakeRec.update).not.toHaveBeenCalled();
  });

  test('3) 从 A → B：先 UPDATE is_active=0 WHERE user_id+is_active=1，再 update 当前 record', async () => {
    const fakeRec = { id: 'rec_B', is_active: false, update: jest.fn() };
    mockFindOne.mockResolvedValue(fakeRec);
    mockUpdate.mockResolvedValue([1]);
    const req = { userId: 'u_1', params: { id: 'rec_B' } };
    const res = buildRes();
    await controller.activateRecord(req, res, jest.fn());

    expect(mockUpdate).toHaveBeenCalledTimes(1);
    expect(mockUpdate.mock.calls[0][0]).toEqual({ is_active: false });
    expect(mockUpdate.mock.calls[0][1].where).toEqual({ user_id: 'u_1', is_active: true });
    expect(mockUpdate.mock.calls[0][1].transaction).toBe(txContext);

    expect(fakeRec.update).toHaveBeenCalledWith({ is_active: true }, { transaction: txContext });
    expect(res.ok).toHaveBeenCalledWith({ id: 'rec_B', isActive: true, noop: false });
  });

  test('4) 跨用户：findOne 已带 user_id=req.userId 过滤，他人 record 命中即 404', async () => {
    mockFindOne.mockResolvedValue(null);
    const req = { userId: 'u_attacker', params: { id: 'rec_owned_by_u1' } };
    const res = buildRes();
    await controller.activateRecord(req, res, jest.fn());
    expect(mockFindOne).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'rec_owned_by_u1', user_id: 'u_attacker', deleted_at: null },
      lock: 'UPDATE'
    }));
    expect(res.fail).toHaveBeenCalledWith('记录不存在', 404);
  });
});
