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
        <button class="primary-btn" @click="loadDashboard">刷新</button>
      </div>

      <div v-if="loading" class="state-card">加载中...</div>

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
import { api } from '../../services/api'

type DashboardPayload = Record<string, any>

const loading = ref(false)
const forbidden = ref(false)
const dashboard = ref<DashboardPayload | null>(null)
const filters = reactive({
  startDate: '',
  endDate: ''
})

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
  padding: 10px var(--s-4);
  font-size: var(--fs-callout);
  font-weight: 600;
  transition: background 150ms ease, transform 100ms ease;
}

.primary-btn:hover {
  background: var(--brand-hover);
}

.primary-btn:active {
  transform: scale(0.98);
}

.metric-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
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

.trend-table {
  display: grid;
  gap: 0;
  overflow-x: auto;
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
</style>
