/**
 * geneParser.js — Per-gene mutation state parser
 *
 * 背景：旧实现用全局 `text.includes('野生') && text.includes(gene)` 判断基因状态，
 * 在多基因文本里会错乱：
 *   "EGFR L858R突变阳性，KRAS G12C野生型" → EGFR 被判为 wild，KRAS 同时是 mutant+wild
 *
 * 本模块按分隔符切分文本，对每个片段独立识别基因名和状态关键词，
 * 生成 `Map<geneKey, { status, raw, mutationDetail }>`。
 *
 * 仅做字符串级解析，不依赖任何网络/IO，可在每次打分调用内零成本调用。
 */

// 已知基因字母表（与 matchEngine.KNOWN_GENES 保持一致；按长度降序以便贪婪匹配长名避免 NTRK / NTRK1 重复计）
const GENE_DEFINITIONS = [
  // gene key 用规范大写形式；aliases 包含表达变体
  { key: 'NTRK1', aliases: ['ntrk1', 'ntrk-1'] },
  { key: 'NTRK2', aliases: ['ntrk2', 'ntrk-2'] },
  { key: 'NTRK3', aliases: ['ntrk3', 'ntrk-3'] },
  { key: 'NTRK',  aliases: ['ntrk'] },
  { key: 'FGFR1', aliases: ['fgfr1'] },
  { key: 'FGFR2', aliases: ['fgfr2'] },
  { key: 'FGFR3', aliases: ['fgfr3'] },
  { key: 'FGFR',  aliases: ['fgfr'] },
  { key: 'PIK3CA', aliases: ['pik3ca'] },
  { key: 'ERBB2', aliases: ['erbb2'] },
  { key: 'HER2',  aliases: ['her2', 'her-2'] },
  { key: 'EGFR',  aliases: ['egfr'] },
  { key: 'ALK',   aliases: ['alk'] },
  { key: 'ROS1',  aliases: ['ros1', 'ros-1'] },
  { key: 'KRAS',  aliases: ['kras'] },
  { key: 'NRAS',  aliases: ['nras'] },
  { key: 'HRAS',  aliases: ['hras'] },
  { key: 'BRAF',  aliases: ['braf'] },
  { key: 'MET',   aliases: ['met', 'c-met'] },
  { key: 'RET',   aliases: ['ret'] },
  { key: 'PTEN',  aliases: ['pten'] },
  { key: 'TP53',  aliases: ['tp53', 'p53'] },
  { key: 'CLDN18', aliases: ['cldn18', 'claudin18', 'claudin-18'] },
  { key: 'ROR1',  aliases: ['ror1'] },
  { key: 'PD-L1', aliases: ['pdl1', 'pd-l1', 'pd l1'] },
  { key: 'PD-1',  aliases: ['pd1', 'pd-1'] },
  { key: 'MSI-H', aliases: ['msih', 'msi-h', 'msi high'] },
  { key: 'MMR',   aliases: ['mmr', 'dmmr', 'pmmr'] },
  { key: 'TMB',   aliases: ['tmb'] }
];

// Pre-compute normalized alias lookup: 最长别名优先避免子串吞并短名
const ALIAS_LOOKUP = (() => {
  const entries = [];
  for (const def of GENE_DEFINITIONS) {
    for (const alias of def.aliases) {
      const norm = alias.toLowerCase().replace(/[\s\-_]/g, '');
      if (norm) entries.push({ key: def.key, norm, length: norm.length });
    }
  }
  // 按长度降序（ntrk1 > ntrk, fgfr1 > fgfr, msi-h > msi）
  entries.sort((a, b) => b.length - a.length);
  return entries;
})();

