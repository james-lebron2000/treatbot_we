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
  // Q3-红线 §A.1：把 server/controllers/auth.js 下发的 refreshToken 也拎出来。
  // 之前小程序拿到后直接丢弃，导致 401 = 立即登出。
  const refreshToken = payload.refreshToken || payload.refresh_token || ''
  const sourceUserInfo = payload.userInfo || payload.profile || {}

  return {
    token,
    refreshToken,
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
  // Q3-红线 §A.1：refreshToken 必须落本地，否则 utils/api.js 的 single-flight
  // refresh 拿不到凭证，401 仍然会直接登出。
  if (normalized.refreshToken) {
    wx.setStorageSync('refreshToken', normalized.refreshToken)
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

// DevTools-only：IDE 自身的微信会话过期时 `wx.login` 会直接返回
// `errMsg: "login:fail INVALID_LOGIN, access_token expired ..."`。这不是后端
// 问题，是 IDE 右上角登录态过期；用户需要点头像重新登录开发者工具。
// 我们把这条具体错误打个 code，让上层（utils/api.js / pages/upload/upload.js）
// 能据此显示更可操作的提示，而不是泛化的「出了点小问题」。
const isIdeLoginExpired = (errMsg) => {
  const msg = `${errMsg || ''}`.toLowerCase()
  return msg.indexOf('invalid_login') !== -1 ||
         msg.indexOf('access_token expired') !== -1 ||
         msg.indexOf('access_token missing') !== -1
}

const wxLoginOnce = () => new Promise((resolve, reject) => {
  wx.login({
    success: (res) => {
      if (!res.code) {
        const err = new Error('微信登录失败')
        err.code = 'wx_login_no_code'
        reject(err)
        return
      }
      resolve(res.code)
    },
    fail: (err) => {
      const wrapped = new Error(`${err && err.errMsg || '微信登录失败'}`)
      wrapped.code = isIdeLoginExpired(err && err.errMsg) ? 'wx_login_session_expired' : 'wx_login_fail'
      wrapped.cause = err
      reject(wrapped)
    }
  })
})

const wechatLogin = async () => {
  // 一次重试：DevTools IDE 偶发瞬时失败，等 400ms 再来一次往往能恢复。
  // 真机环境基本不会进重试分支。
  try {
    return await wxLoginOnce()
  } catch (error) {
    if (error && error.code === 'wx_login_session_expired') {
      throw error // IDE 会话过期，重试也没用，直接交给上层提示重启 IDE
    }
    await new Promise((r) => setTimeout(r, 400))
    return await wxLoginOnce()
  }
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
  // Q3-红线 §A.1：refreshToken 必须一同清，避免后续 401 又用旧的去刷
  wx.removeStorageSync('refreshToken')
  wx.removeStorageSync('userInfo')
  wx.removeStorageSync('activeUserId')
  clearTransientState()

  const app = getApp()
  app.globalData.token = null
  app.globalData.userInfo = null
}

// Q3-红线 §A.2：注销账号或主动登出，profile 页 / 注销流程使用。
const logout = () => {
  clearSession()
}

module.exports = {
  ensureLogin,
  ensureBaseLogin,
  setSession,
  clearSession,
  logout
}
