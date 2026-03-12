const api = require('./api')

const TRANSIENT_STORAGE_KEYS = [
  'currentRecordId',
  'structuredRecordDraft',
  'selectedMatchDetail',
  'selectedApplyTrial',
  'patientPhone',
  'activeParseTask',
  'recentCompletedRecordId',
  'localMedicalRecords',
  'localTrialApplications'
]

const USER_SCOPED_PREFIXES = ['matchCache:v2:', 'parseResult:']

const pickPayload = (res) => {
  if (!res || typeof res !== 'object') {
    return {}
  }

  if (Object.prototype.hasOwnProperty.call(res, 'data')) {
    return res.data || {}
  }

  return res
}

const clearPrefixedStorage = (prefixes = []) => {
  if (!wx.getStorageInfoSync) {
    return
  }

  let info = null
  try {
    info = wx.getStorageInfoSync()
  } catch (error) {
    return
  }

  const keys = Array.isArray(info && info.keys) ? info.keys : []
  keys.forEach((key) => {
    if (prefixes.some((prefix) => key.indexOf(prefix) === 0)) {
      wx.removeStorageSync(key)
    }
  })
}

const clearTransientState = () => {
  TRANSIENT_STORAGE_KEYS.forEach((key) => wx.removeStorageSync(key))
  clearPrefixedStorage(USER_SCOPED_PREFIXES)
}

const normalizeSessionPayload = (payload = {}) => {
  const token = payload.token || payload.accessToken || wx.getStorageSync('token') || ''
  const sourceUserInfo = payload.userInfo || payload.profile || {}

  return {
    token,
    userInfo: {
      id: sourceUserInfo.id || payload.id || '',
      nickName: sourceUserInfo.nickName || sourceUserInfo.nickname || payload.nickName || payload.nickname || '微信用户',
      avatarUrl: sourceUserInfo.avatarUrl || sourceUserInfo.avatar_url || payload.avatarUrl || payload.avatar_url || '',
      phone: sourceUserInfo.phone || ''
    }
  }
}

const setSession = (payload) => {
  const normalized = normalizeSessionPayload(payload)
  const previousUserInfo = wx.getStorageSync('userInfo') || {}
  const previousUserId = `${previousUserInfo.id || wx.getStorageSync('activeUserId') || ''}`.trim()
  const nextUserId = `${normalized.userInfo.id || previousUserId || ''}`.trim()

  if (previousUserId && nextUserId && previousUserId !== nextUserId) {
    clearTransientState()
  }

  if (normalized.token) {
    wx.setStorageSync('token', normalized.token)
  }
  if (normalized.userInfo) {
    wx.setStorageSync('userInfo', normalized.userInfo)
  }
  if (nextUserId) {
    wx.setStorageSync('activeUserId', nextUserId)
  }

  const app = getApp()
  app.globalData.token = normalized.token
  app.globalData.userInfo = normalized.userInfo

  return normalized
}

const wechatLogin = () => {
  return new Promise((resolve, reject) => {
    wx.login({
      success: (res) => {
        if (!res.code) {
          reject(new Error('微信登录失败'))
          return
        }
        resolve(res.code)
      },
      fail: reject
    })
  })
}

const refreshProfile = async () => {
  const res = await api.getProfile()
  const payload = pickPayload(res)
  return setSession(payload)
}

const ensureBaseLogin = async () => {
  const token = `${wx.getStorageSync('token') || ''}`.trim()
  let session = null

  if (token) {
    try {
      session = await refreshProfile()
    } catch (error) {
      clearSession()
    }
  }

  if (!session) {
    const code = await wechatLogin()
    const res = await api.login(code)
    const payload = pickPayload(res)
    session = setSession(payload)

    try {
      session = await refreshProfile()
    } catch (error) {
      session = setSession(payload)
    }
  }

  return session
}

const ensureLogin = async () => {
  return ensureBaseLogin()
}

const clearSession = () => {
  wx.removeStorageSync('token')
  wx.removeStorageSync('userInfo')
  wx.removeStorageSync('activeUserId')
  clearTransientState()

  const app = getApp()
  app.globalData.token = null
  app.globalData.userInfo = null
}

module.exports = {
  ensureLogin,
  ensureBaseLogin,
  setSession,
  clearSession
}
