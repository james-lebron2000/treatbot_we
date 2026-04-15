<template>
  <section class="grid">
    <h2>我的申请</h2>

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

    <div class="card" v-if="loading">加载中...</div>
    <div class="card" v-else-if="error">{{ error }}</div>

    <!-- 空状态 -->
    <div class="card empty-state" v-else-if="filteredList.length === 0">
      <div style="font-size:2.5rem;margin-bottom:0.5rem;">📋</div>
      <p v-if="activeTab" style="color:#6b7280;margin:0 0 0.5rem;">
        没有{{ tabs.find(t => t.value === activeTab)?.label }}的申请
      </p>
      <p v-else style="color:#6b7280;margin:0 0 0.5rem;">暂无申请记录</p>
      <p style="margin:0;">
        <router-link to="/matches" class="link-btn">去匹配试验 →</router-link>
      </p>
    </div>

    <template v-else>
      <!-- 申请卡片列表 -->
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
            <div class="step-dot"></div>
            <span class="step-label">{{ step.label }}</span>
          </div>
        </div>

        <!-- 诊断信息 -->
        <div v-if="app.disease" class="app-disease">
          <span class="disease-tag">🏥 {{ app.disease }}</span>
        </div>

        <!-- 试验状态警告 -->
        <div v-if="app.trialStatus && app.trialStatus !== 'recruiting' && app.status !== 'cancelled'" class="trial-warning">
          ⚠️ 该试验当前状态：{{ app.trialStatusText || app.trialStatus }}
        </div>

        <!-- 已联系状态下的联系信息提示 -->
        <div v-if="app.status === 'contacted'" class="contact-tip">
          <p style="margin:0;font-size:0.88rem;">
            🔔 研究人员已与您取得联系，请留意来电并配合提供相关资料。
          </p>
          <p v-if="app.contactPhone" style="margin:4px 0 0;font-size:0.85rem;color:#1e40af;">
            联系电话：{{ app.contactPhone }}
          </p>
        </div>

        <!-- 已入组提示 -->
        <div v-if="app.status === 'enrolled'" class="enrolled-tip">
          <p style="margin:0;font-size:0.88rem;">
            🎉 恭喜！您已成功入组。请按照研究中心的要求按时参加随访。
          </p>
        </div>

        <!-- 未通过说明 -->
        <div v-if="app.status === 'rejected'" class="rejected-tip">
          <p style="margin:0;font-size:0.88rem;">
            此次筛选未通过，可能是因为不完全符合入排标准。您可以继续匹配其他合适的试验。
          </p>
        </div>

        <!-- 操作按钮 -->
        <div class="app-actions" v-if="canCancel(app.status)">
          <button @click="cancelApp(app.id)" :disabled="cancelling === app.id" class="cancel-btn">
            {{ cancelling === app.id ? '取消中...' : '取消申请' }}
          </button>
          <span class="action-hint">提交后 3 个工作日内将收到联系</span>
        </div>
      </div>

      <!-- 分页 -->
      <div v-if="totalPages > 1" class="pagination">
        <button :disabled="page <= 1" @click="goPage(page - 1)" class="page-btn">‹</button>
        <button v-for="p in visiblePages" :key="p" @click="goPage(p)"
          :class="['page-btn', { active: p === page }]">
          {{ p }}
        </button>
        <button :disabled="page >= totalPages" @click="goPage(page + 1)" class="page-btn">›</button>
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
  { label: '待联系', value: 'pending' },
  { label: '已联系', value: 'contacted' },
  { label: '已入组', value: 'enrolled' },
  { label: '已取消', value: 'cancelled' },
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
  pending: '待联系',
  contacted: '已联系',
  enrolled: '已入组',
  rejected: '未通过',
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
    error.value = '加载申请列表失败'
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
  if (!confirm('确定取消此申请？取消后如需重新报名需再次提交。')) return
  cancelling.value = id
  try {
    await api.cancelApplication(id)
    const item = list.value.find((a) => a.id === id)
    if (item) {
      item.status = 'cancelled'
      item.statusText = '已取消'
    }
  } catch (e: any) {
    alert(e?.response?.data?.message || '取消失败')
  } finally {
    cancelling.value = ''
  }
}

onMounted(loadList)
</script>

<style scoped>
/* 筛选标签 */
.filter-tabs {
  display: flex;
  gap: 8px;
  overflow-x: auto;
  padding-bottom: 4px;
  -webkit-overflow-scrolling: touch;
}

.tab-btn {
  padding: 6px 14px;
  border: 1px solid #e5e7eb;
  border-radius: 20px;
  background: #fff;
  color: #6b7280;
  font-size: 0.85rem;
  cursor: pointer;
  white-space: nowrap;
  transition: all 0.2s;
}

