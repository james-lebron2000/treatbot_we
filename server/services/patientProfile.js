/**
 * patientProfile.js — Consolidate multiple medical records into a unified patient profile
 *
 * Merges structured entities from multiple uploaded records (OCR results) into a single
 * standardized patient profile for matching. Analogous to TrialGPT's patient summary.
 *
 * Conflict resolution:
 *   - Most recent value wins for scalar fields (diagnosis, stage, ecog)
 *   - Union for set fields (comorbidities, priorTherapies, gene mutations)
 *   - Most recent numeric values for labs/blood (they change over time)
 *   - Generates both a structuredProfile (for rule matching) and a patientSummary (for LLM)
 */

const { safeText } = require('../utils/text');

/**
 * Build a consolidated patient profile from one or more medical records
 * @param {Array<Object>} records - Array of MedicalRecord objects (with structured.entities)
 * @param {Object} [overrides] - Manual overrides from the user (e.g., city)
 * @returns {{ structuredProfile: Object, patientSummary: string }}
 */
const buildProfile = (records, overrides = {}) => {
  if (!records || records.length === 0) {
    return { structuredProfile: emptyProfile(), patientSummary: '' };
  }

  // Sort records by updated_at descending (most recent first)
  const sorted = [...records].sort((a, b) => {
    const dateA = new Date(a.updated_at || a.created_at || 0);
    const dateB = new Date(b.updated_at || b.created_at || 0);
    return dateB - dateA;
  });

  const profile = emptyProfile();

  // Merge each record (most recent first — first non-null wins for scalars)
  for (const record of sorted) {
    const entities = record.structured?.entities || {};

    // Scalar fields: take first non-null (most recent)
    if (!profile.diagnosis) profile.diagnosis = safeText(record.diagnosis || entities.diagnosis);
    if (!profile.stage) profile.stage = safeText(record.stage || entities.stage);
    if (profile.ecog == null) profile.ecog = entities.ecog ?? record.ecog ?? null;
    if (profile.age == null) profile.age = entities.age ?? record.age ?? null;
    if (!profile.pdl1) profile.pdl1 = safeText(record.pdl1 || entities.pdl1);
    if (profile.treatmentLine == null) {
      const line = entities.treatmentLine ?? record.treatment_line;
      profile.treatmentLine = line != null ? Number(line) : null;
    }
    if (!profile.treatment) profile.treatment = safeText(record.treatment || entities.treatment);
    if (profile.weight == null) profile.weight = entities.weight ?? null;
    if (profile.height == null) profile.height = entities.height ?? null;
    if (!profile.fertilityStatus) profile.fertilityStatus = entities.fertilityStatus ?? null;

    // Union fields: merge from all records
    if (record.gene_mutation || entities.geneMutation) {
      const geneText = safeText(record.gene_mutation || entities.geneMutation);
      if (geneText && !profile.geneMutations.includes(geneText)) {
        profile.geneMutations.push(geneText);
      }
    }

    if (Array.isArray(entities.comorbidities)) {
      for (const c of entities.comorbidities) {
        if (c && !profile.comorbidities.includes(c)) profile.comorbidities.push(c);
      }
    }

    if (Array.isArray(entities.priorTherapies)) {
      for (const t of entities.priorTherapies) {
        if (t && !profile.priorTherapies.includes(t)) profile.priorTherapies.push(t);
      }
    }

    // Lab values: most recent (first record) wins per key
    if (entities.labValues && typeof entities.labValues === 'object') {
      for (const [key, val] of Object.entries(entities.labValues)) {
        if (!(key in profile.labValues)) profile.labValues[key] = val;
      }
    }

    if (entities.bloodCounts && typeof entities.bloodCounts === 'object') {
      for (const [key, val] of Object.entries(entities.bloodCounts)) {
        if (!(key in profile.bloodCounts)) profile.bloodCounts[key] = val;
      }
    }
  }

  // Apply manual overrides
  if (overrides.city) profile.city = overrides.city;
  if (overrides.age != null) profile.age = overrides.age;
  if (overrides.ecog != null) profile.ecog = overrides.ecog;
  if (overrides.diagnosis) profile.diagnosis = overrides.diagnosis;

  // Combine gene mutation texts into a single string for backward compatibility
  profile.geneMutationText = profile.geneMutations.join('; ');

  // Generate natural language summary for LLM matching
  const summary = generatePatientSummary(profile);

  return { structuredProfile: profile, patientSummary: summary };
};

/**
 * Empty profile template
 */
const emptyProfile = () => ({
  // Core fields
  diagnosis: null,
  stage: null,
  ecog: null,
  age: null,
  pdl1: null,
  treatmentLine: null,
  treatment: null,
  geneMutations: [],
  geneMutationText: '',

  // Extended fields
  weight: null,
  height: null,
  comorbidities: [],
  priorTherapies: [],
  labValues: {},
  bloodCounts: {},
  fertilityStatus: null,

  // Context
  city: null
});

/**
 * Generate a natural language patient summary for LLM-based criterion evaluation
 */
const generatePatientSummary = (profile) => {
  const parts = [];

  if (profile.age != null) parts.push(`${profile.age}岁患者`);
  else parts.push('患者');

  if (profile.diagnosis) parts.push(`诊断为${profile.diagnosis}`);
  if (profile.stage) parts.push(`分期${profile.stage}`);
  if (profile.ecog != null) parts.push(`ECOG评分${profile.ecog}分`);

  if (profile.geneMutations.length > 0) {
    parts.push(`基因检测：${profile.geneMutations.join('；')}`);
  }

  if (profile.pdl1) parts.push(`PD-L1表达${profile.pdl1}`);

  if (profile.treatment) {
    parts.push(`既往治疗：${profile.treatment}`);
  }
  if (profile.treatmentLine != null) {
    parts.push(`当前需要第${profile.treatmentLine}线治疗`);
  }

  if (profile.priorTherapies.length > 0) {
    parts.push(`使用过的药物/方案：${profile.priorTherapies.join('、')}`);
  }

  if (profile.comorbidities.length > 0) {
    parts.push(`合并症：${profile.comorbidities.join('、')}`);
  }

  // Lab values
  const labParts = [];
  for (const [key, val] of Object.entries(profile.labValues)) {
    if (val && val.value != null) labParts.push(`${key} ${val.value}${val.unit || ''}`);
  }
  if (labParts.length > 0) parts.push(`肝肾功能：${labParts.join('、')}`);

  // Blood counts
  const bloodParts = [];
  for (const [key, val] of Object.entries(profile.bloodCounts)) {
    if (val && val.value != null) bloodParts.push(`${key} ${val.value}${val.unit || ''}`);
  }
  if (bloodParts.length > 0) parts.push(`血常规：${bloodParts.join('、')}`);

  if (profile.fertilityStatus) parts.push(`生育状态：${profile.fertilityStatus}`);
  if (profile.city) parts.push(`所在城市：${profile.city}`);

  return parts.join('。') + '。';
};

module.exports = { buildProfile, generatePatientSummary, emptyProfile };
