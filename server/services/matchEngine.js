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
    aliases: ['非小细胞肺癌', 'nsclc', '肺腺癌', '肺鳞癌', '肺鳞状细胞癌', '肺腺鳞癌', '肺大细胞癌', '肺癌']
  },
  {
    id: 'lung_sclc',
    label: '小细胞肺癌',
    aliases: ['小细胞肺癌', 'sclc', 'smallcelllungcancer', '小细胞癌']
  },
  {
    id: 'breast',
    label: '乳腺癌',
    aliases: ['乳腺癌', '乳癌', 'breastcancer', '三阴性乳腺癌', 'tnbc', 'her2阳性乳腺癌']
  },
  {
    id: 'gastric',
    label: '胃癌',
    aliases: ['胃癌', '胃腺癌', '胃低分化腺癌', '胃低分化癌', '胃食管结合部癌', 'gastriccancer', '胃食管癌', '贲门癌']
  },
  {
    id: 'colorectal',
    label: '结直肠癌',
    aliases: ['结直肠癌', '结肠癌', '直肠癌', 'crc', 'colorectalcancer', '结直肠腺癌']
  },
  {
    id: 'cervical',
    label: '宫颈癌',
    aliases: ['宫颈癌', '子宫颈癌', 'cervicalcancer']
  },
  {
    id: 'ovarian',
    label: '卵巢癌',
    aliases: ['卵巢癌', '卵巢上皮癌', 'ovariancancer']
  },
  {
    id: 'lymphoma',
    label: '淋巴瘤',
    aliases: ['淋巴瘤', '弥漫大b细胞淋巴瘤', 'dlbcl', 'lymphoma', '霍奇金淋巴瘤', '非霍奇金淋巴瘤', 'nhl']
  },
  {
    id: 'pancreatic',
    label: '胰腺癌',
    aliases: ['胰腺癌', '胰腺导管腺癌', '胰腺腺癌', 'pancreaticcancer', '胰腺导管癌']
  },
  {
    id: 'bladder',
    label: '膀胱癌',
    aliases: ['膀胱癌', '膀胱尿路上皮癌', 'bladdercancer', 'urothelialcancer']
  },
  {
    id: 'thyroid',
    label: '甲状腺癌',
    aliases: ['甲状腺癌', '甲状腺乳头状癌', '甲状腺滤泡癌', 'thyroidcancer']
  },
  {
    id: 'nasopharyngeal',
    label: '鼻咽癌',
    aliases: ['鼻咽癌', 'nasopharyngealcancer', 'npc']
  }
];

const GENERIC_CANCER_ALIASES = ['实体瘤', '实体性肿瘤', '恶性肿瘤', '晚期实体瘤', '进展期实体瘤', '实体肿瘤'];

// 已知基因列表，用于精确基因名匹配（避免子串假阳性）
const KNOWN_GENES = [
  'egfr', 'alk', 'ros1', 'kras', 'braf', 'her2', 'erbb2',
  'met', 'ret', 'ntrk', 'ntrk1', 'ntrk2', 'ntrk3',
  'fgfr', 'fgfr1', 'fgfr2', 'fgfr3',
  'pik3ca', 'pten', 'tp53',
  'pdl1', 'pd-l1',
  'tmb', 'msih', 'msi-h', 'mmr', 'dmmr'
];

/**
 * 从文本中提取命中的已知基因名列表
 */
const extractGeneNames = (text) => {
  if (!text) return [];
  const s = safeLower(text).replace(/[\s\-_]/g, '');
  return KNOWN_GENES.filter((gene) => {
    const normalizedGene = gene.replace(/[\-_]/g, '');
    return s.includes(normalizedGene);
  });
};

// ---- Canonical gene tokens for hard filtering (broader than KNOWN_GENES) ----
// Maps raw matches to a canonical family name so "BRCA1" and "BRCA2" both map to BRCA,
// "NRAS"/"KRAS" to their own canonical names (they are distinct).
const GENE_TOKEN_MAP = [
  { raw: /\bEGFR\b/i, canonical: 'EGFR' },
  { raw: /\bALK\b/i, canonical: 'ALK' },
  { raw: /\bROS1\b/i, canonical: 'ROS1' },
  { raw: /\bKRAS\b/i, canonical: 'KRAS' },
  { raw: /\bNRAS\b/i, canonical: 'NRAS' },
  { raw: /\bHRAS\b/i, canonical: 'HRAS' },
  { raw: /\bBRAF\b/i, canonical: 'BRAF' },
  { raw: /\b(HER2|ERBB2)\b/i, canonical: 'HER2' },
  { raw: /\bMET\b/i, canonical: 'MET' },
  { raw: /\bRET\b/i, canonical: 'RET' },
  { raw: /\bNTRK[123]?\b/i, canonical: 'NTRK' },
  { raw: /\bFGFR[1-4]?\b/i, canonical: 'FGFR' },
  { raw: /\bPIK3CA\b/i, canonical: 'PIK3CA' },
  { raw: /\bPTEN\b/i, canonical: 'PTEN' },
  { raw: /\bTP53\b/i, canonical: 'TP53' },
  { raw: /\bCLDN18(\.2)?\b/i, canonical: 'CLDN18' },
  { raw: /\bROR1\b/i, canonical: 'ROR1' },
  { raw: /\bBRCA[12]?\b/i, canonical: 'BRCA' },
  { raw: /(MSI[- ]?H|微卫星不稳定|微卫星高)/i, canonical: 'MSI' },
  { raw: /(MSI[- ]?L|MSS|微卫星稳定|微卫星低)/i, canonical: 'MSS' },
  { raw: /\bdMMR\b/i, canonical: 'dMMR' },
  { raw: /\bpMMR\b/i, canonical: 'pMMR' },
  { raw: /\bTMB\b/i, canonical: 'TMB' },
  { raw: /\bHLA[- ]?[ABC]\*?\d+/i, canonical: 'HLA' },
  { raw: /MAGE[- ]?A?4?/i, canonical: 'MAGE' },
  { raw: /PD[- ]?L1/i, canonical: 'PDL1' }
];

