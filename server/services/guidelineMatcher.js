/**
 * guidelineMatcher.js — A 轨：标准治疗（指南）匹配（P1）
 *
 * 与 B 轨（临床试验）复用同一份 structuredProfile（services/patientProfile.buildProfile 的输出），
 * 把患者画像映射到 data/guidelines.json 里的标准方案，回答家属最先问的：
 *   「我家人这个病，规范、循证的治疗大概是什么？我们走到哪一步了？」
 *
 * 设计原则（与 data/guidelines.json 的 framing_rules 一致）：
 *  - 只做「教育/科普」：输出「指南通常推荐」，绝不输出处方或「你应该用 X」。
 *  - 数据不足时**显式说不足**（stageUnknown / needsGeneTest），而不是不懂装懂硬给一个方案。
 *  - 纯函数，default 注入 guidelines.json，便于单测（server/tests/guidelineMatcher.test.js）。
 */

// 容错加载：guidelines.json 缺失不应崩整个 API 启动。
// 背景：部署时若 GHCR 镜像拉取超时会回退到"源码本地 build"，该路径下镜像可能不含此数据文件
// （2026-06 一次 7-PR 连环合并触发的部署事故根因）。与 matchEngine 懒加载数据同philosophy：
// 缺失则指南功能降级为"暂无可用指南"，但 API 正常启动、匹配/认证等其余功能不受影响。
let guidelines;
try {
  guidelines = require('../data/guidelines.json');
} catch (err) {
  // eslint-disable-next-line no-console
  console.warn('[guidelineMatcher] guidelines.json 加载失败，指南功能降级为空数据集:', err && err.message);
  guidelines = { _meta: {}, cancers: [] };
}

// 已知可作为「驱动基因/标志物」用于一线选药的基因（大写）。
const KNOWN_DRIVERS = ['EGFR', 'ALK', 'ROS1', 'KRAS', 'HER2', 'MET', 'RET', 'BRAF', 'NTRK'];

const lower = (v) => `${v == null ? '' : v}`.toLowerCase();
const norm = (v) => lower(v).replace(/\s+/g, '');

// 单码罗马数字（Ⅰ-Ⅳ，中文报告常见）→ ASCII，便于统一识别。
const ROMAN_MAP = { 'Ⅰ': 'I', 'Ⅱ': 'II', 'Ⅲ': 'III', 'Ⅳ': 'IV', 'ⅰ': 'i', 'ⅱ': 'ii', 'ⅲ': 'iii', 'ⅳ': 'iv' };

/**
 * 把分期文本归类成粗粒度 bucket。
 * 原则：① 显式分期（广泛期/局限期/罗马数字/局部晚期）优先于宽松的「转移/晚期」提示；
 *      ② 罗马数字按长→短避免子串误判（III 含 II 含 I）；
 *      ③「转移」只在远处转移时算 advanced——剔除被否定（无/未见）与区域（淋巴结）转移，
 *         避免把「IIIA 期纵隔淋巴结转移」误判为晚期、把「无远处转移」误判为晚期。
 * @returns {'extensive'|'limited'|'advanced'|'local_advanced'|'early'|null}
 */
const classifyStage = (text) => {
  const t = norm(`${text == null ? '' : text}`.replace(/[ⅠⅡⅢⅣⅰⅱⅲⅳ]/g, (ch) => ROMAN_MAP[ch] || ch));
  if (!t) return null;
  if (t.includes('广泛期') || t.includes('extensive')) return 'extensive';
  if (t.includes('局限期') || t.includes('limited')) return 'limited';
  // 显式罗马数字 / 局部晚期 优先（在宽松的转移/晚期之前）
  if (/iv/.test(t)) return 'advanced';
  if (/iii|局部晚期|不可切除/.test(t)) return 'local_advanced';
  if (/ii(a|b)?/.test(t)) return 'early';                                  // II / IIA / IIB
  if (/(^|[^a-z])i(a|b)?([^a-z]|$)|i期|早期|可切除/.test(t)) return 'early'; // I / IA / IB / I期
  // 宽松提示：仅在无显式分期时使用。剔除被否定的转移/晚期，以及区域（淋巴结）转移。
  const loose = t
    .replace(/(无|未见|未|排除|否认)(远处转移|远端转移|多发转移|广泛转移|转移性|转移瘤|转移|晚期)/g, '')
    .replace(/(淋巴结|区域|局部)转移/g, '');
  if (/转移|m1|晚期/.test(loose)) return 'advanced';
  return null;
};

