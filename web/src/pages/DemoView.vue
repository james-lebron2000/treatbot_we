<template>
  <section class="grid demo-view">
    <!-- 顶部说明卡 -->
    <div class="card intro-card">
      <div class="badge">演示模式 · 无需登录</div>
      <h2 style="margin:8px 0 6px;">30 秒看懂 TreatBot 怎么帮患者找到临床试验</h2>
      <p style="font-size:0.9rem;color:#374151;line-height:1.6;margin:0;">
        下面是两份脱敏的真实病历样本。选一份 → 系统会模拟完整的「上传 → OCR → 结构化 → 匹配」流程，
        并给出和正式流程完全一致的结构化摘要和试验匹配结果。你也可以直接把摘要导出为 PDF 带给医生看。
      </p>
    </div>

    <!-- Stage: 选择样例 -->
    <div v-if="stage === 'picker'" class="grid">
      <div v-if="loadingSamples" class="card" style="text-align:center;padding:30px 16px;">
        <div class="pulse-dot"></div>
        <p style="margin-top:12px;color:#6b7280;">正在加载演示样例…</p>
      </div>
      <div v-else-if="samplesError" class="card" style="border-color:#fca5a5;background:#fef2f2;">
        <p style="color:#dc2626;margin:0 0 8px;">{{ samplesError }}</p>
        <button class="btn primary" @click="loadSamples" style="width:100%;">重试</button>
      </div>
      <div
        v-for="sample in samples"
        :key="sample.id"
        class="card sample-card"
        @click="choose(sample)"
      >
        <div class="sample-media">
          <img
            :src="absAsset(sample.thumbUrl || sample.imageUrl)"
            :alt="sample.title"
            loading="lazy"
          />
        </div>
        <div class="sample-body">
          <h3 style="margin:0 0 4px;font-size:1rem;color:#1f2937;">{{ sample.title }}</h3>
          <p style="margin:0 0 8px;font-size:0.85rem;color:#4b5563;line-height:1.5;">
            {{ sample.summary }}
          </p>
          <div class="sample-meta">
            <span v-if="sample.age">{{ sample.age }} 岁</span>
            <span v-if="sample.sex">{{ sample.sex }}</span>
            <span v-if="sample.diagnosisHint" class="meta-tag">{{ sample.diagnosisHint }}</span>
          </div>
        </div>
        <div class="sample-cta">开始演示 →</div>
      </div>
    </div>

    <!-- Stage: 预览 + 开始按钮 -->
    <div v-if="stage === 'preview' && currentSample" class="grid">
      <div class="card">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
          <h3 style="margin:0;">{{ currentSample.title }}</h3>
          <button class="btn ghost" @click="backToPicker">← 换一份</button>
        </div>
        <div class="preview-image">
          <img
            :src="absAsset(currentSample.imageUrl)"
            :alt="currentSample.title"
          />
        </div>
        <p style="font-size:0.85rem;color:#6b7280;margin:10px 0 0;">
          点下方按钮即可启动演示，我们不会真的调用 OCR、也不会写入任何数据。
        </p>
        <button class="btn primary" style="width:100%;margin-top:14px;padding:12px;" @click="startProgress">
          开始演示（约 30 秒）
        </button>
      </div>
    </div>

    <!-- Stage: 进度动画 -->
    <div v-if="stage === 'progress'" class="grid">
      <DemoProgress @stage="onStage" @done="onProgressDone" />
      <div v-if="prefetchError" class="card" style="border-color:#fca5a5;background:#fef2f2;">
        <p style="color:#dc2626;margin:0;">预取演示结果失败：{{ prefetchError }}</p>
      </div>
    </div>

    <!-- Stage: 结果展示 -->
    <div v-if="stage === 'result' && parsedRecord" class="grid">
      <div class="card" style="background:#f0fdf4;border-color:#86efac;">
        <h3 style="margin:0 0 6px;color:#166534;">识别完成</h3>
        <p style="font-size:0.85rem;color:#374151;margin:0;">
          以下是 AI 从样本病历中提取的关键信息（演示数据，100% 固定）。
        </p>
      </div>

      <div ref="pdfRoot" class="pdf-root">
        <RecordSummaryCard :record="parsedRecord" />
      </div>

      <div class="card" style="display:grid;gap:10px;">
        <button class="btn primary" style="padding:12px;" @click="goMatches">
          查看匹配的临床试验
        </button>
        <button class="btn ghost" style="padding:12px;" :disabled="exporting" @click="exportPdf">
          {{ exporting ? '正在生成 PDF…' : '下载结构化病历 PDF' }}
        </button>
        <button class="btn ghost" style="padding:8px;" @click="backToPicker">
          ← 返回演示首页
        </button>
        <p v-if="exportError" style="color:#dc2626;font-size:0.85rem;margin:0;">{{ exportError }}</p>
      </div>
    </div>

    <!-- Stage: 匹配结果 -->
    <div v-if="stage === 'matches'" class="grid">
      <div class="card" style="display:flex;justify-content:space-between;align-items:center;">
        <h3 style="margin:0;">匹配的临床试验</h3>
        <button class="btn ghost" @click="stage = 'result'">← 返回摘要</button>
      </div>

      <div v-if="loadingMatches" class="card" style="text-align:center;padding:20px 16px;">
        <div class="pulse-dot"></div>
        <p style="margin-top:10px;color:#6b7280;">正在加载匹配结果…</p>
      </div>
      <div v-else-if="matchesError" class="card" style="border-color:#fca5a5;background:#fef2f2;">
        <p style="color:#dc2626;margin:0 0 8px;">{{ matchesError }}</p>
        <button class="btn primary" @click="loadMatches" style="width:100%;">重试</button>
      </div>
      <template v-else>
        <div
          v-for="match in matches"
          :key="match.id"
          class="card match-card"
        >
          <div class="match-head">
            <div class="score-badge" :class="scoreClass(match.score)">{{ match.score }} 分</div>
            <div class="status-pill">{{ match.statusText || '招募中' }}</div>
          </div>
          <h3 class="match-name">{{ match.name }}</h3>
          <div class="match-meta">
            <span v-if="match.phase">{{ match.phase }}</span>
            <span v-if="match.indication">{{ match.indication }}</span>
            <span v-if="match.location">{{ match.location }}</span>
          </div>
          <div v-if="match.institution" style="font-size:0.82rem;color:#6b7280;margin-top:4px;">
            牵头 / 分中心：{{ match.institution }}
          </div>
          <ul v-if="match.reasons?.length" class="reason-list">
            <li v-for="(r, i) in match.reasons" :key="i">{{ r }}</li>
          </ul>
        </div>
      </template>

      <div class="card demo-cta">
        <h3 style="margin:0 0 6px;">想用自己的病历试试？</h3>
        <p style="font-size:0.85rem;color:#4b5563;margin:0 0 12px;line-height:1.5;">
          登录后上传真实病历，3 分钟就能拿到匹配结果。数据全程加密，您可随时删除。
        </p>
        <button class="btn primary" style="width:100%;padding:12px;" @click="goLogin">
          去登录 / 上传我的病历
        </button>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
