// PRD-2026Q2 §共享层：上传/病历结构化的「必填字段」单一来源。
//
// 这份文件用 CommonJS 导出，目的是让两端共消费同一组常量：
//   - 小程序  utils/schema.js        require('../shared/schemas/upload.cjs')
//   - H5      web/src/schemas/...    后续可写一个 .ts 包装器 import 这份 .cjs
//             （Vite 默认能打 .cjs；TS 端可加 declare module 声明类型）
//
// 本轮只把「必填字段集」放进来——这是最容易漂的一块（增删一项必填会波及
// UploadView 进度条、records 列表 missingCount、matches 评分降权三处逻辑）。
// 完整的 FIELD_SCHEMAS 含别名 / 分组 / 类型，体量大、变动少，下一轮再迁。

// 与 H5 web/src/utils/track.ts 的 6-event whitelist 思路一致：单一来源 + 校验。
const REQUIRED_FIELDS = [
  'diagnosis',       // 临床诊断
  'pathologyType',   // 病理/组织学类型
  'age',             // 年龄（岁）
  'stage',           // 分期
  'ecog',            // ECOG 评分
  'consentSigned',   // 知情同意书签署
  'targetLesion'     // 是否存在可测量靶病灶（影响入组评估）
]

// 简易枚举值，便于 H5 / WeApp 统一表单 picker 选项。
const SEX_VALUES = ['男', '女']
const ECOG_VALUES = [0, 1, 2, 3, 4]
const STAGE_VALUES = ['I期', 'II期', 'III期', 'IV期', '局部晚期', '转移性', '未知']

const AGE_RANGE = [0, 120]

const isEmpty = (value) => {
  if (typeof value === 'number') return Number.isNaN(value)
  if (Array.isArray(value)) return value.length === 0
  return value === null || value === undefined || `${value}`.trim() === ''
}

// 返回缺失的必填 key 数组——给 UploadView 进度条 / records missingCount 共用。
const getMissingRequiredKeys = (record) => {
  const data = record && typeof record === 'object' ? record : {}
  return REQUIRED_FIELDS.filter((key) => isEmpty(data[key]))
}

// 简易 issues 数组，结构对齐 zod 的 SafeParseError.error.issues，
// H5 后续接 zod 时可直接喂出。
const validate = (record) => {
  const issues = []
  const data = record && typeof record === 'object' ? record : {}

  REQUIRED_FIELDS.forEach((key) => {
    if (isEmpty(data[key])) {
      issues.push({ path: [key], code: 'required', message: `${key} 为必填` })
    }
  })

  if (!isEmpty(data.age)) {
    const n = Number(data.age)
    if (Number.isNaN(n) || n < AGE_RANGE[0] || n > AGE_RANGE[1]) {
      issues.push({
        path: ['age'],
        code: 'out_of_range',
        message: `age 必须在 ${AGE_RANGE[0]}-${AGE_RANGE[1]} 之间`
      })
    }
  }

  return { ok: issues.length === 0, issues }
}

module.exports = {
  REQUIRED_FIELDS,
  SEX_VALUES,
  ECOG_VALUES,
  STAGE_VALUES,
  AGE_RANGE,
  isEmpty,
  getMissingRequiredKeys,
  validate
}
