const { Op } = require('sequelize');
const {
  MedicalRecord,
  UploadBatch,
  MedicalCase,
  MedicalCaseVersion,
  MedicalCaseRevision,
  MedicalFieldEvidence,
  sequelize
} = require('../models');
const { buildProfile } = require('./patientProfile');
const logger = require('../utils/logger');

const SUMMARY_GROUPS = Object.freeze([
  { key: 'diagnosis', label: '诊断', fields: ['diagnosis', 'pathologyType'] },
  { key: 'stage', label: '分期', fields: ['stage', 'tnmStage', 'metastasisSites'] },
  { key: 'molecular', label: '基因/分子', fields: ['geneMutation', 'geneMutationText', 'pdl1', 'molecular'] },
  { key: 'treatment', label: '既往治疗', fields: ['treatment', 'treatmentLine', 'priorTherapies', 'treatmentHistory'] },
  { key: 'basic', label: '基本信息', fields: ['age', 'sex', 'ecog', 'hospital', 'city'] },
  { key: 'labs', label: '检查指标', fields: ['labValues', 'bloodCounts', 'tumorMarkers', 'imaging'] },
  { key: 'risk', label: '风险禁忌', fields: ['hbvStatus', 'hcvStatus', 'hivStatus', 'autoimmuneDisease', 'pregnancyStatus', 'organTransplant'] }
]);

const CASE_REVISION_FIELD_ALLOWLIST = new Set([
  ...SUMMARY_GROUPS.flatMap((group) => group.fields),
  'age', 'sex', 'gender', 'ecog', 'hospital', 'city', 'diagnosisDate',
  'gene_mutation', 'pdL1', 'pdl1', 'treatmentLine', 'lineOfTherapy',
  'priorTherapies', 'previousTreatments', 'treatmentHistory',
  'surgicalHistory', 'surgeryHistory', 'radiotherapyHistory',
  'chemotherapyHistory', 'immunotherapyHistory', 'targetedTherapyHistory',
  'targetLesion', 'brainMetastasis', 'liverMetastasis', 'boneMetastasis',
  'labValues', 'bloodCounts', 'tumorMarkers', 'imaging',
  'hemoglobin', 'neutrophils', 'platelets', 'alt', 'ast', 'bilirubin',
  'creatinine', 'creatinineClearance',
  'weight', 'height', 'fertilityStatus', 'comorbidities',
  'activeInfection', 'consentSigned', 'lifeExpectancyMonths',
  'organoidDrugSensitivity', 'patientSummary'
]);
const MAX_REVISION_VALUE_BYTES = 10 * 1024;
const MAX_REVISION_PAYLOAD_BYTES = 50 * 1024;
const MAX_CASE_WRITE_ATTEMPTS = 3;

const isObject = (value) => value && typeof value === 'object' && !Array.isArray(value);

const isEmptyValue = (value) => {
  if (value === 0 || value === '0' || value === false) return false;
  if (Array.isArray(value)) return value.length === 0;
  if (isObject(value)) return Object.keys(value).length === 0;
  return value === null || value === undefined || `${value}`.trim() === '';
};

const unique = (items) => Array.from(new Set((items || []).map(String).filter(Boolean)));

const valuesEqual = (a, b) => {
  try { return JSON.stringify(a) === JSON.stringify(b); } catch (_e) { return a === b; }
};

const isUniqueConstraintError = (err) => (
  !!err && (
    err.name === 'SequelizeUniqueConstraintError' ||
    err.parent?.code === 'ER_DUP_ENTRY' ||
    err.original?.code === 'ER_DUP_ENTRY'
  )
);

const runWithCaseWriteRetry = async (operation, context = {}) => {
  let lastErr;
  for (let attempt = 1; attempt <= MAX_CASE_WRITE_ATTEMPTS; attempt += 1) {
    try {
      return await operation(attempt);
    } catch (err) {
      lastErr = err;
      if (!isUniqueConstraintError(err) || attempt >= MAX_CASE_WRITE_ATTEMPTS) {
        throw err;
      }
      logger.warn('medical case write conflict, retrying', {
        userId: context.userId,
        caseId: context.caseId,
        attempt,
        error: err && err.message
      });
    }
  }
  throw lastErr;
};

const jsonSize = (value) => {
  try {
    return Buffer.byteLength(JSON.stringify(value), 'utf8');
  } catch (_e) {
    return Infinity;
  }
};

