import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { api } from '../services/api'

// PRD-2026Q2 §3.5：多病历管理页 —— 从「单 currentRecordId」升级到「列表 + activeRecordId」。
// - 兼容层：`currentRecordId` getter 仍然返回 activeRecordId，老调用方（MatchesView 等）无需改动。
// - `records` 与后端 GET /api/medical/records 的数据形状保持一致（id/type/diagnosis/status/uploadTime...）。
// - `structuredRecord` 保留给 UploadView 暂存刚解析出来的结构化结果（未必已经落表）。
export interface MedicalRecord {
  id: string
  type?: string
  diagnosis?: string
  status?: string
  statusText?: string
  uploadTime?: string
  matchCount?: number
  imageUrl?: string | null
  [key: string]: unknown
}

export const usePatientStore = defineStore('patient', () => {
  const records = ref<MedicalRecord[]>([])
  const activeRecordId = ref<string | null>(null)
  const structuredRecord = ref<Record<string, unknown>>({})
  // PRD-2026Q3 §U2：用户在 UploadView 字段补全区点「我不知道」时记录的字段 key 列表，
  // MatchesView / payload 可读取，后端无需改动。
  const unknownFields = ref<string[]>([])
  const loading = ref(false)

  // 兼容 getter：旧代码读 `currentRecordId` 也能继续工作；空字符串表示未选中。
  const currentRecordId = computed(() => activeRecordId.value ?? '')

  const activeRecord = computed<MedicalRecord | null>(() => {
    if (!activeRecordId.value) return null
    return records.value.find((r) => r.id === activeRecordId.value) || null
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
    setRecord,
    setUnknownFields,
    setActive,
    loadRecords,
    softDelete
  }
})
