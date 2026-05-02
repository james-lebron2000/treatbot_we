const mockProcess = jest.fn();

jest.mock('bull', () => {
  return jest.fn().mockImplementation(() => ({
    process: (...args) => mockProcess(...args),
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
    update: jest.fn().mockResolvedValue([1])
  }
}));

jest.mock('../services/ocr', () => ({
  processMedicalImage: jest.fn()
}));

describe('OCR queue concurrency', () => {
  const ORIGINAL_ENV = { ...process.env };

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    jest.resetModules();
    mockProcess.mockReset();
  });

  test('ocrQueue.process uses configurable concurrency instead of serial default', () => {
    process.env.OCR_QUEUE_CONCURRENCY = '3';

    const queueService = require('../services/queue');

    expect(queueService.__testables.OCR_QUEUE_CONCURRENCY).toBe(3);
    expect(mockProcess).toHaveBeenCalled();
    expect(mockProcess.mock.calls[0][0]).toBe(3);
    expect(typeof mockProcess.mock.calls[0][1]).toBe('function');
  });
});
