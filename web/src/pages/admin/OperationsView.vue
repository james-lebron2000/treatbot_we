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
          <select :value="app.status" @change="changeStatus(app.id, ($event.target as HTMLSelectElement).value)">
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
          <button class="secondary-btn" @click="toggleCroStatus(company, company.status === 'active' ? 'disabled' : 'active')">
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

const tabs = [
  { key: 'applications', label: '申请管理' },
  { key: 'cro', label: 'CRO 管理' },
  { key: 'export', label: '数据导出' }
]

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

const changeStatus = async (id: string, status: string) => {
  try {
    await api.updateApplicationStatus(id, status)
    const target = applications.value.find((item) => item.id === id)
    if (target) target.status = status
  } catch (error: any) {
    alert(error?.response?.data?.message || '更新失败')
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

const toggleCroStatus = async (company: Record<string, any>, status: string) => {
  try {
    await api.updateAdminCro(company.id, { status })
    company.status = status
  } catch (error: any) {
    alert(error?.response?.data?.message || '操作失败')
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
  } catch (error: any) {
    alert(error?.response?.data?.message || '导出失败')
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
  gap: 14px;
}

.tabs,
.panel,
.state-card {
  border: 1px solid #dde3ed;
  border-radius: 8px;
  background: #fff;
  padding: 14px;
}

.tabs {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.tabs button,
.secondary-btn {
  border: 1px solid #cfd7e6;
  border-radius: 8px;
  background: #fff;
  color: #374151;
  cursor: pointer;
  padding: 8px 12px;
}

.tabs button.active,
.primary-btn {
  border: none;
  border-radius: 8px;
  background: #2563eb;
  color: #fff;
  cursor: pointer;
  padding: 9px 14px;
}

.primary-btn:disabled {
  background: #c7d2e3;
  cursor: not-allowed;
}

.panel-grid {
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
}

.panel-heading,
.list-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
}

.panel h3 {
  margin: 0;
}

.panel input,
.panel button {
  margin-top: 8px;
}

.list-item {
  border-top: 1px solid #eef2f7;
  padding-top: 12px;
}

.list-item div {
  display: grid;
  gap: 4px;
}

.list-item span,
.empty {
  color: #6b7280;
  font-size: 13px;
}

.danger-text {
  color: #b91c1c;
}

.success-text {
  color: #15803d;
}
</style>
