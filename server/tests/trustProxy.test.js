// PRD-2026Q4 T0-7 followup（rate-limit per-client）回归测试：
// 静态扫 app.js 确认 NODE_ENV=production 时 app.set('trust proxy', N) 已配置；
// 行为测试用一个独立的 mini-express + supertest-style 请求，证明 X-Forwarded-For
// 在 trust-proxy 开启时会被解析为 req.ip，关闭时仍是 socket peer。
//
// 这条测试是高 leverage：trust-proxy 错配是 OWASP A07:2021 的常见根因
//（"Identification and Authentication Failures" 鞭长莫及一类），登录暴力破解 +
// 审计 IP 失真都源自此。

const fs = require('fs');
const path = require('path');
const express = require('express');
const http = require('http');

describe('app.js — trust proxy is enabled in production', () => {
  test('source declares NODE_ENV=production → app.set("trust proxy", 1)', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
    // 必须出现「production 才信任代理」的判断 + app.set('trust proxy', N) 调用。
    expect(src).toMatch(/NODE_ENV\s*===\s*['"]production['"]/);
    expect(src).toMatch(/app\.set\(['"]trust proxy['"]\s*,\s*[A-Z_a-z0-9]+\)/);
  });

  test('strictLimiter 在 routes 层确实挂在登录路径（防 brute-force 的 keyGenerator 上下文）', () => {
    const routesSrc = fs.readFileSync(
      path.join(__dirname, '..', 'routes', 'index.js'),
      'utf8'
    );
    // 三条登录入口必须挂 strictLimiter；否则 trust-proxy 修对了也救不回来。
    expect(routesSrc).toMatch(/'\/admin\/login'\s*,\s*strictLimiter/);
    expect(routesSrc).toMatch(/'\/cro\/login'\s*,\s*strictLimiter/);
    expect(routesSrc).toMatch(/'\/auth\/weapp-login'\s*,\s*strictLimiter/);
    expect(routesSrc).toMatch(/'\/auth\/h5-login'\s*,\s*strictLimiter/);
    expect(routesSrc).toMatch(/'\/auth\/send-code'\s*,\s*strictLimiter/);
    expect(routesSrc).toMatch(/'\/auth\/refresh'\s*,\s*strictLimiter/);
  });

  test('parse-status 从全局 IP 限流排除，并在 auth 后使用独立用户限流', () => {
    const rateLimitSrc = fs.readFileSync(
      path.join(__dirname, '..', 'middleware', 'rateLimit.js'),
      'utf8'
    );
    const routesSrc = fs.readFileSync(
      path.join(__dirname, '..', 'routes', 'index.js'),
      'utf8'
    );

    expect(rateLimitSrc).toMatch(/const defaultLimiter = createRateLimiter\(\{ skip: isParseStatusPath \}\)/);
    expect(rateLimitSrc).toMatch(/const parseStatusLimiter = createRateLimiter/);
    expect(rateLimitSrc).toMatch(/PARSE_STATUS_RATE_LIMIT_MAX/);
    expect(routesSrc).toMatch(/'\/medical\/parse-status'\s*,\s*authMiddleware,\s*parseStatusLimiter/);
    expect(routesSrc).toMatch(/'\/medical\/parse-status-batch'\s*,\s*authMiddleware,\s*parseStatusLimiter/);
  });
});

describe('Express trust proxy behavior — runtime sanity check', () => {
  // 起一个最小的 express server，分别 with 和 without `trust proxy`，发一个
  // X-Forwarded-For 的请求，断言 req.ip 的值差异。
  const startApp = (trustProxy) => new Promise((resolve) => {
    const app = express();
    if (trustProxy) app.set('trust proxy', 1);
    let captured;
    app.get('/probe', (req, res) => { captured = req.ip; res.end('ok'); });
    const server = app.listen(0, () => resolve({ server, app, getCaptured: () => captured }));
  });

  const fire = (port, headers) => new Promise((resolve, reject) => {
    const req = http.request({
      host: '127.0.0.1', port, path: '/probe', method: 'GET', headers
    }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks).toString()));
    });
    req.on('error', reject);
    req.end();
  });

  test('without trust proxy: X-Forwarded-For is ignored, req.ip is socket peer', async () => {
    const { server, getCaptured } = await startApp(false);
    const port = server.address().port;
    await fire(port, { 'X-Forwarded-For': '203.0.113.7' });
    server.close();
    const ip = getCaptured();
    // 127.0.0.1 / ::1 / ::ffff:127.0.0.1 都算 loopback；不应该是 forwarded 值。
    expect(ip).not.toBe('203.0.113.7');
    expect(/127\.0\.0\.1|::1/.test(String(ip))).toBe(true);
  });

  test('with trust proxy=1: req.ip resolves to X-Forwarded-For value', async () => {
    const { server, getCaptured } = await startApp(true);
    const port = server.address().port;
    await fire(port, { 'X-Forwarded-For': '203.0.113.7' });
    server.close();
    expect(getCaptured()).toBe('203.0.113.7');
  });

  test('with trust proxy=1: only the rightmost (nginx-written) hop is trusted, NOT the leftmost', async () => {
    // 安全模型：客户端可以任意伪造 X-Forwarded-For 头里的左边部分；只有最右边
    // 那段是 nginx 自己 append 的、可信。express trust=1 正确地取 [n-1]
    // = '203.0.113.7'。如果取 leftmost（'198.51.100.1'），客户端立即可以伪造源 IP
    // 来绕过 rate-limit / 审计日志（同 OWASP A07 类失误）。
    const { server, getCaptured } = await startApp(true);
    const port = server.address().port;
    await fire(port, { 'X-Forwarded-For': '198.51.100.1, 203.0.113.7' });
    server.close();
    expect(getCaptured()).toBe('203.0.113.7');
    // 客户端伪造的 leftmost IP **不能**进入 req.ip。
    expect(getCaptured()).not.toBe('198.51.100.1');
  });
});
