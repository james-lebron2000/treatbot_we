/**
 * matchEngine hard-filter unit tests
 * Covers NSCLC/SCLC disambiguation, required_genes, allowed_cancer_types,
 * prior_lines_max/min, excluded_prior_therapies, molecular subtype (HER2/TNBC).
 *
 * No DB / network required — runs as pure function tests.
 */

const {
  scoreRecordAgainstTrial,
  matchDiseaseText
} = require('../services/matchEngine');

const buildTrial = (structured_inclusion, overrides = {}) => {
  const s = structured_inclusion;
  const inclusionParts = [];
  if (s.allowed_cancer_types) inclusionParts.push(...s.allowed_cancer_types);
  if (s.required_genes) inclusionParts.push(...s.required_genes);
  if (s.required_stage) inclusionParts.push(...s.required_stage);
  if (s.other_key_criteria) inclusionParts.push(...s.other_key_criteria);
  const exclusionParts = [...(s.excluded_prior_therapies || [])];
  return {
    id: overrides.id || 'TEST',
    name: 'Test trial',
    indication: (s.allowed_cancer_types || []).join('、'),
    description: '',
    brief_inclusion: inclusionParts.join('；'),
    inclusion_criteria: inclusionParts,
    exclusion_criteria: exclusionParts,
    disease_tags: s.allowed_cancer_types || [],
    treatment_lines: [],
    study_cities: [],
    status: 'recruiting',
    structured_inclusion: s,
    ...overrides
  };
};

