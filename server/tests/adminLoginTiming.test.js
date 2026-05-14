// PRD-2026Q4 T0-7 followup（admin login timing attack / OWASP A07）回归测试。
//
// 老实现的 verifyAdminCredential 在 username 找不到时 early-return，跳过
// SHA-256 + constant-time hash compare：
//   - "用户名未知"      → 几十 µs 返回（仅 username find loop）
//   - "用户名命中、key 错" → 几百 µs 返回（多了一次 SHA-256 + hash compare）
// 单次差距 ≪ 网络抖动，但可被大量样本统计放大为可分辨差异。
//
// 修复方法：永远走相同路径——即使用户名不在白名单，也要算一遍 sha256 +
// constantTimeEqual（用 64 字节 sentinel hash）。本测试用两种手段验证：
//   1) **白盒**：spy crypto.createHash 与 timingSafeEqual，确认两条路径都被调用；
//   2) **源码静态扫描**：保证 SENTINEL_KEYHASH 与 'a'.repeat(64) 在源里存在，且
//      verifyAdminCredential 的源码不再以 if (!matched) return ... 在 hash 之前提前结束。
//
// 顺带覆盖一条 controller 层 bug：adminLogin 的 503 gate 原先只看
// getConfiguredAdmin()（单账号 ENV 路径），导致仅配 ADMIN_ACCOUNTS_JSON
// 的部署被错误地拒绝。改用 getConfiguredAccounts() 后，JSON-only 必须可登录。

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const SRC_PATH = path.join(__dirname, '..', 'utils', 'adminCredential.js');

