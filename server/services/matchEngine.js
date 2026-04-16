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

// 已知实体瘤/癌种列表（用于 basket trial 兜底判断）
const KNOWN_SOLID_TUMORS_FOR_BASKET = [
  '肺癌', '乳腺癌', '肝癌', '肝细胞癌', '胃癌', '结直肠癌', '结肠癌', '直肠癌',
  '食管癌', '胰腺癌', '胆管癌', '胆道癌', '肾癌', '膀胱癌', '前列腺癌',
  '卵巢癌', '宫颈癌', '子宫内膜癌', '甲状腺癌', '鼻咽癌', '头颈癌', '黑色素瘤',
  '肉瘤', '胶质瘤', '腺癌', '鳞癌', '尿路上皮癌', '非小细胞', '小细胞肺癌',
  'nsclc', 'sclc', 'tnbc', 'carcinoma', 'cancer'
];

// 已知基因列表，用于精确基因名匹配（避免子串假阳性）
const KNOWN_GENES = [
  'egfr', 'alk', 'ros1', 'kras', 'braf', 'her2', 'erbb2',
  'met', 'ret', 'ntrk', 'ntrk1', 'ntrk2', 'ntrk3',
  'fgfr', 'fgfr1', 'fgfr2', 'fgfr3',
  'pik3ca', 'pten', 'tp53',
  'pdl1', 'pd-l1',
  'tmb', 'msih', 'msi-h', 'mmr', 'dmmr'
];

// 免疫治疗/PD-(L)1 药物别名（用于排除条件的治疗类映射）
const IMMUNE_CHECKPOINT_DRUGS = [
  '帕博利珠单抗', '纳武利尤单抗', '信迪利单抗', '卡瑞利珠单抗', '替雷利珠单抗',
  '特瑞普利单抗', '赛帕利单抗', '阿替利珠单抗', '度伐利尤单抗', '恩沃利单抗',
  'pembrolizumab', 'nivolumab', 'atezolizumab', 'durvalumab', 'cemiplimab',
  'pd-1', 'pd-l1', 'pdl1', 'pd1', 'ctla4', 'ctla-4'
];

const PLATINUM_CHEMO_DRUGS = ['顺铂', '卡铂', '奥沙利铂', '奈达铂', 'cisplatin', 'carboplatin', 'oxaliplatin', 'folfox', 'xelox', 'capeox', 'folfiri'];

