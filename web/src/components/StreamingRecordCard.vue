<template>
  <div class="streaming-card">
    <!-- 阶段指示器 -->
    <div class="stage-strip" role="status" :aria-label="`当前阶段：${currentStageLabel}`">
      <div
        v-for="step in stageSteps"
        :key="step.key"
        class="stage-step"
        :class="{
          'is-active': step.key === activeStep,
          'is-done': step.done,
          'is-error': errorStage
        }"
      >
        <span class="stage-dot"></span>
        <span class="stage-label">{{ step.label }}</span>
      </div>
    </div>

    <!-- 错误态 -->
    <div v-if="errorStage" class="stream-error">
      ⚠️ 解析失败：{{ errorMsg || '未知错误' }}
    </div>

    <!-- 原文识别（折叠区） -->
    <details v-if="rawText" class="raw-text-block">
      <summary>📄 已识别原文 ({{ rawText.length }} 字)</summary>
      <pre class="raw-text-pre">{{ rawText }}</pre>
    </details>

    <!-- 4 组：basic / diagnosis / treatment / timeline，各自 skeleton 或实体 -->
    <section
      v-for="group in groups"
      :key="group.name"
      class="group-section"
      :class="{ 'is-filled': isGroupFilled(group.name), 'is-loading': !isGroupFilled(group.name) }"
    >
      <header class="group-header">
        <span class="group-emoji">{{ group.emoji }}</span>
        <span class="group-title">{{ group.label }}</span>
        <span v-if="!isGroupFilled(group.name)" class="group-spinner"></span>
        <span v-else class="group-done">✓</span>
      </header>

      <!-- 基本信息 -->
      <div v-if="group.name === 'basic'" class="group-body">
        <template v-if="!isGroupFilled('basic')">
          <div class="skeleton-row" v-for="i in 3" :key="`sk-b-${i}`"></div>
        </template>
        <template v-else>
          <div class="kv-grid">
            <div v-if="record.age != null" class="kv"><span>年龄</span><b>{{ record.age }} 岁</b></div>
            <div v-if="record.sex" class="kv"><span>性别</span><b>{{ record.sex }}</b></div>
            <div v-if="record.weight != null" class="kv"><span>体重</span><b>{{ record.weight }} kg</b></div>
            <div v-if="record.height != null" class="kv"><span>身高</span><b>{{ record.height }} cm</b></div>
            <div v-if="record.ecog != null" class="kv"><span>ECOG</span><b>{{ record.ecog }}</b></div>
            <div v-if="record.hospital" class="kv"><span>医院</span><b>{{ record.hospital }}</b></div>
          </div>
          <div v-if="!hasAnyBasicValue" class="empty-hint">未识别到基本信息</div>
        </template>
      </div>

      <!-- 诊断 -->
      <div v-if="group.name === 'diagnosis'" class="group-body">
        <template v-if="!isGroupFilled('diagnosis')">
          <div class="skeleton-row tall"></div>
          <div class="skeleton-row" v-for="i in 2" :key="`sk-d-${i}`"></div>
        </template>
        <template v-else>
          <div v-if="record.diagnosis" class="diagnosis-hero">
            <div class="hero-label">诊断</div>
            <div class="hero-value">{{ record.diagnosis }}</div>
            <div class="hero-tags">
              <span v-if="record.stage" class="hero-tag stage">{{ record.stage }}</span>
              <span v-if="record.tnmStage" class="hero-tag stage">{{ record.tnmStage }}</span>
              <span v-if="record.pathologyType" class="hero-tag">{{ record.pathologyType }}</span>
            </div>
          </div>
          <div class="kv-grid mt8">
            <div v-if="record.geneMutation" class="kv kv-gene"><span>🧬 基因突变</span><b>{{ record.geneMutation }}</b></div>
            <div v-if="record.pdl1" class="kv"><span>🔬 PD-L1</span><b>{{ record.pdl1 }}</b></div>
            <div v-if="metastasisSites.length" class="kv"><span>🩸 转移部位</span><b>{{ metastasisSites.join('、') }}</b></div>
          </div>
          <div v-if="!record.diagnosis && !record.geneMutation && !record.pdl1 && !metastasisSites.length" class="empty-hint">
            未识别到诊断相关信息
          </div>
        </template>
      </div>

      <!-- 治疗 -->
      <div v-if="group.name === 'treatment'" class="group-body">
        <template v-if="!isGroupFilled('treatment')">
          <div class="skeleton-row" v-for="i in 3" :key="`sk-t-${i}`"></div>
        </template>
        <template v-else>
          <div v-if="record.treatment" class="kv">
            <span>💊 既往治疗
              <span v-if="record.treatmentLine != null" class="line-badge">第{{ record.treatmentLine }}线</span>
            </span>
            <b>{{ record.treatment }}</b>
          </div>
          <ul v-if="treatmentHistory.length" class="th-list">
            <li v-for="(t, i) in treatmentHistory" :key="`th-${i}`">
              <div class="th-name">{{ t.name }}</div>
              <div class="th-meta">
                <span v-if="t.startDate || t.endDate">{{ t.startDate || '?' }} ~ {{ t.endDate || '至今' }}</span>
                <span v-if="t.response" class="th-response">{{ t.response }}</span>
              </div>
            </li>
          </ul>
          <div v-if="priorTherapies.length" class="kv mt8">
            <span>既往方案</span><b>{{ priorTherapies.join('、') }}</b>
          </div>
          <div v-if="!record.treatment && !treatmentHistory.length && !priorTherapies.length" class="empty-hint">
            未识别到治疗记录
          </div>
        </template>
      </div>

      <!-- 时间线 -->
      <div v-if="group.name === 'timeline'" class="group-body">
        <template v-if="!isGroupFilled('timeline')">
          <div class="skeleton-row" v-for="i in 3" :key="`sk-tl-${i}`"></div>
        </template>
        <template v-else>
          <div v-if="record.diagnosisDate" class="kv">
            <span>📅 初诊</span><b>{{ record.diagnosisDate }}</b>
          </div>
          <ul v-if="timeline.length" class="timeline">
            <li v-for="(t, i) in timeline" :key="`tl-${i}`" class="timeline-item">
              <div class="tl-dot"></div>
              <div class="tl-body">
                <div class="tl-date">{{ t.date }}</div>
                <div class="tl-event">{{ t.event }}</div>
              </div>
            </li>
          </ul>
          <ul v-if="surgicalHistory.length" class="th-list mt8">
            <li v-for="(s, i) in surgicalHistory" :key="`sh-${i}`">
              <div class="th-name">🔪 {{ s.name }}</div>
              <div class="th-meta"><span v-if="s.date">{{ s.date }}</span></div>
            </li>
          </ul>
          <div v-if="!record.diagnosisDate && !timeline.length && !surgicalHistory.length" class="empty-hint">
            未识别到病程时间线
          </div>
        </template>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'

