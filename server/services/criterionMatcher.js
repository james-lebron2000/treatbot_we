/**
 * criterionMatcher.js — Hybrid criterion-level matching engine
 *
 * Evaluates each decomposed trial criterion against a patient profile.
 * Deterministic criteria (age, ECOG, stage, labs) use rule-based comparison.
 * Semantic criteria (gene requirements, prior therapy exclusions) are evaluated
 * via pattern matching with optional LLM fallback.
 *
 * This is the core innovation inspired by TrialGPT's criterion-level matching:
 * instead of trial-level scoring, each criterion gets an individual verdict.
 */

const { safeText } = require('../utils/text');
const {
  getDiseaseProfile,
  matchDiseaseText,
  normalizeText,
  hasGenericCancerSignal
} = require('./matchEngine');
const { parsePatientGenes } = require('./geneParser');
const { parsePdl1Expression, inferDefaultPdl1System } = require('./pdl1Parser');

// ---- Known solid tumor types (for basket trial matching) ----
const KNOWN_SOLID_TUMORS = [
  '肺癌', '乳腺癌', '肝癌', '肝细胞癌', '胃癌', '结直肠癌', '结肠癌', '直肠癌',
  '食管癌', '胰腺癌', '胆管癌', '胆道癌', '肾癌', '膀胱癌', '前列腺癌',
  '卵巢癌', '宫颈癌', '子宫内膜癌', '甲状腺癌', '鼻咽癌', '头颈癌', '黑色素瘤',
  '肉瘤', '胶质瘤', '非小细胞', '小细胞肺癌', '腺癌', '鳞癌', '尿路上皮癌',
  'nsclc', 'sclc', 'tnbc', '三阴', 'her2', 'cancer', 'carcinoma'
];

const isKnownSolidTumor = (diagNorm) => {
  return KNOWN_SOLID_TUMORS.some(t => diagNorm.includes(normalizeText(t)));
};

// ---- Result Types ----
const MET = 'met';           // Criterion is satisfied
const NOT_MET = 'not_met';   // Criterion is NOT satisfied (hard fail)
const UNCERTAIN = 'uncertain'; // Cannot determine — missing patient data
const NOT_APPLICABLE = 'not_applicable'; // Criterion doesn't apply to this patient

/**
 * Evaluate a single criterion against a patient profile (deterministic rules)
 * @param {Object} criterion - Decomposed criterion object
 * @param {Object} profile - structuredProfile from patientProfile.buildProfile
 * @returns {{ status: string, evidence: string, confidence: number }}
 */
const evaluateDeterministic = (criterion, profile) => {
  const s = criterion.structured;
  if (!s || !s.field) {
    return { status: UNCERTAIN, evidence: '无结构化数据可评估', confidence: 0.3 };
  }

  switch (s.field) {
    case 'age':
      return evaluateAge(s, profile);
    case 'ecog':
      return evaluateEcog(s, profile);
    case 'cancer_type':
      return evaluateCancerType(s, profile);
    case 'stage':
      return evaluateStage(s, profile);
    case 'treatment_line':
      return evaluateTreatmentLine(s, profile);
    case 'pdl1':
      return evaluatePdl1(s, profile);
    case 'measurable_lesion':
    case 'histology':
      // These require imaging/pathology — usually uncertain from medical records alone
      return { status: UNCERTAIN, evidence: '需要影像学/病理学确认', confidence: 0.4 };
    case 'survival_months':
      return { status: UNCERTAIN, evidence: '生存预期需要临床评估', confidence: 0.3 };
    default:
      return { status: UNCERTAIN, evidence: `未知字段类型: ${s.field}`, confidence: 0.2 };
  }
};

// ---- Deterministic Evaluators ----

