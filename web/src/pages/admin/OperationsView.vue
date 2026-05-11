<template>
  <section class="admin-page">
    <div class="tabs">
      <button
        v-for="tab in tabs"
        :key="tab.key"
        :class="{ active: activeTab === tab.key }"
        @click="activeTab = tab.key"
      >
        {{ tab.label }}
      </button>
    </div>

    <section v-if="activeTab === 'applications'" class="panel">
      <div class="panel-heading">
        <h3>申请管理</h3>
        <button class="secondary-btn" @click="loadApplications">刷新</button>
      </div>
      <div v-if="appsLoading" class="state-card">加载中...</div>
      <template v-else>
        <article v-for="app in applications" :key="app.id" class="list-item">
          <div>
            <strong>{{ app.trialName || app.trial_name || '未知试验' }}</strong>
            <span>{{ app.userName || app.user_name || '匿名用户' }} · {{ app.userPhone || app.user_phone || '-' }}</span>
            <span>{{ app.diagnosis || '诊断未识别' }} · {{ formatDate(app.createdAt || app.created_at) }}</span>
          </div>
          <select :value="app.status" @change="changeStatus(app, ($event.target as HTMLSelectElement).value)">
            <option value="pending">待联系</option>
            <option value="contacted">已联系</option>
            <option value="enrolled">已入组</option>
            <option value="rejected">不符合</option>
            <option value="cancelled">已取消</option>
          </select>
        </article>
        <div v-if="applications.length === 0" class="empty">暂无申请</div>
      </template>
    </section>

    <section v-if="activeTab === 'cro'" class="panel-grid">
      <form class="panel" @submit.prevent="createCro">
        <h3>创建 CRO 公司账号</h3>
        <input v-model="newCro.name" placeholder="公司名称" />
        <input v-model="newCro.contactName" placeholder="联系人姓名" />
        <input v-model="newCro.email" placeholder="登录邮箱" type="email" />
        <input v-model="newCro.password" placeholder="密码" type="password" />
        <input v-model="newCro.trialIds" placeholder="负责试验ID，逗号分隔" />
        <button class="primary-btn" :disabled="!newCro.name || !newCro.email || !newCro.password">创建账号</button>
        <span v-if="croMsg" :class="croMsg.startsWith('错误') ? 'danger-text' : 'success-text'">{{ croMsg }}</span>
      </form>

      <section class="panel">
        <div class="panel-heading">
          <h3>CRO 列表</h3>
          <button class="secondary-btn" @click="loadCroList">刷新</button>
        </div>
        <article v-for="company in croList" :key="company.id" class="list-item">
          <div>
            <strong>{{ company.name }}</strong>
            <span>{{ company.email }} · 试验 {{ company.trialCount || 0 }} 个</span>
          </div>
          <button class="secondary-btn" @click="confirmToggleCro(company)">
            {{ company.status === 'active' ? '禁用' : '启用' }}
          </button>
        </article>
        <div v-if="croList.length === 0" class="empty">暂无 CRO 账号</div>
      </section>
    </section>

    <section v-if="activeTab === 'export'" class="panel-grid">
      <div class="panel">
        <h3>数据导出</h3>
        <button class="primary-btn" @click="downloadExport('users')">导出用户数据 CSV</button>
        <button class="primary-btn" @click="downloadExport('records')">导出上传数据 CSV</button>
        <button class="primary-btn" @click="downloadExport('applications')">导出申请数据 CSV</button>
      </div>
      <div class="panel">
        <h3>按试验导出线索</h3>
        <input v-model="exportTrialId" placeholder="输入试验编码" />
        <button class="primary-btn" :disabled="!exportTrialId" @click="downloadExport('applications', exportTrialId)">
          导出试验线索
        </button>
      </div>
    </section>
  </section>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { api, http } from '../../services/api'
import { useToast } from '../../composables/useToast'
import { useConfirm } from '../../composables/useDialog'

const tabs = [
  { key: 'applications', label: '申请管理' },
  { key: 'cro', label: 'CRO 管理' },
  { key: 'export', label: '数据导出' }
]

const toast = useToast()
const confirm = useConfirm()

const activeTab = ref('applications')
const appsLoading = ref(false)
const applications = ref<Record<string, any>[]>([])
const croList = ref<Record<string, any>[]>([])
const croMsg = ref('')
const exportTrialId = ref('')
const newCro = reactive({ name: '', contactName: '', email: '', password: '', trialIds: '' })

const loadApplications = async () => {
  appsLoading.value = true
  try {
    const res = await api.getAdminApplications(1, 50)
    applications.value = res?.list || res?.items || []
  } finally {
    appsLoading.value = false
  }
}

const STATUS_LABELS: Record<string, string> = {
  pending: '待联系',
  contacted: '已联系',
  enrolled: '已入组',
  rejected: '不符合',
  cancelled: '已取消'
}

const changeStatus = async (app: Record<string, any>, status: string) => {
  const oldStatus = app.status
  if (status === oldStatus) return
  // PRD-2026Q3 §C13：状态变更需二次确认 + 操作日志
  const ok = await confirm({
    title: `将申请状态改为「${STATUS_LABELS[status] || status}」？`,
    description: `${app.userName || app.user_name || '匿名用户'} · ${app.trialName || app.trial_name || '未知试验'}`,
    confirmText: '确认变更',
    danger: status === 'rejected' || status === 'cancelled'
  })
  if (!ok) return
  try {
    await api.updateApplicationStatus(app.id, status)
    app.status = status
    toast.success('已更新申请状态，已记录到操作日志')
  } catch (error: any) {
    toast.error(error?.response?.data?.message || '更新失败')
  }
}

