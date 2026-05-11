/**
 * API 请求封装
 * 统一处理所有后端接口请求，生产环境默认禁用本地兜底。
 */

const DEFAULT_TEST_BASE_URL = 'https://inseq.top'
const DEFAULT_PROD_BASE_URL = 'https://inseq.top'

const API_CONFIG = {
  dev: {
    baseUrl: DEFAULT_TEST_BASE_URL,
    mockMode: false,
    allowLocalFallback: false
  },
  trial: {
    baseUrl: DEFAULT_TEST_BASE_URL,
    mockMode: false,
    allowLocalFallback: false
  },
  prod: {
    baseUrl: DEFAULT_PROD_BASE_URL,
    mockMode: false,
    allowLocalFallback: false
  }
}

const resolveEnv = () => {
  try {
    const accountInfo = wx.getAccountInfoSync && wx.getAccountInfoSync()
    const envVersion = accountInfo && accountInfo.miniProgram && accountInfo.miniProgram.envVersion
    if (envVersion === 'release') {
      return 'prod'
    }
    if (envVersion === 'trial') {
      return 'trial'
    }
    return 'dev'
  } catch (error) {
    return 'dev'
  }
}

const trimTrailingSlash = (value) => {
  return `${value || ''}`.trim().replace(/\/+$/, '')
}

const ENV = resolveEnv()
const runtimeConfig = API_CONFIG[ENV] || API_CONFIG.dev
const mockMode = runtimeConfig.mockMode
const ALLOWED_BASE_URLS = Array.from(new Set([DEFAULT_TEST_BASE_URL, DEFAULT_PROD_BASE_URL].map(trimTrailingSlash)))

const resolveAllowedBaseUrl = (value) => {
  const normalized = trimTrailingSlash(value)
  if (!normalized) {
    return ''
  }
  if (ALLOWED_BASE_URLS.includes(normalized)) {
    return normalized
  }
  return ''
}

const getRuntimeBaseUrl = () => {
  const stored = wx.getStorageSync('apiBaseUrl')
  const storedBaseUrl = resolveAllowedBaseUrl(stored)
  if (stored && !storedBaseUrl) {
    wx.removeStorageSync('apiBaseUrl')
  }
  if (storedBaseUrl) {
    return storedBaseUrl
  }

  try {
    const app = typeof getApp === 'function' ? getApp() : null
    const appBaseUrl = resolveAllowedBaseUrl(app && app.globalData && app.globalData.apiBaseUrl)
    if (appBaseUrl) {
      return appBaseUrl
    }
  } catch (error) {
    // ignore
  }

  return trimTrailingSlash(runtimeConfig.baseUrl)
}

const shouldUseLocalFallback = () => {
  try {
    const app = typeof getApp === 'function' ? getApp() : null
    const appOverride = app && app.globalData && app.globalData.allowLocalFallback
    if (typeof appOverride === 'boolean') {
      return appOverride
    }
  } catch (error) {
    // ignore
  }

  const override = wx.getStorageSync('enableLocalFallback')
  if (typeof override === 'boolean') {
    return override
  }

  return !!runtimeConfig.allowLocalFallback
}

const LOCAL_RECORDS_KEY = 'localMedicalRecords'
const LOCAL_APPLICATIONS_KEY = 'localTrialApplications'
const ENDPOINT_STATE_KEY = 'endpointState'
const ENDPOINT_DISABLE_TTL = 5 * 60 * 1000

const readEndpointState = () => {
  const value = wx.getStorageSync(ENDPOINT_STATE_KEY)
  if (!value || typeof value !== 'object') {
    return {}
  }
  return value
}

let endpointState = readEndpointState()

const saveEndpointState = () => {
  wx.setStorageSync(ENDPOINT_STATE_KEY, endpointState)
}

const markEndpointUnavailable = (key) => {
  if (!key) {
    return
  }
  endpointState = {
    ...endpointState,
    [key]: 'unavailable',
    [`${key}UpdatedAt`]: Date.now(),
    updatedAt: Date.now()
  }
  saveEndpointState()
}

const markEndpointAvailable = (key) => {
  if (!key) {
    return
  }
  endpointState = {
    ...endpointState,
    [key]: 'available',
    [`${key}UpdatedAt`]: Date.now(),
    updatedAt: Date.now()
  }
  saveEndpointState()
}

const isEndpointUnavailable = (key) => {
  if (endpointState[key] !== 'unavailable') {
    return false
  }

  const updatedAt = Number(endpointState[`${key}UpdatedAt`] || 0)
  if (!updatedAt) {
    return true
  }

  return Date.now() - updatedAt <= ENDPOINT_DISABLE_TTL
}

const LOCAL_TRIALS = [
  {
    id: 'L-TRIAL-001',
    name: 'EGFR 突变晚期非小细胞肺癌二线治疗研究',
    phase: 'II期',
    location: '上海',
    type: '临床研究',
    indication: '非小细胞肺癌',
    institution: '复旦大学附属肿瘤医院',
    stages: ['III期', 'IV期'],
    genes: ['EGFR']
  },
  {
    id: 'L-TRIAL-002',
    name: 'PD-1 联合化疗一线治疗 NSCLC 多中心研究',
    phase: 'III期',
    location: '上海',
    type: '随机对照研究',
    indication: '非小细胞肺癌',
    institution: '上海市胸科医院',
    stages: ['III期', 'IV期'],
    genes: ['ALK', 'KRAS', 'EGFR']
  },
  {
    id: 'L-TRIAL-003',
    name: 'ROS1 靶向治疗真实世界随访研究',
    phase: 'IV期',
    location: '北京',
    type: '观察性研究',
    indication: '肺癌',
    institution: '中国医学科学院肿瘤医院',
    stages: ['II期', 'III期', 'IV期'],
    genes: ['ROS1']
  },
  {
    id: 'L-TRIAL-004',
    name: '晚期肺癌免疫治疗疗效与安全性队列',
    phase: 'III期',
    location: '广州',
    type: '临床研究',
    indication: '肺癌',
    institution: '中山大学肿瘤防治中心',
    stages: ['III期', 'IV期'],
    genes: ['PD-L1']
  }
]

