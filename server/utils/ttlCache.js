/**
 * 进程内 TTL 缓存（带容量上限的 LRU 淘汰）。
 *
 * 适用场景：缓存「由输入完全决定」的纯计算结果——key 必须包含所有输入的指纹，
 * 这样就不存在脏读（任何输入变化 → key 变化 → 自然 miss）。TTL 仅用于兜底回收内存，
 * 不承担正确性职责。集群（PM2 cluster）下每个 worker 各自持有一份，命中即省一次计算，
 * 无需跨 worker 共享（这是性能缓存，不是真理源）。
 *
 * 典型用法：匹配评分结果缓存（翻页 / 重复请求免重复评分）。
 */

const createTtlCache = (max = 500) => {
  // Map 保持插入顺序：每次 get 命中后 delete+set 把它移到末尾，size 超限时淘汰最老的（队首）。
  const map = new Map();
  const limit = Number.isFinite(max) && max > 0 ? Math.floor(max) : 500;

  return {
    get(key) {
      const hit = map.get(key);
      if (!hit) return undefined;
      if (hit.expiresAt <= Date.now()) {
        map.delete(key);
        return undefined;
      }
      // LRU touch
      map.delete(key);
      map.set(key, hit);
      return hit.value;
    },

    set(key, value, ttlMs) {
      const ttl = Number.isFinite(ttlMs) && ttlMs > 0 ? ttlMs : 60000;
      if (map.has(key)) map.delete(key);
      map.set(key, { value, expiresAt: Date.now() + ttl });
      while (map.size > limit) {
        const oldest = map.keys().next().value;
        map.delete(oldest);
      }
    },

    delete(key) {
      return map.delete(key);
    },

    clear() {
      map.clear();
    },

    get size() {
      return map.size;
    }
  };
};

module.exports = { createTtlCache };
