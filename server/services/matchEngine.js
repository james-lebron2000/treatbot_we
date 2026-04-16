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
  'egfr', 'alk', 'ros1', 'kras', 'nras', 'braf', 'her2', 'erbb2',
  'met', 'ret', 'ntrk', 'ntrk1', 'ntrk2', 'ntrk3',
  'fgfr', 'fgfr1', 'fgfr2', 'fgfr3',
  'pik3ca', 'pten', 'tp53',
  'pdl1', 'pd-l1',
  'tmb', 'msih', 'msi-h', 'mmr', 'dmmr',
  'cldn18', 'ror1', 'brca1', 'brca2', 'atm', 'palb2'
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

// 语义排斥对：若 alias 属于左列，target 包含右列任一词，则拒绝匹配
// 用于避免 "小细胞肺癌" 被 "非小细胞肺癌" 误吞
const ALIAS_EXCLUSION_PAIRS = [
  { when: ['小细胞肺癌', 'sclc', 'smallcelllungcancer', '小细胞癌'], excludeIfTextContains: ['非小细胞肺癌', 'nsclc', '肺腺癌', '肺鳞癌'] },
  { when: ['非小细胞肺癌', 'nsclc', '肺腺癌', '肺鳞癌'], excludeIfTextContains: [] } // NSCLC 本身不含 SCLC 子串冲突
];

const aliasConflictsWithText = (alias, text) => {
  const aliasNorm = normalizeText(alias);
  const textNorm = normalizeText(text);
  for (const pair of ALIAS_EXCLUSION_PAIRS) {
    const whenSet = pair.when.map(normalizeText);
    if (!whenSet.includes(aliasNorm)) continue;
    if (pair.excludeIfTextContains.some((bad) => textNorm.includes(normalizeText(bad)))) {
      return true;
    }
  }
  return false;
};

