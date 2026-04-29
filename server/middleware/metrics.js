/**
 * PRD-2026Q2 §4.1：观测接入（Prometheus /metrics endpoint + 核心业务指标）。
 *
 * 暴露三类指标：
 *   1. 默认进程指标（CPU / 内存 / event loop lag / gc 等）→ collectDefaultMetrics
 *   2. HTTP 请求延迟直方图 httpRequestDuration（method / route / status）
 *   3. OCR 队列深度 ocrQueueGauge（waiting / active / failed / completed）
 *   4. 匹配打分分布 matchScoreSummary（按 bucket 抽样观测 P50/P90/P99）
 *
 * 设计要点：
 *  - 单一 Registry 实例，避免全局污染；app.js 通过 `register.metrics()` 导出。
 *  - collectOcrQueueStats() 懒调用：只在命中 /metrics 端点时查询 Bull，
 *    避免在无人抓取时空转 Redis。
 *  - httpMetricsMiddleware 走 res.on('finish')，不拦截响应体。
 */

const client = require('prom-client');

const register = new client.Registry();
// 默认指标前缀，方便在 Grafana 里分组
client.collectDefaultMetrics({ register, prefix: 'treatbot_' });

// ---- HTTP 请求延迟 ----
const httpRequestDuration = new client.Histogram({
  name: 'http_request_duration_seconds',
  help: 'HTTP 请求耗时（秒），按 method/route/status 维度',
  labelNames: ['method', 'route', 'status'],
  buckets: [0.05, 0.1, 0.3, 0.5, 1, 2, 5],
  registers: [register]
});

// ---- OCR 队列深度 ----
const ocrQueueGauge = new client.Gauge({
  name: 'ocr_queue_jobs',
  help: 'OCR Bull 队列中各状态任务数量',
  labelNames: ['state'], // waiting | active | failed | completed
  registers: [register]
});

// ---- 匹配打分分布（10% 抽样）----
const matchScoreSummary = new client.Summary({
  name: 'match_score',
  help: 'matchEngine 打分分布（10% 抽样），按 bucket 标签分桶',
  labelNames: ['bucket'], // <0.3 | 0.3-0.6 | 0.6-0.8 | >=0.8
  percentiles: [0.5, 0.9, 0.99],
  registers: [register]
});

// ---- Q3-红线 §A.3：LLM 调用可观测性 ----
// 维度 provider/model/operation/status 让我们能在 Grafana 上分别看
//   - 不同模型的延迟分布
//   - 各种错误类型（429/timeout/server_error/schema_invalid）的占比
//   - prompt vs completion token 增长趋势 → 直接换算成本
//   - fallback 链触发频率（一旦升高说明主 provider 健康度下滑）
const llmCallDuration = new client.Histogram({
  name: 'llm_call_duration_seconds',
  help: 'LLM API 调用耗时（秒），按 provider/model/operation/status 维度',
  labelNames: ['provider', 'model', 'operation', 'status'],
  buckets: [0.5, 1, 3, 5, 10, 30, 60],
  registers: [register]
});

const llmTokensTotal = new client.Counter({
  name: 'llm_tokens_total',
  help: 'LLM token 累计消耗，direction=prompt|completion',
  labelNames: ['provider', 'model', 'direction'],
  registers: [register]
});

const llmCallTotal = new client.Counter({
  name: 'llm_call_total',
  help: 'LLM 调用次数计数，按 status 分类（success|schema_invalid|rate_limit|timeout|server_error|other）',
  labelNames: ['provider', 'model', 'operation', 'status'],
  registers: [register]
});

const llmFallbackTriggered = new client.Counter({
  name: 'llm_fallback_triggered_total',
  help: 'LLM provider 回退链被触发次数（from_provider → to_provider）',
  labelNames: ['from_provider', 'to_provider', 'reason'],
  registers: [register]
});

// Q3-红线 §B.2：业务漏斗事件计数器（POST /api/track 落库时同步 inc）
// 标签 event 取自白名单（landing_view / upload_start / upload_success /
// match_view / trial_apply / application_submitted）；
// Grafana 里画 6 步漏斗就直接 sum by (event) (rate(user_funnel_event_total[5m]))。
const userFunnelEventTotal = new client.Counter({
  name: 'user_funnel_event_total',
  help: '业务漏斗事件累计计数，按 event 维度',
  labelNames: ['event'],
  registers: [register]
});

/**
 * 读取 OCR 队列四项计数写入 gauge。
 * 任意一项失败时 catch 住，不影响 /metrics 响应。
 */
const collectOcrQueueStats = async () => {
  // 懒 require 避免启动顺序引入循环依赖
  const queueService = require('../services/queue');
  const q = queueService && queueService.ocrQueue;
  if (!q) return;

  const pairs = [
    ['waiting', 'getWaitingCount'],
    ['active', 'getActiveCount'],
    ['failed', 'getFailedCount'],
    ['completed', 'getCompletedCount']
  ];

  await Promise.all(pairs.map(async ([state, fn]) => {
    if (typeof q[fn] !== 'function') return;
    try {
      const n = await q[fn]();
      if (Number.isFinite(Number(n))) {
        ocrQueueGauge.labels(state).set(Number(n));
      }
    } catch (e) {
      // 静默失败：Redis 不可用时 /metrics 仍可吐出其它指标
    }
  }));
};

/**
 * Express middleware：记录每个请求的耗时直方图。
 * - route 优先取 req.route.path（真实注册路径），否则回退 req.path
 * - status 转字符串避免高 cardinality 数字标签
 */
const httpMetricsMiddleware = (req, res, next) => {
  const start = process.hrtime.bigint();
  res.on('finish', () => {
    try {
      const elapsedNs = Number(process.hrtime.bigint() - start);
      const seconds = elapsedNs / 1e9;
      const route = (req.route && req.route.path) || req.path || 'unknown';
      const status = String(res.statusCode || 0);
      httpRequestDuration.labels(req.method || 'GET', route, status).observe(seconds);
    } catch (e) {
      // 永远不能因为埋点抛错影响业务
    }
  });
  next();
};

module.exports = {
  register,
  httpRequestDuration,
  ocrQueueGauge,
  matchScoreSummary,
  collectOcrQueueStats,
  httpMetricsMiddleware,
  // Q3-红线 §A.3：LLM 可观测性指标
  llmCallDuration,
  llmTokensTotal,
  llmCallTotal,
  llmFallbackTriggered,
  // Q3-红线 §B.2：漏斗事件计数器
  userFunnelEventTotal
};