const validateCaseRevisionPatches = (patches = []) => {
  if (!Array.isArray(patches)) {
    return { ok: false, message: 'patches 必须是数组', patches: [] };
  }
  const totalSize = jsonSize(patches);
  if (totalSize > MAX_REVISION_PAYLOAD_BYTES) {
    return { ok: false, message: '修订内容过大，请分批保存', patches: [] };
  }
  const sanitized = [];
  for (const patch of patches) {
    if (!patch || typeof patch !== 'object' || Array.isArray(patch)) {
      return { ok: false, message: 'patch 格式不正确', patches: [] };
    }
    const fieldKey = `${patch.fieldKey || patch.key || ''}`.trim();
    if (!fieldKey) continue;
    if (
      fieldKey.length > 96 ||
      fieldKey === '__proto__' ||
      fieldKey === 'constructor' ||
      fieldKey === 'prototype' ||
      !CASE_REVISION_FIELD_ALLOWLIST.has(fieldKey)
    ) {
      return { ok: false, message: `不支持修订字段：${fieldKey}`, patches: [] };
    }
    if (jsonSize(patch.value) > MAX_REVISION_VALUE_BYTES) {
      return { ok: false, message: `字段 ${fieldKey} 内容过大`, patches: [] };
    }
    sanitized.push({
      fieldKey,
      value: patch.value,
      reason: patch.reason
    });
  }
  return { ok: true, patches: sanitized };
};

const recordIdOf = (entry) => {
  const id = entry && (entry.recordId || entry.fileId || entry.id);
  return id ? String(id) : '';
};

const numericCount = (value, fallback = 0) => {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : fallback;
};

const externalUploadFailureCount = (metadata = {}) => {
  if (!metadata || typeof metadata !== 'object') return 0;
  return Math.max(
    numericCount(metadata.uploadFailedCount),
    numericCount(metadata.uploadErrorCount),
    Array.isArray(metadata.uploadErrors) ? metadata.uploadErrors.length : 0
  );
};

const withUploadFailureMetadata = (metadata = {}, count = 0) => ({
  ...(metadata || {}),
  uploadFailedCount: numericCount(count)
});

const computeInitialBatchCounts = ({ records = [], totalCount = 0, metadata = {} } = {}) => {
  const recordIds = (records || []).map(recordIdOf).filter(Boolean);
  const successCount = (records || []).filter((r) => recordIdOf(r) && r.status === 'completed').length;
  const dbFailedCount = (records || []).filter((r) => recordIdOf(r) && r.status === 'error').length;
  const noRecordFailedCount = (records || []).filter((r) => !recordIdOf(r) && r.status === 'error').length;
  const uploadFailedCount = externalUploadFailureCount(metadata) + noRecordFailedCount;
  const failedCount = dbFailedCount + uploadFailedCount;
  const processedCount = successCount + failedCount;
  const total = Math.max(
    numericCount(totalCount),
    records.length + externalUploadFailureCount(metadata),
    recordIds.length + failedCount
  );
  return {
    recordIds,
    total,
    successCount,
    failedCount,
    processedCount,
    uploadFailedCount
  };
};

const computeBatchCountsFromRecords = ({ batchRecordIds = [], records = [], totalCount = 0, metadata = {} } = {}) => {
  const recordIds = (batchRecordIds || []).map(String).filter(Boolean);
  const byId = new Map((records || []).map((record) => [String(record.id), record]));
  const uploadFailedCount = externalUploadFailureCount(metadata);
  const successCount = recordIds.filter((id) => byId.get(id)?.status === 'completed').length;
  const dbFailedCount = recordIds.filter((id) => byId.get(id)?.status === 'error').length;
  const failedCount = dbFailedCount + uploadFailedCount;
  const processedCount = successCount + failedCount;
  const total = Math.max(numericCount(totalCount), recordIds.length + uploadFailedCount);
  return {
    recordIds,
    total,
    successCount,
    failedCount,
    processedCount,
    uploadFailedCount
  };
};

const extractEntities = (record) => {
  const structured = isObject(record && record.structured) ? record.structured : {};
  const entities = isObject(structured.entities) ? structured.entities : {};
  return {
    ...entities,
    diagnosis: entities.diagnosis || record.diagnosis || null,
    stage: entities.stage || record.stage || null,
    geneMutation: entities.geneMutation || entities.gene_mutation || record.gene_mutation || null,
    treatment: entities.treatment || record.treatment || null,
    treatmentLine: entities.treatmentLine ?? record.treatment_line ?? null,
    pdl1: entities.pdl1 || record.pdl1 || null
  };
};