const normalizePayload = (response) => {
  if (!response || typeof response !== 'object') {
    return response
  }

  if (Object.prototype.hasOwnProperty.call(response, 'data')) {
    return response.data
  }

  return response
}

const getErrorMessage = (res) => {
  if (!res || typeof res !== 'object') {
    return '请求失败'
  }

  const payload = normalizePayload(res)
  return payload.message || payload.msg || res.message || '请求失败'
}

const buildHttpError = (message, extras = {}) => {
  const error = new Error(message || '请求失败')
  Object.keys(extras).forEach((key) => {
    error[key] = extras[key]
  })
  return error
}

const isPresent = (value) => {
  return value !== undefined && value !== null && `${value}`.trim() !== '' && value !== '待补'
}

const safeText = (value) => {
  return `${value || ''}`.trim()
}

const delay = (ms) => {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

const includesEither = (a, b) => {
  const left = safeText(a)
  const right = safeText(b)
  if (!left || !right) {
    return false
  }
  return left.indexOf(right) > -1 || right.indexOf(left) > -1
}

const buildQueryString = (params = {}) => {
  const pairs = Object.keys(params)
    .filter((key) => isPresent(params[key]))
    .map((key) => `${encodeURIComponent(key)}=${encodeURIComponent(params[key])}`)
  return pairs.length > 0 ? `?${pairs.join('&')}` : ''
}

const readLocalRecords = () => {
  const records = wx.getStorageSync(LOCAL_RECORDS_KEY)
  return Array.isArray(records) ? records : []
}

const writeLocalRecords = (records) => {
  wx.setStorageSync(LOCAL_RECORDS_KEY, records)
}

const upsertLocalRecord = (record) => {
  const records = readLocalRecords()
  const index = records.findIndex((item) => `${item.id}` === `${record.id}`)
  if (index >= 0) {
    records[index] = {
      ...records[index],
      ...record,
      updatedAt: new Date().toISOString()
    }
  } else {
    records.unshift({
      ...record,
      createdAt: record.createdAt || new Date().toISOString(),
      updatedAt: record.updatedAt || new Date().toISOString()
    })
  }
  writeLocalRecords(records.slice(0, 50))
}

const readLocalApplications = () => {
  const applications = wx.getStorageSync(LOCAL_APPLICATIONS_KEY)
  return Array.isArray(applications) ? applications : []
}

const writeLocalApplications = (applications) => {
  wx.setStorageSync(LOCAL_APPLICATIONS_KEY, applications)
}

const upsertLocalApplication = (application) => {
  const applications = readLocalApplications()
  const index = applications.findIndex((item) => `${item.id}` === `${application.id}`)
  if (index >= 0) {
    applications[index] = {
      ...applications[index],
      ...application,
      updatedAt: new Date().toISOString()
    }
  } else {
    applications.unshift({
      ...application,
      createdAt: application.createdAt || new Date().toISOString(),
      updatedAt: application.updatedAt || new Date().toISOString()
    })
  }
  writeLocalApplications(applications.slice(0, 100))
}

const buildGuestLoginResponse = () => {
  return {
    code: 0,
    data: {
      token: `guest_${Date.now()}`,
      userInfo: {
        id: 'guest',
        nickName: '访客用户',
        avatarUrl: ''
      },
      phone: ''
    }
  }
}

const buildMatchPayload = (params = {}) => {
  const draft = params.useDraft === false ? {} : (wx.getStorageSync('structuredRecordDraft') || {})
  const hasRecordId = isPresent(params.recordId)

  const diagnosis = params.disease || params.diagnosis || (hasRecordId ? '' : (draft.disease || draft.diagnosis || ''))
  const payload = {}
  if (isPresent(diagnosis)) {
    payload.disease = diagnosis
  }

  const stage = params.stage || (hasRecordId ? '' : draft.stage)
  const city = params.city || params.location || (hasRecordId ? '' : (draft.city || draft.location))
  const province = params.province || (hasRecordId ? '' : (draft.province || ''))
  const geneMutation = params.gene_mutation || params.geneMutation || (hasRecordId ? '' : (draft.gene_mutation || draft.geneMutation))

  if (isPresent(stage)) {
    payload.stage = stage
  }
  if (isPresent(city)) {
    payload.city = city
  }
  if (isPresent(province)) {
    payload.province = province
  }
  if (isPresent(geneMutation)) {
    payload.gene_mutation = geneMutation
  }

  return payload
}

const buildLocalMatches = (payload = {}) => {
  const disease = safeText(payload.disease)
  const stage = safeText(payload.stage)
  const city = safeText(payload.city)
  const gene = safeText(payload.gene_mutation)

  const list = LOCAL_TRIALS.map((trial) => {
    let score = 42
    const reasons = []

    if (disease) {
      if (includesEither(trial.indication, disease)) {
        score += 30
        reasons.push('疾病方向匹配')
      } else {
        score += 6
      }
    }

    if (stage) {
      if (trial.stages.includes(stage)) {
        score += 12
        reasons.push('分期匹配')
      } else {
        score -= 3
      }
    }

    if (city) {
      if (includesEither(trial.location, city)) {
        score += 10
        reasons.push('地理位置匹配')
      }
    }

    if (gene) {
      const geneMatched = trial.genes.some((item) => includesEither(item, gene))
      if (geneMatched) {
        score += 8
        reasons.push('基因特征匹配')
      }
    }

    if (reasons.length === 0) {
      reasons.push('符合基础入组方向')
    }

    const finalScore = Math.max(35, Math.min(98, score))
    return {
      id: trial.id,
      name: trial.name,
      title: trial.name,
      trialName: trial.name,
      score: finalScore,
      matchScore: finalScore,
      phase: trial.phase,
      trialPhase: trial.phase,
      location: trial.location,
      city: trial.location,
      type: trial.type,
      studyType: trial.type,
      indication: trial.indication,
      cancerType: trial.indication,
      institution: trial.institution,
      hospital: trial.institution,
      reasons,
      matchReasons: reasons,
      inclusionSummary: `建议优先评估 ${trial.indication} 患者入组条件`,
      updatedAt: new Date().toISOString()
    }
  })

  return list.sort((a, b) => b.score - a.score)
}

const extractTrialList = (payload) => {
  if (Array.isArray(payload)) {
    return payload
  }

  if (!payload || typeof payload !== 'object') {
    return []
  }

  return payload.list || payload.items || payload.trials || payload.matches || payload.data || []
}

const extractApplicationList = (payload) => {
  if (Array.isArray(payload)) {
    return payload
  }

  if (!payload || typeof payload !== 'object') {
    return []
  }

  return payload.list || payload.items || payload.applications || payload.data || []
}

// Q3-红线 §A.1：双 token 续签 single-flight。多个并发请求同时撞 401 时，只
// 让第一个发起 /api/auth/refresh，其它共享同一个 Promise，避免 refreshToken
// 被 Redis (single-use) 端连续消费导致全员登出。H5 web/src/utils/api.ts 同语义。
let refreshing = null

const clearAuth = () => {
  wx.removeStorageSync('token')
  wx.removeStorageSync('refreshToken')
}

const tryRefreshToken = () => {
  if (refreshing) return refreshing
  const refreshToken = wx.getStorageSync('refreshToken')
  if (!refreshToken) {
    return Promise.reject(new Error('no_refresh_token'))
  }
  refreshing = new Promise((resolve, reject) => {
    wx.request({
      url: `${getRuntimeBaseUrl()}/api/auth/refresh`,
      method: 'POST',
      data: { refreshToken },
      header: { 'Content-Type': 'application/json' },
      timeout: 10000,
      success: (res) => {
        // 兼容 envelope { success, data: { token, refreshToken } } 与 旧版裸字段两种
        const data = (res.data && res.data.data) || res.data || {}
        const nextToken = data.token
        if (res.statusCode === 200 && nextToken) {
          wx.setStorageSync('token', nextToken)
          if (data.refreshToken) {
            wx.setStorageSync('refreshToken', data.refreshToken)
          }
          resolve(nextToken)
        } else {
          reject(new Error('refresh_failed'))
        }
      },
      fail: (err) => reject(err)
    })
  }).finally(() => {
    refreshing = null
  })
  return refreshing
}

const request = (options) => {
  return new Promise((resolve, reject) => {
    const token = wx.getStorageSync('token')
    const baseUrl = getRuntimeBaseUrl()
    const customHeaders = options.headers && typeof options.headers === 'object' ? options.headers : {}

    wx.request({
      url: `${baseUrl}${options.url}`,
      method: options.method || 'GET',
      data: options.data || {},
      timeout: options.timeout || 15000,
      header: {
        'Content-Type': options.contentType || 'application/json',
        Authorization: token ? `Bearer ${token}` : '',
        ...customHeaders
      },
      success: (res) => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(res.data)
          return
        }

        if (res.statusCode === 401 && !options._retried) {
          // single-flight：触发刷新；成功后用新 token 重放原请求一次（_retried 防递归）
          tryRefreshToken()
            .then(() => request({ ...options, _retried: true }).then(resolve, reject))
            .catch(() => {
              clearAuth()
              wx.showToast({ title: '登录已过期，请重新登录', icon: 'none' })
              reject(buildHttpError('Unauthorized', { statusCode: 401, response: res.data }))
            })
          return
        }

        if (res.statusCode === 401) {
          // 已重放过仍 401：彻底放弃
          clearAuth()
          wx.showToast({ title: '登录已过期，请重新登录', icon: 'none' })
          reject(buildHttpError('Unauthorized', { statusCode: 401, response: res.data }))
          return
        }

        reject(
          buildHttpError(getErrorMessage(res.data), {
            statusCode: res.statusCode,
            response: res.data
          })
        )
      },
      fail: (err) => {
        console.error('请求失败:', err)
        reject(
          buildHttpError('网络请求失败，请检查网络后重试', {
            statusCode: 0,
            response: err
          })
        )
      }
    })
  })
}

