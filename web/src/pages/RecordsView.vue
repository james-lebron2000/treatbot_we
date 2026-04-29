<template>
  <!--
    PRD-2026Q2 §3.5：多病历管理页。
    - 列表展示每条病历：type / 诊断 / 状态 / 上传时间 / active 高亮 / 切换 / 删除。
    - 空态引导到 /upload。
    - 顶部「当前病历」徽标方便用户确认此刻匹配基于哪份病历。
    样式沿用 UploadView / MatchesView：.grid / .card / .btn primary / .muted。
  -->
  <section class="grid">
    <div class="card" style="display:flex;justify-content:space-between;align-items:center;gap:12px;background:linear-gradient(135deg,#eff6ff,#f0fdf4);border:none;">
      <div style="flex:1;min-width:0;">
        <p class="muted" style="margin:0;font-size:0.78rem;">当前病历</p>
        <h3 style="margin:2px 0 0;font-size:1rem;color:#1e3a8a;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
          {{ activeLabel }}
        </h3>
      </div>
      <router-link to="/upload" class="btn ghost" style="white-space:nowrap;">上传新病历</router-link>
    </div>

    <div v-if="loading" class="card" style="text-align:center;padding:24px;">
      <span class="muted">正在加载您的病历…</span>
    </div>

    <div v-else-if="error" class="card" style="background:#fef2f2;border-color:#fca5a5;">
      <p style="margin:0 0 8px;color:#dc2626;">{{ error }}</p>
      <button class="btn ghost" @click="refresh">再试一次</button>
    </div>

    <div v-else-if="!records.length" class="card" style="text-align:center;padding:28px 16px;">
      <p style="margin:0 0 8px;">还没有病历 —— 上传一份开始吧</p>
      <p class="muted" style="font-size:0.85rem;margin:0 0 16px;">图片或 PDF 都行，几分钟帮您看懂关键信息。</p>
      <router-link to="/upload" class="btn primary" style="display:inline-block;">去上传 →</router-link>
    </div>

    <template v-else>
      <p class="muted" style="margin:0;font-size:0.85rem;">共 {{ records.length }} 份病历 · 匹配将基于当前选中的那一份</p>

      <div
        v-for="record in records"
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
import { usePatientStore } from '../stores/patient'

const router = useRouter()
const patientStore = usePatientStore()
const { records, activeRecordId, loading } = storeToRefs(patientStore)

const error = ref('')
const deletingId = ref<string | null>(null)

const activeLabel = computed(() => {
  const active = records.value.find((r) => r.id === activeRecordId.value)
  if (!active) return '未选择（上传或选一份病历）'
  return active.diagnosis || active.type || active.id
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
    await patientStore.loadRecords()
  } catch {
    error.value = '加载病历时遇到小问题，稍后再试？'
  }
}

const onSetActive = (id: string) => {
  patientStore.setActive(id)
}

const onDelete = async (record: { id: string; diagnosis?: string }) => {
  const label = record.diagnosis || '这份病历'
  if (!window.confirm(`确定删除「${label}」吗？删除后无法恢复。`)) return
  deletingId.value = record.id
  try {
    await patientStore.softDelete(record.id)
  } catch (err: any) {
    window.alert(err?.response?.data?.message || '删除时遇到小问题，稍后再试？')
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
</style>
