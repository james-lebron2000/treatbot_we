const { Op } = require('sequelize');
const { Trial, MedicalRecord } = require('../models');
const { success, pagination } = require('../utils/response');
const { BusinessError } = require('../middleware/errorHandler');
const { matchRecordsToTrials, parseArrayField, scoreRecordAgainstTrial, scoreRecordHybrid, STATUS_TEXT_MAP, matchDiseaseText, buildCoarseFilter } = require('../services/matchEngine');
const { buildProfile } = require('../services/patientProfile');
const { buildCriterionExplanation } = require('../utils/match-explainer');
const { safeText, sanitizeTrial, escapeLike } = require('../utils/text');

const toPositiveInt = (value, fallback) => {
  const num = parseInt(value, 10);
  if (Number.isNaN(num) || num <= 0) {
    return fallback;
  }
  return num;
};

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
    attributes: ['id', 'diagnosis', 'stage', 'gene_mutation', 'treatment_line', 'pdl1', 'structured', 'created_at'],
    order: [['created_at', 'DESC']]
  });
};

const buildDetailedMatchItem = (trial, scored) => {
  const item = {
    id: trial.id,
    trialId: trial.id,
    name: safeText(trial.name),
    score: scored.score,
    phase: safeText(trial.phase) || '未标注',
    location: safeText(trial.location) || '待补充',
    type: safeText(trial.type) || '未标注',
    indication: safeText(trial.indication) || '待补充',
    institution: safeText(trial.institution) || '待补充',
    status: trial.status,
    statusText: STATUS_TEXT_MAP[trial.status] || trial.status,
    reasons: (scored.reasons || ['已根据病历基础信息进行规则匹配']).map((r) => safeText(r)).filter(Boolean),
    inclusion: parseArrayField(trial.inclusion_criteria),
    exclusion: parseArrayField(trial.exclusion_criteria),
    contact: {
      name: '研究中心',
      phone: safeText(trial.contact_phone) || '',
      email: ''
    },
    updatedAt: trial.updated_at
  };

  // Add criterion-level explanation if available
  if (scored.criterionResults) {
    item.criterionExplanation = buildCriterionExplanation(scored.criterionResults);
  }

  return item;
};

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
        attributes: ['id', 'diagnosis', 'stage', 'gene_mutation', 'treatment_line', 'pdl1', 'structured', 'status']
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

    if (!profileRecords.length) {
      return res.json({
        code: 0,
        message: 'success',
        data: [],
        pagination: { page, pageSize, total: 0, hasMore: false }
      });
    }

    // 为记录注入城市信息供评分使用
    if (filters.city) {
      for (const r of profileRecords) {
        r._city = filters.city;
      }
    }

    // Stage 1: 粗筛 — 基于疾病标签+城市做 SQL 级过滤
    const primaryRecord = profileRecords[0] || {};
    const coarseWhere = buildCoarseFilter({
      diagnosis: primaryRecord.diagnosis || filters.disease || '',
      city: filters.city || ''
    });

    const trialAttrs = ['id', 'name', 'phase', 'type', 'indication', 'institution', 'location', 'description', 'inclusion_criteria', 'exclusion_criteria', 'contact_phone', 'status', 'updated_at', 'disease_tags', 'treatment_lines', 'study_cities', 'treatment_approach', 'brief_inclusion', 'structured_inclusion'];

    let trials = await Trial.findAll({
      where: coarseWhere,
      attributes: trialAttrs,
      order: [['updated_at', 'DESC']]
    });

    // 安全回退：粗筛无结果时取全量（兼容 disease_tags 未填充的情况）
    if (trials.length === 0) {
      const fallbackWhere = { status: 'recruiting' };
      if (filters.city) {
        fallbackWhere.location = { [Op.like]: `%${escapeLike(filters.city)}%` };
      }
      trials = await Trial.findAll({
        where: fallbackWhere,
        attributes: trialAttrs,
        order: [['updated_at', 'DESC']]
      });
    }

    if (!trials.length) {
      return res.json({
        code: 0,
        message: 'success',
        data: [],
        pagination: { page, pageSize, total: 0, hasMore: false }
      });
    }

    // Build consolidated patient profile for criterion-level matching
    const { structuredProfile } = buildProfile(profileRecords, {
      city: filters.city || null
    });

    // Stage 2: 精排 — 混合评分（原始启发式 + 条目级匹配）
    const allMatches = trials
      .map((trial) => sanitizeTrial(trial))
      .map((trial) => {
        let best = null;
        for (const profileRecord of profileRecords) {
          const scored = scoreRecordHybrid(profileRecord, trial, structuredProfile);
          // 硬排除的试验（如年龄/ECOG不符合）直接跳过
          if (scored.excluded) continue;
          if (!best || scored.score > best.score) {
            best = scored;
          }
        }
        return best ? buildDetailedMatchItem(trial, best) : null;
      })
      .filter((item) => item && trialMatchesFilters(item, filters))
      .sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        // 稳定 tiebreaker: 更新时间新的在前，其次按 id 字典序确保结果每次一致
        const tA = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
        const tB = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
        if (tA !== tB) return tB - tA;
        return `${a.id}`.localeCompare(`${b.id}`);
      });

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
    const normalizedTrial = sanitizeTrial(trial);

    // Build consolidated profile + hybrid scoring for the trial detail
    let matchedInfo = null;
    let criterionExplanation = null;
    if (records.length) {
      const { structuredProfile } = buildProfile(records);
      // Use hybrid scoring for richer detail
      const scored = scoreRecordHybrid(records[0], normalizedTrial, structuredProfile);
      matchedInfo = scored;
      if (scored.criterionResults) {
        criterionExplanation = buildCriterionExplanation(scored.criterionResults);
      }
    }

    const result = {
      id: normalizedTrial.id,
      name: safeText(normalizedTrial.name),
      phase: safeText(normalizedTrial.phase) || '未标注',
      type: safeText(normalizedTrial.type) || '未标注',
      indication: safeText(normalizedTrial.indication) || '待补充',
      institution: safeText(normalizedTrial.institution) || '待补充',
      location: safeText(normalizedTrial.location) || '待补充',
      score: matchedInfo?.score || 50,
      status: normalizedTrial.status,
      statusText: STATUS_TEXT_MAP[normalizedTrial.status] || normalizedTrial.status,
      reasons: (matchedInfo?.reasons || ['已根据病历基础信息进行规则匹配']).map((item) => safeText(item)).filter(Boolean),
      sponsor: safeText(normalizedTrial.sponsor) || safeText(normalizedTrial.institution) || '待补充',
      description: safeText(normalizedTrial.description) || '暂无详细介绍',
      inclusion: parseArrayField(normalizedTrial.inclusion_criteria),
      exclusion: parseArrayField(normalizedTrial.exclusion_criteria),
      required_documents: safeText(normalizedTrial.required_documents) || '',
      patient_subsidy: safeText(normalizedTrial.patient_subsidy) || '',
      hospitals: normalizedTrial.hospitals || [],
      contact: {
        name: '研究中心',
        phone: safeText(normalizedTrial.contact_phone) || '',
        email: ''
      }
    };

    // Add criterion-level explanation when available
    if (criterionExplanation) {
      result.criterionExplanation = criterionExplanation;
    }

    res.json(success(result));
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
        attributes: ['id', 'diagnosis', 'stage', 'gene_mutation', 'treatment_line', 'pdl1', 'structured', 'status']
      });

      if (!profileRecord) {
        throw new BusinessError('病历不存在或无权限访问', 404);
      }
    } else {
      profileRecord = getProfileRecordFromFilters(filters);
    }

    if (filters.city) {
      profileRecord._city = filters.city;
    }

    const coarseWhere = buildCoarseFilter({
      diagnosis: profileRecord.diagnosis || filters.disease || '',
      city: filters.city || ''
    });

    const trialAttrs = ['id', 'name', 'phase', 'type', 'indication', 'institution', 'location', 'description', 'inclusion_criteria', 'exclusion_criteria', 'contact_phone', 'status', 'updated_at', 'disease_tags', 'treatment_lines', 'study_cities', 'treatment_approach', 'brief_inclusion', 'structured_inclusion'];

    let trials = await Trial.findAll({
      where: coarseWhere,
      attributes: trialAttrs,
      order: [['updated_at', 'DESC']]
    });

    if (trials.length === 0) {
      const fallbackWhere = { status: 'recruiting' };
      if (filters.city) {
        fallbackWhere.location = { [Op.like]: `%${escapeLike(filters.city)}%` };
      }
      trials = await Trial.findAll({
        where: fallbackWhere,
        attributes: trialAttrs,
        order: [['updated_at', 'DESC']]
      });
    }

    if (!trials.length) {
      return res.json(success([]));
    }

    // Build structured profile for criterion-level matching
    const { structuredProfile } = buildProfile([profileRecord], {
      city: filters.city || null
    });

    const list = trials
      .map((trial) => sanitizeTrial(trial))
      .map((trial) => {
        const scored = scoreRecordHybrid(profileRecord, trial, structuredProfile);
        return buildDetailedMatchItem(trial, scored);
      })
      .filter((item) => trialMatchesFilters(item, filters))
      .sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        const tA = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
        const tB = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
        if (tA !== tB) return tB - tA;
        return `${a.id}`.localeCompare(`${b.id}`);
      });

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
        { name: { [Op.like]: `%${escapeLike(keyword)}%` } },
        { indication: { [Op.like]: `%${escapeLike(keyword)}%` } },
        { institution: { [Op.like]: `%${escapeLike(keyword)}%` } }
      ];
    }

    if (phase) {
      where.phase = phase;
    }

    if (location) {
      where.location = { [Op.like]: `%${escapeLike(location)}%` };
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

    const list = rows.map((item) => {
      const trial = sanitizeTrial(item);
      return {
      id: trial.id,
      name: safeText(trial.name),
      phase: safeText(trial.phase) || '未标注',
      type: safeText(trial.type) || '未标注',
      location: safeText(trial.location) || '待补充',
      institution: safeText(trial.institution) || '待补充',
      status: trial.status,
      statusText: STATUS_TEXT_MAP[trial.status] || trial.status,
      indication: safeText(trial.indication) || '待补充',
      inclusion: parseArrayField(trial.inclusion_criteria),
      exclusion: parseArrayField(trial.exclusion_criteria),
      contact: {
        name: '研究中心',
        phone: safeText(trial.contact_phone) || '',
        email: ''
      },
      updatedAt: trial.updated_at,
      tags: [trial.phase, trial.type, trial.status].filter(Boolean)
      };
    });

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
      const trial = sanitizeTrial(item);
      if (trial.phase) {
        phaseSet.add(trial.phase);
      }
      if (trial.location) {
        locationSet.add(trial.location);
      }
      if (trial.indication) {
        indicationSet.add(trial.indication);
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
