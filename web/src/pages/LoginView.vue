<template>
  <section class="grid login-col">
    <h2>欢迎回来</h2>
    <p class="muted">输入手机号就能开始。我们只用它给您发短信，没有骚扰，您随时可以注销。</p>
    <input v-model.trim="phone" placeholder="手机号（仅用于登录，不外传）" maxlength="11" inputmode="numeric" />
    <div class="code-row">
      <input v-model.trim="code" placeholder="验证码 (6 位，演示环境请输 000000)" maxlength="6" inputmode="numeric" @keyup.enter="submit" class="code-input" />
      <button type="button" class="btn code-btn" :disabled="sendingCode || codeCountdown > 0" @click="onSendCode">
        {{ sendingCode ? '发送中…' : (codeCountdown > 0 ? `${codeCountdown}s 后可重发` : '获取验证码') }}
      </button>
    </div>
    <button class="btn primary submit-btn" :disabled="loading" @click="submit">
      {{ loading ? '正在进入…' : '进入，帮家人找下一步' }}
    </button>
    <p v-if="error" class="msg msg-error">{{ error }}</p>
    <p v-if="sendCodeHint" class="msg msg-hint">{{ sendCodeHint }}</p>

    <PrivacyPromiseCard size="sm" :show-details-link="true" class="privacy-promise" />

    <div class="demo-links">
      <a href="javascript:void(0)" class="demo-link" @click="router.push('/demo')">
        先看看别人家的病历怎么被看懂 →
      </a>
      <p class="demo-sub">
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

<style scoped>
/* 登录列：移动端满宽，桌面端收成 ~420px 聚焦窄列居中 */
.login-col {
  max-width: 420px;
  margin-inline: auto;
}

/* 验证码行：输入框可压缩(min-width:0 防被按钮挤裁)，按钮不收缩，带间距 */
.code-row {
  display: flex;
  gap: var(--s-2);
  align-items: stretch;
}

.code-input {
  flex: 1;
  min-width: 0;
}

.code-btn {
  flex-shrink: 0;
  white-space: nowrap;
}

.submit-btn {
  width: 100%;
}

.msg {
  margin: 0;
  font-size: var(--fs-callout);
  line-height: var(--lh-normal);
}

.msg-error {
  color: var(--red);
}

.msg-hint {
  color: var(--mint);
}

.privacy-promise {
  margin-top: var(--s-3);
}

/* 演示入口：与上方表单用细分隔线分隔，整体居中 */
.demo-links {
  margin-top: var(--s-4);
  padding-top: var(--s-3);
  border-top: 1px solid var(--line);
  text-align: center;
}

.demo-link {
  color: var(--brand);
  font-size: var(--fs-callout);
}

.demo-sub {
  margin: var(--s-1) 0 0;
  font-size: var(--fs-caption);
  color: var(--text-muted);
}
</style>
