/**
 * Unit tests for matchEngine.js hard filters and disease disambiguation
 *
 * These tests lock in the accuracy gains from the gene/prior-lines/
 * cancer-type/explicit-exclusion hard filters and the NSCLC/SCLC
 * disjoint check. A regression here means previously false-positive
 * matches are slipping through again.
 */

const {
  scoreRecordAgainstTrial,
  matchDiseaseText,
  getDiseaseProfile
} = require('../services/matchEngine');

// ---- Disease disambiguation ----
describe('matchDiseaseText — NSCLC vs SCLC disjoint', () => {
  it('NSCLC patient must NOT match SCLC trial text', () => {
    const r = matchDiseaseText('非小细胞肺癌（肺腺癌）', '小细胞肺癌');
    expect(r.matched).toBe(false);
    expect(r.conflict).toBe('nsclc_sclc');
  });

  it('SCLC patient must NOT match NSCLC trial text', () => {
    const r = matchDiseaseText('小细胞肺癌', '非鳞状非小细胞肺癌、NSCLC');
    expect(r.matched).toBe(false);
    expect(r.conflict).toBe('nsclc_sclc');
  });

  it('NSCLC patient matches basket trial text containing NSCLC + other cancers', () => {
    const r = matchDiseaseText(
      '非小细胞肺癌（肺腺癌）',
      '胃癌 胆道癌 非小细胞肺癌 结直肠腺癌 肝细胞癌'
    );
    expect(r.matched).toBe(true);
    expect(r.specific).toBe(true);
  });

  it('CRC patient matches basket trial text even when NSCLC is listed first', () => {
    const r = matchDiseaseText(
      '结直肠癌（结肠腺癌）',
      '胃癌 胆道癌 非小细胞肺癌 头颈部鳞状细胞癌 肝细胞癌 结直肠腺癌'
    );
    expect(r.matched).toBe(true);
  });

  it('getDiseaseProfile resolves "小细胞肺癌" to SCLC, not NSCLC', () => {
    const profile = getDiseaseProfile('小细胞肺癌');
    expect(profile).not.toBeNull();
    expect(profile.id).toBe('lung_sclc');
  });
});

// ---- Hard filters via structured_inclusion ----
describe('scoreRecordAgainstTrial — hard filters', () => {
  const baseTrial = (overrides = {}) => ({
    id: 'TEST',
    name: 'Trial TEST',
    description: '',
    indication: '',
    brief_inclusion: '',
    inclusion_criteria: [],
    exclusion_criteria: [],
    disease_tags: [],
    treatment_lines: [],
    study_cities: [],
    status: 'recruiting',
    structured_inclusion: { age_min: 18, age_max: null, ecog_max: null },
    ...overrides
  });

  it('hard-excludes when patient prior-lines exceed trial max', () => {
    // Trial AK112-312 style: prior_lines_max = 0 (treatment-naive only)
    const trial = baseTrial({
      structured_inclusion: {
        age_min: 18, ecog_max: 1,
        prior_lines_min: 0, prior_lines_max: 0,
        allowed_cancer_types: ['结直肠癌']
      },
      disease_tags: ['结直肠癌'],
      indication: '结直肠癌'
    });
    const record = {
      diagnosis: '结直肠腺癌',
      treatment_line: 3, age: 70,
      structured: { entities: { ecog: 1, treatmentLine: 3, age: 70 } }
    };
    const r = scoreRecordAgainstTrial(record, trial);
    expect(r.excluded).toBe(true);
    expect(r.score).toBe(0);
  });

  it('hard-excludes when patient prior-lines below trial min', () => {
    const trial = baseTrial({
      structured_inclusion: {
        age_min: 18, ecog_max: 1,
        prior_lines_min: 2, prior_lines_max: 4,
        allowed_cancer_types: ['胃癌']
      }
    });
    const record = {
      diagnosis: '胃癌',
      treatment_line: 2, // = 1 prior line only
      age: 45,
      structured: { entities: { ecog: 1, treatmentLine: 2, age: 45 } }
    };
    const r = scoreRecordAgainstTrial(record, trial);
    expect(r.excluded).toBe(true);
  });

  it('hard-excludes when diagnosis not in allowed_cancer_types (no generic bucket)', () => {
    const trial = baseTrial({
      structured_inclusion: {
        age_min: 18, ecog_max: 2,
        allowed_cancer_types: ['非鳞状非小细胞肺癌', 'NSCLC']
      }
    });
    const record = {
      diagnosis: '小细胞肺癌',
      age: 42, treatment_line: 2,
      structured: { entities: { ecog: 1, age: 42 } }
    };
    const r = scoreRecordAgainstTrial(record, trial);
    expect(r.excluded).toBe(true);
  });

  it('does NOT hard-exclude when allowed_cancer_types has a generic bucket (basket trial)', () => {
    const trial = baseTrial({
      structured_inclusion: {
        age_min: 18, ecog_max: 2,
        allowed_cancer_types: ['结直肠癌', '胃癌', '其他实体瘤']
      }
    });
    const record = {
      diagnosis: '肝细胞癌',
      age: 48, treatment_line: 2,
      structured: { entities: { ecog: 0, age: 48 } }
    };
    const r = scoreRecordAgainstTrial(record, trial);
    expect(r.excluded).toBeFalsy();
  });

  it('hard-excludes TNBC patient when trial requires HER2-positive', () => {
    const trial = baseTrial({
      structured_inclusion: {
        age_min: 18, ecog_max: 1,
        allowed_cancer_types: ['HER2阳性乳腺癌', '乳腺癌'],
        required_genes: ['HER2阳性（IHC3+或FISH+）']
      }
    });
    const record = {
      diagnosis: '三阴性乳腺癌',
      gene_mutation: 'BRCA1突变',
      age: 35, treatment_line: 2,
      structured: { entities: { ecog: 0, age: 35, treatmentLine: 2 } }
    };
    const r = scoreRecordAgainstTrial(record, trial);
    expect(r.excluded).toBe(true);
  });

  it('hard-excludes on explicit "暂不接收" clause in other_key_criteria', () => {
    const trial = baseTrial({
      structured_inclusion: {
        age_min: 18, ecog_max: 1,
        allowed_cancer_types: ['其他实体瘤'],
        other_key_criteria: ['经标准治疗失败或无有效的标准治疗', '暂不接收小细胞肺癌']
      }
    });
    const record = {
      diagnosis: '小细胞肺癌',
      age: 42, treatment_line: 2,
      structured: { entities: { ecog: 1, age: 42 } }
    };
    const r = scoreRecordAgainstTrial(record, trial);
    expect(r.excluded).toBe(true);
  });

  it('does NOT trigger the "暂不接收 小细胞肺癌" exclusion for NSCLC patient', () => {
    // Regression guard: "非小细胞肺癌" contains "小细胞肺癌" as substring,
    // but must NOT be treated as SCLC
    const trial = baseTrial({
      structured_inclusion: {
        age_min: 18, ecog_max: 1,
        allowed_cancer_types: ['非小细胞肺癌', '其他实体瘤'],
        other_key_criteria: ['暂不接收小细胞肺癌']
      }
    });
    const record = {
      diagnosis: '非小细胞肺癌（肺腺癌）',
      age: 55, treatment_line: 2,
      structured: { entities: { ecog: 1, age: 55 } }
    };
    const r = scoreRecordAgainstTrial(record, trial);
    expect(r.excluded).toBeFalsy();
    expect(r.score).toBeGreaterThan(0);
  });
});
