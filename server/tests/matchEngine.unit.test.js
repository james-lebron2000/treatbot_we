/**
 * matchEngine.unit.test.js — Unit tests for the hard-filter layer of scoreRecordAgainstTrial.
 *
 * These tests pin down the regression-prone parts of the matching engine:
 *   - required_genes mismatch / unknown-with-panel → hard exclude
 *   - prior_lines_min / prior_lines_max → hard exclude
 *   - excluded_prior_therapies class-expansion (immunotherapy only when pure class)
 *   - required_prior_therapies + treatment-naive → hard exclude
 *   - allowed_cancer_types non-basket mismatch → hard exclude
 *   - allowed_cancer_types generic basket with "除外X" sub-clause → hard exclude
 *   - NSCLC ⊂ SCLC text substring trap → not excluded
 */

const {
  scoreRecordAgainstTrial,
  getDiseaseProfile
} = require('../services/matchEngine');

const baseTrial = (overrides = {}) => ({
  id: 'T_TEST',
  name: 'Test Trial',
  indication: '',
  description: '',
  brief_inclusion: '',
  inclusion_criteria: [],
  exclusion_criteria: [],
  disease_tags: [],
  treatment_lines: [],
  study_cities: [],
  status: 'recruiting',
  ...overrides
});

const baseRecord = (overrides = {}) => ({
  diagnosis: '',
  stage: '',
  gene_mutation: '',
  treatment: '',
  treatment_line: null,
  pdl1: null,
  age: 50,
  structured: { entities: { ecog: 1 } },
  ...overrides
});

