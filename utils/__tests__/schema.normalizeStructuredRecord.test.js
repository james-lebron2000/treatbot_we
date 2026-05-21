// Contract: normalizeStructuredRecord must understand both legacy flat OCR
// results and the newer nested entities returned by parse-status/SSE.

const schema = require('../schema')

describe('normalizeStructuredRecord nested entities compatibility', () => {
  test('reads raw.entities into card fields', () => {
    const out = schema.normalizeStructuredRecord({
      id: 'rec-001',
      entities: {
        diagnosis: '肺腺癌',
        stage: 'IV期',
        age: 65,
        ecog: '1',
        geneMutation: 'EGFR L858R'
      }
    })

    expect(out.id).toBe('rec-001')
    expect(out.diagnosis).toBe('肺腺癌')
    expect(out.stage).toBe('IV期')
    expect(out.age).toBe(65)
    expect(out.ecog).toBe('1')
    expect(out.geneMutation).toBe('EGFR L858R')
  })

  test('reads structured.entities into card fields', () => {
    const out = schema.normalizeStructuredRecord({
      id: 'rec-002',
      structured: {
        entities: {
          diagnosis: '非小细胞肺癌',
          stage: 'III期',
          age: 70,
          ecog: '2'
        }
      }
    })

    expect(out.id).toBe('rec-002')
    expect(out.diagnosis).toBe('非小细胞肺癌')
    expect(out.stage).toBe('III期')
    expect(out.age).toBe(70)
    expect(out.ecog).toBe('2')
  })

  test('reads result.entities wrapper from parse-status/SSE payloads', () => {
    const out = schema.normalizeStructuredRecord({
      recordId: 'rec-003',
      result: {
        entities: {
          diagnosis: '肺鳞癌',
          stage: '局部晚期',
          geneMutation: 'ALK 阴性'
        }
      }
    })

    expect(out.id).toBe('rec-003')
    expect(out.diagnosis).toBe('肺鳞癌')
    expect(out.stage).toBe('局部晚期')
    expect(out.geneMutation).toBe('ALK 阴性')
  })

  test('flat top-level fields override nested entities', () => {
    const out = schema.normalizeStructuredRecord({
      entities: {
        diagnosis: '旧诊断',
        stage: 'III期'
      },
      diagnosis: '用户修正诊断',
      stage: 'IV期'
    })

    expect(out.diagnosis).toBe('用户修正诊断')
    expect(out.stage).toBe('IV期')
  })

  test('empty flat compatibility fields do not erase nested entities', () => {
    const out = schema.normalizeStructuredRecord({
      result: {
        entities: {
          diagnosis: '肺腺癌',
          stage: 'IV期'
        },
        diagnosis: '',
        stage: null
      },
      diagnosis: ''
    })

    expect(out.diagnosis).toBe('肺腺癌')
    expect(out.stage).toBe('IV期')
  })

  test('array aliases stringify to readable text instead of [object Object]', () => {
    const out = schema.normalizeStructuredRecord({
      entities: {
        treatmentHistory: [
          { name: '奥希替尼', startDate: '2024-01', response: '进展' },
          { regimen: '含铂化疗' }
        ]
      }
    })

    expect(out.previousTreatments).toContain('奥希替尼')
    expect(out.previousTreatments).toContain('2024-01')
    expect(out.previousTreatments).toContain('含铂化疗')
    expect(out.previousTreatments).not.toContain('[object Object]')
  })
})
