const fs = require('fs/promises');
const path = require('path');
const dayjs = require('dayjs');
const { Op, fn, col } = require('sequelize');
const bcrypt = require('bcryptjs');
const {
  User,
  MedicalRecord,
  TrialApplication,
  Trial,
  CroCompany,
  AdminAuditLog,
  OcrJobFailure,
  UserFunnelEvent,
  sequelize
} = require('../models');
// PRD-2026Q2 §3.2：OCR DLQ 管理 API 调 queue.retryFailure 做手动重试
const queueService = require('../services/queue');
const { success, pagination } = require('../utils/response');
const logger = require('../utils/logger');
const ossService = require('../services/oss');
const { sanitizeTrial, safeText, escapeLike } = require('../utils/text');
const { parseArrayField, scoreRecordAgainstTrial, STATUS_TEXT_MAP } = require('../services/matchEngine');
// PRD-2026Q2 §2.4：试验新鲜度健康度视图
const trialFreshness = require('../services/trialFreshness');
// PRD-2026Q3 T0-2：状态机 + 通知 stub
const stateMachine = require('../services/applicationStateMachine');
const notify = require('../services/notify');
// PRD-2026Q4 T0-10：admin 推进状态时同样要触发漏斗事件，与 cro.updateApplicationStatus 共享同一份映射逻辑。
const funnelTracker = require('../services/funnelTracker');
const ADMIN_STATUS_TO_FUNNEL_EVENT = {
  contacted: funnelTracker.EVENTS.CRO_CONTACTED,
  screened: funnelTracker.EVENTS.SCREENED,
  enrolled: funnelTracker.EVENTS.ENROLLED,
  rejected: funnelTracker.EVENTS.REJECTED,
  withdrawn: funnelTracker.EVENTS.WITHDRAWN
};
// PRD-2026Q2 §2.3：PII 脱敏。list 响应出门前走一道 mask，reveal 单字段走审计日志旁路。
const { maskPhone, maskName } = require('../utils/mask');
// PRD-2026Q4 T0-7 followup（CSV formula injection / CWE-1236）：集中式 CSV 转义。
const { toCsv: csvSafeToCsv } = require('../utils/csvSafe');
const {
  ADMIN_TOKEN_EXPIRES_IN,
  getConfiguredAdmin,
  issueAdminToken,
  verifyAdminCredential
} = require('../utils/adminCredential');

const APPLICATION_STATUS_TEXT = {
  pending: '待联系',
  contacted: '已联系',
  enrolled: '已入组',
  rejected: '不符合',
  cancelled: '已取消'
};

const adminLogin = async (req, res, next) => {
  try {
    const { username, key } = req.body || {};
    if (!getConfiguredAdmin()) {
      return res.status(503).json({
        code: 503,
        message: '管理员登录未配置',
        data: null
      });
    }

    const result = verifyAdminCredential({ username, key });
    if (!result.ok) {
      logger.warn('[AdminLogin] 管理员登录失败', {
        username: safeText(username).slice(0, 64),
        reason: result.reason,
        ip: (req.headers['x-forwarded-for'] || req.ip || '').toString().split(',')[0].trim()
      });
      return res.status(401).json({
        code: 401,
        message: '管理员用户名或 key 不正确',
        data: null
      });
    }

    const token = issueAdminToken(result.admin);
    logger.info('[AdminLogin] 管理员登录成功', {
      username: result.admin.username,
      ip: (req.headers['x-forwarded-for'] || req.ip || '').toString().split(',')[0].trim()
    });

    return res.json(success({
      token,
      expiresIn: ADMIN_TOKEN_EXPIRES_IN,
      admin: {
        id: result.admin.id,
        username: result.admin.username,
        canReveal: result.admin.canReveal
      }
    }));
  } catch (err) {
    next(err);
  }
};

const getAdminSession = async (req, res, next) => {
  try {
    return res.json(success({
      admin: {
        id: req.adminUser?.id || req.userId,
        username: req.adminUser?.username || '',
        // PRD-2026Q3 T1-6：把当前角色暴露给前端，让管理后台按角色隐藏入口
        role: req.adminUser?.role || req.adminRole || null,
        canReveal: Boolean(req.adminUser?.canReveal)
      }
    }));
  } catch (err) {
    next(err);
  }
};

const MAX_EXPORT_MATCHES = 5;
const MAX_SCAN_TRIALS = 300;
const LOG_ROOT = path.join(__dirname, '..', 'logs');

const safeLower = (value) => safeText(value).toLowerCase();

const safeJson = (value) => {
  if (value === undefined || value === null || value === '') {
    return '';
  }
  try {
    return JSON.stringify(value);
  } catch (error) {
    return safeText(value);
  }
};

const toPositiveInt = (value, fallback) => {
  const num = parseInt(value, 10);
  if (Number.isNaN(num) || num <= 0) {
    return fallback;
  }
  return num;
};

const parseBooleanParam = (value) => {
  const normalized = safeLower(value);
  if (['1', 'true', 'yes', 'y'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'n'].includes(normalized)) return false;
  return null;
};

const normalizeDateRange = ({ date, startDate, endDate }) => {
  if (date) {
    const day = dayjs(date);
    if (day.isValid()) {
      return {
        start: day.startOf('day').toDate(),
        end: day.endOf('day').toDate(),
        label: day.format('YYYY-MM-DD')
      };
    }
  }

  if (startDate || endDate) {
    const start = startDate && dayjs(startDate).isValid() ? dayjs(startDate).startOf('day') : dayjs('1970-01-01').startOf('day');
    const end = endDate && dayjs(endDate).isValid() ? dayjs(endDate).endOf('day') : dayjs().endOf('day');
    return {
      start: start.toDate(),
      end: end.toDate(),
      label: `${start.format('YYYY-MM-DD')}_${end.format('YYYY-MM-DD')}`
    };
  }

  return null;
};

const applyDateRange = (where, query, field = 'created_at') => {
  const range = normalizeDateRange(query);
  if (!range) {
    return { where, range: null };
  }

  return {
    where: {
      ...where,
      [field]: {
        [Op.between]: [range.start, range.end]
      }
    },
    range
  };
};

const countByStatus = (rows) => rows.reduce((acc, item) => {
  const status = item.status || item.get?.('status') || 'unknown';
  const count = parseInt(item.get ? item.get('count') : item.count, 10) || 0;
  acc[status] = count;
  return acc;
}, {});

const mapDateCountRows = (rows) => rows.reduce((acc, item) => {
  const rawDate = item.get ? item.get('date') : item.date;
  const date = dayjs(rawDate).isValid() ? dayjs(rawDate).format('YYYY-MM-DD') : `${rawDate}`;
  acc[date] = parseInt(item.get ? item.get('count') : item.count, 10) || 0;
  return acc;
}, {});

const buildDailyTrend = ({ start, end, users, records, applications }) => {
  const result = [];
  let cursor = dayjs(start).startOf('day');
  const finalDay = dayjs(end).startOf('day');

  while (cursor.isBefore(finalDay) || cursor.isSame(finalDay)) {
    const date = cursor.format('YYYY-MM-DD');
    result.push({
      date,
      users: users[date] || 0,
      records: records[date] || 0,
      applications: applications[date] || 0
    });
    cursor = cursor.add(1, 'day');
  }

  return result;
};

