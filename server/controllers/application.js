const { Op, UniqueConstraintError } = require('sequelize');
const { sequelize, TrialApplication, Trial, MedicalRecord } = require('../models');
const { success } = require('../utils/response');
const { BusinessError } = require('../middleware/errorHandler');
const logger = require('../utils/logger');
const { STATUS_TEXT_MAP } = require('../services/matchEngine');
// PRD-2026Q4 T0-10：转化漏斗埋点
const funnelTracker = require('../services/funnelTracker');

// PRD-2026Q2 §2.5：把"同一用户 × 同一试验"在活跃状态下的唯一性固化到 DB。
// idempotency_key 列已存在 UNIQUE 约束；create 时写入确定性 key，
// cancel 时把 key 释放（改成非冲突值），允许重新报名。
const ACTIVE_STATUSES = ['pending', 'contacted', 'enrolled'];

const buildActiveIdempotencyKey = (userId, trialId) => {
  // 上限 64 字符，与模型列一致。取 hash 短串兜底超长 userId/trialId。
  const raw = `active_u_${userId}_t_${trialId}`;
  if (raw.length <= 64) return raw;
  const crypto = require('crypto');
  const hash = crypto.createHash('sha1').update(raw).digest('hex').slice(0, 16);
  return `active_${hash}`;
};

