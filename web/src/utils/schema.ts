export type FieldSchema = {
  key: string
  label: string
  friendlyLabel: string
  type: 'text' | 'number' | 'select'
  required: boolean
  options?: string[]
  aliases: string[]
  hint?: string
  placeholder?: string
}

export const FIELD_SCHEMAS: FieldSchema[] = [
  {
    key: 'diagnosis', label: '诊断', friendlyLabel: '癌症类型',
    type: 'text', required: true,
    aliases: ['diagnosis', 'diag', 'disease'],
    hint: '在病理报告或出院小结上可以找到',
    placeholder: '例如：非小细胞肺癌、胃腺癌'
  },
  {
    key: 'stage', label: '分期', friendlyLabel: '疾病分期',
    type: 'select', required: true,
    options: ['I期', 'II期', 'III期', 'IV期', '未知'],
    aliases: ['stage'],
    hint: '通常写在诊断后面，如"IV期"或"晚期"'
  },
  {
    key: 'geneMutation', label: '基因突变', friendlyLabel: '基因检测结果',
    type: 'text', required: true,
    aliases: ['geneMutation', 'mutation'],
    hint: '在基因检测报告上，如 EGFR、ALK、KRAS 等',
    placeholder: '例如：EGFR L858R突变'
  },
  {
    key: 'ecog', label: 'ECOG评分', friendlyLabel: '体能状态',
    type: 'select', required: true,
    options: ['0', '1', '2', '3', '4'],
    aliases: ['ecog', 'ecogScore'],
    hint: '0=正常活动 1=轻度受限 2=能自理但不能工作 3=需要卧床'
  },
  {
    key: 'treatment', label: '既往治疗', friendlyLabel: '已接受的治疗',
    type: 'text', required: true,
    aliases: ['treatment', 'treatmentHistory'],
    hint: '做过什么治疗？化疗、靶向药、免疫治疗、手术等',
    placeholder: '例如：一线培美曲塞+卡铂化疗'
  },
  {
    key: 'treatmentLine', label: '治疗线数', friendlyLabel: '第几轮治疗',
    type: 'select', required: false,
    options: ['1', '2', '3', '4', '5'],
    aliases: ['treatmentLine', 'treatment_line'],
    hint: '一线=第一种方案，二线=换了一种方案，以此类推'
  },
  {
    key: 'pdl1', label: 'PD-L1表达', friendlyLabel: 'PD-L1 检测值',
    type: 'text', required: false,
    aliases: ['pdl1', 'pd_l1'],
    hint: '免疫组化报告上，如 TPS≥50% 或 CPS=10',
    placeholder: '例如：TPS 80%'
  }
]

const pick = (raw: Record<string, unknown>, aliases: string[]) => {
  for (const key of aliases) {
    const value = raw[key]
    if (value !== undefined && value !== null && `${value}`.trim() !== '') {
      return value
    }
  }
  return ''
}

export const normalizeRecord = (raw: Record<string, unknown>) => {
  const normalized: Record<string, unknown> = {}
  FIELD_SCHEMAS.forEach((field) => {
    normalized[field.key] = pick(raw, field.aliases)
  })
  normalized.id = raw.id || raw.recordId || raw.fileId || ''
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
