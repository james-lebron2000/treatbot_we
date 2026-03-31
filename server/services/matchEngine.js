const { safeText } = require('../utils/text');

const SCORE_MIN = 42;

const STATUS_TEXT_MAP = {
  recruiting: '招募中',
  closed: '已关闭',
  completed: '已结束'
};

const safeLower = (value) => safeText(value).toLowerCase();
const normalizeText = (value) => safeLower(value).replace(/[\s\-_/\\.,，。；;:：()（）[\]【】]/g, '');

const DISEASE_PROFILES = [
  {
    id: 'liver',
    label: '肝癌',
    aliases: ['肝癌', '肝细胞癌', '原发性肝癌', 'hcc', 'hepatocellularcarcinoma']
  },
  {
    id: 'lung_nsclc',
    label: '非小细胞肺癌',
    aliases: ['非小细胞肺癌', 'nsclc', '肺腺癌', '肺鳞癌', '肺癌']
  },
  {
    id: 'breast',
    label: '乳腺癌',
    aliases: ['乳腺癌', '乳癌', 'breastcancer']
  },
  {
    id: 'gastric',
    label: '胃癌',
    aliases: ['胃癌', '胃腺癌', 'gastriccancer']
  },
  {
    id: 'colorectal',
    label: '结直肠癌',
    aliases: ['结直肠癌', '结肠癌', '直肠癌', 'crc', 'colorectalcancer']
  },
  {
    id: 'pancreatic',
    label: '胰腺癌',
    aliases: ['胰腺癌', '胰腺腺癌', 'pancreaticcancer', 'pdac', 'pancreaticductaladenocarcinoma']
  },
  {
    id: 'ovarian',
    label: '卵巢癌',
    aliases: ['卵巢癌', '卵巢上皮癌', 'ovariancancer', 'epithelialovariancancer']
  },
  {
    id: 'lymphoma',
    label: '淋巴瘤',
    aliases: ['淋巴瘤', '霍奇金淋巴瘤', '非霍奇金淋巴瘤', 'lymphoma', 'hodgkinlymphoma', 'nonhodgkinlymphoma', 'nhl', 'dlbcl']
  },
  {
    id: 'leukemia',
    label: '白血病',
    aliases: ['白血病', '急性髓系白血病', '急性淋巴细胞白血病', 'leukemia', 'aml', 'all', 'cml', 'cll']
  },
  {
    id: 'prostate',
    label: '前列腺癌',
    aliases: ['前列腺癌', 'prostatecancer', 'crpc', 'mcrpc']
  },
  {
    id: 'cervical',
    label: '宫颈癌',
    aliases: ['宫颈癌', '子宫颈癌', 'cervicalcancer']
  },
  {
    id: 'thyroid',
    label: '甲状腺癌',
    aliases: ['甲状腺癌', '甲状腺乳头状癌', 'thyroidcancer', 'ptc', 'papillarythyroidcarcinoma']
  },
  {
    id: 'bladder',
    label: '膀胱癌',
    aliases: ['膀胱癌', '尿路上皮癌', 'bladdercancer', 'urothelialcarcinoma']
  },
  {
    id: 'kidney',
    label: '肾癌',
    aliases: ['肾癌', '肾细胞癌', '透明细胞肾癌', 'rcc', 'renalcellcarcinoma', 'kidneycancer']
  }
];

// Gene profiles for alias-aware mutation matching
const GENE_PROFILES = [
  { id: 'EGFR', aliases: ['egfr', 'egfr突变', 'egfr阳性', 'egfrexon19', 'egfrexon21', 'l858r', '19del', 'exon19缺失', 'exon21点突变'] },
  { id: 'ALK',  aliases: ['alk', 'alk融合', 'alk阳性', 'alk重排', 'alkrearrangement', 'alkfusion'] },
  { id: 'ROS1', aliases: ['ros1', 'ros1融合', 'ros1重排', 'ros1fusion'] },
  { id: 'KRAS', aliases: ['kras', 'kras突变', 'krasg12c', 'krasg12d', 'krasg12v'] },
  { id: 'BRAF', aliases: ['braf', 'braf突变', 'brafv600e', 'brafv600'] },
  { id: 'HER2', aliases: ['her2', 'her2阳性', 'her2扩增', 'erbb2', 'her2过表达'] },
  { id: 'MET',  aliases: ['met', 'met扩增', 'met突变', 'metex14', 'metexon14', 'cmet'] },
  { id: 'RET',  aliases: ['ret', 'ret融合', 'ret重排', 'retfusion'] },
  { id: 'NTRK', aliases: ['ntrk', 'ntrk融合', 'ntrk1', 'ntrk2', 'ntrk3', 'trkfusion'] },
  { id: 'PDL1', aliases: ['pdl1', 'pdl1阳性', 'pdl1表达', 'tps', 'cps'] },
  { id: 'BRCA', aliases: ['brca', 'brca1', 'brca2', 'brca突变', 'brca12'] },
  { id: 'MSI',  aliases: ['msi', 'msih', '微卫星不稳定', 'dmmr', 'mmr缺陷'] },
  { id: 'TMB',  aliases: ['tmb', 'tmbh', '肿瘤突变负荷'] }
];

