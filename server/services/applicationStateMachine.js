// PRD-2026Q3 T0-2：申请状态机
// 唯一允许写入 trial_applications.status 的入口；同时把每次变更追加到
// application_status_event。此事件流是 T1-4 CPA 计费、转化漏斗、SLA 时长统计的
// 唯一事实源 —— 任何绕过 transition() 直接 update status 的代码都会让计费失真。
//
// 合法状态机：
//   pending     → contacted | rejected | withdrawn
//   contacted   → screened  | rejected | withdrawn
//   screened    → enrolled  | rejected | withdrawn
//   enrolled    → withdrawn
//   rejected    → (terminal)
//   withdrawn   → (terminal)
//
// 兼容：历史数据 status='cancelled'，语义等价 'withdrawn'，本机器把它当 terminal。
// 新流转必须写 'withdrawn'，不再产生新的 'cancelled' 行。

const { sequelize, TrialApplication, ApplicationStatusEvent, CroCompany } = require('../models');
const logger = require('../utils/logger');

// PRD-2026Q3 T1-4：合格线索计数器埋点。
// 懒 require 避免 metrics ↔ stateMachine 循环依赖（metrics 自身不引用本文件，
// 但应用启动早期 require 顺序敏感，使用 lazy lookup 更稳）。
const getCroQualifiedLeadCounter = () => {
  try {
    return require('../middleware/metrics').croQualifiedLeadTotal;
  } catch (_) {
    return null;
  }
};

const TERMINAL = new Set(['rejected', 'withdrawn', 'cancelled']);

const TRANSITIONS = {
  pending:   new Set(['contacted', 'rejected', 'withdrawn']),
  contacted: new Set(['screened',  'rejected', 'withdrawn']),
  screened:  new Set(['enrolled',  'rejected', 'withdrawn']),
  enrolled:  new Set(['withdrawn']),
  rejected:  new Set(),
  withdrawn: new Set(),
  cancelled: new Set()
};

const ACTOR_TYPES = new Set(['user', 'cro', 'admin', 'system']);

class InvalidTransitionError extends Error {
  constructor(from, to, applicationId) {
    super(`非法状态流转：${from} → ${to}（application=${applicationId}）`);
    this.name = 'InvalidTransitionError';
    this.isBusinessError = true;
    this.code = 422;
    this.from = from;
    this.to = to;
    this.applicationId = applicationId;
  }
}

class ApplicationNotFoundError extends Error {
  constructor(applicationId) {
    super(`报名记录不存在：${applicationId}`);
    this.name = 'ApplicationNotFoundError';
    this.isBusinessError = true;
    this.code = 404;
    this.applicationId = applicationId;
  }
}

const isAllowed = (from, to) => {
  const set = TRANSITIONS[from];
  return !!(set && set.has(to));
};

const isTerminal = (status) => TERMINAL.has(status);

/**
 * 执行一次状态变更。
 * @param {string} applicationId
 * @param {string} to                       目标状态
 * @param {object} opts
 * @param {{type:string,id?:string}} opts.actor  actor.type 必填
 * @param {string} [opts.reason]            备注（写入事件的 reason 列）
 * @param {object} [opts.transaction]       已有事务；若不传则内部开一条
 * @param {object} [opts.extraFields]       一并 update 的其它列（如 idempotency_key、remark）
 * @returns {Promise<{application: TrialApplication, event: ApplicationStatusEvent, from: string, to: string}>}
 */
