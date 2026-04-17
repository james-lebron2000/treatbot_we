import axios from 'axios'

export type ApiResponse<T> = {
  code?: number
  message?: string
  data?: T
} & T

export const http = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || 'https://inseq.top',
  timeout: 15000
})

http.interceptors.request.use((config) => {
  const token = localStorage.getItem('token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

http.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token')
      if (window.location.pathname !== '/treatbot/login') {
        window.location.href = '/treatbot/login'
      }
    }
    return Promise.reject(error)
  }
)

const unwrap = <T>(res: ApiResponse<T>): T => {
  if (res && typeof res === 'object' && 'data' in res) {
    return (res as ApiResponse<T>).data as T
  }
  return res as T
}

const isPresent = (value: unknown) => value !== undefined && value !== null && `${value}`.trim() !== ''

const buildMatchPayload = (params: Record<string, unknown>) => {
  const draftRaw = localStorage.getItem('structuredRecordDraft')
  const draft = draftRaw ? (JSON.parse(draftRaw) as Record<string, unknown>) : {}

  let disease = `${params.disease || params.diagnosis || draft.disease || draft.diagnosis || ''}`
  if (disease.includes('肺癌') && !disease.includes('非小细胞') && !disease.includes('小细胞')) {
    disease = '肺癌'
  }

  const payload: Record<string, unknown> = { disease }
  const stage = params.stage || draft.stage
  const city = params.city || params.location || draft.city || draft.location
  const geneMutation = params.gene_mutation || params.geneMutation || draft.gene_mutation || draft.geneMutation

  if (isPresent(stage)) payload.stage = stage
  if (isPresent(city)) payload.city = city
  if (isPresent(geneMutation)) payload.gene_mutation = geneMutation

  return payload
}

const extractTrialList = (payload: any): any[] => {
  if (Array.isArray(payload)) return payload
  if (!payload || typeof payload !== 'object') return []
  return payload.list || payload.items || payload.trials || payload.matches || payload.data || []
}

const buildIdempotencyKey = (payload: { trialId: string; recordId?: string }) => {
  const recordPart = payload.recordId ? String(payload.recordId) : 'none'
  return `web_apply_${payload.trialId}_${recordPart}`.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 64)
}

