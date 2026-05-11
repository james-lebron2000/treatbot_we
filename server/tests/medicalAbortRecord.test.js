/**
 * Plan §Phase 3.1：DELETE /medical/records/:id?abort=1 行为测试。
 *
 * 矩阵：
 *   pending  + ?abort=1 → cancelled_at + deleted_at 同时置；返回 cancelled:true
 *   running  + ?abort=1 → 仅 cancelled_at；保留记录可追溯
 *   completed + ?abort=1 → 409，不修改记录
 *   不带 ?abort=1 → 退化成原 softDelete（回归保护）
 */

const mockFindOne = jest.fn();
const mockPublish = jest.fn().mockResolvedValue(true);

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
  calculateMD5: jest.fn(),
  getInternalUrl: jest.fn(),
  generateKey: jest.fn(),
  uploadFile: jest.fn(),
  getRequestAwareUrl: jest.fn(),
  getObjectBuffer: jest.fn(),
  deleteFile: jest.fn()
}));
jest.mock('../services/queue', () => ({ addOCRTask: jest.fn() }));
jest.mock('../services/matchEngine', () => ({ scoreRecordAgainstTrial: () => ({ score: 0 }) }));
jest.mock('../services/recordEvents', () => ({ publishRecordEvent: (...a) => mockPublish(...a) }));
jest.mock('../utils/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }));

const { responseEnvelope } = require('../middleware/responseEnvelope');
const controller = require('../controllers/medical');

const buildRes = () => {
  const res = {};
  res.status = jest.fn(() => res);
  res.json = jest.fn(() => res);
  responseEnvelope({}, res, () => {});
  return res;
};

const buildReq = ({ id = 'rec_a', userId = 'user_1', abort } = {}) => ({
  params: { id },
  userId,
  query: abort !== undefined ? { abort } : {}
});

describe('medical.softDeleteRecord §3.1 ?abort=1 分支', () => {
  beforeEach(() => {
    mockFindOne.mockReset();
    mockPublish.mockClear();
  });

  test('pending 记录 + ?abort=1 → cancelled_at + deleted_at 同时置', async () => {
    const update = jest.fn().mockResolvedValue(undefined);
    mockFindOne.mockResolvedValue({ id: 'rec_p', status: 'pending', update });

    const res = buildRes();
    await controller.softDeleteRecord(buildReq({ id: 'rec_p', abort: '1' }), res, jest.fn());

    expect(update).toHaveBeenCalledTimes(1);
    const patch = update.mock.calls[0][0];
    expect(patch.cancelled_at).toBeInstanceOf(Date);
    expect(patch.deleted_at).toBeInstanceOf(Date);
    // 同一时间戳（同步 new Date()）
    expect(patch.cancelled_at.getTime()).toBe(patch.deleted_at.getTime());

    const payload = res.json.mock.calls[0][0];
    expect(payload.code).toBe(0);
    expect(payload.data.cancelled).toBe(true);
    expect(typeof payload.data.cancelledAt).toBe('string');
    expect(typeof payload.data.deletedAt).toBe('string');

    expect(mockPublish).toHaveBeenCalledWith('rec_p', expect.objectContaining({ status: 'cancelled' }));
  });

  test('running 记录 + ?abort=1 → 仅 cancelled_at，deleted_at 保留为 null（记录可追溯）', async () => {
    const update = jest.fn().mockResolvedValue(undefined);
    mockFindOne.mockResolvedValue({ id: 'rec_r', status: 'running', update });

    const res = buildRes();
    await controller.softDeleteRecord(buildReq({ id: 'rec_r', abort: '1' }), res, jest.fn());

    const patch = update.mock.calls[0][0];
    expect(patch.cancelled_at).toBeInstanceOf(Date);
    expect(patch.deleted_at).toBeUndefined();

    const payload = res.json.mock.calls[0][0];
    expect(payload.data.cancelled).toBe(true);
    expect(payload.data.deletedAt).toBeNull();
  });

  test('completed 记录 + ?abort=1 → 409，update 不被调用', async () => {
    const update = jest.fn();
    mockFindOne.mockResolvedValue({ id: 'rec_c', status: 'completed', update });

    const res = buildRes();
    await controller.softDeleteRecord(buildReq({ id: 'rec_c', abort: '1' }), res, jest.fn());

    expect(update).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json.mock.calls[0][0]).toMatchObject({
      code: 409,
      message: '解析已完成，无法取消'
    });
    expect(mockPublish).not.toHaveBeenCalled();
  });

  test('error 记录 + ?abort=1 → 同 pending（cancelled + deleted）', async () => {
    const update = jest.fn().mockResolvedValue(undefined);
    mockFindOne.mockResolvedValue({ id: 'rec_e', status: 'error', update });

    const res = buildRes();
    await controller.softDeleteRecord(buildReq({ id: 'rec_e', abort: '1' }), res, jest.fn());

    const patch = update.mock.calls[0][0];
    expect(patch.cancelled_at).toBeInstanceOf(Date);
    expect(patch.deleted_at).toBeInstanceOf(Date);
  });

  test('不带 ?abort 参数 → 仍走原 softDelete 路径（回归保护）', async () => {
    const update = jest.fn().mockResolvedValue(undefined);
    mockFindOne.mockResolvedValue({ id: 'rec_x', status: 'pending', update });

    const res = buildRes();
    await controller.softDeleteRecord(buildReq({ id: 'rec_x' }), res, jest.fn());

    const patch = update.mock.calls[0][0];
    expect(patch.deleted_at).toBeInstanceOf(Date);
    expect(patch.cancelled_at).toBeUndefined(); // 老路径不写 cancelled_at

    const payload = res.json.mock.calls[0][0];
    expect(payload.data.cancelled).toBeUndefined(); // 老 payload 不带 cancelled 字段
    expect(typeof payload.data.deletedAt).toBe('string');
  });

  test('abort=0 / abort= 等非 "1" 字符串 → 视作不取消', async () => {
    const update = jest.fn().mockResolvedValue(undefined);
    mockFindOne.mockResolvedValue({ id: 'rec_y', status: 'pending', update });

    await controller.softDeleteRecord(buildReq({ id: 'rec_y', abort: '0' }), buildRes(), jest.fn());

    expect(update.mock.calls[0][0].cancelled_at).toBeUndefined();
  });

  test('记录不存在 + ?abort=1 → 404（与原 softDelete 一致）', async () => {
    mockFindOne.mockResolvedValue(null);
    const res = buildRes();

    await controller.softDeleteRecord(buildReq({ id: 'rec_missing', abort: '1' }), res, jest.fn());

    expect(res.status).toHaveBeenCalledWith(404);
  });

  test('publishRecordEvent 抛错不影响 abort 主路径', async () => {
    mockPublish.mockImplementationOnce(() => { throw new Error('redis down'); });
    const update = jest.fn().mockResolvedValue(undefined);
    mockFindOne.mockResolvedValue({ id: 'rec_z', status: 'pending', update });

    const res = buildRes();
    const next = jest.fn();
    await controller.softDeleteRecord(buildReq({ id: 'rec_z', abort: '1' }), res, next);

    // 主流程仍 200，next 不应被调
    expect(next).not.toHaveBeenCalled();
    const payload = res.json.mock.calls[0][0];
    expect(payload.code).toBe(0);
    expect(payload.data.cancelled).toBe(true);
  });
});
