/**
 * PRD-2026Q3 T1-6：admin RBAC 三角色矩阵测试。
 * 覆盖：
 *   1. adminCredential：JSON 多账号解析 + 单账号 ENV back-compat + 角色 sanitize。
 *   2. requireRole 中间件：放行 / 403 / 老 token 兜底 super。
 *   3. 4 个关键路由 × 3 角色矩阵：reveal、export_users、create_cro、view_dashboard。
 *
 * 不依赖真实路由层 —— 直接调中间件，便于快速 CI 跑。
 */

const ENV_KEYS = [
  'ADMIN_LOGIN_USERNAME',
  'ADMIN_LOGIN_KEY_HASH',
  'ADMIN_LOGIN_CAN_REVEAL',
  'ADMIN_LOGIN_ROLE',
  'ADMIN_ACCOUNTS_JSON'
];
const snapshotEnv = () => Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
const restoreEnv = (snap) => {
  ENV_KEYS.forEach((k) => {
    if (snap[k] === undefined) delete process.env[k];
    else process.env[k] = snap[k];
  });
};

describe('adminCredential.parseAccountsEnv + verifyAdminCredential', () => {
  let envSnap;
  beforeEach(() => {
    envSnap = snapshotEnv();
    ENV_KEYS.forEach((k) => delete process.env[k]);
    jest.resetModules();
  });
  afterEach(() => restoreEnv(envSnap));

  test('JSON 多账号：每个账号生成独立 role + canReveal', () => {
    process.env.ADMIN_ACCOUNTS_JSON = JSON.stringify([
      { username: 'alice', keyHash: 'sha256:' + require('crypto').createHash('sha256').update('pwA').digest('hex'), role: 'super', canReveal: true },
      { username: 'bob',   keyHash: 'sha256:' + require('crypto').createHash('sha256').update('pwB').digest('hex'), role: 'ops' },
      { username: 'carol', keyHash: 'sha256:' + require('crypto').createHash('sha256').update('pwC').digest('hex'), role: 'cro_liaison' }
    ]);
    const { verifyAdminCredential } = require('../utils/adminCredential');

    const a = verifyAdminCredential({ username: 'alice', key: 'pwA' });
    expect(a.ok).toBe(true);
    expect(a.admin.role).toBe('super');
    expect(a.admin.canReveal).toBe(true);

    const b = verifyAdminCredential({ username: 'bob', key: 'pwB' });
    expect(b.ok).toBe(true);
    expect(b.admin.role).toBe('ops');
    expect(b.admin.canReveal).toBe(false);

    const c = verifyAdminCredential({ username: 'carol', key: 'pwC' });
    expect(c.ok).toBe(true);
    expect(c.admin.role).toBe('cro_liaison');

    expect(verifyAdminCredential({ username: 'alice', key: 'wrong' }).ok).toBe(false);
    expect(verifyAdminCredential({ username: 'unknown', key: 'pwA' }).ok).toBe(false);
  });

  test('单账号 ENV back-compat：自动 role=super', () => {
    const hash = require('crypto').createHash('sha256').update('legacy').digest('hex');
    process.env.ADMIN_LOGIN_USERNAME = 'legacy_admin';
    process.env.ADMIN_LOGIN_KEY_HASH = 'sha256:' + hash;
    process.env.ADMIN_LOGIN_CAN_REVEAL = 'true';

    const { verifyAdminCredential } = require('../utils/adminCredential');
    const r = verifyAdminCredential({ username: 'legacy_admin', key: 'legacy' });
    expect(r.ok).toBe(true);
    expect(r.admin.role).toBe('super');
    expect(r.admin.canReveal).toBe(true);
  });

  test('单账号 ENV：ADMIN_LOGIN_ROLE=ops 时被 sanitize 接受', () => {
    const hash = require('crypto').createHash('sha256').update('opspw').digest('hex');
    process.env.ADMIN_LOGIN_USERNAME = 'ops_user';
    process.env.ADMIN_LOGIN_KEY_HASH = 'sha256:' + hash;
    process.env.ADMIN_LOGIN_ROLE = 'ops';

    const { verifyAdminCredential } = require('../utils/adminCredential');
    const r = verifyAdminCredential({ username: 'ops_user', key: 'opspw' });
    expect(r.ok).toBe(true);
    expect(r.admin.role).toBe('ops');
  });

  test('未配置任何账号 → not_configured', () => {
    const { verifyAdminCredential } = require('../utils/adminCredential');
    const r = verifyAdminCredential({ username: 'x', key: 'y' });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('not_configured');
  });

  test('JSON 解析失败 + 单账号都缺 → not_configured，不抛异常', () => {
    process.env.ADMIN_ACCOUNTS_JSON = '[not valid json';
    const { verifyAdminCredential } = require('../utils/adminCredential');
    const r = verifyAdminCredential({ username: 'x', key: 'y' });
    expect(r.ok).toBe(false);
  });

  test('sanitizeRole：未知角色降级为 super', () => {
    const { sanitizeRole } = require('../utils/adminCredential');
    expect(sanitizeRole('super')).toBe('super');
    expect(sanitizeRole('ops')).toBe('ops');
    expect(sanitizeRole('cro_liaison')).toBe('cro_liaison');
    expect(sanitizeRole('hacker')).toBe('super'); // 兜底，不会让请求被永久锁出
    expect(sanitizeRole(undefined)).toBe('super');
  });
});