// PRD-2026Q4 T0-7 followup（CSV formula injection / CWE-1236）：
// 老实现只 `"`-quote 单元格但没处理首字符 `= + - @` —— Excel 仍按公式求值。
// 现在统一走 utils/csvSafe.toCsv：所有命中 FORMULA_TRIGGERS 的单元格自动前缀 `'`。
// 包装薄薄一层只是为了保留旧签名 toCsv(rows) 不破坏既有调用点。
const toCsv = (rows) => csvSafeToCsv(rows);

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

const getTrialCandidates = async () => {
  const rows = await Trial.findAll({
    where: { status: 'recruiting' },
    attributes: [
      'id', 'name', 'phase', 'type', 'indication', 'institution', 'location', 'description',
      'inclusion_criteria', 'exclusion_criteria', 'contact_phone', 'status', 'updated_at'
    ],
    order: [['updated_at', 'DESC']],
    limit: MAX_SCAN_TRIALS
  });

  return rows.map((row) => sanitizeTrial(row));
};

const buildRecordMatches = (record, trials) => {
  if (!record || !trials.length) {
    return [];
  }

  const source = {
    diagnosis: safeText(record.diagnosis),
    stage: safeText(record.stage),
    gene_mutation: safeText(record.gene_mutation)
  };

  return trials
    .map((trial) => {
      const scored = scoreRecordAgainstTrial(source, trial);
      if (!scored || scored.score < 40) {
        return null;
      }
      return {
        trialId: trial.id,
        name: safeText(trial.name),
        score: scored.score,
        phase: safeText(trial.phase) || '未标注',
        location: safeText(trial.location) || '待补充',
        institution: safeText(trial.institution) || '待补充',
        indication: safeText(trial.indication) || '待补充',
        status: trial.status,
        statusText: STATUS_TEXT_MAP[trial.status] || trial.status,
        inclusion: parseArrayField(trial.inclusion_criteria),
        exclusion: parseArrayField(trial.exclusion_criteria),
        reasons: scored.reasons || []
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_EXPORT_MATCHES);
};

const buildApplicationIndex = (applications) => applications.reduce((acc, item) => {
  for (const recordId of parseRecordIds(item.record_ids)) {
    if (!acc[recordId]) {
      acc[recordId] = [];
    }
    acc[recordId].push({
      applicationId: item.id,
      trialId: item.trial_id,
      trialName: safeText(item.Trial?.name),
      status: item.status,
      statusText: APPLICATION_STATUS_TEXT[item.status] || item.status,
      createdAt: item.created_at,
      remark: safeText(item.remark)
    });
  }
  return acc;
}, {});

const buildRecordPayload = async (record, req, options = {}) => {
  const { trials = [], applicationsByRecordId = {} } = options;
  const structured = record.structured && typeof record.structured === 'object' ? record.structured : null;
  const entities = structured?.entities && typeof structured.entities === 'object' ? structured.entities : {};
  const matches = buildRecordMatches(record, trials);
  const fileUrl = await ossService.getRequestAwareUrl(record.file_key, req, 12 * 3600);
  const applications = applicationsByRecordId[record.id] || [];

  return {
    recordId: record.id,
    uploadTime: record.created_at,
    parseStatus: record.status,
    userId: record.user_id,
    userNickname: maskName(safeText(record.User?.nickname)),
    userPhone: maskPhone(safeText(record.User?.phone)),
    fileType: safeText(record.type),
    fileKey: safeText(record.file_key),
    fileUrl,
    fileSize: record.file_size || 0,
    diagnosis: safeText(record.diagnosis),
    stage: safeText(record.stage),
    geneMutation: safeText(record.gene_mutation),
    treatment: safeText(record.treatment),
    structured,
    entities,
    matchCount: matches.length,
    matches,
    applicationCount: applications.length,
    applications,
    remark: safeText(record.remark),
    updatedAt: record.updated_at
  };
};

const flattenRecordPayload = (item) => ({
  upload_date: dayjs(item.uploadTime).format('YYYY-MM-DD HH:mm:ss'),
  record_id: item.recordId,
  parse_status: item.parseStatus,
  user_id: item.userId,
  user_nickname: item.userNickname,
  user_phone: item.userPhone,
  file_type: item.fileType,
  file_key: item.fileKey,
  file_url: item.fileUrl,
  file_size: item.fileSize,
  diagnosis: item.diagnosis,
  stage: item.stage,
  gene_mutation: item.geneMutation,
  treatment: item.treatment,
  structured_json: safeJson(item.structured),
  top_matches_json: safeJson(item.matches),
  applications_json: safeJson(item.applications),
  remark: item.remark,
  updated_at: dayjs(item.updatedAt).format('YYYY-MM-DD HH:mm:ss')
});

const flattenUserPayload = (item) => ({
  created_at: dayjs(item.createdAt).format('YYYY-MM-DD HH:mm:ss'),
  user_id: item.userId,
  nickname: item.nickname,
  phone: item.phone,
  openid: item.openid,
  avatar_url: item.avatarUrl,
  record_count: item.recordCount,
  completed_record_count: item.completedRecordCount,
  application_count: item.applicationCount,
  latest_record_id: item.latestRecordId,
  latest_diagnosis: item.latestDiagnosis,
  latest_matches_json: safeJson(item.latestMatches),
  records_json: safeJson(item.records),
  applications_json: safeJson(item.applications)
});

const sendExport = (res, { format, filename, jsonData, csvRows }) => {
  if (format === 'csv') {
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}.csv"`);
    return res.send(`\uFEFF${toCsv(csvRows)}`);
  }

  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}.json"`);
  return res.send(JSON.stringify(jsonData, null, 2));
};

