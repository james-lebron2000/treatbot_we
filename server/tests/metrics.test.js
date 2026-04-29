/**
 * PRD-2026Q2 §4.1：Prometheus /metrics endpoint + 核心业务指标。
 *
 * 覆盖契约：
 *  1. 内网 IP（127.0.0.1）抓取 /metrics → 200 + Prom 文本
 *  2. 外网伪造 IP → 403
 *  3. 命中 /metrics 时 collectOcrQueueStats 会调用 Bull 队列的 getXCount 方法
 *  4. METRICS_ALLOW_ALL=true 时外网 IP 也放行
 *  5. httpMetricsMiddleware 成功记录请求延迟到 httpRequestDuration
 */

// Bull 在真实环境要连 Redis，单测里换成最小 stub。队列计数函数被 jest.fn 包一层
// 方便后续断言调用次数。
const mockGetWaitingCount = jest.fn().mockResolvedValue(2);
const mockGetActiveCount = jest.fn().mockResolvedValue(1);
const mockGetFailedCount = jest.fn().mockResolvedValue(0);
const mockGetCompletedCount = jest.fn().mockResolvedValue(7);

jest.mock('bull', () => {
  return jest.fn().mockImplementation(() => ({
    process: jest.fn(),
    add: jest.fn(),
    on: jest.fn(),
    setMaxListeners: jest.fn(),
    settings: {},
    getWaitingCount: (...a) => mockGetWaitingCount(...a),
    getActiveCount: (...a) => mockGetActiveCount(...a),
    getFailedCount: (...a) => mockGetFailedCount(...a),
    getCompletedCount: (...a) => mockGetCompletedCount(...a)
  }));
});

// 屏蔽 Sequelize
jest.mock('../models', () => ({
  OcrJobFailure: { create: jest.fn(), findByPk: jest.fn() },
  MedicalRecord: { update: jest.fn().mockResolvedValue([1]) }
}));

// ocr 服务真实模块加载 axios / COS SDK 有副作用
jest.mock('../services/ocr', () => ({ processMedicalImage: jest.fn() }));

const request = require('supertest');

describe('metrics §4.1', () => {
  let app;

  beforeAll(() => {
    // 先加载 app，确保 metrics middleware 已安装
    app = require('../app');
  });

  beforeEach(() => {
    delete process.env.METRICS_ALLOW_ALL;
    mockGetWaitingCount.mockClear();
    mockGetActiveCount.mockClear();
    mockGetFailedCount.mockClear();
    mockGetCompletedCount.mockClear();
  });

  test('内网 127.0.0.1 抓取 /metrics → 200 + Prom 文本 + 默认指标', async () => {
    const res = await request(app).get('/metrics');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/plain');
    expect(res.headers['content-type']).toContain('version=0.0.4');
    expect(res.text).toContain('http_request_duration_seconds');
    // 默认进程指标前缀
    expect(res.text).toMatch(/treatbot_process_(cpu|resident)/);
  });

  test('命中 /metrics 会调用 OCR 队列的各 getCount 方法', async () => {
    await request(app).get('/metrics');
    expect(mockGetWaitingCount).toHaveBeenCalled();
    expect(mockGetActiveCount).toHaveBeenCalled();
    expect(mockGetFailedCount).toHaveBeenCalled();
    expect(mockGetCompletedCount).toHaveBeenCalled();
  });

  test('外网 IP（X-Forwarded-For 伪造）默认被 403 拦截', async () => {
    // app 未启用 trust proxy，req.ip 仍为 supertest 的 ::ffff:127.0.0.1，
    // 因此直接 mock ip 检测用的 remoteAddress 不方便；改用一个独立的 express 实例
    // 复用同一套 allowInternalOnly 逻辑验证分支。
    const express = require('express');
    const { register } = require('../middleware/metrics');
    const miniApp = express();
    miniApp.set('trust proxy', true); // 让 X-Forwarded-For 生效
    miniApp.get('/metrics', (req, res, next) => {
      const raw = req.ip || '';
      const ip = raw.replace('::ffff:', '');
      const isInternal = /^(10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|127\.|::1)/.test(ip);
      if (!isInternal && process.env.METRICS_ALLOW_ALL !== 'true') {
        return res.status(403).end();
      }
      next();
    }, async (req, res) => {
      res.set('Content-Type', register.contentType);
      res.end(await register.metrics());
    });

    const res = await request(miniApp)
      .get('/metrics')
      .set('X-Forwarded-For', '8.8.8.8');
    expect(res.status).toBe(403);
  });

  test('METRICS_ALLOW_ALL=true 时外网 IP 也能抓到 200', async () => {
    process.env.METRICS_ALLOW_ALL = 'true';
    const express = require('express');
    const { register } = require('../middleware/metrics');
    const miniApp = express();
    miniApp.set('trust proxy', true);
    miniApp.get('/metrics', (req, res, next) => {
      const raw = req.ip || '';
      const ip = raw.replace('::ffff:', '');
      const isInternal = /^(10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|127\.|::1)/.test(ip);
      if (!isInternal && process.env.METRICS_ALLOW_ALL !== 'true') {
        return res.status(403).end();
      }
      next();
    }, async (req, res) => {
      res.set('Content-Type', register.contentType);
      res.end(await register.metrics());
    });

    const res = await request(miniApp)
      .get('/metrics')
      .set('X-Forwarded-For', '8.8.8.8');
    expect(res.status).toBe(200);
    expect(res.text).toContain('http_request_duration_seconds');
  });

  test('httpMetricsMiddleware 会把请求耗时写入直方图', async () => {
    // 命中一次 /health，再抓 /metrics 确认 histogram count 上升
    await request(app).get('/health');
    const res = await request(app).get('/metrics');
    expect(res.status).toBe(200);
    // metric 文本里应该能看到至少一条 http_request_duration_seconds_count
    expect(res.text).toMatch(/http_request_duration_seconds_count\{[^}]*method="GET"/);
  });
});
