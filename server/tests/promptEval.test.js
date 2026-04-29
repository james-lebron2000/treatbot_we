/**
 * Q3-红线 §B.1：Prompt Registry 三件套（ocr-pdf / ocr-text / ocr-image）契约测试 +
 * 「模拟 OCR extraction」轻量评测，把字段命中率/缺失率/风险词出现率落到
 *  server/tests/__output__/prompt-eval-report.json，供 nightly job 抓取留痕。
 *
 * 强约束：
 *  - 不依赖任何网络 / DB / Redis；llmClient.chatJson 全部 mock。
 *  - 不真正调用 services/ocr.js 内部的 fallback 链（以免触发 Sentry / 队列 require 副作用）；
 *    我们走 promptRegistry + 手搓的 chatJson 包装，等价于"调用方组装 messages 后交给 llmClient"。
 */

// 屏蔽 sentry / logger 噪音
jest.mock('../observability/sentry', () => ({
  captureException: jest.fn(),
  isEnabled: () => false
}));

// mock llmClient.chatJson —— 让它返回一个固定但符合 OcrExtractionSchema 形状的 JSON
const mockChatJson = jest.fn();
jest.mock('../services/llmClient', () => ({
  chatJson: (...args) => mockChatJson(...args),
  LlmSchemaError: class LlmSchemaError extends Error {}
}));

const fs = require('fs');
const path = require('path');
const { getPrompt, __internals } = require('../services/promptRegistry');
const { OcrExtractionSchema } = require('../services/llmSchemas');
const { chatJson } = require('../services/llmClient');
const golden = require('./fixtures/golden-matches.json');

const OUTPUT_DIR = path.join(__dirname, '__output__');
const REPORT_PATH = path.join(OUTPUT_DIR, 'prompt-eval-report.json');

const RISK_WORDS = ['晚期', '转移', '末期', '不治', '绝症'];

const buildFixedExtraction = (patient) => ({
  rawText: patient?.description || '',
  diagnosis: patient?.record?.diagnosis || null,
  stage: patient?.record?.stage || null,
  geneMutation: patient?.record?.gene_mutation || null,
  pdl1: patient?.record?.pdl1 || null,
  treatment: patient?.record?.treatment || null,
  treatmentLine: patient?.record?.treatment_line ?? null,
  ecog: patient?.record?.structured?.entities?.ecog ?? null,
  age: patient?.record?.age ?? null,
  weight: null,
  height: null,
  comorbidities: [],
  priorTherapies: [],
  labValues: {},
  bloodCounts: {},
  fertilityStatus: null,
  confidence: 0.85
});

describe('promptEval §B.1', () => {
  beforeEach(() => {
    mockChatJson.mockReset();
    __internals._resetCache();
  });

  test('1) ocr-pdf prompt — system + user 非空，{{extractedText}} 已替换', () => {
    const { system, user } = getPrompt('ocr-pdf', 'v1', { extractedText: '<患者主诉>胰腺导管腺癌 IV 期' });
    expect(system).toBeTruthy();
    expect(user).toBeTruthy();
    // 占位符必须全部消失（{{ 不再出现）
    expect(user.indexOf('{{')).toBe(-1);
    expect(system.indexOf('{{')).toBe(-1);
    // 注入的内容应当出现在 user 里
    expect(user).toContain('胰腺导管腺癌');
  });

  test('2) ocr-text prompt — {{scrubbedText}} 已替换', () => {
    const { system, user } = getPrompt('ocr-text', 'v1', { scrubbedText: '非小细胞肺癌 EGFR 19del' });
    expect(system.length).toBeGreaterThan(0);
    expect(user.length).toBeGreaterThan(0);
    expect(user.indexOf('{{')).toBe(-1);
    expect(user).toContain('EGFR 19del');
  });

  test('3) match-explain prompt — patientSummary / trialName / reasonsList 全部替换', () => {
    const { system, user } = getPrompt('match-explain', 'v1', {
      patientSummary: '55 岁男性，肺腺癌 IV 期，EGFR L858R',
      trialName: 'ABC-2026 临床试验',
      reasonsList: '诊断匹配\nECOG 体能符合'
    });
    expect(system).toBeTruthy();
    expect(user).toBeTruthy();
    expect(user.indexOf('{{')).toBe(-1);
    expect(user).toContain('ABC-2026');
    expect(user).toContain('诊断匹配');
  });

  test('4) 模拟 OCR extraction —— 6 个 golden 患者跑通 chatJson mock，落评测报告', async () => {
    const patients = (golden.patients || []).slice(0, 6);
    expect(patients.length).toBeGreaterThanOrEqual(1);

    let extractionHits = 0;
    let extractionTotal = 0;
    let missingTotal = 0;
    let riskWordOccurrence = 0;
    const extractionFields = ['diagnosis', 'stage', 'geneMutation', 'treatment', 'pdl1', 'ecog'];

    for (const p of patients) {
      // 让 mock 按当前 patient 返回 schema-shaped JSON
      const fixedReturn = buildFixedExtraction(p);
      mockChatJson.mockResolvedValueOnce(fixedReturn);

      // 组装 messages —— 调用方典型用法：promptRegistry → llmClient.chatJson
      const { system, user } = getPrompt('ocr-text', 'v1', {
        scrubbedText: p?.description || ''
      });
      const messages = [
        { role: 'system', content: system },
        { role: 'user', content: user }
      ];

      const result = await chatJson('kimi', messages, OcrExtractionSchema);

      // 断言 chatJson 被以「含 system + user」的 messages 调用
      expect(mockChatJson).toHaveBeenCalled();
      const lastCall = mockChatJson.mock.calls[mockChatJson.mock.calls.length - 1];
      const calledMessages = lastCall[1];
      expect(Array.isArray(calledMessages)).toBe(true);
      expect(calledMessages.find((m) => m.role === 'system')).toBeTruthy();
      expect(calledMessages.find((m) => m.role === 'user')).toBeTruthy();
      // user prompt 不应残留 {{ 占位符
      const userContent = calledMessages.find((m) => m.role === 'user').content;
      expect(userContent.indexOf('{{')).toBe(-1);

      // 三维度统计
      for (const f of extractionFields) {
        extractionTotal += 1;
        const v = result?.[f];
        if (v == null || v === '' ) {
          missingTotal += 1;
        } else {
          extractionHits += 1;
        }
      }
      const text = `${result.rawText || ''} ${result.diagnosis || ''} ${result.stage || ''}`;
      for (const w of RISK_WORDS) {
        if (text.includes(w)) riskWordOccurrence += 1;
      }
    }

    const report = {
      generatedAt: new Date().toISOString(),
      totalCases: patients.length,
      extractionHitRate: extractionTotal > 0
        ? Number((extractionHits / extractionTotal).toFixed(4))
        : 0,
      missingFieldRate: extractionTotal > 0
        ? Number((missingTotal / extractionTotal).toFixed(4))
        : 0,
      riskWordOccurrence
    };

    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2), 'utf8');

    // sanity check 报告文件 + 结构
    const onDisk = JSON.parse(fs.readFileSync(REPORT_PATH, 'utf8'));
    expect(onDisk.totalCases).toBe(patients.length);
    expect(typeof onDisk.extractionHitRate).toBe('number');
    expect(typeof onDisk.missingFieldRate).toBe('number');
    expect(typeof onDisk.riskWordOccurrence).toBe('number');
  });
});
