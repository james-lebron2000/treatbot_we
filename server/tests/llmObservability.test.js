/**
 * Q3-红线 §A.3.2 测试：LLM 调用可观测性。
 *
 * 覆盖契约：
 *  1. 成功调用 → llm_call_duration_seconds histogram observe + status=success + tokens 计数
 *  2. 429 → status=rate_limit
 *  3. timeout (ECONNABORTED) → status=timeout
 *  4. 5xx → status=server_error
 *  5. recordFallback → llm_fallback_triggered_total +1
 */

// 屏蔽 sentry，避免触发任何 SDK 加载副作用
jest.mock('../observability/sentry', () => ({
  captureException: jest.fn(),
  isEnabled: () => false
}));

const {
  instrumentLlmCall,
  recordFallback,
  classifyLlmError
} = require('../services/llmObservability');
const { register } = require('../middleware/metrics');

const findMetric = async (name) => {
  const all = await register.getMetricsAsJSON();
  return all.find((m) => m.name === name);
};

const _sumValues = (metric) => {
  if (!metric || !Array.isArray(metric.values)) return 0;
  return metric.values.reduce((acc, v) => acc + (Number(v.value) || 0), 0);
};

const findValue = (metric, predicate) => {
  if (!metric || !Array.isArray(metric.values)) return null;
  return metric.values.find(predicate) || null;
};

describe('llmObservability §A.3.2', () => {
  test('1) 成功调用 → duration observed + status=success + tokens counted', async () => {
    const fakeResp = {
      data: {
        choices: [{ message: { content: '{}' } }],
        usage: { prompt_tokens: 120, completion_tokens: 30 }
      }
    };

    const result = await instrumentLlmCall(
      { provider: 'kimi', model: 'kimi-k2.5', operation: 'ocr_image' },
      async () => fakeResp
    );
    expect(result).toBe(fakeResp);

    const callTotal = await findMetric('llm_call_total');
    const successSample = findValue(callTotal, (v) =>
      v.labels.provider === 'kimi'
      && v.labels.model === 'kimi-k2.5'
      && v.labels.operation === 'ocr_image'
      && v.labels.status === 'success'
    );
    expect(successSample).toBeTruthy();
    expect(Number(successSample.value)).toBeGreaterThanOrEqual(1);

    // duration histogram 至少留下了 _count > 0 的样本
    const durationMetric = await findMetric('llm_call_duration_seconds');
    expect(durationMetric).toBeTruthy();
    const countSample = findValue(durationMetric, (v) =>
      v.metricName === 'llm_call_duration_seconds_count'
      && v.labels.operation === 'ocr_image'
      && v.labels.status === 'success'
    );
    expect(Number(countSample.value)).toBeGreaterThanOrEqual(1);

    // tokens 计数
    const tokens = await findMetric('llm_tokens_total');
    const promptSample = findValue(tokens, (v) =>
      v.labels.direction === 'prompt' && v.labels.provider === 'kimi'
    );
    const completionSample = findValue(tokens, (v) =>
      v.labels.direction === 'completion' && v.labels.provider === 'kimi'
    );
    expect(Number(promptSample.value)).toBeGreaterThanOrEqual(120);
    expect(Number(completionSample.value)).toBeGreaterThanOrEqual(30);
  });

  test('2) HTTP 429 → status=rate_limit', async () => {
    const err = Object.assign(new Error('rate limited'), {
      response: { status: 429 }
    });
    await expect(
      instrumentLlmCall(
        { provider: 'kimi', model: 'kimi-k2.5', operation: 'ocr_text' },
        async () => { throw err; }
      )
    ).rejects.toBe(err);

    const callTotal = await findMetric('llm_call_total');
    const rl = findValue(callTotal, (v) =>
      v.labels.operation === 'ocr_text' && v.labels.status === 'rate_limit'
    );
    expect(rl).toBeTruthy();
    expect(Number(rl.value)).toBeGreaterThanOrEqual(1);
  });

  test('3) ECONNABORTED → status=timeout', async () => {
    const err = Object.assign(new Error('socket hang up'), { code: 'ECONNABORTED' });
    await expect(
      instrumentLlmCall(
        { provider: 'kimi', model: 'kimi-k2.5', operation: 'ocr_pdf' },
        async () => { throw err; }
      )
    ).rejects.toBe(err);

    const callTotal = await findMetric('llm_call_total');
    const t = findValue(callTotal, (v) =>
      v.labels.operation === 'ocr_pdf' && v.labels.status === 'timeout'
    );
    expect(t).toBeTruthy();
    expect(Number(t.value)).toBeGreaterThanOrEqual(1);
  });

  test('4) HTTP 502 → status=server_error', async () => {
    const err = Object.assign(new Error('bad gateway'), {
      response: { status: 502 }
    });
    await expect(
      instrumentLlmCall(
        { provider: 'openai', model: 'gpt-4o-mini', operation: 'ocr_image' },
        async () => { throw err; }
      )
    ).rejects.toBe(err);

    const callTotal = await findMetric('llm_call_total');
    const se = findValue(callTotal, (v) =>
      v.labels.provider === 'openai' && v.labels.status === 'server_error'
    );
    expect(se).toBeTruthy();
    expect(Number(se.value)).toBeGreaterThanOrEqual(1);
  });

  test('5) recordFallback → llm_fallback_triggered_total counter increments', async () => {
    recordFallback('kimi', 'tencent', 'rate_limit');
    const fb = await findMetric('llm_fallback_triggered_total');
    expect(fb).toBeTruthy();
    const sample = findValue(fb, (v) =>
      v.labels.from_provider === 'kimi'
      && v.labels.to_provider === 'tencent'
      && v.labels.reason === 'rate_limit'
    );
    expect(sample).toBeTruthy();
    expect(Number(sample.value)).toBeGreaterThanOrEqual(1);
  });

  test('6) classifyLlmError 命中 schema_invalid', () => {
    const err = Object.assign(new Error('parse failed'), { name: 'SchemaInvalidError' });
    expect(classifyLlmError(err)).toBe('schema_invalid');

    const codeErr = Object.assign(new Error('schema'), { code: 'SCHEMA_INVALID' });
    expect(classifyLlmError(codeErr)).toBe('schema_invalid');

    expect(classifyLlmError(null)).toBe('other');
    expect(classifyLlmError(new Error('whatever'))).toBe('other');
  });
});
