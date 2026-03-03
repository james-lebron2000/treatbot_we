const { Op } = require('sequelize');
const { TrialApplication, Trial, MedicalRecord } = require('../models');
const { success } = require('../utils/response');
const { BusinessError } = require('../middleware/errorHandler');
const logger = require('../utils/logger');
const { STATUS_TEXT_MAP } = require('../services/matchEngine');

const APPLICATION_STATUS_TEXT = {
  pending: '待联系',
  contacted: '已联系',
  enrolled: '已入组',
  rejected: '不符合',
  cancelled: '已取消'
};

const parseRecordIds = (value) => {
  if (Array.isArray(value)) {
    return value;
  }
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
      return [];
    }
  }
  return [];
};

const getDefaultRecordIds = async (userId) => {
  const rows = await MedicalRecord.findAll({
    where: {
      user_id: userId,
      status: 'completed'
    },
    attributes: ['id'],
    order: [['created_at', 'DESC']],
    limit: 3
  });
  return rows.map((item) => item.id);
};

const safeText = (value) => {
  if (value === undefined || value === null) {
    return '';
  }
  return `${value}`.trim();
};

const buildRemarkPayload = (remark, metadata) => {
  const source = safeText(remark);
  const hasMeta = metadata && Object.keys(metadata).length > 0;
  if (!hasMeta) {
    return source || null;
  }

  const serializedMeta = JSON.stringify(metadata);
  if (!source) {
    return serializedMeta;
  }
  return `${source}\n${serializedMeta}`;
};

/**
 * 提交报名
 */
const create = async (req, res, next) => {
  try {
    const {
      trialId,
      trial_id: trialIdAlias,
      recordIds,
      remark,
      name,
      disease,
      phone,
      trialName,
      trial_name: trialNameAlias,
      location,
      source
    } = req.body || {};
    const finalTrialId = trialId || trialIdAlias;

    if (!finalTrialId) {
      throw new BusinessError('缺少 trialId', 400);
    }

    const trial = await Trial.findByPk(finalTrialId);
    if (!trial) {
      throw new BusinessError('试验不存在', 404);
    }
    if (trial.status !== 'recruiting') {
      throw new BusinessError('该试验当前不可报名', 400);
    }

    const activeApplication = await TrialApplication.findOne({
      where: {
        user_id: req.userId,
        trial_id: finalTrialId,
        status: {
          [Op.in]: ['pending', 'contacted', 'enrolled']
        }
      }
    });
    if (activeApplication) {
      throw new BusinessError('您已报名该试验，请勿重复提交', 409);
    }

    const finalRecordIds = Array.isArray(recordIds) && recordIds.length
      ? recordIds
      : await getDefaultRecordIds(req.userId);

    if (!finalRecordIds.length) {
      throw new BusinessError('请先上传并完成解析至少一份病历', 400);
    }

    const validRecords = await MedicalRecord.count({
      where: {
        id: { [Op.in]: finalRecordIds },
        user_id: req.userId
      }
    });

    if (validRecords !== finalRecordIds.length) {
      throw new BusinessError('病历记录无效或无权限访问', 400);
    }

    const metadata = {
      name: safeText(name) || undefined,
      disease: safeText(disease) || undefined,
      phone: safeText(phone) || undefined,
      trialName: safeText(trialName || trialNameAlias || trial.name) || undefined,
      location: safeText(location) || undefined,
      source: safeText(source) || undefined
    };
    Object.keys(metadata).forEach((key) => {
      if (metadata[key] === undefined) {
        delete metadata[key];
      }
    });

    const application = await TrialApplication.create({
      user_id: req.userId,
      trial_id: finalTrialId,
      record_ids: finalRecordIds,
      contact_name: safeText(name) || null,
      contact_phone: safeText(phone) || null,
      disease_snapshot: safeText(disease) || null,
      client_source: safeText(source) || 'weapp',
      remark: buildRemarkPayload(remark, metadata),
      status: 'pending'
    });

    logger.info('新建报名:', {
      applicationId: application.id,
      userId: req.userId,
      trialId: finalTrialId
    });

    res.json(success({
      applicationId: application.id,
      trialId: trial.id,
      trialName: trial.name,
      status: 'pending',
      statusText: APPLICATION_STATUS_TEXT.pending,
      message: '报名成功，研究机构将在3个工作日内与您联系',
      createdAt: application.created_at
    }));
  } catch (err) {
    next(err);
  }
};

/**
 * 获取报名列表
 */
const getList = async (req, res, next) => {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const pageSize = Math.min(parseInt(req.query.pageSize, 10) || 20, 100);
    const offset = (page - 1) * pageSize;

    const { count, rows } = await TrialApplication.findAndCountAll({
      where: { user_id: req.userId },
      include: [
        {
          model: Trial,
          attributes: ['id', 'name', 'institution', 'contact_phone', 'status']
        }
      ],
      order: [['created_at', 'DESC']],
      limit: pageSize,
      offset
    });

    const list = rows.map((item) => ({
      id: item.id,
      trialId: item.trial_id,
      trialName: item.Trial?.name || '临床试验',
      institution: item.Trial?.institution || '待补充',
      trialStatus: item.Trial?.status || '',
      trialStatusText: item.Trial?.status ? (STATUS_TEXT_MAP[item.Trial.status] || item.Trial.status) : '',
      status: item.status,
      statusText: APPLICATION_STATUS_TEXT[item.status] || item.status,
      recordIds: parseRecordIds(item.record_ids),
      applyTime: item.created_at,
      contactPhone: item.contact_phone || item.Trial?.contact_phone || '',
      contactName: item.contact_name || '',
      disease: item.disease_snapshot || '',
      source: item.client_source || ''
    }));

    res.json({
      code: 0,
      message: 'success',
      data: list,
      pagination: {
        page,
        pageSize,
        total: count,
        hasMore: offset + rows.length < count
      }
    });
  } catch (err) {
    next(err);
  }
};

/**
 * 取消报名
 */
const cancel = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;

    const application = await TrialApplication.findOne({
      where: { id, user_id: req.userId }
    });

    if (!application) {
      return res.status(404).json({ code: 404, message: '报名记录不存在', data: null });
    }

    if (application.status === 'cancelled') {
      return res.status(400).json({ code: 400, message: '报名已取消', data: null });
    }

    await application.update({
      status: 'cancelled',
      remark: reason || application.remark
    });

    res.json(success(null, '取消成功'));
  } catch (err) {
    next(err);
  }
};

module.exports = {
  create,
  getList,
  cancel
};
