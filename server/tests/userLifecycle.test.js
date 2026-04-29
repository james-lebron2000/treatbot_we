/**
 * Q3-红线 §A.2：用户合规自助接口单元测试。
 *
 * 覆盖：
 *  - consent 写入幂等：第二次同 (user, version, scope) → 不再 INSERT，返回 duplicate=true
 *  - export：返回 attachment + 全部聚合字段；同日二次 → 429
 *  - delete-account 第一步：发短信 + 写 pending + 返回 requiresSms
 *  - delete-account 第二步：错码 → 400；正确码 → 事务清算 + COS deleteObject 调用 N 次 + Redis refresh keys 被清
 *  - change-password 旧密码错 → 401
 *  - change-password 成功 → 旧 jti 被撤销 + 返回新 token pair
 *
 * 全部 mock：models / oss / sms / redisClient / bcrypt。
 */

// ---- mock 模型 ----
const mockUserConsent = {
  findOne: jest.fn(),
  create: jest.fn(),
  findAll: jest.fn(),
  destroy: jest.fn().mockResolvedValue(0)
};
const mockMedicalRecord = {
  findAll: jest.fn(),
  destroy: jest.fn().mockResolvedValue(0)
};
const mockTrialApplication = {
  findAll: jest.fn().mockResolvedValue([]),
  destroy: jest.fn().mockResolvedValue(0)
};
const mockUser = {
  findByPk: jest.fn()
};
const mockUserActionLog = {
  create: jest.fn().mockResolvedValue({}),
  findAll: jest.fn().mockResolvedValue([])
};
const mockOcrJobFailure = {
  destroy: jest.fn().mockResolvedValue(0)
};
const mockSequelize = {
  transaction: (fn) => fn({})
};

jest.mock('../models', () => ({
  sequelize: mockSequelize,
  User: mockUser,
  MedicalRecord: mockMedicalRecord,
  TrialApplication: mockTrialApplication,
  UserConsent: mockUserConsent,
  UserActionLog: mockUserActionLog,
  OcrJobFailure: mockOcrJobFailure
}));

const mockDeleteObject = jest.fn().mockResolvedValue({ success: true });
jest.mock('../services/oss', () => ({
  deleteObject: (...args) => mockDeleteObject(...args)
}));

jest.mock('../services/sms', () => ({
  sendCode: jest.fn(),
  verifyCode: jest.fn()
}));

// ---- Redis mock ----
const redisStore = new Map();
const redisExpiry = new Map();
const mockRedis = {
  set: jest.fn(async (key, val, mode, ttl, nx) => {
    if (nx === 'NX' && redisStore.has(key)) return null;
    redisStore.set(key, `${val}`);
    return 'OK';
  }),
  setex: jest.fn(async (key, ttl, val) => {
    redisStore.set(key, `${val}`);
    redisExpiry.set(key, ttl);
    return 'OK';
  }),
  get: jest.fn(async (key) => (redisStore.has(key) ? redisStore.get(key) : null)),
  del: jest.fn(async (...keys) => {
    let n = 0;
    for (const k of keys) {
      if (redisStore.delete(k)) n += 1;
    }
    return n;
  }),
  scan: jest.fn(async (cursor, _matchKw, pattern) => {
    // 极简模拟：cursor='0' 第一次返回所有匹配，下一轮返回 ['0', []]
    if (cursor !== '0') return ['0', []];
    const re = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
    const matched = [];
    for (const k of redisStore.keys()) if (re.test(k)) matched.push(k);
    return ['0', matched];
  })
};
jest.mock('../middleware/rateLimit', () => ({
  redisClient: mockRedis,
  strictLimiter: (req, res, next) => next()
}));

jest.mock('../utils/logger', () => ({
  info: jest.fn(), warn: jest.fn(), error: jest.fn()
}));

// ---- bcrypt mock ----
jest.mock('bcryptjs', () => ({
  compare: jest.fn(),
  hash: jest.fn().mockResolvedValue('new_hashed_pw')
}));
const bcrypt = require('bcryptjs');

// 不要给 jwtSecret 真实读取磁盘；直接走环境变量。
process.env.JWT_SECRET = 'test-jwt-secret-for-userLifecycle';

const { responseEnvelope } = require('../middleware/responseEnvelope');
const meController = require('../controllers/me');

