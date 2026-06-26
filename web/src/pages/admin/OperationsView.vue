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
        <input v-model="newCro.cpaPrice" placeholder="CPA 单价（元）" type="number" min="0" step="0.01" />
        <select v-model="newCro.cpaQualifiedStatus">
          <option value="screened">合格状态：通过初筛（screened）</option>
          <option value="enrolled">合格状态：已入组（enrolled）</option>
        </select>
        <button class="primary-btn" :disabled="!newCro.name || !newCro.email || !newCro.password">创建账号</button>
        <span v-if="croMsg" :class="croMsg.startsWith('错误') ? 'danger-text' : 'success-text'">{{ croMsg }}</span>
      </form>

      <section class="panel">
        <div class="panel-heading">
          <h3>CRO 列表</h3>
          <button class="secondary-btn" @click="loadCroList">刷新</button>
        </div>
        <article v-for="company in croList" :key="company.id" class="list-item">
          <template v-if="editingCroId === company.id">
            <div class="cro-edit">
              <label>
                CPA 单价（元）
                <input v-model="croEdit.cpaPrice" type="number" min="0" step="0.01" placeholder="单价/元" />
              </label>
              <label>
                合格状态
                <select v-model="croEdit.cpaQualifiedStatus">
                  <option value="screened">通过初筛（screened）</option>
                  <option value="enrolled">已入组（enrolled）</option>
                </select>
              </label>
            </div>
            <div class="cro-edit-actions">
              <button class="primary-btn" type="button" @click="saveCroEdit(company)">保存</button>
              <button class="secondary-btn" type="button" @click="cancelCroEdit">取消</button>
            </div>
          </template>
          <template v-else>
            <div>
              <strong>{{ company.name }}</strong>
              <span>{{ company.email }} · 试验 {{ company.trialCount || 0 }} 个</span>
              <span>CPA {{ formatPrice(company.cpaPrice) }} · {{ qualifiedLabel(company.cpaQualifiedStatus) }}</span>
            </div>
            <div class="cro-row-actions">
              <button class="secondary-btn" @click="startCroEdit(company)">价格配置</button>
              <button class="secondary-btn" @click="confirmToggleCro(company)">
                {{ company.status === 'active' ? '禁用' : '启用' }}
              </button>
            </div>
          </template>
        </article>
        <div v-if="croList.length === 0" class="empty">暂无 CRO 账号</div>
      </section>
    </section>

    <section v-if="activeTab === 'billing'" class="panel-grid billing-grid">
      <div class="panel">
        <div class="panel-heading">
          <h3>CPA 计费结算</h3>
          <div class="billing-controls">
            <input v-model="billingMonth" type="month" />
            <button class="secondary-btn" @click="loadBilling">查询</button>
            <button class="primary-btn" :disabled="!billingMonth || billingExporting" @click="exportBilling">
              {{ billingExporting ? '导出中...' : '导出 CSV' }}
            </button>
          </div>
        </div>
        <div v-if="billingLoading" class="state-card">加载中...</div>
        <template v-else>
          <div class="billing-summary">
            <div>
              <span>结算月份</span>
              <strong>{{ billing.month || billingMonth || '-' }}</strong>
            </div>
            <div>
              <span>合计命中</span>
              <strong>{{ billing.total_count || 0 }} 例</strong>
            </div>
            <div>
              <span>合计金额</span>
              <strong>{{ formatPrice(billing.total_amount) }}</strong>
            </div>
          </div>
          <div class="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>CRO</th>
                  <th>试验</th>
                  <th>合格状态</th>
                  <th>命中数</th>
                  <th>单价</th>
                  <th>金额</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(row, idx) in billing.rows" :key="row.cro_id + '-' + row.trial_id + '-' + idx">
                  <td>{{ row.cro_name || row.cro_id }}</td>
                  <td>{{ row.trial_id }}</td>
                  <td>{{ qualifiedLabel(row.qualified_status) }}</td>
                  <td>{{ row.count }}</td>
                  <td>{{ formatPrice(row.unit_price) }}</td>
                  <td>{{ formatPrice(row.amount) }}</td>
                </tr>
              </tbody>
            </table>
            <div v-if="(billing.rows || []).length === 0" class="empty">该月暂无计费记录</div>
          </div>
        </template>
      </div>
    </section>

    <section v-if="activeTab === 'fieldReview'" class="panel-grid">
      <section class="panel">
        <div class="panel-heading">
          <h3>试验字段复核队列</h3>
          <button class="secondary-btn" @click="loadFieldReview">刷新</button>
        </div>
        <div v-if="fieldReviewLoading" class="state-card">加载中...</div>
        <template v-else>
          <article v-for="item in fieldReviewList" :key="item.id" class="list-item">
            <div>
              <strong>{{ item.trialName || item.trial_name || item.trialId || item.trial_id || '未知试验' }} · {{ item.field || item.fieldName || '字段' }}</strong>
              <span>OCR 抽取：{{ item.extractedValue ?? item.value ?? '-' }}</span>
              <span v-if="item.confidence != null">置信度 {{ Math.round(Number(item.confidence) * 100) }}%</span>
            </div>
            <div class="cro-row-actions">
              <button class="primary-btn" @click="resolveFieldReview(item, 'approve')">采纳</button>
              <button class="secondary-btn" @click="resolveFieldReview(item, 'reject')">驳回</button>
            </div>
          </article>
          <div v-if="fieldReviewList.length === 0" class="empty">暂无待复核字段</div>
        </template>
      </section>
    </section>

    <section v-if="activeTab === 'ocrFailures'" class="panel-grid">
      <section class="panel">
        <div class="panel-heading">
          <h3>OCR 失败重试</h3>
          <button class="secondary-btn" @click="loadOcrFailures">刷新</button>
        </div>
        <div v-if="ocrLoading" class="state-card">加载中...</div>
        <template v-else>
          <article v-for="item in ocrFailures" :key="item.id" class="list-item">
            <div>
              <strong>{{ item.originalName || item.fileName || item.recordId || item.id }}</strong>
              <span>{{ item.errorMsg || item.error || '解析失败' }}</span>
              <span>{{ formatDateTime(item.failedAt || item.updatedAt || item.createdAt) }}</span>
            </div>
            <button class="primary-btn" :disabled="retryingId === item.id" @click="retryOcr(item)">
              {{ retryingId === item.id ? '重试中...' : '重试' }}
            </button>
          </article>
          <div v-if="ocrFailures.length === 0" class="empty">暂无 OCR 失败记录</div>
        </template>
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
import { onMounted, reactive, ref, watch } from 'vue'
import { api, http } from '../../services/api'
import { useToast } from '../../composables/useToast'
import { useConfirm } from '../../composables/useDialog'

