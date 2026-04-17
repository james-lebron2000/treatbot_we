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

// ---- Therapy class → drug/keyword expansion ----
// Shared between evaluateExcludedTherapy and evaluateRequiredTherapy so class-level
// criteria (e.g., "免疫治疗") match specific drug names in patient records.
// Keys are matched against trial criterion text (normalized, no punctuation).
//
// Keep this list conservative. Each class name MUST be unambiguous so that when a
// trial's exclusion text contains the class label, patient exposure to any member
// drug is clearly a real exclusion. Narrow-scoped targeted therapy classes (e.g.,
// HER2-TKI, EGFR-TKI) are intentionally excluded here — those criteria usually
// include specific drug names already, and a loose class map risks over-exclusion
// when the trial permits a specific sub-generation.
const THERAPY_CLASSES = {
  '免疫治疗': [
    'pd1', 'pdl1', 'pd-1', 'pd-l1', 'ctla4', 'ctla-4',
    '免疫检查点', '检查点抑制剂',
    'pembrolizumab', 'nivolumab', 'atezolizumab', 'durvalumab',
    'ipilimumab', 'tremelimumab', 'avelumab', 'cemiplimab',
    '帕博利珠', '纳武利尤', '阿替利珠', '信迪利', '卡瑞利珠',
    '替雷利珠', '特瑞普利', '度伐利尤', '派安普利', '赛帕利'
  ],
  '免疫检查点抑制剂': [
    'pd1', 'pdl1', 'pd-1', 'pd-l1', 'ctla4', 'ctla-4',
    'pembrolizumab', 'nivolumab', 'atezolizumab', 'durvalumab',
    'ipilimumab', 'tremelimumab',
    '帕博利珠', '纳武利尤', '阿替利珠', '信迪利', '卡瑞利珠',
    '替雷利珠', '特瑞普利', '度伐利尤', '派安普利', '赛帕利'
  ],
  '免疫细胞治疗': ['car-t', 'cart', 'tcr-t', 'til治疗', '过继性细胞', '细胞免疫'],
  '铂类化疗': [
    '卡铂', '顺铂', '奥沙利铂', '奈达铂', 'platinum',
    'folfox', 'xelox', 'capeox', 'gemox'
  ],
  '铂类': [
    '卡铂', '顺铂', '奥沙利铂', '奈达铂', 'platinum',
    'folfox', 'xelox', 'capeox', 'gemox'
  ]
};

// Build a normalized lookup for class name → keywords (precomputed for speed).
const NORMALIZED_THERAPY_CLASSES = Object.entries(THERAPY_CLASSES).map(([cls, drugs]) => ({
  classLabel: cls,
  classNorm: normalizeText(cls),
  drugNorms: drugs.map((d) => normalizeText(d)).filter(Boolean)
}));

/**
 * Given a criterion text (normalized), return all matching therapy classes
 * whose class name appears in the text.
 */
