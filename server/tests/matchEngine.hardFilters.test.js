/**
 * matchEngine.hardFilters.test.js
 *
 * Regression tests for structured_inclusion hard filters added in scoreRecordAgainstTrial:
 *   - required_genes   → gene mismatch / status conflict on widely-tested genes
 *   - prior_lines_min  / prior_lines_max  → out-of-range treatment history
 *   - allowed_cancer_types → cancer type mismatch with NSCLC/SCLC, TNBC/HER2+ disambiguation
 *
 * Each block targets one filter in isolation so regressions are localized.
 */

const { scoreRecordAgainstTrial } = require('../services/matchEngine');

const makeTrial = (overrides = {}) => ({
  id: 'TEST',
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
  structured_inclusion: null,
  ...overrides
});

describe('scoreRecordAgainstTrial — required_genes hard filter', () => {
  test('excludes patient whose gene text has no overlap with required widely-tested gene', () => {
    const record = {
      diagnosis: '非小细胞肺癌',
      gene_mutation: 'ALK融合阳性'
    };
    const trial = makeTrial({
      structured_inclusion: {
        allowed_cancer_types: ['非小细胞肺癌', 'NSCLC'],
        required_genes: ['HER2 TKD激活突变']
      }
    });
    const out = scoreRecordAgainstTrial(record, trial);
    expect(out.excluded).toBe(true);
    expect(out.score).toBe(0);
    expect(out.reasons[0]).toMatch(/HER2/);
  });

  test('does NOT exclude when patient has the required gene (HER2+ breast matches HER2+ trial)', () => {
    const record = {
      diagnosis: '乳腺癌（HER2阳性）',
      gene_mutation: 'HER2阳性（IHC3+）'
    };
    const trial = makeTrial({
      indication: 'HER2阳性乳腺癌',
      brief_inclusion: 'HER2阳性乳腺癌',
      disease_tags: ['HER2阳性乳腺癌'],
      structured_inclusion: {
        allowed_cancer_types: ['乳腺癌', 'HER2阳性乳腺癌'],
        required_genes: ['HER2阳性（IHC3+或FISH+）']
      }
    });
    const out = scoreRecordAgainstTrial(record, trial);
    expect(out.excluded).toBeFalsy();
    expect(out.score).toBeGreaterThan(40);
  });

  test('does NOT exclude for rare/specialized markers absent from standard panel (ROR1)', () => {
    // Patient has only HER2 reported; trial requires ROR1 expression.
    // ROR1 is not a standard solid-tumor panel gene — absence ≠ negative.
    const record = {
      diagnosis: '乳腺癌',
      gene_mutation: 'HER2阳性'
    };
    const trial = makeTrial({
      structured_inclusion: {
        allowed_cancer_types: ['乳腺癌'],
        required_genes: ['ROR1表达阳性']
      }
    });
    const out = scoreRecordAgainstTrial(record, trial);
    expect(out.excluded).toBeFalsy();
  });

  test('does NOT exclude when patient has no gene info at all (uncertain, not excluded)', () => {
    const record = {
      diagnosis: '肝细胞癌',
      gene_mutation: null
    };
    const trial = makeTrial({
      structured_inclusion: {
        allowed_cancer_types: ['肝细胞癌'],
        required_genes: ['HER2激活突变']
      }
    });
    const out = scoreRecordAgainstTrial(record, trial);
    expect(out.excluded).toBeFalsy();
  });

  test('excludes on status conflict: trial wants EGFR mutation, patient is EGFR wild-type', () => {
    const record = {
      diagnosis: '非小细胞肺癌',
      gene_mutation: 'EGFR野生型, ALK阴性'
    };
    const trial = makeTrial({
      structured_inclusion: {
        allowed_cancer_types: ['非小细胞肺癌'],
        required_genes: ['EGFR激活突变']
      }
    });
    const out = scoreRecordAgainstTrial(record, trial);
    expect(out.excluded).toBe(true);
    expect(out.reasons[0]).toMatch(/EGFR/);
  });
});

