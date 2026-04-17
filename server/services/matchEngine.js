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

/**
 * 已知实体瘤泛癌关键词 —— 用于判断是否命中 "其他实体瘤" 等泛瘤种入组口径
 */
const KNOWN_SOLID_TUMORS_FOR_FILTER = [
  '肺癌', '非小细胞', 'nsclc', '小细胞肺癌', 'sclc', '肺腺癌', '肺鳞癌',
  '乳腺癌', '肝癌', '肝细胞癌', '胃癌', '胃腺癌', '贲门癌', '胃食管',
  '结直肠', '结肠', '直肠', '食管癌', '胰腺癌', '胆管', '胆道',
  '肾癌', '膀胱癌', '前列腺', '卵巢癌', '宫颈', '子宫', '甲状腺癌',
  '鼻咽', '头颈', '黑色素瘤', '肉瘤', '胶质瘤', '尿路上皮', '三阴',
  'tnbc', 'her2', 'carcinoma', 'cancer', '腺癌', '鳞癌'
];

/**
 * 判断患者诊断是否符合试验 allowed_cancer_types 限制
 * 返回 { incompatible: boolean, reason?: string }
 *
 * 规则：
 *  1. 有任一具体癌种通过疾病谱/别名/子串匹配 → 相容
 *  2. 有 "其他实体瘤" / "泛实体瘤" 等泛癌兜底 → 相容（并检查 "除外X"）
 *  3. NSCLC/SCLC 明确互斥，禁止串扰
 *  4. 以上均不命中 → 不相容
 */
const checkCancerTypeCompatibility = (diagnosis, allowedTypes) => {
  const diagNorm = normalizeText(diagnosis);
  if (!diagNorm || !Array.isArray(allowedTypes) || allowedTypes.length === 0) {
    return { incompatible: false };
  }

  // 患者癌种侧向分类：NSCLC vs SCLC
  const diagIsNSCLC = /非小细胞|nsclc|肺腺癌|肺鳞癌|肺腺鳞|肺大细胞/.test(diagNorm);
  const diagIsSCLC = !diagIsNSCLC && /小细胞肺癌|sclc|小细胞癌/.test(diagNorm);

  const specifics = [];
  const generics = [];
  for (const t of allowedTypes) {
    const isGeneric = /^(其他|泛|所有|全部)/.test(t)
      || /^(晚期)?(实体瘤|实体性肿瘤|恶性肿瘤|肿瘤)$/.test(t.replace(/[（(].*?[）)]/g, ''));
    (isGeneric ? generics : specifics).push(t);
  }

  // Phase 1: 具体癌种匹配
  for (const t of specifics) {
    const tNorm = normalizeText(t);
    const tIsNSCLC = /非小细胞|nsclc|肺腺癌|肺鳞癌/.test(tNorm);
    const tIsSCLC = !tIsNSCLC && /小细胞肺癌|sclc|小细胞癌/.test(tNorm);
    if ((diagIsNSCLC && tIsSCLC) || (diagIsSCLC && tIsNSCLC)) {
      continue; // 绝不串扰
    }
    // 双向子串匹配
    if (diagNorm.includes(tNorm) || tNorm.includes(diagNorm)) {
      return { incompatible: false };
    }
    // 疾病谱别名匹配
    const dm = matchDiseaseText(diagnosis, t);
    if (dm.matched && dm.specific) {
      return { incompatible: false };
    }
  }

  // Phase 2: 泛实体瘤兜底 —— 包含 "除外X" 子句解析
  for (const t of generics) {
    const exclMatch = t.match(/[（(]?除外(.+?)[）)]?$/)
      || t.match(/[（(]除外(.+?)[）)]/);
    if (exclMatch) {
      const excludedList = exclMatch[1].split(/[、,，和]/);
      const diagExcluded = excludedList.some((e) => {
        const en = normalizeText(e);
        return en && (diagNorm.includes(en) || en.includes(diagNorm));
      });
      if (diagExcluded) {
        return { incompatible: true, reason: `试验明确除外 "${exclMatch[1]}"，患者诊断 "${diagnosis}" 属排除范围` };
      }
    }
    // 兜底接受：诊断属于已知实体瘤关键词或含泛癌信号
    if (hasGenericCancerSignal(diagnosis)
        || KNOWN_SOLID_TUMORS_FOR_FILTER.some((k) => diagNorm.includes(normalizeText(k)))) {
      return { incompatible: false };
    }
  }

  // 均不命中 → 不相容
  return {
    incompatible: true,
    reason: `诊断 "${diagnosis}" 不在试验允许癌种范围内：${allowedTypes.join('、')}`
  };
};

