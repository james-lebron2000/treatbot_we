/**
 * PRD-2026Q4 T0-10：转化漏斗埋点 tracker 测试。
 *
 * 覆盖点：
 *  - 8 个事件枚举每个一条单测，断言 dedupe_key 正确（按分钟粒度）
 *  - 重复 track 同 (event, user, entity, 分钟) → 仅 1 条入库（验证 ignoreDuplicates 透传）
 *  - track 失败不抛错（mock 抛 throw，断言不阻塞调用方）
 *  - dummy worker 跑 processJob 后 funnel_event_total 计数 +1
 *
 * mock 策略：
 *  - models.FunnelEvent.create 用 jest.fn 替换
 *  - Bull 队列用 _setQueue 注入 stub，不依赖 Redis
 *  - middleware/metrics 部分替换，保留 register 等其它导出
 */

jest.mock('../utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn()
}));

const mockCreate = jest.fn().mockResolvedValue({ id: 1 });
jest.mock('../models', () => ({
  FunnelEvent: { create: (...args) => mockCreate(...args) }
}));

const mockTotalInc = jest.fn();
const mockTotalLabels = jest.fn(() => ({ inc: mockTotalInc }));
const mockLagObserve = jest.fn();
const mockDropInc = jest.fn();
const mockDropLabels = jest.fn(() => ({ inc: mockDropInc }));
jest.mock('../middleware/metrics', () => {
  const actual = jest.requireActual('../middleware/metrics');
  return {
    ...actual,
    funnelEventTotal: { labels: (...args) => mockTotalLabels(...args) },
    funnelEventLagSeconds: { observe: (...args) => mockLagObserve(...args) },
    funnelEventDropTotal: { labels: (...args) => mockDropLabels(...args) }
  };
});

const funnelTracker = require('../services/funnelTracker');
const { EVENTS, track, buildDedupeKey, __testables, _setQueue, _resetForTests } = funnelTracker;

// 简单 stub：捕获 add 调用 + 暴露最近一次 data，便于断言；可注入 add 抛错。
const buildStubQueue = (overrides = {}) => {
  const adds = [];
  const stub = {
    add: jest.fn(async (data) => {
      adds.push(data);
      if (overrides.addThrows) throw new Error(overrides.addThrows);
      return { id: `job_${adds.length}` };
    }),
    process: jest.fn(),
    on: jest.fn()
  };
  stub._adds = adds;
  return stub;
};

