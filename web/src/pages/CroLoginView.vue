<template>
  <section class="grid" style="max-width:400px;margin:40px auto;">
    <h2>CRO 入组管理平台</h2>
    <p class="muted">使用公司账号登录</p>
    <input v-model.trim="email" placeholder="邮箱" type="email" />
    <input v-model.trim="password" placeholder="密码" type="password" @keyup.enter="submit" />
    <button class="btn primary" :disabled="loading" @click="submit">{{ loading ? '登录中...' : '登录' }}</button>
    <p v-if="error" style="color:#dc2626;font-size:0.9rem;">{{ error }}</p>
    <p class="muted" style="font-size:0.8rem;text-align:center;">
      <router-link to="/login">患者端登录</router-link>
    </p>
  </section>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { api } from '../services/api'

const router = useRouter()
const email = ref('')
const password = ref('')
const loading = ref(false)
const error = ref('')

const submit = async () => {
  if (!email.value || !password.value) {
    error.value = '请输入邮箱和密码'
    return
  }
  loading.value = true
  error.value = ''

  try {
    const res = await api.croLogin(email.value, password.value)
    localStorage.setItem('cro_token', res.token)
    localStorage.setItem('cro_company', JSON.stringify(res.company))
    router.push('/cro')
  } catch (e: any) {
    error.value = e?.response?.data?.message || '登录失败'
  } finally {
    loading.value = false
  }
}
</script>