const transition = async (applicationId, to, opts = {}) => {
  const { actor, reason, transaction: outerTxn, extraFields = {} } = opts;

  if (!applicationId) {
    throw new ApplicationNotFoundError(applicationId);
  }
  if (!actor || !ACTOR_TYPES.has(actor.type)) {
    throw new Error(`transition() 必须传合法 actor.type，收到：${actor && actor.type}`);
  }
  if (!Object.prototype.hasOwnProperty.call(TRANSITIONS, to)) {
    throw new InvalidTransitionError('?', to, applicationId);
  }

  const run = async (txn) => {
    // SELECT ... FOR UPDATE：避免两个 admin 同时点同一条记录导致状态机竞态。
    const app = await TrialApplication.findByPk(applicationId, {
      transaction: txn,
      lock: txn.LOCK ? txn.LOCK.UPDATE : true
    });
    if (!app) {
      throw new ApplicationNotFoundError(applicationId);
    }

    const from = app.status;

    // Idempotent：from === to 时直接返回当前状态，不写事件、不报错。
    // 业务侧批量更新时常见，避免误标"非法流转"。
    if (from === to) {
      return { application: app, event: null, from, to, noop: true };
    }

    if (!isAllowed(from, to)) {
      throw new InvalidTransitionError(from, to, applicationId);
    }

    await app.update({ ...extraFields, status: to }, { transaction: txn });

    const event = await ApplicationStatusEvent.create({
      application_id: applicationId,
      from_status: from,
      to_status: to,
      actor_type: actor.type,
      actor_id: actor.id || null,
      reason: reason || null
    }, { transaction: txn });

    return { application: app, event, from, to, noop: false };
  };

  let result;
  if (outerTxn) {
    result = await run(outerTxn);
  } else {
    result = await sequelize.transaction(async (txn) => run(txn));
  }

  if (!result.noop) {
    logger.info('[stateMachine] transition', {
      applicationId,
      from: result.from,
      to: result.to,
      actorType: actor.type,
      actorId: actor.id || null
    });

    // PRD-2026Q3 T1-4：CPA 计费埋点
    // 仅做 prom-client 实时观测；月度对账以 application_status_event 表为准
    // （billing.computeMonthly 直接 SQL 聚合）。永远不能因为埋点失败影响业务。
    try {
      const trialId = result.application && result.application.trial_id;
      if (trialId) {
        const company = await findCroCompanyByTrialId(trialId);
        if (company && company.cpa_qualified_status === result.to) {
          const counter = getCroQualifiedLeadCounter();
          if (counter) counter.labels(company.id, trialId).inc();
        }
      }
    } catch (e) {
      logger.warn('[stateMachine] CPA metric inc failed', { applicationId, err: e.message });
    }
  }
  return result;
};

/**
 * 通过 trial_id 反查所属 CRO 公司（取 trial_ids JSON 包含该 trial 的第一家）。
 * 单 trial 通常只属于一家 CRO；若有多家命中（理论上不应发生），取第一家并告警。
 *
 * 实现说明：
 *  - 用 sequelize.query + replacements 走参数化绑定，避免 Sequelize.literal 字符串拼接。
 *  - JSON_CONTAINS 第二参要求合法 JSON 字符串；这里在 SQL 端用 JSON_QUOTE() 包一下，
 *    把 trialId 当普通字符串绑定即可（MySQL 8.0+ 支持）。
 *  - 走 sequelize.query 而非 findAll({ where: literal }) 是为了让 EXPLAIN 命中我们后续
 *    可能加的 JSON 函数索引（generated column + index），同时保留单一 fact source SQL。
 */
const findCroCompanyByTrialId = async (trialId) => {
  if (!CroCompany || typeof CroCompany.findAll !== 'function') return null;
  if (!sequelize || typeof sequelize.query !== 'function') return null;
  const { QueryTypes } = require('sequelize');
  const rows = await sequelize.query(
    `SELECT id, name, cpa_price, cpa_qualified_status
       FROM cro_companies
      WHERE JSON_CONTAINS(trial_ids, JSON_QUOTE(:trialId))
      ORDER BY id ASC
      LIMIT 2`,
    {
      replacements: { trialId: String(trialId) },
      type: QueryTypes.SELECT
    }
  );
  if (!rows.length) return null;
  if (rows.length > 1) {
    logger.warn('[stateMachine] multiple CRO own same trial', { trialId, croIds: rows.map((r) => r.id) });
  }
  return rows[0];
};

/**
 * 读取一个申请的完整事件时间线（按 created_at 升序）。
 * 用于 GET /api/applications/:id/timeline 与 admin 复核视图。
 */
const getTimeline = async (applicationId) => {
  return ApplicationStatusEvent.findAll({
    where: { application_id: applicationId },
    order: [['created_at', 'ASC'], ['id', 'ASC']]
  });
};

module.exports = {
  transition,
  getTimeline,
  isAllowed,
  isTerminal,
  TRANSITIONS,
  TERMINAL_STATUSES: Array.from(TERMINAL),
  InvalidTransitionError,
  ApplicationNotFoundError
};
