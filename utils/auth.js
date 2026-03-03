const api = require('./api')

const pickPayload = (res) => {
  if (!res || typeof res !== 'object') {
    return {}
  }

  if (Object.prototype.hasOwnProperty.call(res, 'data')) {
    return res.data || {}
  }

  return res
}

const setSession = (payload) => {
  const token = payload.token || payload.accessToken || ''
  const userInfo = payload.userInfo || payload.profile || null
  const phone = payload.phone || payload.mobile || ''

  if (token) {
    wx.setStorageSync('token', token)
  }
  if (userInfo) {
    wx.setStorageSync('userInfo', userInfo)
  }
  if (phone) {
    wx.setStorageSync('patientPhone', phone)
  }

  const app = getApp()
  app.globalData.token = token
  app.globalData.userInfo = userInfo

  return {
    token,
    userInfo,
    phone
  }
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

const ensureLogin = async () => {
  const token = wx.getStorageSync('token')
  if (token) {
    try {
      await api.getProfile()
      return {
        token,
        userInfo: wx.getStorageSync('userInfo') || null,
        phone: wx.getStorageSync('patientPhone') || ''
      }
    } catch (error) {
      clearSession()
    }
  }

  let session = null

  try {
    const code = await wechatLogin()
    const res = await api.login(code)
    const payload = pickPayload(res)
    session = setSession(payload)
  } catch (error) {
    if (api.env === 'prod') {
      throw error
    }

    const fallbackRes = await api.loginWithTestAccount()
    const fallbackPayload = pickPayload(fallbackRes)
    session = setSession(fallbackPayload)
  }

  if (!session.token) {
    throw new Error('登录失败，未获取到 token')
  }

  return session
}

const clearSession = () => {
  wx.removeStorageSync('token')
  wx.removeStorageSync('userInfo')
  wx.removeStorageSync('patientPhone')

  const app = getApp()
  app.globalData.token = null
  app.globalData.userInfo = null
}

module.exports = {
  ensureLogin,
  setSession,
  clearSession
}
