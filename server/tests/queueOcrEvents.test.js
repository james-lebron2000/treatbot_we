const mockProcessMedicalImage = jest.fn();
const mockUpdate = jest.fn();

jest.mock('bull', () => {
  return jest.fn().mockImplementation(() => ({
    process: jest.fn(),
    add: jest.fn(),
    on: jest.fn(),
    setMaxListeners: jest.fn(),
    settings: {}
  }));
});

jest.mock('../models', () => ({
  OcrJobFailure: {
    create: jest.fn(),
    findByPk: jest.fn()
  },
  MedicalRecord: {
    update: (...args) => mockUpdate(...args)
  }
}));

jest.mock('../services/ocr', () => ({
  processMedicalImage: (...args) => mockProcessMedicalImage(...args)
}));

jest.mock('../utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn()
}));

const ocrEvents = require('../services/ocrEvents');

describe('queue OCR event publishing', () => {
  beforeEach(() => {
    ocrEvents.__testables.clearForTest();
    mockProcessMedicalImage.mockReset();
    mockUpdate.mockReset().mockResolvedValue([1]);
  });

  test('runOcrTask publishes started, partial stage from OCR callback, and completed', async () => {
    const queue = require('../services/queue');
    mockProcessMedicalImage.mockImplementation(async ({ emitEvent }) => {
      emitEvent({ type: 'provider_attempt', status: 'running', progress: 45, stage: 'provider_doubao' });
      return {
        text: 'raw',
        provider: 'doubao',
        confidence: 0.91,
        entities: {
          diagnosis: '肺癌',
          stage: 'IV期',
          geneMutation: 'EGFR',
          treatment: '化疗'
        },
        detections: []
      };
    });

    await queue.__testables.runOcrTask({ recordId: 'rec_ok', imageUrl: 'https://x/a.png', userId: 'u1' }, { jobId: 'job_1' });

    const types = ocrEvents.getEventsAfter('rec_ok', 0).map((e) => e.type);
    expect(types).toEqual(expect.arrayContaining(['started', 'stage', 'provider_attempt', 'completed']));
    const completed = ocrEvents.getEventsAfter('rec_ok', 0).find((e) => e.type === 'completed');
    expect(completed.partialResult.diagnosis).toBe('肺癌');
    expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({ status: 'completed' }), expect.any(Object));
  });

  test('runOcrTask publishes failed after OCR error status write', async () => {
    const queue = require('../services/queue');
    mockProcessMedicalImage.mockRejectedValue(new Error('OCR timeout'));

    await expect(
      queue.__testables.runOcrTask({ recordId: 'rec_fail', imageUrl: 'https://x/a.png' }, { jobId: 'job_2' })
    ).rejects.toThrow('OCR timeout');

    const failed = ocrEvents.getEventsAfter('rec_fail', 0).find((e) => e.type === 'failed');
    expect(failed.errorMsg).toBe('OCR timeout');
    expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({ status: 'error' }), expect.any(Object));
  });
});
