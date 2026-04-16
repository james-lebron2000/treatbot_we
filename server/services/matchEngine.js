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

// ---- NSCLC / SCLC 细分识别，用于避免肺癌试验错配 ----
const isNsclcText = (text) => {
  const n = normalizeText(text);
  if (!n) return false;
  return /非小细胞肺癌|nsclc|肺腺癌|肺鳞癌|肺鳞状细胞癌|肺腺鳞癌|肺大细胞癌|非鳞肺癌|非鳞状非小细胞/.test(n);
};
const isSclcText = (text) => {
  const n = normalizeText(text);
  if (!n) return false;
  if (isNsclcText(text)) return false;
  return /小细胞肺癌|sclc|小细胞癌|广泛期小细胞|局限期小细胞/.test(n);
};

// ---- 乳腺癌分子分型识别 ----
const isTnbcText = (text) => {
  const n = normalizeText(text);
  return /三阴|tnbc|三阴性乳腺/.test(n);
};
const isHer2PositiveText = (text) => {
  const n = normalizeText(text);
  if (!n) return false;
  // 需要明确"阳性"或 IHC3+ / ISH+ / FISH+
  return /her2阳性|her2\+|erbb2阳性|ihc3\+|ish\+|fish\+/.test(n);
};
const isHer2NegativeText = (text) => {
  const n = normalizeText(text);
  if (!n) return false;
  if (isTnbcText(text)) return true; // TNBC 定义上 HER2 阴性
  return /her2阴性|her2-|erbb2阴性/.test(n);
};

// 判断患者是否有免疫检查点抑制剂使用史（PD-1/PD-L1 单抗等）
const hasImmunoCheckpointHistory = (record) => {
  const text = normalizeText(
    [record.treatment, record.gene_mutation, ...(record.structured?.entities?.priorTherapies || [])]
      .filter(Boolean).join(' ')
  );
  if (!text) return false;
  // 关键词：通用类别 + 常见药名
  const KEYWORDS = [
    '帕博利珠', 'pembrolizumab', '纳武利尤', 'nivolumab', '阿替利珠', 'atezolizumab',
    '信迪利', '卡瑞利珠', '替雷利珠', '特瑞普利', '度伐利尤', 'durvalumab',
    'pd-1单抗', 'pd1单抗', 'pd-l1单抗', 'pdl1单抗', 'pd-1抑制剂', 'pd-l1抑制剂',
    '检查点抑制剂', '免疫检查点'
  ];
  return KEYWORDS.some((kw) => text.includes(normalizeText(kw)));
};