const compactEntities = (entities) => {
  const out = {};
  Object.entries(entities || {}).forEach(([key, value]) => {
    if (!isEmptyValue(value)) out[key] = value;
  });
  return out;
};

const buildCaseEntities = (records, revisions = []) => {
  const { structuredProfile, patientSummary } = buildProfile(records);
  const merged = {
    ...structuredProfile,
    geneMutation: structuredProfile.geneMutationText || structuredProfile.geneMutation || '',
    patientSummary
  };

  for (const record of records || []) {
    const entities = extractEntities(record);
    Object.entries(entities).forEach(([key, value]) => {
      if (isEmptyValue(value)) return;
      if (isEmptyValue(merged[key])) {
        merged[key] = value;
      } else if (
        Array.isArray(merged[key]) &&
        Array.isArray(value)
      ) {
        const seen = new Set(merged[key].map((item) => JSON.stringify(item)));
        value.forEach((item) => {
          const sig = JSON.stringify(item);
          if (!seen.has(sig)) {
            seen.add(sig);
            merged[key].push(item);
          }
        });
      }
    });
  }

  revisions.forEach((revision) => {
    const plain = typeof revision.get === 'function' ? revision.get({ plain: true }) : revision;
    if (plain && plain.field_key) merged[plain.field_key] = plain.new_value;
  });

  return compactEntities(merged);
};

const buildCompleteness = (entities = {}) => {
  const groups = SUMMARY_GROUPS.map((group) => {
    const filled = group.fields.some((key) => !isEmptyValue(entities[key]));
    return {
      key: group.key,
      label: group.label,
      filled
    };
  });
  const filled = groups.filter((g) => g.filled).length;
  return {
    filled,
    total: groups.length,
    percent: groups.length ? Math.round((filled / groups.length) * 100) : 100,
    groups
  };
};

const buildSummary = (entities = {}) => ({
  diagnosis: entities.diagnosis || '',
  stage: entities.stage || '',
  geneMutation: entities.geneMutation || entities.geneMutationText || '',
  treatment: entities.treatment || '',
  treatmentLine: entities.treatmentLine ?? null,
  completeness: buildCompleteness(entities)
});

const normalizeCancerType = (diagnosis = '') => {
  const text = `${diagnosis || ''}`.toLowerCase();
  if (!text) return null;
  if (text.includes('直肠') || text.includes('结肠') || text.includes('肠癌')) return 'colorectal_cancer';
  if (text.includes('肺')) return 'lung_cancer';
  if (text.includes('肝')) return 'liver_cancer';
  if (text.includes('胃')) return 'gastric_cancer';
  if (text.includes('乳腺')) return 'breast_cancer';
  return 'solid_tumor';
};

const hasAnyText = (source, words) => words.some((word) => `${source || ''}`.includes(word));

const buildNormalizedTags = (entities = {}) => {
  const treatmentText = [
    entities.treatment,
    ...(Array.isArray(entities.priorTherapies) ? entities.priorTherapies : []),
    ...(Array.isArray(entities.treatmentHistory) ? entities.treatmentHistory.map((t) => JSON.stringify(t)) : [])
  ].filter(Boolean).join('；');
  const geneText = [
    entities.geneMutation,
    entities.geneMutationText,
    JSON.stringify(entities.molecular || {})
  ].filter(Boolean).join('；');
  return {
    cancerType: normalizeCancerType(entities.diagnosis),
    metastatic: hasAnyText(`${entities.stage || ''} ${JSON.stringify(entities.metastasisSites || [])}`, ['转移', 'IV', 'Ⅳ']),
    treatmentTypes: [
      hasAnyText(treatmentText, ['手术', '根治术', '切除']) ? 'surgery' : null,
      hasAnyText(treatmentText, ['放疗', 'X线']) ? 'radiotherapy' : null,
      hasAnyText(treatmentText, ['化疗', 'XELOX', '卡培他滨', '奥沙利铂', '伊利替康', 'TAS102']) ? 'chemotherapy' : null,
      hasAnyText(treatmentText, ['贝伐珠单抗', '呋喹替尼', '靶向']) ? 'targeted' : null,
      hasAnyText(treatmentText, ['卡瑞利珠单抗', 'PD-1', '免疫']) ? 'immunotherapy' : null
    ].filter(Boolean),
    biomarkers: {
      mmr: hasAnyText(geneText, ['MLH1', 'MSH2', 'MSH6', 'PMS']) ? 'mmr_reported' : null,
      her2: hasAnyText(geneText, ['HER2', 'C-erbB-2']) ? 'her2_reported' : null,
      pdl1: entities.pdl1 || null
    }
  };
};