const loadCroList = async () => {
  const res = await api.getAdminCroList()
  croList.value = Array.isArray(res) ? res : (res?.list || [])
}

const createCro = async () => {
  croMsg.value = ''
  try {
    await api.createAdminCro({
      name: newCro.name,
      contactName: newCro.contactName,
      email: newCro.email,
      password: newCro.password,
      trialIds: newCro.trialIds.split(',').map((item) => item.trim()).filter(Boolean)
    })
    croMsg.value = '创建成功'
    toast.success(`已创建 CRO 账号：${newCro.name}`)
    newCro.name = ''
    newCro.contactName = ''
    newCro.email = ''
    newCro.password = ''
    newCro.trialIds = ''
    await loadCroList()
  } catch (error: any) {
    croMsg.value = `错误：${error?.response?.data?.message || '创建失败'}`
  }
}

const confirmToggleCro = async (company: Record<string, any>) => {
  const next = company.status === 'active' ? 'disabled' : 'active'
  const verb = next === 'disabled' ? '禁用' : '启用'
  const ok = await confirm({
    title: `${verb} CRO「${company.name}」？`,
    description: next === 'disabled'
      ? '禁用后该 CRO 将无法登录平台，可随时重新启用。'
      : '启用后 CRO 将恢复登录与查看权限。',
    confirmText: `确认${verb}`,
    danger: next === 'disabled'
  })
  if (!ok) return
  try {
    await api.updateAdminCro(company.id, { status: next })
    company.status = next
    toast.success(`已${verb} ${company.name}`)
  } catch (error: any) {
    toast.error(error?.response?.data?.message || '操作失败')
  }
}

const downloadExport = async (type: string, trialId?: string) => {
  let url = `/api/admin/exports/${type}?format=csv`
  if (trialId) url += `&trialId=${encodeURIComponent(trialId)}`
  try {
    const resp = await http.get(url, { responseType: 'blob' })
    const disposition = resp.headers['content-disposition'] || ''
    const match = disposition.match(/filename="?([^"]+)"?/)
    const filename = match ? match[1] : `${type}_export.csv`
    const blob = new Blob([resp.data], { type: 'text/csv;charset=utf-8' })
    const anchor = document.createElement('a')
    anchor.href = URL.createObjectURL(blob)
    anchor.download = filename
    anchor.click()
    URL.revokeObjectURL(anchor.href)
    toast.success(`已开始下载 ${filename}`)
  } catch (error: any) {
    toast.error(error?.response?.data?.message || '导出失败')
  }
}

const formatDate = (value: string) => {
  if (!value) return '-'
  try { return new Date(value).toLocaleDateString('zh-CN') } catch { return value }
}

onMounted(() => {
  loadApplications()
  loadCroList()
})
</script>

<style scoped>
.admin-page,
.panel,
.panel-grid {
  display: grid;
  gap: var(--s-4);
}

.tabs,
.panel,
.state-card {
  border: 1px solid var(--line);
  border-radius: var(--r-md);
  background: var(--bg);
  padding: var(--s-4);
  box-shadow: var(--shadow-1);
}

.tabs {
  display: flex;
  gap: var(--s-2);
  flex-wrap: wrap;
}

.tabs button,
.secondary-btn {
  border: 1px solid var(--line);
  border-radius: var(--r-md);
  background: var(--bg);
  color: var(--text-dim);
  cursor: pointer;
  padding: var(--s-2) var(--s-3);
  font-size: var(--fs-callout);
  font-weight: 500;
  transition: border-color 150ms ease, color 150ms ease, background 150ms ease, transform 100ms ease;
}

.tabs button:hover,
.secondary-btn:hover {
  border-color: var(--brand);
  color: var(--brand);
}

.secondary-btn:active {
  transform: scale(0.98);
}

.tabs button.active,
.primary-btn {
  border: none;
  border-radius: var(--r-md);
  background: var(--brand);
  color: #fff;
  cursor: pointer;
  padding: 9px var(--s-3);
  font-size: var(--fs-callout);
  font-weight: 600;
  transition: background 150ms ease, transform 100ms ease;
}

.tabs button.active:hover,
.primary-btn:hover {
  background: var(--brand-hover);
}

.primary-btn:disabled {
  background: var(--text-muted);
  cursor: not-allowed;
  opacity: 0.5;
}

.primary-btn:active:not(:disabled),
.tabs button.active:active {
  transform: scale(0.98);
}

.panel input,
.panel select {
  border: 1px solid var(--line);
  border-radius: var(--r-md);
  padding: var(--s-2) var(--s-3);
  font-family: inherit;
  font-size: var(--fs-callout);
  color: var(--text);
  background: var(--bg);
  transition: border-color 150ms ease, box-shadow 150ms ease;
}

.panel input:focus,
.panel select:focus {
  outline: none;
  border-color: var(--brand);
  box-shadow: var(--shadow-focus);
}

.panel-grid {
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
}

.panel-heading,
.list-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: var(--s-3);
}

.panel h3 {
  margin: 0;
  font-size: var(--fs-subtitle);
  color: var(--text);
}

.panel input,
.panel button {
  margin-top: var(--s-2);
}

.list-item {
  border-top: 1px solid var(--line);
  padding-top: var(--s-3);
}

.list-item div {
  display: grid;
  gap: var(--s-1);
}

.list-item strong {
  color: var(--text);
  font-size: var(--fs-callout);
}

.list-item span,
.empty {
  color: var(--text-dim);
  font-size: var(--fs-caption);
}

.empty {
  padding: var(--s-3) 0;
}

.danger-text {
  color: var(--red);
  font-size: var(--fs-caption);
}

.success-text {
  color: var(--mint-text);
  font-size: var(--fs-caption);
}
</style>