const matchTherapyClasses = (criterionNorm) => {
  if (!criterionNorm) return [];
  return NORMALIZED_THERAPY_CLASSES.filter((c) => c.classNorm && criterionNorm.includes(c.classNorm));
};

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
  const numMatch = profile.pdl1.match(/(\d+)/);
  if (!numMatch) {
    return { status: UNCERTAIN, evidence: `无法解析PD-L1数值: ${profile.pdl1}`, confidence: 0.3 };
  }
  const patientPdl1 = Number(numMatch[1]);
  if (patientPdl1 >= s.threshold) {
    return { status: MET, evidence: `PD-L1 ${profile.pdl1} ≥ 阈值${s.threshold}%`, confidence: 0.90 };
  }
  return { status: NOT_MET, evidence: `PD-L1 ${profile.pdl1} < 阈值${s.threshold}%`, confidence: 0.90 };
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

  const patientGeneText = normalizeText(profile.geneMutationText || profile.geneMutations?.join(' ') || '');
  if (!patientGeneText) {
    return { status: UNCERTAIN, evidence: '患者基因检测信息缺失', confidence: 0.3 };
  }

  // Check each required gene against patient mutations
  const results = [];
  for (const geneReq of required) {
    const geneNorm = normalizeText(geneReq);

    // Extract the gene name from the requirement
    const geneNameMatch = geneReq.match(/(EGFR|ALK|ROS1|KRAS|BRAF|HER2|ERBB2|MET|RET|NTRK|FGFR|PIK3CA|PTEN|TP53|CLDN18|ROR1|MSI|TMB|MMR)/i);
    if (!geneNameMatch) {
      results.push({ gene: geneReq, matched: false, reason: '无法识别基因名称' });
      continue;
    }

    const geneName = normalizeText(geneNameMatch[1]);
    const patientHasGene = patientGeneText.includes(geneName);

    if (!patientHasGene) {
      results.push({ gene: geneReq, matched: false, reason: `未检测到${geneNameMatch[1]}` });
      continue;
    }

    // Check if the mutation context matches (positive/negative/wild-type)
    const reqWantsMutant = geneNorm.includes('突变') || geneNorm.includes('阳性') || geneNorm.includes('mutation') || geneNorm.includes('activating') || geneNorm.includes('融合') || geneNorm.includes('表达');
    const reqWantsWild = geneNorm.includes('野生') || geneNorm.includes('阴性') || geneNorm.includes('wildtype');

    const patientIsMutant = patientGeneText.includes(geneName) && (patientGeneText.includes('突变') || patientGeneText.includes('阳性') || patientGeneText.includes('融合') || patientGeneText.includes('表达'));
    const patientIsWild = patientGeneText.includes(geneName) && (patientGeneText.includes('野生') || patientGeneText.includes('阴性'));

    if (reqWantsMutant && patientIsMutant) {
      results.push({ gene: geneReq, matched: true, reason: `${geneNameMatch[1]}突变/阳性符合` });
    } else if (reqWantsWild && patientIsWild) {
      results.push({ gene: geneReq, matched: true, reason: `${geneNameMatch[1]}野生型符合` });
    } else if (reqWantsMutant && patientIsWild) {
      results.push({ gene: geneReq, matched: false, reason: `${geneNameMatch[1]}为野生型，试验需突变` });
    } else if (reqWantsWild && patientIsMutant) {
      results.push({ gene: geneReq, matched: false, reason: `${geneNameMatch[1]}为突变阳性，试验需野生型` });
    } else {
      // Gene detected but context unclear
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

    // 1) Direct keyword match (drug names or short phrases)
    const keywords = excNorm.split(/[，,、；;]/g).filter(Boolean);
    for (const kw of keywords) {
      if (kw.length >= 2 && patientTherapies.includes(kw)) {
        return {
          status: MET,
          evidence: `患者既往使用过"${excTherapy}"相关治疗，试验排除此类患者`,
          confidence: 0.80
        };
      }
    }

    // 2) Therapy class expansion — e.g., trial excludes "免疫治疗",
    //    map to PD-1/PD-L1 drug names and check patient record.
    const classes = matchTherapyClasses(excNorm);
    for (const c of classes) {
      for (const drugNorm of c.drugNorms) {
        if (drugNorm && patientTherapies.includes(drugNorm)) {
          return {
            status: MET,
            evidence: `患者既往治疗包含${c.classLabel}类药物（命中 "${drugNorm}"），被试验排除`,
            confidence: 0.82
          };
        }
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

  for (const reqTherapy of required) {
    const reqNorm = normalizeText(reqTherapy);

    // Generic "standard treatment" — just needs some prior treatment
    if (reqNorm.includes('标准治疗') || reqNorm.includes('失败') || reqNorm.includes('不耐受')) {
      if (patientTherapies.length > 5) { // Has some treatment history
        continue; // Met
      }
      return { status: UNCERTAIN, evidence: `"${reqTherapy}"需要确认`, confidence: 0.4 };
    }

    // Check specific therapy class using shared THERAPY_CLASSES map
    let found = false;
    const classes = matchTherapyClasses(reqNorm);
    for (const c of classes) {
      if (c.drugNorms.some((kw) => patientTherapies.includes(kw))) {
        found = true;
        break;
      }
    }

    // Direct keyword match (fallback): check drug-name substring
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
  matchTherapyClasses,
  THERAPY_CLASSES,
  MET,
  NOT_MET,
  UNCERTAIN,
  NOT_APPLICABLE
};