const getDashboardStats = async (req, res, next) => {
  try {
    const today = dayjs().startOf('day');
    const last7Start = dayjs().subtract(6, 'day').startOf('day');
    const now = dayjs().endOf('day');
    const trendRange = normalizeDateRange(req.query) || {
      start: last7Start.toDate(),
      end: now.toDate(),
      label: 'last_7_days'
    };
    const trendWhere = {
      created_at: {
        [Op.between]: [trendRange.start, trendRange.end]
      }
    };
    const activeRecordWhere = { deleted_at: null };
    const [
      totalUsers,
      activeUsers,
      uploadedUsers,
      totalRecords,
      totalApplications,
      todayUsers,
      todayRecords,
      todayApplications,
      last7Users,
      last7Records,
      last7Applications,
      appliedUsers
    ] = await Promise.all([
      User.count(),
      User.count({ where: { deleted_at: null } }),
      MedicalRecord.count({
        where: activeRecordWhere,
        distinct: true,
        col: 'user_id'
      }),
      MedicalRecord.count({ where: activeRecordWhere }),
      TrialApplication.count(),
      User.count({ where: { created_at: { [Op.gte]: today.toDate() } } }),
      MedicalRecord.count({ where: { ...activeRecordWhere, created_at: { [Op.gte]: today.toDate() } } }),
      TrialApplication.count({ where: { created_at: { [Op.gte]: today.toDate() } } }),
      User.count({ where: { created_at: { [Op.gte]: last7Start.toDate() } } }),
      MedicalRecord.count({ where: { ...activeRecordWhere, created_at: { [Op.gte]: last7Start.toDate() } } }),
      TrialApplication.count({ where: { created_at: { [Op.gte]: last7Start.toDate() } } }),
      TrialApplication.count({ distinct: true, col: 'user_id' })
    ]);

    const [
      recordStatusDistribution,
      applicationStatusDistribution,
      userTrendRows,
      recordTrendRows,
      applicationTrendRows,
      funnelRows,
      recentErrorRecords
    ] = await Promise.all([
      MedicalRecord.findAll({
        where: activeRecordWhere,
        attributes: ['status', [fn('COUNT', col('*')), 'count']],
        group: ['status']
      }),
      TrialApplication.findAll({
        attributes: ['status', [fn('COUNT', col('*')), 'count']],
        group: ['status']
      }),
      User.findAll({
        where: trendWhere,
        attributes: [[fn('DATE', col('created_at')), 'date'], [fn('COUNT', col('id')), 'count']],
        group: [fn('DATE', col('created_at'))],
        raw: true
      }),
      MedicalRecord.findAll({
        where: { ...activeRecordWhere, ...trendWhere },
        attributes: [[fn('DATE', col('created_at')), 'date'], [fn('COUNT', col('id')), 'count']],
        group: [fn('DATE', col('created_at'))],
        raw: true
      }),
      TrialApplication.findAll({
        where: trendWhere,
        attributes: [[fn('DATE', col('created_at')), 'date'], [fn('COUNT', col('id')), 'count']],
        group: [fn('DATE', col('created_at'))],
        raw: true
      }),
      UserFunnelEvent
        ? UserFunnelEvent.findAll({
            where: trendWhere,
            attributes: ['event', [fn('COUNT', col('*')), 'count']],
            group: ['event'],
            raw: true
          })
        : Promise.resolve([]),
      MedicalRecord.findAll({
        where: { ...activeRecordWhere, status: 'error' },
        include: [{ model: User, attributes: ['id', 'nickname', 'phone'] }],
        order: [['updated_at', 'DESC']],
        limit: 5
      })
    ]);

    const statusCounts = countByStatus(recordStatusDistribution);
    const completedRecords = statusCounts.completed || 0;
    const errorRecords = statusCounts.error || 0;
    const pendingRecords = statusCounts.pending || 0;
    const runningRecords = statusCounts.running || 0;
    const processingRecords = pendingRecords + runningRecords;
    const successRate = totalRecords ? Number(((completedRecords / totalRecords) * 100).toFixed(1)) : 0;
    const errorRate = totalRecords ? Number(((errorRecords / totalRecords) * 100).toFixed(1)) : 0;

    const funnelMap = funnelRows.reduce((acc, item) => {
      acc[item.event] = parseInt(item.count, 10) || 0;
      return acc;
    }, {});
    const applicationSubmitted = funnelMap.application_submitted || 0;
    const uploadSuccess = funnelMap.upload_success || 0;

    res.json(success({
      range: {
        label: trendRange.label,
        startDate: dayjs(trendRange.start).format('YYYY-MM-DD'),
        endDate: dayjs(trendRange.end).format('YYYY-MM-DD')
      },
      overview: {
        totalUsers,
        activeUsers,
        uploadedUsers,
        totalRecords,
        completedRecords,
        errorRecords,
        pendingRecords,
        runningRecords,
        processingRecords,
        totalApplications,
        todayUsers,
        todayRecords,
        todayApplications,
        last7Users,
        last7Records,
        last7Applications,
        appliedUsers
      },
      recordStatus: recordStatusDistribution.map((item) => ({
        status: item.status,
        count: parseInt(item.get('count'), 10)
      })),
      applicationStatus: applicationStatusDistribution.map((item) => ({
        status: item.status,
        count: parseInt(item.get('count'), 10)
      })),
      dailyTrend: buildDailyTrend({
        start: trendRange.start,
        end: trendRange.end,
        users: mapDateCountRows(userTrendRows),
        records: mapDateCountRows(recordTrendRows),
        applications: mapDateCountRows(applicationTrendRows)
      }),
      funnel: {
        landingView: funnelMap.landing_view || 0,
        uploadStart: funnelMap.upload_start || 0,
        uploadSuccess,
        matchView: funnelMap.match_view || 0,
        trialApply: funnelMap.trial_apply || 0,
        applicationSubmitted,
        uploadedUsers,
        appliedUsers,
        uploadToApplicationRate: uploadSuccess
          ? Number(((applicationSubmitted / uploadSuccess) * 100).toFixed(1))
          : 0
      },
      dataQuality: {
        parseSuccessRate: successRate,
        parseErrorRate: errorRate,
        pendingRecords,
        runningRecords,
        errorRecords,
        recentErrors: recentErrorRecords.map((record) => ({
          recordId: record.id,
          userId: record.user_id,
          userNickname: maskName(safeText(record.User?.nickname)),
          userPhone: maskPhone(safeText(record.User?.phone)),
          fileType: safeText(record.type),
          diagnosis: safeText(record.diagnosis),
          updatedAt: record.updated_at
        }))
      }
    }));
  } catch (err) {
    next(err);
  }
};

const getUserList = async (req, res, next) => {
  try {
    const page = toPositiveInt(req.query.page, 1);
    const pageSize = Math.min(toPositiveInt(req.query.pageSize, 20), 100);
    const { keyword } = req.query;
    const includeDeleted = parseBooleanParam(req.query.includeDeleted) === true;
    const hasRecords = parseBooleanParam(req.query.hasRecords);

    let where = includeDeleted ? {} : { deleted_at: null };
    if (keyword) {
      where[Op.or] = [
        { id: { [Op.like]: `%${escapeLike(keyword)}%` } },
        { nickname: { [Op.like]: `%${escapeLike(keyword)}%` } },
        { phone: { [Op.like]: `%${escapeLike(keyword)}%` } }
      ];
    }

    ({ where } = applyDateRange(where, req.query));

    if (hasRecords !== null) {
      const recordUserRows = await MedicalRecord.findAll({
        where: { deleted_at: null },
        attributes: ['user_id'],
        group: ['user_id'],
        raw: true
      });
      const userIdsWithRecords = recordUserRows.map((item) => item.user_id).filter(Boolean);
      if (hasRecords) {
        where.id = { [Op.in]: userIdsWithRecords.length ? userIdsWithRecords : ['__none__'] };
      } else if (userIdsWithRecords.length) {
        where.id = { [Op.notIn]: userIdsWithRecords };
      }
    }

    const { count, rows } = await User.findAndCountAll({
      where,
      attributes: ['id', 'openid', 'nickname', 'avatar_url', 'phone', 'created_at', 'deleted_at'],
      order: [['created_at', 'DESC']],
      limit: pageSize,
      offset: (page - 1) * pageSize
    });

    const userIds = rows.map((u) => u.id);

    // 批量查询代替 N+1
    const [recordStats, appCounts, latestRecords] = userIds.length ? await Promise.all([
      MedicalRecord.findAll({
        where: { user_id: { [Op.in]: userIds }, deleted_at: null },
        attributes: ['user_id', [fn('COUNT', col('id')), 'total'], [fn('SUM', sequelize.literal("status = 'completed'")), 'completed']],
        group: ['user_id'],
        raw: true
      }),
      TrialApplication.findAll({
        where: { user_id: { [Op.in]: userIds } },
        attributes: ['user_id', [fn('COUNT', col('id')), 'cnt']],
        group: ['user_id'],
        raw: true
      }),
      sequelize.query(
        `SELECT mr.user_id, mr.id, mr.diagnosis FROM medical_records mr
         INNER JOIN (SELECT user_id, MAX(created_at) as max_ct FROM medical_records WHERE user_id IN (:ids) AND deleted_at IS NULL GROUP BY user_id) latest
         ON mr.user_id = latest.user_id AND mr.created_at = latest.max_ct
         WHERE mr.user_id IN (:ids) AND mr.deleted_at IS NULL`,
        { replacements: { ids: userIds }, type: sequelize.QueryTypes.SELECT }
      )
    ]) : [[], [], []];

    const recordStatsMap = recordStats.reduce((m, r) => { m[r.user_id] = r; return m; }, {});
    const appCountMap = appCounts.reduce((m, r) => { m[r.user_id] = Number(r.cnt); return m; }, {});
    const latestRecordMap = latestRecords.reduce((m, r) => { m[r.user_id] = r; return m; }, {});

    // PRD-2026Q2 §2.3：list 响应中 phone 必须脱敏，明文只走 revealField 旁路。
    const usersWithStats = rows.map((user) => {
      const rs = recordStatsMap[user.id] || {};
      const lr = latestRecordMap[user.id];
      return {
        userId: user.id,
        openid: user.openid,
        nickname: maskName(safeText(user.nickname)),
        avatarUrl: safeText(user.avatar_url),
        phone: maskPhone(safeText(user.phone)),
        createdAt: user.created_at,
        deletedAt: user.deleted_at,
        recordCount: Number(rs.total) || 0,
        completedRecordCount: Number(rs.completed) || 0,
        applicationCount: appCountMap[user.id] || 0,
        latestRecordId: lr?.id || '',
        latestDiagnosis: safeText(lr?.diagnosis)
      };
    });

    res.json(pagination(usersWithStats, {
      page,
      pageSize,
      total: count,
      hasMore: page * pageSize < count
    }));
  } catch (err) {
    next(err);
  }
};

