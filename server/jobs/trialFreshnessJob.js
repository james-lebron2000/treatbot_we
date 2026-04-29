/**
 * PRD-2026Q2 §2.4：试验新鲜度每日巡检。
 *
 * 调度策略：
 *  - 优先用现有 Bull 队列的 repeatable jobs（与 OCR 队列共用 Redis）；
 *  - 若 Redis 未连上（本地/单元测试），回退到 setInterval(24h) 兜底，
 *    保证不阻塞启动。
 *
 * 启动方式（app.js 里手动 require）：
 *    if (process.env.ENABLE_TRIAL_FRESHNESS_CRON === 'true') require('./jobs/trialFreshnessJob');
 *
 * TODO: 等 crawler 能力落地后，这里应先调 importTrials() 再做 decayStaleTrials()；
 *       由 crawler 负责 markVerified() 把当轮抓到的 trial 刷新，
 *       剩下没被抓到的自然会走衰减路径。
 */

const logger = require('../utils/logger');
const { decayStaleTrials } = require('../services/trialFreshness');

const CRON_EXPR = process.env.TRIAL_FRESHNESS_CRON || '0 4 * * *'; // 每天 04:00

let _bullQueue = null;

const runOnce = async (reason = 'cron') => {
  const started = Date.now();
  try {
    // TODO: 未来先调 crawler 把能抓到的 trial markVerified，再走下面的衰减。
    // const { runCrawler } = require('../services/crawler');
    // await runCrawler();
    const result = await decayStaleTrials();
    logger.info('[trialFreshnessJob] 巡检完成', {
      reason,
      ms: Date.now() - started,
      updated: result.updated,
      autoClosed: result.autoClosedIds.length
    });
    return result;
  } catch (err) {
    logger.error('[trialFreshnessJob] 巡检失败', { error: err.message });
    throw err;
  }
};

const startBullCron = () => {
  try {
    const Queue = require('bull');
    const redisConfig = {
      host: process.env.REDIS_HOST || 'localhost',
      port: process.env.REDIS_PORT || 6379,
      password: process.env.REDIS_PASSWORD || undefined
    };
    _bullQueue = new Queue('trial-freshness', { redis: redisConfig });

    _bullQueue.process(async () => runOnce('bull'));

    // 清掉历史重复任务，只保留一条
    _bullQueue.removeRepeatable('trial-freshness-daily', { cron: CRON_EXPR }).catch(() => {});
    _bullQueue.add(
      'trial-freshness-daily',
      {},
      { repeat: { cron: CRON_EXPR }, removeOnComplete: 10, removeOnFail: 5 }
    ).catch((err) => {
      logger.warn('[trialFreshnessJob] 添加 repeatable 失败，将回退到 setInterval', { error: err.message });
    });

    _bullQueue.on('error', (err) => {
      logger.warn('[trialFreshnessJob] Bull 队列错误', { error: err.message });
    });

    logger.info('[trialFreshnessJob] 通过 Bull 队列启动', { cron: CRON_EXPR });
    return true;
  } catch (err) {
    logger.warn('[trialFreshnessJob] Bull 初始化失败，回退 setInterval', { error: err.message });
    return false;
  }
};

const startFallbackInterval = () => {
  const HOURLY = 60 * 60 * 1000;
  // 每小时醒一次，看看当天 04:00 是否已跑过；简化版，避免引入 node-cron 依赖。
  let lastRunDay = null;
  setInterval(() => {
    const now = new Date();
    if (now.getHours() !== 4) return;
    const day = now.toISOString().slice(0, 10);
    if (lastRunDay === day) return;
    lastRunDay = day;
    runOnce('interval-fallback').catch(() => {});
  }, HOURLY).unref?.();
  logger.info('[trialFreshnessJob] 通过 setInterval 回退兜底（每小时检查 04:00 窗口）');
};

if (process.env.ENABLE_TRIAL_FRESHNESS_CRON === 'true') {
  const ok = startBullCron();
  if (!ok) startFallbackInterval();
}

module.exports = {
  runOnce,
  startBullCron,
  startFallbackInterval,
  CRON_EXPR
};