const evaluateAge = (s, profile) => {
  if (profile.age == null) {
    return { status: UNCERTAIN, evidence: '患者年龄未知', confidence: 0.3 };
  }
  const age = Number(profile.age);
  if (s.min != null && age < s.min) {
    return { status: NOT_MET, evidence: `年龄${age}岁 < 最低要求${s.min}岁`, confidence: 1.0 };
  }
  if (s.max != null && age > s.max) {
    return { status: NOT_MET, evidence: `年龄${age}岁 > 上限${s.max}岁`, confidence: 1.0 };
  }
  return { status: MET, evidence: `年龄${age}岁符合${s.min || '?'}-${s.max || '?'}岁范围`, confidence: 1.0 };
};

const evaluateEcog = (s, profile) => {
  if (profile.ecog == null) {
    return { status: UNCERTAIN, evidence: 'ECOG评分未知', confidence: 0.3 };
  }
  const ecog = Number(profile.ecog);
  if (s.max != null && ecog > s.max) {
    return { status: NOT_MET, evidence: `ECOG ${ecog} > 试验要求≤${s.max}`, confidence: 1.0 };
  }
  return { status: MET, evidence: `ECOG ${ecog} 符合≤${s.max}要求`, confidence: 1.0 };
};

const evaluateCancerType = (s, profile) => {
  if (!profile.diagnosis) {
    return { status: UNCERTAIN, evidence: '诊断信息缺失', confidence: 0.2 };
  }
  const allowed = s.allowed || [];
  if (allowed.length === 0) {
    return { status: UNCERTAIN, evidence: '试验未限定癌种', confidence: 0.5 };
  }

  const diagNorm = normalizeText(profile.diagnosis);

  // NSCLC vs SCLC disambiguation — these are clinically distinct
  const diagIsNSCLC = diagNorm.includes('非小细胞') || diagNorm.includes('nsclc') || diagNorm.includes('肺腺癌') || diagNorm.includes('肺鳞癌');
  const diagIsSCLC = !diagIsNSCLC && (diagNorm.includes('小细胞肺癌') || diagNorm.includes('sclc') || diagNorm.includes('小细胞癌'));

  // Separate specific cancer types from generic catch-all entries
  const specificTypes = [];
  const genericTypes = [];
  for (const cancerType of allowed) {
    // Generic entries: start with "其他" or are standalone "实体瘤"/"恶性肿瘤" terms
    // Specific entries: "上皮来源的恶性肿瘤", "小细胞肺癌", etc.
    const isGeneric = /^(其他|泛|所有|全部)/.test(cancerType) ||
      /^(晚期)?(实体瘤|实体性肿瘤|恶性肿瘤|肿瘤)$/.test(cancerType.replace(/[（(].*?[）)]/, ''));
    if (isGeneric) {
      genericTypes.push(cancerType);
    } else {
      specificTypes.push(cancerType);
    }
  }

  // Phase 1: Check specific cancer types
  for (const cancerType of specificTypes) {
    const typeNorm = normalizeText(cancerType);

    // Strict NSCLC/SCLC check: prevent cross-matching
    const typeIsNSCLC = typeNorm.includes('非小细胞') || typeNorm.includes('nsclc') || typeNorm.includes('肺腺癌') || typeNorm.includes('肺鳞癌');
    const typeIsSCLC = !typeIsNSCLC && (typeNorm.includes('小细胞肺癌') || typeNorm.includes('sclc') || typeNorm.includes('小细胞癌'));

    if ((diagIsNSCLC && typeIsSCLC) || (diagIsSCLC && typeIsNSCLC)) {
      continue; // Skip: NSCLC and SCLC are distinct, do not cross-match
    }

    // Direct substring match
    if (diagNorm.includes(typeNorm) || typeNorm.includes(diagNorm)) {
      return { status: MET, evidence: `诊断"${profile.diagnosis}"匹配允许癌种"${cancerType}"`, confidence: 0.95 };
    }

    // Disease profile matching (alias resolution)
    const diseaseResult = matchDiseaseText(profile.diagnosis, cancerType);
    if (diseaseResult.matched && diseaseResult.specific) {
      return { status: MET, evidence: `诊断"${profile.diagnosis}"与"${cancerType}"属同一疾病谱`, confidence: 0.90 };
    }
  }

  // Phase 2: Check generic catch-all entries (basket trials / pan-tumor)
  for (const t of genericTypes) {
    // Parse exclusion clauses like "其他实体瘤（除外小细胞肺癌）"
    const exclMatch = t.match(/[（(]除外(.+?)[）)]/);
    if (exclMatch) {
      const excludedTypes = exclMatch[1].split(/[、,，]/);
      const diagExcluded = excludedTypes.some(et => {
        const etNorm = normalizeText(et);
        return diagNorm.includes(etNorm) || etNorm.includes(diagNorm);
      });
      if (diagExcluded) {
        return { status: NOT_MET, evidence: `试验明确除外"${exclMatch[1]}"，患者诊断"${profile.diagnosis}"属排除范围`, confidence: 0.95 };
      }
    }
    // Generic solid tumor match — any recognized cancer type qualifies
    if (hasGenericCancerSignal(profile.diagnosis) || isKnownSolidTumor(diagNorm)) {
      return { status: MET, evidence: `试验接受泛实体瘤，诊断"${profile.diagnosis}"属实体瘤范畴`, confidence: 0.70 };
    }
  }

  return { status: NOT_MET, evidence: `诊断"${profile.diagnosis}"不在允许癌种列表中：${allowed.join('、')}`, confidence: 0.85 };
};

