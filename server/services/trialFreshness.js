/**
 * PRD-2026Q2 §2.4：试验新鲜度（Trial Freshness）服务。
 *
 * 目标：
 *  - 记录 trial 最后一次被 crawler / CRO 确认仍在招募的时间 (last_verified_at)；
 *  - 按时间衰减给一个 0-100 的软分值 (freshness_score)；
 *  - 超过 60 天没人确认 → 自动 close，减少"招募中实际已结束"的脏数据；
 *  - 给 matchEngine 暴露一个 0.7~1.0 的软乘子，让新鲜度高的试验排在前面。
 *
 * 不做的事：
 *  - Crawler 本身（importTrials.js）的重写留给后续；
 *  - 这里只保留"未被本轮抓到的 trial 如何衰减"的钩子。
 */

const { Op } = require('sequelize');
const { Trial } = require('../models');
const logger = require('../utils/logger');

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * 标记一个 trial 被最新一次抓取确认：last_verified_at=NOW, score=100。
 * 交易可选 —— 方便在 crawler 批处理里复用同一个事务。
 */
const markVerified = async (trialId, tx = null) => {
  if (!trialId) return null;
  const options = tx ? { where: { id: trialId }, transaction: tx } : { where: { id: trialId } };
  const [count] = await Trial.update(
    { last_verified_at: new Date(), freshness_score: 100 },
    options
  );
  return count;
};

/**
 * 根据 last_verified_at 距今天的天数给出档位分数。
 * null → 50（从未被 verify 过的给中等分，避免老库一次性全部 0）。
 *  0-14d: 100
 * 14-30d: 90
 * 30-60d: 70
 *  60d+ : 30（并触发自动 close）
 */
const computeFreshnessScore = (lastVerifiedAt, now = Date.now()) => {
  if (!lastVerifiedAt) return 50;
  const verifiedTs = new Date(lastVerifiedAt).getTime();
  if (Number.isNaN(verifiedTs)) return 50;
  const days = (now - verifiedTs) / DAY_MS;
  if (days < 14) return 100;
  if (days < 30) return 90;
  if (days < 60) return 70;
  return 30;
};

/**
 * 巡检所有 recruiting trial，按距 last_verified_at 的时长更新 freshness_score；
 * 超过 60 天 → 标记 status='closed' 并收集返回。
 *
 * @returns {{ updated: number, autoClosedIds: string[] }}
 */
const decayStaleTrials = async () => {
  const trials = await Trial.findAll({
    where: { status: 'recruiting' },
    attributes: ['id', 'last_verified_at', 'freshness_score', 'status']
  });

  const now = Date.now();
  const autoClosedIds = [];
  let updated = 0;

  for (const trial of trials) {
    const score = computeFreshnessScore(trial.last_verified_at, now);
    const patch = {};

    if (trial.freshness_score !== score) {
      patch.freshness_score = score;
    }

    if (score <= 30) {
      // 触发自动关闭：60 天没 verify 的试验视为脏数据
      patch.status = 'closed';
      autoClosedIds.push(trial.id);
    }

    if (Object.keys(patch).length > 0) {
      await trial.update(patch);
      updated += 1;
    }
  }

  if (autoClosedIds.length > 0) {
    logger.warn('[trialFreshness] 自动关闭超期试验', { count: autoClosedIds.length, ids: autoClosedIds });
  }

  return { updated, autoClosedIds };
};

/**
 * 把 0-100 的分数归一为 0.7~1.0 的软乘子。
 * 作为 matchEngine 最终 score 的系数：新鲜度高的不受影响，过期的轻微降权。
 */
const normalizeScore = (score) => {
  if (score === null || score === undefined || Number.isNaN(Number(score))) {
    return 1.0; // 未知时不扣分
  }
  const bounded = Math.max(0, Math.min(100, Number(score)));
  return 0.7 + 0.3 * (bounded / 100);
};

/**
 * 提供给 admin 健康度视图查询的辅助统计。
 * 返回：
 *   stale14d / stale30d —— 距 last_verified_at 超 14d / 30d 的 recruiting 数
 *   autoClosedLast24h   —— 最近 24 小时内被 close 且 freshness_score<=30 的数
 *   lastRun             —— 最新一次 last_verified_at（用来判断 cron 是否在跑）
 */
const getHealthSnapshot = async () => {
  const now = Date.now();
  const cutoff14 = new Date(now - 14 * DAY_MS);
  const cutoff30 = new Date(now - 30 * DAY_MS);
  const cutoff24h = new Date(now - DAY_MS);

  const [stale14d, stale30d, autoClosedLast24h, latest] = await Promise.all([
    Trial.count({
      where: {
        status: 'recruiting',
        [Op.or]: [
          { last_verified_at: null },
          { last_verified_at: { [Op.lt]: cutoff14 } }
        ]
      }
    }),
    Trial.count({
      where: {
        status: 'recruiting',
        [Op.or]: [
          { last_verified_at: null },
          { last_verified_at: { [Op.lt]: cutoff30 } }
        ]
      }
    }),
    Trial.count({
      where: {
        status: 'closed',
        freshness_score: { [Op.lte]: 30 },
        updated_at: { [Op.gte]: cutoff24h }
      }
    }),
    Trial.findOne({
      where: { last_verified_at: { [Op.ne]: null } },
      order: [['last_verified_at', 'DESC']],
      attributes: ['last_verified_at']
    })
  ]);

  return {
    stale14d,
    stale30d,
    autoClosedLast24h,
    lastRun: latest ? latest.last_verified_at : null
  };
};

module.exports = {
  markVerified,
  decayStaleTrials,
  normalizeScore,
  computeFreshnessScore,
  getHealthSnapshot
};
