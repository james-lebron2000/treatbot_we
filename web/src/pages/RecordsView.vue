<template>
  <!--
    PRD-2026Q2 §3.5：多病历管理页。
    - 列表展示每条病历：type / 诊断 / 状态 / 上传时间 / active 高亮 / 切换 / 删除。
    - 空态引导到 /upload。
    - 顶部「当前病历」徽标方便用户确认此刻匹配基于哪份病历。
    样式沿用 UploadView / MatchesView：.grid / .card / .btn primary / .muted。
  -->
  <section class="stack records-view">
    <div class="card active-banner">
      <div class="active-banner__text">
        <p class="active-banner__label">当前病历</p>
        <h3 class="active-banner__value">
          {{ activeLabel }}
        </h3>
      </div>
      <router-link to="/upload" class="btn ghost active-banner__cta">上传新病历</router-link>
    </div>

    <div v-if="loading" class="card state-card">
      <span class="muted">正在加载您的病历…</span>
    </div>

    <div v-else-if="error" class="card state-card state-card--error">
      <p class="state-card__error-text">{{ error }}</p>
      <button class="btn ghost" @click="refresh">再试一次</button>
    </div>

    <div v-else-if="!records.length" class="card state-card empty-state">
      <div class="empty-state__icon" aria-hidden="true">📄</div>
      <p class="empty-state__title">还没有病历 —— 上传一份开始吧</p>
      <p class="muted empty-state__hint">图片或 PDF 都行，几分钟帮您看懂关键信息。</p>
      <router-link to="/upload" class="btn primary empty-state__cta">去上传 →</router-link>
    </div>

    <template v-else>
      <p class="muted records-count">共 {{ records.length }} 份病历 · 匹配将基于当前选中的那一份</p>

      <div class="responsive-grid records-grid">
        <div
          v-for="record in records"
          :key="record.id"
          class="card record-card"
          :class="{ 'record-active': record.id === activeRecordId }"
        >
          <div class="record-card__head">
            <div class="record-card__title-wrap">
              <h3 class="record-card__title">
                {{ record.diagnosis || '未识别诊断' }}
                <span v-if="record.id === activeRecordId" class="badge badge--active">当前</span>
              </h3>
              <p class="muted record-card__meta">
                {{ record.type || '病历' }} · 上传于 {{ formatTime(record.uploadTime) }}
              </p>
            </div>
            <span class="status-pill" :class="`status-pill--${statusKind(record.status)}`">
              <span class="status-pill__icon" aria-hidden="true">{{ statusIcon(record.status) }}</span>
              {{ record.statusText || statusText(record.status) }}
            </span>
          </div>

          <p v-if="record.matchCount && record.matchCount > 0" class="muted record-card__matches">
            有 {{ record.matchCount }} 个可能的试验
          </p>

          <div class="record-card__actions">
            <button
              class="btn ghost record-card__action"
              :disabled="record.id === activeRecordId"
              @click="onSetActive(record.id)"
            >
              {{ record.id === activeRecordId ? '使用中' : '设为当前' }}
            </button>
            <button
              class="btn record-card__action record-card__action--delete"
              :disabled="deletingId === record.id"
              @click="onDelete(record)"
            >
              {{ deletingId === record.id ? '正在删除…' : '删除' }}
            </button>
          </div>
        </div>
      </div>
    </template>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { useRouter } from 'vue-router'
import { usePatientStore } from '../stores/patient'
import { useConfirm } from '../composables/useDialog'
import { useToast } from '../composables/useToast'

const router = useRouter()
const patientStore = usePatientStore()
const { records, activeRecordId, loading } = storeToRefs(patientStore)
const confirm = useConfirm()
const toast = useToast()

const error = ref('')
const deletingId = ref<string | null>(null)

const activeLabel = computed(() => {
  const active = records.value.find((r) => r.id === activeRecordId.value)
  if (!active) return '未选择（上传或选一份病历）'
  return active.diagnosis || active.type || active.id
})

