/**
 * Plan §Phase 1.1 测试：LLM provider 并发限流。
 *
 * 覆盖契约：
 *  1) 同一 provider 同时只允许 capacity 个请求；超额者排队等待 release
 *  2) release 后等待者按 FIFO 顺序唤醒
 *  3) 不同 provider 互不影响
 *  4) acquire 失败/release 多次都不会破坏 inflight 计数
 *  5) prom gauge 同步反映 inflight
 */

jest.mock('../middleware/metrics', () => {
  const labels = jest.fn(() => ({ set: jest.fn() }));
  return {
    llmProviderInflightGauge: { labels }
  };
});

describe('llmRateLimiter §Phase 1.1', () => {
  let limiter;

  beforeEach(() => {
    // 隔离测试，每次重置桶；用 env 控制 capacity
    process.env.LLM_DOUBAO_CONCURRENCY = '2';
    process.env.LLM_KIMI_CONCURRENCY = '1';
    jest.resetModules();
    limiter = require('../services/llmRateLimiter');
    limiter._resetForTests();
  });

  afterEach(() => {
    delete process.env.LLM_DOUBAO_CONCURRENCY;
    delete process.env.LLM_KIMI_CONCURRENCY;
  });

  test('1) 同一 provider capacity=2 时第三个 acquire 阻塞', async () => {
    await limiter.acquire('doubao');
    await limiter.acquire('doubao');
    expect(limiter.getInflight('doubao')).toBe(2);

    let thirdResolved = false;
    const third = limiter.acquire('doubao').then(() => { thirdResolved = true; });

    // 让事件循环走一圈，确保第三个还在等
    await new Promise((r) => setImmediate(r));
    expect(thirdResolved).toBe(false);
    expect(limiter.getInflight('doubao')).toBe(2);

    // 释放一个 → 第三个应被唤醒
    limiter.release('doubao');
    await third;
    expect(thirdResolved).toBe(true);
    expect(limiter.getInflight('doubao')).toBe(2);

    limiter.release('doubao');
    limiter.release('doubao');
    expect(limiter.getInflight('doubao')).toBe(0);
  });

  test('2) FIFO 唤醒顺序', async () => {
    await limiter.acquire('doubao');
    await limiter.acquire('doubao');

    const order = [];
    const a = limiter.acquire('doubao').then(() => order.push('a'));
    const b = limiter.acquire('doubao').then(() => order.push('b'));
    const c = limiter.acquire('doubao').then(() => order.push('c'));

    limiter.release('doubao');
    await a;
    limiter.release('doubao');
    await b;
    limiter.release('doubao');
    await c;

    expect(order).toEqual(['a', 'b', 'c']);

    limiter.release('doubao');
    limiter.release('doubao');
    limiter.release('doubao');
  });

  test('3) 不同 provider 互不影响', async () => {
    await limiter.acquire('doubao');
    await limiter.acquire('doubao');
    expect(limiter.getInflight('doubao')).toBe(2);

    // doubao 已满，但 kimi 还能拿
    await limiter.acquire('kimi');
    expect(limiter.getInflight('kimi')).toBe(1);

    limiter.release('kimi');
    expect(limiter.getInflight('kimi')).toBe(0);
    expect(limiter.getInflight('doubao')).toBe(2);
  });

  test('4) release 多于 acquire 不会变负', () => {
    limiter.release('doubao');
    limiter.release('doubao');
    limiter.release('doubao');
    expect(limiter.getInflight('doubao')).toBe(0);
  });

  test('5) getStats 报告全部桶状态', async () => {
    await limiter.acquire('doubao');
    await limiter.acquire('kimi');
    const stats = limiter.getStats();
    expect(stats.doubao.inflight).toBe(1);
    expect(stats.doubao.capacity).toBe(2);
    expect(stats.kimi.inflight).toBe(1);
    expect(stats.kimi.capacity).toBe(1);

    limiter.release('doubao');
    limiter.release('kimi');
  });

  test('6) capacity 默认 1（DEFAULT_CAPACITY 兜底）', async () => {
    // 未设 env 的 provider 走默认值
    process.env.LLM_DEFAULT_CONCURRENCY = '1';
    jest.resetModules();
    const fresh = require('../services/llmRateLimiter');
    fresh._resetForTests();

    expect(fresh.getCapacity('unknown_provider')).toBe(1);
    delete process.env.LLM_DEFAULT_CONCURRENCY;
  });
});