// 判断试验 required_genes 是否构成硬排除（返回排除原因字符串，或 null 表示未排除）
const evaluateRequiredGenesHard = (requiredGenes, record) => {
  // 先抽出 required gene 主名及方向
  const GENE_REGEX = /(EGFR|ALK|ROS1|KRAS|BRAF|HER2|ERBB2|MET|RET|NTRK[123]?|FGFR[1-3]?|PIK3CA|PTEN|TP53|CLDN18\.?2|ROR1|MSI-?H|MSI|TMB|MMR|DMMR|BRCA[12]?)/i;

  const parsed = [];
  for (const req of requiredGenes) {
    const m = String(req).match(GENE_REGEX);
    if (!m) continue;
    const gene = m[1].toLowerCase().replace(/[-.]/g, '');
    const reqNorm = normalizeText(req);
    const wantsMutant = /突变|阳性|融合|激活|activating|mutation|mutated|表达|positive|\+/i.test(req)
      && !/野生|阴性|wildtype|negative/i.test(req);
    const wantsWild = /野生|阴性|wildtype|wild-?type|negative/i.test(req)
      && !/突变|阳性|融合|激活|positive/i.test(req);
    parsed.push({ raw: req, gene, reqNorm, wantsMutant, wantsWild });
  }
  if (parsed.length === 0) return null;

  const patientGeneText = normalizeText(record.gene_mutation || '');
  if (!patientGeneText) return null; // 无基因信息，不做硬排除（仅降权）

  // 针对每个必需基因，判断患者是否明确不符合
  for (const { raw, gene, wantsMutant, wantsWild } of parsed) {
    // MSI-H / MSI 特殊处理
    if (gene === 'msih' || gene === 'msi') {
      if (wantsMutant) {
        if (/msi-?h|dmmr|错配修复缺陷/.test(patientGeneText)) continue; // 符合
        if (/mss|pmmr|错配修复完整|微卫星稳定/.test(patientGeneText)) {
          return `患者为 MSS/pMMR，与试验要求（${raw}）不符`;
        }
        // 状态未知 → 不硬排除
        continue;
      }
    }

    // 普通基因：从患者文本中匹配该基因段落，判断"阳性/阴性"
    const patientHas = patientGeneText.includes(gene);
    if (wantsMutant && !patientHas) {
      // 文本未明确提及该基因 —— 若患者已有其他"特异性驱动"阳性/阴性报告，
      // 说明患者已接受 NGS / 靶点 panel 检测，缺该基因通常意味其为阴性
      const otherGenesInPatient = KNOWN_GENES.filter((kg) => {
        const kgNorm = kg.replace(/[\-_]/g, '');
        if (kgNorm === gene) return false;
        // 避免把 pdl1 / tmb 等仅表达量/负荷指标作为"驱动基因"
        if (['pdl1', 'tmb', 'mmr', 'msih', 'msi'].includes(kgNorm)) return false;
        return patientGeneText.includes(kgNorm);
      });
      const patientHasAnyStateReport = /突变|阳性|融合|激活|野生|阴性|positive|activating|wildtype|wild-?type|negative/i.test(patientGeneText);
      if (otherGenesInPatient.length >= 1 && patientHasAnyStateReport) {
        return `患者基因检测已涉及${otherGenesInPatient.map((g) => g.toUpperCase()).join('、')}但未见${raw}阳性，不符合试验基因要求`;
      }
      continue; // 保守：信息不足则不硬排
    }
    if (wantsMutant && patientHas) {
      const seg = extractGeneSegment(patientGeneText, gene);
      const isNegative = /野生|阴性|wt|wildtype|negative|\-(?!\w)/.test(seg);
      const isPositive = /突变|阳性|融合|激活|positive|activating|\+/.test(seg);
      if (isNegative && !isPositive) {
        return `患者${raw.replace(/[（(].*?[）)]/, '')}检测为阴性/野生型，不符合试验基因要求`;
      }
    }
    if (wantsWild && patientHas) {
      const seg = extractGeneSegment(patientGeneText, gene);
      const isPositive = /突变|阳性|融合|激活|positive|activating/.test(seg);
      if (isPositive) {
        return `患者${raw.replace(/[（(].*?[）)]/, '')}为阳性/突变，不符合试验野生型要求`;
      }
    }
  }

  // 额外：CLDN18.2 要求 + 诊断未提 CLDN18.2 + 其他分子表型已测 → 不做硬排除（等待检测）
  return null;
};

// 抽取患者文本中围绕 gene 的临近片段（前后各 10 个字符）用于状态判断
const extractGeneSegment = (patientText, gene) => {
  const idx = patientText.indexOf(gene);
  if (idx < 0) return '';
  const start = Math.max(0, idx - 10);
  const end = Math.min(patientText.length, idx + gene.length + 10);
  return patientText.slice(start, end);
};

