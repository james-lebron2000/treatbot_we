#!/usr/bin/env node
/**
 * evalMatchEngine.js — Evaluate matching engine against gold-standard dataset
 *
 * Computes Precision, Recall, F1, and nDCG@k for the current scoring algorithm.
 * Run periodically to track improvements across engine versions.
 *
 * Usage:
 *   node server/scripts/evalMatchEngine.js
 *   node server/scripts/evalMatchEngine.js --verbose
 *   node server/scripts/evalMatchEngine.js --threshold 42
 */

const goldenData = require('../tests/fixtures/golden-matches.json');

// Import matching engine (standalone — no DB needed)
const {
  scoreRecordAgainstTrial,
  SCORE_MIN
} = require('../services/matchEngine');

// Import structured inclusion data to simulate trial objects
const structuredInclusion = require('../data/structured_inclusion.json');

// ---- CLI args ----
const args = process.argv.slice(2);
const verbose = args.includes('--verbose') || args.includes('-v');
const thresholdIdx = args.indexOf('--threshold');
const threshold = thresholdIdx >= 0 ? Number(args[thresholdIdx + 1]) : SCORE_MIN;

// ---- Build mock trial objects from structured_inclusion data ----
// Since we don't have DB access, we construct minimal trial objects
// with the fields that scoreRecordAgainstTrial actually reads.
const buildMockTrial = (trialId) => {
  const si = structuredInclusion[trialId];
  if (!si) return null;

  // Build inclusion text from allowed_cancer_types, required_genes, etc.
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
    structured_inclusion: si,
    gene_requirement: (si.required_genes || []).join(', ')
  };
};

const buildTreatmentLines = (si) => {
  if (si.prior_lines_min == null && si.prior_lines_max == null) return [];
  const lines = [];
  const min = si.prior_lines_min || 0;
  const max = si.prior_lines_max != null ? si.prior_lines_max + 1 : 6;
  for (let i = min + 1; i <= max; i++) lines.push(i);
  return lines.length > 0 ? lines : [];
};

// ---- Evaluation Metrics ----

/**
 * Binary classification: engine says "match" (score >= threshold) vs. gold label
 * - eligible → should match (positive)
 * - ineligible → should not match (negative)
 * - uncertain → excluded from precision/recall (but tracked separately)
 */
