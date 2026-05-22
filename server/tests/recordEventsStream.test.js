const recordEvents = require('../services/recordEvents');

jest.mock('../utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn()
}));

describe('recordEvents Redis Stream replay contract', () => {
  afterEach(() => {
    recordEvents.__reset();
    jest.clearAllMocks();
  });

  test('publishRecordEvent writes monotonic seq, Redis Stream, ttl, and pub/sub payload', async () => {
    const publisher = {
      incr: jest.fn().mockResolvedValue(7),
      xadd: jest.fn().mockResolvedValue('1-0'),
      expire: jest.fn().mockResolvedValue(1),
      publish: jest.fn().mockResolvedValue(1)
    };
    recordEvents.__setTestables({ publisher });

    await expect(recordEvents.publishRecordEvent('rec-1', {
      status: 'running',
      progress: 55
    })).resolves.toBe(true);

    expect(publisher.incr).toHaveBeenCalledWith('ocr:record:rec-1:seq');
    expect(publisher.xadd).toHaveBeenCalledWith(
      'ocr:record:rec-1:events',
      'MAXLEN',
      '~',
      expect.any(Number),
      '*',
      'payload',
      expect.any(String)
    );
    expect(publisher.expire).toHaveBeenCalledWith('ocr:record:rec-1:events', expect.any(Number));
    expect(publisher.expire).toHaveBeenCalledWith('ocr:record:rec-1:seq', expect.any(Number));

    const published = JSON.parse(publisher.publish.mock.calls[0][1]);
    expect(published).toEqual(expect.objectContaining({
      recordId: 'rec-1',
      seq: 7,
      status: 'running',
      progress: 55
    }));
  });

  test('replayRecordEvents filters by business seq', async () => {
    const publisher = {
      connect: jest.fn().mockResolvedValue(undefined),
      on: jest.fn(),
      xrange: jest.fn().mockResolvedValue([
        ['1-0', ['payload', JSON.stringify({ recordId: 'rec-1', seq: 1, status: 'running' })]],
        ['2-0', ['payload', JSON.stringify({ recordId: 'rec-1', seq: 2, status: 'completed' })]]
      ])
    };
    recordEvents.__setTestables({ publisher });

    const replayed = await recordEvents.replayRecordEvents('rec-1', 1);

    expect(publisher.xrange).toHaveBeenCalledWith(
      'ocr:record:rec-1:events',
      '-',
      '+',
      'COUNT',
      expect.any(Number)
    );
    expect(replayed).toHaveLength(1);
    expect(replayed[0]).toEqual(expect.objectContaining({ seq: 2, status: 'completed' }));
  });
});