describe('issueAdminToken / verifyAdminToken：role 在 JWT 中往返', () => {
  let envSnap;
  beforeEach(() => {
    envSnap = snapshotEnv();
    process.env.JWT_SECRET = 'rbac-test-secret-rbac-test-secret-32+';
    jest.resetModules();
  });
  afterEach(() => restoreEnv(envSnap));

  test('issue → verify 完整往返：role 字段保留', () => {
    const { issueAdminToken, verifyAdminToken } = require('../utils/adminCredential');
    const token = issueAdminToken({ id: 'admin:bob', username: 'bob', role: 'ops', canReveal: false });
    const decoded = verifyAdminToken(token);
    expect(decoded.username).toBe('bob');
    expect(decoded.role).toBe('ops');
    expect(decoded.canReveal).toBe(false);
  });

  test('老 token（无 role 字段）→ verify 兜底 super', () => {
    const jwt = require('jsonwebtoken');
    const { JWT_SECRET } = require('../utils/jwtSecret');
    const oldToken = jwt.sign(
      { type: 'admin', adminId: 'admin:legacy', adminUsername: 'legacy', canReveal: true },
      JWT_SECRET,
      { expiresIn: 60 }
    );
    const { verifyAdminToken } = require('../utils/adminCredential');
    const decoded = verifyAdminToken(oldToken);
    expect(decoded.role).toBe('super');
    expect(decoded.username).toBe('legacy');
  });
});

describe('requireRole 中间件：4 接口 × 3 角色矩阵', () => {
  let envSnap;
  let requireRole;
  beforeEach(() => {
    envSnap = snapshotEnv();
    process.env.JWT_SECRET = 'rbac-test-secret-rbac-test-secret-32+';
    jest.resetModules();
    ({ requireRole } = require('../middleware/adminAuth'));
  });
  afterEach(() => restoreEnv(envSnap));

  const buildReq = (role) => ({
    adminRole: role,
    adminUser: { id: `admin:${role}`, username: role, role },
    path: '/test',
    headers: {}
  });
  const buildRes = () => {
    const res = {};
    res.status = jest.fn(() => res);
    res.json = jest.fn(() => res);
    return res;
  };

  // 4 关键接口 × 3 角色矩阵：✓ 放行 / × 403
  // | endpoint           | super | ops | cro_liaison |
  // | reveal_field       |   ✓   |  ×  |      ×      |
  // | export_users       |   ✓   |  ×  |      ×      |
  // | create_cro         |   ✓   |  ×  |      ✓      |
  // | view_dashboard     |   ✓   |  ✓  |      ✓      | (无 requireRole，所有 admin 都进)
  const matrix = [
    { name: 'reveal_field',   roles: ['super'],                          allow: ['super'],              deny: ['ops', 'cro_liaison'] },
    { name: 'export_users',   roles: ['super'],                          allow: ['super'],              deny: ['ops', 'cro_liaison'] },
    { name: 'create_cro',     roles: ['super', 'cro_liaison'],           allow: ['super', 'cro_liaison'], deny: ['ops'] },
    { name: 'view_dashboard', roles: null,                                allow: ['super', 'ops', 'cro_liaison'], deny: [] }
  ];

  matrix.forEach(({ name, roles, allow, deny }) => {
    if (roles === null) {
      test(`${name}: 无 requireRole → 三角色全放行`, () => {
        // 无 requireRole 中间件 → 不在本测试范围内显式断言（路由本来就没挂）。
        // 这里仅断言：requireRole(...allRoles) 三角色都通过，等价于 baseline。
        const mw = requireRole('super', 'ops', 'cro_liaison');
        allow.forEach((r) => {
          const next = jest.fn();
          mw(buildReq(r), buildRes(), next);
          expect(next).toHaveBeenCalled();
        });
      });
      return;
    }
    test(`${name}: requireRole(${roles.join(',')}) — allow=${allow.join('/')}, deny=${deny.join('/')}`, () => {
      const mw = requireRole(...roles);
      allow.forEach((r) => {
        const next = jest.fn();
        mw(buildReq(r), buildRes(), next);
        expect(next).toHaveBeenCalledTimes(1);
      });
      deny.forEach((r) => {
        const next = jest.fn();
        const res = buildRes();
        mw(buildReq(r), res, next);
        expect(next).not.toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(403);
        const payload = res.json.mock.calls[0][0];
        expect(payload.code).toBe(403);
        expect(payload.data.required).toEqual(expect.arrayContaining(roles));
      });
    });
  });

  test('req 无 adminRole / adminUser（旧 user-allowlist 路径）→ 兜底 super，被 requireRole(super) 放行', () => {
    const mw = requireRole('super');
    const req = { path: '/x', headers: {} }; // 无 adminRole
    const res = buildRes();
    const next = jest.fn();
    mw(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  test('未知 role 字符串 → sanitize 为 super → 不会绕过明确的 requireRole(ops)', () => {
    // sanitize 把未知降级为 super。所以「未知 role」实际拥有 super 等价权限。
    // 关键不变量：requireRole(ops) 不会因为未知 role 而误放行 super 不在列表的情况。
    const mw = requireRole('ops');
    const req = { adminRole: 'unknown_role', adminUser: { username: 'x', role: 'unknown_role' }, path: '/x', headers: {} };
    const res = buildRes();
    const next = jest.fn();
    mw(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
  });
});