describe('funnelTracker §T0-10', () => {
  beforeEach(() => {
    mockCreate.mockClear();
    mockTotalLabels.mockClear();
    mockTotalInc.mockClear();
    mockLagObserve.mockClear();
    mockDropLabels.mockClear();
    mockDropInc.mockClear();
    _resetForTests();
  });

  describe('1) 8 事件枚举每个 dedupe_key 正确（按分钟粒度）', () => {
    const cases = Object.entries(EVENTS);

    test.each(cases)('event=%s → dedupe_key 形如 event:user:entity:minute', (constName, eventValue) => {
      const stub = buildStubQueue();
      _setQueue(stub);

      const occurredAt = new Date('2026-05-04T10:23:45.678Z');
      track(eventValue, {
        user_id: 'user_1',
        entity_id: 'ent_1',
        payload: { foo: 'bar' },
        occurred_at: occurredAt
      });

      // 同步入队应当已发生（add 是 async 但 push 在 await 前）
      expect(stub.add).toHaveBeenCalledTimes(1);
      const data = stub._adds[0];
      expect(data.event_name).toBe(eventValue);
      expect(data.user_id).toBe('user_1');
      expect(data.entity_id).toBe('ent_1');
      expect(data.payload).toEqual({ foo: 'bar' });
      // 分钟粒度：秒位被抹零 → 10:23:00
      expect(data.dedupe_key).toBe(
        `${eventValue}:user_1:ent_1:2026-05-04T10:23:00.000Z`
      );
      // 同步生成的 dedupe_key 与 buildDedupeKey 应当一致（契约自检）
      expect(data.dedupe_key).toBe(
        buildDedupeKey(eventValue, 'user_1', 'ent_1', occurredAt)
      );
    });
  });

  test('2) 同分钟内重复 track 同 (event,user,entity) → dedupe_key 一致；create 用 ignoreDuplicates', async () => {
    const stub = buildStubQueue();
    _setQueue(stub);

    const t1 = new Date('2026-05-04T10:23:00.000Z');
    const t2 = new Date('2026-05-04T10:23:59.999Z'); // 同一分钟
    track(EVENTS.MEDICAL_UPLOADED, { user_id: 'u', entity_id: 'r', occurred_at: t1 });
    track(EVENTS.MEDICAL_UPLOADED, { user_id: 'u', entity_id: 'r', occurred_at: t2 });

    expect(stub._adds).toHaveLength(2);
    expect(stub._adds[0].dedupe_key).toBe(stub._adds[1].dedupe_key);

    // 模拟 worker 处理两条 job：第一条成功落库，第二条命中 UNIQUE → ignoreDuplicates
    // 实际 sequelize ignoreDuplicates 行为由 DB 兜底，这里只断言 worker 始终带这个 flag。
    await __testables.processJob({ data: stub._adds[0] });
    await __testables.processJob({ data: stub._adds[1] });

    expect(mockCreate).toHaveBeenCalledTimes(2);
    for (const callArgs of mockCreate.mock.calls) {
      expect(callArgs[1]).toEqual({ ignoreDuplicates: true });
    }
  });

  test('3) Bull add 抛错 → track 不抛，drop counter inc(reason=enqueue_failed)', () => {
    const stub = buildStubQueue({ addThrows: 'redis_down' });
    _setQueue(stub);

    expect(() => {
      track(EVENTS.APPLICATION_SUBMITTED, { user_id: 'u', entity_id: 'app_1' });
    }).not.toThrow();

    // add 是 async；其错误通过 .catch 走到 drop 计数
    return new Promise((resolve) => setImmediate(() => {
      expect(mockDropLabels).toHaveBeenCalledWith('enqueue_failed');
      expect(mockDropInc).toHaveBeenCalledTimes(1);
      resolve();
    }));
  });

  test('4) 队列不可用（_queue=null 且 init 失败）→ track 不抛，drop counter inc', () => {
    // 注入 null 模拟 init 失败的状态
    _setQueue(null);
    // 同时把 init 的 tried 旗标拨到已尝试，避免又走 require('bull')
    funnelTracker._setQueue(null);

    expect(() => {
      track(EVENTS.CRO_CONTACTED, { user_id: 'u', entity_id: 'app_1' });
    }).not.toThrow();

    expect(mockDropLabels).toHaveBeenCalledWith('enqueue_failed');
    expect(mockDropInc).toHaveBeenCalledTimes(1);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  test('5) 非法事件名直接丢弃，不入队、不计数', () => {
    const stub = buildStubQueue();
    _setQueue(stub);

    track('not_a_real_event', { user_id: 'u', entity_id: 'x' });

    expect(stub.add).not.toHaveBeenCalled();
    expect(mockDropLabels).not.toHaveBeenCalled();
  });

  test('6) processJob 成功：funnel_event_total inc 一次，lag observe 一次', async () => {
    const occurredAt = new Date(Date.now() - 1500); // 1.5s 前发生
    await __testables.processJob({
      data: {
        event_name: EVENTS.ENROLLED,
        user_id: 'u',
        entity_id: 'app_1',
        payload: null,
        occurred_at: occurredAt,
        dedupe_key: 'k'
      }
    });

    expect(mockCreate).toHaveBeenCalledTimes(1);
    expect(mockTotalLabels).toHaveBeenCalledWith(EVENTS.ENROLLED);
    expect(mockTotalInc).toHaveBeenCalledTimes(1);
    expect(mockLagObserve).toHaveBeenCalledTimes(1);
    const lag = mockLagObserve.mock.calls[0][0];
    // 应该在 1.5s 附近，给宽容上界 60s 防止 CI 慢机抖动
    expect(lag).toBeGreaterThanOrEqual(1);
    expect(lag).toBeLessThan(60);
  });

  test('7) processJob 落库失败：drop(reason=persist_failed) inc 且抛错（让 Bull attempts 重试）', async () => {
    mockCreate.mockRejectedValueOnce(new Error('db_down'));

    await expect(__testables.processJob({
      data: {
        event_name: EVENTS.MATCH_SHOWN,
        user_id: 'u',
        entity_id: 't_1',
        payload: null,
        occurred_at: new Date(),
        dedupe_key: 'k2'
      }
    })).rejects.toThrow('db_down');

    expect(mockDropLabels).toHaveBeenCalledWith('persist_failed');
    expect(mockDropInc).toHaveBeenCalledTimes(1);
  });

  test('8) handleJobFailed 仅在 attempts 耗尽时计入 dlq', () => {
    // 中途失败：attemptsMade < attempts → 不计数
    __testables.handleJobFailed(
      { attemptsMade: 1, opts: { attempts: 3 }, data: { event_name: EVENTS.WITHDRAWN } },
      new Error('transient')
    );
    expect(mockDropLabels).not.toHaveBeenCalled();

    // attempts 耗尽 → dlq +1
    __testables.handleJobFailed(
      { attemptsMade: 3, opts: { attempts: 3 }, data: { event_name: EVENTS.WITHDRAWN } },
      new Error('final')
    );
    expect(mockDropLabels).toHaveBeenCalledWith('dlq');
    expect(mockDropInc).toHaveBeenCalledTimes(1);
  });
});
