/**
 * cancer-type consistency 硬排除单测（PRD-2026Q2 §3.x）
 *
 * 仅覆盖三类硬排除：
 *  1) 跨癌种不一致（如肝癌患者 vs 乳腺癌专项 trial）
 *  2) 试验明确"驱动基因阴性"，但患者携带具体驱动突变
 *  3) 试验明确以 ${gene} 突变/野生作为入组要求，与患者状态相反
 *
 * 不应误伤的合规场景（基线放行）：
 *  - 同癌种 trial（肝癌 vs 肝癌专项）
 *  - 泛实体瘤 basket trial
 *  - 罕见癌种患者（profile 无法识别）
 */

const {
  scoreRecordAgainstTrial,
  isCancerTypeMismatch
} = require('../services/matchEngine');

describe('cancer-type consistency', () => {
  test('liver patient vs breast-only trial → excluded', () => {
    const r = scoreRecordAgainstTrial(
      { diagnosis: '原发性肝癌', stage: 'III期' },
      {
        id: 'X',
        name: 'HER2阳性乳腺癌患者抗肿瘤研究',
        indication: 'HER2阳性乳腺癌',
        disease_tags: ['乳腺癌'],
        inclusion_criteria: ['HER2 IHC 3+ 乳腺癌患者']
      }
    );
    expect(r.excluded).toBe(true);
    expect(r.score).toBe(0);
  });

  test('EGFR+ patient vs driver-negative NSCLC trial → excluded', () => {
    const r = scoreRecordAgainstTrial(
      { diagnosis: '非小细胞肺癌', gene_mutation: 'EGFR L858R 突变阳性' },
      {
        id: 'X',
        name: '驱动基因阴性NSCLC研究',
        indication: '驱动基因阴性非小细胞肺癌',
        disease_tags: ['非小细胞肺癌'],
        inclusion_criteria: ['驱动基因阴性的非小细胞肺癌']
      }
    );
    expect(r.excluded).toBe(true);
  });

  test('liver patient vs solid-tumor basket → NOT excluded', () => {
    const r = scoreRecordAgainstTrial(
      { diagnosis: '原发性肝癌' },
      {
        id: 'X',
        name: '晚期实体瘤探索',
        indication: '晚期实体瘤',
        disease_tags: ['全部实体瘤']
      }
    );
    expect(r.excluded).toBeFalsy();
    expect(r.score).toBeGreaterThan(0);
  });

  test('liver patient vs liver-specific trial → NOT excluded', () => {
    const r = scoreRecordAgainstTrial(
      { diagnosis: '原发性肝癌' },
      {
        id: 'X',
        name: '肝细胞癌二线研究',
        indication: '晚期肝细胞癌',
        disease_tags: ['肝癌']
      }
    );
    expect(r.excluded).toBeFalsy();
  });

  test('isCancerTypeMismatch helper：罕见癌种患者（无 profile） → 不触发硬排除', () => {
    // 小肠腺癌不在 DISEASE_PROFILES 中 → 视为无法识别 → 放行
    const result = isCancerTypeMismatch(
      { diagnosis: '小肠腺癌' },
      {
        id: 'pi3k-basket',
        name: '泛消化道 PIK3CA 篮子研究',
        indication: '消化道实体瘤 PIK3CA 突变',
        disease_tags: ['胃癌', '结直肠癌']
      }
    );
    expect(result.mismatch).toBe(false);
  });

  test('isCancerTypeMismatch helper：HCC 患者 vs HCC 专项 → 不触发', () => {
    const result = isCancerTypeMismatch(
      { diagnosis: '原发性肝癌' },
      {
        id: 'hcc-1',
        name: '肝细胞癌二线研究',
        indication: '晚期肝细胞癌',
        disease_tags: ['肝癌']
      }
    );
    expect(result.mismatch).toBe(false);
  });

  test('严格基因要求：EGFR 突变要求 + 患者 EGFR 野生 → 硬排除', () => {
    const r = scoreRecordAgainstTrial(
      { diagnosis: '非小细胞肺癌', gene_mutation: 'EGFR 野生型' },
      {
        id: 'X',
        name: 'EGFR-TKI 研究',
        indication: '非小细胞肺癌',
        inclusion_criteria: ['EGFR 突变阳性'],
        disease_tags: ['非小细胞肺癌']
      }
    );
    expect(r.excluded).toBe(true);
  });

  test('EGFR+ 患者 vs EGFR-TKI trial（同向）→ NOT excluded', () => {
    const r = scoreRecordAgainstTrial(
      { diagnosis: '非小细胞肺癌', gene_mutation: 'EGFR L858R 突变阳性' },
      {
        id: 'X',
        name: 'EGFR-TKI 研究',
        indication: '非小细胞肺癌',
        inclusion_criteria: ['EGFR 突变阳性'],
        disease_tags: ['非小细胞肺癌']
      }
    );
    expect(r.excluded).toBeFalsy();
    expect(r.score).toBeGreaterThan(0);
  });
});