const getRecordList = async (req, res, next) => {
  try {
    const page = toPositiveInt(req.query.page, 1);
    const pageSize = Math.min(toPositiveInt(req.query.pageSize, 20), 100);
    const offset = (page - 1) * pageSize;
    const keyword = safeText(req.query.keyword);
    const status = safeText(req.query.status);
    const userId = safeText(req.query.userId);

    let where = { deleted_at: null };
    if (status) {
      where.status = status;
    }
    if (userId) {
      where.user_id = userId;
    }
    if (keyword) {
      const like = `%${escapeLike(keyword)}%`;
      where[Op.or] = [
        { id: { [Op.like]: like } },
        { diagnosis: { [Op.like]: like } },
        { stage: { [Op.like]: like } },
        { gene_mutation: { [Op.like]: like } },
        { treatment: { [Op.like]: like } },
        { '$User.nickname$': { [Op.like]: like } },
        { '$User.phone$': { [Op.like]: like } }
      ];
    }

    ({ where } = applyDateRange(where, req.query));

    const include = [{
      model: User,
      attributes: ['id', 'nickname', 'phone'],
      required: false
    }];

    const { count, rows } = await MedicalRecord.findAndCountAll({
      where,
      include,
      distinct: true,
      subQuery: false,
      order: [['created_at', 'DESC']],
      limit: pageSize,
      offset
    });

    const recordIds = rows.map((item) => item.id);
    const [trials, applications] = await Promise.all([
      getTrialCandidates(),
      recordIds.length
        ? TrialApplication.findAll({
            where: {
              [Op.or]: recordIds.map((recordId) => ({
                record_ids: { [Op.like]: `%${recordId}%` }
              }))
            },
            include: [{ model: Trial, attributes: ['id', 'name'] }],
            order: [['created_at', 'DESC']]
          })
        : Promise.resolve([])
    ]);

    const applicationsByRecordId = buildApplicationIndex(applications);
    const list = await Promise.all(rows.map((item) => buildRecordPayload(item, req, { trials, applicationsByRecordId })));

    res.json(pagination(list, {
      page,
      pageSize,
      total: count,
      hasMore: page * pageSize < count
    }));
  } catch (err) {
    next(err);
  }
};

const getApplicationList = async (req, res, next) => {
  try {
    const page = toPositiveInt(req.query.page, 1);
    const pageSize = Math.min(toPositiveInt(req.query.pageSize, 100), 200);
    const { status, trialId, groupByStatus } = req.query;

    let where = {};
    if (status) where.status = status;
    if (trialId) where.trial_id = trialId;
    ({ where } = applyDateRange(where, req.query));

    const { count, rows } = await TrialApplication.findAndCountAll({
      where,
      include: [
        { model: User, attributes: ['id', 'nickname', 'phone'] },
        { model: Trial, attributes: ['id', 'name', 'institution', 'indication'] }
      ],
      order: [['created_at', 'DESC']],
      limit: pageSize,
      offset: (page - 1) * pageSize
    });

    // 批量获取患者诊断摘要
    const recordIds = [...new Set(rows.flatMap((app) => parseRecordIds(app.record_ids)))];
    const records = recordIds.length
      ? await MedicalRecord.findAll({
          where: { id: { [Op.in]: recordIds } },
          attributes: ['id', 'diagnosis', 'stage', 'gene_mutation', 'treatment_line', 'pdl1']
        })
      : [];
    const recordMap = records.reduce((m, r) => { m[r.id] = r; return m; }, {});

    const applications = rows.map((app) => {
      const rids = parseRecordIds(app.record_ids);
      const primaryRecord = rids.length ? recordMap[rids[0]] : null;
      return {
        id: app.id,
        userId: app.user_id,
        // PRD-2026Q2 §2.3：list 响应必须脱敏
        userName: maskName(safeText(app.User?.nickname)) || '未知用户',
        userPhone: maskPhone(safeText(app.User?.phone)),
        trialId: app.trial_id,
        trialName: safeText(app.Trial?.name),
        institution: safeText(app.Trial?.institution),
        indication: safeText(app.Trial?.indication),
        status: app.status,
        statusText: APPLICATION_STATUS_TEXT[app.status] || app.status,
        diagnosis: safeText(primaryRecord?.diagnosis),
        stage: safeText(primaryRecord?.stage),
        geneMutation: safeText(primaryRecord?.gene_mutation),
        treatmentLine: primaryRecord?.treatment_line || null,
        pdl1: safeText(primaryRecord?.pdl1),
        notes: app.notes || [],
        remark: safeText(app.remark),
        createdAt: app.created_at,
        updatedAt: app.updated_at
      };
    });

    if (groupByStatus === 'true') {
      const grouped = {};
      for (const s of ['pending', 'contacted', 'enrolled', 'rejected', 'cancelled']) {
        grouped[s] = applications.filter((a) => a.status === s);
      }
      return res.json(success({ grouped, total: count }));
    }

    res.json(pagination(applications, {
      page,
      pageSize,
      total: count,
      hasMore: page * pageSize < count
    }));
  } catch (err) {
    next(err);
  }
};

