/**
 * API 请求封装
 * 统一处理后端接口请求、环境配置和错误处理
 */

const DEFAULT_TIMEOUT = 15000
const LOCAL_HTTP_REG = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/

const API_CONFIG = {
  develop: {
    baseUrl: 'http://127.0.0.1:3000',
    mockMode: true
  },
  trial: {
    baseUrl: 'https://api.treatbot.example.com',
    mockMode: false
  },
  release: {
    baseUrl: 'https://api.treatbot.example.com',
    mockMode: false
  }
}

const resolveEnv = () => {
  try {
    const accountInfo = wx.getAccountInfoSync()
    const env = accountInfo && accountInfo.miniProgram && accountInfo.miniProgram.envVersion
    return env || 'develop'
  } catch (error) {
    return 'develop'
  }
}

let runtimeEnv = resolveEnv()

const setRuntimeEnv = (env) => {
  if (API_CONFIG[env]) {
    runtimeEnv = env
  }
}

const getRuntimeConfig = () => {
  return API_CONFIG[runtimeEnv] || API_CONFIG.develop
}

const isMockMode = () => getRuntimeConfig().mockMode

const isSecureBaseUrl = (baseUrl) => {
  return /^https:\/\//.test(baseUrl) || LOCAL_HTTP_REG.test(baseUrl)
}

