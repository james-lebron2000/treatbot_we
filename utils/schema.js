const GROUP_META = {
  basic: { title: '基本入组信息', order: 1 },
  tumor: { title: '肿瘤特征', order: 2 },
  treatment: { title: '既往治疗史', order: 3 },
  lab: { title: '实验室与器官功能', order: 4 },
  risk: { title: '感染与禁忌风险', order: 5 },
  other: { title: '补充信息', order: 6 }
}

const YES_NO_OPTIONS = ['是', '否']
const YES_NO_UNKNOWN_OPTIONS = ['是', '否', '不详']

const FIELD_SCHEMAS = [
  {
    key: 'diagnosis',
    label: '临床诊断',
    group: 'basic',
    type: 'text',
    required: true,
    hint: '例如：非小细胞肺癌',
    aliases: ['diagnosis', 'diag', 'disease', 'diagnose', '临床诊断', '诊断']
  },
  {
    key: 'pathologyType',
    label: '病理/组织学类型',
    group: 'basic',
    type: 'text',
    required: true,
    hint: '例如：肺腺癌、鳞癌',
    aliases: ['pathologyType', 'pathology', 'histology', '组织学', '病理类型']
  },
  {
    key: 'age',
    label: '年龄（岁）',
    group: 'basic',
    type: 'number',
    required: true,
    aliases: ['age', 'patientAge', '年龄']
  },
  {
    key: 'gender',
    label: '性别',
    group: 'basic',
    type: 'select',
    required: false,
    options: ['男', '女'],
    aliases: ['gender', 'sex', 'patientSex', '性别']
  },
  {
    key: 'stage',
    label: '分期',
    group: 'basic',
    type: 'select',
    required: true,
    options: ['I期', 'II期', 'III期', 'IV期', '局部晚期', '转移性', '未知'],
    aliases: ['stage', 'clinicalStage', 'tnmStage', '分期']
  },
  {
    key: 'ecog',
    label: 'ECOG 评分',
    group: 'basic',
    type: 'select',
    required: true,
    options: ['0', '1', '2', '3', '4'],
    aliases: ['ecog', 'ecogScore', 'ECOG', '体能状态']
  },
  {
    key: 'lifeExpectancyMonths',
    label: '预计生存期（月）',
    group: 'basic',
    type: 'number',
    required: false,
    aliases: ['lifeExpectancyMonths', 'lifeExpectancy', 'survivalMonths', '生存期']
  },
  {
    key: 'consentSigned',
    label: '已签署知情同意',
    group: 'basic',
    type: 'select',
    required: true,
    options: YES_NO_OPTIONS,
    aliases: ['consentSigned', 'informedConsent', '知情同意']
  },
  {
    key: 'geneMutation',
    label: '驱动基因突变',
    group: 'tumor',
    type: 'text',
    required: false,
    hint: '例如：EGFR 19del / ALK / ROS1',
    aliases: ['geneMutation', 'gene', 'mutation', 'geneStatus', '基因突变']
  },
  {
    key: 'pdL1',
    label: 'PD-L1 表达',
    group: 'tumor',
    type: 'text',
    required: false,
    hint: '例如：TPS 30%',
    aliases: ['pdL1', 'PD-L1', 'pd_l1', 'pdl1']
  },
  {
    key: 'targetLesion',
    label: '存在可测量病灶（RECIST）',
    group: 'tumor',
    type: 'select',
    required: true,
    options: YES_NO_UNKNOWN_OPTIONS,
    aliases: ['targetLesion', 'measurableLesion', 'recistMeasurable', '可测量病灶']
  },
  {
    key: 'brainMetastasis',
    label: '脑转移',
    group: 'tumor',
    type: 'select',
    required: false,
    options: YES_NO_UNKNOWN_OPTIONS,
    aliases: ['brainMetastasis', 'cnsMetastasis', '脑转移']
  },
  {
    key: 'liverMetastasis',
    label: '肝转移',
    group: 'tumor',
    type: 'select',
    required: false,
    options: YES_NO_UNKNOWN_OPTIONS,
    aliases: ['liverMetastasis', '肝转移']
  },
  {
    key: 'boneMetastasis',
    label: '骨转移',
    group: 'tumor',
    type: 'select',
    required: false,
    options: YES_NO_UNKNOWN_OPTIONS,
    aliases: ['boneMetastasis', '骨转移']
  },
  {
    key: 'lineOfTherapy',
    label: '既往治疗线数',
    group: 'treatment',
    type: 'number',
    required: false,
    aliases: ['lineOfTherapy', 'therapyLine', 'treatmentLines', '治疗线数']
  },
  {
    key: 'previousTreatments',
    label: '既往治疗描述',
    group: 'treatment',
    type: 'text',
    required: false,
    hint: '例如：奥希替尼后进展，后续含铂化疗',
    aliases: ['previousTreatments', 'treatment', 'treatmentHistory', '既往治疗']
  },
  {
    key: 'surgeryHistory',
    label: '既往手术治疗',
    group: 'treatment',
    type: 'select',
    required: false,
    options: YES_NO_UNKNOWN_OPTIONS,
    aliases: ['surgeryHistory', 'surgery', '手术史']
  },
  {
    key: 'radiotherapyHistory',
    label: '既往放疗',
    group: 'treatment',
    type: 'select',
    required: false,
    options: YES_NO_UNKNOWN_OPTIONS,
    aliases: ['radiotherapyHistory', 'radiotherapy', '放疗史']
  },
  {
    key: 'chemotherapyHistory',
    label: '既往化疗',
    group: 'treatment',
    type: 'select',
    required: false,
    options: YES_NO_UNKNOWN_OPTIONS,
    aliases: ['chemotherapyHistory', 'chemotherapy', '化疗史']
  },
  {
    key: 'immunotherapyHistory',
    label: '既往免疫治疗',
    group: 'treatment',
    type: 'select',
    required: false,
    options: YES_NO_UNKNOWN_OPTIONS,
    aliases: ['immunotherapyHistory', 'immunotherapy', '免疫治疗史']
  },
  {
    key: 'targetedTherapyHistory',
    label: '既往靶向治疗',
    group: 'treatment',
    type: 'select',
    required: false,
    options: YES_NO_UNKNOWN_OPTIONS,
    aliases: ['targetedTherapyHistory', 'targetedTherapy', '靶向治疗史']
  },
  {
    key: 'hemoglobin',
    label: '血红蛋白（g/L）',
    group: 'lab',
    type: 'number',
    required: false,
    aliases: ['hemoglobin', 'hb', '血红蛋白']
  },
  {
    key: 'neutrophils',
    label: '中性粒细胞（x10^9/L）',
    group: 'lab',
    type: 'number',
    required: false,
    aliases: ['neutrophils', 'anc', '中性粒细胞']
  },
  {
    key: 'platelets',
    label: '血小板（x10^9/L）',
    group: 'lab',
    type: 'number',
    required: false,
    aliases: ['platelets', 'plt', '血小板']
  },
  {
    key: 'alt',
    label: 'ALT（U/L）',
    group: 'lab',
    type: 'number',
    required: false,
    aliases: ['alt', 'ALT']
  },
  {
    key: 'ast',
    label: 'AST（U/L）',
    group: 'lab',
    type: 'number',
    required: false,
    aliases: ['ast', 'AST']
  },
  {
    key: 'bilirubin',
    label: '总胆红素（μmol/L）',
    group: 'lab',
    type: 'number',
    required: false,
    aliases: ['bilirubin', 'totalBilirubin', '总胆红素']
  },
  {
    key: 'creatinine',
    label: '血清肌酐（μmol/L）',
    group: 'lab',
    type: 'number',
    required: false,
    aliases: ['creatinine', 'scr', '肌酐']
  },
  {
    key: 'creatinineClearance',
    label: '肌酐清除率（mL/min）',
    group: 'lab',
    type: 'number',
    required: false,
    aliases: ['creatinineClearance', 'ccr', '肾小球滤过率', '肌酐清除率']
  },
  {
    key: 'hbvStatus',
    label: '乙肝状态',
    group: 'risk',
    type: 'select',
    required: false,
    options: ['阴性', '阳性-稳定', '阳性-活动', '不详'],
    aliases: ['hbvStatus', 'HBV', '乙肝']
  },
  {
    key: 'hcvStatus',
    label: '丙肝状态',
    group: 'risk',
    type: 'select',
    required: false,
    options: ['阴性', '阳性-稳定', '阳性-活动', '不详'],
    aliases: ['hcvStatus', 'HCV', '丙肝']
  },
  {
    key: 'hivStatus',
    label: 'HIV 状态',
    group: 'risk',
    type: 'select',
    required: false,
    options: ['阴性', '阳性-稳定', '阳性-活动', '不详'],
    aliases: ['hivStatus', 'HIV']
  },
  {
    key: 'activeInfection',
    label: '活动性感染',
    group: 'risk',
    type: 'select',
    required: false,
    options: YES_NO_UNKNOWN_OPTIONS,
    aliases: ['activeInfection', 'infection', '感染']
  },
  {
    key: 'autoimmuneDisease',
    label: '活动性自身免疫疾病',
    group: 'risk',
    type: 'select',
    required: false,
    options: YES_NO_UNKNOWN_OPTIONS,
    aliases: ['autoimmuneDisease', 'autoimmune', '自身免疫']
  },
  {
    key: 'organTransplant',
    label: '器官移植史',
    group: 'risk',
    type: 'select',
    required: false,
    options: YES_NO_UNKNOWN_OPTIONS,
    aliases: ['organTransplant', 'transplant', '器官移植']
  },
  {
    key: 'pregnancyStatus',
    label: '妊娠/哺乳状态',
    group: 'risk',
    type: 'select',
    required: false,
    options: ['无', '妊娠', '哺乳', '不适用', '不详'],
    aliases: ['pregnancyStatus', 'pregnancy', '妊娠']
  },
  {
    key: 'city',
    label: '就诊城市',
    group: 'other',
    type: 'text',
    required: false,
    aliases: ['city', 'location', '就诊城市']
  }
]

