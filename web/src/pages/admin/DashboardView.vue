<template>
  <section class="admin-page">
    <div v-if="forbidden" class="state-card danger">
      <strong>无管理权限</strong>
      <span>请联系管理员将当前账号加入 ADMIN_PHONES / ADMIN_USER_IDS。</span>
    </div>

    <template v-else>
      <div class="toolbar">
        <label>
          开始日期
          <input v-model="filters.startDate" type="date" />
        </label>
        <label>
          结束日期
          <input v-model="filters.endDate" type="date" />
        </label>
        <button class="primary-btn" :disabled="loading" @click="loadDashboard">
          {{ loading ? '加载中…' : '刷新' }}
        </button>
      </div>

      <!-- 骨架屏：加载中不留白，沿用全站 shimmer，prefers-reduced-motion 由全局 reset 兜底 -->
      <template v-if="loading">
        <div class="metric-grid" aria-hidden="true">
          <article v-for="n in 5" :key="n" class="metric-card skeleton-card">
            <span class="skeleton-line skeleton-line--label"></span>
            <span class="skeleton-line skeleton-line--value"></span>
            <span class="skeleton-line skeleton-line--hint"></span>
          </article>
        </div>
        <section class="panel" aria-hidden="true">
          <div class="skeleton-line skeleton-line--label"></div>
          <div class="funnel-list">
            <div v-for="n in 6" :key="n" class="funnel-row">
              <span class="skeleton-line skeleton-line--hint"></span>
              <span class="skeleton-line skeleton-line--value skeleton-line--narrow"></span>
            </div>
          </div>
        </section>
        <section class="panel" aria-hidden="true">
          <div class="skeleton-line skeleton-line--label"></div>
          <div class="skeleton-rows">
            <div v-for="n in 5" :key="n" class="skeleton-line skeleton-line--row"></div>
          </div>
        </section>
        <p class="sr-only" role="status">正在加载仪表盘数据…</p>
      </template>

      <template v-else-if="dashboard">
        <div class="metric-grid">
          <article v-for="card in overviewCards" :key="card.label" class="metric-card">
            <span>{{ card.label }}</span>
            <strong>{{ card.value }}</strong>
            <small v-if="card.hint">{{ card.hint }}</small>
          </article>
        </div>

        <div class="panel-grid">
          <section class="panel">
            <div class="panel-heading">
              <h3>上传到报名漏斗</h3>
              <span>{{ dashboard.range?.startDate }} 至 {{ dashboard.range?.endDate }}</span>
            </div>
            <div class="funnel-list">
              <div v-for="item in funnelItems" :key="item.label" class="funnel-row">
                <span>{{ item.label }}</span>
                <strong>{{ item.value }}</strong>
              </div>
            </div>
          </section>

          <section class="panel">
            <div class="panel-heading">
              <h3>解析质量</h3>
              <span>仅统计未删除上传</span>
            </div>
            <div class="quality-grid">
              <div>
                <span>成功率</span>
                <strong>{{ dashboard.dataQuality?.parseSuccessRate ?? 0 }}%</strong>
              </div>
              <div>
                <span>失败率</span>
                <strong>{{ dashboard.dataQuality?.parseErrorRate ?? 0 }}%</strong>
              </div>
              <div>
                <span>处理中</span>
                <strong>{{ dashboard.overview?.processingRecords ?? 0 }}</strong>
              </div>
              <div>
                <span>失败记录</span>
                <strong>{{ dashboard.dataQuality?.errorRecords ?? 0 }}</strong>
              </div>
            </div>
          </section>
        </div>

        <section class="panel">
          <div class="panel-heading">
            <h3>每日趋势</h3>
            <span>注册 / 上传 / 报名</span>
          </div>
          <!-- 横向滚动容器：固定 min-width 的表格在窄屏不撑破布局，带边缘渐隐提示 -->
          <div class="table-scroll">
            <div class="trend-table">
              <div class="trend-head">
                <span>日期</span>
                <span>注册</span>
                <span>上传</span>
                <span>报名</span>
              </div>
              <div v-for="row in dashboard.dailyTrend || []" :key="row.date" class="trend-row">
                <span>{{ row.date }}</span>
                <span>{{ row.users }}</span>
                <span>{{ row.records }}</span>
                <span>{{ row.applications }}</span>
              </div>
              <div v-if="(dashboard.dailyTrend || []).length === 0" class="empty">暂无趋势数据</div>
            </div>
          </div>
        </section>

        <section class="panel">
          <div class="panel-heading">
            <h3>最近解析异常</h3>
            <span>{{ recentErrors.length }} 条</span>
          </div>
          <div v-if="recentErrors.length === 0" class="empty">暂无解析异常</div>
          <div v-for="item in recentErrors" :key="item.recordId" class="error-row">
            <div>
              <strong>{{ item.recordId }}</strong>
              <span>{{ item.userNickname || '未知用户' }} · {{ item.userPhone || '-' }}</span>
            </div>
            <span>{{ formatDate(item.updatedAt) }}</span>
          </div>
        </section>
      </template>
    </template>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { api } from '../../services/api'

