/**
 * PRD-2026Q3 T0-1：CRO 多试验导出验收
 *
 * 覆盖：
 *   1. 跨试验导出（trialIds=t1,t2 + status 过滤）→ 行数正确 + 复合 where
 *   2. format=csv → text/csv + BOM + EXPORT_HEADERS 顺序
 *   3. format=json → application/json + envelope
 *   4. 任一 trialId 不在 croCompany.trial_ids → 403 + 不查 DB
 *   5. unmask=false → 手机号掩码 + 不写 admin_audit_log
 *   6. unmask=true  → 手机号明文 + 写 cro_export_log.fields.phone_full=true + 写 admin_audit_log
 *   7. 单试验老调用 ?trialId=t1 仍可工作（兼容）
 *
 * 用 jest.mock 拦掉 models —— 不依赖 MySQL，CI 上可独立跑。
 */

const mockAppFindAll = jest.fn();
const mockMrFindAll = jest.fn();
const mockExportLogCreate = jest.fn().mockResolvedValue({});
const mockAuditCreate = jest.fn().mockResolvedValue({});

jest.mock('../models', () => ({
  CroCompany: {},
  TrialApplication: { findAll: (...a) => mockAppFindAll(...a) },
  Trial: {},
  User: {},
  MedicalRecord: { findAll: (...a) => mockMrFindAll(...a) },
  CroExportLog: { create: (...a) => mockExportLogCreate(...a) },
  AdminAuditLog: { create: (...a) => mockAuditCreate(...a) }
}));

jest.mock('../services/applicationStateMachine', () => ({
  transition: jest.fn(),
  InvalidTransitionError: class InvalidTransitionError extends Error {},
  ApplicationNotFoundError: class ApplicationNotFoundError extends Error {}
}));

jest.mock('../services/notify', () => ({ applicationStatusChanged: jest.fn().mockResolvedValue() }));

const { exportCroApplications } = require('../controllers/cro');

const buildRes = () => {
  const res = {};
  res.status = jest.fn(() => res);
  res.json = jest.fn(() => res);
  res.setHeader = jest.fn();
  res.send = jest.fn();
  return res;
};

const buildReq = (overrides = {}) => ({
  croCompany: { id: 'cro_1', name: 'AcmeCRO', trial_ids: ['t1', 't2', 't3'] },
  query: {},
  headers: {},
  ...overrides
});

const fakeApp = (id, trial_id, status, phone, recordIds = ['rec_1']) => ({
  id, trial_id, status,
  created_at: new Date('2026-05-01T08:00:00Z'),
  record_ids: recordIds, notes: [],
  User: { id: 'u_1', nickname: 'Alice', phone }
});

const fakeRecord = (id, overrides = {}) => ({
  id,
  diagnosis: '肺癌', stage: 'IV', gene_mutation: 'EGFR L858R',
  treatment_line: 2, pdl1: '50%',
  structured: { age: 56, gender: 'F', city: '上海', ecog: 1 },
  ...overrides
});

beforeEach(() => {
  mockAppFindAll.mockReset();
  mockMrFindAll.mockReset();
  mockExportLogCreate.mockClear();
  mockAuditCreate.mockClear();
});

