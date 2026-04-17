<template>
  <div class="demo-progress">
    <div class="pulse-ring"></div>
    <h3 class="stage-title">{{ currentStage.title }}</h3>
    <p class="stage-desc">{{ currentStage.desc }}</p>

    <div class="progress-track">
      <div class="progress-fill" :style="{ width: percent + '%' }"></div>
    </div>
    <div class="progress-meta">
      <span>{{ percent }}%</span>
      <span>约需 {{ Math.max(0, Math.ceil((durationMs - elapsed) / 1000)) }}s</span>
    </div>

    <ul class="stage-list">
      <li
        v-for="(s, i) in stages"
        :key="i"
        :class="{ done: i < stageIndex, active: i === stageIndex }"
      >
        <span class="dot"></span>
        <span class="label">{{ s.label }}</span>
      </li>
    </ul>
  </div>
</template>

<script setup lang="ts">
/**
 * DemoProgress — 30 秒分阶段进度动画（演示专用）
 *
 * 四段：
 *   0  – 2s   上传中…         0 → 30%
 *   2  – 17s  OCR 识别中…     30 → 60%
 *   17 – 27s  结构化提取中…   60 → 90%
 *   27 – 30s  完成            90 → 100%
 *
 * 用 requestAnimationFrame 驱动；到达 100% 时 emit('done')。
 * 父组件可在 2s 标记处（stage 切换）预取真实数据，保证 30s 到时无感衔接。
 */
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'

const props = withDefaults(
  defineProps<{
    /** 总时长（ms），默认 30000 */
    durationMs?: number
    /** 是否立即开始，默认 true */
    autoStart?: boolean
  }>(),
  { durationMs: 30000, autoStart: true }
)

const emit = defineEmits<{
  (e: 'stage', index: number, key: string): void
  (e: 'progress', percent: number): void
  (e: 'done'): void
}>()

interface Stage {
  key: string
  label: string
  title: string
  desc: string
  startMs: number
  endMs: number
  startPct: number
  endPct: number
}

const stages: Stage[] = [
  {
    key: 'upload',
    label: '上传文件',
    title: '上传中…',
    desc: '正在安全上传脱敏病历样本',
    startMs: 0,
    endMs: 2000,
    startPct: 0,
    endPct: 30
  },
  {
    key: 'ocr',
    label: 'OCR 识别',
    title: 'OCR 识别中…',
    desc: '正在识别图像中的文字，并还原段落结构',
    startMs: 2000,
    endMs: 17000,
    startPct: 30,
    endPct: 60
  },
  {
    key: 'structured',
    label: '结构化提取',
    title: '结构化提取中…',
    desc: '从文本中抽取诊断、分期、基因突变、治疗史等关键字段',
    startMs: 17000,
    endMs: 27000,
    startPct: 60,
    endPct: 90
  },
  {
    key: 'done',
    label: '完成',
    title: '整理结果中…',
    desc: '生成可下载的结构化病历',
    startMs: 27000,
    endMs: 30000,
    startPct: 90,
    endPct: 100
  }
]

const elapsed = ref(0)
const rafId = ref<number | null>(null)
const startedAt = ref(0)
const lastEmittedStage = ref(-1)

const percent = computed(() => {
  const p = progressAt(elapsed.value)
  return Math.min(100, Math.round(p))
})

const stageIndex = computed(() => {
  for (let i = 0; i < stages.length; i++) {
    if (elapsed.value < stages[i].endMs) return i
  }
  return stages.length - 1
})

const currentStage = computed(() => stages[stageIndex.value])

function progressAt(ms: number): number {
  for (const s of stages) {
    if (ms <= s.endMs) {
      const ratio = (ms - s.startMs) / Math.max(1, s.endMs - s.startMs)
      return s.startPct + Math.max(0, Math.min(1, ratio)) * (s.endPct - s.startPct)
    }
  }
  return 100
}

function tick(now: number) {
  if (!startedAt.value) startedAt.value = now
  const e = Math.min(props.durationMs, now - startedAt.value)
  elapsed.value = e

  const idx = stageIndex.value
  if (idx !== lastEmittedStage.value) {
    lastEmittedStage.value = idx
    emit('stage', idx, stages[idx].key)
  }
  emit('progress', percent.value)

  if (e >= props.durationMs) {
    emit('done')
    return
  }
  rafId.value = requestAnimationFrame(tick)
}

function start() {
  startedAt.value = 0
  elapsed.value = 0
  lastEmittedStage.value = -1
  rafId.value = requestAnimationFrame(tick)
}

function stop() {
  if (rafId.value != null) {
    cancelAnimationFrame(rafId.value)
    rafId.value = null
  }
}

onMounted(() => {
  if (props.autoStart) start()
})
onBeforeUnmount(stop)

defineExpose({ start, stop })
</script>

<style scoped>
.demo-progress {
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  padding: 28px 20px 20px;
  text-align: center;
}

.pulse-ring {
  width: 64px;
  height: 64px;
  border-radius: 50%;
  margin: 0 auto 16px;
  background: radial-gradient(circle, #dbeafe 0%, #eff6ff 70%, #fff 100%);
  position: relative;
  box-shadow: 0 0 0 0 rgba(37, 99, 235, 0.4);
  animation: pulse 1.6s ease-out infinite;
}

@keyframes pulse {
  0% { box-shadow: 0 0 0 0 rgba(37, 99, 235, 0.4); }
  70% { box-shadow: 0 0 0 18px rgba(37, 99, 235, 0); }
  100% { box-shadow: 0 0 0 0 rgba(37, 99, 235, 0); }
}

.stage-title {
  margin: 0 0 6px;
  font-size: 1.1rem;
  color: #1e40af;
}

.stage-desc {
  margin: 0 0 18px;
  font-size: 0.88rem;
  color: #4b5563;
  line-height: 1.5;
}

.progress-track {
  height: 8px;
  background: #f3f4f6;
  border-radius: 999px;
  overflow: hidden;
  margin-bottom: 6px;
}

.progress-fill {
  height: 100%;
  background: linear-gradient(90deg, #3b82f6, #22c55e);
  transition: width 200ms linear;
}

.progress-meta {
  display: flex;
  justify-content: space-between;
  font-size: 0.78rem;
  color: #6b7280;
  margin-bottom: 20px;
}

.stage-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: grid;
  gap: 10px;
  text-align: left;
}

.stage-list li {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 0.85rem;
  color: #9ca3af;
  padding: 6px 10px;
  border-radius: 8px;
  background: #f9fafb;
}

.stage-list li.active {
  background: #eff6ff;
  color: #1e40af;
  font-weight: 500;
}

.stage-list li.done {
  color: #166534;
}

.stage-list li.done .dot {
  background: #22c55e;
}

.stage-list li.active .dot {
  background: #3b82f6;
  box-shadow: 0 0 0 4px #dbeafe;
}

.dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: #d1d5db;
  flex-shrink: 0;
}
</style>
