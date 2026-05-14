const { EventEmitter } = require('events');

const mockFindOne = jest.fn();

jest.mock('../models', () => ({
  MedicalRecord: {
    findOne: (...args) => mockFindOne(...args)
  },
  Trial: { findAll: jest.fn().mockResolvedValue([]) }
}));

jest.mock('../services/oss', () => ({
  calculateMD5: jest.fn(),
  getInternalUrl: jest.fn(),
  generateKey: jest.fn(),
  uploadFile: jest.fn(),
  getRequestAwareUrl: jest.fn(),
  getObjectBuffer: jest.fn()
}));

jest.mock('../services/queue', () => ({ addOCRTask: jest.fn() }));
jest.mock('../services/matchEngine', () => ({ scoreRecordAgainstTrial: () => ({ score: 0 }) }));
jest.mock('../services/funnelTracker', () => ({ EVENTS: {}, track: jest.fn() }));
jest.mock('../utils/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }));

const controller = require('../controllers/medical');
const ocrEvents = require('../services/ocrEvents');

const buildReq = (query = {}) => {
  const req = new EventEmitter();
  req.query = query;
  req.headers = {};
  req.userId = 'user_1';
  return req;
};

const buildRes = () => {
  const chunks = [];
  const headers = {};
  const res = {
    writableEnded: false,
    chunks,
    headers,
    status: jest.fn(() => res),
    setHeader: jest.fn((key, value) => { headers[key] = value; return res; }),
    flushHeaders: jest.fn(),
    write: jest.fn((chunk) => { chunks.push(String(chunk)); return true; }),
    end: jest.fn(() => { res.writableEnded = true; return res; })
  };
  return res;
};

describe('medical.streamParseStatus SSE', () => {
  beforeEach(() => {
    mockFindOne.mockReset();
    ocrEvents.__testables.clearForTest();
  });

  test('returns SSE not_found event for missing or unauthorized record', async () => {
    mockFindOne.mockResolvedValue(null);
    const req = buildReq({ fileId: 'rec_missing' });
    const res = buildRes();
    const next = jest.fn();

    await controller.streamParseStatus(req, res, next);

    expect(mockFindOne).toHaveBeenCalledWith({
      where: { id: 'rec_missing', user_id: 'user_1', deleted_at: null }
    });
    expect(res.headers['Content-Type']).toContain('text/event-stream');
    expect(res.chunks.join('')).toContain('event: not_found');
    expect(res.end).toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });

  test('sends completed DB snapshot and closes when no event history exists', async () => {
    mockFindOne.mockResolvedValue({
      id: 'rec_done',
      status: 'completed',
      diagnosis: '肺癌',
      stage: 'IV期',
      gene_mutation: 'EGFR',
      treatment: '化疗',
      structured: { confidence: 0.88, text: 'raw text' },
      created_at: new Date('2026-05-01T00:00:00Z'),
      updated_at: new Date('2026-05-01T00:01:00Z')
    });
    const req = buildReq({ fileId: 'rec_done' });
    const res = buildRes();

    await controller.streamParseStatus(req, res, jest.fn());

    const body = res.chunks.join('');
    expect(body).toContain('event: completed');
    expect(body).toContain('肺癌');
    expect(res.end).toHaveBeenCalled();
  });

  test('replays only history events after afterSeq', async () => {
    mockFindOne.mockResolvedValue({
      id: 'rec_hist',
      status: 'completed',
      structured: {},
      created_at: new Date(),
      updated_at: new Date()
    });
    ocrEvents.publish('rec_hist', { type: 'queued', status: 'queued', progress: 5 });
    ocrEvents.publish('rec_hist', { type: 'completed', status: 'completed', progress: 100, partialResult: { diagnosis: '胃癌' } });
    const req = buildReq({ fileId: 'rec_hist', afterSeq: '1' });
    const res = buildRes();

    await controller.streamParseStatus(req, res, jest.fn());

    const body = res.chunks.join('');
    expect(body).not.toContain('event: queued');
    expect(body).toContain('event: completed');
    expect(body).toContain('胃癌');
  });
});
