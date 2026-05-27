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
            <p style="margin:4px 0 0;font-size:0.8rem;color:#9ca3af;">图片或 PDF 都行，可以一次选多张；长图会自动切段识别</p>
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

        <button class="btn primary" :disabled="uploading || preparingFiles || !files.length" @click="uploadAndParse" style="width:100%;padding:12px;">
          {{ preparingFiles
            ? '正在准备文件…'
            : uploading
            ? (batchStats.total > 1
                ? `已处理 ${batchStats.completedCount + batchStats.erroredCount}/${batchStats.total} 份…`
                : '正在帮您看懂…')
            : (files.length > 1 ? `开始批量解析 ${files.length} 份（约 3-5 分钟）` : '开始解析（约 3 分钟）') }}
        </button>

        <p style="font-size:0.78rem;color:#9ca3af;margin:6px 0 0;text-align:center;line-height:1.5;">
          🔒 数据仅在您的账户里 · 随时可删 · 不做任何其它用途
        </p>
      </div>
    </div>

    <!-- 解析中（PRD-2026Q4 流式 OCR）：边收 SSE 边渐显字段 -->
    <div v-if="parseStatus && parseStatus !== 'error' && parseStatus !== 'completed'" class="grid">
      <StreamingRecordCard
        :record="parsedRecord"
        :filled-groups="filledGroups"
        :raw-text="streamRawText"
        :stage="currentStage"
        :upload-percent="uploadPercent"
      />
      <p v-if="isBatchParse && batchStats.total > 1" style="color:#2563eb;font-weight:500;text-align:center;margin:0;">
        已处理 {{ batchStats.completedCount + batchStats.erroredCount }} / {{ batchStats.total }} 份
        <span v-if="batchStats.completedCount" style="color:#16a34a;">（成功 {{ batchStats.completedCount }}）</span>
        <span v-if="batchStats.erroredCount" style="color:#dc2626;">（失败 {{ batchStats.erroredCount }}）</span>
      </p>
      <p v-if="elapsedSeconds > 10" style="font-size:0.8rem;color:#9ca3af;text-align:center;margin:0;">
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

      <!-- Phase E.3：跨多份病历的疾病发展 + 治疗经过时间线（仅在 ≥2 份完成时展示） -->
      <div v-if="timelineSummary && timelineSummary.events && timelineSummary.events.length" class="card" style="background:#eff6ff;border-color:#93c5fd;">
        <h3 style="margin:0 0 8px;color:#1d4ed8;">疾病发展 & 治疗经过</h3>
        <p v-if="timelineSummary.summaryNarrative" style="font-size:0.85rem;color:#374151;margin:0 0 10px;line-height:1.6;">
          {{ timelineSummary.summaryNarrative }}
        </p>
        <ul style="list-style:none;padding:0;margin:0;">
          <li v-for="(event, idx) in timelineSummary.events.slice(0, 10)" :key="idx" style="padding:8px 0;border-bottom:1px solid #dbeafe;font-size:0.85rem;">
            <span style="color:#2563eb;font-weight:500;">{{ event.date || '—' }}</span>
            <span style="color:#1f2937;margin-left:8px;">{{ event.title }}</span>
            <span v-if="event.detail" style="display:block;color:#6b7280;margin-top:2px;font-size:0.78rem;">{{ event.detail }}</span>
          </li>
        </ul>
        <p v-if="timelineSummary.events.length > 10" style="font-size:0.78rem;color:#9ca3af;margin:8px 0 0;">
          展示前 10 项，其余 {{ timelineSummary.events.length - 10 }} 项可在病历详情查看
        </p>
      </div>

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
// PRD-2026Q4 流式 OCR：边解析边渲染的字段卡 + SSE 客户端
import StreamingRecordCard from '../components/StreamingRecordCard.vue'
import { openParseStream, type StreamEvent } from '../services/parseStream'
import PrivacyPromiseCard from '../components/PrivacyPromiseCard.vue'
// PRD-2026Q3 §U2：字段补全区的「？白话说明 + 我不知道逃生口」组件。
import FieldExplainer from '../components/FieldExplainer.vue'
import { fields as glossaryFields } from '../copy/glossary'
// Q3-红线 §A.2.1：上传前如果没记录过 'upload' scope，弹 modal 强制同意。
import ConsentModal from '../components/ConsentModal.vue'
import { POLICY_VERSION } from '../constants/privacy'
// PRD-2026Q2 §3.7：与小程序共享的上传场景文案字典（根 `shared/copy/upload.js`）。
// 这里统一错误/状态/字段 hint/CTA 四类 key；empathy.ts 保留其它场景的共情话术。
// 已从 .json 迁到 .js（WeApp `require()` 不识 .json）；详见 shared/copy/upload.js 顶部。
// @ts-ignore — plain CJS module
import uploadCopy from '@shared/copy/upload.js'
// PRD-2026Q4 followup：上传批次上限单一来源（与 server/miniprogram 同源）
// @ts-ignore — plain CJS module
import { BATCH_UPLOAD_MAX as SHARED_BATCH_UPLOAD_MAX } from '@shared/schemas/upload.js'
// Q3-红线 §B.2：业务漏斗埋点
import { track } from '../utils/track'

