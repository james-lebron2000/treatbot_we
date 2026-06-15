<template>
  <!--
    PRD-2026Q2 §3.5 + 多病人（F5）：病人 + 病历管理页。
    - 顶部「当前病人」区：多位病人时可切换（标签），并能新增 / 改名。
    - 列表展示当前病人的病历：诊断 / 状态 / 上传时间 / active 高亮 / 切换 / 删除。
    - 只有一位病人时，体验与单病人版本保持一致（不强推切换 UI）。
    样式沿用 UploadView / MatchesView：.grid / .card / .btn primary / .muted。
  -->
  <section class="grid">
    <div class="card" style="background:linear-gradient(135deg,#eff6ff,#f0fdf4);border:none;display:grid;gap:10px;">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;">
        <div style="flex:1;min-width:0;">
          <p class="muted" style="margin:0;font-size:0.78rem;">当前病人</p>
          <h3 style="margin:2px 0 0;font-size:1rem;color:#1e3a8a;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
            {{ activePatientLabel }}
          </h3>
        </div>
        <router-link to="/upload" class="btn ghost" style="white-space:nowrap;">上传新病历</router-link>
      </div>

      <!-- 病人切换标签（多位病人时显示）-->
      <div v-if="cases.length > 1" class="patient-tabs">
        <button
          v-for="(c, idx) in cases"
          :key="c.caseId || c.id"
          class="patient-tab"
          :class="{ 'patient-tab-active': (c.caseId || c.id) === activeCaseId }"
          @click="onSwitchPatient(c.caseId || c.id)"
        >
          {{ labelOf(c, idx) }}
        </button>
      </div>

      <!-- 新增 / 改名 -->
      <div style="display:flex;gap:8px;flex-wrap:wrap;">
        <button class="btn ghost" style="flex:1;min-width:120px;" @click="onAddPatient">+ 新增病人</button>
        <button
          v-if="activeCase"
          class="btn ghost"
          style="flex:1;min-width:120px;"
          @click="onRenamePatient"
        >给当前病人改名</button>
      </div>
    </div>

    <div v-if="loading" class="card" style="text-align:center;padding:24px;">
      <span class="muted">正在加载您的病历…</span>
    </div>

    <div v-else-if="error" class="card" style="background:#fef2f2;border-color:#fca5a5;">
      <p style="margin:0 0 8px;color:#dc2626;">{{ error }}</p>
      <button class="btn ghost" @click="refresh">再试一次</button>
    </div>

    <!-- 全账号一份病历都没有 -->
    <div v-else-if="!records.length" class="card" style="text-align:center;padding:28px 16px;">
      <p style="margin:0 0 8px;">还没有病历 —— 上传一份开始吧</p>
      <p class="muted" style="font-size:0.85rem;margin:0 0 16px;">图片或 PDF 都行，几分钟帮您看懂关键信息。</p>
      <router-link to="/upload" class="btn primary" style="display:inline-block;">去上传 →</router-link>
    </div>

    <!-- 当前病人名下没有病历（但其它病人有）-->
    <div v-else-if="!patientRecords.length" class="card" style="text-align:center;padding:24px 16px;">
      <p style="margin:0 0 8px;">{{ activePatientLabel }} 名下还没有病历</p>
      <p class="muted" style="font-size:0.85rem;margin:0 0 16px;">给这位病人上传一份病历就能开始匹配。</p>
      <router-link to="/upload" class="btn primary" style="display:inline-block;">给这位病人上传 →</router-link>
    </div>

    <template v-else>
      <p class="muted" style="margin:0;font-size:0.85rem;">
        {{ activePatientLabel }} · 共 {{ patientRecords.length }} 份病历 · 匹配将基于当前选中的那一份
      </p>

      <div
        v-for="record in patientRecords"
        :key="record.id"
        class="card grid"
        :class="{ 'record-active': record.id === activeRecordId }"
        style="gap:6px;"
      >
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;">
          <div style="flex:1;min-width:0;">
            <h3 style="margin:0;font-size:0.95rem;">
              {{ record.diagnosis || '未识别诊断' }}
              <span v-if="record.id === activeRecordId" class="badge" style="background:#dcfce7;color:#166534;margin-left:6px;">当前</span>
            </h3>
            <p class="muted" style="margin:2px 0 0;font-size:0.8rem;">
              {{ record.type || '病历' }} · 上传于 {{ formatTime(record.uploadTime) }}
            </p>
          </div>
          <span class="badge" :style="statusBadgeStyle(record.status)">{{ record.statusText || statusText(record.status) }}</span>
        </div>

        <p v-if="record.matchCount && record.matchCount > 0" class="muted" style="margin:0;font-size:0.82rem;">
          有 {{ record.matchCount }} 个可能的试验
        </p>

        <div style="display:flex;gap:8px;margin-top:4px;">
          <button
            class="btn ghost"
            style="flex:1;"
            :disabled="record.id === activeRecordId"
            @click="onSetActive(record.id)"
          >
            {{ record.id === activeRecordId ? '使用中' : '设为当前' }}
          </button>
          <button
            class="btn primary"
            style="flex:1;background:#dc2626;"
            :disabled="deletingId === record.id"
            @click="onDelete(record)"
          >
            {{ deletingId === record.id ? '正在删除…' : '删除' }}
          </button>
        </div>
      </div>
    </template>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { useRouter } from 'vue-router'