// 判断允许癌种与患者诊断的硬约束
const evaluateAllowedCancerTypesHard = (allowed, diagnosis) => {
  if (!diagnosis) return null;
  const diagNorm = normalizeText(diagnosis);

  // 分开 specific / generic
  const specificTypes = [];
  const genericTypes = [];
  for (const t of allowed) {
    const cleaned = String(t).replace(/[（(].*?[）)]/, '');
    const isGeneric = /^(其他|泛|所有|全部)/.test(t)
      || /^(晚期)?(实体瘤|实体性肿瘤|恶性肿瘤|肿瘤)$/.test(cleaned)
      || /全部实体瘤/.test(t);
    if (isGeneric) genericTypes.push(t);
    else specificTypes.push(t);
  }

  // 若无 specific / 全是 generic → 试验接受泛实体瘤；仅在"除外"中发现明确排除时才返回排除
  if (specificTypes.length === 0 && genericTypes.length > 0) {
    for (const g of genericTypes) {
      const excl = String(g).match(/[（(]除外(.+?)[）)]/);
      if (excl) {
        const excludedList = excl[1].split(/[、,，]/);
        for (const e of excludedList) {
          const en = normalizeText(e);
          if (en && (diagNorm.includes(en) || en.includes(diagNorm))) {
            return `试验明确除外「${e}」，患者诊断「${diagnosis}」属排除范围`;
          }
        }
      }
    }
    return null;
  }

  // 有 specific 列表：至少有一个语义匹配才通过；否则硬排除
  for (const t of specificTypes) {
    const tClean = String(t).replace(/[（(].*?[）)]/, '');
    const tNorm = normalizeText(tClean);
    if (!tNorm) continue;

    // NSCLC/SCLC 互斥保护
    if (isNsclcText(diagnosis) && isSclcText(tClean)) continue;
    if (isSclcText(diagnosis) && isNsclcText(tClean)) continue;

    // 乳腺癌 HER2+ / TNBC 互斥保护
    if (isTnbcText(diagnosis) && /her2阳性乳腺|her2\+乳腺/.test(tNorm)) continue;

    if (diagNorm.includes(tNorm) || tNorm.includes(diagNorm)) return null;
    const dm = matchDiseaseText(diagnosis, tClean);
    if (dm.matched && dm.specific) return null;
  }

  // 具体癌种未匹配：若试验也接受 generic（如"其他实体瘤"）则不硬排除
  if (genericTypes.length > 0) {
    // 若为"其他 X（除外 Y）"且患者属于 Y，排除
    for (const g of genericTypes) {
      const excl = String(g).match(/[（(]除外(.+?)[）)]/);
      if (excl) {
        const excludedList = excl[1].split(/[、,，]/);
        for (const e of excludedList) {
          const en = normalizeText(e);
          if (en && (diagNorm.includes(en) || en.includes(diagNorm))) {
            return `试验明确除外「${e}」，患者诊断「${diagnosis}」属排除范围`;
          }
        }
      }
    }
    return null;
  }

  // 没有 generic，specific 全不匹配 → 硬排除
  return `患者诊断「${diagnosis}」不在试验允许癌种列表（${specificTypes.slice(0, 3).join('、')}${specificTypes.length > 3 ? '等' : ''}）内`;
};

