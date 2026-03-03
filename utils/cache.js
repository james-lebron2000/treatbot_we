const DEFAULT_TTL = 5 * 60 * 1000

const setCache = (key, data, ttl = DEFAULT_TTL) => {
  const payload = {
    data,
    expiresAt: Date.now() + ttl
  }
  wx.setStorageSync(key, payload)
}

const getCache = (key) => {
  const payload = wx.getStorageSync(key)
  if (!payload || typeof payload !== 'object') {
    return null
  }

  if (payload.expiresAt && payload.expiresAt < Date.now()) {
    wx.removeStorageSync(key)
    return null
  }

  return payload.data
}

const removeCache = (key) => {
  wx.removeStorageSync(key)
}

module.exports = {
  DEFAULT_TTL,
  setCache,
  getCache,
  removeCache
}
