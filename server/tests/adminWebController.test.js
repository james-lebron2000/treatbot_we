/**
 * Admin Web 后台数据契约测试。
 *
 * 覆盖第一版后台最关键的只读契约：
 *  - dashboard 返回 overview / dailyTrend / funnel / dataQuality
 *  - users 默认只查活跃用户，返回脱敏手机号和上传统计
 *  - records 默认过滤 deleted_at，支持 userId/status，并返回上传人脱敏信息
 */

const mockUser = {
  count: jest.fn(),
  findAll: jest.fn(),
  findAndCountAll: jest.fn()
};
const mockMedicalRecord = {
  count: jest.fn(),
  findAll: jest.fn(),
  findAndCountAll: jest.fn()
};
const mockTrialApplication = {
  count: jest.fn(),
  findAll: jest.fn()
};
const mockTrial = {
  findAll: jest.fn()
};
const mockUserFunnelEvent = {
  findAll: jest.fn()
};
const mockOss = {
  getRequestAwareUrl: jest.fn()
};

jest.mock('../models', () => ({
  User: mockUser,
  MedicalRecord: mockMedicalRecord,
  TrialApplication: mockTrialApplication,
  Trial: mockTrial,
  CroCompany: {},
  AdminAuditLog: {},
  OcrJobFailure: {},
  UserFunnelEvent: mockUserFunnelEvent,
  sequelize: {
    literal: (value) => value,
    query: jest.fn(),
    QueryTypes: { SELECT: 'SELECT' }
  }
}));

jest.mock('../services/oss', () => mockOss);
jest.mock('../services/queue', () => ({}));
jest.mock('../services/trialFreshness', () => ({}));
jest.mock('../utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn()
}));

const { sequelize } = require('../models');
const adminController = require('../controllers/admin');

const buildRes = () => ({
  json: jest.fn()
});

const statusRow = (status, count) => ({
  status,
  get: (key) => (key === 'count' ? String(count) : undefined)
});