const updateApplicationStatus = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { status, remark, reason } = req.body;

    const application = await TrialApplication.findByPk(id);
    if (!application) {
      return res.status(404).json({ code: 404, message: '报名记录不存在', data: null });
    }

    try {
      const result = await stateMachine.transition(id, status, {
        actor: { type: 'admin', id: req.userId },
        reason: reason || remark || null,
        extraFields: remark ? { remark } : {}
      });

      notify.applicationStatusChanged({
        applicationId: id, from: result.from, to: result.to,
        actor: { type: 'admin', id: req.userId }, reason: reason || remark
      }).catch((e) => logger.warn('[notify] admin 状态通知失败', { err: e.message }));

      // PRD-2026Q4 T0-10：admin 推进状态也触发漏斗事件（与 cro 路径并行）
      if (result.from !== result.to) {
        const eventName = ADMIN_STATUS_TO_FUNNEL_EVENT[result.to];
        if (eventName) {
          try {
            funnelTracker.track(eventName, {
              user_id: result.application.user_id,
              entity_id: result.application.id,
              payload: { trial_id: result.application.trial_id, prev_status: result.from, source: 'admin' }
            });
          } catch (trackErr) {
            logger.warn('[admin] 漏斗埋点失败（已吞）:', { id, status, error: trackErr.message });
          }
        }
      }

      logger.info('报名状态已更新:', {
        applicationId: id, oldStatus: result.from, newStatus: result.to, operator: req.userId
      });

      res.json(success({
        id: result.application.id,
        status: result.application.status,
        from: result.from,
        updatedAt: result.application.updated_at
      }, '状态更新成功'));
    } catch (e) {
      if (e instanceof stateMachine.InvalidTransitionError) {
        return res.status(422).json({ code: 422, message: e.message, data: null });
      }
      throw e;
    }
  } catch (err) {
    next(err);
  }
};

/**
 * PRD-2026Q3 T0-2：申请状态变更时间线（admin 复核）。
 * 路由：GET /api/admin/applications/:id/timeline
 */
const getApplicationTimeline = async (req, res, next) => {
  try {
    const { id } = req.params;
    const application = await TrialApplication.findByPk(id);
    if (!application) {
      return res.status(404).json({ code: 404, message: '报名记录不存在', data: null });
    }
    const events = await stateMachine.getTimeline(id);
    res.json(success({
      applicationId: id,
      currentStatus: application.status,
      events: events.map((e) => ({
        id: e.id,
        from: e.from_status,
        to: e.to_status,
        actorType: e.actor_type,
        actorId: e.actor_id,
        reason: e.reason,
        createdAt: e.created_at
      }))
    }));
  } catch (err) {
    next(err);
  }
};

const getSystemLogs = async (req, res, next) => {
  try {
    const level = safeLower(req.query.level);
    const limit = Math.min(toPositiveInt(req.query.limit, 100), 500);
    let files = [];

    try {
      files = await fs.readdir(LOG_ROOT);
    } catch (error) {
      if (error.code === 'ENOENT') {
        return res.json(success([]));
      }
      throw error;
    }

    const candidates = files
      .filter((name) => name.endsWith('.log'))
      .sort()
      .reverse()
      .slice(0, 5);

    const lines = [];
    for (const file of candidates) {
      const content = await fs.readFile(path.join(LOG_ROOT, file), 'utf8');
      const fileLines = content.split('\n').filter(Boolean).slice(-500).reverse();
      for (const line of fileLines) {
        if (lines.length >= limit) {
          break;
        }
        try {
          const parsed = JSON.parse(line);
          if (level && safeLower(parsed.level) !== level) {
            continue;
          }
          lines.push(parsed);
        } catch (error) {
          lines.push({ level: 'info', message: line, timestamp: null });
        }
      }
      if (lines.length >= limit) {
        break;
      }
    }

    res.json(success(lines));
  } catch (err) {
    next(err);
  }
};

const exportRecords = async (req, res, next) => {
  try {
    const format = safeLower(req.query.format) === 'csv' ? 'csv' : 'json';
    let where = { deleted_at: null };
    let range = null;
    ({ where, range } = applyDateRange(where, req.query));

    const rows = await MedicalRecord.findAll({
      where,
      include: [{ model: User, attributes: ['id', 'nickname', 'phone'] }],
      order: [['created_at', 'DESC']]
    });

    const recordIds = rows.map((item) => item.id);
    const [trials, applications] = await Promise.all([
      getTrialCandidates(),
      recordIds.length
        ? TrialApplication.findAll({
            where: {
              [Op.or]: recordIds.map((recordId) => ({ record_ids: { [Op.like]: `%${recordId}%` } }))
            },
            include: [{ model: Trial, attributes: ['id', 'name'] }],
            order: [['created_at', 'DESC']]
          })
        : Promise.resolve([])
    ]);

    const applicationsByRecordId = buildApplicationIndex(applications);
    const payload = await Promise.all(rows.map((item) => buildRecordPayload(item, req, { trials, applicationsByRecordId })));
    const filename = `treatbot_records_${range?.label || 'all'}_${dayjs().format('YYYYMMDD_HHmmss')}`;

    return sendExport(res, {
      format,
      filename,
      jsonData: {
        exportedAt: new Date().toISOString(),
        exportedBy: req.adminUser?.id || req.userId,
        scope: range?.label || 'all',
        total: payload.length,
        items: payload
      },
      csvRows: payload.map(flattenRecordPayload)
    });
  } catch (err) {
    next(err);
  }
};

const exportUsers = async (req, res, next) => {
  try {
    const format = safeLower(req.query.format) === 'csv' ? 'csv' : 'json';
    let where = {};
    let range = null;
    ({ where, range } = applyDateRange(where, req.query));

    const users = await User.findAll({
      where,
      attributes: ['id', 'openid', 'nickname', 'avatar_url', 'phone', 'created_at'],
      order: [['created_at', 'DESC']]
    });

    const userIds = users.map((user) => user.id);
    const [records, applications, trials] = await Promise.all([
      userIds.length
        ? MedicalRecord.findAll({
            where: { user_id: { [Op.in]: userIds }, deleted_at: null },
            order: [['created_at', 'DESC']]
          })
        : Promise.resolve([]),
      userIds.length
        ? TrialApplication.findAll({
            where: { user_id: { [Op.in]: userIds } },
            include: [{ model: Trial, attributes: ['id', 'name'] }],
            order: [['created_at', 'DESC']]
          })
        : Promise.resolve([]),
      getTrialCandidates()
    ]);

    const recordsByUserId = records.reduce((acc, item) => {
      if (!acc[item.user_id]) {
        acc[item.user_id] = [];
      }
      acc[item.user_id].push(item);
      return acc;
    }, {});

    const applicationsByUserId = applications.reduce((acc, item) => {
      if (!acc[item.user_id]) {
        acc[item.user_id] = [];
      }
      acc[item.user_id].push({
        applicationId: item.id,
        trialId: item.trial_id,
        trialName: safeText(item.Trial?.name),
        recordIds: parseRecordIds(item.record_ids),
        status: item.status,
        statusText: APPLICATION_STATUS_TEXT[item.status] || item.status,
        createdAt: item.created_at
      });
      return acc;
    }, {});

    const payload = users.map((user) => {
      const userRecords = recordsByUserId[user.id] || [];
      const latestRecord = userRecords[0] || null;
      return {
        userId: user.id,
        openid: user.openid,
        // PRD-2026Q2 §2.3：export 导出也要默认脱敏，reveal 通过 revealField 旁路按字段授权
        nickname: maskName(safeText(user.nickname)),
        avatarUrl: safeText(user.avatar_url),
        phone: maskPhone(safeText(user.phone)),
        createdAt: user.created_at,
        recordCount: userRecords.length,
        completedRecordCount: userRecords.filter((item) => item.status === 'completed').length,
        applicationCount: (applicationsByUserId[user.id] || []).length,
        latestRecordId: latestRecord?.id || '',
        latestDiagnosis: safeText(latestRecord?.diagnosis),
        latestMatches: latestRecord ? buildRecordMatches(latestRecord, trials) : [],
        records: userRecords.map((item) => ({
          id: item.id,
          status: item.status,
          diagnosis: safeText(item.diagnosis),
          stage: safeText(item.stage),
          geneMutation: safeText(item.gene_mutation),
          createdAt: item.created_at
        })),
        applications: applicationsByUserId[user.id] || []
      };
    });

    const filename = `treatbot_users_${range?.label || 'all'}_${dayjs().format('YYYYMMDD_HHmmss')}`;
    return sendExport(res, {
      format,
      filename,
      jsonData: {
        exportedAt: new Date().toISOString(),
        exportedBy: req.adminUser?.id || req.userId,
        scope: range?.label || 'all',
        total: payload.length,
        items: payload
      },
      csvRows: payload.map(flattenUserPayload)
    });
  } catch (err) {
    next(err);
  }
};