const buildValidationIssues = (entities = {}) => {
  const issues = [];
  if (!isEmptyValue(entities.age)) {
    const age = Number(entities.age);
    if (!Number.isFinite(age) || age < 0 || age > 120) {
      issues.push({ field: 'age', code: 'out_of_range', message: '年龄应在 0-120 岁之间' });
    }
  }
  if (!isEmptyValue(entities.ecog)) {
    const ecog = Number(entities.ecog);
    if (!Number.isInteger(ecog) || ecog < 0 || ecog > 4) {
      issues.push({ field: 'ecog', code: 'invalid_enum', message: 'ECOG 应为 0-4' });
    }
  }
  if (!isEmptyValue(entities.stage)) {
    const stage = `${entities.stage}`;
    const ok = ['I', 'II', 'III', 'IV', 'Ⅰ', 'Ⅱ', 'Ⅲ', 'Ⅳ', '局部晚期', '转移'].some((token) => stage.includes(token));
    if (!ok) issues.push({ field: 'stage', code: 'unknown_stage', message: '分期未能标准化，请核对' });
    if (/I期|Ⅰ期/.test(stage) && /转移/.test(stage)) {
      issues.push({ field: 'stage', code: 'stage_conflict', message: '分期与“转移性”描述冲突，请核对' });
    }
  }
  if (!isEmptyValue(entities.treatmentLine) && Array.isArray(entities.treatmentHistory)) {
    const line = Number(entities.treatmentLine);
    if (Number.isFinite(line) && entities.treatmentHistory.length > line + 2) {
      issues.push({ field: 'treatmentLine', code: 'line_conflict', message: '治疗线数可能低于治疗史复杂度，请核对' });
    }
  }
  return issues;
};

const buildSnippet = (text, value) => {
  if (!text || isEmptyValue(value)) return '';
  const needle = typeof value === 'string' ? value : '';
  if (!needle) return `${text}`.slice(0, 160);
  const idx = `${text}`.indexOf(needle.slice(0, 24));
  if (idx < 0) return `${text}`.slice(0, 160);
  return `${text}`.slice(Math.max(0, idx - 60), idx + needle.length + 80);
};

const buildEvidenceRows = (caseId, userId, records) => {
  const rows = [];
  for (const record of records || []) {
    const structured = isObject(record.structured) ? record.structured : {};
    const entities = extractEntities(record);
    const text = structured.text || entities.rawText || '';
    const confidence = typeof structured.confidence === 'number'
      ? structured.confidence
      : (typeof entities.confidence === 'number' ? entities.confidence : null);
    Object.entries(entities).forEach(([fieldKey, value]) => {
      if (isEmptyValue(value) || ['rawText', 'confidence'].includes(fieldKey)) return;
      rows.push({
        case_id: caseId,
        user_id: userId,
        field_key: fieldKey,
        value,
        source_record_id: record.id,
        confidence,
        snippet: buildSnippet(text, value)
      });
    });
  }
  return rows;
};

const serializeCase = (medicalCase) => {
  if (!medicalCase) return null;
  const plain = typeof medicalCase.get === 'function' ? medicalCase.get({ plain: true }) : medicalCase;
  return {
    caseId: plain.id,
    id: plain.id,
    status: plain.status,
    activeVersionId: plain.active_version_id || null,
    entities: plain.entities || {},
    summary: plain.summary || {},
    sourceRecordIds: Array.isArray(plain.source_record_ids) ? plain.source_record_ids : [],
    completeness: plain.completeness || buildCompleteness(plain.entities || {}),
    validationIssues: plain.validation_issues || [],
    normalizedTags: plain.normalized_tags || {},
    createdAt: plain.created_at,
    updatedAt: plain.updated_at
  };
};

const lockOptions = (transaction) => (
  transaction && transaction.LOCK
    ? { lock: transaction.LOCK.UPDATE }
    : {}
);

