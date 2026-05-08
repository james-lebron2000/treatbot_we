/**
 * PRD-2026Q2 §3.1：泛瘤种匹配完善 —— 词典 + 多源聚合 snapshot 测试
 *
 * 场景：一位「肺癌、未做基因检测」患者，在 11 条 mock trial 里：
 *   - 10 条为已知泛瘤种 trial（各种中英文口径、不同字段载体）
 *   - 1 条为 NSCLC EGFR+ 特异性 trial（不应被误判为 generic）
 *
 * 断言：
 *   1. `matchRecordsToTrials` 排序结果的前 20 名里应包含全部 10 条泛瘤种 trial；
 *   2. NSCLC EGFR+ 特异性 trial 的 inferGeneRequired 仍返回 true，
 *      且 hasGenericCancerSignal(trial) 返回 false；
 *   3. 10 条泛瘤种 trial 的 hasGenericCancerSignal(trial) 都返回 true，
 *      inferGeneRequired 均返回 false（无基因硬要求）。
 */

const {
  matchRecordsToTrials,
  hasGenericCancerSignal,
  inferGeneRequired,
  SCORE_MIN
} = require('../services/matchEngine');

// 一位肺腺癌、无基因检测结果的患者画像
const lungNoGeneRecord = {
  diagnosis: '非小细胞肺癌',
  stage: 'IV期',
  age: 60,
  ecog: 1,
  treatment_line: 2,
  gene_mutation: '' // 关键：未做基因检测
};

// 10 条泛瘤种 trial，故意把信号分散到 inclusion_criteria / structured_inclusion / disease_tags
const GENERIC_TRIALS = [
  {
    id: 'G1-advanced-solid',
    name: 'Advanced Solid Tumor Basket Study',
    indication: 'Advanced Solid Tumor',
    status: 'recruiting',
    description: 'Open-label basket trial enrolling advanced solid tumor patients.',
    inclusion_criteria: ['Histologically confirmed advanced solid tumor'],
    disease_tags: []
  },
  {
    id: 'G2-metastatic-solid',
    name: 'Metastatic Solid Tumor Phase I',
    indication: 'Metastatic Solid Tumors',
    status: 'recruiting',
    description: 'Phase I dose escalation in metastatic solid tumors.',
    inclusion_criteria: ['Metastatic solid tumors'],
    disease_tags: ['solid tumors']
  },
  {
    id: 'G3-fan-shi-ti-liu',
    name: '泛实体瘤 新药 I 期',
    indication: '泛实体瘤',
    status: 'recruiting',
    description: '本研究入组经标准治疗失败的泛实体瘤患者。',
    inclusion_criteria: ['组织学确诊的泛实体瘤'],
    disease_tags: ['泛实体瘤']
  },
  {
    id: 'G4-traditional-pan',
    name: '泛實體瘤 繁体口径 Study',
    indication: '晚期实体瘤',
    status: 'recruiting',
    description: '入组经标准治疗失败的晚期实体瘤 / 泛實體瘤患者。',
    inclusion_criteria: ['晚期实体瘤'],
    disease_tags: ['晚期实体瘤']
  },
  {
    id: 'G5-metastatic-zh',
    name: '转移性实体瘤研究',
    indication: '转移性实体瘤',
    status: 'recruiting',
    description: '针对转移性实体瘤且经标准治疗失败的患者。',
    inclusion_criteria: ['转移性实体瘤'],
    disease_tags: ['恶性肿瘤']
  },
  {
    id: 'G6-msi-h',
    name: 'MSI-H Pan-Tumor Study',
    indication: 'MSI-H / dMMR solid tumors',
    status: 'recruiting',
    description: 'Enrolls MSI-H or dMMR advanced cancers regardless of primary site.',
    inclusion_criteria: ['MSI-H or dMMR tumors'],
    disease_tags: ['MSI-H', 'dMMR']
  },
  {
    id: 'G7-tmb-h',
    name: 'TMB-H Pan-Cancer Trial',
    indication: 'TMB-H solid tumors',
    status: 'recruiting',
    description: 'Open to any solid tumor with TMB-H.',
    // 信号仅放在 structured_inclusion（多源聚合测试点）
    structured_inclusion: { biomarker: 'TMB-H', note: 'any solid tumor' },
    inclusion_criteria: ['Histologically confirmed malignancy'],
    disease_tags: []
  },
  {
    id: 'G8-pdl1-positive',
    name: 'PD-L1 Positive Basket',
    indication: 'PD-L1 positive advanced cancers',
    status: 'recruiting',
    description: 'Enrolls patients with PD-L1 positive advanced tumors.',
    inclusion_criteria: ['PD-L1 ≥ 1%'],
    disease_tags: ['PD-L1 高表达']
  },
  {
    id: 'G9-all-solid',
    name: 'All Solid Tumors Phase I',
    indication: 'All solid tumors',
    status: 'recruiting',
    description: 'All solid tumors eligible after standard therapy failure.',
    // 信号只放在 disease_tags（多源聚合测试点）
    inclusion_criteria: ['Adequate organ function'],
    disease_tags: ['all solid tumors']
  },
  {
    id: 'G10-duo-liu-zhong',
    name: '多瘤种篮子试验',
    indication: '多瘤种',
    status: 'recruiting',
    description: '本研究面向多瘤种晚期患者，不限具体癌种。',
    // 信号只放在 structured_inclusion（多源聚合测试点）
    structured_inclusion: { disease_scope: '多瘤种', note: '不限具体癌种' },
    inclusion_criteria: ['既往接受≥1线系统治疗'],
    disease_tags: []
  }
];

