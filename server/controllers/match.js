const { Op } = require('sequelize');
const { Trial, MedicalRecord } = require('../models');
const { success, pagination } = require('../utils/response');
const { BusinessError } = require('../middleware/errorHandler');
const { matchRecordsToTrials, parseArrayField, scoreRecordAgainstTrial, STATUS_TEXT_MAP, matchDiseaseText } = require('../services/matchEngine');

const MAX_SCAN_TRIALS = 300;

const toPositiveInt = (value, fallback) => {
  const num = parseInt(value, 10);
  if (Number.isNaN(num) || num <= 0) {
    return fallback;
  }
  return num;
};

const safeText = (value) => `${value || ''}`.trim();

const parseFilters = (value) => {
  if (!value) {
    return {};
  }

  if (typeof value === 'object') {
    return value;
  }

  if (typeof value !== 'string') {
    return {};
  }

  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (error) {
    throw new BusinessError('filters 必须是合法 JSON 字符串', 400);
  }
};

const normalizeMatchFilters = (input = {}) => ({
  disease: safeText(input.disease || input.diagnosis),
  stage: safeText(input.stage),
  city: safeText(input.city || input.location),
  gene_mutation: safeText(input.gene_mutation || input.geneMutation)
});

const getTrialSearchText = (trial) => {
  const inclusion = trial.inclusion_criteria || trial.inclusion;
  const exclusion = trial.exclusion_criteria || trial.exclusion;
  return [
    trial.name,
    trial.indication,
    trial.description,
    trial.location,
    ...(parseArrayField(inclusion)),
    ...(parseArrayField(exclusion))
  ]
    .join(' ')
    .toLowerCase();
};

const trialMatchesFilters = (trial, filters) => {
  const trialText = getTrialSearchText(trial);
  const disease = safeText(filters.disease).toLowerCase();
  const stage = safeText(filters.stage).toLowerCase();
  const geneMutation = safeText(filters.gene_mutation).toLowerCase();

  if (disease && !matchDiseaseText(disease, trialText).matched) {
    return false;
  }
  if (stage && !trialText.includes(stage)) {
    return false;
  }
  if (geneMutation && !trialText.includes(geneMutation)) {
    return false;
  }
  return true;
};

const hasProfileFilters = (filters) => {
  return Boolean(filters.disease || filters.stage || filters.gene_mutation);
};

const getProfileRecordFromFilters = (filters) => {
  return {
    diagnosis: filters.disease || '',
    stage: filters.stage || '',
    gene_mutation: filters.gene_mutation || ''
  };
};

const getUserCompletedRecords = async (userId) => {
  return MedicalRecord.findAll({
    where: {
      user_id: userId,
      status: 'completed'
    },
    attributes: ['id', 'diagnosis', 'stage', 'gene_mutation', 'created_at'],
    order: [['created_at', 'DESC']]
  });
};

const buildDetailedMatchItem = (trial, scored) => ({
  id: trial.id,
  trialId: trial.id,
  name: trial.name,
  score: scored.score,
  phase: trial.phase || '未标注',
  location: trial.location || '待补充',
  type: trial.type || '未标注',
  indication: trial.indication || '待补充',
  institution: trial.institution || '待补充',
  status: trial.status,
  statusText: STATUS_TEXT_MAP[trial.status] || trial.status,
  reasons: scored.reasons || ['已根据病历基础信息进行规则匹配'],
  inclusion: parseArrayField(trial.inclusion_criteria),
  exclusion: parseArrayField(trial.exclusion_criteria),
  contact: {
    name: '研究中心',
    phone: trial.contact_phone || '',
    email: ''
  },
  updatedAt: trial.updated_at
});

/**
 * 获取匹配列表
 */
