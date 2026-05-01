import axios, { AxiosRequestConfig, AxiosError } from 'axios'

// PRD-2026Q2 §3.3：与后端统一的响应信封形状。
// 以前 `& T` 是为了兼容老路由有时直接返回 data（不包一层），这在 W2 后应该绝迹，
// 但暂时保留为可选字段以向前兼容——新代码读 `res.data` 即可。
export type ApiResponse<T> = {
  code?: number
  message?: string
  data?: T
}

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

// PRD-2026Q2 §3.4：401 → 尝试用 refreshToken 续期 → 重放原请求。
// 并发多条 401 同时落入时，只跑一次 refresh，其它请求挂在 pendingQueue 上等结果。
type RetriableConfig = AxiosRequestConfig & { __retried?: boolean }

let refreshPromise: Promise<string | null> | null = null
const LOGIN_PATH = '/treatbot/login'
const POST_LOGIN_KEY = 'postLoginPath'

const forceRedirectToLogin = () => {
  try {
    const current = window.location.pathname + window.location.search
    if (!current.includes(LOGIN_PATH)) {
      sessionStorage.setItem(POST_LOGIN_KEY, current)
    }
  } catch {
    // ignore storage errors（隐私模式等）
  }
  localStorage.removeItem('token')
  localStorage.removeItem('refreshToken')
  if (window.location.pathname !== LOGIN_PATH) {
    window.location.href = LOGIN_PATH
  }
}

const tryRefreshToken = async (): Promise<string | null> => {
  const refreshToken = localStorage.getItem('refreshToken')
  if (!refreshToken) return null
  try {
    const { data } = await axios.post<ApiResponse<{ token: string; refreshToken?: string }>>(
      `${http.defaults.baseURL}/api/auth/refresh`,
      { refreshToken },
      { timeout: 10000 }
    )
    const payload = (data as any)?.data || data
    const nextAccess = payload?.token
    if (!nextAccess) return null
    localStorage.setItem('token', nextAccess)
    if (payload.refreshToken) {
      localStorage.setItem('refreshToken', payload.refreshToken)
    }
    return nextAccess
  } catch {
    return null
  }
}

const runSingleFlightRefresh = async (): Promise<string | null> => {
  if (!refreshPromise) {
    refreshPromise = tryRefreshToken().finally(() => {
      // 下一次 401 重新发起 refresh
      setTimeout(() => { refreshPromise = null }, 0)
    })
  }
  return refreshPromise
}

http.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const status = error.response?.status
    const config = (error.config || {}) as RetriableConfig

    // refresh 接口本身 401 → 直接跳登录
    const isRefreshCall = typeof config.url === 'string' && config.url.includes('/api/auth/refresh')

    if (status !== 401 || config.__retried || isRefreshCall) {
      if (status === 401 && !isRefreshCall) {
        forceRedirectToLogin()
      }
      return Promise.reject(error)
    }

    config.__retried = true
    const nextToken = await runSingleFlightRefresh()
    if (!nextToken) {
      forceRedirectToLogin()
      return Promise.reject(error)
    }

    config.headers = config.headers || {}
    ;(config.headers as any).Authorization = `Bearer ${nextToken}`
    return http.request(config)
  }
)

// PRD-2026Q2 §3.3：简化版 unwrap。
// - 信封格式 `{code:0, data}` → 返回 data
// - 旧路由直接返回裸对象/数组 → 原样透传（临时兼容，等 W3 全面转 res.ok 后删除）
const unwrap = <T>(res: ApiResponse<T> | T): T => {
  if (res && typeof res === 'object' && 'data' in (res as any)) {
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
  if (params.gene_required === false || params.gene_required === 'false') {
    payload.gene_required = false
  }

  return payload
}

const extractTrialList = (payload: any): any[] => {
  if (Array.isArray(payload)) return payload
  if (!payload || typeof payload !== 'object') return []
  return payload.list || payload.items || payload.trials || payload.matches || payload.data || []
}

// PRD-2026Q2 §2.5：幂等键作用域与后端一致 —— 后端 scope 已含 userId+route+method，
// 所以前端只需要在 (trial) 维度幂等。保留 recordId 会让同一试验不同病历组合绕过去重。
const buildIdempotencyKey = (payload: { trialId: string }) => {
  return `web_apply_${payload.trialId}`.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 64)
}

