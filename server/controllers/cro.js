const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { Op, fn, col } = require('sequelize');
const { CroCompany, TrialApplication, Trial, User, MedicalRecord, CroExportLog, AdminAuditLog } = require('../models');
const { success, error } = require('../utils/response');
const { safeText } = require('../utils/text');
// PRD-2026Q4 T0-7 followup（CSV formula injection / CWE-1236）：CRO export 也走集中式 CSV 转义。
const { escapeCsvCell } = require('../utils/csvSafe');
const logger = require('../utils/logger');
const { JWT_SECRET } = require('../utils/jwtSecret');
// PRD-2026Q4 T0-10：转化漏斗埋点
const funnelTracker = require('../services/funnelTracker');

// PRD-2026Q4 T0-10：状态 → 漏斗事件映射。
// 与 application.create 那一步触发的 APPLICATION_SUBMITTED 衔接成完整漏斗。
// 注意：cancelled 不映射任何事件 —— 用户取消由前端自助接口（application.cancel）触发，
// 与 CRO 推进流程是两条不同的语义路径；如果需要 WITHDRAWN，应在 application.cancel
// 里单独触发。
const STATUS_TO_FUNNEL_EVENT = {
  contacted: funnelTracker.EVENTS.CRO_CONTACTED,
  screened: funnelTracker.EVENTS.SCREENED,
  enrolled: funnelTracker.EVENTS.ENROLLED,
  rejected: funnelTracker.EVENTS.REJECTED,
  withdrawn: funnelTracker.EVENTS.WITHDRAWN
};

const JWT_EXPIRES_IN = parseInt(process.env.JWT_EXPIRES_IN) || 1800;

const APPLICATION_STATUS_TEXT = {
  pending: '待筛查',
  contacted: '已联系',
  enrolled: '已入组',
  rejected: '已排除',
  cancelled: '已取消'
};

const parseRecordIds = (value) => {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    try { return JSON.parse(value); } catch { return []; }
  }
  return [];
};

/**
 * CRO 邮箱+密码登录
 */
const croLogin = async (req, res, next) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) {
      return res.status(400).json(error('请输入邮箱和密码', 400));
    }

    const company = await CroCompany.findOne({ where: { email: email.toLowerCase().trim() } });
    if (!company) {
      return res.status(401).json(error('邮箱或密码错误', 401));
    }

    if (company.status !== 'active') {
      return res.status(403).json(error('账号已被禁用，请联系管理员', 403));
    }

    const valid = await bcrypt.compare(password, company.password_hash);
    if (!valid) {
      return res.status(401).json(error('邮箱或密码错误', 401));
    }

    const token = jwt.sign(
      { croId: company.id, role: 'cro' },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );

    logger.info(`[CRO] 登录成功: ${company.name} (${company.email})`);

    res.json(success({
      token,
      expiresIn: JWT_EXPIRES_IN,
      company: {
        id: company.id,
        name: company.name,
        email: company.email,
        contactName: company.contact_name,
        trialCount: (company.trial_ids || []).length
      }
    }));
  } catch (err) {
    next(err);
  }
};

/**
 * CRO 获取自己的试验列表
 */
const getCroTrials = async (req, res, next) => {
  try {
    const trialIds = req.croCompany.trial_ids || [];
    if (!trialIds.length) {
      return res.json(success([]));
    }

    const trials = await Trial.findAll({
      where: { id: { [Op.in]: trialIds } },
      attributes: ['id', 'name', 'indication', 'institution', 'status', 'sponsor']
    });

    const appCounts = await TrialApplication.findAll({
      where: { trial_id: { [Op.in]: trialIds } },
      attributes: ['trial_id', [fn('COUNT', col('id')), 'cnt']],
      group: ['trial_id'],
      raw: true
    });
    const countMap = appCounts.reduce((m, r) => { m[r.trial_id] = Number(r.cnt); return m; }, {});

    const list = trials.map((t) => ({
      id: t.id,
      name: safeText(t.name),
      indication: safeText(t.indication),
      institution: safeText(t.institution),
      sponsor: safeText(t.sponsor),
      status: t.status,
      applicationCount: countMap[t.id] || 0
    }));

    list.sort((a, b) => b.applicationCount - a.applicationCount);
    res.json(success(list));
  } catch (err) {
    next(err);
  }
};

/**
 * CRO 获取某个试验的申请看板（按状态分组）
 */
