/**
 * geneParser.test.js — 验证逐基因状态解析修复多基因混淆 bug
 * 每个 case 都对应一个真实临床场景，核心目标是：
 *   1. 多基因文本里每个基因状态独立识别（不因全局 includes 串号）
 *   2. NTRK1 / NTRK 等同前缀基因不会重复计
 *   3. 待检测 / 野生 / 突变三类状态互斥
 */

const {
  parsePatientGenes,
  parseTrialGeneRequirements,
  matchGenesAgainstTrial,
  _findGenesInSegment,
  _detectStatus,
  _normalize
} = require('../services/geneParser');

describe('geneParser — 基因名识别', () => {
  test('NTRK1 命中时不再额外返回 NTRK（长度优先）', () => {
    const hits = _findGenesInSegment(_normalize('NTRK1融合阳性'));
    const keys = hits.map((h) => h.key);
    expect(keys).toContain('NTRK1');
    expect(keys).not.toContain('NTRK');
  });

  test('FGFR2 命中时不再额外返回 FGFR', () => {
    const hits = _findGenesInSegment(_normalize('FGFR2 扩增'));
    const keys = hits.map((h) => h.key);
    expect(keys).toContain('FGFR2');
    expect(keys).not.toContain('FGFR');
  });

  test('HER2 和 ERBB2 是两个不同 key（都应识别）', () => {
    const hits = _findGenesInSegment(_normalize('HER2/ERBB2 扩增'));
    const keys = hits.map((h) => h.key);
    expect(keys).toContain('HER2');
    expect(keys).toContain('ERBB2');
  });

  test('单独 EGFR 文本，不会误匹配 HER2', () => {
    const hits = _findGenesInSegment(_normalize('EGFR L858R'));
    expect(hits.map((h) => h.key)).toEqual(['EGFR']);
  });
});

describe('geneParser — 状态识别', () => {
  test('突变/阳性/融合/扩增 → mutant', () => {
    expect(_detectStatus(_normalize('L858R突变'))).toBe('mutant');
    expect(_detectStatus(_normalize('ALK融合阳性'))).toBe('mutant');
    expect(_detectStatus(_normalize('HER2扩增'))).toBe('mutant');
  });

  test('野生/阴性 → wild', () => {
    expect(_detectStatus(_normalize('野生型'))).toBe('wild');
    expect(_detectStatus(_normalize('阴性'))).toBe('wild');
    expect(_detectStatus(_normalize('wildtype'))).toBe('wild');
  });

  test('待检/未检测 → pending（优先级高于其它）', () => {
    expect(_detectStatus(_normalize('待检'))).toBe('pending');
    expect(_detectStatus(_normalize('未检测'))).toBe('pending');
  });

  test('无关键词 → unknown', () => {
    expect(_detectStatus(_normalize('EGFR'))).toBe('unknown');
  });
});

describe('parsePatientGenes — 多基因独立状态（核心修复）', () => {
  test('"EGFR L858R突变阳性，KRAS G12C野生型" 应正确区分', () => {
    const map = parsePatientGenes('EGFR L858R突变阳性，KRAS G12C野生型');
    expect(map.get('EGFR')?.status).toBe('mutant');
    expect(map.get('KRAS')?.status).toBe('wild');
  });

  test('三基因混合: EGFR 突变 + ALK 阴性 + ROS1 未检测', () => {
    const map = parsePatientGenes('EGFR 19del突变阳性，ALK 阴性，ROS1 未检测');
    expect(map.get('EGFR')?.status).toBe('mutant');
    expect(map.get('ALK')?.status).toBe('wild');
    expect(map.get('ROS1')?.status).toBe('pending');
  });

  test('顿号分隔多基因', () => {
    const map = parsePatientGenes('EGFR突变、KRAS野生、BRAF阴性');
    expect(map.get('EGFR')?.status).toBe('mutant');
    expect(map.get('KRAS')?.status).toBe('wild');
    expect(map.get('BRAF')?.status).toBe('wild');
  });

  test('换行分隔多基因', () => {
    const map = parsePatientGenes('EGFR: L858R突变\nKRAS: 野生型');
    expect(map.get('EGFR')?.status).toBe('mutant');
    expect(map.get('KRAS')?.status).toBe('wild');
  });

  test('PD-L1 基因名被识别（表达水平由 evaluatePdl1 单独处理）', () => {
    const map = parsePatientGenes('PD-L1 TPS 80%');
    expect(map.has('PD-L1')).toBe(true);
    // 状态可能是 unknown（仅数值）或 mutant（若含"高表达"），都可接受 —— 不在此处硬性断言
  });

  test('PD-L1 阴性可被判为 wild', () => {
    const map = parsePatientGenes('PD-L1阴性');
    expect(map.get('PD-L1')?.status).toBe('wild');
  });

  test('空/null 输入安全', () => {
    expect(parsePatientGenes('').size).toBe(0);
    expect(parsePatientGenes(null).size).toBe(0);
    expect(parsePatientGenes(undefined).size).toBe(0);
  });

  test('数组输入（来自 profile.geneMutations）', () => {
    const map = parsePatientGenes(['EGFR突变', 'KRAS野生']);
    expect(map.get('EGFR')?.status).toBe('mutant');
    expect(map.get('KRAS')?.status).toBe('wild');
  });
});

describe('parseTrialGeneRequirements + matchGenesAgainstTrial', () => {
  test('KRAS G12C 抑制剂试验文本 → 识别为 KRAS 需突变', () => {
    const trialText = '入组标准：KRAS G12C 突变阳性的晚期实体瘤患者';
    const reqMap = parseTrialGeneRequirements(trialText);
    expect(reqMap.get('KRAS')).toBe('mutant');
  });

  test('EGFR 野生型肠癌试验 → 识别为 EGFR 需野生', () => {
    const trialText = '入组标准：KRAS/NRAS/BRAF 野生型转移性结直肠癌';
    const reqMap = parseTrialGeneRequirements(trialText);
    expect(reqMap.get('KRAS')).toBe('wild');
    expect(reqMap.get('BRAF')).toBe('wild');
  });

  test('关键验证：患者 EGFR突变+KRAS野生，试验要求 KRAS 突变 → KRAS 不匹配（-10）', () => {
    const patientMap = parsePatientGenes('EGFR L858R突变阳性，KRAS G12C野生型');
    const trialReqMap = parseTrialGeneRequirements('入组：KRAS 突变阳性');
    const results = matchGenesAgainstTrial(patientMap, trialReqMap);
    const krasResult = results.find((r) => r.gene === 'KRAS');
    expect(krasResult).toBeDefined();
    expect(krasResult.matched).toBe(false);
    expect(krasResult.label).toMatch(/野生型/);
  });

  test('关键验证：患者 KRAS 突变阳性，试验要求 KRAS 突变 → 匹配（+20）', () => {
    const patientMap = parsePatientGenes('KRAS G12C突变阳性');
    const trialReqMap = parseTrialGeneRequirements('入组：KRAS 突变阳性');
    const results = matchGenesAgainstTrial(patientMap, trialReqMap);
    expect(results[0].matched).toBe(true);
  });
});
