<template>
  <section class="grid">
    <h2>我的数据 · 我做主</h2>

    <PrivacyPromiseCard :show-details-link="true" />

    <div class="card">
      <h3 class="card-heading">账户信息</h3>
      <p><strong>手机号：</strong>{{ profile.phone || '未绑定' }}</p>
      <p><strong>昵称：</strong>{{ profile.nickName || '家属用户' }}</p>
    </div>

    <div class="card">
      <h3 class="card-heading">我的记录</h3>
      <p><strong>病历数：</strong>{{ stats.records }}</p>
      <p><strong>已找到的可能性：</strong>{{ stats.matches }}</p>
    </div>

    <div class="card data-card">
      <h3 class="card-heading data-card-heading">您的数据，您说了算</h3>
      <p class="data-card-sub">
        我们只在您的账户里为您整理信息。您随时可以把数据带走，或彻底删除。
      </p>
      <div class="data-actions">
        <button class="btn ghost data-action" @click="exportData" :disabled="exporting">
          <span class="data-action-label">
            {{ exporting ? '正在为您打包…' : '导出我的全部数据' }}
            <span class="data-action-hint">PDF + JSON，带走就能走</span>
          </span>
        </button>
        <button class="btn ghost data-action" @click="goManageRecords">
          <span class="data-action-label">
            删除某一份病历
            <span class="data-action-hint">逐条删除，DB 与云存储同步清除</span>
          </span>
        </button>
        <button class="btn ghost data-action danger" @click="confirmDeleteAccount">
          <span class="data-action-label">
            注销账户
            <span class="data-action-hint">所有数据彻底删除，不可恢复</span>
          </span>
        </button>
        <a class="btn ghost data-action" href="/treatbot/privacy" target="_blank" rel="noopener">
          <span class="data-action-label">
            了解我们如何处理您的数据
            <span class="data-action-hint">详细隐私政策</span>
          </span>
        </a>
      </div>
    </div>

    <router-link v-if="isAdmin" to="/cro" class="btn primary admin-link">
      CRO 入组看板
    </router-link>
    <router-link v-if="isAdmin" to="/admin" class="btn ghost admin-link">
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
import { useConfirm, usePrompt, useAlert } from '../composables/useDialog'
import { useToast } from '../composables/useToast'

const authStore = useAuthStore()
const router = useRouter()
const isAdmin = ref(false)
const exporting = ref(false)
const exportHint = ref('')
const confirm = useConfirm()
const prompt = usePrompt()
const alertDialog = useAlert()
const toast = useToast()

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

const confirmDeleteAccount = async () => {
  const ok = await confirm({
    title: '确认注销账户？',
    description: '注销后，您上传的病历、匹配记录、申请记录都会被彻底删除，且无法恢复。',
    confirmText: '继续注销',
    cancelText: '再想想',
    danger: true,
  })
  if (!ok) return
  try {
    await api.deleteMyAccount()
    const code = await prompt({
      title: '请输入短信验证码',
      description: '我们刚发了一条 6 位验证码到您的手机，填进来即可完成注销。',
      placeholder: '6 位数字',
      confirmText: '确认注销',
      cancelText: '取消',
    })
    if (!code) return
    const res: any = await api.deleteMyAccount(code.trim())
    if (res?.deleted) {
      await alertDialog({
        title: '账户已彻底删除',
        description: '谢谢您信任过我们。',
        confirmText: '好的',
      })
      authStore.logout()
      router.push('/login')
    } else {
      toast.error('注销出现一点小问题，请稍后再试。')
    }
  } catch (err: any) {
    toast.error(err?.response?.data?.message || '注销失败，请稍后再试。')
  }
}

const logout = () => {
  authStore.logout()
  router.push('/login')
}

onMounted(load)
</script>

<style scoped>
.card-heading {
  margin: 0 0 var(--s-3);
  font-size: var(--fs-subtitle);
  font-weight: 600;
  color: var(--text);
}

.data-card {
  background: var(--amber-soft);
  border-color: #fde68a;
}

.data-card-heading {
  color: #92400e;
}

.data-card-sub {
  margin: 0 0 var(--s-3);
  font-size: var(--fs-callout);
  color: var(--text-dim);
  line-height: var(--lh-relaxed);
}

.data-actions {
  display: flex;
  flex-direction: column;
  gap: var(--s-2);
}

.data-action {
  display: flex;
  align-items: flex-start;
  text-align: left;
  padding: var(--s-3) var(--s-4);
  font-size: var(--fs-callout);
  color: var(--text);
  line-height: var(--lh-normal);
}

.data-action.danger {
  color: var(--red);
}

.data-action-label {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
}

.data-action-hint {
  font-size: var(--fs-caption);
  color: var(--text-muted);
  font-weight: 400;
}

.admin-link {
  display: block;
  text-align: center;
}

.export-hint {
  text-align: center;
  color: var(--mint);
  font-size: var(--fs-caption);
  margin-top: var(--s-2);
}
</style>