/**
 * Extract canonical gene tokens from text.
 * Excludes tokens that only appear embedded in ambiguous context.
 */
const extractCanonicalGenes = (text) => {
  if (!text) return [];
  const found = new Set();
  for (const { raw, canonical } of GENE_TOKEN_MAP) {
    if (raw.test(text)) found.add(canonical);
  }
  return [...found];
};

/**
 * Determine whether a canonical gene is referenced with a "positive/mutant/expressed" status
 * or a "wild-type/negative/absent" status in the patient text.
 * Returns 'positive' | 'negative' | 'unknown'.
 */
const getGeneStatusInText = (text, canonical) => {
  if (!text) return 'unknown';
  // Find the gene in the text (locate first occurrence of any matching variant)
  const mapEntry = GENE_TOKEN_MAP.find((e) => e.canonical === canonical);
  if (!mapEntry) return 'unknown';
  const match = text.match(mapEntry.raw);
  if (!match) return 'unknown';
  const idx = text.search(mapEntry.raw);
  // Window after the gene token (status markers usually follow the gene name)
  const windowEnd = Math.min(text.length, idx + match[0].length + 20);
  const after = text.substring(idx, windowEnd);
  // Also a small window before (for "阴性EGFR" patterns)
  const windowStart = Math.max(0, idx - 8);
  const before = text.substring(windowStart, idx);
  const window = before + after;
  const NEG = /(野生型?|阴性|未见|未检出|无突变|无表达|wild[- ]?type|\bWT\b|\bnegative\b|not detected)/i;
  const POS = /(突变|阳性|融合|扩增|激活|表达|重排|高表达|过表达|mutation|positive|fusion|amplif|activating|expressed|mutant|rearrang)/i;
  if (NEG.test(window) && !POS.test(window)) return 'negative';
  if (POS.test(window)) return 'positive';
  // Special canonical-specific cues
  if (canonical === 'MSI' && /(MSI[- ]?H|高|instability[- ]high)/i.test(window)) return 'positive';
  if (canonical === 'MSS' && /MSS|稳定|stable/i.test(window)) return 'positive';
  return 'unknown';
};

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
  return aliases.some((alias) => {
    const normalizedAlias = normalizeText(alias);
    // 双向匹配：text 包含 alias，或 alias 包含 text（如 "胰腺癌" ⊂ "胰腺导管腺癌"）
    return normalizedText.includes(normalizedAlias) || normalizedAlias.includes(normalizedText);
  });
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

/**
 * 分期等价表：将各种中英文表达归一到标准键
 * 支持 AJCC 分期 + 临床常用描述
 */
const STAGE_EQUIVALENTS = {
  iv: ['iv期', 'iva期', 'ivb期', 'ivc期', '4期', '四期', '晚期', '转移性', '远处转移', 'metastatic', '播散期', '广泛期', 'm1'],
  iii: ['iii期', 'iiia期', 'iiib期', 'iiic期', '3期', '三期', '局部晚期', '局晚期', 'locallyadvanced'],
  ii: ['ii期', 'iia期', 'iib期', '2期', '二期'],
  i: ['i期', 'ia期', 'ib期', '1期', '一期', '早期']
};

/**
 * 将分期文本归一化为标准键（如 'iv'）；无法识别则返回 null
 */
const normalizeStage = (stageText) => {
  if (!stageText) return null;
  const s = normalizeText(stageText);
  for (const [key, aliases] of Object.entries(STAGE_EQUIVALENTS)) {
    if (aliases.some((alias) => s.includes(normalizeText(alias)))) {
      return key;
    }
  }
  return null;
};

/**
 * 判断患者分期与试验文本的分期是否语义等价
 */
