const api = require('./utils/api')

App({
  globalData: {
    userInfo: null,
    token: null
  },

  onLaunch() {
    // 检查登录状态
    this.checkLoginStatus()
    
    // 获取系统信息
    this.getSystemInfo()
  },

  // 检查登录状态
  checkLoginStatus() {
    const token = wx.getStorageSync('token')
    if (token) {
      this.globalData.token = token
    }
  },

  // 由用户触发后获取微信资料，避免在启动时弹授权
  fetchUserProfile() {
    wx.getUserProfile({
      desc: '用于完善用户资料',
      success: (res) => {
        this.globalData.userInfo = res.userInfo
      }
    })
  },

  // 获取系统信息
  getSystemInfo() {
    wx.getSystemInfo({
      success: (res) => {
        this.globalData.systemInfo = res
      }
    })
  },

  // 全局登录方法
  login() {
    return new Promise((resolve, reject) => {
      wx.login({
        success: async (res) => {
          if (res.code) {
            try {
              const result = await api.login(res.code)
              const { token, userInfo } = result.data
              wx.setStorageSync('token', token)
              this.globalData.token = token
              this.globalData.userInfo = userInfo
              resolve(result)
            } catch (error) {
              reject(error)
            }
          } else {
            reject(new Error('登录失败'))
          }
        },
        fail: reject
      })
    })
  },

  // 全局请求方法
  request(options) {
    return api.request(options)
  },

  // 上传文件
  uploadFile(options) {
    return api.uploadFile(options)
  }
})
