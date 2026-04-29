<template>
  <section class="grid">
    <h2>管理后台</h2>

    <div class="card" v-if="forbidden" style="text-align:center;color:#dc2626;">
      <p>无管理权限</p>
      <p style="font-size:0.85rem;color:#6b7280;">请联系管理员开通权限</p>
    </div>

    <template v-else>
      <!-- Tab 导航 -->
      <div style="display:flex;gap:0.5rem;flex-wrap:wrap;">
        <button v-for="t in tabs" :key="t.key" @click="activeTab = t.key"
          :style="{ padding: '0.4rem 1rem', border: 'none', borderRadius: '4px', cursor: 'pointer',
            background: activeTab === t.key ? '#2563eb' : '#e5e7eb',
            color: activeTab === t.key ? '#fff' : '#374151' }">
          {{ t.label }}
        </button>
      </div>

      <!-- 概览 -->
      <div v-if="activeTab === 'overview'" class="grid">
        <div class="card" v-if="statsLoading">加载中...</div>
        <div v-else style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:0.8rem;">
          <div class="card" v-for="s in statCards" :key="s.label" style="text-align:center;">
            <div style="font-size:1.6rem;font-weight:bold;color:#2563eb;">{{ s.value }}</div>
            <div style="font-size:0.85rem;color:#6b7280;">{{ s.label }}</div>
            <div v-if="s.today != null" style="font-size:0.75rem;color:#16a34a;">今日 +{{ s.today }}</div>
          </div>
        </div>
      </div>

      <!-- 申请管理 -->
      <div v-if="activeTab === 'applications'" class="grid">
        <div class="card" v-if="appsLoading">加载中...</div>
        <template v-else>
          <div class="card" v-for="app in appsList" :key="app.id" style="font-size:0.9rem;">
            <div style="display:flex;justify-content:space-between;align-items:flex-start;">
              <div>
                <strong>{{ app.trialName || app.trial_name || '未知试验' }}</strong>
                <p style="margin:0.2rem 0;color:#6b7280;">
                  患者：{{ app.userName || app.user_name || '匿名' }} |
                  {{ maskPhone(app.userPhone || app.user_phone || '') }}
                </p>
                <p style="margin:0.2rem 0;color:#6b7280;">
                  诊断：{{ app.diagnosis || '未知' }} |
                  申请时间：{{ formatTime(app.createdAt || app.created_at) }}
                </p>
              </div>
              <div style="text-align:right;">
                <select :value="app.status" @change="changeStatus(app.id, ($event.target as HTMLSelectElement).value)"
                  style="padding:0.3rem;border-radius:4px;border:1px solid #d1d5db;">
                  <option value="pending">待联系</option>
                  <option value="contacted">已联系</option>
                  <option value="enrolled">已入组</option>
                  <option value="rejected">不符合</option>
                  <option value="cancelled">已取消</option>
                </select>
              </div>
            </div>
          </div>
          <p v-if="appsList.length === 0" class="card" style="text-align:center;color:#6b7280;">暂无申请</p>
          <div v-if="appsTotalPages > 1" style="text-align:center;">
            <button v-for="p in appsTotalPages" :key="p" @click="loadApps(p)"
              :style="{ margin:'0 0.2rem', padding:'0.3rem 0.6rem', background: p === appsPage ? '#2563eb' : '#e5e7eb', color: p === appsPage ? '#fff' : '#374151', border:'none', borderRadius:'4px', cursor:'pointer' }">
              {{ p }}
            </button>
          </div>
        </template>
      </div>

      <!-- 用户列表 -->
      <div v-if="activeTab === 'users'" class="grid">
        <div class="card" v-if="usersLoading">加载中...</div>
        <template v-else>
          <div class="card" v-for="u in usersList" :key="u.id" style="font-size:0.9rem;">
            <strong>{{ u.nickname || u.id }}</strong>
            <span style="margin-left:0.5rem;color:#6b7280;">{{ maskPhone(u.phone || '') }}</span>
            <p style="margin:0.2rem 0;color:#6b7280;">
              病历 {{ u.recordCount || 0 }} 份 |
              申请 {{ u.applicationCount || 0 }} 次 |
              注册 {{ formatTime(u.createdAt || u.created_at) }}
            </p>
          </div>
          <p v-if="usersList.length === 0" class="card" style="text-align:center;color:#6b7280;">暂无用户</p>
          <div v-if="usersTotalPages > 1" style="text-align:center;">
            <button v-for="p in usersTotalPages" :key="p" @click="loadUsers(p)"
              :style="{ margin:'0 0.2rem', padding:'0.3rem 0.6rem', background: p === usersPage ? '#2563eb' : '#e5e7eb', color: p === usersPage ? '#fff' : '#374151', border:'none', borderRadius:'4px', cursor:'pointer' }">
              {{ p }}
            </button>
          </div>
        </template>
      </div>

      <!-- CRO 管理 -->
      <div v-if="activeTab === 'cro'" class="grid">
        <div class="card">
          <h4>创建 CRO 公司账号</h4>
          <div style="display:flex;flex-direction:column;gap:0.5rem;margin-top:0.5rem;">
            <input v-model="newCro.name" placeholder="公司名称" />
            <input v-model="newCro.contactName" placeholder="联系人姓名" />
            <input v-model="newCro.email" placeholder="登录邮箱" type="email" />
            <input v-model="newCro.password" placeholder="密码" type="password" />
            <input v-model="newCro.trialIds" placeholder="负责试验ID（逗号分隔）" />
            <button @click="createCro" class="export-btn" :disabled="!newCro.name || !newCro.email || !newCro.password">创建账号</button>
          </div>
          <p v-if="croMsg" style="margin-top:0.5rem;font-size:0.85rem;" :style="{ color: croMsg.startsWith('错') ? '#dc2626' : '#16a34a' }">{{ croMsg }}</p>
        </div>
        <div class="card" v-for="c in croList" :key="c.id" style="font-size:0.9rem;">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;">
            <div>
              <strong>{{ c.name }}</strong>
              <span style="color:#6b7280;margin-left:8px;">{{ c.email }}</span>
            </div>
            <span :style="{ padding:'2px 8px', borderRadius:'4px', fontSize:'12px', background: c.status === 'active' ? '#dcfce7' : '#fee2e2', color: c.status === 'active' ? '#166534' : '#991b1b' }">
              {{ c.status === 'active' ? '启用' : '禁用' }}
            </span>
          </div>
          <p style="margin:4px 0;color:#6b7280;">联系人：{{ c.contactName || '-' }} | 试验数：{{ c.trialCount }}</p>
          <div style="display:flex;gap:4px;margin-top:4px;">
            <button v-if="c.status === 'active'" @click="toggleCroStatus(c, 'disabled')" style="font-size:12px;padding:2px 8px;background:#fee2e2;color:#991b1b;border:none;border-radius:4px;cursor:pointer;">禁用</button>
            <button v-else @click="toggleCroStatus(c, 'active')" style="font-size:12px;padding:2px 8px;background:#dcfce7;color:#166534;border:none;border-radius:4px;cursor:pointer;">启用</button>
          </div>
        </div>
      </div>

      <!-- 数据导出 -->
      <div v-if="activeTab === 'export'" class="grid">
        <div class="card">
          <h4>数据导出</h4>
          <div style="display:flex;flex-direction:column;gap:0.8rem;margin-top:0.5rem;">
            <button @click="downloadExport('users')" class="export-btn">导出用户数据 (CSV)</button>
            <button @click="downloadExport('records')" class="export-btn">导出病历数据 (CSV)</button>
            <button @click="downloadExport('applications')" class="export-btn">导出全部申请 (CSV)</button>
          </div>
        </div>
        <div class="card">
          <h4>CRO 线索导出（按试验）</h4>
          <div style="display:flex;gap:0.5rem;align-items:center;">
            <input v-model="exportTrialId" placeholder="输入试验编码" style="flex:1;padding:0.4rem;border:1px solid #d1d5db;border-radius:4px;" />
            <button @click="downloadExport('applications', exportTrialId)" class="export-btn" :disabled="!exportTrialId">导出</button>
          </div>
        </div>
      </div>
    </template>
  </section>
