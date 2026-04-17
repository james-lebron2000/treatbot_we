/**
 * criterionMatcher.test.js — Focused unit tests for the criterion matching engine.
 *
 * Covers therapy class expansion, exclusion semantics, and basic evaluator behavior.
 * Intended as a regression guard for the hybrid matching logic.
 */

const {
  evaluateAllCriteria,
  matchTherapyClasses,
  THERAPY_CLASSES,
  MET,
  NOT_MET,
  UNCERTAIN
} = require('../services/criterionMatcher');

const baseProfile = (overrides = {}) => ({
  diagnosis: '结直肠腺癌',
  stage: '转移性',
  age: 58,
  ecog: 0,
  pdl1: null,
  treatmentLine: 2,
  treatment: '',
  priorTherapies: [],
  geneMutations: [],
  geneMutationText: '',
  comorbidities: [],
  labValues: {},
  bloodCounts: {},
  city: null,
  ...overrides
});

describe('matchTherapyClasses', () => {
  it('matches common immune therapy class name', () => {
    const matches = matchTherapyClasses('免疫治疗');
    expect(matches.length).toBeGreaterThan(0);
    expect(matches.some((c) => c.classLabel === '免疫治疗')).toBe(true);
  });

  it('matches platinum class name', () => {
    const matches = matchTherapyClasses('铂类化疗');
    expect(matches.length).toBeGreaterThan(0);
  });

  it('returns empty for specialized classes not in the conservative map', () => {
    // HER2-TKI is intentionally NOT mapped to keep exclusion behavior safe
    const matches = matchTherapyClasses('her2酪氨酸激酶抑制剂');
    expect(matches.length).toBe(0);
  });

  it('returns empty for unrelated text', () => {
    expect(matchTherapyClasses('年龄≥18岁')).toEqual([]);
  });
});

describe('THERAPY_CLASSES contents', () => {
  it('includes canonical PD-1 drugs under 免疫治疗', () => {
    const drugs = THERAPY_CLASSES['免疫治疗'];
    expect(drugs).toEqual(expect.arrayContaining(['帕博利珠', '纳武利尤', '信迪利']));
  });

  it('includes platinum compounds under 铂类', () => {
    const drugs = THERAPY_CLASSES['铂类'];
    expect(drugs).toEqual(expect.arrayContaining(['卡铂', '顺铂', '奥沙利铂']));
  });
});

describe('evaluateAllCriteria — exclusion class expansion', () => {
  const trialExcludingImmune = [
    {
      criterion_id: 'exc_imm',
      original_text: '排除既往接受过免疫治疗',
      is_exclusion: true,
      category: 'treatment',
      subcategory: 'excluded_therapy',
      evaluation_type: 'semantic',
      structured: { field: 'prior_therapy', excluded: ['免疫治疗', '免疫检查点抑制剂'] }
    }
  ];

  it('flags patient with prior pembrolizumab as excluded for 免疫治疗 trial', () => {
    const profile = baseProfile({
      treatment: '一线帕博利珠单抗后进展',
      priorTherapies: ['帕博利珠单抗']
    });
    const result = evaluateAllCriteria(trialExcludingImmune, profile);
    expect(result.summary.excluded).toBe(true);
    const excRow = result.results[0];
    expect(excRow.status).toBe(MET);
    expect(excRow.evidence).toMatch(/免疫治疗/);
    expect(excRow.evidence).toMatch(/帕博利珠/);
  });

  it('does NOT flag a chemotherapy-only patient as excluded for 免疫治疗 trial', () => {
    const profile = baseProfile({
      treatment: '一线FOLFOX，二线FOLFIRI后进展',
      priorTherapies: ['folfox', 'folfiri']
    });
    const result = evaluateAllCriteria(trialExcludingImmune, profile);
    expect(result.summary.excluded).toBe(false);
    const excRow = result.results[0];
    expect(excRow.status).toBe(NOT_MET);
  });

  it('does NOT confuse HER2-TKI (lapatinib) with 免疫治疗 class', () => {
    // Regression guard: narrow class map prevents cross-class false positives.
    const profile = baseProfile({
      treatment: '一线曲妥珠单抗+多西他赛，三线拉帕替尼+卡培他滨',
      priorTherapies: ['曲妥珠单抗', '多西他赛', '拉帕替尼', '卡培他滨']
    });
    const result = evaluateAllCriteria(trialExcludingImmune, profile);
    expect(result.summary.excluded).toBe(false);
  });
});

describe('evaluateAllCriteria — basic demographic & stage rules', () => {
  it('excludes a patient above the age cap', () => {
    const trial = [{
      criterion_id: 'inc_age',
      original_text: '年龄≥18且≤75岁',
      is_exclusion: false,
      category: 'demographic',
      subcategory: 'age_range',
      evaluation_type: 'deterministic',
      structured: { field: 'age', min: 18, max: 75 }
    }];
    const result = evaluateAllCriteria(trial, baseProfile({ age: 80 }));
    expect(result.summary.excluded).toBe(true);
    expect(result.results[0].status).toBe(NOT_MET);
  });

  it('keeps a patient within the age range', () => {
    const trial = [{
      criterion_id: 'inc_age',
      original_text: '年龄≥18',
      is_exclusion: false,
      category: 'demographic',
      subcategory: 'age_range',
      evaluation_type: 'deterministic',
      structured: { field: 'age', min: 18, max: null }
    }];
    const result = evaluateAllCriteria(trial, baseProfile({ age: 55 }));
    expect(result.summary.excluded).toBe(false);
    expect(result.results[0].status).toBe(MET);
  });
});

describe('evaluateAllCriteria — empty inputs', () => {
  it('returns an empty summary when there are no criteria', () => {
    const result = evaluateAllCriteria([], baseProfile());
    expect(result.summary.total).toBe(0);
    expect(result.summary.excluded).toBe(false);
  });
});
