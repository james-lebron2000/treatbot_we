<template>
  <section class="grid">
    <!-- 首次引导（未上传时显示） -->
    <div v-if="!fileId && !Object.keys(parsedRecord).length" class="grid">
      <div class="card" style="background:linear-gradient(135deg,#eff6ff,#f0fdf4);border:none;">
        <h2 style="margin:0 0 8px;">找到适合您的临床试验</h2>
        <p style="color:#374151;font-size:0.95rem;line-height:1.6;">
          上传病历报告，AI 会自动提取关键信息，为您匹配正在招募的临床试验。
        </p>
      </div>

      <div class="card" style="background:#fffbeb;border-color:#fcd34d;display:flex;justify-content:space-between;align-items:center;gap:12px;">
        <div style="flex:1;min-width:0;">
          <h3 style="margin:0 0 4px;font-size:0.98rem;color:#92400e;">先看个演示</h3>
          <p style="margin:0;font-size:0.82rem;color:#78716c;line-height:1.5;">
            不想立刻上传？用 30 秒看两个脱敏样例走完完整流程。
          </p>
        </div>
        <button class="btn primary" style="white-space:nowrap;padding:8px 14px;" @click="$router.push('/demo')">
          试用演示 →
        </button>
      </div>

      <div class="card">
        <h3 style="margin:0 0 10px;">需要准备什么？</h3>
        <p style="font-size:0.9rem;color:#374151;line-height:1.8;margin:0;">
          请向您的主治医生或医院病案室索取以下任意一份报告（拍照或 PDF 均可）：
        </p>
        <div style="margin-top:10px;display:grid;gap:8px;">
          <div class="tip-card">
            <strong>病理报告</strong>（最重要）
            <span class="tip-desc">— 包含诊断、癌症类型、基因检测结果</span>
          </div>
          <div class="tip-card">
            <strong>出院小结 / 诊断证明</strong>
            <span class="tip-desc">— 包含分期、治疗方案、用药记录</span>
          </div>
          <div class="tip-card">
            <strong>基因检测报告</strong>（如有）
            <span class="tip-desc">— 包含 EGFR、ALK、KRAS 等突变信息</span>
          </div>
        </div>
        <p style="font-size:0.8rem;color:#9ca3af;margin:10px 0 0;">
          没有电子版？用手机拍照即可，确保文字清晰可读。
        </p>
      </div>

      <div class="card grid">
        <h3 style="margin:0;">上传病历</h3>
        <label class="upload-area" :class="{ 'has-files': files.length }">
          <input type="file" accept="image/*,.pdf" multiple @change="onFileChange" style="display:none;" />
          <div v-if="!files.length" style="text-align:center;padding:20px 0;">
            <div style="font-size:2rem;">&#128196;</div>
            <p style="margin:8px 0 0;color:#6b7280;">点击选择病历文件</p>
            <p style="margin:4px 0 0;font-size:0.8rem;color:#9ca3af;">支持图片和 PDF，可一次选多个</p>
          </div>
          <div v-else style="padding:10px 0;">
            <p style="margin:0;color:#16a34a;">已选择 {{ files.length }} 个文件</p>
            <p v-for="f in files" :key="f.name" style="margin:2px 0;font-size:0.8rem;color:#6b7280;">{{ f.name }}</p>
          </div>
        </label>

        <div style="margin-top:4px;">
          <details>
            <summary style="font-size:0.85rem;color:#6b7280;cursor:pointer;">补充说明（选填）</summary>
            <textarea v-model="remark" rows="2" placeholder="例如：这是我妈妈的病历，肺腺癌IV期" style="margin-top:6px;"></textarea>
          </details>
        </div>

        <button class="btn primary" :disabled="uploading || !files.length" @click="uploadAndParse" style="width:100%;padding:12px;">
          {{ uploading ? `正在识别第 ${uploadIndex}/${files.length} 份...` : '开始智能识别' }}
        </button>
      </div>
    </div>

    <!-- 解析中 -->
    <div v-if="parseStatus && parseStatus !== 'error' && parseStatus !== 'completed' && !Object.keys(parsedRecord).length" class="card" style="text-align:center;padding:30px 16px;">
      <div class="pulse-dot"></div>
      <p style="font-size:1rem;margin:12px 0 4px;">AI 正在识别您的病历...</p>
      <p style="font-size:0.85rem;color:#6b7280;">
        {{ parseStatus === 'running' ? '正在提取诊断、分期、基因突变等关键信息' : '排队中，马上开始' }}
      </p>
      <p v-if="parseProgress > 0" style="color:#2563eb;">进度 {{ parseProgress }}%</p>
      <p v-if="elapsedSeconds > 10" style="font-size:0.8rem;color:#9ca3af;">
        已等待 {{ elapsedSeconds }} 秒{{ elapsedSeconds > 30 ? '，PDF 文件较大需要更多时间' : '' }}
      </p>
    </div>

    <!-- 解析错误 -->
    <div v-if="uploadError" class="card" style="border-color:#fca5a5;background:#fef2f2;">
      <p style="color:#dc2626;margin:0 0 8px;">{{ uploadError }}</p>
      <p style="font-size:0.85rem;color:#6b7280;margin:0 0 8px;">
        可能原因：图片模糊、文件格式不支持、或网络异常。请确保拍照清晰后重试。
      </p>
      <button class="btn primary" @click="retryParse" style="width:100%;">重新识别</button>
    </div>

    <!-- 解析完成 — 结果展示 -->
    <div v-if="Object.keys(parsedRecord).length" class="grid">
      <div class="card" style="background:#f0fdf4;border-color:#86efac;">
        <h3 style="margin:0 0 8px;color:#166534;">识别完成</h3>
        <p style="font-size:0.85rem;color:#374151;margin:0;">以下是 AI 从您的病历中提取的关键信息，请核对：</p>
      </div>

      <RecordSummaryCard :record="parsedRecord" />

      <div v-if="missingFields.length" class="card" style="border-color:#fcd34d;background:#fffbeb;">
        <h3 style="margin:0 0 8px;color:#92400e;">需要补充以下信息</h3>
        <p style="font-size:0.85rem;color:#78716c;margin:0 0 10px;">
          这些信息有助于更准确地匹配试验。如果不确定，可以跳过。
        </p>
        <div v-for="field in missingFields" :key="field.key" style="margin-bottom:10px;">
          <label style="font-size:0.9rem;color:#374151;display:block;margin-bottom:4px;">
            {{ field.label }}
            <span v-if="field.hint" style="font-size:0.8rem;color:#9ca3af;"> — {{ field.hint }}</span>
          </label>
          <select v-if="field.type === 'select'" v-model="gapValues[field.key]">
            <option value="">请选择</option>
            <option v-for="option in field.options" :key="option" :value="option">{{ option }}</option>
          </select>
          <input v-else :type="field.type === 'number' ? 'number' : 'text'" v-model="gapValues[field.key]" :placeholder="field.placeholder || ''" />
        </div>
      </div>

      <button class="btn primary" :disabled="submitting" @click="toMatches" style="width:100%;padding:14px;font-size:1rem;">
        {{ submitting ? '正在匹配...' : '查看匹配的临床试验' }}
      </button>

      <button class="btn ghost" @click="resetUpload" style="width:100%;font-size:0.85rem;">重新上传其他病历</button>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, onUnmounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { api } from '../services/api'
