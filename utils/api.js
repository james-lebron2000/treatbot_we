/**
 * API 请求封装
 * 统一处理所有后端接口请求
 */

const app = getApp()

// API 基础配置
const API_CONFIG = {
  // 开发环境
  dev: {
    baseUrl: 'http://localhost:3000',
    mockMode: true
  },
  // 生产环境
  prod: {
    baseUrl: 'https://api.treatbot.example.com',
    mockMode: false
  }
}

// 当前环境
const ENV = 'dev'
const { baseUrl, mockMode } = API_CONFIG[ENV]

/**
 * 通用请求方法
 * @param {Object} options - 请求配置
 * @returns {Promise} 请求结果
 */
const request = (options) => {
  return new Promise((resolve, reject) => {
    const token = wx.getStorageSync('token')
    
    wx.request({
      url: `${baseUrl}${options.url}`,
      method: options.method || 'GET',
      data: options.data || {},
      header: {
        'Content-Type': 'application/json',
        'Authorization': token ? `Bearer ${token}` : ''
      },
      success: (res) => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(res.data)
        } else if (res.statusCode === 401) {
          // Token 过期，重新登录
          wx.removeStorageSync('token')
          wx.showToast({ title: '登录已过期，请重新登录', icon: 'none' })
          reject(new Error('Unauthorized'))
        } else {
          reject(new Error(res.data.message || '请求失败'))
        }
      },
      fail: (err) => {
        console.error('请求失败:', err)
        reject(new Error('网络请求失败'))
      }
    })
  })
}

/**
 * 文件上传
 * @param {Object} options - 上传配置
 * @returns {Promise} 上传结果
 */
const uploadFile = (options) => {
  return new Promise((resolve, reject) => {
    const token = wx.getStorageSync('token')
    
    wx.uploadFile({
      url: `${baseUrl}${options.url}`,
      filePath: options.filePath,
      name: options.name || 'file',
      header: {
        'Authorization': token ? `Bearer ${token}` : ''
      },
      formData: options.formData || {},
      success: (res) => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(JSON.parse(res.data))
        } else {
          reject(new Error('上传失败'))
        }
      },
      fail: reject
    })
  })
}

// ==================== 认证相关 API ====================

/**
 * 微信登录
 * @param {string} code - 微信登录 code
 * @returns {Promise} 登录结果
 */
const login = (code) => {
  if (mockMode) {
    // 模拟登录
    return Promise.resolve({
      code: 0,
      data: {
        token: 'mock_token_' + Date.now(),
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

/**
 * 上传病历文件
 * @param {Object} params - 上传参数
 * @returns {Promise} 上传结果
 */
const uploadMedicalRecord = (params) => {
  if (mockMode) {
    // 模拟上传
    return Promise.resolve({
      code: 0,
      data: {
        fileId: 'file_' + Date.now(),
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

/**
 * 获取解析状态
 * @param {string} fileId - 文件ID
 * @returns {Promise} 解析状态
 */
const getParseStatus = (fileId) => {
  if (mockMode) {
    // 模拟解析状态（渐进式）
    const progress = Math.floor(Math.random() * 100)
    const status = progress < 30 ? 'uploading' : progress < 60 ? 'parsing' : progress < 90 ? 'analyzing' : 'completed'
    
    return Promise.resolve({
      code: 0,
      data: {
        fileId,
        status,
        progress,
        result: progress >= 100 ? {
          diagnosis: '非小细胞肺癌',
          stage: 'IV期',
          geneMutation: 'EGFR 19del',
          treatment: '化疗2周期',
          ecog: 1
        } : null
      }
    })
  }
  
  return request({
    url: `/api/medical/parse-status?fileId=${fileId}`,
    method: 'GET'
  })
}

/**
 * 获取病历列表
 * @returns {Promise} 病历列表
 */
const getMedicalRecords = () => {
  if (mockMode) {
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

/**
 * 获取病历详情
 * @param {string} id - 病历ID
 * @returns {Promise} 病历详情
 */
const getMedicalRecordDetail = (id) => {
  if (mockMode) {
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
        images: ['/images/mock/record1.jpg']
      }
    })
  }
  
  return request({
    url: `/api/medical/records/${id}`,
    method: 'GET'
  })
}

// ==================== 匹配相关 API ====================

/**
 * 获取匹配试验列表
 * @param {Object} params - 查询参数
 * @returns {Promise} 匹配列表
 */
const getMatches = (params = {}) => {
  if (mockMode) {
    return Promise.resolve({
      code: 0,
      data: [
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
      ],
      total: 2
    })
  }
  
  return request({
    url: '/api/matches',
    method: 'GET',
    data: params
  })
}

/**
 * 获取试验详情
 * @param {string} id - 试验ID
 * @returns {Promise} 试验详情
 */
const getTrialDetail = (id) => {
  if (mockMode) {
    return Promise.resolve({
      code: 0,
      data: {
        id,
        name: 'PD-1抑制剂联合化疗治疗晚期非小细胞肺癌II期临床试验',
        score: 92,
        phase: 'II期',
        location: '上海',
        type: '干预性研究',
        indication: '非小细胞肺癌（EGFR突变阳性）',
        institution: '复旦大学附属肿瘤医院',
        sponsor: '某制药公司',
        description: '本研究旨在评估PD-1抑制剂联合化疗在EGFR突变阳性非小细胞肺癌患者中的疗效和安全性...',
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
    url: `/api/trials/${id}`,
    method: 'GET'
  })
}

/**
 * 报名试验
 * @param {Object} params - 报名参数
 * @returns {Promise} 报名结果
 */
const applyTrial = (params) => {
  if (mockMode) {
    return Promise.resolve({
      code: 0,
      data: {
        applicationId: 'app_' + Date.now(),
        status: 'pending',
        message: '报名成功，研究机构将在3个工作日内与您联系'
      }
    })
  }
  
  return request({
    url: '/api/applications',
    method: 'POST',
    data: params
  })
}

/**
 * 获取报名记录
 * @returns {Promise} 报名列表
 */
const getApplications = () => {
  if (mockMode) {
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

// ==================== 导出 API ====================

module.exports = {
  // 配置
  mockMode,
  
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