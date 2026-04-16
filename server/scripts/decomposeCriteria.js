#!/usr/bin/env node
/**
 * decomposeCriteria.js — Decompose trial criteria into individually evaluable criterion objects
 *
 * Takes each trial's inclusion_criteria[] and exclusion_criteria[] arrays and converts them
 * into structured criterion objects that can be evaluated deterministically (age, ECOG, labs)
 * or semantically (LLM) against a patient profile.
 *
 * Output is saved to data/decomposed_criteria.json and can be loaded into the Trial model
 * via loadDecomposedCriteria.js.
 *
 * Phase 1 of the deterministic parsing runs WITHOUT an LLM — it uses rule-based pattern
 * matching to classify ~60% of criteria as deterministic. The remaining ~40% are marked
 * as "semantic" and will be evaluated by LLM at match time.
 *
 * Usage:
 *   node server/scripts/decomposeCriteria.js
 *   node server/scripts/decomposeCriteria.js --trial-data server/data/trials_data.json
 */

const path = require('path');
const fs = require('fs');

const STRUCTURED_PATH = path.join(__dirname, '..', 'data', 'structured_inclusion.json');
const OUTPUT_PATH = path.join(__dirname, '..', 'data', 'decomposed_criteria.json');

// ---- Category Detection Rules ----
// Each rule maps a regex pattern to a category/subcategory/evaluation_type.
// Deterministic criteria have structured fields that can be compared directly.

const DETERMINISTIC_RULES = [
  // Age
  {
    patterns: [
      /(?:年龄|age)[^\n]{0,20}?(?:[≥>=]+\s*)(\d+)\s*(?:岁|周岁|years)?[^\n]{0,30}?(?:[≤<=]+\s*)(\d+)/i,
      /(\d+)\s*(?:岁|周岁)?\s*[≤<=]+\s*(?:年龄|age)\s*[≤<=]+\s*(\d+)/i
    ],
    category: 'demographic',
    subcategory: 'age_range',
    extract: (match) => ({ field: 'age', min: Number(match[1]), max: Number(match[2]) })
  },
  {
    patterns: [/(?:年龄|age)[^\n]{0,10}?[≥>=]+\s*(\d+)\s*(?:岁|周岁|years)?/i],
    category: 'demographic',
    subcategory: 'age_min',
    extract: (match) => ({ field: 'age', min: Number(match[1]), max: null })
  },
  {
    patterns: [/(?:年龄|age)[^\n]{0,10}?[≤<=]+\s*(\d+)\s*(?:岁|周岁|years)?/i],
    category: 'demographic',
    subcategory: 'age_max',
    extract: (match) => ({ field: 'age', min: null, max: Number(match[1]) })
  },
  // ECOG
  {
    patterns: [
      /ECOG[^0-4]{0,20}?[≤<=]+\s*([0-4])/i,
      /ECOG[^0-4]{0,10}?0\s*[-~]\s*([0-4])/i
    ],
    category: 'clinical',
    subcategory: 'ecog',
    extract: (match) => ({ field: 'ecog', max: Number(match[1]) })
  },
  // Expected survival
  {
    patterns: [/(?:预期生存|预计生存|expected survival)[^\d]{0,15}?[≥>=]+\s*(\d+)\s*(?:个月|月|months)/i],
    category: 'clinical',
    subcategory: 'survival',
    extract: (match) => ({ field: 'survival_months', min: Number(match[1]) })
  },
  // PD-L1 threshold
  {
    patterns: [
      /(?:PD-?L1|TPS|CPS)[^\d]{0,15}?[≥>=]+\s*(\d+)\s*%?/i
    ],
    category: 'molecular',
    subcategory: 'pdl1',
    extract: (match) => ({ field: 'pdl1', threshold: Number(match[1]) })
  },
  // Measurable lesion (RECIST)
  {
    patterns: [/(?:可测量病灶|measurable lesion|RECIST)/i],
    category: 'clinical',
    subcategory: 'measurable_lesion',
    extract: () => ({ field: 'measurable_lesion', required: true })
  },
  // Histological confirmation
  {
    patterns: [/(?:组织学|病理学|经病理)?(?:证实|确认|confirmed)/i],
    category: 'clinical',
    subcategory: 'histology',
    extract: () => ({ field: 'histology', required: true })
  }
];

