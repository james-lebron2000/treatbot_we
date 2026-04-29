<template>
  <section class="grid">
    <!-- 首次引导（未上传时显示） -->
    <div v-if="!fileId && !Object.keys(parsedRecord).length" class="grid">
      <div class="card" style="background:linear-gradient(135deg,#eff6ff,#f0fdf4);border:none;">
        <h2 style="margin:0 0 8px;">把病历交给我们</h2>
        <p style="color:#374151;font-size:0.95rem;line-height:1.6;">
          拍照、扫描、PDF 都行。AI 几分钟帮您看懂关键信息，给出可以直接给医生看的摘要，并对接正在招募的新药临床试验。
        </p>
      </div>

      <PrivacyPromiseCard size="sm" :show-details-link="true" />

      <div class="card" style="background:#fffbeb;border-color:#fcd34d;display:flex;justify-content:space-between;align-items:center;gap:12px;">
        <div style="flex:1;min-width:0;">
          <h3 style="margin:0 0 4px;font-size:0.98rem;color:#92400e;">先看看别人家的</h3>
          <p style="margin:0;font-size:0.82rem;color:#78716c;line-height:1.5;">
            30 秒看两份示例病历如何被看懂，不动用您的任何数据。
          </p>
        </div>
        <button class="btn primary" style="white-space:nowrap;padding:8px 14px;" @click="$router.push('/demo')">
          看看示例 →
        </button>
      </div>

      <div class="card">
        <h3 style="margin:0 0 10px;">需要准备什么？</h3>
        <p style="font-size:0.9rem;color:#374151;line-height:1.8;margin:0;">
          向主治医生或医院病案室拿到以下任意一份就行（拍照或 PDF 都可以）：
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
          没有电子版也没关系，手机拍照就行，文字清晰能读就可以。
        </p>
      </div>

      <div class="card" style="background:#f0f9ff;border-color:#bae6fd;">
        <h3 style="margin:0 0 6px;color:#075985;">手头没有报告？直接告诉我们也能匹配</h3>
        <p style="margin:0 0 10px;font-size:0.85rem;color:#0c4a6e;line-height:1.6;">
          只要 1-2 项关键信息（癌种、分期），我们就能帮您筛出可以尝试的试验。<strong>没做基因检测也不影响</strong>。
        </p>
        <button class="btn ghost" @click="goManualEntry" style="width:100%;">直接告诉我们关键信息 →</button>
      </div>

      <div class="card grid">
        <h3 style="margin:0;">上传病历</h3>
        <label class="upload-area" :class="{ 'has-files': files.length }">
          <input type="file" accept="image/*,.pdf" multiple @change="onFileChange" style="display:none;" />
          <div v-if="!files.length" style="text-align:center;padding:20px 0;">
            <div style="font-size:2rem;">&#128196;</div>
            <p style="margin:8px 0 0;color:#6b7280;">点这里选文件</p>
            <p style="margin:4px 0 0;font-size:0.8rem;color:#9ca3af;">图片或 PDF 都行，可以一次选多张</p>
          </div>
          <div v-else style="padding:10px 0;">
            <p style="margin:0;color:#16a34a;">已选 {{ files.length }} 份</p>
            <p v-for="f in files" :key="f.name" style="margin:2px 0;font-size:0.8rem;color:#6b7280;">{{ f.name }}</p>
          </div>
        </label>

        <div style="margin-top:4px;">
          <details>
            <summary style="font-size:0.85rem;color:#6b7280;cursor:pointer;">想补充点什么？（选填）</summary>
            <textarea v-model="remark" rows="2" placeholder="例如：这是我妈妈的病历，肺腺癌 IV 期" style="margin-top:6px;"></textarea>
          </details>
        </div>

        <button class="btn primary" :disabled="uploading || !files.length" @click="uploadAndParse" style="width:100%;padding:12px;">
          {{ uploading ? `正在帮您看懂第 ${uploadIndex}/${files.length} 份…` : '开始解析（约 3 分钟）' }}
        </button>

        <p style="font-size:0.78rem;color:#9ca3af;margin:6px 0 0;text-align:center;line-height:1.5;">
          🔒 数据仅在您的账户里 · 随时可删 · 不做任何其它用途
        </p>
      </div>
    </div>

    <!-- 解析中 -->
    <div v-if="parseStatus && parseStatus !== 'error' && parseStatus !== 'completed' && !Object.keys(parsedRecord).length" class="card" style="text-align:center;padding:30px 16px;">
      <div class="pulse-dot"></div>
      <p style="font-size:1rem;margin:12px 0 4px;">{{ uploadCopy.status.parsing }}</p>
      <p style="font-size:0.85rem;color:#6b7280;">
        {{ parseStatus === 'running' ? 'AI 在找诊断、分期、基因信息 —— 这些稍后您能直接核对修改' : uploadCopy.status.pending }}
      </p>
      <p v-if="parseProgress > 0" style="color:#2563eb;">进度 {{ parseProgress }}%</p>
      <p v-if="elapsedSeconds > 10" style="font-size:0.8rem;color:#9ca3af;">
        已花 {{ elapsedSeconds }} 秒{{ elapsedSeconds > 30 ? '，这份内容偏多，再稍等一下' : '' }}
      </p>
    </div>

    <!-- 解析错误 -->
    <div v-if="uploadError.message" class="card" :style="errorCardStyle">
      <p :style="{ color: uploadError.kind === 'rate_limit' ? '#b45309' : '#dc2626', margin:'0 0 8px', fontWeight: 500 }">
        {{ errorTitle }}
      </p>
      <p style="font-size:0.85rem;color:#6b7280;margin:0 0 12px;line-height:1.6;">
        {{ errorHelper }}
      </p>
      <!-- 限流：不显示"重新识别"，给出替代入口 -->
      <template v-if="uploadError.kind === 'rate_limit'">
        <button class="btn primary" @click="goManualEntry" style="width:100%;margin-bottom:8px;">
          先不传，直接告诉我们关键信息
        </button>
        <button class="btn ghost" @click="$router.push('/demo')" style="width:100%;">
          先看看别人家的示例
        </button>
      </template>
      <template v-else>
        <button class="btn primary" @click="retryParse" style="width:100%;" :disabled="!file">{{ uploadCopy.cta.retry }}</button>
      </template>
    </div>

    <!-- 解析完成 — 结果展示 -->
    <div v-if="Object.keys(parsedRecord).length" class="grid">
      <div class="card" style="background:#f0fdf4;border-color:#86efac;">
        <h3 style="margin:0 0 8px;color:#166534;">好了</h3>
        <p style="font-size:0.85rem;color:#374151;margin:0;">以下是我们从病历里看到的信息 —— 请您过一遍，哪里不对直接改。<strong>您改过的就是对的。</strong></p>
      </div>

      <RecordSummaryCard :record="parsedRecord" />

      <div v-if="visibleMissingFields.length" class="card" style="border-color:#fcd34d;background:#fffbeb;">
        <h3 style="margin:0 0 8px;color:#92400e;">再补一点信息会更准</h3>
        <p style="font-size:0.85rem;color:#78716c;margin:0 0 10px;">
          有这些信息能帮您找到更合适的试验。不确定就点「？」看看，或者直接选「我不知道」。
        </p>
        <!-- PRD-2026Q3 §U2：每个字段外层包 FieldExplainer，提供白话说明 + 「我不知道」逃生口 -->
        <div v-for="field in visibleMissingFields" :key="field.key" style="margin-bottom:14px;">
          <FieldExplainer
            :field-key="field.key"
            :fallback-label="field.label"
            @i-dont-know="onFieldUnknown(field.key)"
          >
            <span v-if="getFieldHint(field)" style="display:block;font-size:0.78rem;color:#9ca3af;margin:-2px 0 4px;">— {{ getFieldHint(field) }}</span>
            <select v-if="field.type === 'select'" v-model="gapValues[field.key]">
              <option value="">请选择</option>
              <option v-for="option in field.options" :key="option" :value="option">{{ option }}</option>
            </select>
            <input v-else :type="field.type === 'number' ? 'number' : 'text'" v-model="gapValues[field.key]" :placeholder="field.placeholder || ''" />
          </FieldExplainer>
        </div>
        <p v-if="unknownFieldKeys.length" style="font-size:0.78rem;color:#a16207;margin:6px 0 0;">
          已记下您不确定的：{{ unknownFieldLabels }}。后面我们会用其它信息辅助匹配。
        </p>
      </div>

      <!-- 简易 toast：「我不知道」点击后给一个明确的反馈 -->
      <transition name="fx-toast">
        <div v-if="toastMessage" class="upload-toast" role="status">{{ toastMessage }}</div>
      </transition>

      <button class="btn primary" :disabled="submitting" @click="toMatches" style="width:100%;padding:14px;font-size:1rem;">
        {{ submitting ? '正在为您家人找合适的试验…' : '看看为家人找到的可能性' }}
      </button>

      <button class="btn ghost" @click="resetUpload" style="width:100%;font-size:0.85rem;">上传其它病历</button>
    </div>

    <ConsentModal
      :visible="consentVisible"
      title="开始上传前，请确认这三件事"
      @confirm="onConsentConfirm"
      @cancel="onConsentCancel"
    />
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { api } from '../services/api'
import { FIELD_SCHEMAS, getMissingFields, normalizeRecord } from '../utils/schema'
import { usePatientStore } from '../stores/patient'
import RecordSummaryCard from '../components/RecordSummaryCard.vue'
import PrivacyPromiseCard from '../components/PrivacyPromiseCard.vue'
// PRD-2026Q3 §U2：字段补全区的「？白话说明 + 我不知道逃生口」组件。
import FieldExplainer from '../components/FieldExplainer.vue'
import { fields as glossaryFields } from '../copy/glossary'
// Q3-红线 §A.2.1：上传前如果没记录过 'upload' scope，弹 modal 强制同意。
import ConsentModal from '../components/ConsentModal.vue'
import { POLICY_VERSION } from '../constants/privacy'
// PRD-2026Q2 §3.7：与小程序共享的上传场景文案字典（根 `shared/copy/upload.json`）。
// 这里统一错误/状态/字段 hint/CTA 四类 key；empathy.ts 保留其它场景的共情话术。
import uploadCopy from '@shared/copy/upload.json'
// Q3-红线 §B.2：业务漏斗埋点
import { track } from '../utils/track'

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
type UploadErrorKind = 'rate_limit' | 'parse' | 'network' | ''
interface UploadErrorState {
  kind: UploadErrorKind
  message: string
  retryAfter: number // 秒
}
const uploadError = reactive<UploadErrorState>({ kind: '', message: '', retryAfter: 0 })
const retryCountdown = ref(0)
let retryTimer: number | null = null
const gapValues = reactive<Record<string, string>>({})

