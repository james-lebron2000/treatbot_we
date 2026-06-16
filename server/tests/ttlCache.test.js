/**
 * ttlCache.test.js — 进程内 TTL + LRU 缓存（匹配评分等纯计算结果缓存的底座）
 */
const { createTtlCache } = require('../utils/ttlCache');

describe('ttlCache', () => {
  let now;
  beforeEach(() => {
    now = 1000;
    jest.spyOn(Date, 'now').mockImplementation(() => now);
  });
  afterEach(() => {
    Date.now.mockRestore();
  });

  test('set 后 get 返回原值', () => {
    const c = createTtlCache(10);
    const v = { score: 88 };
    c.set('a', v, 1000);
    expect(c.get('a')).toBe(v);
  });

  test('未命中返回 undefined', () => {
    expect(createTtlCache().get('missing')).toBeUndefined();
  });

  test('超过 TTL 后过期', () => {
    const c = createTtlCache(10);
    c.set('a', 1, 500);
    now += 499;
    expect(c.get('a')).toBe(1); // 还没过期
    now += 2;
    expect(c.get('a')).toBeUndefined(); // 过期
    expect(c.size).toBe(0); // 过期项被清理
  });

  test('超过容量上限时淘汰最老项（FIFO/LRU）', () => {
    const c = createTtlCache(2);
    c.set('a', 1, 10000);
    c.set('b', 2, 10000);
    c.set('c', 3, 10000); // 触发淘汰最老的 a
    expect(c.get('a')).toBeUndefined();
    expect(c.get('b')).toBe(2);
    expect(c.get('c')).toBe(3);
    expect(c.size).toBe(2);
  });

  test('get 命中会刷新最近使用，使其免于被淘汰', () => {
    const c = createTtlCache(2);
    c.set('a', 1, 10000);
    c.set('b', 2, 10000);
    c.get('a'); // 触碰 a → a 变为最近使用
    c.set('c', 3, 10000); // 应淘汰最老的 b，而非 a
    expect(c.get('a')).toBe(1);
    expect(c.get('b')).toBeUndefined();
    expect(c.get('c')).toBe(3);
  });

  test('clear 清空缓存', () => {
    const c = createTtlCache();
    c.set('a', 1, 1000);
    c.clear();
    expect(c.get('a')).toBeUndefined();
    expect(c.size).toBe(0);
  });
});