// Stage synonyms to bridge Chinese clinical terms ↔ Roman numerals
const STAGE_ALIASES = {
  iv:  ['iv期', '4期', '晚期', '转移性', 'metastatic', 'stageiv', 'stage4', '远处转移', '播散性'],
  iii: ['iii期', '3期', '局部晚期', 'locallyadvanced', 'stageiii', 'stage3'],
  ii:  ['ii期', '2期', 'stageii', 'stage2'],
  i:   ['i期', '1期', 'stagei', 'stage1', '早期']
};

const GENERIC_CANCER_ALIASES = ['实体瘤', '实体性肿瘤', '恶性肿瘤', '晚期实体瘤', '进展期实体瘤', '实体肿瘤'];

const parseArrayField = (value) => {
  if (!value) {
    return [];
  }
  if (Array.isArray(value)) {
    return value.map((item) => safeText(item)).filter(Boolean);
  }
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed.map((item) => safeText(item)).filter(Boolean) : [];
    } catch (error) {
      return safeText(value) ? [safeText(value)] : [];
    }
  }
  return [];
};

const containsAlias = (text, aliases = []) => {
  const normalizedText = normalizeText(text);
  if (!normalizedText) {
    return false;
  }
  return aliases.some((alias) => normalizedText.includes(normalizeText(alias)));
};

const getDiseaseProfile = (text) => {
  if (!text) {
    return null;
  }

  let best = null;
  for (const profile of DISEASE_PROFILES) {
    const matchedAliases = profile.aliases.filter((alias) => containsAlias(text, [alias]));
    if (!matchedAliases.length) {
      continue;
    }
    const aliasWeight = matchedAliases.reduce((max, alias) => Math.max(max, normalizeText(alias).length), 0);
    if (!best || matchedAliases.length > best.matchedAliases.length || aliasWeight > best.aliasWeight) {
      best = { ...profile, matchedAliases, aliasWeight };
    }
  }
  return best;
};

const hasGenericCancerSignal = (text) => containsAlias(text, GENERIC_CANCER_ALIASES);

// Returns the GENE_PROFILES entry whose aliases match the given text, or null.
const getGeneProfile = (text) => {
  if (!text) return null;
  const normalizedText = normalizeText(text);
  for (const profile of GENE_PROFILES) {
    if (profile.aliases.some((alias) => normalizedText.includes(normalizeText(alias)))) {
      return profile;
    }
  }
  return null;
};

// True when the record's gene mutation text matches any alias of the same gene in trialText.
// Falls back to raw substring if no profile is found.
const matchGene = (recordGeneText, trialText) => {
  if (!recordGeneText || !trialText) return false;
  const geneProfile = getGeneProfile(recordGeneText);
  if (geneProfile) {
    return geneProfile.aliases.some((alias) => normalizeText(trialText).includes(normalizeText(alias)));
  }
  return normalizeText(trialText).includes(normalizeText(recordGeneText));
};

// True when the record's stage maps to any synonym present in trialText.
// Prevents false positives like stage "IV" matching "HIV".
const matchStage = (recordStageText, trialText) => {
  if (!recordStageText || !trialText) return false;
  const normalizedStage = normalizeText(recordStageText);
  const normalizedTrialText = normalizeText(trialText);

  // Direct match first
  if (normalizedTrialText.includes(normalizedStage)) return true;

  // Synonym expansion
  for (const [key, aliases] of Object.entries(STAGE_ALIASES)) {
    const patientMatchesThisTier =
      normalizedStage === normalizeText(key) ||
      aliases.some((alias) => normalizedStage.includes(normalizeText(alias)));
    if (patientMatchesThisTier) {
      return (
        normalizedTrialText.includes(normalizeText(key)) ||
        aliases.some((alias) => normalizedTrialText.includes(normalizeText(alias)))
      );
    }
  }
  return false;
};

