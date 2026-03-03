<template>
  <section class="grid">
    <h2>患者登录</h2>
    <p class="muted">手机号登录后可上传病历并匹配临床试验。</p>
    <input v-model.trim="phone" placeholder="手机号" />
    <input v-model.trim="code" placeholder="验证码(测试填 000000)" />
    <button class="btn primary" :disabled="loading" @click="submit">{{ loading ? '登录中...' : '登录' }}</button>
    <p v-if="error" class="muted">{{ error }}</p>
  </section>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth'

const router = useRouter()
const authStore = useAuthStore()

const phone = ref('')
const code = ref('')
const loading = ref(false)
const error = ref('')

const submit = async () => {
  if (!phone.value || !code.value) {
    error.value = '请输入手机号和验证码'
    return
  }

  loading.value = true
  error.value = ''

  try {
    await authStore.login(phone.value, code.value)
    router.push('/upload')
  } catch {
    error.value = '登录失败，请检查接口或重试'
  } finally {
    loading.value = false
  }
}
</script>
