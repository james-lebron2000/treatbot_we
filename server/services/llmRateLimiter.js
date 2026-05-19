/**
 * Plan §Phase 1.1：上游 LLM provider 并发限流（in-process token bucket / semaphore）。
 *
 * 背景：把 OCR worker 并发从 2 提到 4 后，单进程瞬间可能向 Doubao 发起 4 个并发请求；
 * 而我们想要的是「让 worker 池吃满，但同一 provider 不超配额」。
 *
 * 实现：基于 Promise 的信号量。每个 provider 一个独立桶，capacity 由 env 控制。
 *  - acquire(provider) 阻塞至有空位；
 *  - release(provider) 唤醒一个等待者；
 *  - getInflight(provider) 实时读当前在途数（写 prom gauge 用）。
 *
 * 使用模式：
 *   await rateLimiter.acquire('doubao');
 *   try { return await axios.post(...); }
 *   finally { rateLimiter.release('doubao'); }
 *
 * 默认配额（可被 env 覆盖）：
 *   - doubao: 3（与 ARK 后台默认 QPS 兼容）
 *   - kimi:   2（fallback，轻流量）
 *   - openai: 2
 *
 * 边界：
 *  - 单进程作用域，跨进程协调走 Bull 队列本身（Redis 可见状态）。
 *  - 即使 acquire 抛错也保证 release 由 finally 触发；如未对应 acquire，release 是 no-op。
 */

// Wave 2 §F5：doubao 默认容量 3 → 4，与 server/services/queue.js 的 OCR_QUEUE_CONCURRENCY=4 对齐。
// 之前的错配会让第 4 个 worker 在 acquire 上长时间排队，前端进度卡在 50% 没有任何提示。
// kimi/openai 是兜底链路，并发提升收益小，保留 2。
const DEFAULT_CAPACITIES = {
  doubao: parseInt(process.env.LLM_DOUBAO_CONCURRENCY || '4', 10),
  kimi: parseInt(process.env.LLM_KIMI_CONCURRENCY || '2', 10),
  openai: parseInt(process.env.LLM_OPENAI_CONCURRENCY || '2', 10)
};

const buckets = new Map();

const getBucket = (provider) => {
  const key = String(provider || 'unknown').toLowerCase();
  if (!buckets.has(key)) {
    const capacity = Math.max(1, DEFAULT_CAPACITIES[key] || parseInt(process.env.LLM_DEFAULT_CONCURRENCY || '2', 10));
    buckets.set(key, {
      capacity,
      inflight: 0,
      waiting: []
    });
  }
  return buckets.get(key);
};

let _metrics = null;
try {
  _metrics = require('../middleware/metrics');
} catch (e) {
  _metrics = null;
}

const updateGauge = (provider, bucket) => {
  if (!_metrics || !_metrics.llmProviderInflightGauge) return;
  try {
    _metrics.llmProviderInflightGauge.labels(provider).set(bucket.inflight);
  } catch (e) {
    // gauge 写失败不能阻塞业务
  }
};

// Wave 2 §F5：onWait 回调 —— acquire 必须等队列空位时立即同步触发，
// 让 caller（queue.js / ocrPipeline.js）可以推一个 SSE 'queued' 帧告诉用户在排队。
// 没传 onWait 等价于原行为。
const acquire = (provider, onWait) => {
  const key = String(provider || 'unknown').toLowerCase();
  const bucket = getBucket(key);

  if (bucket.inflight < bucket.capacity) {
    bucket.inflight += 1;
    updateGauge(key, bucket);
    return Promise.resolve();
  }

  // 必须等待。先 fire onWait（fire-and-forget；caller 异常不能阻塞获取）。
  if (typeof onWait === 'function') {
    try { onWait({ provider: key, capacity: bucket.capacity, waiting: bucket.waiting.length + 1 }); }
    catch (e) { /* onWait 抛错不影响 acquire */ }
  }

  return new Promise((resolve) => {
    bucket.waiting.push(() => {
      bucket.inflight += 1;
      updateGauge(key, bucket);
      resolve();
    });
  });
};

const release = (provider) => {
  const key = String(provider || 'unknown').toLowerCase();
  const bucket = buckets.get(key);
  if (!bucket) return;
  if (bucket.inflight > 0) {
    bucket.inflight -= 1;
  }
  updateGauge(key, bucket);
  const next = bucket.waiting.shift();
  if (next) {
    // 异步触发，避免在同一 tick 中递归占满栈
    setImmediate(next);
  }
};

const getInflight = (provider) => {
  const bucket = buckets.get(String(provider || 'unknown').toLowerCase());
  return bucket ? bucket.inflight : 0;
};

const getCapacity = (provider) => {
  const bucket = getBucket(provider);
  return bucket.capacity;
};

const getStats = () => {
  const stats = {};
  for (const [key, bucket] of buckets.entries()) {
    stats[key] = {
      capacity: bucket.capacity,
      inflight: bucket.inflight,
      waiting: bucket.waiting.length
    };
  }
  return stats;
};

const _resetForTests = () => {
  buckets.clear();
};

module.exports = {
  acquire,
  release,
  getInflight,
  getCapacity,
  getStats,
  _resetForTests
};