type GroupName = 'basic' | 'diagnosis' | 'treatment' | 'timeline'
type StageName = 'received' | 'preprocess' | 'ocr_text' | 'field_group' | 'completed' | 'error'

interface TimelineEntry { date: string; event: string }
interface SurgeryEntry { name: string; date?: string }
interface TreatmentHistoryEntry { name: string; startDate?: string; endDate?: string; response?: string }

interface PartialRecord {
  age?: number | null
  sex?: string | null
  weight?: number | null
  height?: number | null
  ecog?: number | null
  hospital?: string | null
  diagnosis?: string | null
  stage?: string | null
  tnmStage?: string | null
  pathologyType?: string | null
  geneMutation?: string | null
  pdl1?: string | null
  metastasisSites?: string[]
  treatment?: string | null
  treatmentLine?: number | string | null
  priorTherapies?: string[]
  treatmentHistory?: TreatmentHistoryEntry[]
  timeline?: TimelineEntry[]
  diagnosisDate?: string | null
  surgicalHistory?: SurgeryEntry[]
  [k: string]: unknown
}

const props = withDefaults(defineProps<{
  record: PartialRecord
  filledGroups: GroupName[]
  rawText?: string | null
  stage?: StageName | null
  errorMsg?: string | null
  // PRD-2026Q4：父组件用 axios onUploadProgress 推上来的上传百分比（0-100）。
  // 仅当 stage 还在 received/preprocess 时显示——之后被取文/提取阶段替代。
  uploadPercent?: number
}>(), {
  rawText: '',
  stage: 'received',
  errorMsg: '',
  uploadPercent: 0
})

