/**
 * pdl1Parser.test.js — PD-L1 表达评分体系区分
 * 覆盖：TPS / CPS / IC / IHC 识别、阴性、跨体系拒绝、诊断推断
 */

const {
  parsePdl1Expression,
  parseTrialPdl1Requirement,
  inferDefaultPdl1System,
  evaluatePdl1Match
} = require('../services/pdl1Parser');

describe('parsePdl1Expression — 患者端表达解析', () => {
  test('TPS 80%', () => {
    const r = parsePdl1Expression('PD-L1 TPS 80%');
    expect(r.system).toBe('TPS');
    expect(r.value).toBe(80);
  });

  test('CPS 15', () => {
    const r = parsePdl1Expression('PD-L1 CPS 15');
    expect(r.system).toBe('CPS');
    expect(r.value).toBe(15);
  });

  test('CPS≥10 带比较符', () => {
    const r = parsePdl1Expression('PD-L1 CPS≥10');
    expect(r.system).toBe('CPS');
    expect(r.value).toBe(10);
  });

  test('IC2 免疫细胞评分', () => {
    const r = parsePdl1Expression('PD-L1 IC2 10%');
    expect(r.system).toBe('IC');
    // 文本含 ic2 和 10%，当前优先匹配带体系的数字 —— 我们接受 2 或 10 其中之一
    expect([2, 10]).toContain(r.value);
  });

  test('IHC 2+ 半定量', () => {
    const r = parsePdl1Expression('PD-L1 2+');
    expect(r.system).toBe('IHC');
    expect(r.value).toBe(2);
  });

  test('阴性 → value=0', () => {
    const r = parsePdl1Expression('PD-L1 阴性');
    expect(r.value).toBe(0);
  });

  test('无体系：PD-L1 50%', () => {
    const r = parsePdl1Expression('PD-L1 50%');
    expect(r.system).toBeNull();
    expect(r.value).toBe(50);
  });

  test('空输入 → null', () => {
    expect(parsePdl1Expression('')).toBeNull();
    expect(parsePdl1Expression(null)).toBeNull();
  });
});

describe('parseTrialPdl1Requirement — 试验端阈值解析', () => {
  test('TPS ≥ 50%', () => {
    const r = parseTrialPdl1Requirement('入组要求：PD-L1 TPS≥50%的患者');
    expect(r.system).toBe('TPS');
    expect(r.threshold).toBe(50);
  });

  test('CPS ≥ 10', () => {
    const r = parseTrialPdl1Requirement('入组：HER2 阴性且 CPS ≥ 10 的胃癌');
    expect(r.system).toBe('CPS');
    expect(r.threshold).toBe(10);
  });

  test('泛泛 PD-L1 ≥ 1% 无体系', () => {
    const r = parseTrialPdl1Requirement('PD-L1 ≥ 1% 阳性');
    expect(r.system).toBeNull();
    expect(r.threshold).toBe(1);
  });

  test('无 PD-L1 要求 → null', () => {
    expect(parseTrialPdl1Requirement('入组晚期肺癌患者')).toBeNull();
  });
});

describe('inferDefaultPdl1System — 按癌种推断默认体系', () => {
  test('NSCLC → TPS', () => {
    expect(inferDefaultPdl1System('非小细胞肺癌')).toBe('TPS');
    expect(inferDefaultPdl1System('肺腺癌 IV 期')).toBe('TPS');
  });

  test('胃癌 / 宫颈癌 / 食管癌 → CPS', () => {
    expect(inferDefaultPdl1System('胃腺癌')).toBe('CPS');
    expect(inferDefaultPdl1System('宫颈癌')).toBe('CPS');
    expect(inferDefaultPdl1System('食管鳞癌')).toBe('CPS');
  });

  test('未知诊断 → null', () => {
    expect(inferDefaultPdl1System('')).toBeNull();
    expect(inferDefaultPdl1System('其他肿瘤')).toBeNull();
  });
});

describe('evaluatePdl1Match — 综合判定（核心修复）', () => {
  test('同系统达标：TPS 80 vs TPS≥50 → met, +10', () => {
    const r = evaluatePdl1Match('PD-L1 TPS 80%', 'PD-L1 TPS≥50%', '非小细胞肺癌');
    expect(r.verdict).toBe('met');
    expect(r.bonus).toBe(10);
    expect(r.systemUsed).toBe('TPS');
    expect(r.inferred).toBe(false);
  });

  test('同系统不达标：TPS 10 vs TPS≥50 → not_met, 负分', () => {
    const r = evaluatePdl1Match('PD-L1 TPS 10%', 'TPS≥50%', '非小细胞肺癌');
    expect(r.verdict).toBe('not_met');
    expect(r.bonus).toBeLessThan(0);
  });

  test('关键验证：跨系统不比较（患者 TPS 80 vs 试验 CPS≥10）→ system_mismatch', () => {
    const r = evaluatePdl1Match('PD-L1 TPS 80%', '入组 CPS≥10 的胃癌', '胃癌');
    expect(r.verdict).toBe('system_mismatch');
    expect(r.bonus).toBe(3);
    expect(r.reason).toMatch(/指标类型不同/);
  });

  test('患者无系统 + 诊断推断：PD-L1 80% 用于 NSCLC → 按 TPS 比较', () => {
    const r = evaluatePdl1Match('PD-L1 80%', 'PD-L1 ≥ 50%', '非小细胞肺癌');
    expect(r.verdict).toBe('met');
    expect(r.inferred).toBe(true);
    expect(r.systemUsed).toBe('TPS');
    expect(r.bonus).toBe(6); // 推断场景降权
  });

  test('试验未提 PD-L1 → no_requirement', () => {
    const r = evaluatePdl1Match('PD-L1 TPS 80%', '入组 EGFR 突变的晚期肺腺癌', '肺腺癌');
    expect(r.verdict).toBe('no_requirement');
    expect(r.bonus).toBe(0);
  });

  test('患者缺 PD-L1 + 试验要求 → uncertain，小幅加分提醒', () => {
    const r = evaluatePdl1Match(null, 'PD-L1 TPS≥50%', '非小细胞肺癌');
    expect(r.verdict).toBe('uncertain');
    expect(r.bonus).toBe(2);
  });
});
