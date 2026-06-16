<template>
  <section class="grid">
    <h2>正在联络的试验</h2>

    <!-- 状态筛选标签 -->
    <div class="filter-tabs">
      <button
        v-for="tab in tabs" :key="tab.value"
        :class="['tab-btn', { active: activeTab === tab.value }]"
        @click="switchTab(tab.value)"
      >
        {{ tab.label }}
        <span v-if="tab.value === '' && total > 0" class="tab-count">{{ total }}</span>
      </button>
    </div>

    <div class="card" v-if="loading">马上好…</div>
    <div class="card" v-else-if="error">{{ error }}</div>

    <!-- 空状态 -->
    <div class="card empty-state" v-else-if="filteredList.length === 0">
      <div class="empty-state__icon" aria-hidden="true">📋</div>
      <p v-if="activeTab" class="empty-state__title">
        这里还没有{{ tabs.find(t => t.value === activeTab)?.label }}的记录
      </p>
      <template v-else>
        <p class="empty-state__title">您还没有提交过申请。</p>
        <p class="empty-state__hint">不着急，等您看好试验再说，随时都可以。</p>
      </template>
      <div class="empty-state__actions">
        <router-link to="/matches" class="btn primary">去看看为家人找到的可能性 →</router-link>
      </div>
    </div>

    <template v-else>
      <!-- 申请卡片列表 -->
      <div class="app-grid">
      <div class="app-card card" v-for="app in filteredList" :key="app.id">
        <!-- 顶部：试验名称 + 状态标签 -->
        <div class="app-header">
          <div class="app-info">
            <h3 class="app-title">
              <router-link :to="`/matches/${app.trialId}`">
                {{ app.trialName || '未知试验' }}
              </router-link>
            </h3>
            <div class="app-meta">
              <span>{{ formatTime(app.applyTime || app.createdAt) }}</span>
              <span v-if="app.institution" class="meta-sep">{{ app.institution }}</span>
            </div>
          </div>
          <span :class="['status-badge', `status-${app.status}`]">
            {{ app.statusText || statusLabel(app.status) }}
          </span>
        </div>

        <!-- 状态进度条 -->
        <div class="progress-bar" v-if="app.status !== 'cancelled'">
          <div v-for="(step, idx) in progressSteps" :key="step.key"
            :class="['progress-step', { done: isStepDone(app.status, idx), current: isStepCurrent(app.status, idx) }]">
            <div class="step-dot" aria-hidden="true">
              <span class="step-icon">{{ isStepDone(app.status, idx) ? '✓' : (isStepCurrent(app.status, idx) ? '●' : '○') }}</span>
            </div>
            <span class="step-label">{{ step.label }}</span>
          </div>
        </div>
        <!-- 取消态：占位状态条，保持卡片视觉/高度一致，不留空白 -->
        <div class="progress-bar progress-bar--cancelled" v-else aria-hidden="true">
          <span class="cancelled-rail__icon">✕</span>
          <span class="cancelled-rail__text">这条申请已停止</span>
        </div>

        <!-- 诊断信息 -->
        <div v-if="app.disease" class="app-disease">
          <span class="disease-tag">🏥 {{ app.disease }}</span>
        </div>

        <!-- 试验状态警告 -->
        <div v-if="app.trialStatus && app.trialStatus !== 'recruiting' && app.status !== 'cancelled'" class="trial-warning">
          小提示 · 该试验当前状态：{{ app.trialStatusText || app.trialStatus }}
        </div>

        <!-- 待联系（pending）状态 -->
        <div v-if="app.status === 'pending'" class="tip tip--pending">
          <p class="tip__text">
            ⏳ 已递交 —— 研究团队通常 1-3 个工作日内联系您。<br/>
            <span class="tip__sub">这段时间您不用做什么，有消息会短信通知。</span>
          </p>
        </div>

        <!-- 已联系状态下的联系信息提示 -->
        <div v-if="app.status === 'contacted'" class="tip tip--contacted">
          <p class="tip__text">
            📞 研究团队已联系过您。请留意后续电话、尽量接听 —— 他们会告诉您下一步怎么做。<br/>
            <span class="tip__sub">有问题随时问我们。</span>
          </p>
          <p v-if="app.contactPhone" class="tip__phone">
            联系电话：{{ app.contactPhone }}
          </p>
        </div>

        <!-- 已入组提示 -->
        <div v-if="app.status === 'enrolled'" class="tip tip--enrolled">
          <p class="tip__text">
            🌱 太好了，您成功入组。这是重要的一步。<br/>
            <span class="tip__sub">接下来的治疗细节请听主治医生安排，我们会把您的资料安全归档，随时可以找回。</span>
          </p>
        </div>

        <!-- 未通过说明 -->
        <div v-if="app.status === 'rejected'" class="tip tip--rejected">
          <p class="tip__text">
            这个试验和您当前情况不完全匹配 —— <strong>别担心</strong>，我们已经在找更合适的选择。
          </p>
        </div>

        <!-- 操作按钮 -->
        <div class="app-actions" v-if="canCancel(app.status)">
          <button @click="cancelApp(app.id)" :disabled="cancelling === app.id" class="cancel-btn">
            {{ cancelling === app.id ? '马上好…' : '先不参加了' }}
          </button>
          <span class="action-hint">研究团队通常 1-3 个工作日内联系您</span>
        </div>
      </div>
      </div>

      <!-- 分页：大触达目标的上一页 / 下一页 + 位置提示（取代细密页码） -->
      <div v-if="totalPages > 1" class="pager">
        <button class="btn ghost" :disabled="page <= 1" @click="goPage(page - 1)">上一页</button>
        <span class="muted pager__status">第 {{ page }} / {{ totalPages }} 页</span>
        <button class="btn ghost" :disabled="page >= totalPages" @click="goPage(page + 1)">下一页</button>
      </div>
    </template>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { api } from '../services/api'

