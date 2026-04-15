<template>
  <section class="grid">
    <!-- CRO Header -->
    <div class="card" style="padding:10px 14px;display:flex;justify-content:space-between;align-items:center;">
      <div>
        <h2 style="margin:0;font-size:16px;">{{ companyName }} - 入组看板</h2>
      </div>
      <button @click="logout" style="font-size:12px;padding:4px 12px;background:#f3f4f6;border:none;border-radius:4px;cursor:pointer;">退出</button>
    </div>

    <!-- 试验选择器 -->
    <div class="card" style="padding:10px 14px;">
      <select v-model="selectedTrialId" @change="loadBoard" style="width:100%;">
        <option value="">-- 选择试验 --</option>
        <option v-for="t in trials" :key="t.id" :value="t.id">
          {{ t.name }} ({{ t.applicationCount }}人)
        </option>
      </select>
    </div>

    <div v-if="!selectedTrialId" class="card" style="text-align:center;color:#6b7280;">
      请选择试验查看入组看板
    </div>

    <template v-if="selectedTrialId">
      <!-- 状态 Tab -->
      <div style="display:flex;gap:4px;overflow-x:auto;">
        <button v-for="s in statusList" :key="s.key" @click="activeStatus = s.key"
          :style="{ flex:'1', padding:'8px 4px', border:'none', borderRadius:'8px 8px 0 0', cursor:'pointer', fontSize:'12px',
            background: activeStatus === s.key ? s.color : '#f3f4f6',
            color: activeStatus === s.key ? '#fff' : '#374151' }">
          {{ s.label }} ({{ (grouped[s.key] || []).length }})
        </button>
      </div>

      <div v-if="boardLoading" class="card">加载中...</div>
      <template v-else>
        <div v-if="!(grouped[activeStatus] || []).length" class="card" style="text-align:center;color:#9ca3af;">
          暂无{{ statusMap[activeStatus] }}的申请
        </div>

        <div class="card" v-for="app in (grouped[activeStatus] || [])" :key="app.id" style="font-size:13px;">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;">
            <div>
              <strong>{{ app.userName }}</strong>
              <a v-if="app.userPhone" :href="'tel:' + app.userPhone" style="color:#2563eb;margin-left:6px;">{{ app.userPhone }}</a>
            </div>
            <select :value="app.status" @change="changeStatus(app, ($event.target as HTMLSelectElement).value)"
              style="padding:2px 6px;font-size:12px;border-radius:4px;border:1px solid #d1d5db;">
              <option v-for="s in statusList" :key="s.key" :value="s.key">{{ s.label }}</option>
            </select>
          </div>

          <div style="margin:6px 0;color:#374151;">
            <span v-if="app.diagnosis" class="badge">{{ app.diagnosis }}</span>
            <span v-if="app.stage" class="badge">{{ app.stage }}</span>
            <span v-if="app.geneMutation" class="badge" style="background:#fef3c7;color:#92400e;">{{ app.geneMutation }}</span>
            <span v-if="app.treatmentLine" class="badge" style="background:#e0e7ff;color:#3730a3;">{{ app.treatmentLine }}线</span>
            <span v-if="app.pdl1" class="badge" style="background:#fce7f3;color:#9d174d;">PD-L1:{{ app.pdl1 }}</span>
          </div>

          <div style="font-size:11px;color:#9ca3af;">
            申请时间：{{ formatTime(app.createdAt) }}
          </div>

          <div v-if="app.notes && app.notes.length" style="margin-top:6px;border-top:1px solid #f3f4f6;padding-top:6px;">
            <div v-for="(note, ni) in app.notes.slice(-3)" :key="ni" style="font-size:12px;color:#6b7280;margin:2px 0;">
              {{ note.content }} <span style="color:#d1d5db;">{{ formatTime(note.createdAt) }}</span>
            </div>
          </div>

          <div style="margin-top:6px;display:flex;gap:4px;">
            <input v-model="noteInputs[app.id]" placeholder="添加备注..." @keyup.enter="addNote(app)"
              style="flex:1;padding:4px 8px;font-size:12px;border:1px solid #e5e7eb;border-radius:4px;" />
            <button @click="addNote(app)" :disabled="!noteInputs[app.id]"
              style="padding:4px 10px;font-size:12px;background:#2563eb;color:#fff;border:none;border-radius:4px;cursor:pointer;white-space:nowrap;">
              记录
            </button>
          </div>
        </div>
      </template>

      <div class="card" style="display:flex;gap:8px;justify-content:center;">
        <button @click="exportTrial" class="btn primary" style="font-size:13px;padding:8px 20px;">
          导出线索 (CSV)
        </button>
      </div>
    </template>
  </section>