/**
 * 从 required_genes 规格中提取规范化基因名
 * 返回 { name, wantsMutant, wantsWild, wantsExpression }
 */
const parseGeneRequirement = (spec) => {
  const specNorm = normalizeText(spec);
  const specRaw = String(spec || '');
  // 已知基因别名 → 规范名
  const GENE_PATTERNS = [
    { name: 'HER2', re: /her2|erbb2/i },
    { name: 'EGFR', re: /egfr/i },
    { name: 'ALK', re: /alk/i },
    { name: 'ROS1', re: /ros1/i },
    { name: 'KRAS', re: /kras/i },
    { name: 'NRAS', re: /nras/i },
    { name: 'BRAF', re: /braf/i },
    { name: 'MET', re: /\bmet\b|c-met/i },
    { name: 'RET', re: /\bret\b/i },
    { name: 'NTRK', re: /ntrk/i },
    { name: 'FGFR', re: /fgfr/i },
    { name: 'PIK3CA', re: /pik3ca/i },
    { name: 'PTEN', re: /pten/i },
    { name: 'TP53', re: /tp53|p53/i },
    { name: 'CLDN18', re: /cldn18|claudin18/i },
    { name: 'ROR1', re: /ror1/i },
    { name: 'MSI', re: /\bmsi\b|微卫星|msi-?h|dmmr|mmr/i },
    { name: 'TMB', re: /\btmb\b/i }
  ];
  let name = null;
  for (const g of GENE_PATTERNS) {
    if (g.re.test(specRaw)) { name = g.name; break; }
  }
  const wantsWild = /野生|阴性|wildtype|wild-?type/i.test(specNorm);
  const wantsMutant = !wantsWild && /突变|阳性|激活|mutation|activating|融合|扩增|重排|fusion|amplif/i.test(specNorm);
  const wantsExpression = /表达|expression|过表达|ihc[23]/i.test(specNorm);
  return { name, wantsMutant: wantsMutant || wantsExpression, wantsWild, raw: specRaw };
};

/**
 * 从患者文本中判断其对指定基因的状态
 * 返回 'positive' | 'negative' | 'absent' | 'unknown'
 */
const patientGeneStatus = (patientGeneText, diagnosis, geneName) => {
  if (!geneName) return 'unknown';
  const text = safeLower(patientGeneText || '');
  const diagLower = safeLower(diagnosis || '');

  // 诊断中的隐含基因信息（如 TNBC = HER2阴性）
  if (/三阴|tnbc/i.test(diagLower) && geneName === 'HER2') return 'negative';
  if (/her2阳性|her2\s*\+|her2阳性乳腺癌/i.test(diagLower) && geneName === 'HER2') return 'positive';

  if (!text) return 'unknown';

  // 构造基因名的灵活正则（HER2 / ERBB2 别名）
  const aliasMap = {
    'HER2': /her2|erbb2/i,
    'EGFR': /egfr/i,
    'ALK': /alk/i,
    'ROS1': /ros1/i,
    'KRAS': /kras/i,
    'NRAS': /nras/i,
    'BRAF': /braf/i,
    'MET': /\bmet\b|c-met/i,
    'RET': /\bret\b/i,
    'NTRK': /ntrk/i,
    'FGFR': /fgfr/i,
    'PIK3CA': /pik3ca/i,
    'CLDN18': /cldn18|claudin18/i,
    'ROR1': /ror1/i,
    'MSI': /\bmsi\b|微卫星|msi-?h|dmmr|mmr/i,
    'TMB': /\btmb\b/i
  };
  const re = aliasMap[geneName];
  if (!re || !re.test(text)) return 'absent';

  // 按基因名 "之后" 的 15 字符窗口判断状态（遇到分隔符停止，避免跨基因串扰）
  const matches = [...text.matchAll(new RegExp(re.source, 'gi'))];
  for (const m of matches) {
    const after = text.slice(m.index + (m[0] || '').length, m.index + (m[0] || '').length + 15);
    // 截断到第一个分隔符前（逗号/顿号/分号/分号/换行/and），防止把别的基因状态卷进来
    const window = after.split(/[,，、;；\n]|\band\b|\|/)[0];
    if (/野生|阴性|wildtype|wild-?type|未检出|未见|wt\b/i.test(window)) return 'negative';
    if (/突变|阳性|融合|扩增|重排|表达|activating|mutation|positive|高表达|过表达|ihc\s*[23]|[\s]*\+/i.test(window)) return 'positive';
  }
  return 'unknown';
};

/**
 * 判断患者是否与 required_genes 硬性冲突
 * 返回冲突原因字符串，若无冲突返回 null
 */
