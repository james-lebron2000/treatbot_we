<template>
  <section class="admin-login">
    <div class="login-panel">
      <p class="eyebrow">Admin Console</p>
      <h1>数愈管理端</h1>
      <p class="hint">使用专用管理员用户名和 key 登录。后台访问会写入审计日志。</p>

      <form @submit.prevent="submit">
        <label>
          管理员用户名
          <input
            v-model.trim="username"
            autocomplete="username"
            placeholder="admin username"
            data-testid="admin-username"
          />
        </label>
        <label>
          管理员 key
          <input
            v-model="key"
            autocomplete="current-password"
            placeholder="admin key"
            type="password"
            data-testid="admin-key"
          />
        </label>
        <button class="primary-btn" :disabled="loading || !username || !key" data-testid="admin-login-button">
          {{ loading ? '登录中...' : '登录管理端' }}
        </button>
      </form>

      <p v-if="errorMsg" class="error-msg">{{ errorMsg }}</p>
    </div>
  </section>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { api } from '../../services/api'

const router = useRouter()
const username = ref('')
const key = ref('')
const loading = ref(false)
const errorMsg = ref('')

const submit = async () => {
  if (loading.value) return
  loading.value = true
  errorMsg.value = ''
  try {
    const res = await api.adminLogin({ username: username.value, key: key.value })
    localStorage.setItem('adminToken', res.token)
    localStorage.setItem('adminUser', JSON.stringify(res.admin || { username: username.value }))
    const redirect = sessionStorage.getItem('postAdminLoginPath') || '/treatbot/admin/dashboard'
    sessionStorage.removeItem('postAdminLoginPath')
    const normalized = redirect.startsWith('/treatbot') ? redirect.slice('/treatbot'.length) || '/admin/dashboard' : '/admin/dashboard'
    await router.replace(normalized)
  } catch (error: any) {
    errorMsg.value = error?.response?.data?.message || '管理员登录失败'
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
.admin-login {
  min-height: 100vh;
  display: grid;
  place-items: center;
  background: var(--bg-soft);
  padding: var(--s-6);
  font-family: var(--font-sans);
}

.login-panel {
  width: min(420px, 100%);
  border: 1px solid var(--line);
  border-radius: var(--r-lg);
  background: var(--bg);
  padding: var(--s-8) var(--s-6);
  box-shadow: var(--shadow-2);
}

.eyebrow {
  margin: 0 0 var(--s-2);
  color: var(--brand);
  font-size: var(--fs-caption);
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 1px;
}

h1 {
  margin: 0;
  font-size: var(--fs-display);
  color: var(--text);
  line-height: var(--lh-tight);
  letter-spacing: -0.01em;
}

.hint {
  margin: var(--s-2) 0 var(--s-6);
  color: var(--text-dim);
  font-size: var(--fs-callout);
  line-height: var(--lh-relaxed);
}

form,
label {
  display: grid;
  gap: var(--s-2);
}

form {
  gap: var(--s-4);
}

label {
  color: var(--text-dim);
  font-size: var(--fs-callout);
  font-weight: 500;
}

label input {
  border: 1px solid var(--line);
  border-radius: var(--r-md);
  padding: 10px var(--s-3);
  font-family: inherit;
  font-size: var(--fs-body);
  color: var(--text);
  background: var(--bg);
  transition: border-color 150ms ease, box-shadow 150ms ease;
}

label input:focus {
  outline: none;
  border-color: var(--brand);
  box-shadow: var(--shadow-focus);
}

.primary-btn {
  width: 100%;
  border: none;
  border-radius: var(--r-md);
  background: var(--brand);
  color: #fff;
  cursor: pointer;
  padding: var(--s-3) var(--s-4);
  font-size: var(--fs-body);
  font-weight: 600;
  transition: background 150ms ease, transform 100ms ease;
}

.primary-btn:hover:not(:disabled) {
  background: var(--brand-hover);
}

.primary-btn:active:not(:disabled) {
  transform: scale(0.98);
}

.primary-btn:disabled {
  background: var(--text-muted);
  cursor: not-allowed;
  opacity: 0.5;
}

.error-msg {
  margin: var(--s-4) 0 0;
  color: var(--red);
  background: var(--red-soft);
  border: 1px solid var(--red);
  border-radius: var(--r-md);
  padding: var(--s-2) var(--s-3);
  font-size: var(--fs-caption);
}
</style>
