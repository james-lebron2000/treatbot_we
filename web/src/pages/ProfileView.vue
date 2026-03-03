<template>
  <section class="grid">
    <h2>我的</h2>
    <div class="card">
      <p><strong>手机号：</strong>{{ profile.phone || '未绑定' }}</p>
      <p><strong>昵称：</strong>{{ profile.nickName || '患者用户' }}</p>
    </div>
    <div class="card">
      <p><strong>病历数：</strong>{{ stats.records }}</p>
      <p><strong>匹配数：</strong>{{ stats.matches }}</p>
    </div>
    <button class="btn ghost" @click="logout">退出登录</button>
  </section>
</template>

<script setup lang="ts">
import { onMounted, reactive } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth'
import { api } from '../services/api'

const authStore = useAuthStore()
const router = useRouter()

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
}

const logout = () => {
  authStore.logout()
  router.push('/login')
}

onMounted(load)
</script>
