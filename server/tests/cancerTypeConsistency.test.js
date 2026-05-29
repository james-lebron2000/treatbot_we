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

  test('NSCLC vs SCLC must not cross-match through substring aliases', () => {
    const r = scoreRecordAgainstTrial(
      { diagnosis: '非小细胞肺癌（肺腺癌）', stage: 'IV期', age: 55, structured: { entities: { ecog: 1, age: 55 } } },
      {
        id: 'sclc-only',
        name: '小细胞肺癌二线研究',
        indication: '小细胞肺癌',
        disease_tags: ['小细胞肺癌'],
        inclusion_criteria: ['小细胞肺癌患者', 'ECOG 0-1']
      }
    );
    expect(r.excluded).toBe(true);
    expect(r.reasons.join(' ')).toMatch(/小细胞肺癌|非小细胞肺癌/);
  });

  test('structured prior_lines_max excludes patients beyond allowed treatment line', () => {
    const r = scoreRecordAgainstTrial(
      { diagnosis: '结直肠癌', treatment_line: 3, structured: { entities: { treatmentLine: 3, age: 60, ecog: 1 } } },
      {
        id: 'first-line-crc',
        name: '结直肠癌一线研究',
        indication: '结直肠癌',
        disease_tags: ['结直肠癌'],
        structured_inclusion: {
          allowed_cancer_types: ['结直肠癌'],
          prior_lines_max: 0,
          age_min: 18,
          ecog_max: 1
        }
      }
    );
    expect(r.excluded).toBe(true);
    expect(r.reasons.join(' ')).toMatch(/治疗线数/);
  });

  test('TNBC patient vs HER2-positive structured trial → excluded', () => {
    const r = scoreRecordAgainstTrial(
      {
        diagnosis: '三阴性乳腺癌',
        gene_mutation: 'BRCA1突变',
        structured: { entities: { pathologyType: '三阴性乳腺癌', age: 45, ecog: 0 } }
      },
      {
        id: 'her2-breast',
        name: 'HER2阳性乳腺癌研究',
        indication: '乳腺癌',
        disease_tags: ['乳腺癌'],
        structured_inclusion: {
          allowed_cancer_types: ['HER2阳性乳腺癌'],
          required_genes: ['HER2阳性（IHC3+或FISH+）'],
          age_min: 18,
          ecog_max: 1
        }
      }
    );
    expect(r.excluded).toBe(true);
    expect(r.reasons.join(' ')).toMatch(/HER2/);
  });

  test('other actionable driver exclusion blocks off-target mutant-driver patients', () => {
    const r = scoreRecordAgainstTrial(
      {
        diagnosis: '非小细胞肺癌',
        gene_mutation: 'ALK融合阳性',
        structured: { entities: { geneMutation: 'ALK融合阳性', age: 60, ecog: 0, treatmentLine: 1 } }
      },
      {
        id: 'her2-nsclc',
        name: 'HER2突变NSCLC研究',
        indication: '非小细胞肺癌',
        disease_tags: ['非小细胞肺癌'],
        structured_inclusion: {
          allowed_cancer_types: ['非小细胞肺癌'],
          required_genes: ['HER2 TKD激活突变'],
          other_key_criteria: ['排除存在其他可靶向改变且已获批治疗的肿瘤'],
          age_min: 18
        }
      }
    );
    expect(r.excluded).toBe(true);
    expect(r.reasons.join(' ')).toMatch(/ALK|可靶向/);
  });

  test('HER2 basket trial without actionable-driver exclusion keeps missing HER2 as non-hard decision', () => {
    const r = scoreRecordAgainstTrial(
      {
        diagnosis: '结直肠癌',
        gene_mutation: 'BRAF V600E突变',
        structured: { entities: { geneMutation: 'BRAF V600E突变', age: 58, ecog: 0, treatmentLine: 2 } }
      },
      {
        id: 'her2-basket',
        name: 'HER2突变实体瘤研究',
        indication: '实体瘤',
        disease_tags: ['全部实体瘤'],
        structured_inclusion: {
          allowed_cancer_types: ['结直肠癌', '其他实体瘤'],
          required_genes: ['HER2激活突变'],
          age_min: 18
        }
      }
    );
    expect(r.excluded).toBeFalsy();
    expect(r.score).toBeGreaterThanOrEqual(0);
  });
});