const evaluateStage = (s, profile) => {
  if (!profile.stage) {
    return { status: UNCERTAIN, evidence: '分期信息缺失', confidence: 0.3 };
  }
  const required = s.required || [];
  if (required.length === 0) {
    return { status: MET, evidence: '试验未限定分期', confidence: 0.9 };
  }

  const patientStageNorm = normalizeText(profile.stage);

  // Stage equivalence mapping
  // Note: IIIB/IIIC stages overlap between iii and iv groups because
  // they are clinically considered "locally advanced" but eligible for
  // advanced-stage (晚期) trials in oncology practice
  const STAGE_GROUPS = {
    iv: ['iv期', 'iva期', 'ivb期', 'ivc期', '4期', '四期', '晚期', '转移性', '远处转移', 'metastatic', '播散期', '广泛期', 'm1', 'iiib期', 'iiic期'],
    iii: ['iii期', 'iiia期', 'iiib期', 'iiic期', '3期', '三期', '局部晚期', '局晚期', 'locallyadvanced'],
    ii: ['ii期', 'iia期', 'iib期', '2期', '二期'],
    i: ['i期', 'ia期', 'ib期', '1期', '一期', '早期']
  };

  // Normalize patient stage to canonical key
  let patientStageKey = null;
  for (const [key, aliases] of Object.entries(STAGE_GROUPS)) {
    if (aliases.some(a => patientStageNorm.includes(normalizeText(a)))) {
      patientStageKey = key;
      break;
    }
  }

  // Check if any required stage matches
  for (const reqStage of required) {
    const reqNorm = normalizeText(reqStage);

    // Direct match
    if (patientStageNorm.includes(reqNorm) || reqNorm.includes(patientStageNorm)) {
      return { status: MET, evidence: `分期"${profile.stage}"匹配要求"${reqStage}"`, confidence: 0.95 };
    }

    // Semantic equivalence
    if (patientStageKey) {
      const reqAliases = STAGE_GROUPS[patientStageKey] || [];
      if (reqAliases.some(a => reqNorm.includes(normalizeText(a)))) {
        return { status: MET, evidence: `分期"${profile.stage}"与要求"${reqStage}"语义等价`, confidence: 0.90 };
      }
    }

    // Cross-check: does the required stage belong to same group as patient?
    for (const [key, aliases] of Object.entries(STAGE_GROUPS)) {
      if (aliases.some(a => reqNorm.includes(normalizeText(a))) && key === patientStageKey) {
        return { status: MET, evidence: `分期"${profile.stage}"与"${reqStage}"属同一分期组`, confidence: 0.85 };
      }
    }
  }

  return { status: NOT_MET, evidence: `分期"${profile.stage}"不在要求列表中：${required.join('、')}`, confidence: 0.80 };
};

