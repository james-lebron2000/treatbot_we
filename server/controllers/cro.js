const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { Op, fn, col } = require('sequelize');
const { CroCompany, TrialApplication, Trial, User, MedicalRecord, sequelize } = require('../models');
const { success, error, pagination } = require('../utils/response');
const { safeText, escapeLike } = require('../utils/text');
const logger = require('../utils/logger');

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';
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

    await app.update({ status });
    logger.info(`[CRO] 状态更新: ${id} → ${status} by ${req.croCompany.name}`);
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
const exportCroApplications = async (req, res, next) => {
  try {
    const { trialId } = req.query;
    const allowedTrials = req.croCompany.trial_ids || [];

    if (!trialId || !allowedTrials.includes(trialId)) {
      return res.status(403).json(error('无权导出', 403));
    }

    const rows = await TrialApplication.findAll({
      where: { trial_id: trialId },
      include: [
        { model: User, attributes: ['id', 'nickname', 'phone'] },
        { model: Trial, attributes: ['id', 'name'] }
      ],
      order: [['created_at', 'DESC']]
    });

    const recordIds = [...new Set(rows.flatMap((a) => parseRecordIds(a.record_ids)))];
    const records = recordIds.length
      ? await MedicalRecord.findAll({ where: { id: { [Op.in]: recordIds } } })
      : [];
    const recordMap = records.reduce((m, r) => { m[r.id] = r; return m; }, {});

    const csvRows = rows.map((app) => {
      const rids = parseRecordIds(app.record_ids);
      const pr = rids.length ? recordMap[rids[0]] : null;
      return {
        '申请ID': app.id,
        '患者昵称': safeText(app.User?.nickname),
        '手机号': safeText(app.User?.phone),
        '诊断': safeText(pr?.diagnosis),
        '分期': safeText(pr?.stage),
        '基因突变': safeText(pr?.gene_mutation),
        '治疗线数': pr?.treatment_line || '',
        'PD-L1': safeText(pr?.pdl1),
        '状态': APPLICATION_STATUS_TEXT[app.status] || app.status,
        '申请时间': app.created_at,
        '备注': (app.notes || []).map((n) => n.content).join('; ')
      };
    });

    if (!csvRows.length) {
      return res.status(200).send('\uFEFF暂无数据');
    }

    const headers = Object.keys(csvRows[0]);
    const escape = (v) => `"${`${v ?? ''}`.replace(/"/g, '""')}"`;
    const csv = [headers.join(','), ...csvRows.map((r) => headers.map((h) => escape(r[h])).join(','))].join('\n');

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="trial_${trialId}_leads.csv"`);
    res.send(`\uFEFF${csv}`);
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

module.exports = {
  croLogin,
  getCroTrials,
  getCroApplications,
  updateCroApplicationStatus,
  addCroNote,
  exportCroApplications,
  getCroProfile
};