// Semantic category hints — criteria matching these are marked for LLM evaluation
const SEMANTIC_HINTS = [
  { pattern: /(?:既往|prior)[^\n]{0,40}(?:治疗|therapy|regimen)/i, category: 'treatment_history', subcategory: 'prior_therapy' },
  { pattern: /(?:基因|gene|mutation|突变|融合|amplification)/i, category: 'molecular', subcategory: 'gene_requirement' },
  { pattern: /(?:排除|excluded|不允许)[^\n]{0,30}(?:治疗|药物|therapy)/i, category: 'treatment_history', subcategory: 'excluded_therapy' },
  { pattern: /(?:肝功能|肾功能|ALT|AST|胆红素|肌酐|CrCl)/i, category: 'lab', subcategory: 'organ_function' },
  { pattern: /(?:血[^\n]{0,5}(?:细胞|小板|红蛋白)|WBC|ANC|PLT|Hb)/i, category: 'lab', subcategory: 'blood_counts' },
  { pattern: /(?:脑转移|brain metast)/i, category: 'clinical', subcategory: 'brain_metastasis' },
  { pattern: /(?:自身免疫|autoimmune)/i, category: 'clinical', subcategory: 'autoimmune' },
  { pattern: /(?:心[^\n]{0,5}功能|LVEF|心电图|QTc)/i, category: 'clinical', subcategory: 'cardiac' },
  { pattern: /(?:妊娠|怀孕|pregnant|避孕|contraception)/i, category: 'demographic', subcategory: 'fertility' },
  { pattern: /(?:感染|HIV|HBV|HCV|乙肝|丙肝)/i, category: 'clinical', subcategory: 'infection' },
  { pattern: /(?:知情同意|informed consent)/i, category: 'administrative', subcategory: 'consent' },
  { pattern: /(?:依从性|compliance)/i, category: 'administrative', subcategory: 'compliance' }
];

/**
 * Decompose a single criterion text into a structured object
 */
const decomposeSingle = (text, index, isExclusion) => {
  const trimmed = (text || '').trim();
  if (!trimmed || trimmed.length < 3) return null;

  const criterion = {
    criterion_id: `${isExclusion ? 'exc' : 'inc'}_${index}`,
    original_text: trimmed,
    is_exclusion: isExclusion,
    category: 'other',
    subcategory: 'unclassified',
    evaluation_type: 'semantic', // default: needs LLM
    structured: null
  };

  // Try deterministic rules first
  for (const rule of DETERMINISTIC_RULES) {
    for (const pattern of rule.patterns) {
      const match = trimmed.match(pattern);
      if (match) {
        criterion.category = rule.category;
        criterion.subcategory = rule.subcategory;
        criterion.evaluation_type = 'deterministic';
        criterion.structured = rule.extract(match);
        return criterion;
      }
    }
  }

  // Try semantic category hints
  for (const hint of SEMANTIC_HINTS) {
    if (hint.pattern.test(trimmed)) {
      criterion.category = hint.category;
      criterion.subcategory = hint.subcategory;
      return criterion;
    }
  }

  return criterion;
};

/**
 * Decompose all criteria for a single trial
 */