const router = useRouter()
const patientStore = usePatientStore()

// PRD-2026Q4 followup：客户端硬上限，与小程序 / 服务端共享同一个常量
// （shared/schemas/upload.js BATCH_UPLOAD_MAX）—— 单一来源后任何一边改了 N，
// 三端同步生效，杜绝"Treatbot Web 还停留在旧值整批上传完才被 400"的事故。
const MAX_BATCH_FILES = SHARED_BATCH_UPLOAD_MAX

const file = ref<File | null>(null)
const files = ref<File[]>([])
const preparingFiles = ref(false)
const uploadIndex = ref(0)
const remark = ref('')
const uploading = ref(false)
const parseStatus = ref('')
const parseProgress = ref(0)
const parsedRecord = ref<Record<string, unknown>>({})
const recordId = ref('')
const fileId = ref('')
// Phase E.2 / E.3：批量上传跟踪 + 时间线
const fileIds = ref<string[]>([])
const batchId = ref('')
const isBatchParse = ref(false)
const batchStats = reactive({ total: 0, completedCount: 0, erroredCount: 0 })
const timelineSummary = ref<any | null>(null)
// PRD-2026Q4 流式 OCR
type GroupName = 'basic' | 'diagnosis' | 'treatment' | 'timeline'
const filledGroups = ref<GroupName[]>([])
const streamRawText = ref<string>('')
const currentStage = ref<'received' | 'preprocess' | 'ocr_text' | 'field_group' | 'completed' | 'error'>('received')
const uploadPercent = ref<number>(0)
let streamCloser: (() => void) | null = null
let lastSeqByRecordId = new Map<string, number>()
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
const elapsedSeconds = ref(0)
let lastPersistedRecordSignature = ''
let persistInFlight: Promise<void> | null = null

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

const LONG_IMAGE_MIN_HEIGHT = 2800
const LONG_IMAGE_MIN_RATIO = 2.6
const LONG_IMAGE_TARGET_SLICE_HEIGHT = 2200
const LONG_IMAGE_OVERLAP = 120
const LONG_IMAGE_MAX_OUTPUT_WIDTH = 1800

const isImageFile = (f: File) =>
  f.type.startsWith('image/') || /\.(jpe?g|png|webp|bmp)$/i.test(f.name)

const splitName = (name: string) => {
  const dot = name.lastIndexOf('.')
  if (dot <= 0) return { base: name || 'image', ext: '' }
  return { base: name.slice(0, dot), ext: name.slice(dot) }
}

const loadImageElement = (f: File) =>
  new Promise<{ img: HTMLImageElement; release: () => void }>((resolve, reject) => {
    const url = URL.createObjectURL(f)
    const img = new Image()
    const release = () => URL.revokeObjectURL(url)
    img.onload = () => resolve({ img, release })
    img.onerror = () => {
      release()
      reject(new Error('图片读取失败'))
    }
    img.src = url
  })

const canvasToBlob = (canvas: HTMLCanvasElement, quality = 0.9) =>
  new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob)
      else reject(new Error('图片切段失败'))
    }, 'image/jpeg', quality)
  })

