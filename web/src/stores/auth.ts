import { defineStore } from 'pinia'
import { ref } from 'vue'
import { api } from '../services/api'

export const useAuthStore = defineStore('auth', () => {
  const token = ref(localStorage.getItem('token') || '')

  const login = async (phone: string, code: string) => {
    const res = await api.login({ phone, code })
    token.value = res.token
    localStorage.setItem('token', res.token)
  }

  const logout = () => {
    token.value = ''
    localStorage.removeItem('token')
  }

  return {
    token,
    login,
    logout
  }
})
