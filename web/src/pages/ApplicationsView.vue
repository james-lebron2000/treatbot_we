<template>
  <section class="grid">
    <h2>我的申请</h2>

    <div class="card" v-if="loading">加载中...</div>
    <div class="card" v-else-if="error">{{ error }}</div>
    <div class="card" v-else-if="list.length === 0">
      <p style="text-align:center;color:#6b7280;">暂无申请记录</p>
      <p style="text-align:center;">
        <router-link to="/matches">去匹配试验</router-link>
      </p>
    </div>

    <template v-else>
      <div class="card" v-for="app in list" :key="app.id">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;">
          <div style="flex:1;">
            <h3 style="margin:0 0 0.4rem;">
              <router-link :to="`/matches/${app.trialId}`" style="color:inherit;text-decoration:none;">
                {{ app.trialName || '未知试验' }}
              </router-link>
            </h3>
            <p style="margin:0.2rem 0;font-size:0.85rem;color:#6b7280;">
              申请时间：{{ formatTime(app.applyTime || app.createdAt) }}
            </p>
            <p v-if="app.institution" style="margin:0.2rem 0;font-size:0.85rem;color:#6b7280;">
              机构：{{ app.institution }}
            </p>
          </div>
          <span :style="statusStyle(app.status)" style="padding:0.2rem 0.6rem;border-radius:4px;font-size:0.8rem;white-space:nowrap;">
            {{ app.statusText || statusLabel(app.status) }}
          </span>
        </div>
        <div v-if="canCancel(app.status)" style="margin-top:0.6rem;text-align:right;">
          <button @click="cancelApp(app.id)" :disabled="cancelling === app.id"
            style="padding:0.3rem 1rem;font-size:0.85rem;background:#ef4444;color:#fff;border:none;border-radius:4px;cursor:pointer;">
            {{ cancelling === app.id ? '取消中...' : '取消申请' }}
          </button>
        </div>
      </div>

      <div v-if="totalPages > 1" style="text-align:center;margin-top:1rem;">
        <button v-for="p in totalPages" :key="p" @click="goPage(p)"
          :style="{ margin: '0 0.2rem', padding: '0.3rem 0.6rem', background: p === page ? '#2563eb' : '#e5e7eb', color: p === page ? '#fff' : '#374151', border: 'none', borderRadius: '4px', cursor: 'pointer' }">
          {{ p }}
        </button>
      </div>
    </template>
  </section>
</template>

<script setup lang="ts">
import { onMounted, ref, computed } from 'vue'
import { api } from '../services/api'

const loading = ref(false)
const error = ref('')
const list = ref<Record<string, any>[]>([])
const page = ref(1)
const total = ref(0)
const pageSize = 20
const cancelling = ref('')

const totalPages = computed(() => Math.max(1, Math.ceil(total.value / pageSize)))

const statusColors: Record<string, { bg: string; color: string }> = {
  pending: { bg: '#fef3c7', color: '#92400e' },
  contacted: { bg: '#dbeafe', color: '#1e40af' },
  enrolled: { bg: '#dcfce7', color: '#166534' },
  rejected: { bg: '#fee2e2', color: '#991b1b' },
  cancelled: { bg: '#f3f4f6', color: '#6b7280' }
}

const statusLabels: Record<string, string> = {
  pending: '待联系',
  contacted: '已联系',
  enrolled: '已入组',
  rejected: '未通过',
  cancelled: '已取消'
}

const statusStyle = (s: string) => {
  const c = statusColors[s] || statusColors.pending
  return { background: c.bg, color: c.color }
}

const statusLabel = (s: string) => statusLabels[s] || s

const canCancel = (s: string) => s === 'pending' || s === 'contacted'

const formatTime = (t: string) => {
  if (!t) return ''
  try { return new Date(t).toLocaleDateString('zh-CN') } catch { return t }
}

const loadList = async () => {
  loading.value = true
  error.value = ''
  try {
    const res = await api.getApplications(page.value, pageSize)
    const payload = res?.list || res?.items || (Array.isArray(res) ? res : [])
    list.value = payload
    total.value = res?.total || payload.length
  } catch {
    error.value = '加载申请列表失败'
  } finally {
    loading.value = false
  }
}

const goPage = (p: number) => {
  page.value = p
  loadList()
}

const cancelApp = async (id: string) => {
  if (!confirm('确定取消此申请？')) return
  cancelling.value = id
  try {
    await api.cancelApplication(id)
    const item = list.value.find((a) => a.id === id)
    if (item) {
      item.status = 'cancelled'
      item.statusText = '已取消'
    }
  } catch (e: any) {
    alert(e?.response?.data?.message || '取消失败')
  } finally {
    cancelling.value = ''
  }
}

onMounted(loadList)
</script>