const sliceLongImage = async (f: File, maxParts: number): Promise<File[]> => {
  if (!isImageFile(f) || maxParts <= 1) return [f]

  let loaded: { img: HTMLImageElement; release: () => void } | null = null
  try {
    loaded = await loadImageElement(f)
    const { img } = loaded
    const width = img.naturalWidth || img.width
    const height = img.naturalHeight || img.height
    if (!width || !height) return [f]
    const ratio = height / Math.max(1, width)
    if (height < LONG_IMAGE_MIN_HEIGHT || ratio < LONG_IMAGE_MIN_RATIO) {
      return [f]
    }

    const estimatedParts = Math.max(
      2,
      Math.ceil((height - LONG_IMAGE_OVERLAP) / (LONG_IMAGE_TARGET_SLICE_HEIGHT - LONG_IMAGE_OVERLAP))
    )
    const partsWanted = Math.max(2, Math.min(maxParts, estimatedParts))
    const sliceHeight = Math.ceil((height + LONG_IMAGE_OVERLAP * (partsWanted - 1)) / partsWanted)
    const scale = width > LONG_IMAGE_MAX_OUTPUT_WIDTH ? LONG_IMAGE_MAX_OUTPUT_WIDTH / width : 1
    const outputWidth = Math.max(1, Math.round(width * scale))
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')
    if (!ctx) return [f]

    const { base } = splitName(f.name)
    const parts: File[] = []
    let y = 0
    while (y < height && parts.length < partsWanted) {
      const sourceHeight = Math.min(sliceHeight, height - y)
      canvas.width = outputWidth
      canvas.height = Math.max(1, Math.round(sourceHeight * scale))
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      ctx.drawImage(img, 0, y, width, sourceHeight, 0, 0, canvas.width, canvas.height)
      const blob = await canvasToBlob(canvas)
      parts.push(new File([blob], `${base}-part-${parts.length + 1}.jpg`, {
        type: 'image/jpeg',
        lastModified: f.lastModified
      }))
      if (y + sourceHeight >= height) break
      y += Math.max(1, sliceHeight - LONG_IMAGE_OVERLAP)
    }

    return parts.length > 1 ? parts : [f]
  } catch (err) {
    console.warn('长图切段失败，保留原图', err)
    return [f]
  } finally {
    if (loaded) loaded.release()
  }
}

const prepareSelectedFiles = async (selected: File[]) => {
  const prepared: File[] = []
  let splitSourceCount = 0
  let splitPartCount = 0
  let droppedCount = 0

  for (const f of selected) {
    const remaining = MAX_BATCH_FILES - prepared.length
    if (remaining <= 0) {
      droppedCount += 1
      continue
    }
    const parts = await sliceLongImage(f, remaining)
    if (parts.length > 1) {
      splitSourceCount += 1
      splitPartCount += parts.length
    }
    for (const part of parts) {
      if (prepared.length < MAX_BATCH_FILES) {
        prepared.push(part)
      } else {
        droppedCount += 1
      }
    }
  }

  const capped = prepared.slice(0, MAX_BATCH_FILES)
  return { files: capped, splitSourceCount, splitPartCount, droppedCount }
}

const resetUpload = () => {
  parsedRecord.value = {}
  fileId.value = ''
  recordId.value = ''
  batchId.value = ''
  files.value = []
  file.value = null
  preparingFiles.value = false
  clearUploadError()
  parseStatus.value = ''
  parseProgress.value = 0
  Object.keys(gapValues).forEach((k) => delete gapValues[k])
  unknownFieldKeys.value = []
  filledGroups.value = []
  streamRawText.value = ''
  currentStage.value = 'received'
  lastSeqByRecordId = new Map<string, number>()
  uploadPercent.value = 0
  lastPersistedRecordSignature = ''
  persistInFlight = null
  if (streamCloser) { try { streamCloser() } catch (_e) {} ; streamCloser = null }
}

