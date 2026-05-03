<template>
  <section class="admin-page">
    <div v-if="forbidden" class="state-card danger">无管理权限</div>

    <template v-else>
      <form class="toolbar" @submit.prevent="search">
        <label>
          关键词
          <input v-model="filters.keyword" placeholder="昵称 / 手机号 / 用户ID" />
        </label>
        <label>
          上传状态
          <select v-model="filters.hasRecords">
            <option value="">全部活跃用户</option>
            <option value="true">仅上传过数据</option>
            <option value="false">未上传数据</option>
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
        <label class="checkbox-label">
          <input v-model="filters.includeDeleted" type="checkbox" />
          包含注销用户
        </label>
        <button class="primary-btn">查询</button>
      </form>

      <section class="panel">
        <div class="panel-heading">
          <h3>注册用户</h3>
          <span>共 {{ total }} 人</span>
        </div>
        <div v-if="loading" class="state-card">加载中...</div>
        <div v-else class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>用户</th>
                <th>手机号</th>
                <th>上传数</th>
                <th>解析完成</th>
                <th>报名</th>
                <th>最近诊断</th>
                <th>注册时间</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="user in users" :key="user.userId">
                <td>
                  <strong>{{ user.nickname || user.userId }}</strong>
                  <small>{{ user.userId }}</small>
                </td>
                <td>{{ user.phone || '-' }}</td>
                <td>{{ user.recordCount || 0 }}</td>
                <td>{{ user.completedRecordCount || 0 }}</td>
                <td>{{ user.applicationCount || 0 }}</td>
                <td>{{ user.latestDiagnosis || '-' }}</td>
                <td>{{ formatDate(user.createdAt) }}</td>
                <td>
                  <button class="text-btn" type="button" @click="openDetail(user)">查看详情</button>
                </td>
              </tr>
            </tbody>
          </table>
          <div v-if="users.length === 0" class="empty">暂无用户</div>
        </div>
      </section>

      <div class="pagination">
        <button :disabled="page <= 1" @click="loadUsers(page - 1)">上一页</button>
        <span>第 {{ page }} 页 / 共 {{ totalPages }} 页</span>
        <button :disabled="page >= totalPages" @click="loadUsers(page + 1)">下一页</button>
      </div>
    </template>

    <aside v-if="selectedUser" class="drawer" aria-label="用户详情">
      <div class="drawer-backdrop" @click="closeDetail"></div>
      <section class="drawer-panel">
        <header>
          <div>
            <p>用户详情</p>
            <h3>{{ selectedUser.nickname || selectedUser.userId }}</h3>
          </div>
          <button class="icon-btn" type="button" @click="closeDetail">×</button>
        </header>

        <div class="detail-grid">
          <div>
            <span>用户ID</span>
            <strong>{{ selectedUser.userId }}</strong>
          </div>
          <div>
            <span>手机号</span>
            <strong>{{ revealedPhone || selectedUser.phone || '-' }}</strong>
            <button class="text-btn" type="button" @click="revealPhone">揭示手机号</button>
          </div>
          <div>
            <span>上传</span>
            <strong>{{ selectedUser.recordCount || 0 }} 份</strong>
          </div>
          <div>
            <span>报名</span>
            <strong>{{ selectedUser.applicationCount || 0 }} 次</strong>
          </div>
        </div>

        <div v-if="detailLoading" class="state-card">加载用户数据...</div>

        <template v-else>
          <section class="drawer-section">
            <h4>上传记录</h4>
            <div v-if="detailRecords.length === 0" class="empty">暂无上传记录</div>
            <article v-for="record in detailRecords" :key="record.recordId" class="record-item">
              <div>
                <strong>{{ record.diagnosis || '未识别诊断' }}</strong>
                <span>{{ formatDateTime(record.uploadTime) }} · {{ statusText(record.parseStatus) }}</span>
              </div>
              <p>{{ record.stage || '-' }} · {{ record.geneMutation || '-' }}</p>
            </article>
          </section>

          <section class="drawer-section">
            <h4>跨病历匹配</h4>
            <div v-if="detailMatches.length === 0" class="empty">暂无匹配结果</div>
            <article v-for="match in detailMatches" :key="match.trialId" class="match-item">
              <strong>{{ match.name }}</strong>
              <span>{{ match.score }} 分 · {{ match.institution || match.location || '-' }}</span>
            </article>
          </section>
        </template>
      </section>
    </aside>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { api } from '../../services/api'
import { useToast } from '../../composables/useToast'

type AdminUser = Record<string, any>
type AdminRecord = Record<string, any>

const toast = useToast()

const loading = ref(false)
const detailLoading = ref(false)
const forbidden = ref(false)
const users = ref<AdminUser[]>([])
const total = ref(0)
const page = ref(1)
const pageSize = 20
const selectedUser = ref<AdminUser | null>(null)
const detailRecords = ref<AdminRecord[]>([])
const detailMatches = ref<Record<string, any>[]>([])
const revealedPhone = ref('')

const filters = reactive({
  keyword: '',
  hasRecords: '',
  startDate: '',
  endDate: '',
  includeDeleted: false
})

const totalPages = computed(() => Math.max(1, Math.ceil(total.value / pageSize)))

