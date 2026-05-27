// PRD-2026Q4 followup（B3）契约测试：锁住 mergeStructuredEntities 的全字段合并行为，
// 防止它被悄悄退化回「只挑 4 个字段（diagnosis/stage/geneMutation/treatment）」的旧实现 ——
// 那会让用户走 polling fallback 时看到大量 "still missing" 提示，即使服务端实际抽出了
// age/ecog/pdL1/pathologyType 等 30+ 字段。
//
// PR #26 的 node 烟雾测试有 70+ 断言但未入库；本文件挑出最有契约价值的 invariants 入库。
//
// 测试环境：parse-task → api → wx.getAccountInfoSync 在模块加载时被调用，
// 所以 global.wx 必须先于 require 安装。

const storage = new Map()

global.wx = {
  getAccountInfoSync: () => ({ miniProgram: { envVersion: 'develop' } }),
  getStorageSync: (key) => storage.get(key) || null,
  setStorageSync: (key, value) => { storage.set(key, value) },
  removeStorageSync: (key) => { storage.delete(key) },
  getStorageInfoSync: () => ({ keys: Array.from(storage.keys()) })
}

const {
  setActiveParseBatch,
  syncActiveParseBatch,
  mergeStructuredEntities
} = require('../parse-task')
const { FIELD_SCHEMAS } = require('../schema')
const api = require('../api')

const REQUIRED_KEY_COUNT = FIELD_SCHEMAS.length    // 应是 30+（PR #26 描述说 37）

const originalGetParseStatusBatch = api.getParseStatusBatch
const originalGetMatches = api.getMatches

beforeEach(() => {
  storage.clear()
  api.getParseStatusBatch = jest.fn()
  api.getMatches = jest.fn(() => Promise.resolve({ data: [] }))
})

afterAll(() => {
  api.getParseStatusBatch = originalGetParseStatusBatch
  api.getMatches = originalGetMatches
})

describe('mergeStructuredEntities — null/empty edge cases', () => {
  test('空数组 → null（上传页走 handleParseFailure 分支）', () => {
    expect(mergeStructuredEntities([])).toBeNull()
  })

  test('只有 errored、无 completed → null（同样走失败分支）', () => {
    const out = mergeStructuredEntities([
      { fileId: 'f1', status: 'error', errorMsg: 'OCR 抽空文本' }
    ])
    expect(out).toBeNull()
  })

  test('null / undefined entry 不抛错', () => {
    expect(() => mergeStructuredEntities([null, undefined])).not.toThrow()
    expect(mergeStructuredEntities([null, undefined])).toBeNull()
  })
})

