jest.mock('../utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn()
}));

const recordEvents = require('../services/recordEvents');

describe('recordEvents Redis Stream replay', () => {
  afterEach(() => {
    recordEvents.__reset();
  });

  test('publishRecordEvent assigns monotonic seq, writes Redis Stream, then publishes live payload', async () => {
    const publisher = {
      incr: jest.fn().mockResolvedValue(12),
      xadd: jest.fn().mockResolvedValue('1716170000000-0'),
      publish: jest.fn().mockResolvedValue(1),
      disconnect: jest.fn()
    };
    recordEvents.__setTestables({ publisher });

    const ok = await recordEvents.publishRecordEvent('rec-1', {
      status: 'running',
      progress: 75,
      statusPhase: 'streaming'
    });

    expect(ok).toBe(true);
    expect(publisher.incr).toHaveBeenCalledWith('ocr:record:rec-1:seq');
    expect(publisher.xadd).toHaveBeenCalledWith(
      'ocr:record:rec-1:events',
      'MAXLEN',
      '~',
      expect.any(Number),
      '*',
      'seq',
      '12',
      'event',
      expect.any(String)
    );
    const payload = JSON.parse(publisher.publish.mock.calls[0][1]);
    expect(payload).toEqual(expect.objectContaining({
      recordId: 'rec-1',
      seq: 12,
      status: 'running',
      progress: 75,
      statusPhase: 'streaming'
    }));
  });

  test('publishRecordEvent waits for lazy Redis publisher before issuing commands', async () => {
    const handlers = {};
    const publisher = {
      status: 'wait',
      once: jest.fn((event, cb) => {
        handlers[event] = cb;
        return publisher;
      }),
      off: jest.fn(),
      connect: jest.fn(() => {
        publisher.status = 'ready';
        handlers.ready();
        return Promise.resolve();
      }),
      incr: jest.fn().mockResolvedValue(1),
      xadd: jest.fn().mockResolvedValue('1716170000000-0'),
      publish: jest.fn().mockResolvedValue(1),
      disconnect: jest.fn()
    };
    recordEvents.__setTestables({ publisher });

    const ok = await recordEvents.publishRecordEvent('rec-lazy', { status: 'queued' });

    expect(ok).toBe(true);
    expect(publisher.connect).toHaveBeenCalledTimes(1);
    expect(publisher.incr).toHaveBeenCalledWith('ocr:record:rec-lazy:seq');
  });

  test('subscribeRecordEvents waits for lazy Redis subscriber before subscribing', async () => {
    const handlers = {};
    const subscriber = {
      status: 'wait',
      once: jest.fn((event, cb) => {
        handlers[event] = cb;
        return subscriber;
      }),
      on: jest.fn(),
      off: jest.fn(),
      connect: jest.fn(() => {
        subscriber.status = 'ready';
        handlers.ready();
        return Promise.resolve();
      }),
      subscribe: jest.fn().mockResolvedValue(1),
      unsubscribe: jest.fn().mockResolvedValue(1),
      disconnect: jest.fn()
    };
    recordEvents.__setTestables({ subscriber });

    const unsubscribe = await recordEvents.subscribeRecordEvents(['rec-lazy'], jest.fn());

    expect(typeof unsubscribe).toBe('function');
    expect(subscriber.connect).toHaveBeenCalledTimes(1);
    expect(subscriber.subscribe).toHaveBeenCalledWith('ocr:record:rec-lazy');
    await unsubscribe();
  });

  test('subscribeRecordEvents rolls back listener from existing channels when a new channel subscribe fails', async () => {
    const subscriber = {
      subscribe: jest.fn()
        .mockResolvedValueOnce(1)
        .mockRejectedValueOnce(new Error('redis subscribe failed')),
      unsubscribe: jest.fn().mockResolvedValue(1),
      disconnect: jest.fn()
    };
    recordEvents.__setTestables({ subscriber });

    const keepAliveCb = jest.fn();
    const unsubscribeExisting = await recordEvents.subscribeRecordEvents(['already-live'], keepAliveCb);
    expect(typeof unsubscribeExisting).toBe('function');
    expect(recordEvents.__testables.listeners.get('already-live').has(keepAliveCb)).toBe(true);

    const failedCb = jest.fn();
    const failed = await recordEvents.subscribeRecordEvents(['already-live', 'new-channel'], failedCb);

    expect(failed).toBeNull();
    expect(recordEvents.__testables.listeners.get('already-live').has(keepAliveCb)).toBe(true);
    expect(recordEvents.__testables.listeners.get('already-live').has(failedCb)).toBe(false);
    expect(recordEvents.__testables.listeners.has('new-channel')).toBe(false);
    await unsubscribeExisting();
  });

  test('replayRecordEvents filters by business seq and ignores corrupt rows', async () => {
    const publisher = {
      xrange: jest.fn().mockResolvedValue([
        ['1-0', ['seq', '4', 'event', JSON.stringify({ recordId: 'rec-1', seq: 4, status: 'running' })]],
        ['2-0', ['seq', '5', 'event', '{bad-json']],
        ['3-0', ['seq', '6', 'event', JSON.stringify({ recordId: 'rec-1', seq: 6, status: 'completed' })]]
      ]),
      disconnect: jest.fn()
    };
    recordEvents.__setTestables({ publisher });

    const events = await recordEvents.replayRecordEvents('rec-1', 4);

    expect(publisher.xrange).toHaveBeenCalledWith('ocr:record:rec-1:events', '-', '+', 'COUNT', expect.any(Number));
    expect(events).toEqual([
      expect.objectContaining({ recordId: 'rec-1', seq: 6, status: 'completed' })
    ]);
  });
});
