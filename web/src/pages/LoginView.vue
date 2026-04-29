<template>
  <section class="grid">
    <h2>欢迎回来</h2>
    <p class="muted">输入手机号就能开始。我们只用它给您发短信，没有骚扰，您随时可以注销。</p>
    <input v-model.trim="phone" placeholder="手机号（仅用于登录，不外传）" maxlength="11" inputmode="numeric" />
    <div style="display:flex;gap:8px;align-items:stretch;">
      <input v-model.trim="code" placeholder="验证码 (6 位，演示环境请输 000000)" maxlength="6" inputmode="numeric" @keyup.enter="submit" style="flex:1;" />
      <button type="button" class="btn" :disabled="sendingCode || codeCountdown > 0" @click="onSendCode" style="white-space:nowrap;">
        {{ sendingCode ? '发送中…' : (codeCountdown > 0 ? `${codeCountdown}s 后可重发` : '获取验证码') }}
      </button>
    </div>
    <button class="btn primary" :disabled="loading" @click="submit" style="width:100%;">
      {{ loading ? '正在进入…' : '进入，帮家人找下一步' }}
    </button>
    <p v-if="error" style="color:#dc2626;font-size:0.9rem;">{{ error }}</p>
    <p v-if="sendCodeHint" style="color:#16a34a;font-size:0.85rem;">{{ sendCodeHint }}</p>

    <PrivacyPromiseCard size="sm" :show-details-link="true" style="margin-top:12px;" />

    <div style="margin-top:16px;padding-top:12px;border-top:1px solid #f3f4f6;text-align:center;">
      <a href="javascript:void(0)" style="color:#2563eb;font-size:0.88rem;" @click="router.push('/demo')">
        先看看别人家的病历怎么被看懂 →
      </a>
      <p style="margin:4px 0 0;font-size:0.78rem;color:#9ca3af;">
        30 秒的示例 · 不用登录 · 看完再决定要不要用
      </p>
    </div>
  </section>
</template>

<script setup lang="ts">
import { ref, onBeforeUnmount } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth'
import PrivacyPromiseCard from '../components/PrivacyPromiseCard.vue'
import { empathy } from '../i18n/empathy'
import { api } from '../services/api'
// PRD-2026Q2 §3.6：未配 VITE_TENCENT_CAPTCHA_APP_ID 时 ensureCaptchaTicket 返回 null，
// 原发码流程不变。
import { ensureCaptchaTicket } from '../utils/captcha'

const router = useRouter()
const authStore = useAuthStore()

const phone = ref('')
const code = ref('')
const loading = ref(false)
const error = ref('')

// PRD-2026Q2 §3.6：发码按钮状态 + 倒计时（与后端 60s lock 对齐）
const sendingCode = ref(false)
const sendCodeHint = ref('')
const codeCountdown = ref(0)
let countdownTimer: number | null = null

const startCountdown = (seconds: number) => {
  codeCountdown.value = seconds
  if (countdownTimer !== null) window.clearInterval(countdownTimer)
  countdownTimer = window.setInterval(() => {
    codeCountdown.value -= 1
    if (codeCountdown.value <= 0 && countdownTimer !== null) {
      window.clearInterval(countdownTimer)
      countdownTimer = null
    }
  }, 1000)
}

onBeforeUnmount(() => {
  if (countdownTimer !== null) window.clearInterval(countdownTimer)
})

const onSendCode = async () => {
  error.value = ''
  sendCodeHint.value = ''
  if (!phone.value || phone.value.length < 11) {
    error.value = empathy.error.invalidPhone
    return
  }
  sendingCode.value = true
  try {
    const ticket = await ensureCaptchaTicket().catch(() => null)
    await api.sendCode(phone.value, ticket || undefined)
    sendCodeHint.value = '验证码已发送，请查收短信'
    startCountdown(60)
  } catch (e: any) {
    const resp = e?.response
    if (resp?.status === 429) {
      const retry = resp.data?.data?.retryAfter
      error.value = resp.data?.data?.message || resp.data?.message || '发送过于频繁，请稍后再试'
      if (typeof retry === 'number') startCountdown(Math.min(retry, 600))
    } else {
      error.value = resp?.data?.message || '发送失败，请稍后再试'
    }
  } finally {
    sendingCode.value = false
  }
}

const submit = async () => {
  if (!phone.value || phone.value.length < 11) {
    error.value = empathy.error.invalidPhone
    return
  }
  if (!code.value) {
    error.value = empathy.error.invalidCode
    return
  }

  loading.value = true
  error.value = ''

  try {
    await authStore.login(phone.value, code.value)
    // PRD-2026Q2 §3.4：若此前因 token 失效被踢到登录页，回到原 URL。
    let target: string | null = null
    try {
      target = sessionStorage.getItem('postLoginPath')
      sessionStorage.removeItem('postLoginPath')
    } catch {
      target = null
    }
    router.push(target && !target.includes('/login') ? target : '/upload')
  } catch (e: any) {
    error.value = e?.response?.data?.message || empathy.error.invalidCode
  } finally {
    loading.value = false
  }
}
</script>
