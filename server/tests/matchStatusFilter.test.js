/**
 * PRD-2026Q2 §2.4：matchEngine 只返回 recruiting trial，且 freshness 影响评分。
 *
 * 本文件测两件事：
 *  1. buildCoarseFilter 生成的 SQL where 强制 status='recruiting'；
 *  2. scoreRecordAgainstTrial 的最终分会被 freshness_score 软乘子调整。
 *
 * 说明：真正的 SQL 粗筛需要 DB，这里只断言 where 片段以保证安全边界。
 */

const { buildCoarseFilter, scoreRecordAgainstTrial } = require('../services/matchEngine');

describe('buildCoarseFilter —— 状态过滤', () => {
  test('where 总是包含 status=recruiting', () => {
    const where = buildCoarseFilter({ diagnosis: '肺癌' });
    expect(where.status).toBe('recruiting');
  });

  test('无诊断无城市时也强制 recruiting', () => {
    const where = buildCoarseFilter({});
    expect(where.status).toBe('recruiting');
  });
});

describe('freshness 软乘子对评分的影响', () => {
  const baseTrial = {
    id: 'fresh-test',
    name: 'EGFR-TKI 研究',
    indication: '非小细胞肺癌',
    status: 'recruiting',
    description: 'EGFR 突变阳性晚期 NSCLC',
    inclusion_criteria: ['EGFR 突变阳性'],
    disease_tags: ['非小细胞肺癌']
  };
  const record = {
    diagnosis: '非小细胞肺癌',
    stage: 'IV期',
    age: 55,
    ecog: 1,
    gene_mutation: 'EGFR L858R 突变阳性'
  };

  test('新鲜度 100 分 ≈ 不降权', () => {
    const r = scoreRecordAgainstTrial(record, { ...baseTrial, freshness_score: 100 });
    expect(r.score).toBeGreaterThan(50);
    // 新鲜时不会出现"较长时间未更新"的 reason
    expect(r.reasons.join('|')).not.toMatch(/长时间未更新/);
  });

  test('新鲜度 30 分会触发降权 reason 并降低最终分', () => {
    const hi = scoreRecordAgainstTrial(record, { ...baseTrial, freshness_score: 100 });
    const lo = scoreRecordAgainstTrial(record, { ...baseTrial, freshness_score: 30 });
    expect(lo.score).toBeLessThan(hi.score);
    expect(lo.reasons.some((r) => /长时间未更新/.test(r))).toBe(true);
  });

  test('freshness_score 缺失（null/undefined）时不降权', () => {
    const noField = scoreRecordAgainstTrial(record, { ...baseTrial });
    const full = scoreRecordAgainstTrial(record, { ...baseTrial, freshness_score: 100 });
    expect(noField.score).toBe(full.score);
  });
});

/**
 * 纯函数小片段：保证把一批 mock trial 按 status 过滤后只剩 recruiting。
 * 这是 buildCoarseFilter 的同构实现，供前端/service 层复用时直接调 JS。
 */
const filterRecruitingOnly = (trials) => (trials || []).filter((t) => t && t.status === 'recruiting');

describe('filterRecruitingOnly —— 纯函数过滤', () => {
  test('从含 closed / completed 的列表里只保留 recruiting', () => {
    const trials = [
      { id: 'a', status: 'recruiting' },
      { id: 'b', status: 'closed' },
      { id: 'c', status: 'completed' },
      { id: 'd', status: 'recruiting' }
    ];
    const out = filterRecruitingOnly(trials);
    expect(out.map((t) => t.id)).toEqual(['a', 'd']);
  });
  test('空输入返回空数组', () => {
    expect(filterRecruitingOnly(null)).toEqual([]);
    expect(filterRecruitingOnly([])).toEqual([]);
  });
});
