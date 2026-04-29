/**
 * Q3-红线 §B.2：POST /api/track 漏斗埋点端点契约测试。
 *
 * mock 策略：
 *  - UserFunnelEvent.create 用 jest.fn 替换，避免拉真 sequelize / DB。
 *  - userFunnelEventTotal.labels(...).inc() 全程 mock，断言被调用一次。
 *  - 走 supertest 通过 express app + responseEnvelope middleware。
 */

// 静音 logger
jest.mock('../utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn()
}));

// mock models（先于 controller require）
const mockCreate = jest.fn().mockResolvedValue({ id: 1 });
jest.mock('../models', () => ({
  UserFunnelEvent: { create: (...args) => mockCreate(...args) }
}));

// mock metrics —— 同时保留 register / 其它导出避免连锁 require 失败
const mockInc = jest.fn();
const mockLabels = jest.fn(() => ({ inc: mockInc }));
jest.mock('../middleware/metrics', () => {
  const actual = jest.requireActual('../middleware/metrics');
  return {
    ...actual,
    userFunnelEventTotal: { labels: (...args) => mockLabels(...args) }
  };
});

const express = require('express');
const request = require('supertest');
const { responseEnvelope } = require('../middleware/responseEnvelope');
const funnelController = require('../controllers/funnel');

const buildApp = () => {
  const app = express();
  app.use(express.json());
  app.use(responseEnvelope);
  app.post('/api/track', funnelController.track);
  return app;
};

describe('funnel POST /api/track §B.2', () => {
  beforeEach(() => {
    mockCreate.mockClear();
    mockInc.mockClear();
    mockLabels.mockClear();
  });

  test('1) 白名单外 event → 400', async () => {
    const app = buildApp();
    const res = await request(app)
      .post('/api/track')
      .send({ event: 'foo', anonId: 'anon-x' });
    expect(res.status).toBe(400);
    // 信封 shape：{ code, message, data }
    expect(res.body.code).toBe(400);
    expect(mockCreate).not.toHaveBeenCalled();
    expect(mockLabels).not.toHaveBeenCalled();
  });

  test('2) 合法 event + 小 metadata → 200，create 一次，counter inc 一次', async () => {
    const app = buildApp();
    const res = await request(app)
      .post('/api/track')
      .send({
        event: 'upload_success',
        anonId: 'anon-1',
        metadata: { recordId: 'rec_1', tag: 'web' }
      });

    expect(res.status).toBe(200);
    expect(res.body.code).toBe(0);
    expect(res.body.data && res.body.data.accepted).toBe(true);

    expect(mockCreate).toHaveBeenCalledTimes(1);
    const createArgs = mockCreate.mock.calls[0][0];
    expect(createArgs.event).toBe('upload_success');
    expect(createArgs.anon_id).toBe('anon-1');
    expect(createArgs.metadata).toEqual({ recordId: 'rec_1', tag: 'web' });

    expect(mockLabels).toHaveBeenCalledTimes(1);
    expect(mockLabels).toHaveBeenCalledWith('upload_success');
    expect(mockInc).toHaveBeenCalledTimes(1);
  });

  test('3) metadata > 2KB → 400，不写库不计数', async () => {
    const app = buildApp();
    const huge = { blob: 'x'.repeat(3000) };
    const res = await request(app)
      .post('/api/track')
      .send({ event: 'landing_view', metadata: huge });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe(400);
    expect(String(res.body.message || '')).toMatch(/2KB|metadata/);
    expect(mockCreate).not.toHaveBeenCalled();
    expect(mockLabels).not.toHaveBeenCalled();
  });
});
