/**
 * PRD-2026Q3 T1-1：试验数据每日抓取
 *
 * 调度策略与 trialFreshnessJob 同：优先 Bull repeatable，否则 setInterval 兜底。
 * 默认 03:00 北京时间（早于 04:00 freshness 巡检，先抓后衰减）。
 *
 * 流程：
 *   1) DB 拉所有 trials.nct_id IS NOT NULL 的列表（活跃 + closed 都拉，防止已下架的偷偷开了）
 *   2) 分批 100 调 clinicalTrialsClient.fetchByNctIds，限速 5 QPS
 *   3) 对比 trial 当前字段 vs 上游：
 *        - status / phase / enrolled_count / locations 任一不同 → 写 trial_change_log
 *        - 任意命中 → markVerified（更新 last_verified_at + freshness_score）
 *        - 上游 status===closed/completed 而 DB 还是 recruiting → 同步降级
 *   4) 单批失败：整批入 trial_crawl_failures DLQ，下次再跑
 *   5) 单条解析失败：单条入 DLQ，不影响整批
 *
 * 反作弊 / 韧性：
 *   - 已 closed/completed 的 trial 跑一次仍会 markVerified（防止数据被反复"漂"成陈旧）
 *   - 任一异常都被 catch；cron 永远不抛
 */

const logger = require('../utils/logger');
const { Op } = require('sequelize');
const { Trial, TrialChangeLog, TrialCrawlFailure, TrialFieldChangeReview } = require('../models');
const trialFreshness = require('../services/trialFreshness');
const client = require('../services/clinicalTrialsClient');
// PRD-2026Q4 T0-1：null 守门指标 + pending 队列长度 gauge
const metrics = require('../middleware/metrics');

const CRON_EXPR = process.env.TRIAL_CRAWLER_CRON || '0 3 * * *';
const MAX_TRIALS_PER_RUN = Number(process.env.TRIAL_CRAWLER_MAX_PER_RUN || 5000);

// 监控字段：哪些字段差异需要写 change_log 且触发 trial.update
const TRACKED_FIELDS = ['status', 'phase', 'enrolled_count'];

const truncate = (s, n = 1024) => {
  if (s == null) return null;
  const str = typeof s === 'string' ? s : JSON.stringify(s);
  return str.length > n ? str.slice(0, n) : str;
};

const recordFailure = async (info) => {
  try {
    await TrialCrawlFailure.create({
      trial_id: info.trial_id || null,
      nct_id: info.nct_id || null,
      reason: String(info.reason || 'unknown').slice(0, 256),
      payload: info.payload || null,
      attempt_count: 1,
      last_attempt_at: new Date()
    });
  } catch (e) {
    logger.error('[trialCrawler] DLQ insert 失败', { err: e.message, info });
  }
};

// PRD-2026Q4 T0-1：trial 列名 → upstream 字段名 / null 守门字段名映射。
// 大部分一一对应；仅 locations → hospitals。
const FIELD_TRIAL_COL = {
  status: 'status',
  phase: 'phase',
  enrolled_count: 'enrolled_count',
  locations: 'hospitals'
};
const FIELDS_TO_DIFF = ['status', 'phase', 'enrolled_count', 'locations'];

// PRD-2026Q4 T0-1：判断 upstream 与 trial 上的 locations / 普通字段是否真有差异。
// 普通字段直接 String() 比较；locations 走 JSON.stringify（与 Q3 老逻辑一致）。
const isFieldChanged = (field, oldVal, newVal) => {
  if (field === 'locations') {
    return JSON.stringify(oldVal || []) !== JSON.stringify(newVal || []);
  }
  const o = oldVal == null ? null : String(oldVal);
  const n = newVal == null ? null : String(newVal);
  return o !== n;
};

