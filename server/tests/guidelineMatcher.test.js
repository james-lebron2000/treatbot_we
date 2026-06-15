const {
  classifyStage,
  extractPdl1,
  extractDrivers,
  findCancer,
  matchGuidelines,
  listCancers,
  getCancerEducation
} = require('../services/guidelineMatcher');

const ids = (res) => res.regimens.map((r) => r.id);

describe('classifyStage', () => {
  test.each([
    ['IV期', 'advanced'],
    ['右肺腺癌 IV 期', 'advanced'],
    ['转移性', 'advanced'],
    ['晚期', 'advanced'],
    ['III期', 'local_advanced'],
    ['IIIA', 'local_advanced'],
    ['局部晚期不可切除', 'local_advanced'],
    ['II期', 'early'],
    ['IIB', 'early'],
    ['IA期', 'early'],
    ['I期', 'early'],
    ['广泛期', 'extensive'],
    ['局限期', 'limited'],
    ['', null],
    ['不详', null]
  ])('classifyStage(%s) = %s', (input, expected) => {
    expect(classifyStage(input)).toBe(expected);
  });
});

describe('extractPdl1', () => {
  test('百分比 / TPS / 阴性', () => {
    expect(extractPdl1('PD-L1 TPS 60%')).toBe(60);
    expect(extractPdl1('PD-L1 ≥ 50%')).toBe(50);
    expect(extractPdl1('阴性')).toBe(0);
    expect(extractPdl1('PD-L1 阴性')).toBe(0);
    expect(extractPdl1('')).toBeNull();
    expect(extractPdl1('未做')).toBeNull();
  });
});

describe('extractDrivers', () => {
  test('结构化 molecular.drivers 优先', () => {
    const s = extractDrivers({ molecular: { drivers: [{ gene: 'EGFR', variant: '19del' }] } });
    expect(Array.from(s)).toEqual(['EGFR']);
  });
  test('自由文本回退 + 否定保护', () => {
    expect(extractDrivers({ geneMutationText: 'ALK 融合阳性' }).has('ALK')).toBe(true);
    // EGFR 阴性 不应被计为阳性驱动
    expect(extractDrivers({ geneMutationText: 'EGFR 阴性，ALK 阴性' }).size).toBe(0);
  });

  test('窗口化否定：未见X突变 / X(-) / 未检测到X 不计为阳性，但阳性写法仍计', () => {
    expect(extractDrivers({ geneMutationText: '未见EGFR突变' }).has('EGFR')).toBe(false);
    expect(extractDrivers({ geneMutationText: 'EGFR(-)' }).has('EGFR')).toBe(false);
    expect(extractDrivers({ geneMutationText: '未检测到EGFR' }).has('EGFR')).toBe(false);
    expect(extractDrivers({ geneMutationText: 'EGFR L858R 突变' }).has('EGFR')).toBe(true);
    expect(extractDrivers({ geneMutationText: 'EGFR 19del' }).has('EGFR')).toBe(true);
  });
});

describe('findCancer 消歧', () => {
  test('小细胞肺癌 命中 sclc 而非 nsclc（最长名优先）', () => {
    expect(findCancer({ diagnosis: '小细胞肺癌 广泛期' }).key).toBe('sclc');
  });
  test('肺腺癌 命中 nsclc', () => {
    expect(findCancer({ diagnosis: '右肺腺癌' }).key).toBe('nsclc');
  });
  test('未覆盖癌种返回 null', () => {
    expect(findCancer({ diagnosis: '胃癌' })).toBeNull();
  });
});

