/**
 * PRD-2026Q2 §2.3：Admin 审计 + PII 脱敏测试
 *
 * 覆盖：
 *  - utils/mask.js：maskPhone / maskIdCard / maskName 空值 + 正常值 + 边界
 *  - middleware/auditLog.js：res finish 后异步写一条 audit 记录
 *  - middleware/auditLog.js：AdminAuditLog.create 抛错时不阻断 res 主响应
 *  - controllers/admin.revealField：开启 ADMIN_MFA_BYPASS 时命中 + 返回明文 + 写一条 audit
 *
 * 参考 server/tests/applicationCreate.test.js 的 jest.mock('../models', ...) 写法。
 */

const { maskPhone, maskIdCard, maskName } = require('../utils/mask');

// ==== mask.js unit ====
describe('utils/mask §2.3', () => {
  test('maskPhone 标准 11 位 → 138****1234', () => {
    expect(maskPhone('13812341234')).toBe('138****1234');
  });

  test('maskPhone 空值 / null / undefined 返回空字符串', () => {
    expect(maskPhone('')).toBe('');
    expect(maskPhone(null)).toBe('');
    expect(maskPhone(undefined)).toBe('');
  });

  test('maskIdCard 18 位身份证 → 头 3 尾 4 中间全 *', () => {
    const masked = maskIdCard('110101199001011234');
    expect(masked.startsWith('110')).toBe(true);
    expect(masked.endsWith('1234')).toBe(true);
    expect(masked.length).toBe(18);
    expect(masked.slice(3, -4)).toBe('*'.repeat(11));
  });

  test('maskName 中文 2 字 / 3 字 / 英文', () => {
    expect(maskName('张三')).toBe('张*');
    expect(maskName('张三丰')).toBe('张**');
    expect(maskName('Alice')).toBe('A****');
    expect(maskName('')).toBe('');
  });
});

// ==== auditLog middleware ====
const mockAuditCreate = jest.fn();

jest.mock('../models', () => ({
  AdminAuditLog: {
    create: (...args) => mockAuditCreate(...args)
  },
  User: { findByPk: jest.fn() },
  // 保留其它模型占位，避免别的地方 require('../models') 拿到 undefined
  sequelize: {},
  Trial: {},
  MedicalRecord: {},
  TrialApplication: {},
  CroCompany: {},
  OcrJobFailure: {}
}));

jest.mock('../utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn()
}));

const { logAdmin } = require('../middleware/auditLog');
const logger = require('../utils/logger');

const buildRes = () => {
  const listeners = {};
  const res = {
    on: (event, cb) => {
      listeners[event] = listeners[event] || [];
      listeners[event].push(cb);
    },
    emit: async (event) => {
      const cbs = listeners[event] || [];
      // 依次等待异步回调执行完
      for (const cb of cbs) await cb();
    }
  };
  return res;
};

const buildReq = (overrides = {}) => ({
  adminUser: { id: 'admin_1' },
  userId: 'admin_1',
  query: { keyword: 'x' },
  params: { id: 'user_9' },
  body: { remark: 'hi', secret: 'should-not-log' },
  headers: { 'user-agent': 'jest', 'x-forwarded-for': '10.0.0.1' },
  ip: '10.0.0.1',
  ...overrides
});

