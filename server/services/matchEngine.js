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
  'pik3ca', 'pten', 'tp53', 'brca', 'brca1', 'brca2',
  'cldn18', 'cldn182', 'cldn18.2', 'ror1',
  'pdl1', 'pd-l1',
  'tmb', 'msih', 'msi-h', 'mmr', 'dmmr', 'mss'
];

// 常见中文基因名/生物标志物别名映射（归一化到小写无符号形式）
const GENE_CN_ALIASES = {
  'cldn18': ['cldn18', 'cldn182', 'claudin18', 'claudin182', '密连蛋白18'],
  'her2': ['her2', 'erbb2'],
  'egfr': ['egfr'],
  'alk': ['alk'],
  'ros1': ['ros1'],
  'kras': ['kras'],
  'nras': ['nras'],
  'braf': ['braf'],
  'met': ['met'],
  'ret': ['ret'],
  'ntrk': ['ntrk', 'trk'],
  'ror1': ['ror1'],
  'brca': ['brca', 'brca1', 'brca2'],
  'msih': ['msih', 'msi-h', 'msi高', '微卫星高度不稳定'],
  'dmmr': ['dmmr', 'mmr缺失', '错配修复缺陷'],
  'tmb': ['tmb', 'tmb-h', 'tmbh', '肿瘤突变负荷高']
};

// 免疫治疗（ICI）药物/类别关键词，用于 excluded_prior_therapies 按类别匹配
const IMMUNOTHERAPY_KEYWORDS = [
  'pd-1', 'pd1', 'pd-l1', 'pdl1', 'ctla4', 'ctla-4',
  '免疫治疗', '免疫检查点', '免疫抑制剂', '免疫单抗',
  'pembrolizumab', 'nivolumab', 'atezolizumab', 'durvalumab',
  'sintilimab', 'camrelizumab', 'tislelizumab', 'toripalimab',
  'ipilimumab', 'avelumab', 'cemiplimab',
  '帕博利珠单抗', '派姆单抗', 'k药',
  '纳武利尤单抗', '欧狄沃', 'o药',
  '信迪利单抗', '达伯舒',
  '卡瑞利珠单抗', '艾瑞卡',
  '替雷利珠单抗', '百泽安',
  '特瑞普利单抗', '拓益',
  '阿替利珠单抗', '泰圣奇',
  '度伐利尤单抗', '英飞凡',
  '派安普利单抗', '赛帕利单抗'
];

const CHEMOTHERAPY_KEYWORDS = [
  '化疗', '铂', '顺铂', '卡铂', '奥沙利铂', 'platinum',
  'folfox', 'folfiri', 'xelox', 'capeox',
  '紫杉', '多西他赛', '紫杉醇', '白蛋白紫杉醇', 'paclitaxel', 'docetaxel',
  '培美曲塞', 'pemetrexed', '吉西他滨', 'gemcitabine',
  '伊立替康', 'irinotecan', '依托泊苷', 'etoposide',
  '卡培他滨', 'capecitabine', '氟尿嘧啶', '5-fu', '5fu'
];

const TARGETED_THERAPY_KEYWORDS = [
  '靶向', 'tki', '替尼', 'inib', '抑制剂',
  '吉非替尼', 'gefitinib', '厄洛替尼', 'erlotinib',
  '奥希替尼', 'osimertinib', '阿美替尼', '伏美替尼',
  '克唑替尼', 'crizotinib', '阿来替尼', 'alectinib', '劳拉替尼', 'lorlatinib',
  '仑伐替尼', 'lenvatinib', '索拉非尼', 'sorafenib', '瑞戈非尼', 'regorafenib',
  '曲妥珠单抗', 'trastuzumab', '帕妥珠单抗', 'pertuzumab',
  't-dm1', 'tdm1', '恩美曲妥珠单抗',
  '西妥昔单抗', 'cetuximab', '贝伐珠单抗', 'bevacizumab',
  '拉帕替尼', 'lapatinib', '吡咯替尼', 'pyrotinib'
];

/**
 * 判断文本是否包含某个治疗类别。type 可为 'immuno' | 'chemo' | 'targeted'
 */
const containsTherapyClass = (text, type) => {
  if (!text) return false;
  const t = safeLower(text);
  const keywords = type === 'immuno' ? IMMUNOTHERAPY_KEYWORDS
    : type === 'chemo' ? CHEMOTHERAPY_KEYWORDS
    : type === 'targeted' ? TARGETED_THERAPY_KEYWORDS
    : [];
  return keywords.some((kw) => t.includes(kw.toLowerCase()));
};