import { FIELD_SCHEMAS, getMissingFields, normalizeRecord } from '../utils/schema'
import { usePatientStore } from '../stores/patient'
import RecordSummaryCard from '../components/RecordSummaryCard.vue'

const router = useRouter()
const patientStore = usePatientStore()

const file = ref<File | null>(null)
const files = ref<File[]>([])
const uploadIndex = ref(0)
const remark = ref('')
const uploading = ref(false)
const parseStatus = ref('')
const parseProgress = ref(0)
const parsedRecord = ref<Record<string, unknown>>({})
const recordId = ref('')
const fileId = ref('')
const submitting = ref(false)
const uploadError = ref('')
const gapValues = reactive<Record<string, string>>({})

let timer: number | null = null
let pollStartTime = 0
let elapsedTimer: number | null = null
const POLL_TIMEOUT_MS = 120_000
const elapsedSeconds = ref(0)

const missingFields = computed(() => getMissingFields(parsedRecord.value))

const previewRows = computed(() => {
  const fields = ['diagnosis', 'stage', 'geneMutation', 'ecog', 'treatment']
  return fields.map((key) => {
    const schema = FIELD_SCHEMAS.find((f) => f.key === key)
    return {
      label: schema?.friendlyLabel || schema?.label || key,
      value: parsedRecord.value[key] || '未识别到'
    }
  })
})

const resetUpload = () => {
  parsedRecord.value = {}
  fileId.value = ''
  recordId.value = ''
  files.value = []
  file.value = null
  uploadError.value = ''
  parseStatus.value = ''
  parseProgress.value = 0
  Object.keys(gapValues).forEach((k) => delete gapValues[k])
}

const onFileChange = (event: Event) => {
  const target = event.target as HTMLInputElement
  const selected = Array.from(target.files || [])
  files.value = selected
  file.value = selected[0] || null
  uploadError.value = ''
}

const stopPolling = () => {
  if (timer) { window.clearInterval(timer); timer = null }
  if (elapsedTimer) { window.clearInterval(elapsedTimer); elapsedTimer = null }
}

const retryParse = async () => {
  if (!file.value) return
  uploadError.value = ''
  parseStatus.value = 'pending'
  elapsedSeconds.value = 0
  try {
    const uploadRes = await api.uploadMedicalRecord(file.value, 'auto', remark.value)
    fileId.value = uploadRes.fileId
    recordId.value = uploadRes.recordId || ''
    pollStartTime = Date.now()
    elapsedTimer = window.setInterval(() => { elapsedSeconds.value = Math.floor((Date.now() - pollStartTime) / 1000) }, 1000)
    await pollStatus()
    timer = window.setInterval(async () => { try { await pollStatus() } catch {} }, 2000)
  } catch (err: any) {
    uploadError.value = err?.response?.data?.message || err?.message || '重试失败，请稍后再试'
  }
}