const evaluateTreatmentLine = (s, profile) => {
  if (profile.treatmentLine == null) {
    return { status: UNCERTAIN, evidence: '治疗线数未知', confidence: 0.3 };
  }
  const patientPriorLines = profile.treatmentLine - 1; // treatmentLine is what they NEED next

  if (s.prior_min != null && patientPriorLines < s.prior_min) {
    return { status: NOT_MET, evidence: `既往${patientPriorLines}线治疗 < 要求≥${s.prior_min}线`, confidence: 0.95 };
  }
  if (s.prior_max != null && patientPriorLines > s.prior_max) {
    return { status: NOT_MET, evidence: `既往${patientPriorLines}线治疗 > 允许≤${s.prior_max}线`, confidence: 0.95 };
  }
  return { status: MET, evidence: `既往${patientPriorLines}线治疗符合要求`, confidence: 0.95 };
};

const evaluatePdl1 = (s, profile) => {
  if (!profile.pdl1) {
    return { status: UNCERTAIN, evidence: 'PD-L1表达未知', confidence: 0.3 };
  }
  if (s.threshold == null) {
    return { status: UNCERTAIN, evidence: '试验PD-L1阈值未明确', confidence: 0.4 };
  }
  const parsed = parsePdl1Expression(profile.pdl1);
  if (!parsed || parsed.value == null) {
    return { status: UNCERTAIN, evidence: `无法解析PD-L1数值: ${profile.pdl1}`, confidence: 0.3 };
  }
  // 系统不匹配优先判定：避免拿 CPS 数值去比 TPS 阈值（或反之）造成误判
  const patientSys = parsed.system;
  const trialSys = s.system || null;
  if (patientSys && trialSys && patientSys !== trialSys) {
    return {
      status: UNCERTAIN,
      evidence: `患者PD-L1 ${patientSys} ${parsed.value}，试验要求 ${trialSys}≥${s.threshold}，指标类型不同，需医生确认`,
      confidence: 0.35
    };
  }
  // 缺系统信息时用诊断推断
  let systemUsed = patientSys || trialSys;
  let inferred = false;
  if (!systemUsed) {
    systemUsed = inferDefaultPdl1System(profile.diagnosis);
    inferred = !!systemUsed;
  }
  const suffix = inferred ? `（按${profile.diagnosis}默认${systemUsed}推断）` : '';
  const patientPdl1 = parsed.value;
  const sysLabel = systemUsed || '未标注';
  if (patientPdl1 >= s.threshold) {
    return {
      status: MET,
      evidence: `PD-L1 ${sysLabel} ${patientPdl1} ≥ 阈值${s.threshold}${suffix}`,
      confidence: inferred ? 0.75 : 0.90
    };
  }
  return {
    status: NOT_MET,
    evidence: `PD-L1 ${sysLabel} ${patientPdl1} < 阈值${s.threshold}${suffix}`,
    confidence: inferred ? 0.75 : 0.90
  };
};

// ---- Semantic Evaluators (pattern-based, no LLM needed for most cases) ----

/**
 * Evaluate a semantic criterion using pattern matching against patient profile.
 * Falls back to UNCERTAIN if pattern matching is insufficient.
 */