describe('admin Treatbot Web controller contracts', () => {
  const originalAdminEnv = {
    username: process.env.ADMIN_LOGIN_USERNAME,
    keyHash: process.env.ADMIN_LOGIN_KEY_HASH,
    canReveal: process.env.ADMIN_LOGIN_CAN_REVEAL
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockTrial.findAll.mockResolvedValue([]);
    mockOss.getRequestAwareUrl.mockResolvedValue('https://signed.example/record.pdf');
  });

  afterEach(() => {
    if (originalAdminEnv.username === undefined) delete process.env.ADMIN_LOGIN_USERNAME;
    else process.env.ADMIN_LOGIN_USERNAME = originalAdminEnv.username;
    if (originalAdminEnv.keyHash === undefined) delete process.env.ADMIN_LOGIN_KEY_HASH;
    else process.env.ADMIN_LOGIN_KEY_HASH = originalAdminEnv.keyHash;
    if (originalAdminEnv.canReveal === undefined) delete process.env.ADMIN_LOGIN_CAN_REVEAL;
    else process.env.ADMIN_LOGIN_CAN_REVEAL = originalAdminEnv.canReveal;
  });

  test('adminLogin 使用独立用户名和 key 返回 admin token', async () => {
    process.env.ADMIN_LOGIN_USERNAME = 'treatbot_admin';
    process.env.ADMIN_LOGIN_KEY_HASH = 'sha256:0740e0062f9186d15688ae5fbdbcc35c7a576ac3acd9403ad1576e41a675d60e';
    process.env.ADMIN_LOGIN_CAN_REVEAL = 'true';

    const req = {
      body: {
        username: 'treatbot_admin',
        key: 'x_2qZQ3W2XL06Q5cpbbmPBd1jxyOmGVnjEVuDEd9uJU'
      },
      headers: {},
      ip: '127.0.0.1'
    };
    const res = buildRes();
    res.status = jest.fn(() => res);
    const next = jest.fn();

    await adminController.adminLogin(req, res, next);

    expect(next).not.toHaveBeenCalled();
    const payload = res.json.mock.calls[0][0].data;
    expect(payload.token).toBeTruthy();
    expect(payload.admin.username).toBe('treatbot_admin');
    expect(payload.admin.canReveal).toBe(true);
  });

  test('dashboard 返回运营与数据质量聚合', async () => {
    mockUser.count.mockImplementation(({ where } = {}) => {
      if (where?.deleted_at === null) return Promise.resolve(2);
      if (where?.created_at) return Promise.resolve(1);
      return Promise.resolve(3);
    });
    mockMedicalRecord.count.mockImplementation(({ distinct, where } = {}) => {
      if (distinct) return Promise.resolve(2);
      if (where?.created_at) return Promise.resolve(2);
      return Promise.resolve(4);
    });
    mockTrialApplication.count.mockImplementation(({ distinct, where } = {}) => {
      if (distinct) return Promise.resolve(2);
      if (where?.created_at) return Promise.resolve(1);
      return Promise.resolve(3);
    });
    mockUser.findAll.mockResolvedValue([{ date: '2026-05-01', count: '1' }]);
    mockTrialApplication.findAll.mockImplementation((options = {}) => {
      if (options.raw) {
        return Promise.resolve([{ date: '2026-05-01', count: '1' }]);
      }
      return Promise.resolve([statusRow('pending', 1), statusRow('enrolled', 1)]);
    });
    mockUserFunnelEvent.findAll.mockResolvedValue([
      { event: 'upload_success', count: '5' },
      { event: 'application_submitted', count: '2' }
    ]);
    mockMedicalRecord.findAll.mockImplementation((options = {}) => {
      if (options.group && options.attributes?.[0] === 'status') {
        return Promise.resolve([
          statusRow('completed', 3),
          statusRow('error', 1)
        ]);
      }
      if (options.raw) {
        return Promise.resolve([{ date: '2026-05-01', count: '2' }]);
      }
      return Promise.resolve([
        {
          id: 'rec_error',
          user_id: 'u1',
          type: '病理报告',
          diagnosis: '肺癌',
          updated_at: '2026-05-01T10:00:00Z',
          User: { nickname: '张三', phone: '13812341234' }
        }
      ]);
    });

    const req = { query: { startDate: '2026-05-01', endDate: '2026-05-01' } };
    const res = buildRes();
    const next = jest.fn();

    await adminController.getDashboardStats(req, res, next);

    expect(next).not.toHaveBeenCalled();
    const payload = res.json.mock.calls[0][0].data;
    expect(payload.overview.totalUsers).toBe(3);
    expect(payload.overview.uploadedUsers).toBe(2);
    expect(payload.overview.completedRecords).toBe(3);
    expect(payload.dailyTrend).toEqual([{ date: '2026-05-01', users: 1, records: 2, applications: 1 }]);
    expect(payload.funnel.uploadToApplicationRate).toBe(40);
    expect(payload.dataQuality.parseSuccessRate).toBe(75);
    expect(payload.dataQuality.recentErrors[0].userPhone).toBe('138****1234');
  });

  test('users 默认过滤注销用户并返回脱敏统计', async () => {
    mockUser.findAndCountAll.mockResolvedValue({
      count: 1,
      rows: [{
        id: 'u1',
        openid: 'openid_1',
        nickname: '张三',
        avatar_url: '',
        phone: '13812341234',
        created_at: '2026-05-01T00:00:00Z',
        deleted_at: null
      }]
    });
    mockMedicalRecord.findAll.mockResolvedValue([
      { user_id: 'u1', total: '2', completed: '1' }
    ]);
    mockTrialApplication.findAll.mockResolvedValue([
      { user_id: 'u1', cnt: '1' }
    ]);
    sequelize.query.mockResolvedValue([
      { user_id: 'u1', id: 'rec1', diagnosis: '肺癌' }
    ]);

    const req = { query: { page: '1', pageSize: '20' } };
    const res = buildRes();
    const next = jest.fn();

    await adminController.getUserList(req, res, next);

    expect(mockUser.findAndCountAll.mock.calls[0][0].where).toEqual({ deleted_at: null });
    const item = res.json.mock.calls[0][0].data.list[0];
    expect(item.userId).toBe('u1');
    expect(item.nickname).toBe('张*');
    expect(item.phone).toBe('138****1234');
    expect(item.recordCount).toBe(2);
    expect(item.completedRecordCount).toBe(1);
    expect(item.applicationCount).toBe(1);
    expect(item.latestRecordId).toBe('rec1');
  });

  test('records 默认过滤软删除并支持 userId/status 查询', async () => {
    mockMedicalRecord.findAndCountAll.mockResolvedValue({
      count: 1,
      rows: [{
        id: 'rec1',
        user_id: 'u1',
        type: '病理报告',
        file_key: 'records/rec1.pdf',
        file_size: 2048,
        status: 'completed',
        diagnosis: '肺癌',
        stage: 'IV期',
        gene_mutation: 'EGFR',
        treatment: '',
        structured: { entities: { cancerType: '肺癌' } },
        remark: '',
        created_at: '2026-05-01T00:00:00Z',
        updated_at: '2026-05-01T01:00:00Z',
        User: { nickname: '张三', phone: '13812341234' }
      }]
    });
    mockTrialApplication.findAll.mockResolvedValue([]);

    const req = { query: { userId: 'u1', status: 'completed' } };
    const res = buildRes();
    const next = jest.fn();

    await adminController.getRecordList(req, res, next);

    const query = mockMedicalRecord.findAndCountAll.mock.calls[0][0];
    expect(query.where.deleted_at).toBe(null);
    expect(query.where.user_id).toBe('u1');
    expect(query.where.status).toBe('completed');

    const item = res.json.mock.calls[0][0].data.list[0];
    expect(item.recordId).toBe('rec1');
    expect(item.userNickname).toBe('张*');
    expect(item.userPhone).toBe('138****1234');
    expect(item.fileUrl).toBe('https://signed.example/record.pdf');
  });
});
