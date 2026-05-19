const { __testables } = require('../services/ocr');

describe('ocr rich entities and PDF timeout tiers', () => {
  const {
    parseKimiEntities,
    getPdfFirstHopTimeoutMs
  } = __testables;

  const SAVED_ENV = {
    OCR_PDF_FIRSTHOP_TIMEOUT_MS: process.env.OCR_PDF_FIRSTHOP_TIMEOUT_MS,
    OCR_PDF_FIRSTHOP_MEDIUM_TIMEOUT_MS: process.env.OCR_PDF_FIRSTHOP_MEDIUM_TIMEOUT_MS,
    OCR_PDF_FIRSTHOP_LONG_TIMEOUT_MS: process.env.OCR_PDF_FIRSTHOP_LONG_TIMEOUT_MS
  };

  afterEach(() => {
    for (const [key, value] of Object.entries(SAVED_ENV)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  test('parseKimiEntities preserves rich OCR schema fields for fast path reuse', () => {
    const entities = parseKimiEntities({
      diagnosis: '肺腺癌',
      stage: 'IV期',
      geneMutation: 'EGFR 19del',
      treatment: '奥希替尼',
      confidence: 0.88,
      age: 63,
      sex: '女',
      tnmStage: 'T2N1M1',
      pathologyType: '腺癌',
      hospital: '上海市肿瘤医院',
      diagnosisDate: '2026-05-01',
      metastasisSites: ['骨', '肝'],
      surgicalHistory: [{ name: '肺叶切除术', date: '2025-01-01' }],
      timeline: [{ date: '2026-05-01', event: '确诊', type: 'diagnosis' }],
      molecular: { drivers: [{ gene: 'EGFR', variant: '19del' }] },
      organoidDrugSensitivity: { sensitive: ['奥希替尼'], resistant: [] },
      imaging: [{ modality: 'CT', findings: '右肺占位' }],
      tumorMarkers: [{ name: 'CEA', value: 12.3, unit: 'ng/mL' }],
      treatmentHistory: [{ name: '奥希替尼', response: 'PR' }],
      labValues: { ALT: { value: 35, unit: 'U/L' } }
    });

    expect(entities.diagnosis).toBe('肺腺癌');
    expect(entities.confidence).toBe(0.88);
    expect(entities.pathologyType).toBe('腺癌');
    expect(entities.metastasisSites).toEqual(['骨', '肝']);
    expect(entities.molecular.drivers[0].gene).toBe('EGFR');
    expect(entities.treatmentHistory[0].name).toBe('奥希替尼');
    expect(entities.labValues.ALT.value).toBe(35);
  });

  test('getPdfFirstHopTimeoutMs uses 30/60/90 second tiers by extracted text length', () => {
    delete process.env.OCR_PDF_FIRSTHOP_TIMEOUT_MS;
    delete process.env.OCR_PDF_FIRSTHOP_MEDIUM_TIMEOUT_MS;
    delete process.env.OCR_PDF_FIRSTHOP_LONG_TIMEOUT_MS;

    expect(getPdfFirstHopTimeoutMs('短文本')).toBe(30000);
    expect(getPdfFirstHopTimeoutMs('x'.repeat(2500))).toBe(60000);
    expect(getPdfFirstHopTimeoutMs('x'.repeat(6000))).toBe(90000);
  });
});
