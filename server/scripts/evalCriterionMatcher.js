#!/usr/bin/env node
/**
 * evalCriterionMatcher.js — Evaluate criterion-level matcher against gold-standard
 *
 * Compares the new criterion-level matching engine against the same gold-standard
 * dataset used by evalMatchEngine.js, allowing direct A/B comparison.
 *
 * Usage:
 *   node server/scripts/evalCriterionMatcher.js
 *   node server/scripts/evalCriterionMatcher.js --verbose
 *   node server/scripts/evalCriterionMatcher.js --ci
 */

const goldenData = require('../tests/fixtures/golden-matches.json');
const decomposed = require('../data/decomposed_criteria.json');
const { evaluateAllCriteria } = require('../services/criterionMatcher');

const args = process.argv.slice(2);
const verbose = args.includes('--verbose') || args.includes('-v');
const ciMode = args.includes('--ci');
const jsonMode = args.includes('--json');

const minPrecision = Number(process.env.CRITERION_MIN_PRECISION || 0.90);
const minRecall = Number(process.env.CRITERION_MIN_RECALL || 0.95);
const minF1 = Number(process.env.CRITERION_MIN_F1 || 0.90);
const minUncertainCalibration = Number(process.env.CRITERION_MIN_UNCERTAIN_CALIBRATION || 0.4);

const inferUncertainType = (pair) => {
  const reason = `${pair.reason || ''}`.toLowerCase();
  if (/missing|unknown|not assessed|not documented|status unknown|未检测|未知|缺失|待补|未记录|depends on|specific/.test(reason)) {
    return 'missing_data';
  }
  if (/risk|excludes|exclude|prior|treatment-naive|borderline|不可直接排除|高风险|排除|既往|未治疗/.test(reason)) {
    return 'borderline_risk';
  }
  return 'missing_data';
};

const isUncertainCalibrated = (detail, uncertainType) => {
  if (uncertainType === 'missing_data') {
    return Boolean(detail.requiresReview) || (!detail.engineMatch && !detail.excluded && detail.score >= 20 && detail.score <= 80);
  }
  if (uncertainType === 'borderline_risk') {
    return Boolean(detail.requiresReview) || detail.excluded || (!detail.engineMatch && detail.score <= 80);
  }
  return Boolean(detail.requiresReview) || (!detail.engineMatch && detail.score >= 20 && detail.score <= 80);
};

// Build patient profiles from golden-matches
const patients = {};
for (const p of goldenData.patients) {
  // Convert golden-matches record format to structuredProfile format
  const record = p.record;
  patients[p.id] = {
    diagnosis: record.diagnosis,
    stage: record.stage,
    geneMutations: record.gene_mutation ? [record.gene_mutation] : [],
    geneMutationText: record.gene_mutation || '',
    ecog: record.structured?.entities?.ecog ?? null,
    age: record.age ?? record.structured?.entities?.age ?? null,
    pdl1: record.pdl1 ?? record.structured?.entities?.pdl1 ?? null,
    treatmentLine: record.treatment_line ?? record.structured?.entities?.treatmentLine ?? null,
    treatment: record.treatment || '',
    priorTherapies: [], // Not available in golden format — parse from treatment text
    comorbidities: [],
    labValues: {},
    bloodCounts: {},
    city: null
  };

  // Simple therapy extraction from treatment text
  const treatmentText = (record.treatment || '').toLowerCase();
  const therapyNames = ['吉非替尼', '培美曲塞', '卡铂', '顺铂', '多西他赛', '紫杉醇', '依托泊苷',
    '曲妥珠单抗', 't-dm1', '拉帕替尼', '卡培他滨', '信迪利单抗', '帕博利珠单抗',
    '阿替利珠单抗', '仑伐替尼', '白蛋白紫杉醇', '奥希替尼', '西妥昔单抗',
    'folfox', 'folfiri', 'xelox'];
  for (const name of therapyNames) {
    if (treatmentText.includes(name.toLowerCase())) {
      patients[p.id].priorTherapies.push(name);
    }
  }
}

let tp = 0, fp = 0, fn = 0, tn = 0;
let uncertainCorrect = 0, uncertainTotal = 0;
const uncertainByType = {};
const details = [];

for (const pair of goldenData.pairs) {
  const profile = patients[pair.patient_id];
  if (!profile) continue;

  const criteria = decomposed[pair.trial_id];
  if (!criteria || criteria.length === 0) {
    // No decomposed criteria — skip
    continue;
  }

  const result = evaluateAllCriteria(criteria, profile);
  const engineSaysMatch = !result.summary.excluded && !result.summary.requiresReview && result.summary.score >= 42;

  const detail = {
    patient: pair.patient_id,
    trial: pair.trial_id,
    label: pair.label,
    score: result.summary.score,
    excluded: result.summary.excluded,
    requiresReview: Boolean(result.summary.requiresReview),
    matchRate: result.summary.matchRate,
    engineMatch: engineSaysMatch,
    correct: false,
    criterionResults: result.results
  };

  if (pair.label === 'eligible') {
    if (engineSaysMatch) { tp++; detail.correct = true; detail.classification = 'TP'; }
    else { fn++; detail.classification = 'FN'; }
  } else if (pair.label === 'ineligible') {
    if (!engineSaysMatch) { tn++; detail.correct = true; detail.classification = 'TN'; }
    else { fp++; detail.classification = 'FP'; }
  } else {
    uncertainTotal++;
    const uncertainType = pair.uncertain_type || inferUncertainType(pair);
    if (!uncertainByType[uncertainType]) {
      uncertainByType[uncertainType] = { total: 0, correct: 0 };
    }
    uncertainByType[uncertainType].total++;
    detail.uncertainType = uncertainType;
    if (isUncertainCalibrated(detail, uncertainType)) {
      uncertainCorrect++;
      uncertainByType[uncertainType].correct++;
      detail.correct = true;
    }
    detail.classification = 'UNCERTAIN';
  }

  details.push(detail);
}

