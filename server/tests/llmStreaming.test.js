/**
 * Plan §Phase 1.4：streamingChatJson 单测。
 *
 * 覆盖：
 *   1) extractPartialOcrFields 正确从局部 JSON buffer 抽出已完成字段
 *   2) 完整 SSE 流 → 解析 → schema 通过 → 返回 parsed
 *   3) onFirstToken 在第一段 delta 时被调一次（且只调一次）
 *   4) onPartial 在新字段出现时被调；同一 chunk 内不重复
 *   5) 流 JSON 损坏（中途结束）→ 抛 LlmSchemaError
 *   6) schema 校验失败 → 抛 LlmSchemaError
 *   7) provider 未配置 → 直接 throw（不走流）
 *
 * 不打真实 LLM：mock axios.post 返回伪造的 Node Readable stream。
 */

jest.mock('axios');
jest.mock('../middleware/metrics', () => {
  const labelsMock = jest.fn(() => ({ observe: jest.fn() }));
  return {
    llmFirstTokenDuration: { labels: labelsMock },
    __mockLabels: labelsMock
  };
});

// Plan §Phase 1.1：rate limiter 在测试里降级成 noop，避免误触发 token bucket 信号量。
jest.mock('../services/llmRateLimiter', () => ({
  acquire: jest.fn().mockResolvedValue(),
  release: jest.fn()
}));

const axios = require('axios');
const { Readable } = require('stream');
const { z } = require('zod');

const { streamingChatJson, LlmSchemaError, __internals } = require('../services/llmClient');
const { extractPartialOcrFields } = __internals;

const buildSseStream = (chunks) => {
  // Each chunk is a string; the stream emits them in order.
  // Real SSE uses "data: <json>\n\n" framing — we allow callers to pre-frame or pass raw.
  return Readable.from(chunks);
};

const sseFrame = (obj) => `data: ${JSON.stringify(obj)}\n\n`;
const sseDone = () => 'data: [DONE]\n\n';

const SimpleSchema = z.object({
  diagnosis: z.string().nullable(),
  stage: z.string().nullable()
}).passthrough();

describe('extractPartialOcrFields', () => {
  test('从完整 buffer 抽出字符串字段', () => {
    const buf = '{"diagnosis": "肺腺癌", "stage": "IV期"';
    const out = extractPartialOcrFields(buf);
    expect(out).toEqual({ diagnosis: '肺腺癌', stage: 'IV期' });
  });

  test('未闭合字符串不被抽出', () => {
    // diagnosis 已闭合，stage 还在打印中（无尾引号）→ 只抽到 diagnosis
    const buf = '{"diagnosis": "肺腺癌", "stage": "IV';
    const out = extractPartialOcrFields(buf);
    expect(out).toEqual({ diagnosis: '肺腺癌' });
  });

  test('null 值被识别', () => {
    const buf = '{"diagnosis": "肺腺癌", "pdl1": null';
    expect(extractPartialOcrFields(buf)).toEqual({ diagnosis: '肺腺癌', pdl1: null });
  });

  test('数字字段（age / treatmentLine / ecog）被识别', () => {
    const buf = '{"age": 65, "treatmentLine": 2, "ecog": 1';
    expect(extractPartialOcrFields(buf)).toEqual({ age: 65, treatmentLine: 2, ecog: 1 });
  });

  test('转义字符串被正确解码', () => {
    const buf = '{"diagnosis": "肺腺癌\\"病理"';
    expect(extractPartialOcrFields(buf)).toEqual({ diagnosis: '肺腺癌"病理' });
  });

  test('空 buffer / 太短 → null', () => {
    expect(extractPartialOcrFields('')).toBeNull();
    expect(extractPartialOcrFields(null)).toBeNull();
    expect(extractPartialOcrFields('{')).toBeNull();
  });

  test('无相关字段 → null（不返回空 object）', () => {
    const buf = '{"foo": "bar", "baz": "qux"}';
    expect(extractPartialOcrFields(buf)).toBeNull();
  });

  test('regex lastIndex 不污染（多次调用幂等）', () => {
    const buf = '{"diagnosis": "肺腺癌"}';
    const r1 = extractPartialOcrFields(buf);
    const r2 = extractPartialOcrFields(buf);
    expect(r1).toEqual(r2);
  });
});