describe('scoreRecordAgainstTrial — prior_lines hard filter', () => {
  test('excludes treatment-naive-only trial for multi-line patient', () => {
    const record = {
      diagnosis: '结直肠癌',
      treatment_line: 3 // prior lines = 2
    };
    const trial = makeTrial({
      structured_inclusion: {
        allowed_cancer_types: ['结直肠癌'],
        prior_lines_min: 0,
        prior_lines_max: 0
      }
    });
    const out = scoreRecordAgainstTrial(record, trial);
    expect(out.excluded).toBe(true);
    expect(out.reasons[0]).toMatch(/超过试验允许上限/);
  });

  test('excludes ≥2-prior-line trial for first-line patient', () => {
    const record = {
      diagnosis: '胃癌',
      treatment_line: 2 // prior lines = 1
    };
    const trial = makeTrial({
      structured_inclusion: {
        allowed_cancer_types: ['胃癌'],
        prior_lines_min: 2
      }
    });
    const out = scoreRecordAgainstTrial(record, trial);
    expect(out.excluded).toBe(true);
    expect(out.reasons[0]).toMatch(/低于试验要求/);
  });

  test('does NOT exclude when patient prior-lines fall in allowed range', () => {
    const record = {
      diagnosis: '胃癌',
      stage: '晚期',
      treatment_line: 3 // prior lines = 2
    };
    const trial = makeTrial({
      indication: '胃癌',
      structured_inclusion: {
        allowed_cancer_types: ['胃癌'],
        prior_lines_min: 2,
        prior_lines_max: 4
      }
    });
    const out = scoreRecordAgainstTrial(record, trial);
    expect(out.excluded).toBeFalsy();
    expect(out.score).toBeGreaterThan(20);
  });

  test('skips filter when treatment_line is unknown', () => {
    const record = {
      diagnosis: '结直肠癌',
      treatment_line: null
    };
    const trial = makeTrial({
      structured_inclusion: {
        allowed_cancer_types: ['结直肠癌'],
        prior_lines_max: 0
      }
    });
    const out = scoreRecordAgainstTrial(record, trial);
    expect(out.excluded).toBeFalsy();
  });
});

describe('scoreRecordAgainstTrial — allowed_cancer_types hard filter', () => {
  test('excludes SCLC patient from NSCLC-only trial (clinical disambiguation)', () => {
    const record = {
      diagnosis: '小细胞肺癌',
      stage: '广泛期'
    };
    const trial = makeTrial({
      structured_inclusion: {
        allowed_cancer_types: ['非鳞状非小细胞肺癌', 'NSCLC']
      }
    });
    const out = scoreRecordAgainstTrial(record, trial);
    expect(out.excluded).toBe(true);
    expect(out.reasons[0]).toMatch(/允许癌种/);
  });

  test('excludes TNBC from HER2-positive breast trial (subtype disambiguation)', () => {
    const record = {
      diagnosis: '三阴性乳腺癌',
      gene_mutation: 'BRCA1突变'
    };
    const trial = makeTrial({
      structured_inclusion: {
        allowed_cancer_types: ['HER2阳性乳腺癌'],
        required_genes: ['HER2阳性（IHC3+或FISH+）']
      }
    });
    const out = scoreRecordAgainstTrial(record, trial);
    expect(out.excluded).toBe(true);
  });

  test('accepts basket trial with generic "其他实体瘤" for any solid tumor', () => {
    const record = {
      diagnosis: '胰腺癌',
      stage: '晚期'
    };
    const trial = makeTrial({
      structured_inclusion: {
        allowed_cancer_types: ['胃癌', '肺癌', '其他实体瘤']
      }
    });
    const out = scoreRecordAgainstTrial(record, trial);
    expect(out.excluded).toBeFalsy();
  });

  test('respects "除外小细胞肺癌" clause in generic catch-all', () => {
    const record = {
      diagnosis: '小细胞肺癌',
      stage: '广泛期'
    };
    const trial = makeTrial({
      structured_inclusion: {
        allowed_cancer_types: ['胃癌', '胰腺癌', '其他实体瘤（除外小细胞肺癌）']
      }
    });
    const out = scoreRecordAgainstTrial(record, trial);
    expect(out.excluded).toBe(true);
    expect(out.reasons[0]).toMatch(/除外/);
  });

  test('accepts matching disease via alias (HCC ↔ 肝细胞癌)', () => {
    const record = {
      diagnosis: '肝细胞癌',
      stage: '晚期'
    };
    const trial = makeTrial({
      structured_inclusion: {
        allowed_cancer_types: ['HCC']
      }
    });
    const out = scoreRecordAgainstTrial(record, trial);
    expect(out.excluded).toBeFalsy();
  });
});
