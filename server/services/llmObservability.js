/**
 * Q3-红线 §A.3.2：LLM 调用可观测性桩。
 *
 * 提供 instrumentLlmCall({provider, model, operation}, fn) 装饰器：
 *  - 自动测量耗时 → llmCallDuration histogram
 *  - 解析 axios 错误分类 → status label
 *  - 解析 response.data.usage.{prompt_tokens, completion_tokens} → llmTokensTotal counter
 *  - 失败也写一次 llmCallTotal（status != success），保证错误率分子分母都齐
 *
 * 与未来 services/llmClient.js（A1 任务产出）共存策略：
 *  - 本模块只负责"埋点"，不持有 axios 句柄。
 *  - llmClient 推荐在内部直接调用 instrumentLlmCall 包裹 axios.post。
 *  - 当前 ocr.js 残留的直连 axios 也在外层包了一层 instrumentLlmCall，A1 合并后
 *    那些直连位会被删掉，本模块的接口保持不变（双重保险）。
 */

const logger = require('../utils/logger');

// 懒加载 metrics，避免在某些 CI mock 场景下因 prom-client 不存在而崩溃
let _metrics = null;
try {
  _metrics = require('../middleware/metrics');
} catch (e) {
  _metrics = null;
}

let _sentry = null;
try {
  _sentry = require('../observability/sentry');
} catch (e) {
  _sentry = null;
}

/**
 * 错误分类规则（status label）：
 *   - HTTP 429                          → 'rate_limit'
 *   - axios ECONNABORTED / ETIMEDOUT    → 'timeout'
 *   - HTTP 5xx                          → 'server_error'
 *   - 自定义 SchemaInvalidError          → 'schema_invalid'
 *   - 其它                              → 'other'
 */
const classifyLlmError = (err) => {
  if (!err) return 'other';
  if (err.name === 'SchemaInvalidError' || err.code === 'SCHEMA_INVALID') {
    return 'schema_invalid';
  }
  const status = err?.response?.status;
  if (status === 429) return 'rate_limit';
  if (typeof status === 'number' && status >= 500) return 'server_error';
  if (err.code === 'ECONNABORTED' || err.code === 'ETIMEDOUT') return 'timeout';
  // axios 在某些超时场景把 message 含 'timeout'
  const msg = String(err.message || '').toLowerCase();
  if (msg.includes('timeout')) return 'timeout';
  return 'other';
};

/**
 * 从 axios 风格的 response.data.usage 中读取 token 用量并写 counter。
 * usage 缺失时静默跳过（不少模型不返回 usage）。
 */
const recordTokenUsage = (provider, model, response) => {
  if (!_metrics || !_metrics.llmTokensTotal) return;
  try {
    const usage = response?.data?.usage || response?.usage;
    if (!usage || typeof usage !== 'object') return;
    const prompt = Number(usage.prompt_tokens || usage.input_tokens || 0);
    const completion = Number(usage.completion_tokens || usage.output_tokens || 0);
    if (prompt > 0) {
      _metrics.llmTokensTotal.labels(provider, model, 'prompt').inc(prompt);
    }
    if (completion > 0) {
      _metrics.llmTokensTotal.labels(provider, model, 'completion').inc(completion);
    }
  } catch (e) {
    // 埋点失败不能影响业务
  }
};

/**
 * 包裹一次 LLM 调用：自动计时 + 状态分类 + token 统计。
 *
 * @param {{provider:string, model:string, operation:string}} ctx
 * @param {() => Promise<any>} fn 真正的 LLM 调用闭包；返回值最好是 axios response，
 *                                这样能直接解析 response.data.usage。
 *
 * 失败会原样 re-throw，调用方业务逻辑（fallback / 重试）保持不变。
 */
const instrumentLlmCall = async (ctx, fn) => {
  const { provider = 'unknown', model = 'unknown', operation = 'unknown' } = ctx || {};
  const startNs = process.hrtime.bigint();
  let status = 'success';

  try {
    const response = await fn();
    // 仅在 metrics 模块加载成功时才写
    if (_metrics) {
      recordTokenUsage(provider, model, response);
    }
    return response;
  } catch (err) {
    status = classifyLlmError(err);
    // 把错误也上报到 Sentry（受 beforeSend PII 脱敏保护）
    if (_sentry && typeof _sentry.captureException === 'function') {
      _sentry.captureException(err, {
        tags: { llm_provider: provider, llm_model: model, llm_operation: operation, llm_status: status }
      });
    }
    throw err;
  } finally {
    if (_metrics && _metrics.llmCallDuration && _metrics.llmCallTotal) {
      try {
        const elapsedSec = Number(process.hrtime.bigint() - startNs) / 1e9;
        _metrics.llmCallDuration.labels(provider, model, operation, status).observe(elapsedSec);
        _metrics.llmCallTotal.labels(provider, model, operation, status).inc(1);
      } catch (e) {
        // 静默失败：埋点不能反噬业务
      }
    }
  }
};

/**
 * 显式标记 fallback 触发：from_provider 失败 → to_provider 上场，reason 即错误分类。
 */
const recordFallback = (fromProvider, toProvider, reason) => {
  if (!_metrics || !_metrics.llmFallbackTriggered) return;
  try {
    _metrics.llmFallbackTriggered
      .labels(String(fromProvider || 'unknown'), String(toProvider || 'unknown'), String(reason || 'other'))
      .inc(1);
  } catch (e) {
    // ignore
  }
};

module.exports = {
  instrumentLlmCall,
  recordFallback,
  classifyLlmError,
  // 暴露给单测 mock 时使用
  _internal: { recordTokenUsage }
};
