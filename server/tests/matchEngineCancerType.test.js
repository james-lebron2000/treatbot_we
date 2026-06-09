// Patient-safety regression: SCLC must not be misclassified as NSCLC.
// Root cause (fixed): containsAlias matched bidirectionally, so "小细胞肺癌"
// was a substring of "非小细胞肺癌" and resolved to lung_nsclc, defeating the
// cancer-type hard-exclusion. These use only the pure exports (no DB).
const { getDiseaseProfile, isCancerTypeMismatch } = require('../services/matchEngine');

describe('cancer-type disambiguation (SCLC vs NSCLC)', () => {
  test('SCLC text resolves to lung_sclc (not lung_nsclc)', () => {
    expect(getDiseaseProfile('小细胞肺癌')?.id).toBe('lung_sclc');
  });

  test('NSCLC text resolves to lung_nsclc', () => {
    expect(getDiseaseProfile('非小细胞肺癌')?.id).toBe('lung_nsclc');
  });

  test('SCLC patient is hard-excluded from an NSCLC trial', () => {
    const r = isCancerTypeMismatch({ diagnosis: '小细胞肺癌' }, { indication: '非小细胞肺癌' });
    expect(r.mismatch).toBe(true);
  });

  test('NSCLC patient is NOT excluded from an NSCLC trial', () => {
    const r = isCancerTypeMismatch({ diagnosis: '非小细胞肺癌' }, { indication: '非小细胞肺癌' });
    expect(r.mismatch).toBe(false);
  });

  test('SCLC patient is NOT excluded from an SCLC trial (no false exclusion)', () => {
    const r = isCancerTypeMismatch({ diagnosis: '小细胞肺癌' }, { indication: '小细胞肺癌' });
    expect(r.mismatch).toBe(false);
  });
});