const precision = tp + fp > 0 ? tp / (tp + fp) : 0;
const recall = tp + fn > 0 ? tp / (tp + fn) : 0;
const f1 = precision + recall > 0 ? 2 * precision * recall / (precision + recall) : 0;
const accuracy = (tp + tn) / (tp + fp + fn + tn) || 0;
const uncertainCalibration = uncertainTotal > 0 ? uncertainCorrect / uncertainTotal : 1;

const summary = {
  datasetPairs: goldenData.pairs.length,
  evaluatedPairs: details.length,
  tp,
  fp,
  fn,
  tn,
  precision,
  recall,
  f1,
  accuracy,
  uncertainCorrect,
  uncertainTotal,
  uncertainCalibration,
  uncertainByType
};

if (jsonMode) {
  console.log(JSON.stringify({ summary, details }, null, 2));
} else {
  console.log('=== Criterion-Level Matcher Evaluation ===');
  console.log(`Dataset: ${goldenData.pairs.length} pairs, evaluated ${details.length}`);
  console.log('');
  console.log('--- Binary Classification ---');
  console.log(`  TP: ${tp}  FP: ${fp}`);
  console.log(`  FN: ${fn}  TN: ${tn}`);
  console.log(`  Precision: ${(precision * 100).toFixed(1)}%`);
  console.log(`  Recall:    ${(recall * 100).toFixed(1)}%`);
  console.log(`  F1 Score:  ${(f1 * 100).toFixed(1)}%`);
  console.log(`  Accuracy:  ${(accuracy * 100).toFixed(1)}%`);
  console.log('');
  console.log('--- Uncertain Calibration ---');
  console.log(`  Calibrated: ${uncertainCorrect}/${uncertainTotal} (${(uncertainCalibration * 100).toFixed(1)}%)`);
  for (const [type, stats] of Object.entries(uncertainByType)) {
    const rate = stats.total > 0 ? stats.correct / stats.total : 0;
    console.log(`  ${type}: ${stats.correct}/${stats.total} (${(rate * 100).toFixed(1)}%)`);
  }
}

if (verbose && !jsonMode) {
  console.log('');
  console.log('--- Errors ---');
  const errors = details.filter(d => !d.correct && d.classification !== 'UNCERTAIN');
  for (const d of errors) {
    console.log(`  [${d.classification}] ${d.patient} × ${d.trial} score=${d.score} excluded=${d.excluded}`);
    for (const c of d.criterionResults) {
      const icon = c.status === 'met' ? '✅' : c.status === 'not_met' ? '❌' : '⚠️';
      console.log(`    ${icon} ${c.subcategory}: ${c.evidence.substring(0, 60)}`);
    }
  }
  console.log('');
  console.log('--- All Pairs ---');
  for (const d of details) {
    const mark = d.correct ? '✓' : '✗';
    const subtype = d.uncertainType ? ` subtype=${d.uncertainType}` : '';
    const review = d.requiresReview ? ' review=true' : '';
    console.log(`  ${mark} [${d.classification.padEnd(9)}] ${d.patient} × ${d.trial.padEnd(22)} score=${String(d.score).padStart(2)} excluded=${d.excluded}${review} label=${d.label}${subtype}`);
  }
}

if (!jsonMode) {
  console.log('');
  console.log(`CRITERION_SUMMARY: P=${(precision*100).toFixed(1)} R=${(recall*100).toFixed(1)} F1=${(f1*100).toFixed(1)} Acc=${(accuracy*100).toFixed(1)} UncertainCal=${(uncertainCalibration*100).toFixed(1)}`);
}

if (ciMode) {
  const failures = [];
  if (precision < minPrecision) failures.push(`precision ${(precision * 100).toFixed(1)}% < ${(minPrecision * 100).toFixed(1)}%`);
  if (recall < minRecall) failures.push(`recall ${(recall * 100).toFixed(1)}% < ${(minRecall * 100).toFixed(1)}%`);
  if (f1 < minF1) failures.push(`F1 ${(f1 * 100).toFixed(1)}% < ${(minF1 * 100).toFixed(1)}%`);
  if (uncertainCalibration < minUncertainCalibration) {
    failures.push(`uncertain calibration ${(uncertainCalibration * 100).toFixed(1)}% < ${(minUncertainCalibration * 100).toFixed(1)}%`);
  }
  if (failures.length > 0) {
    console.error(`Criterion matcher gate failed: ${failures.join('; ')}`);
    process.exit(1);
  }
}
