const api = require('../../../utils/api')
const REFRESH_INTERVAL = 30 * 1000

Page({
  data: {
    applications: [],
    loading: false
  },

  onLoad() {
    this.loadApplications()
  },

  onShow() {
    const now = Date.now()
    if (this.lastLoadedAt && now - this.lastLoadedAt > REFRESH_INTERVAL) {
      this.loadApplications({ silent: true })
    }
  },

  async loadApplications(options = {}) {
    if (this.loadingPromise) {
      return this.loadingPromise
    }

    const { silent = false } = options
    if (!silent) {
      this.setData({ loading: true })
      wx.showLoading({ title: '加载中...' })
    }

    this.loadingPromise = (async () => {
      try {
        const res = await api.getApplications()
        this.setData({ applications: res.data || [] })
        this.lastLoadedAt = Date.now()
      } catch (error) {
        console.error('加载报名记录失败:', error)
        wx.showToast({ title: '加载失败', icon: 'none' })
      } finally {
        if (!silent) {
          this.setData({ loading: false })
          wx.hideLoading()
        }
        this.loadingPromise = null
      }
    })()

    return this.loadingPromise
  }
})