describe('streamingChatJson', () => {
  const ORIGINAL_KEY = process.env.ARK_API_KEY;

  beforeAll(() => {
    process.env.ARK_API_KEY = 'test-key';
  });

  afterAll(() => {
    if (ORIGINAL_KEY === undefined) delete process.env.ARK_API_KEY;
    else process.env.ARK_API_KEY = ORIGINAL_KEY;
  });

  beforeEach(() => {
    axios.post.mockReset();
  });

  test('完整流式响应 → schema 通过 → 返回 parsed', async () => {
    // 构造一个 SSE 流：4 段 delta 拼出 {"diagnosis":"肺腺癌","stage":"IV期"}
    axios.post.mockResolvedValue({
      data: buildSseStream([
        sseFrame({ choices: [{ delta: { content: '{"diagnosis":' } }] }),
        sseFrame({ choices: [{ delta: { content: '"肺腺癌",' } }] }),
        sseFrame({ choices: [{ delta: { content: '"stage":"IV期"' } }] }),
        sseFrame({ choices: [{ delta: { content: '}' } }] }),
        sseDone()
      ])
    });

    const result = await streamingChatJson('doubao', [{ role: 'user', content: 'x' }], SimpleSchema);
    expect(result).toEqual({ diagnosis: '肺腺癌', stage: 'IV期' });
  });

  test('onFirstToken 在第一段 delta 时被调用一次（只一次）', async () => {
    axios.post.mockResolvedValue({
      data: buildSseStream([
        sseFrame({ choices: [{ delta: { content: '{"diagnosis":' } }] }),
        sseFrame({ choices: [{ delta: { content: '"肺腺癌","stage":"IV期"}' } }] }),
        sseDone()
      ])
    });
    const onFirstToken = jest.fn();
    await streamingChatJson('doubao', [{ role: 'user', content: 'x' }], SimpleSchema, { onFirstToken });
    expect(onFirstToken).toHaveBeenCalledTimes(1);
    expect(typeof onFirstToken.mock.calls[0][0]).toBe('number');
    expect(onFirstToken.mock.calls[0][0]).toBeGreaterThanOrEqual(0);
  });

  test('onPartial 在新字段出现时被调；同一字段不重复回调', async () => {
    axios.post.mockResolvedValue({
      data: buildSseStream([
        // 完整字段 1
        sseFrame({ choices: [{ delta: { content: '{"diagnosis":"肺腺癌",' } }] }),
        // 还没闭合 stage —— 不触发新回调
        sseFrame({ choices: [{ delta: { content: '"stage":"IV' } }] }),
        // 闭合 stage —— 触发新回调（keys 增到 2）
        sseFrame({ choices: [{ delta: { content: '期"}' } }] }),
        sseDone()
      ])
    });
    const onPartial = jest.fn();
    await streamingChatJson('doubao', [{ role: 'user', content: 'x' }], SimpleSchema, { onPartial });

    // 应至少被调一次（第一帧后），且至多两次（第一帧 + stage 闭合帧）
    expect(onPartial.mock.calls.length).toBeGreaterThanOrEqual(1);
    expect(onPartial.mock.calls.length).toBeLessThanOrEqual(2);
    // 最后一次必须包含 diagnosis + stage
    const last = onPartial.mock.calls[onPartial.mock.calls.length - 1][0];
    expect(last).toEqual({ diagnosis: '肺腺癌', stage: 'IV期' });
  });

  test('onPartial / onFirstToken 抛异常不影响主流（不冒泡）', async () => {
    axios.post.mockResolvedValue({
      data: buildSseStream([
        sseFrame({ choices: [{ delta: { content: '{"diagnosis":"肺腺癌","stage":"IV期"}' } }] }),
        sseDone()
      ])
    });
    const onFirstToken = jest.fn(() => { throw new Error('boom'); });
    const onPartial = jest.fn(() => { throw new Error('boom2'); });
    const result = await streamingChatJson('doubao', [{ role: 'user', content: 'x' }], SimpleSchema, {
      onFirstToken,
      onPartial
    });
    expect(result).toEqual({ diagnosis: '肺腺癌', stage: 'IV期' });
  });

  test('JSON 损坏（流提前结束）→ 抛 LlmSchemaError', async () => {
    axios.post.mockResolvedValue({
      data: buildSseStream([
        sseFrame({ choices: [{ delta: { content: '{"diagnosis":"肺腺癌"' } }] }),
        // 缺关闭花括号 + DONE
        sseDone()
      ])
    });
    await expect(streamingChatJson('doubao', [{ role: 'user', content: 'x' }], SimpleSchema))
      .rejects.toBeInstanceOf(LlmSchemaError);
  });

  test('schema 校验失败 → 抛 LlmSchemaError', async () => {
    axios.post.mockResolvedValue({
      data: buildSseStream([
        // schema 要求 diagnosis: string|null，这里写了 number 故意不通过
        sseFrame({ choices: [{ delta: { content: '{"diagnosis":42,"stage":"IV期"}' } }] }),
        sseDone()
      ])
    });
    await expect(streamingChatJson('doubao', [{ role: 'user', content: 'x' }], SimpleSchema))
      .rejects.toBeInstanceOf(LlmSchemaError);
  });

  test('provider 未配置 → 直接抛 provider_not_configured', async () => {
    const saved = process.env.KIMI_API_KEY;
    delete process.env.KIMI_API_KEY;
    await expect(streamingChatJson('kimi', [{ role: 'user', content: 'x' }], SimpleSchema))
      .rejects.toThrow(/provider_not_configured/);
    if (saved !== undefined) process.env.KIMI_API_KEY = saved;
  });

  test('schema 缺失/不带 safeParse → 直接抛', async () => {
    await expect(streamingChatJson('doubao', [{ role: 'user', content: 'x' }], null))
      .rejects.toThrow(/schema/);
    await expect(streamingChatJson('doubao', [{ role: 'user', content: 'x' }], {}))
      .rejects.toThrow(/schema/);
  });

  test('llm_first_token_seconds 指标在第一段 delta 时被 observe', async () => {
    const metrics = require('../middleware/metrics');
    metrics.__mockLabels.mockClear();
    axios.post.mockResolvedValue({
      data: buildSseStream([
        sseFrame({ choices: [{ delta: { content: '{"diagnosis":"肺腺癌","stage":"IV期"}' } }] }),
        sseDone()
      ])
    });
    await streamingChatJson('doubao', [{ role: 'user', content: 'x' }], SimpleSchema, { operation: 'ocr_image' });
    expect(metrics.__mockLabels).toHaveBeenCalledWith('doubao', expect.any(String), 'ocr_image');
  });

  test('单 chunk 多 SSE event（一次 data 内塞多个 frame）也能解析', async () => {
    const combined = sseFrame({ choices: [{ delta: { content: '{"diagnosis":' } }] })
      + sseFrame({ choices: [{ delta: { content: '"肺腺癌","stage":"IV期"}' } }] })
      + sseDone();
    axios.post.mockResolvedValue({
      data: buildSseStream([combined])
    });
    const result = await streamingChatJson('doubao', [{ role: 'user', content: 'x' }], SimpleSchema);
    expect(result).toEqual({ diagnosis: '肺腺癌', stage: 'IV期' });
  });

  test('chunk 切在 SSE frame 中间也能正确累积', async () => {
    // 把一个 frame 强行拆成两半（模拟 TCP 包碎片）
    const halfA = 'data: {"choices":[{"delta":{"content":"{\\"diag';
    const halfB = 'nosis\\":\\"肺腺癌\\",\\"stage\\":\\"IV期\\"}"}}]}\n\n' + sseDone();
    axios.post.mockResolvedValue({
      data: buildSseStream([halfA, halfB])
    });
    const result = await streamingChatJson('doubao', [{ role: 'user', content: 'x' }], SimpleSchema);
    expect(result).toEqual({ diagnosis: '肺腺癌', stage: 'IV期' });
  });
});
