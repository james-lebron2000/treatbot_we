/**
 * Q3-红线 §A.1.2：LLM JSON schema 校验 + chatJson 重试逻辑单测。
 * 覆盖：
 *   1) 合法 JSON 直接通过；
 *   2) 缺关键字段在重试两次后被拒（LlmSchemaError）；
 *   3) 多余字段经 passthrough 通过（warning 由 logger.warn 输出但不阻塞）；
 *   4) 第一次失败、第二次（temperature=0）成功 — 走重试通路。
 *
 * 不打真实 LLM：mock axios.post。
 */

jest.mock('axios');
const axios = require('axios');

const { OcrExtractionSchema } = require('../services/llmSchemas');
const { chatJson, LlmSchemaError } = require('../services/llmClient');

const buildResponse = (jsonObj) => ({
  data: {
    choices: [{ message: { content: JSON.stringify(jsonObj) } }]
  }
});

describe('llmSchemas + chatJson', () => {
  const ORIGINAL_KEY = process.env.KIMI_API_KEY;

  beforeAll(() => {
    process.env.KIMI_API_KEY = 'test-key';
  });

  afterAll(() => {
    if (ORIGINAL_KEY === undefined) delete process.env.KIMI_API_KEY;
    else process.env.KIMI_API_KEY = ORIGINAL_KEY;
  });

  beforeEach(() => {
    axios.post.mockReset();
  });

  test('合法 JSON 一次通过 schema 校验', async () => {
    const validPayload = {
      rawText: '诊断为肺腺癌',
      diagnosis: '肺腺癌',
      stage: 'IVA期',
      geneMutation: 'EGFR 19del',
      pdl1: 'TPS 80%',
      treatment: '铂类化疗',
      treatmentLine: 2,
      ecog: 1,
      age: 65,
      weight: null,
      height: null,
      comorbidities: ['脑转移'],
      priorTherapies: ['卡铂'],
      labValues: { ALT: { value: 35, unit: 'U/L' } },
      bloodCounts: {},
      fertilityStatus: null,
      confidence: 0.9
    };
    axios.post.mockResolvedValueOnce(buildResponse(validPayload));

    const result = await chatJson('kimi', [{ role: 'user', content: 'hi' }], OcrExtractionSchema);
    expect(result.diagnosis).toBe('肺腺癌');
    expect(result.comorbidities).toContain('脑转移');
    expect(axios.post).toHaveBeenCalledTimes(1);
  });

  test('多余字段被 passthrough 保留且不阻塞', async () => {
    const payloadWithExtras = {
      diagnosis: '胰腺癌',
      ecog: 2,
      // 模型自带的额外字段：reasoning、warnings 等
      reasoning: 'patient is elderly',
      warnings: ['low confidence on stage'],
      vendorMetadata: { source: 'kimi-vision' }
    };
    axios.post.mockResolvedValueOnce(buildResponse(payloadWithExtras));

    const result = await chatJson('kimi', [{ role: 'user', content: 'hi' }], OcrExtractionSchema);
    expect(result.diagnosis).toBe('胰腺癌');
    // passthrough：未声明字段保留
    expect(result.reasoning).toBe('patient is elderly');
    expect(result.warnings).toEqual(['low confidence on stage']);
    expect(axios.post).toHaveBeenCalledTimes(1);
  });

  test('字段类型错误时重试一次（temperature=0），第二次合法则通过', async () => {
    // 第一次：ecog 是字符串，违反 schema
    axios.post.mockResolvedValueOnce(buildResponse({ diagnosis: 'NSCLC', ecog: 'one' }));
    // 第二次：合法
    axios.post.mockResolvedValueOnce(buildResponse({ diagnosis: 'NSCLC', ecog: 1 }));

    const result = await chatJson('kimi', [{ role: 'user', content: 'hi' }], OcrExtractionSchema);
    expect(result.diagnosis).toBe('NSCLC');
    expect(result.ecog).toBe(1);
    expect(axios.post).toHaveBeenCalledTimes(2);
    // 第二次必须 temperature=0
    expect(axios.post.mock.calls[1][1].temperature).toBe(0);
  });

  test('两次都 schema 失败 → 抛 LlmSchemaError', async () => {
    axios.post.mockResolvedValueOnce(buildResponse({ ecog: 'bad' }));
    axios.post.mockResolvedValueOnce(buildResponse({ ecog: 'still-bad' }));

    await expect(
      chatJson('kimi', [{ role: 'user', content: 'hi' }], OcrExtractionSchema)
    ).rejects.toBeInstanceOf(LlmSchemaError);
    expect(axios.post).toHaveBeenCalledTimes(2);
  });

  test('返回非 JSON 字符串时也走重试，仍失败则抛 LlmSchemaError', async () => {
    axios.post.mockResolvedValueOnce({ data: { choices: [{ message: { content: 'not json' } }] } });
    axios.post.mockResolvedValueOnce({ data: { choices: [{ message: { content: 'still not json' } }] } });

    await expect(
      chatJson('kimi', [{ role: 'user', content: 'hi' }], OcrExtractionSchema)
    ).rejects.toBeInstanceOf(LlmSchemaError);
    expect(axios.post).toHaveBeenCalledTimes(2);
  });
});