/**
 * DemoView — 公开免登录的「产品试用演示」主容器
 *
 * 状态机：
 *   picker  → preview → progress → result → matches
 *                                          ↘ pdf 下载（仍停留在 result）
 *
 * 数据流：
 *   - GET /api/demo/samples         页面挂载时拉取
 *   - GET /api/demo/samples/:id/result    progress 启动的同时并发预取
 *   - GET /api/demo/samples/:id/matches   用户点"查看匹配"时才拉
 *
 * 与真实流程的差别只在 URL：DemoProgress 进度纯前端驱动，真实流程不需要这么长动画。
 */
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { api } from '../services/api'
import RecordSummaryCard from '../components/RecordSummaryCard.vue'
import DemoProgress from '../components/DemoProgress.vue'

type Sample = {
  id: string
  title: string
  summary: string
  imageUrl: string
  thumbUrl?: string
  age?: number
  sex?: string
  diagnosisHint?: string
}

type Stage = 'picker' | 'preview' | 'progress' | 'result' | 'matches'

const router = useRouter()

const stage = ref<Stage>('picker')
const samples = ref<Sample[]>([])
const loadingSamples = ref(false)
const samplesError = ref('')

const currentSample = ref<Sample | null>(null)
const parsedRecord = ref<Record<string, unknown> | null>(null)
const prefetchError = ref('')