export const api = {
  // PRD-2026Q2 §3.6：可选携带 captcha 票据；未启用 captcha 时不传也能通过。
  async sendCode(phone: string, captcha?: { ticket: string; randstr: string; captchaAppId?: string }) {
    const body: Record<string, unknown> = { phone }
    if (captcha) {
      body.ticket = captcha.ticket
      body.randstr = captcha.randstr
      if (captcha.captchaAppId) body.captchaAppId = captcha.captchaAppId
    }
    const { data } = await http.post<ApiResponse<any>>('/api/auth/send-code', body)
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
  // Phase E.2：H5 端原生支持 multi-FormData（<input multiple>），所以这里直接命中
  // /api/medical/upload-batch（一次最多 10 份）。返回 { total, successCount, fileIds, records[] }。
  async uploadMedicalRecordBatch(files: File[], type: string, remark: string) {
    const formData = new FormData()
    files.forEach((f) => formData.append('files', f))
    formData.append('type', type)
    formData.append('remark', remark)
    const { data } = await http.post<ApiResponse<{
      total: number;
      successCount: number;
      fileIds: string[];
      records: Array<{
        fileId: string; recordId?: string; status: string;
        ocrQueued?: boolean; isDuplicate?: boolean; uploadedAt?: string;
        message?: string; originalName?: string;
      }>;
    }>>('/api/medical/upload-batch', formData)
    return unwrap(data)
  },
  async getParseStatus(fileId: string) {
    const { data } = await http.get<ApiResponse<any>>(`/api/medical/parse-status?fileId=${fileId}`)
    return unwrap<any>(data)
  },
  // Phase E.2：批量查询解析状态（POST 体；最多 20 个 fileId）
  async getParseStatusBatch(fileIds: string[]) {
    const { data } = await http.post<ApiResponse<{
      entries: Array<{
        fileId: string; recordId: string; status: string; progress: number;
        result?: any; errorMsg?: string; createdAt?: string; updatedAt?: string;
      }>;
      total: number; completedCount: number; erroredCount: number; done: boolean;
    }>>('/api/medical/parse-status-batch', { fileIds })
    return unwrap(data)
  },
  // Phase E.3：跨多份病历的疾病发展 + 治疗经过时间线
  async getMedicalTimeline() {
    const { data } = await http.get<ApiResponse<{
      timeline: any;
      recordCount: number;
      sourceRecordIds: string[];
    }>>('/api/medical/timeline')
    return unwrap(data)
  },
  async enrichRecord(id: string, payload: Record<string, unknown>) {
    const { data } = await http.patch<ApiResponse<any>>(`/api/medical/records/${id}/enrich`, payload)
    return unwrap<any>(data)
  },
  async getMedicalRecords() {
    const { data } = await http.get<ApiResponse<any>>('/api/medical/records')
    return unwrap<any>(data)
  },
  // PRD-2026Q2 §3.5：多病历管理页 —— 软删除（后端将 deleted_at = now()，物理文件保留）。
  async softDeleteRecord(id: string) {
    const { data } = await http.delete<ApiResponse<{ id: string; deletedAt: string }>>(
      `/api/medical/records/${encodeURIComponent(id)}`
    )
    return unwrap<{ id: string; deletedAt: string }>(data)
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

  // ===== Q3-红线 §A.2：用户合规自助 =====
  async getMyConsent() {
    const { data } = await http.get<ApiResponse<{ list: Array<{ scope: string; policyVersion: string; agreedAt: string }> }>>(
      '/api/me/consent'
    )
    return unwrap<{ list: Array<{ scope: string; policyVersion: string; agreedAt: string }> }>(data)
  },
  async recordConsent(scope: 'upload' | 'match' | 'share_with_cro', policyVersion: string) {
    const { data } = await http.post<ApiResponse<any>>('/api/me/consent', { scope, policyVersion })
    return unwrap<any>(data)
  },
  async exportMyData(): Promise<Blob> {
    const res = await http.get('/api/me/export', { responseType: 'blob' })
    return res.data as Blob
  },
  async deleteMyAccount(smsCode?: string) {
    const body: Record<string, unknown> = {}
    if (smsCode) body.smsCode = smsCode
    const { data } = await http.post<ApiResponse<any>>('/api/me/delete-account', body)
    return unwrap<any>(data)
  },
  async changeMyPassword(oldPassword: string, newPassword: string) {
    const { data } = await http.post<ApiResponse<{ token: string; refreshToken: string }>>(
      '/api/me/change-password',
      { oldPassword, newPassword }
    )
    return unwrap<{ token: string; refreshToken: string }>(data)
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
  // 用裸 axios 而不是 http：避免请求拦截器附带 Authorization header（带过期 token 会触发
  // 401 → forceRedirectToLogin 副作用，把演示用户踢去登录页；同时少了 Authorization
  // 让 GET 保持「simple request」语义，跨域时也无需 CORS preflight）。
  async listDemoSamples() {
    const { data } = await axios.get<ApiResponse<any>>(
      `${http.defaults.baseURL}/api/demo/samples`,
      { timeout: 15000 }
    )
    return unwrap<any>(data)
  },
  async getDemoSampleResult(id: string) {
    const { data } = await axios.get<ApiResponse<any>>(
      `${http.defaults.baseURL}/api/demo/samples/${encodeURIComponent(id)}/result`,
      { timeout: 15000 }
    )
    return unwrap<any>(data)
  },
  async getDemoSampleMatches(id: string) {
    const { data } = await axios.get<ApiResponse<any>>(
      `${http.defaults.baseURL}/api/demo/samples/${encodeURIComponent(id)}/matches`,
      { timeout: 15000 }
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