const getMatches = async (req, res, next) => {
  try {
    const page = toPositiveInt(req.query.page, 1);
    const pageSize = Math.min(toPositiveInt(req.query.pageSize, 20), 100);
    const offset = (page - 1) * pageSize;
    const recordId = safeText(req.query.recordId);
    const filters = normalizeMatchFilters(parseFilters(req.query.filters));

    let profileRecords = [];
    if (recordId) {
      const record = await MedicalRecord.findOne({
        where: {
          id: recordId,
          user_id: req.userId
        },
        attributes: ['id', 'diagnosis', 'stage', 'gene_mutation', 'status']
      });
      if (!record) {
        throw new BusinessError('病历不存在或无权限访问', 404);
      }
      profileRecords = [record];
    } else if (hasProfileFilters(filters)) {
      profileRecords = [getProfileRecordFromFilters(filters)];
    } else {
      profileRecords = await getUserCompletedRecords(req.userId);
    }

    const where = { status: 'recruiting' };
    if (filters.city) {
      where.location = { [Op.like]: `%${filters.city}%` };
    }

    const trials = await Trial.findAll({
      where,
      attributes: ['id', 'name', 'phase', 'type', 'indication', 'institution', 'location', 'description', 'inclusion_criteria', 'exclusion_criteria', 'contact_phone', 'status', 'updated_at'],
      order: [['updated_at', 'DESC']],
      limit: MAX_SCAN_TRIALS
    });

    if (!profileRecords.length || !trials.length) {
      return res.json({
        code: 0,
        message: 'success',
        data: [],
        pagination: {
          page,
          pageSize,
          total: 0,
          hasMore: false
        }
      });
    }

    const allMatches = trials
      .map((trial) => {
        let best = null;
        for (const profileRecord of profileRecords) {
          const scored = scoreRecordAgainstTrial(profileRecord, trial);
          if (!best || scored.score > best.score) {
            best = scored;
          }
        }
        return best ? buildDetailedMatchItem(trial, best) : null;
      })
      .filter((item) => item && trialMatchesFilters(item, filters))
      .sort((a, b) => b.score - a.score);

    const list = allMatches.slice(offset, offset + pageSize);

    res.json({
      code: 0,
      message: 'success',
      data: list,
      pagination: {
        page,
        pageSize,
        total: allMatches.length,
        hasMore: offset + list.length < allMatches.length
      }
    });
  } catch (err) {
    next(err);
  }
};

/**
 * 获取试验详情
 */
const getTrialDetail = async (req, res, next) => {
  try {
    const { id } = req.params;
    const trial = await Trial.findByPk(id);

    if (!trial) {
      return res.status(404).json({ code: 404, message: '试验不存在', data: null });
    }

    const records = await getUserCompletedRecords(req.userId);
    const matched = records.length ? matchRecordsToTrials(records, [trial]) : [];
    const matchedInfo = matched[0];

    res.json(success({
      id: trial.id,
      name: trial.name,
      phase: trial.phase || '未标注',
      type: trial.type || '未标注',
      indication: trial.indication || '待补充',
      institution: trial.institution || '待补充',
      location: trial.location || '待补充',
      score: matchedInfo?.score || 50,
      status: trial.status,
      statusText: STATUS_TEXT_MAP[trial.status] || trial.status,
      reasons: matchedInfo?.reasons || ['已根据病历基础信息进行规则匹配'],
      sponsor: trial.institution || '待补充',
      description: trial.description || '暂无详细介绍',
      inclusion: parseArrayField(trial.inclusion_criteria),
      exclusion: parseArrayField(trial.exclusion_criteria),
      contact: {
        name: '研究中心',
        phone: trial.contact_phone || '',
        email: ''
      }
    }));
  } catch (err) {
    next(err);
  }
};

/**
 * 前端兼容接口：按病历/条件查找匹配试验
 */