describe('matchGuidelines — NSCLC 晚期一线', () => {
  test('EGFR 敏感突变 → 一线 EGFR-TKI；排除免疫/无驱动方案', () => {
    const res = matchGuidelines({
      diagnosis: '右肺腺癌', stage: 'IV期', treatmentLine: 0,
      molecular: { drivers: [{ gene: 'EGFR', variant: '19del' }] }
    });
    expect(res.matched).toBe(true);
    expect(res.cancer.key).toBe('nsclc');
    expect(ids(res)).toContain('nsclc-iv-egfr-1l');
    expect(ids(res)).not.toContain('nsclc-iv-driver-neg-1l');
    expect(ids(res)).not.toContain('nsclc-iv-driver-neg-pdl1-high-1l');
    expect(res.flags.drivers).toContain('EGFR');
    expect(res.flags.needsGeneTest).toBe(false);
  });

  test('ALK 融合 → 一线 ALK 抑制剂', () => {
    const res = matchGuidelines({
      diagnosis: '肺腺癌', stage: '转移性',
      molecular: { drivers: [{ gene: 'ALK' }] }
    });
    expect(ids(res)).toContain('nsclc-iv-alk-1l');
    expect(ids(res)).not.toContain('nsclc-iv-egfr-1l');
  });

  test('无驱动 + PD-L1 60% → 免疫高表达方案在列', () => {
    const res = matchGuidelines({
      diagnosis: '肺鳞癌', stage: 'IV期', pdl1: 'PD-L1 TPS 60%',
      molecular: { drivers: [] }, geneMutationText: 'EGFR 阴性 ALK 阴性 ROS1 阴性'
    });
    expect(ids(res)).toContain('nsclc-iv-driver-neg-pdl1-high-1l');
    expect(ids(res)).not.toContain('nsclc-iv-egfr-1l');
    expect(res.flags.needsGeneTest).toBe(false); // 有基因+PD-L1 信息
  });

  test('无驱动 + PD-L1 低 → 免疫+化疗；不含高表达方案', () => {
    const res = matchGuidelines({
      diagnosis: '肺腺癌', stage: '晚期', pdl1: '阴性',
      molecular: { drivers: [] }, geneMutationText: '未见驱动基因突变'
    });
    expect(ids(res)).toContain('nsclc-iv-driver-neg-1l');
    expect(ids(res)).not.toContain('nsclc-iv-driver-neg-pdl1-high-1l');
  });

  test('晚期 NSCLC 但完全无基因/PD-L1 信息 → needsGeneTest=true', () => {
    const res = matchGuidelines({ diagnosis: '肺腺癌', stage: 'IV期' });
    expect(res.flags.needsGeneTest).toBe(true);
  });

  test('自由文本「未见EGFR突变」不被误判为 EGFR 阳性 → 不推 EGFR 靶向', () => {
    const res = matchGuidelines({
      diagnosis: '肺腺癌', stage: 'IV期', pdl1: '阴性',
      molecular: { drivers: [] }, geneMutationText: '未见EGFR突变，ALK阴性，ROS1阴性'
    });
    expect(res.flags.drivers).not.toContain('EGFR');
    expect(ids(res)).not.toContain('nsclc-iv-egfr-1l');
    expect(ids(res)).toContain('nsclc-iv-driver-neg-1l');
  });
});

describe('matchGuidelines — 分期路线', () => {
  test('III 期不可切除 → 同步放化疗+免疫巩固', () => {
    const res = matchGuidelines({ diagnosis: '肺鳞癌', stage: 'IIIB期 不可切除' });
    expect(ids(res)).toContain('nsclc-iii-unresectable');
    expect(ids(res)).not.toContain('nsclc-iv-egfr-1l');
  });

  test('早期 → 手术为主', () => {
    const res = matchGuidelines({ diagnosis: '右肺腺癌', stage: 'IA期' });
    expect(ids(res)).toContain('nsclc-early-resectable');
  });
});

describe('matchGuidelines — SCLC', () => {
  test('广泛期 → 化疗+免疫', () => {
    const res = matchGuidelines({ diagnosis: '小细胞肺癌', stage: '广泛期' });
    expect(res.cancer.key).toBe('sclc');
    expect(ids(res)).toContain('sclc-extensive');
    expect(ids(res)).not.toContain('sclc-limited');
  });
  test('局限期 → 化疗+放疗', () => {
    const res = matchGuidelines({ diagnosis: '小细胞肺癌', stage: '局限期' });
    expect(ids(res)).toContain('sclc-limited');
    expect(ids(res)).not.toContain('sclc-extensive');
  });
});

describe('matchGuidelines — 兜底', () => {
  test('未覆盖癌种 → matched=false', () => {
    const res = matchGuidelines({ diagnosis: '胃癌', stage: 'IV期' });
    expect(res.matched).toBe(false);
    expect(res.regimens).toEqual([]);
    expect(res.coverageNote).toBeTruthy();
  });

  test('分期未知 → stageUnknown=true 且仍给候选（驱动门槛仍生效）', () => {
    const res = matchGuidelines({
      diagnosis: '肺腺癌',
      molecular: { drivers: [{ gene: 'EGFR' }] }
    });
    expect(res.flags.stageUnknown).toBe(true);
    expect(ids(res)).toContain('nsclc-iv-egfr-1l');
  });

  test('空 profile 不报错', () => {
    const res = matchGuidelines(null);
    expect(res.matched).toBe(false);
    expect(res.disclaimer).toBeTruthy();
  });

  test('listCancers 列出覆盖癌种', () => {
    expect(listCancers().map((c) => c.key)).toEqual(expect.arrayContaining(['nsclc', 'sclc']));
  });

  test('getCancerEducation 返回该病全部方案（education 模式，不依赖画像）', () => {
    const edu = getCancerEducation('nsclc');
    expect(edu.mode).toBe('education');
    expect(edu.matched).toBe(true);
    expect(edu.regimens.length).toBeGreaterThanOrEqual(5);
    expect(edu.accessGuidance.length).toBeGreaterThan(0);
    expect(getCancerEducation('胃癌xyz')).toBeNull();
  });

  test('可及性指引随结果返回（matched 与未匹配都有）', () => {
    const matched = matchGuidelines({ diagnosis: '肺腺癌', stage: 'IV期', molecular: { drivers: [{ gene: 'EGFR' }] } });
    expect(Array.isArray(matched.accessGuidance)).toBe(true);
    expect(matched.accessGuidance.length).toBeGreaterThan(0);
    expect(matched.accessDisclaimer).toBeTruthy();

    const unmatched = matchGuidelines({ diagnosis: '胃癌' });
    expect(unmatched.accessGuidance.length).toBeGreaterThan(0);
  });
});

