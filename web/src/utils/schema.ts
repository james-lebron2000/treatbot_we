export type FieldSchema = {
  key: string
  label: string
  friendlyLabel: string
  group?: 'basic' | 'tumor' | 'treatment' | 'lab' | 'risk' | 'other'
  type: 'text' | 'number' | 'select'
  required: boolean
  options?: string[]
  aliases: string[]
  hint?: string
  placeholder?: string
}

const YES_NO_OPTIONS = ['是', '否']
const YES_NO_UNKNOWN_OPTIONS = ['是', '否', '不详']

export const FIELD_SCHEMAS: FieldSchema[] = [
  {
    key: 'diagnosis', label: '临床诊断', friendlyLabel: '癌症类型', group: 'basic',
    type: 'text', required: true,
    aliases: ['diagnosis', 'diag', 'disease', 'diagnose', '临床诊断', '诊断'],
    hint: '在病理报告或出院小结上可以找到',
    placeholder: '例如：非小细胞肺癌、胃腺癌'
  },
  {
    key: 'pathologyType', label: '病理/组织学类型', friendlyLabel: '病理类型', group: 'basic',
    type: 'text', required: true,
    aliases: ['pathologyType', 'pathology', 'histology', '组织学', '病理类型'],
    placeholder: '例如：肺腺癌、鳞癌'
  },
  {
    key: 'age', label: '年龄（岁）', friendlyLabel: '年龄', group: 'basic',
    type: 'number', required: true,
    aliases: ['age', 'patientAge', '年龄']
  },
  {
    key: 'gender', label: '性别', friendlyLabel: '性别', group: 'basic',
    type: 'select', required: false,
    options: ['男', '女'],
    aliases: ['gender', 'sex', 'patientSex', '性别']
  },
  {
    key: 'sex', label: '性别', friendlyLabel: '性别', group: 'basic',
    type: 'select', required: false,
    options: ['男', '女'],
    aliases: ['sex', 'gender', 'patientSex', '性别']
  },
  {
    key: 'stage', label: '分期', friendlyLabel: '疾病分期', group: 'basic',
    type: 'select', required: true,
    options: ['I期', 'II期', 'III期', 'IV期', '局部晚期', '转移性', '未知'],
    aliases: ['stage', 'clinicalStage', 'tnmStage', '分期'],
    hint: '通常写在诊断后面，如"IV期"或"晚期"'
  },
  {
    key: 'ecog', label: 'ECOG 评分', friendlyLabel: '体能状态', group: 'basic',
    type: 'select', required: true,
    options: ['0', '1', '2', '3', '4'],
    aliases: ['ecog', 'ecogScore', 'ECOG', '体能状态'],
    hint: '0=正常活动 1=轻度受限 2=能自理但不能工作 3=需要卧床'
  },
  {
    key: 'lifeExpectancyMonths', label: '预计生存期（月）', friendlyLabel: '预计生存期', group: 'basic',
    type: 'number', required: false,
    aliases: ['lifeExpectancyMonths', 'lifeExpectancy', 'survivalMonths', '生存期']
  },
  {
    key: 'consentSigned', label: '已签署知情同意', friendlyLabel: '知情同意', group: 'basic',
    type: 'select', required: true,
    options: YES_NO_OPTIONS,
    aliases: ['consentSigned', 'informedConsent', '知情同意']
  },
  {
    key: 'geneMutation', label: '驱动基因突变', friendlyLabel: '基因检测结果', group: 'tumor',
    type: 'text', required: false,
    aliases: ['geneMutation', 'gene', 'mutation', 'geneStatus', '基因突变'],
    hint: '在基因检测报告上，如 EGFR、ALK、KRAS 等',
    placeholder: '例如：EGFR L858R突变'
  },
  {
    key: 'pdL1', label: 'PD-L1 表达', friendlyLabel: 'PD-L1 检测值', group: 'tumor',
    type: 'text', required: false,
    aliases: ['pdL1', 'PD-L1', 'pd_l1', 'pdl1'],
    placeholder: '例如：TPS 80%'
  },
  {
    key: 'pdl1', label: 'PD-L1 表达', friendlyLabel: 'PD-L1 检测值', group: 'tumor',
    type: 'text', required: false,
    aliases: ['pdl1', 'pdL1', 'PD-L1', 'pd_l1'],
    hint: '免疫组化报告上，如 TPS≥50% 或 CPS=10',
    placeholder: '例如：TPS 80%'
  },
  {
    key: 'targetLesion', label: '存在可测量病灶（RECIST）', friendlyLabel: '可测量病灶', group: 'tumor',
    type: 'select', required: true,
    options: YES_NO_UNKNOWN_OPTIONS,
    aliases: ['targetLesion', 'measurableLesion', 'recistMeasurable', '可测量病灶']
  },
  {
    key: 'brainMetastasis', label: '脑转移', friendlyLabel: '脑转移', group: 'tumor',
    type: 'select', required: false,
    options: YES_NO_UNKNOWN_OPTIONS,
    aliases: ['brainMetastasis', 'cnsMetastasis', '脑转移']
  },
  {
    key: 'liverMetastasis', label: '肝转移', friendlyLabel: '肝转移', group: 'tumor',
    type: 'select', required: false,
    options: YES_NO_UNKNOWN_OPTIONS,
    aliases: ['liverMetastasis', '肝转移']
  },
  {
    key: 'boneMetastasis', label: '骨转移', friendlyLabel: '骨转移', group: 'tumor',
    type: 'select', required: false,
    options: YES_NO_UNKNOWN_OPTIONS,
    aliases: ['boneMetastasis', '骨转移']
  },
  {
    key: 'lineOfTherapy', label: '既往治疗线数', friendlyLabel: '治疗线数', group: 'treatment',
    type: 'number', required: false,
    aliases: ['lineOfTherapy', 'therapyLine', 'treatmentLine', 'treatmentLines', '治疗线数']
  },
  {
    key: 'treatmentLine', label: '治疗线数', friendlyLabel: '第几轮治疗', group: 'treatment',
    type: 'select', required: false,
    options: ['1', '2', '3', '4', '5'],
    aliases: ['treatmentLine', 'lineOfTherapy', 'therapyLine', 'treatmentLines', 'treatment_line', '治疗线数']
  },
  {
    key: 'previousTreatments', label: '既往治疗描述', friendlyLabel: '已接受的治疗', group: 'treatment',
    type: 'text', required: false,
    aliases: ['previousTreatments', 'treatment', 'priorTherapies', 'treatmentHistory', '既往治疗'],
    placeholder: '例如：一线培美曲塞+卡铂化疗'
  },
  {
    key: 'treatment', label: '既往治疗', friendlyLabel: '已接受的治疗', group: 'treatment',
    type: 'text', required: false,
    aliases: ['treatment', 'previousTreatments', 'treatmentHistory', 'priorTherapies', '既往治疗'],
    hint: '做过什么治疗？化疗、靶向药、免疫治疗、手术等',
    placeholder: '例如：一线培美曲塞+卡铂化疗'
  },
  {
    key: 'surgeryHistory', label: '既往手术治疗', friendlyLabel: '手术史', group: 'treatment',
    type: 'select', required: false,
    options: YES_NO_UNKNOWN_OPTIONS,
    aliases: ['surgeryHistory', 'surgicalHistory', 'surgery', '手术史']
  },
  {
    key: 'radiotherapyHistory', label: '既往放疗', friendlyLabel: '放疗史', group: 'treatment',
    type: 'select', required: false,
    options: YES_NO_UNKNOWN_OPTIONS,
    aliases: ['radiotherapyHistory', 'radiotherapy', '放疗史']
  },
  {
    key: 'chemotherapyHistory', label: '既往化疗', friendlyLabel: '化疗史', group: 'treatment',
    type: 'select', required: false,
    options: YES_NO_UNKNOWN_OPTIONS,
    aliases: ['chemotherapyHistory', 'chemotherapy', '化疗史']
  },
  {
    key: 'immunotherapyHistory', label: '既往免疫治疗', friendlyLabel: '免疫治疗史', group: 'treatment',
    type: 'select', required: false,
    options: YES_NO_UNKNOWN_OPTIONS,
    aliases: ['immunotherapyHistory', 'immunotherapy', '免疫治疗史']
  },
  {
    key: 'targetedTherapyHistory', label: '既往靶向治疗', friendlyLabel: '靶向治疗史', group: 'treatment',
    type: 'select', required: false,
    options: YES_NO_UNKNOWN_OPTIONS,
    aliases: ['targetedTherapyHistory', 'targetedTherapy', '靶向治疗史']
  },
  {
    key: 'hemoglobin', label: '血红蛋白（g/L）', friendlyLabel: '血红蛋白', group: 'lab',
    type: 'number', required: false,
    aliases: ['hemoglobin', 'hb', '血红蛋白']
  },
  {
    key: 'neutrophils', label: '中性粒细胞（x10^9/L）', friendlyLabel: '中性粒细胞', group: 'lab',
    type: 'number', required: false,
    aliases: ['neutrophils', 'anc', '中性粒细胞']
  },
  {
    key: 'platelets', label: '血小板（x10^9/L）', friendlyLabel: '血小板', group: 'lab',
    type: 'number', required: false,
    aliases: ['platelets', 'plt', '血小板']
  },
  {
    key: 'alt', label: 'ALT（U/L）', friendlyLabel: 'ALT', group: 'lab',
    type: 'number', required: false,
    aliases: ['alt', 'ALT']
  },
  {
    key: 'ast', label: 'AST（U/L）', friendlyLabel: 'AST', group: 'lab',
    type: 'number', required: false,
    aliases: ['ast', 'AST']
  },
  {
    key: 'bilirubin', label: '总胆红素（μmol/L）', friendlyLabel: '总胆红素', group: 'lab',
    type: 'number', required: false,
    aliases: ['bilirubin', 'totalBilirubin', '总胆红素']
  },
  {
    key: 'creatinine', label: '血清肌酐（μmol/L）', friendlyLabel: '血清肌酐', group: 'lab',
    type: 'number', required: false,
    aliases: ['creatinine', 'scr', '肌酐']
  },
  {
    key: 'creatinineClearance', label: '肌酐清除率（mL/min）', friendlyLabel: '肌酐清除率', group: 'lab',
    type: 'number', required: false,
    aliases: ['creatinineClearance', 'ccr', '肾小球滤过率', '肌酐清除率']
  },
  {
    key: 'hbvStatus', label: '乙肝状态', friendlyLabel: '乙肝状态', group: 'risk',
    type: 'select', required: false,
    options: ['阴性', '阳性-稳定', '阳性-活动', '不详'],
    aliases: ['hbvStatus', 'HBV', '乙肝']
  },
  {
    key: 'hcvStatus', label: '丙肝状态', friendlyLabel: '丙肝状态', group: 'risk',
    type: 'select', required: false,
    options: ['阴性', '阳性-稳定', '阳性-活动', '不详'],
    aliases: ['hcvStatus', 'HCV', '丙肝']
  },
  {
    key: 'hivStatus', label: 'HIV 状态', friendlyLabel: 'HIV 状态', group: 'risk',
    type: 'select', required: false,
    options: ['阴性', '阳性-稳定', '阳性-活动', '不详'],
    aliases: ['hivStatus', 'HIV']
  },
  {
    key: 'activeInfection', label: '活动性感染', friendlyLabel: '活动性感染', group: 'risk',
    type: 'select', required: false,
    options: YES_NO_UNKNOWN_OPTIONS,
    aliases: ['activeInfection', 'infection', '感染']
  },
  {
    key: 'autoimmuneDisease', label: '活动性自身免疫疾病', friendlyLabel: '自身免疫疾病', group: 'risk',
    type: 'select', required: false,
    options: YES_NO_UNKNOWN_OPTIONS,
    aliases: ['autoimmuneDisease', 'autoimmune', '自身免疫']
  },
  {
    key: 'organTransplant', label: '器官移植史', friendlyLabel: '器官移植史', group: 'risk',
    type: 'select', required: false,
    options: YES_NO_UNKNOWN_OPTIONS,
    aliases: ['organTransplant', 'transplant', '器官移植']
  },
  {
    key: 'pregnancyStatus', label: '妊娠/哺乳状态', friendlyLabel: '妊娠/哺乳状态', group: 'risk',
    type: 'select', required: false,
    options: ['无', '妊娠', '哺乳', '不适用', '不详'],
    aliases: ['pregnancyStatus', 'pregnancy', '妊娠']
  },
  {
    key: 'city', label: '就诊城市', friendlyLabel: '就诊城市', group: 'other',
    type: 'text', required: false,
    aliases: ['city', 'location', '就诊城市']
  }
]

const isObjectRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === 'object' && !Array.isArray(value))

const isBlankStructuredValue = (value: unknown) => {
  if (value === 0 || value === '0' || value === false) return false
  if (Array.isArray(value)) return value.length === 0
  return value === null || value === undefined || value === ''
}

const mergeStructuredSources = (...sources: unknown[]) => {
  return sources.reduce<Record<string, unknown>>((acc, source) => {
    if (!isObjectRecord(source)) return acc
    Object.keys(source).forEach((key) => {
      if (!isBlankStructuredValue(source[key])) {
        acc[key] = source[key]
      }
    })
    return acc
  }, {})
}

const stringifyAliasValue = (value: unknown): unknown => {
  if (!Array.isArray(value)) return value
  const parts = value
    .map((item) => {
      if (item === undefined || item === null || item === '') return ''
      if (!isObjectRecord(item)) return String(item).trim()
      const fields = [
        item.name,
        item.title,
        item.regimen,
        item.drug,
        item.event,
        item.startDate,
        item.endDate,
        item.date,
        item.detail,
        item.response,
        item.value
      ].filter((v) => v !== null && v !== undefined && `${v}`.trim() !== '')
      if (fields.length) return fields.map((v) => `${v}`.trim()).join(' ')
      try { return JSON.stringify(item) } catch { return '' }
    })
    .filter(Boolean)
  return parts.join('；')
}