// 患者分期 bucket 与方案 bucket 是否「相容」。
const stageCompatible = (patientBucket, regimenBucket) => {
  if (!patientBucket) return true; // 患者分期未知：先全展示，由前端提示去确认分期
  if (patientBucket === regimenBucket) return true;
  // 「晚期 / 广泛期」两套体系都表示广泛转移，互认
  const advancedSet = new Set(['advanced', 'extensive']);
  if (advancedSet.has(patientBucket) && advancedSet.has(regimenBucket)) return true;
  return false;
};

/**
 * 从 PD-L1 文本里抽数值（百分比）；"阴性"/"<1" 记 0；抽不到返回 null。
 * 先取数值再判阴性——否则「PD-L1 90% 阴性对照」「TPS 49% 阴性内对照」会被笼统的「阴性」误清零。
 */
const extractPdl1 = (text) => {
  const t = lower(text);
  if (!t) return null;
  const m = t.match(/(?:tps|cps|pd-?l1)[^0-9]{0,8}(\d{1,3})/) || t.match(/(\d{1,3})\s*%/);
  if (m) {
    const n = parseInt(m[1], 10);
    if (!Number.isNaN(n)) return Math.min(n, 100);
  }
  if (t.includes('阴性') || t.includes('negative') || t.includes('<1')) return 0;
  return null;
};

// 阳性证据 / 否定 词表（用于原始报告串 / 自由文本的驱动判定）。
const POS_TOKENS = ['突变', '阳性', '融合', '扩增', '重排', '敏感', '缺失', '插入', 'exon', '外显子', 'mutation', 'positive', 'fusion', 'amplif', 'rearrang', 'l858r', '19del', 'ex20', 't790m', 'g12c', '(+)', '（+）'];
const NEG_TOKENS = ['阴性', '野生', 'wild', 'negative', '(-)', '（-）', '无', '未', '排除', '否认'];

// 短基因符号（MET/RET/ALK 等）用词边界匹配，避免命中 parameter/centimeter 之类（数字算边界，故 EGFR19del 仍命中）。
const geneInClause = (clause, g) => new RegExp(`(^|[^a-z])${g}([^a-z]|$)`).test(clause);

/**
 * 从一段「原始报告串 / 自由文本」抽阳性驱动基因。按标点切句，逐句要求：
 * 句内有阳性证据(POS) 且 不含否定词(NEG)，才把句中出现的基因计为阳性。
 * 这样「EGFR、ALK、ROS1均为阴性」「EGFR突变阳性，无ALK融合」都能正确处理，
 * 不会被固定窗口的否定词「串句」误伤（agent 复审发现的 window-bleed）。模糊时宁可不计。
 */
const positiveGenesFromText = (raw) => {
  const out = new Set();
  const t = `${raw || ''}`.toLowerCase();
  if (!t) return out;
  for (const clause of t.split(/[、，,；;。\n\r/／]+/)) {
    if (!clause) continue;
    if (NEG_TOKENS.some((n) => clause.includes(n))) continue;
    if (!POS_TOKENS.some((p) => clause.includes(p))) continue;
    for (const gene of KNOWN_DRIVERS) {
      if (geneInClause(clause, gene.toLowerCase())) out.add(gene);
    }
  }
  return out;
};

/**
 * 从画像抽出「阳性驱动基因」集合（大写）。
 *  - molecular.drivers / molecular.actionable 是 LLM 已归类的阳性驱动 → 直接信任；
 *  - geneMutations / geneMutationText 是原始报告串（buildProfile 把 gene_mutation 原文整段塞进来，
 *    含「阴性/野生型/未见突变」描述）→ 必须有阳性证据且无否定才计。
 *    这修掉了「EGFR、ALK、ROS1均为阴性」被当成 EGFR 阳性、误推靶向的严重 bug。
 * @returns {Set<string>}
 */