describe('mergeStructuredEntities — full-field shape (B3 核心契约)', () => {
  test('I1: 单条 completed → merged 形状覆盖全部 FIELD_SCHEMAS keys（防止再退化回 4 字段）', () => {
    const out = mergeStructuredEntities([{
      fileId: 'f1',
      recordId: 'r1',
      status: 'completed',
      result: { diagnosis: '非小细胞肺癌', stage: 'IV期', age: 65 }
    }])

    expect(out).not.toBeNull()
    // 至少这些 30+ 个 schema key 都应在 merged 对象里（值可能为 ''，但 key 必须存在）
    for (const field of FIELD_SCHEMAS) {
      expect(out).toHaveProperty(field.key)
    }
    // 健壮性兜底：merged 至少包含 FIELD_SCHEMAS.length 个 schema key + 一些辅助键
    const schemaKeysPresent = FIELD_SCHEMAS.filter((f) => Object.prototype.hasOwnProperty.call(out, f.key)).length
    expect(schemaKeysPresent).toBe(REQUIRED_KEY_COUNT)
  })

  test('I2: 输入用 alias / 中文键（pathology / 病理类型 / patientAge / sex）→ 解析到 canonical key', () => {
    const out = mergeStructuredEntities([{
      fileId: 'f1',
      recordId: 'r1',
      status: 'completed',
      result: {
        '诊断': '非小细胞肺癌',           // → diagnosis
        pathology: '腺癌',                // → pathologyType
        patientAge: 70,                  // → age
        sex: '男',                       // → gender
        ECOG: '1'                        // → ecog
      }
    }])

    expect(out.diagnosis).toBe('非小细胞肺癌')
    expect(out.pathologyType).toBe('腺癌')
    expect(out.age).toBe(70)
    expect(out.gender).toBe('男')
    expect(out.ecog).toBe('1')
  })

  test('I3: 两条 completed → 首条非空 wins（同患者多份病历，先到先得）', () => {
    const out = mergeStructuredEntities([
      {
        fileId: 'f1', recordId: 'r1', status: 'completed',
        result: { diagnosis: '非小细胞肺癌', age: '' }   // 第一份有 diagnosis，无 age
      },
      {
        fileId: 'f2', recordId: 'r2', status: 'completed',
        result: { diagnosis: '小细胞肺癌', age: 65 }     // 第二份补 age（diagnosis 不覆盖）
      }
    ])

    expect(out.diagnosis).toBe('非小细胞肺癌')   // first-wins
    expect(out.age).toBe(65)                     // second 补字段
  })

  test('I4: previousTreatments 走拼接去重（不被 first-wins 跳过）', () => {
    const out = mergeStructuredEntities([
      {
        fileId: 'f1', recordId: 'r1', status: 'completed',
        result: { previousTreatments: '吉非替尼' }
      },
      {
        fileId: 'f2', recordId: 'r2', status: 'completed',
        result: { previousTreatments: '奥希替尼' }
      },
      {
        fileId: 'f3', recordId: 'r3', status: 'completed',
        result: { previousTreatments: '吉非替尼' }    // 重复，期望去重
      }
    ])

    const parts = (out.previousTreatments || '').split('；').filter(Boolean).sort()
    expect(parts).toEqual(['吉非替尼', '奥希替尼'].sort())
  })

  test('I5: confidence = max across entries（不是 first-wins，也不是平均）', () => {
    const out = mergeStructuredEntities([
      { fileId: 'f1', recordId: 'r1', status: 'completed', result: { confidence: 0.4 } },
      { fileId: 'f2', recordId: 'r2', status: 'completed', result: { confidence: 0.9 } },
      { fileId: 'f3', recordId: 'r3', status: 'completed', result: { confidence: 0.6 } }
    ])
    expect(out.confidence).toBe(0.9)
  })

  test('I6: sourceRecordIds 收集所有 completed 的 recordId（顺序保留）', () => {
    const out = mergeStructuredEntities([
      { fileId: 'f1', recordId: 'r-A', status: 'completed', result: { diagnosis: 'd1' } },
      { fileId: 'f2', recordId: 'r-B', status: 'completed', result: { diagnosis: 'd2' } }
    ])
    expect(out.sourceRecordIds).toEqual(['r-A', 'r-B'])
  })

  test('I7: 混合 completed + errored —— erroredFileIds 抓全，firstError 取首条', () => {
    const out = mergeStructuredEntities([
      { fileId: 'f1', recordId: 'r1', status: 'completed', result: { diagnosis: 'd1' } },
      { fileId: 'f2', status: 'error', errorMsg: 'OCR 抽空文本' },
      { fileId: 'f3', status: 'failed', errorMsg: '超时' }
    ])

    expect(out).not.toBeNull()
    expect(out.diagnosis).toBe('d1')
    expect(out.erroredFileIds.sort()).toEqual(['f2', 'f3'].sort())
    expect(out.firstError).toBe('OCR 抽空文本')   // 取首条非空 errorMsg
  })

  test('I8: 历史消费方按 `treatment` 读取 → 与 previousTreatments 别名一致（不破坏旧消费）', () => {
    const out = mergeStructuredEntities([{
      fileId: 'f1', recordId: 'r1', status: 'completed',
      result: { previousTreatments: '化疗+放疗' }
    }])
    expect(out.treatment).toBe(out.previousTreatments)
    expect(out.treatment).toBe('化疗+放疗')
  })

  test('I9: 数字 0 不被当作空值覆盖（age=0 / ecog=0 这些边界值应保留）', () => {
    // ecog 是 select：'0' 字符串
    const out = mergeStructuredEntities([
      { fileId: 'f1', recordId: 'r1', status: 'completed', result: { ecog: '0' } },
      { fileId: 'f2', recordId: 'r2', status: 'completed', result: { ecog: '2' } }
    ])
    expect(out.ecog).toBe('0')  // first-wins，'0' 不被当 '' 跳过
  })

  test('I10: completed entry 使用 result.entities 时仍合并出完整字段', () => {
    const out = mergeStructuredEntities([{
      fileId: 'f1',
      recordId: 'r1',
      status: 'completed',
      result: {
        entities: {
          diagnosis: '肺腺癌',
          stage: 'IV期',
          age: 66,
          ecog: '1',
          geneMutation: 'EGFR 19del',
          confidence: 0.87
        }
      }
    }])

    expect(out.diagnosis).toBe('肺腺癌')
    expect(out.stage).toBe('IV期')
    expect(out.age).toBe(66)
    expect(out.ecog).toBe('1')
    expect(out.geneMutation).toBe('EGFR 19del')
    expect(out.confidence).toBe(0.87)
  })
})