// PRD-2026Q3 §U2：用户主动声明「这个字段我不知道」的字段 key 集合。
// 命中的字段会从 missingFields 中隐藏，并在 submit 时写入 patient store + payload。
const unknownFieldKeys = ref<string[]>([])
const toastMessage = ref('')
let toastTimer: number | null = null
const showToast = (msg: string) => {
  toastMessage.value = msg
  if (toastTimer) window.clearTimeout(toastTimer)
  toastTimer = window.setTimeout(() => { toastMessage.value = '' }, 2200)
}

const clearUploadError = () => {
  uploadError.kind = ''
  uploadError.message = ''
  uploadError.retryAfter = 0
  retryCountdown.value = 0
  if (retryTimer) { window.clearInterval(retryTimer); retryTimer = null }
}

const startRetryCountdown = (seconds: number) => {
  retryCountdown.value = Math.max(0, Math.ceil(seconds))
  if (retryTimer) window.clearInterval(retryTimer)
  retryTimer = window.setInterval(() => {
    retryCountdown.value -= 1
    if (retryCountdown.value <= 0) {
      if (retryTimer) { window.clearInterval(retryTimer); retryTimer = null }
    }
  }, 1000)
}

// PRD-2026Q2 §3.7：错误分类三大类 + unknown 兜底，与小程序对齐。
const classifyError = (err: any): UploadErrorState => {
  const status = err?.response?.status
  const data = err?.response?.data
  const backendMsg: string = (data && typeof data === 'object' && (data.message || data.msg)) || ''
  if (status === 429) {
    const retryAfterHeader = Number(err?.response?.headers?.['retry-after'] || 0)
    const retryAfterBody = Number(data?.data?.retryAfter || data?.retryAfter || 0)
    const retryAfter = retryAfterHeader || retryAfterBody || 0
    return { kind: 'rate_limit', message: backendMsg || uploadCopy.error.rate_limit, retryAfter }
  }
  if (err?.code === 'ECONNABORTED' || err?.message === 'Network Error' || status === 0) {
    return { kind: 'network', message: uploadCopy.error.network, retryAfter: 0 }
  }
  return { kind: 'parse', message: backendMsg || err?.message || uploadCopy.error.parse_failed, retryAfter: 0 }
}