type DashboardPayload = Record<string, any>

const route = useRoute()
const router = useRouter()

const loading = ref(false)
const forbidden = ref(false)
const dashboard = ref<DashboardPayload | null>(null)

// 仅取 string 形式的 query（vue-router 的值可能是 string | string[] | null）
const queryStr = (value: unknown): string => (typeof value === 'string' ? value : '')

const filters = reactive({
  startDate: queryStr(route.query.startDate),
  endDate: queryStr(route.query.endDate)
})

// 把日期范围写回 URL，离开再回来仍保留筛选；只读写 query，不动 fetch 逻辑
const syncQuery = () => {
  const next: Record<string, string> = { ...(route.query as Record<string, string>) }
  if (filters.startDate) next.startDate = filters.startDate
  else delete next.startDate
  if (filters.endDate) next.endDate = filters.endDate
  else delete next.endDate
  router.replace({ query: next }).catch(() => {})
}

const numberText = (value: unknown) => Number(value || 0).toLocaleString('zh-CN')

const overviewCards = computed(() => {
  const overview = dashboard.value?.overview || {}
  return [
    { label: '总注册用户', value: numberText(overview.totalUsers), hint: `今日 +${overview.todayUsers || 0} / 7日 +${overview.last7Users || 0}` },
    { label: '上传过数据用户', value: numberText(overview.uploadedUsers), hint: `报名用户 ${overview.appliedUsers || 0}` },
    { label: '上传病历数', value: numberText(overview.totalRecords), hint: `今日 +${overview.todayRecords || 0} / 7日 +${overview.last7Records || 0}` },
    { label: '解析完成', value: numberText(overview.completedRecords), hint: `失败 ${overview.errorRecords || 0}` },
    { label: '报名数', value: numberText(overview.totalApplications), hint: `今日 +${overview.todayApplications || 0} / 7日 +${overview.last7Applications || 0}` }
  ]
})

const funnelItems = computed(() => {
  const funnel = dashboard.value?.funnel || {}
  return [
    { label: '访问首页', value: funnel.landingView || 0 },
    { label: '开始上传', value: funnel.uploadStart || 0 },
    { label: '上传成功', value: funnel.uploadSuccess || 0 },
    { label: '查看匹配', value: funnel.matchView || 0 },
    { label: '点击报名', value: funnel.trialApply || 0 },
    { label: '提交报名', value: funnel.applicationSubmitted || 0 },
    { label: '上传到报名转化率', value: `${funnel.uploadToApplicationRate || 0}%` }
  ]
})

const recentErrors = computed(() => dashboard.value?.dataQuality?.recentErrors || [])

const loadDashboard = async () => {
  syncQuery()
  loading.value = true
  forbidden.value = false
  try {
    dashboard.value = await api.getAdminDashboard({
      startDate: filters.startDate,
      endDate: filters.endDate
    })
  } catch (error: any) {
    if (error?.response?.status === 403) forbidden.value = true
    else throw error
  } finally {
    loading.value = false
  }
}

const formatDate = (value: string) => {
  if (!value) return '-'
  try {
    return new Date(value).toLocaleString('zh-CN', { hour12: false })
  } catch {
    return value
  }
}

onMounted(loadDashboard)
</script>

<style scoped>
.admin-page {
  display: grid;
  gap: var(--s-4);
}

.toolbar {
  display: flex;
  align-items: end;
  gap: var(--s-3);
  flex-wrap: wrap;
  border: 1px solid var(--line);
  border-radius: var(--r-md);
  padding: var(--s-4);
  background: var(--bg);
  box-shadow: var(--shadow-1);
}

.toolbar label {
  display: grid;
  gap: var(--s-1);
  min-width: 160px;
  color: var(--text-dim);
  font-size: var(--fs-callout);
}

.toolbar input {
  border: 1px solid var(--line);
  border-radius: var(--r-md);
  min-height: var(--size-tap);
  padding: var(--s-2) var(--s-3);
  font-family: inherit;
  font-size: var(--fs-callout);
  color: var(--text);
  background: var(--bg);
  transition: border-color 150ms ease, box-shadow 150ms ease;
}

.toolbar input:focus {
  outline: none;
  border-color: var(--brand);
  box-shadow: var(--shadow-focus);
}

.primary-btn {
  border: none;
  border-radius: var(--r-md);
  background: var(--brand);
  color: #fff;
  cursor: pointer;
  min-height: var(--size-tap);
  padding: 10px var(--s-4);
  font-size: var(--fs-callout);
  font-weight: 600;
  transition: background 150ms ease, transform 100ms ease;
}

.primary-btn:hover:not(:disabled) {
  background: var(--brand-hover);
}

.primary-btn:active:not(:disabled) {
  transform: scale(0.98);
}