const evaluateSemantic = (criterion, profile) => {
  const s = criterion.structured;
  const text = normalizeText(criterion.original_text);

  if (!s) {
    return { status: UNCERTAIN, evidence: '无结构化数据，需要人工审核', confidence: 0.2 };
  }

  switch (s.field) {
    case 'gene':
      return evaluateGeneRequirement(s, profile, criterion);
    case 'prior_therapy':
      if (criterion.is_exclusion || s.excluded) {
        return evaluateExcludedTherapy(s, profile);
      }
      return evaluateRequiredTherapy(s, profile);
    default:
      return { status: UNCERTAIN, evidence: `语义条目需要进一步评估: ${criterion.subcategory}`, confidence: 0.3 };
  }
};

const evaluateGeneRequirement = (s, profile) => {
  const required = s.required || [];
  if (required.length === 0) return { status: MET, evidence: '无基因要求', confidence: 0.9 };

  // P1-FIX: 用 geneParser 按片段解析每个基因的状态，避免多基因文本里的状态错乱
  // 原实现直接在全局拼接文本上 includes('野生')，在 "EGFR突变,KRAS野生" 这类文本里会把 EGFR 也判为野生型
  const rawGeneText = profile.geneMutationText
    || (Array.isArray(profile.geneMutations) ? profile.geneMutations.join('；') : '')
    || '';
  if (!rawGeneText) {
    return { status: UNCERTAIN, evidence: '患者基因检测信息缺失', confidence: 0.3 };
  }
  const patientGeneMap = parsePatientGenes(rawGeneText);

  // 基因名识别表 —— 与 geneParser 的 GENE_DEFINITIONS 对齐的正则
  const GENE_NAME_REGEX = /(EGFR|ALK|ROS1|KRAS|NRAS|HRAS|BRAF|HER2|ERBB2|MET|RET|NTRK[123]?|FGFR[123]?|PIK3CA|PTEN|TP53|CLDN18|ROR1|MSI[- ]?H?|TMB|MMR|PD[- ]?L1|PD[- ]?1)/i;

  const results = [];
  for (const geneReq of required) {
    const geneNorm = normalizeText(geneReq);
    const geneNameMatch = geneReq.match(GENE_NAME_REGEX);
    if (!geneNameMatch) {
      results.push({ gene: geneReq, matched: false, reason: '无法识别基因名称' });
      continue;
    }

    // 归一基因 key：msih → MSI-H, pdl1 → PD-L1 等 —— 用与 geneParser 相同的大写规则
    const rawGene = geneNameMatch[1].toUpperCase().replace(/\s|-/g, '');
    const geneKeyCandidates = [
      rawGene,
      rawGene.replace(/^MSI/, 'MSI-H').replace(/-HH$/, '-H'), // MSIH → MSI-H
      rawGene.replace(/^PDL1$/, 'PD-L1'),
      rawGene.replace(/^PD1$/, 'PD-1'),
      // 与 GENE_DEFINITIONS key 完全一致的常见形式
    ];
    let patient = null;
    for (const k of geneKeyCandidates) {
      if (patientGeneMap.has(k)) { patient = patientGeneMap.get(k); break; }
    }
    // 最后兜底：扫 Map 里任何 key 的归一化形式匹配 rawGene
    if (!patient) {
      for (const [k, v] of patientGeneMap.entries()) {
        if (k.replace(/-/g, '').toUpperCase() === rawGene) { patient = v; break; }
      }
    }

    if (!patient) {
      results.push({ gene: geneReq, matched: false, reason: `未检测到${geneNameMatch[1]}` });
      continue;
    }

    const reqWantsMutant = /(突变|阳性|mutation|activating|融合|扩增|表达|positive)/i.test(geneReq);
    const reqWantsWild = /(野生|阴性|wildtype|wild[- ]?type|negative)/i.test(geneReq);

    if (patient.status === 'pending') {
      results.push({ gene: geneReq, matched: false, reason: `${geneNameMatch[1]}待检测` });
    } else if (reqWantsMutant && patient.status === 'mutant') {
      results.push({ gene: geneReq, matched: true, reason: `${geneNameMatch[1]}突变/阳性符合` });
    } else if (reqWantsWild && patient.status === 'wild') {
      results.push({ gene: geneReq, matched: true, reason: `${geneNameMatch[1]}野生型符合` });
    } else if (reqWantsMutant && patient.status === 'wild') {
      results.push({ gene: geneReq, matched: false, reason: `${geneNameMatch[1]}为野生型，试验需突变` });
    } else if (reqWantsWild && patient.status === 'mutant') {
      results.push({ gene: geneReq, matched: false, reason: `${geneNameMatch[1]}为突变阳性，试验需野生型` });
    } else if (patient.status === 'mixed') {
      results.push({ gene: geneReq, matched: false, reason: `${geneNameMatch[1]}状态存在冲突描述` });
    } else {
      results.push({ gene: geneReq, matched: false, reason: `${geneNameMatch[1]}检测到但状态不确定` });
    }
  }

  const allMatched = results.every(r => r.matched);
  const anyMatched = results.some(r => r.matched);
  const evidence = results.map(r => r.reason).join('；');

  if (allMatched) {
    return { status: MET, evidence, confidence: 0.85 };
  }
  if (anyMatched) {
    return { status: UNCERTAIN, evidence: `部分基因符合：${evidence}`, confidence: 0.5 };
  }
  return { status: NOT_MET, evidence, confidence: 0.80 };
};