const loading = ref(false)
const error = ref('')
const list = ref<Record<string, any>[]>([])
const page = ref(1)
const total = ref(0)
const pageSize = 20
const cancelling = ref('')
const activeTab = ref('')

// 筛选标签
const tabs = [
  { label: '全部', value: '' },
  { label: '等待联系', value: 'pending' },
  { label: '已联系上', value: 'contacted' },
  { label: '已入组', value: 'enrolled' },
  { label: '不参加了', value: 'cancelled' },
]

// 状态进度
const progressSteps = [
  { key: 'pending', label: '已提交' },
  { key: 'contacted', label: '已联系' },
  { key: 'enrolled', label: '已入组' },
]

const statusOrder = ['pending', 'contacted', 'enrolled']

const isStepDone = (status: string, stepIdx: number) => {
  const currentIdx = statusOrder.indexOf(status)
  return currentIdx > stepIdx
}

const isStepCurrent = (status: string, stepIdx: number) => {
  return statusOrder.indexOf(status) === stepIdx
}

const totalPages = computed(() => Math.max(1, Math.ceil(total.value / pageSize)))

const visiblePages = computed(() => {
  const pages: number[] = []
  const tp = totalPages.value
  const start = Math.max(1, page.value - 2)
  const end = Math.min(tp, page.value + 2)
  for (let i = start; i <= end; i++) pages.push(i)
  return pages
})

const filteredList = computed(() => {
  if (!activeTab.value) return list.value
  return list.value.filter(a => a.status === activeTab.value)
})

const statusLabels: Record<string, string> = {
  pending: '等待研究团队联系',
  contacted: '研究团队已联系',
  enrolled: '已成功入组',
  rejected: '这次不太合适',
  cancelled: '已取消',
}

const statusLabel = (s: string) => statusLabels[s] || s

const canCancel = (s: string) => s === 'pending' || s === 'contacted'

const formatTime = (t: string) => {
  if (!t) return ''
  try {
    const d = new Date(t)
    const now = new Date()
    const diff = now.getTime() - d.getTime()
    const days = Math.floor(diff / (1000 * 60 * 60 * 24))
    if (days === 0) return '今天'
    if (days === 1) return '昨天'
    if (days < 7) return `${days}天前`
    return d.toLocaleDateString('zh-CN')
  } catch {
    return t
  }
}

const loadList = async () => {
  loading.value = true
  error.value = ''
  try {
    const res = await api.getApplications(page.value, pageSize)
    const payload = res?.list || res?.items || (Array.isArray(res) ? res : [])
    list.value = payload
    total.value = res?.total || res?.pagination?.total || payload.length
  } catch {
    error.value = '加载时遇到小问题 —— 稍后再试一次？您的数据没丢。'
  } finally {
    loading.value = false
  }
}

const switchTab = (tab: string) => {
  activeTab.value = tab
}

const goPage = (p: number) => {
  if (p < 1 || p > totalPages.value) return
  page.value = p
  loadList()
}

const cancelApp = async (id: string) => {
  if (!confirm('确定先不参加这个试验了吗？以后想再报名需要重新提交。')) return
  cancelling.value = id
  try {
    await api.cancelApplication(id)
    const item = list.value.find((a) => a.id === id)
    if (item) {
      item.status = 'cancelled'
      item.statusText = '已取消'
    }
  } catch (e: any) {
    alert(e?.response?.data?.message || '取消时遇到小问题 —— 稍后再试一次？')
  } finally {
    cancelling.value = ''
  }
}