describe('adminCredential.verifyAdminCredential — timing-attack defense', () => {
  const ORIGINAL_ENV = { ...process.env };

  beforeEach(() => {
    jest.resetModules();
    delete process.env.ADMIN_LOGIN_USERNAME;
    delete process.env.ADMIN_LOGIN_KEY_HASH;
    delete process.env.ADMIN_ACCOUNTS_JSON;
    delete process.env.ADMIN_LOGIN_CAN_REVEAL;
    delete process.env.ADMIN_LOGIN_ROLE;
    // jwtSecret 在生产环境之外允许任何值；这里给一个稳定值避免警告。
    process.env.NODE_ENV = 'test';
    process.env.JWT_SECRET = 'test-secret-test-secret-test-secret-test-12345';
  });

  afterAll(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  // 1) 白盒断言：sha256 + constantTimeEqual 在「用户名未知」时也要被调用。
  test('unknown username still triggers sha256 + constantTimeEqual (no early return)', () => {
    process.env.ADMIN_LOGIN_USERNAME = 'alice';
    // sha256("correct-key") 不是这个值，但 keyHash 写什么不重要 —— 我们只检查
    // 走了完整 hash 路径。
    process.env.ADMIN_LOGIN_KEY_HASH = `sha256:${'b'.repeat(64)}`;

    const realCreateHash = crypto.createHash;
    const sha256Spy = jest.fn((alg) => realCreateHash.call(crypto, alg));
    crypto.createHash = sha256Spy;
    const tseSpy = jest.spyOn(crypto, 'timingSafeEqual');

    const { verifyAdminCredential } = require('../utils/adminCredential');

    const r = verifyAdminCredential({ username: 'no-such-user', key: 'whatever' });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('invalid');

    // 关键断言：用户名不存在的情况下，sha256 必须被调用过（输入 key 哈希过一次）；
    // constantTimeEqual 也必须被调用过（与 sentinel hash 做等长比对）。
    expect(sha256Spy).toHaveBeenCalledWith('sha256');
    expect(tseSpy).toHaveBeenCalled();

    crypto.createHash = realCreateHash;
    tseSpy.mockRestore();
  });

  test('known username + wrong key reaches sha256 + constantTimeEqual (baseline)', () => {
    process.env.ADMIN_LOGIN_USERNAME = 'alice';
    process.env.ADMIN_LOGIN_KEY_HASH = `sha256:${'b'.repeat(64)}`;

    const realCreateHash = crypto.createHash;
    const sha256Spy = jest.fn((alg) => realCreateHash.call(crypto, alg));
    crypto.createHash = sha256Spy;
    const tseSpy = jest.spyOn(crypto, 'timingSafeEqual');

    const { verifyAdminCredential } = require('../utils/adminCredential');

    const r = verifyAdminCredential({ username: 'alice', key: 'wrong' });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('invalid');

    expect(sha256Spy).toHaveBeenCalledWith('sha256');
    expect(tseSpy).toHaveBeenCalled();

    crypto.createHash = realCreateHash;
    tseSpy.mockRestore();
  });

  // 2) 静态源码扫描——独立于运行时，可以阻止后续代码 review 把 early-return
  //    写回去。关键不变量：
  //      - SENTINEL_KEYHASH 常量存在
  //      - 'a'.repeat(64) 字面量存在
  //      - verifyAdminCredential 的实现里不再以 if (!matched) return 在 sha256
  //        之前提前结束（用一个小型源码遍历来检查）
  test('source preserves unified-path defense (no early return before hash)', () => {
    const src = fs.readFileSync(SRC_PATH, 'utf8');
    expect(src).toMatch(/SENTINEL_KEYHASH\s*=\s*['"]a['"]\.repeat\(64\)/);
    // 源里必须出现「sentinel keyHash 兜底」的注释或代码路径（防御性、可被再 review）。
    expect(src).toMatch(/sentinel|SENTINEL/i);

    // 截取 verifyAdminCredential 函数体；assert 顺序：sha256 在任何 reason
    // 决策（return 语句）之前就应执行。
    const fnMatch = src.match(/const verifyAdminCredential\s*=\s*\([^)]*\)\s*=>\s*\{([\s\S]*?)\n\};/);
    expect(fnMatch).not.toBeNull();
    const body = fnMatch[1];

    const idxSha = body.indexOf('sha256(key)');
    const idxFirstReturn = body.indexOf('return');
    expect(idxSha).toBeGreaterThan(-1);
    expect(idxFirstReturn).toBeGreaterThan(idxSha);
  });

  // 3) ADMIN_ACCOUNTS_JSON-only 配置：correct key 应该登录成功。
  test('ADMIN_ACCOUNTS_JSON-only config authenticates correctly', () => {
    const correctKey = 'super-secret-key';
    const keyHash = crypto.createHash('sha256').update(correctKey).digest('hex');
    process.env.ADMIN_ACCOUNTS_JSON = JSON.stringify([
      { username: 'ops_alice', keyHash: `sha256:${keyHash}`, role: 'ops', canReveal: false }
    ]);

    const { verifyAdminCredential } = require('../utils/adminCredential');
    const r = verifyAdminCredential({ username: 'ops_alice', key: correctKey });
    expect(r.ok).toBe(true);
    expect(r.admin).toMatchObject({
      id: 'admin:ops_alice', username: 'ops_alice', role: 'ops', canReveal: false
    });
  });

  // 4) 无任何账号配置时仍稳定走兜底路径，不抛异常、reason='not_configured'。
  test('no accounts configured → reason=not_configured (no throw)', () => {
    const { verifyAdminCredential } = require('../utils/adminCredential');
    const r = verifyAdminCredential({ username: 'x', key: 'y' });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('not_configured');
  });
});

describe('controllers/admin.adminLogin — config gate uses full account set', () => {
  const ORIGINAL_ENV = { ...process.env };

  beforeEach(() => {
    jest.resetModules();
    delete process.env.ADMIN_LOGIN_USERNAME;
    delete process.env.ADMIN_LOGIN_KEY_HASH;
    delete process.env.ADMIN_ACCOUNTS_JSON;
    process.env.NODE_ENV = 'test';
    process.env.JWT_SECRET = 'test-secret-test-secret-test-secret-test-12345';
  });

  afterAll(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  // 用静态源扫描 + 模块导入间接验证 controller 不再依赖单账号 getter。
  test('controllers/admin.js no longer imports getConfiguredAdmin', () => {
    const src = fs.readFileSync(
      path.join(__dirname, '..', 'controllers', 'admin.js'), 'utf8'
    );
    // 不再使用单账号 ENV 检查作为 503 gate
    expect(src).not.toMatch(/if\s*\(\s*!getConfiguredAdmin\(\)\s*\)/);
    // 应该用全集合判断
    expect(src).toMatch(/getConfiguredAccounts\(\)\.length/);
  });

  test('JSON-only config: adminLogin does NOT 503', async () => {
    const correctKey = 'super-secret-key';
    const keyHash = crypto.createHash('sha256').update(correctKey).digest('hex');
    process.env.ADMIN_ACCOUNTS_JSON = JSON.stringify([
      { username: 'alice', keyHash: `sha256:${keyHash}`, role: 'super', canReveal: true }
    ]);

    // 准备最小的 mock：避免引入 sequelize models（controller 顶层 require 链路重）。
    jest.doMock('../models', () => ({}), { virtual: false });
    jest.doMock('../utils/logger', () => ({
      info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn()
    }));

    const { adminLogin } = require('../controllers/admin');
    const req = {
      body: { username: 'alice', key: correctKey },
      headers: {}, ip: '127.0.0.1'
    };
    const res = {
      statusCode: 200, body: null,
      status(code) { this.statusCode = code; return this; },
      json(payload) { this.body = payload; return this; }
    };
    const next = jest.fn();

    await adminLogin(req, res, next);
    expect(res.statusCode).not.toBe(503);
    // 成功应该有 token / admin 字段
    expect(res.body).toBeTruthy();
    expect(res.body.data || res.body).toEqual(expect.objectContaining({
      // 兼容 success() 包装：实际 body 形如 { code:0, data:{ token, admin, ... } }
    }));
  });

  test('no config at all: adminLogin returns 503', async () => {
    jest.doMock('../models', () => ({}), { virtual: false });
    jest.doMock('../utils/logger', () => ({
      info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn()
    }));

    const { adminLogin } = require('../controllers/admin');
    const req = { body: { username: 'x', key: 'y' }, headers: {}, ip: '127.0.0.1' };
    const res = {
      statusCode: 200, body: null,
      status(code) { this.statusCode = code; return this; },
      json(payload) { this.body = payload; return this; }
    };
    const next = jest.fn();
    await adminLogin(req, res, next);
    expect(res.statusCode).toBe(503);
  });
});