const stageMatches = (patientStage, trialText) => {
  // 先尝试直接子串匹配
  const patientNorm = safeLower(patientStage);
  if (patientNorm && safeLower(trialText).includes(patientNorm)) {
    return true;
  }
  // 再尝试语义归一化匹配
  const patientKey = normalizeStage(patientStage);
  if (!patientKey) return false;
  const trialKey = normalizeStage(trialText);
  if (trialKey && trialKey === patientKey) return true;
  // 检查试验文本是否包含该分期的任意等价表达
  const aliases = STAGE_EQUIVALENTS[patientKey] || [];
  return aliases.some((alias) => normalizeText(trialText).includes(normalizeText(alias)));
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

// 仅包含 inclusion 相关文本用于加分，exclusion 不参与加分避免误匹配
const getTrialInclusionText = (trial) => {
  return [
    safeText(trial.name),
    safeText(trial.indication),
    safeText(trial.description),
    safeText(trial.brief_inclusion),
    ...(parseArrayField(trial.inclusion_criteria)),
    ...(Array.isArray(trial.disease_tags) ? trial.disease_tags : [])
  ].join(' ');
};

// 保留原函数名作为别名，方便其他地方调用全文搜索
const getTrialText = getTrialInclusionText;

/**
 * 从患者诊断文本中提取用于粗筛的疾病关键词
 */
const extractDiseaseKeywords = (diagnosis) => {
  if (!diagnosis) return [];
  const profile = getDiseaseProfile(diagnosis);
  if (profile) {
    const chineseAliases = [...profile.aliases].filter((a) => /[\u4e00-\u9fff]/.test(a));
    // 始终包含最短的主名（2-4字，用于 JSON_SEARCH 宽泛匹配）+ 最长2个别名
    const short = chineseAliases.filter((a) => a.length <= 4).sort((a, b) => a.length - b.length);
    const long = chineseAliases.sort((a, b) => b.length - a.length).slice(0, 2);
    return [...new Set([...short.slice(0, 1), ...long])].slice(0, 4);
  }
  // 无 profile 匹配时尝试从文本提取癌种关键词
  const cancerMatch = normalizeText(diagnosis).match(/([\u4e00-\u9fff]{1,8}(?:癌|瘤))/);
  return cancerMatch ? [cancerMatch[1]] : [];
};

/**
 * 构造粗筛 SQL WHERE 条件
 * 使用 MySQL JSON_SEARCH 函数匹配 disease_tags / study_cities
 */
const buildCoarseFilter = (patientProfile) => {
  const { Op, fn, col } = require('sequelize');
  const where = { status: 'recruiting' };
  const diseaseKeywords = extractDiseaseKeywords(patientProfile.diagnosis);

  if (diseaseKeywords.length > 0) {
    const diseaseConditions = diseaseKeywords.map((kw) => ({
      [Op.and]: require('sequelize').where(
        fn('JSON_SEARCH', col('disease_tags'), 'one', `%${kw}%`),
        { [Op.ne]: null }
      )
    }));
    // 总是包含泛实体瘤试验
    diseaseConditions.push({
      [Op.and]: require('sequelize').where(
        fn('JSON_SEARCH', col('disease_tags'), 'one', '%全部实体瘤%'),
        { [Op.ne]: null }
      )
    });
    where[Op.or] = diseaseConditions;
  }

  if (patientProfile.city) {
    where[Op.and] = [
      require('sequelize').where(
        fn('JSON_SEARCH', col('study_cities'), 'one', `%${patientProfile.city}%`),
        { [Op.ne]: null }
      )
    ];
  }

  return where;
};

/**
 * 从患者记录中获取治疗线数
 */
const getPatientTreatmentLine = (record) => {
  const line = record.treatment_line
    || record.structured?.entities?.treatmentLine;
  return Number.isFinite(Number(line)) ? Number(line) : null;
};

/**
 * 从患者记录中获取 PD-L1 值
 */
const getPatientPdl1 = (record) => {
  return record.pdl1
    || record.structured?.entities?.pdl1
    || null;
};

/**
 * 从患者记录中获取年龄（优先 structured.entities.age，其次 record.age）
 */
const getPatientAge = (record) => {
  const age = record.age
    || record.structured?.entities?.age;
  return Number.isFinite(Number(age)) ? Number(age) : null;
};

// ---- Hard filter helpers ----

const KNOWN_SOLID_TUMOR_ALIASES = [
  '肺癌', '乳腺癌', '肝癌', '肝细胞癌', '胃癌', '胃腺癌', '结直肠癌', '结肠癌', '直肠癌',
  '食管癌', '胰腺癌', '胆管癌', '胆道癌', '肾癌', '膀胱癌', '前列腺癌',
  '卵巢癌', '宫颈癌', '子宫内膜癌', '甲状腺癌', '鼻咽癌', '头颈癌', '黑色素瘤',
  '肉瘤', '胶质瘤', '腺癌', '鳞癌', '尿路上皮癌', '神经内分泌',
  'nsclc', 'sclc', 'tnbc'
];

const isGenericCancerCategory = (cancerType) => {
  // "其他实体瘤", "所有实体瘤", "泛实体瘤", 或仅写"实体瘤/恶性肿瘤/肿瘤"
  const stripped = cancerType.replace(/[（(].*?[）)]/g, '');
  if (/^(其他|泛|所有|全部)/.test(stripped)) return true;
  if (/^(晚期|进展期)?(实体瘤|实体性肿瘤|恶性肿瘤|肿瘤)$/.test(stripped)) return true;
  return false;
};

/**
 * 判断患者诊断与试验允许癌种列表是否兼容。
 * 返回 { compatible: true/false, reason: string }。
 * 对于 basket trial（含"实体瘤"类泛化项），除非显式除外，否则兼容。
 */
const evaluateCancerTypeCompatibility = (diagnosis, allowedCancerTypes) => {
  if (!diagnosis || !allowedCancerTypes?.length) {
    return { compatible: true };
  }
  const diagNorm = normalizeText(diagnosis);
  const diagIsNSCLC = /非小细胞|nsclc|肺腺癌|肺鳞癌|肺大细胞|非鳞/.test(diagNorm);
  const diagIsSCLC = !diagIsNSCLC && /小细胞肺癌|sclc|小细胞癌/.test(diagNorm);
  const diagIsTNBC = /三阴/.test(diagNorm);
  const diagIsHer2BreastPositive = /her2阳性乳腺|her2阳性.*乳腺|乳腺.*her2阳性/.test(diagNorm);

  const specific = [];
  const generic = [];
  for (const type of allowedCancerTypes) {
    if (isGenericCancerCategory(type)) generic.push(type);
    else specific.push(type);
  }

  // Phase 1: exact / alias match against specific types
  for (const type of specific) {
    const typeNorm = normalizeText(type);
    const typeIsNSCLC = /非小细胞|nsclc|肺腺癌|肺鳞癌|非鳞/.test(typeNorm);
    const typeIsSCLC = !typeIsNSCLC && /小细胞肺癌|sclc|小细胞癌/.test(typeNorm);
    const typeIsTNBC = /三阴/.test(typeNorm);
    const typeIsHer2Pos = /her2阳性/.test(typeNorm);

    // NSCLC/SCLC are clinically distinct — do not cross-match
    if ((diagIsNSCLC && typeIsSCLC) || (diagIsSCLC && typeIsNSCLC)) continue;
    // HER2+ breast vs TNBC — distinct molecular subtypes
    if (diagIsTNBC && typeIsHer2Pos) continue;
    if (diagIsHer2BreastPositive && typeIsTNBC) continue;

    if (diagNorm.includes(typeNorm) || typeNorm.includes(diagNorm)) {
      return { compatible: true };
    }
    const diseaseResult = matchDiseaseText(diagnosis, type);
    if (diseaseResult.matched && diseaseResult.specific) {
      // HER2+/TNBC subtype guard even on disease-profile level
      if (diagIsTNBC && typeIsHer2Pos) continue;
      if (diagIsHer2BreastPositive && typeIsTNBC) continue;
      return { compatible: true };
    }
  }

  // Phase 2: generic catch-all acceptance (basket trials)
  for (const t of generic) {
    const exclMatch = t.match(/[（(]除外(.+?)[）)]/);
    if (exclMatch) {
      const excludedTypes = exclMatch[1].split(/[、,，]/).map((s) => s.trim()).filter(Boolean);
      const diagExcluded = excludedTypes.some((et) => {
        const etNorm = normalizeText(et);
        if (!etNorm) return false;
        // NSCLC/SCLC strict disambiguation in exclusion clause as well
        const etIsSCLC = /小细胞肺癌|sclc|小细胞癌/.test(etNorm);
        if (etIsSCLC && diagIsSCLC) return true;
        if (etIsSCLC && diagIsNSCLC) return false;
        return diagNorm.includes(etNorm) || etNorm.includes(diagNorm);
      });
      if (diagExcluded) {
        return {
          compatible: false,
          reason: `试验明确除外"${exclMatch[1]}"，患者诊断"${diagnosis}"属排除范围`
        };
      }
    }
    if (hasGenericCancerSignal(diagnosis) || KNOWN_SOLID_TUMOR_ALIASES.some((a) => diagNorm.includes(normalizeText(a)))) {
      return { compatible: true };
    }
  }

  // Neither specific nor generic matched → incompatible
  return {
    compatible: false,
    reason: `诊断"${diagnosis}"不在试验允许癌种列表：${allowedCancerTypes.join('、')}`
  };
};

/**
 * 常规实体瘤基因检测中会报告的基因集合。
 * 非此集合内的基因（如 ROR1 表达、HLA 分型、MAGE-A4、CLDN18.2 等特殊靶点）
 * 通常需要专门检测，在常规基因报告中不出现并不意味"阴性"。
 * 因此硬排除仅基于这些常被检测的基因。
 */
const WIDELY_TESTED_GENES = new Set([
  'EGFR', 'ALK', 'ROS1', 'KRAS', 'NRAS', 'HRAS', 'BRAF', 'HER2',
  'MET', 'RET', 'NTRK', 'FGFR', 'BRCA', 'MSI', 'MSS', 'dMMR', 'pMMR',
  'PDL1', 'TP53', 'PIK3CA', 'PTEN'
]);

/**
 * 判断患者基因谱与试验要求基因是否兼容。
 * 返回 null 表示兼容（或无法判断，走软排），返回字符串表示硬排除理由。
 *
 * 策略：
 *   1. 仅当患者 gene_mutation 有内容时考虑硬排除（信息缺失不排除）。
 *   2. 若试验要求的基因均为"非常规检测"（如 ROR1、HLA、MAGE、CLDN18 等），
 *      不做硬排除 —— 患者未提及可能只是未检测。
 *   3. 若试验要求的"常规检测基因"在患者报告中全部未提及，则硬排除。
 *   4. 若共有基因的状态（阳性 vs 野生型）明确冲突，则硬排除。
 */
const evaluateGeneCompatibility = (record, requiredGenes) => {
  const patientGeneText = record.gene_mutation
    || record.structured?.entities?.geneMutation
    || '';
  if (!patientGeneText) return null;

  const requiredText = requiredGenes.join(' ; ');
  const trialTokens = extractCanonicalGenes(requiredText);
  if (trialTokens.length === 0) return null;

  const trialCommonTokens = trialTokens.filter((t) => WIDELY_TESTED_GENES.has(t));
  if (trialCommonTokens.length === 0) return null; // 仅要求罕见靶点，交由软排与显式检测项处理

  const patientTokens = extractCanonicalGenes(patientGeneText);

  // Case A: 患者检测中未提及任何要求的常规基因 → 硬排除
  const overlap = trialCommonTokens.filter((g) => patientTokens.includes(g));
  if (overlap.length === 0) {
    return `试验要求${trialCommonTokens.join('/')}相关变异，患者基因检测未提及（当前：${patientGeneText}）`;
  }

  // Case B: 共有基因状态冲突
  for (const gene of overlap) {
    const trialStatus = getGeneStatusInText(requiredText, gene);
    const patientStatus = getGeneStatusInText(patientGeneText, gene);
    if (trialStatus === 'positive' && patientStatus === 'negative') {
      return `试验要求${gene}阳性/突变，患者${gene}为阴性/野生型`;
    }
    if (trialStatus === 'negative' && patientStatus === 'positive') {
      return `试验要求${gene}阴性/野生型，患者${gene}为阳性/突变`;
    }
  }

  return null;
};

const scoreRecordAgainstTrial = (record, trial) => {
  let score = 10; // 基础分
  const reasons = [];

  // ---- 结构化入组条件硬过滤（structured_inclusion 由 LLM 预解析）----
  const si = trial.structured_inclusion;
  if (si && typeof si === 'object') {
    const patientAge = getPatientAge(record);
    // 年龄硬排除
    if (patientAge != null) {
      if (si.age_min != null && patientAge < si.age_min) {
        return { score: 0, reasons: [`年龄（${patientAge}岁）低于试验最低要求（${si.age_min}岁）`], excluded: true };
      }
      if (si.age_max != null && patientAge > si.age_max) {
        return { score: 0, reasons: [`年龄（${patientAge}岁）超过试验年龄上限（${si.age_max}岁）`], excluded: true };
      }
    }
    // ECOG 硬排除（如果有结构化数据）
    const ecog = record.structured?.entities?.ecog ?? record.ecog;
    if (ecog != null && si.ecog_max != null && Number(ecog) > si.ecog_max) {
      return { score: 0, reasons: [`ECOG评分（${ecog}）超过试验要求（≤${si.ecog_max}）`], excluded: true };
    }

    // A9: 先验疗法硬排除 —— 若患者既往用过被试验排除的疗法，直接排除
    // 仅匹配具体疗法/靶点名称，跳过过于笼统或带时间限定的描述
    if (Array.isArray(si.excluded_prior_therapies) && si.excluded_prior_therapies.length > 0) {
      const patientTx = normalizeText(record.treatment || '');
      if (patientTx) {
        for (const therapy of si.excluded_prior_therapies) {
          const normTherapy = normalizeText(therapy);
          if (!normTherapy) continue;
          // 跳过过长描述（>20字符去标点后通常是复杂条件句而非药名）
          if (normTherapy.length > 20) continue;
          // 跳过含时间限定的条件（如"4周内""3个月内"），这些需要时间维度判断
          if (/\d+[周月天日]内/.test(therapy)) continue;
          // 跳过过于笼统的系统治疗描述
          if (/全身(性)?(抗肿瘤|系统)?治疗|系统(性)?(抗肿瘤)?治疗|系统性抗癌|全身化疗/.test(therapy) && !/靶向|抑制剂|单抗|抗体/.test(therapy)) continue;
          if (patientTx.includes(normTherapy)) {
            return {
              score: 0,
              reasons: [`患者既往治疗包含「${therapy}」，被该试验排除`],
              excluded: true
            };
          }
        }
      }
    }

    // 癌种硬排除 —— 若试验明确限定允许癌种且患者诊断不在范围内，则排除
    if (Array.isArray(si.allowed_cancer_types) && si.allowed_cancer_types.length > 0 && record.diagnosis) {
      const cancerCheck = evaluateCancerTypeCompatibility(record.diagnosis, si.allowed_cancer_types);
      if (cancerCheck.compatible === false) {
        return { score: 0, reasons: [cancerCheck.reason], excluded: true };
      }
    }

    // 基因硬排除 —— 若试验要求特定基因变异，且患者基因检测中无任何一项匹配，则排除
    if (Array.isArray(si.required_genes) && si.required_genes.length > 0) {
      const geneExclusion = evaluateGeneCompatibility(record, si.required_genes);
      if (geneExclusion) {
        return { score: 0, reasons: [geneExclusion], excluded: true };
      }
    }

    // 既往治疗线数硬排除 —— 若患者治疗线数超出试验允许范围
    const patientLineRaw = getPatientTreatmentLine(record);
    if (patientLineRaw != null && Number.isFinite(patientLineRaw)) {
      // treatmentLine 表示下一个要接受的线数，prior lines = treatmentLine - 1
      const priorLines = patientLineRaw - 1;
      if (si.prior_lines_max != null && priorLines > si.prior_lines_max) {
        return {
          score: 0,
          reasons: [`既往治疗${priorLines}线超过试验允许上限（≤${si.prior_lines_max}线）`],
          excluded: true
        };
      }
      if (si.prior_lines_min != null && priorLines < si.prior_lines_min) {
        return {
          score: 0,
          reasons: [`既往治疗${priorLines}线低于试验要求（≥${si.prior_lines_min}线）`],
          excluded: true
        };
      }
    }
  }

  const trialText = safeLower(getTrialText(trial));
  const diagnosis = safeLower(record.diagnosis);
  const diseaseMatch = matchDiseaseText(diagnosis, trialText);

  // ---- 疾病匹配（文本级）----
  if (diseaseMatch.specific) {
    score += 34;
    reasons.push('疾病方向与试验适应症直接匹配');
  } else if (diseaseMatch.matched && !diseaseMatch.generic) {
    score += 26;
    reasons.push('诊断信息与试验描述存在明确对应');
  } else if (diseaseMatch.generic) {
    score += 10;
    reasons.push('试验支持泛实体瘤入组');
  }

  // ---- 疾病标签精确匹配（结构化数据加分）----
  const diseaseTags = trial.disease_tags || [];
  if (diseaseTags.length > 0 && diagnosis) {
    const diagNorm = normalizeText(diagnosis);
    const tagHit = diseaseTags.some((tag) => normalizeText(tag).includes(diagNorm) || diagNorm.includes(normalizeText(tag)));
    if (tagHit) {
      score += 5;
      reasons.push('疾病标签精确命中');
    }
  }

  // ---- 基因匹配（P2-6: 区分阳性/野生型/待检测）----
  const patientGeneText = safeLower(record.gene_mutation || '');
  const patientGenes = extractGeneNames(patientGeneText);
  const trialGenes = extractGeneNames(trialText);
  const geneOverlap = patientGenes.filter((g) => trialGenes.includes(g));
  if (geneOverlap.length > 0) {
    let geneScore = 0;
    const geneDetails = [];
    for (const gene of geneOverlap) {
      const geneUpper = gene.toUpperCase();
      // 检查患者该基因的状态
      const isWild = patientGeneText.includes(gene) && (patientGeneText.includes('野生') || patientGeneText.includes('阴性') || patientGeneText.includes('wt'));
      const isPending = patientGeneText.includes(gene) && (patientGeneText.includes('待检') || patientGeneText.includes('未检'));
      // 检查试验是否要求野生型
      const trialWantsWild = trialText.includes(gene) && (trialText.includes('野生型') || trialText.includes('wild') || trialText.includes('阴性'));
      const trialWantsMutant = trialText.includes(gene) && (trialText.includes('突变') || trialText.includes('阳性') || trialText.includes('mutation') || trialText.includes('activating'));

      if (isPending) {
        geneScore += 5;
        geneDetails.push(`${geneUpper}（待检测）`);
      } else if (isWild && trialWantsWild) {
        geneScore += 20;
        geneDetails.push(`${geneUpper}野生型符合`);
      } else if (!isWild && trialWantsMutant) {
        geneScore += 20;
        geneDetails.push(`${geneUpper}突变阳性符合`);
      } else if (isWild && trialWantsMutant) {
        // 患者野生型但试验要突变：不加分
        geneDetails.push(`${geneUpper}野生型（试验需突变）`);
      } else {
        // 无法区分具体上下文：给中等分
        geneScore += 12;
        geneDetails.push(geneUpper);
      }
    }
    score += Math.min(20, geneScore);
    reasons.push(`基因变异（${geneDetails.join('、')}）`);
  }

  // ---- 分期匹配 ----
  if (record.stage && stageMatches(record.stage, trialText)) {
    score += 6;
    reasons.push('分期信息在试验标准中有对应条件');
  }

  // ---- 治疗线数匹配（P1-2: 方向性评分）----
  const patientLine = getPatientTreatmentLine(record);
  const trialLines = trial.treatment_lines;
  if (patientLine && Array.isArray(trialLines) && trialLines.length > 0) {
    if (trialLines.includes(patientLine)) {
      score += 10;
      reasons.push(`治疗线数（${patientLine}线）精确符合试验要求`);
    } else {
      const maxTrialLine = Math.max(...trialLines);
      if (patientLine <= maxTrialLine) {
        score += 5;
        reasons.push(`治疗线数（${patientLine}线）在试验接受范围内`);
      }
      // 患者线数超过试验最大线数：不加分，也不扣分（可能有个体化方案）
    }
  }

  // ---- PD-L1 阈值匹配（P2-7）----
  const patientPdl1 = getPatientPdl1(record);
  const trialMentionsPdl1 = trialText.includes('pdl1') || trialText.includes('pd-l1');
  if (patientPdl1 && trialMentionsPdl1) {
    // 解析患者 PD-L1 数值（如 "TPS 80%" → 80, "CPS 15" → 15）
    const pdl1NumMatch = patientPdl1.match(/(\d+)/);
    const patientPdl1Num = pdl1NumMatch ? Number(pdl1NumMatch[1]) : null;
    // 解析试验 PD-L1 阈值要求（如 "TPS≥50%"、"CPS≥10"、"PD-L1 ≥1%"）
    const trialPdl1ReqMatch = trialText.match(/pd-?l1[^0-9]*(?:[≥>=]+\s*)(\d+)/i)
      || trialText.match(/(?:tps|cps)[^0-9]*(?:[≥>=]+\s*)(\d+)/i);
    const trialThreshold = trialPdl1ReqMatch ? Number(trialPdl1ReqMatch[1]) : null;

    if (patientPdl1Num != null && trialThreshold != null && patientPdl1Num >= trialThreshold) {
      score += 8;
      reasons.push(`PD-L1表达（${patientPdl1}）达到试验阈值（≥${trialThreshold}%）`);
    } else if (patientPdl1Num != null && trialThreshold != null) {
      score += 2;
      reasons.push(`PD-L1表达（${patientPdl1}）低于试验阈值（≥${trialThreshold}%），可能不符合`);
    } else {
      score += 4;
      reasons.push(`PD-L1表达（${patientPdl1}）与试验免疫治疗方向相关`);
    }
  }

  // ---- ECOG 评分（P1-4: 从试验文本动态解析要求）----
  const ecog = record.structured?.entities?.ecog ?? record.ecog;
  if (ecog != null && Number.isFinite(Number(ecog))) {
    const ecogNum = Number(ecog);
    // 从试验文本提取 ECOG 上限要求（如 "ECOG 0-1"、"ECOG评分≤2"）
    const ecogReqMatch = trialText.match(/ecog[^0-4]*(?:0\s*[-~]\s*|[≤<=]\s*)([0-4])/i)
      || trialText.match(/ecog[^0-4]*([0-4])\s*(?:分|级)/i);
    const trialEcogMax = ecogReqMatch ? Number(ecogReqMatch[1]) : 2; // 默认假设 ≤2
    if (ecogNum <= trialEcogMax) {
      score += 5;
      reasons.push(`ECOG体能评分（${ecogNum}分）符合试验要求（≤${trialEcogMax}）`);
    } else {
      score -= 5;
      reasons.push(`ECOG体能评分（${ecogNum}分）可能超出试验要求（≤${trialEcogMax}），存在排除风险`);
    }
  } else {
    // ECOG 未知时默认视为符合要求（不扣分，给予基础加分）
    score += 5;
    reasons.push('ECOG体能评分默认符合要求');
  }

  // ---- 城市匹配 ----
  const studyCities = trial.study_cities || [];
  const patientCity = record._city; // 由控制器在调用前注入
  if (patientCity && studyCities.length > 0) {
    if (studyCities.some((city) => city.includes(patientCity) || patientCity.includes(city))) {
      score += 3;
      reasons.push(`研究中心覆盖您所在城市`);
    }
  }

  // ---- 试验状态 ----
  if (trial.status === 'recruiting') {
    score += 8;
    reasons.push('试验当前处于招募中');
  }

  // ---- 排除标准负分（P1-8）----
  const exclusionText = safeLower(parseArrayField(trial.exclusion_criteria).join(' '));
  if (exclusionText) {
    const exclusionRisks = [];
    // 检查患者已知条件是否命中排除标准
    const patientText = safeLower([diagnosis, record.gene_mutation, record.treatment, record.stage].filter(Boolean).join(' '));
    const EXCLUSION_KEYWORDS = [
      { pattern: '脑转移', label: '脑转移' },
      { pattern: '软脑膜', label: '软脑膜转移' },
      { pattern: '活动性自身免疫', label: '活动性自身免疫病' },
      { pattern: '器官移植', label: '器官移植史' },
      { pattern: '活动性乙肝', label: '活动性乙型肝炎' },
      { pattern: 'hiv', label: 'HIV感染' },
      { pattern: '间质性肺', label: '间质性肺病' },
      { pattern: '心功能不全', label: '心功能不全' },
    ];
    for (const { pattern, label } of EXCLUSION_KEYWORDS) {
      if (exclusionText.includes(pattern) && patientText.includes(pattern)) {
        exclusionRisks.push(label);
      }
    }
    if (exclusionRisks.length > 0) {
      const penalty = Math.min(15, exclusionRisks.length * 8);
      score -= penalty;
      reasons.push(`排除风险：${exclusionRisks.join('、')}（-${penalty}分）`);
    }
  }

  if (reasons.length === 0) {
    reasons.push('已根据病历基础信息进行规则匹配');
  }

  return {
    score: Math.min(99, Math.max(0, score)),
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

// ---- Hybrid Scoring with Criterion-Level Matching (Phase 1.3/1.4) ----

let _decomposedCriteria = null;

/**
 * Load decomposed criteria (lazy, cached)
 */
const getDecomposedCriteria = () => {
  if (!_decomposedCriteria) {
    try {
      _decomposedCriteria = require('../data/decomposed_criteria.json');
    } catch (e) {
      _decomposedCriteria = {};
    }
  }
  return _decomposedCriteria;
};

/**
 * Hybrid scoring: combines original heuristic with criterion-level matching
 * Uses criterion-level matching when decomposed criteria are available,
 * falls back to the original scoreRecordAgainstTrial when not.
 *
 * @param {Object} record - Patient medical record
 * @param {Object} trial - Trial object
 * @param {Object} [structuredProfile] - Optional pre-built structuredProfile from patientProfile.buildProfile
 * @returns {{ score: number, reasons: string[], excluded: boolean, criterionResults: Object|null }}
 */
const scoreRecordHybrid = (record, trial, structuredProfile = null) => {
  // Always compute the original heuristic score
  const heuristic = scoreRecordAgainstTrial(record, trial);

  // Try criterion-level matching if decomposed criteria exist for this trial
  const decomposed = getDecomposedCriteria();
  const criteria = decomposed[trial.id];

  if (!criteria || criteria.length === 0 || !structuredProfile) {
    // No criterion data or no structured profile — fall back to heuristic only
    return { ...heuristic, criterionResults: null };
  }

  // Lazy-load criterionMatcher to avoid circular deps
  const { evaluateAllCriteria } = require('./criterionMatcher');
  const criterionResults = evaluateAllCriteria(criteria, structuredProfile);
  const cs = criterionResults.summary;

  // If criterion-level evaluation found a hard exclusion, trust it
  if (cs.excluded) {
    return {
      score: 0,
      reasons: heuristic.reasons,
      excluded: true,
      criterionResults
    };
  }

  // Hybrid score: blend heuristic (40%) + criterion match rate (60%)
  const criterionScore = cs.score; // 0-99
  const heuristicScore = heuristic.score;
  const blendedScore = Math.round(heuristicScore * 0.4 + criterionScore * 0.6);
  const finalScore = Math.min(99, Math.max(0, blendedScore));

  // Merge reasons: keep heuristic reasons, prepend criterion summary
  const criterionSummary = `条目级匹配率 ${cs.matchRate}%（${cs.met}项符合，${cs.not_met}项不符，${cs.uncertain}项待确认）`;
  const mergedReasons = [criterionSummary, ...heuristic.reasons];

  return {
    score: finalScore,
    reasons: mergedReasons,
    excluded: heuristic.excluded || false,
    criterionResults
  };
};

module.exports = {
  SCORE_MIN,
  STATUS_TEXT_MAP,
  getDiseaseProfile,
  hasGenericCancerSignal,
  matchDiseaseText,
  normalizeText,
  parseArrayField,
  scoreRecordAgainstTrial,
  scoreRecordHybrid,
  matchRecordsToTrials,
  buildCoarseFilter,
  extractDiseaseKeywords,
  getPatientTreatmentLine,
  getPatientPdl1
};
