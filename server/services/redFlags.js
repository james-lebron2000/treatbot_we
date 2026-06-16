/**
 * redFlags.js — 急症红旗检测（P0 患者安全护栏）
 *
 * 背景（家属视角审阅 2026-06-07）：上传完病历立刻给一排临床试验，但若病历里已经
 * 提示肿瘤急症（脊髓压迫、上腔静脉综合征、脓毒症……），当务之急是「尽快就医」，
 * 而不是「找研究项目」。本模块对病历可检索文本做保守的关键词匹配，命中时让
 * /match 接口在响应里带 `safety.redFlag = true`，前端首屏改为急诊提示。
 *
 * 设计原则：
 *  - **宁缺毋滥**：只收录边界清晰的肿瘤急症；像「脑转移」「骨转移」「咯血」「胸腔积液」
 *    这类在肿瘤患者中非常普遍、本身不等于急症的词一律不收，避免「狼来了」。
 *  - **纯函数**：detectRedFlags(text) 不依赖 DB / req，便于单测（server/tests/redFlags.test.js）。
 *  - **词典外置思路**：词条集中在 RED_FLAG_RULES，临床顾问可直接审阅/增删。
 *
 * 这里只判定「是否命中 + 命中哪些类别」；面向患者的 banner 文案在
 * shared/copy/safety.js（前端拥有展示权），server 仅回一句通用 advice 兜底 H5。
 */

// 文本归一化：转小写 + 去所有空白。中文不受小写影响，英文与含空格写法统一可比。
const normalize = (text) => `${text == null ? '' : text}`.toLowerCase().replace(/\s+/g, '');

/**
 * 急症红旗规则。每条：
 *   key   —— 稳定标识（埋点/前端映射用）
 *   label —— 面向患者的中文短标签
 *   terms —— 命中词（已小写、去空格；中文原样）。任一命中即该类别命中。
 */
const RED_FLAG_RULES = [
  {
    key: 'spinal_cord_compression',
    label: '脊髓压迫',
    terms: ['脊髓压迫', '马尾综合征', '脊髓受压', 'spinalcordcompression', 'cordcompression', 'caudaequina']
  },
  {
    key: 'svc_syndrome',
    label: '上腔静脉综合征',
    terms: ['上腔静脉综合征', '上腔静脉阻塞', '上腔静脉受压', 'svcsyndrome', 'superiorvenacava']
  },
  {
    key: 'intracranial_hypertension',
    label: '颅内高压／脑疝',
    terms: ['脑疝', '颅内高压', '颅高压', '颅内压增高', '颅内压升高', 'brainherniation', 'uncalherniation']
  },
  {
    key: 'massive_hemorrhage',
    label: '大出血',
    terms: ['大咯血', '大出血', '消化道大出血', '消化道出血', '呕血', '失血性休克', 'massivehemorrhage', 'massivehemoptysis']
  },
  {
    key: 'respiratory_failure',
    label: '呼吸衰竭／窒息',
    terms: ['呼吸衰竭', '窒息', '气道梗阻', '气道阻塞', 'respiratoryfailure', 'airwayobstruction']
  },
  {
    key: 'cardiac_tamponade',
    label: '心包填塞',
    terms: ['心包填塞', '心脏压塞', '心包压塞', 'cardiactamponade']
  },
  {
    key: 'tumor_lysis',
    label: '肿瘤溶解综合征',
    terms: ['肿瘤溶解综合征', 'tumorlysis', 'tumourlysis']
  },
  {
    key: 'hypercalcemia_crisis',
    label: '高钙危象',
    terms: ['高钙危象', '高钙血症危象', '严重高钙血症', 'hypercalcemiccrisis', 'hypercalcaemiccrisis']
  },
  {
    key: 'febrile_neutropenia_sepsis',
    label: '粒缺发热／脓毒症',
    terms: ['粒细胞缺乏伴发热', '粒缺伴发热', '粒缺发热', '中性粒细胞缺乏伴发热', '脓毒症', '脓毒性休克', '感染性休克', 'septicshock', 'sepsis', 'febrileneutropenia']
  },
  {
    key: 'gi_perforation_obstruction',
    label: '消化道穿孔／完全梗阻',
    terms: ['消化道穿孔', '胃肠穿孔', '肠穿孔', '完全性肠梗阻', '急性肠梗阻', '急腹症', '穿孔伴腹膜炎', 'bowelperforation', 'giperforation']
  },
  {
    key: 'altered_consciousness',
    label: '意识障碍／抽搐',
    terms: ['意识障碍', '昏迷', '昏睡', '癫痫持续状态', '抽搐不止', 'comatose', 'statusepilepticus']
  },
  {
    key: 'dic',
    label: '弥散性血管内凝血',
    terms: ['弥散性血管内凝血', '弥漫性血管内凝血', 'disseminatedintravascularcoagulation']
  },
  {
    key: 'shock',
    label: '休克',
    terms: ['休克', '感染性休克', '失血性休克', '过敏性休克', 'septicshock', 'hemorrhagicshock']
  }
];

