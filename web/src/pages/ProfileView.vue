<template>
  <section class="profile-view">
    <h2 class="profile-title">我的数据 · 我做主</h2>

    <PrivacyPromiseCard :show-details-link="true" />

    <div class="card info-card">
      <h3 class="card-heading">账户信息</h3>
      <dl class="info-list">
        <div class="info-row">
          <dt>手机号</dt>
          <dd>{{ profile.phone || '未绑定' }}</dd>
        </div>
        <div class="info-row">
          <dt>昵称</dt>
          <dd>{{ profile.nickName || '家属用户' }}</dd>
        </div>
      </dl>
    </div>

    <div class="card info-card">
      <h3 class="card-heading">我的记录</h3>
      <dl class="info-list">
        <div class="info-row">
          <dt>病历数</dt>
          <dd>{{ stats.records }}</dd>
        </div>
        <div class="info-row">
          <dt>已找到的可能性</dt>
          <dd>{{ stats.matches }}</dd>
        </div>
      </dl>
    </div>

    <div class="card data-card">
      <h3 class="card-heading data-card-heading">您的数据，您说了算</h3>
      <p class="data-card-sub">
        我们只在您的账户里为您整理信息。您随时可以把数据带走，或彻底删除。
      </p>
      <div class="data-actions">
        <button class="data-action" @click="exportData" :disabled="exporting">
          <span class="data-action-icon" aria-hidden="true">⬇️</span>
          <span class="data-action-label">
            {{ exporting ? '正在为您打包…' : '导出我的全部数据' }}
            <span class="data-action-hint">PDF + JSON，带走就能走</span>
          </span>
          <span class="data-action-chevron" aria-hidden="true">›</span>
        </button>
        <button class="data-action" @click="goManageRecords">
          <span class="data-action-icon" aria-hidden="true">🗂️</span>
          <span class="data-action-label">
            删除某一份病历
            <span class="data-action-hint">逐条删除，DB 与云存储同步清除</span>
          </span>
          <span class="data-action-chevron" aria-hidden="true">›</span>
        </button>
        <button class="data-action danger" @click="confirmDeleteAccount">
          <span class="data-action-icon" aria-hidden="true">⚠️</span>
          <span class="data-action-label">
            注销账户
            <span class="data-action-hint">所有数据彻底删除，不可恢复</span>
          </span>
          <span class="data-action-chevron" aria-hidden="true">›</span>
        </button>
        <a class="data-action" href="/treatbot/privacy" target="_blank" rel="noopener">
          <span class="data-action-icon" aria-hidden="true">🔒</span>
          <span class="data-action-label">
            了解我们如何处理您的数据
            <span class="data-action-hint">详细隐私政策</span>
          </span>
          <span class="data-action-chevron" aria-hidden="true">›</span>
        </a>
      </div>
    </div>

    <div class="profile-footer">
      <router-link v-if="isAdmin" to="/cro" class="btn primary admin-link">
        CRO 入组看板
      </router-link>
      <router-link v-if="isAdmin" to="/admin" class="btn ghost admin-link">
        管理后台
      </router-link>

      <button class="btn ghost logout-btn" @click="logout">
        退出（数据会保留，下次登录还能看到）
      </button>

      <p v-if="exportHint" class="export-hint">{{ exportHint }}</p>
    </div>
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
/* 患者「我的」页：移动优先单列，桌面收敛到舒适阅读宽度并居中。 */
.profile-view {
  display: flex;
  flex-direction: column;
  gap: var(--s-3);
  max-width: var(--container-read);
  margin: 0 auto;
}

.profile-title {
  margin: 0;
  font-size: var(--fs-title);
  font-weight: 600;
  color: var(--text);
  line-height: var(--lh-tight);
}

.card-heading {
  margin: 0 0 var(--s-3);
  font-size: var(--fs-subtitle);
  font-weight: 600;
  color: var(--text);
}

/* 账户 / 记录信息卡：标签—值两栏，弱屏也能左右对齐。 */
.info-card {
  margin-bottom: 0;
}

.info-list {
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: var(--s-2);
}

.info-row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--s-3);
  font-size: var(--fs-body);
}

.info-row dt {
  color: var(--text-dim);
  flex-shrink: 0;
}

.info-row dd {
  margin: 0;
  color: var(--text);
  font-weight: 600;
  text-align: right;
  word-break: break-all;
}

.data-card {
  background: var(--amber-soft);
  border-color: var(--amber-soft);
  margin-bottom: 0;
}

.data-card-heading {
  color: var(--amber-text);
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

/* 数据自主权列表行：整行可点、≥44px、左图标 + 标题/说明 + 右箭头。 */
.data-action {
  display: flex;
  align-items: center;
  gap: var(--s-3);
  width: 100%;
  min-height: var(--size-tap);
  text-align: left;
  padding: var(--s-3) var(--s-4);
  border: 1px solid var(--line);
  border-radius: var(--r-md);
  background: var(--bg);
  color: var(--text);
  font-family: inherit;
  font-size: var(--fs-callout);
  line-height: var(--lh-normal);
  cursor: pointer;
  text-decoration: none;
  transition: background-color 150ms ease, border-color 150ms ease, transform 100ms cubic-bezier(0.4, 0, 0.2, 1);
  -webkit-tap-highlight-color: transparent;
}

.data-action:hover {
  background: var(--bg-soft);
  border-color: var(--brand-soft);
}

.data-action:active:not(:disabled) {
  transform: scale(0.99);
}

.data-action:focus-visible {
  outline: none;
  box-shadow: var(--shadow-focus);
  border-color: var(--brand);
}

.data-action:disabled {
  opacity: 0.6;
  cursor: default;
}

/* 注销等破坏性操作：用 --red 但保持克制 —— 仅文字与图标着色，背景柔和。 */
.data-action.danger {
  color: var(--red-text);
}

.data-action.danger:hover {
  background: var(--red-soft);
  border-color: var(--red-soft);
}

.data-action.danger:focus-visible {
  box-shadow: 0 0 0 3px rgba(220, 38, 38, 0.18);
  border-color: var(--red);
}

.data-action-icon {
  flex-shrink: 0;
  font-size: var(--fs-subtitle);
  line-height: 1;
}

.data-action-label {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
  font-weight: 600;
}

.data-action-hint {
  font-size: var(--fs-caption);
  color: var(--text-muted);
  font-weight: 400;
}

.data-action.danger .data-action-hint {
  color: var(--red);
}

.data-action-chevron {
  flex-shrink: 0;
  color: var(--text-muted);
  font-size: var(--fs-subtitle);
  line-height: 1;
}

.profile-footer {
  display: flex;
  flex-direction: column;
  gap: var(--s-2);
  margin-top: var(--s-2);
}

.admin-link {
  display: flex;
  width: 100%;
  text-align: center;
}

.logout-btn {
  width: 100%;
}

.export-hint {
  text-align: center;
  color: var(--mint-text);
  font-size: var(--fs-caption);
  margin: var(--s-1) 0 0;
}
</style>