const setUploadError = (err: any) => {
  const classified = classifyError(err)
  uploadError.kind = classified.kind
  uploadError.message = classified.message
  uploadError.retryAfter = classified.retryAfter
  if (classified.kind === 'rate_limit' && classified.retryAfter > 0) {
    startRetryCountdown(classified.retryAfter)
  }
}

const goManualEntry = () => {
  router.push('/matches?manualEntry=1')
}

let timer: number | null = null
let pollStartTime = 0
let elapsedTimer: number | null = null
const POLL_TIMEOUT_MS = 120_000
const elapsedSeconds = ref(0)

const missingFields = computed(() => getMissingFields(parsedRecord.value))
// 已声明「不知道」的字段从展示里剔除；其余流程（验证、提交）逻辑不变
const visibleMissingFields = computed(() =>
  missingFields.value.filter((f) => !unknownFieldKeys.value.includes(f.key))
)
const unknownFieldLabels = computed(() =>
  unknownFieldKeys.value
    .map((k) => glossaryFields[k]?.label || k)
    .join('、')
)

const onFieldUnknown = (key: string) => {
  if (!unknownFieldKeys.value.includes(key)) {
    unknownFieldKeys.value = [...unknownFieldKeys.value, key]
  }
  // 控件值清空，避免脏数据被 submit 一起带上
  gapValues[key] = ''
  showToast('已记下，继续后面的')
}