const getCroApplications = async (req, res, next) => {
  try {
    const { trialId } = req.query;
    const allowedTrials = req.croCompany.trial_ids || [];

    if (!trialId || !allowedTrials.includes(trialId)) {
      return res.status(403).json(error('无权查看该试验', 403));
    }

    const rows = await TrialApplication.findAll({
      where: { trial_id: trialId },
      include: [
        { model: User, attributes: ['id', 'nickname', 'phone'] },
        { model: Trial, attributes: ['id', 'name', 'indication'] }
      ],
      order: [['created_at', 'DESC']]
    });

    const recordIds = [...new Set(rows.flatMap((a) => parseRecordIds(a.record_ids)))];
    const records = recordIds.length
      ? await MedicalRecord.findAll({
          where: { id: { [Op.in]: recordIds } },
          attributes: ['id', 'diagnosis', 'stage', 'gene_mutation', 'treatment_line', 'pdl1']
        })
      : [];
    const recordMap = records.reduce((m, r) => { m[r.id] = r; return m; }, {});

    const applications = rows.map((app) => {
      const rids = parseRecordIds(app.record_ids);
      const pr = rids.length ? recordMap[rids[0]] : null;
      return {
        id: app.id,
        userName: safeText(app.User?.nickname) || '匿名',
        userPhone: safeText(app.User?.phone),
        status: app.status,
        statusText: APPLICATION_STATUS_TEXT[app.status] || app.status,
        diagnosis: safeText(pr?.diagnosis),
        stage: safeText(pr?.stage),
        geneMutation: safeText(pr?.gene_mutation),
        treatmentLine: pr?.treatment_line || null,
        pdl1: safeText(pr?.pdl1),
        notes: app.notes || [],
        createdAt: app.created_at
      };
    });

    const grouped = {};
    for (const s of ['pending', 'contacted', 'enrolled', 'rejected', 'cancelled']) {
      grouped[s] = applications.filter((a) => a.status === s);
    }

    res.json(success({ grouped, total: applications.length }));
  } catch (err) {
    next(err);
  }
};

/**
 * CRO 更新申请状态
 */
const updateCroApplicationStatus = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    const allowedTrials = req.croCompany.trial_ids || [];

    const app = await TrialApplication.findByPk(id);
    if (!app || !allowedTrials.includes(app.trial_id)) {
      return res.status(403).json(error('无权操作', 403));
    }

    const validStatuses = ['pending', 'contacted', 'enrolled', 'rejected', 'cancelled'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json(error('无效状态', 400));
    }

    const prevStatus = app.status;
    await app.update({ status });
    logger.info(`[CRO] 状态更新: ${id} → ${status} by ${req.croCompany.name}`);

    // PRD-2026Q4 T0-10：状态实际发生变更（noop=false）时埋点；
    // 包在 try/catch，失败仅 logger.warn，不影响业务响应。
    if (prevStatus !== status) {
      const eventName = STATUS_TO_FUNNEL_EVENT[status];
      if (eventName) {
        try {
          funnelTracker.track(eventName, {
            user_id: app.user_id,
            entity_id: app.id,
            payload: { trial_id: app.trial_id, prev_status: prevStatus, source: 'cro' }
          });
        } catch (trackErr) {
          logger.warn('[CRO] 漏斗埋点失败（已吞）:', { id, status, error: trackErr.message });
        }
      }
    }

    res.json(success({ id, status }));
  } catch (err) {
    next(err);
  }
};

/**
 * CRO 添加备注
 */
const addCroNote = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { content } = req.body || {};
    const allowedTrials = req.croCompany.trial_ids || [];

    if (!content || !content.trim()) {
      return res.status(400).json(error('备注不能为空', 400));
    }

    const app = await TrialApplication.findByPk(id);
    if (!app || !allowedTrials.includes(app.trial_id)) {
      return res.status(403).json(error('无权操作', 403));
    }

    const notes = Array.isArray(app.notes) ? [...app.notes] : [];
    notes.push({
      content: content.trim(),
      operator: req.croCompany.name,
      createdAt: new Date().toISOString()
    });

    await app.update({ notes });
    res.json(success({ id: app.id, notes }));
  } catch (err) {
    next(err);
  }
};

/**
 * CRO 导出自己试验的线索
 */
// PRD-2026Q3 T0-1：导出表头固定顺序（CSV 第一行 / JSON rows 字段顺序）。
const EXPORT_HEADERS = [
  '申请ID', '状态', '申请时间', '患者昵称', '手机号',
  '诊断', '分期', '基因突变', '治疗线数', 'PD-L1',
  '城市', 'ECOG', '年龄', '性别', '备注', 'record_ids'
];

const maskPhoneCsv = (phone) => {
  if (!phone || typeof phone !== 'string') return '';
  if (phone.length < 8) return phone.replace(/\d/g, '*');
  return `${phone.slice(0, 3)}****${phone.slice(-4)}`;
};