// 解析 other_key_criteria 中常见的硬约束
const evaluateOtherKeyCriteriaHard = (criteria, record) => {
  const diagnosis = record.diagnosis || '';
  const patientGeneText = record.gene_mutation || '';

  for (const raw of criteria) {
    const text = String(raw);
    const norm = normalizeText(text);

    // 形如"暂不接收小细胞肺癌"、"不接受X"、"不接收X"、"不入组X"
    const refuseMatch = text.match(/(?:暂不接收|不接收|不接受|不入组|暂不接受)([^，,。；;]+)/);
    if (refuseMatch) {
      const target = refuseMatch[1].trim();
      if (target) {
        // NSCLC / SCLC 严格区分
        if (isSclcText(target)) {
          if (isSclcText(diagnosis)) return `试验声明「${text}」，患者诊断为小细胞肺癌`;
          // 非 SCLC 跳过本条
        } else if (isNsclcText(target)) {
          if (isNsclcText(diagnosis)) return `试验声明「${text}」，患者诊断为非小细胞肺癌`;
        } else {
          // 仅在诊断与排除目标是同一具体疾病（通过 profile id 判断）时才硬排除
          const targetProfile = getDiseaseProfile(target);
          const diagProfile = getDiseaseProfile(diagnosis);
          if (targetProfile && diagProfile && targetProfile.id === diagProfile.id) {
            return `试验声明「${text}」，患者诊断属排除范围`;
          }
        }
      }
    }

    // "HER2 阴性" 硬约束：若患者为 HER2 阳性/IHC3+ 则排除
    if (/her2\s*阴性|her2-/.test(norm)) {
      if (isHer2PositiveText(diagnosis) || isHer2PositiveText(patientGeneText)) {
        return `试验要求 HER2 阴性，患者为 HER2 阳性`;
      }
    }

    // "HER2 阳性" 硬约束：若患者为 TNBC/HER2 阴性 → 排除
    if (/her2\s*阳性|her2\+/.test(norm)) {
      if (isTnbcText(diagnosis) || isHer2NegativeText(diagnosis) || isHer2NegativeText(patientGeneText)) {
        return `试验要求 HER2 阳性，患者为 HER2 阴性/三阴性`;
      }
    }

    // "非 MSI-H / 非 dMMR" 约束：若患者为 MSI-H/dMMR → 排除
    if (/非msi-?h|非dmmr/.test(norm) || /非\s*msi/.test(norm)) {
      if (/msi-?h|dmmr|错配修复缺陷/.test(normalizeText(patientGeneText))) {
        return `试验要求非 MSI-H/dMMR，患者为 MSI-H/dMMR`;
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

        // 对"免疫治疗/免疫检查点抑制剂"等治疗类别做语义级硬排除
        // 仅当试验排除条目为"单药类别"（非联合/双抗）时才触发，避免误伤仅用过 PD-1 单药的患者
        const monoImmunoInTrial = si.excluded_prior_therapies.some((t) => {
          const s = String(t).trim();
          if (/联合|双抗|共刺激|抗体或药物|bispecific/i.test(s)) return false;
          return /^(免疫(治疗)?|免疫检查点(抑制剂)?|pd-?l?1\s*单抗|pd-?l?1\s*抑制剂|检查点抑制剂)$/i.test(s);
        });
        if (monoImmunoInTrial && hasImmunoCheckpointHistory(record)) {
          return {
            score: 0,
            reasons: ['患者既往接受过免疫检查点抑制剂治疗，被该试验排除'],
            excluded: true
          };
        }
      }
    }

    // 治疗线数硬排除（使用 prior_lines_min / prior_lines_max）
    // 语义：treatment_line 表示"本次需要第几线"，故既往线数 = treatment_line - 1
    const patientLineForFilter = getPatientTreatmentLine(record);
    if (patientLineForFilter != null && patientLineForFilter >= 1) {
      const priorLines = patientLineForFilter - 1;
      if (si.prior_lines_max != null && priorLines > si.prior_lines_max) {
        return {
          score: 0,
          reasons: [`既往治疗${priorLines}线，超过试验允许上限（≤${si.prior_lines_max}线）`],
          excluded: true
        };
      }
      if (si.prior_lines_min != null && priorLines < si.prior_lines_min) {
        return {
          score: 0,
          reasons: [`既往治疗${priorLines}线，未达试验最低要求（≥${si.prior_lines_min}线）`],
          excluded: true
        };
      }
    }

    // 必需基因硬排除 —— 若试验明确要求激活/特定突变，而患者基因信息已知且不匹配，则排除
    if (Array.isArray(si.required_genes) && si.required_genes.length > 0) {
      const geneExclusion = evaluateRequiredGenesHard(si.required_genes, record);
      if (geneExclusion) {
        return { score: 0, reasons: [geneExclusion], excluded: true };
      }
    }

    // 允许癌种硬排除 —— 若 allowed_cancer_types 非空且诊断与之不匹配（且非泛实体瘤试验），排除
    if (Array.isArray(si.allowed_cancer_types) && si.allowed_cancer_types.length > 0 && record.diagnosis) {
      const cancerExclusion = evaluateAllowedCancerTypesHard(si.allowed_cancer_types, record.diagnosis);
      if (cancerExclusion) {
        return { score: 0, reasons: [cancerExclusion], excluded: true };
      }
    }

    // other_key_criteria 中常见硬约束：显式"除外/不接收某癌种"、"HER2 阴性"、"非 MSI-H/dMMR"等
    if (Array.isArray(si.other_key_criteria) && si.other_key_criteria.length > 0) {
      const otherExclusion = evaluateOtherKeyCriteriaHard(si.other_key_criteria, record);
      if (otherExclusion) {
        return { score: 0, reasons: [otherExclusion], excluded: true };
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