const findOrCreateActiveCase = async (userId, transaction) => {
  let medicalCase = await MedicalCase.findOne({
    where: { user_id: userId, status: 'active' },
    order: [['updated_at', 'DESC']],
    transaction,
    ...lockOptions(transaction)
  });
  if (!medicalCase) {
    try {
      medicalCase = await MedicalCase.create({
        user_id: userId,
        status: 'active',
        source_record_ids: [],
        entities: {},
        summary: {},
        completeness: buildCompleteness({})
      }, { transaction });
    } catch (err) {
      if (!isUniqueConstraintError(err)) throw err;
      medicalCase = await MedicalCase.findOne({
        where: { user_id: userId, status: 'active' },
        order: [['updated_at', 'DESC']],
        transaction,
        ...lockOptions(transaction)
      });
      if (!medicalCase) throw err;
    }
  }
  return medicalCase;
};

const createCaseVersionWithRetry = async ({
  caseId,
  userId,
  entities,
  summary,
  sourceRecordIds,
  completeness,
  validationIssues,
  normalizedTags,
  metadata,
  transaction
}) => {
  let lastErr;
  for (let attempt = 1; attempt <= MAX_CASE_WRITE_ATTEMPTS; attempt += 1) {
    const latestVersion = await MedicalCaseVersion.findOne({
      where: { case_id: caseId },
      order: [['version_no', 'DESC']],
      transaction,
      ...lockOptions(transaction)
    });
    const latestPlain = latestVersion && typeof latestVersion.get === 'function'
      ? latestVersion.get({ plain: true })
      : latestVersion;
    const versionNo = Number(latestPlain?.version_no || 0) + 1;
    try {
      return await MedicalCaseVersion.create({
        case_id: caseId,
        user_id: userId,
        version_no: versionNo,
        entities,
        summary,
        source_record_ids: sourceRecordIds,
        completeness,
        validation_issues: validationIssues,
        normalized_tags: normalizedTags,
        metadata
      }, { transaction });
    } catch (err) {
      lastErr = err;
      if (!isUniqueConstraintError(err) || attempt >= MAX_CASE_WRITE_ATTEMPTS) {
        throw err;
      }
      logger.warn('medical case version conflict, retrying', {
        userId,
        caseId,
        attemptedVersionNo: versionNo,
        attempt,
        error: err && err.message
      });
    }
  }
  throw lastErr;
};

const getLatestRevisions = async (caseId, userId, transaction) => {
  const rows = await MedicalCaseRevision.findAll({
    where: { case_id: caseId, user_id: userId },
    order: [['created_at', 'ASC'], ['id', 'ASC']],
    transaction
  });
  const byField = new Map();
  rows.forEach((row) => byField.set(row.field_key, row));
  return Array.from(byField.values());
};

const updateBatchFromRecords = async (batchId, userId, transaction) => {
  if (!batchId) return null;
  const batch = await UploadBatch.findOne({ where: { id: batchId, user_id: userId }, transaction });
  if (!batch) return null;
  const recordIds = Array.isArray(batch.record_ids) ? batch.record_ids.map(String).filter(Boolean) : [];
  const uniqueRecordIds = unique(recordIds);
  const records = uniqueRecordIds.length
    ? await MedicalRecord.findAll({ where: { id: { [Op.in]: uniqueRecordIds }, user_id: userId, deleted_at: null }, transaction })
    : [];
  const counts = computeBatchCountsFromRecords({
    batchRecordIds: recordIds,
    records,
    totalCount: batch.total_count,
    metadata: batch.metadata || {}
  });
  const { successCount, failedCount, processedCount } = counts;
  const totalCount = counts.total;
  const status = processedCount >= totalCount
    ? (successCount > 0 ? 'completed' : 'error')
    : (processedCount > 0 ? 'running' : 'pending');
  const startedAt = batch.started_at ? new Date(batch.started_at).getTime() : Date.now();
  await batch.update({
    record_ids: recordIds,
    total_count: totalCount,
    processed_count: processedCount,
    success_count: successCount,
    failed_count: failedCount,
    status,
    completed_at: processedCount >= totalCount ? new Date() : null
  }, { transaction });
  return {
    batchId: batch.id,
    total: totalCount,
    processedCount,
    successCount,
    failedCount,
    status,
    elapsedSeconds: Math.max(0, Math.floor((Date.now() - startedAt) / 1000))
  };
};