export const api = {
  async sendCode(phone: string) {
    const { data } = await http.post<ApiResponse<any>>('/api/auth/send-code', { phone })
    return unwrap<any>(data)
  },
  async login(payload: { phone: string; code: string }) {
    const { data } = await http.post<ApiResponse<{ token: string }>>('/api/auth/h5-login', payload)
    return unwrap<{ token: string }>(data)
  },
  async uploadMedicalRecord(file: File, type: string, remark: string) {
    const formData = new FormData()
    formData.append('file', file)
    formData.append('type', type)
    formData.append('remark', remark)
    const { data } = await http.post<ApiResponse<{ fileId: string; recordId?: string }>>('/api/medical/upload', formData)
    return unwrap<{ fileId: string; recordId?: string }>(data)
  },
  async getParseStatus(fileId: string) {
    const { data } = await http.get<ApiResponse<any>>(`/api/medical/parse-status?fileId=${fileId}`)
    return unwrap<any>(data)
  },
  async enrichRecord(id: string, payload: Record<string, unknown>) {
    const { data } = await http.patch<ApiResponse<any>>(`/api/medical/records/${id}/enrich`, payload)
    return unwrap<any>(data)
  },
  async getMedicalRecords() {
    const { data } = await http.get<ApiResponse<any>>('/api/medical/records')
    return unwrap<any>(data)
  },
  async getMatches(params: Record<string, unknown>) {
    const payload = buildMatchPayload(params)
    const query = new URLSearchParams()
    if (params.page !== undefined) query.set('page', String(params.page))
    if (params.pageSize !== undefined) query.set('pageSize', String(params.pageSize))
    if (params.recordId !== undefined) query.set('recordId', String(params.recordId))
    query.set('filters', JSON.stringify(payload))

    try {
      const { data } = await http.get<ApiResponse<any>>(`/api/matches?${query.toString()}`)
      return unwrap<any>(data)
    } catch (error: any) {
      if (error?.response?.status !== 404) throw error
      const { data } = await http.post<ApiResponse<any>>('/api/trials/matches/find', payload)
      return unwrap<any>(data)
    }
  },
  async getTrialDetail(id: string) {
    try {
      const { data } = await http.get<ApiResponse<any>>(`/api/trials/${encodeURIComponent(id)}`)
      return unwrap<any>(data)
    } catch (error: any) {
      if (error?.response?.status !== 404) throw error
      const { data } = await http.get<ApiResponse<any>>('/api/trials/search')
      const list = extractTrialList(unwrap<any>(data))
      const trial = list.find((item) => `${item.id || item.trialId}` === `${id}`)
      if (!trial) {
        throw new Error('试验不存在')
      }
      return trial
    }
  },
  async applyTrial(payload: { trialId: string; recordId?: string; remark?: string }) {
    const requestPayload: Record<string, unknown> = {
      trialId: payload.trialId
    }
    if (payload.recordId) {
      requestPayload.recordIds = [payload.recordId]
    }
    if (payload.remark) {
      requestPayload.remark = payload.remark
    }
    const { data } = await http.post<ApiResponse<any>>('/api/applications', requestPayload, {
      headers: {
        'Idempotency-Key': buildIdempotencyKey(payload)
      }
    })
    return unwrap<any>(data)
  },
  async getFilterOptions() {
    const { data } = await http.get<ApiResponse<any>>('/api/matches/filters')
    return unwrap<any>(data)
  },
  async getApplications(page = 1, pageSize = 20) {
    const { data } = await http.get<ApiResponse<any>>(`/api/applications?page=${page}&pageSize=${pageSize}`)
    return unwrap<any>(data)
  },
  async cancelApplication(id: string, reason?: string) {
    const { data } = await http.put<ApiResponse<any>>(`/api/applications/${id}/cancel`, { reason })
    return unwrap<any>(data)
  },
  async getAdminDashboard() {
    const { data } = await http.get<ApiResponse<any>>('/api/admin/dashboard')
    return unwrap<any>(data)
  },
  async getAdminApplications(page = 1, pageSize = 20, trialId?: string, groupByStatus = false) {
    const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) })
    if (trialId) params.set('trialId', trialId)
    if (groupByStatus) params.set('groupByStatus', 'true')
    const { data } = await http.get<ApiResponse<any>>(`/api/admin/applications?${params}`)
    return unwrap<any>(data)
  },
  async updateApplicationStatus(id: string, status: string) {
    const { data } = await http.put<ApiResponse<any>>(`/api/admin/applications/${id}/status`, { status })
    return unwrap<any>(data)
  },
  async getAdminTrials() {
    const { data } = await http.get<ApiResponse<any>>('/api/admin/trials')
    return unwrap<any>(data)
  },
  async addApplicationNote(id: string, content: string) {
    const { data } = await http.post<ApiResponse<any>>(`/api/admin/applications/${id}/notes`, { content })
    return unwrap<any>(data)
  },
  async getAdminUsers(page = 1, pageSize = 20) {
    const { data } = await http.get<ApiResponse<any>>(`/api/admin/users?page=${page}&pageSize=${pageSize}`)
    return unwrap<any>(data)
  },
  async getProfile() {
    try {
      const { data } = await http.get<ApiResponse<any>>('/api/auth/profile')
      return unwrap<any>(data)
    } catch (error: any) {
      if (error?.response?.status !== 404) throw error
      const { data } = await http.get<ApiResponse<any>>('/api/user/profile')
      return unwrap<any>(data)
    }
  },

  // ===== CRO API =====
  async croLogin(email: string, password: string) {
    const { data } = await http.post<ApiResponse<any>>('/api/cro/login', { email, password })
    return unwrap<any>(data)
  },
  async getCroProfile() {
    const { data } = await croHttp.get<ApiResponse<any>>('/api/cro/profile')
    return unwrap<any>(data)
  },
  async getCroTrials() {
    const { data } = await croHttp.get<ApiResponse<any>>('/api/cro/trials')
    return unwrap<any>(data)
  },
  async getCroApplications(trialId: string) {
    const { data } = await croHttp.get<ApiResponse<any>>(`/api/cro/applications?trialId=${encodeURIComponent(trialId)}`)
    return unwrap<any>(data)
  },
  async updateCroApplicationStatus(id: string, status: string) {
    const { data } = await croHttp.put<ApiResponse<any>>(`/api/cro/applications/${id}/status`, { status })
    return unwrap<any>(data)
  },
  async addCroNote(id: string, content: string) {
    const { data } = await croHttp.post<ApiResponse<any>>(`/api/cro/applications/${id}/notes`, { content })
    return unwrap<any>(data)
  },
  // Admin CRO management
  async getAdminCroList() {
    const { data } = await http.get<ApiResponse<any>>('/api/admin/cro')
    return unwrap<any>(data)
  },
  async createAdminCro(payload: Record<string, any>) {
    const { data } = await http.post<ApiResponse<any>>('/api/admin/cro', payload)
    return unwrap<any>(data)
  },
  async updateAdminCro(id: string, payload: Record<string, any>) {
    const { data } = await http.put<ApiResponse<any>>(`/api/admin/cro/${id}`, payload)
    return unwrap<any>(data)
  },

  // ===== Demo（公开免登录）=====
  // 注意：/api/demo/* 在后端 auth middleware 之前注册；这里显式不走 http 的 Authorization 也能正常返回。
  async listDemoSamples() {
    const { data } = await http.get<ApiResponse<any>>('/api/demo/samples')
    return unwrap<any>(data)
  },
  async getDemoSampleResult(id: string) {
    const { data } = await http.get<ApiResponse<any>>(
      `/api/demo/samples/${encodeURIComponent(id)}/result`
    )
    return unwrap<any>(data)
  },
  async getDemoSampleMatches(id: string) {
    const { data } = await http.get<ApiResponse<any>>(
      `/api/demo/samples/${encodeURIComponent(id)}/matches`
    )
    // 与 /api/matches 同构：{ list, pagination }
    return unwrap<any>(data)
  }
}

// CRO 专用 HTTP 客户端（使用 cro_token）
const croHttp = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || 'https://inseq.top',
  timeout: 15000
})

croHttp.interceptors.request.use((config) => {
  const token = localStorage.getItem('cro_token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

croHttp.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('cro_token')
      localStorage.removeItem('cro_company')
      if (!window.location.pathname.includes('/cro/login')) {
        window.location.href = '/treatbot/cro/login'
      }
    }
    return Promise.reject(error)
  }
)

export { croHttp }