const groups: { name: GroupName; label: string; emoji: string }[] = [
  { name: 'basic', label: '基本信息', emoji: '🪪' },
  { name: 'diagnosis', label: '诊断', emoji: '🩺' },
  { name: 'treatment', label: '治疗', emoji: '💊' },
  { name: 'timeline', label: '病程时间线', emoji: '🗓️' }
]

const isGroupFilled = (name: GroupName) => props.filledGroups.includes(name)

// 阶段指示器：上传 → 取文 → 提取 → 完成
const stageSteps = computed(() => {
  const s = props.stage || 'received'
  const order: StageName[] = ['received', 'preprocess', 'ocr_text', 'field_group', 'completed']
  const idx = order.indexOf(s as StageName)
  // 把 received/preprocess 折叠成"准备"，让用户只看到 4 圈
  const labels = [
    { key: 'prepare',  label: '准备', minIdx: 0 },
    { key: 'ocr',      label: '取文', minIdx: 2 },
    { key: 'extract',  label: '提取', minIdx: 3 },
    { key: 'done',     label: '完成', minIdx: 4 }
  ]
  return labels.map((step) => {
    // 准备阶段叠加上传百分比：仅在 stage ∈ received/preprocess 且 percent > 0 时显示，
    // 一旦进入 ocr_text 阶段（idx >= 2）就回到纯文字 "准备"，避免数字滞留误导。
    let label = step.label
    if (
      step.key === 'prepare' &&
      idx < 2 &&
      props.uploadPercent > 0 &&
      props.uploadPercent < 100
    ) {
      label = `上传 ${props.uploadPercent}%`
    }
    return {
      ...step,
      label,
      done: idx >= step.minIdx + 1 || (step.key === 'done' && s === 'completed')
    }
  })
})

const activeStep = computed(() => {
  const s = props.stage || 'received'
  if (s === 'completed') return 'done'
  if (s === 'field_group') return 'extract'
  if (s === 'ocr_text') return 'ocr'
  return 'prepare'
})

const currentStageLabel = computed(() => {
  const s = props.stage || 'received'
  if (s === 'completed') return '已完成'
  if (s === 'error') return '失败'
  if (s === 'field_group') return '正在提取病例字段'
  if (s === 'ocr_text') return '正在识别原文'
  return '正在准备'
})

const errorStage = computed(() => props.stage === 'error')

const metastasisSites = computed(() => Array.isArray(props.record.metastasisSites) ? props.record.metastasisSites : [])
const treatmentHistory = computed(() => Array.isArray(props.record.treatmentHistory) ? props.record.treatmentHistory : [])
const priorTherapies = computed(() => Array.isArray(props.record.priorTherapies) ? props.record.priorTherapies : [])
const timeline = computed(() => Array.isArray(props.record.timeline) ? props.record.timeline : [])
const surgicalHistory = computed(() => Array.isArray(props.record.surgicalHistory) ? props.record.surgicalHistory : [])

const hasAnyBasicValue = computed(() => {
  const r = props.record
  return r.age != null || r.sex || r.weight != null || r.height != null || r.ecog != null || r.hospital
})
</script>