const decomposeTrialCriteria = (trialId, inclusionCriteria, exclusionCriteria, structuredInclusion) => {
  const criteria = [];

  // Process inclusion criteria
  const incList = Array.isArray(inclusionCriteria) ? inclusionCriteria : [];
  incList.forEach((text, i) => {
    const c = decomposeSingle(text, i + 1, false);
    if (c) criteria.push(c);
  });

  // Process exclusion criteria
  const excList = Array.isArray(exclusionCriteria) ? exclusionCriteria : [];
  excList.forEach((text, i) => {
    const c = decomposeSingle(text, i + 1, true);
    if (c) criteria.push(c);
  });

  // Augment with structured_inclusion data (from parseInclusion LLM output)
  // This adds deterministic criteria that may not have been parsed from raw text
  if (structuredInclusion) {
    const si = structuredInclusion;

    // Ensure age criterion exists
    if ((si.age_min != null || si.age_max != null) && !criteria.some(c => c.subcategory === 'age_range' || c.subcategory === 'age_min' || c.subcategory === 'age_max')) {
      criteria.push({
        criterion_id: 'inc_si_age',
        original_text: `年龄${si.age_min ? '≥' + si.age_min : ''}${si.age_max ? '且≤' + si.age_max + '岁' : ''}`,
        is_exclusion: false,
        category: 'demographic',
        subcategory: 'age_range',
        evaluation_type: 'deterministic',
        structured: { field: 'age', min: si.age_min, max: si.age_max }
      });
    }

    // Ensure ECOG criterion exists
    if (si.ecog_max != null && !criteria.some(c => c.subcategory === 'ecog')) {
      criteria.push({
        criterion_id: 'inc_si_ecog',
        original_text: `ECOG体能评分≤${si.ecog_max}`,
        is_exclusion: false,
        category: 'clinical',
        subcategory: 'ecog',
        evaluation_type: 'deterministic',
        structured: { field: 'ecog', max: si.ecog_max }
      });
    }

    // Cancer type criterion (semantic — requires disease profile matching)
    if (si.allowed_cancer_types && si.allowed_cancer_types.length > 0 && !criteria.some(c => c.subcategory === 'cancer_type')) {
      criteria.push({
        criterion_id: 'inc_si_cancer_type',
        original_text: `允许的癌种：${si.allowed_cancer_types.join('、')}`,
        is_exclusion: false,
        category: 'clinical',
        subcategory: 'cancer_type',
        evaluation_type: 'deterministic',
        structured: { field: 'cancer_type', allowed: si.allowed_cancer_types }
      });
    }

    // Gene requirement
    if (si.required_genes && si.required_genes.length > 0 && !criteria.some(c => c.subcategory === 'gene_requirement')) {
      criteria.push({
        criterion_id: 'inc_si_genes',
        original_text: `基因要求：${si.required_genes.join('、')}`,
        is_exclusion: false,
        category: 'molecular',
        subcategory: 'gene_requirement',
        evaluation_type: 'semantic',
        structured: { field: 'gene', required: si.required_genes }
      });
    }

    // Treatment line limits
    if ((si.prior_lines_min != null || si.prior_lines_max != null) && !criteria.some(c => c.subcategory === 'treatment_lines')) {
      const parts = [];
      if (si.prior_lines_min != null) parts.push(`既往治疗≥${si.prior_lines_min}线`);
      if (si.prior_lines_max != null) parts.push(`既往治疗≤${si.prior_lines_max}线`);
      criteria.push({
        criterion_id: 'inc_si_lines',
        original_text: parts.join('且'),
        is_exclusion: false,
        category: 'treatment_history',
        subcategory: 'treatment_lines',
        evaluation_type: 'deterministic',
        structured: { field: 'treatment_line', prior_min: si.prior_lines_min, prior_max: si.prior_lines_max }
      });
    }

    // Required prior therapies
    if (si.required_prior_therapies && si.required_prior_therapies.length > 0 && !criteria.some(c => c.subcategory === 'required_prior_therapy')) {
      criteria.push({
        criterion_id: 'inc_si_req_therapy',
        original_text: `需要既往接受过：${si.required_prior_therapies.join('、')}`,
        is_exclusion: false,
        category: 'treatment_history',
        subcategory: 'required_prior_therapy',
        evaluation_type: 'semantic',
        structured: { field: 'prior_therapy', required: si.required_prior_therapies }
      });
    }

    // Excluded prior therapies
    if (si.excluded_prior_therapies && si.excluded_prior_therapies.length > 0 && !criteria.some(c => c.subcategory === 'excluded_therapy')) {
      criteria.push({
        criterion_id: 'exc_si_therapy',
        original_text: `排除既往接受过：${si.excluded_prior_therapies.join('、')}`,
        is_exclusion: true,
        category: 'treatment_history',
        subcategory: 'excluded_therapy',
        evaluation_type: 'semantic',
        structured: { field: 'prior_therapy', excluded: si.excluded_prior_therapies }
      });
    }

    // Stage requirement
    if (si.required_stage && si.required_stage.length > 0 && !criteria.some(c => c.subcategory === 'stage')) {
      criteria.push({
        criterion_id: 'inc_si_stage',
        original_text: `要求分期：${si.required_stage.join('、')}`,
        is_exclusion: false,
        category: 'clinical',
        subcategory: 'stage',
        evaluation_type: 'deterministic',
        structured: { field: 'stage', required: si.required_stage }
      });
    }

    // PD-L1 requirement
    if (si.required_pdl1 && !criteria.some(c => c.subcategory === 'pdl1')) {
      const numMatch = si.required_pdl1.match(/(\d+)/);
      criteria.push({
        criterion_id: 'inc_si_pdl1',
        original_text: `PD-L1要求：${si.required_pdl1}`,
        is_exclusion: false,
        category: 'molecular',
        subcategory: 'pdl1',
        evaluation_type: 'deterministic',
        structured: { field: 'pdl1', threshold: numMatch ? Number(numMatch[1]) : null, expression: si.required_pdl1 }
      });
    }
  }

  return criteria;
};