const releasedIdempotencyKey = (applicationId) => {
  return `released_${applicationId}_${Date.now()}`.slice(0, 64);
};

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
  // PRD-2026Q2 §3.5：默认报名病历集合排除软删除
  const rows = await MedicalRecord.findAll({
    where: {
      user_id: userId,
      status: 'completed',
      deleted_at: null
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
 *
 * PRD-2026Q2 §2.5：
 *  - 事务包裹 Trial + 活跃 application 查询 + create，使用行锁避免并发插入。
 *  - 写入 idempotency_key（确定性 = active_u_{user}_t_{trial}），UNIQUE 保底。
 *  - 捕获 UniqueConstraintError：有可能因为 Redis 幂等中间件未命中但 DB 约束抢先，
 *    这时视为已报名，返回 200 + 已有记录（幂等语义），而不是 500。
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

    const finalRecordIds = Array.isArray(recordIds) && recordIds.length
      ? recordIds
      : await getDefaultRecordIds(req.userId);

    if (!finalRecordIds.length) {
      throw new BusinessError('请先上传并完成解析至少一份病历', 400);
    }

    // PRD-2026Q2 §3.5：只认未软删除的病历，否则前端列表刷走了还能报名
    const validRecords = await MedicalRecord.count({
      where: {
        id: { [Op.in]: finalRecordIds },
        user_id: req.userId,
        deleted_at: null
      }
    });

    if (validRecords !== finalRecordIds.length) {
      throw new BusinessError('病历记录无效或无权限访问', 400);
    }

    const idempotencyKey = buildActiveIdempotencyKey(req.userId, finalTrialId);

    const buildPayload = (trial) => {
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
      return {
        user_id: req.userId,
        trial_id: finalTrialId,
        record_ids: finalRecordIds,
        contact_name: safeText(name) || null,
        contact_phone: safeText(phone) || null,
        disease_snapshot: safeText(disease) || null,
        client_source: safeText(source) || 'weapp',
        remark: buildRemarkPayload(remark, metadata),
        status: 'pending',
        idempotency_key: idempotencyKey
      };
    };

    const respondWithExisting = (trial, existing) => {
      res.json(success({
        applicationId: existing.id,
        trialId: trial.id,
        trialName: trial.name,
        status: existing.status,
        statusText: APPLICATION_STATUS_TEXT[existing.status] || existing.status,
        message: '您已报名该试验',
        createdAt: existing.created_at,
        duplicate: true
      }));
    };

    let trialForResponse;
    let created;
    try {
      const result = await sequelize.transaction(async (t) => {
        // 共享锁：阻止并发创建时 trial 被误置为 closed。
        const trial = await Trial.findByPk(finalTrialId, {
          transaction: t,
          lock: t.LOCK.SHARE
        });
        if (!trial) {
          throw new BusinessError('试验不存在', 404);
        }
        if (trial.status !== 'recruiting') {
          throw new BusinessError('该试验当前不可报名', 400);
        }

        // 更新锁：防止并发两个 create 都走到 create 步骤。
        const activeApplication = await TrialApplication.findOne({
          where: {
            user_id: req.userId,
            trial_id: finalTrialId,
            status: { [Op.in]: ACTIVE_STATUSES }
          },
          transaction: t,
          lock: t.LOCK.UPDATE
        });

        if (activeApplication) {
          return { trial, application: activeApplication, existed: true };
        }

        const application = await TrialApplication.create(buildPayload(trial), {
          transaction: t
        });
        return { trial, application, existed: false };
      });

      trialForResponse = result.trial;
      created = result;

      if (result.existed) {
        return respondWithExisting(result.trial, result.application);
      }
    } catch (err) {
      if (err instanceof UniqueConstraintError) {
        // 并发插入场景：另一个请求已经写入。回查一次，返回幂等结果。
        logger.warn('报名唯一约束命中，回查现有记录:', {
          userId: req.userId,
          trialId: finalTrialId,
          idempotencyKey
        });
        const trial = await Trial.findByPk(finalTrialId);
        const existing = await TrialApplication.findOne({
          where: {
            user_id: req.userId,
            trial_id: finalTrialId,
            status: { [Op.in]: ACTIVE_STATUSES }
          }
        });
        if (trial && existing) {
          return respondWithExisting(trial, existing);
        }
      }
      throw err;
    }

    logger.info('新建报名:', {
      applicationId: created.application.id,
      userId: req.userId,
      trialId: finalTrialId
    });

    // PRD-2026Q4 T0-10：申请创建成功 → APPLICATION_SUBMITTED。
    // 仅在 existed=false 路径触发，重复幂等命中不再二次计入漏斗。
    try {
      funnelTracker.track(funnelTracker.EVENTS.APPLICATION_SUBMITTED, {
        user_id: req.userId,
        entity_id: created.application.id,
        payload: { trial_id: finalTrialId, source: created.application.client_source || 'weapp' }
      });
    } catch (trackErr) {
      logger.warn('[application] 漏斗埋点失败（已吞）:', { error: trackErr.message });
    }

    res.json(success({
      applicationId: created.application.id,
      trialId: trialForResponse.id,
      trialName: trialForResponse.name,
      status: 'pending',
      statusText: APPLICATION_STATUS_TEXT.pending,
      message: '报名成功，研究机构将在3个工作日内与您联系',
      createdAt: created.application.created_at
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

    // PRD-2026Q3 T0-2：terminal 态不能再 cancel；统一目标态改为 'withdrawn'。
    const TERMINAL_STATUSES = ['withdrawn', 'cancelled', 'rejected', 'enrolled'];
    if (TERMINAL_STATUSES.includes(application.status)) {
      return res.status(400).json({ code: 400, message: '报名已处于终态，不能取消', data: null });
    }

    // PRD-2026Q3 T0-2：cancel 走状态机 transition()，落 application_status_event 事件。
    // PRD-2026Q2 §2.5：取消时把 idempotency_key 释放成非冲突值，让用户可以重新报名。
    const stateMachine = require('../services/applicationStateMachine');
    const result = await stateMachine.transition(application.id, 'withdrawn', {
      actor: { type: 'user', id: req.userId },
      reason: reason || null,
      extraFields: {
        idempotency_key: releasedIdempotencyKey(application.id),
        remark: reason || application.remark
      }
    });

    res.json(success({
      id: result.application.id,
      status: result.application.status,
      from: result.from
    }, '取消成功'));
  } catch (err) {
    next(err);
  }
};

/**
 * PRD-2026Q3 T0-2：用户查看自己报名的状态变更时间线（applicationStatusEvent 表回放）。
 * 仅自己 user_id 的 application 才能看；他人请求 → 404（不暴露存在性）。
 */
const getTimeline = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { TrialApplication } = require('../models');
    const stateMachine = require('../services/applicationStateMachine');
    const app = await TrialApplication.findOne({ where: { id, user_id: req.userId } });
    if (!app) {
      return res.status(404).json({ code: 404, message: '报名记录不存在', data: null });
    }
    const events = await stateMachine.getTimeline(id);
    res.json(success({ applicationId: id, events }, 'ok'));
  } catch (err) {
    next(err);
  }
};

module.exports = {
  create,
  getList,
  cancel,
  getTimeline
};
