const fs = require('fs/promises');
const path = require('path');
const dayjs = require('dayjs');
const { Op, fn, col } = require('sequelize');
const bcrypt = require('bcryptjs');
const { User, MedicalRecord, TrialApplication, Trial, CroCompany, sequelize } = require('../models');
const { success, pagination } = require('../utils/response');
const logger = require('../utils/logger');
const ossService = require('../services/oss');
const { sanitizeTrial, safeText, escapeLike } = require('../utils/text');
const { parseArrayField, scoreRecordAgainstTrial, STATUS_TEXT_MAP } = require('../services/matchEngine');

const APPLICATION_STATUS_TEXT = {
  pending: '待联系',
  contacted: '已联系',
  enrolled: '已入组',
  rejected: '不符合',
  cancelled: '已取消'
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

const toCsv = (rows) => {
  if (!rows.length) {
    return '';
  }

  const headers = Array.from(rows.reduce((set, row) => {
    Object.keys(row).forEach((key) => set.add(key));
    return set;
  }, new Set()));

  const escapeCell = (value) => {
    const text = value === undefined || value === null ? '' : `${value}`;
    return `"${text.replace(/"/g, '""')}"`;
  };

  const body = rows.map((row) => headers.map((key) => escapeCell(row[key])).join(','));
  return `${headers.join(',')}\n${body.join('\n')}`;
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
    userNickname: safeText(record.User?.nickname),
    userPhone: safeText(record.User?.phone),
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
    const today = dayjs().startOf('day').toDate();
    const [
      totalUsers,
      totalRecords,
      totalApplications,
      todayUsers,
      todayRecords,
      todayApplications
    ] = await Promise.all([
      User.count(),
      MedicalRecord.count(),
      TrialApplication.count(),
      User.count({ where: { created_at: { [Op.gte]: today } } }),
      MedicalRecord.count({ where: { created_at: { [Op.gte]: today } } }),
      TrialApplication.count({ where: { created_at: { [Op.gte]: today } } })
    ]);

    const recordStatusDistribution = await MedicalRecord.findAll({
      attributes: ['status', [fn('COUNT', col('*')), 'count']],
      group: ['status']
    });

    const applicationStatusDistribution = await TrialApplication.findAll({
      attributes: ['status', [fn('COUNT', col('*')), 'count']],
      group: ['status']
    });

    res.json(success({
      overview: {
        totalUsers,
        totalRecords,
        totalApplications,
        todayUsers,
        todayRecords,
        todayApplications
      },
      recordStatus: recordStatusDistribution.map((item) => ({
        status: item.status,
        count: parseInt(item.get('count'), 10)
      })),
      applicationStatus: applicationStatusDistribution.map((item) => ({
        status: item.status,
        count: parseInt(item.get('count'), 10)
      }))
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

    let where = {};
    if (keyword) {
      where[Op.or] = [
        { nickname: { [Op.like]: `%${escapeLike(keyword)}%` } },
        { phone: { [Op.like]: `%${escapeLike(keyword)}%` } }
      ];
    }

    ({ where } = applyDateRange(where, req.query));

    const { count, rows } = await User.findAndCountAll({
      where,
      attributes: ['id', 'openid', 'nickname', 'avatar_url', 'phone', 'created_at'],
      order: [['created_at', 'DESC']],
      limit: pageSize,
      offset: (page - 1) * pageSize
    });

    const userIds = rows.map((u) => u.id);

    // 批量查询代替 N+1
    const [recordStats, appCounts, latestRecords] = userIds.length ? await Promise.all([
      MedicalRecord.findAll({
        where: { user_id: { [Op.in]: userIds } },
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
         INNER JOIN (SELECT user_id, MAX(created_at) as max_ct FROM medical_records WHERE user_id IN (:ids) GROUP BY user_id) latest
         ON mr.user_id = latest.user_id AND mr.created_at = latest.max_ct
         WHERE mr.user_id IN (:ids)`,
        { replacements: { ids: userIds }, type: sequelize.QueryTypes.SELECT }
      )
    ]) : [[], [], []];

    const recordStatsMap = recordStats.reduce((m, r) => { m[r.user_id] = r; return m; }, {});
    const appCountMap = appCounts.reduce((m, r) => { m[r.user_id] = Number(r.cnt); return m; }, {});
    const latestRecordMap = latestRecords.reduce((m, r) => { m[r.user_id] = r; return m; }, {});

    const usersWithStats = rows.map((user) => {
      const rs = recordStatsMap[user.id] || {};
      const lr = latestRecordMap[user.id];
      return {
        userId: user.id,
        openid: user.openid,
        nickname: safeText(user.nickname),
        avatarUrl: safeText(user.avatar_url),
        phone: safeText(user.phone),
        createdAt: user.created_at,
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

    let where = {};
    if (status) {
      where.status = status;
    }

    ({ where } = applyDateRange(where, req.query));

    const include = [{
      model: User,
      attributes: ['id', 'nickname', 'phone'],
      required: Boolean(keyword),
      where: keyword ? {
        [Op.or]: [
          { nickname: { [Op.like]: `%${escapeLike(keyword)}%` } },
          { phone: { [Op.like]: `%${escapeLike(keyword)}%` } }
        ]
      } : undefined
    }];

    const { count, rows } = await MedicalRecord.findAndCountAll({
      where,
      include,
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
        userName: safeText(app.User?.nickname) || '未知用户',
        userPhone: safeText(app.User?.phone),
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
    const { status, remark } = req.body;

    const application = await TrialApplication.findByPk(id);
    if (!application) {
      return res.status(404).json({ code: 404, message: '报名记录不存在', data: null });
    }

    const oldStatus = application.status;
    await application.update({
      status,
      remark: remark || application.remark
    });

    logger.info('报名状态已更新:', {
      applicationId: id,
      oldStatus,
      newStatus: status,
      operator: req.userId
    });

    res.json(success({
      id: application.id,
      status: application.status,
      updatedAt: application.updated_at
    }, '状态更新成功'));
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
    let where = {};
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
            where: { user_id: { [Op.in]: userIds } },
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
        nickname: safeText(user.nickname),
        avatarUrl: safeText(user.avatar_url),
        phone: safeText(user.phone),
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
    let range = null;
    ({ where, range } = applyDateRange(where, req.query));
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
        patientName: safeText(meta.name || app.contact_name),
        patientPhone: safeText(meta.phone || app.contact_phone || app.User?.phone),
        patientNickname: safeText(app.User?.nickname),
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

module.exports = {
  getDashboardStats,
  getUserList,
  getRecordList,
  getApplicationList,
  updateApplicationStatus,
  getSystemLogs,
  exportRecords,
  exportUsers,
  exportApplications,
  getAdminTrials,
  addApplicationNote,
  getCroList,
  createCro,
  updateCro
};