const requestWithRetry = async (options, retryCount = 1) => {
  let lastError = null
  for (let i = 0; i <= retryCount; i += 1) {
    try {
      return await request(options)
    } catch (error) {
      lastError = error
      const nonRetryable = error.statusCode === 401 || error.statusCode === 403 || error.statusCode === 404
      if (i >= retryCount || nonRetryable) {
        throw error
      }
      await delay(280 * (i + 1))
    }
  }
  throw lastError || new Error('请求失败')
}

// Q3-红线 §A.1（补丁）：上传同样要走 single-flight refresh，否则病历上传到一半
// 撞上 token 过期 → 用户面前直接红屏失败。复用 request() 的同一个 refreshing Promise，
// 保证多个上传并发时只发一次 /auth/refresh。
//
// Track C-1（PRD-2026Q3）：批量上传偶发「2 张传 1 张失败」根因 —— 此前 wx.uploadFile
//   30s 硬超时 + 0 重试 + fail 回调直接 reject，弱网下任何一次 ETIMEDOUT / 5xx /
//   COS 抖动都会让这一份永久失败。补丁：
//     1. timeout 30s → 60s（multer 30MB cap + COS putObject 在弱网下偶尔 35-50s）
//     2. 网络层 fail（statusCode=0）+ 服务端 5xx（>= 500）退避 1500ms × 1 次重试
//     3. 401（已有路径）+ 4xx（4xx 通常是参数错误，不重试）保持不变
//   注意：retry 计数走两条独立通道 —— authRetried 给 401 token 刷新用；transientRetried
//   给 5xx / 网络层用 —— 同一个 doUpload 调用最多消耗这两次中的一次（401 通常不会同时
//   伴随 5xx）。
const TRANSIENT_RETRY_DELAY_MS = 1500
const isTransientUploadError = (statusCode) => {
  const sc = Number(statusCode || 0)
  // statusCode === 0 → wx.uploadFile fail 回调（DNS / 超时 / 网络断开）
  // sc >= 500 → 服务端瞬时错误（502 / 503 / 504 / COS 透传 5xx）
  return sc === 0 || sc >= 500
}

