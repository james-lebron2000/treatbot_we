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
    if (!normalizedAlias) return false;
    // 正向匹配：text 包含 alias
    if (normalizedText.includes(normalizedAlias)) {
      // 规避否定前缀碰撞：alias 在 text 中出现，但紧邻前缀是 "非" 且 alias 本身不以 "非" 开头 → 实际是相反的疾病
      const idx = normalizedText.indexOf(normalizedAlias);
      if (idx > 0 && normalizedText[idx - 1] === '非' && !normalizedAlias.startsWith('非')) {
        return false;
      }
      return true;
    }
    // 反向匹配：alias 包含 text（如 "胰腺癌" ⊂ "胰腺导管腺癌"）
    if (normalizedAlias.includes(normalizedText)) {
      // 规避否定前缀碰撞：alias 以 "非"+text 形式出现时，二者为相反疾病
      if (normalizedAlias.startsWith('非') && !normalizedText.startsWith('非')
          && normalizedAlias.slice(1).includes(normalizedText)) {
        return false;
      }
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

// ---- 必需基因判定 ----
// 返回：{ excluded: bool, uncertain: bool, matched: bool, reason: string }
const GENE_NAME_RE = /(HER2|ERBB2|EGFR|ALK|ROS1|KRAS|NRAS|BRAF|MET|RET|NTRK[123]?|FGFR[123]?|PIK3CA|PTEN|TP53|CLDN18(?:\.?2)?|ROR1|MSI[-\s]?H?|TMB|MMR|dMMR|pMMR|CD19|CD20|BCMA|CyclinD1|MAGE[-\s]?A?4?|HLA[-\s]?A\*?\d+|BRCA[12]?|PD-?L1)/i;

const patientHasTNBC = (record) => {
  const text = safeLower(`${record.diagnosis || ''} ${record.gene_mutation || ''}`);
  return /三阴|三阴性|tnbc|triple.?negative/i.test(text);
};

const extractGeneStatusFromPatient = (geneName, patientGeneText) => {
  // 以基因名为锚点，向后取最多 30 字符，判断野生/阴性/突变/阳性等上下文
  const norm = safeLower(patientGeneText);
  const gn = geneName.toLowerCase();
  // 以该基因名出现的所有位置查上下文
  const re = new RegExp(gn.replace(/[-.]/g, '[-.]?'), 'gi');
  const statuses = { wild: false, mutant: false, mentioned: false };
  let m;
  while ((m = re.exec(norm)) != null) {
    statuses.mentioned = true;
    const ctx = norm.slice(m.index, m.index + gn.length + 30);
    if (/野生|阴性|wild|negative|wt(\W|$)/.test(ctx)) statuses.wild = true;
    if (/突变|阳性|mutation|positive|融合|重排|fusion|表达|ihc\s*[23]|ihc3|cps|activating|激活|扩增|amplification/.test(ctx)) {
      statuses.mutant = true;
    }
  }
  return statuses;
};

const evaluateRequiredGenes = (requiredGenes, record) => {
  const patientGeneText = safeText(record.gene_mutation || '');
  if (!patientGeneText && !record.diagnosis) {
    return { uncertain: true, reason: `试验要求基因：${requiredGenes.join('、')}，患者基因检测信息缺失` };
  }

  // 逐项基因要求检查：只要有一个明确矛盾即硬排除
  const uncertainList = [];
  const matchedList = [];
  for (const req of requiredGenes) {
    const geneMatch = req.match(GENE_NAME_RE);
    if (!geneMatch) {
      // 无法识别基因名，算作不确定项
      uncertainList.push(req);
      continue;
    }
    const geneName = geneMatch[1].toLowerCase();
    const reqWantsMutant = /突变|mutation|激活|activating|融合|fusion|阳性|positive|表达|expression|ihc\s*[23]|fish\+|ish\s*阳|高表达|扩增|amplification|重排/i.test(req);
    const reqWantsWild = /野生|阴性|wild|negative|\bwt\b/i.test(req);

    // 特殊规则：TNBC 天然为 HER2 阴性
    if ((geneName === 'her2' || geneName === 'erbb2') && reqWantsMutant && patientHasTNBC(record)) {
      return {
        excluded: true,
        reason: `试验要求${req}，但患者为三阴性乳腺癌（HER2阴性），不符合`
      };
    }

    const status = extractGeneStatusFromPatient(geneName, patientGeneText);

    if (!status.mentioned) {
      uncertainList.push(req);
      continue;
    }
    if (reqWantsMutant && status.wild && !status.mutant) {
      return { excluded: true, reason: `试验要求${req}，患者${geneMatch[1].toUpperCase()}为野生型/阴性，不符合` };
    }
    if (reqWantsWild && status.mutant && !status.wild) {
      return { excluded: true, reason: `试验要求${req}，患者${geneMatch[1].toUpperCase()}为突变/阳性，不符合` };
    }
    if ((reqWantsMutant && status.mutant) || (reqWantsWild && status.wild)) {
      matchedList.push(req);
    } else {
      // 提到了基因但上下文不清 —— 视为不确定
      uncertainList.push(req);
    }
  }

  if (matchedList.length > 0 && uncertainList.length === 0) {
    return { matched: true, reason: `基因要求符合（${matchedList.join('、')}）` };
  }
  if (matchedList.length > 0 && uncertainList.length > 0) {
    return { matched: true, reason: `部分基因要求符合（${matchedList.join('、')}），另有${uncertainList.length}项待确认` };
  }
  return { uncertain: true, reason: `试验要求基因：${requiredGenes.join('、')}，患者相关状态未明确，需补充检测` };
};

// ---- 允许癌种判定（NSCLC/SCLC 互斥、乳腺 vs 肝癌 等）----
const evaluateAllowedCancerTypes = (allowedTypes, record) => {
  const diagText = safeText(record.diagnosis || '');
  if (!diagText) {
    return { excluded: false }; // 无诊断信息，不在此阶段硬排除
  }
  const diagNorm = normalizeText(diagText);
  const patientIsNSCLC = /非小细胞|nsclc|肺腺癌|肺鳞癌|非鳞状非小细胞/i.test(diagText);
  // 只有在不是 NSCLC 时才判定为 SCLC（避免"非小细胞"误匹配 SCLC）
  const patientIsSCLC = !patientIsNSCLC && /小细胞肺癌|sclc|小细胞癌|广泛期|局限期/i.test(diagText);

  // 拆分"其他/泛实体瘤"等 catch-all 条目
  let hasGenericCatchAll = false;
  let catchAllExcludes = [];
  const specificTypes = [];
  for (const t of allowedTypes) {
    const isCatchAll = /^(其他|泛|所有|全部)/.test(t) || /^(晚期)?(实体瘤|实体性肿瘤|恶性肿瘤|肿瘤|癌症)$/.test(t.replace(/[（(].*?[）)]/, ''));
    if (isCatchAll) {
      hasGenericCatchAll = true;
      const exclMatch = t.match(/[（(]除外(.+?)[）)]/);
      if (exclMatch) {
        catchAllExcludes.push(...exclMatch[1].split(/[、,，]/).map((s) => s.trim()));
      }
    } else {
      specificTypes.push(t);
    }
  }

  const patientProfile = getDiseaseProfile(diagText);

  // 先尝试具体癌种匹配：匹配上则直接通过（catch-all 的除外条款只作用于 catch-all 范畴）
  let anySpecificMatch = false;
  for (const t of specificTypes) {
    const tm = matchDiseaseText(diagText, t);
    if (tm.matched) {
      // NSCLC vs SCLC 互斥校验
      const typeIsNSCLC = /非小细胞|nsclc|非鳞状非小细胞|肺腺癌|肺鳞癌/i.test(t);
      const typeIsSCLC = !typeIsNSCLC && /小细胞肺癌|sclc|小细胞癌/i.test(t);
      if ((patientIsNSCLC && typeIsSCLC) || (patientIsSCLC && typeIsNSCLC)) continue;
      anySpecificMatch = true;
      break;
    }
    // profile 强匹配兜底
    const tProfile = getDiseaseProfile(t);
    if (tProfile && patientProfile && tProfile.id === patientProfile.id) {
      anySpecificMatch = true;
      break;
    }
  }
  if (anySpecificMatch) return { excluded: false, matched: 'specific' };

  // 再检查 catch-all 的除外项（仅当患者仅能通过 catch-all 纳入时才生效）
  for (const ex of catchAllExcludes) {
    if (!ex) continue;
    const exProfile = getDiseaseProfile(ex);
    if (exProfile && patientProfile && exProfile.id !== patientProfile.id) continue;
    if (exProfile && patientProfile && exProfile.id === patientProfile.id) {
      return { excluded: true, reason: `试验在"其他实体瘤（除外${ex}）"范畴下明确排除${ex}，患者诊断"${diagText}"属排除范围` };
    }
    const exNorm = normalizeText(ex);
    const diagN = normalizeText(diagText);
    if (exNorm.length >= 2 && diagN.includes(exNorm)) {
      const idx = diagN.indexOf(exNorm);
      if (idx === 0 || diagN[idx - 1] !== '非') {
        return { excluded: true, reason: `试验明确除外"${ex}"，患者诊断"${diagText}"属排除范围` };
      }
    }
  }

  if (hasGenericCatchAll) return { excluded: false, matched: 'generic' };

  return {
    excluded: true,
    reason: `患者诊断"${diagText}"不在试验允许的癌种（${allowedTypes.join('、')}）中`
  };
};

// ---- 其他关键条件中的"暂不接收/不接收/排除/除外"硬过滤 ----
const evaluateOtherKeyCriteria = (criteria, record) => {
  const diagText = safeText(record.diagnosis || '');
  if (!diagText) return { excluded: false };
  const diagNorm = normalizeText(diagText);
  const patientProfile = getDiseaseProfile(diagText);

  for (const crit of criteria) {
    if (!crit) continue;
    const matches = crit.match(/(?:暂不接[收受]|不接[收受]|暂不入组|不入组|除外|排除)\s*([^，。；,.;、]+)/g) || [];
    for (const m of matches) {
      const target = m.replace(/^(?:暂不接[收受]|不接[收受]|暂不入组|不入组|除外|排除)\s*/, '').trim();
      if (!target) continue;
      const targetProfile = getDiseaseProfile(target);
      // profile 不同的癌种（如 NSCLC vs SCLC、肝癌 vs 肺癌）不视为命中
      if (targetProfile && patientProfile && targetProfile.id !== patientProfile.id) continue;
      if (targetProfile && patientProfile && targetProfile.id === patientProfile.id) {
        return { excluded: true, reason: `试验在关键条件中明确"${m}"，患者诊断"${diagText}"属排除范围` };
      }
      if (target.length >= 2) {
        const targetNorm = normalizeText(target);
        const idx = diagNorm.indexOf(targetNorm);
        if (idx >= 0 && (idx === 0 || diagNorm[idx - 1] !== '非')) {
          return { excluded: true, reason: `试验在关键条件中明确"${m}"，患者诊断"${diagText}"属排除范围` };
        }
      }
    }
  }
  return { excluded: false };
};

// ---- 排除的既往疗法判定（带免疫/铂类等类别扩展）----
const EXCLUDED_THERAPY_CLASS_MAP = [
  {
    aliases: [/免疫治疗/, /免疫检查点/, /pd-?1/i, /pd-?l1/i, /抗pd/i, /checkpoint/i, /ici\b/i],
    patientKeywords: [
      'pd-1', 'pd1', 'pd-l1', 'pdl1', '帕博利珠', 'pembrolizumab', '信迪利', 'sintilimab',
      '卡瑞利珠', 'camrelizumab', '替雷利珠', 'tislelizumab', '阿替利珠', 'atezolizumab',
      '度伐利尤', 'durvalumab', 'nivolumab', '纳武利尤', '特瑞普利', 'toripalimab',
      '免疫治疗', '免疫检查点', '检查点抑制剂', 'ici'
    ]
  },
  {
    aliases: [/免疫细胞治疗/, /car-?t/i, /\btil\b/i, /\bnk\b/i, /细胞治疗/],
    patientKeywords: ['car-t', 'cart', 'til', '过继', '免疫细胞']
  }
];

const evaluateExcludedPriorTherapies = (excluded, record) => {
  const patientTx = normalizeText(record.treatment || '');
  if (!patientTx) return { excluded: false };

  for (const therapy of excluded) {
    if (!therapy) continue;
    const normTherapy = normalizeText(therapy);

    // 跳过含时间限定的排除（如"4周内"），需要时间维度判断
    if (/\d+\s*[周月天日年]\s*内/.test(therapy)) continue;
    // 跳过笼统"全身治疗"描述（无具体类别）
    if (/全身(性)?(抗肿瘤)?治疗|系统(性)?(抗肿瘤)?治疗|全身化疗/.test(therapy)
        && !/靶向|抑制剂|单抗|抗体|免疫|pd|化疗|铂/i.test(therapy)) continue;

    // 判断是否为"联合/双抗"等组合疗法 —— 只在患者既往治疗存在该组合时才算命中
    const isComboExclusion = /联合|双抗|\+|combo|combination/i.test(therapy);

    // 先做类别扩展匹配
    let matched = false;
    let matchedKeyword = null;
    for (const cls of EXCLUDED_THERAPY_CLASS_MAP) {
      if (cls.aliases.some((re) => re.test(therapy))) {
        if (isComboExclusion) {
          // 组合疗法排除：仅当患者治疗文本同时包含"联合"+对应类别药物时才命中
          // 例如试验排除"抗PD-(L)1单抗联合抗CTLA4单抗"，则患者既往必须含 CTLA4（伊匹木/曲美木）
          const comboPartners = extractComboPartners(therapy);
          if (comboPartners.length > 0) {
            // 需要患者既往治疗同时命中类别（免疫）药物 + partner 之一
            const hasClass = cls.patientKeywords.some((kw) => patientTx.includes(normalizeText(kw)));
            const partnerHit = comboPartners.find((p) => patientTx.includes(normalizeText(p)));
            if (hasClass && partnerHit) {
              matched = true;
              matchedKeyword = `${therapy}（患者含 ${partnerHit}）`;
            }
          }
        } else {
          for (const kw of cls.patientKeywords) {
            if (patientTx.includes(normalizeText(kw))) {
              matched = true;
              matchedKeyword = kw;
              break;
            }
          }
        }
        if (matched) break;
      }
    }

    // 若无类别匹配，回退到直接子串（短名）匹配
    if (!matched && !isComboExclusion && normTherapy && normTherapy.length <= 20) {
      if (patientTx.includes(normTherapy)) {
        matched = true;
        matchedKeyword = therapy;
      }
    }

    if (matched) {
      return {
        excluded: true,
        reason: `患者既往治疗包含「${matchedKeyword}」，属于试验排除的「${therapy}」类治疗`
      };
    }
  }
  return { excluded: false };
};

// 从组合疗法描述中提取"伙伴靶点/药物"名称，用于严格判定组合治疗排除
const extractComboPartners = (therapy) => {
  const partners = [];
  // CTLA4 组合
  if (/ctla-?4/i.test(therapy)) {
    partners.push('ctla-4', 'ctla4', '伊匹木', 'ipilimumab', '曲美木', 'tremelimumab');
  }
  // TIGIT 组合
  if (/tigit/i.test(therapy)) {
    partners.push('tigit', 'vibostolimab', 'tiragolumab');
  }
  // LAG-3
  if (/lag-?3/i.test(therapy)) {
    partners.push('lag-3', 'lag3', 'relatlimab');
  }
  // 共刺激通路通用词
  if (/共刺激|共抑制/.test(therapy)) {
    partners.push('共刺激', '共抑制');
  }
  return partners;
};

const scoreRecordAgainstTrial = (record, trial) => {
  let score = 10; // 基础分
  const reasons = [];
  let geneUncertaintyPenalty = 0;

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

    // ---- 治疗线数硬过滤（prior_lines_min / prior_lines_max）----
    // treatment_line = 患者即将接受的下一线（NEXT line），因此既往线数 = treatment_line - 1
    const patientLineForHard = getPatientTreatmentLine(record);
    if (patientLineForHard != null) {
      const patientPriorLines = Math.max(0, patientLineForHard - 1);
      if (si.prior_lines_max != null && patientPriorLines > si.prior_lines_max) {
        const label = si.prior_lines_max === 0 ? '初治（无既往系统治疗）' : `既往≤${si.prior_lines_max}线`;
        return {
          score: 0,
          reasons: [`试验要求${label}，患者既往${patientPriorLines}线治疗，不符合`],
          excluded: true
        };
      }
      if (si.prior_lines_min != null && si.prior_lines_min > 0 && patientPriorLines < si.prior_lines_min) {
        return {
          score: 0,
          reasons: [`试验要求既往≥${si.prior_lines_min}线治疗，患者仅${patientPriorLines}线，不符合`],
          excluded: true
        };
      }
    }

    // ---- 必需基因硬/软过滤（required_genes）----
    // 如果试验明确要求某基因状态，而患者状态与之矛盾 → 硬排除；未知 → 软性扣分
    if (Array.isArray(si.required_genes) && si.required_genes.length > 0) {
      const geneVerdict = evaluateRequiredGenes(si.required_genes, record);
      if (geneVerdict.excluded) {
        return { score: 0, reasons: [geneVerdict.reason], excluded: true };
      }
      if (geneVerdict.uncertain) {
        // 患者对所有要求基因都无明确记录，给出较大负分以阻止误高分推荐
        // 若患者基因检测已呈现其它主流位点（推测已做过 panel）却未测到目标基因 → 更大的惩罚
        const hasGenePanel = !!safeText(record.gene_mutation || '').match(/(野生|阴性|wild|阳性|突变|positive|negative|融合|fusion|扩增|amplification)/i);
        geneUncertaintyPenalty = hasGenePanel ? 40 : 22;
        reasons.push(geneVerdict.reason);
      }
      if (geneVerdict.matched) {
        reasons.push(geneVerdict.reason);
      }
    }

    // ---- 允许癌种硬过滤（allowed_cancer_types）----
    // 在 NSCLC vs SCLC、乳腺 vs 肝癌等场景防止交叉错配
    if (Array.isArray(si.allowed_cancer_types) && si.allowed_cancer_types.length > 0) {
      const diseaseVerdict = evaluateAllowedCancerTypes(si.allowed_cancer_types, record);
      if (diseaseVerdict.excluded) {
        return { score: 0, reasons: [diseaseVerdict.reason], excluded: true };
      }
    }

    // ---- 其他关键条件中的"暂不接收/排除"硬过滤 ----
    if (Array.isArray(si.other_key_criteria) && si.other_key_criteria.length > 0) {
      const otherVerdict = evaluateOtherKeyCriteria(si.other_key_criteria, record);
      if (otherVerdict.excluded) {
        return { score: 0, reasons: [otherVerdict.reason], excluded: true };
      }
    }

    // A9: 先验疗法硬排除 —— 若患者既往用过被试验排除的疗法，直接排除
    if (Array.isArray(si.excluded_prior_therapies) && si.excluded_prior_therapies.length > 0) {
      const therapyVerdict = evaluateExcludedPriorTherapies(si.excluded_prior_therapies, record);
      if (therapyVerdict.excluded) {
        return { score: 0, reasons: [therapyVerdict.reason], excluded: true };
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

  // ---- 应用必需基因状态未知的扣分 ----
  if (geneUncertaintyPenalty > 0) {
    score -= geneUncertaintyPenalty;
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
