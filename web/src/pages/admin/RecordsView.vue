<template>
  <section class="admin-page">
    <div v-if="forbidden" class="state-card danger">无管理权限</div>

    <template v-else>
      <form class="toolbar" @submit.prevent="search">
        <label>
          关键词
          <input v-model="filters.keyword" placeholder="诊断 / 基因 / 用户 / 手机号" />
        </label>
        <label>
          用户ID
          <input v-model="filters.userId" placeholder="user_xxx" />
        </label>
        <label>
          解析状态
          <select v-model="filters.status">
            <option value="">全部</option>
            <option value="pending">待解析</option>
            <option value="running">解析中</option>
            <option value="completed">已完成</option>
            <option value="error">解析失败</option>
          </select>
        </label>
        <label>
          开始日期
          <input v-model="filters.startDate" type="date" />
        </label>
        <label>
          结束日期
          <input v-model="filters.endDate" type="date" />
        </label>
        <button class="primary-btn">查询</button>
      </form>

      <section class="panel">
        <div class="panel-heading">
          <h3>上传数据</h3>
          <span>默认不显示用户已删除的病历</span>
        </div>
        <div class="table-scroll">
          <table v-if="loading" class="skeleton-table" aria-hidden="true">
            <thead>
              <tr>
                <th>上传人</th>
                <th>上传时间</th>
                <th>状态</th>
                <th class="col-file">文件</th>
                <th>诊断信息</th>
                <th>匹配 / 报名</th>
                <th class="col-summary">结构化摘要</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="n in 6" :key="n">
                <td v-for="c in 8" :key="c"><span class="skeleton-line"></span></td>
              </tr>
            </tbody>
          </table>
          <table v-else>
            <thead>
              <tr>
                <th>上传人</th>
                <th>上传时间</th>
                <th>状态</th>
                <th class="col-file">文件</th>
                <th>诊断信息</th>
                <th>匹配 / 报名</th>
                <th class="col-summary">结构化摘要</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="record in records" :key="record.recordId">
                <td>
                  <strong>{{ record.userNickname || record.userId || '未知用户' }}</strong>
                  <small>{{ record.userPhone || '-' }}</small>
                  <small>{{ record.userId }}</small>
                </td>
                <td>{{ formatDateTime(record.uploadTime) }}</td>
                <td>
                  <span class="status-pill" :class="record.parseStatus">
                    <span class="status-pill__icon" aria-hidden="true">{{ statusIcon(record.parseStatus) }}</span>
                    {{ statusText(record.parseStatus) }}
                  </span>
                </td>
                <td class="col-file">
                  <strong>{{ record.fileType || '-' }}</strong>
                  <small>{{ fileSize(record.fileSize) }}</small>
                </td>
                <td>
                  <strong>{{ record.diagnosis || '-' }}</strong>
                  <small>{{ record.stage || '-' }}</small>
                  <small>{{ record.geneMutation || '-' }}</small>
                </td>
                <td>{{ record.matchCount || 0 }} / {{ record.applicationCount || 0 }}</td>
                <td class="col-summary">{{ structuredSummary(record) }}</td>
                <td>
                  <a v-if="record.fileUrl" class="text-link" :href="record.fileUrl" target="_blank" rel="noreferrer">查看文件</a>
                  <span v-else class="file-na">文件不可用</span>
                </td>
              </tr>
            </tbody>
          </table>
          <div v-if="!loading && records.length === 0" class="empty">暂无上传数据</div>
        </div>
      </section>

      <div class="pagination">
        <button :disabled="page <= 1" @click="loadRecords(page - 1)">上一页</button>
        <span>第 {{ page }} 页 / 共 {{ totalPages }} 页 · 共 {{ total }} 条</span>
        <button :disabled="page >= totalPages" @click="loadRecords(page + 1)">下一页</button>
      </div>
    </template>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { api } from '../../services/api'

type AdminRecord = Record<string, any>

const route = useRoute()
const router = useRouter()

const loading = ref(false)
const forbidden = ref(false)
const records = ref<AdminRecord[]>([])
const total = ref(0)
const page = ref(1)
const pageSize = 20

const qStr = (v: unknown) => (typeof v === 'string' ? v : Array.isArray(v) ? String(v[0] ?? '') : '')