describe('middleware/auditLog §2.3', () => {
  beforeEach(() => {
    mockAuditCreate.mockReset();
  });

  test('res finish 后写一条 audit 行，bodyKeys 只记 key 名', async () => {
    mockAuditCreate.mockResolvedValue({ id: 1 });
    const req = buildReq();
    const res = buildRes();
    const next = jest.fn();

    logAdmin('view_users')(req, res, next);
    expect(next).toHaveBeenCalled();

    // 触发 finish
    await res.emit('finish');
    // 异步 Promise 排队 → 再 tick 一下
    await new Promise((r) => setImmediate(r));

    expect(mockAuditCreate).toHaveBeenCalledTimes(1);
    const args = mockAuditCreate.mock.calls[0][0];
    expect(args.admin_id).toBe('admin_1');
    expect(args.action).toBe('view_users');
    expect(args.query_summary).toContain('bodyKeys');
    // 不应该把 body value 原文落库
    expect(args.query_summary).not.toContain('should-not-log');
    // bodyKeys 里要包含 body 的 key
    expect(args.query_summary).toContain('remark');
    expect(args.query_summary).toContain('secret');
    expect(args.ip).toBe('10.0.0.1');
    expect(args.user_agent).toBe('jest');
  });

  test('AdminAuditLog.create 抛错时不阻断主响应（只打 warn）', async () => {
    mockAuditCreate.mockRejectedValueOnce(new Error('db down'));
    const req = buildReq();
    const res = buildRes();
    const next = jest.fn();

    logAdmin('view_users')(req, res, next);
    expect(next).toHaveBeenCalled();

    // 主响应继续 —— next 已经被无条件调用
    await res.emit('finish');
    await new Promise((r) => setImmediate(r));

    // 没有抛异常，logger.warn 被调一次
    expect(logger.warn).toHaveBeenCalled();
  });

  test('targetTypeGetter(req) 能把 target 写入 audit 行', async () => {
    mockAuditCreate.mockResolvedValue({ id: 2 });
    const req = buildReq();
    const res = buildRes();
    const next = jest.fn();

    const getter = (r) => ({ targetType: 'user', targetId: r.params.id });
    logAdmin('reveal_field', getter)(req, res, next);
    await res.emit('finish');
    await new Promise((r) => setImmediate(r));

    expect(mockAuditCreate).toHaveBeenCalledTimes(1);
    const args = mockAuditCreate.mock.calls[0][0];
    expect(args.target_type).toBe('user');
    expect(args.target_id).toBe('user_9');
  });
});

// ==== revealField controller ====
describe('admin.revealField §2.3', () => {
  beforeEach(() => {
    mockAuditCreate.mockReset();
    process.env.ADMIN_MFA_BYPASS = 'true';
  });

  afterEach(() => {
    delete process.env.ADMIN_MFA_BYPASS;
  });

  test('ADMIN_MFA_BYPASS=true 且字段合法时返回明文 + 写一条 reveal_field_phone audit', async () => {
    // 重新拿 mocked 模型修改 User.findByPk
    const models = require('../models');
    models.User.findByPk = jest.fn().mockResolvedValue({
      id: 'user_9',
      phone: '13812341234',
      nickname: '张三'
    });
    mockAuditCreate.mockResolvedValue({ id: 3 });

    const adminController = require('../controllers/admin');

    const req = {
      params: { id: 'user_9' },
      query: { field: 'phone' },
      adminUser: { id: 'admin_1' },
      userId: 'admin_1',
      headers: {},
      ip: '10.0.0.1'
    };
    const res = {
      status: jest.fn(() => res),
      json: jest.fn(() => res)
    };
    const next = jest.fn();

    await adminController.revealField(req, res, next);

    expect(next).not.toHaveBeenCalled();
    // 审计 create 被调用一次
    expect(mockAuditCreate).toHaveBeenCalledTimes(1);
    const args = mockAuditCreate.mock.calls[0][0];
    expect(args.action).toBe('reveal_field_phone');
    expect(args.target_type).toBe('user');
    expect(args.target_id).toBe('user_9');

    // 响应带明文 phone
    const payload = res.json.mock.calls[0][0];
    expect(payload.code).toBe(0);
    expect(payload.data.field).toBe('phone');
    expect(payload.data.value).toBe('13812341234');
  });

  test('字段不在白名单 → 400 且不写审计', async () => {
    const adminController = require('../controllers/admin');
    const req = {
      params: { id: 'user_9' },
      query: { field: 'password' },
      adminUser: { id: 'admin_1' },
      userId: 'admin_1',
      headers: {}
    };
    const res = {
      status: jest.fn(() => res),
      json: jest.fn(() => res)
    };
    const next = jest.fn();

    await adminController.revealField(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(mockAuditCreate).not.toHaveBeenCalled();
  });
});