// 否定/预防前缀：命中词「同子句且紧邻」出现这些词 → 视为非阳性（无休克 / 排除上腔静脉综合征 /
// 预防肿瘤溶解综合征 / 未见脊髓压迫），避免对家属的急诊提示「狼来了」。
// 注意：不含「非」——「非感染性休克 / 非ST段…」里的「非」是类型限定词而非否定，会误抑真急症。
const NEG_PREFIX = ['无', '未', '否认', '排除', '已排除', '预防', '防止'];
// 子句/字段分隔符（含 JSON 标点，因为可检索文本里有 structured 实体的 JSON）。
const CLAUSE_BREAK = '，。；、,;：:"{}[]（）()';

// 命中词是否被否定：从命中位置回看最多 4 个字符，遇分句标点即停。
// 必须「同子句且紧邻」——否则「无胸闷，脊髓压迫」「无明显诱因出现脊髓压迫」会把真急症误判掉
// （安全检测里假阴性比假阳性更危险，故偏向「检出」）。
const negatedAt = (text, idx) => {
  let s = '';
  for (let i = idx - 1; i >= 0 && idx - i <= 4; i -= 1) {
    if (CLAUSE_BREAK.includes(text[i])) break;
    s = text[i] + s;
  }
  return NEG_PREFIX.some((n) => s.includes(n));
};

// 返回 terms 里第一个「非否定」的命中词；都被否定则返回 null。
const firstRealHit = (text, terms) => {
  for (const term of terms) {
    if (!term) continue;
    let idx = text.indexOf(term);
    while (idx !== -1) {
      if (!negatedAt(text, idx)) return term;
      idx = text.indexOf(term, idx + term.length);
    }
  }
  return null;
};

/**
 * 检测文本中的急症红旗。
 * @param {string} text 病历可检索文本（诊断 + 结构化实体 JSON + 摘要等拼接）
 * @returns {{ redFlag: boolean, categories: Array<{key:string,label:string}>, matchedTerms: string[], advice: string }}
 */
const detectRedFlags = (text) => {
  const normalized = normalize(text);
  const categories = [];
  const matchedTerms = [];

  if (normalized) {
    for (const rule of RED_FLAG_RULES) {
      const hit = firstRealHit(normalized, rule.terms);
      if (hit) {
        categories.push({ key: rule.key, label: rule.label });
        matchedTerms.push(hit);
      }
    }
  }

  const redFlag = categories.length > 0;
  return {
    redFlag,
    categories,
    matchedTerms,
    advice: redFlag
      ? '病历可能提示需紧急处理的情况，请尽快前往医院急诊或联系主诊医生，不要以参加研究项目替代急诊处理。'
      : ''
  };
};

/**
 * 从一组病历记录拼出可检索文本。容忍各种字段缺失。
 * @param {Array<Object>} records MedicalRecord 行（含 diagnosis / stage / summary / structured.entities）
 * @returns {string}
 */
const buildSearchableText = (records) => {
  if (!Array.isArray(records)) return '';
  const parts = [];
  for (const r of records) {
    if (!r) continue;
    if (r.diagnosis) parts.push(`${r.diagnosis}`);
    if (r.stage) parts.push(`${r.stage}`);
    if (r.summary) parts.push(`${r.summary}`);
    if (r.raw_text) parts.push(`${r.raw_text}`);
    const entities = r.structured && r.structured.entities;
    if (entities) {
      try {
        parts.push(JSON.stringify(entities));
      } catch (e) {
        /* ignore non-serializable */
      }
    }
  }
  return parts.join(' \n ');
};

module.exports = {
  RED_FLAG_RULES,
  normalize,
  detectRedFlags,
  buildSearchableText
};