const uploadFile = (options) => {
  return new Promise((resolve, reject) => {
    // authRetried：401 → token refresh → 重试（旧逻辑）
    // transientRetried：超时/5xx → 退避后重试（新增，每次上传最多 1 次）
    const doUpload = (authRetried, transientRetried) => {
      const token = wx.getStorageSync('token')
      const baseUrl = getRuntimeBaseUrl()
      wx.uploadFile({
        url: `${baseUrl}${options.url}`,
        filePath: options.filePath,
        name: options.name || 'file',
        timeout: options.timeout || 60000,
        header: {
          Authorization: token ? `Bearer ${token}` : ''
        },
        formData: options.formData || {},
        success: (res) => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            try {
              const parsed = typeof res.data === 'string' ? JSON.parse(res.data) : res.data
              resolve(parsed)
            } catch (error) {
              reject(buildHttpError('上传返回数据格式错误', { statusCode: res.statusCode }))
            }
            return
          }

          if (res.statusCode === 401 && !authRetried) {
            tryRefreshToken()
              .then(() => doUpload(true, transientRetried))
              .catch(() => {
                clearAuth()
                wx.showToast({ title: '登录已过期，请重新登录', icon: 'none' })
                reject(buildHttpError('Unauthorized', { statusCode: 401, response: res.data }))
              })
            return
          }

          // Track C-1：5xx 瞬时错误退避后重试一次（同一上传最多 1 次）
          if (isTransientUploadError(res.statusCode) && !transientRetried) {
            console.warn(`[uploadFile] transient ${res.statusCode}, retry after ${TRANSIENT_RETRY_DELAY_MS}ms`)
            setTimeout(() => doUpload(authRetried, true), TRANSIENT_RETRY_DELAY_MS)
            return
          }

          reject(buildHttpError('上传失败', { statusCode: res.statusCode, response: res.data }))
        },
        fail: (err) => {
          // 网络层失败（statusCode 隐式 0）：超时 / DNS / 网络断 → 退避后重试一次
          if (!transientRetried) {
            console.warn('[uploadFile] network fail, retry after', TRANSIENT_RETRY_DELAY_MS, 'ms', err)
            setTimeout(() => doUpload(authRetried, true), TRANSIENT_RETRY_DELAY_MS)
            return
          }
          console.error('上传失败:', err)
          reject(buildHttpError('网络上传失败', { statusCode: 0, response: err }))
        }
      })
    }
    doUpload(false, false)
  })
}

// ==================== 认证相关 API ====================

const login = async (code) => {
  if (mockMode) {
    return buildGuestLoginResponse()
  }

  if (shouldUseLocalFallback() && isEndpointUnavailable('authLogin')) {
    return buildGuestLoginResponse()
  }

  try {
    const res = await request({
      url: '/api/auth/weapp-login',
      method: 'POST',
      data: { code }
    })
    markEndpointAvailable('authLogin')
    return res
  } catch (error) {
    if (shouldUseLocalFallback() && (error.statusCode === 404 || error.statusCode === 0)) {
      markEndpointUnavailable('authLogin')
      return buildGuestLoginResponse()
    }
    throw error
  }
}

const loginWithTestAccount = async (params = {}) => {
  return request({
    url: '/api/auth/h5-login',
    method: 'POST',
    data: {
      phone: safeText(params.phone || '13800138000'),
      code: safeText(params.code || '000000')
    }
  })
}

