/**
 * Wave 2 §F4：快路径单元测试。
 *
 * 视觉 LLM 已经返回 entities + rawText 后，如果核心字段非空，runStreamingPipeline 应该：
 *   - 跳过 streamChatJson（省 20–45s LLM 调用）
 *   - 直接按 RENDERABLE_GROUPS 顺序 emit 4 个 field_group 事件
 *   - 返回值携带 entities/rawText/provider
 *
 * 关键场景：
 *   1) 核心字段齐 + 默认 OCR_SKIP_SECOND_LLM=1 → fast path
 *   2) 核心字段全空 → 仍走 streamChatJson
 *   3) OCR_SKIP_SECOND_LLM=0（运维灰度回退）→ 走 streamChatJson 即使字段齐
 */

const mockProcessMedicalImage = jest.fn();
const mockStreamChatJson = jest.fn();

jest.mock('../utils/logger', () => ({
  info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn()
}));
jest.mock('../services/ocr', () => ({
  processMedicalImage: (...args) => mockProcessMedicalImage(...args)
}));
jest.mock('../services/llmClientStream', () => ({
  streamChatJson: (...args) => mockStreamChatJson(...args)
}));
jest.mock('../services/promptRegistry', () => ({
  getPrompt: jest.fn(() => ({ system: 'extract', user: 'return json' }))
}));

describe('ocrPipeline §F4 fast path', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetModules();
    delete process.env.OCR_SKIP_SECOND_LLM;
  });

  test('核心字段齐 + 默认开启 → 跳过 streamChatJson，按组 emit field_group', async () => {
    mockProcessMedicalImage.mockResolvedValueOnce({
      text: '诊断：肺腺癌。EGFR 19del 阳性。一线吉非替尼。',
      provider: 'doubao-vision',
      entities: {
        diagnosis: '肺腺癌',
        geneMutation: 'EGFR 19del',
        treatment: '吉非替尼',
        stage: 'IV',
        confidence: 0.88
      }
    });

    const { runStreamingPipeline } = require('../services/ocrPipeline');
    const emitted = [];
    const result = await runStreamingPipeline({
      source: { sourceUrl: 'https://x/y.jpg' },
      emit: (evt) => emitted.push(evt)
    });

    expect(mockStreamChatJson).not.toHaveBeenCalled();
    expect(result.entities.diagnosis).toBe('肺腺癌');
    expect(result.entities.geneMutation).toBe('EGFR 19del');
    expect(result.provider).toBe('doubao-vision');
    expect(result.text).toContain('诊断');
    // 4 个 RENDERABLE_GROUPS 都应该 emit
    const fieldGroupEmits = emitted.filter((e) => e.stage === 'field_group');
    expect(fieldGroupEmits.length).toBeGreaterThanOrEqual(4);
  });

  test('核心字段全空 → fast path 不触发，仍调 streamChatJson', async () => {
    mockProcessMedicalImage.mockResolvedValueOnce({
      text: '只有一些无关紧要的文字',
      provider: 'doubao-vision',
      entities: { diagnosis: null, stage: null, geneMutation: null, treatment: null }
    });
    mockStreamChatJson.mockResolvedValueOnce({
      rawText: '只有一些无关紧要的文字',
      diagnosis: null, stage: null, geneMutation: null, pdl1: null,
      treatment: null, treatmentLine: null, ecog: null, age: null,
      weight: null, height: null, comorbidities: [], priorTherapies: [],
      labValues: {}, bloodCounts: {}, fertilityStatus: null, confidence: 0.3,
      tnmStage: null, pathologyType: null, sex: null, hospital: null,
      diagnosisDate: null, metastasisSites: [], surgicalHistory: [],
      timeline: [], molecular: {}, organoidDrugSensitivity: {},
      imaging: [], tumorMarkers: [], treatmentHistory: []
    });

    const { runStreamingPipeline } = require('../services/ocrPipeline');
    await runStreamingPipeline({
      source: { sourceUrl: 'https://x/y.jpg' },
      emit: () => {}
    });

    expect(mockStreamChatJson).toHaveBeenCalledTimes(1);
  });

  test('OCR_SKIP_SECOND_LLM=0 → fast path 被运维关闭，即使核心字段齐也走 streamChatJson', async () => {
    process.env.OCR_SKIP_SECOND_LLM = '0';
    mockProcessMedicalImage.mockResolvedValueOnce({
      text: '诊断：肺腺癌',
      provider: 'doubao-vision',
      entities: { diagnosis: '肺腺癌', confidence: 0.9 }
    });
    mockStreamChatJson.mockResolvedValueOnce({
      rawText: '诊断：肺腺癌',
      diagnosis: '肺腺癌', stage: null, geneMutation: null, pdl1: null,
      treatment: null, treatmentLine: null, ecog: null, age: null,
      weight: null, height: null, comorbidities: [], priorTherapies: [],
      labValues: {}, bloodCounts: {}, fertilityStatus: null, confidence: 0.9,
      tnmStage: null, pathologyType: null, sex: null, hospital: null,
      diagnosisDate: null, metastasisSites: [], surgicalHistory: [],
      timeline: [], molecular: {}, organoidDrugSensitivity: {},
      imaging: [], tumorMarkers: [], treatmentHistory: []
    });

    const { runStreamingPipeline } = require('../services/ocrPipeline');
    await runStreamingPipeline({
      source: { sourceUrl: 'https://x/y.jpg' },
      emit: () => {}
    });

    expect(mockStreamChatJson).toHaveBeenCalledTimes(1);
  });
});
