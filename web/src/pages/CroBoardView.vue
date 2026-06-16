<template>
  <div class="cro-console">
    <!-- 顶部条：公司名 + 试验选择 + 退出（sticky） -->
    <header class="topbar">
      <div class="topbar__brand">
        <span class="topbar__dot" aria-hidden="true" />
        <h1 class="topbar__title">{{ companyName || 'CRO' }}</h1>
        <span class="topbar__sub">入组看板</span>
      </div>

      <div class="topbar__controls">
        <label class="trial-select">
          <span class="trial-select__label">试验</span>
          <select v-model="selectedTrialId" @change="loadBoard" class="select select--trial">
            <option value="">-- 选择试验 --</option>
            <option v-for="t in trials" :key="t.id" :value="t.id">
              {{ t.name }}（{{ t.applicationCount ?? 0 }}人）
            </option>
          </select>
        </label>
        <button class="btn btn--ghost btn--logout" @click="logout">退出</button>
      </div>
    </header>

    <!-- 未选试验：空状态 -->
    <div v-if="!selectedTrialId" class="empty empty--page">
      <div class="empty__icon" aria-hidden="true">&#x1F4CB;</div>
      <p class="empty__title">请选择试验</p>
      <p class="empty__hint">从上方选择一个试验，查看其患者入组申请。</p>
    </div>

    <template v-else>
      <!-- 工具栏：搜索 + 状态筛选 + 导出 -->
      <div class="toolbar">
        <div class="toolbar__search">
          <span class="toolbar__search-icon" aria-hidden="true">&#x1F50D;</span>
          <input
            v-model="search"
            type="search"
            class="input input--search"
            placeholder="搜索患者姓名 / 病情 / 基因"
            aria-label="搜索申请"
          />
          <button
            v-if="search"
            class="toolbar__search-clear"
            type="button"
            aria-label="清除搜索"
            @click="search = ''"
          >&times;</button>
        </div>

        <div class="toolbar__filters" role="group" aria-label="按状态筛选">
          <button
            v-for="s in statusList"
            :key="s.key"
            type="button"
            class="chip-filter"
            :class="{ 'chip-filter--on': activeStatuses.has(s.key), [`chip-filter--${s.tone}`]: activeStatuses.has(s.key) }"
            :aria-pressed="activeStatuses.has(s.key)"
            @click="toggleStatus(s.key)"
          >
            {{ s.label }}
            <span class="chip-filter__count">{{ counts[s.key] }}</span>
          </button>
          <button
            v-if="activeStatuses.size"
            type="button"
            class="chip-filter chip-filter--reset"
            @click="activeStatuses = new Set()"
          >清除筛选</button>
        </div>

        <button class="btn btn--primary btn--export" @click="exportTrial">
          <span aria-hidden="true">&#x2B07;</span> 导出 CSV
        </button>
      </div>

      <!-- 加载态 -->
      <div v-if="boardLoading" class="empty empty--block">
        <span class="spinner spinner--lg" aria-hidden="true" />
        <p class="empty__hint">加载中…</p>
      </div>

      <!-- 空结果 -->
      <div v-else-if="!visibleApps.length" class="empty empty--block">
        <p class="empty__title">{{ rawApps.length ? '没有符合条件的申请' : '暂无该状态的申请' }}</p>
        <p class="empty__hint" v-if="rawApps.length">试着调整搜索词或清除状态筛选。</p>
      </div>

      <template v-else>
        <!-- ===== 桌面：表格（≥768px） ===== -->
        <div class="table-wrap">
          <table class="apps-table">
            <thead>
              <tr>
                <th class="th th--sortable" :aria-sort="ariaSort('name')" @click="toggleSort('name')">
                  患者 <span class="th__arrow">{{ sortArrow('name') }}</span>
                </th>
                <th class="th">病情</th>
                <th class="th th--sortable" :aria-sort="ariaSort('createdAt')" @click="toggleSort('createdAt')">
                  申请时间 <span class="th__arrow">{{ sortArrow('createdAt') }}</span>
                </th>
                <th class="th th--sortable" :aria-sort="ariaSort('status')" @click="toggleSort('status')">
                  状态 <span class="th__arrow">{{ sortArrow('status') }}</span>
                </th>
                <th class="th th--notes">备注 / 操作</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="app in visibleApps"
                :key="app.id"
                class="row"
                :class="{ 'row--busy': !!rowLoading[app.id] }"
              >
                <!-- 患者 -->
                <td class="td td--patient">
                  <div class="patient">
                    <span class="patient__name">{{ app.userName || '—' }}</span>
                    <a v-if="app.userPhone" :href="'tel:' + app.userPhone" class="patient__phone">
                      <span aria-hidden="true">&#x1F4DE;</span> {{ app.userPhone }}
                    </a>
                  </div>
                </td>

                <!-- 病情 chips -->
                <td class="td">
                  <div class="chips">
                    <span v-if="app.diagnosis" class="chip">{{ app.diagnosis }}</span>
                    <span v-if="app.stage" class="chip">{{ app.stage }}</span>
                    <span v-if="app.geneMutation" class="chip chip--amber">{{ app.geneMutation }}</span>
                    <span v-if="app.treatmentLine" class="chip chip--lilac">{{ app.treatmentLine }}线</span>
                    <span v-if="app.pdl1" class="chip chip--mint">PD-L1: {{ app.pdl1 }}</span>
                    <span v-if="!hasClinical(app)" class="chip chip--empty">无病情信息</span>
                  </div>
                </td>

                <!-- 申请时间 -->
                <td class="td td--time">{{ formatTime(app.createdAt) }}</td>

                <!-- 状态：Pill + select -->
                <td class="td td--status">
                  <div class="status-cell">
                    <StatusPill :status="app.status" audience="cro" />
                    <div class="status-edit">
                      <select
                        class="select select--status"
                        :value="app.status"
                        :disabled="!!rowLoading[app.id]"
                        @change="changeStatus(app, ($event.target as HTMLSelectElement).value)"
                      >
                        <option v-for="s in statusList" :key="s.key" :value="s.key">{{ s.label }}</option>
                      </select>
                      <span v-if="rowLoading[app.id]" class="spinner" aria-label="更新中" />
                    </div>
                  </div>
                </td>

                <!-- 备注 / 操作 -->
                <td class="td td--notes">
                  <div class="notes">
                    <div v-if="app.notes && app.notes.length" class="notes__list">
                      <div v-for="(note, ni) in app.notes" :key="ni" class="note">
                        <span class="note__content">{{ note.content }}</span>
                        <time class="note__time">{{ formatTime(note.createdAt) }}</time>
                      </div>
                    </div>
                    <p v-else class="notes__empty">暂无备注</p>

                    <div class="note-add">
                      <input
                        v-model="noteInputs[app.id]"
                        class="input input--note"
                        placeholder="添加备注…"
                        @keyup.enter="addNote(app)"
                      />
                      <button
                        class="btn btn--secondary btn--note"
                        :disabled="!noteInputs[app.id] || !!noteLoading[app.id]"
                        @click="addNote(app)"
                      >
                        <span v-if="noteLoading[app.id]" class="spinner" aria-hidden="true" />
                        <span v-else>记录</span>
                      </button>
                    </div>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- ===== 移动：卡片列表（<768px） ===== -->
        <ul class="cards">
          <li
            v-for="app in visibleApps"
            :key="app.id"
            class="appcard"
            :class="{ 'appcard--busy': !!rowLoading[app.id] }"
          >
            <div class="appcard__head">
              <div class="patient">
                <span class="patient__name">{{ app.userName || '—' }}</span>
                <a v-if="app.userPhone" :href="'tel:' + app.userPhone" class="patient__phone">
                  <span aria-hidden="true">&#x1F4DE;</span> {{ app.userPhone }}
                </a>
              </div>
              <StatusPill :status="app.status" audience="cro" />
            </div>

            <div class="chips chips--card">
              <span v-if="app.diagnosis" class="chip">{{ app.diagnosis }}</span>
              <span v-if="app.stage" class="chip">{{ app.stage }}</span>
              <span v-if="app.geneMutation" class="chip chip--amber">{{ app.geneMutation }}</span>
              <span v-if="app.treatmentLine" class="chip chip--lilac">{{ app.treatmentLine }}线</span>
              <span v-if="app.pdl1" class="chip chip--mint">PD-L1: {{ app.pdl1 }}</span>
            </div>

            <div class="appcard__meta">申请时间：{{ formatTime(app.createdAt) }}</div>

            <div class="appcard__status">
              <label class="appcard__status-label">变更状态</label>
              <div class="status-edit">
                <select
                  class="select select--status"
                  :value="app.status"
                  :disabled="!!rowLoading[app.id]"
                  @change="changeStatus(app, ($event.target as HTMLSelectElement).value)"
                >
                  <option v-for="s in statusList" :key="s.key" :value="s.key">{{ s.label }}</option>
                </select>
                <span v-if="rowLoading[app.id]" class="spinner" aria-label="更新中" />
              </div>
            </div>

            <div class="notes notes--card">
              <div v-if="app.notes && app.notes.length" class="notes__list">
                <div v-for="(note, ni) in app.notes" :key="ni" class="note">
                  <span class="note__content">{{ note.content }}</span>
                  <time class="note__time">{{ formatTime(note.createdAt) }}</time>
                </div>
              </div>
              <p v-else class="notes__empty">暂无备注</p>

              <div class="note-add">
                <input
                  v-model="noteInputs[app.id]"
                  class="input input--note"
                  placeholder="添加备注…"
                  @keyup.enter="addNote(app)"
                />
                <button
                  class="btn btn--secondary btn--note"
                  :disabled="!noteInputs[app.id] || !!noteLoading[app.id]"
                  @click="addNote(app)"
                >
                  <span v-if="noteLoading[app.id]" class="spinner" aria-hidden="true" />
                  <span v-else>记录</span>
                </button>
              </div>
            </div>
          </li>
        </ul>
      </template>
    </template>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref, reactive, computed } from 'vue'
