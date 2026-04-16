/**
 * Unit tests for criterionMatcher scoring logic.
 *
 * Focuses on the behaviors that distinguish eligible / ineligible / uncertain:
 *   - treatment-naive detection for required-prior-therapy criteria
 *   - specialty-biomarker UNCERTAIN downgrade (HLA, ROR1, CLDN18, MAGE-A)
 *   - specific mutation variant mismatch downgrade (C797S vs L858R)
 *   - hard vs soft inclusion failure classification
 *   - uncertainty-aware scoring
 */

const { evaluateAllCriteria } = require('../services/criterionMatcher');

const baseProfile = (overrides = {}) => ({
  diagnosis: '非小细胞肺癌（肺腺癌）',
  stage: 'IV期',
  geneMutations: [],
  geneMutationText: '',
  ecog: 1,
  age: 55,
  treatmentLine: 1,
  treatment: '',
  priorTherapies: [],
  comorbidities: [],
  labValues: {},
  bloodCounts: {},
  city: null,
  ...overrides
});

describe('criterionMatcher — hard vs soft inclusion failures', () => {
  test('hard inclusion failure (age) excludes the trial', () => {
    const criteria = [
      { criterion_id: 'c1', category: 'demographic', subcategory: 'age_range',
        evaluation_type: 'deterministic', is_exclusion: false,
        structured: { field: 'age', min: 18, max: 65 } }
    ];
    const { summary } = evaluateAllCriteria(criteria, baseProfile({ age: 80 }));
    expect(summary.excluded).toBe(true);
    expect(summary.hardInclusionFailures).toBe(1);
  });

  test('soft inclusion failure (required prior therapy, treatment-naive) does NOT exclude but depresses score', () => {
    const criteria = [
      { criterion_id: 'c1', category: 'demographic', subcategory: 'age_range',
        evaluation_type: 'deterministic', is_exclusion: false,
        structured: { field: 'age', min: 18, max: null } },
      { criterion_id: 'c2', category: 'clinical', subcategory: 'cancer_type',
        evaluation_type: 'deterministic', is_exclusion: false,
        structured: { field: 'cancer_type', allowed: ['非小细胞肺癌'] } },
      { criterion_id: 'c3', category: 'treatment_history', subcategory: 'required_prior_therapy',
        evaluation_type: 'semantic', is_exclusion: false,
        structured: { field: 'prior_therapy', required: ['标准治疗', '免疫治疗'] } }
    ];
    // Treatment-naive patient
    const { summary } = evaluateAllCriteria(criteria, baseProfile({
      treatment: '', priorTherapies: [], treatmentLine: 1
    }));
    expect(summary.excluded).toBe(false);
    expect(summary.softInclusionFailures).toBe(1);
    expect(summary.score).toBeGreaterThan(20);
    expect(summary.score).toBeLessThan(80);
  });
});

describe('criterionMatcher — specialty biomarker UNCERTAIN', () => {
  test('ROR1 requirement with patient lacking ROR1 testing → UNCERTAIN, not excluded', () => {
    const criteria = [
      { criterion_id: 'c1', category: 'molecular', subcategory: 'gene_requirement',
        evaluation_type: 'semantic', is_exclusion: false,
        structured: { field: 'gene', required: ['ROR1表达阳性'] } }
    ];
    const { results, summary } = evaluateAllCriteria(criteria, baseProfile({
      geneMutationText: 'BRCA1突变',
      geneMutations: ['BRCA1突变']
    }));
    expect(results[0].status).toBe('uncertain');
    expect(summary.excluded).toBe(false);
  });

  test('HLA-A*11:01 requirement treated as UNCERTAIN when not on panel', () => {
    const criteria = [
      { criterion_id: 'c1', category: 'molecular', subcategory: 'gene_requirement',
        evaluation_type: 'semantic', is_exclusion: false,
        structured: { field: 'gene', required: ['HLA-A*11:01', 'MAGE-A4阳性'] } }
    ];
    const { results, summary } = evaluateAllCriteria(criteria, baseProfile({
      geneMutationText: 'EGFR L858R突变阳性',
      geneMutations: ['EGFR L858R突变阳性']
    }));
    expect(results[0].status).toBe('uncertain');
    expect(summary.excluded).toBe(false);
  });

  test('HER2 is NOT treated as specialty biomarker — clear mismatch still excludes', () => {
    const criteria = [
      { criterion_id: 'c1', category: 'demographic', subcategory: 'age_range',
        evaluation_type: 'deterministic', is_exclusion: false,
        structured: { field: 'age', min: 18, max: null } },
      { criterion_id: 'c2', category: 'molecular', subcategory: 'gene_requirement',
        evaluation_type: 'semantic', is_exclusion: false,
        structured: { field: 'gene', required: ['HER2阳性（IHC 3+或ISH阳性）'] } }
    ];
    // TNBC patient — documented, no HER2
    const { summary } = evaluateAllCriteria(criteria, baseProfile({
      diagnosis: '三阴性乳腺癌',
      geneMutationText: 'BRCA1突变',
      geneMutations: ['BRCA1突变']
    }));
    expect(summary.excluded).toBe(true);
  });
});