/**
 * 从必需基因条目（如 "HER2 TKD激活突变"、"CLDN18.2表达"、"EGFR野生型"）中
 * 解析出基因名 + 期望状态（mutant | wild | expression | any）
 */
const parseRequiredGene = (entry) => {
  if (!entry || typeof entry !== 'string') return null;
  const norm = safeLower(entry).replace(/\s/g, '');
  let gene = null;
  for (const [key, aliases] of Object.entries(GENE_CN_ALIASES)) {
    for (const alias of aliases) {
      const a = alias.toLowerCase().replace(/[.\-_\s]/g, '');
      const n = norm.replace(/[.\-_]/g, '');
      if (n.includes(a)) { gene = key; break; }
    }
    if (gene) break;
  }
  if (!gene) return null;

  // 判断期望状态（按优先级顺序）
  let state = 'any';
  if (/野生|wildtype|阴性|negative|mss(?!i)/i.test(norm)) {
    state = 'wild';
  } else if (/突变|mutation|mutant|activating|激活突变|融合|fusion|重排|rearrange|扩增|amplif/i.test(norm)) {
    state = 'mutant';
  } else if (/表达|express|阳性|positive|高表达|overexpress/i.test(norm)) {
    state = 'expression';
  }
  return { gene, state, raw: entry };
};

/**
 * 检查患者基因文本中某个基因的状态
 * 返回 'mutant' | 'wild' | 'expression' | 'positive' | 'negative' | 'mentioned' | 'absent'
 */
const detectGeneStateInPatient = (patientText, gene) => {
  if (!patientText) return 'absent';
  const t = safeLower(patientText);
  const aliases = GENE_CN_ALIASES[gene] || [gene];

  // 在患者文本中定位该基因相关的句段（通过分隔符切分后逐段检查）
  const segments = t.split(/[;,，、。；\n]/).filter(Boolean);
  let geneMentioned = false;
  for (const seg of segments) {
    const segNorm = seg.replace(/[.\-_\s]/g, '');
    const hasGene = aliases.some((alias) => {
      const a = alias.toLowerCase().replace(/[.\-_\s]/g, '');
      return segNorm.includes(a);
    });
    if (!hasGene) continue;
    geneMentioned = true;
    // 先检查更精确的状态关键词
    if (/野生|wildtype|wt\b|阴性|negative|mss(?!i)/i.test(seg)) return 'wild';
    if (/突变|mutation|mutant|activating|激活|融合|fusion|重排|rearrange|扩增|amplif/i.test(seg)) return 'mutant';
    if (/高表达|过表达|overexpress/i.test(seg)) return 'expression';
    if (/阳性|positive|\+\s*$|ihc\s*[23]\+/i.test(seg)) return 'positive';
  }
  return geneMentioned ? 'mentioned' : 'absent';
};

/**
 * 判断患者基因状态是否满足试验的必需基因要求
 * 返回 'match' | 'mismatch' | 'unknown'
 */