import { useRouter } from 'vue-router'
import { api } from '../services/api'
import { croHttp } from '../services/api'
import StatusPill from '../components/StatusPill.vue'
import { useToast } from '../composables/useToast'

type SortKey = 'name' | 'createdAt' | 'status'
type StatusKey = 'pending' | 'contacted' | 'enrolled' | 'rejected' | 'cancelled'

const router = useRouter()
const toast = useToast()

const companyName = ref('')
const trials = ref<Record<string, any>[]>([])
const selectedTrialId = ref('')
const boardLoading = ref(false)

// 后端按状态分组返回；前端拍平成一个列表做搜索 / 排序 / 多状态筛选。
const grouped = reactive<Record<string, any[]>>({
  pending: [], contacted: [], enrolled: [], rejected: [], cancelled: []
})

const noteInputs = reactive<Record<string, string>>({})
const rowLoading = reactive<Record<string, boolean>>({})   // 状态变更进行中
const noteLoading = reactive<Record<string, boolean>>({})  // 备注提交进行中

// 搜索 / 筛选 / 排序状态
const search = ref('')
const activeStatuses = ref<Set<string>>(new Set())          // 空集 = 全部状态
const sortKey = ref<SortKey>('createdAt')
const sortDir = ref<'asc' | 'desc'>('desc')

