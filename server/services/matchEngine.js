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

/**
 * 判断字符是否会改变 alias 语义（如"非"前缀使"小细胞肺癌"变成"非小细胞肺癌"）
 */
const isNegatingPrefix = (ch) => ch === '非';

/**
 * 判断 alias 在某位置的命中是否有效
 *   - 中文 alias：前一字符不能是"非"
 *   - 英文 alias：前一字符必须是非字母数字（避免 "sclc" 命中 "nsclc"）
 */
const isValidAliasMatch = (text, alias, idx) => {
  if (idx <= 0) return true;
  const prevChar = text[idx - 1];
  if (isNegatingPrefix(prevChar)) return false;
  // 英文 alias 的字母边界检查
  const firstChar = alias[0];
  if (/[a-z0-9]/.test(firstChar) && /[a-z0-9]/.test(prevChar)) return false;
  return true;
};

/**
 * 命中判断：双向子串匹配，且对"非"前缀和英文边界做特殊处理
 *   - "非小细胞肺癌" 不应被 alias "小细胞肺癌" 命中
 *   - "NSCLC" 不应被 alias "SCLC" 命中
 */
const aliasHitsText = (text, alias) => {
  const normText = normalizeText(text);
  const normAlias = normalizeText(alias);
  if (!normText || !normAlias) return false;
  // 正向：text 包含 alias
  let from = 0;
  while (from <= normText.length - normAlias.length) {
    const idx = normText.indexOf(normAlias, from);
    if (idx === -1) break;
    if (!isValidAliasMatch(normText, normAlias, idx)) {
      from = idx + 1;
      continue;
    }
    return true;
  }
  // 反向：alias 包含 text（用于 short query 匹配 longer alias）
  let from2 = 0;
  while (from2 <= normAlias.length - normText.length) {
    const i2 = normAlias.indexOf(normText, from2);
    if (i2 === -1) return false;
    if (!isValidAliasMatch(normAlias, normText, i2)) {
      from2 = i2 + 1;
      continue;
    }
    return true;
  }
  return false;
};

