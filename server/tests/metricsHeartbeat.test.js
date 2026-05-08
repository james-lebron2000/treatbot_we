/**
 * PRD-2026Q4 T0-11：metricsHeartbeat 单元测试。
 *
 * 覆盖契约：
 *  1. startHeartbeat() 立即 inc() 一次
 *  2. fake timer 推进 N 个间隔后，inc() 调用次数 = 1 + N
 *  3. stopHeartbeat() 后再推进时间，inc() 不再增长
 *  4. NODE_ENV=test 时模块顶层不会自动启动（避免污染其它 suite）
 */

jest.mock('../utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn()
}));

const mockInc = jest.fn();
jest.mock('../middleware/metrics', () => {
  const actual = jest.requireActual('../middleware/metrics');
  return {
    ...actual,
    metricsHeartbeat: { inc: (...a) => mockInc(...a) }
  };
});

describe('metricsHeartbeat (PRD-2026Q4 T0-11)', () => {
  beforeEach(() => {
    jest.resetModules();
    mockInc.mockClear();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('NODE_ENV=test 时 require 不自动启动 timer', () => {
    const prev = process.env.NODE_ENV;
    process.env.NODE_ENV = 'test';
    require('../jobs/metricsHeartbeat');
    // 推进 5 分钟，没人调 startHeartbeat → mockInc 不应被调用
    jest.advanceTimersByTime(5 * 60 * 1000);
    expect(mockInc).not.toHaveBeenCalled();
    process.env.NODE_ENV = prev;
  });

  test('startHeartbeat 立即 inc 一次，并按 interval 周期 inc', () => {
    const prev = process.env.NODE_ENV;
    process.env.NODE_ENV = 'test'; // 避免顶层自动启动干扰
    const { startHeartbeat, stopHeartbeat } = require('../jobs/metricsHeartbeat');

    startHeartbeat(1000); // 1s 周期，方便断言
    // 启动时立即一次
    expect(mockInc).toHaveBeenCalledTimes(1);

    jest.advanceTimersByTime(1000);
    expect(mockInc).toHaveBeenCalledTimes(2);

    jest.advanceTimersByTime(3000);
    expect(mockInc).toHaveBeenCalledTimes(5);

    stopHeartbeat();
    process.env.NODE_ENV = prev;
  });

  test('stopHeartbeat 后再推进时间，不再 inc', () => {
    const prev = process.env.NODE_ENV;
    process.env.NODE_ENV = 'test';
    const { startHeartbeat, stopHeartbeat } = require('../jobs/metricsHeartbeat');

    startHeartbeat(1000);
    jest.advanceTimersByTime(2000); // 1 (immediate) + 2 (ticks)
    expect(mockInc).toHaveBeenCalledTimes(3);

    stopHeartbeat();
    jest.advanceTimersByTime(10 * 1000);
    expect(mockInc).toHaveBeenCalledTimes(3);

    process.env.NODE_ENV = prev;
  });

  test('重复 startHeartbeat 幂等，不会启动多个 timer', () => {
    const prev = process.env.NODE_ENV;
    process.env.NODE_ENV = 'test';
    const { startHeartbeat, stopHeartbeat } = require('../jobs/metricsHeartbeat');

    startHeartbeat(1000);
    startHeartbeat(1000); // 第二次应该 noop
    // 立即 inc 只调用一次（第二次 startHeartbeat 应直接返回原 timer，
    // 不会再触发立即 inc 也不会注册新的 setInterval）
    expect(mockInc).toHaveBeenCalledTimes(1);

    jest.advanceTimersByTime(1000);
    // 仍然只有一个 timer 在跑
    expect(mockInc).toHaveBeenCalledTimes(2);

    stopHeartbeat();
    process.env.NODE_ENV = prev;
  });
});
