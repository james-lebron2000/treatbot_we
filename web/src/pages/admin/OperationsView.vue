<template>
  <section class="admin-page">
    <div class="tabs" role="tablist">
      <button
        v-for="tab in tabs"
        :key="tab.key"
        role="tab"
        :aria-selected="activeTab === tab.key"
        :class="{ active: activeTab === tab.key }"
        @click="activeTab = tab.key"
      >
        {{ tab.label }}
      </button>
    </div>

    <section v-if="activeTab === 'applications'" class="panel">
      <div class="panel-heading">
        <h3>申请管理</h3>
        <button class="secondary-btn" :disabled="appsLoading" @click="loadApplications">
          {{ appsLoading ? '加载中…' : '刷新' }}
        </button>
      </div>
      <!-- 骨架行：加载中保持列表骨架，不闪白屏 -->
      <template v-if="appsLoading">
        <div v-for="n in 4" :key="n" class="list-item skeleton-item" aria-hidden="true">
          <div>
            <span class="skeleton-line skeleton-line--title"></span>
            <span class="skeleton-line skeleton-line--meta"></span>
            <span class="skeleton-line skeleton-line--meta"></span>
          </div>
          <span class="skeleton-line skeleton-line--control"></span>
        </div>
        <p class="sr-only" role="status">正在加载申请列表…</p>
      </template>
      <template v-else>
        <article v-for="app in applications" :key="app.id" class="list-item">
          <div>
            <strong>{{ app.trialName || app.trial_name || '未知试验' }}</strong>
            <span>{{ app.userName || app.user_name || '匿名用户' }} · {{ app.userPhone || app.user_phone || '-' }}</span>
            <span>{{ app.diagnosis || '诊断未识别' }} · {{ formatDate(app.createdAt || app.created_at) }}</span>
          </div>
          <select
            class="status-select"
            :value="app.status"
            aria-label="变更申请状态"
            @change="changeStatus(app, ($event.target as HTMLSelectElement).value)"
          >
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
      <form class="panel cro-form" novalidate @submit.prevent="createCro">
        <h3>创建 CRO 公司账号</h3>

        <div class="field">
          <input
            v-model="newCro.name"
            placeholder="公司名称"
            :class="{ invalid: croTouched.name && croErrors.name }"
            :aria-invalid="croTouched.name && !!croErrors.name"
            @blur="croTouched.name = true"
          />
          <span v-if="croTouched.name && croErrors.name" class="field-error">{{ croErrors.name }}</span>
        </div>

        <div class="field">
          <input v-model="newCro.contactName" placeholder="联系人姓名" />
        </div>

        <div class="field">
          <input
            v-model="newCro.email"
            placeholder="登录邮箱"
            type="email"
            inputmode="email"
            autocomplete="email"
            :class="{ invalid: croTouched.email && croErrors.email }"
            :aria-invalid="croTouched.email && !!croErrors.email"
            @blur="croTouched.email = true"
          />
          <span v-if="croTouched.email && croErrors.email" class="field-error">{{ croErrors.email }}</span>
        </div>

        <div class="field">
          <input
            v-model="newCro.password"
            placeholder="密码"
            type="password"
            autocomplete="new-password"
            :class="{ invalid: croTouched.password && croErrors.password }"
            :aria-invalid="croTouched.password && !!croErrors.password"
            @blur="croTouched.password = true"
          />
          <span v-if="croTouched.password && croErrors.password" class="field-error">{{ croErrors.password }}</span>
        </div>

        <div class="field">
          <input v-model="newCro.trialIds" placeholder="负责试验ID，逗号分隔" />
        </div>

        <button class="primary-btn" type="submit" :disabled="!croValid || croSubmitting">
          {{ croSubmitting ? '创建中…' : '创建账号' }}
        </button>
      </form>

      <section class="panel">
        <div class="panel-heading">
          <h3>CRO 列表</h3>
          <button class="secondary-btn" :disabled="croLoading" @click="loadCroList">
            {{ croLoading ? '加载中…' : '刷新' }}
          </button>
        </div>
        <template v-if="croLoading">
          <div v-for="n in 3" :key="n" class="list-item skeleton-item" aria-hidden="true">
            <div>
              <span class="skeleton-line skeleton-line--title"></span>
              <span class="skeleton-line skeleton-line--meta"></span>
            </div>
            <span class="skeleton-line skeleton-line--control"></span>
          </div>
          <p class="sr-only" role="status">正在加载 CRO 列表…</p>
        </template>
        <template v-else>
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
        </template>
      </section>
    </section>

    <section v-if="activeTab === 'export'" class="panel-grid">
      <div class="panel">
        <h3>数据导出</h3>
        <div class="btn-stack">
          <button class="primary-btn" @click="downloadExport('users')">导出用户数据 CSV</button>
          <button class="primary-btn" @click="downloadExport('records')">导出上传数据 CSV</button>
          <button class="primary-btn" @click="downloadExport('applications')">导出申请数据 CSV</button>
        </div>
      </div>
      <div class="panel">
        <h3>按试验导出线索</h3>
        <div class="field">
          <input v-model="exportTrialId" placeholder="输入试验编码" />
        </div>
        <button class="primary-btn" :disabled="!exportTrialId" @click="downloadExport('applications', exportTrialId)">
          导出试验线索
        </button>
      </div>
    </section>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
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
const croLoading = ref(false)
const croSubmitting = ref(false)
const applications = ref<Record<string, any>[]>([])
const croList = ref<Record<string, any>[]>([])
const exportTrialId = ref('')
const newCro = reactive({ name: '', contactName: '', email: '', password: '', trialIds: '' })
// 标记字段是否被用户碰过：未交互前不显示「必填」红字，避免一进表单就报错
const croTouched = reactive({ name: false, email: false, password: false })