const exportApplications = async (req, res, next) => {
  try {
    const format = safeLower(req.query.format) === 'csv' ? 'csv' : 'json';
    const { trialId } = req.query;
    let where = {};
    let _range = null;
    ({ where, range: _range } = applyDateRange(where, req.query));
    if (trialId) {
      where.trial_id = trialId;
    }

    const applications = await TrialApplication.findAll({
      where,
      include: [
        { model: Trial, attributes: ['id', 'name', 'indication', 'institution', 'sponsor'] },
        { model: User, attributes: ['id', 'nickname', 'phone'] }
      ],
      order: [['created_at', 'DESC']]
    });

    const recordIds = [...new Set(applications.flatMap((a) => parseRecordIds(a.record_ids)))];
    const records = recordIds.length
      ? await MedicalRecord.findAll({ where: { id: { [Op.in]: recordIds } } })
      : [];
    const recordMap = records.reduce((m, r) => { m[r.id] = r; return m; }, {});

    const payload = applications.map((app) => {
      const rids = parseRecordIds(app.record_ids);
      const primaryRecord = rids.length ? recordMap[rids[0]] : null;
      let meta = {};
      try { meta = app.remark ? JSON.parse(app.remark) : {}; } catch { meta = {}; }

      return {
        applicationId: app.id,
        trialId: app.trial_id,
        trialName: safeText(app.Trial?.name),
        trialIndication: safeText(app.Trial?.indication),
        trialInstitution: safeText(app.Trial?.institution),
        trialSponsor: safeText(app.Trial?.sponsor),
        status: app.status,
        statusText: APPLICATION_STATUS_TEXT[app.status] || app.status,
        // PRD-2026Q2 §2.3：export 默认脱敏
        patientName: maskName(safeText(meta.name || app.contact_name)),
        patientPhone: maskPhone(safeText(meta.phone || app.contact_phone || app.User?.phone)),
        patientNickname: maskName(safeText(app.User?.nickname)),
        diagnosis: safeText(primaryRecord?.diagnosis || meta.disease || app.disease_snapshot),
        stage: safeText(primaryRecord?.stage),
        geneMutation: safeText(primaryRecord?.gene_mutation),
        treatmentLine: primaryRecord?.treatment_line || '',
        pdl1: safeText(primaryRecord?.pdl1),
        appliedAt: app.created_at,
        source: app.client_source || ''
      };
    });

    const filename = `treatbot_applications_${trialId || 'all'}_${dayjs().format('YYYYMMDD_HHmmss')}`;
    return sendExport(res, {
      format,
      filename,
      jsonData: {
        exportedAt: new Date().toISOString(),
        exportedBy: req.adminUser?.id || req.userId,
        trialId: trialId || 'all',
        total: payload.length,
        items: payload
      },
      csvRows: payload
    });
  } catch (err) {
    next(err);
  }
};

const getAdminTrials = async (req, res, next) => {
  try {
    const trials = await Trial.findAll({
      attributes: ['id', 'name', 'indication', 'institution', 'status', 'sponsor'],
      order: [['updated_at', 'DESC']]
    });

    // 批量统计每个试验的申请数
    const appCounts = await TrialApplication.findAll({
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

    // 有申请的排前面
    list.sort((a, b) => b.applicationCount - a.applicationCount);

    res.json(success(list));
  } catch (err) {
    next(err);
  }
};

const addApplicationNote = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { content } = req.body || {};

    if (!content || !content.trim()) {
      return res.status(400).json({ code: 400, message: '备注内容不能为空', data: null });
    }

    const app = await TrialApplication.findByPk(id);
    if (!app) {
      return res.status(404).json({ code: 404, message: '申请不存在', data: null });
    }

    const notes = Array.isArray(app.notes) ? [...app.notes] : [];
    notes.push({
      content: content.trim(),
      operator: req.userId,
      createdAt: new Date().toISOString()
    });

    await app.update({ notes });

    res.json(success({ id: app.id, notes }));
  } catch (err) {
    next(err);
  }
};

// ===== CRO 公司管理 =====

const getCroList = async (req, res, next) => {
  try {
    const rows = await CroCompany.findAll({ order: [['created_at', 'DESC']] });
    const list = rows.map((c) => ({
      id: c.id,
      name: c.name,
      contactName: c.contact_name,
      email: c.email,
      trialIds: c.trial_ids || [],
      trialCount: (c.trial_ids || []).length,
      status: c.status,
      createdAt: c.created_at
    }));
    res.json(success(list));
  } catch (err) {
    next(err);
  }
};

const createCro = async (req, res, next) => {
  try {
    const { name, contactName, email, password, trialIds } = req.body || {};
    if (!name || !email || !password) {
      return res.status(400).json({ code: 400, message: '公司名、邮箱、密码必填', data: null });
    }

    const existing = await CroCompany.findOne({ where: { email: email.toLowerCase().trim() } });
    if (existing) {
      return res.status(400).json({ code: 400, message: '该邮箱已注册', data: null });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const company = await CroCompany.create({
      name: name.trim(),
      contact_name: contactName || '',
      email: email.toLowerCase().trim(),
      password_hash: passwordHash,
      trial_ids: Array.isArray(trialIds) ? trialIds : [],
      status: 'active'
    });

    logger.info(`[Admin] 创建 CRO: ${company.name} (${company.email})`);
    res.json(success({ id: company.id, name: company.name, email: company.email }));
  } catch (err) {
    next(err);
  }
};

const updateCro = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { name, contactName, email, password, trialIds, status } = req.body || {};

    const company = await CroCompany.findByPk(id);
    if (!company) {
      return res.status(404).json({ code: 404, message: 'CRO 不存在', data: null });
    }

    const updates = {};
    if (name) updates.name = name.trim();
    if (contactName !== undefined) updates.contact_name = contactName;
    if (email) updates.email = email.toLowerCase().trim();
    if (password) updates.password_hash = await bcrypt.hash(password, 10);
    if (Array.isArray(trialIds)) updates.trial_ids = trialIds;
    if (status && ['active', 'disabled'].includes(status)) updates.status = status;

    await company.update(updates);
    logger.info(`[Admin] 更新 CRO: ${company.name} (${company.id})`);
    res.json(success({ id: company.id, name: company.name }));
  } catch (err) {
    next(err);
  }
};

