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
  gap: 14px;
}

.toolbar {
  display: flex;
  align-items: end;
  gap: 10px;
  flex-wrap: wrap;
  border: 1px solid #dde3ed;
  border-radius: 8px;
  padding: 12px;
  background: #fff;
}

.toolbar label {
  display: grid;
  gap: 5px;
  min-width: 160px;
  color: #4b5563;
  font-size: 13px;
}

.primary-btn {
  border: none;
  border-radius: 8px;
  background: #2563eb;
  color: #fff;
  cursor: pointer;
  padding: 10px 16px;
}

.metric-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
  gap: 12px;
}

.metric-card,
.panel,
.state-card {
  border: 1px solid #dde3ed;
  border-radius: 8px;
  background: #fff;
  padding: 14px;
}

.metric-card {
  display: grid;
  gap: 7px;
}

.metric-card span,
.metric-card small,
.panel-heading span,
.error-row span,
.quality-grid span {
  color: #6b7280;
  font-size: 12px;
}

.metric-card strong {
  color: #111827;
  font-size: 26px;
}

.panel-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.15fr) minmax(0, 0.85fr);
  gap: 12px;
}

.panel-heading {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: center;
  margin-bottom: 12px;
}

.panel-heading h3 {
  margin: 0;
  font-size: 16px;
}

.funnel-list,
.quality-grid {
  display: grid;
  gap: 8px;
}

.funnel-row,
.error-row {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  border-top: 1px solid #eef2f7;
  padding-top: 8px;
}

.quality-grid {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.quality-grid div {
  border: 1px solid #edf1f7;
  border-radius: 8px;
  padding: 10px;
  display: grid;
  gap: 6px;
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
  gap: 12px;
  min-width: 520px;
  padding: 9px 0;
  border-bottom: 1px solid #eef2f7;
}

.trend-head {
  color: #6b7280;
  font-size: 12px;
}

.error-row div {
  display: grid;
  gap: 3px;
}

.empty {
  color: #6b7280;
  padding: 10px 0;
}

.danger {
  color: #b91c1c;
}

@media (max-width: 900px) {
  .panel-grid {
    grid-template-columns: 1fr;
  }
}
</style>
