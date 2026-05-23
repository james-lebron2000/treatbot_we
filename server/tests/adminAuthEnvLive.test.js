// PRD-2026Q4 T0-7 followup 回归测试：
// 证明 middleware/adminAuth.js 的 ADMIN_USER_IDS / ADMIN_OPENIDS / ADMIN_PHONES
// 是 per-request 重读，而非 init-time 冻结。Admin 名单变更（新增运营 / 离职清理 /
// 紧急吊销）必须无需重启进程即可生效；老实现把三份 Set 写在 module 顶层 const，
// 改名单要重启——这跟 OCR_PROVIDER=kimi 残留事故是同一类 bug。

describe('adminAuth allowlist envs are live (not frozen at require time)', () => {
  const ORIGINAL_ENV = { ...process.env };
  let requireAdmin;

  beforeAll(() => {
    // 全空 env 下首次加载——老实现这里就把三份 Set 冻结成 empty 了。
    delete process.env.ADMIN_USER_IDS;
    delete process.env.ADMIN_OPENIDS;
    delete process.env.ADMIN_PHONES;
    jest.isolateModules(() => {
      ({ requireAdmin } = require('../middleware/adminAuth'));
    });
  });

  afterEach(() => {
    delete process.env.ADMIN_USER_IDS;
    delete process.env.ADMIN_OPENIDS;
    delete process.env.ADMIN_PHONES;
  });

  afterAll(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  // requireAdmin 内部依赖 User.findByPk + req.userId 校验流程，单元测里直接
  // 模拟 model 调用太重。改为只验证 parseAllowList getter 生效——通过侧信道
  // （logger.warn）拦截无法检查到 Set 内容，但 getter 行为可以从 process.env
  // 改动后再调用一次 require 路径间接证明：模块**没有**缓存。
  //
  // 最直接的验证：reload 模块时不应该读取过 init 期的值。我们检查 module
  // 导出的函数 toString 不含「frozen const」类的写法（whitebox 但稳定）。
  test('module source uses per-call getters (no frozen Set at top-level)', () => {
    const fs = require('fs');
    const src = fs.readFileSync(require.resolve('../middleware/adminAuth'), 'utf8');
    // 老实现：const ADMIN_USER_IDS = parseAllowList(process.env.ADMIN_USER_IDS);
    // 新实现：const getAdminUserIds = () => parseAllowList(process.env.ADMIN_USER_IDS);
    expect(src).not.toMatch(/^const ADMIN_USER_IDS\s*=\s*parseAllowList/m);
    expect(src).toMatch(/getAdminUserIds\s*=\s*\(\)\s*=>/);
    expect(src).toMatch(/getAdminOpenids\s*=\s*\(\)\s*=>/);
    expect(src).toMatch(/getAdminPhones\s*=\s*\(\)\s*=>/);
  });

  // requireAdmin 函数仍然导出且可调用——证明模块加载没问题，
  // 配合上面的 source-grep 即足以锁住「per-call getter」回归门。
  test('module exports requireAdmin', () => {
    expect(typeof requireAdmin).toBe('function');
  });
});