// 五个规范状态键（与后端 grouped 形状一致）。tone 来自 shared/copy/statuses。
const statusList: { key: StatusKey; label: string; tone: string }[] = [
  { key: 'pending', label: '待筛查', tone: 'amber' },
  { key: 'contacted', label: '已联系', tone: 'brand' },
  { key: 'enrolled', label: '已入组', tone: 'mint' },
  { key: 'rejected', label: '已排除', tone: 'red' },
  { key: 'cancelled', label: '已取消', tone: 'muted' }
]
const STATUS_RANK: Record<string, number> = {
  pending: 0, contacted: 1, enrolled: 2, rejected: 3, cancelled: 4
}

const formatTime = (t: string) => {
  if (!t) return ''
  try {
    const d = new Date(t)
    return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`
  } catch { return t }
}

const hasClinical = (app: any) =>
  !!(app.diagnosis || app.stage || app.geneMutation || app.treatmentLine || app.pdl1)

// 拍平所有分组为单一列表
const rawApps = computed<any[]>(() => {
  const out: any[] = []
  for (const s of Object.keys(grouped)) out.push(...grouped[s])
  return out
})

// 每个状态的计数（用于筛选 chip 上的数字）
const counts = computed<Record<string, number>>(() => {
  const c: Record<string, number> = {}
  for (const s of statusList) c[s.key] = (grouped[s.key] || []).length
  return c
})

// 搜索 + 状态筛选 + 排序
const visibleApps = computed<any[]>(() => {
  let list = rawApps.value

  // 状态筛选：空集表示全部
  if (activeStatuses.value.size) {
    list = list.filter(a => activeStatuses.value.has(a.status))
  }

  // 客户端搜索：姓名 / 诊断 / 基因
  const q = search.value.trim().toLowerCase()
  if (q) {
    list = list.filter(a =>
      [a.userName, a.diagnosis, a.geneMutation]
        .filter(Boolean)
        .some((v: string) => String(v).toLowerCase().includes(q))
    )
  }

  // 排序（不修改原数组）
  const dir = sortDir.value === 'asc' ? 1 : -1
  return [...list].sort((a, b) => {
    let cmp = 0
    if (sortKey.value === 'name') {
      cmp = String(a.userName || '').localeCompare(String(b.userName || ''), 'zh-Hans-CN')
    } else if (sortKey.value === 'status') {
      cmp = (STATUS_RANK[a.status] ?? 99) - (STATUS_RANK[b.status] ?? 99)
    } else {
      cmp = new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime()
    }
    return cmp * dir
  })
})

const toggleStatus = (key: string) => {
  const next = new Set(activeStatuses.value)
  if (next.has(key)) next.delete(key)
  else next.add(key)
  activeStatuses.value = next
}

const toggleSort = (key: SortKey) => {
  if (sortKey.value === key) {
    sortDir.value = sortDir.value === 'asc' ? 'desc' : 'asc'
  } else {
    sortKey.value = key
    // 时间默认倒序（新→旧），文本默认正序
    sortDir.value = key === 'createdAt' ? 'desc' : 'asc'
  }
}
const sortArrow = (key: SortKey) => (sortKey.value === key ? (sortDir.value === 'asc' ? '↑' : '↓') : '↕')
const ariaSort = (key: SortKey) =>
  sortKey.value === key ? (sortDir.value === 'asc' ? 'ascending' : 'descending') : 'none'

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
  } catch {
    toast.error('加载看板失败，请重试')
  } finally {
    boardLoading.value = false
  }
}

// 乐观更新：先在本地把申请移到新状态 + 标记该行 loading；
// 成功 → success toast；失败 → 回滚到原状态 + error toast。
const changeStatus = async (app: any, newStatus: string) => {
  const oldStatus = app.status
  if (newStatus === oldStatus) return

  // 乐观移动
  const fromList = grouped[oldStatus]
  const idx = fromList ? fromList.findIndex((a: any) => a.id === app.id) : -1
  if (idx >= 0) fromList.splice(idx, 1)
  app.status = newStatus
  if (grouped[newStatus]) grouped[newStatus].push(app)
  rowLoading[app.id] = true

  try {
    await api.updateCroApplicationStatus(app.id, newStatus)
    toast.success('状态已更新')
  } catch (e: any) {
    // 回滚
    const undoList = grouped[newStatus]
    const undoIdx = undoList ? undoList.findIndex((a: any) => a.id === app.id) : -1
    if (undoIdx >= 0) undoList.splice(undoIdx, 1)
    app.status = oldStatus
    if (grouped[oldStatus]) grouped[oldStatus].push(app)
    toast.error(e?.response?.data?.message || '更新失败，已回滚')
  } finally {
    rowLoading[app.id] = false
  }
}

const addNote = async (app: any) => {
  const content = noteInputs[app.id]?.trim()
  if (!content || noteLoading[app.id]) return
  noteLoading[app.id] = true
  try {
    const res = await api.addCroNote(app.id, content)
    app.notes = res?.notes || [...(app.notes || []), { content, createdAt: new Date().toISOString() }]
    noteInputs[app.id] = ''
    toast.success('备注已记录')
  } catch (e: any) {
    toast.error(e?.response?.data?.message || '添加失败')
  } finally {
    noteLoading[app.id] = false
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
    toast.success('已开始导出 CSV')
  } catch {
    toast.error('导出失败')
  }
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

<style scoped>
/* token-only：所有颜色 / 圆角 / 间距走 tokens.css，无裸 hex（除 #fff）。
   移动优先：默认渲染卡片列表，≥768px 切换到表格。 */
.cro-console {
  display: flex;
  flex-direction: column;
  gap: var(--s-4);
  color: var(--text);
  font-family: var(--font-sans);
}

/* ===== 顶部条 ===== */
.topbar {
  position: sticky;
  top: 0;
  z-index: 20;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--s-3);
  padding: var(--s-3) 0;
  background: var(--bg);
  border-bottom: 1px solid var(--line);
}
.topbar__brand {
  display: flex;
  align-items: baseline;
  gap: var(--s-2);
  min-width: 0;
}
.topbar__dot {
  align-self: center;
  width: 10px;
  height: 10px;
  border-radius: var(--r-pill);
  background: var(--brand);
  flex: none;
}
.topbar__title {
  margin: 0;
  font-size: var(--fs-subtitle);
  font-weight: 700;
  line-height: var(--lh-tight);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.topbar__sub {
  font-size: var(--fs-caption);
  color: var(--text-muted);
  white-space: nowrap;
}
.topbar__controls {
  display: flex;
  align-items: center;
  gap: var(--s-2);
  flex: 1 1 auto;
  justify-content: flex-end;
  min-width: 0;
}
.trial-select {
  display: flex;
  align-items: center;
  gap: var(--s-2);
  min-width: 0;
  flex: 1 1 auto;
  max-width: 420px;
}
.trial-select__label {
  font-size: var(--fs-caption);
  color: var(--text-dim);
  flex: none;
}

/* ===== 通用控件 ===== */
.select {
  font-family: inherit;
  font-size: var(--fs-callout);
  color: var(--text);
  background: var(--bg);
  border: 1px solid var(--line);
  border-radius: var(--r-sm);
  padding: 0 var(--s-2);
  height: var(--size-tap);
  cursor: pointer;
  max-width: 100%;
}
.select:focus-visible { outline: none; box-shadow: var(--shadow-focus); border-color: var(--brand); }
.select--trial { flex: 1 1 auto; min-width: 0; }
.select--status {
  height: 36px;
  font-size: var(--fs-caption);
  min-width: 92px;
}
.select:disabled { opacity: 0.6; cursor: progress; }

.input {
  font-family: inherit;
  font-size: var(--fs-callout);
  color: var(--text);
  background: var(--bg);
  border: 1px solid var(--line);
  border-radius: var(--r-sm);
  padding: 0 var(--s-3);
  height: var(--size-tap);
}
.input:focus-visible { outline: none; box-shadow: var(--shadow-focus); border-color: var(--brand); }

.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--s-1);
  font-family: inherit;
  font-size: var(--fs-callout);
  font-weight: 600;
  border: 1px solid transparent;
  border-radius: var(--r-md);
  cursor: pointer;
  white-space: nowrap;
  min-height: var(--size-tap);
  padding: 0 var(--s-4);
  transition: background-color .15s, color .15s, border-color .15s;
  -webkit-tap-highlight-color: transparent;
}
.btn:focus-visible { outline: none; box-shadow: var(--shadow-focus); }
.btn:disabled { opacity: .5; cursor: not-allowed; }
.btn--primary { background: var(--brand); color: #fff; }
.btn--primary:hover:not(:disabled) { background: var(--brand-hover); }
.btn--secondary { background: var(--brand-soft); color: var(--brand); }
.btn--secondary:hover:not(:disabled) { filter: brightness(0.96); }
.btn--ghost { background: var(--bg); color: var(--text-dim); border-color: var(--line); }
.btn--ghost:hover:not(:disabled) { background: var(--bg-soft); }
.btn--logout { flex: none; }

/* ===== 工具栏 ===== */
.toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--s-3);
}
.toolbar__search {
  position: relative;
  flex: 1 1 240px;
  min-width: 0;
}
.input--search { width: 100%; padding-left: var(--s-8); padding-right: var(--s-8); }
.toolbar__search-icon {
  position: absolute;
  left: var(--s-3);
  top: 50%;
  transform: translateY(-50%);
  font-size: var(--fs-callout);
  color: var(--text-muted);
  pointer-events: none;
}
.toolbar__search-clear {
  position: absolute;
  right: var(--s-2);
  top: 50%;
  transform: translateY(-50%);
  width: 28px;
  height: 28px;
  border: none;
  border-radius: var(--r-pill);
  background: var(--bg-soft);
  color: var(--text-dim);
  font-size: var(--fs-subtitle);
  line-height: 1;
  cursor: pointer;
}
.toolbar__search-clear:hover { color: var(--text); }

.toolbar__filters {
  display: flex;
  flex-wrap: wrap;
  gap: var(--s-2);
  align-items: center;
}
.chip-filter {
  display: inline-flex;
  align-items: center;
  gap: var(--s-1);
  min-height: 36px;
  padding: 0 var(--s-3);
  font-family: inherit;
  font-size: var(--fs-caption);
  font-weight: 600;
  color: var(--text-dim);
  background: var(--bg-soft);
  border: 1px solid var(--line);
  border-radius: var(--r-pill);
  cursor: pointer;
  transition: background-color .15s, color .15s, border-color .15s;
}
.chip-filter:hover { border-color: var(--text-muted); }
.chip-filter:focus-visible { outline: none; box-shadow: var(--shadow-focus); }
.chip-filter__count {
  font-variant-numeric: tabular-nums;
  background: var(--bg);
  border-radius: var(--r-pill);
  padding: 0 var(--s-2);
  min-width: 20px;
  text-align: center;
  border: 1px solid var(--line);
}
.chip-filter--on { color: #fff; }
.chip-filter--on .chip-filter__count { background: rgba(255,255,255,0.22); border-color: transparent; color: #fff; }
.chip-filter--amber.chip-filter--on { background: var(--amber); border-color: var(--amber); }
.chip-filter--brand.chip-filter--on { background: var(--brand); border-color: var(--brand); }
.chip-filter--mint.chip-filter--on { background: var(--mint); border-color: var(--mint); }
.chip-filter--red.chip-filter--on { background: var(--red); border-color: var(--red); }
.chip-filter--muted.chip-filter--on { background: var(--text-dim); border-color: var(--text-dim); }
.chip-filter--reset { color: var(--text-muted); background: transparent; border-style: dashed; }

.btn--export { margin-left: auto; flex: none; }

/* ===== 空 / 加载态 ===== */
.empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--s-2);
  text-align: center;
  border: 1px dashed var(--line);
  border-radius: var(--r-lg);
  background: var(--bg-soft);
}
.empty--page { padding: var(--s-12) var(--s-4); }
.empty--block { padding: var(--s-8) var(--s-4); }
.empty__icon { font-size: 32px; }
.empty__title { margin: 0; font-size: var(--fs-subtitle); font-weight: 600; color: var(--text); }
.empty__hint { margin: 0; font-size: var(--fs-callout); color: var(--text-muted); }

/* ===== 患者 / chips（表格 & 卡片共用） ===== */
.patient { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.patient__name { font-weight: 600; font-size: var(--fs-body); }
.patient__phone {
  display: inline-flex;
  align-items: center;
  gap: var(--s-1);
  font-size: var(--fs-caption);
  color: var(--brand);
  text-decoration: none;
}
.patient__phone:hover { text-decoration: underline; }

.chips { display: flex; flex-wrap: wrap; gap: var(--s-1); }
.chip {
  display: inline-block;
  padding: 2px var(--s-2);
  font-size: var(--fs-caption);
  line-height: var(--lh-tight);
  border-radius: var(--r-sm);
  background: var(--bg-soft);
  color: var(--text-dim);
  white-space: nowrap;
}
.chip--amber { background: var(--amber-soft); color: var(--amber-text); }
.chip--lilac { background: var(--lilac-soft); color: var(--lilac-text); }
.chip--mint { background: var(--mint-soft); color: var(--mint-text); }
.chip--empty { background: transparent; color: var(--text-muted); font-style: italic; }

/* ===== 状态单元 ===== */
.status-cell { display: flex; flex-direction: column; gap: var(--s-2); align-items: flex-start; }
.status-edit { display: inline-flex; align-items: center; gap: var(--s-2); }

/* ===== 备注 ===== */
.notes { display: flex; flex-direction: column; gap: var(--s-2); min-width: 0; }
.notes__list {
  display: flex;
  flex-direction: column;
  gap: var(--s-1);
  max-height: 132px;
  overflow-y: auto;
  padding-right: var(--s-1);
}
.note {
  display: flex;
  justify-content: space-between;
  gap: var(--s-2);
  font-size: var(--fs-caption);
  color: var(--text-dim);
  border-left: 2px solid var(--line);
  padding-left: var(--s-2);
}
.note__content { word-break: break-word; }
.note__time { color: var(--text-muted); white-space: nowrap; flex: none; }
.notes__empty { margin: 0; font-size: var(--fs-caption); color: var(--text-muted); }
.note-add { display: flex; gap: var(--s-2); }
.input--note { flex: 1 1 auto; min-width: 0; height: 36px; font-size: var(--fs-caption); }
.btn--note { flex: none; min-height: 36px; padding: 0 var(--s-3); }

/* ===== 旋转指示器 ===== */
.spinner {
  width: 14px;
  height: 14px;
  border: 2px solid var(--brand);
  border-right-color: transparent;
  border-radius: 50%;
  animation: cro-spin .7s linear infinite;
  flex: none;
}
.spinner--lg { width: 24px; height: 24px; border-width: 3px; }
@keyframes cro-spin { to { transform: rotate(360deg); } }

/* ===== 表格（桌面） —— 默认隐藏，≥768px 显示 ===== */
.table-wrap { display: none; }
.cards { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: var(--s-3); }

/* ===== 卡片（移动） ===== */
.appcard {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: var(--s-3);
  padding: var(--s-4);
  border: 1px solid var(--line);
  border-radius: var(--r-lg);
  background: var(--bg);
  box-shadow: var(--shadow-1);
  transition: opacity .15s;
}
.appcard--busy { opacity: .7; }
.appcard__head { display: flex; justify-content: space-between; align-items: flex-start; gap: var(--s-2); }
.appcard__meta { font-size: var(--fs-caption); color: var(--text-muted); }
.appcard__status { display: flex; flex-direction: column; gap: var(--s-1); }
.appcard__status-label { font-size: var(--fs-caption); color: var(--text-dim); font-weight: 600; }
.notes--card { border-top: 1px solid var(--line); padding-top: var(--s-3); }

@media (min-width: 768px) {
  .cards { display: none; }
  .table-wrap {
    display: block;
    border: 1px solid var(--line);
    border-radius: var(--r-lg);
    overflow: hidden;
    background: var(--bg);
    box-shadow: var(--shadow-1);
  }
  .apps-table {
    width: 100%;
    border-collapse: collapse;
    font-size: var(--fs-callout);
  }
  .th {
    text-align: left;
    font-size: var(--fs-caption);
    font-weight: 600;
    color: var(--text-dim);
    background: var(--bg-soft);
    padding: var(--s-3);
    border-bottom: 1px solid var(--line);
    white-space: nowrap;
    position: sticky;
    top: 0;
    z-index: 1;
  }
  .th--sortable { cursor: pointer; user-select: none; }
  .th--sortable:hover { color: var(--text); }
  .th__arrow { color: var(--text-muted); margin-left: 2px; }
  .th--notes { width: 34%; }
  .td {
    padding: var(--s-3);
    border-bottom: 1px solid var(--line);
    vertical-align: top;
  }
  .row:last-child .td { border-bottom: none; }
  .row:hover .td { background: var(--bg-soft); }
  .row--busy { opacity: .7; }
  .td--time { color: var(--text-muted); font-size: var(--fs-caption); white-space: nowrap; }
  .td--patient { min-width: 140px; }
}

@media (prefers-reduced-motion: reduce) {
  .spinner { animation-duration: 1.4s; }
  .appcard, .btn, .select, .input { transition: none; }
}
</style>
