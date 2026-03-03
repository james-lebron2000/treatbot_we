const api = require('../../utils/api')
const REFRESH_INTERVAL = 30 * 1000

Page({
  data: {
    userInfo: {
      nickName: '',
      avatarUrl: ''
    },
    userPhone: '',
    stats: {
      records: 0,
      matches: 0,
      applications: 0
    },
    loading: false
  },

  onLoad() {
    this.loadUserProfile()
  },

  onShow() {
    const now = Date.now()
    if (this.lastLoadedAt && now - this.lastLoadedAt > REFRESH_INTERVAL) {
      this.loadUserProfile({ silent: true })
    }
  },

  async loadUserProfile(options = {}) {
    if (this.loadingPromise) {
      return this.loadingPromise
    }

    const { silent = false } = options
    const app = getApp()
    
    // 先从全局获取用户信息展示
    if (app.globalData.userInfo && !this.data.userInfo.nickName) {
      this.setData({
        userInfo: app.globalData.userInfo
      })
    }

    if (!silent) {
      this.setData({ loading: true })
    }

    this.loadingPromise = (async () => {
      try {
        // 并行获取用户资料和统计
        const [profileRes, statsRes] = await Promise.all([
          api.request({ url: '/api/user/profile', method: 'GET' }).catch(() => null),
          api.request({ url: '/api/user/stats', method: 'GET' }).catch(() => null)
        ])

        const profile = profileRes?.data
        const stats = statsRes?.data

        const updateData = {}

        if (profile) {
          updateData.userInfo = {
            nickName: profile.nickName || profile.nickname || '用户',
            avatarUrl: profile.avatarUrl || ''
          }
          updateData.userPhone = this.maskPhone(profile.phone || '')
          
          // 同步到全局
          app.globalData.userInfo = updateData.userInfo
        }

        if (stats) {
          updateData.stats = {
            records: stats.records || 0,
            matches: stats.matches || 0,
            applications: stats.applications || 0
          }
        }

        if (Object.keys(updateData).length > 0) {
          this.setData(updateData)
        }

        this.lastLoadedAt = Date.now()
      } catch (error) {
        console.error('加载用户信息失败:', error)
        // 静默失败，保留现有数据或默认值
      } finally {
        if (!silent) {
          this.setData({ loading: false })
        }
        this.loadingPromise = null
      }
    })()

    return this.loadingPromise
  },

  maskPhone(phone) {
    if (!phone || phone.length !== 11) {
      return phone
    }
    return phone.slice(0, 3) + '****' + phone.slice(7)
  },

  editProfile() {
    wx.showToast({ title: '编辑资料', icon: 'none' })
  },

  goToRecords() {
    wx.switchTab({ url: '/pages/records/records' })
  },

  goToMatches() {
    wx.switchTab({ url: '/pages/matches/matches' })
  },

  goToApplications() {
    wx.navigateTo({ url: '/pages/profile/applications/applications' })
  },

  contactSupport() {
    wx.showModal({
      title: '联系客服',
      content: '客服电话：400-XXX-XXXX\n服务时间：9:00-18:00',
      showCancel: false
    })
  },

  aboutUs() {
    wx.navigateTo({ url: '/pages/profile/about/about' })
  },

  showPrivacyPolicy() {
    wx.navigateTo({ url: '/pages/profile/privacy/privacy' })
  },

  // 下拉刷新
  async onPullDownRefresh() {
    await this.loadUserProfile()
    wx.stopPullDownRefresh()
  }
})