const getProfile = async () => {
  const endpoints = ['/api/auth/profile', '/api/user/profile']

  let lastError = null
  for (let i = 0; i < endpoints.length; i += 1) {
    try {
      return await request({
        url: endpoints[i],
        method: 'GET'
      })
    } catch (error) {
      lastError = error
      if (error.statusCode === 404 || error.statusCode === 0) {
        continue
      }
      throw error
    }
  }

  throw lastError || new Error('获取用户信息失败')
}

// ==================== Q3-红线 §A.2：用户合规自助 API ====================
// 后端在 server/routes/index.js:49-53 已就绪；小程序此前没有调用方，所以
// 用户在 WeApp 端无法行使「同意管理 / 数据导出 / 注销」三项权益。
// 这里照 H5 web/src/api/me.ts 的命名复刻，便于以后做 codegen 共享。

const getMyConsent = () =>
  request({ url: '/api/me/consent', method: 'GET' })

const recordConsent = (scope, policyVersion) =>
  request({
    url: '/api/me/consent',
    method: 'POST',
    data: { scope, policyVersion }
  })

const exportMyData = () =>
  request({ url: '/api/me/export', method: 'GET', timeout: 30000 })

const deleteMyAccount = (reason) =>
  request({
    url: '/api/me/delete-account',
    method: 'POST',
    data: { reason: reason || '' }
  })

const changeMyPassword = (oldPassword, newPassword) =>
  request({
    url: '/api/me/change-password',
    method: 'POST',
    data: { oldPassword, newPassword }
  })

// PRD-2026Q2 §3.5：多病历软删除（后端 DELETE /medical/records/:id 已是软删）。
const softDeleteMedicalRecord = (id) =>
  request({
    url: `/api/medical/records/${encodeURIComponent(id)}`,
    method: 'DELETE'
  })

// ==================== 病历相关 API ====================

// Plan §Phase 2.1：客户端直传 COS（用户最痛点的解药）
//   - fetchUploadSts(params) → GET /api/medical/upload-sts?count=&originalNames=&types=
//   - finalizeUpload(payload) → POST /api/medical/upload-finalize
// 与 uploadMedicalRecord (multipart) 双轨并存：cosDirectUploader 拿到 mode='local' 或
// 任何不可恢复错误时回落到老路径，前端无需感知。
const fetchUploadSts = (params = {}) => {
  const safeParams = {
    count: params.count,
    originalNames: Array.isArray(params.originalNames)
      ? params.originalNames.join(',')
      : params.originalNames,
    types: Array.isArray(params.types) ? params.types.join(',') : params.types
  }
  return request({
    url: `/api/medical/upload-sts${buildQueryString(safeParams)}`,
    method: 'GET'
  })
}

const finalizeUpload = (payload = {}) =>
  request({
    url: '/api/medical/upload-finalize',
    method: 'POST',
    data: { files: Array.isArray(payload.files) ? payload.files : [] },
    timeout: 30000
  })

const uploadMedicalRecord = async (params) => {
  const res = await uploadFile({
    url: '/api/medical/upload',
    filePath: params.filePath,
    name: 'file',
    formData: {
      type: params.type,
      remark: params.remark,
      forceReparse: '1'
    }
  })

  const payload = normalizePayload(res) || {}
  const id = payload.recordId || payload.fileId || payload.id || `local_${Date.now()}`
  upsertLocalRecord({
    id,
    fileId: payload.fileId || id,
    type: params.type || 'auto',
    remark: params.remark || '',
    status: 'uploading',
    statusText: '已上传',
    createdAt: new Date().toISOString()
  })

  return res
}

const buildParseStatusFallback = (fileId) => {
  return {
    data: {
      status: 'completed',
      progress: 100,
      result: {
        id: fileId
      }
    },
    fallback: true,
    message: '解析接口暂不可用，已进入手动补全模式'
  }
}

const getParseStatus = async (fileId) => {
  if (shouldUseLocalFallback() && isEndpointUnavailable('parseStatus')) {
    return buildParseStatusFallback(fileId)
  }

  try {
    const res = await request({
      url: `/api/medical/parse-status?fileId=${fileId}`,
      method: 'GET'
    })
    markEndpointAvailable('parseStatus')
    return res
  } catch (error) {
    if (shouldUseLocalFallback() && error.statusCode === 404) {
      markEndpointUnavailable('parseStatus')
      return buildParseStatusFallback(fileId)
    }
    throw error
  }
}

/**
 * Phase E.2：批量查询解析状态。
 *   入参：['id1','id2',...]   出参：原始 server response（data.entries[]）
 * 服务端不可用时模拟批量 fallback —— 给每个 fileId 返回 completed 占位，让前端走手填路径。
 */
const getParseStatusBatch = async (fileIds) => {
  const ids = (Array.isArray(fileIds) ? fileIds : []).filter(Boolean)
  if (!ids.length) {
    return { data: { entries: [], total: 0, completedCount: 0, erroredCount: 0, done: true } }
  }
  if (shouldUseLocalFallback() && isEndpointUnavailable('parseStatusBatch')) {
    return {
      data: {
        entries: ids.map((id) => buildParseStatusFallback(id).data),
        total: ids.length,
        completedCount: ids.length,
        erroredCount: 0,
        done: true
      },
      fallback: true,
      message: '解析接口暂不可用，已进入手动补全模式'
    }
  }
  try {
    const res = await request({
      url: '/api/medical/parse-status-batch',
      method: 'POST',
      data: { fileIds: ids }
    })
    markEndpointAvailable('parseStatusBatch')
    return res
  } catch (error) {
    if (shouldUseLocalFallback() && (error.statusCode === 404 || error.statusCode === 0)) {
      markEndpointUnavailable('parseStatusBatch')
      return {
        data: {
          entries: ids.map((id) => buildParseStatusFallback(id).data),
          total: ids.length,
          completedCount: ids.length,
          erroredCount: 0,
          done: true
        },
        fallback: true,
        message: '解析接口暂不可用，已进入手动补全模式'
      }
    }
    throw error
  }
}