const extractDrivers = (profile) => {
  const set = new Set();
  const trustGene = (g) => {
    const up = `${g || ''}`.toUpperCase();
    const hit = KNOWN_DRIVERS.find((k) => up.includes(k));
    if (hit) set.add(hit);
  };

  // 1) 结构化、已确认的阳性驱动 → 直接信任
  const mol = (profile && profile.molecular) || {};
  for (const arr of [mol.drivers, mol.actionable]) {
    if (Array.isArray(arr)) {
      for (const item of arr) {
        if (!item) continue;
        if (typeof item === 'object' && item.gene) trustGene(item.gene);
        else if (typeof item === 'string') for (const g of positiveGenesFromText(item)) set.add(g);
      }
    }
  }
  // geneMutations 里的「对象」也信任；字符串内容已并入 geneMutationText，由下方统一判定
  if (Array.isArray(profile && profile.geneMutations)) {
    for (const item of profile.geneMutations) {
      if (item && typeof item === 'object' && item.gene) trustGene(item.gene);
    }
  }

  // 2) 原始报告串 / 自由文本：要求阳性证据 + 无否定
  for (const g of positiveGenesFromText((profile && (profile.geneMutationText || profile.geneMutation)) || '')) {
    set.add(g);
  }

  return set;
};

// 是否有任何基因检测信息（用于判断 needsGeneTest）。
const hasAnyGeneInfo = (profile) => {
  const mol = (profile && profile.molecular) || {};
  if (Array.isArray(mol.drivers) && mol.drivers.length) return true;
  if (Array.isArray(mol.actionable) && mol.actionable.length) return true;
  if (Array.isArray(profile && profile.geneMutations) && profile.geneMutations.length) return true;
  if (norm(profile && (profile.geneMutationText || profile.geneMutation || ''))) return true;
  return false;
};

/** 用诊断/病理文本匹配癌种：取「命中名最长」者，避免 "肺癌" 误盖 "小细胞肺癌"。 */
const findCancer = (profile, data = guidelines) => {
  const hay = norm(`${profile && profile.diagnosis} ${profile && profile.pathologyType}`);
  if (!hay) return null;
  let best = null;
  let bestLen = 0;
  for (const cancer of (data.cancers || [])) {
    for (const name of (cancer.names || [])) {
      const n = norm(name);
      if (n && hay.includes(n) && n.length > bestLen) {
        best = cancer;
        bestLen = n.length;
      }
    }
  }
  return best;
};

// 统一的方案对外形状（matchGuidelines 与 getCancerEducation 共用）。
const shapeRegimen = (r, why = []) => ({
  id: r.id,
  title: r.title,
  drugs: r.drugs || [],
  evidenceLevel: r.evidenceLevel || '',
  insurance: r.insurance || '',
  sideEffects: r.sideEffects || [],
  plain: r.plain || '',
  source: r.source || '',
  talkToDoctor: r.talkToDoctor || '',
  whyMatched: why
});

/**
 * 主入口：把画像映射到标准方案。
 * @param {Object} profile structuredProfile（buildProfile 的输出）
 * @param {Object} [data] 指南数据（默认 guidelines.json，可注入用于测试）
 * @returns {{
 *   matched: boolean,
 *   cancer: Object|null,
 *   stageBucket: string|null,
 *   treatmentLine: number|null,
 *   regimens: Array<Object>,
 *   flags: { stageUnknown: boolean, needsGeneTest: boolean, drivers: string[] },
 *   coverageNote: string,
 *   disclaimer: string
 * }}
 */