describe('criterionMatcher — specific mutation variant mismatch', () => {
  test('trial requires C797S, patient has L858R → UNCERTAIN not MET', () => {
    const criteria = [
      { criterion_id: 'c1', category: 'molecular', subcategory: 'gene_requirement',
        evaluation_type: 'semantic', is_exclusion: false,
        structured: { field: 'gene', required: ['EGFR C797S突变'] } }
    ];
    const { results } = evaluateAllCriteria(criteria, baseProfile({
      geneMutationText: 'EGFR L858R突变阳性',
      geneMutations: ['EGFR L858R突变阳性']
    }));
    expect(results[0].status).toBe('uncertain');
  });

  test('trial requires C797S, patient has C797S → MET', () => {
    const criteria = [
      { criterion_id: 'c1', category: 'molecular', subcategory: 'gene_requirement',
        evaluation_type: 'semantic', is_exclusion: false,
        structured: { field: 'gene', required: ['EGFR C797S突变'] } }
    ];
    const { results } = evaluateAllCriteria(criteria, baseProfile({
      geneMutationText: 'EGFR C797S突变阳性',
      geneMutations: ['EGFR C797S突变阳性']
    }));
    expect(results[0].status).toBe('met');
  });
});

describe('criterionMatcher — treatment-naive required-therapy', () => {
  test('treatment-naive patient with required prior therapy → NOT_MET (not UNCERTAIN)', () => {
    const criteria = [
      { criterion_id: 'c1', category: 'treatment_history', subcategory: 'required_prior_therapy',
        evaluation_type: 'semantic', is_exclusion: false,
        structured: { field: 'prior_therapy', required: ['标准治疗'] } }
    ];
    const { results } = evaluateAllCriteria(criteria, baseProfile({
      treatment: '',
      priorTherapies: [],
      treatmentLine: 1
    }));
    expect(results[0].status).toBe('not_met');
  });
});

describe('criterionMatcher — uncertainty-aware scoring', () => {
  test('gene and prior-therapy UNCERTAIN together dampen score into uncertain band', () => {
    const criteria = [
      { criterion_id: 'c1', category: 'demographic', subcategory: 'age_range',
        evaluation_type: 'deterministic', is_exclusion: false,
        structured: { field: 'age', min: 18, max: null } },
      { criterion_id: 'c2', category: 'clinical', subcategory: 'ecog',
        evaluation_type: 'deterministic', is_exclusion: false,
        structured: { field: 'ecog', max: 1 } },
      { criterion_id: 'c3', category: 'molecular', subcategory: 'gene_requirement',
        evaluation_type: 'semantic', is_exclusion: false,
        structured: { field: 'gene', required: ['EGFR C797S突变'] } },
      { criterion_id: 'c4', category: 'treatment_history', subcategory: 'required_prior_therapy',
        evaluation_type: 'semantic', is_exclusion: false,
        structured: { field: 'prior_therapy', required: ['奥希替尼(一线治疗)'] } }
    ];
    const { summary } = evaluateAllCriteria(criteria, baseProfile({
      geneMutationText: 'EGFR L858R突变阳性',
      geneMutations: ['EGFR L858R突变阳性'],
      treatment: '一线吉非替尼靶向治疗后进展',
      priorTherapies: ['吉非替尼']
    }));
    expect(summary.excluded).toBe(false);
    expect(summary.score).toBeGreaterThan(20);
    expect(summary.score).toBeLessThan(80);
  });

  test('all MET gives high confidence score (>=80)', () => {
    const criteria = [
      { criterion_id: 'c1', category: 'demographic', subcategory: 'age_range',
        evaluation_type: 'deterministic', is_exclusion: false,
        structured: { field: 'age', min: 18, max: null } },
      { criterion_id: 'c2', category: 'clinical', subcategory: 'ecog',
        evaluation_type: 'deterministic', is_exclusion: false,
        structured: { field: 'ecog', max: 1 } },
      { criterion_id: 'c3', category: 'clinical', subcategory: 'cancer_type',
        evaluation_type: 'deterministic', is_exclusion: false,
        structured: { field: 'cancer_type', allowed: ['非小细胞肺癌', 'NSCLC'] } }
    ];
    const { summary } = evaluateAllCriteria(criteria, baseProfile({ age: 55, ecog: 1 }));
    expect(summary.score).toBeGreaterThanOrEqual(80);
    expect(summary.excluded).toBe(false);
  });
});