const pickValueByAlias = (raw, aliases) => {
  if (!raw || typeof raw !== 'object') {
    return ''
  }

  for (let i = 0; i < aliases.length; i += 1) {
    const key = aliases[i]
    if (raw[key] !== undefined && raw[key] !== null && raw[key] !== '') {
      return raw[key]
    }
  }

  return ''
}

const normalizeStructuredRecord = (raw) => {
  const source = raw || {}
  const normalized = {}

  FIELD_SCHEMAS.forEach((field) => {
    normalized[field.key] = pickValueByAlias(source, field.aliases)
  })

  normalized.id = source.id || source.recordId || source.fileId || ''
  normalized.matchCount = source.matchCount || source.matches || 0
  normalized.uploadTime = source.uploadTime || source.createdAt || ''
  normalized.updatedAt = source.updatedAt || source.uploadTime || ''

  return normalized
}

const isEmptyValue = (value) => {
  if (value === 0 || value === '0') {
    return false
  }

  if (Array.isArray(value)) {
    return value.length === 0
  }

  return value === null || value === undefined || `${value}`.trim() === ''
}

const getMissingFields = (record) => {
  const normalized = normalizeStructuredRecord(record)
  return FIELD_SCHEMAS.filter((field) => field.required && isEmptyValue(normalized[field.key]))
}