<style scoped>
.streaming-card {
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

/* 阶段条 */
.stage-strip {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 8px 4px;
  background: linear-gradient(135deg, #eff6ff, #f0f9ff);
  border-radius: 10px;
}
.stage-step {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 0.78rem;
  color: #6b7280;
  position: relative;
}
.stage-step:not(:last-child)::after {
  content: '';
  position: absolute;
  right: -4px;
  top: 50%;
  transform: translateY(-50%);
  width: 12px;
  height: 1px;
  background: #cbd5e1;
}
.stage-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: #cbd5e1;
  flex-shrink: 0;
}
.stage-step.is-done .stage-dot { background: #10b981; }
.stage-step.is-active .stage-dot {
  background: #2563eb;
  box-shadow: 0 0 0 4px rgba(37, 99, 235, 0.18);
  animation: pulse 1.4s ease-in-out infinite;
}
.stage-step.is-error .stage-dot { background: #ef4444; }
.stage-step.is-active .stage-label { color: #1f2937; font-weight: 600; }
@keyframes pulse {
  0%, 100% { box-shadow: 0 0 0 4px rgba(37, 99, 235, 0.18); }
  50%      { box-shadow: 0 0 0 8px rgba(37, 99, 235, 0.05); }
}

.stream-error {
  background: #fef2f2;
  border: 1px solid #fecaca;
  color: #991b1b;
  padding: 10px 12px;
  border-radius: 8px;
  font-size: 0.85rem;
}

/* 原文折叠区 */
.raw-text-block {
  background: #f9fafb;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  padding: 8px 12px;
  font-size: 0.82rem;
  color: #374151;
}
.raw-text-block summary {
  cursor: pointer;
  font-weight: 500;
  color: #4b5563;
}
.raw-text-pre {
  margin: 8px 0 0;
  padding: 8px;
  background: #fff;
  border-radius: 6px;
  white-space: pre-wrap;
  word-break: break-word;
  max-height: 300px;
  overflow: auto;
  font-size: 0.78rem;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
}

/* group section */
.group-section {
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  background: #fff;
  overflow: hidden;
  transition: opacity .2s ease;
}
.group-section.is-loading { opacity: 0.85; }
.group-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  background: #f9fafb;
  border-bottom: 1px solid #f3f4f6;
}
.group-emoji { font-size: 1rem; }
.group-title { font-size: 0.92rem; font-weight: 600; color: #1f2937; flex: 1; }
.group-done { color: #10b981; font-size: 0.9rem; }

.group-spinner {
  width: 12px; height: 12px;
  border-radius: 50%;
  border: 2px solid #cbd5e1;
  border-top-color: #2563eb;
  animation: spin 0.9s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }

.group-body { padding: 12px; }

.skeleton-row {
  height: 12px;
  border-radius: 6px;
  background: linear-gradient(90deg, #f3f4f6 0%, #e5e7eb 50%, #f3f4f6 100%);
  background-size: 200% 100%;
  animation: shimmer 1.4s ease-in-out infinite;
  margin-bottom: 8px;
}
.skeleton-row.tall { height: 32px; }
.skeleton-row:last-child { margin-bottom: 0; }
@keyframes shimmer {
  0% { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}

/* kv grid */
.kv-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
  gap: 8px;
}
.kv {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 8px 10px;
  background: #f9fafb;
  border-radius: 6px;
  font-size: 0.85rem;
}
.kv span { color: #6b7280; font-size: 0.75rem; }
.kv b { color: #1f2937; font-weight: 500; word-break: break-word; }
.kv-gene b { color: #7c3aed; }

.line-badge {
  display: inline-block;
  margin-left: 6px;
  padding: 0 6px;
  background: #f3e8ff;
  color: #7c3aed;
  border-radius: 4px;
  font-size: 0.72rem;
}

.mt8 { margin-top: 8px; }

.empty-hint {
  font-size: 0.82rem;
  color: #9ca3af;
  font-style: italic;
}

/* diagnosis hero（缩小版） */
.diagnosis-hero {
  background: linear-gradient(135deg, #eff6ff, #f0f9ff);
  border-radius: 8px;
  padding: 10px 12px;
}
.hero-label { font-size: 0.72rem; color: #6b7280; }
.hero-value { font-size: 1.05rem; font-weight: 600; color: #1e40af; }
.hero-tags { display: flex; gap: 6px; margin-top: 6px; flex-wrap: wrap; }
.hero-tag {
  padding: 2px 8px;
  border-radius: 6px;
  font-size: 0.72rem;
  background: #dbeafe;
  color: #1e40af;
}
.hero-tag.stage { background: #fef3c7; color: #92400e; }

/* 治疗史 / 时间线复用 list */
.th-list { list-style: none; padding: 0; margin: 8px 0 0; }
.th-list li {
  padding: 8px 10px;
  margin-bottom: 6px;
  background: #f9fafb;
  border-radius: 6px;
  font-size: 0.85rem;
}
.th-list li:last-child { margin-bottom: 0; }
.th-name { font-weight: 600; color: #1f2937; }
.th-meta { font-size: 0.75rem; color: #6b7280; display: flex; gap: 8px; flex-wrap: wrap; margin-top: 2px; }
.th-response { color: #b45309; }

.timeline { list-style: none; padding: 0; margin: 8px 0 0; }
.timeline-item {
  position: relative;
  padding: 6px 0 6px 16px;
  border-left: 2px solid #e5e7eb;
}
.tl-dot {
  position: absolute;
  left: -6px;
  top: 10px;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: #93c5fd;
}
.tl-date { font-size: 0.75rem; color: #6b7280; }
.tl-event { font-size: 0.85rem; color: #1f2937; line-height: 1.45; }
</style>
