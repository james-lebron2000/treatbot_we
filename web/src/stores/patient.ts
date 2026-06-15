import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { api } from '../services/api'

// PRD-2026Q2 §3.5：多病历管理页 —— 从「单 currentRecordId」升级到「列表 + activeRecordId」。
// - 兼容层：`currentRecordId` getter 仍然返回 activeRecordId，老调用方（MatchesView 等）无需改动。
// - `records` 与后端 GET /api/medical/records 的数据形状保持一致（id/type/diagnosis/status/uploadTime...）。
// - `structuredRecord` 保留给 UploadView 暂存刚解析出来的结构化结果（未必已经落表）。
//
// 多病人（F5）：一个账号可管理多位病人 —— 每个 MedicalCase = 一位病人。
// - `cases` 是病人索引；`activeCaseId` 是当前选中的病人（持久化到 localStorage 以便长测刷新后还在）。
// - 记录通过 `caseId` 归属到病人；老的单病人记录 caseId 可能为空，按"第一位病人"兜底展示。
export interface MedicalRecord {
  id: string
  type?: string
  diagnosis?: string
  status?: string
  statusText?: string
  uploadTime?: string
  matchCount?: number
  imageUrl?: string | null
  // 多病人：每条记录归属的病例（病人）id 与显示名（后端 GET /medical/records 附带）。
  caseId?: string | null
  patientLabel?: string | null
  [key: string]: unknown
}

// 多病人：一个 MedicalCase = 一位病人。后端 serializeCase 形状。
export interface PatientCase {
  caseId: string
  id: string
  patientLabel?: string | null
  status?: string
  completeness?: unknown
  entities?: Record<string, unknown>
  summary?: Record<string, unknown>
  sourceRecordIds?: string[]
  updatedAt?: string
  [key: string]: unknown
}

// 持久化 activeCaseId：内部长测时希望切到的病人在刷新后还在。
const ACTIVE_CASE_STORAGE_KEY = 'activePatientCaseId'
const readStoredActiveCaseId = (): string | null => {
  try {
    return localStorage.getItem(ACTIVE_CASE_STORAGE_KEY) || null
  } catch {
    return null
  }
}
const writeStoredActiveCaseId = (id: string | null) => {
  try {
    if (id) localStorage.setItem(ACTIVE_CASE_STORAGE_KEY, id)
    else localStorage.removeItem(ACTIVE_CASE_STORAGE_KEY)
  } catch {
    // 隐私模式等：存储失败不影响内存态
  }
}

// 病人显示名兜底链：后端 patientLabel（当前可能为空）→ 病例诊断 → 「病人 N」。
// 顺序号基于该病例在 cases 列表里的位置，保证稳定可读。
export const patientDisplayLabel = (
  patientCase: PatientCase | null | undefined,
  indexInList = 0
): string => {
  if (!patientCase) return '病人'
  const label = `${patientCase.patientLabel || ''}`.trim()
  if (label) return label
  const diagnosis = `${(patientCase.entities && (patientCase.entities as any).diagnosis) || ''}`.trim()
  if (diagnosis) return diagnosis
  return `病人 ${indexInList + 1}`
}

