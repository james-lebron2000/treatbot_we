// 结构化字段分组：决定流式时按什么次序"凑齐一组就广播"。
// 与 server/services/llmSchemas.js OcrExtractionSchema 的字段名严格对齐——
// 增删字段时务必两边同步，否则 partial-json 永远凑不齐某一组。
//
// progress 区间：basic=50 → diagnosis=65 → treatment=80 → timeline=95，
// 留 95→100 给 completed 终态。

const GROUPS = Object.freeze({
  // 「合成」分组：rawText 单独作为一个"组"，让 chatJsonStream 在 rawText 完成时
  // 触发一次回调；orchestrator 把它转成 stage='ocr_text' 而不是 'field_group'。
  preview: Object.freeze({
    label: '原文识别',
    progress: 40,
    keys: Object.freeze(['rawText'])
  }),
  basic: Object.freeze({
    label: '基本信息',
    progress: 50,
    keys: Object.freeze(['age', 'sex', 'weight', 'height', 'ecog', 'hospital'])
  }),
  diagnosis: Object.freeze({
    label: '诊断',
    progress: 65,
    keys: Object.freeze([
      'diagnosis',
      'stage',
      'tnmStage',
      'pathologyType',
      'geneMutation',
      'pdl1',
      'metastasisSites'
    ])
  }),
  treatment: Object.freeze({
    label: '治疗',
    progress: 80,
    keys: Object.freeze([
      'treatment',
      'treatmentLine',
      'priorTherapies',
      'treatmentHistory'
    ])
  }),
  timeline: Object.freeze({
    label: '病程时间线',
    progress: 95,
    keys: Object.freeze(['timeline', 'diagnosisDate', 'surgicalHistory'])
  })
})

const GROUP_ORDER = Object.freeze(['preview', 'basic', 'diagnosis', 'treatment', 'timeline'])

// 哪些组属于"显示在病例卡上的字段块"（preview 不是真正的字段卡）。
const RENDERABLE_GROUPS = Object.freeze(['basic', 'diagnosis', 'treatment', 'timeline'])

// 反查：某字段属于哪个分组（前端按字段填写时方便高亮对应骨架）。
const FIELD_TO_GROUP = (() => {
  const map = {}
  for (const groupName of GROUP_ORDER) {
    for (const key of GROUPS[groupName].keys) {
      map[key] = groupName
    }
  }
  return Object.freeze(map)
})()

// 给定一个 partial 对象，判断哪些 group 已"凑齐所有 key"。
// 用于 chatJsonStream 在每次 partial-json 解析后判断要不要 emit。
// 注意：值可以是 null / "" / [] —— 这都视为"模型已表态"。判定依据是 key 存在性。
const findCompletedGroups = (partial = {}) => {
  if (!partial || typeof partial !== 'object') return []
  const completed = []
  for (const groupName of GROUP_ORDER) {
    const allKeysPresent = GROUPS[groupName].keys.every(
      (key) => Object.prototype.hasOwnProperty.call(partial, key)
    )
    if (allKeysPresent) completed.push(groupName)
  }
  return completed
}

// 取 partial 中属于某 group 的字段子集（用于事件 payload）。
const pickGroupFields = (partial = {}, groupName) => {
  const group = GROUPS[groupName]
  if (!group) return {}
  const out = {}
  for (const key of group.keys) {
    if (Object.prototype.hasOwnProperty.call(partial, key)) {
      out[key] = partial[key]
    }
  }
  return out
}

module.exports = {
  GROUPS,
  GROUP_ORDER,
  RENDERABLE_GROUPS,
  FIELD_TO_GROUP,
  findCompletedGroups,
  pickGroupFields
}