const pollStatus = async () => {
  if (!fileId.value) return
  if (Date.now() - pollStartTime > POLL_TIMEOUT_MS) {
    stopPolling()
    uploadError.value = '识别超时，请重试。如果是大文件，可稍后刷新页面查看结果。'
    parseStatus.value = 'error'
    return
  }
  const status = await api.getParseStatus(fileId.value)
  parseStatus.value = status.status || 'parsing'
  parseProgress.value = Number(status.progress || 0)
  if (status.status === 'completed') {
    stopPolling()
    parsedRecord.value = normalizeRecord(status.result || status.record || status)
  } else if (status.status === 'error') {
    stopPolling()
    uploadError.value = status.message || '识别失败，请确认文件内容清晰后重试'
    parseStatus.value = 'error'
  }
}

const mergeRecords = (base: Record<string, unknown>, extra: Record<string, unknown>) => {
  const merged = { ...base }
  for (const key of ['diagnosis', 'stage', 'ecog', 'pdl1', 'treatmentLine']) {
    if (!merged[key] && extra[key]) merged[key] = extra[key]
  }
  for (const key of ['geneMutation', 'treatment']) {
    if (extra[key] && merged[key] && `${merged[key]}` !== `${extra[key]}`) {
      merged[key] = `${merged[key]}；${extra[key]}`
    } else if (extra[key] && !merged[key]) {
      merged[key] = extra[key]
    }
  }
  return merged
}

const waitForCompletion = (fid: string): Promise<Record<string, unknown>> => {
  return new Promise((resolve, reject) => {
    const start = Date.now()
    const check = async () => {
      if (Date.now() - start > POLL_TIMEOUT_MS) return reject(new Error('识别超时'))
      try {
        const status = await api.getParseStatus(fid)
        if (status.status === 'completed') return resolve(normalizeRecord(status.result || status.record || status))
        if (status.status === 'error') return reject(new Error(status.message || '识别失败'))
        setTimeout(check, 2000)
      } catch { setTimeout(check, 2000) }
    }
    check()
  })
}

const uploadAndParse = async () => {
  if (!files.value.length) return
  uploading.value = true
  parseProgress.value = 0
  uploadError.value = ''
  uploadIndex.value = 0

  try {
    let mergedResult: Record<string, unknown> = {}
    for (let i = 0; i < files.value.length; i++) {
      uploadIndex.value = i + 1
      const f = files.value[i]
      const uploadRes = await api.uploadMedicalRecord(f, 'auto', remark.value)
      if (i === 0) {
        fileId.value = uploadRes.fileId
        recordId.value = uploadRes.recordId || ''
        parseStatus.value = 'uploading'
        pollStartTime = Date.now()
        elapsedSeconds.value = 0
        elapsedTimer = window.setInterval(() => { elapsedSeconds.value = Math.floor((Date.now() - pollStartTime) / 1000) }, 1000)
        await pollStatus()
        timer = window.setInterval(async () => { try { await pollStatus() } catch {} }, 2000)
        const firstResult = await waitForCompletion(uploadRes.fileId)
        stopPolling()
        mergedResult = firstResult
        parsedRecord.value = mergedResult
      } else {
        parseStatus.value = 'running'
        const extraResult = await waitForCompletion(uploadRes.fileId)
        mergedResult = mergeRecords(mergedResult, extraResult)
        parsedRecord.value = mergedResult
        if (recordId.value) {
          await api.enrichRecord(recordId.value, mergedResult).catch(() => null)
        }
      }
    }
    parseStatus.value = 'completed'
  } catch (err: any) {
    uploadError.value = err?.response?.data?.message || err?.message || '上传失败，请稍后重试'
  } finally {
    uploading.value = false
    stopPolling()
  }
}

const toMatches = async () => {
  submitting.value = true
  const patchPayload = { ...gapValues }
  parsedRecord.value = { ...parsedRecord.value, ...patchPayload }
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

onUnmounted(() => { stopPolling() })
</script>

<style scoped>
.upload-area {
  display: block;
  border: 2px dashed #d1d5db;
  border-radius: 12px;
  padding: 10px 16px;
  cursor: pointer;
  transition: border-color 0.2s;
}
.upload-area:hover, .upload-area.has-files {
  border-color: var(--primary);
}
.tip-card {
  padding: 8px 12px;
  background: #f8fafc;
  border-radius: 8px;
  font-size: 0.9rem;
  color: #374151;
}
.tip-desc {
  color: #9ca3af;
  font-size: 0.8rem;
}
.pulse-dot {
  width: 16px; height: 16px;
  background: #2563eb;
  border-radius: 50%;
  margin: 0 auto;
  animation: pulse 1.5s ease-in-out infinite;
}
@keyframes pulse {
  0%, 100% { transform: scale(1); opacity: 1; }
  50% { transform: scale(1.5); opacity: 0.5; }
}
</style>
