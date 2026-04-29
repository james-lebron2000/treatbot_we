import { defineStore } from 'pinia'
import { ref } from 'vue'
import { api } from '../services/api'

// PRD-2026Q2 §3.4：access token + refresh token 一并持久化，
// api.ts 的 interceptor 在 401 时走 /auth/refresh 无感续期。
export const useAuthStore = defineStore('auth', () => {
  const token = ref(localStorage.getItem('token') || '')
  const refreshToken = ref(localStorage.getItem('refreshToken') || '')

  const setTokens = (next: { token: string; refreshToken?: string }) => {
    token.value = next.token
    localStorage.setItem('token', next.token)
    if (next.refreshToken) {
      refreshToken.value = next.refreshToken
      localStorage.setItem('refreshToken', next.refreshToken)
    }
  }

  const login = async (phone: string, code: string) => {
    const res = await api.login({ phone, code })
    setTokens({ token: res.token, refreshToken: (res as any).refreshToken })
  }

  const logout = () => {
    token.value = ''
    refreshToken.value = ''
    localStorage.removeItem('token')
    localStorage.removeItem('refreshToken')
  }

  return {
    token,
    refreshToken,
    setTokens,
    login,
    logout
  }
})
