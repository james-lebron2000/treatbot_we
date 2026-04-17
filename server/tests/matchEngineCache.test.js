/**
 * matchEngineCache.test.js — per-trial 预处理缓存 + health 状态暴露
 */

const { scoreRecordAgainstTrial, getTrialPrepStats, getDecomposedCriteriaStatus } = require('../services/matchEngine');

describe('per-trial 预处理缓存', () => {
  test('同一 trial 多次评分只触发一次 miss，其余为 hit', () => {
    const before = getTrialPrepStats();
    const trial = {
      id: 'cache-t1',
      name: 'EGFR-TKI 研究',
      indication: '非小细胞肺癌',
      status: 'recruiting',
      description: 'EGFR 突变',
      inclusion_criteria: ['EGFR 突变阳性'],
      exclusion_criteria: ['严重心功能不全'],
      disease_tags: ['非小细胞肺癌']
    };
    const records = [
      { diagnosis: '非小细胞肺癌', gene_mutation: 'EGFR 19del', age: 50 },
      { diagnosis: '非小细胞肺癌', gene_mutation: 'EGFR L858R', age: 60 },
      { diagnosis: '非小细胞肺癌', gene_mutation: 'EGFR 20ins', age: 70 }
    ];
    records.forEach((r) => scoreRecordAgainstTrial(r, trial));
    const after = getTrialPrepStats();
    expect(after.misses - before.misses).toBe(1); // 只 miss 一次
    expect(after.hits - before.hits).toBeGreaterThanOrEqual(2); // 至少 2 次 hit
  });

  test('不同 trial 对象各 miss 一次', () => {
    const before = getTrialPrepStats();
    const record = { diagnosis: '肺癌', gene_mutation: 'EGFR突变', age: 55 };
    const t1 = { id: 'x1', name: 'A', indication: '肺癌', status: 'recruiting', inclusion_criteria: ['EGFR突变'] };
    const t2 = { id: 'x2', name: 'B', indication: '肺癌', status: 'recruiting', inclusion_criteria: ['EGFR突变'] };
    scoreRecordAgainstTrial(record, t1);
    scoreRecordAgainstTrial(record, t2);
    const after = getTrialPrepStats();
    expect(after.misses - before.misses).toBe(2);
  });
});

describe('getDecomposedCriteriaStatus —— /health/detailed 暴露字段', () => {
  test('返回 { loaded, trialCount, criterionCount, loadedAt } 结构', () => {
    const s = getDecomposedCriteriaStatus();
    expect(s).toHaveProperty('loaded');
    expect(s).toHaveProperty('trialCount');
    expect(s).toHaveProperty('criterionCount');
    expect(s).toHaveProperty('loadedAt');
    expect(typeof s.loaded).toBe('boolean');
    expect(typeof s.trialCount).toBe('number');
    expect(typeof s.criterionCount).toBe('number');
  });

  test('加载成功时 trialCount > 0，criterionCount 非负', () => {
    const s = getDecomposedCriteriaStatus();
    if (s.loaded) {
      expect(s.trialCount).toBeGreaterThan(0);
      expect(s.criterionCount).toBeGreaterThanOrEqual(0);
      expect(s.loadError).toBeNull();
    } else {
      // 生产环境若 JSON 丢失，loadError 必须存在便于定位
      expect(typeof s.loadError).toBe('string');
    }
  });
});
