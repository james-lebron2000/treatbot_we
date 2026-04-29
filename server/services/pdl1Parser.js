/**
 * pdl1Parser.js — PD-L1 表达打分系统区分
 *
 * 临床 PD-L1 评分有三种互不相通的体系，直接比数值会误推：
 *   - TPS (Tumor Proportion Score)    肿瘤细胞占比，NSCLC 最常用  （单位 %）
 *   - CPS (Combined Positive Score)   综合阳性分数，胃癌/宫颈/食管/头颈/尿路上皮  （单位 分，无 %）
 *   - IC  (Immune Cell)               免疫细胞浸润分数，部分尿路上皮  (SP142 标准)
 *
 * 同癌种、同系统才能比较阈值。跨系统时不能强断言，只能给中等分 + 警告。
 */

const _PDL1_SYNONYMS = {
  TPS: ['tps', 'tumor proportion score', '肿瘤细胞阳性率', '肿瘤细胞比例', '肿瘤细胞占比'],
  CPS: ['cps', 'combined positive score', '综合阳性分数'],
  IC:  ['\\bic[0-3]?\\b', 'immune cell', '免疫细胞'],
};

/**
 * 从一段 PD-L1 相关文本中解析出 {system, value, raw}
 * 支持：
 *   "PD-L1 TPS 80%"       → { system: 'TPS', value: 80 }
 *   "CPS 15"              → { system: 'CPS', value: 15 }
 *   "PD-L1 ≥ 50%"         → { system: null, value: 50 }（无体系）
 *   "PD-L1 阴性"           → { system: null, value: 0 }
 *   "PD-L1 1+" (IHC 0/1+/2+/3+) → { system: 'IHC', value: 1 }
 * @param {string} text
 * @returns {{ system: string|null, value: number|null, raw: string }|null}
 */
const parsePdl1Expression = (text) => {
  if (!text) return null;
  const raw = String(text);
  const norm = raw.toLowerCase();

  // 明确体系关键词（先长后短）
  const systems = [
    { key: 'CPS', re: /\b(cps|综合阳性分数|combined\s+positive\s+score)\b/i },
    { key: 'TPS', re: /\b(tps|肿瘤细胞(阳性率|比例|占比)|tumor\s+proportion\s+score)\b/i },
    { key: 'IC',  re: /\b(ic[0-3]?\b|immune\s+cell|免疫细胞(阳性|浸润))/i }
  ];
  let system = null;
  for (const sys of systems) {
    if (sys.re.test(raw) || sys.re.test(norm)) { system = sys.key; break; }
  }

  // IHC 0/1+/2+/3+ 评分（半定量）
  const ihcMatch = raw.match(/\b([0-3])\s*\+/);
  if (!system && ihcMatch) {
    return { system: 'IHC', value: Number(ihcMatch[1]), raw };
  }

  // 阴性：默认 0
  if (/阴性|negative|未检出/i.test(raw)) {
    return { system, value: 0, raw };
  }

  // 主要数值提取：靠近 PD-L1 / TPS / CPS / IC 的第一个数字
  // 先尝试带体系的表达："TPS 80%"、"CPS≥10"
  const systemValueRe = new RegExp(`(?:tps|cps|ic[0-3]?)\\s*[:：=≥>＞大于等于约]{0,4}\\s*(\\d+)`, 'i');
  const mSystem = raw.match(systemValueRe) || norm.match(systemValueRe);
  if (mSystem) return { system, value: Number(mSystem[1]), raw };

  // 无体系表达：PD-L1 80%
  const genericRe = /pd-?\s*l1[^0-9<>=≥%]{0,10}([<>=≥]*)\s*(\d+)/i;
  const mGen = raw.match(genericRe) || norm.match(genericRe);
  if (mGen) return { system, value: Number(mGen[2]), raw };

  // 裸数字兜底
  const mNum = raw.match(/(\d+)/);
  if (mNum) return { system, value: Number(mNum[1]), raw };

  return { system, value: null, raw };
};

/**
 * 从试验文本里提取 PD-L1 阈值要求：{ system, threshold, comparator }
 * 若文本里明确写 "TPS ≥ 50%" → { system: 'TPS', threshold: 50, comparator: '>=' }
 */
const parseTrialPdl1Requirement = (trialText) => {
  if (!trialText) return null;
  const text = String(trialText);

  // 明确体系
  const sysPatterns = [
    { key: 'CPS', re: /(cps)\s*[：:]?\s*([≥>=＞]+)\s*(\d+)/i },
    { key: 'TPS', re: /(tps)\s*[：:]?\s*([≥>=＞]+)\s*(\d+)/i },
    { key: 'IC',  re: /\b(ic[0-3]?)\s*[：:]?\s*([≥>=＞]+)\s*(\d+)/i }
  ];
  for (const sp of sysPatterns) {
    const m = text.match(sp.re);
    if (m) return { system: sp.key, threshold: Number(m[3]), comparator: '>=' };
  }

  // 泛泛 "PD-L1 ≥ 50%" 没有体系关键词 —— 返回 system: null，上层按癌种默认
  const generic = text.match(/pd-?\s*l1[^0-9]{0,10}([≥>=＞]+)\s*(\d+)/i);
  if (generic) return { system: null, threshold: Number(generic[2]), comparator: '>=' };

  return null;
};