const containsAlias = (text, aliases = []) => {
  const normalizedText = normalizeText(text);
  if (!normalizedText) {
    return false;
  }
  return aliases.some((alias) => {
    const normalizedAlias = normalizeText(alias);
    if (!normalizedAlias) return false;
    // 检查语义排斥：若 alias 是 "小细胞肺癌" 而 text 包含 "非小细胞肺癌"，视为不匹配
    if (aliasConflictsWithText(alias, text)) return false;
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

// ---------------------------------------------------------------------------
// Hard-filter helpers (P1: 准确率优先) — 将 structured_inclusion 里的显式约束
// 转化为硬排除，避免把明显不符合的试验高分推荐给患者
// ---------------------------------------------------------------------------

/**
 * 治疗类→关键词映射，用于 excluded_prior_therapies 的类别级匹配。
 * 例如试验排除 "免疫治疗"，患者用过 "帕博利珠单抗" → 触发排除。
 */
const THERAPY_CLASS_KEYWORDS = {
  '免疫治疗': ['pd1', 'pdl1', 'pd-1', 'pd-l1', 'pembrolizumab', 'nivolumab', 'atezolizumab', 'durvalumab', 'sintilimab', 'tislelizumab', 'camrelizumab', 'toripalimab', '帕博利珠', '纳武利尤', '阿替利珠', '度伐利尤', '信迪利', '替雷利珠', '卡瑞利珠', '特瑞普利', '免疫', '单抗', '检查点'],
  '免疫检查点抑制剂': ['pd1', 'pdl1', 'pd-1', 'pd-l1', 'pembrolizumab', 'nivolumab', 'atezolizumab', 'durvalumab', 'sintilimab', 'tislelizumab', 'camrelizumab', 'toripalimab', '帕博利珠', '纳武利尤', '阿替利珠', '度伐利尤', '信迪利', '替雷利珠', '卡瑞利珠', '特瑞普利', '检查点抑制', 'ipilimumab', '伊匹木'],
  '铂类化疗': ['铂', 'cisplatin', 'carboplatin', 'oxaliplatin', '顺铂', '卡铂', '奥沙利铂', 'folfox', 'xelox', 'capeox', 'folfirinox'],
  '蒽环类': ['阿霉素', '多柔比星', 'doxorubicin', 'epirubicin', '表柔比星', '蒽环'],
  '抗her2': ['曲妥珠', 'trastuzumab', '赫赛汀', '帕妥珠', 'pertuzumab', 't-dm1', 't-dxd', 'lapatinib', '拉帕替尼', '吡咯替尼', 'pyrotinib', '伊尼妥', 'tucatinib', '图卡替尼'],
  'her2靶向': ['曲妥珠', 'trastuzumab', '赫赛汀', '帕妥珠', 'pertuzumab', 't-dm1', 't-dxd', 'lapatinib', '拉帕替尼', '吡咯替尼', 'pyrotinib', '伊尼妥', 'tucatinib', '图卡替尼'],
  'her2tki': ['lapatinib', '拉帕替尼', '吡咯替尼', 'pyrotinib', 'tucatinib', '图卡替尼', 'neratinib', '奈拉替尼'],
  '靶向治疗': ['替尼', 'tinib', '替布', '替西', '单抗', 'mab', '拉帕', '吡咯', '奥希', '吉非', '厄洛', '阿法', 'lapatinib', 'pyrotinib', 'gefitinib', 'erlotinib', 'osimertinib', 'afatinib', 'alectinib', 'crizotinib', 'ceritinib', 'lorlatinib', 'selpercatinib', 'pralsetinib', 'entrectinib', 'larotrectinib', 'sorafenib', '索拉非尼', '仑伐替尼', 'lenvatinib', 'regorafenib', '瑞戈非尼', 'cabozantinib', '卡博替尼', 'apatinib', '阿帕替尼', 'anlotinib', '安罗替尼', 'sunitinib', '舒尼替尼', 'bevacizumab', '贝伐珠', 'cetuximab', '西妥昔', 'panitumumab', '帕尼单抗'],
  '化疗': ['化疗', 'chemotherapy', '培美', '紫杉', '多西他赛', '吉西他滨', 'gemcitabine', '依托泊苷', 'etoposide', '伊立替康', 'irinotecan', '卡培他滨', 'capecitabine', 'folfox', 'folfiri', 'folfirinox', '顺铂', '卡铂', '奥沙利铂', '阿霉素', '多柔比星', '5-fu', '氟尿嘧啶']
};

const resolveTherapyKeywords = (therapyName) => {
  const norm = normalizeText(therapyName);
  if (!norm) return [];
  const out = new Set([norm]);
  for (const [className, kws] of Object.entries(THERAPY_CLASS_KEYWORDS)) {
    if (norm.includes(normalizeText(className))) {
      for (const kw of kws) out.add(normalizeText(kw));
    }
  }
  return [...out].filter(Boolean);
};

/**
 * 判断试验是否被限定为特定乳腺癌亚型（HER2+ / TNBC / HR+）且与患者冲突
 * 返回冲突原因字符串，或 null 表示无冲突
 */
const breastSubtypeConflict = (patientText, trialSignals) => {
  const patientTNBC = /三阴|tnbc|triplenegative/.test(patientText);
  const patientHER2pos = /her2阳性|her2positive|her23\+|her2ihc3|her2\+|erbb2阳性/.test(patientText);
  const patientHER2neg = /her2阴性|her2negative|her2-/.test(patientText) && !patientHER2pos;

  const trialHER2pos = /her2阳性|her2positive|her23\+/.test(trialSignals);
  const trialHER2neg = /her2阴性|her2negative|her2低表达|her2-low/.test(trialSignals);
  const trialTNBC = /三阴|tnbc|triplenegative/.test(trialSignals);

  if (trialHER2pos && (patientTNBC || patientHER2neg)) return '试验需 HER2 阳性乳腺癌，患者为三阴/HER2 阴性亚型';
  if (trialTNBC && patientHER2pos) return '试验限定三阴性乳腺癌，患者为 HER2 阳性';
  if (trialHER2neg && patientHER2pos) return '试验限定 HER2 阴性，患者为 HER2 阳性';
  return null;
};

/**
 * 判断试验是否限定 MSI 状态（非 MSI-H / MSS）且与患者 MSI-H 冲突
 */
const msiStatusConflict = (patientText, trialSignals) => {
  const patientMSIH = /msi-?h|msih|dmmr/.test(patientText) && !/msi稳定|mss/.test(patientText);
  const requireNonMSIH = /非msi-?h|非dmmr|pmmr|msi稳定|mss/.test(trialSignals);
  if (patientMSIH && requireNonMSIH) return '试验限定非 MSI-H/dMMR，患者 MSI-H/dMMR';
  return null;
};

/**
 * 判断试验 allowed_cancer_types 中是否存在 SCLC/NSCLC/乳腺亚型/肠道亚型硬冲突
 */
const cancerTypeHardConflict = (patientDiagnosis, allowedTypes) => {
  if (!allowedTypes || allowedTypes.length === 0) return null;
  const diagNorm = normalizeText(patientDiagnosis);
  const diagIsNSCLC = /非小细胞|nsclc|肺腺癌|肺鳞癌|肺腺鳞/.test(diagNorm);
  const diagIsSCLC = !diagIsNSCLC && /小细胞肺癌|sclc|小细胞癌/.test(diagNorm);

  // 检测试验是否仅允许 SCLC 或仅允许 NSCLC
  let allowsNSCLC = false;
  let allowsSCLC = false;
  let hasPanTumorBasket = false;
  let exclusionInBasket = null;

  for (const t of allowedTypes) {
    const n = normalizeText(t);
    if (/非小细胞|nsclc|肺腺癌|肺鳞癌/.test(n)) allowsNSCLC = true;
    if (!/(非小细胞|nsclc|肺腺癌|肺鳞癌)/.test(n) && /小细胞肺癌|sclc|小细胞癌/.test(n)) allowsSCLC = true;
    if (/^(其他|泛|所有|全部)/.test(t) || /实体瘤|恶性肿瘤|肿瘤$/.test(t.replace(/[（(].*?[）)]/, ''))) {
      hasPanTumorBasket = true;
      const exclMatch = t.match(/[（(]除外(.+?)[）)]/);
      if (exclMatch) exclusionInBasket = exclMatch[1];
    }
  }

  // SCLC / NSCLC 硬冲突
  if (diagIsNSCLC && allowsSCLC && !allowsNSCLC && !hasPanTumorBasket) {
    return '试验仅接收小细胞肺癌（SCLC），患者为非小细胞肺癌（NSCLC）';
  }
  if (diagIsSCLC && allowsNSCLC && !allowsSCLC && !hasPanTumorBasket) {
    return '试验仅接收非小细胞肺癌（NSCLC），患者为小细胞肺癌（SCLC）';
  }
  // Basket 试验中的除外项（如 "除外小细胞肺癌"）
  if (diagIsSCLC && exclusionInBasket && /小细胞|sclc/.test(normalizeText(exclusionInBasket))) {
    return `试验 basket 明确除外小细胞肺癌`;
  }
  return null;
};

/**
 * 从患者基因描述中解析基因→状态映射。
 * 例如 "EGFR L858R突变阳性, KRAS野生型, MSI-H" →
 *   { egfr: 'mutant', kras: 'wild', msi: 'high' }
 */
const parsePatientGeneStatus = (geneText) => {
  if (!geneText) return {};
  const text = safeLower(geneText);
  const status = {};
  // 按片段切分
  const segments = text.split(/[,，;；\n]+/);
  for (const seg of segments) {
    const segNorm = seg.replace(/[\s]/g, '');
    for (const gene of KNOWN_GENES) {
      const gNorm = gene.replace(/[-_]/g, '');
      if (!segNorm.replace(/[-_]/g, '').includes(gNorm)) continue;
      let verdict = null;
      if (/野生型|wildtype|wt(?![a-z])|阴性/.test(segNorm)) verdict = 'wild';
      else if (/突变|阳性|融合|扩增|positive|mutation|activating|表达/.test(segNorm)) verdict = 'mutant';
      else verdict = 'detected';
      // 特殊：MSI-H / MSS
      if (gene === 'msih' || gene === 'msi-h') {
        if (/mss|稳定/.test(segNorm)) verdict = 'mss';
        else verdict = 'high';
      }
      status[gene] = verdict;
    }
  }
  // 同义：HER2 ↔ ERBB2
  if (status.her2 && !status.erbb2) status.erbb2 = status.her2;
  if (status.erbb2 && !status.her2) status.her2 = status.erbb2;
  return status;
};

/**
 * 从试验 required_genes 条目中解析出 { geneName, requireMutant, requireWild }
 */
const parseRequiredGene = (requirement) => {
  const text = safeLower(requirement);
  const nameMatch = text.match(/(egfr|alk|ros1|kras|braf|her2|erbb2|met|ret|ntrk|fgfr\d?|pik3ca|pten|tp53|cldn18|ror1|msi|tmb|mmr)/i);
  if (!nameMatch) return null;
  const name = nameMatch[1].replace(/-/g, '');
  const requireMutant = /突变|阳性|融合|扩增|positive|mutation|activating|表达|激活|amplification/.test(text);
  const requireWild = /野生|wildtype|wt(?![a-z])|阴性/.test(text) && !requireMutant;
  return { name, requireMutant, requireWild };
};

/**
 * 应用 structured_inclusion 的完整硬过滤。
 * 返回 { excluded: false } 或 { excluded: true, reason: string }
 */
const applyStructuredInclusionHardFilter = (record, si) => {
  if (!si || typeof si !== 'object') return { excluded: false };

  // ---- 年龄 ----
  const patientAge = getPatientAge(record);
  if (patientAge != null) {
    if (si.age_min != null && patientAge < si.age_min) {
      return { excluded: true, reason: `年龄（${patientAge}岁）低于试验最低要求（${si.age_min}岁）` };
    }
    if (si.age_max != null && patientAge > si.age_max) {
      return { excluded: true, reason: `年龄（${patientAge}岁）超过试验年龄上限（${si.age_max}岁）` };
    }
  }

  // ---- ECOG ----
  const ecog = record.structured?.entities?.ecog ?? record.ecog;
  if (ecog != null && si.ecog_max != null && Number(ecog) > si.ecog_max) {
    return { excluded: true, reason: `ECOG评分（${ecog}）超过试验要求（≤${si.ecog_max}）` };
  }

  // ---- 治疗线数上限（prior_lines_max）----
  // 患者 treatmentLine 表示"接下来需要第几线治疗"；既往线数 = treatmentLine - 1
  const patientLine = getPatientTreatmentLine(record);
  if (patientLine != null && si.prior_lines_max != null) {
    const patientPriorLines = patientLine - 1;
    if (patientPriorLines > si.prior_lines_max) {
      return {
        excluded: true,
        reason: `既往治疗线数（${patientPriorLines}线）超过试验允许上限（≤${si.prior_lines_max}线）`
      };
    }
  }

  // ---- 允许癌种硬冲突（SCLC/NSCLC 等亚型分界）----
  if (Array.isArray(si.allowed_cancer_types) && si.allowed_cancer_types.length > 0) {
    const conflict = cancerTypeHardConflict(record.diagnosis, si.allowed_cancer_types);
    if (conflict) return { excluded: true, reason: conflict };
  }

  // ---- 必需基因硬过滤（required_genes）----
  if (Array.isArray(si.required_genes) && si.required_genes.length > 0) {
    const patientGeneRaw = safeText(record.gene_mutation);
    const patientStatus = parsePatientGeneStatus(patientGeneRaw);
    const hasAnyGeneInfo = patientGeneRaw.length > 0;

    // 先检查乳腺癌亚型冲突（HER2+ vs TNBC 等）
    const patientSignals = normalizeText([
      record.diagnosis || '',
      record.gene_mutation || ''
    ].join(' '));
    const geneReqText = normalizeText(si.required_genes.join(' '));
    const breastConflict = breastSubtypeConflict(patientSignals, geneReqText);
    if (breastConflict) return { excluded: true, reason: breastConflict };

    for (const req of si.required_genes) {
      const parsed = parseRequiredGene(req);
      if (!parsed) continue; // 无法解析则跳过（留给软评分）
      const pStatus = patientStatus[parsed.name];

      if (pStatus) {
        // 有明确冲突的硬排除
        if (parsed.requireMutant && (pStatus === 'wild' || pStatus === 'mss')) {
          return {
            excluded: true,
            reason: `试验要求 ${parsed.name.toUpperCase()} 阳性/突变，患者为野生型/阴性`
          };
        }
        if (parsed.requireWild && pStatus === 'mutant') {
          return {
            excluded: true,
            reason: `试验要求 ${parsed.name.toUpperCase()} 野生型/阴性，患者为突变阳性`
          };
        }
      } else if (hasAnyGeneInfo && parsed.requireMutant) {
        // 患者做过基因检测但未提及该基因 —— 对驱动基因互斥的癌种（NSCLC/CRC/乳腺癌/胃癌）
        // 默认视为该基因不符合（防止把没做过 HER2/CLDN18 等检测的患者高分推给需要该突变的试验）
        const diagNorm = normalizeText(record.diagnosis || '');
        const isDriverExclusiveTumor = /(非小细胞|nsclc|肺腺癌|肺鳞癌|结直肠|结肠|直肠|乳腺|胃|nsclc)/.test(diagNorm);
        const isSpecificGene = ['her2', 'erbb2', 'egfr', 'alk', 'ros1', 'braf', 'kras', 'ret', 'met', 'cldn18', 'ntrk'].includes(parsed.name);
        if (isDriverExclusiveTumor && isSpecificGene) {
          return {
            excluded: true,
            reason: `试验要求 ${parsed.name.toUpperCase()} 阳性/突变，患者基因检测未提示该靶点阳性`
          };
        }
      }
    }
  }

  // ---- other_key_criteria 负向要求（HER2阴性 / 非MSI-H / 除外XXX）----
  if (Array.isArray(si.other_key_criteria) && si.other_key_criteria.length > 0) {
    const patientSignals = normalizeText([
      record.diagnosis || '',
      record.gene_mutation || '',
      record.treatment || ''
    ].join(' '));
    const trialSignals = normalizeText(si.other_key_criteria.join(' '));

    const breastConflict = breastSubtypeConflict(patientSignals, trialSignals);
    if (breastConflict) return { excluded: true, reason: breastConflict };

    const msiConflict = msiStatusConflict(patientSignals, trialSignals);
    if (msiConflict) return { excluded: true, reason: msiConflict };

    // "除外XXX" / "暂不接收XXX"
    for (const crit of si.other_key_criteria) {
      const m = crit.match(/(?:除外|暂不接[收受])\s*([^，。；;,\s]{2,20})/);
      if (m) {
        const excludedTerm = m[1];
        const excluded = normalizeText(excludedTerm);
        if (!excluded) continue;
        // 使用 containsAlias 的语义排斥，避免 "小细胞肺癌" 被 "非小细胞肺癌" 误命中
        if (aliasConflictsWithText(excludedTerm, record.diagnosis || '')) continue;
        if (excluded && patientSignals.includes(excluded)) {
          return { excluded: true, reason: `试验明确除外「${excludedTerm}」` };
        }
      }
    }
  }

  // ---- allowed_cancer_types 的负向子类型（如 HER2+ 乳腺癌试验，TNBC 被排除）----
  if (Array.isArray(si.allowed_cancer_types) && si.allowed_cancer_types.length > 0) {
    const patientSignals = normalizeText([
      record.diagnosis || '',
      record.gene_mutation || ''
    ].join(' '));
    const trialTypesText = normalizeText(si.allowed_cancer_types.join(' '));
    const breastConflict = breastSubtypeConflict(patientSignals, trialTypesText);
    if (breastConflict) return { excluded: true, reason: breastConflict };
  }

  // ---- 必需的既往治疗（required_prior_therapies）----
  // 若试验要求具体治疗类别（如"铂类化疗"、"≥2线抗HER2靶向治疗"），患者未接受则硬排除
  if (Array.isArray(si.required_prior_therapies) && si.required_prior_therapies.length > 0) {
    const patientTx = normalizeText([
      record.treatment || '',
      (record.structured?.entities?.priorTherapies || []).join(' ')
    ].join(' '));
    const patientLine = getPatientTreatmentLine(record);
    const hasPriorTreatment = (patientLine != null && patientLine > 1) || patientTx.length > 0;

    for (const req of si.required_prior_therapies) {
      const reqNorm = normalizeText(req);
      if (!reqNorm || reqNorm.length > 30) continue;
      // 跳过笼统描述（"标准治疗失败"等由软评分处理）
      if (/标准治疗|任何|至少一种|系统(性)?治疗失败|所有可用/.test(req) && !/铂|免疫|靶向|化疗|抑制剂|单抗/.test(req)) continue;

      // 若患者没有任何既往治疗，硬排除
      if (!hasPriorTreatment) {
        return { excluded: true, reason: `试验要求既往接受过「${req}」，患者未接受任何治疗` };
      }

      // 展开治疗类→关键词
      const kws = resolveTherapyKeywords(req);
      const hit = kws.some((kw) => kw.length >= 2 && patientTx.includes(kw));
      if (!hit) {
        // 若是常见治疗类而患者治疗文本无相关关键词，硬排除
        const isSpecificClass = /铂|免疫|her2|egfr|alk|抗体|靶向|化疗/.test(reqNorm);
        if (isSpecificClass) {
          return { excluded: true, reason: `试验要求既往接受过「${req}」，患者治疗记录未提示相关方案` };
        }
      }
    }
  }

  // ---- 先验疗法硬排除（扩展：支持治疗类→关键词映射）----
  if (Array.isArray(si.excluded_prior_therapies) && si.excluded_prior_therapies.length > 0) {
    const patientTx = normalizeText([record.treatment || '', (record.structured?.entities?.priorTherapies || []).join(' ')].join(' '));
    if (patientTx) {
      for (const therapy of si.excluded_prior_therapies) {
        const normTherapy = normalizeText(therapy);
        if (!normTherapy) continue;
        // 跳过过长描述（>20字符去标点后通常是复杂条件句而非药名）
        if (normTherapy.length > 20) continue;
        // 跳过含时间限定的条件（如"4周内""3个月内"），这些需要时间维度判断
        if (/\d+[周月天日]内/.test(therapy)) continue;
        // 跳过过于笼统的系统治疗描述（无靶向/抑制剂/单抗关键词）
        if (/全身(性)?(抗肿瘤|系统)?治疗|系统(性)?(抗肿瘤)?治疗|系统性抗癌|全身化疗/.test(therapy) && !/靶向|抑制剂|单抗|抗体|免疫|检查点/.test(therapy)) continue;

        // 1) 直接字符串匹配
        if (patientTx.includes(normTherapy)) {
          return { excluded: true, reason: `患者既往治疗包含「${therapy}」，被该试验排除` };
        }
        // 2) 治疗类→关键词映射（如 "免疫治疗" 命中 "帕博利珠单抗"）
        const classKws = resolveTherapyKeywords(therapy);
        // 只有当解析出的关键词不仅仅是自身时，才启用类别匹配
        if (classKws.length > 1) {
          for (const kw of classKws) {
            if (kw.length >= 3 && kw !== normTherapy && patientTx.includes(kw)) {
              return { excluded: true, reason: `患者既往治疗包含「${kw}」属于「${therapy}」类别，被该试验排除` };
            }
          }
        }
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
    const hf = applyStructuredInclusionHardFilter(record, si);
    if (hf.excluded) {
      return { score: 0, reasons: [hf.reason], excluded: true };
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
  getPatientPdl1,
  applyStructuredInclusionHardFilter,
  parsePatientGeneStatus,
  parseRequiredGene,
  resolveTherapyKeywords,
  cancerTypeHardConflict,
  breastSubtypeConflict,
  msiStatusConflict
};
