import { defineStore } from 'pinia'
import { ref } from 'vue'

export const usePatientStore = defineStore('patient', () => {
  const currentRecordId = ref('')
  const structuredRecord = ref<Record<string, unknown>>({})

  const setRecord = (recordId: string, record: Record<string, unknown>) => {
    currentRecordId.value = recordId
    structuredRecord.value = record
  }

  return {
    currentRecordId,
    structuredRecord,
    setRecord
  }
})
