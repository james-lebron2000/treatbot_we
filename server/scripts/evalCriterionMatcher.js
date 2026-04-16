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
 */

const goldenData = require('../tests/fixtures/golden-matches.json');
const decomposed = require('../data/decomposed_criteria.json');
const { evaluateAllCriteria } = require('../services/criterionMatcher');

const args = process.argv.slice(2);
const verbose = args.includes('--verbose') || args.includes('-v');

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
  const engineSaysMatch = !result.summary.excluded && result.summary.score >= 42;

  const detail = {
    patient: pair.patient_id,
    trial: pair.trial_id,
    label: pair.label,
    score: result.summary.score,
    excluded: result.summary.excluded,
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
    if (result.summary.score > 20 && result.summary.score < 80 && !result.summary.excluded) {
      uncertainCorrect++;
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
console.log('--- Uncertain ---');
console.log(`  Moderate scores: ${uncertainCorrect}/${uncertainTotal}`);

if (verbose) {
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
    console.log(`  ${mark} [${d.classification.padEnd(9)}] ${d.patient} × ${d.trial.padEnd(22)} score=${String(d.score).padStart(2)} excluded=${d.excluded} label=${d.label}`);
  }
}

console.log('');
console.log(`CRITERION_SUMMARY: P=${(precision*100).toFixed(1)} R=${(recall*100).toFixed(1)} F1=${(f1*100).toFixed(1)} Acc=${(accuracy*100).toFixed(1)}`);