// 邮箱格式校验（与后端 zod 规则同源的宽松版：非空 + 基础结构）
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const croErrors = computed(() => ({
  name: !newCro.name.trim() ? '请填写公司名称' : '',
  email: !newCro.email.trim()
    ? '请填写登录邮箱'
    : !EMAIL_RE.test(newCro.email.trim())
      ? '邮箱格式不正确'
      : '',
  password: !newCro.password ? '请设置登录密码' : ''
}))

const croValid = computed(() => !croErrors.value.name && !croErrors.value.email && !croErrors.value.password)

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
  croLoading.value = true
  try {
    const res = await api.getAdminCroList()
    croList.value = Array.isArray(res) ? res : (res?.list || [])
  } finally {
    croLoading.value = false
  }
}

const createCro = async () => {
  // 提交前客户端校验：标记所有受控字段为 touched 以暴露 inline 错误，未通过则中止
  croTouched.name = true
  croTouched.email = true
  croTouched.password = true
  if (!croValid.value) {
    toast.warning('请检查表单：必填项与邮箱格式')
    return
  }
  croSubmitting.value = true
  try {
    await api.createAdminCro({
      name: newCro.name,
      contactName: newCro.contactName,
      email: newCro.email,
      password: newCro.password,
      trialIds: newCro.trialIds.split(',').map((item) => item.trim()).filter(Boolean)
    })
    toast.success(`已创建 CRO 账号：${newCro.name}`)
    newCro.name = ''
    newCro.contactName = ''
    newCro.email = ''
    newCro.password = ''
    newCro.trialIds = ''
    croTouched.name = false
    croTouched.email = false
    croTouched.password = false
    await loadCroList()
  } catch (error: any) {
    toast.error(error?.response?.data?.message || '创建失败')
  } finally {
    croSubmitting.value = false
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

/* 移动端：标签栏横向滚动而非换行挤压，惯性滚动 + 隐藏滚动条 */
.tabs {
  display: flex;
  gap: var(--s-2);
  flex-wrap: wrap;
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
  scrollbar-width: none;
}

.tabs::-webkit-scrollbar {
  display: none;
}

.tabs button,
.secondary-btn {
  border: 1px solid var(--line);
  border-radius: var(--r-md);
  background: var(--bg);
  color: var(--text-dim);
  cursor: pointer;
  min-height: var(--size-tap);
  padding: var(--s-2) var(--s-3);
  font-size: var(--fs-callout);
  font-weight: 500;
  white-space: nowrap;
  transition: border-color 150ms ease, color 150ms ease, background 150ms ease, transform 100ms ease;
}

.tabs button:hover,
.secondary-btn:hover:not(:disabled) {
  border-color: var(--brand);
  color: var(--brand);
}

.secondary-btn:active:not(:disabled) {
  transform: scale(0.98);
}

.secondary-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.tabs button.active,
.primary-btn {
  border: none;
  border-radius: var(--r-md);
  background: var(--brand);
  color: #fff;
  cursor: pointer;
  min-height: var(--size-tap);
  padding: 9px var(--s-3);
  font-size: var(--fs-callout);
  font-weight: 600;
  transition: background 150ms ease, transform 100ms ease;
}

.tabs button.active:hover,
.primary-btn:hover:not(:disabled) {
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
  min-height: var(--size-tap);
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

/* 状态下拉：达 44px 触达，窄屏不被挤窄到不可点 */
.status-select {
  flex-shrink: 0;
  min-width: 116px;
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

/* 仅给 panel 的直接子级 input/button 加间距；.field 内部的 input 由表单 gap 控制 */
.panel > input,
.panel > button {
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

/* ── CRO 表单：字段堆叠 + inline 校验 ─────────────────────── */
.cro-form {
  display: grid;
  gap: var(--s-3);
}

.field {
  display: grid;
  gap: var(--s-1);
}

/* .field 内部 input 占满，间距交给表单 gap，覆盖 .panel > input 的 margin */
.field input {
  width: 100%;
  margin-top: 0;
}

.field input.invalid {
  border-color: var(--red);
}

.field input.invalid:focus {
  border-color: var(--red);
  box-shadow: 0 0 0 3px var(--red-soft);
}

.field-error {
  color: var(--red-text);
  font-size: var(--fs-caption);
  line-height: var(--lh-tight);
}

.btn-stack {
  display: grid;
  gap: var(--s-2);
}

/* ── 加载骨架（沿用全站 shimmer 约定）─────────────────────── */
.skeleton-item {
  pointer-events: none;
}

.skeleton-line {
  display: block;
  background: var(--bg-soft);
  border-radius: var(--r-sm);
  position: relative;
  overflow: hidden;
}

.skeleton-line--title { width: 50%; height: 15px; }
.skeleton-line--meta { width: 72%; height: 12px; }
.skeleton-line--control { width: 64px; height: var(--size-tap); border-radius: var(--r-md); flex-shrink: 0; }

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

/* 窄屏：列表项纵向堆叠，状态下拉占满宽度便于点选 */
@media (max-width: 560px) {
  .list-item {
    flex-direction: column;
    align-items: stretch;
  }

  .status-select,
  .list-item > .secondary-btn {
    width: 100%;
  }
}
</style>