const errorCardStyle = computed(() => {
  if (uploadError.kind === 'rate_limit') return { borderColor: '#fcd34d', background: '#fffbeb' }
  if (uploadError.kind === 'network') return { borderColor: '#93c5fd', background: '#eff6ff' }
  return { borderColor: '#fca5a5', background: '#fef2f2' }
})

// PRD-2026Q2 §3.7：错误标题维持本地化短标题；正文 helper 统一走 shared upload.error.*
const errorTitle = computed(() => {
  if (uploadError.kind === 'rate_limit') return '您今天上传得挺多了'
  if (uploadError.kind === 'network') return '网络有点卡'
  return uploadError.message || '这张图片我们没能看清'
})

const errorHelper = computed(() => {
  if (uploadError.kind === 'rate_limit') {
    const minutes = Math.ceil(retryCountdown.value / 60)
    const wait = retryCountdown.value > 0
      ? `大约 ${minutes} 分钟后就能继续上传。`
      : '再歇一下就能继续。'
    return `${uploadCopy.error.rate_limit} ${wait}`
  }
  if (uploadError.kind === 'network') {
    return uploadCopy.error.network
  }
  // parse 分支：解析失败
  return uploadCopy.error.parse_failed
})

// PRD-2026Q2 §3.7：字段 hint 查表 —— shared key 有几类通用字段；geneMutation 对齐到 genes。
const FIELD_HINT_KEY_MAP: Record<string, keyof typeof uploadCopy.fieldHints> = {
  diagnosis: 'diagnosis',
  stage: 'stage',
  geneMutation: 'genes',
  genes: 'genes',
  age: 'age'
}
const getFieldHint = (field: { key: string; hint?: string }) => {
  const sharedKey = FIELD_HINT_KEY_MAP[field.key]
  if (sharedKey && uploadCopy.fieldHints[sharedKey]) {
    return uploadCopy.fieldHints[sharedKey]
  }
  return field.hint || ''
}

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
  clearUploadError()
  parseStatus.value = ''
  parseProgress.value = 0
  Object.keys(gapValues).forEach((k) => delete gapValues[k])
  unknownFieldKeys.value = []
}

const onFileChange = (event: Event) => {
  const target = event.target as HTMLInputElement
  const selected = Array.from(target.files || [])
  files.value = selected
  file.value = selected[0] || null
  clearUploadError()
}

const stopPolling = () => {
  if (timer) { window.clearInterval(timer); timer = null }
  if (elapsedTimer) { window.clearInterval(elapsedTimer); elapsedTimer = null }
}

const retryParse = async () => {
  if (!file.value) return
  // 若之前已上传成功（fileId 存在）但解析失败，直接轮询已有 fileId，避免再消耗一个限流槽
  if (fileId.value && uploadError.kind === 'parse') {
    clearUploadError()
    parseStatus.value = 'parsing'
    pollStartTime = Date.now()
    elapsedSeconds.value = 0
    elapsedTimer = window.setInterval(() => { elapsedSeconds.value = Math.floor((Date.now() - pollStartTime) / 1000) }, 1000)
    try {
      await pollStatus()
      timer = window.setInterval(async () => { try { await pollStatus() } catch {} }, 2000)
    } catch (err: any) {
      setUploadError(err)
    }
    return
  }
  clearUploadError()
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
    setUploadError(err)
  }
}

