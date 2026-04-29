/**
 * demo.js — 公开的「试用演示」接口，免登录
 *
 * 端点：
 *   GET /api/demo/samples               —— 样例列表（仅元信息）
 *   GET /api/demo/samples/:id/result    —— 结构化病历结果（模拟 parse-status 的 completed 响应）
 *   GET /api/demo/samples/:id/matches   —— 预先跑过 matchEngine 的 top-5 匹配
 *
 * 数据来源：fixtures/demoSamples.json（由 scripts/generateDemoFixture.js 生成）
 * 设计：启动时一次性加载到内存，handler 均为 O(1) 查找。
 */

const path = require('path');
const logger = require('../utils/logger');

const FIXTURE_PATH = path.join(__dirname, '..', 'fixtures', 'demoSamples.json');

let _cache = { samples: [], byId: new Map(), loadedAt: null, loadError: null };

const loadFixture = () => {
  try {
    // 用 require 以便 Jest / jest.isolateModules 能在测试中拿到最新内容
    delete require.cache[require.resolve(FIXTURE_PATH)];
    const fixture = require(FIXTURE_PATH);
    const samples = Array.isArray(fixture.samples) ? fixture.samples : [];
    const byId = new Map();
    samples.forEach((s) => byId.set(s.id, s));
    _cache = { samples, byId, loadedAt: new Date().toISOString(), loadError: null };
    logger.info(`[demo] fixture loaded: ${samples.length} samples`);
  } catch (err) {
    _cache = { samples: [], byId: new Map(), loadedAt: null, loadError: err.message };
    logger.error('[demo] fixture load failed:', err);
  }
};

loadFixture();

/** GET /api/demo/samples */
const listSamples = (req, res) => {
  if (_cache.loadError) {
    return res.fail('demo 数据暂不可用', 503);
  }
  const data = _cache.samples.map((s) => ({
    id: s.id,
    title: s.meta.title,
    summary: s.meta.summary,
    imageUrl: s.meta.imageUrl,
    thumbUrl: s.meta.thumbUrl || s.meta.imageUrl,
    age: s.meta.age,
    sex: s.meta.sex,
    diagnosisHint: s.meta.diagnosisHint
  }));
  res.ok(data);
};

/** GET /api/demo/samples/:id/result —— 结构与 /medical/parse-status 的 completed 响应对齐 */
const getSampleResult = (req, res) => {
  const sample = _cache.byId.get(req.params.id);
  if (!sample) return res.fail('样例不存在', 404);

  res.ok({
    fileId: `demo-${sample.id}`,
    recordId: `demo-${sample.id}`,
    status: 'completed',
    progress: 100,
    result: sample.result,
    // 前端 RecordSummaryCard 直接读 record（=result）拿到 12-section 富字段
    // （timeline / molecular / vMTBPlans / ...）；同时镜像到 structured.entities 让旧
    //  parse-status 消费者继续工作 —— 同一对象引用，新增字段自动透传，无需逐字段映射。
    structured: { entities: sample.result },
    isDemo: true,
    createdAt: _cache.loadedAt,
    updatedAt: _cache.loadedAt
  });
};

/** GET /api/demo/samples/:id/matches —— 结构与 /api/matches 对齐 */
const getSampleMatches = (req, res) => {
  const sample = _cache.byId.get(req.params.id);
  if (!sample) return res.fail('样例不存在', 404);

  const matches = Array.isArray(sample.matches) ? sample.matches : [];
  res.paginated(matches, {
    page: 1,
    pageSize: matches.length,
    total: matches.length,
    hasMore: false
  });
};

module.exports = {
  listSamples,
  getSampleResult,
  getSampleMatches,
  // 测试用
  _reload: loadFixture,
  _getCache: () => _cache
};