const formatTime = (value?: string) => {
  if (!value) return '时间未知'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return value
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

const statusText = (status?: string) => {
  if (status === 'completed') return '已解析'
  if (status === 'error') return '解析失败'
  if (status === 'running') return '解析中'
  return '待解析'
}

// 纯映射：状态 → scoped class 后缀（颜色由 token 在 <style> 内定义，不再内联 hex）
const statusKind = (status?: string) => {
  if (status === 'completed') return 'completed'
  if (status === 'error') return 'error'
  if (status === 'running') return 'running'
  return 'pending'
}

// 纯映射：状态 → 图标，避免「仅靠颜色」传达状态（a11y）
const statusIcon = (status?: string) => {
  if (status === 'completed') return '✓'
  if (status === 'error') return '✕'
  if (status === 'running') return '⏳'
  return '•'
}

const refresh = async () => {
  error.value = ''
  try {
    await patientStore.loadRecords()
  } catch {
    error.value = '加载病历时遇到小问题，稍后再试？'
  }
}

const onSetActive = (id: string) => {
  patientStore.setActive(id)
}

const onDelete = async (record: { id: string; diagnosis?: string }) => {
  const label = record.diagnosis || '这份病历'
  const ok = await confirm({
    title: `确定删除「${label}」？`,
    description: '删除后无法恢复。',
    confirmText: '删除',
    cancelText: '取消',
    danger: true,
  })
  if (!ok) return
  deletingId.value = record.id
  try {
    await patientStore.softDelete(record.id)
    toast.success('已删除该病历')
  } catch (err: any) {
    toast.error(err?.response?.data?.message || '删除时遇到小问题，稍后再试？')
  } finally {
    deletingId.value = null
  }
}

onMounted(() => {
  refresh()
})

// 导出 router 供模板内按需调用（留占位；不直接使用以避免未使用告警）
void router
</script>

<style scoped>
.records-view {
  gap: var(--s-3);
}

/* 当前病历横幅 */
.active-banner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--s-3);
  border: none;
  background: linear-gradient(135deg, var(--bg-soft), var(--bg-mint));
}

.active-banner__text {
  flex: 1;
  min-width: 0;
}

.active-banner__label {
  margin: 0;
  font-size: var(--fs-caption);
  color: var(--text-dim);
}

.active-banner__value {
  margin: var(--s-1) 0 0;
  font-size: var(--fs-subtitle);
  font-weight: 600;
  color: var(--brand-hover);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.active-banner__cta {
  white-space: nowrap;
  flex-shrink: 0;
}

/* 加载 / 错误 / 空态共用卡片 */
.state-card {
  text-align: center;
  padding: var(--s-6) var(--s-4);
}

.state-card--error {
  background: var(--red-soft);
  border-color: var(--red);
}

.state-card__error-text {
  margin: 0 0 var(--s-2);
  color: var(--red-text);
}

/* 空态 */
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--s-2);
}

.empty-state__icon {
  font-size: var(--fs-display);
  line-height: 1;
  margin-bottom: var(--s-1);
}

.empty-state__title {
  margin: 0;
  font-size: var(--fs-subtitle);
  font-weight: 600;
  color: var(--text);
}

.empty-state__hint {
  font-size: var(--fs-callout);
  margin: 0;
}

.empty-state__cta {
  margin-top: var(--s-2);
}

/* 列表 */
.records-count {
  margin: 0;
  font-size: var(--fs-callout);
}

.records-grid {
  /* 单列起步；宽屏由 .responsive-grid 自动多列 */
  margin: 0;
}

/* 病历卡片 */
.record-card {
  display: flex;
  flex-direction: column;
  gap: var(--s-2);
  margin-bottom: 0;
}

.record-active {
  border-color: var(--brand);
  background: var(--bg-soft);
  box-shadow: var(--shadow-1);
}

.record-card__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--s-2);
}

.record-card__title-wrap {
  flex: 1;
  min-width: 0;
}

.record-card__title {
  margin: 0;
  font-size: var(--fs-body);
  font-weight: 600;
  line-height: var(--lh-tight);
  color: var(--text);
}

.badge--active {
  background: var(--mint-soft);
  color: var(--mint-text);
}

.record-card__meta {
  margin: var(--s-1) 0 0;
  font-size: var(--fs-caption);
}

.record-card__matches {
  margin: 0;
  font-size: var(--fs-caption);
}

/* 状态指示：颜色 + 图标（不仅靠颜色传达状态，a11y） */
.status-pill {
  display: inline-flex;
  align-items: center;
  gap: var(--s-1);
  flex-shrink: 0;
  padding: 2px var(--s-2);
  border-radius: var(--r-pill);
  font-size: var(--fs-caption);
  font-weight: 500;
  white-space: nowrap;
}

.status-pill__icon {
  font-size: var(--fs-caption);
  line-height: 1;
}

.status-pill--completed { background: var(--mint-soft); color: var(--mint-text); }
.status-pill--error { background: var(--red-soft); color: var(--red-text); }
.status-pill--running { background: var(--amber-soft); color: var(--amber-text); }
.status-pill--pending { background: var(--brand-soft); color: var(--brand-hover); }

/* 操作按钮：等分铺满，触达 ≥44px（继承全站 .btn） */
.record-card__actions {
  display: flex;
  gap: var(--s-2);
  margin-top: var(--s-1);
}

.record-card__action {
  flex: 1;
}

/* 删除：用品牌红描边 + 浅红底，破坏性但不刺眼 */
.record-card__action--delete {
  background: var(--red-soft);
  color: var(--red-text);
}

.record-card__action--delete:hover:not(:disabled) {
  background: var(--red);
  color: #fff;
}

.record-card__action:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

/* 窄屏（≤380）横幅纵向堆叠，CTA 占满更易点 */
@media (max-width: 380px) {
  .active-banner {
    flex-direction: column;
    align-items: stretch;
  }

  .active-banner__cta {
    width: 100%;
  }
}
</style>
