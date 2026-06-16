/**
 * ocrEventsCluster.test.js — PM2 cluster 下跨 worker 的 SSE 事件广播逻辑
 * （用测试注入的发布器 + handleRemoteMessage 模拟跨进程，不依赖真实 Redis）
 */
const ocrEvents = require('../services/ocrEvents');

describe('ocrEvents 跨 worker 广播', () => {
  beforeEach(() => ocrEvents.__testables.clearForTest());

  test('收到来自其它 worker 的事件会本地重放给订阅者', () => {
    const seen = [];
    ocrEvents.subscribe('rec_x', (e) => seen.push(e.type));
    ocrEvents.__testables.handleRemoteMessage(
      JSON.stringify({ recordId: 'rec_x', originId: 'OTHER_WORKER', event: { type: 'completed', status: 'completed' } })
    );
    expect(seen).toEqual(['completed']);
  });

  test('自己发出的消息（originId 相同）不会被重复重放', () => {
    const seen = [];
    ocrEvents.subscribe('rec_y', (e) => seen.push(e.type));
    ocrEvents.__testables.handleRemoteMessage(
      JSON.stringify({ recordId: 'rec_y', originId: ocrEvents.__testables.ORIGIN_ID, event: { type: 'stage' } })
    );
    expect(seen).toEqual([]);
  });

  test('坏消息被忽略，不抛错', () => {
    expect(() => ocrEvents.__testables.handleRemoteMessage('not-json')).not.toThrow();
    expect(() => ocrEvents.__testables.handleRemoteMessage(null)).not.toThrow();
  });

  test('publish 既本地立即投递又广播（载荷含 originId 与 recordId）', () => {
    const seenLocal = [];
    const broadcasts = [];
    ocrEvents.subscribe('rec_z', (e) => seenLocal.push(e.type));
    ocrEvents.__testables.setTestPublisher((payload) => broadcasts.push(JSON.parse(payload)));
    ocrEvents.publish('rec_z', { type: 'started', status: 'running', progress: 10 });
    expect(seenLocal).toEqual(['started']); // 原进程内行为保留
    expect(broadcasts).toHaveLength(1); // 同时广播给其它 worker
    expect(broadcasts[0].recordId).toBe('rec_z');
    expect(broadcasts[0].originId).toBe(ocrEvents.__testables.ORIGIN_ID);
    expect(broadcasts[0].event.type).toBe('started');
    expect(broadcasts[0].event.seq).toBe(1); // 广播的是带 seq 的完整事件
  });
});