const evaluateRequiredGenes = (requiredGenes, patientGeneText) => {
  if (!Array.isArray(requiredGenes) || requiredGenes.length === 0) {
    return { status: 'match', details: [] };
  }
  const details = [];
  let anyMatch = false;
  let anyHardMismatch = false;

  for (const entry of requiredGenes) {
    const parsed = parseRequiredGene(entry);
    if (!parsed) {
      details.push({ entry, verdict: 'unknown', reason: '无法解析基因条目' });
      continue;
    }
    const state = detectGeneStateInPatient(patientGeneText, parsed.gene);

    if (state === 'absent') {
      details.push({ entry, verdict: 'unknown', reason: `患者未检出/未记录 ${parsed.gene.toUpperCase()}` });
      continue;
    }

    const matchTable = {
      mutant: ['mutant', 'positive', 'expression'],
      wild: ['wild'],
      expression: ['expression', 'positive', 'mutant'],
      any: ['mutant', 'wild', 'expression', 'positive', 'mentioned']
    };
    const mismatchTable = {
      mutant: ['wild'],
      wild: ['mutant', 'positive'],
      expression: ['wild']
    };

    const ok = (matchTable[parsed.state] || []).includes(state);
    const bad = (mismatchTable[parsed.state] || []).includes(state);
    if (ok) { anyMatch = true; details.push({ entry, verdict: 'match', reason: `${parsed.gene.toUpperCase()} ${state}` }); }
    else if (bad) { anyHardMismatch = true; details.push({ entry, verdict: 'mismatch', reason: `${parsed.gene.toUpperCase()} ${state} 与试验要求 ${parsed.state} 冲突` }); }
    else { details.push({ entry, verdict: 'unknown', reason: `${parsed.gene.toUpperCase()} 状态不确定` }); }
  }

  if (anyHardMismatch && !anyMatch) return { status: 'mismatch', details };
  if (anyMatch) return { status: 'match', details };
  return { status: 'unknown', details };
};

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
  // 预先识别常见的 NSCLC / SCLC 歧义上下文（避免 "非小细胞肺癌" 误匹配 "小细胞肺癌" 别名）
  const textHasNSCLC = /非小细胞|nsclc/.test(normalizedText);
  const textHasSCLC = !textHasNSCLC && /小细胞肺癌|sclc|小细胞癌/.test(normalizedText);
  return aliases.some((alias) => {
    const normalizedAlias = normalizeText(alias);
    if (!normalizedAlias) return false;
    const aliasHasSCLC = /小细胞肺癌|sclc|小细胞癌/.test(normalizedAlias) && !/非小细胞|nsclc/.test(normalizedAlias);
    const aliasHasNSCLC = /非小细胞|nsclc/.test(normalizedAlias);
    // NSCLC 文本 + SCLC 别名：两方向都要拒绝（避免 "非小细胞肺癌" ⊃ "小细胞肺癌" 子串假阳性）
    if (textHasNSCLC && aliasHasSCLC) return false;
    if (textHasSCLC && aliasHasNSCLC) return false;
    // 正向匹配：text 包含 alias
    if (normalizedText.includes(normalizedAlias)) return true;
    // 反向匹配（如 "胰腺癌" ⊂ "胰腺导管腺癌"）：alias 包含 text，长度 >= 3 时启用
    if (normalizedAlias.length >= 3 && normalizedAlias.includes(normalizedText)) {
      return true;
    }
    return false;
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
      const patientTxRaw = safeLower(record.treatment || '');
      const patientTxNorm = normalizeText(record.treatment || '');
      if (patientTxRaw) {
        for (const therapy of si.excluded_prior_therapies) {
          const normTherapy = normalizeText(therapy);
          if (!normTherapy) continue;
          // 跳过过长描述（>20字符去标点后通常是复杂条件句而非药名）
          if (normTherapy.length > 20) continue;
          // 跳过含时间限定的条件（如"4周内""3个月内"），这些需要时间维度判断
          if (/\d+[周月天日]内/.test(therapy)) continue;

          // A9.1: 按治疗类别扩展 —— 仅当试验排除项是 "免疫治疗/免疫检查点抑制剂"
          // 等纯类别描述（不涉及"联合/双抗/+"等具体组合）时，才按免疫类别进行扩展匹配
          const isCombinationExclusion = /(联合|\+|双抗|bispecific|组合)/i.test(therapy);
          const isPureImmunoClass = !isCombinationExclusion
            && /^(?:免疫(治疗|检查点抑制剂|检查点|细胞治疗|单抗)|检查点抑制剂|pd-?1(?:抗体|单抗)?|pd-?l1(?:抗体|单抗)?|抗\s*pd-?1|抗\s*pd-?l1)$/i
              .test(String(therapy).trim());
          if (isPureImmunoClass) {
            if (containsTherapyClass(patientTxRaw, 'immuno')) {
              return {
                score: 0,
                reasons: [`患者既往接受过免疫治疗（${record.treatment}），被试验排除「${therapy}」`],
                excluded: true
              };
            }
            continue;
          }

          // 跳过过于笼统的系统治疗描述
          if (/全身(性)?(抗肿瘤|系统)?治疗|系统(性)?(抗肿瘤)?治疗|系统性抗癌|全身化疗/.test(therapy) && !/靶向|抑制剂|单抗|抗体/.test(therapy)) continue;
          if (patientTxNorm.includes(normTherapy)) {
            return {
              score: 0,
              reasons: [`患者既往治疗包含「${therapy}」，被该试验排除`],
              excluded: true
            };
          }
        }
      }
    }

    // A9.2: 必需既往疗法硬过滤 —— 若试验要求先接受某类系统治疗（如铂类化疗、免疫、靶向）
    // 且患者尚未开始治疗（treatmentLine == 1，即初治），则无法满足该要求
    if (Array.isArray(si.required_prior_therapies) && si.required_prior_therapies.length > 0) {
      const patientLineCheck = getPatientTreatmentLine(record);
      const patientTxRaw = safeLower(record.treatment || '');
      if (patientLineCheck != null && patientLineCheck <= 1 && !patientTxRaw) {
        return {
          score: 0,
          reasons: [`试验要求既往接受过${si.required_prior_therapies.join('、')}，患者为初治`],
          excluded: true
        };
      }
      // 若患者有治疗记录，按类别大致匹配（不做严格硬过滤，避免误判）
      if (patientTxRaw) {
        const classMatchers = [
          { re: /铂类|铂\b/, type: 'chemo' },
          { re: /化疗/, type: 'chemo' },
          { re: /免疫/, type: 'immuno' },
          { re: /靶向|tki|抑制剂/i, type: 'targeted' }
        ];
        let anyMatched = false;
        let anyRequired = false;
        for (const therapy of si.required_prior_therapies) {
          for (const { re, type } of classMatchers) {
            if (re.test(therapy)) {
              anyRequired = true;
              if (containsTherapyClass(patientTxRaw, type)) { anyMatched = true; break; }
            }
          }
          if (anyMatched) break;
        }
        if (anyRequired && !anyMatched) {
          return {
            score: 0,
            reasons: [`试验要求既往接受过${si.required_prior_therapies.join('、')}，患者治疗记录未涵盖`],
            excluded: true
          };
        }
      }
    }

    // A10: 治疗线数硬排除 —— 依据 structured_inclusion 的 prior_lines_min/max
    // treatmentLine 语义：患者下一次需要的治疗线数（N 线）=> 既往已经接受过 N-1 线
    const patientLineForHard = getPatientTreatmentLine(record);
    if (patientLineForHard != null) {
      const patientPriorLines = Math.max(0, patientLineForHard - 1);
      if (si.prior_lines_max != null && patientPriorLines > si.prior_lines_max) {
        if (si.prior_lines_max === 0) {
          return {
            score: 0,
            reasons: [`试验要求未接受过系统治疗（初治），患者已接受${patientPriorLines}线治疗`],
            excluded: true
          };
        }
        return {
          score: 0,
          reasons: [`既往治疗线数（${patientPriorLines}线）超过试验允许上限（≤${si.prior_lines_max}线）`],
          excluded: true
        };
      }
      if (si.prior_lines_min != null && patientPriorLines < si.prior_lines_min) {
        return {
          score: 0,
          reasons: [`既往治疗线数（${patientPriorLines}线）未达到试验要求（≥${si.prior_lines_min}线）`],
          excluded: true
        };
      }
    }

    // A11: 必需基因硬过滤 —— 若试验要求特定基因状态但患者明确冲突（如 wild vs mutant），直接排除
    if (Array.isArray(si.required_genes) && si.required_genes.length > 0) {
      const patientGeneText = record.gene_mutation || record.structured?.entities?.geneMutation || '';
      const geneEval = evaluateRequiredGenes(si.required_genes, patientGeneText);
      if (geneEval.status === 'mismatch') {
        const reasons = geneEval.details
          .filter((d) => d.verdict === 'mismatch')
          .map((d) => d.reason);
        return {
          score: 0,
          reasons: [`患者基因状态与试验要求冲突：${reasons.join('；')}`],
          excluded: true
        };
      }
      // A11.1: 若患者已经完成较完整的基因检测（文本中提到多个 KNOWN_GENES），
      // 但没有命中任一试验必需基因，则高度提示"已测但未检出"，视为硬排除
      if (geneEval.status === 'unknown' && patientGeneText) {
        const detectedGenes = extractGeneNames(patientGeneText);
        const requiredGeneKeys = (si.required_genes || [])
          .map(parseRequiredGene)
          .filter(Boolean)
          .map((g) => g.gene);
        const hasPatientGenePanel = detectedGenes.length >= 1; // 患者已记录任一基因测试结果
        const noRequiredGeneMentioned = requiredGeneKeys.every((k) => {
          const state = detectGeneStateInPatient(patientGeneText, k);
          return state === 'absent';
        });
        if (hasPatientGenePanel && noRequiredGeneMentioned && requiredGeneKeys.length > 0) {
          return {
            score: 0,
            reasons: [`患者已完成基因检测（${detectedGenes.map((g) => g.toUpperCase()).join('、')}），但未检出试验必需的 ${si.required_genes.join('、')}`],
            excluded: true
          };
        }
      }
      // 保存到局部作用域供后续疾病匹配调用
      si.__geneEval = geneEval;
    }

    // A12: 允许癌种 + 除外子句硬过滤（如 "其他实体瘤（除外小细胞肺癌）"，
    // 或 other_key_criteria 中的 "暂不接收小细胞肺癌"）
    // 关键规则：若两端癌种能匹配到已知 DISEASE_PROFILE 且 id 不同，则不同癌种，
    // 跳过字符串子串比较以避免 "非小细胞肺癌" ⊃ "小细胞肺癌" 这类假阳性
    const patientProfileForExcl = getDiseaseProfile(safeText(record.diagnosis));
    const matchesExclusion = (ex, diag) => {
      const exProfile = getDiseaseProfile(ex);
      if (exProfile && patientProfileForExcl) {
        return exProfile.id === patientProfileForExcl.id;
      }
      // 只有一端能识别到 profile 时，回退到精确子串（避免 NSCLC ⊂ SCLC 这类假阳性）
      const a = normalizeText(diag);
      const b = normalizeText(ex);
      if (!a || !b) return false;
      return a.includes(b) || b.includes(a);
    };
    if (Array.isArray(si.allowed_cancer_types) && si.allowed_cancer_types.length > 0) {
      const diagForExcl = safeText(record.diagnosis);
      if (diagForExcl) {
        for (const entry of si.allowed_cancer_types) {
          const exclMatch = String(entry).match(/[（(]除外(.+?)[）)]/);
          if (!exclMatch) continue;
          const excluded = exclMatch[1].split(/[、,，;；]/g).map((s) => s.trim()).filter(Boolean);
          for (const ex of excluded) {
            if (matchesExclusion(ex, diagForExcl)) {
              return {
                score: 0,
                reasons: [`试验明确除外"${ex}"，患者诊断"${diagForExcl}"在排除范围内`],
                excluded: true
              };
            }
          }
        }
      }

      // A12.1: 癌种包含性硬过滤 —— 如果 allowed_cancer_types 完全由具体癌种构成
      // （无泛实体瘤/其他实体瘤等兜底项），且患者诊断不属于任意允许癌种 → 硬排除
      const hasGenericBasket = si.allowed_cancer_types.some((t) => {
        const tn = normalizeText(String(t).replace(/[（(].*?[）)]/, ''));
        return /实体瘤|实体性肿瘤|恶性肿瘤$|所有肿瘤|全部/.test(tn)
          || /^其他/.test(String(t))
          || /上皮来源的恶性肿瘤/.test(String(t));
      });
      if (!hasGenericBasket && diagForExcl && patientProfileForExcl) {
        const patientMatches = si.allowed_cancer_types.some((t) => {
          const tProfile = getDiseaseProfile(t);
          if (tProfile && tProfile.id === patientProfileForExcl.id) return true;
          // 回退：文本互含（基于 profile 消歧后的 containsAlias）
          return containsAlias(diagForExcl, [t]) || containsAlias(t, [diagForExcl]);
        });
        if (!patientMatches) {
          return {
            score: 0,
            reasons: [`患者诊断"${diagForExcl}"不属于试验允许癌种（${si.allowed_cancer_types.slice(0, 3).join('、')}...）`],
            excluded: true
          };
        }
      }
    }
    if (Array.isArray(si.other_key_criteria) && si.other_key_criteria.length > 0) {
      const diagForOther = safeText(record.diagnosis);
      if (diagForOther) {
        for (const clause of si.other_key_criteria) {
          const m = String(clause).match(/(?:暂不接收|不接收|不入组|不入选|除外|排除)\s*([^，,；;。\s]+)/);
          if (!m) continue;
          const ex = m[1].trim();
          if (matchesExclusion(ex, diagForOther)) {
            return {
              score: 0,
              reasons: [`试验关键条件明确排除"${ex}"，患者诊断不符合`],
              excluded: true
            };
          }
        }
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

  // ---- 必需基因未知态惩罚 ----
  // 当试验明确要求某个基因/生物标志物（如 HER2 激活突变、CLDN18.2 表达）
  // 而患者记录中既无正向证据也无明确否证时，不应给予高分推荐
  if (si && Array.isArray(si.required_genes) && si.required_genes.length > 0) {
    const geneEval = si.__geneEval || evaluateRequiredGenes(
      si.required_genes,
      record.gene_mutation || record.structured?.entities?.geneMutation || ''
    );
    if (geneEval.status === 'unknown') {
      score -= 25;
      const entries = (geneEval.details || [])
        .map((d) => d.entry)
        .slice(0, 2)
        .join('、');
      reasons.push(`试验要求特定基因/生物标志物（${entries}），患者尚未检测或记录不明（-25分）`);
    } else if (geneEval.status === 'match') {
      score += 6;
      reasons.push('患者基因状态与试验必需基因要求一致');
    }
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