describe('syncActiveParseBatch storage contract', () => {
  test('批量完成后 structuredRecordDraft 写 mergedEntities，而不是最后一张单图结果', async () => {
    setActiveParseBatch({
      fileIds: ['f1', 'f2'],
      startedAt: Date.now()
    })
    api.getParseStatusBatch.mockResolvedValueOnce({
      data: {
        total: 2,
        completedCount: 2,
        erroredCount: 0,
        done: true,
        entries: [
          {
            fileId: 'f1',
            recordId: 'r1',
            status: 'completed',
            result: {
              entities: {
                diagnosis: '肺腺癌',
                stage: 'IV期'
              }
            }
          },
          {
            fileId: 'f2',
            recordId: 'r2',
            status: 'completed',
            result: {
              entities: {
                age: 66,
                ecog: '1',
                geneMutation: 'EGFR 19del'
              }
            }
          }
        ]
      }
    })

    const out = await syncActiveParseBatch()
    const draft = storage.get('structuredRecordDraft')

    expect(out.done).toBe(true)
    expect(draft).toEqual(expect.objectContaining({
      diagnosis: '肺腺癌',
      stage: 'IV期',
      age: 66,
      ecog: '1',
      geneMutation: 'EGFR 19del',
      recordId: 'r1'
    }))
    expect(draft.sourceRecordIds).toEqual(['r1', 'r2'])
    expect(storage.get('currentRecordId')).toBe('r1')
  })

  test('批量部分失败后 currentRecordId 选第一份成功 completed，不落到失败的第一份 fileId', async () => {
    setActiveParseBatch({
      fileIds: ['f-failed', 'f-ok'],
      startedAt: Date.now()
    })
    api.getParseStatusBatch.mockResolvedValueOnce({
      data: {
        total: 2,
        completedCount: 1,
        erroredCount: 1,
        done: true,
        entries: [
          {
            fileId: 'f-failed',
            recordId: 'r-failed',
            status: 'error',
            errorMsg: 'OCR 抽空文本'
          },
          {
            fileId: 'f-ok',
            recordId: 'r-ok',
            status: 'completed',
            result: {
              entities: {
                diagnosis: '肺腺癌',
                stage: 'IV期'
              }
            }
          }
        ]
      }
    })

    const out = await syncActiveParseBatch()
    const draft = storage.get('structuredRecordDraft')

    expect(out.done).toBe(true)
    expect(out.completedRecordIds).toEqual(['r-ok'])
    expect(draft).toEqual(expect.objectContaining({
      diagnosis: '肺腺癌',
      stage: 'IV期',
      recordId: 'r-ok'
    }))
    expect(storage.get('currentRecordId')).toBe('r-ok')
  })
})
