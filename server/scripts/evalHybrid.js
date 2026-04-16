#!/usr/bin/env node
/**
 * evalHybrid.js — Evaluate the production-path hybrid scorer (scoreRecordHybrid).
 *
 * This is the function the API actually uses (heuristic 40% blended with
 * criterion-level 60%, plus hard-excludes from structured_inclusion).
 * The separate evalMatchEngine.js and evalCriterionMatcher.js measure
 * the two halves in isolation; this script measures the end-to-end pipeline.
 *
 * Usage:
 *   node server/scripts/evalHybrid.js
 *   node server/scripts/evalHybrid.js --verbose
 *   node server/scripts/evalHybrid.js --threshold 42
 */

const goldenData = require('../tests/fixtures/golden-matches.json');
const structuredInclusion = require('../data/structured_inclusion.json');
const decomposed = require('../data/decomposed_criteria.json');
const { scoreRecordHybrid, SCORE_MIN } = require('../services/matchEngine');
const { buildProfile } = require('../services/patientProfile');

const args = process.argv.slice(2);
const verbose = args.includes('--verbose') || args.includes('-v');
const thresholdIdx = args.indexOf('--threshold');
const threshold = thresholdIdx >= 0 ? Number(args[thresholdIdx + 1]) : SCORE_MIN;

const buildTreatmentLines = (si) => {
  if (si.prior_lines_min == null && si.prior_lines_max == null) return [];
  const min = si.prior_lines_min || 0;
  const max = si.prior_lines_max != null ? si.prior_lines_max + 1 : 6;
  const lines = [];
  for (let i = min + 1; i <= max; i++) lines.push(i);
  return lines;
};

const buildMockTrial = (trialId) => {
  const si = structuredInclusion[trialId];
  if (!si) return null;
  const inclusionParts = [];
  if (si.allowed_cancer_types) inclusionParts.push(...si.allowed_cancer_types);
  if (si.required_genes) inclusionParts.push(...si.required_genes);
  if (si.required_stage) inclusionParts.push(...si.required_stage);
  if (si.required_pdl1) inclusionParts.push(si.required_pdl1);
  if (si.required_prior_therapies) inclusionParts.push(...si.required_prior_therapies);
  if (si.other_key_criteria) inclusionParts.push(...si.other_key_criteria);
  const exclusionParts = [];
  if (si.excluded_prior_therapies) exclusionParts.push(...si.excluded_prior_therapies);
  return {
    id: trialId,
    name: `Trial ${trialId}`,
    indication: (si.allowed_cancer_types || []).join('、'),
    description: '',
    brief_inclusion: inclusionParts.join('；'),
    inclusion_criteria: inclusionParts,
    exclusion_criteria: exclusionParts,
    disease_tags: si.allowed_cancer_types || [],
    treatment_lines: buildTreatmentLines(si),
    study_cities: [],
    status: 'recruiting',
    structured_inclusion: si
  };
};

const evaluate = () => {
  let tp = 0, fp = 0, fn = 0, tn = 0;
  let uncertainCorrect = 0, uncertainTotal = 0;
  const details = [];

  for (const pair of goldenData.pairs) {
    const patient = goldenData.patients.find(p => p.id === pair.patient_id);
    if (!patient) continue;
    const trial = buildMockTrial(pair.trial_id);
    if (!trial) continue;

    // Build structuredProfile as the production code does
    const { structuredProfile } = buildProfile([patient.record]);
    const scored = scoreRecordHybrid(patient.record, trial, structuredProfile);
    const engineSaysMatch = !scored.excluded && scored.score >= threshold;

    const detail = {
      patient: pair.patient_id,
      trial: pair.trial_id,
      label: pair.label,
      score: scored.score,
      excluded: scored.excluded || false,
      reasons: scored.reasons
    };

    if (pair.label === 'eligible') {
      if (engineSaysMatch) { tp++; detail.classification = 'TP'; detail.correct = true; }
      else { fn++; detail.classification = 'FN'; detail.correct = false; }
    } else if (pair.label === 'ineligible') {
      if (!engineSaysMatch) { tn++; detail.classification = 'TN'; detail.correct = true; }
      else { fp++; detail.classification = 'FP'; detail.correct = false; }
    } else {
      uncertainTotal++;
      if (scored.score > 20 && scored.score < 80 && !scored.excluded) {
        uncertainCorrect++; detail.correct = true;
      } else detail.correct = false;
      detail.classification = 'UNCERTAIN';
    }

    details.push(detail);
  }

  const precision = tp + fp > 0 ? tp / (tp + fp) : 0;
  const recall = tp + fn > 0 ? tp / (tp + fn) : 0;
  const f1 = precision + recall > 0 ? 2 * precision * recall / (precision + recall) : 0;
  const accuracy = (tp + tn) / (tp + fp + fn + tn) || 0;
  return { tp, fp, fn, tn, precision, recall, f1, accuracy, uncertainCorrect, uncertainTotal, details };
};

const t0 = Date.now();
const r = evaluate();
const elapsed = Date.now() - t0;
console.log('=== Hybrid Scorer (production path) Evaluation ===');
console.log(`Threshold: ${threshold}`);
console.log(`Dataset:   ${goldenData.pairs.length} pairs, ${goldenData.patients.length} patients`);
console.log('');
console.log('--- Binary Classification ---');
console.log(`  TP: ${r.tp}  FP: ${r.fp}`);
console.log(`  FN: ${r.fn}  TN: ${r.tn}`);
console.log(`  Precision: ${(r.precision * 100).toFixed(1)}%`);
console.log(`  Recall:    ${(r.recall * 100).toFixed(1)}%`);
console.log(`  F1 Score:  ${(r.f1 * 100).toFixed(1)}%`);
console.log(`  Accuracy:  ${(r.accuracy * 100).toFixed(1)}%`);
console.log('');
console.log('--- Uncertain Pairs ---');
console.log(`  Moderate scores: ${r.uncertainCorrect}/${r.uncertainTotal}`);
console.log('');
console.log(`Elapsed: ${elapsed}ms (${(elapsed / goldenData.pairs.length).toFixed(1)}ms/pair)`);

if (verbose) {
  console.log('');
  console.log('--- MISCLASSIFICATIONS ---');
  for (const d of r.details.filter(x => !x.correct && x.classification !== 'UNCERTAIN')) {
    console.log(`  [${d.classification}] ${d.patient} × ${d.trial}  score=${d.score} excluded=${d.excluded}`);
    console.log(`    label=${d.label}`);
    console.log(`    reasons: ${(d.reasons || []).join('; ')}`);
  }
  console.log('');
  console.log('--- ALL PAIRS ---');
  for (const d of r.details) {
    const mark = d.correct ? '✓' : '✗';
    console.log(`  ${mark} [${d.classification.padEnd(9)}] ${d.patient} × ${d.trial.padEnd(24)} score=${String(d.score).padStart(2)} excluded=${d.excluded} label=${d.label}`);
  }
}

console.log('');
console.log(`HYBRID_SUMMARY: P=${(r.precision*100).toFixed(1)} R=${(r.recall*100).toFixed(1)} F1=${(r.f1*100).toFixed(1)} Acc=${(r.accuracy*100).toFixed(1)} threshold=${threshold}`);
