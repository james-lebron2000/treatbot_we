<template>
  <section class="admin-page">
    <div v-if="forbidden" class="state-card danger">无管理权限</div>

    <template v-else>
      <form class="toolbar" @submit.prevent="search">
        <label>
          关键词
          <input v-model="filters.keyword" placeholder="病人名 / 诊断 / 负责账号" />
        </label>
        <button class="primary-btn">查询</button>
      </form>

      <section class="panel">
        <div class="panel-heading">
          <h3>患者 / 病例</h3>
          <span>共 {{ total }} 位病人</span>
        </div>
        <div v-if="loading" class="state-card">加载中...</div>
        <div v-else class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>病人名</th>
                <th>负责账号</th>
                <th>诊断</th>
                <th>病历数</th>
                <th>完整度</th>
                <th>更新时间</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="item in cases" :key="item.caseId" class="row-clickable" @click="openMatches(item)">
                <td>
                  <strong>{{ item.patientLabel || '未命名病人' }}</strong>
                  <small>{{ item.caseId }}</small>
                </td>
                <td>
                  {{ item.ownerNickname || '匿名用户' }}
                  <small>{{ item.ownerPhone || item.ownerUserId || '-' }}</small>
                </td>
                <td>{{ item.diagnosis || '诊断未识别' }}</td>
                <td>{{ item.recordCount || 0 }}</td>
                <td>
                  <span class="completeness">
                    <span class="completeness-bar">
                      <span class="completeness-fill" :style="{ width: clampPercent(item.completenessPercent) + '%' }"></span>
                    </span>
                    {{ clampPercent(item.completenessPercent) }}%
                  </span>
                </td>
                <td>{{ formatDateTime(item.updatedAt) }}</td>
                <td>
                  <button class="text-btn" type="button" @click.stop="openMatches(item)">查看匹配</button>
                </td>
              </tr>
            </tbody>
          </table>
          <div v-if="cases.length === 0" class="empty">暂无病例</div>
        </div>
      </section>

      <div class="pagination">
        <button :disabled="page <= 1" @click="loadCases(page - 1)">上一页</button>
        <span>第 {{ page }} 页 / 共 {{ totalPages }} 页</span>
        <button :disabled="page >= totalPages" @click="loadCases(page + 1)">下一页</button>
      </div>
    </template>

    <aside v-if="selectedCase" class="drawer" aria-label="病例匹配详情">
      <div class="drawer-backdrop" @click="closeMatches"></div>
      <section class="drawer-panel">
        <header>
          <div>
            <p>病例匹配（负责账号画像）</p>
            <h3>{{ selectedCase.patientLabel || '未命名病人' }}</h3>
          </div>
          <button class="icon-btn" type="button" @click="closeMatches">×</button>
        </header>

        <div class="detail-grid">
          <div>
            <span>负责账号</span>
            <strong>{{ selectedCase.ownerNickname || selectedCase.ownerPhone || selectedCase.ownerUserId || '-' }}</strong>
          </div>
          <div>
            <span>诊断</span>
            <strong>{{ selectedCase.diagnosis || '-' }}</strong>
          </div>
          <div>
            <span>病历数</span>
            <strong>{{ selectedCase.recordCount || 0 }} 份</strong>
          </div>
          <div>
            <span>完整度</span>
            <strong>{{ clampPercent(selectedCase.completenessPercent) }}%</strong>
          </div>
        </div>

        <div v-if="matchesLoading" class="state-card">加载匹配结果...</div>

        <section v-else class="drawer-section">
          <h4>跨病历匹配</h4>
          <div v-if="detailMatches.length === 0" class="empty">暂无匹配结果</div>
          <article v-for="match in detailMatches" :key="match.trialId" class="match-item">
            <strong>{{ match.name }}</strong>
            <span>{{ match.score }} 分 · {{ match.institution || match.location || '-' }}</span>
          </article>
        </section>
      </section>
    </aside>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { api } from '../../services/api'