import { usePatientStore, patientDisplayLabel, type PatientCase } from '../stores/patient'
import { useConfirm, usePrompt } from '../composables/useDialog'
import { useToast } from '../composables/useToast'

const router = useRouter()
const patientStore = usePatientStore()
// 多病人：records 全量仍可用；patientRecords 是当前病人名下的过滤结果。
const { records, activeRecordId, loading, cases, activeCaseId, activeCase } = storeToRefs(patientStore)
const patientRecords = computed(() => patientStore.recordsForActivePatient)
const confirm = useConfirm()
const prompt = usePrompt()
const toast = useToast()

const error = ref('')
const deletingId = ref<string | null>(null)

// 多病人：病人显示名（兜底链见 store.patientDisplayLabel）。
const labelOf = (c: PatientCase, idx: number) => patientDisplayLabel(c, idx)
const activePatientLabel = computed(() => {
  if (!activeCase.value) return '我的病历'
  const idx = cases.value.findIndex((c) => (c.caseId || c.id) === (activeCase.value!.caseId || activeCase.value!.id))
  return patientDisplayLabel(activeCase.value, idx < 0 ? 0 : idx)
})

const formatTime = (value?: string) => {
  if (!value) return '时间未知'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return value
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

const statusText = (status?: string) => {
  if (status === 'completed') return '已解析'
  if (status === 'error') return '解析失败'
  if (status === 'running') return '解析中'
  return '待解析'
}

const statusBadgeStyle = (status?: string) => {
  if (status === 'completed') return { background: '#dcfce7', color: '#166534' }
  if (status === 'error') return { background: '#fee2e2', color: '#991b1b' }
  if (status === 'running') return { background: '#fef3c7', color: '#92400e' }
  return { background: '#e0e7ff', color: '#3730a3' }
}

const refresh = async () => {
  error.value = ''
  try {
    // 多病人：病人索引 + 病历一起拉。病人索引失败不应拦住病历展示（单病人仍可用）。
    await Promise.all([
      patientStore.loadRecords(),
      patientStore.loadCases().catch(() => null)
    ])
  } catch {
    error.value = '加载病历时遇到小问题，稍后再试？'
  }
}

const onSetActive = (id: string) => {
  patientStore.setActive(id)
}

// 多病人：切换当前病人。
const onSwitchPatient = (caseId: string) => {
  if (caseId === activeCaseId.value) return
  patientStore.setActiveCase(caseId)
}

// 多病人：新增一位病人（prompt 取名 → 建病例 → 自动切到新病人）。
const onAddPatient = async () => {
  const name = await prompt({
    title: '新增一位病人',
    description: '给这位病人起个好认的名字，方便切换。例如：妈妈、爸爸、本人。',
    placeholder: '例如：妈妈',
    confirmText: '创建',
    cancelText: '取消',
  })
  if (name === null) return // 用户取消
  try {
    await patientStore.addPatient(`${name}`.trim())
    toast.success('已新增病人，已切到 TA')
  } catch (err: any) {
    toast.error(err?.response?.data?.message || '新增病人时遇到小问题，稍后再试？')
  }
}

// 多病人：给当前病人改名。
const onRenamePatient = async () => {
  if (!activeCase.value) return
  const caseId = activeCase.value.caseId || activeCase.value.id
  const current = `${activeCase.value.patientLabel || ''}`.trim()
  const name = await prompt({
    title: '给当前病人改名',
    placeholder: '例如：妈妈',
    defaultValue: current,
    confirmText: '保存',
    cancelText: '取消',
  })
  if (name === null) return
  try {
    await patientStore.renamePatient(caseId, `${name}`.trim())
    toast.success('已更新病人名字')
  } catch (err: any) {
    toast.error(err?.response?.data?.message || '改名时遇到小问题，稍后再试？')
  }
}

const onDelete = async (record: { id: string; diagnosis?: string }) => {
  const label = record.diagnosis || '这份病历'
  const ok = await confirm({
    title: `确定删除「${label}」？`,
    description: '删除后无法恢复。',
    confirmText: '删除',
    cancelText: '取消',
    danger: true,
  })
  if (!ok) return
  deletingId.value = record.id
  try {
    await patientStore.softDelete(record.id)
    toast.success('已删除该病历')
  } catch (err: any) {
    toast.error(err?.response?.data?.message || '删除时遇到小问题，稍后再试？')
  } finally {
    deletingId.value = null
  }
}

onMounted(() => {
  refresh()
})

// 导出 router 供模板内按需调用（留占位；不直接使用以避免未使用告警）
void router
</script>

<style scoped>
.record-active {
  border-color: #93c5fd;
  background: #f5f9ff;
  box-shadow: 0 2px 10px rgba(37, 99, 235, 0.08);
}

/* 多病人：病人切换标签 —— 横向可滚动，避免病人多时换行挤压。 */
.patient-tabs {
  display: flex;
  gap: 6px;
  overflow-x: auto;
  padding-bottom: 2px;
  -webkit-overflow-scrolling: touch;
}
.patient-tab {
  flex: 0 0 auto;
  border: 1px solid #cbd5e1;
  background: #fff;
  color: #334155;
  border-radius: 999px;
  padding: 5px 14px;
  font-size: 0.85rem;
  cursor: pointer;
  white-space: nowrap;
  transition: all 0.15s;
}
.patient-tab:hover {
  border-color: #93c5fd;
}
.patient-tab-active {
  background: #1d4ed8;
  border-color: #1d4ed8;
  color: #fff;
  font-weight: 500;
}
</style>