const tabs = [
  { key: 'applications', label: '申请管理' },
  { key: 'cro', label: 'CRO 管理' },
  { key: 'billing', label: '计费结算' },
  { key: 'fieldReview', label: '试验字段复核' },
  { key: 'ocrFailures', label: 'OCR 失败重试' },
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
const newCro = reactive({
  name: '',
  contactName: '',
  email: '',
  password: '',
  trialIds: '',
  cpaPrice: '',
  cpaQualifiedStatus: 'screened'
})

// CRO 价格内联编辑
const editingCroId = ref<string | null>(null)
const croEdit = reactive({ cpaPrice: '', cpaQualifiedStatus: 'screened' })

// 计费结算
const billingMonth = ref(currentMonth())
const billingLoading = ref(false)
const billingExporting = ref(false)
const billing = ref<Record<string, any>>({ rows: [], total_amount: 0, total_count: 0, month: '' })

// 试验字段复核
const fieldReviewLoading = ref(false)
const fieldReviewList = ref<Record<string, any>[]>([])

// OCR 失败重试
const ocrLoading = ref(false)
const ocrFailures = ref<Record<string, any>[]>([])
const retryingId = ref<string | null>(null)

function currentMonth() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

const QUALIFIED_LABELS: Record<string, string> = {
  screened: '通过初筛',
  enrolled: '已入组'
}
const qualifiedLabel = (status: string) => QUALIFIED_LABELS[status] || status || '-'

const formatPrice = (value: unknown) => {
  const n = Number(value)
  if (!Number.isFinite(n)) return '¥0.00'
  return `¥${n.toFixed(2)}`
}

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
    const payload: Record<string, any> = {
      name: newCro.name,
      contactName: newCro.contactName,
      email: newCro.email,
      password: newCro.password,
      trialIds: newCro.trialIds.split(',').map((item) => item.trim()).filter(Boolean),
      cpaQualifiedStatus: newCro.cpaQualifiedStatus
    }
    // 只有填了单价才透传，避免把空字符串当 0 价提交。
    if (`${newCro.cpaPrice}`.trim() !== '') payload.cpaPrice = Number(newCro.cpaPrice)
    await api.createAdminCro(payload)
    croMsg.value = '创建成功'
    toast.success(`已创建 CRO 账号：${newCro.name}`)
    newCro.name = ''
    newCro.contactName = ''
    newCro.email = ''
    newCro.password = ''
    newCro.trialIds = ''
    newCro.cpaPrice = ''
    newCro.cpaQualifiedStatus = 'screened'
    await loadCroList()
  } catch (error: any) {
    croMsg.value = `错误：${error?.response?.data?.message || '创建失败'}`
  }
}