describe('scoreRecordAgainstTrial — hard filters', () => {
  describe('required_genes', () => {
    test('patient wild-type conflicts with trial requiring mutant → exclude', () => {
      const trial = baseTrial({
        indication: '非小细胞肺癌',
        disease_tags: ['非小细胞肺癌'],
        inclusion_criteria: ['HER2突变'],
        structured_inclusion: { required_genes: ['HER2激活突变'], allowed_cancer_types: ['非小细胞肺癌'] }
      });
      const record = baseRecord({ diagnosis: '非小细胞肺癌', gene_mutation: 'HER2野生型' });
      const res = scoreRecordAgainstTrial(record, trial);
      expect(res.excluded).toBe(true);
      expect(res.score).toBe(0);
    });

    test('patient has other gene panel but lacks required gene → exclude (A11.1)', () => {
      const trial = baseTrial({
        indication: '非小细胞肺癌',
        structured_inclusion: { required_genes: ['HER2激活突变'], allowed_cancer_types: ['非小细胞肺癌'] }
      });
      const record = baseRecord({ diagnosis: '非小细胞肺癌', gene_mutation: 'EGFR L858R突变阳性' });
      const res = scoreRecordAgainstTrial(record, trial);
      expect(res.excluded).toBe(true);
    });

    test('patient HER2 positive matches HER2-required trial → not excluded', () => {
      const trial = baseTrial({
        indication: '乳腺癌',
        disease_tags: ['乳腺癌'],
        structured_inclusion: {
          required_genes: ['HER2阳性（IHC3+或FISH+）'],
          allowed_cancer_types: ['HER2阳性乳腺癌']
        }
      });
      const record = baseRecord({ diagnosis: '乳腺癌', gene_mutation: 'HER2阳性（IHC3+）' });
      const res = scoreRecordAgainstTrial(record, trial);
      expect(res.excluded).toBeFalsy();
      expect(res.score).toBeGreaterThan(40);
    });

    test('trial requires CLDN18.2, patient has only HER2+ → exclude via panel rule', () => {
      const trial = baseTrial({
        indication: '胃癌',
        structured_inclusion: { required_genes: ['CLDN18.2表达'], allowed_cancer_types: ['胃癌'] }
      });
      const record = baseRecord({
        diagnosis: '胃癌',
        gene_mutation: 'HER2阳性(IHC3+)',
        treatment_line: 2
      });
      const res = scoreRecordAgainstTrial(record, trial);
      expect(res.excluded).toBe(true);
    });
  });

  describe('prior_lines', () => {
    test('treatment-naive patient vs treatment-naive-only trial → pass', () => {
      const trial = baseTrial({
        indication: '非小细胞肺癌',
        structured_inclusion: {
          prior_lines_max: 0,
          allowed_cancer_types: ['非小细胞肺癌']
        }
      });
      const record = baseRecord({ diagnosis: '非小细胞肺癌', treatment_line: 1 });
      const res = scoreRecordAgainstTrial(record, trial);
      expect(res.excluded).toBeFalsy();
    });

    test('previously treated patient vs treatment-naive-only trial → exclude', () => {
      const trial = baseTrial({
        indication: '非小细胞肺癌',
        structured_inclusion: {
          prior_lines_max: 0,
          allowed_cancer_types: ['非小细胞肺癌']
        }
      });
      const record = baseRecord({ diagnosis: '非小细胞肺癌', treatment_line: 3, treatment: '一线化疗，二线靶向后进展' });
      const res = scoreRecordAgainstTrial(record, trial);
      expect(res.excluded).toBe(true);
    });

    test('trial requires ≥2 prior lines, patient is 1st line → exclude', () => {
      const trial = baseTrial({
        indication: '胃癌',
        structured_inclusion: {
          prior_lines_min: 2,
          allowed_cancer_types: ['胃癌']
        }
      });
      const record = baseRecord({ diagnosis: '胃癌', treatment_line: 1 });
      const res = scoreRecordAgainstTrial(record, trial);
      expect(res.excluded).toBe(true);
    });
  });

  describe('excluded_prior_therapies class expansion', () => {
    test('trial excludes "免疫治疗" + patient had pembrolizumab → exclude', () => {
      const trial = baseTrial({
        indication: '结直肠癌',
        structured_inclusion: {
          excluded_prior_therapies: ['免疫治疗', '免疫检查点抑制剂'],
          allowed_cancer_types: ['结直肠癌']
        }
      });
      const record = baseRecord({
        diagnosis: '结直肠癌',
        treatment: '一线帕博利珠单抗后进展',
        treatment_line: 2
      });
      const res = scoreRecordAgainstTrial(record, trial);
      expect(res.excluded).toBe(true);
    });

    test('trial excludes COMBO immunotherapy + patient had PD-1 mono → not excluded by class rule', () => {
      const trial = baseTrial({
        indication: '肝细胞癌',
        structured_inclusion: {
          excluded_prior_therapies: ['抗PD-(L)1单抗联合抗CTLA4单抗'],
          allowed_cancer_types: ['肝细胞癌']
        }
      });
      const record = baseRecord({
        diagnosis: '肝细胞癌',
        treatment: '一线仑伐替尼联合信迪利单抗治疗后进展',
        treatment_line: 2
      });
      const res = scoreRecordAgainstTrial(record, trial);
      expect(res.excluded).toBeFalsy();
    });
  });

  describe('required_prior_therapies', () => {
    test('treatment-naive patient vs trial requiring prior platinum chemo → exclude', () => {
      const trial = baseTrial({
        indication: '小细胞肺癌',
        structured_inclusion: {
          required_prior_therapies: ['铂类化疗'],
          allowed_cancer_types: ['小细胞肺癌']
        }
      });
      const record = baseRecord({ diagnosis: '小细胞肺癌', treatment_line: 1, treatment: '' });
      const res = scoreRecordAgainstTrial(record, trial);
      expect(res.excluded).toBe(true);
    });

    test('patient with prior platinum chemo → not excluded by required-therapy rule', () => {
      const trial = baseTrial({
        indication: '小细胞肺癌',
        structured_inclusion: {
          required_prior_therapies: ['铂类化疗'],
          allowed_cancer_types: ['小细胞肺癌']
        }
      });
      const record = baseRecord({
        diagnosis: '小细胞肺癌',
        treatment_line: 2,
        treatment: '一线依托泊苷+卡铂治疗后进展'
      });
      const res = scoreRecordAgainstTrial(record, trial);
      expect(res.excluded).toBeFalsy();
    });
  });

  describe('allowed_cancer_types', () => {
    test('non-basket trial, patient cancer not in list → exclude', () => {
      const trial = baseTrial({
        indication: '小细胞肺癌',
        structured_inclusion: {
          allowed_cancer_types: ['小细胞肺癌', '大细胞神经内分泌肿瘤']
        }
      });
      const record = baseRecord({ diagnosis: '非鳞状非小细胞肺癌' });
      const res = scoreRecordAgainstTrial(record, trial);
      expect(res.excluded).toBe(true);
    });

    test('basket trial with generic catch-all → no hard exclusion by cancer type alone', () => {
      const trial = baseTrial({
        indication: '实体瘤',
        structured_inclusion: {
          allowed_cancer_types: ['胃癌', '非小细胞肺癌', '其他实体瘤（除外小细胞肺癌）']
        }
      });
      const record = baseRecord({ diagnosis: '非小细胞肺癌（肺腺癌）' });
      const res = scoreRecordAgainstTrial(record, trial);
      expect(res.excluded).toBeFalsy();
    });

    test('basket trial excluding SCLC, patient is NSCLC → not excluded (profile disambiguation)', () => {
      const trial = baseTrial({
        indication: '实体瘤',
        structured_inclusion: {
          allowed_cancer_types: ['胃癌', '非小细胞肺癌', '其他实体瘤（除外小细胞肺癌）'],
          other_key_criteria: ['暂不接收小细胞肺癌']
        }
      });
      const record = baseRecord({ diagnosis: '非小细胞肺癌（肺腺癌）' });
      const res = scoreRecordAgainstTrial(record, trial);
      expect(res.excluded).toBeFalsy();
    });

    test('basket trial excluding SCLC, patient IS SCLC → excluded', () => {
      const trial = baseTrial({
        indication: '实体瘤',
        structured_inclusion: {
          allowed_cancer_types: ['胃癌', '非小细胞肺癌', '其他实体瘤（除外小细胞肺癌）'],
          other_key_criteria: ['暂不接收小细胞肺癌']
        }
      });
      const record = baseRecord({ diagnosis: '小细胞肺癌' });
      const res = scoreRecordAgainstTrial(record, trial);
      expect(res.excluded).toBe(true);
    });
  });

  describe('disease profile disambiguation', () => {
    test('getDiseaseProfile handles NSCLC vs SCLC without confusion', () => {
      expect(getDiseaseProfile('非小细胞肺癌（肺腺癌）').id).toBe('lung_nsclc');
      expect(getDiseaseProfile('小细胞肺癌').id).toBe('lung_sclc');
      expect(getDiseaseProfile('非鳞状非小细胞肺癌').id).toBe('lung_nsclc');
      expect(getDiseaseProfile('广泛期小细胞肺癌').id).toBe('lung_sclc');
    });
  });
});