const evaluate = () => {
  const patients = {};
  for (const p of goldenData.patients) {
    patients[p.id] = p;
  }

  let tp = 0, fp = 0, fn = 0, tn = 0;
  let uncertainCorrect = 0, uncertainTotal = 0;
  const details = [];
  const trialScores = {}; // For nDCG: { patientId: [{ trialId, score, label }] }

  for (const pair of goldenData.pairs) {
    const patient = patients[pair.patient_id];
    if (!patient) {
      console.error(`Patient ${pair.patient_id} not found in dataset`);
      continue;
    }

    const trial = buildMockTrial(pair.trial_id);
    if (!trial) {
      console.error(`Trial ${pair.trial_id} not found in structured_inclusion data`);
      continue;
    }

    const scored = scoreRecordAgainstTrial(patient.record, trial);
    const engineSaysMatch = scored.score >= threshold && !scored.excluded;

    // Track per-patient scores for nDCG
    if (!trialScores[pair.patient_id]) trialScores[pair.patient_id] = [];
    trialScores[pair.patient_id].push({
      trialId: pair.trial_id,
      score: scored.score,
      excluded: scored.excluded || false,
      label: pair.label,
      reasons: scored.reasons
    });

    const detail = {
      patient: pair.patient_id,
      trial: pair.trial_id,
      label: pair.label,
      score: scored.score,
      excluded: scored.excluded || false,
      engineMatch: engineSaysMatch,
      correct: false,
      reasons: scored.reasons
    };

    if (pair.label === 'eligible') {
      if (engineSaysMatch) { tp++; detail.correct = true; detail.classification = 'TP'; }
      else { fn++; detail.classification = 'FN'; }
    } else if (pair.label === 'ineligible') {
      if (!engineSaysMatch) { tn++; detail.correct = true; detail.classification = 'TN'; }
      else { fp++; detail.classification = 'FP'; }
    } else {
      // uncertain — track but don't count in P/R
      uncertainTotal++;
      // For uncertain: a moderate score (not extreme high or excluded) is "correct"
      if (scored.score > 20 && scored.score < 80 && !scored.excluded) {
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

  // Compute nDCG@10 per patient
  const ndcgScores = [];
  for (const [_patientId, trials] of Object.entries(trialScores)) {
    const ndcg = computeNDCG(trials, 10);
    if (ndcg !== null) ndcgScores.push(ndcg);
  }
  const avgNDCG = ndcgScores.length > 0
    ? ndcgScores.reduce((s, v) => s + v, 0) / ndcgScores.length
    : 0;

  return { tp, fp, fn, tn, precision, recall, f1, accuracy, avgNDCG, uncertainCorrect, uncertainTotal, details, trialScores };
};

/**
 * Compute nDCG@k for a list of trials scored for one patient.
 * Relevance: eligible=2, uncertain=1, ineligible=0
 */
const computeNDCG = (trials, k) => {
  if (trials.length === 0) return null;

  const relevance = { eligible: 2, uncertain: 1, ineligible: 0 };

  // Actual ranking by engine score (descending)
  const ranked = [...trials].sort((a, b) => b.score - a.score);
  // Ideal ranking by relevance (descending)
  const ideal = [...trials].sort((a, b) => relevance[b.label] - relevance[a.label]);

  const dcg = (list) => {
    let sum = 0;
    for (let i = 0; i < Math.min(list.length, k); i++) {
      const rel = relevance[list[i].label] || 0;
      sum += (Math.pow(2, rel) - 1) / Math.log2(i + 2);
    }
    return sum;
  };

  const idealDCG = dcg(ideal);
  if (idealDCG === 0) return 1; // All irrelevant — perfect score trivially
  return dcg(ranked) / idealDCG;
};

// ---- Run ----
console.log('=== TreatBot Match Engine Evaluation ===');
console.log(`Threshold: ${threshold} (SCORE_MIN)`);
console.log(`Dataset: ${goldenData.pairs.length} patient-trial pairs, ${goldenData.patients.length} patients`);
console.log('');

const results = evaluate();

console.log('--- Binary Classification (eligible vs ineligible) ---');
console.log(`  TP: ${results.tp}  FP: ${results.fp}`);
console.log(`  FN: ${results.fn}  TN: ${results.tn}`);
console.log(`  Precision: ${(results.precision * 100).toFixed(1)}%`);
console.log(`  Recall:    ${(results.recall * 100).toFixed(1)}%`);
console.log(`  F1 Score:  ${(results.f1 * 100).toFixed(1)}%`);
console.log(`  Accuracy:  ${(results.accuracy * 100).toFixed(1)}%`);
console.log('');
console.log('--- Ranking Quality ---');
console.log(`  Mean nDCG@10: ${(results.avgNDCG * 100).toFixed(1)}%`);
console.log('');
console.log('--- Uncertain Pairs ---');
console.log(`  Moderate scores: ${results.uncertainCorrect}/${results.uncertainTotal}`);
console.log('');

if (verbose) {
  console.log('--- Detailed Results ---');
  console.log('');

  // Show errors first
  const errors = results.details.filter(d => !d.correct && d.classification !== 'UNCERTAIN');
  if (errors.length > 0) {
    console.log('MISCLASSIFICATIONS:');
    for (const d of errors) {
      console.log(`  [${d.classification}] Patient ${d.patient} × Trial ${d.trial}`);
      console.log(`    Label: ${d.label} | Score: ${d.score} | Excluded: ${d.excluded}`);
      console.log(`    Reasons: ${d.reasons.join('; ')}`);
      console.log('');
    }
  }

  // Then show all
  console.log('ALL PAIRS:');
  for (const d of results.details) {
    const mark = d.correct ? '✓' : '✗';
    console.log(`  ${mark} [${d.classification.padEnd(9)}] P${d.patient.replace('P','')} × ${d.trial.padEnd(22)} score=${String(d.score).padStart(2)} label=${d.label}`);
  }
}

// Summary line for automated tracking
console.log('');
console.log(`SUMMARY: P=${(results.precision*100).toFixed(1)} R=${(results.recall*100).toFixed(1)} F1=${(results.f1*100).toFixed(1)} nDCG=${(results.avgNDCG*100).toFixed(1)} threshold=${threshold}`);