/**
 * For exclusion criteria, we use a CONSISTENT semantics:
 *   MET = the exclusion condition IS triggered → patient should be EXCLUDED
 *   NOT_MET = the exclusion does NOT apply → patient is safe
 */
const evaluateExcludedTherapy = (s, profile) => {
  const excluded = s.excluded || [];
  if (excluded.length === 0) return { status: NOT_MET, evidence: '无排除治疗', confidence: 0.9 };

  const patientTherapies = normalizeText([
    ...(profile.priorTherapies || []),
    profile.treatment || ''
  ].join(' '));

  if (!patientTherapies) {
    return { status: UNCERTAIN, evidence: '患者既往治疗信息缺失', confidence: 0.3 };
  }

  // Check each excluded therapy
  for (const excTherapy of excluded) {
    const excNorm = normalizeText(excTherapy);
    // Check for drug name or therapy class overlap
    const keywords = excNorm.split(/[，,、；;]/g).filter(Boolean);
    for (const kw of keywords) {
      if (kw.length >= 2 && patientTherapies.includes(kw)) {
        return {
          status: MET,
          evidence: `患者既往使用过"${excTherapy}"相关治疗，试验排除此类患者`,
          confidence: 0.75
        };
      }
    }
  }

  return { status: NOT_MET, evidence: '患者既往治疗未命中排除标准', confidence: 0.70 };
};

const evaluateRequiredTherapy = (s, profile) => {
  const required = s.required || [];
  if (required.length === 0) return { status: MET, evidence: '无特定治疗要求', confidence: 0.9 };

  const patientTherapies = normalizeText([
    ...(profile.priorTherapies || []),
    profile.treatment || ''
  ].join(' '));

  if (!patientTherapies) {
    return { status: UNCERTAIN, evidence: '患者既往治疗信息缺失', confidence: 0.3 };
  }

  // Check for generic therapy class keywords
  const classKeywords = {
    '铂类化疗': ['铂', '卡铂', '顺铂', '奥沙利铂', 'platinum', 'folfox', 'xelox', 'capeox'],
    '免疫治疗': ['pd1', 'pdl1', 'pd-1', 'pd-l1', '免疫', '单抗', 'pembrolizumab', 'nivolumab', 'atezolizumab', '信迪利', '卡瑞利', '帕博利珠'],
    '靶向治疗': ['靶向', 'tki', '替尼', '替布', 'egfr', 'alk'],
    '化疗': ['化疗', '培美', '紫杉', '多西他赛', '依托泊苷', '伊立替康', 'folfox', 'folfiri', '卡培他滨'],
    '标准治疗': [] // Generic — accept if any treatment exists
  };

  for (const reqTherapy of required) {
    const reqNorm = normalizeText(reqTherapy);

    // Generic "standard treatment" — just needs some prior treatment
    if (reqNorm.includes('标准治疗') || reqNorm.includes('失败') || reqNorm.includes('不耐受')) {
      if (patientTherapies.length > 5) { // Has some treatment history
        continue; // Met
      }
      return { status: UNCERTAIN, evidence: `"${reqTherapy}"需要确认`, confidence: 0.4 };
    }

    // Check specific therapy class
    let found = false;
    for (const [className, keywords] of Object.entries(classKeywords)) {
      if (reqNorm.includes(normalizeText(className))) {
        found = keywords.some(kw => patientTherapies.includes(normalizeText(kw)));
        if (found) break;
      }
    }

    // Direct keyword match
    if (!found) {
      found = patientTherapies.includes(reqNorm.substring(0, Math.min(6, reqNorm.length)));
    }

    if (!found) {
      return {
        status: UNCERTAIN,
        evidence: `未确认患者是否接受过"${reqTherapy}"`,
        confidence: 0.4
      };
    }
  }

  return { status: MET, evidence: `既往治疗符合要求`, confidence: 0.75 };
};