const diffAndApply = async (trial, upstream, source = 'clinicaltrials_v2') => {
  const changes = []; // 真正要应用 + 写 trial_change_log 的非 null 变更
  const reviews = []; // null 守门拦截下来、待运营复核的变更
  const nullSources = upstream && upstream._null_sources ? upstream._null_sources : {};

  for (const field of FIELDS_TO_DIFF) {
    const trialCol = FIELD_TRIAL_COL[field];
    const oldVal = trial[trialCol];
    const newVal = upstream[field];

    // PRD-2026Q4 T0-1：null 守门
    // 上游 null 不能直接覆盖库内真值，否则把 'recruiting' 刷成 null 会让晚期患者
    // 看到本应关停的试验。挂起到 trial_field_change_review 等运营手动决断。
    if (newVal == null && oldVal != null) {
      const nullSource = nullSources[field] || 'missing';
      reviews.push({
        trial_id: trial.id,
        nct_id: trial.nct_id,
        field,
        old_value: oldVal,
        new_value: null,
        null_source: nullSource,
        change_kind: 'suspect_null_from_upstream',
        status: 'pending'
      });
      try {
        if (metrics && metrics.crawlerFieldNullTotal) {
          metrics.crawlerFieldNullTotal.labels(field, nullSource).inc();
        }
      } catch (_) { /* 埋点永不影响主流程 */ }
      continue; // 跳过该字段的覆盖
    }

    // 正常 diff（保留 Q3 老逻辑：仅在确实变化且新值非 null 时记账）
    if (newVal != null && isFieldChanged(field, oldVal, newVal)) {
      const oldStr = field === 'locations' ? truncate(JSON.stringify(oldVal || [])) : (oldVal == null ? null : String(oldVal));
      const newStr = field === 'locations' ? truncate(JSON.stringify(newVal || [])) : String(newVal);
      changes.push({ field, old_value: oldStr, new_value: newStr });
    }
  }

  if (changes.length > 0) {
    // 写 change_log（仅记真正应用的变更）
    await TrialChangeLog.bulkCreate(changes.map((c) => ({
      trial_id: trial.id,
      nct_id: trial.nct_id,
      field: c.field,
      old_value: c.old_value,
      new_value: c.new_value,
      source
    })));

    // 应用变更到 trials（locations → hospitals 列）
    const patch = {};
    for (const c of changes) {
      const col = FIELD_TRIAL_COL[c.field];
      patch[col] = upstream[c.field];
    }
    await trial.update(patch);
  }

  // PRD-2026Q4 T0-1：被 null 守门拦截的字段挂起复核（与 trial_change_log 互斥写入）
  if (reviews.length > 0) {
    for (const r of reviews) {
      try {
        await TrialFieldChangeReview.create(r);
      } catch (e) {
        logger.warn('[trialCrawler] field-review 入队失败', { err: e.message, field: r.field, trial_id: r.trial_id });
      }
    }
  }

  // 无论变更与否都 markVerified（说明本轮上游确认仍存在）
  await trialFreshness.markVerified(trial.id);

  return changes;
};

/**
 * 一轮完整抓取。返回汇总统计便于巡检 / 测试断言。
 */