const STATUS_KEYWORDS = {
  mutant: [
    '突变', '阳性', '融合', '重排', '扩增', '激活', 'mutant', 'mutation',
    'positive', 'activating', 'amplification', 'fusion', 'rearrangement',
    '高表达', '过表达', '高表', '中等表达', '低表达', // 高/过 表达 → 阳性
  ],
  wild: [
    '野生', '阴性', '无突变', '未突变', 'wildtype', 'wild-type', 'wild type', 'wt',
    'negative', '未检出', '无扩增', '无融合', '无重排'
  ],
  pending: ['待检', '未检测', '未查', 'pending', '待测', '未做'],
};

// 中文/ASCII 分隔符（用于把"EGFR突变，KRAS野生"切成独立片段）
const SEGMENT_SPLIT_REGEX = /[，,；;、\n\r\/\\|]+|(?:\s{2,})/;

/**
 * 归一化文本（保留中文标点意义已在分割时使用）
 */
const normalize = (str) =>
  String(str || '').toLowerCase().replace(/[\s\-_]/g, '');

/**
 * 查片段里命中的基因；长度优先，剥离已匹配字符避免重复计 NTRK1 之后又算 NTRK。
 * 返回 [{ key, startIdx, endIdx }]
 */
const findGenesInSegment = (segmentNorm) => {
  if (!segmentNorm) return [];
  // 使用字符数组追踪"已消耗"位置
  const consumed = new Array(segmentNorm.length).fill(false);
  const hits = [];
  for (const { key, norm } of ALIAS_LOOKUP) {
    let searchStart = 0;
    while (searchStart <= segmentNorm.length - norm.length) {
      const idx = segmentNorm.indexOf(norm, searchStart);
      if (idx === -1) break;
      // 检查该区间是否已被更长的基因名消耗
      let overlaps = false;
      for (let i = idx; i < idx + norm.length; i++) {
        if (consumed[i]) { overlaps = true; break; }
      }
      if (!overlaps) {
        hits.push({ key, startIdx: idx, endIdx: idx + norm.length });
        for (let i = idx; i < idx + norm.length; i++) consumed[i] = true;
      }
      searchStart = idx + 1;
    }
  }
  return hits;
};

/**
 * 识别一段文本里的基因状态。
 * 策略：先查出所有状态关键词位置（pending 优先，其次 wild/mutant），
 * 没有关键词时根据存在情况回退到 'unknown'。
 */
const detectStatus = (segmentNorm) => {
  // pending 优先（"待检"若在文本里表示"未出结果"，即便还有其它词也是待检）
  for (const kw of STATUS_KEYWORDS.pending) {
    if (segmentNorm.includes(normalize(kw))) return 'pending';
  }
  const hasWild = STATUS_KEYWORDS.wild.some((kw) => segmentNorm.includes(normalize(kw)));
  const hasMutant = STATUS_KEYWORDS.mutant.some((kw) => segmentNorm.includes(normalize(kw)));
  if (hasWild && !hasMutant) return 'wild';
  if (hasMutant && !hasWild) return 'mutant';
  if (hasWild && hasMutant) {
    // 同片段出现冲突：倾向 wild（保守），但标记 mixed 以便上层处理
    return 'mixed';
  }
  return 'unknown';
};

/**
 * 把原始文本切成片段。中文逗号/顿号、英文逗号、分号、斜杠、换行都作切分点。
 */
const splitToSegments = (raw) => {
  if (!raw) return [];
  return String(raw)
    .split(SEGMENT_SPLIT_REGEX)
    .map((s) => s.trim())
    .filter(Boolean);
};

/**
 * 解析患者基因文本 → 每基因状态
 * @param {string|string[]} text - 单段文本或多段数组（来自 profile.geneMutations）
 * @returns {Map<string, { status: 'mutant'|'wild'|'pending'|'mixed'|'unknown', raw: string }>}
 */