const startCroEdit = (company: Record<string, any>) => {
  editingCroId.value = company.id
  croEdit.cpaPrice = company.cpaPrice != null ? String(company.cpaPrice) : ''
  croEdit.cpaQualifiedStatus = company.cpaQualifiedStatus || 'screened'
}

const cancelCroEdit = () => {
  editingCroId.value = null
}

const saveCroEdit = async (company: Record<string, any>) => {
  try {
    const payload: Record<string, any> = { cpaQualifiedStatus: croEdit.cpaQualifiedStatus }
    if (`${croEdit.cpaPrice}`.trim() !== '') payload.cpaPrice = Number(croEdit.cpaPrice)
    await api.updateAdminCro(company.id, payload)
    company.cpaPrice = payload.cpaPrice ?? company.cpaPrice
    company.cpaQualifiedStatus = croEdit.cpaQualifiedStatus
    editingCroId.value = null
    toast.success(`已更新 ${company.name} 的计价配置`)
  } catch (error: any) {
    toast.error(error?.response?.data?.message || '保存失败')
  }
}

const loadBilling = async () => {
  if (!billingMonth.value) return
  billingLoading.value = true
  try {
    const res = await api.getAdminBillingSummary(billingMonth.value)
    billing.value = {
      month: res?.month || billingMonth.value,
      rows: res?.rows || [],
      total_amount: res?.total_amount ?? 0,
      total_count: res?.total_count ?? 0
    }
  } catch (error: any) {
    toast.error(error?.response?.data?.message || '加载计费失败')
  } finally {
    billingLoading.value = false
  }
}

const exportBilling = async () => {
  if (!billingMonth.value) return
  billingExporting.value = true
  try {
    const { blob, filename } = await api.exportAdminBillingSummary(billingMonth.value)
    const csvBlob = new Blob([blob], { type: 'text/csv;charset=utf-8' })
    const anchor = document.createElement('a')
    anchor.href = URL.createObjectURL(csvBlob)
    anchor.download = filename
    anchor.click()
    URL.revokeObjectURL(anchor.href)
    toast.success(`已开始下载 ${filename}`)
  } catch (error: any) {
    toast.error(error?.response?.data?.message || '导出失败')
  } finally {
    billingExporting.value = false
  }
}

const loadFieldReview = async () => {
  fieldReviewLoading.value = true
  try {
    const res = await api.getAdminTrialFieldReview()
    fieldReviewList.value = Array.isArray(res) ? res : (res?.list || res?.items || res?.data || [])
  } catch (error: any) {
    toast.error(error?.response?.data?.message || '加载复核队列失败')
  } finally {
    fieldReviewLoading.value = false
  }
}

