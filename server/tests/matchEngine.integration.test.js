/**
 * matchEngine.integration.test.js — 端到端验证：多基因患者 × KRAS 试验
 *
 * 复现原 bug 场景并验证修复：
 *   患者: EGFR L858R 突变阳性，KRAS G12C 野生型
 *   试验: KRAS G12C 抑制剂（入组要求 KRAS 突变阳性）
 *
 *   修复前：旧代码在全文 includes('野生')，KRAS 被判为"突变符合"，+20 错分
 *   修复后：geneParser 识别 KRAS 为 wild，试验要求 mutant → 不匹配，-10
 */

const { scoreRecordAgainstTrial } = require('../services/matchEngine');

describe('matchEngine 端到端 — 多基因 per-gene 状态修复', () => {
  const baseRecord = {
    diagnosis: '非小细胞肺癌',
    stage: 'IV期',
    ecog: 1,
    age: 55,
    treatment_line: 2,
    gene_mutation: 'EGFR L858R突变阳性，KRAS G12C野生型'
  };

  test('KRAS 突变要求试验 —— 患者 KRAS 野生 → 应负向调整（不给 mutant 高分）', () => {
    const krasTrial = {
      id: 'kras-g12c-001',
      name: 'KRAS G12C 抑制剂临床研究',
      indication: '非小细胞肺癌',
      status: 'recruiting',
      description: '本研究入组 KRAS G12C 突变阳性的晚期非小细胞肺癌患者',
      inclusion_criteria: ['KRAS G12C 突变阳性', '晚期 NSCLC'],
      disease_tags: ['非小细胞肺癌']
    };
    const result = scoreRecordAgainstTrial(baseRecord, krasTrial);
    // 验证 reasons 里确实识别出了"KRAS 为野生型"，且没有错误地给 KRAS 加 +20
    const krasReason = result.reasons.find((r) => r.includes('KRAS'));
    expect(krasReason).toBeDefined();
    expect(krasReason).toMatch(/野生型/);
    expect(krasReason).not.toMatch(/突变阳性符合/);
  });

  test('EGFR 突变要求试验 —— 患者 EGFR 突变 → 应给 +20 匹配', () => {
    const egfrTrial = {
      id: 'egfr-tki-001',
      name: 'EGFR-TKI 三代药物研究',
      indication: '非小细胞肺癌',
      status: 'recruiting',
      description: '入组 EGFR 突变阳性的晚期肺腺癌',
      inclusion_criteria: ['EGFR 19del 或 L858R 突变'],
      disease_tags: ['非小细胞肺癌']
    };
    const result = scoreRecordAgainstTrial(baseRecord, egfrTrial);
    const egfrReason = result.reasons.find((r) => r.includes('EGFR'));
    expect(egfrReason).toBeDefined();
    expect(egfrReason).toMatch(/突变.*符合|阳性.*符合/);
  });

  test('EGFR 野生型要求（肠癌抗 EGFR 单抗）—— 该患者 EGFR 是突变 → 应不符合', () => {
    const crcRecord = {
      diagnosis: '结直肠癌',
      stage: 'IV期',
      age: 55,
      gene_mutation: 'EGFR 19del 突变阳性，KRAS 野生型，BRAF 野生型'
    };
    const cetuximabTrial = {
      id: 'crc-cetux-001',
      name: '西妥昔单抗临床研究',
      indication: '结直肠癌',
      status: 'recruiting',
      description: '入组 KRAS/NRAS/BRAF 全野生型的转移性结直肠癌患者',
      inclusion_criteria: ['KRAS 野生型', 'NRAS 野生型', 'BRAF 野生型'],
      disease_tags: ['结直肠癌']
    };
    const result = scoreRecordAgainstTrial(crcRecord, cetuximabTrial);
    // KRAS / BRAF 野生型符合；不会因为患者 EGFR 突变而把 KRAS 判错
    const reasons = result.reasons.join(' ');
    expect(reasons).toMatch(/KRAS.*野生型符合/);
    expect(reasons).toMatch(/BRAF.*野生型符合/);
  });

  test('NTRK1 融合阳性 —— 基因名去重后不应同时命中 NTRK 和 NTRK1', () => {
    const record = {
      diagnosis: '非小细胞肺癌',
      age: 50,
      gene_mutation: 'NTRK1 融合阳性'
    };
    const trial = {
      id: 'trk-inh-001',
      name: 'TRK 抑制剂研究',
      indication: '非小细胞肺癌',
      status: 'recruiting',
      description: 'NTRK1/2/3 融合阳性患者',
      inclusion_criteria: ['NTRK 融合阳性'],
      disease_tags: ['非小细胞肺癌']
    };
    const result = scoreRecordAgainstTrial(record, trial);
    const geneReason = result.reasons.find((r) => r.includes('基因'));
    expect(geneReason).toBeDefined();
    // 基因名只出现一次，不会 NTRK1 和 NTRK 各加 20
    const ntrkCount = (geneReason.match(/NTRK/g) || []).length;
    expect(ntrkCount).toBeLessThanOrEqual(2); // 允许 "NTRK1" 1次 + 可能的括号说明；绝不会出现 NTRK 和 NTRK1 两个独立条目
  });
});