const checkRequiredGeneMismatch = (record, requiredGenes) => {
  const patientGeneText = record.gene_mutation || '';
  const diagnosis = record.diagnosis || '';
  // 若患者完全无基因信息 + 诊断中无相关线索 → uncertain，不硬排
  const hasAnyGeneInfo = patientGeneText && patientGeneText.trim().length > 0;

  const reqs = requiredGenes.map(parseGeneRequirement).filter((r) => r.name);
  if (reqs.length === 0) return null;

  // 至少有一个 required gene 与患者状态相容则不排除
  let anyMatch = false;
  const conflictReasons = [];
  for (const req of reqs) {
    const status = patientGeneStatus(patientGeneText, diagnosis, req.name);
    if (req.wantsMutant || req.wantsExpression) {
      if (status === 'positive') { anyMatch = true; break; }
      if (status === 'negative') {
        conflictReasons.push(`${req.name}（患者${req.name}阴性/野生型，试验需阳性/突变）`);
      }
    } else if (req.wantsWild) {
      if (status === 'negative') { anyMatch = true; break; }
      if (status === 'positive') {
        conflictReasons.push(`${req.name}（患者${req.name}阳性，试验需阴性/野生型）`);
      }
    } else {
      // 未明确方向 → 至少患者存在该基因信息即接受
      if (status !== 'absent' && status !== 'unknown') { anyMatch = true; break; }
    }
  }

  if (anyMatch) return null;

  // 常规基因检测面板内的标志物：患者已有基因面板但缺失该项 → 视为阴性（硬排）
  // 罕见/专科标志物（ROR1/MAGE/HLA/特殊融合等）：需要专门检测，缺失 → 不硬排
  const ROUTINE_PANEL = new Set(['HER2', 'EGFR', 'ALK', 'ROS1', 'KRAS', 'NRAS', 'BRAF', 'MET', 'PIK3CA', 'TP53', 'MSI']);
  const allRoutine = reqs.every((r) => ROUTINE_PANEL.has(r.name));

  if (hasAnyGeneInfo) {
    if (conflictReasons.length > 0) {
      return `基因要求冲突：${conflictReasons.join('；')}`;
    }
    // 仅对常规面板基因做 "缺失即阴性" 硬排；专科标志物缺失 → 保留为 UNCERTAIN
    if (allRoutine) {
      return `试验要求 ${reqs.map((r) => r.name).join('/')} 阳性/突变，患者已有基因检测但未见相应阳性结果`;
    }
    return null;
  }

  // 通过诊断推断的隐含冲突（如 TNBC 对 HER2+）
  const implicitNeg = reqs.some((req) => {
    const status = patientGeneStatus('', diagnosis, req.name);
    return (req.wantsMutant || req.wantsExpression) && status === 'negative';
  });
  if (implicitNeg) {
    const first = reqs.find((req) => patientGeneStatus('', diagnosis, req.name) === 'negative');
    return `患者诊断已隐含 ${first.name} 阴性，与试验要求不符`;
  }

  return null;
};

/**
 * 解析 other_key_criteria 中 "暂不接收X" / "不接收X" / "不招收X" 模式，
 * 若患者诊断命中 X 则返回排除原因
 */