// 将治疗类别关键词映射到具体药物/方案名（用于 excluded_prior_therapies 判定）
const THERAPY_CLASS_ALIASES = {
  '免疫治疗': IMMUNE_CHECKPOINT_DRUGS,
  '免疫检查点抑制剂': IMMUNE_CHECKPOINT_DRUGS,
  'pd1': IMMUNE_CHECKPOINT_DRUGS,
  'pdl1': IMMUNE_CHECKPOINT_DRUGS,
  'pd-1': IMMUNE_CHECKPOINT_DRUGS,
  'pd-l1': IMMUNE_CHECKPOINT_DRUGS,
  '铂类化疗': PLATINUM_CHEMO_DRUGS,
  '铂类': PLATINUM_CHEMO_DRUGS,
  '含铂': PLATINUM_CHEMO_DRUGS
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
 * 判断患者诊断是否匹配试验 allowed_cancer_types
 * 返回:
 *   'specific_match' — 命中具体癌种
 *   'generic_match'  — 命中泛实体瘤（篮子试验）
 *   'excluded'       — 被括号内"除外X"条款排除
 *   'no_constraint'  — 试验未限定癌种
 *   'no_match'       — 诊断不在允许癌种内
 */
const evaluateAllowedCancerTypes = (diagnosis, allowedCancerTypes) => {
  if (!allowedCancerTypes || !Array.isArray(allowedCancerTypes) || allowedCancerTypes.length === 0) {
    return 'no_constraint';
  }
  if (!diagnosis) return 'no_constraint';

  const diagNorm = normalizeText(diagnosis);
  const diagIsNSCLC = diagNorm.includes('非小细胞') || diagNorm.includes('nsclc') || diagNorm.includes('肺腺癌') || diagNorm.includes('肺鳞癌');
  const diagIsSCLC = !diagIsNSCLC && (diagNorm.includes('小细胞肺癌') || diagNorm.includes('sclc') || diagNorm.includes('小细胞癌'));

  const specificTypes = [];
  const genericTypes = [];
  for (const t of allowedCancerTypes) {
    const tClean = t.replace(/[（(].*?[）)]/, '');
    const isGeneric = /^(其他|泛|所有|全部)/.test(t) ||
      /^(晚期|进展期)?(实体瘤|实体性肿瘤|恶性肿瘤|肿瘤)$/.test(tClean);
    if (isGeneric) {
      genericTypes.push(t);
    } else {
      specificTypes.push(t);
    }
  }

  // Phase 1: 严格匹配具体癌种
  for (const t of specificTypes) {
    const tNorm = normalizeText(t);
    const tIsNSCLC = tNorm.includes('非小细胞') || tNorm.includes('nsclc') || tNorm.includes('肺腺癌') || tNorm.includes('肺鳞癌');
    const tIsSCLC = !tIsNSCLC && (tNorm.includes('小细胞肺癌') || tNorm.includes('sclc') || tNorm.includes('小细胞癌'));

    // NSCLC vs SCLC 互斥
    if ((diagIsNSCLC && tIsSCLC) || (diagIsSCLC && tIsNSCLC)) continue;

    if (diagNorm.includes(tNorm) || tNorm.includes(diagNorm)) {
      return 'specific_match';
    }
    const dm = matchDiseaseText(diagnosis, t);
    if (dm.matched && dm.specific) return 'specific_match';
  }

  // Phase 2: 泛癌种兜底，处理 "其他实体瘤（除外小细胞肺癌）" 等条款
  for (const t of genericTypes) {
    const exclMatch = t.match(/[（(]除外(.+?)[）)]/);
    if (exclMatch) {
      const excl = exclMatch[1].split(/[、,，]/);
      const diagExcluded = excl.some((et) => {
        const etNorm = normalizeText(et);
        if (!etNorm) return false;
        if (diagNorm.includes(etNorm) || etNorm.includes(diagNorm)) return true;
        // 做一次疾病谱对齐，避免仅靠子串漏判
        const dm = matchDiseaseText(diagnosis, et);
        return dm.matched && dm.specific;
      });
      if (diagExcluded) return 'excluded';
    }
    const isKnownTumor = KNOWN_SOLID_TUMORS_FOR_BASKET.some((kw) => diagNorm.includes(normalizeText(kw)));
    if (hasGenericCancerSignal(diagnosis) || isKnownTumor) {
      return 'generic_match';
    }
  }

  return 'no_match';
};

/**
 * 提取患者文本中围绕基因名的"阳性/阴性/野生/突变"状态
 */
const GENE_NAME_RE = /(EGFR|ALK|ROS1|KRAS|NRAS|HRAS|BRAF|HER2|ERBB2|MET|RET|NTRK\d?|FGFR\d?|PIK3CA|PTEN|TP53|CLDN18(?:\.2)?|ROR1|BRCA\d?|MSI-?H?|TMB|MMR|dMMR|MSS)/gi;

const extractGeneStatesFromText = (text) => {
  // 返回 { GENE_UPPER: { positive, negative } }
  const states = {};
  if (!text) return states;
  // 拆分为短片段以便更精确地确定状态
  const segments = text.split(/[，,、；;。\s]+/).filter(Boolean);
  for (const seg of segments) {
    const matches = [...seg.matchAll(GENE_NAME_RE)];
    if (matches.length === 0) continue;
    const isPositive = /突变|阳性|融合|表达|positive|mutation|activating|mutant|ihc3|ihc\s*3\+|fish\+|ish\s*阳性|ihc2\+|扩增|重排|amplif|overexpress/i.test(seg);
    const isNegative = /野生|阴性|wildtype|\bwt\b|negative|未检出|未见|not detected|否/i.test(seg);
    for (const m of matches) {
      const g = m[1].toUpperCase().replace(/\s+/g, '').replace(/\.2$/, '');
      if (!states[g]) states[g] = { positive: false, negative: false, raw: [] };
      if (isPositive) states[g].positive = true;
      if (isNegative) states[g].negative = true;
      states[g].raw.push(seg.trim());
    }
  }
  // 诊断级特殊处理："三阴性" → HER2-, ER-, PR-
  if (/三阴|tnbc|triple\s*negative/i.test(text)) {
    for (const g of ['HER2', 'ERBB2', 'ER', 'PR']) {
      if (!states[g]) states[g] = { positive: false, negative: false, raw: [] };
      states[g].negative = true;
    }
  }
  // 诊断级特殊处理：诊断中直接写明 "HER2阳性" / "HER2阴性"
  if (/her2\s*阳性|her2\s*\+|her2\s*positive/i.test(text)) {
    if (!states['HER2']) states['HER2'] = { positive: false, negative: false, raw: [] };
    states['HER2'].positive = true;
  }
  if (/her2\s*阴性|her2\s*-|her2\s*negative/i.test(text)) {
    if (!states['HER2']) states['HER2'] = { positive: false, negative: false, raw: [] };
    states['HER2'].negative = true;
  }
  return states;
};

/**
 * 硬过滤：required_genes 与患者基因状态冲突 → 排除
 * 规则：
 *   1) 如果患者对某基因的状态与试验要求明确冲突 → 排除
 *   2) 如果患者做了基因 Panel（≥2 个已知驱动基因信息），且试验要求的基因未出现在检测结果中 → 视为该基因未检出/阴性，与"需突变/阳性"的要求冲突时排除
 *   3) 其他情况保守放行
 */
const PANEL_DRIVER_GENES = ['EGFR', 'ALK', 'ROS1', 'KRAS', 'NRAS', 'HRAS', 'BRAF', 'HER2', 'ERBB2', 'MET', 'RET', 'NTRK', 'NTRK1', 'NTRK2', 'NTRK3', 'FGFR', 'FGFR1', 'FGFR2', 'FGFR3', 'PIK3CA', 'PTEN', 'TP53', 'BRCA', 'BRCA1', 'BRCA2', 'MSI-H', 'MSIH', 'MSI', 'MSS', 'DMMR', 'MMR', 'CLDN18'];

// 临床上高度互斥的 Tier-1 驱动基因（NSCLC/GI/乳腺 RTK 通路）
// 一个患者几乎不会同时携带其中两个激活突变，可用于推断"其他驱动阴性"
const MUTUALLY_EXCLUSIVE_DRIVERS = ['EGFR', 'ALK', 'ROS1', 'KRAS', 'BRAF', 'HER2', 'ERBB2', 'MET', 'RET', 'NTRK', 'NTRK1', 'NTRK2', 'NTRK3'];

const evaluateRequiredGenesHard = (patientGeneStates, requiredGenes) => {
  if (!requiredGenes || !Array.isArray(requiredGenes) || requiredGenes.length === 0) {
    return { excluded: false };
  }
  if (!patientGeneStates || Object.keys(patientGeneStates).length === 0) {
    return { excluded: false }; // 无任何基因检测信息 → 保守放行
  }

  // 计算患者 Panel 已检测的驱动基因数量：作为"综合检测"置信度指标
  const panelHits = Object.keys(patientGeneStates).filter((g) => PANEL_DRIVER_GENES.includes(g));
  const hasComprehensivePanel = panelHits.length >= 2;

  for (const req of requiredGenes) {
    const reqLower = req.toLowerCase();
    const geneMatches = [...req.matchAll(GENE_NAME_RE)].map((m) => m[1].toUpperCase().replace(/\s+/g, '').replace(/\.2$/, ''));
    if (geneMatches.length === 0) continue;
    const wantsMutant = /突变|阳性|融合|表达|positive|mutation|activating|mutant|ihc3|ihc\s*3\+|fish\+|ish\s*阳性|扩增|重排|amplif|overexpress|激活/i.test(req);
    const wantsWild = /野生|阴性|wildtype|wild-type|\bwt\b|negative/i.test(req);

    // MSI/MMR 特殊处理
    if (/msi-?h|dmmr/i.test(reqLower) && !wantsWild) {
      const patMSI = patientGeneStates['MSI-H'] || patientGeneStates['MSIH'] || patientGeneStates['MSI'];
      const patMMR = patientGeneStates['DMMR'] || patientGeneStates['MMR'];
      const patMSS = patientGeneStates['MSS'];
      if (patMSS && patMSS.positive && !(patMSI && patMSI.positive) && !(patMMR && patMMR.positive)) {
        return { excluded: true, reason: `患者为MSS，试验要求${req}` };
      }
    }

    for (const geneName of geneMatches) {
      const patState = patientGeneStates[geneName];
      if (patState) {
        if (wantsMutant && patState.negative && !patState.positive) {
          return { excluded: true, reason: `患者${geneName}为野生型/阴性，试验要求「${req}」` };
        }
        if (wantsWild && patState.positive && !patState.negative) {
          return { excluded: true, reason: `患者${geneName}为突变/阳性，试验要求「${req}」` };
        }
      } else if (hasComprehensivePanel && wantsMutant) {
        // Panel 已测多基因但未报告此基因 → 可合理推断未检出
        return {
          excluded: true,
          reason: `患者基因检测Panel（${panelHits.slice(0, 4).join('/')}）未检出${geneName}，试验要求「${req}」`
        };
      } else if (wantsMutant && MUTUALLY_EXCLUSIVE_DRIVERS.includes(geneName)) {
        // 临床互斥驱动基因：若患者已有另一驱动基因阳性，则本基因可推定阴性
        const hasOtherDriverPositive = Object.entries(patientGeneStates).some(
          ([g, st]) => g !== geneName && MUTUALLY_EXCLUSIVE_DRIVERS.includes(g) && st.positive && !st.negative
        );
        if (hasOtherDriverPositive) {
          const others = Object.entries(patientGeneStates)
            .filter(([g, st]) => g !== geneName && MUTUALLY_EXCLUSIVE_DRIVERS.includes(g) && st.positive)
            .map(([g]) => g);
          return {
            excluded: true,
            reason: `患者已携带${others.join('/')}等互斥驱动基因阳性，与试验要求「${req}」不符`
          };
        }
      }
    }
  }
  return { excluded: false };
};

/**
 * 硬过滤：other_key_criteria 中常见的硬性约束（非 MSI-H、需可切除等）
 * 仅处理高置信度规则，其他条目交给打分器
 */
const evaluateOtherKeyCriteriaHard = (patientGeneStates, otherCriteria) => {
  if (!otherCriteria || !Array.isArray(otherCriteria) || otherCriteria.length === 0) {
    return { excluded: false };
  }
  for (const rule of otherCriteria) {
    // "非MSI-H/dMMR" 或 "MSI-H以外" 等 → 要求 MSS
    if (/非\s*msi-?h|非\s*dmmr|msi-?h\s*以外|排除\s*msi-?h|mss\b/i.test(rule)) {
      const patMSI = patientGeneStates['MSI-H'] || patientGeneStates['MSIH'] || patientGeneStates['MSI'];
      const patMMR = patientGeneStates['DMMR'] || patientGeneStates['MMR'];
      const hasMSIH = (patMSI && patMSI.positive) || (patMMR && patMMR.positive);
      if (hasMSIH) {
        return { excluded: true, reason: `患者为MSI-H/dMMR，试验要求「${rule}」` };
      }
    }
  }
  return { excluded: false };
};

/**
 * 把试验排除疗法扩展为包含类别别名的规范化关键词集
 * 关键：只在疗法文本"基本就是类别名"时才扩展为全部药物，
 *       避免组合条件（"抗PD-L1联合抗CTLA4"）把单药治疗的患者误排除。
 */
const buildExcludedTherapyKeywords = (therapy) => {
  const keywords = new Set();
  const norm = normalizeText(therapy);
  // 跳过带时间窗限定或泛"系统治疗"描述
  if (/\d+[周月天日]内/.test(therapy)) return [];
  if (/全身(性)?(抗肿瘤|系统)?治疗|系统(性)?(抗肿瘤)?治疗|系统性抗癌|全身化疗/.test(therapy) && !/靶向|抑制剂|单抗|抗体/.test(therapy)) return [];

  if (norm && norm.length >= 2 && norm.length <= 20) {
    keywords.add(norm);
  }

  // 组合条件（"联合" / "+"）不扩展类别别名，避免误判单药患者
  const isComboTerm = /联合|搭配|\+/.test(therapy);
  if (!isComboTerm) {
    for (const [className, drugs] of Object.entries(THERAPY_CLASS_ALIASES)) {
      const classNorm = normalizeText(className);
      // 仅在疗法文本近似等于类别名时扩展（防止"PD-L1联合XXX"这种组合条件误扩）
      if (norm === classNorm || (norm.length <= classNorm.length + 6 && norm.endsWith(classNorm))) {
        for (const d of drugs) keywords.add(normalizeText(d));
      }
    }
  }
  return Array.from(keywords).filter((k) => k && k.length >= 2);
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
    // 基于关键词扩展，将"免疫治疗""铂类化疗"等类别映射到具体药名，覆盖真实病历口径
    if (Array.isArray(si.excluded_prior_therapies) && si.excluded_prior_therapies.length > 0) {
      const patientTx = normalizeText(record.treatment || '');
      if (patientTx) {
        for (const therapy of si.excluded_prior_therapies) {
          const keywords = buildExcludedTherapyKeywords(therapy);
          for (const kw of keywords) {
            if (patientTx.includes(kw)) {
              return {
                score: 0,
                reasons: [`患者既往治疗包含「${therapy}」（命中关键词"${kw}"），被该试验排除`],
                excluded: true
              };
            }
          }
        }
      }
    }

    // A10: 允许癌种硬过滤 —— 若试验明确限定癌种，诊断不匹配直接排除
    const diagForCT = record.diagnosis || '';
    if (diagForCT && Array.isArray(si.allowed_cancer_types) && si.allowed_cancer_types.length > 0) {
      const ctStatus = evaluateAllowedCancerTypes(diagForCT, si.allowed_cancer_types);
      if (ctStatus === 'excluded') {
        return {
          score: 0,
          reasons: [`患者诊断「${diagForCT}」属试验除外癌种`],
          excluded: true
        };
      }
      if (ctStatus === 'no_match') {
        return {
          score: 0,
          reasons: [`患者诊断「${diagForCT}」不在试验允许癌种列表（${si.allowed_cancer_types.join('、')}）内`],
          excluded: true
        };
      }
    }

    // A11: 基因状态硬过滤 —— 只在患者基因状态与试验要求明确冲突时排除
    const patientGeneStates = extractGeneStatesFromText(
      [record.gene_mutation, record.diagnosis, record.structured?.entities?.geneMutation].filter(Boolean).join(' ')
    );
    if (Array.isArray(si.required_genes) && si.required_genes.length > 0) {
      const geneHard = evaluateRequiredGenesHard(patientGeneStates, si.required_genes);
      if (geneHard.excluded) {
        return { score: 0, reasons: [geneHard.reason], excluded: true };
      }
    }

    // A12: other_key_criteria 中的高置信度硬性条件（如 "非MSI-H"）
    if (Array.isArray(si.other_key_criteria) && si.other_key_criteria.length > 0) {
      const otherHard = evaluateOtherKeyCriteriaHard(patientGeneStates, si.other_key_criteria);
      if (otherHard.excluded) {
        return { score: 0, reasons: [otherHard.reason], excluded: true };
      }
    }

    // A13: 治疗线数硬过滤
    const patientLineHard = getPatientTreatmentLine(record);
    if (patientLineHard != null) {
      const priorLines = patientLineHard - 1; // 当前需要第 N 线 → 既往 N-1 线
      if (si.prior_lines_min != null && priorLines < si.prior_lines_min) {
        return {
          score: 0,
          reasons: [`既往${priorLines}线治疗低于试验要求（≥${si.prior_lines_min}线）`],
          excluded: true
        };
      }
      if (si.prior_lines_max != null && priorLines > si.prior_lines_max) {
        return {
          score: 0,
          reasons: [`既往${priorLines}线治疗超过试验允许（≤${si.prior_lines_max}线）`],
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
