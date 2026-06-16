/**
 * matchExclusion.test.js — 硬排除在 hybrid 评分中被保留（可信性回归守卫）。
 *
 * 审阅曾担心"匹配漏排除"。核查结论：结构化硬门（年龄/ECOG/治疗线/既往用药/基因）会正确
 * 置 excluded=true，且 scoreRecordHybrid 在混合路径下保留 heuristic.excluded。
 * 本测试锁定该行为，防未来重构悄悄丢掉排除（让不合格患者被当作匹配展示）。
 */
const { scoreRecordHybrid } = require('../services/matchEngine');

describe('硬排除在 hybrid 评分中被保留', () => {
  const baseTrial = {
    id: 'trial-excl-regression',
    name: 'PD-1 单抗研究',
    indication: '非小细胞肺癌',
    status: 'recruiting',
    disease_tags: ['非小细胞肺癌']
  };

  test('命中 excluded_prior_therapies 的患者被硬排除（excluded=true）', () => {
    const trial = { ...baseTrial, structured_inclusion: { excluded_prior_therapies: ['nivolumab'] } };
    const record = { diagnosis: '非小细胞肺癌', treatment: '既往接受 nivolumab 免疫治疗' };
    // 不传 structuredProfile：该试验无 decomposed criteria → 走启发式，验证 heuristic.excluded 被透出
    const scored = scoreRecordHybrid(record, trial);
    expect(scored.excluded).toBe(true);
  });

  test('未触发任何硬排除的合格患者 excluded=false', () => {
    const trial = { ...baseTrial, structured_inclusion: {} };
    const record = { diagnosis: '非小细胞肺癌', treatment: '一线化疗' };
    const scored = scoreRecordHybrid(record, trial);
    // 合格态：excluded 为 falsy（未排除路径不强制写 false，调用方按真值判断 `if (scored.excluded) continue`）
    expect(scored.excluded).toBeFalsy();
  });
});