/**
 * PRD-2026Q2 §2.3：按字段揭示明文 PII。
 *
 * GET /admin/users/:id/reveal?field=phone
 * - 默认仅支持 phone / real_name / id_card 三个字段
 * - 通过 env `ADMIN_MFA_BYPASS=true` 放行（MFA 真集成 TODO）
 * - 即使命中成功也会通过 auditLog middleware 写一条 reveal_field_phone 记录，
 *   外加此函数内部单独记一条 action 级审计行（防 middleware 被摘掉仍留痕）。
 */
const REVEAL_ALLOWED_FIELDS = new Set(['phone', 'real_name', 'id_card']);

const revealField = async (req, res, next) => {
  try {
    const { id } = req.params;
    const field = safeText(req.query.field);

    if (!REVEAL_ALLOWED_FIELDS.has(field)) {
      return res.status(400).json({ code: 400, message: '字段不支持揭示', data: null });
    }

    // TODO(PRD-2026Q2 §2.3 后续)：接入邮箱 OTP / TOTP MFA，移除 ADMIN_MFA_BYPASS。
    const mfaBypass = process.env.ADMIN_MFA_BYPASS === 'true' || req.adminCredential?.canReveal === true;
    if (!mfaBypass) {
      return res.status(403).json({ code: 403, message: '需要 MFA 验证', data: null });
    }

    const user = await User.findByPk(id, { attributes: ['id', 'phone', 'nickname'] });
    if (!user) {
      return res.status(404).json({ code: 404, message: '用户不存在', data: null });
    }

    // 额外写一条带 target 的审计行（防 middleware 漏记）
    try {
      await AdminAuditLog.create({
        admin_id: req.adminUser?.id || req.userId || 'unknown',
        action: `reveal_field_${field}`,
        target_type: 'user',
        target_id: id,
        query_summary: JSON.stringify({ field }),
        ip: (req.headers['x-forwarded-for'] || req.ip || '').toString().split(',')[0].trim().slice(0, 64),
        user_agent: (req.headers['user-agent'] || '').toString().slice(0, 255)
      });
    } catch (auditError) {
      logger.warn('[revealField] 审计写入失败', { error: auditError.message });
    }

    let value = '';
    if (field === 'phone') value = safeText(user.phone);
    else if (field === 'real_name') value = safeText(user.nickname);
    else if (field === 'id_card') value = '';

    return res.json(success({ userId: id, field, value }));
  } catch (err) {
    next(err);
  }
};

// ===== PRD-2026Q2 §3.2：OCR DLQ 管理 =====

const listOcrFailures = async (req, res, next) => {
  try {
    const page = toPositiveInt(req.query.page, 1);
    const pageSize = Math.min(toPositiveInt(req.query.pageSize, 20), 100);
    const errorType = safeText(req.query.error_type);

    const where = {};
    if (errorType) {
      where.error_type = errorType;
    }

    const { count, rows } = await OcrJobFailure.findAndCountAll({
      where,
      order: [['created_at', 'DESC']],
      limit: pageSize,
      offset: (page - 1) * pageSize
    });

    const list = rows.map((row) => ({
      id: Number(row.id),
      jobId: row.job_id,
      recordId: row.record_id,
      errorType: row.error_type,
      errorMessage: row.error_message,
      payload: row.payload,
      retried: row.retried,
      createdAt: row.created_at,
      lastRetriedAt: row.last_retried_at
    }));

    return res.paginated(list, {
      page,
      pageSize,
      total: count,
      hasMore: page * pageSize < count
    });
  } catch (err) {
    next(err);
  }
};

const retryOcrFailure = async (req, res, next) => {
  try {
    const { id } = req.params;
    const result = await queueService.retryFailure(id);
    logger.info('[Admin] DLQ 手动重试:', { failureId: id, operator: req.userId, ...result });
    return res.ok({ queued: true, ...result });
  } catch (err) {
    if (err && err.code === 404) {
      return res.fail('DLQ 记录不存在', 404);
    }
    next(err);
  }
};

/**
 * PRD-2026Q2 §2.4：试验新鲜度健康度视图。
 *
 * GET /admin/trials/health →
 *   { stale14d, stale30d, autoClosedLast24h, lastRun }
 *
 * 前端 AdminView 的 UI 展示留给 W4，这里只提供数据接口。
 */
const getTrialsHealth = async (req, res, next) => {
  try {
    const snapshot = await trialFreshness.getHealthSnapshot();
    return res.ok(snapshot);
  } catch (err) {
    next(err);
  }
};

/**
 * Phase E.4：单用户的匹配视图。
 * 给运营人员排查「这个家属问匹配出错了」时用 —— 一次拿到该用户的全部 record + 已匹配 trial 列表 + 该用户的报名状态。
 *
 *   GET /admin/users/:id/matches?topN=10
 *
 * 行为：
 *   - 拿用户全部未删除 records（不限于 completed，便于看到 pending/error 状态）
 *   - 拉招募中试验做评分（复用 buildRecordMatches）
 *   - 跨多 record 聚合：同一 trialId 取最高分 + 合并 reasons + 标记来源 record id
 *   - 同时返回 timelineService 的时间线，便于运营在后台直接看到「疾病和治疗经过」
 */
const getUserMatches = async (req, res, next) => {
  try {
    // Phase E.6 / Review #2：诊断/分期/治疗等 PHI 默认脱敏，明文需 ADMIN_MFA_BYPASS=true 旁路（与 revealField 同口径）。
    // 待 PRD-2026Q2 §2.3 后续：接入真 MFA 后移除 bypass。
    const mfaBypass = process.env.ADMIN_MFA_BYPASS === 'true';
    const wantReveal = `${req.query.reveal || ''}` === '1';
    if (wantReveal && !mfaBypass) {
      return res.status(403).json({ code: 403, message: '查看明文 PHI 需要 MFA（暂未开通）', data: null });
    }

    const userId = req.params.id;
    const topN = Math.min(toPositiveInt(req.query.topN, 10), 50);
    // Phase E.6 / Review #11：默认不跑 timeline（同步 LLM 5-10s），需要时显式 ?withTimeline=1。
    const wantTimeline = `${req.query.withTimeline || ''}` === '1';

    const user = await User.findOne({
      where: { id: userId },
      attributes: ['id', 'nickname', 'phone', 'created_at']
    });
    if (!user) {
      return res.status(404).json({ code: 404, message: '用户不存在', data: null });
    }

    const records = await MedicalRecord.findAll({
      where: { user_id: userId, deleted_at: null },
      attributes: [
        'id', 'diagnosis', 'stage', 'gene_mutation', 'treatment',
        'treatment_line', 'pdl1', 'structured', 'status', 'created_at'
      ],
      order: [['created_at', 'DESC']],
      limit: 50
    });

    // 字段脱敏：默认每个字段截短到 100 字符 + 中段打码；reveal=1 + bypass 才返回明文。
    const phiField = (value) => {
      const text = safeText(value);
      if (wantReveal) return text.slice(0, 200);
      if (!text) return '';
      // 简易脱敏：保留首 4 + 末 2 字符，中间打码
      if (text.length <= 6) return '***';
      return `${text.slice(0, 4)}***${text.slice(-2)}`;
    };

    if (!records.length) {
      return res.ok({
        user: {
          id: user.id,
          nickname: maskName(safeText(user.nickname)),
          phone: maskPhone(safeText(user.phone))
        },
        records: [],
        matches: [],
        timeline: null,
        revealed: wantReveal
      });
    }

    // 跨 record 跑评分；同一 trial 留最高分
    const trials = await getTrialCandidates();
    const bestByTrial = new Map(); // trialId → match item
    for (const record of records) {
      const matches = buildRecordMatches(record, trials);
      for (const m of matches) {
        const key = String(m.trialId);
        const cur = bestByTrial.get(key);
        if (!cur || m.score > cur.score) {
          bestByTrial.set(key, { ...m, sourceRecordIds: [record.id] });
        } else if (cur.score === m.score) {
          if (!cur.sourceRecordIds.includes(record.id)) {
            cur.sourceRecordIds.push(record.id);
          }
        }
      }
    }
    const matches = Array.from(bestByTrial.values())
      .sort((a, b) => b.score - a.score)
      .slice(0, topN);

    // 同时跑 timelineService（仅 completed records 才送进 LLM）。
    // Phase E.6 / Review #4：admin 路径下传 restorePii=false，避免 LLM 把占位符还原成真姓名/电话泄漏给 admin。
    // Phase E.6 / Review #11：默认不跑（同步 LLM 太慢），需要时 ?withTimeline=1。
    let timeline = null;
    if (wantTimeline) {
      try {
        const timelineService = require('../services/timelineService');
        const completedRecords = records.filter((r) => r.status === 'completed');
        if (completedRecords.length >= 2) {
          timeline = await timelineService.generateTimeline(completedRecords, { restorePii: false });
        }
      } catch (timelineErr) {
        logger.warn('admin getUserMatches timelineService 失败，跳过时间线', {
          userId, error: timelineErr.message
        });
      }
    }

    res.ok({
      user: {
        id: user.id,
        nickname: maskName(safeText(user.nickname)),
        phone: maskPhone(safeText(user.phone)),
        createdAt: user.created_at
      },
      records: records.map((r) => ({
        recordId: r.id,
        uploadTime: r.created_at,
        parseStatus: r.status,
        diagnosis: phiField(r.diagnosis),
        stage: phiField(r.stage),
        geneMutation: phiField(r.gene_mutation),
        treatment: phiField(r.treatment)
      })),
      matches,
      timeline,
      revealed: wantReveal
    });
  } catch (err) {
    next(err);
  }
};

