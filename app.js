const SESSION_SCHEMA_VERSION = 3
const SESSION_RESET_KEYS = [
  'token',
  'userInfo',
  'activeUserId',
  'patientPhone',
  'activeParseTask',
  'recentCompletedRecordId',
  'currentRecordId',
  'structuredRecordDraft',
  'selectedMatchDetail',
  'selectedApplyTrial',
  'localMedicalRecords',
  'localTrialApplications'
]

App({
  globalData: {
    userInfo: null,
    token: null,
    apiBaseUrl: 'https://inseq.top',
    allowLocalFallback: false,
    mockMode: false,
    systemInfo: null
  },

  onLaunch() {
    this.resetRuntimeOverrides()
    this.migrateSessionSchema()
    this.restoreSession()
    this.collectSystemInfo()
  },

  resetRuntimeOverrides() {
    const officialBaseUrl = this.globalData.apiBaseUrl
    wx.setStorageSync('enableLocalFallback', false)
    wx.setStorageSync('apiBaseUrl', officialBaseUrl)
    wx.removeStorageSync('endpointState')
  },

  migrateSessionSchema() {
    const currentVersion = Number(wx.getStorageSync('sessionSchemaVersion') || 0)
    if (currentVersion === SESSION_SCHEMA_VERSION) {
      return
    }

    SESSION_RESET_KEYS.forEach((key) => wx.removeStorageSync(key))
    this.globalData.token = null
    this.globalData.userInfo = null
    wx.setStorageSync('sessionSchemaVersion', SESSION_SCHEMA_VERSION)
  },

  restoreSession() {
    const token = wx.getStorageSync('token')
    const userInfo = wx.getStorageSync('userInfo')

    if (token) {
      this.globalData.token = token
    }

    if (userInfo) {
      this.globalData.userInfo = userInfo
    }
  },

  collectSystemInfo() {
    const systemInfo = {}

    if (wx.getDeviceInfo) {
      Object.assign(systemInfo, wx.getDeviceInfo())
    }
    if (wx.getWindowInfo) {
      Object.assign(systemInfo, wx.getWindowInfo())
    }
    if (wx.getAppBaseInfo) {
      Object.assign(systemInfo, wx.getAppBaseInfo())
    }
    if (wx.getSystemSetting) {
      Object.assign(systemInfo, { systemSetting: wx.getSystemSetting() })
    }
    if (wx.getAppAuthorizeSetting) {
      Object.assign(systemInfo, { authorizeSetting: wx.getAppAuthorizeSetting() })
    }

    this.globalData.systemInfo = systemInfo
  },

  setUserInfo(userInfo) {
    this.globalData.userInfo = userInfo
    wx.setStorageSync('userInfo', userInfo)
  },

  request(options) {
    const { token, apiBaseUrl } = this.globalData

    return new Promise((resolve, reject) => {
      wx.request({
        url: `${apiBaseUrl}${options.url}`,
        method: options.method || 'GET',
        data: options.data || {},
        timeout: options.timeout || 15000,
        header: {
          'Content-Type': options.contentType || 'application/json',
          Authorization: token ? `Bearer ${token}` : ''
        },
        success: (res) => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(res.data)
            return
          }

          if (res.statusCode === 401) {
            wx.removeStorageSync('token')
            this.globalData.token = null
            reject(new Error('登录已过期'))
            return
          }

          reject(new Error(res.data?.message || '请求失败'))
        },
        fail: (error) => {
          reject(error)
        }
      })
    })
  },

  uploadFile(options) {
    const { token, apiBaseUrl } = this.globalData

    return new Promise((resolve, reject) => {
      wx.uploadFile({
        url: `${apiBaseUrl}${options.url}`,
        filePath: options.filePath,
        name: options.name || 'file',
        timeout: options.timeout || 30000,
        header: {
          Authorization: token ? `Bearer ${token}` : ''
        },
        formData: options.formData || {},
        success: (res) => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            const payload = typeof res.data === 'string' ? JSON.parse(res.data) : res.data
            resolve(payload)
            return
          }

          reject(new Error('上传失败'))
        },
        fail: (error) => {
          reject(error)
        }
      })
    })
  }
})