const createUploadBatch = async ({ userId, records = [], totalCount = 0, metadata = {} }) => {
  const counts = computeInitialBatchCounts({ records, totalCount, metadata });
  const { recordIds, total, successCount, failedCount, processedCount, uploadFailedCount } = counts;
  const batchMetadata = withUploadFailureMetadata(metadata, uploadFailedCount);
  if (!UploadBatch || typeof UploadBatch.create !== 'function') {
    return {
      batchId: null,
      recordIds,
      total,
      successCount,
      failedCount,
      status: recordIds.length ? 'running' : 'error'
    };
  }
  const batch = await UploadBatch.create({
    user_id: userId,
    record_ids: recordIds,
    total_count: total,
    processed_count: processedCount,
    success_count: successCount,
    failed_count: failedCount,
    status: recordIds.length ? (processedCount >= total ? (successCount > 0 ? 'completed' : 'error') : 'running') : 'error',
    started_at: new Date(),
    completed_at: processedCount >= total ? new Date() : null,
    metadata: batchMetadata
  });
  if (recordIds.length && MedicalRecord && typeof MedicalRecord.update === 'function') {
    await MedicalRecord.update({ batch_id: batch.id }, { where: { id: { [Op.in]: unique(recordIds) }, user_id: userId } });
  }
  return {
    batchId: batch.id,
    recordIds,
    total,
    successCount,
    failedCount,
    status: batch.status
  };
};

const upsertCaseFromRecords = async ({ userId, recordIds = [], batchId = null, metadata = {} }) => {
  const ids = unique(recordIds);
  if (!ids.length) return null;

  return runWithCaseWriteRetry(() => sequelize.transaction(async (transaction) => {
    const medicalCase = await findOrCreateActiveCase(userId, transaction);
    const existingRecordIds = unique(medicalCase.source_record_ids || []);
    const sourceRecordIds = unique([...existingRecordIds, ...ids]);
    const records = await MedicalRecord.findAll({
      where: {
        id: { [Op.in]: sourceRecordIds },
        user_id: userId,
        deleted_at: null,
        status: 'completed'
      },
      order: [['updated_at', 'DESC']],
      transaction
    });
    if (!records.length) {
      await updateBatchFromRecords(batchId, userId, transaction);
      return serializeCase(medicalCase);
    }

    const revisions = await getLatestRevisions(medicalCase.id, userId, transaction);
    const entities = buildCaseEntities(records, revisions);
    const completeness = buildCompleteness(entities);
    const summary = buildSummary(entities);
    const validationIssues = buildValidationIssues(entities);
    const normalizedTags = buildNormalizedTags(entities);
    const nextSourceIds = records.map((r) => r.id);
    if (
      medicalCase.active_version_id &&
      valuesEqual(medicalCase.entities || {}, entities) &&
      valuesEqual(unique(medicalCase.source_record_ids || []), unique(nextSourceIds))
    ) {
      await updateBatchFromRecords(batchId, userId, transaction);
      return serializeCase(medicalCase);
    }
    const version = await createCaseVersionWithRetry({
      caseId: medicalCase.id,
      userId,
      entities,
      summary,
      sourceRecordIds: nextSourceIds,
      completeness,
      validationIssues,
      normalizedTags,
      metadata,
      transaction
    });

    await medicalCase.update({
      active_version_id: version.id,
      entities,
      summary,
      source_record_ids: nextSourceIds,
      completeness,
      validation_issues: validationIssues,
      normalized_tags: normalizedTags
    }, { transaction });

    await MedicalRecord.update(
      { case_id: medicalCase.id },
      { where: { id: { [Op.in]: records.map((r) => r.id) }, user_id: userId }, transaction }
    );

    const evidenceRows = buildEvidenceRows(medicalCase.id, userId, records);
    await MedicalFieldEvidence.destroy({ where: { case_id: medicalCase.id, user_id: userId }, transaction });
    if (evidenceRows.length) {
      await MedicalFieldEvidence.bulkCreate(evidenceRows, { transaction });
    }
    await updateBatchFromRecords(batchId, userId, transaction);
    return serializeCase(await MedicalCase.findByPk(medicalCase.id, { transaction }));
  }), { userId });
};

const getCurrentCase = async (userId) => {
  const medicalCase = await MedicalCase.findOne({
    where: { user_id: userId, status: 'active' },
    order: [['updated_at', 'DESC']]
  });
  return serializeCase(medicalCase);
};