const loadUsers = async (nextPage = 1) => {
  loading.value = true
  forbidden.value = false
  page.value = nextPage
  try {
    const res = await api.getAdminUsers({
      page: page.value,
      pageSize,
      keyword: filters.keyword,
      hasRecords: filters.hasRecords,
      startDate: filters.startDate,
      endDate: filters.endDate,
      includeDeleted: filters.includeDeleted ? 'true' : ''
    })
    users.value = res?.list || res?.items || []
    total.value = res?.pagination?.total ?? res?.total ?? users.value.length
  } catch (error: any) {
    if (error?.response?.status === 403) forbidden.value = true
    else throw error
  } finally {
    loading.value = false
  }
}

const search = () => loadUsers(1)

const openDetail = async (user: AdminUser) => {
  selectedUser.value = user
  revealedPhone.value = ''
  detailLoading.value = true
  detailRecords.value = []
  detailMatches.value = []
  try {
    const [recordsRes, matchesRes] = await Promise.all([
      api.getAdminRecords({ userId: user.userId, page: 1, pageSize: 50 }),
      api.getAdminUserMatches(user.userId, { topN: 10 })
    ])
    detailRecords.value = recordsRes?.list || recordsRes?.items || []
    detailMatches.value = matchesRes?.matches || []
  } finally {
    detailLoading.value = false
  }
}

const closeDetail = () => {
  selectedUser.value = null
  revealedPhone.value = ''
}

const revealPhone = async () => {
  if (!selectedUser.value) return
  try {
    const res = await api.revealAdminUserField(selectedUser.value.userId, 'phone')
    revealedPhone.value = res?.value || ''
  } catch (error: any) {
    toast.error(error?.response?.data?.message || '手机号揭示失败')
  }
}

const statusText = (status: string) => {
  const map: Record<string, string> = {
    pending: '待解析',
    running: '解析中',
    completed: '已完成',
    error: '解析失败'
  }
  return map[status] || status || '-'
}

const formatDate = (value: string) => {
  if (!value) return '-'
  try { return new Date(value).toLocaleDateString('zh-CN') } catch { return value }
}

const formatDateTime = (value: string) => {
  if (!value) return '-'
  try { return new Date(value).toLocaleString('zh-CN', { hour12: false }) } catch { return value }
}

onMounted(() => loadUsers())
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
  gap: var(--s-3);
  align-items: end;
  flex-wrap: wrap;
}

.toolbar label {
  display: grid;
  gap: var(--s-1);
  min-width: 160px;
  color: var(--text-dim);
  font-size: var(--fs-callout);
}

.toolbar input,
.toolbar select {
  border: 1px solid var(--line);
  border-radius: var(--r-md);
  padding: var(--s-2) var(--s-3);
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

.checkbox-label {
  align-items: center;
  grid-auto-flow: column;
  min-width: 128px;
}

.checkbox-label input {
  width: auto;
}

.primary-btn,
.pagination button {
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
td small,
.drawer header p,
.detail-grid span,
.record-item span,
.match-item span {
  color: var(--text-dim);
  font-size: var(--fs-caption);
}

.table-wrap {
  overflow-x: auto;
}

table {
  width: 100%;
  min-width: 900px;
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

td:first-child {
  display: grid;
  gap: var(--s-1);
}

.text-btn {
  border: none;
  background: transparent;
  color: var(--brand);
  cursor: pointer;
  padding: 0;
  font-size: var(--fs-callout);
  font-weight: 600;
  transition: color 150ms ease;
}

.text-btn:hover {
  color: var(--brand-hover);
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

.drawer {
  position: fixed;
  inset: 0;
  z-index: 300;
}

.drawer-backdrop {
  position: absolute;
  inset: 0;
  background: rgba(15, 23, 42, 0.45);
  backdrop-filter: blur(2px);
}

.drawer-panel {
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  width: min(720px, 96vw);
  overflow-y: auto;
  background: var(--bg);
  padding: var(--s-6);
  box-shadow: var(--shadow-2);
}

.drawer-panel header {
  display: flex;
  justify-content: space-between;
  gap: var(--s-3);
  align-items: flex-start;
}

.drawer-panel h3,
.drawer-panel p {
  margin: 0;
}

.drawer-panel h3 {
  color: var(--text);
  font-size: var(--fs-title);
  line-height: var(--lh-tight);
}

.icon-btn {
  width: 36px;
  height: 36px;
  border: 1px solid var(--line);
  border-radius: var(--r-md);
  background: var(--bg);
  color: var(--text-dim);
  cursor: pointer;
  font-size: 22px;
  line-height: 1;
  transition: border-color 150ms ease, color 150ms ease;
}

.icon-btn:hover {
  border-color: var(--brand);
  color: var(--brand);
}

.detail-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--s-3);
  margin: var(--s-4) 0;
}

.detail-grid div,
.record-item,
.match-item {
  border: 1px solid var(--line);
  border-radius: var(--r-md);
  display: grid;
  gap: var(--s-2);
  padding: var(--s-3);
  background: var(--bg-soft);
}

.detail-grid strong,
.record-item strong,
.match-item strong {
  color: var(--text);
  font-size: var(--fs-callout);
}

.drawer-section {
  display: grid;
  gap: var(--s-2);
  margin-top: var(--s-4);
}

.drawer-section h4 {
  margin: 0;
  font-size: var(--fs-subtitle);
  color: var(--text);
}

.record-item p {
  margin: 0;
  color: var(--text-dim);
  font-size: var(--fs-caption);
}

@media (max-width: 640px) {
  .toolbar label {
    min-width: 100%;
  }

  .detail-grid {
    grid-template-columns: 1fr;
  }
}
</style>