const run = async (opts = {}) => {
  const startedAt = Date.now();
  const summary = { totalCandidates: 0, fetched: 0, changed: 0, failures: 0, batches: 0 };

  try {
    const trials = await Trial.findAll({
      where: { nct_id: { [Op.ne]: null } },
      attributes: ['id', 'nct_id', 'status', 'phase', 'enrolled_count', 'hospitals'],
      limit: MAX_TRIALS_PER_RUN
    });
    summary.totalCandidates = trials.length;

    if (trials.length === 0) {
      logger.info('[trialCrawler] 无 nct_id 试验，跳过');
      return summary;
    }

    const byNct = new Map();
    for (const t of trials) byNct.set(t.nct_id, t);
    const nctIds = Array.from(byNct.keys());

    const batchSize = opts.batchSize || client._MAX_BATCH;
    for (let i = 0; i < nctIds.length; i += batchSize) {
      const batch = nctIds.slice(i, i + batchSize);
      summary.batches += 1;
      try {
        const { items, errors } = await client.fetchByNctIds(batch);
        summary.fetched += items.length;

        for (const up of items) {
          const trial = byNct.get(up.nct_id);
          if (!trial) continue;
          try {
            const changes = await diffAndApply(trial, up);
            if (changes.length > 0) summary.changed += 1;
          } catch (e) {
            summary.failures += 1;
            await recordFailure({
              trial_id: trial.id,
              nct_id: trial.nct_id,
              reason: `apply: ${e.message}`,
              payload: { upstream: up }
            });
          }
        }

        for (const err of errors) {
          summary.failures += 1;
          const t = byNct.get(err.nct_id);
          await recordFailure({
            trial_id: t ? t.id : null,
            nct_id: err.nct_id,
            reason: err.reason
          });
        }
      } catch (e) {
        summary.failures += batch.length;
        logger.warn('[trialCrawler] 整批抓取失败，入 DLQ', { batchSize: batch.length, err: e.message });
        for (const nct of batch) {
          const t = byNct.get(nct);
          await recordFailure({
            trial_id: t ? t.id : null,
            nct_id: nct,
            reason: `batch: ${e.message}`
          });
        }
      }

      // 限速：批与批之间 sleep 一个 QPS 周期
      if (i + batchSize < nctIds.length) {
        await client._sleep(client._QPS_DELAY_MS);
      }
    }

    // PRD-2026Q4 T0-1：每轮跑完后刷新待复核队列长度 gauge，
    // 让 Grafana 报警 "trial_field_review_pending_total > 50" 时能及时打人。
    try {
      const pending = await TrialFieldChangeReview.count({ where: { status: 'pending' } });
      if (metrics && metrics.trialFieldReviewPendingTotal && Number.isFinite(pending)) {
        metrics.trialFieldReviewPendingTotal.set(pending);
      }
    } catch (e) {
      logger.warn('[trialCrawler] field-review pending count 失败', { err: e.message });
    }

    logger.info('[trialCrawler] run 完成', { ...summary, ms: Date.now() - startedAt });
    return summary;
  } catch (err) {
    logger.error('[trialCrawler] run 顶层异常', { err: err.message });
    summary.failures += 1;
    return summary;
  }
};

// ========== 调度部分 ==========

let _bullQueue = null;

const startBullCron = () => {
  try {
    const Queue = require('bull');
    const redisConfig = {
      host: process.env.REDIS_HOST || 'localhost',
      port: process.env.REDIS_PORT || 6379,
      password: process.env.REDIS_PASSWORD || undefined
    };
    _bullQueue = new Queue('trial-crawler', { redis: redisConfig });
    _bullQueue.process(async () => run({ from: 'bull' }));
    _bullQueue.removeRepeatable('trial-crawler-daily', { cron: CRON_EXPR }).catch(() => {});
    _bullQueue.add('trial-crawler-daily', {}, {
      repeat: { cron: CRON_EXPR, tz: 'Asia/Shanghai' },
      removeOnComplete: 10,
      removeOnFail: 5
    }).catch((err) => {
      logger.warn('[trialCrawler] add repeatable 失败', { err: err.message });
    });
    _bullQueue.on('error', (err) => logger.warn('[trialCrawler] Bull error', { err: err.message }));
    logger.info('[trialCrawler] Bull 已启动', { cron: CRON_EXPR });
    return true;
  } catch (err) {
    logger.warn('[trialCrawler] Bull 启动失败', { err: err.message });
    return false;
  }
};

const startFallbackInterval = () => {
  const HOURLY = 60 * 60 * 1000;
  let lastRunDay = null;
  setInterval(() => {
    const now = new Date();
    if (now.getHours() !== 3) return;
    const day = now.toISOString().slice(0, 10);
    if (lastRunDay === day) return;
    lastRunDay = day;
    run({ from: 'interval-fallback' }).catch(() => {});
  }, HOURLY).unref?.();
  logger.info('[trialCrawler] setInterval 回退兜底（每小时检查 03:00）');
};

if (process.env.ENABLE_TRIAL_CRAWLER_CRON === 'true') {
  const ok = startBullCron();
  if (!ok) startFallbackInterval();
}

module.exports = {
  run,
  diffAndApply,
  CRON_EXPR,
  TRACKED_FIELDS,
  startBullCron,
  startFallbackInterval
};