const matches = ref<any[]>([])
const loadingMatches = ref(false)
const matchesError = ref('')

const pdfRoot = ref<HTMLElement | null>(null)
const exporting = ref(false)
const exportError = ref('')

const API_BASE = (import.meta.env.VITE_API_BASE_URL || 'https://inseq.top').replace(/\/$/, '')

function absAsset(url?: string) {
  if (!url) return ''
  if (/^https?:\/\//i.test(url)) return url
  return `${API_BASE}${url.startsWith('/') ? '' : '/'}${url}`
}

function scoreClass(score: number | undefined) {
  const s = Number(score ?? 0)
  if (s >= 90) return 'score-high'
  if (s >= 70) return 'score-mid'
  return 'score-low'
}

async function loadSamples() {
  loadingSamples.value = true
  samplesError.value = ''
  try {
    const res = await api.listDemoSamples()
    samples.value = Array.isArray(res) ? res : (res?.list || [])
  } catch (err: any) {
    samplesError.value = err?.message || '样例加载失败，请稍后重试'
  } finally {
    loadingSamples.value = false
  }
}

function choose(sample: Sample) {
  currentSample.value = sample
  parsedRecord.value = null
  prefetchError.value = ''
  stage.value = 'preview'
}

function backToPicker() {
  currentSample.value = null
  parsedRecord.value = null
  matches.value = []
  stage.value = 'picker'
}

/** 启动演示：切换到 progress 并并发预取结果，保证 30s 到点时已就绪 */
function startProgress() {
  if (!currentSample.value) return
  stage.value = 'progress'
  prefetchError.value = ''
  void prefetchResult(currentSample.value.id)
}

async function prefetchResult(id: string) {
  try {
    const res = await api.getDemoSampleResult(id)
    // res 形如 { recordId, status, progress, result, structured, ... }
    const result = res?.result || res?.structured?.entities || res
    parsedRecord.value = result as Record<string, unknown>
  } catch (err: any) {
    prefetchError.value = err?.message || '结果加载失败'
  }
}

function onStage(_index: number, _key: string) {
  // 目前无需按阶段副作用；保留钩子便于后续注入埋点
}

function onProgressDone() {
  // 动画到 100% — 如果预取已完成直接进入结果；否则等待 parsedRecord 就绪
  if (parsedRecord.value) {
    stage.value = 'result'
  } else {
    // 短暂轮询：最多再等 3s
    const start = Date.now()
    const poll = () => {
      if (parsedRecord.value) {
        stage.value = 'result'
      } else if (Date.now() - start < 3000) {
        setTimeout(poll, 200)
      } else if (!prefetchError.value) {
        prefetchError.value = '结果加载超时，请重试'
      }
    }
    poll()
  }
}

async function loadMatches() {
  if (!currentSample.value) return
  loadingMatches.value = true
  matchesError.value = ''
  try {
    const res = await api.getDemoSampleMatches(currentSample.value.id)
    const list = Array.isArray(res) ? res : (res?.list || res?.matches || [])
    matches.value = list
  } catch (err: any) {
    matchesError.value = err?.message || '匹配结果加载失败'
  } finally {
    loadingMatches.value = false
  }
}

async function goMatches() {
  stage.value = 'matches'
  if (!matches.value.length) await loadMatches()
}

function goLogin() {
  router.push('/login')
}

async function exportPdf() {
  if (!pdfRoot.value || !parsedRecord.value) return
  exporting.value = true
  exportError.value = ''
  try {
    const { exportElementAsPdf } = await import('../utils/pdf')
    const diagnosis = (parsedRecord.value.diagnosis as string) || '病历摘要'
    await exportElementAsPdf(pdfRoot.value, `病历摘要-${diagnosis}`)
  } catch (err: any) {
    exportError.value = err?.message || 'PDF 生成失败，请重试'
  } finally {
    exporting.value = false
  }
}

onMounted(loadSamples)
</script>

<style scoped>
.demo-view {
  padding-bottom: 24px;
}

.intro-card {
  background: linear-gradient(135deg, #eff6ff, #f0fdf4);
  border: none;
}

.badge {
  display: inline-block;
  font-size: 0.72rem;
  background: #1e40af;
  color: #fff;
  padding: 3px 10px;
  border-radius: 999px;
  letter-spacing: 0.02em;
}

.sample-card {
  display: grid;
  grid-template-columns: 96px 1fr;
  gap: 12px;
  align-items: center;
  cursor: pointer;
  transition: transform 120ms ease, box-shadow 120ms ease;
}

.sample-card:hover,
.sample-card:active {
  transform: translateY(-1px);
  box-shadow: 0 6px 18px rgba(30, 64, 175, 0.08);
}

.sample-media {
  width: 96px;
  height: 96px;
  border-radius: 10px;
  overflow: hidden;
  background: #f3f4f6;
  flex-shrink: 0;
}

.sample-media img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.sample-body {
  min-width: 0;
}

.sample-meta {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  font-size: 0.78rem;
  color: #6b7280;
}

.meta-tag {
  background: #eff6ff;
  color: #1e40af;
  padding: 1px 8px;
  border-radius: 6px;
}

.sample-cta {
  grid-column: 1 / -1;
  text-align: right;
  color: #2563eb;
  font-size: 0.85rem;
  font-weight: 500;
}

.preview-image {
  width: 100%;
  border-radius: 10px;
  overflow: hidden;
  background: #f3f4f6;
  max-height: 460px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.preview-image img {
  width: 100%;
  height: auto;
  display: block;
  max-height: 460px;
  object-fit: contain;
}

.pdf-root {
  background: #fff;
}

.match-card {
  display: grid;
  gap: 6px;
}

.match-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.score-badge {
  font-size: 0.9rem;
  font-weight: 600;
  padding: 4px 10px;
  border-radius: 8px;
}

.score-badge.score-high {
  background: #dcfce7;
  color: #166534;
}

.score-badge.score-mid {
  background: #fef3c7;
  color: #92400e;
}

.score-badge.score-low {
  background: #fee2e2;
  color: #991b1b;
}

.status-pill {
  font-size: 0.75rem;
  padding: 2px 10px;
  border-radius: 999px;
  background: #eff6ff;
  color: #1e40af;
}

.match-name {
  margin: 2px 0 0;
  font-size: 0.95rem;
  color: #1f2937;
  line-height: 1.45;
}

.match-meta {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  font-size: 0.82rem;
  color: #4b5563;
}

.reason-list {
  margin: 6px 0 0;
  padding-left: 18px;
  font-size: 0.82rem;
  color: #374151;
  line-height: 1.55;
}

.demo-cta {
  background: linear-gradient(135deg, #fff7ed, #fffbeb);
  border-color: #fde68a;
}

.pulse-dot {
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: #3b82f6;
  margin: 0 auto;
  animation: pulse-dot 1.2s ease-in-out infinite;
}

@keyframes pulse-dot {
  0%, 100% { opacity: 0.4; transform: scale(0.9); }
  50% { opacity: 1; transform: scale(1.1); }
}
</style>
