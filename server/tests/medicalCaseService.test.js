jest.mock('../models', () => ({
  MedicalRecord: {},
  UploadBatch: {},
  MedicalCase: {},
  MedicalCaseVersion: {},
  MedicalCaseRevision: {},
  MedicalFieldEvidence: {},
  sequelize: { transaction: jest.fn() }
}));
jest.mock('../utils/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }));

const {
  buildCompleteness,
  buildSummary,
  buildNormalizedTags,
  buildValidationIssues,
  validateCaseRevisionPatches,
  upsertCaseFromRecords,
  __testables
} = require('../services/medicalCaseService');
const models = require('../models');

describe('medicalCaseService pure case helpers', () => {
  test('buildCompleteness returns 7 group summary for structured case entities', () => {
    const completeness = buildCompleteness({
      diagnosis: '直肠癌',
      stage: 'IV期',
      geneMutation: 'MLH1(+); MSH2(+)',
      treatment: '直肠癌根治术后 XELOX 化疗',
      age: 61
    });

    expect(completeness.total).toBe(7);
    expect(completeness.filled).toBe(5);
    expect(completeness.groups.find((g) => g.key === 'diagnosis').filled).toBe(true);
    expect(completeness.groups.find((g) => g.key === 'labs').filled).toBe(false);
  });

  test('buildSummary keeps user-facing diagnosis, molecular, treatment and completeness', () => {
    const summary = buildSummary({
      diagnosis: '直肠癌',
      stage: '转移性',
      geneMutationText: 'KRAS 野生型',
      treatment: '贝伐珠单抗+卡培他滨',
      treatmentLine: 2
    });

    expect(summary.diagnosis).toBe('直肠癌');
    expect(summary.stage).toBe('转移性');
    expect(summary.geneMutation).toBe('KRAS 野生型');
    expect(summary.treatmentLine).toBe(2);
    expect(summary.completeness.total).toBe(7);
  });

  test('buildNormalizedTags extracts cancer, treatment classes and biomarkers', () => {
    const tags = buildNormalizedTags({
      diagnosis: '直肠癌',
      stage: 'IV期伴肝转移',
      treatment: '根治术后 XELOX 化疗，后续贝伐珠单抗+卡培他滨，卡瑞利珠单抗免疫治疗',
      geneMutation: 'MLH1(+); MSH2(+); C-erbB-2(1+)',
      pdl1: 'TPS 10%'
    });

    expect(tags.cancerType).toBe('colorectal_cancer');
    expect(tags.metastatic).toBe(true);
    expect(tags.treatmentTypes).toEqual(expect.arrayContaining([
      'surgery',
      'chemotherapy',
      'targeted',
      'immunotherapy'
    ]));
    expect(tags.biomarkers.mmr).toBe('mmr_reported');
    expect(tags.biomarkers.her2).toBe('her2_reported');
    expect(tags.biomarkers.pdl1).toBe('TPS 10%');
  });

  test('buildValidationIssues flags unsafe values and conflicts', () => {
    const issues = buildValidationIssues({
      age: 151,
      ecog: 5,
      stage: 'I期伴远处转移',
      treatmentLine: 1,
      treatmentHistory: [{}, {}, {}, {}]
    });

    expect(issues.map((i) => i.code)).toEqual(expect.arrayContaining([
      'out_of_range',
      'invalid_enum',
      'stage_conflict',
      'line_conflict'
    ]));
  });

  test('batch counters keep no-record upload failures in total and failed count', () => {
    const counts = __testables.computeInitialBatchCounts({
      totalCount: 5,
      records: [
        { fileId: 'rec-1', status: 'completed' },
        { fileId: 'rec-2', status: 'completed' },
        { fileId: 'rec-3', status: 'completed' },
        { fileId: 'rec-4', status: 'completed' },
        { fileId: null, status: 'error', message: 'PUT 失败' }
      ]
    });

    expect(counts.recordIds).toEqual(['rec-1', 'rec-2', 'rec-3', 'rec-4']);
    expect(counts.total).toBe(5);
    expect(counts.successCount).toBe(4);
    expect(counts.failedCount).toBe(1);
    expect(counts.processedCount).toBe(5);
    expect(counts.uploadFailedCount).toBe(1);
  });

  test('batch update counters count duplicate record ids and external upload failures', () => {
    const counts = __testables.computeBatchCountsFromRecords({
      batchRecordIds: ['rec-1', 'rec-1', 'rec-2'],
      totalCount: 4,
      metadata: { uploadFailedCount: 1 },
      records: [
        { id: 'rec-1', status: 'completed' },
        { id: 'rec-2', status: 'error' }
      ]
    });

    expect(counts.total).toBe(4);
    expect(counts.successCount).toBe(2);
    expect(counts.failedCount).toBe(2);
    expect(counts.processedCount).toBe(4);
  });

  test('validateCaseRevisionPatches rejects unsupported fields and oversized values', () => {
    expect(validateCaseRevisionPatches([
      { fieldKey: 'diagnosis', value: '直肠癌' }
    ])).toMatchObject({ ok: true });

    expect(validateCaseRevisionPatches([
      { fieldKey: '__proto__', value: 'x' }
    ])).toMatchObject({ ok: false });

    expect(validateCaseRevisionPatches([
      { fieldKey: 'diagnosis', value: 'x'.repeat(11 * 1024) }
    ])).toMatchObject({ ok: false });
  });

  test('upsertCaseFromRecords joins the active-case winner after a create race', async () => {
    const tx = { LOCK: { UPDATE: 'UPDATE' } };
    models.sequelize.transaction.mockImplementation(async (fn) => fn(tx));
    const winner = {
      id: 'case-winner',
      user_id: 'u1',
      status: 'active',
      source_record_ids: [],
      entities: {},
      active_version_id: null,
      update: jest.fn(async function update(values) {
        Object.assign(this, values);
        return this;
      }),
      get: jest.fn(function get() { return { ...this }; })
    };
    models.MedicalCase.findOne = jest.fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(winner);
    models.MedicalCase.create = jest.fn()
      .mockRejectedValueOnce({ name: 'SequelizeUniqueConstraintError', message: 'duplicate active case' });
    models.MedicalCase.findByPk = jest.fn().mockResolvedValue(winner);
    models.MedicalRecord.findAll = jest.fn().mockResolvedValue([
      {
        id: 'rec-1',
        status: 'completed',
        structured: { entities: { diagnosis: '肺腺癌' } },
        diagnosis: '肺腺癌'
      }
    ]);
    models.MedicalRecord.update = jest.fn().mockResolvedValue([1]);
    models.MedicalCaseRevision.findAll = jest.fn().mockResolvedValue([]);
    models.MedicalCaseVersion.findOne = jest.fn().mockResolvedValue(null);
    models.MedicalCaseVersion.create = jest.fn().mockResolvedValue({ id: 'casev-1', version_no: 1 });
    models.MedicalFieldEvidence.destroy = jest.fn().mockResolvedValue(0);
    models.MedicalFieldEvidence.bulkCreate = jest.fn().mockResolvedValue([]);

    const result = await upsertCaseFromRecords({
      userId: 'u1',
      recordIds: ['rec-1'],
      metadata: { source: 'test' }
    });

    expect(models.MedicalCase.create).toHaveBeenCalledTimes(1);
    expect(models.MedicalCase.findOne).toHaveBeenCalledTimes(2);
    expect(result.caseId).toBe('case-winner');
    expect(models.MedicalCaseVersion.create).toHaveBeenCalledWith(
      expect.objectContaining({ case_id: 'case-winner', version_no: 1 }),
      { transaction: tx }
    );
  });

  test('createCaseVersionWithRetry retries duplicate version_no inside the transaction', async () => {
    const tx = { LOCK: { UPDATE: 'UPDATE' } };
    models.MedicalCaseVersion.findOne = jest.fn()
      .mockResolvedValueOnce({ version_no: 1 })
      .mockResolvedValueOnce({ version_no: 2 });
    models.MedicalCaseVersion.create = jest.fn()
      .mockRejectedValueOnce({ name: 'SequelizeUniqueConstraintError', message: 'duplicate version' })
      .mockResolvedValueOnce({ id: 'casev-3', version_no: 3 });

    const version = await __testables.createCaseVersionWithRetry({
      caseId: 'case-1',
      userId: 'u1',
      entities: { diagnosis: '肺腺癌' },
      summary: {},
      sourceRecordIds: ['rec-1'],
      completeness: {},
      validationIssues: [],
      normalizedTags: {},
      metadata: { source: 'test' },
      transaction: tx
    });

    expect(version.version_no).toBe(3);
    expect(models.MedicalCaseVersion.create).toHaveBeenCalledTimes(2);
    expect(models.MedicalCaseVersion.create.mock.calls[0][0].version_no).toBe(2);
    expect(models.MedicalCaseVersion.create.mock.calls[1][0].version_no).toBe(3);
  });
});