.tab-btn.active {
  background: #2563eb;
  color: #fff;
  border-color: #2563eb;
}

.tab-count {
  display: inline-block;
  min-width: 18px;
  height: 18px;
  line-height: 18px;
  text-align: center;
  background: rgba(255, 255, 255, 0.3);
  border-radius: 9px;
  font-size: 0.75rem;
  margin-left: 4px;
}

/* 空状态 */
.empty-state {
  text-align: center;
  padding: 2rem 1rem;
}

.link-btn {
  display: inline-block;
  padding: 0.5rem 1.2rem;
  background: #2563eb;
  color: #fff;
  border-radius: 6px;
  text-decoration: none;
  font-size: 0.9rem;
}

/* 申请卡片 */
.app-card {
  border-radius: 12px;
}

.app-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 8px;
}

.app-info {
  flex: 1;
  min-width: 0;
}

.app-title {
  margin: 0 0 4px;
  font-size: 1rem;
  line-height: 1.4;
}

.app-title a {
  color: inherit;
  text-decoration: none;
}

.app-title a:hover {
  color: #2563eb;
}

.app-meta {
  font-size: 0.82rem;
  color: #9ca3af;
}

.meta-sep::before {
  content: '·';
  margin: 0 6px;
}

/* 状态标签 */
.status-badge {
  padding: 3px 10px;
  border-radius: 12px;
  font-size: 0.78rem;
  white-space: nowrap;
  font-weight: 500;
}

.status-pending { background: #fef3c7; color: #92400e; }
.status-contacted { background: #dbeafe; color: #1e40af; }
.status-enrolled { background: #dcfce7; color: #166534; }
.status-rejected { background: #fee2e2; color: #991b1b; }
.status-cancelled { background: #f3f4f6; color: #9ca3af; }

/* 进度条 */
.progress-bar {
  display: flex;
  justify-content: space-between;
  margin: 12px 0 8px;
  position: relative;
}

.progress-bar::before {
  content: '';
  position: absolute;
  top: 6px;
  left: 10%;
  right: 10%;
  height: 2px;
  background: #e5e7eb;
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
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: #e5e7eb;
  border: 2px solid #fff;
  box-shadow: 0 0 0 1px #e5e7eb;
  transition: all 0.3s;
}

.progress-step.done .step-dot {
  background: #16a34a;
  box-shadow: 0 0 0 1px #16a34a;
}

.progress-step.current .step-dot {
  background: #2563eb;
  box-shadow: 0 0 0 2px #93c5fd;
}

.step-label {
  font-size: 0.72rem;
  color: #9ca3af;
  margin-top: 4px;
}

.progress-step.done .step-label {
  color: #16a34a;
}

.progress-step.current .step-label {
  color: #2563eb;
  font-weight: 500;
}

/* 诊断信息 */
.app-disease {
  margin-top: 8px;
}

.disease-tag {
  display: inline-block;
  padding: 2px 10px;
  background: #f0f9ff;
  color: #0369a1;
  border-radius: 4px;
  font-size: 0.82rem;
}

/* 提示卡片 */
.trial-warning {
  margin-top: 8px;
  padding: 8px 12px;
  background: #fffbeb;
  border-radius: 6px;
  font-size: 0.84rem;
  color: #92400e;
}

.contact-tip {
  margin-top: 8px;
  padding: 10px 12px;
  background: #eff6ff;
  border-radius: 6px;
  color: #1e40af;
}

.enrolled-tip {
  margin-top: 8px;
  padding: 10px 12px;
  background: #f0fdf4;
  border-radius: 6px;
  color: #166534;
}

.rejected-tip {
  margin-top: 8px;
  padding: 10px 12px;
  background: #fef2f2;
  border-radius: 6px;
  color: #991b1b;
}

/* 操作区 */
.app-actions {
  margin-top: 10px;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.cancel-btn {
  padding: 6px 16px;
  font-size: 0.84rem;
  background: #fff;
  color: #ef4444;
  border: 1px solid #fca5a5;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s;
}

.cancel-btn:hover:not(:disabled) {
  background: #fef2f2;
}

.cancel-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.action-hint {
  font-size: 0.78rem;
  color: #9ca3af;
}

/* 分页 */
.pagination {
  display: flex;
  justify-content: center;
  gap: 4px;
  margin-top: 1rem;
}

.page-btn {
  min-width: 32px;
  height: 32px;
  padding: 0 8px;
  border: 1px solid #e5e7eb;
  border-radius: 6px;
  background: #fff;
  color: #374151;
  font-size: 0.85rem;
  cursor: pointer;
  transition: all 0.2s;
}

.page-btn.active {
  background: #2563eb;
  color: #fff;
  border-color: #2563eb;
}

.page-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
</style>