const matchGuidelines = (profile, data = guidelines) => {
  const meta = data._meta || {};
  const base = {
    matched: false,
    cancer: null,
    stageBucket: null,
    treatmentLine: (profile && profile.treatmentLine != null) ? profile.treatmentLine : null,
    regimens: [],
    flags: { stageUnknown: true, needsGeneTest: false, drivers: [] },
    coverageNote: meta.coverage_note || '',
    accessGuidance: meta.access_guidance || [],
    accessDisclaimer: meta.access_disclaimer || '',
    disclaimer: meta.disclaimer || ''
  };

  if (!profile) return base;

  const cancer = findCancer(profile, data);
  if (!cancer) return base; // 癌种不在 MVP 覆盖范围 → matched=false，前端给「拓展中」兜底

  const stageBucket = classifyStage(`${profile.stage || ''} ${profile.tnmStage || ''}`);
  const drivers = extractDrivers(profile);
  const pdl1 = extractPdl1(profile.pdl1);
  const line = base.treatmentLine;

  const matchedRegimens = [];
  for (const r of (cancer.regimens || [])) {
    const applies = r.applies || {};
    const why = [];

    // 1) 分期相容——对 applies.stages 里的每个口径分桶，任一相容即可。
    // （SCLC「局限期」同时列了 I/II/III，只看 stages[0] 会让罗马数字分期的 SCLC 匹配不到。）
    const regimenBuckets = (applies.stages || []).map((s) => classifyStage(s)).filter(Boolean);
    const stageOk = regimenBuckets.length === 0
      ? true
      : regimenBuckets.some((b) => stageCompatible(stageBucket, b));
    if (!stageOk) continue;
    if (stageBucket) why.push('分期相符');

    // 2) 治疗线数（未知则不排除）
    if (applies.lineMax != null && line != null && line > applies.lineMax) continue;

    // 3) 驱动基因/标志物门槛
    if (Array.isArray(applies.drivers) && applies.drivers.length) {
      const hit = applies.drivers.find((g) => drivers.has(`${g}`.toUpperCase()));
      if (!hit) continue;
      why.push(`基因匹配：${hit}`);
    } else if (applies.driversNegative) {
      if (drivers.size > 0) continue; // 有可用驱动基因时，不推「无驱动」的方案
      if (applies.pdl1Min != null) {
        if (pdl1 == null || pdl1 < applies.pdl1Min) continue;
        why.push(`PD-L1 ≥ ${applies.pdl1Min}%`);
      } else {
        why.push('暂未发现可用驱动基因');
      }
    }

    matchedRegimens.push(shapeRegimen(r, why));
  }

  const advanced = stageBucket === 'advanced' || stageBucket === 'extensive';
  const needsGeneTest = cancer.key === 'nsclc' && advanced && (drivers.size === 0 || pdl1 == null) && !hasAnyGeneInfo(profile);

  return {
    matched: true,
    cancer: {
      key: cancer.key,
      plainName: cancer.plainName,
      intro: cancer.intro,
      keyTests: cancer.keyTests || []
    },
    stageBucket,
    treatmentLine: line,
    regimens: matchedRegimens,
    flags: {
      stageUnknown: !stageBucket,
      needsGeneTest,
      drivers: Array.from(drivers)
    },
    coverageNote: meta.coverage_note || '',
    accessGuidance: meta.access_guidance || [],
    accessDisclaimer: meta.access_disclaimer || '',
    disclaimer: meta.disclaimer || ''
  };
};

// 病种科普：列出已覆盖癌种（用于无病历时的无门槛入口）。
const listCancers = (data = guidelines) =>
  (data.cancers || []).map((c) => ({ key: c.key, plainName: c.plainName }));

// 病种科普：按癌种 key 返回「标准治疗概览」（不依赖画像，展示该病全部方案）。
const getCancerEducation = (key, data = guidelines) => {
  const meta = data._meta || {};
  const cancer = (data.cancers || []).find((c) => c.key === `${key}`);
  if (!cancer) return null;
  return {
    matched: true,
    mode: 'education',
    cancer: {
      key: cancer.key,
      plainName: cancer.plainName,
      intro: cancer.intro,
      keyTests: cancer.keyTests || []
    },
    stageBucket: null,
    treatmentLine: null,
    regimens: (cancer.regimens || []).map((r) => shapeRegimen(r, [])),
    flags: { stageUnknown: false, needsGeneTest: false, drivers: [] },
    coverageNote: meta.coverage_note || '',
    accessGuidance: meta.access_guidance || [],
    accessDisclaimer: meta.access_disclaimer || '',
    disclaimer: meta.disclaimer || ''
  };
};

module.exports = {
  KNOWN_DRIVERS,
  classifyStage,
  stageCompatible,
  extractPdl1,
  extractDrivers,
  findCancer,
  shapeRegimen,
  matchGuidelines,
  listCancers,
  getCancerEducation
};
