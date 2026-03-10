<template>
  <section class="grid">
    <h2>上传病历</h2>
    <div class="card grid">
      <p class="muted">系统会自动识别病历类型，无需手动选择。</p>
      <label>
        备注
        <textarea v-model="remark" rows="3" placeholder="补充病情说明"></textarea>
      </label>
      <input type="file" accept="image/*,.pdf" @change="onFileChange" />
      <button class="btn primary" :disabled="uploading || !file" @click="uploadAndParse">{{ uploading ? '上传中...' : '上传并解析' }}</button>
    </div>

    <div v-if="parseStatus" class="card">
      <p>状态：{{ parseStatus }}</p>
      <p>进度：{{ parseProgress }}%</p>
    </div>

    <div v-if="Object.keys(parsedRecord).length" class="card grid">
      <h3>结构化病历</h3>
      <p v-for="field in previewRows" :key="field.label"><strong>{{ field.label }}:</strong> {{ field.value }}</p>
    </div>

    <div v-if="missingFields.length" class="warning grid">
      <h3>待补字段</h3>
      <div v-for="field in missingFields" :key="field.key" class="grid">
        <label>{{ field.label }}</label>
        <select v-if="field.type === 'select'" v-model="gapValues[field.key]">
          <option value="">请选择</option>
          <option v-for="option in field.options" :key="option" :value="option">{{ option }}</option>
        </select>
        <input v-else :type="field.type === 'number' ? 'number' : 'text'" v-model="gapValues[field.key]" />
      </div>
    </div>

    <button v-if="Object.keys(parsedRecord).length" class="btn primary" :disabled="submitting" @click="toMatches">
      {{ submitting ? '提交中...' : '补全并查看匹配结果' }}
    </button>
  </section>
</template>

<script setup lang="ts">
import { computed, onUnmounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { api } from '../services/api'
import { FIELD_SCHEMAS, getMissingFields, normalizeRecord } from '../utils/schema'
import { usePatientStore } from '../stores/patient'

const router = useRouter()
const patientStore = usePatientStore()

const file = ref<File | null>(null)
const remark = ref('')
const uploading = ref(false)
const parseStatus = ref('')
const parseProgress = ref(0)
const parsedRecord = ref<Record<string, unknown>>({})
const recordId = ref('')
const fileId = ref('')
const submitting = ref(false)
const gapValues = reactive<Record<string, string>>({})

let timer: number | null = null

const missingFields = computed(() => getMissingFields(parsedRecord.value))

const previewRows = computed(() => {
  const fields = ['diagnosis', 'stage', 'geneMutation', 'ecog', 'treatment']
  return fields.map((key) => ({
    label: FIELD_SCHEMAS.find((field) => field.key === key)?.label || key,
    value: parsedRecord.value[key] || '待补'
  }))
})

const onFileChange = (event: Event) => {
  const target = event.target as HTMLInputElement
  file.value = target.files?.[0] || null
}

const pollStatus = async () => {
  if (!fileId.value) {
    return
  }

  const status = await api.getParseStatus(fileId.value)
  parseStatus.value = status.status || 'parsing'
  parseProgress.value = Number(status.progress || 0)

  if (status.status === 'completed') {
    if (timer) {
      window.clearInterval(timer)
      timer = null
    }

    parsedRecord.value = normalizeRecord(status.result || status.record || status)
  }
}

const uploadAndParse = async () => {
  if (!file.value) {
    return
  }

  uploading.value = true
  parseProgress.value = 0

  try {
    const uploadRes = await api.uploadMedicalRecord(file.value, 'auto', remark.value)
    fileId.value = uploadRes.fileId
    recordId.value = uploadRes.recordId || ''
    parseStatus.value = 'uploading'

    await pollStatus()
    timer = window.setInterval(pollStatus, 1500)
  } finally {
    uploading.value = false
  }
}

const toMatches = async () => {
  submitting.value = true
  const patchPayload = { ...gapValues }

  parsedRecord.value = {
    ...parsedRecord.value,
    ...patchPayload
  }

  try {
    if (recordId.value && Object.keys(patchPayload).length > 0) {
      await api.enrichRecord(recordId.value, patchPayload).catch(() => null)
    }

    localStorage.setItem('structuredRecordDraft', JSON.stringify(parsedRecord.value))
    patientStore.setRecord(recordId.value, parsedRecord.value)
    router.push('/matches')
  } finally {
    submitting.value = false
  }
}

onUnmounted(() => {
  if (timer) {
    window.clearInterval(timer)
  }
})
</script>