/**
 * Phase E.3：跨多份病历的「疾病发展 + 治疗经过」时间线。
 * server 返回 { timeline, recordCount, sourceRecordIds }；timeline 至少含 events[] / patientSummary。
 */
const getMedicalTimeline = async () => {
  try {
    const res = await request({
      url: '/api/medical/timeline',
      method: 'GET'
    })
    return res
  } catch (error) {
    if (shouldUseLocalFallback() && (error.statusCode === 404 || error.statusCode === 0)) {
      return { data: null, fallback: true, message: '时间线接口暂不可用' }
    }
    throw error
  }
}

const getMedicalRecords = async () => {
  if (shouldUseLocalFallback() && isEndpointUnavailable('medicalRecords')) {
    return {
      data: readLocalRecords(),
      fallback: true
    }
  }

  try {
    const res = await request({
      url: '/api/medical/records',
      method: 'GET'
    })
    markEndpointAvailable('medicalRecords')
    return res
  } catch (error) {
    if (shouldUseLocalFallback() && (error.statusCode === 404 || error.statusCode === 0)) {
      markEndpointUnavailable('medicalRecords')
      return {
        data: readLocalRecords(),
        fallback: true
      }
    }
    throw error
  }
}

const getMedicalRecordDetail = async (id) => {
  if (shouldUseLocalFallback() && isEndpointUnavailable('medicalRecordDetail')) {
    const localCached = readLocalRecords().find((item) => `${item.id}` === `${id}`)
    if (localCached) {
      return { data: localCached, fallback: true }
    }
  }

  try {
    const res = await request({
      url: `/api/medical/records/${id}`,
      method: 'GET'
    })
    markEndpointAvailable('medicalRecordDetail')
    return res
  } catch (error) {
    if (shouldUseLocalFallback() && (error.statusCode === 404 || error.statusCode === 0)) {
      markEndpointUnavailable('medicalRecordDetail')
      const local = readLocalRecords().find((item) => `${item.id}` === `${id}`)
      if (local) {
        return { data: local, fallback: true }
      }
    }
    throw error
  }
}

const enrichMedicalRecord = async (id, payload) => {
  if (shouldUseLocalFallback() && isEndpointUnavailable('medicalRecordEnrich')) {
    upsertLocalRecord({
      id,
      ...payload,
      status: 'parsed',
      statusText: '已解析'
    })
    return {
      data: {
        success: false,
        message: '记录已保存到本地'
      },
      fallback: true
    }
  }

  try {
    const res = await request({
      url: `/api/medical/records/${id}/enrich`,
      method: 'PATCH',
      data: payload
    })
    markEndpointAvailable('medicalRecordEnrich')
    upsertLocalRecord({
      id,
      ...payload,
      status: 'parsed',
      statusText: '已解析'
    })
    return res
  } catch (error) {
    if (shouldUseLocalFallback() && error.statusCode === 404) {
      markEndpointUnavailable('medicalRecordEnrich')
      upsertLocalRecord({
        id,
        ...payload,
        status: 'parsed',
        statusText: '已解析'
      })
      return {
        data: {
          success: false,
          message: '记录已保存到本地'
        },
        fallback: true
      }
    }
    throw error
  }
}

// ==================== 匹配相关 API ====================

const buildMatchQueryParams = (params = {}, payload = {}) => {
  const query = {}
  if (isPresent(params.page)) {
    query.page = params.page
  }
  if (isPresent(params.pageSize)) {
    query.pageSize = params.pageSize
  }
  if (isPresent(params.recordId)) {
    query.recordId = params.recordId
  }

  if (params.filters !== undefined && params.filters !== null && params.filters !== '') {
    query.filters = typeof params.filters === 'string' ? params.filters : JSON.stringify(params.filters)
    return query
  }

  const filters = {}
  if (isPresent(payload.disease)) {
    filters.disease = payload.disease
  }
  if (isPresent(payload.stage)) {
    filters.stage = payload.stage
  }
  if (isPresent(payload.city)) {
    filters.city = payload.city
  }
  if (isPresent(payload.gene_mutation)) {
    filters.gene_mutation = payload.gene_mutation
  }
  if (Object.keys(filters).length > 0) {
    query.filters = JSON.stringify(filters)
  }

  return query
}

const getMatches = async (params = {}) => {
  const payload = buildMatchPayload(params)
  if (shouldUseLocalFallback() && isEndpointUnavailable('trialsMatchFind')) {
    const localMatches = buildLocalMatches(payload)
    return {
      data: localMatches,
      fallback: true,
      message: '匹配接口暂未开放，已使用本地推荐结果'
    }
  }

  const queryParams = buildMatchQueryParams(params, payload)
  const endpoints = [
    {
      url: `/api/matches${buildQueryString(queryParams)}`,
      method: 'GET'
    },
    {
      url: '/api/trials/matches/find',
      method: 'POST',
      data: payload
    }
  ]

  let lastError = null
  for (let i = 0; i < endpoints.length; i += 1) {
    try {
      const res = await requestWithRetry(endpoints[i], 1)
      markEndpointAvailable('trialsMatchFind')
      return res
    } catch (error) {
      lastError = error
      if (error.statusCode === 401) {
        throw error
      }
      if (error.statusCode === 404 || error.statusCode === 0) {
        continue
      }
      throw error
    }
  }

  markEndpointUnavailable('trialsMatchFind')
  if (shouldUseLocalFallback()) {
    const localMatches = buildLocalMatches(payload)
    return {
      data: localMatches,
      fallback: true,
      message: '匹配接口暂未开放，已使用本地推荐结果'
    }
  }
  throw lastError || new Error('匹配服务暂不可用')
}