describe('matchEngine hard filters', () => {
  describe('NSCLC / SCLC disambiguation', () => {
    test('matchDiseaseText: 小细胞肺癌 should NOT match 非小细胞肺癌', () => {
      const m = matchDiseaseText('小细胞肺癌', '非小细胞肺癌');
      expect(m.matched).toBe(false);
    });

    test('matchDiseaseText: 非小细胞肺癌 should NOT match 小细胞肺癌', () => {
      const m = matchDiseaseText('非小细胞肺癌', '小细胞肺癌');
      expect(m.matched).toBe(false);
    });

    test('matchDiseaseText: 非鳞状非小细胞肺癌 matches NSCLC trials', () => {
      const m = matchDiseaseText('非鳞状非小细胞肺癌', 'NSCLC');
      expect(m.matched).toBe(true);
    });

    test('SCLC patient vs NSCLC-only trial → excluded', () => {
      const trial = buildTrial({
        age_min: 18,
        allowed_cancer_types: ['非鳞状非小细胞肺癌', 'NSCLC'],
        required_genes: ['HER2 TKD激活突变']
      });
      const record = {
        diagnosis: '小细胞肺癌',
        age: 45,
        structured: { entities: { age: 45, ecog: 1 } }
      };
      const result = scoreRecordAgainstTrial(record, trial);
      expect(result.excluded).toBe(true);
      expect(result.score).toBe(0);
    });
  });

  describe('required_genes hard filter', () => {
    test('patient EGFR wild-type on EGFR-required trial → excluded', () => {
      const trial = buildTrial({
        age_min: 18,
        allowed_cancer_types: ['非小细胞肺癌'],
        required_genes: ['EGFR激活突变']
      });
      const record = {
        diagnosis: '非小细胞肺癌（肺腺癌）',
        age: 60,
        gene_mutation: 'EGFR野生型, ALK阴性',
        structured: { entities: { age: 60, ecog: 1 } }
      };
      const result = scoreRecordAgainstTrial(record, trial);
      expect(result.excluded).toBe(true);
      expect(result.reasons[0]).toMatch(/EGFR/);
    });

    test('patient HER2 positive on HER2+ trial → NOT excluded', () => {
      const trial = buildTrial({
        age_min: 18,
        allowed_cancer_types: ['乳腺癌'],
        required_genes: ['HER2阳性']
      });
      const record = {
        diagnosis: '乳腺癌',
        age: 52,
        gene_mutation: 'HER2阳性（IHC3+）',
        structured: { entities: { age: 52, ecog: 1 } }
      };
      const result = scoreRecordAgainstTrial(record, trial);
      expect(result.excluded).not.toBe(true);
      expect(result.score).toBeGreaterThan(40);
    });

    test('NSCLC ALK+ patient vs HER2-required trial → excluded (driver mutual exclusivity)', () => {
      const trial = buildTrial({
        age_min: 18,
        allowed_cancer_types: ['非鳞状非小细胞肺癌', 'NSCLC'],
        required_genes: ['HER2 TKD激活突变']
      });
      const record = {
        diagnosis: '非鳞状非小细胞肺癌',
        age: 68,
        gene_mutation: 'ALK融合阳性',
        treatment_line: 1,
        structured: { entities: { age: 68, ecog: 0, treatmentLine: 1 } }
      };
      const result = scoreRecordAgainstTrial(record, trial);
      expect(result.excluded).toBe(true);
      expect(result.reasons[0]).toMatch(/ALK|驱动/);
    });

    test('NSCLC EGFR+ patient matching EGFR-required trial → NOT excluded', () => {
      const trial = buildTrial({
        age_min: 18,
        allowed_cancer_types: ['非小细胞肺癌'],
        required_genes: ['EGFR激活突变']
      });
      const record = {
        diagnosis: '非小细胞肺癌（肺腺癌）',
        age: 55,
        gene_mutation: 'EGFR L858R突变阳性',
        treatment_line: 2,
        structured: { entities: { age: 55, ecog: 1, treatmentLine: 2 } }
      };
      const result = scoreRecordAgainstTrial(record, trial);
      expect(result.excluded).not.toBe(true);
      expect(result.score).toBeGreaterThan(40);
    });

    test('patient without gene info on gene-required trial → not hard excluded (uncertain)', () => {
      const trial = buildTrial({
        age_min: 18,
        allowed_cancer_types: ['非小细胞肺癌'],
        required_genes: ['HER2 TKD激活突变']
      });
      const record = {
        diagnosis: '非小细胞肺癌',
        age: 55,
        gene_mutation: null,
        structured: { entities: { age: 55, ecog: 1 } }
      };
      const result = scoreRecordAgainstTrial(record, trial);
      expect(result.excluded).not.toBe(true);
    });
  });

  describe('allowed_cancer_types hard filter', () => {
    test('liver cancer patient vs NSCLC trial → excluded', () => {
      const trial = buildTrial({
        age_min: 18,
        allowed_cancer_types: ['非鳞状非小细胞肺癌', 'NSCLC']
      });
      const record = {
        diagnosis: '肝细胞癌',
        age: 60,
        structured: { entities: { age: 60, ecog: 1 } }
      };
      const result = scoreRecordAgainstTrial(record, trial);
      expect(result.excluded).toBe(true);
    });

    test('generic basket trial accepts any solid tumor', () => {
      const trial = buildTrial({
        age_min: 18,
        allowed_cancer_types: ['其他实体瘤']
      });
      const record = {
        diagnosis: '胰腺癌',
        age: 60,
        structured: { entities: { age: 60, ecog: 1 } }
      };
      const result = scoreRecordAgainstTrial(record, trial);
      expect(result.excluded).not.toBe(true);
    });

    test('"其他实体瘤（除外小细胞肺癌）" excludes SCLC patient', () => {
      const trial = buildTrial({
        age_min: 18,
        allowed_cancer_types: ['胃癌', '其他实体瘤（除外小细胞肺癌）']
      });
      const record = {
        diagnosis: '小细胞肺癌',
        age: 50,
        structured: { entities: { age: 50, ecog: 1 } }
      };
      const result = scoreRecordAgainstTrial(record, trial);
      expect(result.excluded).toBe(true);
    });

    test('TNBC patient vs HER2+ breast trial → excluded by molecular subtype', () => {
      const trial = buildTrial({
        age_min: 18,
        allowed_cancer_types: ['HER2阳性乳腺癌'],
        required_genes: ['HER2阳性']
      });
      const record = {
        diagnosis: '三阴性乳腺癌',
        age: 35,
        gene_mutation: 'BRCA1突变',
        structured: { entities: { age: 35, ecog: 0 } }
      };
      const result = scoreRecordAgainstTrial(record, trial);
      expect(result.excluded).toBe(true);
    });

    test('HER2+ breast patient matches "乳腺癌（HER2阳性）" diagnosis against HER2+ trial', () => {
      const trial = buildTrial({
        age_min: 18,
        allowed_cancer_types: ['HER2阳性乳腺癌'],
        required_genes: ['HER2阳性（IHC3+或FISH+）']
      });
      const record = {
        diagnosis: '乳腺癌（HER2阳性）',
        age: 52,
        gene_mutation: 'HER2阳性（IHC3+）',
        structured: { entities: { age: 52, ecog: 1 } }
      };
      const result = scoreRecordAgainstTrial(record, trial);
      expect(result.excluded).not.toBe(true);
      expect(result.score).toBeGreaterThan(40);
    });
  });

  describe('prior_lines_max / prior_lines_min hard filter', () => {
    test('patient with 2 prior lines on "treatment-naive only" (prior_lines_max=0) trial → excluded', () => {
      const trial = buildTrial({
        age_min: 18,
        allowed_cancer_types: ['结直肠癌'],
        prior_lines_max: 0
      });
      const record = {
        diagnosis: '结直肠癌',
        age: 58,
        treatment_line: 3,
        structured: { entities: { age: 58, ecog: 0, treatmentLine: 3 } }
      };
      const result = scoreRecordAgainstTrial(record, trial);
      expect(result.excluded).toBe(true);
      expect(result.reasons[0]).toMatch(/既往治疗线数/);
    });

    test('patient with 1 prior line on "≥2 prior lines" trial → excluded', () => {
      const trial = buildTrial({
        age_min: 18,
        allowed_cancer_types: ['胃癌'],
        prior_lines_min: 2
      });
      const record = {
        diagnosis: '胃癌',
        age: 60,
        treatment_line: 2,
        structured: { entities: { age: 60, ecog: 1, treatmentLine: 2 } }
      };
      const result = scoreRecordAgainstTrial(record, trial);
      expect(result.excluded).toBe(true);
    });

    test('patient with 2 prior lines on prior_lines_min=2 trial → not excluded', () => {
      const trial = buildTrial({
        age_min: 18,
        allowed_cancer_types: ['胃癌'],
        prior_lines_min: 2,
        prior_lines_max: 4
      });
      const record = {
        diagnosis: '胃癌',
        age: 60,
        treatment_line: 3,
        structured: { entities: { age: 60, ecog: 1, treatmentLine: 3 } }
      };
      const result = scoreRecordAgainstTrial(record, trial);
      expect(result.excluded).not.toBe(true);
    });
  });

  describe('excluded_prior_therapies: immunotherapy class expansion', () => {
    test('class-level "免疫治疗" exclusion matches patient with PD-1 history', () => {
      const trial = buildTrial({
        age_min: 18,
        allowed_cancer_types: ['结直肠癌'],
        excluded_prior_therapies: ['免疫治疗', '免疫检查点抑制剂']
      });
      const record = {
        diagnosis: '结直肠癌',
        age: 58,
        treatment: '一线帕博利珠单抗后进展',
        structured: { entities: { age: 58, ecog: 0 } }
      };
      const result = scoreRecordAgainstTrial(record, trial);
      expect(result.excluded).toBe(true);
    });

    test('specific combo exclusion "PD-1+CTLA4" should NOT exclude PD-1 mono patient', () => {
      const trial = buildTrial({
        age_min: 18,
        allowed_cancer_types: ['肝细胞癌'],
        excluded_prior_therapies: ['抗PD-(L)1单抗联合抗CTLA4单抗', 'PD-(L)1/CTLA4双抗']
      });
      const record = {
        diagnosis: '肝细胞癌',
        age: 60,
        treatment: '一线仑伐替尼+PD-1治疗后进展',
        structured: { entities: { age: 60, ecog: 1 } }
      };
      const result = scoreRecordAgainstTrial(record, trial);
      expect(result.excluded).not.toBe(true);
    });
  });

  describe('other_key_criteria: SCLC / HER2 explicit exclusions', () => {
    test('"暂不接收小细胞肺癌" does NOT exclude NSCLC patient', () => {
      const trial = buildTrial({
        age_min: 18,
        allowed_cancer_types: ['胃癌', '非小细胞肺癌', '其他实体瘤（除外小细胞肺癌）'],
        other_key_criteria: ['经标准治疗失败或无有效的标准治疗', '暂不接收小细胞肺癌']
      });
      const record = {
        diagnosis: '非小细胞肺癌',
        age: 60,
        structured: { entities: { age: 60, ecog: 1 } }
      };
      const result = scoreRecordAgainstTrial(record, trial);
      expect(result.excluded).not.toBe(true);
    });

    test('"暂不接收小细胞肺癌" excludes SCLC patient', () => {
      const trial = buildTrial({
        age_min: 18,
        allowed_cancer_types: ['其他实体瘤'],
        other_key_criteria: ['经标准治疗失败或无有效的标准治疗', '暂不接收小细胞肺癌']
      });
      const record = {
        diagnosis: '小细胞肺癌',
        age: 45,
        structured: { entities: { age: 45, ecog: 1 } }
      };
      const result = scoreRecordAgainstTrial(record, trial);
      expect(result.excluded).toBe(true);
    });

    test('"HER2阴性" criterion does NOT exclude HER2-negative patient', () => {
      const trial = buildTrial({
        age_min: 18,
        allowed_cancer_types: ['胃癌'],
        required_genes: ['CLDN18.2表达'],
        other_key_criteria: ['HER2阴性']
      });
      const record = {
        diagnosis: '胃腺癌',
        age: 63,
        gene_mutation: 'HER2阴性, CLDN18.2阳性(IHC2+/3+ ≥75%)',
        treatment_line: 3,
        structured: { entities: { age: 63, ecog: 1, treatmentLine: 3 } }
      };
      const result = scoreRecordAgainstTrial(record, trial);
      expect(result.excluded).not.toBe(true);
    });
  });
});