const createRequestId = () => {
  return `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
}

const createNonce = () => {
  return Math.random().toString(36).slice(2, 14)
}

const buildHeaders = (method, token) => {
  const timestamp = String(Date.now())
  return {
    'Content-Type': 'application/json',
    'Authorization': token ? `Bearer ${token}` : '',
    'X-Request-Id': createRequestId(),
    'X-Timestamp': timestamp,
    'X-Nonce': createNonce(),
    'X-Client-Platform': 'wechat-miniprogram',
    'X-HTTP-Method': method
  }
}

const normalizeErrorMessage = (data, fallback) => {
  if (!data) {
    return fallback
  }

  if (typeof data === 'string') {
    return data
  }

  return data.message || data.msg || fallback
}

const isBusinessSuccess = (data) => {
  if (!data || typeof data !== 'object' || !Object.prototype.hasOwnProperty.call(data, 'code')) {
    return true
  }
  return data.code === 0 || data.code === '0'
}

const request = (options = {}) => {
  const { baseUrl } = getRuntimeConfig()

  if (!options.url) {
    return Promise.reject(new Error('请求地址不能为空'))
  }

  if (!isSecureBaseUrl(baseUrl)) {
    return Promise.reject(new Error('不安全的 API 地址，请使用 HTTPS'))
  }

  const method = (options.method || 'GET').toUpperCase()
  const token = wx.getStorageSync('token')
  const headers = {
    ...buildHeaders(method, token),
    ...(options.header || {})
  }

  return new Promise((resolve, reject) => {
    wx.request({
      url: `${baseUrl}${options.url}`,
      method,
      data: options.data || {},
      timeout: options.timeout || DEFAULT_TIMEOUT,
      header: headers,
      success: (res) => {
        const { statusCode, data } = res

        if (statusCode >= 200 && statusCode < 300) {
          if (!isBusinessSuccess(data)) {
            reject(new Error(normalizeErrorMessage(data, '业务请求失败')))
            return
          }
          resolve(data)
          return
        }

        if (statusCode === 401) {
          wx.removeStorageSync('token')
          wx.showToast({ title: '登录已过期，请重新登录', icon: 'none' })
          reject(new Error('Unauthorized'))
          return
        }

        reject(new Error(normalizeErrorMessage(data, `请求失败(${statusCode})`)))
      },
      fail: (err) => {
        console.error('请求失败:', err)
        reject(new Error('网络请求失败，请检查网络后重试'))
      }
    })
  })
}

const uploadFile = (options = {}) => {
  const { baseUrl } = getRuntimeConfig()

  if (!options.url || !options.filePath) {
    return Promise.reject(new Error('上传参数不完整'))
  }

  if (!isSecureBaseUrl(baseUrl)) {
    return Promise.reject(new Error('不安全的 API 地址，请使用 HTTPS'))
  }

  const token = wx.getStorageSync('token')
  const headers = {
    'Authorization': token ? `Bearer ${token}` : '',
    'X-Request-Id': createRequestId(),
    'X-Timestamp': String(Date.now()),
    'X-Nonce': createNonce()
  }

  return new Promise((resolve, reject) => {
    wx.uploadFile({
      url: `${baseUrl}${options.url}`,
      filePath: options.filePath,
      name: options.name || 'file',
      header: {
        ...headers,
        ...(options.header || {})
      },
      formData: options.formData || {},
      timeout: options.timeout || 30000,
      success: (res) => {
        if (res.statusCode < 200 || res.statusCode >= 300) {
          reject(new Error(`上传失败(${res.statusCode})`))
          return
        }

        try {
          const data = JSON.parse(res.data)
          if (!isBusinessSuccess(data)) {
            reject(new Error(normalizeErrorMessage(data, '上传业务失败')))
            return
          }
          resolve(data)
        } catch (error) {
          reject(new Error('上传返回数据格式错误'))
        }
      },
      fail: (err) => {
        console.error('上传失败:', err)
        reject(new Error('文件上传失败，请稍后重试'))
      }
    })
  })
}

const MOCK_TRIALS = [
  {
    id: '1',
    name: 'PD-1抑制剂联合化疗治疗晚期非小细胞肺癌II期临床试验',
    score: 92,
    phase: 'II期',
    location: '上海',
    type: '干预性研究',
    indication: '非小细胞肺癌（EGFR突变阳性）',
    institution: '复旦大学附属肿瘤医院',
    reasons: [
      '诊断为非小细胞肺癌，符合入组条件',
      'EGFR 19del突变阳性，符合分子标志物要求',
      '既往化疗2周期，符合治疗线数要求'
    ]
  },
  {
    id: '2',
    name: '第三代EGFR-TKI治疗耐药后肺癌III期临床试验',
    score: 85,
    phase: 'III期',
    location: '北京',
    type: '干预性研究',
    indication: 'EGFR T790M突变阳性肺癌',
    institution: '中国医学科学院肿瘤医院',
    reasons: [
      'EGFR突变阳性，符合分子标志物要求',
      '无脑转移，符合入组标准',
      'ECOG评分预计0-1分'
    ]
  }
]

const mockParseProgress = {}

// ==================== 认证相关 API ====================

const login = (code) => {
  if (isMockMode()) {
    return Promise.resolve({
      code: 0,
      data: {
        token: `mock_token_${Date.now()}`,
        userInfo: {
          id: '1',
          nickName: '微信用户',
          avatarUrl: ''
        }
      }
    })
  }

  return request({
    url: '/api/auth/weapp-login',
    method: 'POST',
    data: { code }
  })
}

// ==================== 病历相关 API ====================

const uploadMedicalRecord = (params) => {
  if (isMockMode()) {
    const fileId = `file_${Date.now()}`
    mockParseProgress[fileId] = 0
    return Promise.resolve({
      code: 0,
      data: {
        fileId,
        url: params.filePath
      }
    })
  }

  return uploadFile({
    url: '/api/medical/upload',
    filePath: params.filePath,
    name: 'file',
    formData: {
      type: params.type,
      remark: params.remark
    }
  })
}

const getParseStatus = (fileId) => {
  if (isMockMode()) {
    const currentProgress = mockParseProgress[fileId] || 0
    const nextProgress = Math.min(100, currentProgress + Math.floor(Math.random() * 20 + 8))
    mockParseProgress[fileId] = nextProgress

    const status =
      nextProgress < 25
        ? 'uploading'
        : nextProgress < 55
        ? 'parsing'
        : nextProgress < 85
        ? 'analyzing'
        : nextProgress < 100
        ? 'structuring'
        : 'completed'

    return Promise.resolve({
      code: 0,
      data: {
        fileId,
        status,
        progress: nextProgress,
        result:
          nextProgress === 100
            ? {
                diagnosis: '非小细胞肺癌',
                stage: 'IV期',
                geneMutation: 'EGFR 19del',
                treatment: '化疗2周期',
                ecog: 1
              }
            : null
      }
    })
  }

  return request({
    url: `/api/medical/parse-status?fileId=${encodeURIComponent(fileId)}`,
    method: 'GET'
  })
}

const getMedicalRecords = () => {
  if (isMockMode()) {
    return Promise.resolve({
      code: 0,
      data: [
        {
          id: '1',
          type: '出院小结',
          diagnosis: '非小细胞肺癌 IV期',
          status: 'parsed',
          statusText: '已解析',
          uploadTime: '2024-02-24',
          matchCount: 3
        },
        {
          id: '2',
          type: '基因检测',
          diagnosis: 'EGFR 19del 突变',
          status: 'parsed',
          statusText: '已解析',
          uploadTime: '2024-02-20',
          matchCount: 5
        }
      ]
    })
  }

  return request({
    url: '/api/medical/records',
    method: 'GET'
  })
}

const getMedicalRecordDetail = (id) => {
  if (isMockMode()) {
    return Promise.resolve({
      code: 0,
      data: {
        id,
        type: '出院小结',
        diagnosis: '非小细胞肺癌 IV期',
        stage: 'IV期',
        geneMutation: 'EGFR 19del',
        treatment: '化疗2周期',
        status: 'parsed',
        uploadTime: '2024-02-24',
        images: []
      }
    })
  }

  return request({
    url: `/api/medical/records/${encodeURIComponent(id)}`,
    method: 'GET'
  })
}

// ==================== 匹配相关 API ====================

const getMatches = (params = {}) => {
  if (isMockMode()) {
    return Promise.resolve({
      code: 0,
      data: MOCK_TRIALS,
      total: MOCK_TRIALS.length
    })
  }

  return request({
    url: '/api/matches',
    method: 'GET',
    data: params
  })
}

const getTrialDetail = (id) => {
  if (isMockMode()) {
    return Promise.resolve({
      code: 0,
      data: {
        ...MOCK_TRIALS[0],
        id,
        sponsor: '某制药公司',
        description: '本研究旨在评估PD-1抑制剂联合化疗在EGFR突变阳性非小细胞肺癌患者中的疗效和安全性。',
        inclusion: [
          '年龄18-75岁',
          '组织学或细胞学确诊的非小细胞肺癌',
          'EGFR突变阳性（19del或L858R）',
          '既往接受过一线化疗失败',
          'ECOG评分0-1分'
        ],
        exclusion: [
          '既往接受过免疫治疗',
          '活动性脑转移',
          '自身免疫性疾病',
          '严重器官功能障碍'
        ],
        contact: {
          name: '张医生',
          phone: '021-12345678',
          email: 'trial@hospital.com'
        }
      }
    })
  }

  return request({
    url: `/api/trials/${encodeURIComponent(id)}`,
    method: 'GET'
  })
}

const applyTrial = (params) => {
  if (isMockMode()) {
    return Promise.resolve({
      code: 0,
      data: {
        applicationId: `app_${Date.now()}`,
        status: 'pending',
        message: '报名成功，研究机构将在3个工作日内与您联系'
      }
    })
  }

  return request({
    url: '/api/applications',
    method: 'POST',
    data: params,
    header: {
      'Idempotency-Key': createRequestId()
    }
  })
}

const getApplications = () => {
  if (isMockMode()) {
    return Promise.resolve({
      code: 0,
      data: [
        {
          id: '1',
          trialId: '1',
          trialName: 'PD-1抑制剂联合化疗治疗晚期非小细胞肺癌II期临床试验',
          status: 'contacting',
          statusText: '机构联系中',
          applyTime: '2024-02-24',
          institution: '复旦大学附属肿瘤医院'
        }
      ]
    })
  }

  return request({
    url: '/api/applications',
    method: 'GET'
  })
}

module.exports = {
  // 配置
  setRuntimeEnv,
  getRuntimeConfig,
  mockMode: isMockMode,
  isMockMode,

  // 通用方法
  request,
  uploadFile,

  // 认证
  login,

  // 病历
  uploadMedicalRecord,
  getParseStatus,
  getMedicalRecords,
  getMedicalRecordDetail,

  // 匹配
  getMatches,
  getTrialDetail,
  applyTrial,
  getApplications
}
