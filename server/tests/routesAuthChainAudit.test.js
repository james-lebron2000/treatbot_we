// PRD-2026Q4 T0-7 followup（路由审计）回归测试：
// 静态分析 server/routes/index.js，对 ≥1 条「应该被保护但容易漏」的路由做强约束。
// 这是替代「写完整 supertest e2e」的轻量回归门——只解析源码字面，跑得快、
// 不依赖 DB / Redis，CI 永远绿。

const fs = require('fs');
const path = require('path');

const ROUTES_PATH = path.join(__dirname, '..', 'routes', 'index.js');
const SRC = fs.readFileSync(ROUTES_PATH, 'utf8');

// 把每条 router.METHOD(...) 抽出来，得到 [method, path, middlewareChain] 三元组。
// 简化：每条 router.X 必须在一行内（或分行用 url + 多 middleware 续行——下面正则
// 跨行匹配到 closing paren）。
const ROUTE_RE = /router\.(get|post|put|delete|patch)\(\s*['"`]([^'"`]+)['"`]\s*,([\s\S]*?)\);/g;

const routes = [];
let m;
while ((m = ROUTE_RE.exec(SRC)) !== null) {
  routes.push({
    method: m[1].toUpperCase(),
    path: m[2],
    chain: m[3]
  });
}

const has = (chain, pattern) =>
  pattern instanceof RegExp ? pattern.test(chain) : chain.includes(pattern);

const findRoute = (method, path) =>
  routes.find((r) => r.method === method && r.path === path);

describe('routes/index.js — auth chain regression gates', () => {
  test('parser found a non-trivial number of routes (>= 30)', () => {
    expect(routes.length).toBeGreaterThanOrEqual(30);
  });

  // ---- HIGH 级回归门 ----

  test('POST /auth/refresh has strictLimiter (refresh token brute-force protection)', () => {
    const route = findRoute('POST', '/auth/refresh');
    expect(route).toBeDefined();
    expect(has(route.chain, 'strictLimiter')).toBe(true);
  });

  test('POST /cro/applications/bulk-status has strictLimiter + logAdmin', () => {
    const route = findRoute('POST', '/cro/applications/bulk-status');
    expect(route).toBeDefined();
    expect(has(route.chain, 'strictLimiter')).toBe(true);
    expect(has(route.chain, 'logAdmin')).toBe(true);
  });

  test('GET /cro/exports/applications has logAdmin (CRO PII export audit)', () => {
    const route = findRoute('GET', '/cro/exports/applications');
    expect(route).toBeDefined();
    expect(has(route.chain, 'logAdmin')).toBe(true);
  });

  // ---- 综合规则：所有写路径必须 authMiddleware 或 croAuthMiddleware ----

  test('every mutation route (POST/PUT/DELETE/PATCH) is auth-gated', () => {
    const PUBLIC_MUTATIONS = new Set([
      'POST /track',                  // Q3-红线 §B.2 anonymous funnel
      'POST /auth/weapp-login',       // login itself
      'POST /auth/send-code',         // send sms code
      'POST /auth/treatbot-login',    // login itself
      'POST /auth/register',          // 账号密码注册（公开端点，注册即登录，自带 strictLimiter+normalizePii）
      'POST /auth/password-login',    // 账号密码登录（公开端点，自带 strictLimiter+normalizePii）
      'POST /auth/refresh',           // refresh uses token in body, not authMiddleware
      'POST /admin/login',            // admin login
      'POST /cro/login'               // cro login
    ]);
    const offenders = [];
    for (const r of routes) {
      if (r.method === 'GET') continue;
      const key = `${r.method} ${r.path}`;
      if (PUBLIC_MUTATIONS.has(key)) continue;
      const ok = has(r.chain, 'authMiddleware') || has(r.chain, 'croAuthMiddleware');
      if (!ok) offenders.push(key);
    }
    expect(offenders).toEqual([]);
  });

  // ---- 综合规则：所有 /admin/* 路由必须挂 requireAdminToken ----

  test('every /admin/* route (except login) has requireAdminToken', () => {
    const offenders = [];
    for (const r of routes) {
      if (!r.path.startsWith('/admin/')) continue;
      if (r.path === '/admin/login') continue;
      if (!has(r.chain, 'requireAdminToken')) offenders.push(`${r.method} ${r.path}`);
    }
    expect(offenders).toEqual([]);
  });

  // ---- 综合规则：所有 /admin/* 写路径或 PII 路径必须挂 logAdmin ----

  test('every /admin/* mutation route has logAdmin audit', () => {
    const offenders = [];
    for (const r of routes) {
      if (!r.path.startsWith('/admin/')) continue;
      if (r.path === '/admin/login') continue;
      if (r.method === 'GET') continue;
      if (!has(r.chain, 'logAdmin')) offenders.push(`${r.method} ${r.path}`);
    }
    expect(offenders).toEqual([]);
  });

  // ---- PHI reveal 必须 super + audit ----

  test('GET /admin/users/:id/reveal has requireRole(super) + logAdmin(reveal_field)', () => {
    const route = findRoute('GET', '/admin/users/:id/reveal');
    expect(route).toBeDefined();
    expect(has(route.chain, /requireRole\(\s*['"`]super['"`]/)).toBe(true);
    expect(has(route.chain, /logAdmin\(\s*['"`]reveal_field['"`]/)).toBe(true);
  });
});