const getTrials = async (params = {}) => {
  if (shouldUseLocalFallback() && isEndpointUnavailable('trialsList')) {
    return { data: LOCAL_TRIALS, fallback: true }
  }

  const queryString = buildQueryString(params)
  const endpoints = [`/api/trials/search${queryString}`, `/api/trials${queryString}`]
  let lastError = null
  for (let i = 0; i < endpoints.length; i += 1) {
    try {
      const res = await requestWithRetry(
        {
          url: endpoints[i],
          method: 'GET'
        },
        1
      )
      markEndpointAvailable('trialsList')
      return res
    } catch (error) {
      lastError = error
      if (error.statusCode === 404 || error.statusCode === 0) {
        continue
      }
      throw error
    }
  }

  markEndpointUnavailable('trialsList')
  if (shouldUseLocalFallback()) {
    return { data: LOCAL_TRIALS, fallback: true }
  }
  throw lastError || new Error('试验列表服务暂不可用')
}

const getTrialDetail = async (id) => {
  if (!id && id !== 0) {
    throw new Error('试验ID缺失')
  }

  const allowFallback = shouldUseLocalFallback()

  if (!allowFallback || !isEndpointUnavailable('trialDetail')) {
    try {
      const res = await requestWithRetry(
        {
          url: `/api/trials/${encodeURIComponent(id)}`,
          method: 'GET'
        },
        1
      )
      markEndpointAvailable('trialDetail')
      return res
    } catch (error) {
      if (allowFallback && (error.statusCode === 404 || error.statusCode === 0)) {
        markEndpointUnavailable('trialDetail')
      } else {
        throw error
      }
    }
  }

  const res = await getTrials()
  const list = extractTrialList(normalizePayload(res))
  const trial = list.find((item) => `${item.id || item.trialId}` === `${id}`)

  if (!trial) {
    throw new Error('试验不存在')
  }

  return {
    data: trial,
    fallback: true
  }
}

const normalizeApplicationPayload = (params = {}) => {
  const name = safeText(params.name)
  const disease = safeText(params.disease)
  const phone = safeText(params.phone)
  const trialId = params.trialId || params.trial_id || ''
  const trialName = safeText(params.trialName || params.trial_name)
  const location = safeText(params.location)
  const remark = safeText(params.remark)
  const idempotencyKey = safeText(params.idempotencyKey || params.idempotency_key)
  const recordIds = (Array.isArray(params.recordIds) ? params.recordIds : [params.recordId])
    .map((item) => safeText(item))
    .filter(Boolean)
  return {
    name,
    disease,
    phone,
    trialId: `${trialId || ''}`,
    trialName,
    location,
    remark,
    idempotencyKey,
    recordIds
  }
}

const buildApplicationRequestPayload = (payload) => {
  const detailRemark = [payload.remark, payload.name && `姓名:${payload.name}`, payload.disease && `疾病:${payload.disease}`, payload.phone && `手机号:${payload.phone}`, payload.location && `地区:${payload.location}`]
    .filter(Boolean)
    .join('；')

  return {
    name: payload.name,
    disease: payload.disease,
    phone: payload.phone,
    trialId: payload.trialId,
    trial_id: payload.trialId,
    trialName: payload.trialName,
    trial_name: payload.trialName,
    location: payload.location,
    recordIds: payload.recordIds,
    remark: detailRemark,
    source: 'weapp',
    submitTime: new Date().toISOString()
  }
}

