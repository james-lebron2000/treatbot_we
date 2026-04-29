<template>
  <section class="grid">
    <h2>我的数据 · 我做主</h2>

    <PrivacyPromiseCard :show-details-link="true" />

    <div class="card">
      <h3 style="margin:0 0 10px;font-size:0.95rem;color:#374151;">账户信息</h3>
      <p><strong>手机号：</strong>{{ profile.phone || '未绑定' }}</p>
      <p><strong>昵称：</strong>{{ profile.nickName || '家属用户' }}</p>
    </div>

    <div class="card">
      <h3 style="margin:0 0 10px;font-size:0.95rem;color:#374151;">我的记录</h3>
      <p><strong>病历数：</strong>{{ stats.records }}</p>
      <p><strong>已找到的可能性：</strong>{{ stats.matches }}</p>
    </div>

    <div class="card" style="background:#fefce8;border-color:#fde68a;">
      <h3 style="margin:0 0 10px;color:#854d0e;">您的数据，您说了算</h3>
      <p style="margin:0 0 12px;font-size:0.85rem;color:#78716c;line-height:1.6;">
        我们只在您的账户里为您整理信息。您随时可以把数据带走，或彻底删除。
      </p>
      <div class="data-actions">
        <button class="btn ghost data-action" @click="exportData" :disabled="exporting">
          <span class="data-action-icon">📥</span>
          <span class="data-action-label">
            {{ exporting ? '正在为您打包…' : '导出我的全部数据' }}
            <span class="data-action-hint">PDF + JSON，带走就能走</span>
          </span>
        </button>
        <button class="btn ghost data-action" @click="goManageRecords">
          <span class="data-action-icon">🗑</span>
          <span class="data-action-label">
            删除某一份病历
            <span class="data-action-hint">逐条删除，DB 与云存储同步清除</span>
          </span>
        </button>
        <button class="btn ghost data-action danger" @click="confirmDeleteAccount">
          <span class="data-action-icon">🚪</span>
          <span class="data-action-label">
            注销账户
            <span class="data-action-hint">所有数据彻底删除，不可恢复</span>
          </span>
        </button>
        <a class="btn ghost data-action" href="/treatbot/privacy" target="_blank" rel="noopener">
          <span class="data-action-icon">📖</span>
          <span class="data-action-label">
            了解我们如何处理您的数据
            <span class="data-action-hint">详细隐私政策</span>
          </span>
        </a>
      </div>
    </div>

    <router-link v-if="isAdmin" to="/cro" class="btn primary" style="display:block;text-align:center;">
      CRO 入组看板
    </router-link>
    <router-link v-if="isAdmin" to="/admin" class="btn ghost" style="display:block;text-align:center;">
      管理后台
    </router-link>

    <button class="btn ghost" @click="logout">
      退出（数据会保留，下次登录还能看到）
    </button>

    <p v-if="exportHint" class="export-hint">{{ exportHint }}</p>
  </section>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth'
import { api } from '../services/api'
import PrivacyPromiseCard from '../components/PrivacyPromiseCard.vue'

const authStore = useAuthStore()
const router = useRouter()
const isAdmin = ref(false)
const exporting = ref(false)
const exportHint = ref('')

const profile = reactive<Record<string, string>>({
  phone: '',
  nickName: ''
})

const stats = reactive({
  records: 0,
  matches: 0
})

const countList = (payload: any) => {
  if (Array.isArray(payload)) return payload.length
  if (Array.isArray(payload?.list)) return payload.list.length
  if (typeof payload?.total === 'number') return payload.total
  return 0
}

const load = async () => {
  const [profileRes, recordsRes, matchesRes] = await Promise.all([
    api.getProfile().catch(() => null),
    api.getMedicalRecords().catch(() => null),
    api.getMatches({ pageSize: 1 }).catch(() => null)
  ])

  if (profileRes) {
    profile.phone = profileRes.phone || profileRes.mobile || ''
    profile.nickName = profileRes.nickName || profileRes.name || ''
  }

  stats.records = countList(recordsRes)
  stats.matches = countList(matchesRes)

  try {
    await api.getAdminDashboard()
    isAdmin.value = true
  } catch {
    isAdmin.value = false
  }
}

// Q3-红线 §A.2.2：调 GET /api/me/export，浏览器下载 attachment（responseType:'blob'）
const exportData = async () => {
  if (exporting.value) return
  exporting.value = true
  exportHint.value = ''
  try {
    const blob = await api.exportMyData()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `数愈健康-我的数据-${new Date().toISOString().slice(0, 10)}.json`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
    exportHint.value = '已导出到您的下载目录 ✓'
  } catch (err: any) {
    if (err?.response?.status === 429) {
      exportHint.value = '一天只能导出一次哦，明天再试。'
    } else {
      exportHint.value = '导出时遇到小问题 —— 稍后再试一次？'
    }
  } finally {
    exporting.value = false
  }
}

const goManageRecords = () => {
  router.push('/upload')
}

// Q3-红线 §A.2.3：注销 = 两步 SMS 确认 → 调 POST /api/me/delete-account
const confirmDeleteAccount = async () => {
  const ok = window.confirm(
    '注销账户后，您上传的病历、匹配记录、申请记录都会被彻底删除，且无法恢复。\n\n确定要注销吗？'
  )
  if (!ok) return
  try {
    // 第一步：触发短信
    await api.deleteMyAccount()
    const code = window.prompt('我们刚发了一条 6 位验证码到您的手机，请填进来确认注销：')
    if (!code) return
    const res: any = await api.deleteMyAccount(code.trim())
    if (res?.deleted) {
      window.alert('账户已彻底删除 —— 谢谢您信任过我们。')
      authStore.logout()
      router.push('/login')
    } else {
      window.alert('注销出现一点小问题，请稍后再试。')
    }
  } catch (err: any) {
    window.alert(err?.response?.data?.message || '注销失败，请稍后再试。')
  }
}

const logout = () => {
  authStore.logout()
  router.push('/login')
}

onMounted(load)
</script>

<style scoped>
.data-actions {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.data-action {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  text-align: left;
  padding: 12px 14px;
  font-size: 0.92rem;
  color: #374151;
  line-height: 1.5;
}

.data-action.danger {
  color: #b91c1c;
}

.data-action-icon {
  font-size: 1.1rem;
  flex-shrink: 0;
}

.data-action-label {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
}

.data-action-hint {
  font-size: 0.78rem;
  color: #9ca3af;
  font-weight: 400;
}

.export-hint {
  text-align: center;
  color: #15803d;
  font-size: 0.85rem;
  margin-top: 6px;
}
</style>