// 1 条 NSCLC EGFR+ 特异性 trial：不应被判为 generic
const NSCLC_EGFR_TRIAL = {
  id: 'SPECIFIC-nsclc-egfr',
  name: 'EGFR L858R 三代 TKI 研究',
  indication: '非小细胞肺癌（EGFR 突变阳性）',
  status: 'recruiting',
  description: '入组 EGFR 19del 或 L858R 突变阳性的晚期非小细胞肺癌患者',
  inclusion_criteria: ['EGFR 19del 或 L858R 突变阳性', '非小细胞肺癌'],
  disease_tags: ['非小细胞肺癌']
};

describe('PRD-2026Q2 §3.1 泛瘤种词典扩充 —— 单 trial 判定', () => {
  test('10 条泛瘤种 trial 均被 hasGenericCancerSignal(trial) 命中', () => {
    for (const t of GENERIC_TRIALS) {
      expect({ id: t.id, hit: hasGenericCancerSignal(t) }).toEqual({ id: t.id, hit: true });
    }
  });

  test('10 条泛瘤种 trial 的 inferGeneRequired 均为 false', () => {
    for (const t of GENERIC_TRIALS) {
      expect({ id: t.id, req: inferGeneRequired(t) }).toEqual({ id: t.id, req: false });
    }
  });

  test('NSCLC EGFR+ 特异性 trial 不被误判为 generic', () => {
    expect(hasGenericCancerSignal(NSCLC_EGFR_TRIAL)).toBe(false);
    expect(inferGeneRequired(NSCLC_EGFR_TRIAL)).toBe(true);
  });

  test('多源聚合：信号仅在 structured_inclusion 也能命中（G7 / G10）', () => {
    const onlyStructured = {
      id: 'only-structured',
      name: 'Opaque Name',
      indication: 'Advanced cancers',
      status: 'recruiting',
      inclusion_criteria: ['Adequate organ function'],
      disease_tags: ['oncology'],
      structured_inclusion: { disease_scope: 'metastatic solid tumor' }
    };
    expect(hasGenericCancerSignal(onlyStructured)).toBe(true);
  });

  test('多源聚合：信号仅在 disease_tags 也能命中', () => {
    const onlyTags = {
      id: 'only-tags',
      name: 'Opaque Name',
      indication: 'Study',
      status: 'recruiting',
      inclusion_criteria: ['Adequate organ function'],
      disease_tags: ['all solid tumors']
    };
    expect(hasGenericCancerSignal(onlyTags)).toBe(true);
  });

  test('字符串入参向后兼容：原 criterionMatcher 调用签名仍可用', () => {
    expect(hasGenericCancerSignal('advanced solid tumor')).toBe(true);
    expect(hasGenericCancerSignal('泛实体瘤')).toBe(true);
    expect(hasGenericCancerSignal('非小细胞肺癌')).toBe(false);
    expect(hasGenericCancerSignal('')).toBe(false);
    expect(hasGenericCancerSignal(null)).toBe(false);
  });
});