// ---- Main ----
const main = () => {
  console.log('=== Criteria Decomposition ===\n');

  // Load structured inclusion data
  let structuredData = {};
  if (fs.existsSync(STRUCTURED_PATH)) {
    structuredData = JSON.parse(fs.readFileSync(STRUCTURED_PATH, 'utf-8'));
    console.log(`Loaded structured_inclusion for ${Object.keys(structuredData).length} trials`);
  } else {
    console.log('No structured_inclusion.json found — proceeding with raw criteria only');
  }

  // Load trial data if available (for inclusion_criteria/exclusion_criteria arrays)
  const trialsDataPath = process.argv.includes('--trial-data')
    ? process.argv[process.argv.indexOf('--trial-data') + 1]
    : path.join(__dirname, '..', 'data', 'trials_data.json');

  let trialsData = {};
  if (fs.existsSync(trialsDataPath)) {
    const raw = JSON.parse(fs.readFileSync(trialsDataPath, 'utf-8'));
    if (Array.isArray(raw)) {
      for (const t of raw) trialsData[t.id || t['项目编码']] = t;
    } else {
      trialsData = raw;
    }
    console.log(`Loaded trial data for ${Object.keys(trialsData).length} trials`);
  } else {
    console.log(`No trial data file at ${trialsDataPath} — using structured_inclusion only`);
  }

  const allTrialIds = new Set([...Object.keys(structuredData), ...Object.keys(trialsData)]);
  console.log(`Processing ${allTrialIds.size} unique trials\n`);

  const results = {};
  let totalCriteria = 0;
  let deterministicCount = 0;
  let semanticCount = 0;
  const categoryCounts = {};

  for (const trialId of allTrialIds) {
    const si = structuredData[trialId] || null;
    const trialRaw = trialsData[trialId] || {};

    // Extract inclusion/exclusion arrays from raw data
    let inclusion = trialRaw.inclusion_criteria || trialRaw['入组条件'] || [];
    let exclusion = trialRaw.exclusion_criteria || trialRaw['排除条件'] || [];

    // If stored as newline-separated strings, split them
    if (typeof inclusion === 'string') {
      inclusion = inclusion.split(/\n/).map(s => s.replace(/^\d+[.)、]\s*/, '').trim()).filter(Boolean);
    }
    if (typeof exclusion === 'string') {
      exclusion = exclusion.split(/\n/).map(s => s.replace(/^\d+[.)、]\s*/, '').trim()).filter(Boolean);
    }

    const criteria = decomposeTrialCriteria(trialId, inclusion, exclusion, si);
    results[trialId] = criteria;

    totalCriteria += criteria.length;
    for (const c of criteria) {
      if (c.evaluation_type === 'deterministic') deterministicCount++;
      else semanticCount++;
      categoryCounts[c.category] = (categoryCounts[c.category] || 0) + 1;
    }
  }

  // Save results
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(results, null, 2), 'utf-8');

  // Report
  console.log('--- Decomposition Statistics ---');
  console.log(`Total trials: ${allTrialIds.size}`);
  console.log(`Total criteria: ${totalCriteria}`);
  console.log(`Deterministic: ${deterministicCount} (${(deterministicCount / totalCriteria * 100).toFixed(1)}%)`);
  console.log(`Semantic (LLM): ${semanticCount} (${(semanticCount / totalCriteria * 100).toFixed(1)}%)`);
  console.log('');
  console.log('By category:');
  for (const [cat, count] of Object.entries(categoryCounts).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${cat}: ${count}`);
  }
  console.log('');
  console.log(`Output saved to: ${OUTPUT_PATH}`);
};

// Export for testing
module.exports = { decomposeSingle, decomposeTrialCriteria };

if (require.main === module) {
  main();
}