</template>

<script setup lang="ts">
import { onMounted, ref, reactive, computed } from 'vue'
import { api, http } from '../services/api'
// PRD-2026Q2 §2.3：前端 PII 脱敏兜底。后端已默认脱敏，这里是保险丝。
import { maskPhone } from '../utils/mask'

const forbidden = ref(false)
const activeTab = ref('overview')
const tabs = [
  { key: 'overview', label: '概览' },
  { key: 'applications', label: '申请管理' },
  { key: 'users', label: '用户列表' },
  { key: 'cro', label: 'CRO管理' },
  { key: 'export', label: '数据导出' }
]

// Overview
const statsLoading = ref(false)
const statCards = ref<{ label: string; value: number; today?: number }[]>([])

const loadStats = async () => {
  statsLoading.value = true
  try {
    const res = await api.getAdminDashboard()
    statCards.value = [
      { label: '总用户', value: res.totalUsers ?? res.total_users ?? 0, today: res.todayUsers ?? res.today_users },
      { label: '病历数', value: res.totalRecords ?? res.total_records ?? 0, today: res.todayRecords ?? res.today_records },
      { label: '申请数', value: res.totalApplications ?? res.total_applications ?? 0, today: res.todayApplications ?? res.today_applications },
      { label: '试验数', value: res.totalTrials ?? res.total_trials ?? 0 }
    ]
  } catch (e: any) {
    if (e?.response?.status === 403) { forbidden.value = true }
  } finally {
    statsLoading.value = false
  }
}