const resolveFieldReview = async (item: Record<string, any>, action: 'approve' | 'reject') => {
  const ok = await confirm({
    title: action === 'approve' ? '采纳该 OCR 抽取值？' : '驳回该 OCR 抽取值？',
    description: `${item.trialName || item.trial_name || item.trialId || item.trial_id || '试验'} · ${item.field || item.fieldName || '字段'}`,
    confirmText: action === 'approve' ? '采纳' : '驳回',
    danger: action === 'reject'
  })
  if (!ok) return
  try {
    await api.resolveAdminTrialFieldReview(item.id, { action })
    fieldReviewList.value = fieldReviewList.value.filter((row) => row.id !== item.id)
    toast.success(action === 'approve' ? '已采纳' : '已驳回')
  } catch (error: any) {
    toast.error(error?.response?.data?.message || '操作失败')
  }
}

const loadOcrFailures = async () => {
  ocrLoading.value = true
  try {
    const res = await api.getAdminOcrFailures()
    ocrFailures.value = Array.isArray(res) ? res : (res?.list || res?.items || res?.data || [])
  } catch (error: any) {
    toast.error(error?.response?.data?.message || '加载 OCR 失败记录失败')
  } finally {
    ocrLoading.value = false
  }
}

const retryOcr = async (item: Record<string, any>) => {
  retryingId.value = item.id
  try {
    await api.retryAdminOcrFailure(item.id)
    ocrFailures.value = ocrFailures.value.filter((row) => row.id !== item.id)
    toast.success('已重新排入 OCR 队列')
  } catch (error: any) {
    toast.error(error?.response?.data?.message || '重试失败')
  } finally {
    retryingId.value = null
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

const formatDateTime = (value: string) => {
  if (!value) return '-'
  try { return new Date(value).toLocaleString('zh-CN', { hour12: false }) } catch { return value }
}

// 新增标签页首次切入时才拉数据，避免进运营页就并发打四五个接口。
const loadedTabs = new Set<string>(['applications', 'cro'])
watch(activeTab, (tab) => {
  if (loadedTabs.has(tab)) return
  loadedTabs.add(tab)
  if (tab === 'billing') loadBilling()
  else if (tab === 'fieldReview') loadFieldReview()
  else if (tab === 'ocrFailures') loadOcrFailures()
})

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

/* CRO 行内价格配置 + 操作按钮组 */
.cro-row-actions,
.cro-edit-actions {
  display: flex;
  gap: var(--s-2);
  flex-shrink: 0;
}

.cro-edit {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--s-2);
  flex: 1;
}

.cro-edit label {
  display: grid;
  gap: var(--s-1);
  color: var(--text-dim);
  font-size: var(--fs-caption);
}

.cro-edit input,
.cro-edit select {
  margin-top: 0;
}

/* 计费结算 */
.billing-grid {
  grid-template-columns: minmax(0, 1fr);
}

.billing-controls {
  display: flex;
  gap: var(--s-2);
  align-items: center;
  flex-wrap: wrap;
}

.billing-controls input {
  margin-top: 0;
}

.billing-summary {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: var(--s-3);
  margin-bottom: var(--s-4);
}

.billing-summary div {
  border: 1px solid var(--line);
  border-radius: var(--r-md);
  background: var(--bg-soft);
  padding: var(--s-3);
  display: grid;
  gap: var(--s-1);
}

.billing-summary span {
  color: var(--text-dim);
  font-size: var(--fs-caption);
}

.billing-summary strong {
  color: var(--text);
  font-size: var(--fs-subtitle);
}

/* 运营页表格（计费结算复用 UsersView 同款表样式） */
.table-wrap {
  overflow-x: auto;
}

.panel table {
  width: 100%;
  min-width: 720px;
  border-collapse: collapse;
}

.panel th,
.panel td {
  border-bottom: 1px solid var(--line);
  padding: var(--s-3) var(--s-2);
  text-align: left;
  vertical-align: top;
  font-size: var(--fs-callout);
  color: var(--text);
}

.panel th {
  color: var(--text-dim);
  font-size: var(--fs-caption);
  font-weight: 600;
  background: var(--bg-soft);
}

@media (max-width: 640px) {
  .cro-edit {
    grid-template-columns: 1fr;
  }
}
</style>
