import axios from 'axios'

export type ApiResponse<T> = {
  code?: number
  message?: string
  data?: T
} & T

export const http = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || 'http://49.235.162.129',
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
  if (!isPresent(disease)) {
    disease = '肺癌'
  }
  if (disease.includes('肺癌')) {
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
  async getProfile() {
    try {
      const { data } = await http.get<ApiResponse<any>>('/api/auth/profile')
      return unwrap<any>(data)
    } catch (error: any) {
      if (error?.response?.status !== 404) throw error
      const { data } = await http.get<ApiResponse<any>>('/api/user/profile')
      return unwrap<any>(data)
    }
  }
}