</template>

<script setup lang="ts">
import { onMounted, ref, reactive } from 'vue'
import { useRouter } from 'vue-router'
import { api } from '../services/api'
import { croHttp } from '../services/api'

const router = useRouter()
const companyName = ref('')
const trials = ref<Record<string, any>[]>([])
const selectedTrialId = ref('')
const activeStatus = ref('pending')
const boardLoading = ref(false)
const grouped = reactive<Record<string, any[]>>({
  pending: [], contacted: [], enrolled: [], rejected: [], cancelled: []
})
const noteInputs = reactive<Record<string, string>>({})

const statusList = [
  { key: 'pending', label: '待筛查', color: '#d97706' },
  { key: 'contacted', label: '已联系', color: '#2563eb' },
  { key: 'enrolled', label: '已入组', color: '#16a34a' },
  { key: 'rejected', label: '已排除', color: '#dc2626' },
  { key: 'cancelled', label: '已取消', color: '#9ca3af' }
]
const statusMap: Record<string, string> = { pending: '待筛查', contacted: '已联系', enrolled: '已入组', rejected: '已排除', cancelled: '已取消' }

const maskPhone = (phone: string) => {
  if (!phone || phone.length < 7) return phone || ''
  return phone.slice(0, 3) + '****' + phone.slice(-4)
}

const formatTime = (t: string) => {
  if (!t) return ''
  try {
    const d = new Date(t)
    return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`
  } catch { return t }
}

const checkAuth = () => {
  const token = localStorage.getItem('cro_token')
  if (!token) {
    router.push('/cro/login')
    return false
  }
  const company = localStorage.getItem('cro_company')
  if (company) {
    try { companyName.value = JSON.parse(company).name || 'CRO' } catch { companyName.value = 'CRO' }
  }
  return true
}

const loadTrials = async () => {
  try {
    const res = await api.getCroTrials()
    trials.value = Array.isArray(res) ? res : (res?.list || [])
  } catch (e: any) {
    if (e?.response?.status === 401 || e?.response?.status === 403) {
      router.push('/cro/login')
    }
  }
}

const loadBoard = async () => {
  if (!selectedTrialId.value) return
  boardLoading.value = true
  try {
    const res = await api.getCroApplications(selectedTrialId.value)
    const g = res?.grouped || {}
    for (const s of Object.keys(grouped)) {
      grouped[s] = g[s] || []
    }
  } catch { /* handled */ } finally {
    boardLoading.value = false
  }
}

const changeStatus = async (app: any, newStatus: string) => {
  const oldStatus = app.status
  try {
    await api.updateCroApplicationStatus(app.id, newStatus)
    const fromList = grouped[oldStatus]
    const idx = fromList.findIndex((a: any) => a.id === app.id)
    if (idx >= 0) fromList.splice(idx, 1)
    app.status = newStatus
    grouped[newStatus].push(app)
  } catch (e: any) {
    alert(e?.response?.data?.message || '更新失败')
  }
}

const addNote = async (app: any) => {
  const content = noteInputs[app.id]?.trim()
  if (!content) return
  try {
    const res = await api.addCroNote(app.id, content)
    app.notes = res?.notes || [...(app.notes || []), { content, createdAt: new Date().toISOString() }]
    noteInputs[app.id] = ''
  } catch (e: any) {
    alert(e?.response?.data?.message || '添加失败')
  }
}

const exportTrial = async () => {
  try {
    const resp = await croHttp.get(`/api/cro/exports/applications?trialId=${encodeURIComponent(selectedTrialId.value)}`, { responseType: 'blob' })
    const blob = new Blob([resp.data], { type: 'text/csv;charset=utf-8' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `trial_${selectedTrialId.value}_leads.csv`
    a.click()
    URL.revokeObjectURL(a.href)
  } catch { alert('导出失败') }
}

const logout = () => {
  localStorage.removeItem('cro_token')
  localStorage.removeItem('cro_company')
  router.push('/cro/login')
}

onMounted(() => {
  if (checkAuth()) loadTrials()
})
</script>