const containsAlias = (text, aliases = []) => {
  const normalizedText = normalizeText(text);
  if (!normalizedText) {
    return false;
  }
  return aliases.some((alias) => aliasHitsText(text, alias));
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

// 显式互斥的疾病组：同组内不同 ID 的疾病不能互相匹配
const INCOMPATIBLE_DISEASE_PAIRS = new Set([
  'lung_nsclc|lung_sclc',
  'lung_sclc|lung_nsclc'
]);

const areDiseasesIncompatible = (queryProfile, targetProfile) => {
  if (!queryProfile || !targetProfile || queryProfile.id === targetProfile.id) return false;
  return INCOMPATIBLE_DISEASE_PAIRS.has(`${queryProfile.id}|${targetProfile.id}`);
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

  // 显式互斥：NSCLC vs SCLC 等同组不同癌种，直接判定为不匹配
  if (areDiseasesIncompatible(queryProfile, targetProfile)) {
    return {
      matched: false,
      specific: false,
      generic: false,
      incompatible: true,
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

// ---- 药物类别 → 具体药名映射，用于扩展排除疗法匹配 ----
const DRUG_CLASS_KEYWORDS = {
  // 免疫检查点抑制剂
  '免疫检查点抑制剂': ['pd1', 'pdl1', 'pd-1', 'pd-l1', 'pembrolizumab', 'nivolumab', 'atezolizumab',
    'durvalumab', 'cemiplimab', 'sintilimab', 'tislelizumab', 'camrelizumab', 'toripalimab',
    '帕博利珠', '纳武利尤', '阿替利珠', '度伐利尤', '信迪利', '卡瑞利珠', '替雷利珠',
    '特瑞普利', '派安普利', '斯鲁利', '免疫'],
  '免疫治疗': ['pd1', 'pdl1', 'pd-1', 'pd-l1', 'pembrolizumab', 'nivolumab', 'atezolizumab',
    'durvalumab', 'sintilimab', 'tislelizumab', 'camrelizumab', 'toripalimab',
    '帕博利珠', '纳武利尤', '阿替利珠', '度伐利尤', '信迪利', '卡瑞利珠', '替雷利珠',
    '特瑞普利', '派安普利', '斯鲁利', '免疫'],
  '免疫细胞治疗': ['cart', 'car-t', 'tcr', 'tils', 'nk细胞', 'dc疫苗', '过继细胞'],
  // 化疗类别
  '铂类': ['顺铂', '卡铂', '奥沙利铂', '奈达铂', 'cisplatin', 'carboplatin', 'oxaliplatin', 'platinum',
    'folfox', 'xelox', 'capeox', 'eox'],
  '蒽环类': ['阿霉素', '多柔比星', '表柔比星', '吡柔比星', '柔红霉素', 'doxorubicin', 'epirubicin'],
  // 靶向类
  'tki': ['替尼', 'tki', '吉非替尼', '厄洛替尼', '奥希替尼', '阿法替尼', '埃克替尼', '克唑替尼', '阿来替尼'],
  // HER2 靶向
  'her2靶向': ['曲妥珠', '帕妥珠', '伊尼妥', '拉帕替尼', '吡咯替尼', 'tdm1', 'trastuzumab', 'pertuzumab', 'lapatinib']
};

/**
 * 将"药物类别"描述展开为具体药物关键词列表（含原描述）
 */
const expandTherapyKeywords = (therapyDesc) => {
  const norm = normalizeText(therapyDesc);
  const keywords = new Set();
  if (norm) keywords.add(norm);
  for (const [cls, drugs] of Object.entries(DRUG_CLASS_KEYWORDS)) {
    if (norm.includes(normalizeText(cls))) {
      drugs.forEach((d) => {
        const dn = normalizeText(d);
        if (dn && dn.length >= 2) keywords.add(dn);
      });
    }
  }
  return Array.from(keywords);
};

// ---- 已知基因→正则模式（用于精确识别基因名，避免子串假阳性）----
const GENE_NAME_PATTERN = /(EGFR|ALK|ROS1|KRAS|NRAS|BRAF|HER2|ERBB2|MET|RET|NTRK[123]?|FGFR[123]?|PIK3CA|PTEN|TP53|CLDN18\.?2|ROR1|MSI[-_]?H?|TMB[-_]?H?|MMR|dMMR|BRCA[12])/i;

const normalizeGeneName = (g) => g.toLowerCase().replace(/[\.\-_\s]/g, '');

/**
 * 从基因相关文本中提取每个基因的状态
 * 返回 { geneName: { positive: bool, negative: bool, raw: string } }
 */
const extractGeneStatuses = (text) => {
  if (!text) return {};
  const result = {};
  const lower = text.toLowerCase();
  // 按段（以 ,，;；、 / 等分隔）拆分，避免跨段误判状态
  const segments = text.split(/[，,；;、\n\/]+/);
  for (const seg of segments) {
    const segLower = seg.toLowerCase();
    const m = seg.match(GENE_NAME_PATTERN);
    if (!m) continue;
    const geneRaw = m[1];
    const geneKey = normalizeGeneName(geneRaw);
    const isNeg = /野生|阴性|未检出|未见|wild|negative|wt\b|未突变/i.test(seg);
    const isPos = !isNeg && /突变|阳性|融合|扩增|表达|positive|mutation|mutated|amplif|fusion|positive|高表达|过表达|ihc\s*[23]\+|ish\s*\+|fish\s*\+/i.test(seg);
    if (!result[geneKey]) {
      result[geneKey] = { positive: false, negative: false, raw: geneRaw };
    }
    if (isPos) result[geneKey].positive = true;
    if (isNeg) result[geneKey].negative = true;
  }
  return result;
};

/**
 * 试验要求基因 vs 患者基因状态 → 判定结果
 * 返回 { excluded: bool, reason: string } 或 null（无法判定）
 */
const evaluateRequiredGeneAgainstPatient = (reqGene, diagnosis, patientGeneText) => {
  const m = reqGene.match(GENE_NAME_PATTERN);
  if (!m) return null;
  const geneRaw = m[1];
  const geneKey = normalizeGeneName(geneRaw);
  const reqWantsMutant = /突变|阳性|激活|融合|表达|positive|mutation|activating|expression|amplif|高表达|过表达|fusion/i.test(reqGene);
  const reqWantsWild = /野生|阴性|wild|negative|wt\b/i.test(reqGene);

  // 病种隐含基因状态：TNBC/三阴 = HER2 阴性
  if (geneKey === 'her2' || geneKey === 'erbb2') {
    const diag = (diagnosis || '').toLowerCase();
    if (/三阴|tnbc|tripleneg|triple-negative/i.test(diag) && reqWantsMutant) {
      return { excluded: true, reason: `试验要求 HER2 阳性，患者诊断为三阴性乳腺癌（HER2 定义为阴性）` };
    }
  }

  if (!patientGeneText) return null; // 无基因数据：不强行排除

  const statuses = extractGeneStatuses(patientGeneText);
  const patientStatus = statuses[geneKey];

  if (!patientStatus) {
    // 患者基因检测中没有这个基因 — 看是否检测了其他主要驱动基因
    const otherDrivers = Object.keys(statuses).filter((k) => k !== geneKey);
    if (otherDrivers.length >= 1 && reqWantsMutant) {
      // 例如 EGFR/ALK 检测过、明确为某状态，但没提 HER2 → 高度提示 HER2 不是阳性
      return {
        excluded: true,
        reason: `试验要求 ${geneRaw} ${reqWantsMutant ? '突变/阳性' : ''}，患者基因检测显示其他驱动基因（${otherDrivers.map((k) => k.toUpperCase()).join('、')}）但未提示 ${geneRaw} 阳性`
      };
    }
    return null; // 信息不足
  }

  // 显式状态冲突
  if (reqWantsMutant && patientStatus.negative && !patientStatus.positive) {
    return { excluded: true, reason: `试验要求 ${geneRaw} 突变/阳性，患者 ${geneRaw} 为阴性/野生型` };
  }
  if (reqWantsWild && patientStatus.positive && !patientStatus.negative) {
    return { excluded: true, reason: `试验要求 ${geneRaw} 野生型/阴性，患者 ${geneRaw} 为阳性/突变` };
  }
  return null; // 兼容
};

/**
 * 使用结构化 allowed_cancer_types 做硬过滤
 *   - 若患者诊断与所有允许癌种均不匹配（且无泛实体瘤入口）→ 排除
 *   - 若属于明确互斥的癌种对（NSCLC vs SCLC）→ 排除
 */
const evaluateAllowedCancerTypes = (allowedTypes, diagnosis) => {
  if (!Array.isArray(allowedTypes) || allowedTypes.length === 0) return null;
  if (!diagnosis) return null;

  const diagNorm = normalizeText(diagnosis);
  const diagProfile = getDiseaseProfile(diagnosis);

  let hasGenericEntry = false;
  let anySpecificMatch = false;
  let hasIncompatible = false;

  for (const cancerType of allowedTypes) {
    const isGeneric = /^(其他|泛|所有|全部)/.test(cancerType)
      || /^(晚期)?(实体瘤|实体性肿瘤|恶性肿瘤|肿瘤)/.test(cancerType.replace(/[（(].*?[）)]/, ''));

    if (isGeneric) {
      hasGenericEntry = true;
      // 解析"其他实体瘤（除外...）"中的除外条款
      const exclMatch = cancerType.match(/[（(]除外(.+?)[）)]/);
      if (exclMatch) {
        const excludedTypes = exclMatch[1].split(/[、,，]/);
        if (excludedTypes.some((et) => {
          const etNorm = normalizeText(et);
          return diagNorm.includes(etNorm) || etNorm.includes(diagNorm);
        })) {
          return { excluded: true, reason: `试验明确除外"${exclMatch[1]}"，患者诊断属排除范围` };
        }
      }
      continue;
    }

    const m = matchDiseaseText(diagnosis, cancerType);
    if (m.matched && m.specific) {
      anySpecificMatch = true;
      break;
    }
    if (m.incompatible) {
      hasIncompatible = true;
    }
    // 直接子串匹配兜底
    const ctNorm = normalizeText(cancerType);
    if (diagNorm.includes(ctNorm) || ctNorm.includes(diagNorm)) {
      anySpecificMatch = true;
      break;
    }
  }

  if (anySpecificMatch) return null;

  // 没有具体匹配且没有泛实体瘤入口 → 排除
  if (!hasGenericEntry) {
    return { excluded: true, reason: `患者诊断"${diagnosis}"不在试验允许癌种列表中：${allowedTypes.join('、')}` };
  }

  // 有泛实体瘤入口：仅当患者属已知实体瘤时通过；且若已检测到互斥（如 SCLC vs NSCLC 列表）则排除
  if (hasIncompatible && diagProfile) {
    return { excluded: true, reason: `患者诊断"${diagnosis}"与试验允许癌种语义互斥` };
  }
  return null;
};

/**
 * 解析 other_key_criteria 中的显式排除（如"暂不接收小细胞肺癌"）
 */
const evaluateOtherKeyCriteria = (otherCriteria, diagnosis) => {
  if (!Array.isArray(otherCriteria) || otherCriteria.length === 0) return null;
  if (!diagnosis) return null;
  const diagNorm = normalizeText(diagnosis);
  for (const crit of otherCriteria) {
    // "暂不接收/排除/不接受 X" 模式
    const m = crit.match(/(?:暂不接收|不接收|排除|不接受|不允许)([\u4e00-\u9fff]{2,12})/);
    if (m) {
      const excludedConcept = m[1];
      // 过滤掉无意义的截断（如"参与"等）
      if (!/癌|瘤|患者|病|症/.test(excludedConcept)) continue;
      // 使用 aliasHitsText 做"非"前缀感知的匹配，避免把 NSCLC 误判为 SCLC
      if (aliasHitsText(diagnosis, excludedConcept)) {
        return { excluded: true, reason: `试验明确"${crit}"，患者诊断属排除范围` };
      }
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

    // 癌种硬排除：基于 allowed_cancer_types
    const cancerCheck = evaluateAllowedCancerTypes(si.allowed_cancer_types, record.diagnosis);
    if (cancerCheck && cancerCheck.excluded) {
      return { score: 0, reasons: [cancerCheck.reason], excluded: true };
    }

    // 显式排除（other_key_criteria 中的"暂不接收 X"）
    const otherCheck = evaluateOtherKeyCriteria(si.other_key_criteria, record.diagnosis);
    if (otherCheck && otherCheck.excluded) {
      return { score: 0, reasons: [otherCheck.reason], excluded: true };
    }

    // 必需基因硬排除
    if (Array.isArray(si.required_genes) && si.required_genes.length > 0) {
      for (const reqGene of si.required_genes) {
        const geneVerdict = evaluateRequiredGeneAgainstPatient(reqGene, record.diagnosis, record.gene_mutation);
        if (geneVerdict && geneVerdict.excluded) {
          return { score: 0, reasons: [geneVerdict.reason], excluded: true };
        }
      }
    }

    // 既往治疗线数上限硬排除（如治疗初治试验 prior_lines_max=0）
    const patientLine = getPatientTreatmentLine(record);
    if (patientLine != null && si.prior_lines_max != null) {
      const patientPriorLines = patientLine - 1; // treatment_line=1 表示初治（0 prior）
      if (patientPriorLines > si.prior_lines_max) {
        return {
          score: 0,
          reasons: [`患者既往${patientPriorLines}线治疗，超过试验允许的最多既往线数（≤${si.prior_lines_max}线）`],
          excluded: true
        };
      }
    }

    // A9: 先验疗法硬排除 —— 若患者既往用过被试验排除的疗法，直接排除
    if (Array.isArray(si.excluded_prior_therapies) && si.excluded_prior_therapies.length > 0) {
      const patientTx = normalizeText(record.treatment || '');
      if (patientTx) {
        for (const therapy of si.excluded_prior_therapies) {
          const normTherapy = normalizeText(therapy);
          if (!normTherapy) continue;
          // 跳过含时间限定的条件（如"4周内""3个月内"），这些需要时间维度判断
          if (/\d+[周月天日]内/.test(therapy)) continue;
          // 跳过过于笼统的系统治疗描述
          if (/全身(性)?(抗肿瘤|系统)?治疗|系统(性)?(抗肿瘤)?治疗|系统性抗癌|全身化疗/.test(therapy) && !/靶向|抑制剂|单抗|抗体|免疫/.test(therapy)) continue;
          // 展开为具体药物关键词（如"免疫治疗" → 帕博利珠/纳武利尤/...）
          const keywords = expandTherapyKeywords(therapy);
          for (const kw of keywords) {
            // 短关键词（<2 字符）跳过
            if (kw.length < 2) continue;
            // 跳过过长描述（>20字符去标点后通常是复杂条件句而非药名）
            if (kw === normTherapy && kw.length > 20) continue;
            if (patientTx.includes(kw)) {
              return {
                score: 0,
                reasons: [`患者既往治疗（"${kw}"相关）命中试验排除项「${therapy}」`],
                excluded: true
              };
            }
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
