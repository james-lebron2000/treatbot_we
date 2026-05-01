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
  background: #f5f7fb;
  padding: 20px;
}

.login-panel {
  width: min(420px, 100%);
  border: 1px solid #dde3ed;
  border-radius: 8px;
  background: #fff;
  padding: 24px;
  box-shadow: 0 18px 45px rgba(15, 23, 42, 0.1);
}

.eyebrow {
  margin: 0 0 6px;
  color: #2563eb;
  font-size: 12px;
  font-weight: 700;
  text-transform: uppercase;
}

h1 {
  margin: 0;
  font-size: 26px;
}

.hint {
  margin: 8px 0 20px;
  color: #6b7280;
  font-size: 13px;
  line-height: 1.6;
}

form,
label {
  display: grid;
  gap: 8px;
}

form {
  gap: 14px;
}

label {
  color: #374151;
  font-size: 13px;
}

.primary-btn {
  width: 100%;
  border: none;
  border-radius: 8px;
  background: #2563eb;
  color: #fff;
  cursor: pointer;
  padding: 11px 16px;
  font-size: 15px;
}

.primary-btn:disabled {
  background: #aab7cf;
  cursor: not-allowed;
}

.error-msg {
  margin: 14px 0 0;
  color: #b91c1c;
  font-size: 13px;
}
</style>