// ---- Main Evaluation Interface ----

/**
 * Evaluate all criteria for a trial against a patient profile
 * @param {Array<Object>} criteria - Decomposed criteria array
 * @param {Object} profile - structuredProfile from patientProfile.buildProfile
 * @returns {{ results: Array, summary: Object }}
 */
const evaluateAllCriteria = (criteria, profile) => {
  if (!criteria || criteria.length === 0) {
    return { results: [], summary: { total: 0, met: 0, not_met: 0, uncertain: 0, excluded: false } };
  }

  const results = [];

  for (const criterion of criteria) {
    let result;
    if (criterion.evaluation_type === 'deterministic') {
      result = evaluateDeterministic(criterion, profile);
    } else {
      result = evaluateSemantic(criterion, profile);
    }

    results.push({
      criterion_id: criterion.criterion_id,
      original_text: criterion.original_text,
      is_exclusion: criterion.is_exclusion,
      category: criterion.category,
      subcategory: criterion.subcategory,
      ...result
    });
  }

  // Compute summary
  const met = results.filter(r => r.status === MET).length;
  const not_met = results.filter(r => r.status === NOT_MET).length;
  const uncertain = results.filter(r => r.status === UNCERTAIN).length;

  // Check for exclusion violations (exclusion criteria that ARE met = patient is excluded)
  const exclusionViolations = results.filter(r => r.is_exclusion && r.status === MET);
  // Check for inclusion failures (inclusion criteria that are NOT met)
  const inclusionFailures = results.filter(r => !r.is_exclusion && r.status === NOT_MET);

  const excluded = exclusionViolations.length > 0 || inclusionFailures.length > 0;

  // Compute a normalized match score (0-100)
  const scorableCriteria = results.filter(r => r.status !== UNCERTAIN);
  const metCount = scorableCriteria.filter(r =>
    (r.is_exclusion && r.status === NOT_MET) || // Exclusion not triggered = good
    (!r.is_exclusion && r.status === MET)         // Inclusion met = good
  ).length;
  const matchRate = scorableCriteria.length > 0 ? metCount / scorableCriteria.length : 0;

  return {
    results,
    summary: {
      total: results.length,
      met,
      not_met,
      uncertain,
      excluded,
      exclusionViolations: exclusionViolations.length,
      inclusionFailures: inclusionFailures.length,
      matchRate: Math.round(matchRate * 100),
      score: Math.round(matchRate * 99) // 0-99 scale to match existing engine
    }
  };
};

module.exports = {
  evaluateDeterministic,
  evaluateSemantic,
  evaluateAllCriteria,
  MET,
  NOT_MET,
  UNCERTAIN,
  NOT_APPLICABLE
};