const buildRes = () => {
  const res = {};
  res.status = jest.fn(() => res);
  res.json = jest.fn(() => res);
  res.send = jest.fn(() => res);
  res.setHeader = jest.fn();
  responseEnvelope({}, res, () => {});
  return res;
};

const buildReq = (overrides = {}) => ({
  userId: 'user_zhang',
  body: {},
  headers: { 'user-agent': 'jest', 'x-forwarded-for': '1.2.3.4' },
  ip: '1.2.3.4',
  ...overrides
});

beforeEach(() => {
  redisStore.clear();
  redisExpiry.clear();
  mockUserConsent.findOne.mockReset();
  mockUserConsent.create.mockReset();
  mockUserConsent.findAll.mockReset().mockResolvedValue([]);
  mockUserConsent.destroy.mockReset().mockResolvedValue(0);
  mockMedicalRecord.findAll.mockReset();
  mockMedicalRecord.destroy.mockReset().mockResolvedValue(0);
  mockTrialApplication.findAll.mockReset().mockResolvedValue([]);
  mockTrialApplication.destroy.mockReset().mockResolvedValue(0);
  mockUser.findByPk.mockReset();
  mockUserActionLog.create.mockReset().mockResolvedValue({});
  mockUserActionLog.findAll.mockReset().mockResolvedValue([]);
  mockOcrJobFailure.destroy.mockReset().mockResolvedValue(0);
  mockDeleteObject.mockReset().mockResolvedValue({ success: true });
  bcrypt.compare.mockReset();
  bcrypt.hash.mockClear();
  Object.values(mockRedis).forEach((fn) => fn.mockClear && fn.mockClear());
});

