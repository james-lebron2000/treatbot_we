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

/**
 * NSCLC / SCLC 消歧义：避免 "小细胞肺癌" 错误匹配到 "非小细胞肺癌"
 */
const isNSCLCText = (norm) => {
  return norm.includes('非小细胞') || norm.includes('nsclc') || norm.includes('肺腺癌') || norm.includes('肺鳞癌') || norm.includes('肺腺鳞癌') || norm.includes('非鳞');
};
const isSCLCText = (norm) => {
  if (isNSCLCText(norm)) return false;
  return norm.includes('小细胞肺癌') || norm.includes('sclc') || norm.includes('小细胞癌');
};

const getDiseaseProfile = (text) => {
  if (!text) {
    return null;
  }
  const textNorm = normalizeText(text);
  const textIsNSCLC = isNSCLCText(textNorm);
  const textIsSCLC = isSCLCText(textNorm);

  let best = null;
  for (const profile of DISEASE_PROFILES) {
    // NSCLC/SCLC 消歧义：跨类不允许作为同一 profile
    if (profile.id === 'lung_sclc' && textIsNSCLC) continue;
    if (profile.id === 'lung_nsclc' && textIsSCLC) continue;
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

  // NSCLC/SCLC 消歧义：两者虽同为肺癌但临床处理完全不同，禁止互相匹配
  const queryIsNSCLC = isNSCLCText(normalizedQuery);
  const queryIsSCLC = isSCLCText(normalizedQuery);
  const targetIsNSCLC = isNSCLCText(normalizedTarget);
  const targetIsSCLC = isSCLCText(normalizedTarget);
  const lungCrossMismatch = (queryIsNSCLC && targetIsSCLC) || (queryIsSCLC && targetIsNSCLC);

  if (lungCrossMismatch) {
    return {
      matched: false,
      specific: false,
      generic: false,
      queryProfile,
      targetProfile
    };
  }

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

/**
 * 用于硬过滤的免疫治疗类通用关键词（患者文本 -> 是否使用过免疫治疗）
 */
const IMMUNOTHERAPY_DRUG_KEYWORDS = [
  'pd1', 'pdl1', 'pd-1', 'pd-l1',
  '帕博利珠', 'pembrolizumab', 'keytruda',
  '纳武利尤', 'nivolumab', 'opdivo',
  '阿替利珠', 'atezolizumab', 'tecentriq',
  '度伐利尤', 'durvalumab',
  '信迪利', 'sintilimab', '达伯舒',
  '替雷利珠', 'tislelizumab', '百泽安',
  '卡瑞利珠', 'camrelizumab',
  '特瑞普利', 'toripalimab',
  '舒格利', 'sugemalimab',
  '派安普利', 'penpulimab',
  '赛帕利', 'zimberelimab',
  '伊匹木', 'ipilimumab',
  '免疫检查点', '免疫治疗', '免疫单抗', '免疫联合'
];

/**
 * 按癌种允许列表判断患者是否被硬性排除
 * 返回 { excluded: bool, reason: string }
 */
const checkAllowedCancerTypes = (diagnosisText, allowedList, record = null) => {
  const diagNorm = normalizeText(diagnosisText);
  const diagIsNSCLC = isNSCLCText(diagNorm);
  const diagIsSCLC = isSCLCText(diagNorm);

  // 分类 allowed 列表：具体癌种 vs 泛实体瘤/catch-all
  const specific = [];
  const generic = [];
  for (const t of allowedList) {
    const cleaned = safeText(t);
    if (!cleaned) continue;
    const isGeneric = /^(其他|泛|所有|全部)/.test(cleaned) ||
      /^(晚期)?(实体瘤|实体性肿瘤|恶性肿瘤|肿瘤)$/.test(cleaned.replace(/[（(].*?[）)]/g, ''));
    if (isGeneric) generic.push(cleaned);
    else specific.push(cleaned);
  }

  // 检查具体癌种是否匹配（跳过 NSCLC/SCLC 跨匹配）
  for (const cancerType of specific) {
    const typeNorm = normalizeText(cancerType);
    const typeIsNSCLC = isNSCLCText(typeNorm);
    const typeIsSCLC = isSCLCText(typeNorm);
    if ((diagIsNSCLC && typeIsSCLC) || (diagIsSCLC && typeIsNSCLC)) continue;

    // 分子亚型限定：HER2阳性 / 三阴性 / ER/PR 等
    const typeRequiresHer2Pos = /HER2\s*阳性|HER2\s*positive|HER2\+/i.test(cancerType);
    const typeRequiresHer2Neg = /HER2\s*阴性|HER2\s*negative|HER2-/i.test(cancerType);
    const typeRequiresTNBC = /三阴|TNBC/i.test(cancerType);

    // 直接子串匹配
    if (diagNorm.includes(typeNorm) || typeNorm.includes(diagNorm)) {
      return { excluded: false };
    }
    // 通过疾病 profile 匹配
    const dm = matchDiseaseText(diagnosisText, cancerType);
    if (dm.matched && dm.specific) {
      // 如果允许癌种限定了分子亚型，需进一步检查一致性
      if (typeRequiresHer2Pos || typeRequiresHer2Neg || typeRequiresTNBC) {
        // 继续检查下一个类型；若没有其它匹配再综合判断
        continue;
      }
      return { excluded: false };
    }
  }

  // 二次检查：若所有具体类型都要求特定分子亚型而患者不符，则触发排除
  const hasMolecularConstraint = specific.some((t) => /HER2\s*阳性|HER2\s*阴性|三阴|TNBC|HER2\+|HER2-/i.test(t));
  if (hasMolecularConstraint) {
    const patientGeneText = safeLower(safeText(record?.gene_mutation || ''));
    const patientHer2Positive = /her2\s*[(]?\s*(阳性|positive|突变|扩增|\+|ihc\s*3|ish\s*阳性|fish\s*阳性|fish\+|ish\+)/i.test(patientGeneText);
    const patientHer2Negative = /her2\s*[(]?\s*(阴性|negative|野生|wildtype|wild-type|-)/i.test(patientGeneText);
    const patientIsTNBC = /三阴/.test(diagNorm);
    // 检查是否有至少一个分子亚型匹配
    let anyMolecularMatch = false;
    for (const cancerType of specific) {
      const typeNorm = normalizeText(cancerType);
      if (!(diagNorm.includes(typeNorm) || typeNorm.includes(diagNorm))) {
        const dm = matchDiseaseText(diagnosisText, cancerType);
        if (!(dm.matched && dm.specific)) continue;
      }
      const needHer2Pos = /HER2\s*阳性|HER2\s*positive|HER2\+/i.test(cancerType);
      const needHer2Neg = /HER2\s*阴性|HER2\s*negative|HER2-/i.test(cancerType);
      const needTNBC = /三阴|TNBC/i.test(cancerType);
      if (needHer2Pos && patientHer2Positive && !patientIsTNBC) { anyMolecularMatch = true; break; }
      if (needHer2Neg && (patientHer2Negative || patientIsTNBC)) { anyMolecularMatch = true; break; }
      if (needTNBC && patientIsTNBC) { anyMolecularMatch = true; break; }
      if (!needHer2Pos && !needHer2Neg && !needTNBC) { anyMolecularMatch = true; break; }
    }
    if (anyMolecularMatch) {
      return { excluded: false };
    }
    if (!anyMolecularMatch && (patientHer2Positive || patientHer2Negative || patientIsTNBC)) {
      return {
        excluded: true,
        reason: `试验仅接收${specific.filter((t) => /HER2|三阴|TNBC/i.test(t)).join('、')}，患者分子亚型不符`
      };
    }
  }

  // 检查泛癌种 catch-all：处理"除外"子句
  for (const g of generic) {
    const exclMatch = g.match(/[（(]除外(.+?)[）)]/);
    if (exclMatch) {
      const excludedTypes = exclMatch[1].split(/[、,，]/);
      for (const et of excludedTypes) {
        const etNorm = normalizeText(et);
        if (!etNorm) continue;
        const etIsNSCLC = isNSCLCText(etNorm);
        const etIsSCLC = isSCLCText(etNorm);
        if ((diagIsNSCLC && etIsSCLC) || (diagIsSCLC && etIsNSCLC)) continue;
        if (diagNorm.includes(etNorm) || etNorm.includes(diagNorm)) {
          return { excluded: true, reason: `试验明确除外"${et}"，患者诊断"${diagnosisText}"属排除范围` };
        }
      }
    }
    // 泛实体瘤 catch-all 默认允许（交给评分环节）
    if (hasGenericCancerSignal(diagnosisText) || specific.length === 0) {
      return { excluded: false };
    }
  }

  // 无泛类 catch-all 且所有具体癌种都不匹配 → 硬排除
  if (generic.length === 0) {
    return {
      excluded: true,
      reason: `患者诊断"${diagnosisText}"不在试验允许癌种列表中（${allowedList.slice(0, 3).join('、')}${allowedList.length > 3 ? '等' : ''}）`
    };
  }
  return { excluded: false };
};

// NSCLC 常见驱动基因，彼此通常互斥（临床上极少共存）
const NSCLC_DRIVER_GENES = ['egfr', 'alk', 'ros1', 'her2', 'erbb2', 'kras', 'braf', 'ret', 'met', 'ntrk', 'fgfr'];

/**
 * 检查试验必需基因是否被患者已知野生/阴性状态否决
 * @param {string[]} requiredGenes - 试验要求的基因列表
 * @param {string} patientGeneText - 患者基因检测文本
 * @param {string} [diagnosisText] - 患者诊断，用于 NSCLC 驱动基因互斥判断
 */
const checkRequiredGenes = (requiredGenes, patientGeneText, diagnosisText = '') => {
  if (!patientGeneText) {
    // 患者无基因信息 → 不做硬排除（交由评分/人工审核）
    return { excluded: false };
  }
  const patientLower = safeLower(patientGeneText);
  const patientNorm = normalizeText(patientGeneText);

  const GENE_NAME_REGEX = /(EGFR|ALK|ROS1|KRAS|NRAS|BRAF|HER2|ERBB2|MET|RET|NTRK[123]?|FGFR[123]?|PIK3CA|PTEN|TP53|CLDN18\.?2|CLDN18|ROR1|MSI-?H?|TMB|MMR|BRCA[12]?)/i;

  for (const req of requiredGenes) {
    const reqStr = safeText(req);
    if (!reqStr) continue;
    const reqLower = reqStr.toLowerCase();
    const match = reqStr.match(GENE_NAME_REGEX);
    if (!match) continue;
    const geneName = match[1].toLowerCase().replace(/\./g, '');
    const geneNameNormalized = geneName.replace(/-/g, '');

    // 要求基因为突变/阳性/表达/融合
    const wantsMutant = /突变|阳性|mutation|activating|融合|表达|\+|positive/i.test(reqStr);
    // 要求基因为野生型/阴性
    const wantsWild = /野生|阴性|wildtype|wild-type|negative/i.test(reqStr);

    // 患者文本中是否识别到该基因
    const patientNormNoSpace = patientNorm.replace(/[\-\s]/g, '');
    const patientHasGene = patientNormNoSpace.includes(geneNameNormalized);
    if (!patientHasGene) {
      // 患者未明确检测该基因 → 不确定，不做硬排除
      continue;
    }

    // 提取患者该基因的状态描述（在基因名附近 30 字符内）
    const re = new RegExp(`${geneName.replace(/[-]/g, '[-]?')}[^,，；;。]{0,30}`, 'i');
    const contextMatch = patientLower.match(re);
    const context = contextMatch ? contextMatch[0] : patientLower;

    const patientWild = /野生|阴性|wildtype|wild-type|negative|未检出|未见/.test(context);
    const patientMutant = /突变|阳性|融合|扩增|高表达|positive|mutation|mutant|\+/.test(context);

    if (wantsMutant && patientWild && !patientMutant) {
      return {
        excluded: true,
        reason: `试验要求「${reqStr}」，患者 ${match[1].toUpperCase()} 为野生型/阴性`
      };
    }
    if (wantsWild && patientMutant && !patientWild) {
      return {
        excluded: true,
        reason: `试验要求「${reqStr}」，患者 ${match[1].toUpperCase()} 为突变/阳性`
      };
    }
  }

  // NSCLC 驱动基因互斥：若患者为 NSCLC 且已有明确的阳性驱动突变（如 ALK+），
  // 而试验要求的是另一个驱动基因的突变/阳性，则硬排除
  const diagNormLung = normalizeText(diagnosisText);
  const isNSCLCPatient = isNSCLCText(diagNormLung);
  if (isNSCLCPatient) {
    // 患者已确认阳性的驱动基因
    const confirmedPositiveDrivers = [];
    for (const driver of NSCLC_DRIVER_GENES) {
      const re = new RegExp(`${driver}[^,，；;。]{0,20}(阳性|突变|融合|扩增|positive|\\+|mutation|mutant)`, 'i');
      if (re.test(patientLower) && !new RegExp(`${driver}[^,，；;。]{0,10}(阴性|野生|wildtype|wild-type|negative)`, 'i').test(patientLower)) {
        confirmedPositiveDrivers.push(driver);
      }
    }
    if (confirmedPositiveDrivers.length > 0) {
      // 要求基因也是 NSCLC 驱动基因？
      for (const req of requiredGenes) {
        const reqStr = safeText(req);
        const reqWantsMutant = /突变|阳性|mutation|activating|融合|表达|\+|positive/i.test(reqStr);
        if (!reqWantsMutant) continue;
        const match = reqStr.match(GENE_NAME_REGEX);
        if (!match) continue;
        const reqGeneLower = match[1].toLowerCase().replace(/\./g, '').replace(/-/g, '');
        const reqGeneNormalized = reqGeneLower.replace(/\d.*/, ''); // e.g. erbb2 stays, ntrk1 -> ntrk
        // 如果试验要求的基因是 NSCLC 驱动之一，且患者已有不同驱动阳性，则排除
        const reqIsDriver = NSCLC_DRIVER_GENES.some((d) => reqGeneLower.startsWith(d) || reqGeneNormalized.startsWith(d));
        if (reqIsDriver) {
          const sameAsPatient = confirmedPositiveDrivers.some((d) => reqGeneLower.startsWith(d));
          if (!sameAsPatient) {
            return {
              excluded: true,
              reason: `试验要求「${reqStr}」，但患者已确认 ${confirmedPositiveDrivers.map((d) => d.toUpperCase()).join('/')} 驱动突变，NSCLC 驱动基因通常互斥`
            };
          }
        }
      }
    }
  }

  // 进一步：若试验所有必需基因均需阳性，且患者无任何这些基因的阳性记录，则排除
  const allPositiveRequired = requiredGenes.every((r) => /突变|阳性|mutation|activating|融合|表达|\+|positive/i.test(r));
  if (allPositiveRequired) {
    // 试验要求的基因名集合
    const geneNamesRequired = requiredGenes
      .map((r) => r.match(GENE_NAME_REGEX))
      .filter(Boolean)
      .map((m) => m[1].toLowerCase().replace(/\./g, '').replace(/-/g, ''));
    if (geneNamesRequired.length > 0) {
      const patientNormNoSpace = patientNorm.replace(/[\-\s]/g, '');
      const anyGeneMentioned = geneNamesRequired.some((g) => patientNormNoSpace.includes(g));
      // 仅当患者明确列出这些基因、且全部标注为阴性/野生时排除
      if (anyGeneMentioned) {
        const allMentionedWild = geneNamesRequired.every((g) => {
          if (!patientNormNoSpace.includes(g)) return false;
          const re = new RegExp(`${g.replace(/[-]/g, '[-]?')}[^,，；;。]{0,30}`, 'i');
          const m = patientLower.match(re);
          const ctx = m ? m[0] : '';
          return /野生|阴性|wildtype|wild-type|negative|未检出/.test(ctx) &&
            !/突变|阳性|融合|扩增|positive|mutation|mutant|\+/.test(ctx);
        });
        if (allMentionedWild) {
          return {
            excluded: true,
            reason: `试验要求${requiredGenes.map((r) => `「${r}」`).join('、')}，患者相关基因均为野生/阴性`
          };
        }
      }
    }
  }

  return { excluded: false };
};

/**
 * 检查排除性既往治疗：扩展免疫治疗药名模糊匹配
 */
const checkExcludedPriorTherapies = (excludedList, patientTreatment) => {
  const patientRaw = safeText(patientTreatment);
  if (!patientRaw) return { excluded: false };
  const patientTx = normalizeText(patientRaw);
  const patientLower = patientRaw.toLowerCase();

  for (const therapy of excludedList) {
    const normTherapy = normalizeText(therapy);
    if (!normTherapy) continue;
    if (normTherapy.length > 20) continue;
    if (/\d+[周月天日]内/.test(therapy)) continue;
    if (/全身(性)?(抗肿瘤|系统)?治疗|系统(性)?(抗肿瘤)?治疗|系统性抗癌|全身化疗/.test(therapy) && !/靶向|抑制剂|单抗|抗体/.test(therapy)) continue;

    // 直接子串匹配
    if (patientTx.includes(normTherapy)) {
      return { excluded: true, reason: `患者既往治疗包含「${therapy}」，被该试验排除` };
    }
    // 免疫治疗类：仅当试验条款为"免疫治疗 / 免疫检查点抑制剂 / 免疫细胞治疗"等整类描述时才做药名展开
    // 对 "X联合Y" 等具体联合方案不做展开，避免误排除仅接受过单药免疫治疗的患者
    const isClassLevelImmuno = /^(免疫治疗|免疫检查点抑制剂|免疫细胞治疗|抗pd-?1|抗pd-?l1|pd-?1\s*(?:单抗|抑制剂)?|pd-?l1\s*(?:单抗|抑制剂)?)$/i.test(safeText(therapy).trim());
    if (isClassLevelImmuno) {
      const hit = IMMUNOTHERAPY_DRUG_KEYWORDS.some((kw) => patientLower.includes(kw.toLowerCase()));
      if (hit) {
        return { excluded: true, reason: `患者既往治疗包含免疫治疗药物，被该试验「${therapy}」排除` };
      }
    }
  }
  return { excluded: false };
};

/**
 * 从 other_key_criteria 中识别"除外/暂不接收"等硬排除描述
 */
const checkOtherKeyExclusions = (keyCriteria, diagnosisText, record) => {
  const diagNorm = normalizeText(diagnosisText);
  const geneNorm = normalizeText(safeText(record.gene_mutation || ''));
  for (const raw of keyCriteria) {
    const text = safeText(raw);
    if (!text) continue;
    // "暂不接收 XX" / "暂不纳入 XX" / "不接受 XX"
    const banMatch = text.match(/(?:暂不接收|暂不纳入|不接受|不纳入|不入组)([^。；;，,]+)/);
    if (banMatch) {
      const banned = banMatch[1];
      const bannedNorm = normalizeText(banned);
      if (!bannedNorm) continue;
      // NSCLC/SCLC 消歧义：避免 "小细胞肺癌" 子串匹配到 "非小细胞肺癌"
      const bannedIsSCLC = isSCLCText(bannedNorm);
      const bannedIsNSCLC = isNSCLCText(bannedNorm);
      const patientIsSCLC = isSCLCText(diagNorm);
      const patientIsNSCLC = isNSCLCText(diagNorm);
      if (bannedIsSCLC && patientIsNSCLC) continue;
      if (bannedIsNSCLC && patientIsSCLC) continue;

      if (bannedIsSCLC && patientIsSCLC) {
        return { excluded: true, reason: `试验明确"${text}"，患者诊断为小细胞肺癌` };
      }
      if (bannedIsNSCLC && patientIsNSCLC) {
        return { excluded: true, reason: `试验明确"${text}"，患者诊断为非小细胞肺癌` };
      }
      // 非肺癌语境下继续做子串匹配
      if (!bannedIsSCLC && !bannedIsNSCLC && !patientIsSCLC && !patientIsNSCLC) {
        if (diagNorm.includes(bannedNorm) || bannedNorm.includes(diagNorm)) {
          return { excluded: true, reason: `试验条款"${text}"明确排除患者"${diagnosisText}"` };
        }
      }
    }
    // 明确要求 HER2 阴性 / 阳性 —— 使用精确紧邻匹配，避免跨基因窜号
    const geneRaw = safeLower(record.gene_mutation || '');
    const patientHer2Positive = /her2\s*[(]?\s*(阳性|positive|突变|扩增|\+|ihc\s*3|ish\s*阳性|fish\s*阳性|fish\+|ish\+)/i.test(geneRaw);
    const patientHer2Negative = /her2\s*[(]?\s*(阴性|negative|野生|wildtype|wild-type|-)/i.test(geneRaw);
    // 试验条款是完整短语"HER2阴性/阳性"时，且患者状态明确相反
    if (/^\s*HER2\s*阴性\s*$/i.test(text.trim()) && patientHer2Positive && !patientHer2Negative) {
      return { excluded: true, reason: `试验要求 HER2 阴性，患者为 HER2 阳性` };
    }
    if (/^\s*HER2\s*阳性\s*$/i.test(text.trim()) && patientHer2Negative && !patientHer2Positive) {
      return { excluded: true, reason: `试验要求 HER2 阳性，患者为 HER2 阴性` };
    }
    // 三阴性乳腺癌 vs HER2 阳性乳腺癌（常见不兼容）
    if (/HER2\s*阳性/i.test(text) && /三阴/.test(diagNorm)) {
      return { excluded: true, reason: `试验要求 HER2 阳性乳腺癌，患者为三阴性乳腺癌（HER2 阴性）` };
    }
    // 非 MSI-H/dMMR 要求
    if (/非\s*MSI-?H|非\s*dMMR|排除\s*MSI-?H|排除\s*dMMR|MSS\s*要求/i.test(text)) {
      if (/msi-?h|dmmr/i.test(geneNorm) && !/mss|pmmr|稳定/i.test(geneNorm)) {
        return { excluded: true, reason: `试验要求非 MSI-H/dMMR（"${text}"），患者为 MSI-H/dMMR` };
      }
    }
  }
  return { excluded: false };
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

    // ---- 癌种硬过滤：allowed_cancer_types 列明、患者诊断明确不在列表中时排除 ----
    const allowed = Array.isArray(si.allowed_cancer_types) ? si.allowed_cancer_types : [];
    const diagnosisForHard = safeText(record.diagnosis);
    if (allowed.length > 0 && diagnosisForHard) {
      const cancerVerdict = checkAllowedCancerTypes(diagnosisForHard, allowed, record);
      if (cancerVerdict.excluded) {
        return {
          score: 0,
          reasons: [cancerVerdict.reason],
          excluded: true
        };
      }
    }

    // ---- 必需基因硬过滤：若试验明确要求某基因突变而患者已知野生/阴性，则排除 ----
    if (Array.isArray(si.required_genes) && si.required_genes.length > 0) {
      const geneVerdict = checkRequiredGenes(si.required_genes, record.gene_mutation || '', safeText(record.diagnosis));
      if (geneVerdict.excluded) {
        return {
          score: 0,
          reasons: [geneVerdict.reason],
          excluded: true
        };
      }
    }

    // ---- 既往线数硬过滤：患者既往治疗线数超过试验上限 ----
    const patientLineHard = getPatientTreatmentLine(record);
    if (patientLineHard != null && si.prior_lines_max != null) {
      const priorLines = patientLineHard - 1; // treatment_line = 需要进行的下一线；既往线数 = line - 1
      if (priorLines > si.prior_lines_max) {
        return {
          score: 0,
          reasons: [`既往治疗线数（${priorLines}线）超过试验上限（≤${si.prior_lines_max}线）`],
          excluded: true
        };
      }
    }
    if (patientLineHard != null && si.prior_lines_min != null) {
      const priorLines = patientLineHard - 1;
      if (priorLines < si.prior_lines_min) {
        return {
          score: 0,
          reasons: [`既往治疗线数（${priorLines}线）不足试验要求（≥${si.prior_lines_min}线）`],
          excluded: true
        };
      }
    }

    // A9: 先验疗法硬排除 —— 若患者既往用过被试验排除的疗法，直接排除
    // 仅匹配具体疗法/靶点名称，跳过过于笼统或带时间限定的描述
    if (Array.isArray(si.excluded_prior_therapies) && si.excluded_prior_therapies.length > 0) {
      const patientTx = normalizeText(record.treatment || '');
      if (patientTx) {
        const therapyVerdict = checkExcludedPriorTherapies(si.excluded_prior_therapies, record.treatment || '');
        if (therapyVerdict.excluded) {
          return {
            score: 0,
            reasons: [therapyVerdict.reason],
            excluded: true
          };
        }
      }
    }

    // ---- other_key_criteria 中的"除外/暂不接收"式硬排除 ----
    if (Array.isArray(si.other_key_criteria) && si.other_key_criteria.length > 0 && diagnosisForHard) {
      const keyVerdict = checkOtherKeyExclusions(si.other_key_criteria, diagnosisForHard, record);
      if (keyVerdict.excluded) {
        return {
          score: 0,
          reasons: [keyVerdict.reason],
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