// PRD-2026Q3 T1-4：CPA 月度对账接口
// 仅 super 角色可访问（路由层 requireRole('super')），输出 SQL 同源结果。
// format=csv 时直接返回带 BOM 的 CSV 文本，便于财务直接打开 Excel 核对。
const getBillingSummary = async (req, res, next) => {
  try {
    const month = String(req.query.month || '').trim();
    const format = String(req.query.format || 'json').toLowerCase();

    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
      return res.status(400).json({ code: 400, msg: 'month 必填，格式 YYYY-MM' });
    }
    if (!['json', 'csv'].includes(format)) {
      return res.status(400).json({ code: 400, msg: 'format 仅支持 csv|json' });
    }

    const billing = require('../services/billing');
    const summary = await billing.computeMonthly(month);

    if (format === 'csv') {
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="billing-${month}.csv"`);
      return res.send(billing.toCsv(summary));
    }

    return res.json(success(summary));
  } catch (err) {
    logger.error('[admin] getBillingSummary failed', { err: err.message });
    next(err);
  }
};

// PRD-2026Q4 T0-1：trialCrawler null 守门复核队列
// 列表（默认 pending）：
//   GET /api/admin/trials/field-review?status=pending&limit=50
const getTrialFieldReviewQueue = async (req, res, next) => {
  try {
    const { TrialFieldChangeReview } = require('../models');
    const allowedStatus = ['pending', 'approved', 'rejected'];
    const status = allowedStatus.includes(String(req.query.status)) ? req.query.status : 'pending';
    const limit = Math.min(parseInt(req.query.limit, 10) || 50, 200);

    const rows = await TrialFieldChangeReview.findAll({
      where: { status },
      order: [['created_at', 'DESC']],
      limit
    });
    return res.json({ data: rows, total: rows.length });
  } catch (err) {
    logger.error('[admin] getTrialFieldReviewQueue failed', { err: err.message });
    next(err);
  }
};

// PRD-2026Q4 T0-1：复核某条 review。
//   POST /api/admin/trials/field-review/:id/resolve
//   body: { decision: 'approved' | 'rejected', note?: string }
//
// approved 语义：确认上游确实把字段清空了（试验停了 / 名额清零 / 站点撤了），
//   显式把 trials 表的对应列写为 row.new_value（通常是 null）。
// rejected 语义：上游抽风，库内值保持。仅打 status='rejected'。
//
// 全程在事务里跑，先 lock review 行避免双人同时点。
const resolveTrialFieldReview = async (req, res, next) => {
  const { TrialFieldChangeReview, Trial, sequelize } = require('../models');
  const { id } = req.params;
  const { decision, note } = req.body || {};

  if (!['approved', 'rejected'].includes(decision)) {
    return res.status(400).json({ code: 'INVALID_DECISION', message: 'decision 必须是 approved | rejected' });
  }

  // PRD-2026Q4 T0-1：locations 在 trials 表是 hospitals 列；其余字段一一对应。
  const FIELD_TRIAL_COL = {
    status: 'status',
    phase: 'phase',
    enrolled_count: 'enrolled_count',
    locations: 'hospitals'
  };

  const txn = await sequelize.transaction();
  try {
    const row = await TrialFieldChangeReview.findByPk(id, { transaction: txn, lock: txn.LOCK.UPDATE });
    if (!row) {
      await txn.rollback();
      return res.status(404).json({ code: 'NOT_FOUND', message: '复核条目不存在' });
    }
    if (row.status !== 'pending') {
      await txn.rollback();
      return res.status(409).json({ code: 'ALREADY_RESOLVED', message: '已处理' });
    }

    if (decision === 'approved') {
      const col = FIELD_TRIAL_COL[row.field];
      if (!col) {
        await txn.rollback();
        return res.status(400).json({ code: 'UNSUPPORTED_FIELD', message: `不支持的字段: ${row.field}` });
      }
      await Trial.update(
        { [col]: row.new_value },
        { where: { id: row.trial_id }, transaction: txn }
      );
    }

    await row.update({
      status: decision,
      reviewer_id: (req.adminUser && req.adminUser.username) || (req.adminUser && req.adminUser.id) || 'unknown',
      reviewed_at: new Date(),
      reviewer_note: typeof note === 'string' ? note.slice(0, 512) : null
    }, { transaction: txn });

    await txn.commit();
    return res.json({ ok: true });
  } catch (e) {
    try { await txn.rollback(); } catch (_) {}
    logger.error('[admin] resolveTrialFieldReview failed', { err: e.message, id });
    return res.status(500).json({ error: e.message });
  }
};

module.exports = {
  adminLogin,
  getAdminSession,
  getDashboardStats,
  getUserList,
  revealField,
  getRecordList,
  getUserMatches,
  getApplicationList,
  updateApplicationStatus,
  getApplicationTimeline,
  getSystemLogs,
  exportRecords,
  exportUsers,
  exportApplications,
  getAdminTrials,
  addApplicationNote,
  getCroList,
  createCro,
  updateCro,
  listOcrFailures,
  retryOcrFailure,
  getTrialsHealth,
  getBillingSummary,
  // PRD-2026Q4 T0-1：trialCrawler null 守门复核
  getTrialFieldReviewQueue,
  resolveTrialFieldReview
};