const filters = reactive({
  keyword: qStr(route.query.keyword),
  userId: qStr(route.query.userId),
  status: qStr(route.query.status),
  startDate: qStr(route.query.startDate),
  endDate: qStr(route.query.endDate)
})

const totalPages = computed(() => Math.max(1, Math.ceil(total.value / pageSize)))

const statusIcon = (status: string) => {
  const map: Record<string, string> = {
    pending: '○',
    running: '◐',
    completed: '✓',
    error: '!'
  }
  return map[status] || '·'
}

// 把当前筛选 / 分页同步到地址栏 query，便于返回时还原上下文（不影响请求逻辑）。
const syncQuery = () => {
  const next: Record<string, string> = {}
  if (filters.keyword) next.keyword = filters.keyword
  if (filters.userId) next.userId = filters.userId
  if (filters.status) next.status = filters.status
  if (filters.startDate) next.startDate = filters.startDate
  if (filters.endDate) next.endDate = filters.endDate
  if (page.value > 1) next.page = String(page.value)
  router.replace({ query: next }).catch(() => {})
}

const loadRecords = async (nextPage = 1) => {
  loading.value = true
  forbidden.value = false
  page.value = nextPage
  syncQuery()
  try {
    const res = await api.getAdminRecords({
      page: page.value,
      pageSize,
      keyword: filters.keyword,
      userId: filters.userId,
      status: filters.status,
      startDate: filters.startDate,
      endDate: filters.endDate
    })
    records.value = res?.list || res?.items || []
    total.value = res?.pagination?.total ?? res?.total ?? records.value.length
  } catch (error: any) {
    if (error?.response?.status === 403) forbidden.value = true
    else throw error
  } finally {
    loading.value = false
  }
}

const search = () => loadRecords(1)

const statusText = (status: string) => {
  const map: Record<string, string> = {
    pending: '待解析',
    running: '解析中',
    completed: '已完成',
    error: '解析失败'
  }
  return map[status] || status || '-'
}

const formatDateTime = (value: string) => {
  if (!value) return '-'
  try { return new Date(value).toLocaleString('zh-CN', { hour12: false }) } catch { return value }
}

