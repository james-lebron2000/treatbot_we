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
        <div v-if="loading" class="state-card">加载中...</div>
        <div v-else class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>上传人</th>
                <th>上传时间</th>
                <th>状态</th>
                <th>文件</th>
                <th>诊断信息</th>
                <th>匹配 / 报名</th>
                <th>结构化摘要</th>
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
                  <span class="status-pill" :class="record.parseStatus">{{ statusText(record.parseStatus) }}</span>
                </td>
                <td>
                  <strong>{{ record.fileType || '-' }}</strong>
                  <small>{{ fileSize(record.fileSize) }}</small>
                </td>
                <td>
                  <strong>{{ record.diagnosis || '-' }}</strong>
                  <small>{{ record.stage || '-' }}</small>
                  <small>{{ record.geneMutation || '-' }}</small>
                </td>
                <td>{{ record.matchCount || 0 }} / {{ record.applicationCount || 0 }}</td>
                <td>{{ structuredSummary(record) }}</td>
                <td>
                  <a v-if="record.fileUrl" class="text-btn" :href="record.fileUrl" target="_blank" rel="noreferrer">查看文件</a>
                  <span v-else>-</span>
                </td>
              </tr>
            </tbody>
          </table>
          <div v-if="records.length === 0" class="empty">暂无上传数据</div>
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
import { api } from '../../services/api'

type AdminRecord = Record<string, any>

const loading = ref(false)
const forbidden = ref(false)
const records = ref<AdminRecord[]>([])
const total = ref(0)
const page = ref(1)
const pageSize = 20

const filters = reactive({
  keyword: '',
  userId: '',
  status: '',
  startDate: '',
  endDate: ''
})

const totalPages = computed(() => Math.max(1, Math.ceil(total.value / pageSize)))

const loadRecords = async (nextPage = 1) => {
  loading.value = true
  forbidden.value = false
  page.value = nextPage
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

onMounted(() => loadRecords())
</script>

<style scoped>
.admin-page {
  display: grid;
  gap: 14px;
}

.toolbar,
.panel,
.state-card {
  border: 1px solid #dde3ed;
  border-radius: 8px;
  background: #fff;
  padding: 14px;
}

.toolbar {
  display: flex;
  align-items: end;
  gap: 10px;
  flex-wrap: wrap;
}

.toolbar label {
  display: grid;
  gap: 5px;
  min-width: 150px;
  color: #4b5563;
  font-size: 13px;
}

.primary-btn,
.pagination button {
  border: none;
  border-radius: 8px;
  background: #2563eb;
  color: #fff;
  cursor: pointer;
  padding: 10px 16px;
}

.pagination button:disabled {
  background: #c7d2e3;
  cursor: not-allowed;
}

.panel-heading {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.panel-heading h3 {
  margin: 0;
}

.panel-heading span,
td small {
  color: #6b7280;
  font-size: 12px;
}

.table-wrap {
  overflow-x: auto;
}

table {
  width: 100%;
  min-width: 1100px;
  border-collapse: collapse;
}

th,
td {
  border-bottom: 1px solid #eef2f7;
  padding: 10px 8px;
  text-align: left;
  vertical-align: top;
}

th {
  color: #6b7280;
  font-size: 12px;
  font-weight: 600;
}

td:first-child,
td:nth-child(4),
td:nth-child(5) {
  display: grid;
  gap: 4px;
}

.status-pill {
  display: inline-flex;
  border-radius: 999px;
  padding: 3px 8px;
  background: #eef2ff;
  color: #3730a3;
  font-size: 12px;
  white-space: nowrap;
}

.status-pill.completed {
  background: #dcfce7;
  color: #166534;
}

.status-pill.error {
  background: #fee2e2;
  color: #991b1b;
}

.status-pill.running {
  background: #fef3c7;
  color: #92400e;
}

.text-btn {
  color: #2563eb;
}

.pagination {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
}

.empty {
  color: #6b7280;
  padding: 16px 4px;
}

.danger {
  color: #b91c1c;
}

@media (max-width: 640px) {
  .toolbar label {
    min-width: 100%;
  }
}
</style>