// Applications
const appsLoading = ref(false)
const appsList = ref<Record<string, any>[]>([])
const appsPage = ref(1)
const appsTotal = ref(0)
const appsTotalPages = computed(() => Math.max(1, Math.ceil(appsTotal.value / 20)))

const loadApps = async (page = 1) => {
  appsLoading.value = true
  appsPage.value = page
  try {
    const res = await api.getAdminApplications(page)
    appsList.value = res?.list || res?.items || (Array.isArray(res) ? res : [])
    appsTotal.value = res?.total || appsList.value.length
  } catch { /* handled */ } finally {
    appsLoading.value = false
  }
}

const changeStatus = async (id: string, status: string) => {
  try {
    await api.updateApplicationStatus(id, status)
    const item = appsList.value.find((a) => a.id === id)
    if (item) item.status = status
  } catch (e: any) {
    alert(e?.response?.data?.message || '更新失败')
  }
}

// Users
const usersLoading = ref(false)
const usersList = ref<Record<string, any>[]>([])
const usersPage = ref(1)
const usersTotal = ref(0)
const usersTotalPages = computed(() => Math.max(1, Math.ceil(usersTotal.value / 20)))

const loadUsers = async (page = 1) => {
  usersLoading.value = true
  usersPage.value = page
  try {
    const res = await api.getAdminUsers(page)
    usersList.value = res?.list || res?.items || (Array.isArray(res) ? res : [])
    usersTotal.value = res?.total || usersList.value.length
  } catch { /* handled */ } finally {
    usersLoading.value = false
  }
}

// CRO Management
const croList = ref<Record<string, any>[]>([])
const croMsg = ref('')
const newCro = reactive({ name: '', contactName: '', email: '', password: '', trialIds: '' })

const loadCroList = async () => {
  try {
    const res = await api.getAdminCroList()
    croList.value = Array.isArray(res) ? res : (res?.list || [])
  } catch { /* handled */ }
}

const createCro = async () => {
  croMsg.value = ''
  try {
    const trialIds = newCro.trialIds ? newCro.trialIds.split(',').map((s: string) => s.trim()).filter(Boolean) : []
    await api.createAdminCro({
      name: newCro.name,
      contactName: newCro.contactName,
      email: newCro.email,
      password: newCro.password,
      trialIds
    })
    croMsg.value = '创建成功'
    newCro.name = ''; newCro.contactName = ''; newCro.email = ''; newCro.password = ''; newCro.trialIds = ''
    loadCroList()
  } catch (e: any) {
    croMsg.value = '错误: ' + (e?.response?.data?.message || '创建失败')
  }
}

const toggleCroStatus = async (c: any, status: string) => {
  try {
    await api.updateAdminCro(c.id, { status })
    c.status = status
  } catch (e: any) {
    alert(e?.response?.data?.message || '操作失败')
  }
}

// Export
const exportTrialId = ref('')

const downloadExport = async (type: string, trialId?: string) => {
  let url = `/api/admin/exports/${type}?format=csv`
  if (trialId) url += `&trialId=${encodeURIComponent(trialId)}`
  try {
    const resp = await http.get(url, { responseType: 'blob' })
    const disposition = resp.headers['content-disposition'] || ''
    const match = disposition.match(/filename="?([^"]+)"?/)
    const filename = match ? match[1] : `${type}_export.csv`
    const blob = new Blob([resp.data], { type: 'text/csv;charset=utf-8' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = filename
    a.click()
    URL.revokeObjectURL(a.href)
  } catch (e: any) {
    alert(e?.response?.data?.message || '导出失败')
  }
}

const formatTime = (t: string) => {
  if (!t) return ''
  try { return new Date(t).toLocaleDateString('zh-CN') } catch { return t }
}

onMounted(() => {
  loadStats()
  loadApps()
  loadUsers()
  loadCroList()
})
</script>

<style scoped>
.export-btn {
  padding: 0.5rem 1.2rem;
  background: #2563eb;
  color: #fff;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.9rem;
}
.export-btn:disabled {
  background: #9ca3af;
  cursor: not-allowed;
}
</style>
