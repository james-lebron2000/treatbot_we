const ocrEvents = require('../services/ocrEvents');

describe('ocrEvents stream history', () => {
  beforeEach(() => {
    ocrEvents.__testables.clearForTest();
  });

  test('publish assigns monotonic seq and getEventsAfter replays later events', () => {
    const first = ocrEvents.publish('rec_1', { type: 'queued', status: 'queued', progress: 5 });
    const second = ocrEvents.publish('rec_1', { type: 'started', status: 'running', progress: 10 });
    const other = ocrEvents.publish('rec_2', { type: 'queued', status: 'queued' });

    expect(first.seq).toBe(1);
    expect(second.seq).toBe(2);
    expect(other.seq).toBe(1);
    expect(ocrEvents.getEventsAfter('rec_1', 1).map((e) => e.type)).toEqual(['started']);
  });

  test('subscribe receives events and unsubscribe stops delivery', () => {
    const seen = [];
    const unsubscribe = ocrEvents.subscribe('rec_1', (event) => seen.push(event.type));

    ocrEvents.publish('rec_1', { type: 'queued' });
    unsubscribe();
    ocrEvents.publish('rec_1', { type: 'started' });

    expect(seen).toEqual(['queued']);
  });

  test('buildSnapshotEvent maps completed and failed records to terminal events', () => {
    const completed = ocrEvents.buildSnapshotEvent(
      { status: 'completed', structured: { confidence: 0.8, text: 'abc' } },
      () => ({ status: 'completed', progress: 100, result: { diagnosis: '肺癌' } })
    );
    const failed = ocrEvents.buildSnapshotEvent(
      { status: 'error', structured: { error: 'boom' } },
      () => ({ status: 'error', progress: 0, errorMsg: 'boom' })
    );

    expect(completed.type).toBe('completed');
    expect(completed.partialResult.diagnosis).toBe('肺癌');
    expect(failed.type).toBe('failed');
    expect(failed.errorMsg).toBe('boom');
  });
});