onMounted(loadList)
</script>

<style scoped>
/* ── 筛选标签 ───────────────────────────────────────────
   横向可滚动的状态筛选 chip；移动端可滑动，每个 chip ≥44px 触达高度。 */
.filter-tabs {
  display: flex;
  gap: var(--s-2);
  overflow-x: auto;
  padding-bottom: var(--s-1);
  -webkit-overflow-scrolling: touch;
}

.tab-btn {
  display: inline-flex;
  align-items: center;
  min-height: var(--size-tap);
  padding: var(--s-2) var(--s-4);
  border: 1px solid var(--line);
  border-radius: var(--r-pill);
  background: var(--bg);
  color: var(--text-dim);
  font-family: inherit;
  font-size: var(--fs-callout);
  cursor: pointer;
  white-space: nowrap;
  transition: background-color 150ms ease, color 150ms ease, border-color 150ms ease;
  -webkit-tap-highlight-color: transparent;
}

.tab-btn.active {
  background: var(--brand);
  color: #fff;
  border-color: var(--brand);
}

.tab-btn:focus-visible {
  outline: none;
  box-shadow: var(--shadow-focus);
}

.tab-count {
  display: inline-block;
  min-width: 18px;
  height: 18px;
  line-height: 18px;
  text-align: center;
  background: rgba(255, 255, 255, 0.3);
  border-radius: var(--r-pill);
  font-size: var(--fs-caption);
  margin-left: var(--s-1);
}

/* ── 空状态（GOAL 4）：友好图标 + 文案 + 去匹配 CTA ──── */
.empty-state {
  text-align: center;
  padding: var(--s-6) var(--s-4);
}

.empty-state__icon {
  font-size: 40px;
  line-height: 1;
  margin-bottom: var(--s-2);
}

.empty-state__title {
  color: var(--text-dim);
  margin: 0 0 var(--s-1);
  font-size: var(--fs-body);
}

.empty-state__hint {
  font-size: var(--fs-callout);
  color: var(--text-muted);
  margin: 0 0 var(--s-3);
  line-height: var(--lh-relaxed);
}

.empty-state__actions {
  display: flex;
  justify-content: center;
  flex-wrap: wrap;
  gap: var(--s-2);
  margin-top: var(--s-3);
}

/* ── 申请卡片网格（GOAL 1）：移动单列，≥768 多列自适应铺满 ── */
.app-grid {
  display: grid;
  gap: var(--s-3);
  grid-template-columns: 1fr;
}

@media (min-width: 768px) {
  .app-grid {
    grid-template-columns: repeat(auto-fit, minmax(min(100%, 340px), 1fr));
  }
}

/* flex 纵向布局，操作区锚定底部 (margin-top:auto) 保证同行卡片等高 */
.app-card {
  display: flex;
  flex-direction: column;
  gap: var(--s-2);
  margin-bottom: 0;
}

.app-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: var(--s-2);
}

.app-info {
  flex: 1;
  min-width: 0;
}

.app-title {
  margin: 0 0 var(--s-1);
  font-size: var(--fs-subtitle);
  line-height: var(--lh-tight);
}

.app-title a {
  color: inherit;
  text-decoration: none;
}

.app-title a:hover {
  color: var(--brand);
}

.app-meta {
  font-size: var(--fs-caption);
  color: var(--text-muted);
}

.meta-sep::before {
  content: '·';
  margin: 0 var(--s-1);
}

/* ── 状态标签 ───────────────────────────────────────────── */
.status-badge {
  padding: 3px var(--s-2);
  border-radius: var(--r-pill);
  font-size: var(--fs-caption);
  white-space: nowrap;
  font-weight: 500;
  flex-shrink: 0;
}

.status-pending { background: var(--amber-soft); color: var(--amber-text); }
.status-contacted { background: var(--brand-soft); color: var(--brand-hover); }
.status-enrolled { background: var(--mint-soft); color: var(--mint-text); }
.status-rejected { background: var(--red-soft); color: var(--red-text); }
.status-cancelled { background: var(--bg-soft); color: var(--text-muted); }

/* ── 进度时间线（GOAL 2）──────────────────────────────────
   token 驱动：完成=薄荷绿、当前=品牌蓝、未达=描边灰；
   圆点内嵌 ✓ / ● / ○ 图标，状态不仅靠颜色区分（a11y）。 */
.progress-bar {
  display: flex;
  justify-content: space-between;
  margin: var(--s-1) 0;
  position: relative;
}

