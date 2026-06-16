/**
 * PRD-2026Q3 T1-4：CPA 月度对账
 *
 * 数据源（单一事实）：application_status_event 表
 *   - 由 applicationStateMachine.transition() 唯一写入；任何绕过状态机的代码会让对账失真。
 *   - 列：application_id, from_status, to_status, actor_type, actor_id, reason, created_at
 *
 * 聚合维度：(cro_id, trial_id, month)
 *   - month：created_at 转成 UTC+8（北京时间，业务时区）的 YYYY-MM
 *   - to_status：等于该 cro_company.cpa_qualified_status 才计费
 *   - 单价：cro_company.cpa_price（DECIMAL，可为 0 表示该 CRO 暂未启用 CPA）
 *
 * 输出形态：每行一个 (cro_id, trial_id) × 该月命中数 × 单价 = 该试验本月应计 CPA。
 *   合计在外层 sum，避免浮点累加误差（数字以分为单位，最后 /100 渲染）。
 *
 * 反作弊 / 防重计：
 *   - 同一 application 反复 contacted ↔ screened 来回切只在第一次 to=screened 时计入。
 *     SQL 用窗口函数：每个 application_id 在该月内 to_status === qualified_status 的
 *     最早一条记 1，其余忽略。
 */

const { Op } = require('sequelize');
const { sequelize, ApplicationStatusEvent, TrialApplication, CroCompany } = require('../models');
const logger = require('../utils/logger');
// PRD-2026Q4 T0-7 followup（CSV formula injection / CWE-1236）：cro_name 是 CRO 自填字段，
// 历史只 `"`-quote 但没拦 = + - @ 起头 → Excel 仍按公式求值。集中式转义。
const { escapeCsvCell } = require('../utils/csvSafe');

const TZ_OFFSET_MINUTES = 8 * 60;

// "YYYY-MM" → [startUtcDate, endUtcDate)，按 UTC+8 切分
const monthBounds = (month) => {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month || '')) {
    throw new Error(`非法 month 参数（应为 YYYY-MM）：${month}`);
  }
  const [y, m] = month.split('-').map(Number);
  // UTC+8 起点 = UTC 时间该月 1 日 00:00 - 8h
  const startUtc = new Date(Date.UTC(y, m - 1, 1, 0, 0, 0) - TZ_OFFSET_MINUTES * 60 * 1000);
  const endUtc = new Date(Date.UTC(y, m, 1, 0, 0, 0) - TZ_OFFSET_MINUTES * 60 * 1000);
  return { startUtc, endUtc };
};

/**
 * 计算指定月份每个 (cro_id, trial_id) 的 CPA 应计金额。
 *
 * @param {string} month  'YYYY-MM'
 * @returns {Promise<{
 *   month: string,
 *   rows: Array<{cro_id: string, cro_name: string, trial_id: string, qualified_status: string, count: number, unit_price: number, amount: number}>,
 *   total_amount: number,
 *   total_count: number
 * }>}
 */