const buildApplicationLocalRecord = (payload) => {
  return {
    id: `apply_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
    ...payload,
    status: 'pending',
    statusText: '待提交',
    serverSynced: false,
    submitTime: new Date().toISOString()
  }
}

const validateApplicationPayload = (payload) => {
  if (!payload.trialId) {
    return '试验ID缺失'
  }
  if (payload.phone && !/^1\d{10}$/.test(payload.phone)) {
    return '请填写正确的手机号'
  }
  return ''
}

const buildApplyIdempotencyKey = (payload = {}) => {
  if (isPresent(payload.idempotencyKey)) {
    return safeText(payload.idempotencyKey).slice(0, 64)
  }
  // PRD-2026Q2 §2.5：与 H5 对齐 —— 仅用 trialId 作幂等作用域，
  // 后端已按 userId+route 包一层；带 recordIds/phone 会让同一人刷单。
  const source = `apply_${safeText(payload.trialId)}`
  return source.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 64) || `apply_${Date.now()}`
}

const applyTrial = async (params = {}) => {
  const payload = normalizeApplicationPayload(params)
  const validationMessage = validateApplicationPayload(payload)
  if (validationMessage) {
    throw new Error(validationMessage)
  }

  const localRecord = buildApplicationLocalRecord(payload)
  upsertLocalApplication(localRecord)

  if (shouldUseLocalFallback() && isEndpointUnavailable('trialApply')) {
    return {
      data: {
        success: false,
        queued: true,
        message: '后端报名接口暂未开放，已本地保存'
      },
      fallback: true
    }
  }

  const requestPayload = buildApplicationRequestPayload(payload)
  const idempotencyKey = buildApplyIdempotencyKey(payload)
  const endpoints = ['/api/applications']
  if (payload.trialId) {
    endpoints.push(`/api/trials/${encodeURIComponent(payload.trialId)}/apply`)
  }
  endpoints.push('/api/trials/apply', '/api/trials/applications')

  let lastError = null
  for (let i = 0; i < endpoints.length; i += 1) {
    try {
      const res = await requestWithRetry(
        {
          url: endpoints[i],
          method: 'POST',
          data: requestPayload,
          headers: {
            'Idempotency-Key': idempotencyKey
          }
        },
        1
      )
      markEndpointAvailable('trialApply')
      const responsePayload = normalizePayload(res) || {}
      const applicationId = responsePayload.id || responsePayload.applicationId || localRecord.id
      upsertLocalApplication({
        ...localRecord,
        id: `${applicationId}`,
        status: 'submitted',
        statusText: '已提交',
        serverSynced: true
      })
      return res
    } catch (error) {
      lastError = error
      if (error.statusCode === 404 || error.statusCode === 0) {
        continue
      }
      if (error.statusCode === 401) {
        continue
      }
      if (error.statusCode >= 400 && error.statusCode < 500 && error.statusCode !== 429) {
        throw error
      }
    }
  }

  markEndpointUnavailable('trialApply')
  const fallbackMessage =
    lastError && lastError.statusCode === 401
      ? '后端需要登录鉴权，报名信息已本地保存，请联系管理员开通小程序鉴权。'
      : (lastError && lastError.message) || '后端报名接口暂未开放，已本地保存'
  if (shouldUseLocalFallback()) {
    return {
      data: {
        success: false,
        queued: true,
        message: fallbackMessage
      },
      fallback: true
    }
  }
  throw new Error(fallbackMessage)
}

const getApplications = async () => {
  const localApplications = readLocalApplications()
  if (shouldUseLocalFallback() && isEndpointUnavailable('trialApplicationsList')) {
    return {
      data: localApplications,
      fallback: true
    }
  }

  const endpoints = ['/api/applications', '/api/trials/applications']
  for (let i = 0; i < endpoints.length; i += 1) {
    try {
      const res = await requestWithRetry(
        {
          url: endpoints[i],
          method: 'GET'
        },
        1
      )
      markEndpointAvailable('trialApplicationsList')
      const payload = normalizePayload(res)
      const remoteList = extractApplicationList(payload)
      if (!Array.isArray(remoteList) || remoteList.length === 0) {
        return {
          data: localApplications
        }
      }

      return {
        data: remoteList
      }
    } catch (error) {
      if (error.statusCode === 404 || error.statusCode === 0 || error.statusCode === 401) {
        continue
      }
      throw error
    }
  }

  markEndpointUnavailable('trialApplicationsList')
  if (shouldUseLocalFallback()) {
    return {
      data: localApplications,
      fallback: true
    }
  }
  throw new Error('报名记录服务暂不可用')
}

const getBackendStatus = async () => {
  let health = false
  try {
    const res = await request({
      url: '/health',
      method: 'GET',
      timeout: 8000
    })
    const payload = normalizePayload(res) || {}
    health = payload.status === 'ok' || !!payload.time
  } catch (error) {
    health = false
  }

  return {
    health,
    endpointState: { ...endpointState },
    capabilities: {
      authLogin: !isEndpointUnavailable('authLogin'),
      parseStatus: !isEndpointUnavailable('parseStatus'),
      medicalRecords: !isEndpointUnavailable('medicalRecords'),
      medicalRecordEnrich: !isEndpointUnavailable('medicalRecordEnrich'),
      matchFind: !isEndpointUnavailable('trialsMatchFind'),
      trialsList: !isEndpointUnavailable('trialsList'),
      trialDetail: !isEndpointUnavailable('trialDetail'),
      trialApply: !isEndpointUnavailable('trialApply'),
      trialApplicationsList: !isEndpointUnavailable('trialApplicationsList')
    }
  }
}

module.exports = {
  mockMode,
  baseUrl: runtimeConfig.baseUrl,
  env: ENV,
  getRuntimeBaseUrl,
  shouldUseLocalFallback,
  normalizePayload,
  request,
  requestWithRetry,
  uploadFile,
  login,
  loginWithTestAccount,
  getProfile,
  // Q3-红线 §A.1：refresh token + 登出
  clearAuth,
  tryRefreshToken,
  // Q3-红线 §A.2：用户合规自助
  getMyConsent,
  recordConsent,
  exportMyData,
  deleteMyAccount,
  changeMyPassword,
  // PRD-2026Q2 §3.5：病历软删除
  softDeleteMedicalRecord,
  // Plan §Phase 2.1：客户端直传 COS
  fetchUploadSts,
  finalizeUpload,
  uploadMedicalRecord,
  getParseStatus,
  // Phase E.2/E.3：批量上传 + 批量轮询 + 时间线
  getParseStatusBatch,
  getMedicalTimeline,
  getMedicalRecords,
  getMedicalRecordDetail,
  enrichMedicalRecord,
  getTrials,
  getMatches,
  getTrialDetail,
  applyTrial,
  getApplications,
  getBackendStatus
}