/**
 * 根据诊断推断默认的 PD-L1 评分系统（当试验/患者未明确体系时）
 * 医学惯例：
 *   NSCLC / 肺癌 → TPS
 *   胃癌 / 宫颈癌 / 食管 / 头颈 → CPS
 *   尿路上皮 → CPS 为主，部分 TPS
 */
const inferDefaultPdl1System = (diagnosis) => {
  if (!diagnosis) return null;
  const d = String(diagnosis).toLowerCase();
  if (/肺癌|nsclc|sclc|肺腺癌|肺鳞癌/.test(d)) return 'TPS';
  if (/胃癌|胃腺癌|食管|食道|头颈|鼻咽|口咽|宫颈|子宫颈|cervical/.test(d)) return 'CPS';
  if (/尿路上皮|膀胱|urothelial/.test(d)) return 'CPS'; // 保守默认 CPS
  if (/三阴|tnbc/.test(d)) return 'CPS'; // TNBC 多用 CPS
  return null;
};

/**
 * 综合评分：
 *   patient/trial 同系统 → 直接比阈值，high confidence
 *   一方缺系统：用 diagnosis 推断默认；标注 inferred=true，中等 confidence
 *   两端不同系统：拒绝比较，返回 mismatch 警告
 *
 * @returns {{
 *   verdict: 'met'|'not_met'|'uncertain'|'system_mismatch'|'no_requirement',
 *   bonus: number,           // 用于 heuristic 打分的 delta
 *   reason: string,          // 可直接加入 reasons[]
 *   patient: object|null,
 *   trial: object|null,
 *   systemUsed: string|null,
 *   inferred: boolean
 * }}
 */
const evaluatePdl1Match = (patientPdl1Text, trialText, diagnosis) => {
  const patient = parsePdl1Expression(patientPdl1Text);
  const trialReq = parseTrialPdl1Requirement(trialText);

  if (!trialReq) {
    // 试验不涉及 PD-L1 要求
    if (patient && patient.value != null) {
      // 患者有 PD-L1 数据但试验未做要求 → 仅做上下文相关提示
      return {
        verdict: 'no_requirement',
        bonus: 0,
        reason: '',
        patient,
        trial: null,
        systemUsed: null,
        inferred: false
      };
    }
    return { verdict: 'no_requirement', bonus: 0, reason: '', patient: null, trial: null, systemUsed: null, inferred: false };
  }

  if (!patient || patient.value == null) {
    return {
      verdict: 'uncertain',
      bonus: 2,
      reason: 'PD-L1 表达未知，无法与试验阈值比较',
      patient: null,
      trial: trialReq,
      systemUsed: trialReq.system,
      inferred: false
    };
  }

  // 决定比较体系
  const patientSys = patient.system;
  const trialSys = trialReq.system;
  let systemUsed = null;
  let inferred = false;

  if (patientSys && trialSys) {
    if (patientSys !== trialSys) {
      return {
        verdict: 'system_mismatch',
        bonus: 3,
        reason: `患者 PD-L1 ${patientSys} ${patient.value}，试验要求 ${trialSys}≥${trialReq.threshold}，指标类型不同需医生确认`,
        patient,
        trial: trialReq,
        systemUsed: null,
        inferred: false
      };
    }
    systemUsed = patientSys;
  } else if (patientSys && !trialSys) {
    // 试验泛泛 "PD-L1 ≥" —— 用患者系统进行比较，置信度中等
    systemUsed = patientSys;
    inferred = true;
  } else if (!patientSys && trialSys) {
    systemUsed = trialSys;
    inferred = true;
  } else {
    // 两端都没体系，用诊断推断
    const defaultSys = inferDefaultPdl1System(diagnosis);
    systemUsed = defaultSys;
    inferred = !!defaultSys;
  }

  // 做阈值比较
  const meets = patient.value >= trialReq.threshold;
  const sysLabel = systemUsed || '未标注';
  const inferredSuffix = inferred ? '（指标类型推断）' : '';
  if (meets) {
    return {
      verdict: 'met',
      bonus: inferred ? 6 : 10,
      reason: `PD-L1 ${sysLabel} ${patient.value} ≥ 试验阈值 ${trialReq.threshold}${inferredSuffix}`,
      patient,
      trial: trialReq,
      systemUsed,
      inferred
    };
  }
  return {
    verdict: 'not_met',
    bonus: inferred ? -2 : -6,
    reason: `PD-L1 ${sysLabel} ${patient.value} < 试验阈值 ${trialReq.threshold}${inferredSuffix}，可能不符合`,
    patient,
    trial: trialReq,
    systemUsed,
    inferred
  };
};

module.exports = {
  parsePdl1Expression,
  parseTrialPdl1Requirement,
  inferDefaultPdl1System,
  evaluatePdl1Match
};
