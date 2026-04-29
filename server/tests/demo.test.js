/**
 * demo.test.js — 公开演示接口
 *
 * 覆盖：
 *   - GET /api/demo/samples 返回样例元信息，不需要 Authorization
 *   - GET /api/demo/samples/:id/result 返回结构化病历，字段完整
 *   - GET /api/demo/samples/:id/matches 返回 top-5 匹配
 *   - 未知 id → 404
 *   - 静态资源 /demo-assets/sample-1-hcc.jpg 可访问
 */

const request = require('supertest');
const path = require('path');
const fs = require('fs');

const app = require('../app');

describe('GET /api/demo/samples', () => {
  test('返回样例列表，且无需 Authorization', async () => {
    const res = await request(app).get('/api/demo/samples');
    expect(res.status).toBe(200);
    expect(res.body.code).toBe(0);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.length).toBeGreaterThanOrEqual(1);

    const first = res.body.data[0];
    expect(first).toHaveProperty('id');
    expect(first).toHaveProperty('title');
    expect(first).toHaveProperty('summary');
    expect(first).toHaveProperty('imageUrl');
    expect(first.imageUrl).toMatch(/^\/demo-assets\//);
  });

  test('不带 Authorization header 也能通过（public）', async () => {
    // 明确不传 header，确认 demo 路径在 auth 之前
    const res = await request(app).get('/api/demo/samples').unset('Authorization');
    expect(res.status).toBe(200);
  });
});

describe('GET /api/demo/samples/:id/result', () => {
  test('已知样例返回结构化病历，字段完整', async () => {
    const list = await request(app).get('/api/demo/samples');
    const firstId = list.body.data[0].id;

    const res = await request(app).get(`/api/demo/samples/${firstId}/result`);
    expect(res.status).toBe(200);
    expect(res.body.code).toBe(0);

    const data = res.body.data;
    expect(data.status).toBe('completed');
    expect(data.progress).toBe(100);
    expect(data.isDemo).toBe(true);
    expect(data.recordId).toBe(`demo-${firstId}`);

    const result = data.result;
    expect(result.diagnosis).toBeTruthy();
    expect(result.stage).toBeTruthy();
    expect(result.geneMutation).toBeTruthy();
    expect(result.ecog).toBeTruthy();
    expect(result.treatment).toBeTruthy();
    expect(result.confidence).toBeGreaterThan(0);
  });

  test('未知 id 返回 404', async () => {
    const res = await request(app).get('/api/demo/samples/does-not-exist/result');
    expect(res.status).toBe(404);
  });
});

describe('GET /api/demo/samples/:id/matches', () => {
  test('返回非空匹配列表，每条含 score/name/reasons', async () => {
    const list = await request(app).get('/api/demo/samples');
    const firstId = list.body.data[0].id;

    const res = await request(app).get(`/api/demo/samples/${firstId}/matches`);
    expect(res.status).toBe(200);
    expect(res.body.code).toBe(0);

    const matches = res.body.data.list;
    expect(Array.isArray(matches)).toBe(true);
    expect(matches.length).toBeGreaterThanOrEqual(1);

    const m = matches[0];
    expect(m).toHaveProperty('id');
    expect(m).toHaveProperty('name');
    expect(typeof m.score).toBe('number');
    expect(m.score).toBeGreaterThan(0);
    expect(Array.isArray(m.reasons)).toBe(true);
    expect(m.reasons.length).toBeGreaterThan(0);
    expect(m).toHaveProperty('statusText');
  });

  test('未知 id 返回 404', async () => {
    const res = await request(app).get('/api/demo/samples/does-not-exist/matches');
    expect(res.status).toBe(404);
  });

  test('分页信息完整', async () => {
    const list = await request(app).get('/api/demo/samples');
    const firstId = list.body.data[0].id;

    const res = await request(app).get(`/api/demo/samples/${firstId}/matches`);
    expect(res.body.data.pagination).toBeDefined();
    expect(res.body.data.pagination.hasMore).toBe(false);
    expect(res.body.data.pagination.total).toBe(res.body.data.list.length);
  });
});

