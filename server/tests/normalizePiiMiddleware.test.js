/**
 * PRD-2026Q4 T0-7：normalizePii 中间件契约测试。
 *
 * - 命中归一化：req.body.phone / id_card / idCard 被改写后才到达 handler。
 * - 校验失败：返回 422 + { code, message }，handler 未被调用。
 * - 缺字段或 GET：透传不报错。
 */

const express = require('express');
const request = require('supertest');
const normalizePii = require('../middleware/normalizePii');

const VALID_ID_CARD = '110101199003076798'; // 校验位=8

const buildApp = () => {
  const app = express();
  app.use(express.json());

  // 暴露一个 echo handler，把归一化后的 body 吐回去用于断言
  const echo = (req, res) => res.json({ body: req.body });

  app.post('/echo', normalizePii, echo);
  app.put('/echo', normalizePii, echo);
  app.get('/echo', normalizePii, (req, res) => res.json({ ok: true }));
  return app;
};

describe('normalizePii middleware', () => {
  test('phone 命中归一化：+86 + 噪声 → 11 位', async () => {
    const app = buildApp();
    const res = await request(app).post('/echo').send({ phone: '+86 138-0013-8000' });
    expect(res.status).toBe(200);
    expect(res.body.body.phone).toBe('13800138000');
  });

  test('id_card 命中归一化：小写 → 大写并通过校验', async () => {
    const app = buildApp();
    const res = await request(app).post('/echo').send({ id_card: VALID_ID_CARD });
    expect(res.status).toBe(200);
    expect(res.body.body.id_card).toBe(VALID_ID_CARD);
  });

  test('idCard 驼峰也被归一化', async () => {
    const app = buildApp();
    const res = await request(app).post('/echo').send({ idCard: VALID_ID_CARD });
    expect(res.status).toBe(200);
    expect(res.body.body.idCard).toBe(VALID_ID_CARD);
  });

  test('phone 校验失败 → 422 + PHONE_INVALID', async () => {
    const app = buildApp();
    const res = await request(app).post('/echo').send({ phone: '12345' });
    expect(res.status).toBe(422);
    expect(res.body.code).toBe('PHONE_INVALID');
    expect(res.body.message).toBeTruthy();
    expect(res.body.message).not.toMatch(/regex|\^|\$/i);
  });

  test('id_card 校验位错 → 422 + ID_CARD_CHECKSUM_INVALID', async () => {
    const app = buildApp();
    const bad = VALID_ID_CARD.slice(0, 17) + '0';
    const res = await request(app).post('/echo').send({ id_card: bad });
    expect(res.status).toBe(422);
    expect(res.body.code).toBe('ID_CARD_CHECKSUM_INVALID');
  });

  test('id_card 格式错 → 422 + ID_CARD_FORMAT_INVALID', async () => {
    const app = buildApp();
    const res = await request(app).post('/echo').send({ id_card: '12345' });
    expect(res.status).toBe(422);
    expect(res.body.code).toBe('ID_CARD_FORMAT_INVALID');
  });

  test('无 phone / id_card 字段 → 透传', async () => {
    const app = buildApp();
    const res = await request(app).post('/echo').send({ name: 'Tom' });
    expect(res.status).toBe(200);
    expect(res.body.body).toEqual({ name: 'Tom' });
  });

  test('phone 为空字符串 → 不报错（视为未填）', async () => {
    const app = buildApp();
    const res = await request(app).post('/echo').send({ phone: '' });
    expect(res.status).toBe(200);
    expect(res.body.body.phone).toBe('');
  });

  test('GET 无 body → 不报错', async () => {
    const app = buildApp();
    const res = await request(app).get('/echo');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  test('PUT 同样生效', async () => {
    const app = buildApp();
    const res = await request(app).put('/echo').send({ phone: '138.0013.8000' });
    expect(res.status).toBe(200);
    expect(res.body.body.phone).toBe('13800138000');
  });
});