const fileSize = (value: number) => {
  if (!value) return '-'
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`
  return `${(value / 1024 / 1024).toFixed(1)} MB`
}

const structuredSummary = (record: AdminRecord) => {
  const entities = record.entities || record.structured?.entities || {}
  const parts = [
    entities.cancerType || record.diagnosis,
    entities.stage || record.stage,
    entities.geneMutation || record.geneMutation,
    entities.treatmentLine ? `${entities.treatmentLine}线` : ''
  ].filter(Boolean)
  return parts.length ? parts.join(' / ') : '-'
}

onMounted(() => {
  const startPage = Number(qStr(route.query.page)) || 1
  loadRecords(startPage > 0 ? startPage : 1)
})
</script>

<style scoped>
.admin-page {
  display: grid;
  gap: var(--s-4);
}

.toolbar,
.panel,
.state-card {
  border: 1px solid var(--line);
  border-radius: var(--r-md);
  background: var(--bg);
  padding: var(--s-4);
  box-shadow: var(--shadow-1);
}

.toolbar {
  display: flex;
  align-items: end;
  gap: var(--s-3);
  flex-wrap: wrap;
}

.toolbar label {
  display: grid;
  gap: var(--s-1);
  flex: 1 1 150px;
  min-width: 150px;
  color: var(--text-dim);
  font-size: var(--fs-callout);
}

.toolbar input,
.toolbar select {
  border: 1px solid var(--line);
  border-radius: var(--r-md);
  padding: var(--s-2) var(--s-3);
  min-height: var(--size-tap);
  font-family: inherit;
  font-size: var(--fs-callout);
  color: var(--text);
  background: var(--bg);
  transition: border-color 150ms ease, box-shadow 150ms ease;
}

.toolbar input:focus,
.toolbar select:focus {
  outline: none;
  border-color: var(--brand);
  box-shadow: var(--shadow-focus);
}

.primary-btn,
.pagination button {
  border: none;
  border-radius: var(--r-md);
  background: var(--brand);
  color: #fff;
  cursor: pointer;
  padding: 10px var(--s-4);
  min-height: var(--size-tap);
  font-size: var(--fs-callout);
  font-weight: 600;
  transition: background 150ms ease, transform 100ms ease;
}

.primary-btn:hover,
.pagination button:hover:not(:disabled) {
  background: var(--brand-hover);
}

.primary-btn:active,
.pagination button:active:not(:disabled) {
  transform: scale(0.98);
}

.pagination button:disabled {
  background: var(--text-muted);
  cursor: not-allowed;
  opacity: 0.5;
}

.panel-heading {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: var(--s-3);
}

.panel-heading h3 {
  margin: 0;
  font-size: var(--fs-subtitle);
  color: var(--text);
}

.panel-heading span,
td small {
  color: var(--text-dim);
  font-size: var(--fs-caption);
}

/* 横向滚动容器：窄屏不撑破布局，右侧渐隐提示「可横向滚动」。 */
.table-scroll {
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
  overscroll-behavior-x: contain;
  background:
    linear-gradient(to right, var(--bg) 30%, transparent),
    linear-gradient(to left, var(--bg-soft), transparent 60%) right / 40px 100% no-repeat;
}

table {
  width: 100%;
  min-width: 1100px;
  border-collapse: collapse;
}

th,
td {
  border-bottom: 1px solid var(--line);
  padding: var(--s-3) var(--s-2);
  text-align: left;
  vertical-align: top;
  font-size: var(--fs-callout);
  color: var(--text);
}

th {
  color: var(--text-dim);
  font-size: var(--fs-caption);
  font-weight: 600;
  background: var(--bg-soft);
}

table:not(.skeleton-table) td:first-child,
table:not(.skeleton-table) td:nth-child(4),
table:not(.skeleton-table) td:nth-child(5) {
  display: grid;
  gap: var(--s-1);
}

.skeleton-table td {
  vertical-align: middle;
}

.status-pill {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  border-radius: var(--r-pill);
  padding: 3px var(--s-2);
  background: var(--brand-soft);
  color: var(--brand-hover);
  font-size: var(--fs-caption);
  font-weight: 600;
  white-space: nowrap;
}

.status-pill__icon {
  font-size: var(--fs-caption);
  line-height: 1;
}

.status-pill.completed {
  background: var(--mint-soft);
  color: var(--mint-text);
}

.status-pill.error {
  background: var(--red-soft);
  color: var(--red-text);
}

.status-pill.running {
  background: var(--amber-soft);
  color: var(--amber-text);
}

.text-link {
  display: inline-flex;
  align-items: center;
  min-height: var(--size-tap);
  color: var(--brand);
  font-weight: 600;
  font-size: var(--fs-callout);
  transition: color 150ms ease;
}

.text-link:hover {
  color: var(--brand-hover);
}

.file-na {
  color: var(--text-muted);
  font-size: var(--fs-caption);
  font-style: italic;
}

/* ── 加载骨架 ───────────────────────────────────────────── */
.skeleton-line {
  display: block;
  height: 14px;
  width: 80%;
  border-radius: var(--r-sm);
  background: var(--bg-soft);
  position: relative;
  overflow: hidden;
}

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

@media (prefers-reduced-motion: reduce) {
  .skeleton-line::after { animation: none; }
}

.pagination {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: var(--s-3);
  color: var(--text-dim);
  font-size: var(--fs-callout);
}

.empty {
  color: var(--text-muted);
  padding: var(--s-4) var(--s-1);
  font-size: var(--fs-callout);
}

.danger {
  color: var(--red);
  background: var(--red-soft);
  border-color: var(--red);
}

/* 窄屏隐藏低优先级列（保留在 DOM 中，仅 CSS 隐藏）。 */
@media (max-width: 768px) {
  .col-file,
  .col-summary {
    display: none;
  }

  table {
    min-width: 720px;
  }
}

@media (max-width: 640px) {
  .toolbar {
    flex-direction: column;
    align-items: stretch;
  }

  .toolbar label {
    min-width: 0;
  }

  .primary-btn {
    width: 100%;
  }

  .pagination {
    justify-content: space-between;
  }
}
</style>