describe('静态资源 /demo-assets/*', () => {
  test('样例图片文件真实存在', () => {
    const imgPath = path.join(__dirname, '..', 'public', 'demo', 'sample-1-hcc.jpg');
    expect(fs.existsSync(imgPath)).toBe(true);
    const stat = fs.statSync(imgPath);
    expect(stat.size).toBeGreaterThan(10 * 1024); // 至少 10KB
  });

  test('/demo-assets/sample-1-hcc.jpg 返回 200 并有图片 content-type', async () => {
    const res = await request(app).get('/demo-assets/sample-1-hcc.jpg');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/image/);
  });
});

describe('Fixture 完整性', () => {
  test('demoSamples.json 所有 sample 都必须有 matches（由 generateDemoFixture.js 填充）', () => {
    const fixture = require('../fixtures/demoSamples.json');
    expect(fixture.samples.length).toBeGreaterThanOrEqual(1);
    fixture.samples.forEach((s) => {
      expect(Array.isArray(s.matches)).toBe(true);
      expect(s.matches.length).toBeGreaterThan(0);
      expect(s.meta.title).toBeTruthy();
      expect(s.result.diagnosis).toBeTruthy();
    });
  });

  test('共 3 份样例，且包含 sample-3-sba 小肠腺癌案例', () => {
    const fixture = require('../fixtures/demoSamples.json');
    expect(fixture.samples.length).toBe(3);
    const ids = fixture.samples.map((s) => s.id);
    expect(ids).toContain('sample-3-sba');
  });

  test('sample-3-sba 富字段（TNM / 转移 / 分子 / vMTB）齐全', () => {
    const fixture = require('../fixtures/demoSamples.json');
    const sba = fixture.samples.find((s) => s.id === 'sample-3-sba');
    expect(sba).toBeTruthy();
    const r = sba.result;
    expect(r.tnmStage).toBe('T3N1M1');
    expect(Array.isArray(r.metastasisSites)).toBe(true);
    expect(r.metastasisSites).toContain('肝脏多发');
    expect(Array.isArray(r.molecular.drivers)).toBe(true);
    expect(r.molecular.drivers[0].gene).toBe('KRAS');
    expect(Array.isArray(r.vMTBPlans)).toBe(true);
    expect(r.vMTBPlans.length).toBeGreaterThanOrEqual(4);
  });

  test('sample-3-sba 完整脱敏：不含真实姓氏 / 医院 / 出生年', () => {
    const fixture = require('../fixtures/demoSamples.json');
    const sba = fixture.samples.find((s) => s.id === 'sample-3-sba');
    const serialized = JSON.stringify(sba);
    expect(serialized).not.toMatch(/钱志达/);
    expect(serialized).not.toMatch(/钱/);
    expect(serialized).not.toMatch(/长海/);
    expect(serialized).not.toMatch(/1967/);
  });

  test('sample-2-nsclc 试验匹配与 EGFR 突变阳性人群一致（不含驱动基因阴性）', () => {
    const fixture = require('../fixtures/demoSamples.json');
    const nsclc = fixture.samples.find((s) => s.id === 'sample-2-nsclc');
    nsclc.matches.forEach((m) => {
      expect(m.name || '').not.toMatch(/驱动基因阴性/);
      expect(m.indication || '').not.toMatch(/驱动基因阴性/);
    });
  });

  test('sample-1-hcc 试验匹配为 HCC 一致（不含乳腺 / HER2 阳性）', () => {
    const fixture = require('../fixtures/demoSamples.json');
    const hcc = fixture.samples.find((s) => s.id === 'sample-1-hcc');
    hcc.matches.forEach((m) => {
      expect(m.indication || '').not.toMatch(/乳腺/);
      expect(m.indication || '').not.toMatch(/HER2 阳性/);
    });
  });
});