const checkOtherKeyExclusion = (diagnosis, otherCriteria) => {
  const diagNorm = normalizeText(diagnosis);
  if (!diagNorm) return null;
  // NSCLC/SCLC 区分
  const diagIsNSCLC = /非小细胞|nsclc|肺腺癌|肺鳞癌/.test(diagNorm);
  const diagIsSCLC = !diagIsNSCLC && /小细胞肺癌|sclc|小细胞癌/.test(diagNorm);

  for (const raw of otherCriteria) {
    const c = String(raw || '');
    const m = c.match(/(?:暂不|不予|不得|不招收|不接收|禁止)\s*(?:接收|纳入|招收|入组)?\s*(.+?)(?:[;；。]|$)/);
    if (!m) continue;
    const target = m[1].trim();
    const targetNorm = normalizeText(target);
    if (!targetNorm) continue;
    // NSCLC/SCLC 精准分流
    const targetIsSCLC = /小细胞肺癌|sclc|小细胞癌/.test(targetNorm);
    const targetIsNSCLC = /非小细胞|nsclc|肺腺癌|肺鳞癌/.test(targetNorm);
    if (targetIsSCLC && diagIsSCLC) {
      return `试验明确 "${c}"，患者诊断属小细胞肺癌`;
    }
    if (targetIsNSCLC && diagIsNSCLC) {
      return `试验明确 "${c}"，患者诊断属非小细胞肺癌`;
    }
    if (targetIsSCLC || targetIsNSCLC) continue; // 避免 NSCLC/SCLC 串扰
    if (diagNorm.includes(targetNorm) || targetNorm.includes(diagNorm)) {
      return `试验明确 "${c}"，患者诊断命中排除范围`;
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
    // ECOG ≥3 默认硬排除（典型肿瘤试验均不接收 PS≥3），除非试验明确放宽
    if (ecog != null && Number(ecog) >= 3 && si.ecog_max == null
        && (si.required_histology || si.required_measurable_lesion)) {
      return { score: 0, reasons: [`ECOG评分（${ecog}）过高，典型肿瘤试验均要求 PS≤2`], excluded: true };
    }

    // ---- 癌种硬过滤：基于 allowed_cancer_types ----
    if (Array.isArray(si.allowed_cancer_types) && si.allowed_cancer_types.length > 0 && record.diagnosis) {
      const cancerCheck = checkCancerTypeCompatibility(record.diagnosis, si.allowed_cancer_types);
      if (cancerCheck.incompatible) {
        return { score: 0, reasons: [cancerCheck.reason], excluded: true };
      }
    }

    // ---- 治疗线数硬过滤 ----
    const patientLineForFilter = getPatientTreatmentLine(record);
    const patientPriorLines = patientLineForFilter != null ? patientLineForFilter - 1 : null;
    if (si.prior_lines_max === 0) {
      // 试验仅招募未经治疗患者
      const hasPriorTx = (patientPriorLines != null && patientPriorLines >= 1)
        || (record.treatment && safeText(record.treatment).trim().length > 0);
      if (hasPriorTx) {
        return {
          score: 0,
          reasons: ['试验仅招募未经系统治疗的患者，患者已有既往治疗'],
          excluded: true
        };
      }
    } else if (si.prior_lines_max != null && patientPriorLines != null && patientPriorLines > si.prior_lines_max) {
      return {
        score: 0,
        reasons: [`患者既往${patientPriorLines}线治疗超过试验上限${si.prior_lines_max}线`],
        excluded: true
      };
    }
    if (si.prior_lines_min != null && patientPriorLines != null && patientPriorLines < si.prior_lines_min) {
      return {
        score: 0,
        reasons: [`患者既往${patientPriorLines}线治疗不满足试验要求≥${si.prior_lines_min}线`],
        excluded: true
      };
    }

    // ---- 必需基因硬过滤 ----
    if (Array.isArray(si.required_genes) && si.required_genes.length > 0) {
      const geneMismatch = checkRequiredGeneMismatch(record, si.required_genes);
      if (geneMismatch) {
        return { score: 0, reasons: [geneMismatch], excluded: true };
      }
    }

    // ---- 其它关键排除条件：解析 "暂不接收X" / "不接收X" / "除外X" ----
    if (Array.isArray(si.other_key_criteria) && si.other_key_criteria.length > 0 && record.diagnosis) {
      const otherExcl = checkOtherKeyExclusion(record.diagnosis, si.other_key_criteria);
      if (otherExcl) {
        return { score: 0, reasons: [otherExcl], excluded: true };
      }
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
        // 类别级匹配：仅当试验排除的是 "单药/类别" 级免疫治疗（而非 COMBO/双抗），才对已知 PD-1/PD-L1 单药进行硬排
        const IMMUNO_DRUGS = ['pd1', 'pdl1', 'pd-1', 'pd-l1', '帕博利珠', 'pembrolizumab', '纳武利尤', 'nivolumab',
          '阿替利珠', 'atezolizumab', '信迪利', '卡瑞利珠', '替雷利珠', '特瑞普利', '度伐利尤', 'durvalumab'];
        const hasGenericImmunoExclusion = si.excluded_prior_therapies.some((t) => {
          const tn = String(t || '').trim();
          // COMBO/双抗级排除不触发单药类别排除
          if (/联合|双抗|bispecific/i.test(tn)) return false;
          // 仅短文本且整体为泛类别描述
          if (tn.length > 18) return false;
          return /^(免疫(治疗|检查点(抑制剂)?)|免疫细胞治疗|抗pd-?\(?l?\)?1(单抗)?|抗ctla-?4?(单抗)?|pd-?\(?l?\)?1单抗|pd-?1\/pd-?l1抑制剂)$/i.test(tn);
        });
        if (hasGenericImmunoExclusion) {
          const patientTxLower = safeLower(record.treatment || '');
          if (IMMUNO_DRUGS.some((drug) => patientTxLower.includes(drug))) {
            return {
              score: 0,
              reasons: ['患者既往接受过免疫治疗，被该试验排除'],
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