export const usePatientStore = defineStore('patient', () => {
  const records = ref<MedicalRecord[]>([])
  const activeRecordId = ref<string | null>(null)
  const structuredRecord = ref<Record<string, unknown>>({})
  // PRD-2026Q3 §U2：用户在 UploadView 字段补全区点「我不知道」时记录的字段 key 列表，
  // MatchesView / payload 可读取，后端无需改动。
  const unknownFields = ref<string[]>([])
  const loading = ref(false)

  // 多病人：病例（病人）索引 + 当前选中的病人。activeCaseId 持久化到 localStorage。
  const cases = ref<PatientCase[]>([])
  const activeCaseId = ref<string | null>(readStoredActiveCaseId())

  // 兼容 getter：旧代码读 `currentRecordId` 也能继续工作；空字符串表示未选中。
  const currentRecordId = computed(() => activeRecordId.value ?? '')

  const activeRecord = computed<MedicalRecord | null>(() => {
    if (!activeRecordId.value) return null
    return records.value.find((r) => r.id === activeRecordId.value) || null
  })

  // 多病人：当前选中的病人对象（找不到则取列表第一位作兜底）。
  const activeCase = computed<PatientCase | null>(() => {
    if (!cases.value.length) return null
    return cases.value.find((c) => (c.caseId || c.id) === activeCaseId.value) || cases.value[0] || null
  })

  // 多病人：当前选中病人的记录。
  // - 记录 caseId 命中 activeCaseId 即归属；
  // - 记录无 caseId（老单病人数据）时，仅当 activeCaseId 指向"第一位病人"才展示，
  //   保证单病人体验不变（只有一位病人时全部记录都看得到）。
  const recordsForActivePatient = computed<MedicalRecord[]>(() => {
    // 没有任何病例索引时（首登/老账号），不做过滤，全部展示。
    if (!cases.value.length) return records.value
    const resolvedActiveId = activeCase.value ? (activeCase.value.caseId || activeCase.value.id) : null
    const firstCaseId = cases.value[0] ? (cases.value[0].caseId || cases.value[0].id) : null
    const activeIsFirst = resolvedActiveId != null && resolvedActiveId === firstCaseId
    return records.value.filter((r) => {
      const rid = r.caseId || null
      if (rid) return rid === resolvedActiveId
      // 无 caseId 的遗留记录：挂到第一位病人
      return activeIsFirst
    })
  })

  const setRecord = (recordId: string, record: Record<string, unknown>) => {
    // 兼容旧 API：从 UploadView 跳转过来时调用，保留 structuredRecord 暂存视图。
    activeRecordId.value = recordId || null
    structuredRecord.value = record
  }

  const setUnknownFields = (keys: string[]) => {
    unknownFields.value = Array.from(new Set(keys))
  }

  const setActive = (id: string | null) => {
    activeRecordId.value = id
    // 切换 active 时清一下手动录入草稿，后续 matches 重新加载会基于新的 recordId。
    structuredRecord.value = {}
  }

  // 多病人：切换当前病人。同时清掉跨病人的 record 选择 / 手动录入草稿，
  // 避免把上一位病人的 activeRecord 带到新病人的匹配里。
  const setActiveCase = (caseId: string | null) => {
    activeCaseId.value = caseId
    writeStoredActiveCaseId(caseId)
    activeRecordId.value = null
    structuredRecord.value = {}
  }

  const loadCases = async () => {
    const payload = await api.getMedicalCases()
    const list: PatientCase[] = Array.isArray(payload)
      ? (payload as unknown as PatientCase[])
      : Array.isArray(payload?.cases)
        ? payload.cases
        : []
    cases.value = list
    // 默认选中最近更新的病例（后端 listCases 已按 updated_at DESC 排序 → 列表首位）。
    // 仅当当前 activeCaseId 缺失或已不在列表里时才重置，尊重持久化的用户选择。
    const ids = new Set(list.map((c) => c.caseId || c.id))
    if (!activeCaseId.value || !ids.has(activeCaseId.value)) {
      const next = list[0] ? (list[0].caseId || list[0].id) : null
      activeCaseId.value = next
      writeStoredActiveCaseId(next)
    }
    return list
  }

  // 多病人：新增一位病人 —— POST 建病例 → 重新拉索引 → 切到新病人。返回新 caseId。
  const addPatient = async (label?: string): Promise<string | null> => {
    const res = await api.createPatientCase(label)
    const created = (res && (res.case || (res as any))) as PatientCase | undefined
    const newCaseId = created ? (created.caseId || created.id || null) : null
    await loadCases()
    if (newCaseId) setActiveCase(newCaseId)
    return newCaseId
  }

  // 多病人：给某病人改名。后端落库后重新拉索引；同时乐观更新内存里的 label，
  // 兼容后端 serializeCase 暂未回吐 patientLabel 的情况（前端也能立刻显示新名字）。
  const renamePatient = async (caseId: string, label: string) => {
    await api.renamePatient(caseId, label)
    const trimmed = `${label || ''}`.trim()
    const target = cases.value.find((c) => (c.caseId || c.id) === caseId)
    if (target) target.patientLabel = trimmed || null
    await loadCases()
    // loadCases 可能用后端（可能为空的）label 覆盖了乐观值，这里再补一次乐观更新。
    const after = cases.value.find((c) => (c.caseId || c.id) === caseId)
    if (after && trimmed && !`${after.patientLabel || ''}`.trim()) {
      after.patientLabel = trimmed
    }
  }

  const loadRecords = async () => {
    loading.value = true
    try {
      const payload = await api.getMedicalRecords()
      // 后端返回 {code,data,pagination}；也兼容直接裸数组。
      const list: MedicalRecord[] = Array.isArray(payload)
        ? payload
        : Array.isArray(payload?.list)
          ? payload.list
          : Array.isArray(payload?.data)
            ? payload.data
            : []
      records.value = list
      // 若当前 active 已经被删或不在列表，切到第一条（或清空）
      if (!activeRecordId.value || !list.some((r) => r.id === activeRecordId.value)) {
        activeRecordId.value = list[0]?.id || null
      }
      return list
    } finally {
      loading.value = false
    }
  }

  const softDelete = async (id: string) => {
    await api.softDeleteRecord(id)
    records.value = records.value.filter((r) => r.id !== id)
    if (activeRecordId.value === id) {
      activeRecordId.value = records.value[0]?.id || null
      structuredRecord.value = {}
    }
  }

  return {
    records,
    activeRecordId,
    activeRecord,
    currentRecordId,
    structuredRecord,
    unknownFields,
    loading,
    // 多病人
    cases,
    activeCaseId,
    activeCase,
    recordsForActivePatient,
    setActiveCase,
    loadCases,
    addPatient,
    renamePatient,
    setRecord,
    setUnknownFields,
    setActive,
    loadRecords,
    softDelete
  }
})