const parsePatientGenes = (text) => {
  const map = new Map();
  if (!text) return map;
  const rawSegments = Array.isArray(text)
    ? text.flatMap((t) => splitToSegments(t))
    : splitToSegments(text);

  for (const segment of rawSegments) {
    const norm = normalize(segment);
    if (!norm) continue;
    const genes = findGenesInSegment(norm);
    if (genes.length === 0) continue;
    const status = detectStatus(norm);
    for (const { key } of genes) {
      const existing = map.get(key);
      // 多片段里同一基因可能出现多次 —— 优先级：mutant/wild/pending > mixed > unknown；
      // 已知明确状态不被 unknown 覆盖；新片段若更明确则更新。
      const rank = (s) => ({ unknown: 0, mixed: 1, pending: 2, wild: 3, mutant: 3 }[s] ?? 0);
      if (!existing || rank(status) > rank(existing.status)) {
        map.set(key, { status, raw: segment });
      }
    }
  }
  return map;
};

/**
 * 从试验文本中解析要求：某基因需要「突变」还是「野生」。
 * 返回 Map<geneKey, 'mutant'|'wild'|'either'>。
 */
const parseTrialGeneRequirements = (trialText) => {
  const map = new Map();
  if (!trialText) return map;
  const norm = normalize(trialText);
  // 大段试验文本，按基因临近窗口判断
  for (const { key, norm: aliasNorm } of ALIAS_LOOKUP) {
    let searchStart = 0;
    while (searchStart <= norm.length - aliasNorm.length) {
      const idx = norm.indexOf(aliasNorm, searchStart);
      if (idx === -1) break;
      const windowStart = Math.max(0, idx - 20);
      const windowEnd = Math.min(norm.length, idx + aliasNorm.length + 30);
      const window = norm.slice(windowStart, windowEnd);
      const status = detectStatus(window);
      const currentReq = map.get(key);
      const newReq = status === 'mutant' ? 'mutant' : status === 'wild' ? 'wild' : 'either';
      // 优先保留 mutant（大多数靶向试验是需要突变的）
      if (!currentReq || (newReq !== 'either' && currentReq === 'either')) {
        map.set(key, newReq);
      }
      searchStart = idx + aliasNorm.length;
    }
  }
  return map;
};

/**
 * 患者基因状态 × 试验要求 → 逐基因匹配结果
 * @returns {Array<{ gene, patientStatus, trialReq, matched: boolean, label }>}
 */
const matchGenesAgainstTrial = (patientMap, trialReqMap) => {
  const results = [];
  for (const [gene, trialReq] of trialReqMap.entries()) {
    const patient = patientMap.get(gene);
    if (!patient) continue; // 试验关心该基因但患者没有相关数据 —— 上层决定是否扣分

    let matched = false;
    let label = '';
    if (patient.status === 'pending') {
      label = `${gene}（待检测）`;
      matched = false; // 待检测不算符合，但上层可决定给少量鼓励分
    } else if (trialReq === 'mutant' && patient.status === 'mutant') {
      matched = true;
      label = `${gene}突变阳性符合`;
    } else if (trialReq === 'wild' && patient.status === 'wild') {
      matched = true;
      label = `${gene}野生型符合`;
    } else if (trialReq === 'mutant' && patient.status === 'wild') {
      matched = false;
      label = `${gene}为野生型（试验要求突变）`;
    } else if (trialReq === 'wild' && patient.status === 'mutant') {
      matched = false;
      label = `${gene}为突变阳性（试验要求野生）`;
    } else if (trialReq === 'either') {
      // 试验泛泛提到该基因，患者有数据就算关联
      matched = patient.status === 'mutant' || patient.status === 'wild';
      label = `${gene}${patient.status === 'mutant' ? '突变' : patient.status === 'wild' ? '野生' : '状态不确定'}`;
    } else {
      matched = false;
      label = `${gene}状态不确定`;
    }
    results.push({ gene, patientStatus: patient.status, trialReq, matched, label });
  }
  return results;
};

module.exports = {
  parsePatientGenes,
  parseTrialGeneRequirements,
  matchGenesAgainstTrial,
  GENE_DEFINITIONS,
  // for tests
  _findGenesInSegment: findGenesInSegment,
  _detectStatus: detectStatus,
  _normalize: normalize
};