const onFileChange = async (event: Event) => {
  const target = event.target as HTMLInputElement
  const selected = Array.from(target.files || [])
  clearUploadError()
  files.value = []
  file.value = null
  if (!selected.length) return

  preparingFiles.value = true
  try {
    const prepared = await prepareSelectedFiles(selected)
    files.value = prepared.files
    file.value = prepared.files[0] || null
    if (prepared.splitSourceCount > 0) {
      showToast(`已把 ${prepared.splitSourceCount} 张长图切成 ${prepared.splitPartCount} 段，会自动合并识别结果`)
    } else if (prepared.droppedCount > 0) {
      showToast(`一次最多上传 ${MAX_BATCH_FILES} 份，已为您保留前 ${MAX_BATCH_FILES} 份`)
    }
    if (prepared.splitSourceCount > 0 && prepared.droppedCount > 0) {
      window.setTimeout(() => {
        showToast(`切段后超过 ${MAX_BATCH_FILES} 份，已保留前 ${MAX_BATCH_FILES} 份`)
      }, 2300)
    }
  } finally {
    preparingFiles.value = false
  }
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
      if (fileIds.value.length > 1) {
        while (true) {
          const { done, mergedResult, firstError } = await pollBatchOnce()
          if (done) {
            if (Object.keys(mergedResult).length) {
              parseStatus.value = 'completed'
              currentStage.value = 'completed'
              if (batchStats.completedCount >= 2) await fetchTimeline()
              await persistAggregatedRecord('retry_batch_completed')
              break
            }
            throw new Error(firstError || '所有文件解析均失败')
          }
          await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS))
        }
      } else {
        await pollStatus()
        timer = window.setInterval(async () => { try { await pollStatus() } catch {} }, 2000)
      }
    } catch (err: any) {
      setUploadError(err)
    }
    return
  }
  if (files.value.length > 1) {
    await uploadAndParse()
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
  const status = await api.getParseStatus(fileId.value)
  parseStatus.value = status.status || 'parsing'
  parseProgress.value = Number(status.progress || 0)
  if (status.status === 'completed') {
    stopPolling()
    parsedRecord.value = normalizeRecord(status.result || status.record || status)
    await persistAggregatedRecord('single_poll_completed')
  } else if (status.status === 'error') {
    stopPolling()
    uploadError.kind = 'parse'
    uploadError.message = status.message || uploadCopy.error.parse_failed
    uploadError.retryAfter = 0
    parseStatus.value = 'error'
  }
}

const isEmptyMergeValue = (value: unknown): boolean => {
  if (value === undefined || value === null || value === '') return true
  if (Array.isArray(value)) return value.length === 0
  if (typeof value === 'object') return Object.keys(value as Record<string, unknown>).length === 0
  return false
}

const mergeArrays = (base: unknown[], extra: unknown[]) => {
  const seen = new Set<string>()
  const merged: unknown[] = []
  for (const item of [...base, ...extra]) {
    const key = typeof item === 'object' && item !== null
      ? JSON.stringify(item)
      : String(item)
    if (seen.has(key)) continue
    seen.add(key)
    merged.push(item)
  }
  return merged
}

const buildPersistEntities = () => {
  const entities = { ...parsedRecord.value }
  delete entities.id
  delete entities.recordId
  delete entities.fileId
  return entities
}

const persistAggregatedRecord = async (_reason: string) => {
  if (!recordId.value || !Object.keys(parsedRecord.value).length) return
  const entities = buildPersistEntities()
  const signature = `${recordId.value}:${JSON.stringify(entities)}`
  if (signature === lastPersistedRecordSignature) return
  if (persistInFlight) {
    await persistInFlight
    if (signature === lastPersistedRecordSignature) return
  }
  persistInFlight = (async () => {
    await api.enrichRecord(recordId.value, {
      entities,
      structured: { entities }
    })
    lastPersistedRecordSignature = signature
    patientStore.setRecord(recordId.value, parsedRecord.value)
  })()
  try {
    await persistInFlight
  } catch (err) {
    console.warn('结构化病历汇总保存失败', err)
  } finally {
    persistInFlight = null
  }
}

const mergeDeepValue = (key: string, base: unknown, extra: unknown): unknown => {
  if (isEmptyMergeValue(extra)) return base
  if (isEmptyMergeValue(base)) return extra
  if (Array.isArray(base) && Array.isArray(extra)) return mergeArrays(base, extra)
  if (
    typeof base === 'object' && base !== null && !Array.isArray(base) &&
    typeof extra === 'object' && extra !== null && !Array.isArray(extra)
  ) {
    const merged: Record<string, unknown> = { ...(base as Record<string, unknown>) }
    for (const [childKey, childValue] of Object.entries(extra as Record<string, unknown>)) {
      merged[childKey] = mergeDeepValue(childKey, merged[childKey], childValue)
    }
    return merged
  }
  if (`${base}` === `${extra}`) return base
  if (['geneMutation', 'treatment', 'diagnosis', 'stage', 'pdl1'].includes(key)) {
    return `${base}；${extra}`
  }
  return base
}