describe('exportCroApplications — T0-1', () => {
  test('1) 跨试验 + status 过滤：where 包含 IN [t1,t2] + status IN [pending]', async () => {
    mockAppFindAll.mockResolvedValue([
      fakeApp('app_1', 't1', 'pending', '13812341234'),
      fakeApp('app_2', 't2', 'pending', '13987654321')
    ]);
    mockMrFindAll.mockResolvedValue([fakeRecord('rec_1')]);

    const req = buildReq({ query: { trialIds: 't1,t2', status: 'pending', format: 'json' } });
    const res = buildRes();
    await exportCroApplications(req, res, jest.fn());

    expect(mockAppFindAll).toHaveBeenCalledTimes(1);
    const call = mockAppFindAll.mock.calls[0][0];
    expect(call.where.trial_id).toBeDefined();
    expect(call.where.status).toBeDefined();
    expect(res.json).toHaveBeenCalled();
    const payload = res.json.mock.calls[0][0];
    expect(payload.code).toBe(0);
    expect(payload.data.total).toBe(2);
    expect(payload.data.trialIds).toEqual(['t1', 't2']);
  });

  test('2) format=csv → text/csv + BOM + EXPORT_HEADERS 顺序', async () => {
    mockAppFindAll.mockResolvedValue([fakeApp('app_1', 't1', 'pending', '13812341234')]);
    mockMrFindAll.mockResolvedValue([fakeRecord('rec_1')]);

    const req = buildReq({ query: { trialIds: 't1' } });
    const res = buildRes();
    await exportCroApplications(req, res, jest.fn());

    expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'text/csv; charset=utf-8');
    const sent = res.send.mock.calls[0][0];
    // BOM 头
    expect(sent.charCodeAt(0)).toBe(0xFEFF);
    // header 第一行
    const firstLine = sent.slice(1).split('\n')[0];
    expect(firstLine.startsWith('申请ID,状态,申请时间,患者昵称,手机号')).toBe(true);
    expect(firstLine.includes('record_ids')).toBe(true);
  });

  test('3) format=json → 信封 + rows 数组', async () => {
    mockAppFindAll.mockResolvedValue([fakeApp('app_1', 't1', 'pending', '13812341234')]);
    mockMrFindAll.mockResolvedValue([fakeRecord('rec_1')]);

    const req = buildReq({ query: { trialIds: 't1', format: 'json' } });
    const res = buildRes();
    await exportCroApplications(req, res, jest.fn());

    expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'application/json; charset=utf-8');
    const payload = res.json.mock.calls[0][0];
    expect(payload.code).toBe(0);
    expect(Array.isArray(payload.data.rows)).toBe(true);
    expect(payload.data.rows[0]['申请ID']).toBe('app_1');
  });

  test('4) 未授权 trialId → 403 + 不查 DB', async () => {
    const req = buildReq({ query: { trialIds: 't1,t999', format: 'json' } });
    const res = buildRes();
    await exportCroApplications(req, res, jest.fn());

    expect(res.status).toHaveBeenCalledWith(403);
    expect(mockAppFindAll).not.toHaveBeenCalled();
    expect(mockExportLogCreate).not.toHaveBeenCalled();
  });

  test('5) unmask=false → 手机号掩码 + 不写 admin_audit_log + cro_export_log.unmask=false', async () => {
    mockAppFindAll.mockResolvedValue([fakeApp('app_1', 't1', 'pending', '13812341234')]);
    mockMrFindAll.mockResolvedValue([fakeRecord('rec_1')]);

    const req = buildReq({ query: { trialIds: 't1', format: 'json' } });
    const res = buildRes();
    await exportCroApplications(req, res, jest.fn());

    const payload = res.json.mock.calls[0][0];
    expect(payload.data.rows[0]['手机号']).toBe('138****1234');
    expect(mockAuditCreate).not.toHaveBeenCalled();
    expect(mockExportLogCreate).toHaveBeenCalledTimes(1);
    expect(mockExportLogCreate.mock.calls[0][0].unmask).toBe(false);
    expect(mockExportLogCreate.mock.calls[0][0].fields.phone_full).toBe(false);
  });

  test('6) unmask=true → 明文手机号 + 写 admin_audit_log action=cro_export_unmask + cro_export_log.fields.phone_full=true', async () => {
    mockAppFindAll.mockResolvedValue([fakeApp('app_1', 't1', 'pending', '13812341234')]);
    mockMrFindAll.mockResolvedValue([fakeRecord('rec_1')]);

    const req = buildReq({ query: { trialIds: 't1', format: 'json', unmask: 'true' } });
    const res = buildRes();
    await exportCroApplications(req, res, jest.fn());

    const payload = res.json.mock.calls[0][0];
    expect(payload.data.rows[0]['手机号']).toBe('13812341234');
    expect(mockAuditCreate).toHaveBeenCalledTimes(1);
    expect(mockAuditCreate.mock.calls[0][0].action).toBe('cro_export_unmask');
    expect(mockAuditCreate.mock.calls[0][0].admin_id).toBe('cro:cro_1');
    expect(mockExportLogCreate).toHaveBeenCalledTimes(1);
    expect(mockExportLogCreate.mock.calls[0][0].unmask).toBe(true);
    expect(mockExportLogCreate.mock.calls[0][0].fields.phone_full).toBe(true);
  });

  test('7) 老调用 ?trialId=t1 兼容', async () => {
    mockAppFindAll.mockResolvedValue([fakeApp('app_1', 't1', 'pending', '13812341234')]);
    mockMrFindAll.mockResolvedValue([fakeRecord('rec_1')]);

    const req = buildReq({ query: { trialId: 't1', format: 'json' } });
    const res = buildRes();
    await exportCroApplications(req, res, jest.fn());

    expect(res.json).toHaveBeenCalled();
    const payload = res.json.mock.calls[0][0];
    expect(payload.data.trialIds).toEqual(['t1']);
  });

  test('8) trialIds 缺失 → 400', async () => {
    const req = buildReq({ query: {} });
    const res = buildRes();
    await exportCroApplications(req, res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(400);
  });

  test('9) trialIds > 20 → 400', async () => {
    const req = buildReq({
      croCompany: { id: 'cro_1', name: 'X', trial_ids: Array.from({ length: 25 }, (_, i) => `t${i}`) },
      query: { trialIds: Array.from({ length: 21 }, (_, i) => `t${i}`).join(',') }
    });
    const res = buildRes();
    await exportCroApplications(req, res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(400);
  });

  test('10) 日期范围 from/to 转 created_at where', async () => {
    mockAppFindAll.mockResolvedValue([]);
    mockMrFindAll.mockResolvedValue([]);

    const req = buildReq({
      query: { trialIds: 't1', from: '2026-04-01T00:00:00Z', to: '2026-05-01T00:00:00Z', format: 'json' }
    });
    const res = buildRes();
    await exportCroApplications(req, res, jest.fn());

    const where = mockAppFindAll.mock.calls[0][0].where;
    expect(where.created_at).toBeDefined();
    const symKeys = Object.getOwnPropertySymbols(where.created_at).map((s) => s.toString());
    // Op.gte / Op.lt 都应在 created_at 上
    expect(symKeys.length).toBe(2);
  });
});
