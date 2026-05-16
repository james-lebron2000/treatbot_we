const mockProcessMedicalImage = jest.fn();
const mockStreamChatJson = jest.fn();

jest.mock('../utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn()
}));

jest.mock('../services/ocr', () => ({
  processMedicalImage: (...args) => mockProcessMedicalImage(...args)
}));

jest.mock('../services/llmClientStream', () => ({
  streamChatJson: (...args) => mockStreamChatJson(...args)
}));

jest.mock('../services/promptRegistry', () => ({
  getPrompt: jest.fn(() => ({
    system: 'extract structured medical data',
    user: 'return json'
  }))
}));

const { runStreamingPipeline, __internals } = require('../services/ocrPipeline');

describe('ocrPipeline structured-stream timeout guard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('二次结构化关闭 chatJson fallback，失败后使用 OCR 已抽取 entities', async () => {
    mockProcessMedicalImage.mockResolvedValueOnce({
      text: '病理诊断：肺腺癌。基因：EGFR 19del。',
      provider: 'doubao-vision',
      entities: {
        diagnosis: '肺腺癌',
        geneMutation: 'EGFR 19del',
        confidence: 0.82
      }
    });
    mockStreamChatJson.mockRejectedValueOnce(new Error('stream timeout'));

    const emitted = [];
    const result = await runStreamingPipeline({
      source: { sourceUrl: 'https://example.test/file.jpg' },
      emit: (evt) => emitted.push(evt)
    });

    expect(mockStreamChatJson).toHaveBeenCalledWith(expect.objectContaining({
      opts: expect.objectContaining({
        timeoutMs: __internals.OCR_STRUCTURED_STREAM_TIMEOUT_MS,
        fallbackToChatJson: false,
        operation: 'ocr_structured_stream'
      })
    }));
    expect(result.entities.diagnosis).toBe('肺腺癌');
    expect(result.entities.geneMutation).toBe('EGFR 19del');
    expect(result.confidence).toBe(0.82);
    expect(emitted.some((evt) => evt.stage === 'field_group')).toBe(true);
  });
});