const computeMonthly = async (month) => {
  const { startUtc, endUtc } = monthBounds(month);

  // 1) 拉所有 CRO 公司及其负责的 trial_ids / 单价 / 合格 status
  const companies = await CroCompany.findAll({
    where: { status: 'active' },
    order: [['id', 'ASC']] // 确定性归属：trial 命中多家时恒取 id 最小者，与状态机 findCroCompanyByTrialId 一致
  });

  // trial_id → { croId, croName, qualifiedStatus, unitPrice }
  const trialMap = new Map();
  for (const c of companies) {
    const ids = Array.isArray(c.trial_ids) ? c.trial_ids : [];
    for (const tid of ids) {
      // 同一 trial 命中多家时仅记第一家（与 stateMachine 保持一致）
      if (trialMap.has(String(tid))) continue;
      trialMap.set(String(tid), {
        croId: c.id,
        croName: c.name,
        qualifiedStatus: c.cpa_qualified_status,
        unitPrice: Number(c.cpa_price) || 0
      });
    }
  }

  if (trialMap.size === 0) {
    return { month, rows: [], total_amount: 0, total_count: 0 };
  }

  // 2) 拉本月内 to_status ∈ {screened, enrolled} 的状态事件（一次性 SQL 减少回表）
  const events = await ApplicationStatusEvent.findAll({
    where: {
      to_status: { [Op.in]: ['screened', 'enrolled'] },
      created_at: { [Op.gte]: startUtc, [Op.lt]: endUtc }
    },
    order: [['application_id', 'ASC'], ['created_at', 'ASC'], ['id', 'ASC']]
  });

  if (events.length === 0) {
    return { month, rows: [], total_amount: 0, total_count: 0 };
  }

  // 3) 拉这些 application 对应的 trial_id（一次 IN 查询）
  const appIds = Array.from(new Set(events.map((e) => e.application_id)));
  const apps = await TrialApplication.findAll({
    where: { id: { [Op.in]: appIds } },
    attributes: ['id', 'trial_id']
  });
  const appTrialMap = new Map(apps.map((a) => [a.id, a.trial_id]));

  // 4) 反作弊：同一 application 在同一 qualified_status 上只计第一次
  //    seenKeys 记录 (application_id, qualified_status)
  const seenKeys = new Set();

  // 聚合容器：(cro_id, trial_id) → {count}
  const agg = new Map();

  for (const ev of events) {
    const trialId = appTrialMap.get(ev.application_id);
    if (!trialId) continue;
    const meta = trialMap.get(String(trialId));
    if (!meta) continue;
    if (ev.to_status !== meta.qualifiedStatus) continue;

    const dedupKey = `${ev.application_id}|${meta.qualifiedStatus}`;
    if (seenKeys.has(dedupKey)) continue;
    seenKeys.add(dedupKey);

    const aggKey = `${meta.croId}|${trialId}`;
    if (!agg.has(aggKey)) {
      agg.set(aggKey, {
        cro_id: meta.croId,
        cro_name: meta.croName,
        trial_id: String(trialId),
        qualified_status: meta.qualifiedStatus,
        count: 0,
        unit_price: meta.unitPrice
      });
    }
    agg.get(aggKey).count += 1;
  }

  // 5) 出账：amount = count × unit_price，整数分累加避免浮点漂移
  let totalCents = 0;
  let totalCount = 0;
  const rows = Array.from(agg.values()).map((r) => {
    const amountCents = Math.round(r.unit_price * 100) * r.count;
    totalCents += amountCents;
    totalCount += r.count;
    return { ...r, amount: amountCents / 100 };
  });

  // 排序：金额高 → 低，便于一眼看出大客户
  rows.sort((a, b) => b.amount - a.amount || a.cro_id.localeCompare(b.cro_id));

  logger.info('[billing] computeMonthly', { month, rowCount: rows.length, totalCount, totalAmount: totalCents / 100 });

  return {
    month,
    rows,
    total_count: totalCount,
    total_amount: totalCents / 100
  };
};

/**
 * 把 computeMonthly 的结果渲染成 CSV 字符串（含 BOM，Excel 可直接打开）。
 * 列顺序固定，财务复核时可纳入审计。
 */
const toCsv = (summary) => {
  const headers = ['月份', 'CRO ID', 'CRO 公司', '试验 ID', '合格状态', '合格线索数', '单价(元)', '小计(元)'];
  const lines = [headers.join(',')];
  for (const r of summary.rows) {
    // 每个单元格走 escapeCsvCell —— 公式触发字符自动前缀单引号 + 双引号包裹。
    // cro_name 是用户输入；其它字段是 ID / 数值，仍走转义保持一致性。
    lines.push([
      escapeCsvCell(summary.month),
      escapeCsvCell(r.cro_id),
      escapeCsvCell(r.cro_name || ''),
      escapeCsvCell(r.trial_id),
      escapeCsvCell(r.qualified_status),
      escapeCsvCell(r.count),
      escapeCsvCell(r.unit_price.toFixed(2)),
      escapeCsvCell(r.amount.toFixed(2))
    ].join(','));
  }
  lines.push([
    escapeCsvCell('合计'),
    escapeCsvCell(''),
    escapeCsvCell(''),
    escapeCsvCell(''),
    escapeCsvCell(''),
    escapeCsvCell(summary.total_count),
    escapeCsvCell(''),
    escapeCsvCell(summary.total_amount.toFixed(2))
  ].join(','));
  return '﻿' + lines.join('\n') + '\n';
};

module.exports = { computeMonthly, toCsv, monthBounds };