const getRequiredFieldCount = () => {
  return FIELD_SCHEMAS.filter((field) => field.required).length
}

const mergeSupplement = (record, supplement) => {
  return {
    ...normalizeStructuredRecord(record),
    ...(supplement || {})
  }
}

const formatValue = (value) => {
  if (isEmptyValue(value)) {
    return '待补'
  }
  return `${value}`
}

const buildRecordSections = (record) => {
  const normalized = normalizeStructuredRecord(record)
  const grouped = {}

  Object.keys(GROUP_META).forEach((groupKey) => {
    grouped[groupKey] = []
  })

  FIELD_SCHEMAS.forEach((field) => {
    const rawValue = normalized[field.key]
    const empty = isEmptyValue(rawValue)
    grouped[field.group].push({
      key: field.key,
      label: field.label,
      value: formatValue(rawValue),
      required: field.required,
      isMissing: empty
    })
  })

  return Object.keys(GROUP_META)
    .sort((a, b) => GROUP_META[a].order - GROUP_META[b].order)
    .map((groupKey) => {
      const fields = grouped[groupKey]
      const totalCount = fields.length
      const filledCount = fields.filter((field) => !field.isMissing).length
      const requiredTotal = fields.filter((field) => field.required).length
      const requiredMissing = fields.filter((field) => field.required && field.isMissing).length
      return {
        key: groupKey,
        title: GROUP_META[groupKey].title,
        fields,
        totalCount,
        filledCount,
        requiredTotal,
        requiredMissing
      }
    })
}

const buildStructuredSummary = (record) => {
  const normalized = normalizeStructuredRecord(record)
  const requiredFields = FIELD_SCHEMAS.filter((field) => field.required)
  const missingRequired = requiredFields.filter((field) => isEmptyValue(normalized[field.key])).length
  const requiredTotal = requiredFields.length
  const completedRequired = requiredTotal - missingRequired
  const completeness = requiredTotal > 0 ? Math.round((completedRequired / requiredTotal) * 100) : 100

  return {
    requiredTotal,
    missingRequired,
    completedRequired,
    completeness
  }
}

const buildRecordPreview = (record) => {
  const normalized = normalizeStructuredRecord(record)
  return [
    { label: '临床诊断', value: normalized.diagnosis || '待补' },
    { label: '病理类型', value: normalized.pathologyType || '待补' },
    { label: '分期', value: normalized.stage || '待补' },
    { label: '年龄', value: normalized.age === '' ? '待补' : `${normalized.age}` },
    { label: 'ECOG评分', value: normalized.ecog === '' ? '待补' : `${normalized.ecog}` },
    { label: '基因突变', value: normalized.geneMutation || '待补' }
  ]
}

module.exports = {
  GROUP_META,
  FIELD_SCHEMAS,
  normalizeStructuredRecord,
  getMissingFields,
  getRequiredFieldCount,
  mergeSupplement,
  buildRecordPreview,
  buildRecordSections,
  buildStructuredSummary
}