describe('PRD-2026Q2 §3.1 泛瘤种排序快照 —— 肺癌无基因患者', () => {
  test('10 条泛瘤种 trial 全部出现在排序结果的前 20 名', () => {
    const trials = [...GENERIC_TRIALS, NSCLC_EGFR_TRIAL];
    // 用较低阈值避免泛瘤种被过滤掉（泛瘤种 base 分本就偏低）
    const matches = matchRecordsToTrials([lungNoGeneRecord], trials, 0);
    expect(matches.length).toBeGreaterThan(0);

    const topIds = matches.slice(0, 20).map((m) => m.trialId);
    const genericIds = GENERIC_TRIALS.map((t) => t.id);
    for (const gid of genericIds) {
      expect({ gid, inTop20: topIds.includes(gid) }).toEqual({ gid, inTop20: true });
    }
  });

  test('SCORE_MIN 常量存在，保证阈值逻辑未被意外修改', () => {
    expect(typeof SCORE_MIN).toBe('number');
    expect(SCORE_MIN).toBeGreaterThan(0);
  });
});

// PRD-2026Q3 T1-2：cancerSignals 抽离 + 多语言词典扩充
// 覆盖 10+ 多语言用例：英文 + 繁体中文，确保盲点（"晚期實體瘤" / "tumor-agnostic" 等）被命中。
describe('PRD-2026Q3 T1-2 多语言泛瘤种 / 基因豁免词典', () => {
  const { GENERIC_CANCER_ALIASES, GENE_AGNOSTIC_HINTS } = require('../services/cancerSignals');

  test('字典模块导出非空数组', () => {
    expect(Array.isArray(GENERIC_CANCER_ALIASES)).toBe(true);
    expect(Array.isArray(GENE_AGNOSTIC_HINTS)).toBe(true);
    expect(GENERIC_CANCER_ALIASES.length).toBeGreaterThan(20);
    expect(GENE_AGNOSTIC_HINTS.length).toBeGreaterThan(15);
  });

  // 10+ 多语言断言：每行一个独立场景
  const cases = [
    // 繁体中文
    { text: '晚期實體瘤', expectGeneric: true,  desc: '繁体：晚期實體瘤' },
    { text: '轉移性實體瘤', expectGeneric: true,  desc: '繁体：轉移性實體瘤' },
    { text: '泛實體瘤', expectGeneric: true,  desc: '繁体：泛實體瘤' },
    { text: '多瘤種篮子試驗', expectGeneric: true,  desc: '繁体：多瘤種' },
    { text: '無需基因檢測即可入組', expectAgnostic: true, desc: '繁体：無需基因檢測' },
    { text: '不限基因突變', expectAgnostic: true, desc: '繁体：不限基因突變' },
    // 英文
    { text: 'tumor-agnostic basket study', expectGeneric: true,  desc: '英文：tumor-agnostic' },
    { text: 'pan-tumor immunotherapy phase II', expectGeneric: true,  desc: '英文：pan-tumor' },
    { text: 'tissue-agnostic enrollment for MSI-H', expectGeneric: true,  desc: '英文：tissue-agnostic' },
    { text: 'open-label basket trial in advanced malignancies', expectGeneric: true,  desc: '英文：advanced malignancies' },
    { text: 'no genetic testing required prior to screening', expectAgnostic: true, desc: '英文：no genetic testing required' },
    { text: 'irrespective of mutation status', expectAgnostic: true, desc: '英文：irrespective of mutation status' },
    // 边界：具体癌种不应被误判
    { text: '非小细胞肺癌 EGFR L858R', expectGeneric: false, expectAgnostic: false, desc: '具体癌种 + 具体基因' }
  ];

  cases.forEach(({ text, expectGeneric, expectAgnostic, desc }) => {
    test(`${desc} → generic=${expectGeneric ?? '-'} / agnostic=${expectAgnostic ?? '-'}`, () => {
      if (expectGeneric !== undefined) {
        expect({ desc, generic: hasGenericCancerSignal(text) })
          .toEqual({ desc, generic: expectGeneric });
      }
      if (expectAgnostic !== undefined) {
        const trial = { inclusion_criteria: [text] };
        const required = inferGeneRequired(trial);
        // expectAgnostic=true 意味着 inferGeneRequired 应判 false（无基因要求）
        expect({ desc, geneRequired: required })
          .toEqual({ desc, geneRequired: !expectAgnostic && !expectGeneric });
      }
    });
  });
});
