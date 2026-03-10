export type FieldSchema = {
  key: string
  label: string
  type: 'text' | 'number' | 'select'
  required: boolean
  options?: string[]
  aliases: string[]
}

export const FIELD_SCHEMAS: FieldSchema[] = [
  { key: 'diagnosis', label: '诊断', type: 'text', required: true, aliases: ['diagnosis', 'diag', 'disease'] },
  { key: 'stage', label: '分期', type: 'select', required: true, options: ['I期', 'II期', 'III期', 'IV期', '未知'], aliases: ['stage'] },
  { key: 'geneMutation', label: '基因突变', type: 'text', required: true, aliases: ['geneMutation', 'mutation'] },
  { key: 'ecog', label: 'ECOG评分', type: 'number', required: true, aliases: ['ecog', 'ecogScore'] },
  { key: 'treatment', label: '既往治疗', type: 'text', required: true, aliases: ['treatment', 'treatmentHistory'] }
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
    if (scoreB !== scoreA) {
      return scoreB - scoreA
    }
    return `${b.updatedAt || ''}`.localeCompare(`${a.updatedAt || ''}`)
  })
}