.progress-bar::before {
  content: '';
  position: absolute;
  top: 9px;
  left: 10%;
  right: 10%;
  height: 2px;
  background: var(--line);
  z-index: 0;
}

.progress-step {
  display: flex;
  flex-direction: column;
  align-items: center;
  z-index: 1;
  flex: 1;
}

.step-dot {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: var(--bg);
  border: 2px solid var(--line);
  transition: background-color 0.3s ease, border-color 0.3s ease;
}

.step-icon {
  font-size: 11px;
  line-height: 1;
  color: var(--text-muted);
}

.progress-step.done .step-dot {
  background: var(--mint);
  border-color: var(--mint);
}

.progress-step.done .step-icon {
  color: #fff;
}

.progress-step.current .step-dot {
  background: var(--brand);
  border-color: var(--brand);
  box-shadow: var(--shadow-focus);
}

.progress-step.current .step-icon {
  color: #fff;
}

.step-label {
  font-size: var(--fs-caption);
  color: var(--text-muted);
  margin-top: var(--s-1);
}

.progress-step.done .step-label {
  color: var(--mint-text);
}

.progress-step.current .step-label {
  color: var(--brand);
  font-weight: 500;
}

/* 取消态占位条：与进度条等位，保持卡片高度一致、不留空白 */
.progress-bar--cancelled {
  justify-content: flex-start;
  align-items: center;
  gap: var(--s-2);
  padding: var(--s-2) var(--s-3);
  background: var(--bg-soft);
  border-radius: var(--r-sm);
}

.progress-bar--cancelled::before {
  content: none;
}

.cancelled-rail__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: var(--line);
  color: var(--text-muted);
  font-size: 11px;
  flex-shrink: 0;
}

.cancelled-rail__text {
  font-size: var(--fs-caption);
  color: var(--text-muted);
}

/* ── 诊断信息 ───────────────────────────────────────────── */
.app-disease {
  margin-top: 0;
}

.disease-tag {
  display: inline-block;
  padding: 2px var(--s-2);
  background: var(--bg-soft);
  color: var(--brand-hover);
  border-radius: var(--r-sm);
  font-size: var(--fs-caption);
}

/* ── 提示卡片（GOAL 2 配套，按状态着色，token 驱动）────── */
.trial-warning {
  padding: var(--s-2) var(--s-3);
  background: var(--amber-soft);
  border-radius: var(--r-sm);
  font-size: var(--fs-callout);
  color: var(--amber-text);
}

.tip {
  padding: var(--s-2) var(--s-3);
  border-radius: var(--r-sm);
}

.tip__text {
  margin: 0;
  font-size: var(--fs-callout);
  line-height: var(--lh-relaxed);
}

.tip__sub {
  opacity: 0.85;
}

.tip__phone {
  margin: var(--s-1) 0 0;
  font-size: var(--fs-caption);
  color: var(--brand-hover);
}

.tip--pending {
  background: var(--amber-soft);
  color: var(--amber-text);
}

.tip--contacted {
  background: var(--bg-soft);
  color: var(--brand-hover);
}

.tip--enrolled {
  background: var(--bg-mint);
  color: var(--mint-text);
}

.tip--rejected {
  background: var(--red-soft);
  color: var(--red-text);
}

/* ── 操作区 ─────────────────────────────────────────────
   锚定卡片底部以保证网格内同行等高。 */
.app-actions {
  margin-top: auto;
  padding-top: var(--s-1);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--s-2);
}

.cancel-btn {
  min-height: var(--size-tap);
  padding: var(--s-2) var(--s-4);
  font-family: inherit;
  font-size: var(--fs-callout);
  background: var(--bg);
  color: var(--red);
  border: 1px solid var(--red);
  border-radius: var(--r-pill);
  cursor: pointer;
  white-space: nowrap;
  transition: background-color 150ms ease;
  -webkit-tap-highlight-color: transparent;
}

.cancel-btn:hover:not(:disabled) {
  background: var(--red-soft);
}

.cancel-btn:focus-visible {
  outline: none;
  box-shadow: var(--shadow-focus);
}

.cancel-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.action-hint {
  font-size: var(--fs-caption);
  color: var(--text-muted);
  text-align: right;
}

/* ── 分页（GOAL 3）：大触达上一页 / 下一页 + 位置提示 ──── */
.pager {
  grid-column: 1 / -1;
  display: flex;
  justify-content: center;
  align-items: center;
  gap: var(--s-2);
  margin-top: var(--s-4);
}

.pager__status {
  font-size: var(--fs-callout);
}
</style>
