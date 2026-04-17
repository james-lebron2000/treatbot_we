<template>
  <section class="grid">
    <h2>患者登录</h2>
    <p class="muted">输入手机号和验证码即可登录，登录后可上传病历匹配临床试验。</p>
    <input v-model.trim="phone" placeholder="请输入手机号" maxlength="11" inputmode="numeric" />
    <input v-model.trim="code" placeholder="验证码请输入 000000" maxlength="6" inputmode="numeric" @keyup.enter="submit" />
    <button class="btn primary" :disabled="loading" @click="submit" style="width:100%;">{{ loading ? '登录中...' : '登录' }}</button>
    <p v-if="error" style="color:#dc2626;font-size:0.9rem;">{{ error }}</p>

    <div style="margin-top:16px;padding-top:12px;border-top:1px solid #f3f4f6;text-align:center;">
      <a href="javascript:void(0)" style="color:#2563eb;font-size:0.88rem;" @click="router.push('/demo')">
        先看演示 →
      </a>
      <p style="margin:4px 0 0;font-size:0.78rem;color:#9ca3af;">
        30 秒了解 TreatBot 如何帮患者匹配试验，无需登录
      </p>
    </div>
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
  if (!phone.value || phone.value.length < 11) {
    error.value = '请输入11位手机号'
    return
  }
  if (!code.value) {
    error.value = '请输入验证码'
    return
  }

  loading.value = true
  error.value = ''

  try {
    await authStore.login(phone.value, code.value)
    router.push('/upload')
  } catch (e: any) {
    error.value = e?.response?.data?.message || '登录失败，请检查验证码'
  } finally {
    loading.value = false
  }
}
</script>