const pollStatus = async () => {
  if (!fileId.value) return
  if (Date.now() - pollStartTime > POLL_TIMEOUT_MS) {
    stopPolling()
    uploadError.kind = 'parse'
    uploadError.message = uploadCopy.error.parse_failed
    uploadError.retryAfter = 0
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
    uploadError.kind = 'parse'
    uploadError.message = status.message || uploadCopy.error.parse_failed
    uploadError.retryAfter = 0
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

// Q3-红线 §A.2.1：consent 状态 + 弹窗
const consentVisible = ref(false)
const hasUploadConsent = ref(false)
const pendingUploadAction = ref(false)

const checkUploadConsent = async () => {
  try {
    const data: any = await api.getMyConsent()
    const list = data?.list || []
    hasUploadConsent.value = list.some((c: any) => c.scope === 'upload' && c.policyVersion === POLICY_VERSION)
  } catch {
    hasUploadConsent.value = false
  }
}

const onConsentConfirm = async () => {
  try {
    // 三个 scope 一次性记录（modal 三个 checkbox 都勾上才走到这里）
    await Promise.all([
      api.recordConsent('upload', POLICY_VERSION).catch(() => null),
      api.recordConsent('match', POLICY_VERSION).catch(() => null),
      api.recordConsent('share_with_cro', POLICY_VERSION).catch(() => null)
    ])
    hasUploadConsent.value = true
    consentVisible.value = false
    if (pendingUploadAction.value) {
      pendingUploadAction.value = false
      uploadAndParse()
    }
  } catch {
    consentVisible.value = false
  }
}

const onConsentCancel = () => {
  consentVisible.value = false
  pendingUploadAction.value = false
}

const uploadAndParse = async () => {
  if (!files.value.length) return
  if (uploading.value) return // 避免用户连点
  if (!hasUploadConsent.value) {
    pendingUploadAction.value = true
    consentVisible.value = true
    return
  }
  uploading.value = true
  parseProgress.value = 0
  clearUploadError()
  uploadIndex.value = 0
  // Q3-红线 §B.2：upload_start —— 用户实际启动上传那一刻（同意已通过）
  track('upload_start', { fileCount: files.value.length })

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
    // Q3-红线 §B.2：upload_success —— 全部文件解析完成，patient profile 已落地
    track('upload_success', { recordId: recordId.value, fileCount: files.value.length })
  } catch (err: any) {
    setUploadError(err)
  } finally {
    uploading.value = false
    stopPolling()
  }
}

const toMatches = async () => {
  submitting.value = true
  const patchPayload: Record<string, unknown> = { ...gapValues }
  // PRD-2026Q3 §U2：把用户声明「不知道」的字段一起写进 payload + store。
  // 后端不识别 unknownFields 也无害（被忽略即可），前端 MatchesView 可拿来做提示。
  if (unknownFieldKeys.value.length) {
    patchPayload.unknownFields = [...unknownFieldKeys.value]
  }
  parsedRecord.value = { ...parsedRecord.value, ...patchPayload }
  try {
    if (recordId.value && Object.keys(patchPayload).length > 0) {
      await api.enrichRecord(recordId.value, patchPayload).catch(() => null)
    }
    localStorage.setItem('structuredRecordDraft', JSON.stringify(parsedRecord.value))
    patientStore.setRecord(recordId.value, parsedRecord.value)
    patientStore.setUnknownFields(unknownFieldKeys.value)
    router.push('/matches')
  } finally {
    submitting.value = false
  }
}

onMounted(() => {
  checkUploadConsent()
})

onUnmounted(() => {
  stopPolling()
  if (retryTimer) { window.clearInterval(retryTimer); retryTimer = null }
  if (toastTimer) { window.clearTimeout(toastTimer); toastTimer = null }
})
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

/* PRD-2026Q3 §U2：「我不知道」点击后的轻量 toast */
.upload-toast {
  position: fixed;
  left: 50%;
  bottom: 28px;
  transform: translateX(-50%);
  background: rgba(15, 23, 42, 0.92);
  color: #fff;
  padding: 10px 16px;
  border-radius: 999px;
  font-size: 0.88rem;
  z-index: 1200;
  box-shadow: 0 6px 20px rgba(15, 23, 42, 0.18);
}
.fx-toast-enter-active, .fx-toast-leave-active {
  transition: opacity 180ms ease, transform 180ms ease;
}
.fx-toast-enter-from, .fx-toast-leave-to {
  opacity: 0;
  transform: translate(-50%, 6px);
}
</style>
