// PRD-2026Q2 §共享层：上传/病历结构化的「必填字段」单一来源。
//
// 这份文件用 CommonJS 导出，目的是让两端共消费同一组常量：
//   - 小程序  utils/schema.js        require('../shared/schemas/upload.js')
//   - H5      web/src/schemas/...    后续可写一个 .ts 包装器 import 这份 .js
//
// 历史注记：曾用 .cjs 扩展名，因 WeChat 小程序 require() 解析器只识别 .js，
// 编译期会直接「module not found」；统一改成 .js 后两端都能解析，
// 且仓库根目录没有 package.json "type":"module"，Node 默认按 CJS 读取。
//
// 本轮只把「必填字段集」放进来——这是最容易漂的一块（增删一项必填会波及
// UploadView 进度条、records 列表 missingCount、matches 评分降权三处逻辑）。
// 完整的 FIELD_SCHEMAS 含别名 / 分组 / 类型，体量大、变动少，下一轮再迁。

// PRD-2026Q4 followup（统一三端上传批次上限）：
// 一次上传最多 N 份文件，三端必须同号：
//   - server/controllers/medical.js  multer.array('files', N) + 业务层 BATCH_UPLOAD_MAX 校验
//   - pages/upload/upload.js          MAX_UPLOAD_COUNT（chooseMedia count + slice cap）
//   - web/src/pages/UploadView.vue    MAX_BATCH_FILES（onFileChange 客户端 cap）
// 历史上三处各自硬编码，发生过两次"一边改了另两边漏改"事故，所以收编到这里
// 作为单一来源。env BATCH_UPLOAD_MAX（仅服务端）仍然可以覆盖默认值，client
// 不读 env，保持纯静态常量，便于打包构建。
//
// 选 9：与 wx.chooseMedia 单次上限一致 + 朋友圈 9 张图心智模型 + WXML 历史 `<9` 判断。
// 速率：用户 30/h × 9 = 270 份/小时，单份 OCR ~$0.05，~$13.5/h/user 上限可控。
const BATCH_UPLOAD_MAX = 9

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
  BATCH_UPLOAD_MAX,
  REQUIRED_FIELDS,
  SEX_VALUES,
  ECOG_VALUES,
  STAGE_VALUES,
  AGE_RANGE,
  isEmpty,
  getMissingRequiredKeys,
  validate
}