const getCaseById = async (userId, caseId) => {
  const medicalCase = await MedicalCase.findOne({ where: { id: caseId, user_id: userId } });
  return serializeCase(medicalCase);
};

const getCaseEvidence = async (userId, caseId) => {
  const medicalCase = await MedicalCase.findOne({ where: { id: caseId, user_id: userId } });
  if (!medicalCase) return null;
  const rows = await MedicalFieldEvidence.findAll({
    where: { case_id: caseId, user_id: userId },
    order: [['field_key', 'ASC'], ['created_at', 'DESC']]
  });
  return rows.map((row) => {
    const plain = row.get({ plain: true });
    return {
      id: plain.id,
      caseId: plain.case_id,
      fieldKey: plain.field_key,
      value: plain.value,
      sourceRecordId: plain.source_record_id,
      confidence: plain.confidence,
      snippet: plain.snippet,
      createdAt: plain.created_at
    };
  });
};

const applyCaseRevisions = async ({ userId, caseId, patches = [], reason = '' }) => {
  const validation = validateCaseRevisionPatches(patches);
  if (!validation.ok) {
    const err = new Error(validation.message);
    err.statusCode = 400;
    throw err;
  }
  const safePatches = validation.patches;
  if (!safePatches.length) {
    throw new Error('patches 不能为空');
  }
  return runWithCaseWriteRetry(() => sequelize.transaction(async (transaction) => {
    const medicalCase = await MedicalCase.findOne({
      where: { id: caseId, user_id: userId, status: 'active' },
      transaction,
      ...lockOptions(transaction)
    });
    if (!medicalCase) return null;
    const entities = { ...(medicalCase.entities || {}) };
    const rows = [];
    safePatches.forEach((patch) => {
      const fieldKey = patch.fieldKey;
      const nextValue = patch.value;
      const oldValue = entities[fieldKey];
      if (valuesEqual(oldValue, nextValue)) return;
      entities[fieldKey] = nextValue;
      rows.push({
        case_id: medicalCase.id,
        user_id: userId,
        field_key: fieldKey,
        old_value: oldValue ?? null,
        new_value: nextValue ?? null,
        reason: patch.reason || reason || null
      });
    });
    if (!rows.length) return serializeCase(medicalCase);
    await MedicalCaseRevision.bulkCreate(rows, { transaction });
    const latestRevisions = await getLatestRevisions(medicalCase.id, userId, transaction);
    latestRevisions.forEach((revision) => { entities[revision.field_key] = revision.new_value; });
    const completeness = buildCompleteness(entities);
    const summary = buildSummary(entities);
    const validationIssues = buildValidationIssues(entities);
    const normalizedTags = buildNormalizedTags(entities);
    const version = await createCaseVersionWithRetry({
      caseId: medicalCase.id,
      userId,
      entities,
      summary,
      sourceRecordIds: medicalCase.source_record_ids || [],
      completeness,
      validationIssues,
      normalizedTags,
      metadata: { source: 'user_revision' },
      transaction
    });
    await medicalCase.update({
      active_version_id: version.id,
      entities,
      summary,
      completeness,
      validation_issues: validationIssues,
      normalized_tags: normalizedTags
    }, { transaction });
    return serializeCase(await MedicalCase.findByPk(medicalCase.id, { transaction }));
  }), { userId, caseId });
};

const safeUpsertCaseFromRecords = async (args) => {
  try {
    return await upsertCaseFromRecords(args);
  } catch (err) {
    logger.warn('medicalCaseService upsert failed（已忽略）', {
      userId: args && args.userId,
      recordIds: args && args.recordIds,
      error: err && err.message
    });
    return null;
  }
};

module.exports = {
  SUMMARY_GROUPS,
  createUploadBatch,
  updateBatchFromRecords,
  upsertCaseFromRecords,
  safeUpsertCaseFromRecords,
  getCurrentCase,
  getCaseById,
  getCaseEvidence,
  applyCaseRevisions,
  buildCompleteness,
  buildSummary,
  buildNormalizedTags,
  buildValidationIssues,
  validateCaseRevisionPatches,
  __testables: {
    computeInitialBatchCounts,
    computeBatchCountsFromRecords,
    externalUploadFailureCount,
    CASE_REVISION_FIELD_ALLOWLIST,
    isUniqueConstraintError,
    createCaseVersionWithRetry
  }
};