// =================== A2.1 Consent ===================
describe('me.recordConsent §A.2.1 幂等', () => {
  test('首次写入 → INSERT + duplicate:false', async () => {
    mockUserConsent.findOne.mockResolvedValue(null);
    mockUserConsent.create.mockResolvedValue({
      id: 1, scope: 'upload', policy_version: 'v2026Q3-1', agreed_at: new Date()
    });

    const req = buildReq({ body: { policyVersion: 'v2026Q3-1', scope: 'upload' } });
    const res = buildRes();
    await meController.recordConsent(req, res, jest.fn());

    expect(mockUserConsent.create).toHaveBeenCalledTimes(1);
    const payload = res.json.mock.calls[0][0];
    expect(payload.code).toBe(0);
    expect(payload.data.duplicate).toBe(false);
  });

  test('同 (user, version, scope) 已存在 → 不 INSERT，duplicate:true', async () => {
    mockUserConsent.findOne.mockResolvedValue({
      id: 7, scope: 'upload', policy_version: 'v2026Q3-1', agreed_at: new Date('2026-04-01')
    });

    const req = buildReq({ body: { policyVersion: 'v2026Q3-1', scope: 'upload' } });
    const res = buildRes();
    await meController.recordConsent(req, res, jest.fn());

    expect(mockUserConsent.create).not.toHaveBeenCalled();
    const payload = res.json.mock.calls[0][0];
    expect(payload.data.duplicate).toBe(true);
  });

  test('非法 scope → 400', async () => {
    const req = buildReq({ body: { policyVersion: 'v2026Q3-1', scope: 'evil' } });
    const res = buildRes();
    await meController.recordConsent(req, res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(400);
  });
});

// =================== A2.2 Export ===================
describe('me.exportMyData §A.2.2', () => {
  test('首次导出返回 JSON 形状 + Content-Disposition + 写 action log', async () => {
    mockUser.findByPk.mockResolvedValue({
      id: 'user_zhang', nickname: 'zhang', phone: '13800000000',
      real_name: '张三', avatar_url: '', created_at: new Date('2026-01-01')
    });
    mockMedicalRecord.findAll.mockResolvedValue([
      { id: 'rec_1', type: 'pathology', file_key: 'k/1', file_hash: 'h', status: 'completed',
        diagnosis: 'NSCLC', stage: 'IV', gene_mutation: 'EGFR L858R', treatment: 'osimertinib',
        treatment_line: 1, pdl1: '50%', structured: { foo: 1 }, remark: '',
        deleted_at: null, created_at: new Date(), updated_at: new Date() }
    ]);
    mockTrialApplication.findAll.mockResolvedValue([]);
    mockUserConsent.findAll.mockResolvedValue([]);

    const req = buildReq();
    const res = buildRes();
    await meController.exportMyData(req, res, jest.fn());

    expect(res.setHeader).toHaveBeenCalledWith(
      'Content-Disposition',
      expect.stringMatching(/attachment;.*myData_user_zhang_/)
    );
    expect(res.send).toHaveBeenCalledTimes(1);
    const body = JSON.parse(res.send.mock.calls[0][0]);
    expect(body.user.id).toBe('user_zhang');
    expect(body.medicalRecords).toHaveLength(1);
    expect(body.medicalRecords[0].structured).toEqual({ foo: 1 });
    expect(body.applications).toEqual([]);
    expect(body.consents).toEqual([]);

    expect(mockUserActionLog.create).toHaveBeenCalledWith(expect.objectContaining({
      action: 'export_my_data',
      user_id: 'user_zhang'
    }));
  });

  test('当日二次导出 → 429', async () => {
    // 第一次成功（占位 Redis key）
    mockRedis.set.mockImplementationOnce(async () => 'OK');
    mockUser.findByPk.mockResolvedValue({ id: 'user_zhang', created_at: new Date() });
    mockMedicalRecord.findAll.mockResolvedValue([]);
    await meController.exportMyData(buildReq(), buildRes(), jest.fn());

    // 第二次：模拟 Redis 已有 key → set NX 返回 null
    mockRedis.set.mockImplementationOnce(async () => null);
    const res2 = buildRes();
    await meController.exportMyData(buildReq(), res2, jest.fn());

    expect(res2.status).toHaveBeenCalledWith(429);
    expect(res2.setHeader).toHaveBeenCalledWith('Retry-After', '86400');
  });
});

// =================== A2.3 Delete account ===================
describe('me.deleteAccount §A.2.3', () => {
  test('第一步：未传 smsCode → 发码 + 返回 requiresSms', async () => {
    mockUser.findByPk.mockResolvedValue({
      id: 'user_zhang', phone: '13800000000', deleted_at: null
    });
    const req = buildReq({ body: {} });
    const res = buildRes();
    await meController.deleteAccount(req, res, jest.fn());

    expect(res.status).toHaveBeenCalledWith(202);
    const payload = res.json.mock.calls[0][0];
    expect(payload.data.requiresSms).toBe(true);
    // pending key 已写入
    expect(redisStore.has('delete_pending:user_zhang')).toBe(true);
    expect(mockUserActionLog.create).toHaveBeenCalledWith(expect.objectContaining({
      action: 'delete_account_request'
    }));
  });

  test('第二步：错误验证码 → 400 拒绝', async () => {
    redisStore.set('delete_pending:user_zhang', '999999');
    const req = buildReq({ body: { smsCode: '000000' } });
    const res = buildRes();
    await meController.deleteAccount(req, res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(400);
  });

  test('第二步：正确码 → 事务执行 + COS deleteObject N 次 + refresh keys 清空', async () => {
    redisStore.set('delete_pending:user_zhang', '123456');
    // 预置 refresh tokens
    redisStore.set('refresh:user_zhang:abc', '1');
    redisStore.set('refresh:user_zhang:def', '1');
    redisStore.set('refresh:other_user:xx', '1');

    const updateMock = jest.fn().mockResolvedValue(undefined);
    mockUser.findByPk.mockResolvedValue({
      id: 'user_zhang', phone: '13800000000', deleted_at: null, update: updateMock
    });
    mockMedicalRecord.findAll.mockResolvedValue([
      { id: 'rec_1', file_key: 'k/a' },
      { id: 'rec_2', file_key: 'k/b' },
      { id: 'rec_3', file_key: 'k/c' }
    ]);
    mockTrialApplication.destroy.mockResolvedValue(2);

    const req = buildReq({ body: { smsCode: '123456' } });
    const res = buildRes();
    await meController.deleteAccount(req, res, jest.fn());

    // COS deleteObject 调用 = 病历数
    expect(mockDeleteObject).toHaveBeenCalledTimes(3);
    expect(mockDeleteObject).toHaveBeenCalledWith('k/a');
    expect(mockDeleteObject).toHaveBeenCalledWith('k/b');
    expect(mockDeleteObject).toHaveBeenCalledWith('k/c');

    // refresh keys for this user purged, others kept
    expect(redisStore.has('refresh:user_zhang:abc')).toBe(false);
    expect(redisStore.has('refresh:user_zhang:def')).toBe(false);
    expect(redisStore.has('refresh:other_user:xx')).toBe(true);

    // user.update 被调用且擦了 PII
    expect(updateMock).toHaveBeenCalledTimes(1);
    const patch = updateMock.mock.calls[0][0];
    expect(patch.deleted_reason).toBe('user_requested');
    expect(patch.deleted_at).toBeInstanceOf(Date);
    expect(patch.phone).toMatch(/^DELETED_/);
    expect(patch.real_name).toBeNull();

    // executed log
    expect(mockUserActionLog.create).toHaveBeenCalledWith(expect.objectContaining({
      action: 'delete_account_executed',
      metadata: expect.objectContaining({ recordCount: 3, applicationCount: 2 })
    }));

    // 响应
    const payload = res.json.mock.calls[res.json.mock.calls.length - 1][0];
    expect(payload.code).toBe(0);
    expect(payload.data.deleted).toBe(true);
  });

  test('COS 删除失败时不阻断事务结果', async () => {
    redisStore.set('delete_pending:user_zhang', '123456');
    const updateMock = jest.fn().mockResolvedValue(undefined);
    mockUser.findByPk.mockResolvedValue({
      id: 'user_zhang', phone: '13800000000', deleted_at: null, update: updateMock
    });
    mockMedicalRecord.findAll.mockResolvedValue([{ id: 'rec_1', file_key: 'k/a' }]);
    mockDeleteObject.mockRejectedValueOnce(new Error('cos down'));

    const req = buildReq({ body: { smsCode: '123456' } });
    const res = buildRes();
    await meController.deleteAccount(req, res, jest.fn());

    const payload = res.json.mock.calls[res.json.mock.calls.length - 1][0];
    expect(payload.code).toBe(0);
    expect(payload.data.deleted).toBe(true);
  });
});

// =================== A2.4 Change password ===================
describe('me.changePassword §A.2.4', () => {
  test('旧密码错 → 401', async () => {
    mockUser.findByPk.mockResolvedValue({
      id: 'user_zhang', password_hash: 'old_hash', update: jest.fn()
    });
    bcrypt.compare.mockResolvedValue(false);

    const req = buildReq({ body: { oldPassword: 'wrong', newPassword: 'newPass1234' } });
    const res = buildRes();
    await meController.changePassword(req, res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(401);
  });

  test('未设置过密码 → 401', async () => {
    mockUser.findByPk.mockResolvedValue({
      id: 'user_zhang', password_hash: null, update: jest.fn()
    });
    const req = buildReq({ body: { oldPassword: 'x', newPassword: 'newPass1234' } });
    const res = buildRes();
    await meController.changePassword(req, res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(401);
  });

  test('成功 → 旧 jti 撤销 + 新 token pair 返回 + 写 action log', async () => {
    redisStore.set('refresh:user_zhang:old1', '1');
    redisStore.set('refresh:user_zhang:old2', '1');

    const updateMock = jest.fn().mockResolvedValue(undefined);
    mockUser.findByPk.mockResolvedValue({
      id: 'user_zhang', openid: 'h5_138', password_hash: 'old_hash', update: updateMock
    });
    bcrypt.compare.mockResolvedValue(true);

    const req = buildReq({ body: { oldPassword: 'good', newPassword: 'newPass1234' } });
    const res = buildRes();
    await meController.changePassword(req, res, jest.fn());

    // bcrypt.hash 被调
    expect(bcrypt.hash).toHaveBeenCalledWith('newPass1234', 10);
    // password_hash 被更新
    expect(updateMock).toHaveBeenCalledWith({ password_hash: 'new_hashed_pw' });
    // 旧 jti 全部清掉
    expect(redisStore.has('refresh:user_zhang:old1')).toBe(false);
    expect(redisStore.has('refresh:user_zhang:old2')).toBe(false);
    // 新 jti 已写入（恰好剩 1 条 user_zhang 前缀的 key）
    const remaining = [...redisStore.keys()].filter((k) => k.startsWith('refresh:user_zhang:'));
    expect(remaining).toHaveLength(1);

    const payload = res.json.mock.calls[0][0];
    expect(payload.code).toBe(0);
    expect(typeof payload.data.token).toBe('string');
    expect(typeof payload.data.refreshToken).toBe('string');
    expect(mockUserActionLog.create).toHaveBeenCalledWith(expect.objectContaining({
      action: 'change_password'
    }));
  });
});
