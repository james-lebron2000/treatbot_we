App({
  globalData: {
    userInfo: null,
    token: null,
    apiBaseUrl: 'https://api.treatbot.example.com', // 生产环境替换为真实域名
    mockMode: true // 开发模式使用模拟数据
  },

  onLaunch() {
    console.log('Treatbot WeApp Launch')
    
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
      this.getUserInfo()
    }
  },

  // 获取用户信息
  getUserInfo() {
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
        success: (res) => {
          if (res.code) {
            // 调用后端登录接口
            this.request({
              url: '/api/auth/weapp-login',
              method: 'POST',
              data: { code: res.code }
            }).then((result) => {
              const { token, userInfo } = result.data
              wx.setStorageSync('token', token)
              this.globalData.token = token
              this.globalData.userInfo = userInfo
              resolve(result)
            }).catch(reject)
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
    const { token, apiBaseUrl } = this.globalData
    
    return new Promise((resolve, reject) => {
      wx.request({
        url: `${apiBaseUrl}${options.url}`,
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
            // Token过期，重新登录
            this.login().then(() => {
              this.request(options).then(resolve).catch(reject)
            }).catch(reject)
          } else {
            reject(new Error(res.data.message || '请求失败'))
          }
        },
        fail: reject
      })
    })
  },

  // 上传文件
  uploadFile(options) {
    const { token, apiBaseUrl } = this.globalData
    
    return new Promise((resolve, reject) => {
      wx.uploadFile({
        url: `${apiBaseUrl}${options.url}`,
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
})