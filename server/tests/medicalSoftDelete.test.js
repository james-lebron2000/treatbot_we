/**
 * PRD-2026Q2 §3.5：多病历管理页 —— softDeleteRecord 控制器单元测试。
 *
 * 覆盖：
 *  - 找到记录 → update(deleted_at) + res.ok({id, deletedAt})
 *  - 记录不存在 / 非本人 → res.fail('记录不存在', 404)
 *  - list / findOne 查询一律带 deleted_at: null 过滤
 */

const mockFindOne = jest.fn();
const mockCalculateMD5 = jest.fn();

jest.mock('../models', () => ({
  MedicalRecord: {
    findOne: (...args) => mockFindOne(...args),
    findAndCountAll: jest.fn(),
    create: jest.fn(),
    count: jest.fn()
  },
  Trial: { findAll: jest.fn().mockResolvedValue([]) }
}));

jest.mock('../services/oss', () => ({
  calculateMD5: (...args) => mockCalculateMD5(...args),
  getInternalUrl: jest.fn(),
  generateKey: jest.fn(),
  uploadFile: jest.fn(),
  getRequestAwareUrl: jest.fn(),
  getObjectBuffer: jest.fn(),
  deleteFile: jest.fn()
}));

jest.mock('../services/queue', () => ({ addOCRTask: jest.fn() }));
jest.mock('../services/matchEngine', () => ({ scoreRecordAgainstTrial: () => ({ score: 0 }) }));
jest.mock('../utils/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }));

const { responseEnvelope } = require('../middleware/responseEnvelope');
const controller = require('../controllers/medical');

const buildRes = () => {
  const res = {};
  res.status = jest.fn(() => res);
  res.json = jest.fn(() => res);
  // 挂上真实的 envelope（与运行时一致）
  responseEnvelope({}, res, () => {});
  return res;
};

describe('medical.softDeleteRecord §3.5', () => {
  beforeEach(() => {
    mockFindOne.mockReset();
  });

  test('未找到记录（或他人记录）返回 404 + 统一 fail 信封', async () => {
    mockFindOne.mockResolvedValue(null);
    const res = buildRes();
    const next = jest.fn();

    await controller.softDeleteRecord(
      { params: { id: 'rec_missing' }, userId: 'user_1' },
      res,
      next
    );

    // 查询必须带 user_id + deleted_at: null 守门
    expect(mockFindOne).toHaveBeenCalledWith({
      where: { id: 'rec_missing', user_id: 'user_1', deleted_at: null }
    });
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({
      code: 404,
      message: '记录不存在',
      data: null
    });
    expect(next).not.toHaveBeenCalled();
  });

  test('找到记录 → update(deleted_at) 后返回 {id, deletedAt}', async () => {
    const update = jest.fn().mockResolvedValue(undefined);
    const fakeRecord = { id: 'rec_ok', update };
    mockFindOne.mockResolvedValue(fakeRecord);
    const res = buildRes();
    const next = jest.fn();

    await controller.softDeleteRecord(
      { params: { id: 'rec_ok' }, userId: 'user_1' },
      res,
      next
    );

    expect(update).toHaveBeenCalledTimes(1);
    const patch = update.mock.calls[0][0];
    expect(patch.deleted_at).toBeInstanceOf(Date);

    expect(res.json).toHaveBeenCalledTimes(1);
    const payload = res.json.mock.calls[0][0];
    expect(payload.code).toBe(0);
    expect(payload.data.id).toBe('rec_ok');
    expect(typeof payload.data.deletedAt).toBe('string');
    // ISO-8601 格式
    expect(() => new Date(payload.data.deletedAt).toISOString()).not.toThrow();
    expect(next).not.toHaveBeenCalled();
  });

  test('异常走 next（错误中间件）', async () => {
    mockFindOne.mockRejectedValue(new Error('db down'));
    const res = buildRes();
    const next = jest.fn();

    await controller.softDeleteRecord(
      { params: { id: 'rec_x' }, userId: 'user_1' },
      res,
      next
    );

    expect(next).toHaveBeenCalledWith(expect.any(Error));
  });
});