export const unwrapStructuredSource = (raw: Record<string, unknown>) => {
  const source = isObjectRecord(raw) ? raw : {}
  const result = isObjectRecord(source.result) ? source.result : {}
  const structured = isObjectRecord(source.structured) ? source.structured : {}
  const structuredPayload = isObjectRecord(source.structuredPayload) ? source.structuredPayload : {}
  const nested = mergeStructuredSources(
    source.entities,
    structured.entities,
    structuredPayload.entities,
    result.entities,
    result
  )
  const flat = mergeStructuredSources(source)
  Object.keys(source).forEach((key) => {
    if (['entities', 'structured', 'structuredPayload', 'result'].includes(key)) {
      delete flat[key]
    }
  })
  return { ...nested, ...flat }
}

const pick = (raw: Record<string, unknown>, aliases: string[]) => {
  for (const key of aliases) {
    const value = raw[key]
    if (value !== undefined && value !== null && `${value}`.trim() !== '') {
      const normalized = stringifyAliasValue(value)
      if (normalized !== undefined && normalized !== null && `${normalized}`.trim() !== '') {
        return normalized
      }
    }
  }
  return ''
}

export const normalizeRecord = (raw: Record<string, unknown>) => {
  const source = unwrapStructuredSource(raw)
  const normalized: Record<string, unknown> = { ...source }
  FIELD_SCHEMAS.forEach((field) => {
    normalized[field.key] = pick(source, field.aliases)
  })
  normalized.id = source.id || source.recordId || source.fileId || ''
  normalized.recordId = source.recordId || source.id || source.fileId || normalized.recordId || ''
  if (!normalized.treatment && normalized.previousTreatments) {
    normalized.treatment = normalized.previousTreatments
  }
  if (!normalized.previousTreatments && normalized.treatment) {
    normalized.previousTreatments = normalized.treatment
  }
  if (!normalized.pdl1 && normalized.pdL1) {
    normalized.pdl1 = normalized.pdL1
  }
  if (!normalized.pdL1 && normalized.pdl1) {
    normalized.pdL1 = normalized.pdl1
  }
  return normalized
}

export const getMissingFields = (record: Record<string, unknown>) => {
  const normalized = normalizeRecord(record)
  return FIELD_SCHEMAS.filter((field) => {
    const value = normalized[field.key]
    return field.required && (value === '' || value === null || value === undefined)
  })
}

export const sortMatches = (list: Record<string, any>[]) => {
  return [...list].sort((a, b) => {
    const scoreA = Number(a.score || a.matchScore || 0)
    const scoreB = Number(b.score || b.matchScore || 0)
    if (scoreB !== scoreA) return scoreB - scoreA
    return `${b.updatedAt || ''}`.localeCompare(`${a.updatedAt || ''}`)
  })
}
