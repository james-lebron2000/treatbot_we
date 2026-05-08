/**
 * PRD-2026Q4 T0-11：metrics pipeline 自检心跳。
 *
 * 启动时 setInterval(() => metricsHeartbeat.inc(), 60_000)，让
 * Alertmanager 通过 `absent(metrics_self_check_heartbeat_total[5m])`
 * 在 2 分钟内感知 prom-client / register / Express /metrics 链路的静默失败。
 *
 * 设计要点：
 *  - 单例：模块缓存 + 防重入，重复 require 不会启动多个 timer。
 *  - unref()：测试 / 短任务进程不会被 timer 卡住退出。
 *  - 进程退出钩子：SIGTERM / SIGINT 自动 stop，避免 jest 抓到 open handle。
 *  - test 环境不自动启动；测试代码通过 startHeartbeat() 显式触发。
 */

const { metricsHeartbeat } = require('../middleware/metrics');
const logger = require('../utils/logger');

const HEARTBEAT_INTERVAL_MS = Number(process.env.METRICS_HEARTBEAT_INTERVAL_MS) || 60 * 1000;

let _timer = null;

const startHeartbeat = (intervalMs = HEARTBEAT_INTERVAL_MS) => {
  if (_timer) return _timer; // 已经在跑，幂等返回
  // 立即跑一次，避免冷启动后 60s 才出现第一条数据
  try {
    metricsHeartbeat.inc();
  } catch (e) {
    // 永远不能因为埋点抛错影响业务进程
  }
  _timer = setInterval(() => {
    try {
      metricsHeartbeat.inc();
    } catch (e) {
      // 同上
    }
  }, intervalMs);
  if (typeof _timer.unref === 'function') _timer.unref();
  logger.info('[metricsHeartbeat] started', { intervalMs });
  return _timer;
};

const stopHeartbeat = () => {
  if (_timer) {
    clearInterval(_timer);
    _timer = null;
  }
};

// 进程退出时清理（生产/dev 都生效；测试里通过 stopHeartbeat() 手动控制）
const _onExit = () => stopHeartbeat();
process.once('SIGTERM', _onExit);
process.once('SIGINT', _onExit);

// 非测试环境，且模块被首次 require 时自动启动
if (process.env.NODE_ENV !== 'test') {
  startHeartbeat();
}

module.exports = {
  startHeartbeat,
  stopHeartbeat,
  HEARTBEAT_INTERVAL_MS
};