const findMatches = async (req, res, next) => {
  try {
    const {
      recordId,
      disease,
      diagnosis,
      stage,
      city,
      gene_mutation: geneMutationBySnake,
      geneMutation: geneMutationByCamel
    } = req.body || {};
    const filters = normalizeMatchFilters({
      disease: disease || diagnosis,
      stage,
      city,
      gene_mutation: geneMutationBySnake || geneMutationByCamel
    });

    let profileRecord = null;
    if (recordId) {
      profileRecord = await MedicalRecord.findOne({
        where: {
          id: recordId,
          user_id: req.userId
        },
        attributes: ['id', 'diagnosis', 'stage', 'gene_mutation', 'status']
      });

      if (!profileRecord) {
        throw new BusinessError('病历不存在或无权限访问', 404);
      }
    } else {
      profileRecord = getProfileRecordFromFilters(filters);
    }

    const where = { status: 'recruiting' };
    if (filters.city) {
      where.location = { [Op.like]: `%${filters.city}%` };
    }

    const trials = await Trial.findAll({
      where,
      attributes: ['id', 'name', 'phase', 'type', 'indication', 'institution', 'location', 'description', 'inclusion_criteria', 'exclusion_criteria', 'contact_phone', 'status', 'updated_at'],
      order: [['updated_at', 'DESC']],
      limit: MAX_SCAN_TRIALS
    });

    if (!trials.length) {
      return res.json(success([]));
    }

    const list = trials
      .map((trial) => {
        const scored = scoreRecordAgainstTrial(profileRecord, trial);
        return buildDetailedMatchItem(trial, scored);
      })
      .filter((item) => trialMatchesFilters(item, filters))
      .sort((a, b) => b.score - a.score);

    res.json(success(list));
  } catch (err) {
    next(err);
  }
};

/**
 * 搜索试验
 */
const searchTrials = async (req, res, next) => {
  try {
    const {
      keyword,
      phase,
      location,
      status,
      page = 1,
      pageSize = 20
    } = req.query;

    const hasPagingParams = req.query.page !== undefined || req.query.pageSize !== undefined;
    const pageNum = toPositiveInt(page, 1);
    const pageSizeNum = hasPagingParams
      ? Math.min(toPositiveInt(pageSize, 20), 100)
      : 500;

    const where = {};

    if (keyword) {
      where[Op.or] = [
        { name: { [Op.like]: `%${keyword}%` } },
        { indication: { [Op.like]: `%${keyword}%` } },
        { institution: { [Op.like]: `%${keyword}%` } }
      ];
    }

    if (phase) {
      where.phase = phase;
    }

    if (location) {
      where.location = { [Op.like]: `%${location}%` };
    }

    if (status) {
      where.status = status;
    }

    const { count, rows } = await Trial.findAndCountAll({
      where,
      order: [['created_at', 'DESC']],
      limit: pageSizeNum,
      offset: (pageNum - 1) * pageSizeNum
    });

    const list = rows.map((trial) => ({
      id: trial.id,
      name: trial.name,
      phase: trial.phase || '未标注',
      type: trial.type || '未标注',
      location: trial.location || '待补充',
      institution: trial.institution || '待补充',
      status: trial.status,
      statusText: STATUS_TEXT_MAP[trial.status] || trial.status,
      indication: trial.indication || '待补充',
      inclusion: parseArrayField(trial.inclusion_criteria),
      exclusion: parseArrayField(trial.exclusion_criteria),
      contact: {
        name: '研究中心',
        phone: trial.contact_phone || '',
        email: ''
      },
      updatedAt: trial.updated_at,
      tags: [trial.phase, trial.type, trial.status].filter(Boolean)
    }));

    res.json(pagination(list, {
      page: pageNum,
      pageSize: pageSizeNum,
      total: count,
      hasMore: pageNum * pageSizeNum < count
    }));
  } catch (err) {
    next(err);
  }
};

/**
 * 获取筛选选项
 */
const getFilterOptions = async (req, res, next) => {
  try {
    const trials = await Trial.findAll({
      attributes: ['phase', 'location', 'status', 'indication'],
      where: { status: { [Op.in]: ['recruiting', 'closed', 'completed'] } }
    });

    const phaseSet = new Set();
    const locationSet = new Set();
    const indicationSet = new Set();
    for (const item of trials) {
      if (item.phase) {
        phaseSet.add(item.phase);
      }
      if (item.location) {
        locationSet.add(item.location);
      }
      if (item.indication) {
        indicationSet.add(item.indication);
      }
    }

    res.json(success({
      phases: Array.from(phaseSet),
      locations: Array.from(locationSet),
      statuses: [
        { value: 'recruiting', label: '招募中' },
        { value: 'closed', label: '已关闭' },
        { value: 'completed', label: '已结束' }
      ],
      indications: Array.from(indicationSet).slice(0, 50)
    }));
  } catch (err) {
    next(err);
  }
};

module.exports = {
  getMatches,
  getTrialDetail,
  findMatches,
  searchTrials,
  getFilterOptions
};