const mergeRecords = (base: Record<string, unknown>, extra: Record<string, unknown>) => {
  const merged: Record<string, unknown> = { ...base }
  const normalizedExtra = normalizeRecord(extra)
  for (const [key, value] of Object.entries(normalizedExtra)) {
    if (key === 'entities') continue
    merged[key] = mergeDeepValue(key, merged[key], value)
  }
  return merged
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

// Phase E.2：批量上传 + 批量轮询。一次 HTTP 上传（multi-FormData）+ 周期性 batch poll，
// 而不是 N 次 single upload + N 个 polling timer。
const POLL_INTERVAL_MS = 2000
const COMPLETED_STATUSES = new Set(['completed', 'parsed', 'success', 'done'])
const ERROR_STATUSES = new Set(['error', 'failed', 'timeout', 'cancelled', 'not_found'])

const isCompletedStatus = (status: unknown) => COMPLETED_STATUSES.has(String(status || '').toLowerCase())
const isErrorStatus = (status: unknown) => ERROR_STATUSES.has(String(status || '').toLowerCase())

const pollBatchOnce = async (): Promise<{ done: boolean; mergedResult: Record<string, unknown>; firstError?: string }> => {
  const status = await api.getParseStatusBatch(fileIds.value, batchId.value)
  const entries = Array.isArray(status.entries) ? status.entries : []
  batchStats.total = Number(status.total || entries.length || fileIds.value.length || 0)
  batchStats.completedCount = Number(status.completedCount || entries.filter((entry: any) => isCompletedStatus(entry.status)).length || 0)
  batchStats.erroredCount = Number(status.erroredCount || entries.filter((entry: any) => isErrorStatus(entry.status)).length || 0)
  const completedEntries = entries.filter((entry: any) => isCompletedStatus(entry.status))
  const firstCompletedRecordId = completedEntries
    .map((entry: any) => entry.recordId || entry.fileId)
    .find(Boolean)
  const caseSourceRecordId = status.case && Array.isArray(status.case.sourceRecordIds)
    ? status.case.sourceRecordIds.find((id: unknown) => completedEntries.some((entry: any) => (entry.recordId || entry.fileId) === id))
    : ''
  const resolvedRecordId = firstCompletedRecordId || caseSourceRecordId || ''
  let merged: Record<string, unknown> = {}
  if (status.case && status.case.entities) {
    merged = mergeRecords(merged, {
      ...status.case.entities,
      caseId: status.case.caseId || status.case.id || '',
      sourceRecordIds: status.case.sourceRecordIds || []
    })
  }

  // 整体进度：完成 + 失败 占总数的比例
  const ratio = batchStats.total > 0 ? (batchStats.completedCount + batchStats.erroredCount) / batchStats.total : 0
  parseProgress.value = Math.floor(ratio * 100)

  // 合并所有 completed 条目的 result
  let entryMerged: Record<string, unknown> = {}
  let firstError: string | undefined
  for (const entry of entries) {
    if (isCompletedStatus(entry.status) && entry.result) {
      entryMerged = mergeRecords(entryMerged, normalizeRecord(entry.result))
      if (entry.recordId && !recordId.value) recordId.value = entry.recordId
    } else if (entry.errorMsg && !firstError) {
      firstError = entry.errorMsg
    }
  }
  if (Object.keys(entryMerged).length) {
    merged = mergeRecords(merged, entryMerged)
  }

  if (Object.keys(merged).length) {
    const finalMerged = resolvedRecordId
      ? { ...merged, id: resolvedRecordId, recordId: resolvedRecordId }
      : merged
    if (status.done) {
      parsedRecord.value = normalizeRecord(finalMerged)
    } else {
      parsedRecord.value = mergeRecords(parsedRecord.value, finalMerged)
    }
  }

  if (resolvedRecordId) {
    recordId.value = resolvedRecordId
  }

  return { done: status.done, mergedResult: merged, firstError }
}

const fetchTimeline = async () => {
  try {
    const t = await api.getMedicalTimeline()
    if (t && t.timeline) timelineSummary.value = t.timeline
  } catch (err) {
    // 时间线是 nice-to-have，失败静默
    console.warn('时间线获取失败', err)
  }
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
  fileIds.value = []
  batchId.value = ''
  lastSeqByRecordId = new Map<string, number>()
  isBatchParse.value = files.value.length > 1
  timelineSummary.value = null
  batchStats.total = files.value.length
  batchStats.completedCount = 0
  batchStats.erroredCount = 0
  track('upload_start', { fileCount: files.value.length })

  try {
    // Step 1：一次性批量上传（Treatbot Web 原生支持 <input multiple>）
    parseStatus.value = 'uploading'
    pollStartTime = Date.now()
    elapsedSeconds.value = 0
    elapsedTimer = window.setInterval(() => {
      elapsedSeconds.value = Math.floor((Date.now() - pollStartTime) / 1000)
    }, 1000)

    // PRD-2026Q4：把 axios 上传进度回灌到 uploadPercent —— StreamingRecordCard 的
    // 「准备」阶段会显示具体百分比，让多文件 / 大文件上传等待时不再是一片"准备中"。
    uploadPercent.value = 0
    const uploadRes = await api.uploadMedicalRecordBatch(
      files.value,
      'auto',
      remark.value,
      (percent) => { uploadPercent.value = percent }
    )
    batchId.value = uploadRes.batchId || ''
    fileIds.value = Array.isArray(uploadRes.fileIds) ? uploadRes.fileIds : []
    if (!fileIds.value.length) {
      throw new Error(`所有文件上传失败（共 ${uploadRes.total} 份）`)
    }
    fileId.value = fileIds.value[0]
    if (uploadRes.records && uploadRes.records[0] && uploadRes.records[0].recordId) {
      recordId.value = uploadRes.records[0].recordId
    } else {
      recordId.value = fileIds.value[0]
    }

    // 上传部分失败：toast 提示但继续
    if (uploadRes.successCount < uploadRes.total) {
      showToast(`${uploadRes.total - uploadRes.successCount} 份上传失败，其余 ${uploadRes.successCount} 份继续解析`)
    }

    // Step 2：流式订阅（SSE，PRD-2026Q4）
    //   主路径：openParseStream → 阶段事件 + 字段分组事件 → 增量 merge 到 parsedRecord
    //   兜底：onError / onNoredis → 触发 pollBatchOnce 轮询循环
    parseStatus.value = 'running'
    parseProgress.value = 5
    filledGroups.value = []
    streamRawText.value = ''
    currentStage.value = 'received'

    await new Promise<void>((resolve, reject) => {
      let settled = false
      const safeResolve = () => { if (!settled) { settled = true; resolve() } }
      const safeReject = (e: Error) => { if (!settled) { settled = true; reject(e) } }

      // 兜底：进入轮询直到所有 record 都是终态（与原 while 循环等价）
      let pollingActive = false
      const startPollingFallback = async (reason: string) => {
        if (pollingActive) return
        pollingActive = true
        // 关闭当前 SSE，避免双路径都在写 parsedRecord
        if (streamCloser) { try { streamCloser() } catch (_e) {} ; streamCloser = null }
        console.warn('parse-stream fallback to polling:', reason)
        while (true) {
          try {
            const { done, mergedResult, firstError } = await pollBatchOnce()
            if (done) {
              if (Object.keys(mergedResult).length) {
                parseStatus.value = 'completed'
                currentStage.value = 'completed'
                if (batchStats.completedCount >= 2) await fetchTimeline()
                return safeResolve()
              }
              return safeReject(new Error(firstError || '所有文件解析均失败'))
            }
          } catch (err: any) {
            return safeReject(err)
          }
          await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS))
        }
      }

      // record 终态计数：所有 fileIds 都到 completed/error 时才算整体 done
      const completedRecordIds = new Set<string>()
      const erroredRecordIds = new Set<string>()
      const terminalRecordCount = () => new Set([...completedRecordIds, ...erroredRecordIds]).size
      // 是否至少收到过一条 state 事件（用于 noredis 8s 哨兵判定）。
      // 不能用 `currentStage === 'received'` 判定，因为 received 既是初始值也是首个 state 的 stage。
      let sseReceivedAnyState = false

      const onState = (evt: StreamEvent) => {
        sseReceivedAnyState = true
        if (evt.recordId && typeof evt.seq === 'number') {
          lastSeqByRecordId.set(String(evt.recordId), evt.seq)
        }
        currentStage.value = evt.stage as typeof currentStage.value
        if (typeof evt.progress === 'number' && evt.progress > parseProgress.value) {
          parseProgress.value = evt.progress
        }
        if (evt.stage === 'ocr_text' && evt.rawText) {
          streamRawText.value = evt.rawText
        }
        if (evt.stage === 'field_group' && evt.fieldGroup && evt.fields) {
          // 增量 merge：保留已有"有意义"值（保护用户编辑过的字段不被回填覆盖），
          // 但**空数组 / 空对象**不算"已有值"——partial-json 早期可能把 treatmentHistory 之类
          // 先发成 []，后续完整数组要能把它替换掉，否则用户永远看不到治疗记录。
          parsedRecord.value = mergeRecords(parsedRecord.value, evt.fields)
          if (!filledGroups.value.includes(evt.fieldGroup)) {
            filledGroups.value = [...filledGroups.value, evt.fieldGroup]
          }
        }
        if (evt.stage === 'completed' && evt.result) {
          // 把最终 entities merge（normalizeRecord 把别名映射到标准 key）
          const merged = mergeRecords(parsedRecord.value, evt.result.entities || evt.result)
          parsedRecord.value = merged
          if (!recordId.value && evt.recordId) recordId.value = evt.recordId
          completedRecordIds.add(String(evt.recordId))
          batchStats.completedCount = completedRecordIds.size
          // 关键：completed 到来但 4 个 field_group 没全发（snapshot-at-open / 非流式 fallback /
          // streamChatJson 一次性出齐）时，filledGroups 不补会导致 4 块骨架卡死。
          // 此时数据已经在 parsedRecord 里完整可见，直接把 4 组都标 filled。
          const ALL_GROUPS: GroupName[] = ['basic', 'diagnosis', 'treatment', 'timeline']
          const missing = ALL_GROUPS.filter((g) => !filledGroups.value.includes(g))
          if (missing.length) {
            filledGroups.value = [...filledGroups.value, ...missing]
          }
        }
        if (evt.stage === 'error' && evt.recordId) {
          erroredRecordIds.add(String(evt.recordId))
          batchStats.erroredCount = erroredRecordIds.size
        }
        if (terminalRecordCount() >= fileIds.value.length) {
          // SSE 只负责渐显。真正的完成卡片、recordId 选择和 case 合并必须回到
          // parse-status-batch 的 DB 快照，避免把合并结果 PATCH 到失败的首个上传记录。
          startPollingFallback('sse_terminal_confirm')
        }
      }

      streamCloser = openParseStream(fileIds.value, {
        onBatchState: (info) => {
          if (!info || typeof info !== 'object') return
          const total = Number(info.total || info.totalCount || 0)
          if (total > 0) batchStats.total = total
          batchStats.completedCount = Number(info.successCount || info.completedCount || batchStats.completedCount || 0)
          batchStats.erroredCount = Number(info.failedCount || info.erroredCount || batchStats.erroredCount || 0)
          if (typeof info.elapsedSeconds === 'number' && info.elapsedSeconds > elapsedSeconds.value) {
            elapsedSeconds.value = info.elapsedSeconds
          }
        },
        onMergePreview: (info) => {
          const draft = info && (info.caseDraft || info.entities || info.fields)
          if (draft && typeof draft === 'object') {
            parsedRecord.value = mergeRecords(parsedRecord.value, draft)
          }
        },
        onState,
        onDone: () => {
          // 服务端通知"全部终态"时，无论本地是否已收到部分 state，都必须拉
          // parse-status-batch 做终态确认；SSE 可能缺少 case/entries 的最终合并结果。
          if (!settled) startPollingFallback('done_confirm')
        },
        onError: (e) => { startPollingFallback(e.message || 'sse_error') },
        onNoredis: () => {
          // Redis 不可用时即使已经收到 snapshot/初始 state，也不能相信 SSE 会继续推进。
          // 立即切到 batch polling，避免 UI 永久停在 pending/running。
          startPollingFallback(sseReceivedAnyState ? 'noredis_after_state' : 'noredis')
        }
      }, { batchId: batchId.value, afterSeq: lastSeqByRecordId })
    })

    await persistAggregatedRecord('upload_completed')

    track('upload_success', {
      recordId: recordId.value,
      fileCount: files.value.length,
      successCount: batchStats.completedCount,
      errorCount: batchStats.erroredCount
    })
  } catch (err: any) {
    setUploadError(err)
  } finally {
    uploading.value = false
    stopPolling()
    if (streamCloser) { try { streamCloser() } catch (_e) {} ; streamCloser = null }
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
    if (recordId.value) {
      const entities = buildPersistEntities()
      const payload = {
        entities,
        structured: { entities },
        ...patchPayload
      }
      await api.enrichRecord(recordId.value, payload).catch(() => null)
      lastPersistedRecordSignature = `${recordId.value}:${JSON.stringify(entities)}`
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
  if (streamCloser) { try { streamCloser() } catch (_e) {} ; streamCloser = null }
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