import { useToast } from '../../composables/useToast'

type AdminCase = Record<string, any>

const toast = useToast()

const loading = ref(false)
const matchesLoading = ref(false)
const forbidden = ref(false)
const cases = ref<AdminCase[]>([])
const total = ref(0)
const page = ref(1)
const pageSize = 20
const selectedCase = ref<AdminCase | null>(null)
const detailMatches = ref<Record<string, any>[]>([])

const filters = reactive({
  keyword: ''
})

const totalPages = computed(() => Math.max(1, Math.ceil(total.value / pageSize)))

const loadCases = async (nextPage = 1) => {
  loading.value = true
  forbidden.value = false
  page.value = nextPage
  try {
    const res = await api.getAdminCases({
      page: page.value,
      pageSize,
      keyword: filters.keyword
    })
    cases.value = res?.data || res?.list || res?.items || []
    total.value = res?.pagination?.total ?? res?.total ?? cases.value.length
  } catch (error: any) {
    if (error?.response?.status === 403) forbidden.value = true
    else throw error
  } finally {
    loading.value = false
  }
}

const search = () => loadCases(1)

// 病例归属在「负责账号」上 —— 复用 getAdminUserMatches 拉该账号的跨病历匹配画像。
const openMatches = async (item: AdminCase) => {
  selectedCase.value = item
  detailMatches.value = []
  if (!item.ownerUserId) {
    toast.error('该病例缺少负责账号，无法查看匹配')
    return
  }
  matchesLoading.value = true
  try {
    const res = await api.getAdminUserMatches(item.ownerUserId, { topN: 10, caseId: item.caseId })
    detailMatches.value = res?.matches || []
  } catch (error: any) {
    toast.error(error?.response?.data?.message || '加载匹配失败')
  } finally {
    matchesLoading.value = false
  }
}

const closeMatches = () => {
  selectedCase.value = null
  detailMatches.value = []
}

const clampPercent = (value: unknown) => {
  const n = Number(value)
  if (!Number.isFinite(n)) return 0
  return Math.min(100, Math.max(0, Math.round(n)))
}

const formatDateTime = (value: string) => {
  if (!value) return '-'
  try { return new Date(value).toLocaleString('zh-CN', { hour12: false }) } catch { return value }
}

onMounted(() => loadCases())
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
  min-width: 240px;
  color: var(--text-dim);
  font-size: var(--fs-callout);
}

.toolbar input {
  border: 1px solid var(--line);
  border-radius: var(--r-md);
  padding: var(--s-2) var(--s-3);
  font-family: inherit;
  font-size: var(--fs-callout);
  color: var(--text);
  background: var(--bg);
  transition: border-color 150ms ease, box-shadow 150ms ease;
}

.toolbar input:focus {
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

td small {
  display: block;
}

.row-clickable {
  cursor: pointer;
  transition: background 120ms ease;
}

.row-clickable:hover {
  background: var(--brand-soft);
}

.completeness {
  display: inline-flex;
  align-items: center;
  gap: var(--s-2);
  color: var(--text-dim);
  font-size: var(--fs-caption);
}

.completeness-bar {
  position: relative;
  width: 72px;
  height: 6px;
  border-radius: var(--r-pill);
  background: var(--bg-soft);
  overflow: hidden;
}

.completeness-fill {
  position: absolute;
  inset: 0;
  border-radius: var(--r-pill);
  background: var(--brand);
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
  width: min(640px, 96vw);
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
.match-item {
  border: 1px solid var(--line);
  border-radius: var(--r-md);
  display: grid;
  gap: var(--s-2);
  padding: var(--s-3);
  background: var(--bg-soft);
}

.detail-grid strong,
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

@media (max-width: 640px) {
  .toolbar label {
    min-width: 100%;
  }

  .detail-grid {
    grid-template-columns: 1fr;
  }
}
</style>