// ===== 第二轮（adversarial agent）复审发现的修复 =====
describe('复审修复 · classifyStage 转移/否定/罗马数字', () => {
  test('区域淋巴结转移不算晚期；显式 III 期优先', () => {
    expect(classifyStage('纵隔淋巴结转移')).toBe(null);          // 区域，非远处
    expect(classifyStage('IIIA期 纵隔淋巴结转移')).toBe('local_advanced');
  });
  test('被否定的转移/晚期不算晚期', () => {
    expect(classifyStage('无远处转移')).toBe(null);
    expect(classifyStage('未见远处转移')).toBe(null);
  });
  test('远处器官转移 / 转移性仍算晚期', () => {
    expect(classifyStage('肝转移')).toBe('advanced');
    expect(classifyStage('转移性')).toBe('advanced');
    expect(classifyStage('远处转移')).toBe('advanced');
  });
  test('单码罗马数字 Ⅰ-Ⅳ 正确识别', () => {
    expect(classifyStage('Ⅳ期')).toBe('advanced');
    expect(classifyStage('ⅢA')).toBe('local_advanced');
    expect(classifyStage('Ⅰ期')).toBe('early');
  });
});

describe('复审修复 · extractDrivers 否定/串句/词边界', () => {
  test('结构化 geneMutations 原始串「均为阴性」不被误判为阳性（critical）', () => {
    // buildProfile 会把 gene_mutation 原文整段塞进 geneMutations[0]
    expect(extractDrivers({ geneMutations: ['EGFR、ALK、ROS1均为阴性，未见驱动基因突变'] }).size).toBe(0);
    expect(extractDrivers({ geneMutationText: 'EGFR、ALK、ROS1均为阴性' }).size).toBe(0);
  });
  test('串句否定不误伤同串的阳性基因（window-bleed）', () => {
    const s = extractDrivers({ geneMutationText: 'EGFR突变阳性，无ALK融合' });
    expect(s.has('EGFR')).toBe(true);
    expect(s.has('ALK')).toBe(false);
  });
  test('短符号词边界：不命中 parameter/centimeter 中的 MET/RET', () => {
    expect(extractDrivers({ geneMutationText: 'tumor parameter 90% positive' }).has('MET')).toBe(false);
  });
  test('curated molecular.drivers 仍直接信任', () => {
    expect(extractDrivers({ molecular: { drivers: [{ gene: 'ALK' }] } }).has('ALK')).toBe(true);
  });
});

describe('复审修复 · extractPdl1 先数值后阴性', () => {
  test('「90% 阴性对照」取 90 而非 0', () => {
    expect(extractPdl1('PD-L1 90% 阴性对照')).toBe(90);
    expect(extractPdl1('PD-L1 TPS 49% 阴性内对照阳性')).toBe(49);
  });
  test('纯阴性仍记 0', () => {
    expect(extractPdl1('阴性')).toBe(0);
  });
});

describe('复审修复 · matchGuidelines 分期/线数', () => {
  test('SCLC 罗马数字分期（III 期）匹配到局限期方案', () => {
    const res = matchGuidelines({ diagnosis: '小细胞肺癌', stage: 'III期' });
    expect(res.cancer.key).toBe('sclc');
    expect(ids(res)).toContain('sclc-limited');
    expect(ids(res)).not.toContain('sclc-extensive');
  });
  test('全阴性基因报告的晚期 NSCLC → 不推 EGFR 靶向，落免疫/化疗', () => {
    const res = matchGuidelines({
      diagnosis: '右肺腺癌', stage: 'IV期', pdl1: '阴性',
      geneMutations: ['EGFR、ALK、ROS1均为阴性，未见驱动基因突变']
    });
    expect(res.flags.drivers).not.toContain('EGFR');
    expect(ids(res)).not.toContain('nsclc-iv-egfr-1l');
    expect(ids(res)).toContain('nsclc-iv-driver-neg-1l');
  });
  test('lineMax 排除：已二线患者不再匹配一线方案', () => {
    const res = matchGuidelines({
      diagnosis: '肺腺癌', stage: 'IV期', treatmentLine: 2,
      molecular: { drivers: [{ gene: 'EGFR' }] }
    });
    // 1L EGFR 方案 lineMax:1，已二线(2>1)应被排除
    expect(ids(res)).not.toContain('nsclc-iv-egfr-1l');
  });
});