.primary-btn:disabled {
  background: var(--text-muted);
  opacity: 0.6;
  cursor: not-allowed;
}

/* 移动端单列；min() 防止 180px 在窄屏溢出，桌面端自动多列 */
.metric-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 180px), 1fr));
  gap: var(--s-3);
}

.metric-card,
.panel,
.state-card {
  border: 1px solid var(--line);
  border-radius: var(--r-md);
  background: var(--bg);
  padding: var(--s-4);
  box-shadow: var(--shadow-1);
}

.metric-card {
  display: grid;
  gap: var(--s-2);
}

.metric-card span,
.metric-card small,
.panel-heading span,
.error-row span,
.quality-grid span {
  color: var(--text-dim);
  font-size: var(--fs-caption);
}

.metric-card strong {
  color: var(--text);
  font-size: 28px;
  font-weight: 700;
  line-height: var(--lh-tight);
}

.panel-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.15fr) minmax(0, 0.85fr);
  gap: var(--s-3);
}

.panel-heading {
  display: flex;
  justify-content: space-between;
  gap: var(--s-3);
  align-items: center;
  margin-bottom: var(--s-3);
}

.panel-heading h3 {
  margin: 0;
  font-size: var(--fs-subtitle);
  font-weight: 600;
  color: var(--text);
}

.funnel-list,
.quality-grid {
  display: grid;
  gap: var(--s-2);
}

.funnel-row,
.error-row {
  display: flex;
  justify-content: space-between;
  gap: var(--s-3);
  border-top: 1px solid var(--line);
  padding-top: var(--s-2);
}

.funnel-row strong {
  color: var(--text);
  font-weight: 600;
}

.quality-grid {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.quality-grid div {
  border: 1px solid var(--line);
  border-radius: var(--r-md);
  padding: var(--s-3);
  display: grid;
  gap: var(--s-1);
  background: var(--bg-soft);
}

.quality-grid strong {
  color: var(--text);
  font-size: var(--fs-title);
  font-weight: 700;
}

/* 横向滚动容器：右侧渐隐提示「还有更多列」，触屏惯性滚动 */
.table-scroll {
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
  background:
    linear-gradient(to right, var(--bg), var(--bg)),
    linear-gradient(to right, rgba(15, 23, 42, 0.06), transparent);
  background-position: left center, right center;
  background-repeat: no-repeat;
  background-size: 24px 100%, 16px 100%;
  background-attachment: local, scroll;
}

.trend-table {
  display: grid;
  gap: 0;
}

.trend-head,
.trend-row {
  display: grid;
  grid-template-columns: minmax(120px, 1fr) repeat(3, minmax(80px, 0.45fr));
  gap: var(--s-3);
  min-width: 520px;
  padding: var(--s-2) 0;
  border-bottom: 1px solid var(--line);
}

.trend-head {
  color: var(--text-dim);
  font-size: var(--fs-caption);
  font-weight: 600;
}

.error-row div {
  display: grid;
  gap: var(--s-1);
}

.error-row strong {
  color: var(--text);
}

.empty {
  color: var(--text-muted);
  padding: var(--s-3) 0;
  font-size: var(--fs-callout);
}

/* ── 加载骨架（沿用 MatchesView 的 shimmer 约定）─────────── */
.skeleton-card {
  pointer-events: none;
}

.skeleton-rows {
  display: grid;
  gap: var(--s-2);
}

.skeleton-line {
  display: block;
  height: 14px;
  background: var(--bg-soft);
  border-radius: var(--r-sm);
  position: relative;
  overflow: hidden;
}

.skeleton-line--label { width: 40%; height: 12px; margin-bottom: var(--s-2); }
.skeleton-line--value { width: 60%; height: 26px; }
.skeleton-line--hint { width: 70%; height: 12px; }
.skeleton-line--narrow { width: 32px; }
.skeleton-line--row { width: 100%; height: 18px; }

.skeleton-line::after {
  content: '';
  position: absolute;
  inset: 0;
  transform: translateX(-100%);
  background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.6), transparent);
  animation: skeleton-shimmer 1.3s infinite;
}

@keyframes skeleton-shimmer {
  100% { transform: translateX(100%); }
}

/* 视觉隐藏但可被读屏宣读（加载状态） */
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

.danger {
  color: var(--red);
  background: var(--red-soft);
  border-color: var(--red);
}

.state-card.danger strong {
  display: block;
  margin-bottom: var(--s-1);
}

@media (max-width: 900px) {
  .panel-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 560px) {
  /* 工具栏在窄屏纵向堆叠，日期输入占满宽度，刷新按钮全宽达 44px 触达 */
  .toolbar {
    flex-direction: column;
    align-items: stretch;
  }

  .toolbar label {
    min-width: 0;
  }

  .toolbar input,
  .primary-btn {
    width: 100%;
    min-height: var(--size-tap);
  }

  .quality-grid {
    grid-template-columns: 1fr;
  }
}
</style>