/**
 * PRD-2026Q3 T0-1：CRO 多试验导出（CSV / JSON）+ unmask 审计。
 *   - trialIds：csv 或单 trialId（兼容老调用）；上限 20。
 *   - 任一 trialId 不在 croCompany.trial_ids → 403，且不查 DB。
 *   - unmask=true 时手机号明文 + 写 admin_audit_log；否则 138****1234 掩码。
 *   - cro_export_log 每次必写；admin_audit_log 仅 unmask=true。
 *   - 日期范围 from/to → created_at >=/< Op.gte/Op.lt。
 */
const exportCroApplications = async (req, res, next) => {
  try {
    const allowedTrials = (req.croCompany && req.croCompany.trial_ids) || [];
    const raw = req.query.trialIds || req.query.trialId;
    if (!raw || !String(raw).trim()) {
      return res.status(400).json(error('trialIds 不能为空', 400));
    }
    const trialIds = String(raw).split(',').map((s) => s.trim()).filter(Boolean);
    if (trialIds.length === 0) {
      return res.status(400).json(error('trialIds 不能为空', 400));
    }
    if (trialIds.length > 20) {
      return res.status(400).json(error('单次最多导出 20 个试验', 400));
    }
    const unauthorized = trialIds.filter((t) => !allowedTrials.includes(t));
    if (unauthorized.length > 0) {
      return res.status(403).json(error('无权导出', 403));
    }

    const { status, format = 'csv', unmask, from, to } = req.query;
    const wantUnmask = unmask === 'true' || unmask === true;

    const where = trialIds.length === 1
      ? { trial_id: trialIds[0] }
      : { trial_id: { [Op.in]: trialIds } };
    if (status) {
      const sl = String(status).split(',').map((s) => s.trim()).filter(Boolean);
      where.status = sl.length === 1 ? sl[0] : { [Op.in]: sl };
    }
    if (from || to) {
      const range = {};
      if (from) range[Op.gte] = new Date(from);
      if (to) range[Op.lt] = new Date(to);
      where.created_at = range;
    }

    const apps = await TrialApplication.findAll({
      where,
      include: [
        { model: User, attributes: ['id', 'nickname', 'phone'] },
        { model: Trial, attributes: ['id', 'name'] }
      ],
      order: [['created_at', 'DESC']]
    });

    const recordIds = [...new Set((apps || []).flatMap((a) => parseRecordIds(a.record_ids)))];
    const records = recordIds.length
      ? await MedicalRecord.findAll({ where: { id: { [Op.in]: recordIds } } })
      : [];
    const recordMap = (records || []).reduce((m, r) => { m[r.id] = r; return m; }, {});

    const rows = (apps || []).map((app) => {
      const rids = parseRecordIds(app.record_ids);
      const pr = rids.length ? recordMap[rids[0]] : null;
      const phone = (app.User && app.User.phone) || '';
      const structured = (pr && pr.structured) || {};
      return {
        '申请ID': app.id,
        '状态': APPLICATION_STATUS_TEXT[app.status] || app.status,
        '申请时间': app.created_at,
        '患者昵称': safeText(app.User && app.User.nickname),
        '手机号': wantUnmask ? phone : maskPhoneCsv(phone),
        '诊断': safeText(pr && pr.diagnosis),
        '分期': safeText(pr && pr.stage),
        '基因突变': safeText(pr && pr.gene_mutation),
        '治疗线数': (pr && pr.treatment_line) || '',
        'PD-L1': safeText(pr && pr.pdl1),
        '城市': safeText(structured.city),
        'ECOG': structured.ecog == null ? '' : String(structured.ecog),
        '年龄': structured.age == null ? '' : String(structured.age),
        '性别': safeText(structured.gender),
        '备注': (app.notes || []).map((n) => n.content).join('; '),
        'record_ids': rids.join('|')
      };
    });

    try {
      if (CroExportLog && typeof CroExportLog.create === 'function') {
        await CroExportLog.create({
          cro_id: (req.croCompany && req.croCompany.id) || null,
          trial_ids: trialIds,
          row_count: rows.length,
          format,
          unmask: !!wantUnmask,
          fields: { phone_full: !!wantUnmask },
          status_filter: status || null,
          from: from || null,
          to: to || null
        });
      }
    } catch (e) { logger.warn('[CRO] cro_export_log write 失败（已吞）', { err: e.message }); }

    if (wantUnmask) {
      try {
        if (AdminAuditLog && typeof AdminAuditLog.create === 'function') {
          await AdminAuditLog.create({
            admin_id: `cro:${(req.croCompany && req.croCompany.id) || 'unknown'}`,
            action: 'cro_export_unmask',
            target_type: 'cro_export',
            target_id: trialIds.join(','),
            payload: { trialIds, row_count: rows.length, format }
          });
        }
      } catch (e) { logger.warn('[CRO] admin_audit_log unmask write 失败（已吞）', { err: e.message }); }
    }

    if (format === 'json') {
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      return res.json(success({ trialIds, total: rows.length, rows }, 'ok'));
    }

    const headers = EXPORT_HEADERS;
    // PRD-2026Q4 T0-7 followup：每个 cell 走 escapeCsvCell（首字符为 = + - @ \t \r 时
    // 前缀单引号）—— 防止患者把 `=HYPERLINK(...)` 塞进昵称 / 备注 / 主诉，CRO 在
    // Excel 打开 leads_xxx.csv 时被公式劫持。Headers 是硬编码中文，不需要转义。
    const csv = [headers.join(','), ...rows.map((r) => headers.map((h) => escapeCsvCell(r[h])).join(','))].join('\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="leads_${trialIds.join('_')}.csv"`);
    return res.send(`\uFEFF${csv}`);
  } catch (err) {
    next(err);
  }
};

/**
 * CRO 获取自己的公司信息
 */
const getCroProfile = async (req, res, next) => {
  try {
    const c = req.croCompany;
    res.json(success({
      id: c.id,
      name: c.name,
      email: c.email,
      contactName: c.contact_name,
      trialIds: c.trial_ids || [],
      status: c.status
    }));
  } catch (err) {
    next(err);
  }
};

/**
 * PRD-2026Q3 T0-2：CRO 批量推进状态（最多 200 条）。
 * 单条失败不阻塞其它；返回每条的成功/失败明细。
 * 复用 updateCroApplicationStatus 的状态机 + funnelTracker 路径，循环调用即可。
 */
const bulkUpdateCroApplicationStatus = async (req, res, next) => {
  try {
    const { ids, status, remark } = req.body || {};
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ code: 400, message: 'ids 不能为空', data: null });
    }
    if (ids.length > 200) {
      return res.status(400).json({ code: 400, message: '单次最多 200 条', data: null });
    }
    if (!status || typeof status !== 'string') {
      return res.status(400).json({ code: 400, message: 'status 必填', data: null });
    }
    const stateMachine = require('../services/applicationStateMachine');
    const results = [];
    // 跨租户鉴权：与单条更新 updateCroApplicationStatus 同源——校验申请的 trial 属于本 CRO。
    // 旧实现依赖根本不存在的 req.croId / trial.cro_company_id 字段与 as:'trial' 别名：
    // 既是永不触发的死代码（鉴权漏洞），其 include 别名又会抛错让每条都失败。
    // 改用权威来源 req.croCompany.trial_ids 做归属校验，并以 req.croCompany.id 作审计 actor。
    const allowedTrials = (req.croCompany && req.croCompany.trial_ids) || [];
    for (const id of ids) {
      try {
        const app = await TrialApplication.findByPk(id);
        if (!app) { results.push({ id, ok: false, reason: 'not_found' }); continue; }
        if (!allowedTrials.includes(app.trial_id)) {
          results.push({ id, ok: false, reason: 'forbidden' });
          continue;
        }
        const prevStatus = app.status;
        const r = await stateMachine.transition(id, status, {
          actor: { type: 'cro', id: req.croCompany.id },
          reason: remark || null,
          extraFields: remark ? { remark } : {}
        });
        if (prevStatus !== status) {
          const eventName = STATUS_TO_FUNNEL_EVENT[status];
          if (eventName) {
            try {
              funnelTracker.track(eventName, {
                user_id: app.user_id,
                entity_id: app.id,
                payload: { trial_id: app.trial_id, prev_status: prevStatus, source: 'cro-bulk' }
              });
            } catch (_e) { /* 漏斗失败不影响主流程 */ }
          }
        }
        results.push({ id, ok: true, from: r.from, to: r.to });
      } catch (e) {
        results.push({ id, ok: false, reason: e instanceof stateMachine.InvalidTransitionError ? 'invalid_transition' : e.message });
      }
    }
    const okCount = results.filter((r) => r.ok).length;
    res.json(success({ total: ids.length, ok: okCount, failed: ids.length - okCount, results }, '批量更新完成'));
  } catch (err) {
    next(err);
  }
};

module.exports = {
  croLogin,
  getCroTrials,
  getCroApplications,
  updateCroApplicationStatus,
  bulkUpdateCroApplicationStatus,
  addCroNote,
  exportCroApplications,
  getCroProfile
};