const matchDiseaseText = (queryText, targetText) => {
  const normalizedQuery = normalizeText(queryText);
  const normalizedTarget = normalizeText(targetText);

  if (!normalizedQuery || !normalizedTarget) {
    return {
      matched: false,
      specific: false,
      generic: false
    };
  }

  const queryProfile = getDiseaseProfile(queryText);
  const targetProfile = getDiseaseProfile(targetText);

  if (queryProfile && targetProfile && queryProfile.id === targetProfile.id) {
    return {
      matched: true,
      specific: true,
      generic: false,
      queryProfile,
      targetProfile
    };
  }

  if (queryProfile && containsAlias(targetText, queryProfile.aliases)) {
    return {
      matched: true,
      specific: true,
      generic: false,
      queryProfile,
      targetProfile
    };
  }

  if (normalizedTarget.includes(normalizedQuery)) {
    return {
      matched: true,
      specific: false,
      generic: false,
      queryProfile,
      targetProfile
    };
  }

  if (hasGenericCancerSignal(queryText) && hasGenericCancerSignal(targetText)) {
    return {
      matched: true,
      specific: false,
      generic: true,
      queryProfile,
      targetProfile
    };
  }

  return {
    matched: false,
    specific: false,
    generic: false,
    queryProfile,
    targetProfile
  };
};

const getTrialText = (trial) => {
  return [
    safeText(trial.name),
    safeText(trial.indication),
    safeText(trial.description),
    ...(parseArrayField(trial.inclusion_criteria)),
    ...(parseArrayField(trial.exclusion_criteria))
  ].join(' ');
};

const parseStructured = (value) => {
  if (!value) return null;
  if (typeof value === 'object') return value;
  try { return JSON.parse(value); } catch { return null; }
};

const scoreRecordAgainstTrial = (record, trial) => {
  let score = 16;
  const reasons = [];
  const trialText = safeLower(getTrialText(trial));
  const diagnosis = safeLower(record.diagnosis);
  const diseaseMatch = matchDiseaseText(diagnosis, trialText);

  // Disease match: 40 pts specific, 26 pts text-level, 10 pts generic
  if (diseaseMatch.specific) {
    score += 40;
    reasons.push('疾病方向与试验适应症直接匹配');
  } else if (diseaseMatch.matched && !diseaseMatch.generic) {
    score += 26;
    reasons.push('诊断信息与试验描述存在明确对应');
  } else if (diseaseMatch.generic) {
    score += 10;
    reasons.push('试验支持泛实体瘤入组');
  }

  // Gene mutation: alias-aware, 22 pts
  if (safeLower(record.gene_mutation) && matchGene(record.gene_mutation, trialText)) {
    score += 22;
    reasons.push('基因突变信息符合试验入组要求');
  }

  // Stage: synonym-aware, 10 pts
  if (safeLower(record.stage) && matchStage(record.stage, trialText)) {
    score += 10;
    reasons.push('分期信息在试验标准中有对应条件');
  }

  // ECOG performance status: 6 pts when trial requires ECOG and patient is 0–2
  const structured = parseStructured(record.structured);
  const ecog = structured && structured.ecog !== undefined && structured.ecog !== null
    ? Number(structured.ecog)
    : null;
  if (ecog !== null && !Number.isNaN(ecog) && trialText.includes('ecog')) {
    if (ecog <= 2) {
      score += 6;
      reasons.push('ECOG 体能状态符合常规入组要求');
    }
  }

  // Recruiting bonus: 8 pts
  if (trial.status === 'recruiting') {
    score += 8;
    reasons.push('试验当前处于招募中');
  }

  if (reasons.length === 0) {
    reasons.push('已根据病历基础信息进行规则匹配');
  }

  return {
    score: Math.min(99, score),
    reasons
  };
};

const buildMatchItem = (trial, scored) => ({
  id: trial.id,
  trialId: trial.id,
  name: safeText(trial.name),
  score: scored.score,
  phase: safeText(trial.phase) || '未标注',
  location: safeText(trial.location) || '待补充',
  type: safeText(trial.type) || '未标注',
  indication: safeText(trial.indication) || '待补充',
  institution: safeText(trial.institution) || '待补充',
  status: trial.status,
  statusText: STATUS_TEXT_MAP[trial.status] || trial.status,
  reasons: scored.reasons
});

const matchRecordsToTrials = (records, trials, minScore = SCORE_MIN) => {
  const matches = [];
  for (const trial of trials) {
    let best = null;
    for (const record of records) {
      const scored = scoreRecordAgainstTrial(record, trial);
      if (!best || scored.score > best.score) {
        best = scored;
      }
    }
    if (best && best.score >= minScore) {
      matches.push(buildMatchItem(trial, best));
    }
  }
  matches.sort((a, b) => b.score - a.score);
  return matches;
};

module.exports = {
  SCORE_MIN,
  STATUS_TEXT_MAP,
  containsAlias,
  getDiseaseProfile,
  hasGenericCancerSignal,
  matchDiseaseText,
  normalizeText,
  parseArrayField,
  getTrialText,
  scoreRecordAgainstTrial,
  matchRecordsToTrials
};
